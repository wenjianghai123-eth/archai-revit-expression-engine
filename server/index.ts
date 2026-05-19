import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { NextFunction, Request, Response } from 'express';
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
  createUserProfile,
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
  getUserProfileByEmail,
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
  listUserProfiles,
  Project,
  revokeShareLink,
  ShareLink,
  softDeleteProject,
  updateGenerationJob,
  updateGenerationResult,
  updateProject,
  updateUserProfile,
  UserProfile,
} from './storage';
import {
  ApiError,
  ApiResponse,
  apiError,
  apiOk,
  configureCors,
  createErrorHandler,
  createGenerationJobRateLimiter,
  requireAdmin,
  sanitizeLogText,
} from './http';
import {
  getDefaultModelMimeType,
  getImageExtension,
  getModelFileType,
  isAllowedModelMimeType,
  readMultipartFile,
  readMultipartImage,
  sniffModelFile,
} from './upload';
import {
  calculateGenerationCreditsCost,
  enqueueGenerationJob,
  generateWithFallbackResponse,
  getGenerationProviderName,
  isGenerationWorkerDisabled,
  isLegacyGenerationEndpointEnabled,
  refundGenerationJobCredits,
  removeQueuedGenerationJob,
  restorePendingGenerationJobs,
} from './generationService';
import { createAssetsRouter } from './routes/assets';
import { createSupabaseAuthUser, resetSupabaseAuthUserPassword, updateSupabaseAuthUserMetadata } from './supabaseAdmin';

export const app = express();
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';
const version = '0.1.0';
const maxImageMb = Number(process.env.MAX_IMAGE_MB || 10);
const maxModelMb = Number(process.env.MAX_MODEL_MB || 600);
const jsonLimit = `${Math.max(maxImageMb * 3, 15)}mb`;
const generationJobRateLimitPerMinute = Number(process.env.GENERATION_JOB_RATE_LIMIT_PER_MINUTE || 10);
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

type MaskMode = 'asset-mask' | 'full-image';

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
const rateLimitGenerationJobCreate = createGenerationJobRateLimiter(generationJobRateLimitPerMinute);

app.use(configureCors);
app.use(express.json({ limit: jsonLimit }));
app.use('/uploads', express.static(uploadsDir));
app.use(attachAuthUser);

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, version, provider: getGenerationProviderName() });
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const user = getCurrentUser(req);
  if (!user) {
    res.status(401).json(apiError('Authentication is required.', 'AUTH_REQUIRED'));
    return;
  }

  res.json(apiOk({ user }));
});

app.use('/api/assets', createAssetsRouter({ maxImageMb, maxModelMb }));

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

