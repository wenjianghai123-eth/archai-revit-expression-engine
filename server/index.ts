import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { NextFunction, Request, Response } from 'express';
import { createGeminiProvider } from './providers/geminiProvider';
import { createGrsaiNanoBananaProvider } from './providers/grsaiNanoBananaProvider';
import { createMockGeneration, mockProvider } from './providers/mockProvider';
import { GenerateImageInput, GenerateImageOutput, ImageGenerationProvider, ProviderName } from './providers/types';
import { attachAuthUser, getCurrentUser, getRequiredCurrentUser, requireAuth } from './auth';
import { createStoredFilename, fileStorageProvider, uploadsDir } from './fileStorage';
import {
  cancelGenerationJob,
  adjustCredits,
  AdminDashboard,
  createGenerationRecord,
  createGenerationJob,
  createImageAsset,
  createModelAsset,
  createProject,
  createGenerationResult,
  createShareLink,
  deleteModelAsset,
  ensureAppDatabase,
  CreditBalance,
  CreditTransaction,
  GenerationJob,
  GenerationRecord,
  getGenerationJob,
  getImageAsset,
  getAdminDashboard,
  getShareLinkByToken,
  getCreditBalance,
  getCreditTransactionByReference,
  ImageAsset,
  listGenerationResults,
  getModelAsset,
  getProject,
  listModelAssets,
  listRunnableGenerationJobs,
  listProjectGenerations,
  ModelAsset,
  listProjects,
  listCreditTransactions,
  Project,
  revokeShareLink,
  ShareLink,
  softDeleteProject,
  updateGenerationJob,
  updateGenerationResult,
  updateProject,
} from './storage';

const app = express();
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';
const version = '0.1.0';
const maxImageMb = Number(process.env.MAX_IMAGE_MB || 10);
const maxModelMb = Number(process.env.MAX_MODEL_MB || 50);
const jsonLimit = `${Math.max(maxImageMb * 3, 15)}mb`;
const generationJobRateLimitPerMinute = Number(process.env.GENERATION_JOB_RATE_LIMIT_PER_MINUTE || 10);
const provider = selectProvider();
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(serverDir, '..', 'dist');
const distIndexPath = path.join(distDir, 'index.html');

interface GenerateRequestBody {
  inputImageDataUrl: string;
  materialImageDataUrl?: string;
  maskImageDataUrl?: string;
  prompt: string;
  config: Record<string, unknown>;
}

interface GenerateResponseBody {
  id: string;
  provider: ProviderName;
  imageDataUrl: string;
  createdAt: string;
  warnings: string[];
}

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

interface ApiError {
  message: string;
  code: string;
}

interface PublicSharePayload {
  link: {
    permission: ShareLink['permission'];
    expiresAt: string;
    createdAt: string;
  };
  project: {
    name: string;
    description: string;
  };
  generations: PublicGenerationRecord[];
}

interface PublicGenerationRecord {
  id: string;
  mode: GenerationRecord['mode'];
  prompt: string;
  inputImageUrl: string | null;
  inputImageDataPreview: string | null;
  outputImageUrl: string | null;
  outputImageDataPreview: string | null;
  createdAt: string;
  results: PublicGenerationResult[];
}

interface PublicGenerationResult {
  id: string;
  imageUrl: string;
  isSelected: boolean;
  isFavorite: boolean;
  createdAt: string;
}

const queuedGenerationJobIds: string[] = [];
let isGenerationWorkerRunning = false;
const generationJobRateLimitBuckets = new Map<string, { count: number; windowStartedAt: number }>();

app.use(configureCors);
app.use(express.json({ limit: jsonLimit }));
app.use('/uploads', express.static(uploadsDir));
app.use(attachAuthUser);

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, version, provider: provider.name });
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const user = getCurrentUser(req);
  if (!user) {
    res.status(401).json(apiError('Authentication is required.', 'AUTH_REQUIRED'));
    return;
  }

  res.json(apiOk({ user }));
});

