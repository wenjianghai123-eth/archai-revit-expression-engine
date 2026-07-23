import { NextFunction, Request, Response, Router } from 'express';
import { getRequiredCurrentUser, requireAuth } from '../auth';
import {
  adjustCredits,
  cancelGenerationJob,
  createGenerationJob,
  GenerationJob,
  GenerationRecord,
  getGenerationJob,
  getGenerationJobByIdempotencyKey,
  getProject,
  listGenerationResults,
  updateGenerationJob,
  updateGenerationResult,
} from '../storage';
import {
  ApiError,
  ApiResponse,
  apiError,
  apiOk,
  createGenerationJobRateLimiter,
  sanitizeLogText,
} from '../http';
import {
  enqueueGenerationJob,
  isGenerationWorkerDisabled,
  refundGenerationJobCredits,
  removeQueuedGenerationJob,
} from '../generationService';
import { failEditGeneration } from '../editSessionLifecycle';
import { getGenerationCreditCost, getGenerationOutputCount } from '../../src/utils/generationCredits';

type GenerationJobCreateValidation = {
  ok: true;
  value: Omit<Parameters<typeof createGenerationJob>[0], 'userId'>;
  requestedProvider: string | null;
} | {
  ok: false;
  error: ApiError;
};

type GenerationJobAssetValidation = { ok: true } | { ok: false; error: ApiError };

export interface GenerationJobsRouterOptions {
  rateLimitPerMinute: number;
  validateCreateBody: (body: unknown) => GenerationJobCreateValidation;
  validateAssets: (
    inputAssetIds: string[],
    mode: GenerationRecord['mode'],
    step: GenerationJob['step'],
    config: Record<string, unknown>,
    userId: string,
  ) => Promise<GenerationJobAssetValidation>;
  logModeStepDebug: (stage: string, fields?: { mode?: unknown; step?: unknown }) => void;
}

export function createGenerationJobsRouter(options: GenerationJobsRouterOptions): Router {
  const router = Router();
  const rateLimitGenerationJobCreate = createGenerationJobRateLimiter(options.rateLimitPerMinute);

  router.post('/generation-jobs', requireAuth, rateLimitGenerationJobCreate, async (
    req: Request,
    res: Response<ApiResponse<{ job: GenerationJob; idempotent?: boolean }>>,
    next: NextFunction,
  ) => {
    logGenerationJobCreateStage(req, 'validate body');
    const body = options.validateCreateBody(req.body);
    if (body.ok === false) {
      logGenerationJobCreateStage(req, 'validate body failed', { errorCode: body.error.code });
      res.status(400).json(apiError(body.error.message, body.error.code));
      return;
    }

    try {
      const user = getRequiredCurrentUser(req);
      const idempotencyKey = readGenerationIdempotencyKey(req);
      if (idempotencyKey) {
        const existingJob = await getGenerationJobByIdempotencyKey(user.id, idempotencyKey);
        if (existingJob) {
          res.status(200).json(apiOk({ job: existingJob, idempotent: true }));
          return;
        }
      }
      options.logModeStepDebug('route accepted body', { mode: body.value.mode, step: body.value.step });
      if (process.env.NODE_ENV !== 'production') {
        console.debug({
          event: 'generation_job_create',
          mode: body.value.mode,
          step: body.value.step,
          generationStep: body.value.config.generationStep || body.value.step,
          provider: body.value.provider,
          inputAssetCount: body.value.inputAssetIds.length,
        });
      }
      logGenerationJobCreateStage(req, 'get project', {
        userId: user.id,
        projectId: body.value.projectId,
        mode: body.value.mode,
        step: body.value.step,
      });
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
      const assetValidation = await options.validateAssets(
        body.value.inputAssetIds,
        body.value.mode,
        body.value.step,
        body.value.config,
        user.id,
      );
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
      const job = await createGenerationJob({
        ...body.value,
        userId: user.id,
        creditCost: creditsCost,
        idempotencyKey,
      });
      if (!job) {
        logGenerationJobCreateStage(req, 'create generation job failed', {
          userId: user.id,
          projectId: body.value.projectId,
        });
        res.status(404).json(apiError('Project not found.', 'PROJECT_NOT_FOUND'));
        return;
      }
      if (process.env.NODE_ENV !== 'production') {
        console.debug({
          event: 'generation_job_created',
          jobId: job.id,
          requestedProvider: body.requestedProvider,
          normalizedProvider: job.provider,
          step: job.step,
          mode: job.mode,
          inputAssetCount: job.inputAssetIds.length,
        });
        if (job.step === 'image_polish' || job.config.generationStep === 'image_polish') {
          console.debug({
            event: 'image_polish_job_create_requested',
            jobId: job.id,
            enhanceMaterials: job.config.enhanceMaterials === true,
            imagePolishMode: job.config.imagePolishMode,
            imagePolishControls: job.config.imagePolishControls,
            addPeople: job.config.addPeople,
            peopleLevel: job.config.peopleLevel,
            addPlants: job.config.addPlants,
            plantLevel: job.config.plantLevel,
            preserveStrictness: job.config.preserveStrictness,
            promptMode: typeof job.config.promptMode === 'string' ? job.config.promptMode : undefined,
            provider: job.provider,
            inputAssetCount: job.inputAssetIds.length,
          });
        }
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

  router.get('/generation-jobs/:id', requireAuth, async (
    req: Request,
    res: Response<ApiResponse<{ job: GenerationJob }>>,
    next: NextFunction,
  ) => {
    try {
      const userId = getRequiredCurrentUser(req).id;
      const job = await getGenerationJob(req.params.id, userId);
      if (!job) {
        res.status(404).json(apiError('Generation job not found.', 'GENERATION_JOB_NOT_FOUND'));
        return;
      }

      if (isRefundableGenerationJobStatus(job.status) && !job.creditRefunded) {
        await refundGenerationJobCredits(job.id);
      }
      const latestJob = await getGenerationJob(req.params.id, userId);
      const results = await listGenerationResults(job.id, userId);
      res.json(apiOk({ job: { ...(latestJob || job), results } }));
    } catch (error) {
      next(error);
    }
  });

  router.post('/generation-jobs/:id/cancel', requireAuth, async (
    req: Request,
    res: Response<ApiResponse<{ job: GenerationJob }>>,
    next: NextFunction,
  ) => {
    try {
      const userId = getRequiredCurrentUser(req).id;
      const job = await cancelGenerationJob(req.params.id, userId);
      if (!job) {
        res.status(404).json(apiError('Generation job not found.', 'GENERATION_JOB_NOT_FOUND'));
        return;
      }

      removeQueuedGenerationJob(job.id);
      if (job.status === 'cancelled') {
        await refundGenerationJobCredits(job.id);
        await failEditGeneration(job, 'cancelled');
      }
      const latestJob = await getGenerationJob(job.id, userId);
      res.json(apiOk({ job: latestJob || job }));
    } catch (error) {
      next(error);
    }
  });

  router.patch('/generation-results/:id', requireAuth, async (
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

  return router;
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
    path: sanitizeLogText(req.originalUrl.split('?')[0] || req.path),
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

function readGenerationIdempotencyKey(req: Request): string | null {
  const value = req.headers['idempotency-key'] ?? req.headers['x-idempotency-key'];
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > 128) {
    const error = new Error('Idempotency key is too long.') as Error & { code?: string };
    error.code = 'GENERATION_IDEMPOTENCY_KEY_INVALID';
    throw error;
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
