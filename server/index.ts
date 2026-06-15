import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { NextFunction, Request, Response } from 'express';
import { attachAuthUser, getCurrentUser, getRequiredCurrentUser, readAuthMode, requireAuth } from './auth';
import { createStoredFilename, fileStorageProvider, uploadsDir } from './fileStorage';
import {
  cancelGenerationJob,
  adjustCredits,
  AdminDashboard,
  createGenerationRecord,
  createGenerationJob,
  createImageAsset,
  createPromptTemplate,
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
  getPromptTemplate,
  getShareLinkByToken,
  getCreditBalance,
  getCreditTransactionByReference,
  getUserProfileByEmail,
  ImageAsset,
  listGenerationResults,
  listPromptTemplates,
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
  deletePromptTemplate,
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
  enqueueGenerationJob,
  generateWithFallbackResponse,
  getGenerationProviderName,
  isGenerationWorkerDisabled,
  isLegacyGenerationEndpointEnabled,
  refundGenerationJobCredits,
  removeQueuedGenerationJob,
  restorePendingGenerationJobs,
} from './generationService';
import { defaultPlanColorizeStyleId, maxPlanColorizeBatchCount, resolvePlanColorizeStyles } from '../src/constants/planColorizeStyles';
import { resolveFloorplanBatchCount, resolveFloorplanVariantPlans, readFloorplanVariantFocus, readFloorplanVariantType } from '../src/constants/floorplanVariants';
import { getGenerationCreditCost, getGenerationOutputCount } from '../src/utils/generationCredits';
import { createAssetsRouter } from './routes/assets';
import { createSupabaseAuthUser, resetSupabaseAuthUserPassword, updateSupabaseAuthUserMetadata } from './supabaseAdmin';
import { getModelConversionConfig } from './modelConversionService';
import { getModelOptimizationConfig } from './modelOptimizationService';
import { polishPromptText, PromptPolishRequest, PromptPolishResult } from './promptPolishService';

export const app = express();
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';
const version = '0.1.0';
const maxImageMb = Number(process.env.MAX_IMAGE_MB || 10);
const maxModelMb = Number(process.env.MAX_MODEL_MB || 500);
const jsonLimit = `${Math.max(maxImageMb * 3, 15)}mb`;
const generationJobRateLimitPerMinute = Number(process.env.GENERATION_JOB_RATE_LIMIT_PER_MINUTE || 10);
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(serverDir, '..', 'dist');
const distIndexPath = path.join(distDir, 'index.html');
const autoProjectCreateLocks = new Map<string, Promise<Project>>();

const modelConversionConfig = getModelConversionConfig();
const modelOptimizationConfig = getModelOptimizationConfig();
console.info('Model processing configuration', {
  MODEL_CONVERSION_ENABLED: process.env.MODEL_CONVERSION_ENABLED,
  MODEL_CONVERSION_ENABLED_RESOLVED: modelConversionConfig.enabled,
  MODEL_OPTIMIZATION_ENABLED: process.env.MODEL_OPTIMIZATION_ENABLED ?? process.env.ENABLE_MODEL_OPTIMIZATION,
  MODEL_OPTIMIZATION_ENABLED_RESOLVED: modelOptimizationConfig.enabled,
  BLENDER_BIN: modelConversionConfig.blenderBin,
  MODEL_CONVERSION_TIMEOUT_MS: modelConversionConfig.timeoutMs,
});

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
  step?: GenerationRecord['step'];
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

app.post('/api/prompts/polish', requireAuth, async (
  req: Request,
  res: Response<ApiResponse<PromptPolishResult>>,
  next: NextFunction,
) => {
  const body = validatePromptPolishBody(req.body);
  if (body.ok === false) {
    res.status(400).json(apiError(body.error.message, body.error.code));
    return;
  }

  try {
    res.json(apiOk(await polishPromptText(body.value)));
  } catch (error) {
    next(error);
  }
});