app.get('/api/billing/credits', requireAuth, async (
  req: Request,
  res: Response<ApiResponse<{ balance: CreditBalance }>>,
  next: NextFunction,
) => {
  try {
    res.json(apiOk({ balance: await getCreditBalance(getRequiredCurrentUser(req).id) }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/billing/transactions', requireAuth, async (
  req: Request,
  res: Response<ApiResponse<{ transactions: CreditTransaction[] }>>,
  next: NextFunction,
) => {
  try {
    res.json(apiOk({ transactions: await listCreditTransactions(getRequiredCurrentUser(req).id) }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/dashboard', requireAuth, requireAdmin, async (
  _req: Request,
  res: Response<ApiResponse<{ dashboard: AdminDashboard }>>,
  next: NextFunction,
) => {
  try {
    res.json(apiOk({ dashboard: await getAdminDashboard() }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/credits/grant', requireAuth, requireAdmin, async (
  req: Request,
  res: Response<ApiResponse<{ balance: CreditBalance; transaction: CreditTransaction }>>,
  next: NextFunction,
) => {
  const body = validateAdminCreditGrantBody(req.body);
  if (body.ok === false) {
    res.status(400).json(apiError(body.error.message, body.error.code));
    return;
  }

  try {
    const result = await adjustCredits({
      userId: body.value.userId,
      type: 'grant',
      amount: body.value.amount,
      reason: body.value.reason,
      referenceType: 'system',
      referenceId: `admin_grant_${Date.now()}`,
    });

    if (!result) {
      res.status(400).json(apiError('Unable to grant credits.', 'ADMIN_CREDIT_GRANT_FAILED'));
      return;
    }

    res.status(201).json(apiOk(result));
  } catch (error) {
    next(error);
  }
});

app.post('/api/assets/images', requireAuth, async (
  req: Request,
  res: Response<ApiResponse<{ asset: ImageAsset }>>,
  next: NextFunction,
) => {
  try {
    const uploadedFile = await readMultipartImage(req);
    if (uploadedFile.ok === false) {
      res.status(uploadedFile.status).json(apiError(uploadedFile.error.message, uploadedFile.error.code));
      return;
    }

    const extension = getImageExtension(uploadedFile.value.mimeType);
    const storedFile = await fileStorageProvider.uploadImage({
      content: uploadedFile.value.content,
      filename: createStoredFilename(extension),
      mimeType: uploadedFile.value.mimeType,
    });

    const asset = await createImageAsset({
      userId: getRequiredCurrentUser(req).id,
      url: storedFile.url,
      filename: storedFile.filename,
      mimeType: storedFile.mimeType,
      size: storedFile.size,
    });

    res.status(201).json(apiOk({ asset }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/assets/images/:id', requireAuth, async (
  req: Request,
  res: Response<ApiResponse<{ asset: ImageAsset }>>,
  next: NextFunction,
) => {
  try {
    const asset = await getImageAsset(req.params.id, getRequiredCurrentUser(req).id);
    if (!asset) {
      res.status(404).json(apiError('Image asset not found.', 'IMAGE_ASSET_NOT_FOUND'));
      return;
    }

    res.json(apiOk({ asset }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/assets/models', requireAuth, async (
  req: Request,
  res: Response<ApiResponse<{ assets: ModelAsset[] }>>,
  next: NextFunction,
) => {
  try {
    res.json(apiOk({ assets: await listModelAssets(getRequiredCurrentUser(req).id) }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/assets/models', requireAuth, async (
  req: Request,
  res: Response<ApiResponse<{ asset: ModelAsset }>>,
  next: NextFunction,
) => {
  try {
    const uploadedFile = await readMultipartFile(req, maxModelMb * 1024 * 1024 + 1024 * 1024, maxModelMb);
    if (uploadedFile.ok === false) {
      res.status(uploadedFile.status).json(apiError(uploadedFile.error.message, uploadedFile.error.code));
      return;
    }

    const fileType = getModelFileType(uploadedFile.value.originalFilename);
    if (!fileType) {
      res.status(400).json(apiError('Only GLB, GLTF, and OBJ model files are supported.', 'MODEL_ASSET_TYPE_INVALID'));
      return;
    }

    if (uploadedFile.value.content.length > maxModelMb * 1024 * 1024) {
      res.status(413).json(apiError(`Model file cannot exceed ${maxModelMb}MB.`, 'MODEL_ASSET_TOO_LARGE'));
      return;
    }

    const storedFile = await fileStorageProvider.uploadModel({
      content: uploadedFile.value.content,
      filename: createStoredFilename(fileType),
      mimeType: uploadedFile.value.mimeType || getDefaultModelMimeType(fileType),
    });

    const asset = await createModelAsset({
      userId: getRequiredCurrentUser(req).id,
      url: storedFile.url,
      filename: storedFile.filename,
      originalFilename: uploadedFile.value.originalFilename,
      fileType,
      mimeType: storedFile.mimeType,
      size: storedFile.size,
    });

    res.status(201).json(apiOk({ asset }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/assets/models/:id', requireAuth, async (
  req: Request,
  res: Response<ApiResponse<{ asset: ModelAsset }>>,
  next: NextFunction,
) => {
  try {
    const asset = await getModelAsset(req.params.id, getRequiredCurrentUser(req).id);
    if (!asset) {
      res.status(404).json(apiError('Model asset not found.', 'MODEL_ASSET_NOT_FOUND'));
      return;
    }

    res.json(apiOk({ asset }));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/assets/models/:id', requireAuth, async (
  req: Request,
  res: Response<ApiResponse<{ asset: ModelAsset }>>,
  next: NextFunction,
) => {
  try {
    const asset = await deleteModelAsset(req.params.id, getRequiredCurrentUser(req).id);
    if (!asset) {
      res.status(404).json(apiError('Model asset not found.', 'MODEL_ASSET_NOT_FOUND'));
      return;
    }

    await fileStorageProvider.deleteFile(asset.filename);
    res.json(apiOk({ asset }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/generation-jobs', requireAuth, rateLimitGenerationJobCreate, async (
  req: Request,
  res: Response<ApiResponse<{ job: GenerationJob }>>,
  next: NextFunction,
) => {
  const body = validateGenerationJobCreateBody(req.body);
  if (body.ok === false) {
    res.status(400).json(apiError(body.error.message, body.error.code));
    return;
  }

  try {
    const user = getRequiredCurrentUser(req);
    const project = await getProject(body.value.projectId, user.id);
    if (!project) {
      res.status(404).json(apiError('Project not found.', 'PROJECT_NOT_FOUND'));
      return;
    }

    const creditsCost = calculateGenerationCreditsCost(body.value.mode, body.value.config);
    const balance = await getCreditBalance(user.id);
    if (balance.balance < creditsCost) {
      res.status(402).json(apiError(
        `Credits are insufficient. This job requires ${creditsCost} credits, but only ${balance.balance} remain.`,
        'CREDITS_INSUFFICIENT',
      ));
      return;
    }

    const job = await createGenerationJob({ ...body.value, userId: user.id, provider: provider.name });
    if (!job) {
      res.status(404).json(apiError('Project not found.', 'PROJECT_NOT_FOUND'));
      return;
    }

    const debit = await adjustCredits({
      userId: user.id,
      type: 'debit',
      amount: -creditsCost,
      reason: `Generation job ${job.mode} x${readBatchCount(job.config.batchCount)}`,
      referenceType: 'generation_job',
      referenceId: job.id,
    });
    if (!debit) {
      await updateGenerationJob(job.id, {
        status: 'cancelled',
        progress: 0,
        errorMessage: 'Credits are insufficient.',
        finishedAt: new Date().toISOString(),
      });
      res.status(402).json(apiError('Credits are insufficient.', 'CREDITS_INSUFFICIENT'));
      return;
    }

    enqueueGenerationJob(job.id);
    res.status(201).json(apiOk({ job }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/generation-jobs/:id', requireAuth, async (
  req: Request,
  res: Response<ApiResponse<{ job: GenerationJob }>>,
  next: NextFunction,
) => {
  try {
    const job = await getGenerationJob(req.params.id, getRequiredCurrentUser(req).id);
    if (!job) {
      res.status(404).json(apiError('Generation job not found.', 'GENERATION_JOB_NOT_FOUND'));
      return;
    }

    res.json(apiOk({ job: { ...job, results: await listGenerationResults(job.id, getRequiredCurrentUser(req).id) } }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/generation-jobs/:id/cancel', requireAuth, async (
  req: Request,
  res: Response<ApiResponse<{ job: GenerationJob }>>,
  next: NextFunction,
) => {
  try {
    const job = await cancelGenerationJob(req.params.id, getRequiredCurrentUser(req).id);
    if (!job) {
      res.status(404).json(apiError('Generation job not found.', 'GENERATION_JOB_NOT_FOUND'));
      return;
    }

    removeQueuedGenerationJob(job.id);
    if (job.status === 'cancelled') {
      await refundGenerationJobCredits(job.id);
    }
    res.json(apiOk({ job }));
  } catch (error) {
    next(error);
  }
});

app.patch('/api/generation-results/:id', requireAuth, async (
  req: Request,
  res: Response<ApiResponse<{ result: Awaited<ReturnType<typeof updateGenerationResult>> }>>,
  next: NextFunction,
) => {
  const body = validateGenerationResultUpdateBody(req.body);
  if (body.ok === false) {
    res.status(400).json(apiError(body.error.message, body.error.code));
    return;
  }

  try {
    const result = await updateGenerationResult(req.params.id, getRequiredCurrentUser(req).id, body.value);
    if (!result) {
      res.status(404).json(apiError('Generation result not found.', 'GENERATION_RESULT_NOT_FOUND'));
      return;
    }

    res.json(apiOk({ result }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate/floorplan', async (req: Request, res: Response, next: NextFunction) => {
  const body = validateGenerateBody(req.body, { promptRequired: false });
  if (body.ok === false) {
    res.status(400).json(apiError(body.error, 'INVALID_GENERATE_REQUEST'));
    return;
  }

  try {
    res.json(await generateWithFallback({ ...body.value, mode: 'floorplan' }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate/style-render', async (req: Request, res: Response, next: NextFunction) => {
  const body = validateGenerateBody(req.body);
  if (body.ok === false) {
    res.status(400).json(apiError(body.error, 'INVALID_GENERATE_REQUEST'));
    return;
  }

  try {
    res.json(await generateWithFallback({ ...body.value, mode: 'style-render' }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate/inpaint', async (req: Request, res: Response, next: NextFunction) => {
  const body = validateGenerateBody(req.body, { promptRequired: true });
  if (body.ok === false) {
    res.status(400).json(apiError(body.error, 'INVALID_GENERATE_REQUEST'));
    return;
  }

  try {
    res.json(await generateWithFallback({ ...body.value, mode: 'inpaint' }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/projects', requireAuth, async (req: Request, res: Response<ApiResponse<{ projects: Project[] }>>, next: NextFunction) => {
  try {
    res.json(apiOk({ projects: await listProjects(getRequiredCurrentUser(req).id) }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/projects', requireAuth, async (req: Request, res: Response<ApiResponse<{ project: Project }>>, next: NextFunction) => {
  const body = validateProjectCreateBody(req.body);
  if (body.ok === false) {
    res.status(400).json(apiError(body.error.message, body.error.code));
    return;
  }

  try {
    const project = await createProject({ ...body.value, userId: getRequiredCurrentUser(req).id });
    res.status(201).json(apiOk({ project }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/projects/:id', requireAuth, async (req: Request, res: Response<ApiResponse<{ project: Project }>>, next: NextFunction) => {
  try {
    const project = await getProject(req.params.id, getRequiredCurrentUser(req).id);
    if (!project) {
      res.status(404).json(apiError('Project not found.', 'PROJECT_NOT_FOUND'));
      return;
    }

    res.json(apiOk({ project }));
  } catch (error) {
    next(error);
  }
});

app.patch('/api/projects/:id', requireAuth, async (req: Request, res: Response<ApiResponse<{ project: Project }>>, next: NextFunction) => {
  const body = validateProjectUpdateBody(req.body);
  if (body.ok === false) {
    res.status(400).json(apiError(body.error.message, body.error.code));
    return;
  }

  try {
    const project = await updateProject(req.params.id, getRequiredCurrentUser(req).id, body.value);
    if (!project) {
      res.status(404).json(apiError('Project not found.', 'PROJECT_NOT_FOUND'));
      return;
    }

    res.json(apiOk({ project }));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/projects/:id', requireAuth, async (req: Request, res: Response<ApiResponse<{ project: Project }>>, next: NextFunction) => {
  try {
    const project = await softDeleteProject(req.params.id, getRequiredCurrentUser(req).id);
    if (!project) {
      res.status(404).json(apiError('Project not found.', 'PROJECT_NOT_FOUND'));
      return;
    }

    res.json(apiOk({ project }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/projects/:id/share-links', requireAuth, async (
  req: Request,
  res: Response<ApiResponse<{ shareLink: ShareLink; url: string }>>,
  next: NextFunction,
) => {
  const body = validateShareLinkCreateBody(req.body);
  if (body.ok === false) {
    res.status(400).json(apiError(body.error.message, body.error.code));
    return;
  }

  try {
    const shareLink = await createShareLink({
      userId: getRequiredCurrentUser(req).id,
      projectId: req.params.id,
      token: createShareToken(),
      expiresAt: body.value.expiresAt,
    });

    if (!shareLink) {
      res.status(404).json(apiError('Project not found.', 'PROJECT_NOT_FOUND'));
      return;
    }

    res.status(201).json(apiOk({ shareLink, url: buildShareUrl(req, shareLink.token) }));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/projects/:id/share-links/:shareLinkId', requireAuth, async (
  req: Request,
  res: Response<ApiResponse<{ shareLink: ShareLink }>>,
  next: NextFunction,
) => {
  try {
    const shareLink = await revokeShareLink(req.params.id, getRequiredCurrentUser(req).id, req.params.shareLinkId);
    if (!shareLink) {
      res.status(404).json(apiError('Share link not found.', 'SHARE_LINK_NOT_FOUND'));
      return;
    }

    res.json(apiOk({ shareLink }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/projects/:id/generations', requireAuth, async (
  req: Request,
  res: Response<ApiResponse<{ generations: GenerationRecord[] }>>,
  next: NextFunction,
) => {
  try {
    const project = await getProject(req.params.id, getRequiredCurrentUser(req).id);
    if (!project) {
      res.status(404).json(apiError('Project not found.', 'PROJECT_NOT_FOUND'));
      return;
    }

    res.json(apiOk({ generations: await listProjectGenerations(req.params.id, getRequiredCurrentUser(req).id) }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/projects/:id/generations', requireAuth, async (
  req: Request,
  res: Response<ApiResponse<{ generation: GenerationRecord }>>,
  next: NextFunction,
) => {
  const body = validateGenerationRecordCreateBody(req.body, req.params.id);
  if (body.ok === false) {
    res.status(400).json(apiError(body.error.message, body.error.code));
    return;
  }

  try {
    const generation = await createGenerationRecord({ ...body.value, userId: getRequiredCurrentUser(req).id });
    if (!generation) {
      res.status(404).json(apiError('Project not found.', 'PROJECT_NOT_FOUND'));
      return;
    }

    res.status(201).json(apiOk({ generation }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/share/:token', async (
  req: Request,
  res: Response<ApiResponse<{ share: PublicSharePayload }>>,
  next: NextFunction,
) => {
  try {
    const shareLink = await getShareLinkByToken(req.params.token);
    if (!shareLink) {
      res.status(404).json(apiError('分享链接不存在或已失效。', 'SHARE_LINK_NOT_FOUND'));
      return;
    }

    if (shareLink.revokedAt) {
      res.status(410).json(apiError('分享链接已撤销。', 'SHARE_LINK_REVOKED'));
      return;
    }

    if (new Date(shareLink.expiresAt).getTime() <= Date.now()) {
      res.status(410).json(apiError('分享链接已过期。', 'SHARE_LINK_EXPIRED'));
      return;
    }

    const project = await getProject(shareLink.projectId);
    if (!project) {
      res.status(404).json(apiError('分享的项目不存在或已被删除。', 'PROJECT_NOT_FOUND'));
      return;
    }

    const generations = await listProjectGenerations(project.id, project.userId);
    res.json(apiOk({ share: toPublicSharePayload(project, shareLink, generations) }));
  } catch (error) {
    next(error);
  }
});

app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json(apiError('API route not found.', 'API_ROUTE_NOT_FOUND'));
});

if (existsSync(distIndexPath)) {
  app.use(express.static(distDir));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(distIndexPath);
  });
} else {
  console.warn(`Production frontend build not found at ${distDir}. Run npm run build before npm run start.`);
}

app.use((error: unknown, req: Request, res: Response<ApiResponse<never>>, _next: NextFunction) => {
  const requestId = req.headers['x-request-id'];
  const safeRequestId = typeof requestId === 'string' ? sanitizeLogText(requestId) : undefined;
  console.error('API error', {
    requestId: safeRequestId,
    method: req.method,
    path: req.path,
    error: sanitizeErrorForLog(error),
  });

  if (isPayloadTooLargeError(error)) {
    res.status(413).json(apiError(`Request body is too large. Current API limit is ${jsonLimit}.`, 'REQUEST_BODY_TOO_LARGE'));
    return;
  }

  if (isJsonParseError(error)) {
    res.status(400).json(apiError('Request body must be valid JSON.', 'INVALID_JSON_BODY'));
    return;
  }

  res.status(500).json(apiError('Server failed to process the request. Please try again later.', 'INTERNAL_SERVER_ERROR'));
});

await ensureAppDatabase();
await fileStorageProvider.ensureReady();
await restorePendingGenerationJobs();

app.listen(port, host, () => {
  console.log(`ArchAI Expression Engine listening on http://${host}:${port} using ${provider.name} provider`);
});

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = getCurrentUser(req);
  if (user?.role === 'admin') {
    next();
    return;
  }

  res.status(403).json(apiError('Admin permission is required.', 'ADMIN_FORBIDDEN'));
}

function configureCors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  const allowedOrigins = readAllowedCorsOrigins();

  if (origin && isCorsOriginAllowed(origin, allowedOrigins)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin && allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-Id');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}

function readAllowedCorsOrigins(): string[] {
  const rawValue = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS;
  if (!rawValue || rawValue.trim().length === 0) {
    return ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }

  return rawValue.split(',').map(item => item.trim()).filter(Boolean);
}

function isCorsOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

function rateLimitGenerationJobCreate(req: Request, res: Response<ApiResponse<never>>, next: NextFunction): void {
  const user = getCurrentUser(req);
  if (!user) {
    res.status(401).json(apiError('Authentication is required before creating a generation job.', 'AUTH_REQUIRED'));
    return;
  }

  const now = Date.now();
  const windowMs = 60 * 1000;
  const bucket = generationJobRateLimitBuckets.get(user.id);

  if (!bucket || now - bucket.windowStartedAt >= windowMs) {
    generationJobRateLimitBuckets.set(user.id, { count: 1, windowStartedAt: now });
    next();
    return;
  }

  if (bucket.count >= generationJobRateLimitPerMinute) {
    res.status(429).json(apiError(
      `Generation job limit reached. Please wait a minute and try again.`,
      'GENERATION_JOB_RATE_LIMITED',
    ));
    return;
  }

  bucket.count += 1;
  next();
}

function validateGenerateBody(
  body: unknown,
  options: { promptRequired: boolean } = { promptRequired: false },
): { ok: true; value: GenerateRequestBody } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  if (!isNonEmptyString(body.inputImageDataUrl)) {
    return { ok: false, error: 'inputImageDataUrl is required.' };
  }

  const inputImageError = validateDataUrlSize('inputImageDataUrl', body.inputImageDataUrl);
  if (inputImageError) {
    return { ok: false, error: inputImageError };
  }

  if (options.promptRequired && !isNonEmptyString(body.prompt)) {
    return { ok: false, error: 'prompt is required.' };
  }

  if (typeof body.prompt !== 'string') {
    return { ok: false, error: 'prompt must be a string.' };
  }

  if (!isRecord(body.config)) {
    return { ok: false, error: 'config must be an object.' };
  }

  const materialImageDataUrl = body.materialImageDataUrl;
  const maskImageDataUrl = body.maskImageDataUrl;

  if (materialImageDataUrl !== undefined && typeof materialImageDataUrl !== 'string') {
    return { ok: false, error: 'materialImageDataUrl must be a string.' };
  }

  if (maskImageDataUrl !== undefined && typeof maskImageDataUrl !== 'string') {
    return { ok: false, error: 'maskImageDataUrl must be a string.' };
  }

  if (typeof materialImageDataUrl === 'string') {
    const materialImageError = validateDataUrlSize('materialImageDataUrl', materialImageDataUrl);
    if (materialImageError) {
      return { ok: false, error: materialImageError };
    }
  }

  if (typeof maskImageDataUrl === 'string') {
    const maskImageError = validateDataUrlSize('maskImageDataUrl', maskImageDataUrl);
    if (maskImageError) {
      return { ok: false, error: maskImageError };
    }
  }

  const validMaterialImageDataUrl = typeof materialImageDataUrl === 'string' ? materialImageDataUrl : undefined;
  const validMaskImageDataUrl = typeof maskImageDataUrl === 'string' ? maskImageDataUrl : undefined;

  return {
    ok: true,
    value: {
      inputImageDataUrl: body.inputImageDataUrl,
      materialImageDataUrl: validMaterialImageDataUrl,
      maskImageDataUrl: validMaskImageDataUrl,
      prompt: body.prompt,
      config: body.config,
    },
  };
}

async function readMultipartImage(
  req: Request,
): Promise<
  | { ok: true; value: { content: Buffer; mimeType: string; originalFilename: string } }
  | { ok: false; status: number; error: ApiError }
> {
  const parsed = await readMultipartFile(req, maxImageMb * 1024 * 1024 + 1024 * 1024, maxImageMb);
  if (parsed.ok === false) return parsed;

  if (parsed.value.content.length > maxImageMb * 1024 * 1024) {
    return {
      ok: false,
      status: 413,
      error: { message: `Image file cannot exceed ${maxImageMb}MB.`, code: 'UPLOAD_FILE_TOO_LARGE' },
    };
  }

  const sniffedMimeType = sniffImageMimeType(parsed.value.content);
  if (!sniffedMimeType || sniffedMimeType !== parsed.value.mimeType) {
    return {
      ok: false,
      status: 400,
      error: { message: 'Only PNG, JPG, JPEG, and WEBP images are supported.', code: 'UPLOAD_IMAGE_TYPE_INVALID' },
    };
  }

  return {
    ok: true,
    value: {
      content: parsed.value.content,
      mimeType: sniffedMimeType,
      originalFilename: parsed.value.originalFilename,
    },
  };
}

async function readMultipartFile(
  req: Request,
  maxBytes: number,
  displayMaxMb: number,
): Promise<
  | { ok: true; value: { content: Buffer; mimeType: string; originalFilename: string } }
  | { ok: false; status: number; error: ApiError }
> {
  const contentType = req.headers['content-type'];
  if (typeof contentType !== 'string' || !contentType.includes('multipart/form-data')) {
    return {
      ok: false,
      status: 415,
      error: { message: 'Upload must use multipart/form-data.', code: 'UPLOAD_CONTENT_TYPE_INVALID' },
    };
  }

  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
  if (!boundary) {
    return {
      ok: false,
      status: 400,
      error: { message: 'Upload boundary is missing.', code: 'UPLOAD_BOUNDARY_MISSING' },
    };
  }

  const body = await readRequestBuffer(req, maxBytes, displayMaxMb);
  if (body.ok === false) {
    return body;
  }

  const parsed = parseMultipartFile(body.value, boundary);
  if (!parsed) {
    return {
      ok: false,
      status: 400,
      error: { message: 'No file was found in the upload.', code: 'UPLOAD_FILE_MISSING' },
    };
  }

  return { ok: true, value: parsed };
}

function readRequestBuffer(
  req: Request,
  maxBytes: number,
  displayMaxMb: number,
): Promise<{ ok: true; value: Buffer } | { ok: false; status: number; error: ApiError }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let resolved = false;

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        resolved = true;
        req.destroy();
        resolve({
          ok: false,
          status: 413,
          error: { message: `Upload request cannot exceed ${displayMaxMb}MB.`, code: 'UPLOAD_TOO_LARGE' },
        });
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!resolved) {
        resolve({ ok: true, value: Buffer.concat(chunks) });
      }
    });

    req.on('error', error => {
      if (!resolved) {
        reject(error);
      }
    });
  });
}

function parseMultipartFile(
  body: Buffer,
  boundary: string,
): { content: Buffer; mimeType: string; originalFilename: string } | null {
  const delimiter = Buffer.from(`--${boundary}`);
  let offset = 0;

  while (offset < body.length) {
    const start = body.indexOf(delimiter, offset);
    if (start === -1) break;

    const partStart = start + delimiter.length;
    if (body.slice(partStart, partStart + 2).toString('ascii') === '--') break;

    const contentStart = body.indexOf(Buffer.from('\r\n\r\n'), partStart);
    if (contentStart === -1) break;

    const headers = body.slice(partStart + 2, contentStart).toString('utf8');
    const nextBoundary = body.indexOf(delimiter, contentStart + 4);
    if (nextBoundary === -1) break;

    let content = body.slice(contentStart + 4, nextBoundary);
    if (content.slice(-2).toString('ascii') === '\r\n') {
      content = content.slice(0, -2);
    }

    const disposition = /content-disposition:[^\r\n]+/i.exec(headers)?.[0] || '';
    const filename = /filename="([^"]+)"/i.exec(disposition)?.[1];
    const contentType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim().toLowerCase();

    if (filename && contentType) {
      return {
        content,
        mimeType: normalizeImageMimeType(contentType),
        originalFilename: path.basename(filename),
      };
    }

    offset = nextBoundary;
  }

  return null;
}

function normalizeImageMimeType(mimeType: string): string {
  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
}

function sniffImageMimeType(content: Buffer): string | null {
  if (
    content.length >= 8 &&
    content[0] === 0x89 &&
    content[1] === 0x50 &&
    content[2] === 0x4e &&
    content[3] === 0x47 &&
    content[4] === 0x0d &&
    content[5] === 0x0a &&
    content[6] === 0x1a &&
    content[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    content.length >= 12 &&
    content.slice(0, 4).toString('ascii') === 'RIFF' &&
    content.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

function getImageExtension(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function getModelFileType(filename: string): ModelAsset['fileType'] | null {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (extension === 'glb' || extension === 'gltf' || extension === 'obj') {
    return extension;
  }

  return null;
}

function getDefaultModelMimeType(fileType: ModelAsset['fileType']): string {
  if (fileType === 'glb') return 'model/gltf-binary';
  if (fileType === 'gltf') return 'model/gltf+json';
  return 'model/obj';
}

function validateProjectCreateBody(
  body: unknown,
): { ok: true; value: Omit<Parameters<typeof createProject>[0], 'userId'> } | { ok: false; error: ApiError } {
  if (!isRecord(body)) {
    return { ok: false, error: { message: 'Request body must be a JSON object.', code: 'INVALID_REQUEST_BODY' } };
  }

  if (!isNonEmptyString(body.name)) {
    return { ok: false, error: { message: 'Project name is required.', code: 'PROJECT_NAME_REQUIRED' } };
  }

  const description = body.description;
  const status = body.status;
  const coverImageUrl = body.coverImageUrl;
  const validCoverImageUrl: string | null | undefined = isNullableString(coverImageUrl) ? coverImageUrl : undefined;

  if (description !== undefined && typeof description !== 'string') {
    return { ok: false, error: { message: 'Project description must be a string.', code: 'PROJECT_DESCRIPTION_INVALID' } };
  }

  if (status !== undefined && !isProjectStatus(status)) {
    return { ok: false, error: { message: 'Project status must be active or archived.', code: 'PROJECT_STATUS_INVALID' } };
  }

  if (coverImageUrl !== undefined && coverImageUrl !== null && typeof coverImageUrl !== 'string') {
    return { ok: false, error: { message: 'Project coverImageUrl must be a string or null.', code: 'PROJECT_COVER_INVALID' } };
  }

  return {
    ok: true,
    value: {
      name: body.name.trim(),
      description: typeof description === 'string' ? description : undefined,
      status: isProjectStatus(status) ? status : undefined,
      coverImageUrl: validCoverImageUrl,
    },
  };
}

function validateProjectUpdateBody(
  body: unknown,
): { ok: true; value: Parameters<typeof updateProject>[2] } | { ok: false; error: ApiError } {
  if (!isRecord(body)) {
    return { ok: false, error: { message: 'Request body must be a JSON object.', code: 'INVALID_REQUEST_BODY' } };
  }

  const value: Parameters<typeof updateProject>[2] = {};

  if (body.name !== undefined) {
    if (!isNonEmptyString(body.name)) {
      return { ok: false, error: { message: 'Project name must be a non-empty string.', code: 'PROJECT_NAME_INVALID' } };
    }
    value.name = body.name.trim();
  }

  if (body.description !== undefined) {
    if (typeof body.description !== 'string') {
      return { ok: false, error: { message: 'Project description must be a string.', code: 'PROJECT_DESCRIPTION_INVALID' } };
    }
    value.description = body.description;
  }

  if (body.status !== undefined) {
    if (!isProjectStatus(body.status)) {
      return { ok: false, error: { message: 'Project status must be active or archived.', code: 'PROJECT_STATUS_INVALID' } };
    }
    value.status = body.status;
  }

  if (body.coverImageUrl !== undefined) {
    const coverImageUrl = body.coverImageUrl;
    if (coverImageUrl !== null && typeof coverImageUrl !== 'string') {
      return { ok: false, error: { message: 'Project coverImageUrl must be a string or null.', code: 'PROJECT_COVER_INVALID' } };
    }
    value.coverImageUrl = isNullableString(coverImageUrl) ? coverImageUrl : null;
  }

  if (Object.keys(value).length === 0) {
    return { ok: false, error: { message: 'At least one project field is required.', code: 'PROJECT_UPDATE_EMPTY' } };
  }

  return { ok: true, value };
}

function validateShareLinkCreateBody(
  body: unknown,
): { ok: true; value: { expiresAt: string } } | { ok: false; error: ApiError } {
  const fallbackExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  if (body === undefined || body === null) {
    return { ok: true, value: { expiresAt: fallbackExpiresAt } };
  }

  if (!isRecord(body)) {
    return { ok: false, error: { message: 'Request body must be a JSON object.', code: 'INVALID_REQUEST_BODY' } };
  }

  if (body.expiresAt === undefined || body.expiresAt === null || body.expiresAt === '') {
    return { ok: true, value: { expiresAt: fallbackExpiresAt } };
  }

  if (typeof body.expiresAt !== 'string') {
    return { ok: false, error: { message: 'expiresAt must be an ISO date string.', code: 'SHARE_LINK_EXPIRES_INVALID' } };
  }

  const expiresTime = new Date(body.expiresAt).getTime();
  if (!Number.isFinite(expiresTime) || expiresTime <= Date.now()) {
    return { ok: false, error: { message: 'expiresAt must be a future date.', code: 'SHARE_LINK_EXPIRES_INVALID' } };
  }

  return { ok: true, value: { expiresAt: new Date(expiresTime).toISOString() } };
}

function validateAdminCreditGrantBody(
  body: unknown,
): { ok: true; value: { userId: string; amount: number; reason: string } } | { ok: false; error: ApiError } {
  if (!isRecord(body)) {
    return { ok: false, error: { message: 'Request body must be a JSON object.', code: 'INVALID_REQUEST_BODY' } };
  }

  if (!isNonEmptyString(body.userId)) {
    return { ok: false, error: { message: 'userId is required.', code: 'ADMIN_USER_ID_REQUIRED' } };
  }

  if (typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount <= 0) {
    return { ok: false, error: { message: 'amount must be a positive integer.', code: 'ADMIN_CREDIT_AMOUNT_INVALID' } };
  }

  const reason = typeof body.reason === 'string' && body.reason.trim().length > 0
    ? body.reason.trim()
    : 'Admin manual credit grant';

  return {
    ok: true,
    value: {
      userId: body.userId.trim(),
      amount: body.amount,
      reason,
    },
  };
}

function validateGenerationRecordCreateBody(
  body: unknown,
  projectId: string,
): { ok: true; value: Omit<Parameters<typeof createGenerationRecord>[0], 'userId'> } | { ok: false; error: ApiError } {
  if (!isRecord(body)) {
    return { ok: false, error: { message: 'Request body must be a JSON object.', code: 'INVALID_REQUEST_BODY' } };
  }

  if (!isGenerationMode(body.mode)) {
    return { ok: false, error: { message: 'Generation mode is invalid.', code: 'GENERATION_MODE_INVALID' } };
  }

  if (typeof body.prompt !== 'string') {
    return { ok: false, error: { message: 'Generation prompt must be a string.', code: 'GENERATION_PROMPT_INVALID' } };
  }

  if (typeof body.provider !== 'string' || body.provider.trim().length === 0) {
    return { ok: false, error: { message: 'Generation provider is required.', code: 'GENERATION_PROVIDER_REQUIRED' } };
  }

  if (body.status !== undefined && !isGenerationStatus(body.status)) {
    return { ok: false, error: { message: 'Generation status is invalid.', code: 'GENERATION_STATUS_INVALID' } };
  }

  const inputImageUrl = readOptionalNullableString(body.inputImageUrl, 'GENERATION_INPUT_URL_INVALID');
  if (inputImageUrl.ok === false) return { ok: false, error: inputImageUrl.error };

  const inputImageDataPreview = readOptionalNullableString(body.inputImageDataPreview, 'GENERATION_INPUT_PREVIEW_INVALID');
  if (inputImageDataPreview.ok === false) return { ok: false, error: inputImageDataPreview.error };

  const outputImageUrl = readOptionalNullableString(body.outputImageUrl, 'GENERATION_OUTPUT_URL_INVALID');
  if (outputImageUrl.ok === false) return { ok: false, error: outputImageUrl.error };

  const outputImageDataPreview = readOptionalNullableString(body.outputImageDataPreview, 'GENERATION_OUTPUT_PREVIEW_INVALID');
  if (outputImageDataPreview.ok === false) return { ok: false, error: outputImageDataPreview.error };

  return {
    ok: true,
    value: {
      projectId,
      mode: body.mode,
      prompt: body.prompt,
      provider: body.provider.trim(),
      status: isGenerationStatus(body.status) ? body.status : undefined,
      inputImageUrl: inputImageUrl.value,
      inputImageDataPreview: inputImageDataPreview.value,
      outputImageUrl: outputImageUrl.value,
      outputImageDataPreview: outputImageDataPreview.value,
    },
  };
}

function validateGenerationJobCreateBody(
  body: unknown,
): { ok: true; value: Omit<Parameters<typeof createGenerationJob>[0], 'provider' | 'userId'> } | { ok: false; error: ApiError } {
  if (!isRecord(body)) {
    return { ok: false, error: { message: 'Request body must be a JSON object.', code: 'INVALID_REQUEST_BODY' } };
  }

  if (!isNonEmptyString(body.projectId)) {
    return { ok: false, error: { message: 'projectId is required.', code: 'GENERATION_JOB_PROJECT_REQUIRED' } };
  }

  if (!isGenerationMode(body.mode)) {
    return { ok: false, error: { message: 'Generation mode is invalid.', code: 'GENERATION_JOB_MODE_INVALID' } };
  }

  if (typeof body.prompt !== 'string') {
    return { ok: false, error: { message: 'prompt must be a string.', code: 'GENERATION_JOB_PROMPT_INVALID' } };
  }

  if (!isRecord(body.config)) {
    return { ok: false, error: { message: 'config must be an object.', code: 'GENERATION_JOB_CONFIG_INVALID' } };
  }

  if (
    !Array.isArray(body.inputAssetIds) ||
    body.inputAssetIds.length === 0 ||
    !body.inputAssetIds.every(item => typeof item === 'string' && item.trim().length > 0)
  ) {
    return { ok: false, error: { message: 'inputAssetIds must contain at least one asset id.', code: 'GENERATION_JOB_INPUTS_INVALID' } };
  }

  if (body.config.batchCount !== undefined && !isBatchCount(body.config.batchCount)) {
    return { ok: false, error: { message: 'batchCount must be 1, 2, or 4.', code: 'GENERATION_JOB_BATCH_COUNT_INVALID' } };
  }

  return {
    ok: true,
    value: {
      projectId: body.projectId.trim(),
      mode: body.mode,
      prompt: body.prompt,
      config: body.config,
      inputAssetIds: body.inputAssetIds,
    },
  };
}

function validateGenerationResultUpdateBody(
  body: unknown,
): { ok: true; value: Parameters<typeof updateGenerationResult>[2] } | { ok: false; error: ApiError } {
  if (!isRecord(body)) {
    return { ok: false, error: { message: 'Request body must be a JSON object.', code: 'INVALID_REQUEST_BODY' } };
  }

  const value: Parameters<typeof updateGenerationResult>[2] = {};
  if (body.isSelected !== undefined) {
    if (typeof body.isSelected !== 'boolean') {
      return { ok: false, error: { message: 'isSelected must be a boolean.', code: 'GENERATION_RESULT_SELECTED_INVALID' } };
    }
    value.isSelected = body.isSelected;
  }

  if (body.isFavorite !== undefined) {
    if (typeof body.isFavorite !== 'boolean') {
      return { ok: false, error: { message: 'isFavorite must be a boolean.', code: 'GENERATION_RESULT_FAVORITE_INVALID' } };
    }
    value.isFavorite = body.isFavorite;
  }

  if (Object.keys(value).length === 0) {
    return { ok: false, error: { message: 'At least one result field is required.', code: 'GENERATION_RESULT_UPDATE_EMPTY' } };
  }

  return { ok: true, value };
}

function apiOk<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

function apiError(message: string, code: string): ApiResponse<never> {
  return { ok: false, error: { message, code } };
}

function sanitizeErrorForLog(error: unknown): { name: string; message: string; code?: string } {
  if (error instanceof Error) {
    const maybeCode = isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
    return {
      name: error.name,
      message: sanitizeLogText(error.message),
      code: maybeCode,
    };
  }

  return {
    name: 'UnknownError',
    message: sanitizeLogText(String(error)),
  };
}

function sanitizeLogText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, 'Bearer [redacted]')
    .replace(/(api[_-]?key|token|jwt|authorization|password|secret)=([^&\s]+)/giu, '$1=[redacted]')
    .replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/giu, 'data:image/[redacted];base64,[redacted]')
    .replace(/[A-Za-z0-9+/]{120,}={0,2}/gu, '[base64-redacted]')
    .slice(0, 1000);
}

function calculateGenerationCreditsCost(mode: GenerationRecord['mode'], config: Record<string, unknown>): number {
  const baseCost = mode === 'inpaint' ? 8 : 10;
  return baseCost * readBatchCount(config.batchCount);
}

async function refundGenerationJobCredits(jobId: string): Promise<void> {
  const job = await getGenerationJob(jobId);
  if (!job) return;

  const debit = await getCreditTransactionByReference(job.userId, 'debit', job.id);
  if (!debit) return;

  const existingRefund = await getCreditTransactionByReference(job.userId, 'refund', job.id);
  if (existingRefund) return;

  await adjustCredits({
    userId: job.userId,
    type: 'refund',
    amount: Math.abs(debit.amount),
    reason: `Refund for ${job.status} generation job`,
    referenceType: 'generation_job',
    referenceId: job.id,
  });
}

function createShareToken(): string {
  return randomBytes(32).toString('base64url');
}

function buildShareUrl(req: Request, token: string): string {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;
  const hostValue = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const origin = hostValue ? `${protocol}://${hostValue}` : '';
  return `${origin}/share/${token}`;
}

function toPublicSharePayload(
  project: Project,
  shareLink: ShareLink,
  generations: GenerationRecord[],
): PublicSharePayload {
  return {
    link: {
      permission: shareLink.permission,
      expiresAt: shareLink.expiresAt,
      createdAt: shareLink.createdAt,
    },
    project: {
      name: project.name,
      description: project.description,
    },
    generations: generations.map(generation => ({
      id: generation.id,
      mode: generation.mode,
      prompt: generation.prompt,
      inputImageUrl: generation.inputImageUrl ?? null,
      inputImageDataPreview: generation.inputImageDataPreview ?? null,
      outputImageUrl: generation.outputImageUrl ?? null,
      outputImageDataPreview: generation.outputImageDataPreview ?? null,
      createdAt: generation.createdAt,
      results: (generation.results ?? []).map(result => ({
        id: result.id,
        imageUrl: result.imageUrl,
        isSelected: result.isSelected,
        isFavorite: result.isFavorite,
        createdAt: result.createdAt,
      })),
    })),
  };
}

function isProjectStatus(value: unknown): value is Project['status'] {
  return value === 'active' || value === 'archived';
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isGenerationMode(value: unknown): value is GenerationRecord['mode'] {
  return value === 'floorplan' || value === 'style-render' || value === 'inpaint';
}

function isGenerationStatus(value: unknown): value is GenerationRecord['status'] {
  return value === 'succeeded' || value === 'failed';
}

function isBatchCount(value: unknown): value is 1 | 2 | 4 {
  return value === 1 || value === 2 || value === 4;
}

function readBatchCount(value: unknown): 1 | 2 | 4 {
  return isBatchCount(value) ? value : 1;
}

function readOptionalNullableString(
  value: unknown,
  code: string,
): { ok: true; value: string | null | undefined } | { ok: false; error: ApiError } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (isNullableString(value)) {
    return { ok: true, value };
  }

  return { ok: false, error: { message: 'Generation image field must be a string or null.', code } };
}

async function restorePendingGenerationJobs(): Promise<void> {
  const jobs = await listRunnableGenerationJobs();
  for (const job of jobs) {
    if (job.status === 'running') {
      await updateGenerationJob(job.id, { status: 'queued', progress: 0, startedAt: null, errorMessage: null });
    }
    enqueueGenerationJob(job.id);
  }
}

function enqueueGenerationJob(jobId: string): void {
  if (!queuedGenerationJobIds.includes(jobId)) {
    queuedGenerationJobIds.push(jobId);
  }

  setTimeout(() => {
    void runGenerationWorker();
  }, 0);
}

function removeQueuedGenerationJob(jobId: string): void {
  const index = queuedGenerationJobIds.indexOf(jobId);
  if (index !== -1) {
    queuedGenerationJobIds.splice(index, 1);
  }
}

async function runGenerationWorker(): Promise<void> {
  if (isGenerationWorkerRunning) return;
  isGenerationWorkerRunning = true;

  try {
    while (queuedGenerationJobIds.length > 0) {
      const jobId = queuedGenerationJobIds.shift();
      if (!jobId) continue;
      await processGenerationJob(jobId);
    }
  } finally {
    isGenerationWorkerRunning = false;
  }
}

async function processGenerationJob(jobId: string): Promise<void> {
  const job = await getGenerationJob(jobId);
  if (!job || job.status === 'cancelled' || job.status === 'succeeded' || job.status === 'failed') {
    return;
  }

  const startedAt = new Date().toISOString();
  await updateGenerationJob(job.id, {
    status: 'running',
    progress: 10,
    startedAt,
    errorMessage: null,
  });

  try {
    const latestBeforeGenerate = await getGenerationJob(job.id);
    if (latestBeforeGenerate?.status === 'cancelled') return;

    const input = await buildGenerateInputFromJob(job);
    const batchCount = readBatchCount(job.config.batchCount);
    await updateGenerationJob(job.id, { progress: 20 });

    const outputAssetIds: string[] = [];
    let firstOutput: GenerateImageOutput | null = null;
    let firstOutputAsset: ImageAsset | null = null;

    for (let index = 0; index < batchCount; index += 1) {
      const latestBeforeItem = await getGenerationJob(job.id);
      if (latestBeforeItem?.status === 'cancelled') return;

      const output = await generateWithFallback({
        ...input,
        config: { ...input.config, batchIndex: index + 1, batchCount },
      });
      if (!firstOutput) firstOutput = output;

      const progress = 25 + Math.round(((index + 1) / batchCount) * 55);
      await updateGenerationJob(job.id, { progress });

      const outputAsset = await saveGeneratedDataUrl(job.userId, output.imageDataUrl, `generation-${job.id}-${index + 1}`);
      if (!firstOutputAsset) firstOutputAsset = outputAsset;
      outputAssetIds.push(outputAsset.id);

      await createGenerationResult({
        userId: job.userId,
        projectId: job.projectId,
        jobId: job.id,
        assetId: outputAsset.id,
        imageUrl: outputAsset.url,
        isSelected: index === 0,
      });
    }

    const latestAfterGenerate = await getGenerationJob(job.id);
    if (latestAfterGenerate?.status === 'cancelled') return;

    if (!firstOutput || !firstOutputAsset) {
      throw new Error('Generation job did not produce any result.');
    }

    await updateGenerationJob(job.id, { progress: 85 });
    await createGenerationRecord({
      userId: job.userId,
      projectId: job.projectId,
      jobId: job.id,
      mode: job.mode,
      prompt: job.prompt,
      inputImageUrl: await getInputAssetUrl(job.inputAssetIds[0]),
      outputImageUrl: firstOutputAsset.url,
      provider: firstOutput.provider,
      status: 'succeeded',
    });

    await updateGenerationJob(job.id, {
      status: 'succeeded',
      progress: 100,
      outputAssetId: firstOutputAsset.id,
      outputAssetIds,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation job failed.';
    const latest = await getGenerationJob(job.id);
    if (latest?.status === 'cancelled') return;

    await updateGenerationJob(job.id, {
      status: 'failed',
      progress: 100,
      errorMessage: message,
      finishedAt: new Date().toISOString(),
    });
    await refundGenerationJobCredits(job.id);
  }
}

async function buildGenerateInputFromJob(job: GenerationJob): Promise<GenerateImageInput> {
  const inputImageDataUrl = await getImageAssetDataUrl(job.inputAssetIds[0]);
  if (!inputImageDataUrl) {
    throw new Error('Input image asset was not found.');
  }

  const materialImageDataUrl = job.inputAssetIds[1] ? await getImageAssetDataUrl(job.inputAssetIds[1]) : undefined;
  const maskAssetId = typeof job.config.maskAssetId === 'string' ? job.config.maskAssetId : null;
  const maskImageDataUrl = maskAssetId ? await getImageAssetDataUrl(maskAssetId) : undefined;

  return {
    mode: job.mode,
    inputImageDataUrl,
    materialImageDataUrl,
    maskImageDataUrl,
    prompt: job.prompt,
    config: job.config,
  };
}

async function getImageAssetDataUrl(assetId: string | undefined): Promise<string | undefined> {
  if (!assetId) return undefined;
  const asset = await getImageAsset(assetId);
  if (!asset) return undefined;

  if (!asset.url.startsWith('/uploads/')) {
    const response = await fetch(asset.url);
    if (!response.ok) {
      throw new Error(`Unable to read remote image asset: HTTP ${response.status}`);
    }

    const content = Buffer.from(await response.arrayBuffer());
    return `data:${asset.mimeType};base64,${content.toString('base64')}`;
  }

  const filePath = resolveUploadUrlToPath(asset.url);
  const content = await readFile(filePath);
  return `data:${asset.mimeType};base64,${content.toString('base64')}`;
}

async function getInputAssetUrl(assetId: string | undefined): Promise<string | null> {
  if (!assetId) return null;
  const asset = await getImageAsset(assetId);
  return asset?.url ?? null;
}

async function saveGeneratedDataUrl(userId: string, dataUrl: string, basename: string): Promise<ImageAsset> {
  const parsed = parseDataUrl(dataUrl);
  const extension = getExtensionForMimeType(parsed.mimeType);
  const storedFile = await fileStorageProvider.uploadImage({
    content: parsed.content,
    filename: `generated/${createStoredFilename(extension, basename)}`,
    mimeType: parsed.mimeType,
  });

  return createImageAsset({
    userId,
    url: storedFile.url,
    filename: storedFile.filename,
    mimeType: storedFile.mimeType,
    size: storedFile.size,
  });
}

function parseDataUrl(dataUrl: string): { mimeType: string; content: Buffer } {
  const match = /^data:([^;,]+)((?:;[^,]*)?),(.*)$/u.exec(dataUrl);
  if (!match) {
    throw new Error('Provider returned an invalid data URL.');
  }

  const mimeType = match[1];
  const isBase64 = match[2].includes(';base64');
  const payload = match[3];
  const content = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload), 'utf8');
  return { mimeType, content };
}

function getExtensionForMimeType(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/svg+xml') return 'svg';
  return 'bin';
}

function resolveUploadUrlToPath(url: string): string {
  if (!url.startsWith('/uploads/')) {
    throw new Error('Asset URL is not a local upload.');
  }

  const relativePath = url.replace(/^\/uploads\//u, '');
  const resolvedPath = path.resolve(uploadsDir, relativePath);
  if (!resolvedPath.startsWith(uploadsDir)) {
    throw new Error('Asset URL resolved outside upload directory.');
  }

  return resolvedPath;
}

async function generateWithFallback(input: GenerateImageInput): Promise<GenerateResponseBody> {
  if (provider.name === 'mock') {
    return provider.generateImage(input);
  }

  if (provider.name === 'gemini') {
    try {
      return await provider.generateImage(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gemini provider failed.';
      return createMockGeneration(input, [
        `Gemini provider failed to complete this generation: ${message}`,
        '已自动回退到 mock provider，避免请求中断。',
      ]);
    }
  }

  if (provider.name === 'grsai-nano-banana') {
    if (input.mode === 'inpaint') {
      return createMockGeneration(input, [
        '当前 provider 暂未支持真实局部重绘，已使用 mock 结果。',
      ]);
    }

    return provider.generateImage(input);
  }

  return provider.generateImage(input);
}

function selectProvider(): ImageGenerationProvider {
  const requestedProvider = process.env.AI_PROVIDER || 'mock';
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const grsaiApiKey = process.env.GRSAI_API_KEY;

  if (requestedProvider === 'grsai-nano-banana' && grsaiApiKey) {
    return createGrsaiNanoBananaProvider({ apiKey: grsaiApiKey });
  }

  if (requestedProvider === 'grsai-nano-banana' && !grsaiApiKey) {
    console.warn('AI_PROVIDER=grsai-nano-banana but GRSAI_API_KEY is missing; falling back to mock provider.');
  }

  if (requestedProvider === 'gemini' && geminiApiKey) {
    return createGeminiProvider(geminiApiKey);
  }

  if (requestedProvider === 'gemini' && !geminiApiKey) {
    console.warn('AI_PROVIDER=gemini but GEMINI_API_KEY is missing; falling back to mock provider.');
  }

  return mockProvider;
}

function validateDataUrlSize(fieldName: string, dataUrl: string): string | null {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) {
    return `${fieldName} must be a data URL.`;
  }

  const encoded = dataUrl.slice(commaIndex + 1);
  const estimatedBytes = Math.ceil((encoded.length * 3) / 4);
  const maxBytes = maxImageMb * 1024 * 1024;

  if (estimatedBytes > maxBytes) {
    return `${fieldName} exceeds ${maxImageMb}MB.`;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPayloadTooLargeError(error: unknown): boolean {
  return isRecord(error) && error.type === 'entity.too.large';
}

function isJsonParseError(error: unknown): boolean {
  return isRecord(error) && error.type === 'entity.parse.failed';
}