app.get('/api/admin/users', requireAuth, requireAdmin, async (
  _req: Request,
  res: Response<ApiResponse<{ users: UserProfile[] }>>,
  next: NextFunction,
) => {
  try {
    res.json(apiOk({ users: await listUserProfiles() }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (
  req: Request,
  res: Response<ApiResponse<{ user: UserProfile; balance: CreditBalance }>>,
  next: NextFunction,
) => {
  const body = validateAdminUserCreateBody(req.body);
  if (body.ok === false) {
    res.status(400).json(apiError(body.error.message, body.error.code));
    return;
  }

  try {
    const existing = await getUserProfileByEmail(body.value.email);
    if (existing) {
      res.status(409).json(apiError('Email already exists.', 'ADMIN_USER_EMAIL_EXISTS'));
      return;
    }

    const authUser = await createSupabaseAuthUser({
      email: body.value.email,
      password: body.value.password,
      name: body.value.name,
    });
    const user = await createUserProfile({
      id: authUser.id,
      email: authUser.email || body.value.email,
      name: body.value.name,
      role: body.value.role,
      status: 'active',
    });
    const creditResult = await adjustCredits({
      userId: user.id,
      type: 'grant',
      amount: body.value.initialCredits,
      reason: 'admin_user_create',
      referenceType: 'system',
      referenceId: `admin_user_create_${user.id}`,
    });

    if (!creditResult) {
      res.status(400).json(apiError('Unable to initialize user credits.', 'ADMIN_USER_CREDITS_FAILED'));
      return;
    }

    res.status(201).json(apiOk({ user, balance: creditResult.balance }));
  } catch (error) {
    if (error instanceof Error && /Email already exists/i.test(error.message)) {
      res.status(409).json(apiError('Email already exists.', 'ADMIN_USER_EMAIL_EXISTS'));
      return;
    }
    next(error);
  }
});

app.patch('/api/admin/users/:userId', requireAuth, requireAdmin, async (
  req: Request,
  res: Response<ApiResponse<{ user: UserProfile }>>,
  next: NextFunction,
) => {
  const body = validateAdminUserUpdateBody(req.body);
  if (body.ok === false) {
    res.status(400).json(apiError(body.error.message, body.error.code));
    return;
  }

  try {
    const user = await updateUserProfile(req.params.userId, body.value);
    if (!user) {
      res.status(404).json(apiError('User not found.', 'ADMIN_USER_NOT_FOUND'));
      return;
    }

    await updateSupabaseAuthUserMetadata({
      userId: user.id,
      email: body.value.email,
      name: body.value.name,
    });

    res.json(apiOk({ user }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/users/:userId/reset-password', requireAuth, requireAdmin, async (
  req: Request,
  res: Response<ApiResponse<{ ok: true }>>,
  next: NextFunction,
) => {
  const body = validateAdminPasswordResetBody(req.body);
  if (body.ok === false) {
    res.status(400).json(apiError(body.error.message, body.error.code));
    return;
  }

  try {
    await resetSupabaseAuthUserPassword({ userId: req.params.userId, password: body.value.password });
    res.json(apiOk({ ok: true }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/users/:userId/credits', requireAuth, requireAdmin, async (
  req: Request,
  res: Response<ApiResponse<{ balance: CreditBalance; transaction: CreditTransaction }>>,
  next: NextFunction,
) => {
  const body = validateAdminUserCreditBody(req.body);
  if (body.ok === false) {
    res.status(400).json(apiError(body.error.message, body.error.code));
    return;
  }

  try {
    const result = await adjustCredits({
      userId: req.params.userId,
      type: 'grant',
      amount: body.value.amount,
      reason: body.value.reason,
      referenceType: 'system',
      referenceId: `admin_user_credit_${req.params.userId}_${Date.now()}`,
    });

    if (!result) {
      res.status(400).json(apiError('Unable to grant credits.', 'ADMIN_CREDIT_GRANT_FAILED'));
      return;
    }

    res.json(apiOk(result));
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

    const assetValidation = await validateGenerationJobAssets(body.value.inputAssetIds, body.value.mode, body.value.config, user.id);
    if (assetValidation.ok === false) {
      const status = assetValidation.error.code === 'GENERATION_JOB_SOURCE_MODEL_NOT_FOUND' ? 403 : 404;
      res.status(status).json(apiError(assetValidation.error.message, assetValidation.error.code));
      return;
    }

    const creditsCost = calculateGenerationCreditsCost(body.value.mode, body.value.config);
    const job = await createGenerationJob({ ...body.value, userId: user.id, provider: getGenerationProviderName() });
    if (!job) {
      res.status(404).json(apiError('Project not found.', 'PROJECT_NOT_FOUND'));
      return;
    }

    const debit = await adjustCredits({
      userId: user.id,
      type: 'debit',
      amount: -creditsCost,
      reason: `Generation job ${job.mode} x${resolveChargedOutputCount(body.value.mode, body.value.config)}`,
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

    if (!isGenerationWorkerDisabled()) {
      enqueueGenerationJob(job.id);
    }
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
  if (!isLegacyGenerationEndpointEnabled()) {
    res.status(404).json(apiError('Legacy generation endpoints are disabled. Use /api/generation-jobs instead.', 'LEGACY_GENERATION_ENDPOINT_DISABLED'));
    return;
  }

  const body = validateGenerateBody(req.body, { promptRequired: false });
  if (body.ok === false) {
    res.status(400).json(apiError(body.error, 'INVALID_GENERATE_REQUEST'));
    return;
  }

  try {
    res.json(await generateWithFallbackResponse({ ...body.value, mode: 'floorplan' }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate/style-render', async (req: Request, res: Response, next: NextFunction) => {
  if (!isLegacyGenerationEndpointEnabled()) {
    res.status(404).json(apiError('Legacy generation endpoints are disabled. Use /api/generation-jobs instead.', 'LEGACY_GENERATION_ENDPOINT_DISABLED'));
    return;
  }

  const body = validateGenerateBody(req.body);
  if (body.ok === false) {
    res.status(400).json(apiError(body.error, 'INVALID_GENERATE_REQUEST'));
    return;
  }

  try {
    res.json(await generateWithFallbackResponse({ ...body.value, mode: 'style-render' }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate/inpaint', async (req: Request, res: Response, next: NextFunction) => {
  if (!isLegacyGenerationEndpointEnabled()) {
    res.status(404).json(apiError('Legacy generation endpoints are disabled. Use /api/generation-jobs instead.', 'LEGACY_GENERATION_ENDPOINT_DISABLED'));
    return;
  }

  const body = validateGenerateBody(req.body, { promptRequired: true });
  if (body.ok === false) {
    res.status(400).json(apiError(body.error, 'INVALID_GENERATE_REQUEST'));
    return;
  }

  try {
    res.json(await generateWithFallbackResponse({ ...body.value, mode: 'inpaint' }));
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

app.use(createErrorHandler(jsonLimit));

export async function startServer(): Promise<void> {
  validateAuthEnvironment();
  await ensureAppDatabase();
  await fileStorageProvider.ensureReady();
  await restorePendingGenerationJobs();

  app.listen(port, host, () => {
    console.log(`ArchAI Expression Engine listening on http://${host}:${port} using ${getGenerationProviderName()} provider`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  await startServer();
}

export function validateAuthEnvironment(): void {
  const authMode = process.env.AUTH_MODE || 'dev';
  if (process.env.NODE_ENV === 'production' && authMode === 'dev') {
    throw new Error('AUTH_MODE=dev is not allowed when NODE_ENV=production.');
  }

  if (authMode === 'supabase') {
    const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
      .filter(name => !process.env[name]);
    if (missing.length > 0) {
      throw new Error(`AUTH_MODE=supabase requires ${missing.join(', ')}.`);
    }
  }
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

function validateAdminUserCreateBody(
  body: unknown,
): { ok: true; value: { name: string; email: string; password: string; role: UserProfile['role']; initialCredits: number } } | { ok: false; error: ApiError } {
  if (!isRecord(body)) {
    return { ok: false, error: { message: 'Request body must be a JSON object.', code: 'INVALID_REQUEST_BODY' } };
  }

  if (!isNonEmptyString(body.name)) {
    return { ok: false, error: { message: 'name is required.', code: 'ADMIN_USER_NAME_REQUIRED' } };
  }

  if (!isEmailString(body.email)) {
    return { ok: false, error: { message: 'email is invalid.', code: 'ADMIN_USER_EMAIL_INVALID' } };
  }

  if (!isNonEmptyString(body.password) || body.password.trim().length < 8) {
    return { ok: false, error: { message: 'password must be at least 8 characters.', code: 'ADMIN_USER_PASSWORD_INVALID' } };
  }

  const role = body.role === 'admin' ? 'admin' : 'member';
  const initialCredits = readNonNegativeInteger(body.initialCredits, Number(process.env.DEFAULT_INITIAL_CREDITS || 100));

  return {
    ok: true,
    value: {
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      password: body.password,
      role,
      initialCredits,
    },
  };
}

function validateAdminUserUpdateBody(
  body: unknown,
): { ok: true; value: Parameters<typeof updateUserProfile>[1] } | { ok: false; error: ApiError } {
  if (!isRecord(body)) {
    return { ok: false, error: { message: 'Request body must be a JSON object.', code: 'INVALID_REQUEST_BODY' } };
  }

  const value: Parameters<typeof updateUserProfile>[1] = {};
  if (body.name !== undefined) {
    if (!isNonEmptyString(body.name)) {
      return { ok: false, error: { message: 'name must be a non-empty string.', code: 'ADMIN_USER_NAME_INVALID' } };
    }
    value.name = body.name.trim();
  }
  if (body.email !== undefined) {
    if (!isEmailString(body.email)) {
      return { ok: false, error: { message: 'email is invalid.', code: 'ADMIN_USER_EMAIL_INVALID' } };
    }
    value.email = body.email.trim().toLowerCase();
  }
  if (body.role !== undefined) {
    if (body.role !== 'admin' && body.role !== 'member') {
      return { ok: false, error: { message: 'role must be admin or member.', code: 'ADMIN_USER_ROLE_INVALID' } };
    }
    value.role = body.role;
  }
  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'disabled') {
      return { ok: false, error: { message: 'status must be active or disabled.', code: 'ADMIN_USER_STATUS_INVALID' } };
    }
    value.status = body.status;
  }

  if (Object.keys(value).length === 0) {
    return { ok: false, error: { message: 'At least one user field is required.', code: 'ADMIN_USER_UPDATE_EMPTY' } };
  }

  return { ok: true, value };
}

function validateAdminPasswordResetBody(
  body: unknown,
): { ok: true; value: { password: string } } | { ok: false; error: ApiError } {
  if (!isRecord(body)) {
    return { ok: false, error: { message: 'Request body must be a JSON object.', code: 'INVALID_REQUEST_BODY' } };
  }
  if (!isNonEmptyString(body.password) || body.password.trim().length < 8) {
    return { ok: false, error: { message: 'password must be at least 8 characters.', code: 'ADMIN_USER_PASSWORD_INVALID' } };
  }
  return { ok: true, value: { password: body.password } };
}

function validateAdminUserCreditBody(
  body: unknown,
): { ok: true; value: { amount: number; reason: string } } | { ok: false; error: ApiError } {
  if (!isRecord(body)) {
    return { ok: false, error: { message: 'Request body must be a JSON object.', code: 'INVALID_REQUEST_BODY' } };
  }
  if (typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount <= 0) {
    return { ok: false, error: { message: 'amount must be a positive integer.', code: 'ADMIN_CREDIT_AMOUNT_INVALID' } };
  }
  return {
    ok: true,
    value: {
      amount: body.amount,
      reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Admin user credit grant',
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

const variantStyleKeys = new Set([
  'modern-minimal',
  'wabi-sabi',
  'cream-style',
  'light-luxury',
  'industrial',
  'commercial-showroom',
  'hotel-lobby',
  'office-space',
  'natural-wood',
  'premium-gray',
  'custom',
]);
const defaultVariantStylesByCount: Record<2 | 4, string[]> = {
  2: ['modern-minimal', 'natural-wood'],
  4: ['modern-minimal', 'cream-style', 'light-luxury', 'natural-wood'],
};

const materialReplaceObjectTypes = new Set(['floor', 'wall', 'ceiling', 'cabinet', 'sofa', 'table-chair', 'lighting', 'plant', 'door-window', 'feature-wall', 'other']);
const materialReplaceMaterials = new Set(['light-wood', 'dark-wood', 'walnut', 'microcement', 'rock-slab', 'marble', 'terrazzo', 'tile', 'leather', 'fabric', 'metal', 'glass', 'art-paint', 'linear-light', 'warm-light-strip', 'plant', 'custom']);

function normalizeDesignVariantConfig(
  mode: GenerationRecord['mode'],
  config: Record<string, unknown>,
): { ok: true } | { ok: false; error: ApiError } {
  if (mode !== 'design-variants') {
    config.batchCount = 1;
    delete config.variantStrategy;
    delete config.variantStyles;
    delete config.customStyleLabel;
    return { ok: true };
  }

  const batchCount = config.batchCount === undefined ? 4 : config.batchCount;
  if (batchCount !== 2 && batchCount !== 4) {
    return {
      ok: false,
      error: {
        message: '方案数量只能为 2 或 4',
        code: 'GENERATION_JOB_BATCH_COUNT_INVALID',
      },
    };
  }

  const variantStrategy = config.variantStrategy === undefined ? 'style-matrix' : config.variantStrategy;
  if (variantStrategy !== 'style-matrix' && variantStrategy !== 'same-style') {
    return {
      ok: false,
      error: {
        message: 'variantStrategy must be style-matrix or same-style.',
        code: 'GENERATION_JOB_VARIANT_STRATEGY_INVALID',
      },
    };
  }

  const requestedStyles = Array.isArray(config.variantStyles)
    ? config.variantStyles.filter((item): item is string => typeof item === 'string' && variantStyleKeys.has(item))
    : [];
  const defaults = defaultVariantStylesByCount[batchCount];
  const styles = [...requestedStyles];
  for (const style of defaults) {
    if (styles.length >= batchCount) break;
    if (!styles.includes(style)) styles.push(style);
  }

  config.batchCount = batchCount;
  config.variantStrategy = variantStrategy;
  config.variantStyles = styles.slice(0, batchCount);
  config.preserveStructure = config.preserveStructure !== false;
  config.preserveCamera = config.preserveCamera !== false;
  config.strength = config.strength === 'subtle' || config.strength === 'strong' ? config.strength : 'balanced';
  if (typeof config.customPrompt !== 'string' || config.customPrompt.trim().length === 0) delete config.customPrompt;
  else config.customPrompt = config.customPrompt.trim();
  if (typeof config.customStyleLabel !== 'string' || config.customStyleLabel.trim().length === 0) delete config.customStyleLabel;
  else config.customStyleLabel = config.customStyleLabel.trim();
  return { ok: true };
}

function normalizeMaterialReplaceConfig(
  mode: GenerationRecord['mode'],
  config: Record<string, unknown>,
): { ok: true } | { ok: false; error: ApiError } {
  if (mode !== 'material-replace') {
    delete config.targetObjectType;
    delete config.targetMaterial;
    delete config.customMaterialPrompt;
    delete config.materialReferenceAssetIds;
    delete config.preserveLighting;
    return { ok: true };
  }

  config.batchCount = 1;
  config.editTarget = 'material';
  config.editMode = config.editMode === 'mask' ? 'mask' : 'smart-type';
  config.preserveLighting = config.preserveLighting !== false;
  config.preserveGeometry = config.preserveGeometry !== false;
  config.preserveStructure = config.preserveStructure !== false;
  config.strength = config.strength === 'subtle' || config.strength === 'strong' ? config.strength : 'balanced';

  if (config.targetObjectType === undefined || config.targetObjectType === null || config.targetObjectType === '') {
    delete config.targetObjectType;
  } else if (typeof config.targetObjectType !== 'string' || !materialReplaceObjectTypes.has(config.targetObjectType)) {
    return { ok: false, error: { message: 'targetObjectType is invalid.', code: 'GENERATION_JOB_MATERIAL_TARGET_OBJECT_INVALID' } };
  }

  if (config.targetMaterial !== undefined && config.targetMaterial !== null && config.targetMaterial !== '') {
    if (typeof config.targetMaterial !== 'string' || !materialReplaceMaterials.has(config.targetMaterial)) {
      return { ok: false, error: { message: 'targetMaterial is invalid.', code: 'GENERATION_JOB_MATERIAL_TARGET_INVALID' } };
    }
  } else {
    delete config.targetMaterial;
  }

  if (typeof config.customMaterialPrompt === 'string' && config.customMaterialPrompt.trim().length > 0) {
    config.customMaterialPrompt = config.customMaterialPrompt.trim();
  } else {
    delete config.customMaterialPrompt;
  }

  const materialReferenceAssetIds = readStringArray(config.materialReferenceAssetIds);
  if (config.editMode === 'smart-type' && !config.targetObjectType) {
    return {
      ok: false,
      error: {
        message: '请选择要替换的区域类型',
        code: 'GENERATION_JOB_MATERIAL_TARGET_OBJECT_REQUIRED',
      },
    };
  }

  if (!config.targetMaterial && materialReferenceAssetIds.length === 0 && !config.customMaterialPrompt) {
    return {
      ok: false,
      error: {
        message: '请选择目标材质、上传贴图，或输入替换描述',
        code: 'GENERATION_JOB_MATERIAL_TARGET_REQUIRED',
      },
    };
  }

  if (config.materialReferenceAssetIds !== undefined && !isStringArrayWithLimit(config.materialReferenceAssetIds, 3)) {
    return { ok: false, error: { message: 'materialReferenceAssetIds must contain at most 3 asset ids.', code: 'GENERATION_JOB_MATERIAL_REFERENCES_INVALID' } };
  }

  return { ok: true };
}

function resolveChargedOutputCount(mode: GenerationRecord['mode'], config: Record<string, unknown>): number {
  return mode === 'design-variants' && (config.batchCount === 2 || config.batchCount === 4) ? config.batchCount : 1;
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
    return {
      ok: false,
      error: {
        message: body.mode === 'design-variants'
          ? '请先上传或选择参考图'
          : 'inputAssetIds must contain at least one asset id.',
        code: 'GENERATION_JOB_INPUTS_INVALID',
      },
    };
  }

  const config: Record<string, unknown> = { ...body.config };
  if (config.sourceImageAssetId === undefined && isNonEmptyString(body.sourceImageAssetId)) {
    config.sourceImageAssetId = body.sourceImageAssetId.trim();
  }
  if (config.maskAssetId === undefined && isNonEmptyString(body.maskAssetId)) {
    config.maskAssetId = body.maskAssetId.trim();
  }
  if (config.maskMode === undefined && isMaskMode(body.maskMode)) {
    config.maskMode = body.maskMode;
  }
  if (config.maskMode === undefined && isNonEmptyString(config.maskAssetId)) {
    config.maskMode = 'asset-mask';
  }
  if (config.materialReferenceAssetIds === undefined && Array.isArray(body.materialReferenceAssetIds)) {
    config.materialReferenceAssetIds = body.materialReferenceAssetIds;
  }
  if (body.mode === 'material-replace') {
    const sourceImageAssetId = typeof config.sourceImageAssetId === 'string' ? config.sourceImageAssetId.trim() : '';
    if (!sourceImageAssetId || !body.inputAssetIds.includes(sourceImageAssetId)) {
      return { ok: false, error: { message: '请先上传或选择一张图片。', code: 'GENERATION_JOB_SOURCE_IMAGE_REQUIRED' } };
    }
    config.sourceImageAssetId = sourceImageAssetId;
  }
  const variantConfig = normalizeDesignVariantConfig(body.mode, config);
  if (variantConfig.ok === false) {
    return { ok: false, error: variantConfig.error };
  }
  const materialReplaceConfig = normalizeMaterialReplaceConfig(body.mode, config);
  if (materialReplaceConfig.ok === false) {
    return { ok: false, error: materialReplaceConfig.error };
  }
  if (body.mode === 'model-render') {
    if (!isNonEmptyString(config.sourceImageAssetId) && !isNonEmptyString(config.snapshotAssetId)) {
      return { ok: false, error: { message: 'sourceImageAssetId is required for model-render jobs.', code: 'GENERATION_JOB_SNAPSHOT_ASSET_REQUIRED' } };
    }
    if (isNonEmptyString(config.sourceImageAssetId)) config.sourceImageAssetId = config.sourceImageAssetId.trim();
    if (isNonEmptyString(config.snapshotAssetId)) config.snapshotAssetId = config.snapshotAssetId.trim();
    if (isNonEmptyString(config.sourceModelAssetId)) config.sourceModelAssetId = config.sourceModelAssetId.trim();
  }
  if (config.editTarget !== undefined && config.editTarget !== 'general' && config.editTarget !== 'material' && config.editTarget !== 'furniture') {
    return { ok: false, error: { message: 'editTarget must be general, material, or furniture.', code: 'GENERATION_JOB_EDIT_TARGET_INVALID' } };
  }
  for (const key of ['sourceImageWidth', 'sourceImageHeight', 'targetWidth', 'targetHeight']) {
    if (config[key] !== undefined && !isReasonableImageDimension(config[key])) {
      return { ok: false, error: { message: `${key} must be an integer between 64 and 8192.`, code: 'GENERATION_JOB_TARGET_SIZE_INVALID' } };
    }
  }
  if (config.targetAspectRatio !== undefined && typeof config.targetAspectRatio !== 'string') {
    return { ok: false, error: { message: 'targetAspectRatio must be a string.', code: 'GENERATION_JOB_ASPECT_RATIO_INVALID' } };
  }
  if (config.furnitureReferenceAssetIds !== undefined && !isStringArrayWithLimit(config.furnitureReferenceAssetIds, 3)) {
    return { ok: false, error: { message: 'furnitureReferenceAssetIds must contain at most 3 asset ids.', code: 'GENERATION_JOB_FURNITURE_REFERENCES_INVALID' } };
  }
  if (config.materialTextureAssetIds !== undefined && !isStringArrayWithLimit(config.materialTextureAssetIds, 3)) {
    return { ok: false, error: { message: 'materialTextureAssetIds must contain at most 3 asset ids.', code: 'GENERATION_JOB_MATERIAL_REFERENCES_INVALID' } };
  }
  if (config.materialReferenceAssetIds !== undefined && !isStringArrayWithLimit(config.materialReferenceAssetIds, 3)) {
    return { ok: false, error: { message: 'materialReferenceAssetIds must contain at most 3 asset ids.', code: 'GENERATION_JOB_MATERIAL_REFERENCES_INVALID' } };
  }
  if (body.mode === 'material-replace') {
    const sourceImageAssetId = typeof config.sourceImageAssetId === 'string' ? config.sourceImageAssetId.trim() : '';
    if (!sourceImageAssetId || !body.inputAssetIds.includes(sourceImageAssetId)) {
      return { ok: false, error: { message: '请先上传或选择一张图片。', code: 'GENERATION_JOB_SOURCE_IMAGE_REQUIRED' } };
    }
    config.sourceImageAssetId = sourceImageAssetId;
  }
  if (body.mode === 'inpaint' || body.mode === 'material-replace') {
    if (config.maskMode === undefined || config.maskMode === null || config.maskMode === '') {
      if (body.mode === 'material-replace' && config.editMode === 'mask') {
        return { ok: false, error: { message: '精细涂抹模式下请先选择需要替换的区域', code: 'GENERATION_JOB_MASK_REQUIRED' } };
      }
      delete config.maskMode;
      delete config.maskAssetId;
    } else {
      if (!isMaskMode(config.maskMode)) {
        return {
          ok: false,
          error: {
            message: 'maskMode must be asset-mask or full-image when provided for masked edit jobs.',
            code: 'GENERATION_JOB_MASK_MODE_INVALID',
          },
        };
      }

      if (config.maskMode === 'asset-mask') {
        if (!isNonEmptyString(config.maskAssetId)) {
          return {
            ok: false,
            error: {
              message: 'maskAssetId is required when maskMode is asset-mask.',
              code: 'GENERATION_JOB_MASK_ASSET_REQUIRED',
            },
          };
        }

        config.maskAssetId = config.maskAssetId.trim();
      } else {
        delete config.maskAssetId;
      }
    }
  } else {
    delete config.maskMode;
    delete config.maskAssetId;
  }

  return {
    ok: true,
    value: {
      projectId: body.projectId.trim(),
      mode: body.mode,
      prompt: body.prompt,
      config,
      inputAssetIds: body.inputAssetIds.map(item => item.trim()),
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
  return value === 'floorplan' || value === 'style-render' || value === 'inpaint' || value === 'model-render' || value === 'design-variants' || value === 'material-replace';
}

function isGenerationStatus(value: unknown): value is GenerationRecord['status'] {
  return value === 'succeeded' || value === 'failed';
}

function isMaskMode(value: unknown): value is MaskMode {
  return value === 'asset-mask' || value === 'full-image';
}

function isReasonableImageDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 64 && value <= 8192;
}

function isStringArrayWithLimit(value: unknown, limit: number): value is string[] {
  return Array.isArray(value) && value.length <= limit && value.every(item => typeof item === 'string' && item.trim().length > 0);
}

async function validateGenerationJobAssets(
  inputAssetIds: string[],
  mode: GenerationRecord['mode'],
  config: Record<string, unknown>,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: ApiError }> {
  for (const assetId of inputAssetIds) {
    const asset = await getImageAsset(assetId, userId);
    if (!asset) {
      return {
        ok: false,
        error: {
          message: 'Input image asset not found.',
          code: 'GENERATION_JOB_INPUT_ASSET_NOT_FOUND',
        },
      };
    }
  }

  for (const assetId of [
    ...readStringArray(config.materialTextureAssetIds),
    ...readStringArray(config.materialReferenceAssetIds),
    ...readStringArray(config.furnitureReferenceAssetIds),
  ]) {
    const asset = await getImageAsset(assetId, userId);
    if (!asset) {
      return {
        ok: false,
        error: {
          message: 'Reference image asset not found.',
          code: 'GENERATION_JOB_REFERENCE_ASSET_NOT_FOUND',
        },
      };
    }
  }

  const maskAssetId = (mode === 'inpaint' || mode === 'material-replace') && config.maskMode === 'asset-mask' && typeof config.maskAssetId === 'string'
    ? config.maskAssetId.trim()
    : '';
  if (maskAssetId.length > 0) {
    const maskAsset = await getImageAsset(maskAssetId, userId);
    if (!maskAsset) {
      return {
        ok: false,
        error: {
          message: 'Mask image asset not found.',
          code: 'GENERATION_JOB_MASK_ASSET_NOT_FOUND',
        },
      };
    }
  }

  if (mode === 'material-replace') {
    const sourceImageAssetId = typeof config.sourceImageAssetId === 'string' ? config.sourceImageAssetId.trim() : '';
    if (!sourceImageAssetId || !inputAssetIds.includes(sourceImageAssetId)) {
      return {
        ok: false,
        error: {
          message: 'Source image asset is required for material-replace.',
          code: 'GENERATION_JOB_SOURCE_IMAGE_NOT_FOUND',
        },
      };
    }
  }

  if (mode === 'model-render') {
    const sourceImageAssetId = typeof config.sourceImageAssetId === 'string'
      ? config.sourceImageAssetId.trim()
      : typeof config.snapshotAssetId === 'string'
        ? config.snapshotAssetId.trim()
        : '';
    if (!sourceImageAssetId || !inputAssetIds.includes(sourceImageAssetId)) {
      return {
        ok: false,
        error: {
          message: 'Snapshot image asset is required for model-render.',
          code: 'GENERATION_JOB_SNAPSHOT_ASSET_NOT_FOUND',
        },
      };
    }

    const sourceModelAssetId = typeof config.sourceModelAssetId === 'string' ? config.sourceModelAssetId.trim() : '';
    if (sourceModelAssetId) {
      const modelAsset = await getModelAsset(sourceModelAssetId, userId);
      if (!modelAsset) {
        return {
          ok: false,
          error: {
            message: 'Source model asset not found.',
            code: 'GENERATION_JOB_SOURCE_MODEL_NOT_FOUND',
          },
        };
      }
    }
  }

  return { ok: true };
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

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function isEmailString(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim());
}

function readNonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback;
}