app.get('/api/prompt-templates', requireAuth, async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json(apiOk({ templates: await listPromptTemplates(readPromptTemplateFilters(req.query)) }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/prompt-templates', requireAuth, async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const body = validatePromptTemplateCreateBody(req.body);
  if (body.ok === false) {
    res.status(400).json(apiError(body.error.message, body.error.code));
    return;
  }

  try {
    const user = getRequiredCurrentUser(req);
    let outputUrl = body.value.outputUrl;
    if (!outputUrl && body.value.outputAssetId) {
      const outputAsset = await getImageAsset(body.value.outputAssetId);
      if (!outputAsset) {
        res.status(400).json(apiError('未找到本次生成结果图，不能保存为模板。', 'PROMPT_TEMPLATE_OUTPUT_ASSET_NOT_FOUND'));
        return;
      }
      outputUrl = outputAsset.url;
    }
    const template = await createPromptTemplate({ ...body.value, outputUrl, createdBy: user.id });
    res.status(201).json(apiOk({ template }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/prompt-templates/:id', requireAuth, async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const template = await getPromptTemplate(req.params.id);
    if (!template) {
      res.status(404).json(apiError('Prompt template not found.', 'PROMPT_TEMPLATE_NOT_FOUND'));
      return;
    }
    res.json(apiOk({ template }));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/prompt-templates/:id', requireAuth, requireAdmin, async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const template = await deletePromptTemplate(req.params.id);
    if (!template) {
      res.status(404).json(apiError('Prompt template not found.', 'PROMPT_TEMPLATE_NOT_FOUND'));
      return;
    }
    res.json(apiOk({ template }));
  } catch (error) {
    next(error);
  }
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
      type: 'admin_grant',
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
      type: 'admin_grant',
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
      type: 'admin_grant',
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
  logGenerationJobCreateStage(req, 'validate body');
  const body = validateGenerationJobCreateBody(req.body);
  if (body.ok === false) {
    logGenerationJobCreateStage(req, 'validate body failed', { errorCode: body.error.code });
    res.status(400).json(apiError(body.error.message, body.error.code));
    return;
  }

  try {
    const user = getRequiredCurrentUser(req);
    logGenerationJobModeStepDebug('route accepted body', { mode: body.value.mode, step: body.value.step });
    logGenerationJobCreateStage(req, 'get project', { userId: user.id, projectId: body.value.projectId, mode: body.value.mode, step: body.value.step });
    const project = await getProject(body.value.projectId, user.id);
    if (!project) {
      logGenerationJobCreateStage(req, 'get project failed', { userId: user.id, projectId: body.value.projectId });
      res.status(404).json(apiError('Project not found.', 'PROJECT_NOT_FOUND'));
      return;
    }

    logGenerationJobCreateStage(req, 'validate assets', {
      userId: user.id,
      projectId: body.value.projectId,
      mode: body.value.mode,
      step: body.value.step,
      inputAssetCount: body.value.inputAssetIds.length,
    });
    const assetValidation = await validateGenerationJobAssets(body.value.inputAssetIds, body.value.mode, body.value.step, body.value.config, user.id);
    if (assetValidation.ok === false) {
      logGenerationJobCreateStage(req, 'validate assets failed', { errorCode: assetValidation.error.code });
      const status = assetValidation.error.code === 'GENERATION_JOB_SOURCE_MODEL_NOT_FOUND' ? 403 : 404;
      res.status(status).json(apiError(assetValidation.error.message, assetValidation.error.code));
      return;
    }

    const creditsCost = getGenerationCreditCost(body.value.mode, body.value.config);
    logGenerationJobCreateStage(req, 'create generation job', {
      userId: user.id,
      projectId: body.value.projectId,
      mode: body.value.mode,
      step: body.value.step,
      creditsCost,
    });
    const job = await createGenerationJob({ ...body.value, userId: user.id, provider: getGenerationProviderName(), creditCost: creditsCost });
    if (!job) {
      logGenerationJobCreateStage(req, 'create generation job failed', { userId: user.id, projectId: body.value.projectId });
      res.status(404).json(apiError('Project not found.', 'PROJECT_NOT_FOUND'));
      return;
    }

    logGenerationJobCreateStage(req, 'debit credits', { userId: user.id, jobId: job.id, creditsCost });
    let debit: Awaited<ReturnType<typeof adjustCredits>>;
    try {
      debit = await adjustCredits({
        userId: user.id,
        type: 'generate_charge',
        amount: -creditsCost,
        reason: `Generation job ${job.mode} x${getGenerationOutputCount(body.value.mode, body.value.config)}`,
        referenceType: 'generation_job',
        referenceId: job.id,
      });
    } catch (error) {
      logGenerationJobCreateStage(req, 'debit credits failed', {
        userId: user.id,
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
      await markGenerationJobCancelledAfterDebitFailure(job.id, error);
      throw error;
    }
    if (!debit) {
      logGenerationJobCreateStage(req, 'debit credits insufficient', { userId: user.id, jobId: job.id, creditsCost });
      await updateGenerationJob(job.id, {
        status: 'cancelled',
        progress: 0,
        errorMessage: 'Credits are insufficient.',
        failureReason: 'Credits are insufficient.',
        finishedAt: new Date().toISOString(),
      });
      res.status(402).json(apiError('Credits are insufficient.', 'CREDITS_INSUFFICIENT'));
      return;
    }

    logGenerationJobCreateStage(req, 'enqueue worker', {
      userId: user.id,
      jobId: job.id,
      workerDisabled: isGenerationWorkerDisabled(),
    });
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

    if (isRefundableGenerationJobStatus(job.status) && !job.creditRefunded) {
      await refundGenerationJobCredits(job.id);
    }
    const latestJob = await getGenerationJob(req.params.id, getRequiredCurrentUser(req).id);
    res.json(apiOk({ job: { ...(latestJob || job), results: await listGenerationResults(job.id, getRequiredCurrentUser(req).id) } }));
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
    const latestJob = await getGenerationJob(job.id, getRequiredCurrentUser(req).id);
    res.json(apiOk({ job: latestJob || job }));
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

app.post('/api/generate/floorplan', requireLegacyGenerationEndpoint, requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  const body = validateGenerateBody(req.body, { promptRequired: false });
  if (body.ok === false) {
    res.status(400).json(apiError(body.error, 'INVALID_GENERATE_REQUEST'));
    return;
  }

  try {
    res.json(await generateWithFallbackResponse({ ...body.value, mode: 'floorplan' }, getRequiredCurrentUser(req).id));
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate/style-render', requireLegacyGenerationEndpoint, requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  const body = validateGenerateBody(req.body);
  if (body.ok === false) {
    res.status(400).json(apiError(body.error, 'INVALID_GENERATE_REQUEST'));
    return;
  }

  try {
    res.json(await generateWithFallbackResponse({ ...body.value, mode: 'style-render' }, getRequiredCurrentUser(req).id));
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate/inpaint', requireLegacyGenerationEndpoint, requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  const body = validateGenerateBody(req.body, { promptRequired: true });
  if (body.ok === false) {
    res.status(400).json(apiError(body.error, 'INVALID_GENERATE_REQUEST'));
    return;
  }

  try {
    res.json(await generateWithFallbackResponse({ ...body.value, mode: 'inpaint' }, getRequiredCurrentUser(req).id));
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

app.post('/api/projects/auto', requireAuth, async (req: Request, res: Response<ApiResponse<{ project: Project }>>, next: NextFunction) => {
  try {
    const project = await createNextAutoProject(getRequiredCurrentUser(req).id);
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
  const authMode = readAuthMode();
  if (!authMode) {
    throw new Error(`Unsupported AUTH_MODE=${process.env.AUTH_MODE}. AUTH_MODE must be dev or supabase.`);
  }

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

function requireLegacyGenerationEndpoint(_req: Request, res: Response, next: NextFunction): void {
  if (!isLegacyGenerationEndpointEnabled()) {
    res.status(404).json(apiError('Legacy generation endpoints are disabled. Use /api/generation-jobs instead.', 'LEGACY_GENERATION_ENDPOINT_DISABLED'));
    return;
  }

  next();
}

function validatePromptPolishBody(
  body: unknown,
): { ok: true; value: PromptPolishRequest } | { ok: false; error: ApiError } {
  if (!isRecord(body)) {
    return { ok: false, error: { message: 'Request body must be a JSON object.', code: 'INVALID_REQUEST_BODY' } };
  }

  if (!isNonEmptyString(body.rawText)) {
    return { ok: false, error: { message: '请先输入或识别一段语音文本。', code: 'PROMPT_POLISH_RAW_TEXT_REQUIRED' } };
  }

  const rawText = body.rawText.trim();
  if (rawText.length > 2000) {
    return { ok: false, error: { message: '语音文本过长，请控制在 2000 字以内。', code: 'PROMPT_POLISH_RAW_TEXT_TOO_LONG' } };
  }

  const generationStep = typeof body.generationStep === 'string' || typeof body.generationStep === 'number'
    ? String(body.generationStep).trim()
    : '';
  if (!generationStep) {
    return { ok: false, error: { message: 'generationStep is required.', code: 'PROMPT_POLISH_STEP_REQUIRED' } };
  }

  if (body.context !== undefined && !isRecord(body.context)) {
    return { ok: false, error: { message: 'context must be an object.', code: 'PROMPT_POLISH_CONTEXT_INVALID' } };
  }

  return {
    ok: true,
    value: {
      rawText,
      generationStep,
      context: isRecord(body.context) ? body.context : undefined,
    },
  };
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

async function createNextAutoProject(userId: string): Promise<Project> {
  const previous = autoProjectCreateLocks.get(userId);
  const next = (previous ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => createNextAutoProjectUnlocked(userId));
  autoProjectCreateLocks.set(userId, next);

  try {
    return await next;
  } finally {
    if (autoProjectCreateLocks.get(userId) === next) {
      autoProjectCreateLocks.delete(userId);
    }
  }
}

async function createNextAutoProjectUnlocked(userId: string): Promise<Project> {
  let nextNumber = readNextAutoProjectNumber(await listProjects(userId));

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const name = formatAutoProjectName(nextNumber);
    const existing = await listProjects(userId);
    if (existing.some(project => project.name === name)) {
      nextNumber += 1;
      continue;
    }

    try {
      return await createProject({
        userId,
        name,
        description: '',
        status: 'active',
        coverImageUrl: null,
      });
    } catch (error) {
      const refreshed = await listProjects(userId);
      if (refreshed.some(project => project.name === name)) {
        nextNumber += 1;
        continue;
      }
      throw error;
    }
  }

  throw new Error('Unable to create an automatic project name.');
}

function readNextAutoProjectNumber(projects: Project[]): number {
  const maxNumber = projects.reduce((max, project) => {
    const match = /^gt-(\d+)$/u.exec(project.name.trim());
    if (!match) return max;
    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  return maxNumber + 1;
}

function formatAutoProjectName(value: number): string {
  return `gt-${String(value).padStart(3, '0')}`;
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
  const initialCreditsValue = body.initialCredits === undefined
    ? Number(process.env.DEFAULT_INITIAL_CREDITS || 100)
    : body.initialCredits;
  if (typeof initialCreditsValue !== 'number' || !Number.isInteger(initialCreditsValue) || initialCreditsValue < 0) {
    return { ok: false, error: { message: 'initialCredits must be a non-negative integer.', code: 'ADMIN_USER_INITIAL_CREDITS_INVALID' } };
  }

  return {
    ok: true,
    value: {
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      password: body.password,
      role,
      initialCredits: initialCreditsValue,
    },
  };
}

function validatePromptTemplateCreateBody(
  body: unknown,
): { ok: true; value: Omit<Parameters<typeof createPromptTemplate>[0], 'createdBy'> } | { ok: false; error: ApiError } {
  if (!isRecord(body)) {
    return { ok: false, error: { message: 'Request body must be a JSON object.', code: 'INVALID_REQUEST_BODY' } };
  }

  if (!isNonEmptyString(body.name)) {
    return { ok: false, error: { message: '模板名称不能为空。', code: 'PROMPT_TEMPLATE_NAME_REQUIRED' } };
  }
  if (!isGenerationStep(body.generationStep)) {
    return { ok: false, error: { message: 'generationStep is invalid.', code: 'PROMPT_TEMPLATE_STEP_INVALID' } };
  }
  const feature = isPromptTemplateFeature(body.feature) ? body.feature : inferPromptTemplateFeature(body.generationStep);
  if (body.feature !== undefined && !isPromptTemplateFeature(body.feature)) {
    return { ok: false, error: { message: 'feature is invalid.', code: 'PROMPT_TEMPLATE_FEATURE_INVALID' } };
  }
  if (!isRecord(body.config)) {
    return { ok: false, error: { message: 'config must be an object.', code: 'PROMPT_TEMPLATE_CONFIG_INVALID' } };
  }
  const outputAssetId = isNonEmptyString(body.outputAssetId) ? body.outputAssetId.trim() : null;
  const outputUrl = typeof body.outputUrl === 'string' ? body.outputUrl.trim() : '';
  if (!outputAssetId && !outputUrl) {
    return { ok: false, error: { message: '缺少本次生成结果图，不能保存为模板。', code: 'PROMPT_TEMPLATE_OUTPUT_REQUIRED' } };
  }

  return {
    ok: true,
    value: {
      name: body.name.trim().slice(0, 120),
      description: typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : '',
      generationStep: body.generationStep,
      feature,
      featureName: isNonEmptyString(body.featureName) ? body.featureName.trim().slice(0, 80) : promptTemplateFeatureName(feature),
      prompt: typeof body.prompt === 'string' ? body.prompt.trim() : '',
      negativePrompt: typeof body.negativePrompt === 'string' ? body.negativePrompt.trim().slice(0, 2000) : undefined,
      config: body.config,
      inputAssetIds: readStringArray(body.inputAssetIds).slice(0, 20),
      referenceAssetIds: readStringArray(body.referenceAssetIds).slice(0, 30),
      materialAssetIds: readStringArray(body.materialAssetIds).slice(0, 20),
      sourceAssetId: isNonEmptyString(body.sourceAssetId) ? body.sourceAssetId.trim() : null,
      placementPreviewAssetId: isNonEmptyString(body.placementPreviewAssetId) ? body.placementPreviewAssetId.trim() : null,
      outputAssetId,
      outputUrl,
      previewAssetId: isNonEmptyString(body.previewAssetId) ? body.previewAssetId.trim() : outputAssetId,
      tags: readStringArray(body.tags).map(tag => tag.trim()).filter(Boolean).slice(0, 12),
      isPublic: true,
      createdFromGenerationRecordId: isNonEmptyString(body.createdFromGenerationRecordId) ? body.createdFromGenerationRecordId.trim() : null,
      createdFromJobId: isNonEmptyString(body.createdFromJobId) ? body.createdFromJobId.trim() : null,
      inputPreviews: readInputPreviews(body.inputPreviews),
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

  if (body.step !== undefined && body.step !== null && body.step !== '' && !isGenerationStep(body.step)) {
    return { ok: false, error: { message: 'Generation step is invalid.', code: 'GENERATION_STEP_INVALID' } };
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
      step: isGenerationStep(body.step) ? body.step : undefined,
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
const MAX_DESIGN_VARIANT_BATCH = Number(process.env.MAX_DESIGN_VARIANT_BATCH || 8);
const defaultVariantStylesByCount: Record<2 | 4 | 8, string[]> = {
  2: ['modern-minimal', 'natural-wood'],
  4: ['modern-minimal', 'cream-style', 'light-luxury', 'natural-wood'],
  8: ['modern-minimal', 'cream-style', 'wabi-sabi', 'light-luxury', 'natural-wood', 'premium-gray', 'industrial', 'hotel-lobby'],
};
const designVariantPackIds = new Set(['interior-common', 'commercial', 'office', 'hotel', 'facade']);

const materialReplaceObjectTypes = new Set(['floor', 'wall', 'ceiling', 'cabinet', 'sofa', 'table-chair', 'lighting', 'plant', 'door-window', 'feature-wall', 'other']);
const materialReplaceMaterials = new Set(['light-wood', 'dark-wood', 'walnut', 'microcement', 'rock-slab', 'marble', 'terrazzo', 'tile', 'leather', 'fabric', 'metal', 'glass', 'art-paint', 'linear-light', 'warm-light-strip', 'plant', 'custom']);

function normalizeDesignVariantConfig(
  mode: GenerationRecord['mode'],
  config: Record<string, unknown>,
): { ok: true } | { ok: false; error: ApiError } {
  if (mode === 'floorplan') {
    return { ok: true };
  }
  if (mode !== 'design-variants') {
    config.batchCount = isObjectInsertRequestConfig(config) ? readObjectInsertCandidateCount(config) : 1;
    delete config.variantStrategy;
    delete config.variantStyles;
    delete config.variantNames;
    delete config.stylePackId;
    delete config.customStyleLabel;
    return { ok: true };
  }

  const batchCount = config.batchCount === undefined ? 4 : config.batchCount;
  if ((batchCount !== 2 && batchCount !== 4 && batchCount !== 8) || batchCount > MAX_DESIGN_VARIANT_BATCH) {
    return {
      ok: false,
      error: {
        message: '方案数量只能为 2、4 或 8',
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
  config.stylePackId = typeof config.stylePackId === 'string' && designVariantPackIds.has(config.stylePackId) ? config.stylePackId : 'interior-common';
  config.variantNames = readStringArray(config.variantNames)
    .slice(0, batchCount)
    .map(item => item.trim())
    .filter(Boolean);
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

const planDrawingTypes = new Set(['residential', 'commercial', 'office', 'hotel', 'landscape', 'site-plan', 'custom']);
const planExpressionTemplates = new Set(['zoning-color', 'colored-plan', 'landscape-plan', 'furniture-enhance', 'annotation-plan', 'circulation-analysis']);

function normalizePlanColorizeConfig(
  mode: GenerationRecord['mode'],
  config: Record<string, unknown>,
): { ok: true } | { ok: false; error: ApiError } {
  if (mode === 'floorplan') {
    return { ok: true };
  }
  if (mode !== 'plan-colorize') {
    delete config.drawingType;
    delete config.template;
    delete config.enableZoningColor;
    delete config.enableRoomLabels;
    delete config.enableFurnitureEnhance;
    delete config.enableCirculationArrows;
    delete config.enableScaleEnhance;
    delete config.enableLandscapeFill;
    delete config.preserveLinework;
    delete config.manualRoomLabels;
    delete config.planColorizeBatchEnabled;
    delete config.planColorizeStyleIds;
    delete config.planColorizeStyleNames;
    delete config.planColorizeStylePromptHints;
    delete config.selectedStyleId;
    delete config.selectedStyleName;
    delete config.selectedStylePromptHint;
    delete config.batchGroupId;
    return { ok: true };
  }

  config.drawingType = typeof config.drawingType === 'string' && planDrawingTypes.has(config.drawingType) ? config.drawingType : 'residential';
  config.template = typeof config.template === 'string' && planExpressionTemplates.has(config.template) ? config.template : 'colored-plan';
  config.enableZoningColor = config.enableZoningColor !== false;
  config.enableRoomLabels = config.enableRoomLabels === true;
  config.enableFurnitureEnhance = config.enableFurnitureEnhance !== false;
  config.enableCirculationArrows = config.enableCirculationArrows === true;
  config.enableScaleEnhance = config.enableScaleEnhance !== false;
  config.enableLandscapeFill = config.enableLandscapeFill === true;
  config.preserveLinework = config.preserveLinework !== false;
  config.manualRoomLabels = readStringArray(config.manualRoomLabels).slice(0, 24);
  const requestedStyleIds = readStringArray(config.planColorizeStyleIds).slice(0, maxPlanColorizeBatchCount);
  const selectedStyleId = typeof config.selectedStyleId === 'string' && config.selectedStyleId.trim().length > 0
    ? config.selectedStyleId.trim()
    : defaultPlanColorizeStyleId;
  const styles = resolvePlanColorizeStyles(requestedStyleIds.length > 0 ? requestedStyleIds : selectedStyleId, selectedStyleId)
    .slice(0, maxPlanColorizeBatchCount);
  const primaryStyle = styles[0];
  config.batchCount = styles.length;
  config.planColorizeBatchEnabled = styles.length > 1 || config.planColorizeBatchEnabled === true;
  config.planColorizeStyleIds = styles.map(style => style.id);
  config.planColorizeStyleNames = styles.map(style => style.name);
  config.planColorizeStylePromptHints = styles.map(style => style.promptHint);
  config.selectedStyleId = primaryStyle.id;
  config.selectedStyleName = primaryStyle.name;
  config.selectedStylePromptHint = primaryStyle.promptHint;
  config.batchGroupId = typeof config.batchGroupId === 'string' && config.batchGroupId.trim().length > 0
    ? config.batchGroupId.trim().slice(0, 120)
    : `plan-colorize-${Date.now()}-${randomBytes(4).toString('hex')}`;
  if (typeof config.customPrompt !== 'string' || config.customPrompt.trim().length === 0) delete config.customPrompt;
  else config.customPrompt = config.customPrompt.trim();
  return { ok: true };
}

function normalizeFloorplanConfig(
  mode: GenerationRecord['mode'],
  config: Record<string, unknown>,
): { ok: true } | { ok: false; error: ApiError } {
  if (mode !== 'floorplan') {
    delete config.floorplanOutputMode;
    delete config.floorplanVariantType;
    delete config.floorplanVariantFocus;
    delete config.floorplanStyleTemplateIds;
    delete config.floorplanStyleTemplateNames;
    delete config.floorplanLayoutVariantIds;
    delete config.floorplanLayoutVariantNames;
    return { ok: true };
  }

  const outputMode = config.floorplanOutputMode === 'multi' ? 'multi' : 'single';
  config.floorplanOutputMode = outputMode;
  if (outputMode !== 'multi') {
    config.batchCount = 1;
    delete config.floorplanVariantType;
    delete config.floorplanVariantFocus;
    delete config.floorplanStyleTemplateIds;
    delete config.floorplanStyleTemplateNames;
    delete config.floorplanLayoutVariantIds;
    delete config.floorplanLayoutVariantNames;
    delete config.variantNames;
    delete config.batchGroupId;
    return { ok: true };
  }

  const variantIndex = typeof config.variantIndex === 'number' && Number.isInteger(config.variantIndex)
    ? config.variantIndex
    : null;
  const isSingleVariantJob = variantIndex !== null && config.batchCount === 1;
  const batchCount = isSingleVariantJob ? 1 : resolveFloorplanBatchCount(config.batchCount);
  config.batchCount = batchCount;
  config.floorplanVariantType = readFloorplanVariantType(config.floorplanVariantType);
  config.floorplanVariantFocus = readFloorplanVariantFocus(config.floorplanVariantFocus);
  const plans = resolveFloorplanVariantPlans(config, batchCount);
  const primaryPlan = plans[0];
  config.floorplanStyleTemplateIds = plans.map(plan => plan.selectedStyleId).filter(isNonEmptyString);
  config.floorplanStyleTemplateNames = plans.map(plan => plan.selectedStyleName).filter(isNonEmptyString);
  config.floorplanLayoutVariantIds = plans.map(plan => plan.layoutVariantId).filter(isNonEmptyString);
  config.floorplanLayoutVariantNames = plans.map(plan => plan.layoutVariantName).filter(isNonEmptyString);
  config.variantNames = plans.map(plan => plan.variantName);
  if (isSingleVariantJob) {
    config.variantIndex = variantIndex;
    config.schemeName = typeof config.schemeName === 'string' && config.schemeName.trim().length > 0
      ? config.schemeName.trim().slice(0, 120)
      : primaryPlan?.variantName;
    config.selectedStyleId = typeof config.selectedStyleId === 'string' && config.selectedStyleId.trim().length > 0 ? config.selectedStyleId.trim() : primaryPlan?.selectedStyleId;
    config.selectedStyleName = typeof config.selectedStyleName === 'string' && config.selectedStyleName.trim().length > 0 ? config.selectedStyleName.trim() : primaryPlan?.selectedStyleName;
    config.layoutVariantId = typeof config.layoutVariantId === 'string' && config.layoutVariantId.trim().length > 0 ? config.layoutVariantId.trim() : primaryPlan?.layoutVariantId;
    config.layoutVariantName = typeof config.layoutVariantName === 'string' && config.layoutVariantName.trim().length > 0 ? config.layoutVariantName.trim() : primaryPlan?.layoutVariantName;
    config.variantFocus = config.floorplanVariantType === 'mixed'
      ? 'mixed'
      : config.floorplanVariantFocus === 'furniture_layout'
        ? 'layout'
        : 'material';
  }
  config.batchGroupId = typeof config.batchGroupId === 'string' && config.batchGroupId.trim().length > 0
    ? config.batchGroupId.trim().slice(0, 120)
    : `floorplan-multi-${Date.now()}-${randomBytes(4).toString('hex')}`;
  config.preserveStructure = true;
  if (typeof config.customPrompt !== 'string' || config.customPrompt.trim().length === 0) delete config.customPrompt;
  else config.customPrompt = config.customPrompt.trim();
  return { ok: true };
}

function normalizeObjectPlacement(value: unknown): { x: number; y: number; width: number; height: number; rotation: number } | null {
  if (!isRecord(value)) return null;
  const x = readFiniteNumber(value.x);
  const y = readFiniteNumber(value.y);
  const width = readFiniteNumber(value.width);
  const height = readFiniteNumber(value.height);
  const rotation = readFiniteNumber(value.rotation);
  if (x === null || y === null || width === null || height === null || rotation === null) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height, rotation };
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
    logGenerationJobModeStepDebug('mode validation failed', { mode: body.mode, step: isRecord(body.config) ? body.step ?? body.config.step : body.step });
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
          : body.mode === 'plan-colorize'
            ? '请先上传或选择一张平面图'
          : 'inputAssetIds must contain at least one asset id.',
        code: 'GENERATION_JOB_INPUTS_INVALID',
      },
    };
  }

  const config: Record<string, unknown> = { ...body.config };
  const stepCandidate = body.step !== undefined
    ? body.step
    : config.step !== undefined
      ? config.step
      : isRecord(config.objectInsert)
        ? 'object_insert'
        : undefined;
  if (stepCandidate !== undefined && stepCandidate !== null && stepCandidate !== '') {
    if (!isGenerationStep(stepCandidate)) {
      logGenerationJobModeStepDebug('step validation failed', { mode: body.mode, step: stepCandidate });
      return { ok: false, error: { message: 'Generation step is invalid.', code: 'GENERATION_JOB_STEP_INVALID' } };
    }
    config.step = stepCandidate;
  }
  const generationStep = isGenerationStep(config.step) ? config.step : null;
  logGenerationJobModeStepDebug('validate body mode/step', { mode: body.mode, step: generationStep });
  if (generationStep === 'object_insert' && body.mode !== 'inpaint') {
    return {
      ok: false,
      error: {
        message: '元素植入应使用合法的局部编辑 mode=inpaint，并通过 step=object_insert 标识业务功能。',
        code: 'GENERATION_JOB_OBJECT_INSERT_MODE_INVALID',
      },
    };
  }
  if (generationStep === 'free_reference_image' && body.mode !== 'style-render') {
    return {
      ok: false,
      error: {
        message: '自由参考生图应使用 mode=style-render，并通过 step=free_reference_image 标识业务功能。',
        code: 'GENERATION_JOB_FREE_REFERENCE_MODE_INVALID',
      },
    };
  }
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
  if (generationStep === 'free_reference_image') {
    const inputAssetIds = body.inputAssetIds.map(item => item.trim());
    const sourceImageAssetId = isNonEmptyString(config.sourceImageAssetId) ? config.sourceImageAssetId.trim() : inputAssetIds[0] || '';
    const referenceImageAssetIds = Array.from(new Set([
      ...readStringArray(config.referenceImageAssetIds),
      ...(isNonEmptyString(config.referenceImageAssetId) ? [config.referenceImageAssetId.trim()] : []),
      ...inputAssetIds.slice(1),
    ]))
      .filter(assetId => assetId !== sourceImageAssetId && inputAssetIds.includes(assetId))
      .slice(0, 6);
    if (!sourceImageAssetId || !inputAssetIds.includes(sourceImageAssetId)) {
      return { ok: false, error: { message: '自由参考生图需要原图素材。', code: 'GENERATION_JOB_FREE_REFERENCE_SOURCE_REQUIRED' } };
    }
    config.sourceImageAssetId = sourceImageAssetId;
    if (referenceImageAssetIds.length > 0) {
      config.referenceImageAssetIds = referenceImageAssetIds;
      config.referenceImageAssetId = referenceImageAssetIds[0];
    }
    config.batchCount = 1;
    config.targetAspectRatio = typeof config.freeReferenceAspectRatio === 'string'
      ? config.freeReferenceAspectRatio
      : typeof config.targetAspectRatio === 'string'
        ? config.targetAspectRatio
        : '1:1';
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
  const floorplanConfig = normalizeFloorplanConfig(body.mode, config);
  if (floorplanConfig.ok === false) {
    return { ok: false, error: floorplanConfig.error };
  }
  const materialReplaceConfig = normalizeMaterialReplaceConfig(body.mode, config);
  if (materialReplaceConfig.ok === false) {
    return { ok: false, error: materialReplaceConfig.error };
  }
  const planColorizeConfig = normalizePlanColorizeConfig(body.mode, config);
  if (planColorizeConfig.ok === false) {
    return { ok: false, error: planColorizeConfig.error };
  }
  if (body.mode === 'model-render') {
    if (!isNonEmptyString(config.sourceImageAssetId) && !isNonEmptyString(config.snapshotAssetId)) {
      return { ok: false, error: { message: 'sourceImageAssetId is required for model-render jobs.', code: 'GENERATION_JOB_SNAPSHOT_ASSET_REQUIRED' } };
    }
    if (isNonEmptyString(config.sourceImageAssetId)) config.sourceImageAssetId = config.sourceImageAssetId.trim();
    if (isNonEmptyString(config.snapshotAssetId)) config.snapshotAssetId = config.snapshotAssetId.trim();
    if (isNonEmptyString(config.sourceModelAssetId)) config.sourceModelAssetId = config.sourceModelAssetId.trim();
  }
  if (body.mode === 'panorama-roam-render') {
    const panoramaAssetId = isNonEmptyString(config.panoramaAssetId)
      ? config.panoramaAssetId.trim()
      : isNonEmptyString(config.sourceImageAssetId)
        ? config.sourceImageAssetId.trim()
        : '';
    if (!panoramaAssetId || !body.inputAssetIds.includes(panoramaAssetId)) {
      return { ok: false, error: { message: 'panoramaAssetId is required for panorama-roam-render jobs.', code: 'GENERATION_JOB_PANORAMA_ASSET_REQUIRED' } };
    }
    config.sourceImageAssetId = panoramaAssetId;
    config.panoramaAssetId = panoramaAssetId;
    config.targetAspectRatio = typeof config.targetAspectRatio === 'string' && config.targetAspectRatio.trim().length > 0
      ? config.targetAspectRatio.trim()
      : '2:1';
    config.targetWidth = isReasonableImageDimension(config.targetWidth) ? config.targetWidth : 2048;
    config.targetHeight = isReasonableImageDimension(config.targetHeight) ? config.targetHeight : 1024;
    if (isNonEmptyString(config.sourceModelAssetId)) config.sourceModelAssetId = config.sourceModelAssetId.trim();
  }
  if (generationStep === 'object_insert') {
    const inputAssetIds = body.inputAssetIds.map(item => item.trim());
    const objectInsertConfig = isRecord(config.objectInsert) ? { ...config.objectInsert } : {};
    const previewFusionMode = readObjectInsertPreviewFusionMode(config, body.mode);
    const debugMode = readObjectInsertDebugMode(config);
    const positionConstraintStrength = readObjectInsertPositionConstraintStrength(config);
    const placementMode = readObjectInsertPlacementMode(config);
    const placementIntent = readObjectInsertPlacementIntent(config);
    const harmonyPriority = readObjectInsertHarmonyPriority(config);
    const fusionPreference = readObjectInsertFusionPreference(config);
    const allowAutoAdjustPosition = readObjectInsertAutoAdjust(config, 'allowAutoAdjustPosition');
    const allowAutoAdjustRotation = readObjectInsertAutoAdjust(config, 'allowAutoAdjustRotation');
    const allowAutoAdjustScale = readObjectInsertAutoAdjust(config, 'allowAutoAdjustScale');
    const needsObject = previewFusionMode ? false : objectInsertIncludesObject(debugMode);
    const needsPreview = previewFusionMode ? true : objectInsertIncludesPreview(debugMode);
    const needsMask = previewFusionMode ? false : objectInsertIncludesMask(debugMode);
    const needsPlacement = previewFusionMode ? false : needsPreview || needsMask;
    const objectItems = normalizeObjectInsertItemsForRequest(objectInsertConfig.objectItems, {
      defaultPlacementMode: placementMode,
      inputAssetIds,
      allowUnlistedReferenceAssetIds: previewFusionMode,
    });
    const firstObjectItem = objectItems[0];
    const sourceImageAssetId = isNonEmptyString(config.sourceImageAssetId)
      ? config.sourceImageAssetId.trim()
      : isNonEmptyString(objectInsertConfig.sourceImageAssetId)
        ? objectInsertConfig.sourceImageAssetId.trim()
      : inputAssetIds[0] || '';
    const objectReferenceAssetId = isNonEmptyString(objectInsertConfig.objectReferenceAssetId)
      ? objectInsertConfig.objectReferenceAssetId.trim()
      : isNonEmptyString(config.objectReferenceAssetId)
        ? config.objectReferenceAssetId.trim()
      : firstObjectItem?.referenceAssetIds[0]
        ? firstObjectItem.referenceAssetIds[0]
      : inputAssetIds[1] || '';
    const placementPreviewAssetId = isNonEmptyString(objectInsertConfig.guideAssetId)
      ? objectInsertConfig.guideAssetId.trim()
      : isNonEmptyString(objectInsertConfig.previewAssetId)
      ? objectInsertConfig.previewAssetId.trim()
      : isNonEmptyString(firstObjectItem?.placementPreviewAssetId)
      ? firstObjectItem.placementPreviewAssetId
      : isNonEmptyString(config.placementGuideAssetId)
      ? config.placementGuideAssetId.trim()
      : isNonEmptyString(config.placementPreviewAssetId)
      ? config.placementPreviewAssetId.trim()
      : previewFusionMode
        ? inputAssetIds[1] || ''
      : inputAssetIds[2] || '';
    const placementMaskAssetId = isNonEmptyString(objectInsertConfig.maskAssetId)
      ? objectInsertConfig.maskAssetId.trim()
      : isNonEmptyString(firstObjectItem?.placementMaskAssetId)
        ? firstObjectItem.placementMaskAssetId
      : isNonEmptyString(config.placementMaskAssetId)
        ? config.placementMaskAssetId.trim()
      : isNonEmptyString(config.maskAssetId)
        ? config.maskAssetId.trim()
        : inputAssetIds[3] || '';

    const objectItemsMissingReferences = !previewFusionMode && objectItems.some(item => item.referenceAssetIds.length === 0 || item.referenceAssetIds.some(assetId => !inputAssetIds.includes(assetId)));
    const objectItemsMissingGuides = !previewFusionMode && objectItems.some(item => !item.placementPreviewAssetId || !inputAssetIds.includes(item.placementPreviewAssetId));
    const objectItemsMissingMasks = objectItems.some(item => !item.placementMaskAssetId || !inputAssetIds.includes(item.placementMaskAssetId));
    const hasObjectItems = objectItems.length > 0;
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[ObjectInsert] generation job validation', {
        requestMode: body.mode,
        configMode: typeof config.mode === 'string' ? config.mode : undefined,
        objectInsertMode: previewFusionMode ? 'object_insert_preview_fusion' : 'legacy_object_insert',
        inputAssetIds,
        sourceImageAssetId,
        placementPreviewAssetId,
        objectItemsCount: objectItems.length,
        objectItemsReferenceCount: objectItems.reduce((sum, item) => sum + item.referenceAssetIds.length, 0),
        legacyObjectReferenceAssetId: objectReferenceAssetId || undefined,
        requiresObjectReferences: needsObject,
        requiresPlacementPreview: needsPreview,
        requiresPlacementMask: needsMask,
      });
    }
    const missingAssetMessage = previewFusionMode
      ? !sourceImageAssetId || !inputAssetIds.includes(sourceImageAssetId)
        ? '元素植入需要上传原图。'
        : !placementPreviewAssetId || !inputAssetIds.includes(placementPreviewAssetId)
          ? '元素植入需要先生成摆放示意图，请重新点击生成。'
          : ''
      : !sourceImageAssetId || !inputAssetIds.includes(sourceImageAssetId)
      ? '元素植入需要原始场景图素材。'
      : needsObject && hasObjectItems && objectItemsMissingReferences
        ? '元素植入需要每个对象的参考图素材。'
      : needsObject && !hasObjectItems && (!objectReferenceAssetId || !inputAssetIds.includes(objectReferenceAssetId))
        ? '元素植入需要物体参考图素材。'
      : needsPreview && hasObjectItems && objectItemsMissingGuides
        ? '元素植入需要每个对象的 placement guide 素材。'
      : needsPreview && !hasObjectItems && (!placementPreviewAssetId || !inputAssetIds.includes(placementPreviewAssetId))
        ? '元素植入需要 placement guide 素材。'
      : needsMask && hasObjectItems && objectItemsMissingMasks
        ? '元素植入需要每个对象的 placement mask 素材。'
      : needsMask && !hasObjectItems && (!placementMaskAssetId || !inputAssetIds.includes(placementMaskAssetId))
        ? '元素植入需要 placement mask 素材。'
      : '';
    if (missingAssetMessage) {
      return { ok: false, error: { message: missingAssetMessage, code: 'GENERATION_JOB_OBJECT_INSERT_INPUTS_REQUIRED' } };
    }

    const placement = normalizeObjectPlacement(objectInsertConfig.placement ?? firstObjectItem?.placement ?? config.objectPlacement);
    const objectItemsMissingPlacement = hasObjectItems && objectItems.some(item => !normalizeObjectPlacement(item.placement));
    if (needsPlacement && (!placement && (!hasObjectItems || objectItemsMissingPlacement))) {
      return { ok: false, error: { message: '元素植入需要有效的 placement 信息。', code: 'GENERATION_JOB_OBJECT_PLACEMENT_INVALID' } };
    }

    const extraPrompt = isNonEmptyString(objectInsertConfig.extraPrompt)
      ? objectInsertConfig.extraPrompt.trim()
      : typeof config.objectInsertExtraPrompt === 'string'
        ? config.objectInsertExtraPrompt.trim()
        : '';
    const objectInsertInputOrder = previewFusionMode ? [] : buildObjectInsertInputOrderForRequest(objectItems, needsObject, needsPreview, needsMask);

    config.sourceImageAssetId = sourceImageAssetId;
    config.objectInsertMode = previewFusionMode ? 'object_insert_preview_fusion' : 'legacy_object_insert';
    config.objectInsertDebugMode = debugMode;
    config.positionConstraintStrength = positionConstraintStrength;
    config.placementMode = placementMode;
    config.placementIntent = placementIntent;
    config.harmonyPriority = harmonyPriority;
    config.objectInsertFusionPreference = fusionPreference;
    config.allowAutoAdjustPosition = allowAutoAdjustPosition;
    config.allowAutoAdjustRotation = allowAutoAdjustRotation;
    config.allowAutoAdjustScale = allowAutoAdjustScale;
    if (needsObject) config.objectReferenceAssetId = objectReferenceAssetId;
    else delete config.objectReferenceAssetId;
    if (needsPreview) config.placementPreviewAssetId = placementPreviewAssetId;
    else delete config.placementPreviewAssetId;
    if (needsPreview) config.placementGuideAssetId = placementPreviewAssetId;
    else delete config.placementGuideAssetId;
    if (needsMask) config.placementMaskAssetId = placementMaskAssetId;
    else delete config.placementMaskAssetId;
    if (placement) config.objectPlacement = placement;
    else delete config.objectPlacement;
    if (!previewFusionMode && hasObjectItems) config.objectInsertInputOrder = objectInsertInputOrder;
    else delete config.objectInsertInputOrder;
    config.objectInsert = {
      ...objectInsertConfig,
      sourceImageAssetId,
      objectItems: hasObjectItems ? objectItems : objectInsertConfig.objectItems,
      objectReferenceAssetId: needsObject ? objectReferenceAssetId : undefined,
      guideAssetId: needsPreview ? placementPreviewAssetId : undefined,
      previewAssetId: needsPreview ? placementPreviewAssetId : undefined,
      maskAssetId: needsMask ? placementMaskAssetId : undefined,
      placement,
      extraPrompt,
      debugMode,
      positionConstraintStrength,
      placementMode,
      placementIntent,
      harmonyPriority,
      fusionPreference,
      allowAutoAdjustPosition,
      allowAutoAdjustRotation,
      allowAutoAdjustScale,
    };
    if (needsMask) {
      config.maskMode = 'asset-mask';
      config.maskAssetId = placementMaskAssetId;
    } else {
      delete config.maskMode;
      delete config.maskAssetId;
    }
    config.editTarget = 'furniture';
    config.batchCount = readObjectInsertCandidateCount(config);
    config.preserveStructure = config.preserveStructure !== false;
    config.preserveCamera = config.preserveCamera !== false;
    if (typeof config.objectInsertExtraPrompt === 'string') config.objectInsertExtraPrompt = config.objectInsertExtraPrompt.trim();
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
  if (body.mode === 'inpaint' || body.mode === 'material-replace' || generationStep === 'object_insert') {
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
      step: generationStep,
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

  if (body.metadata !== undefined) {
    if (!isRecord(body.metadata)) {
      return { ok: false, error: { message: 'metadata must be an object.', code: 'GENERATION_RESULT_METADATA_INVALID' } };
    }
    const metadata: Record<string, unknown> = {};
    if (typeof body.metadata.variantName === 'string') metadata.variantName = body.metadata.variantName.trim().slice(0, 80);
    if (typeof body.metadata.variantCode === 'string') metadata.variantCode = body.metadata.variantCode.trim().slice(0, 8);
    value.metadata = metadata;
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
      step: generation.step ?? null,
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

const allowedGenerationModes: GenerationRecord['mode'][] = [
  'floorplan',
  'style-render',
  'inpaint',
  'model-render',
  'design-variants',
  'material-replace',
  'plan-colorize',
  'panorama-roam-render',
];

const allowedGenerationSteps: Array<NonNullable<GenerationJob['step']>> = [
  'floorplan_to_3d',
  'style_render',
  'local_inpainting',
  'model_snapshot_render',
  'design_variants',
  'material_replace',
  'plan_colorize',
  'panorama_quick_render',
  'object_insert',
  'free_reference_image',
];

const allowedPromptTemplateFeatures = [
  'floorplan',
  'style-render',
  'design-variants',
  'material-replace',
  'object-insert',
  'free-reference-image',
];

function readPromptTemplateFilters(query: Request['query']): Parameters<typeof listPromptTemplates>[0] {
  const generationStep = readQueryString(query.generationStep);
  const search = readQueryString(query.search);
  const tag = readQueryString(query.tag);
  return {
    ...(generationStep && isGenerationStep(generationStep) ? { generationStep } : {}),
    ...(search ? { search: search.slice(0, 120) } : {}),
    ...(tag ? { tag: tag.slice(0, 40) } : {}),
  };
}

function readQueryString(value: unknown): string {
  if (Array.isArray(value)) return readQueryString(value[0]);
  return typeof value === 'string' ? value.trim() : '';
}

function isGenerationMode(value: unknown): value is GenerationRecord['mode'] {
  return allowedGenerationModes.includes(value as GenerationRecord['mode']);
}

function isGenerationStep(value: unknown): value is NonNullable<GenerationJob['step']> {
  return allowedGenerationSteps.includes(value as NonNullable<GenerationJob['step']>);
}

function isPromptTemplateFeature(value: unknown): value is Parameters<typeof createPromptTemplate>[0]['feature'] {
  return allowedPromptTemplateFeatures.includes(value as Parameters<typeof createPromptTemplate>[0]['feature']);
}

function inferPromptTemplateFeature(step: NonNullable<GenerationJob['step']>): Parameters<typeof createPromptTemplate>[0]['feature'] {
  switch (step) {
    case 'floorplan_to_3d':
      return 'floorplan';
    case 'style_render':
      return 'style-render';
    case 'design_variants':
      return 'design-variants';
    case 'material_replace':
      return 'material-replace';
    case 'object_insert':
      return 'object-insert';
    case 'free_reference_image':
      return 'free-reference-image';
    default:
      return 'floorplan';
  }
}

function promptTemplateFeatureName(feature: Parameters<typeof createPromptTemplate>[0]['feature']): string {
  switch (feature) {
    case 'floorplan':
      return '平面彩平';
    case 'style-render':
      return '参考图风格渲染';
    case 'design-variants':
      return '方案变体';
    case 'material-replace':
      return '材质软装替换';
    case 'object-insert':
      return '元素植入';
    case 'free-reference-image':
      return '自由参考生图';
    default:
      return '提示词模板';
  }
}

function readInputPreviews(value: unknown): Parameters<typeof createPromptTemplate>[0]['inputPreviews'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map(item => ({
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim().slice(0, 40) : '输入素材',
      url: typeof item.url === 'string' ? item.url.trim() : '',
      assetId: typeof item.assetId === 'string' && item.assetId.trim() ? item.assetId.trim() : undefined,
    }))
    .filter(item => item.url)
    .slice(0, 12);
}

function isObjectInsertStep(step: GenerationJob['step'], config: Record<string, unknown>): boolean {
  return step === 'object_insert' || config.step === 'object_insert' || isRecord(config.objectInsert);
}

type ObjectInsertDebugMode = 'full' | 'source_prompt' | 'source_object' | 'source_object_mask' | 'source_object_preview';
type ObjectInsertPositionConstraintStrength = 'low' | 'medium' | 'high';
type ObjectInsertPlacementMode = 'strict' | 'natural';
type ObjectInsertHarmonyPriority = 'layout' | 'style' | 'balance';
type ObjectInsertFusionPreference = 'conservative' | 'balanced' | 'design';

interface ObjectInsertRequestItem {
  id: string;
  objectType: string;
  objectLabel?: string;
  referenceAssetIds: string[];
  placement?: { x: number; y: number; width: number; height: number; rotation: number };
  placementPreviewAssetId?: string;
  placementMaskAssetId?: string;
  placementMode: ObjectInsertPlacementMode;
  placementIntent?: string;
  extraPrompt?: string;
}

function readObjectInsertDebugMode(config: Record<string, unknown>): ObjectInsertDebugMode {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = typeof nested.debugMode === 'string'
    ? nested.debugMode
    : typeof config.objectInsertDebugMode === 'string'
      ? config.objectInsertDebugMode
      : '';
  return value === 'source_prompt'
    || value === 'source_object'
    || value === 'source_object_mask'
    || value === 'source_object_preview'
    ? value
    : 'full';
}

function readObjectInsertPositionConstraintStrength(config: Record<string, unknown>): ObjectInsertPositionConstraintStrength {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = typeof nested.positionConstraintStrength === 'string'
    ? nested.positionConstraintStrength
    : typeof config.positionConstraintStrength === 'string'
      ? config.positionConstraintStrength
      : '';
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'high';
}

function readObjectInsertPlacementMode(config: Record<string, unknown>): ObjectInsertPlacementMode {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = typeof nested.placementMode === 'string'
    ? nested.placementMode
    : typeof config.placementMode === 'string'
      ? config.placementMode
      : '';
  return value === 'strict' || value === 'natural' ? value : 'natural';
}

function readObjectInsertHarmonyPriority(config: Record<string, unknown>): ObjectInsertHarmonyPriority {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = typeof nested.harmonyPriority === 'string'
    ? nested.harmonyPriority
    : typeof config.harmonyPriority === 'string'
      ? config.harmonyPriority
      : '';
  return value === 'style' || value === 'balance' || value === 'layout' ? value : 'layout';
}

function readObjectInsertFusionPreference(config: Record<string, unknown>): ObjectInsertFusionPreference {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = typeof nested.fusionPreference === 'string'
    ? nested.fusionPreference
    : typeof config.objectInsertFusionPreference === 'string'
      ? config.objectInsertFusionPreference
      : '';
  return value === 'conservative' || value === 'design' || value === 'balanced' ? value : 'balanced';
}

function readObjectInsertCandidateCount(config: Record<string, unknown>): 1 | 2 | 3 {
  return config.batchCount === 2 || config.batchCount === 3 ? config.batchCount : 1;
}

function readObjectInsertPreviewFusionMode(config: Record<string, unknown>, requestMode?: unknown): boolean {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const values = [config.objectInsertMode, config.mode, nested.mode, nested.objectInsertMode, requestMode]
    .filter((value): value is string => typeof value === 'string');
  return !values.some(value => value === 'legacy_object_insert' || value === 'precise_inpaint');
}

function isObjectInsertRequestConfig(config: Record<string, unknown>): boolean {
  return config.step === 'object_insert' || isRecord(config.objectInsert);
}

function readObjectInsertPlacementIntent(config: Record<string, unknown>): string {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = typeof nested.placementIntent === 'string'
    ? nested.placementIntent
    : typeof config.placementIntent === 'string'
      ? config.placementIntent
      : '';
  return value.trim();
}

function readObjectInsertAutoAdjust(
  config: Record<string, unknown>,
  key: 'allowAutoAdjustPosition' | 'allowAutoAdjustRotation' | 'allowAutoAdjustScale',
): boolean {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = typeof nested[key] === 'boolean' ? nested[key] : typeof config[key] === 'boolean' ? config[key] : undefined;
  return value === undefined ? true : value !== false;
}

function objectInsertIncludesObject(mode: ObjectInsertDebugMode): boolean {
  return mode !== 'source_prompt';
}

function objectInsertIncludesPreview(mode: ObjectInsertDebugMode): boolean {
  return mode === 'full' || mode === 'source_object_preview';
}

function objectInsertIncludesMask(mode: ObjectInsertDebugMode): boolean {
  return mode === 'full' || mode === 'source_object_mask';
}

function normalizeObjectInsertItemsForRequest(
  value: unknown,
  input: { defaultPlacementMode: ObjectInsertPlacementMode; inputAssetIds: string[]; allowUnlistedReferenceAssetIds?: boolean },
): ObjectInsertRequestItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item, index): ObjectInsertRequestItem => {
      const referenceAssetIds = readStringArray(item.referenceAssetIds)
        .map(assetId => assetId.trim())
        .filter(assetId => input.allowUnlistedReferenceAssetIds || input.inputAssetIds.includes(assetId))
        .slice(0, 6);
      const placement = normalizeObjectPlacement(item.placement);
      const placementMode = item.placementMode === 'strict' || item.placementMode === 'natural'
        ? item.placementMode
        : input.defaultPlacementMode;
      return {
        id: isNonEmptyString(item.id) ? item.id.trim() : `object-item-${index + 1}`,
        objectType: isNonEmptyString(item.objectType) ? item.objectType.trim() : 'custom',
        objectLabel: isNonEmptyString(item.objectLabel) ? item.objectLabel.trim() : undefined,
        referenceAssetIds,
        placement: placement || undefined,
        placementPreviewAssetId: isNonEmptyString(item.placementPreviewAssetId) ? item.placementPreviewAssetId.trim() : undefined,
        placementMaskAssetId: isNonEmptyString(item.placementMaskAssetId) ? item.placementMaskAssetId.trim() : undefined,
        placementMode,
        placementIntent: isNonEmptyString(item.placementIntent) ? item.placementIntent.trim() : undefined,
        extraPrompt: isNonEmptyString(item.extraPrompt) ? item.extraPrompt.trim() : undefined,
      };
    })
    .filter(item => item.referenceAssetIds.length > 0 || item.placementPreviewAssetId || item.placementMaskAssetId)
    .slice(0, 8);
}

function buildObjectInsertInputOrderForRequest(
  items: ObjectInsertRequestItem[],
  needsObject: boolean,
  needsPreview: boolean,
  needsMask: boolean,
): Array<Record<string, unknown>> {
  let imageIndex = 2;
  const orders = items.map((item, itemIndex) => ({
    itemIndex,
    id: item.id,
    objectType: item.objectType,
    objectLabel: item.objectLabel,
    referenceImageIndexes: needsObject ? item.referenceAssetIds.map(() => imageIndex++) : [],
    placementMode: item.placementMode,
    placementIntent: item.placementIntent,
    extraPrompt: item.extraPrompt,
  }));
  const controlIndexes = new Map<string, number>();
  const readControlIndex = (assetId: string | undefined): number | undefined => {
    if (!assetId) return undefined;
    const existing = controlIndexes.get(assetId);
    if (existing) return existing;
    const next = imageIndex++;
    controlIndexes.set(assetId, next);
    return next;
  };
  return orders.map((order, itemIndex) => {
    const item = items[itemIndex];
    return {
      ...order,
      placementGuideImageIndex: needsPreview ? readControlIndex(item.placementPreviewAssetId) : undefined,
      placementMaskImageIndex: needsMask ? readControlIndex(item.placementMaskAssetId) : undefined,
    };
  });
}

function logGenerationJobModeStepDebug(stage: string, fields: { mode?: unknown; step?: unknown } = {}): void {
  if (process.env.NODE_ENV === 'production') return;
  console.debug('[GenerationJob mode/step]', {
    stage,
    mode: typeof fields.mode === 'string' ? sanitizeLogText(fields.mode) : fields.mode,
    step: typeof fields.step === 'string' ? sanitizeLogText(fields.step) : fields.step,
    allowedModes: allowedGenerationModes,
    allowedSteps: allowedGenerationSteps,
  });
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
  step: GenerationJob['step'],
  config: Record<string, unknown>,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: ApiError }> {
  const isObjectInsert = isObjectInsertStep(step, config);
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

  const maskAssetId = (mode === 'inpaint' || mode === 'material-replace' || isObjectInsert) && config.maskMode === 'asset-mask' && typeof config.maskAssetId === 'string'
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

  if (mode === 'panorama-roam-render') {
    const panoramaAssetId = typeof config.panoramaAssetId === 'string'
      ? config.panoramaAssetId.trim()
      : typeof config.sourceImageAssetId === 'string'
        ? config.sourceImageAssetId.trim()
        : '';
    if (!panoramaAssetId || !inputAssetIds.includes(panoramaAssetId)) {
      return {
        ok: false,
        error: {
          message: 'Panorama image asset is required for panorama-roam-render.',
          code: 'GENERATION_JOB_PANORAMA_ASSET_NOT_FOUND',
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

async function markGenerationJobCancelledAfterDebitFailure(jobId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'Credit debit failed.';
  try {
    await updateGenerationJob(jobId, {
      status: 'cancelled',
      progress: 0,
      errorMessage: message,
      failureReason: message,
      finishedAt: new Date().toISOString(),
    });
  } catch (updateError) {
    console.error('Failed to cancel generation job after credit debit error', {
      jobId: sanitizeLogText(jobId),
      error: updateError instanceof Error ? sanitizeLogText(updateError.message) : sanitizeLogText(String(updateError)),
    });
  }
}

function isRefundableGenerationJobStatus(status: GenerationJob['status']): boolean {
  return status === 'failed' || status === 'cancelled' || status === 'timeout';
}

function logGenerationJobCreateStage(req: Request, stage: string, fields: Record<string, unknown> = {}): void {
  const requestId = req.headers['x-request-id'];
  const safeRequestId = typeof requestId === 'string' ? sanitizeLogText(requestId) : undefined;
  console.info('Generation job create stage', {
    requestId: safeRequestId,
    method: req.method,
    path: req.path,
    stage,
    ...sanitizeLogFields(fields),
  });
}

function sanitizeLogFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [
    key,
    typeof value === 'string' ? sanitizeLogText(value) : value,
  ]));
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
