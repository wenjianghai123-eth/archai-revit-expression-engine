import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { createStoredFilename, fileStorageProvider, uploadsDir } from './fileStorage';
import { isProviderFallbackEnabled } from './providers/fallback';
import { createGeminiProvider } from './providers/geminiProvider';
import { createGrsaiBanana2Provider } from './providers/grsaiBanana2Provider';
import { createGrsaiNanoBananaProvider } from './providers/grsaiNanoBananaProvider';
import { createMockGeneration, mockProvider } from './providers/mockProvider';
import { GenerateImageInput, GenerateImageOutput, ImageGenerationProvider, MaskMode, ProviderName, QualityMode } from './providers/types';
import { getImageSizeFromDataUrl, isValidTargetDimension, parseImageDataUrl as parseRawImageDataUrl } from './image/imageMetadata';
import { prepareImageForProvider, prepareMaskForProvider, PreparedProviderImage } from './image/prepareProviderImage';
import { composeLocalInpaintResult, createLocalInpaintContext, cropImageDataUrlToBox, LocalInpaintContext } from './image/localInpaint';
import { buildSmartPrompt, readSmartPromptUserSupplement, type SmartPromptMode } from '../src/promptTemplates/intelligentPromptTemplates';
import { findPlanColorizeStyle, maxPlanColorizeBatchCount, planColorizeStyleOptions, resolvePlanColorizeStyles, type PlanColorizeStyleOption } from '../src/constants/planColorizeStyles';
import { resolveFloorplanBatchCount, resolveFloorplanVariantPlans, type FloorplanVariantPlan } from '../src/constants/floorplanVariants';
import { getGenerationOutputCount } from '../src/utils/generationCredits';
import {
  adjustCredits,
  createGenerationRecord,
  createGenerationResult,
  createImageAsset,
  GenerationJob,
  GenerationJobDiagnostics,
  GenerationRecord,
  getCreditTransactionByReference,
  getGenerationJob,
  getImageAsset,
  ImageAsset,
  listRunnableGenerationJobs,
  updateGenerationJob,
} from './storage';
import { isNonEmptyString } from './validation';

export interface GenerateResponseBody {
  id: string;
  provider: ProviderName;
  imageDataUrl: string;
  imageUrl?: string | null;
  outputImageUrl?: string | null;
  createdAt: string;
  warnings: string[];
}

const maxImageMb = Number(process.env.MAX_IMAGE_MB || 10);
const provider = selectProvider();
const queuedGenerationJobIds: string[] = [];
const activeGenerationJobIds = new Set<string>();
let isGenerationWorkerScheduling = false;
const providerMaintenanceUserMessage = '当前生成模型正在维护，请稍后重试，或切换其他生成模型。';

type ProviderImageSettings = {
  qualityMode: QualityMode;
  imageMaxLongSide: number;
  referenceMaxLongSide: number;
  quality: number;
  maxReferenceImages: number;
  maxPayloadBytes: number;
};

const providerImageDefaults: Record<QualityMode, ProviderImageSettings> = {
  draft: {
    qualityMode: 'draft',
    imageMaxLongSide: 768,
    referenceMaxLongSide: 512,
    quality: 72,
    maxReferenceImages: 1,
    maxPayloadBytes: 2_500_000,
  },
  fast: {
    qualityMode: 'fast',
    imageMaxLongSide: 1024,
    referenceMaxLongSide: 768,
    quality: 78,
    maxReferenceImages: 2,
    maxPayloadBytes: 4_000_000,
  },
  balanced: {
    qualityMode: 'balanced',
    imageMaxLongSide: 1280,
    referenceMaxLongSide: 768,
    quality: 80,
    maxReferenceImages: 3,
    maxPayloadBytes: 6_000_000,
  },
  high: {
    qualityMode: 'high',
    imageMaxLongSide: 1536,
    referenceMaxLongSide: 1024,
    quality: 85,
    maxReferenceImages: 6,
    maxPayloadBytes: 10_000_000,
  },
};

interface ProviderBatchSuccess {
  index: number;
  variantStyle: string;
  planStyle: PlanColorizeStyleOption;
  floorplanPlan?: FloorplanVariantPlan;
  providerOutput: GenerateImageOutput;
}

interface ProviderBatchFailure {
  index: number;
  variantStyle: string;
  planStyle: PlanColorizeStyleOption;
  floorplanPlan?: FloorplanVariantPlan;
  error: unknown;
}

type ProviderBatchResult = ProviderBatchSuccess | ProviderBatchFailure;

export function getGenerationProviderName(): ProviderName {
  return provider.name;
}

export async function refundGenerationJobCredits(jobId: string): Promise<void> {
  const job = await getGenerationJob(jobId);
  if (!job) return;
  if (!isRefundableGenerationJobStatus(job.status)) return;
  if (job.creditRefunded) return;

  const existingRefund = await getCreditTransactionByReference(job.userId, 'generate_refund', job.id)
    || await getCreditTransactionByReference(job.userId, 'refund', job.id);
  if (existingRefund) {
    await updateGenerationJob(job.id, {
      creditRefunded: true,
      failureReason: job.failureReason || job.errorMessage || job.status,
    });
    return;
  }

  const debit = await getCreditTransactionByReference(job.userId, 'generate_charge', job.id)
    || await getCreditTransactionByReference(job.userId, 'debit', job.id);
  if (!debit || debit.amount >= 0) return;

  const result = await adjustCredits({
    userId: job.userId,
    type: 'generate_refund',
    amount: Math.abs(debit.amount),
    reason: `Refund generation job ${job.mode}: ${job.failureReason || job.errorMessage || job.status}`,
    referenceType: 'generation_job',
    referenceId: job.id,
  });
  if (result) {
    await updateGenerationJob(job.id, {
      creditRefunded: true,
      failureReason: job.failureReason || job.errorMessage || job.status,
    });
  }
}

async function refundPartialBatchCredits(job: GenerationJob, failedCount: number): Promise<void> {
  if ((job.mode !== 'plan-colorize' && job.mode !== 'floorplan') || failedCount <= 0) return;
  const referenceId = `${job.id}:partial-${job.mode}:${failedCount}`;
  const existingRefund = await getCreditTransactionByReference(job.userId, 'generate_refund', referenceId)
    || await getCreditTransactionByReference(job.userId, 'refund', referenceId);
  if (existingRefund) return;

  await adjustCredits({
    userId: job.userId,
    type: 'generate_refund',
    amount: failedCount,
    reason: `Refund ${failedCount} failed ${job.mode} batch output(s) for job ${job.id}`,
    referenceType: 'generation_job',
    referenceId,
  });
}

function isRefundableGenerationJobStatus(status: GenerationJob['status']): boolean {
  return status === 'failed' || status === 'cancelled' || status === 'timeout';
}

export async function restorePendingGenerationJobs(): Promise<void> {
  if (isGenerationWorkerDisabled()) return;

  const jobs = await listRunnableGenerationJobs();
  for (const job of jobs) {
    enqueueGenerationJob(job.id);
  }
}

export function enqueueGenerationJob(jobId: string): void {
  if (!queuedGenerationJobIds.includes(jobId) && !activeGenerationJobIds.has(jobId)) {
    queuedGenerationJobIds.push(jobId);
  }

  setTimeout(() => {
    void runGenerationWorker();
  }, 0);
}

export function isGenerationWorkerDisabled(): boolean {
  return process.env.ARCHAI_DISABLE_GENERATION_WORKER === 'true';
}

export function isLegacyGenerationEndpointEnabled(): boolean {
  const configured = process.env.ENABLE_LEGACY_GENERATION_ENDPOINTS;
  if (configured === 'false') return false;

  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    return false;
  }

  if (configured === 'true') return true;

  return readRequestedProviderName() === 'mock' && (process.env.AUTH_MODE || 'dev') === 'dev';
}

export function removeQueuedGenerationJob(jobId: string): void {
  const index = queuedGenerationJobIds.indexOf(jobId);
  if (index !== -1) {
    queuedGenerationJobIds.splice(index, 1);
  }
}

export async function generateWithFallbackResponse(input: GenerateImageInput, userId?: string): Promise<GenerateResponseBody> {
  const output = await generateWithFallback(input);
  let outputImageUrl: string | null = null;
  if (userId) {
    const asset = await saveGeneratedDataUrl(userId, output.dataUrl, `legacy-generation-${output.id}`);
    outputImageUrl = asset.url;
  }
  return toGenerateResponseBody(output, outputImageUrl);
}

async function runGenerationWorker(): Promise<void> {
  if (isGenerationWorkerScheduling) return;
  isGenerationWorkerScheduling = true;

  try {
    const concurrency = readPositiveInteger(process.env.GENERATION_WORKER_CONCURRENCY, 1);
    while (queuedGenerationJobIds.length > 0 && activeGenerationJobIds.size < concurrency) {
      const jobId = queuedGenerationJobIds.shift();
      if (!jobId) continue;
      if (activeGenerationJobIds.has(jobId)) continue;
      activeGenerationJobIds.add(jobId);
      void processGenerationJob(jobId)
        .catch(error => {
          console.error('Generation worker crashed while processing a job', {
            jobId,
            error: error instanceof Error ? error.message : 'unknown error',
          });
        })
        .finally(() => {
          activeGenerationJobIds.delete(jobId);
          if (queuedGenerationJobIds.length > 0) {
            setTimeout(() => {
              void runGenerationWorker();
            }, 0);
          }
        });
    }
  } finally {
    isGenerationWorkerScheduling = false;
  }
}

async function processGenerationJob(jobId: string): Promise<void> {
  const job = await getGenerationJob(jobId);
  if (!job || job.status === 'cancelled' || job.status === 'succeeded' || job.status === 'failed' || job.status === 'timeout') return;
  const isObjectInsert = isObjectInsertJob(job);
  const diagnostics: GenerationJobDiagnostics = {
    ...job.diagnostics,
    phase: 'prepare-input',
    timing: {
      ...job.diagnostics?.timing,
      jobCreatedAt: job.createdAt,
      jobStartedAt: new Date().toISOString(),
    },
  };

  try {
    await updateGenerationJob(job.id, {
      status: 'running',
      progress: 10,
      startedAt: diagnostics.timing?.jobStartedAt,
      errorMessage: null,
      diagnostics,
    });

    markTiming(diagnostics, 'prepareInputStartedAt', 'prepare-input');
    await updateGenerationJob(job.id, { progress: 15, diagnostics });
    const { input, imageDiagnostics, localInpaint } = await buildGenerateInputFromJob(job);
    diagnostics.images = imageDiagnostics;
    markTiming(diagnostics, 'prepareInputFinishedAt');
    await updateGenerationJob(job.id, { progress: 22, diagnostics });

    const batchCount = resolveBatchCountForJob(job);
    const variantStyles = job.mode === 'design-variants' ? resolveVariantStyles(job.config, batchCount) : ['modern-minimal'];
    const planColorizeStyles = resolvePlanColorizeStylesForJob(job.config, batchCount);
    const floorplanVariantPlans = isFloorplanMultiPlanJob(job)
      ? resolveFloorplanVariantPlans(job.config, batchCount)
      : [];
    const outputAssetIds: string[] = [];
    let firstOutput: GenerateImageOutput | null = null;
    let firstOutputAsset: ImageAsset | null = null;

    markTiming(diagnostics, 'providerRequestStartedAt', 'provider-request');
    await updateGenerationJob(job.id, { progress: resolveVariantStartProgress(batchCount, 0), diagnostics });
    const providerResults: ProviderBatchResult[] = await mapWithConcurrency(
      Array.from({ length: batchCount }, (_, index) => index),
      job.mode === 'design-variants' ? readPositiveInteger(process.env.GENERATION_VARIANT_CONCURRENCY, 1) : 1,
      async (index) => {
        const variantStyle = variantStyles[index] || 'modern-minimal';
        const planStyle = planColorizeStyles[index] || planColorizeStyles[0] || planColorizeStyleOptions[0];
        const floorplanPlan = floorplanVariantPlans[index];
        try {
          const providerInput = buildProviderInputForVariant(job, input, index, batchCount, variantStyle, planStyle, floorplanPlan);
          const providerOutput = await generateWithFallback(providerInput);
          await updateGenerationJob(job.id, {
            progress: job.mode === 'design-variants' || job.mode === 'plan-colorize' || isFloorplanMultiPlanJob(job) ? resolveVariantCompleteProgress(batchCount, index) : 75,
            diagnostics,
          });
          return { index, variantStyle, planStyle, floorplanPlan, providerOutput };
        } catch (error) {
          if ((job.mode !== 'plan-colorize' && !isFloorplanMultiPlanJob(job)) || batchCount <= 1) throw error;
          return { index, variantStyle, planStyle, floorplanPlan, error };
        }
      },
    );
    const successfulProviderResults = providerResults.filter(isProviderBatchSuccess);
    const failedProviderResults = providerResults.filter(isProviderBatchFailure);
    if (failedProviderResults.length > 0) {
      diagnostics.provider = {
        ...diagnostics.provider,
        providerError: `${failedProviderResults.length} batch output(s) failed.`,
        rawSnippet: failedProviderResults
          .map(result => `${result.floorplanPlan?.variantName || result.planStyle.name}: ${result.error instanceof Error ? result.error.message : String(result.error)}`)
          .join('\n')
          .slice(0, 1200),
      };
      try {
        await refundPartialBatchCredits(job, failedProviderResults.length);
      } catch (refundError) {
        console.warn('Failed to refund partial plan colorize credits', {
          jobId: job.id,
          failedCount: failedProviderResults.length,
          error: refundError instanceof Error ? refundError.message : String(refundError),
        });
      }
    }
    if (successfulProviderResults.length === 0) {
      const firstFailure = failedProviderResults[0]?.error;
      throw firstFailure instanceof Error ? firstFailure : new Error('All batch outputs failed.');
    }
    markTiming(diagnostics, 'providerRequestFinishedAt');
    mergeProviderDiagnostics(diagnostics, successfulProviderResults.map(result => result.providerOutput));
    await updateGenerationJob(job.id, { progress: job.mode === 'design-variants' || job.mode === 'plan-colorize' || isFloorplanMultiPlanJob(job) ? 75 : 75, diagnostics });

    for (const { index, variantStyle, planStyle, floorplanPlan, providerOutput } of successfulProviderResults) {

      markTiming(diagnostics, 'postprocessStartedAt', 'postprocess');
      const providerOriginalMetadata = await readImageDataUrlMetadata(providerOutput.dataUrl);
      let outputDataUrl = providerOutput.dataUrl;
      if (localInpaint) {
        outputDataUrl = await composeLocalInpaintResult({
          originalImageDataUrl: localInpaint.originalImageDataUrl,
          resultCropDataUrl: outputDataUrl,
          maskCropDataUrl: localInpaint.cropMaskDataUrl,
          bbox: localInpaint.bbox,
          featherRadius: isObjectInsert
            ? readPositiveInteger(process.env.OBJECT_INSERT_LOCAL_FEATHER_RADIUS, 8)
            : readPositiveInteger(process.env.LOCAL_INPAINT_FEATHER_RADIUS, 2),
        });
      }
      const savedOutputMetadata = await readImageDataUrlMetadata(outputDataUrl);
      const output = {
        ...providerOutput,
        dataUrl: outputDataUrl,
      };
      markTiming(diagnostics, 'postprocessFinishedAt');
      const progress = resolveVariantCompleteProgress(batchCount, index);
      await updateGenerationJob(job.id, { progress });

      markTiming(diagnostics, 'saveResultStartedAt', 'save-result');
      await updateGenerationJob(job.id, { progress: job.mode === 'design-variants' || isFloorplanMultiPlanJob(job) ? progress : 88, diagnostics });
      const outputAsset = await saveGeneratedDataUrl(job.userId, output.dataUrl, `generation-${job.id}-${index + 1}`);
      console.info('Generation output saved', {
        jobId: job.id,
        resultIndex: index,
        providerOriginalWidth: providerOriginalMetadata.width,
        providerOriginalHeight: providerOriginalMetadata.height,
        providerOriginalMimeType: providerOriginalMetadata.mimeType,
        providerOriginalSizeBytes: providerOriginalMetadata.sizeBytes,
        savedWidth: savedOutputMetadata.width,
        savedHeight: savedOutputMetadata.height,
        savedMimeType: savedOutputMetadata.mimeType,
        savedSizeBytes: savedOutputMetadata.sizeBytes,
        outputAssetId: outputAsset.id,
      });
      if (!firstOutputAsset) firstOutputAsset = outputAsset;
      outputAssetIds.push(outputAsset.id);
      const originalOutputMetadata = buildOriginalOutputMetadata(outputAsset, savedOutputMetadata, providerOriginalMetadata);

      await createGenerationResult({
        jobId: job.id,
        userId: job.userId,
        projectId: job.projectId,
        assetId: outputAsset.id,
        imageUrl: outputAsset.url,
        isSelected: index === 0,
        isFavorite: false,
        metadata: job.mode === 'design-variants'
          ? {
              ...(providerOutput.metadata || {}),
              ...originalOutputMetadata,
              variantIndex: index,
              variantCode: readVariantCode(index),
              variantName: resolveVariantName(job.config, index),
              variantLabel: readVariantLabel(index),
              variantStyle,
              stylePackId: typeof job.config.stylePackId === 'string' ? job.config.stylePackId : 'interior-common',
              designDirection: buildDesignVariantDirectionLabel(job.config, index, variantStyle),
              changeScopeLabel: readVariantChangeScopeLabel(job.config),
              lockedItemsLabel: readVariantLocksLabel(job.config),
              strategyNote: readVariantStrategyNote(job.config, index),
              batchCount,
            }
          : job.mode === 'plan-colorize'
            ? {
                ...(providerOutput.metadata || {}),
                ...originalOutputMetadata,
                mode: 'plan-colorize',
                drawingType: typeof job.config.drawingType === 'string' ? job.config.drawingType : 'residential',
                template: typeof job.config.template === 'string' ? job.config.template : 'colored-plan',
                enableZoningColor: Boolean(job.config.enableZoningColor),
                enableRoomLabels: Boolean(job.config.enableRoomLabels),
                enableFurnitureEnhance: Boolean(job.config.enableFurnitureEnhance),
                enableCirculationArrows: Boolean(job.config.enableCirculationArrows),
                enableScaleEnhance: Boolean(job.config.enableScaleEnhance),
                enableLandscapeFill: Boolean(job.config.enableLandscapeFill),
                preserveLinework: job.config.preserveLinework !== false,
                planColorizeStyleIndex: index,
                selectedStyleId: planStyle.id,
                selectedStyleName: planStyle.name,
                selectedStylePromptHint: planStyle.promptHint,
                batchGroupId: typeof job.config.batchGroupId === 'string' ? job.config.batchGroupId : undefined,
                batchCount,
              }
          : isFloorplanMultiPlanJob(job)
            ? {
                ...(providerOutput.metadata || {}),
                ...originalOutputMetadata,
                mode: 'floorplan',
                step: 'floorplan_to_3d',
                floorplanOutputMode: 'multi',
                floorplanVariantType: typeof job.config.floorplanVariantType === 'string' ? job.config.floorplanVariantType : 'material_style',
                floorplanVariantFocus: typeof job.config.floorplanVariantFocus === 'string' ? job.config.floorplanVariantFocus : 'material_style',
                variantIndex: index,
                variantCode: readVariantCode(index),
                variantName: floorplanPlan?.variantName || resolveVariantName(job.config, index),
                variantLabel: readVariantLabel(index),
                selectedStyleId: floorplanPlan?.selectedStyleId,
                selectedStyleName: floorplanPlan?.selectedStyleName,
                selectedStylePromptHint: floorplanPlan?.stylePromptHint,
                layoutVariantId: floorplanPlan?.layoutVariantId,
                layoutVariantName: floorplanPlan?.layoutVariantName,
                layoutVariantPromptHint: floorplanPlan?.layoutPromptHint,
                batchGroupId: typeof job.config.batchGroupId === 'string' ? job.config.batchGroupId : undefined,
                batchCount,
              }
          : job.mode === 'material-replace'
            ? {
                ...(providerOutput.metadata || {}),
                ...originalOutputMetadata,
                mode: 'material-replace',
                targetObjectType: typeof job.config.targetObjectType === 'string' ? job.config.targetObjectType : undefined,
                targetMaterial: typeof job.config.targetMaterial === 'string' ? job.config.targetMaterial : undefined,
                materialPatternScale: typeof job.config.materialPatternScale === 'string' ? job.config.materialPatternScale : undefined,
                materialDirection: typeof job.config.materialDirection === 'string' ? job.config.materialDirection : undefined,
                materialFinish: typeof job.config.materialFinish === 'string' ? job.config.materialFinish : undefined,
                materialReplaceScope: typeof job.config.materialReplaceScope === 'string' ? job.config.materialReplaceScope : undefined,
              }
          : job.mode === 'panorama-roam-render'
            ? {
                ...(providerOutput.metadata || {}),
                ...originalOutputMetadata,
                mode: 'panorama-roam-render',
                panoramaAssetId: typeof job.config.panoramaAssetId === 'string' ? job.config.panoramaAssetId : job.inputAssetIds[0],
                sourceModelAssetId: typeof job.config.sourceModelAssetId === 'string' ? job.config.sourceModelAssetId : undefined,
                inputSource: 'panorama-capture',
              }
          : isObjectInsert
            ? {
                ...(providerOutput.metadata || {}),
                ...originalOutputMetadata,
                mode: job.mode,
                step: 'object_insert',
                businessFeature: 'object-insert',
                objectInsertDebugMode: readObjectInsertDebugMode(job.config),
                sourceImageAssetId: readObjectInsertJobConfig(job).sourceImageAssetId || job.inputAssetIds[0],
                objectReferenceAssetId: readObjectInsertJobConfig(job).objectReferenceAssetId || job.inputAssetIds[1],
                objectItems: readObjectInsertItemsFromJob(job),
                placementGuideAssetId: readObjectInsertJobConfig(job).previewAssetId || job.inputAssetIds[2],
                placementPreviewAssetId: readObjectInsertJobConfig(job).previewAssetId || job.inputAssetIds[2],
                placementMaskAssetId: readObjectInsertJobConfig(job).maskAssetId || job.inputAssetIds[3],
                objectPlacement: readObjectInsertJobConfig(job).placement,
                positionConstraintStrength: readObjectInsertJobConfig(job).positionConstraintStrength,
                placementMode: readObjectInsertJobConfig(job).placementMode,
                placementIntent: readObjectInsertJobConfig(job).placementIntent,
                harmonyPriority: readObjectInsertJobConfig(job).harmonyPriority,
                objectType: readObjectInsertJobConfig(job).objectType,
                objectInsertSurface: readObjectInsertJobConfig(job).objectInsertSurface,
                objectFidelity: readObjectInsertJobConfig(job).objectFidelity,
                enforceContactShadow: readObjectInsertJobConfig(job).enforceContactShadow,
                enforceOcclusion: readObjectInsertJobConfig(job).enforceOcclusion,
                enforcePerspectiveScale: readObjectInsertJobConfig(job).enforcePerspectiveScale,
                allowAutoAdjustPosition: readObjectInsertJobConfig(job).allowAutoAdjustPosition,
                allowAutoAdjustRotation: readObjectInsertJobConfig(job).allowAutoAdjustRotation,
                allowAutoAdjustScale: readObjectInsertJobConfig(job).allowAutoAdjustScale,
              }
          : {
              ...(providerOutput.metadata || {}),
              ...originalOutputMetadata,
            },
      });

      if (!firstOutput) firstOutput = output;
      markTiming(diagnostics, 'saveResultFinishedAt');
    }

    if (!firstOutput || !firstOutputAsset) {
      throw new Error('Provider did not return a generation result.');
    }

    const latestJob = await getGenerationJob(job.id);
    if (latestJob?.status === 'cancelled') {
      await updateGenerationJob(job.id, {
        progress: Math.min(latestJob.progress, 99),
        failureReason: latestJob.failureReason || 'cancelled',
        finishedAt: latestJob.finishedAt || new Date().toISOString(),
      });
      await refundGenerationJobCredits(job.id);
      return;
    }

    markTiming(diagnostics, 'jobFinishedAt', 'succeeded');
    finalizeDurations(diagnostics);
    logJobTiming(job.id, diagnostics);

    await updateGenerationJob(job.id, {
      status: 'succeeded',
      progress: 100,
      outputAssetId: firstOutputAsset.id,
      outputAssetIds,
      finishedAt: diagnostics.timing?.jobFinishedAt,
      diagnostics,
    });

    await createGenerationRecord({
      userId: job.userId,
      projectId: job.projectId,
      jobId: job.id,
      mode: job.mode,
      step: isObjectInsert ? 'object_insert' : job.step ?? readGenerationJobStep(job.config) ?? null,
      prompt: typeof job.config.userPrompt === 'string' ? job.config.userPrompt : job.prompt,
      inputImageUrl: await getInputAssetUrl(job.inputAssetIds[0], job.userId),
      outputImageUrl: firstOutputAsset.url,
      provider: firstOutput.provider,
      status: 'succeeded',
      sourceModelAssetId: typeof job.config.sourceModelAssetId === 'string' ? job.config.sourceModelAssetId : null,
      snapshotAssetId: typeof job.config.snapshotAssetId === 'string' ? job.config.snapshotAssetId : job.inputAssetIds[0] || null,
      modelSnapshotMetadata: readModelSnapshotMetadata(job.config.modelSnapshotMetadata),
    });
  } catch (error) {
    const providerError = normalizeProviderFailure(error);
    const message = providerError.userMessage || (error instanceof Error ? error.message : 'Generation failed.');
    if (providerError.userMessage || providerError.providerError || providerError.providerStatus || providerError.statusCode || providerError.rawSnippet) {
      diagnostics.provider = {
        ...diagnostics.provider,
        name: providerError.provider || diagnostics.provider?.name || provider.name,
        providerError: providerError.providerError,
        providerStatus: providerError.providerStatus,
        userMessage: providerError.userMessage,
        httpStatus: providerError.statusCode || diagnostics.provider?.httpStatus,
        statusCode: providerError.statusCode,
        rawSnippet: providerError.rawSnippet,
      };
    }
    const terminalStatus = isTimeoutGenerationFailure(error, providerError.statusCode) ? 'timeout' : 'failed';
    markTiming(diagnostics, 'jobFinishedAt', terminalStatus);
    finalizeDurations(diagnostics);
    logJobTiming(job.id, diagnostics, message);
    console.error('Generation job failed', { jobId: job.id, error: message });
    await updateGenerationJob(job.id, {
      status: terminalStatus,
      progress: 99,
      errorMessage: message,
      failureReason: message,
      finishedAt: diagnostics.timing?.jobFinishedAt,
      diagnostics,
    });
    await refundGenerationJobCredits(job.id);
  }
}

async function buildGenerateInputFromJob(job: GenerationJob): Promise<{
  input: GenerateImageInput;
  imageDiagnostics: NonNullable<GenerationJobDiagnostics['images']>;
  localInpaint?: LocalInpaintContext;
}> {
  const isPanoramaReferenceMode = job.mode === 'panorama-roam-render';
  const isObjectInsertMode = isObjectInsertJob(job);
  const isObjectInsertPreviewFusionMode = isObjectInsertMode && readObjectInsertPreviewFusionMode(job.config, job.mode);
  const isFreeReferenceImageMode = job.step === 'free_reference_image'
    || readGenerationJobStep(job.config) === 'free_reference_image';
  const objectInsertConfig = readObjectInsertJobConfig(job);
  const objectInsertDebugMode = isObjectInsertMode ? readObjectInsertDebugMode(job.config) : 'full';
  const objectInsertNeedsObject = isObjectInsertPreviewFusionMode ? false : objectInsertIncludesObject(objectInsertDebugMode);
  const objectInsertNeedsPreview = isObjectInsertPreviewFusionMode ? true : objectInsertIncludesPreview(objectInsertDebugMode);
  const objectInsertNeedsMask = isObjectInsertPreviewFusionMode ? false : objectInsertIncludesMask(objectInsertDebugMode);
  const objectInsertItems = isObjectInsertMode ? readObjectInsertItemsFromJob(job) : [];
  const objectReferenceAssetId = isObjectInsertMode ? objectInsertConfig.objectReferenceAssetId : '';
  const placementPreviewAssetId = isObjectInsertMode ? objectInsertConfig.previewAssetId : '';
  const placementMaskAssetId = isObjectInsertMode ? objectInsertConfig.maskAssetId : '';
  const materialReferenceAssetIds = isPanoramaReferenceMode || isObjectInsertMode || isFreeReferenceImageMode
    ? []
    : Array.from(new Set([
        ...readStringArray(job.config.materialTextureAssetIds),
        ...readStringArray(job.config.materialReferenceAssetIds),
      ]));
  const panoramaReferenceAssetIds = isPanoramaReferenceMode ? readStringArray(job.config.panoramaReferenceAssetIds).slice(0, 6) : [];
  const freeReferenceAssetIds = isFreeReferenceImageMode
    ? Array.from(new Set([
        ...readStringArray(job.config.referenceImageAssetIds),
        ...job.inputAssetIds.slice(1),
      ].filter(isNonEmptyString))).slice(0, 6)
    : [];
  const objectInsertOrderedAssetIds = isObjectInsertMode
    ? buildObjectInsertOrderedAssetIds({
        sourceAssetId: readConfigStringValue(job.config.sourceImageAssetId) || objectInsertConfig.sourceImageAssetId || job.inputAssetIds[0],
        items: objectInsertItems,
        needsObject: objectInsertNeedsObject,
        needsPreview: objectInsertNeedsPreview,
        needsMask: objectInsertNeedsMask,
        legacyObjectReferenceAssetId: objectReferenceAssetId || job.inputAssetIds[1],
        legacyPreviewAssetId: placementPreviewAssetId || job.inputAssetIds[objectInsertNeedsObject ? 2 : 1],
        legacyMaskAssetId: placementMaskAssetId || job.inputAssetIds[objectInsertNeedsObject && objectInsertNeedsPreview ? 3 : 2],
      })
    : [];
  const assetIds = isObjectInsertPreviewFusionMode
    ? [
        readConfigStringValue(job.config.sourceImageAssetId) || objectInsertConfig.sourceImageAssetId || job.inputAssetIds[0],
        placementPreviewAssetId || job.inputAssetIds[1],
      ].filter(isNonEmptyString)
    : isObjectInsertMode
    ? objectInsertOrderedAssetIds
    : isPanoramaReferenceMode
    ? Array.from(new Set([
        ...job.inputAssetIds,
        ...panoramaReferenceAssetIds,
      ].filter(isNonEmptyString))).slice(0, 1 + 6)
    : isFreeReferenceImageMode
    ? [
        readConfigStringValue(job.config.sourceImageAssetId) || job.inputAssetIds[0],
        ...freeReferenceAssetIds,
      ].filter(isNonEmptyString)
    : Array.from(new Set([
        ...job.inputAssetIds,
        ...materialReferenceAssetIds,
      ]));
  const imageDataUrls = await Promise.all(assetIds.map(assetId => getImageAssetDataUrl(assetId, job.userId)));
  const inputImageDataUrl = imageDataUrls[0];
  if (!inputImageDataUrl) {
    throw new Error('Input image asset was not found.');
  }

  const ownedMaterialReferenceImageDataUrls = isPanoramaReferenceMode || isObjectInsertMode || isFreeReferenceImageMode
    ? []
    : await getOwnedAssetDataUrls(materialReferenceAssetIds, job.userId, 3, 'material reference');
  const publicMaterialReferenceImageDataUrls = isPanoramaReferenceMode || isObjectInsertMode || isFreeReferenceImageMode
    ? []
    : await getMaterialTextureSourceDataUrls(job.config);
  const materialReferenceImageDataUrls = [
    ...ownedMaterialReferenceImageDataUrls,
    ...publicMaterialReferenceImageDataUrls,
  ].slice(0, 3);
  const furnitureReferenceImageDataUrls = isPanoramaReferenceMode || isObjectInsertMode || isFreeReferenceImageMode
    ? []
    : await getOwnedAssetDataUrls(readStringArray(job.config.furnitureReferenceAssetIds), job.userId, 3, 'furniture reference');
  const additionalImageDataUrls = imageDataUrls.slice(1).filter(isNonEmptyString);
  const objectInputDataUrls = isObjectInsertMode && !isObjectInsertPreviewFusionMode
    ? mapObjectInsertInputDataUrls(objectInsertItems, objectInsertOrderedAssetIds.slice(1), additionalImageDataUrls)
    : [];
  const objectReferenceImageDataUrl = isObjectInsertMode && objectInsertNeedsObject ? objectInputDataUrls[0] : undefined;
  const materialImageDataUrl = isObjectInsertMode
    ? objectReferenceImageDataUrl
    : isFreeReferenceImageMode ? undefined
    : isPanoramaReferenceMode ? undefined : materialReferenceImageDataUrls[0] || additionalImageDataUrls[0];
  const floorplanTextureUrls = job.mode === 'floorplan' ? await getFloorplanTextureDataUrls(job.config) : [];
  const referenceImageDataUrls = isObjectInsertPreviewFusionMode
    ? additionalImageDataUrls.slice(0, 1)
    : isObjectInsertMode
    ? objectInputDataUrls.slice(objectReferenceImageDataUrl ? 1 : 0)
    : isFreeReferenceImageMode
    ? additionalImageDataUrls.slice(0, 6)
    : isPanoramaReferenceMode
    ? additionalImageDataUrls.slice(0, 6)
    : [
        ...additionalImageDataUrls.slice(1).filter(url => !materialReferenceImageDataUrls.includes(url) && !furnitureReferenceImageDataUrls.includes(url)),
        ...floorplanTextureUrls,
      ];
  if (isObjectInsertPreviewFusionMode && process.env.NODE_ENV !== 'production') {
    console.debug('[ObjectInsert] object_insert_preview_fusion provider inputs', {
      jobId: job.id,
      mode: job.mode,
      step: job.step ?? readGenerationJobStep(job.config),
      objectInsertMode: 'object_insert_preview_fusion',
      inputAssetIds: assetIds,
      sourceImageAssetId: assetIds[0],
      placementPreviewAssetId: assetIds[1],
      providerImageCount: 1 + referenceImageDataUrls.length,
      materialImageIncluded: false,
      maskImageIncluded: false,
      furnitureReferencesIncluded: false,
      objectItemsCount: objectInsertItems.length,
    });
  }
  const isMaskedEditMode = job.mode === 'inpaint' || job.mode === 'material-replace' || isObjectInsertMode;
  const maskMode = isObjectInsertMode
    ? objectInsertNeedsMask && isMaskMode(job.config.maskMode) ? job.config.maskMode : undefined
    : isMaskedEditMode && isMaskMode(job.config.maskMode) ? job.config.maskMode : undefined;
  const maskAssetId = maskMode === 'asset-mask'
    ? readConfigStringValue(job.config.maskAssetId) || placementMaskAssetId || null
    : null;
  const maskImageDataUrl = maskMode === 'full-image'
    ? createFullImageMaskDataUrl()
    : maskAssetId ? await getImageAssetDataUrl(maskAssetId, job.userId) : undefined;
  const qualityMode = resolveQualityModeForJob(job);

  const targetDimensions = resolveQualityTargetDimensions(job.mode, qualityMode, await resolveTargetDimensions(job.mode, job.config, inputImageDataUrl));
  const rawInput: GenerateImageInput = {
    mode: job.mode,
    step: isObjectInsertMode ? 'object_insert' : job.step ?? readGenerationJobStep(job.config) ?? undefined,
    inputImageDataUrl,
    materialImageDataUrl,
    referenceImageDataUrls,
    materialReferenceImageDataUrls,
    furnitureReferenceImageDataUrls,
    maskImageDataUrl,
    maskMode,
    prompt: buildProviderPromptForJob(job, qualityMode),
    config: isObjectInsertMode
      ? {
          ...removeInternalConfig(job.config),
          objectInsertInputOrder: isObjectInsertPreviewFusionMode ? undefined : buildObjectInsertInputOrder(objectInsertItems, objectInsertNeedsObject, objectInsertNeedsPreview, objectInsertNeedsMask),
        }
      : removeInternalConfig(job.config),
    targetWidth: targetDimensions.targetWidth,
    targetHeight: targetDimensions.targetHeight,
    targetAspectRatio: targetDimensions.targetAspectRatio,
    editTarget: job.mode === 'material-replace' ? 'material' : isObjectInsertMode ? 'furniture' : readEditTarget(job.config.editTarget),
    qualityMode,
  };

  const localInpaint = await maybeCreateLocalInpaintContext(rawInput);
  const localReferenceImageDataUrls = localInpaint && isObjectInsertMode
    ? await Promise.all((rawInput.referenceImageDataUrls || []).map((dataUrl, offset) => {
        const imageIndex = (rawInput.materialImageDataUrl ? 3 : 2) + offset;
        return shouldCropObjectInsertReferenceImage(rawInput.config, imageIndex)
          ? cropImageDataUrlToBox(dataUrl, localInpaint.bbox)
          : dataUrl;
      }))
    : rawInput.referenceImageDataUrls;
  const providerInput = localInpaint
    ? {
        ...rawInput,
        inputImageDataUrl: localInpaint.cropImageDataUrl,
        referenceImageDataUrls: localReferenceImageDataUrls,
        maskImageDataUrl: localInpaint.cropMaskDataUrl,
        targetWidth: localInpaint.bbox.width,
        targetHeight: localInpaint.bbox.height,
        targetAspectRatio: getAspectRatioString(localInpaint.bbox.width, localInpaint.bbox.height),
        config: {
          ...rawInput.config,
          targetWidth: localInpaint.bbox.width,
          targetHeight: localInpaint.bbox.height,
          targetAspectRatio: getAspectRatioString(localInpaint.bbox.width, localInpaint.bbox.height),
          objectInsertLocalEdit: isObjectInsertMode || undefined,
          objectInsertLocalCropScale: isObjectInsertMode ? readObjectInsertLocalCropScale(rawInput.config) : undefined,
          objectInsertCropBbox: isObjectInsertMode ? localInpaint.bbox : undefined,
        },
      }
    : rawInput;
  const prepared = await prepareGenerateInputForProvider(providerInput);
  prepared.imageDiagnostics.localInpaintEnabled = Boolean(localInpaint);
  if (localInpaint) {
    prepared.imageDiagnostics.maskBbox = localInpaint.bbox;
    prepared.imageDiagnostics.originalWidth = localInpaint.originalWidth;
    prepared.imageDiagnostics.originalHeight = localInpaint.originalHeight;
    prepared.imageDiagnostics.maskWidth = localInpaint.maskWidth;
    prepared.imageDiagnostics.maskHeight = localInpaint.maskHeight;
    prepared.imageDiagnostics.furnitureReferenceCount = rawInput.furnitureReferenceImageDataUrls?.length || 0;
    prepared.imageDiagnostics.localEditMode = isObjectInsertMode ? 'object_insert_crop' : 'masked_crop';
    prepared.imageDiagnostics.localCropScale = isObjectInsertMode ? readObjectInsertLocalCropScale(rawInput.config) : undefined;
  }
  return { ...prepared, localInpaint: localInpaint || undefined };
}

async function resolveTargetDimensions(
  mode: GenerationRecord['mode'],
  config: Record<string, unknown>,
  inputImageDataUrl: string,
): Promise<{ targetWidth?: number; targetHeight?: number; targetAspectRatio?: string }> {
  const configWidth = isValidTargetDimension(config.targetWidth) ? config.targetWidth : undefined;
  const configHeight = isValidTargetDimension(config.targetHeight) ? config.targetHeight : undefined;
  if (configWidth && configHeight) {
    return {
      targetWidth: configWidth,
      targetHeight: configHeight,
      targetAspectRatio: typeof config.targetAspectRatio === 'string' ? config.targetAspectRatio : getAspectRatioString(configWidth, configHeight, mode),
    };
  }

  try {
    const size = await getImageSizeFromDataUrl(inputImageDataUrl);
    return {
      targetWidth: size.width,
      targetHeight: size.height,
      targetAspectRatio: typeof config.targetAspectRatio === 'string' ? config.targetAspectRatio : getAspectRatioString(size.width, size.height, mode),
    };
  } catch (error) {
    console.warn('Unable to infer target image size; generated output will not be resized.', {
      error: error instanceof Error ? error.message : 'unknown error',
    });
    return {};
  }
}

function resolveQualityTargetDimensions(
  mode: GenerationRecord['mode'],
  qualityMode: QualityMode,
  dimensions: { targetWidth?: number; targetHeight?: number; targetAspectRatio?: string },
): { targetWidth?: number; targetHeight?: number; targetAspectRatio?: string } {
  if (mode === 'panorama-roam-render' && (qualityMode === 'draft' || qualityMode === 'fast')) {
    return { targetWidth: 1024, targetHeight: 512, targetAspectRatio: '2:1' };
  }

  return dimensions;
}

export async function prepareGenerateInputForProvider(input: GenerateImageInput): Promise<{ input: GenerateImageInput; imageDiagnostics: NonNullable<GenerationJobDiagnostics['images']> }> {
  const settings = resolveProviderImageSettings(input.qualityMode);
  const prepared: Array<{ role: string; image: PreparedProviderImage }> = [];

  const inputImage = await prepareImageForProvider({
    dataUrl: input.inputImageDataUrl,
    maxLongSide: settings.imageMaxLongSide,
    quality: settings.quality,
    preferMime: 'image/jpeg',
  });
  prepared.push({ role: 'input', image: inputImage });

  const materialImage = input.materialImageDataUrl
    ? await prepareReferenceImage(input.materialImageDataUrl, 'material', settings.referenceMaxLongSide, settings.quality, prepared)
    : undefined;
  const remainingAfterMaterial = Math.max(0, settings.maxReferenceImages - (materialImage ? 1 : 0));
  const materialReferences = await prepareReferenceImages(input.materialReferenceImageDataUrls, 'material-reference', Math.min(3, remainingAfterMaterial), settings.referenceMaxLongSide, settings.quality, prepared);
  const remainingAfterMaterialRefs = Math.max(0, remainingAfterMaterial - materialReferences.length);
  const furnitureReferences = await prepareReferenceImages(input.furnitureReferenceImageDataUrls, 'furniture-reference', Math.min(3, remainingAfterMaterialRefs), settings.referenceMaxLongSide, settings.quality, prepared);
  const remainingReferenceSlots = Math.max(0, remainingAfterMaterialRefs - furnitureReferences.length);
  const additionalReferences = await prepareReferenceImages(input.referenceImageDataUrls, 'reference', remainingReferenceSlots, settings.referenceMaxLongSide, settings.quality, prepared);
  let maskImage: PreparedProviderImage | undefined;
  if (input.maskImageDataUrl) {
    maskImage = await prepareMaskForProvider({
      dataUrl: input.maskImageDataUrl,
      width: inputImage.width,
      height: inputImage.height,
    });
    prepared.push({ role: 'mask', image: maskImage });
  }

  const images = prepared.map(item => item.image);
  const referenceItems = prepared.filter(item => item.role !== 'input' && item.role !== 'mask');
  const payloadBytesApprox = images.reduce((sum, image) => sum + image.outputBytes, 0);
  if (payloadBytesApprox > settings.maxPayloadBytes) {
    throw new Error('参考图过多或图片过大，请减少参考图数量或压缩图片后重试。');
  }

  return {
    input: {
      ...input,
      inputImageDataUrl: inputImage.dataUrl,
      materialImageDataUrl: materialImage?.dataUrl,
      materialReferenceImageDataUrls: materialReferences.map(image => image.dataUrl),
      furnitureReferenceImageDataUrls: furnitureReferences.map(image => image.dataUrl),
      referenceImageDataUrls: additionalReferences.map(image => image.dataUrl),
      maskImageDataUrl: maskImage?.dataUrl,
      qualityMode: settings.qualityMode,
    },
    imageDiagnostics: {
      qualityMode: settings.qualityMode,
      inputImages: 1,
      referenceImages: images.length - 1,
      referenceCount: referenceItems.length,
      inputBytesBefore: inputImage.originalBytes,
      inputBytesAfter: inputImage.outputBytes,
      inputWidthBefore: inputImage.originalWidth,
      inputHeightBefore: inputImage.originalHeight,
      inputWidthAfter: inputImage.width,
      inputHeightAfter: inputImage.height,
      referenceBytesBefore: referenceItems.reduce((sum, item) => sum + item.image.originalBytes, 0),
      referenceBytesAfter: referenceItems.reduce((sum, item) => sum + item.image.outputBytes, 0),
      payloadBytesApprox,
      prepared: prepared.map(item => ({
        role: item.role,
        width: item.image.width,
        height: item.image.height,
        originalWidth: item.image.originalWidth,
        originalHeight: item.image.originalHeight,
        originalBytes: item.image.originalBytes,
        outputBytes: item.image.outputBytes,
        mime: item.image.mime,
      })),
    },
  };
}

async function maybeCreateLocalInpaintContext(input: GenerateImageInput): Promise<LocalInpaintContext | null> {
  if (input.mode !== 'inpaint' && input.mode !== 'material-replace') return null;
  if (input.maskMode !== 'asset-mask' || !input.maskImageDataUrl) return null;
  const isObjectInsert = isObjectInsertInput(input);

  return createLocalInpaintContext({
    inputImageDataUrl: input.inputImageDataUrl,
    maskImageDataUrl: input.maskImageDataUrl,
    paddingRatio: isObjectInsert ? undefined : Number(process.env.LOCAL_INPAINT_PADDING_RATIO || 0.15),
    cropScale: isObjectInsert ? readObjectInsertLocalCropScale(input.config) : undefined,
    maxAreaRatio: isObjectInsert
      ? Number(process.env.OBJECT_INSERT_LOCAL_CROP_MAX_AREA_RATIO || 0.85)
      : Number(process.env.LOCAL_INPAINT_MAX_AREA_RATIO || 0.65),
  });
}

function readObjectInsertLocalCropScale(config?: Record<string, unknown>): number {
  const envValue = process.env.OBJECT_INSERT_LOCAL_CROP_SCALE;
  const parsed = envValue ? Number(envValue) : Number.NaN;
  if (Number.isFinite(parsed)) return Math.min(2.2, Math.max(1.6, parsed));
  const preference = readObjectInsertFusionPreference(config || {});
  const defaultScale = preference === 'conservative' ? 1.65 : preference === 'design' ? 2.15 : 1.9;
  return Math.min(2.2, Math.max(1.6, defaultScale));
}

function shouldCropObjectInsertReferenceImage(config: Record<string, unknown>, imageIndex: number): boolean {
  const rawOrder = Array.isArray(config.objectInsertInputOrder) ? config.objectInsertInputOrder.filter(isRecord) : [];
  if (rawOrder.length === 0) return true;
  const referenceIndexes = new Set<number>();
  const controlIndexes = new Set<number>();
  for (const order of rawOrder) {
    for (const referenceIndex of readNumberArray(order.referenceImageIndexes)) referenceIndexes.add(referenceIndex);
    const guideIndex = readPositiveNumber(order.placementGuideImageIndex);
    if (guideIndex) controlIndexes.add(guideIndex);
    const maskIndex = readPositiveNumber(order.placementMaskImageIndex);
    if (maskIndex) controlIndexes.add(maskIndex);
  }
  if (controlIndexes.has(imageIndex)) return true;
  if (referenceIndexes.has(imageIndex)) return false;
  return true;
}

function readNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map(readPositiveNumber).filter((item): item is number => typeof item === 'number') : [];
}

function readPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function isObjectInsertInput(input: GenerateImageInput): boolean {
  return input.step === 'object_insert'
    || input.config.step === 'object_insert'
    || isRecord(input.config.objectInsert);
}

function isFloorplanMultiPlanJob(job: GenerationJob): boolean {
  return job.mode === 'floorplan' && job.config.floorplanOutputMode === 'multi';
}

export function resolveProviderImageSettings(qualityMode: QualityMode | undefined): ProviderImageSettings {
  const mode = qualityMode || readDefaultQualityMode();
  const defaults = providerImageDefaults[mode];

  return {
    qualityMode: mode,
    imageMaxLongSide: readPositiveInteger(process.env.PROVIDER_IMAGE_MAX_LONG_SIDE, defaults.imageMaxLongSide),
    referenceMaxLongSide: readPositiveInteger(process.env.PROVIDER_REFERENCE_MAX_LONG_SIDE, defaults.referenceMaxLongSide),
    quality: readPositiveInteger(process.env.PROVIDER_IMAGE_JPEG_QUALITY, defaults.quality),
    maxReferenceImages: readPositiveInteger(process.env.MAX_PROVIDER_REFERENCE_IMAGES, defaults.maxReferenceImages),
    maxPayloadBytes: readPositiveInteger(process.env.MAX_PROVIDER_PAYLOAD_BYTES, defaults.maxPayloadBytes),
  };
}

async function prepareReferenceImages(
  dataUrls: string[] | undefined,
  role: string,
  maxCount: number,
  maxLongSide: number,
  quality: number,
  prepared: Array<{ role: string; image: PreparedProviderImage }>,
): Promise<PreparedProviderImage[]> {
  const results: PreparedProviderImage[] = [];
  for (const dataUrl of (dataUrls || []).filter(isNonEmptyString).slice(0, maxCount)) {
    results.push(await prepareReferenceImage(dataUrl, role, maxLongSide, quality, prepared));
  }
  return results;
}

async function prepareReferenceImage(
  dataUrl: string,
  role: string,
  maxLongSide: number,
  quality: number,
  prepared: Array<{ role: string; image: PreparedProviderImage }>,
  preferMime: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg',
): Promise<PreparedProviderImage> {
  const image = await prepareImageForProvider({ dataUrl, maxLongSide, quality, preferMime });
  prepared.push({ role, image });
  return image;
}

function getAspectRatioString(width: number, height: number, mode?: GenerationRecord['mode']): string {
  const ratio = width / height;
  if (mode === 'panorama-roam-render' && Math.abs(ratio - 2) <= 0.12) {
    return '2:1';
  }
  const candidates = [
    { value: '1:1', ratio: 1 },
    { value: '4:3', ratio: 4 / 3 },
    { value: '3:4', ratio: 3 / 4 },
    { value: '16:9', ratio: 16 / 9 },
    { value: '9:16', ratio: 9 / 16 },
  ];
  const best = candidates.reduce((currentBest, candidate) => (
    Math.abs(candidate.ratio - ratio) < Math.abs(currentBest.ratio - ratio) ? candidate : currentBest
  ));
  if (mode === 'model-render' && Math.abs(best.ratio - ratio) > 0.08) {
    return 'auto';
  }
  return best.value;
}

async function getOwnedAssetDataUrls(assetIds: string[], userId: string, maxCount: number, label: string): Promise<string[]> {
  const uniqueAssetIds = Array.from(new Set(assetIds)).slice(0, maxCount);
  const dataUrls: string[] = [];
  for (const assetId of uniqueAssetIds) {
    const dataUrl = await getImageAssetDataUrl(assetId, userId);
    if (!dataUrl) {
      throw new Error(`${label} image asset was not found.`);
    }
    dataUrls.push(dataUrl);
  }
  return dataUrls;
}

function createFullImageMaskDataUrl(): string {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#fff"/></svg>';
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function getImageAssetDataUrl(assetId: string | undefined, userId: string): Promise<string | undefined> {
  if (!assetId) return undefined;
  const asset = await getImageAsset(assetId, userId);
  if (!asset) return undefined;

  if (asset.url.startsWith('data:')) {
    return asset.url;
  }

  if (isRemoteImageUrl(asset.url)) {
    return readRemoteImageUrlAsDataUrl(asset.url, asset.mimeType);
  }

  if (!asset.url.startsWith('/uploads/')) {
    return undefined;
  }

  const filePath = resolveUploadUrlToPath(asset.url);
  const content = await readFile(filePath);
  return `data:${asset.mimeType};base64,${content.toString('base64')}`;
}

async function getInputAssetUrl(assetId: string | undefined, userId: string): Promise<string | null> {
  if (!assetId) return null;
  const asset = await getImageAsset(assetId, userId);
  return asset?.url ?? null;
}

async function saveGeneratedDataUrl(userId: string, dataUrl: string, basename: string): Promise<ImageAsset> {
  const parsed = parseDataUrl(dataUrl);
  const extension = getExtensionForMimeType(parsed.mimeType);
  const storedFile = await fileStorageProvider.uploadImage({
    content: parsed.content,
    filename: createStoredFilename(extension, basename),
    mimeType: parsed.mimeType,
    userId,
  });

  return createImageAsset({
    userId,
    url: storedFile.url,
    filename: storedFile.filename,
    mimeType: storedFile.mimeType,
    size: storedFile.size,
  });
}

interface OriginalOutputMetadata {
  width: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
}

async function readImageDataUrlMetadata(dataUrl: string): Promise<OriginalOutputMetadata> {
  const parsed = parseRawImageDataUrl(dataUrl);
  const size = await getImageSizeFromDataUrl(dataUrl);
  return {
    width: size.width,
    height: size.height,
    mimeType: parsed.mimeType,
    sizeBytes: parsed.content.length,
  };
}

function buildOriginalOutputMetadata(
  outputAsset: ImageAsset,
  saved: OriginalOutputMetadata,
  providerOriginal: OriginalOutputMetadata,
): Record<string, unknown> {
  return {
    width: saved.width,
    height: saved.height,
    mimeType: saved.mimeType,
    sizeBytes: saved.sizeBytes,
    outputAssetId: outputAsset.id,
    originalAssetId: outputAsset.id,
    outputUrl: outputAsset.url,
    originalUrl: outputAsset.url,
    originalWidth: saved.width,
    originalHeight: saved.height,
    originalMimeType: saved.mimeType,
    originalSizeBytes: saved.sizeBytes,
    providerOriginalWidth: providerOriginal.width,
    providerOriginalHeight: providerOriginal.height,
    providerOriginalMimeType: providerOriginal.mimeType,
    providerOriginalSizeBytes: providerOriginal.sizeBytes,
  };
}

function parseDataUrl(dataUrl: string): { mimeType: string; content: Buffer } {
  return parseImageDataUrl(dataUrl, 'Provider output');
}

function getExtensionForMimeType(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  return 'png';
}

function resolveUploadUrlToPath(url: string): string {
  const relativePath = decodeURIComponent(url.replace(/^\/uploads\//u, ''));
  const resolvedPath = path.resolve(uploadsDir, relativePath);
  const rootPath = path.resolve(uploadsDir);
  if (!resolvedPath.startsWith(rootPath)) {
    throw new Error('Upload path is outside the uploads directory.');
  }

  return resolvedPath;
}

async function getFloorplanTextureDataUrls(config: Record<string, unknown>): Promise<string[]> {
  return getMaterialTextureSourceDataUrls(config);
}

async function getMaterialTextureSourceDataUrls(config: Record<string, unknown>): Promise<string[]> {
  const sources = Array.isArray(config.materialTextureSources) ? config.materialTextureSources : [];
  const urls = sources
    .map(source => isRecord(source) && typeof source.url === 'string' ? source.url : undefined)
    .filter(isNonEmptyString);
  const dataUrls: string[] = [];
  for (const url of urls) {
    try {
      const dataUrl = await readReferenceUrlAsProviderInput(url);
      if (dataUrl) dataUrls.push(dataUrl);
    } catch (error) {
      console.warn('Unable to read material texture reference; skipping it.', {
        url,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }
  return dataUrls;
}

async function readReferenceUrlAsProviderInput(url: string): Promise<string | undefined> {
  if (url.startsWith('data:image/')) return url;
  if (isRemoteImageUrl(url)) return readRemoteImageUrlAsDataUrl(url);
  if (!url.startsWith('/materials/')) return undefined;

  const filePath = resolvePublicUrlToPath(url);
  const content = await readFile(filePath);
  const mimeType = getMimeTypeForImagePath(filePath);
  return `data:${mimeType};base64,${content.toString('base64')}`;
}

function resolvePublicUrlToPath(url: string): string {
  const relativePath = decodeURIComponent(url.replace(/^\/+/u, ''));
  const publicRoot = path.resolve('public');
  const resolvedPath = path.resolve(publicRoot, relativePath);
  if (!resolvedPath.startsWith(publicRoot)) {
    throw new Error('Reference image path is outside the public directory.');
  }
  return resolvedPath;
}

function getMimeTypeForImagePath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.png') return 'image/png';
  return 'image/png';
}

async function readRemoteImageUrlAsDataUrl(url: string, fallbackMimeType = 'image/png'): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to download image URL: HTTP ${response.status}.`);
  }

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType && !contentType.startsWith('image/')) {
    throw new Error('Downloaded URL did not return an image.');
  }
  const mimeType = contentType || fallbackMimeType;

  const content = Buffer.from(await response.arrayBuffer());
  if (content.length === 0) {
    throw new Error('Downloaded image URL was empty.');
  }

  const maxBytes = maxImageMb * 1024 * 1024;
  if (Number.isFinite(maxBytes) && maxBytes > 0 && content.length > maxBytes) {
    throw new Error(`Downloaded image exceeds ${maxImageMb}MB.`);
  }

  return `data:${mimeType};base64,${content.toString('base64')}`;
}

function isRemoteImageUrl(url: string): boolean {
  return /^https?:\/\//iu.test(url);
}

async function generateWithFallback(input: GenerateImageInput): Promise<GenerateImageOutput> {
  if (provider.name === 'mock') {
    const startedAt = Date.now();
    return withProviderDuration(await normalizeProviderOutput(await provider.generateImage(input), provider.name), startedAt);
  }

  const startedAt = Date.now();
  try {
    return withProviderDuration(await normalizeProviderOutput(await provider.generateImage(input), provider.name), startedAt);
  } catch (error) {
    const fallbackProvider = createConfiguredFallbackProvider(error);
    if (fallbackProvider) {
      const message = error instanceof Error ? error.message : `${provider.name} provider failed.`;
      console.warn('Generation provider fallback activated', {
        from: provider.name,
        to: fallbackProvider.name,
        reason: message,
      });
      const fallbackOutput = await fallbackProvider.generateImage(input);
      return withProviderDuration(await normalizeProviderOutput({
        ...(isRecord(fallbackOutput) ? fallbackOutput : {}),
        metadata: {
          ...(isRecord(fallbackOutput) && isRecord(fallbackOutput.metadata) ? fallbackOutput.metadata : {}),
          fallbackProvider: fallbackProvider.name,
          fallbackReason: message,
        },
      }, fallbackProvider.name), startedAt);
    }

    if (isMissingProviderSecretError(error) || isGrsaiProvider(provider.name)) {
      throw error;
    }

    if (!isProviderFallbackEnabled()) {
      throw error;
    }

    const message = error instanceof Error ? error.message : `${provider.name} provider failed.`;
    return withProviderDuration(await normalizeProviderOutput(createMockGeneration(input, [
      `${provider.name} provider failed to complete this generation: ${message}`,
      '已自动回退到 mock provider，避免请求中断。',
    ]), 'mock'), startedAt);
  }
}

function withProviderDuration(output: GenerateImageOutput, startedAt: number): GenerateImageOutput {
  const existing = output.metadata?.providerDurationMs;
  return {
    ...output,
    metadata: {
      ...output.metadata,
      providerDurationMs: typeof existing === 'number' ? existing : Date.now() - startedAt,
    },
  };
}

function toGenerateResponseBody(output: GenerateImageOutput, outputImageUrl: string | null = null): GenerateResponseBody {
  return {
    id: output.id,
    provider: output.provider,
    imageDataUrl: output.dataUrl,
    imageUrl: outputImageUrl,
    outputImageUrl,
    createdAt: output.createdAt,
    warnings: output.warnings,
  };
}

async function normalizeProviderOutput(output: unknown, fallbackProvider: ProviderName): Promise<GenerateImageOutput> {
  if (!isRecord(output)) {
    throw createProviderOutputError('Generation provider returned a non-object response.', output, fallbackProvider);
  }

  const providerName = isProviderName(output.provider) ? output.provider : fallbackProvider;
  const extracted = readProviderImageReference(output);
  let dataUrl = typeof output.dataUrl === 'string' ? output.dataUrl : extracted?.value;
  let remoteUrl = typeof output.remoteUrl === 'string' ? output.remoteUrl : undefined;
  let mimeType = typeof output.mimeType === 'string' ? output.mimeType : undefined;

  if (!isNonEmptyString(dataUrl)) {
    throw createProviderOutputError(
      'Generation provider did not return an image. Expected dataUrl, imageDataUrl, url/imageUrl, urls/images/output/results, or equivalent fields.',
      output,
      providerName,
    );
  }

  if (isRemoteImageUrl(dataUrl)) {
    remoteUrl = dataUrl;
    dataUrl = await readRemoteImageUrlAsDataUrl(dataUrl);
  }

  const parsed = parseImageDataUrl(dataUrl, 'Generation provider output', output, providerName);
  const metadata = isRecord(output.metadata) ? output.metadata : {};
  mimeType = mimeType || parsed.mimeType;

  return {
    id: isNonEmptyString(output.id) ? output.id : randomUUID(),
    provider: providerName,
    dataUrl: `data:${parsed.mimeType};base64,${parsed.content.toString('base64')}`,
    remoteUrl,
    mimeType,
    metadata: {
      ...metadata,
      normalizedOutputSource: extracted?.path,
      normalizedOutputKind: remoteUrl ? 'remote-url' : 'data-url',
    },
    createdAt: isNonEmptyString(output.createdAt) ? output.createdAt : new Date().toISOString(),
    warnings: Array.isArray(output.warnings) && output.warnings.every(item => typeof item === 'string') ? output.warnings : [],
  };
}

interface ProviderImageReference {
  value: string;
  path: string;
}

function readProviderImageReference(output: unknown): ProviderImageReference | null {
  return collectProviderImageReferences(output, '$').at(0) || null;
}

function collectProviderImageReferences(value: unknown, pathLabel: string, keyHint = '', depth = 0): ProviderImageReference[] {
  if (depth > 6) return [];

  if (typeof value === 'string') {
    const imageReference = normalizeProviderImageString(value, keyHint);
    return imageReference ? [{ value: imageReference, path: pathLabel }] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectProviderImageReferences(item, `${pathLabel}[${index}]`, keyHint, depth + 1));
  }

  if (!isRecord(value)) return [];

  const preferredKeys = [
    'dataUrl',
    'imageDataUrl',
    'imageUrl',
    'outputImageUrl',
    'url',
    'remoteUrl',
    'urls',
    'images',
    'image',
    'output',
    'outputs',
    'result',
    'results',
    'data',
    'content',
    'b64_json',
    'base64',
  ];
  const collected: ProviderImageReference[] = [];
  const seen = new Set<string>();

  for (const key of preferredKeys) {
    if (!(key in value)) continue;
    seen.add(key);
    collected.push(...collectProviderImageReferences(value[key], `${pathLabel}.${key}`, key, depth + 1));
  }

  for (const [key, child] of Object.entries(value)) {
    if (seen.has(key) || !isLikelyImageContainerKey(key)) continue;
    collected.push(...collectProviderImageReferences(child, `${pathLabel}.${key}`, key, depth + 1));
  }

  return collected;
}

function normalizeProviderImageString(value: string, keyHint: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^data:/iu.test(trimmed) || isRemoteImageUrl(trimmed)) return trimmed;
  if (/^(b64_json|base64)$/iu.test(keyHint) && /^[a-z0-9+/=\s]+$/iu.test(trimmed)) {
    return `data:image/png;base64,${trimmed.replace(/\s/g, '')}`;
  }
  return null;
}

function isLikelyImageContainerKey(key: string): boolean {
  return /(image|img|url|output|result|data|content|base64|b64)/iu.test(key);
}

function parseImageDataUrl(dataUrl: string, context: string, rawOutput?: unknown, providerName?: ProviderName): { mimeType: string; content: Buffer } {
  const match = /^data:(image\/[a-z0-9.+-]+)(?:;charset=[^;,]+)?;base64,([a-z0-9+/=\s]+)$/iu.exec(dataUrl);
  if (!match) {
    throw createProviderOutputError(
      `${context} returned an invalid image data URL. Expected format: data:image/...;base64,<base64>.`,
      rawOutput ?? dataUrl,
      providerName,
    );
  }

  const base64 = match[2].replace(/\s/g, '');
  const content = Buffer.from(base64, 'base64');
  if (content.length === 0) {
    throw createProviderOutputError(`${context} returned an empty image data URL.`, rawOutput ?? dataUrl, providerName);
  }

  return {
    mimeType: match[1].toLowerCase(),
    content,
  };
}

function createProviderOutputError(message: string, rawOutput: unknown, providerName?: ProviderName): Error {
  const error = new Error(message) as Error & {
    provider?: string;
    providerError?: string;
    providerStatus?: string;
    userMessage?: string;
    rawSnippet?: string;
  };
  error.provider = providerName;
  error.providerError = 'invalid_provider_output';
  error.providerStatus = 'failed';
  error.userMessage = message;
  error.rawSnippet = createRawSnippet(rawOutput);
  return error;
}

function createRawSnippet(value: unknown): string {
  return sanitizeProviderSnippet(value).slice(0, 800);
}

function sanitizeProviderSnippet(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, child) => {
      if (typeof child !== 'string') return child;
      if (child.startsWith('data:image/')) return `${child.slice(0, 64)}...[data-url omitted, length=${child.length}]`;
      if (child.length > 500) return `${child.slice(0, 500)}...[truncated, length=${child.length}]`;
      return child;
    }) || String(value);
  } catch {
    return String(value);
  }
}

function isProviderName(value: unknown): value is ProviderName {
  return value === 'mock' || value === 'gemini' || value === 'grsai-banana2' || value === 'grsai-nano-banana';
}

function createConfiguredFallbackProvider(error: unknown): ImageGenerationProvider | null {
  const fallbackName = process.env.GENERATION_FALLBACK_PROVIDER;
  if (!fallbackName || !isRetryableProviderFailure(error)) return null;

  if (fallbackName === 'gemini') {
    const apiKey = process.env.GEMINI_API_KEY;
    return apiKey ? createGeminiProvider(apiKey) : null;
  }

  if (fallbackName === 'mock') {
    return mockProvider;
  }

  return null;
}

function isRetryableProviderFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (isSafetyRejectedProviderError(error)) return false;
  const status = readErrorStatus(error);
  return error.message.includes('timed out')
    || isProviderMaintenanceError(error)
    || status === 429
    || (typeof status === 'number' && status >= 500);
}

function normalizeProviderFailure(error: unknown): {
  provider?: string;
  providerError?: string;
  providerStatus?: string;
  userMessage?: string;
  statusCode?: number;
  rawSnippet?: string;
} {
  const provider = readErrorStringField(error, 'provider');
  const safetyRejected = isSafetyRejectedProviderError(error);
  const providerError = readErrorStringField(error, 'providerError')
    || (safetyRejected ? 'PROVIDER_SAFETY_REJECTED' : undefined)
    || (isProviderMaintenanceError(error) ? 'model maintenance' : undefined);
  const providerStatus = readErrorStringField(error, 'providerStatus') || (providerError ? 'failed' : undefined);
  const userMessage = readErrorStringField(error, 'userMessage')
    || (safetyRejected ? 'AI 平台安全策略拒绝了本次生成。请根据平台返回原因调整输入图片或描述后重试。' : undefined)
    || (isProviderMaintenanceError(error) ? providerMaintenanceUserMessage : undefined);
  const statusCode = error instanceof Error ? readErrorStatus(error) : undefined;
  const rawSnippet = readErrorStringField(error, 'rawSnippet');

  if (!provider && !providerError && !providerStatus && !userMessage && typeof statusCode !== 'number' && !rawSnippet) return {};

  return {
    provider,
    providerError,
    providerStatus,
    userMessage,
    statusCode,
    rawSnippet,
  };
}

function isProviderMaintenanceError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const providerError = readErrorStringField(error, 'providerError');
  const userMessage = readErrorStringField(error, 'userMessage');
  return error.message.toLowerCase().includes('model maintenance')
    || providerError?.toLowerCase() === 'model maintenance'
    || userMessage === providerMaintenanceUserMessage;
}

function isSafetyRejectedProviderError(error: unknown): boolean {
  if (!(error instanceof Error) && !isRecord(error)) return false;
  const text = [
    error instanceof Error ? error.message : '',
    readErrorStringField(error, 'providerError'),
    readErrorStringField(error, 'providerStatus'),
    readErrorStringField(error, 'userMessage'),
    readErrorStringField(error, 'rawSnippet'),
  ].filter(isNonEmptyString).join(' ').toLowerCase();
  return /safety|policy|moderation|violation|rejected|blocked|unsafe|sensitive|违规|安全策略|内容审核|拒绝/iu.test(text);
}

function readErrorStringField(error: unknown, field: string): string | undefined {
  if (!isRecord(error)) return undefined;
  const value = error[field];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isValidImageDataUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const match = /^data:([^;,]+)((?:;[^,]*)?),(.*)$/u.exec(value);
  return Boolean(match && match[1].startsWith('image/') && match[3].length > 0);
}

function selectProvider(): ImageGenerationProvider {
  const requestedProvider = readRequestedProviderName();
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const grsaiApiKey = process.env.GRSAI_API_KEY;

  if (requestedProvider === 'grsai-banana2' || requestedProvider === 'grsai') {
    if (!grsaiApiKey) {
      console.warn(`${readRequestedProviderVariableName()}=${requestedProvider} but GRSAI_API_KEY is missing; generation calls will fail clearly.`);
    }
    return createGrsaiBanana2Provider({ apiKey: grsaiApiKey });
  }

  if (requestedProvider === 'grsai-nano-banana') {
    if (!grsaiApiKey) {
      console.warn('AI_PROVIDER=grsai-nano-banana but GRSAI_API_KEY is missing; generation calls will fail clearly.');
    }
    return createGrsaiNanoBananaProvider({ apiKey: grsaiApiKey });
  }

  if (requestedProvider === 'gemini' && geminiApiKey) {
    return createGeminiProvider(geminiApiKey);
  }

  if (requestedProvider === 'gemini' && !geminiApiKey) {
    console.warn(`${readRequestedProviderVariableName()}=gemini but GEMINI_API_KEY is missing; generation calls will fail clearly. Use AI_PROVIDER=mock for local mock generation.`);
    return createMissingSecretProvider('gemini', 'GEMINI_API_KEY');
  }

  return mockProvider;
}

function createMissingSecretProvider(name: ProviderName, envVarName: string): ImageGenerationProvider {
  return {
    name,
    async generateImage(): Promise<GenerateImageOutput> {
      const error = new Error(`${envVarName} is required when ${readRequestedProviderVariableName()}=${name}. Use AI_PROVIDER=mock for local mock generation.`) as Error & {
        provider?: string;
        providerError?: string;
        providerStatus?: string;
        userMessage?: string;
      };
      error.provider = name;
      error.providerError = 'missing_provider_secret';
      error.providerStatus = 'configuration_error';
      error.userMessage = `${envVarName} 未配置，无法调用 ${name}。如需本地测试，请设置 AI_PROVIDER=mock。`;
      return Promise.reject(error);
    },
  };
}

function readRequestedProviderName(): string {
  return process.env.GENERATION_PROVIDER || process.env.AI_PROVIDER || 'mock';
}

function readRequestedProviderVariableName(): string {
  return process.env.GENERATION_PROVIDER ? 'GENERATION_PROVIDER' : 'AI_PROVIDER';
}

function removeInternalConfig(config: Record<string, unknown>): Record<string, unknown> {
  const { __diagnostics: _diagnostics, ...publicConfig } = config;
  return publicConfig;
}

const defaultVariantStylesByCount: Record<2 | 4 | 8, string[]> = {
  2: ['modern-minimal', 'natural-wood'],
  4: ['modern-minimal', 'cream-style', 'light-luxury', 'natural-wood'],
  8: ['modern-minimal', 'cream-style', 'wabi-sabi', 'light-luxury', 'natural-wood', 'premium-gray', 'industrial', 'hotel-lobby'],
};

const variantStylePrompts: Record<string, string> = {
  'modern-minimal': 'Direction: modern minimalist, clean lines, calm neutral palette, refined materials.',
  'wabi-sabi': 'Direction: wabi-sabi, natural textures, warm muted tones, imperfect handcrafted feeling.',
  'cream-style': 'Direction: warm cream style, soft beige palette, cozy lighting, gentle materials.',
  'light-luxury': 'Direction: modern light luxury, premium stone, metal accents, elegant lighting.',
  industrial: 'Direction: industrial style, exposed texture, darker tones, metal and concrete.',
  'commercial-showroom': 'Direction: commercial showroom, clear display focus, polished materials, attractive lighting.',
  'hotel-lobby': 'Direction: hotel lobby style, premium atmosphere, layered lighting, elegant finishes.',
  'office-space': 'Direction: modern office space, efficient layout, clean materials, professional lighting.',
  'natural-wood': 'Direction: natural wood style, warm timber, soft daylight, relaxed atmosphere.',
  'premium-gray': 'Direction: premium gray palette, restrained contrast, refined stone and metal.',
  custom: 'Direction: custom design direction.',
};

const sameStyleVariantPrompts = [
  'Variant A: conservative, clean, balanced.',
  'Variant B: warmer, softer, more atmospheric.',
  'Variant C: more premium materials and clearer visual hierarchy.',
  'Variant D: bolder lighting and more expressive styling.',
  'Variant E: brighter daylight and lighter material contrast.',
  'Variant F: quieter palette with stronger texture focus.',
  'Variant G: more expressive feature elements.',
  'Variant H: refined presentation with distinctive atmosphere.',
];

function resolveBatchCountForJob(job: GenerationJob): number {
  return resolveBatchCountForJobConfig(job.mode, job.config);
}

function resolveBatchCountForJobConfig(mode: GenerationRecord['mode'], config: Record<string, unknown>): number {
  const outputCount = getGenerationOutputCount(mode, config);
  if (mode === 'floorplan') return config.floorplanOutputMode === 'multi' ? resolveFloorplanBatchCount(outputCount) : 1;
  if (mode === 'design-variants') return outputCount === 2 || outputCount === 4 || outputCount === 8 ? outputCount : 1;
  if (mode === 'plan-colorize') return outputCount >= 1 && outputCount <= maxPlanColorizeBatchCount ? Math.floor(outputCount) : 1;
  if (isObjectInsertConfig(config)) return readObjectInsertCandidateCount(config);
  return 1;
}

function resolveVariantStyles(config: Record<string, unknown>, batchCount: number): string[] {
  if (batchCount === 1) return ['modern-minimal'];
  const styles = Array.isArray(config.variantStyles)
    ? config.variantStyles.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const defaults = batchCount === 2 || batchCount === 4 || batchCount === 8 ? defaultVariantStylesByCount[batchCount] : defaultVariantStylesByCount[4];
  const resolved = [...styles];
  for (const style of defaults) {
    if (resolved.length >= batchCount) break;
    if (!resolved.includes(style)) resolved.push(style);
  }
  return resolved.slice(0, batchCount);
}

function resolvePlanColorizeStylesForJob(config: Record<string, unknown>, batchCount: number): PlanColorizeStyleOption[] {
  const ids = Array.isArray(config.planColorizeStyleIds)
    ? config.planColorizeStyleIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const fallbackId = typeof config.selectedStyleId === 'string' ? config.selectedStyleId : undefined;
  const styles = resolvePlanColorizeStyles(ids.length > 0 ? ids : fallbackId, fallbackId).slice(0, maxPlanColorizeBatchCount);
  const resolved = [...styles];
  while (resolved.length < batchCount) {
    const fallback = findPlanColorizeStyle(resolved[resolved.length]?.id) || planColorizeStyleOptions[resolved.length % planColorizeStyleOptions.length];
    resolved.push(fallback);
  }
  return resolved.slice(0, batchCount);
}

function isProviderBatchSuccess(result: ProviderBatchResult): result is ProviderBatchSuccess {
  return 'providerOutput' in result;
}

function isProviderBatchFailure(result: ProviderBatchResult): result is ProviderBatchFailure {
  return 'error' in result;
}

function buildProviderInputForVariant(
  job: GenerationJob,
  input: GenerateImageInput,
  index: number,
  batchCount: number,
  variantStyle: string,
  planStyle?: PlanColorizeStyleOption,
  floorplanPlan?: FloorplanVariantPlan,
): GenerateImageInput {
  if (isFloorplanMultiPlanJob(job)) {
    const plan = floorplanPlan || resolveFloorplanVariantPlans(job.config, batchCount)[index];
    return {
      ...input,
      prompt: buildFloorplanMultiPlanPrompt(job, index, batchCount, plan, input.qualityMode),
      config: {
        ...input.config,
        floorplanOutputMode: 'multi',
        floorplanVariantType: job.config.floorplanVariantType,
        floorplanVariantFocus: job.config.floorplanVariantFocus,
        variantIndex: index,
        variantCode: readVariantCode(index),
        variantLabel: readVariantLabel(index),
        variantName: plan?.variantName || resolveVariantName(job.config, index),
        selectedStyleId: plan?.selectedStyleId,
        selectedStyleName: plan?.selectedStyleName,
        selectedStylePromptHint: plan?.stylePromptHint,
        layoutVariantId: plan?.layoutVariantId,
        layoutVariantName: plan?.layoutVariantName,
        layoutVariantPromptHint: plan?.layoutPromptHint,
        batchGroupId: typeof job.config.batchGroupId === 'string' ? job.config.batchGroupId : undefined,
        batchCount,
      },
    };
  }

  if (job.mode === 'plan-colorize') {
    const style = planStyle || planColorizeStyleOptions[0];
    return {
      ...input,
      prompt: buildPlanColorizeBatchPrompt(job, index, batchCount, style, input.qualityMode),
      config: {
        ...input.config,
        planColorizeStyleIndex: index,
        selectedStyleId: style.id,
        selectedStyleName: style.name,
        selectedStylePromptHint: style.promptHint,
        batchGroupId: typeof job.config.batchGroupId === 'string' ? job.config.batchGroupId : undefined,
        batchCount,
      },
    };
  }

  if (job.mode !== 'design-variants') return input;

  return {
    ...input,
    prompt: buildDesignVariantPrompt(job, index, batchCount, variantStyle, input.qualityMode),
    config: {
      ...input.config,
      variantIndex: index,
      variantCode: readVariantCode(index),
      variantLabel: readVariantLabel(index),
      variantName: resolveVariantName(job.config, index),
      variantStyle,
      stylePackId: typeof job.config.stylePackId === 'string' ? job.config.stylePackId : 'interior-common',
      variantChangeScope: readVariantChangeScope(job.config),
      variantLocks: readVariantLocks(job.config),
      variantStrategyNotes: readVariantStrategyNotes(job.config, batchCount),
      designDirection: buildDesignVariantDirectionLabel(job.config, index, variantStyle),
      changeScopeLabel: readVariantChangeScopeLabel(job.config),
      lockedItemsLabel: readVariantLocksLabel(job.config),
      strategyNote: readVariantStrategyNote(job.config, index),
      batchCount,
    },
  };
}

function buildFloorplanMultiPlanPrompt(
  job: GenerationJob,
  index: number,
  batchCount: number,
  plan: FloorplanVariantPlan | undefined,
  qualityMode: QualityMode = resolveQualityModeForJob(job),
): string {
  const variantType = job.config.floorplanVariantType === 'furniture_layout' || job.config.floorplanVariantType === 'mixed'
    ? job.config.floorplanVariantType
    : 'material_style';
  const focus = job.config.floorplanVariantFocus === 'furniture_layout' || job.config.floorplanVariantFocus === 'both'
    ? job.config.floorplanVariantFocus
    : 'material_style';
  const pieces = [
    buildSmartPromptForJob(job, qualityMode, {
      config: {
        ...job.config,
        variantIndex: index,
        variantName: plan?.variantName,
        selectedStyleName: plan?.selectedStyleName,
        layoutVariantName: plan?.layoutVariantName,
      },
    }),
    `This is 3D colored floor plan option ${index + 1} of ${batchCount}: ${plan?.variantName || readVariantLabel(index)}.`,
    buildFloorplanExpressionControlPrompt(job.config),
    'Common requirement: preserve the original floor plan structure, walls, doors, windows, openings, functional zoning, circulation logic, room proportions, and main spatial relationships. Do not change the basic architectural layout.',
    'Convert the plan into a clear, complete, design-oriented 3D colored floor plan with realistic materials, furniture, soft furnishing, lighting, and spatial layering.',
  ];

  if (variantType === 'material_style') {
    pieces.push(
      'Variation focus: change the material system, color palette, atmosphere, lighting expression, and finish hierarchy while keeping same-type furniture positions and the original plan logic stable.',
      plan?.stylePromptHint || '',
    );
  } else if (variantType === 'furniture_layout') {
    pieces.push(
      'Variation focus: create a different same-type furniture arrangement. Change furniture combination, orientation, relative position, and local soft furnishing configuration, while keeping functions reasonable, circulation smooth, proportions coordinated, and the original walls and room boundaries unchanged.',
      plan?.layoutPromptHint || '',
    );
  } else {
    pieces.push(
      'Variation focus: vary both material style and same-type furniture arrangement, but keep one unified design language and do not break the original floor plan logic.',
      plan?.stylePromptHint || '',
      plan?.layoutPromptHint || '',
    );
  }

  if (focus === 'furniture_layout') {
    pieces.push('Priority: furniture placement difference, natural furniture orientation, smooth circulation, and functional reasonableness.');
  } else if (focus === 'both') {
    pieces.push('Priority: material system and furniture placement should both change visibly while remaining visually unified.');
  } else {
    pieces.push('Priority: material style, color system, lighting, and atmosphere should change visibly.');
  }

  pieces.push(job.config.enableLegend === true || job.config.enableAreaText === true || job.config.enableMaterialLegend === true
    ? 'Do not output a collage, comparison sheet, watermark, dimensions, or UI elements. Any legend or labels must be minimal, useful, and part of the floor plan presentation.'
    : 'Do not output a collage, comparison sheet, text, labels, watermark, dimensions, or UI elements.');
  return pieces.filter((part): part is string => Boolean(part && part.trim().length > 0)).join(' ');
}

const floorplanRenderModePromptMap: Record<string, string> = {
  'flat-color': 'Floor plan render mode: flat-color. Keep a pure flat colored plan expression; do not generate a perspective rendering, bird-eye view, 3D view, elevation, or interior effect image.',
  'semi-3d': 'Floor plan render mode: semi-3d. Create a layered semi-3D colored floor plan expression, while preserving the original floor plan structure, walls, openings, furniture outlines, and plan proportions.',
  presentation: 'Floor plan render mode: presentation. Strengthen presentation-board quality, material hierarchy, graphic completeness, clean composition, and readable spatial expression while preserving the original plan structure.',
};

const lineworkPreservationPromptMap: Record<string, string> = {
  strict: 'Linework preservation: strict. Extremely strictly preserve the original linework, wall thickness, doors, windows, furniture outlines, room boundaries, and all plan geometry.',
  high: 'Linework preservation: high. Highly preserve the original linework and plan geometry, allowing only slight visual cleanup and professional graphic beautification.',
  medium: 'Linework preservation: medium. Keep the structure unchanged while allowing stronger graphic enhancement, clearer fills, material hierarchy, and presentation refinement.',
};

function buildFloorplanExpressionControlPrompt(config: Record<string, unknown>): string {
  const renderMode = typeof config.floorplanRenderMode === 'string' && floorplanRenderModePromptMap[config.floorplanRenderMode]
    ? config.floorplanRenderMode
    : 'semi-3d';
  const lineworkPreservation = typeof config.lineworkPreservation === 'string' && lineworkPreservationPromptMap[config.lineworkPreservation]
    ? config.lineworkPreservation
    : 'high';
  return [
    floorplanRenderModePromptMap[renderMode],
    lineworkPreservationPromptMap[lineworkPreservation],
    config.enableLegend === true ? 'Add a concise graphic legend where appropriate, without covering important plan content.' : '',
    config.enableAreaText === true ? 'Add clear area or functional text labels where appropriate; keep text minimal, legible, and aligned with the plan.' : '',
    config.enableMaterialLegend === true ? 'Add a material legend that explains key floor, wall, soft furnishing, and finish categories where appropriate.' : '',
  ].filter(part => part.trim().length > 0).join(' ');
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function mergeProviderDiagnostics(diagnostics: GenerationJobDiagnostics, outputs: GenerateImageOutput[]): void {
  const firstOutput = outputs[0];
  const lastOutput = outputs[outputs.length - 1] || firstOutput;
  const retryCount = outputs.reduce((sum, output) => {
    const value = output.metadata?.retryCount;
    return sum + (typeof value === 'number' ? value : 0);
  }, 0);

  diagnostics.provider = {
    ...diagnostics.provider,
    name: firstOutput?.provider || diagnostics.provider?.name,
    model: typeof lastOutput?.metadata?.model === 'string' ? lastOutput.metadata.model : diagnostics.provider?.model,
    providerModel: typeof lastOutput?.metadata?.model === 'string' ? lastOutput.metadata.model : diagnostics.provider?.providerModel,
    providerMs: readProviderMs(outputs),
    httpStatus: typeof lastOutput?.metadata?.httpStatus === 'number' ? lastOutput.metadata.httpStatus : diagnostics.provider?.httpStatus,
    statusCode: typeof lastOutput?.metadata?.httpStatus === 'number' ? lastOutput.metadata.httpStatus : diagnostics.provider?.statusCode,
    retryCount,
    fallbackProvider: typeof lastOutput?.metadata?.fallbackProvider === 'string' ? lastOutput.metadata.fallbackProvider : diagnostics.provider?.fallbackProvider,
    fallbackReason: typeof lastOutput?.metadata?.fallbackReason === 'string' ? lastOutput.metadata.fallbackReason : diagnostics.provider?.fallbackReason,
  };
}

function readProviderMs(outputs: GenerateImageOutput[]): number | undefined {
  const values = outputs
    .map(output => output.metadata?.providerDurationMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0);
}

function buildDesignVariantPrompt(job: GenerationJob, index: number, batchCount: number, style: string, qualityMode: QualityMode = resolveQualityModeForJob(job)): string {
  const strategy = job.config.variantStrategy === 'same-style' ? 'same-style' : 'style-matrix';
  const customStyle = style === 'custom' && typeof job.config.customStyleLabel === 'string'
    ? `Direction: ${job.config.customStyleLabel.trim()}.`
    : variantStylePrompts[style] || variantStylePrompts['modern-minimal'];
  const parts = [
    buildSmartPromptForJob(job, qualityMode, {
      config: {
        ...job.config,
        variantIndex: index,
        variantName: resolveVariantName(job.config, index),
        variantStyle: style,
      },
      variantStyle: customStyle,
      variantName: resolveVariantName(job.config, index),
    }),
    strategy === 'same-style' ? sameStyleVariantPrompts[index] : undefined,
    buildDesignVariantControlPrompt(job.config, index),
    `This is ${readVariantLabel(index)} of ${batchCount}.`,
  ];
  return parts.filter((part): part is string => Boolean(part && part.trim().length > 0)).join(' ');
}

const variantChangeScopePromptMap: Record<string, string> = {
  'material-only': 'Variation change scope: material-only. Only change materials and finishes; preserve furniture layout, lighting composition, structure, camera, and major colors unless required by material realism.',
  'soft-decoration': 'Variation change scope: soft-decoration. Change loose furniture, decor, textiles, artwork, plants, and styling accessories only; preserve structure and fixed elements.',
  lighting: 'Variation change scope: lighting. Mainly change lighting atmosphere, fixture glow, brightness balance, and mood; keep materials, layout, and structure mostly stable.',
  'furniture-layout': 'Variation change scope: furniture-layout. Adjust movable furniture layout while preserving structure, walls, openings, camera, and fixed built-ins.',
  'color-palette': 'Variation change scope: color-palette. Change the color system only; keep forms, layout, materials types, structure, and camera stable.',
  'full-design': 'Variation change scope: full-design. Create a coherent alternative design while preserving the locked architectural constraints.',
};

const variantChangeScopeLabels: Record<string, string> = {
  'material-only': '只变材质',
  'soft-decoration': '只变软装',
  lighting: '只变灯光',
  'furniture-layout': '调整家具布局',
  'color-palette': '调整色彩体系',
  'full-design': '整体方案',
};

const variantLockPromptMap: Record<string, string> = {
  structure: 'Lock structure: preserve architectural structure, room boundaries, columns, beams, stairs, and built elements.',
  camera: 'Lock camera: preserve original camera angle, perspective, crop, field of view, and composition.',
  'walls-openings': 'Lock walls and openings: preserve wall positions, doors, windows, openings, and facade apertures.',
  'fixed-furniture': 'Lock fixed furniture: preserve built-in cabinets, counters, kitchen systems, wardrobes, and fixed millwork.',
  'floor-material': 'Lock floor material: preserve the existing floor material, pattern, color, and finish.',
  ceiling: 'Lock ceiling: preserve ceiling form, height, cornices, coffers, and fixed ceiling design.',
  'main-color': 'Lock main color: preserve the dominant color family and only make restrained supporting adjustments.',
};

const variantLockLabels: Record<string, string> = {
  structure: '结构',
  camera: '视角',
  'walls-openings': '门窗',
  'fixed-furniture': '固定家具',
  'floor-material': '地面',
  ceiling: '天花',
  'main-color': '主色调',
};

function buildDesignVariantControlPrompt(config: Record<string, unknown>, index: number): string {
  const scope = readVariantChangeScope(config);
  const locks = readVariantLocks(config);
  const note = readVariantStrategyNote(config, index);
  return [
    variantChangeScopePromptMap[scope] || variantChangeScopePromptMap['full-design'],
    locks.length > 0 ? `Locked items for this variant: ${locks.map(lock => variantLockPromptMap[lock]).filter(Boolean).join(' ')}` : undefined,
    note ? `Variant-specific strategy note: ${note}` : undefined,
  ].filter((part): part is string => Boolean(part && part.trim().length > 0)).join(' ');
}

function readVariantChangeScope(config: Record<string, unknown>): string {
  return typeof config.variantChangeScope === 'string' && variantChangeScopePromptMap[config.variantChangeScope]
    ? config.variantChangeScope
    : 'full-design';
}

function readVariantLocks(config: Record<string, unknown>): string[] {
  const allowed = new Set(Object.keys(variantLockPromptMap));
  const locks = Array.isArray(config.variantLocks) ? config.variantLocks : ['structure', 'camera', 'walls-openings'];
  return locks.filter((lock): lock is string => typeof lock === 'string' && allowed.has(lock));
}

function readVariantStrategyNotes(config: Record<string, unknown>, batchCount: number): string[] {
  const notes = Array.isArray(config.variantStrategyNotes) ? config.variantStrategyNotes : [];
  return Array.from({ length: batchCount }, (_, index) => typeof notes[index] === 'string' ? notes[index].trim().slice(0, 200) : '');
}

function readVariantStrategyNote(config: Record<string, unknown>, index: number): string {
  const notes = Array.isArray(config.variantStrategyNotes) ? config.variantStrategyNotes : [];
  const value = notes[index];
  return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}

function readVariantChangeScopeLabel(config: Record<string, unknown>): string {
  return variantChangeScopeLabels[readVariantChangeScope(config)] || variantChangeScopeLabels['full-design'];
}

function readVariantLocksLabel(config: Record<string, unknown>): string {
  const locks = readVariantLocks(config);
  return locks.length > 0 ? locks.map(lock => variantLockLabels[lock] || lock).join('、') : '无';
}

function buildDesignVariantDirectionLabel(config: Record<string, unknown>, index: number, style: string): string {
  const customStyle = style === 'custom' && typeof config.customStyleLabel === 'string' && config.customStyleLabel.trim().length > 0
    ? config.customStyleLabel.trim()
    : style;
  return `${resolveVariantName(config, index)} / ${customStyle}`;
}

function buildPlanColorizeBatchPrompt(job: GenerationJob, index: number, batchCount: number, style: PlanColorizeStyleOption, qualityMode: QualityMode = resolveQualityModeForJob(job)): string {
  return [
    buildSmartPromptForJob(job, qualityMode, {
      config: {
        ...job.config,
        selectedStyleId: style.id,
        selectedStyleName: style.name,
        selectedStylePromptHint: style.promptHint,
        planColorizeStyleIndex: index,
        batchCount,
      },
    }),
    `This is colored plan style ${index + 1} of ${batchCount}: ${style.name}.`,
  ].filter(part => part.trim().length > 0).join(' ');
}

function readVariantLabel(index: number): string {
  return `方案 ${String.fromCharCode(65 + index)}`;
}

function readVariantCode(index: number): string {
  return String.fromCharCode(65 + index);
}

function resolveVariantName(config: Record<string, unknown>, index: number): string {
  const names = Array.isArray(config.variantNames)
    ? config.variantNames.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  return names[index] || readVariantLabel(index);
}

function resolveVariantStartProgress(batchCount: number, index: number): number {
  if (batchCount === 1) return 28;
  return index === 0 ? 15 : resolveVariantCompleteProgress(batchCount, index - 1);
}

function resolveVariantCompleteProgress(batchCount: number, index: number): number {
  if (batchCount === 2) return index === 0 ? 60 : 90;
  if (batchCount === 4) return [40, 60, 80, 90][index] || 90;
  if (batchCount === 8) return [25, 35, 45, 55, 65, 75, 84, 92][index] || 92;
  if (batchCount > 1) return Math.min(92, Math.round(30 + ((index + 1) / batchCount) * 60));
  return 80;
}

function buildProviderPromptForJob(job: GenerationJob, qualityMode: QualityMode = resolveQualityModeForJob(job)): string {
  if (isObjectInsertJob(job) && readObjectInsertPreviewFusionMode(job.config, job.mode)) {
    return readObjectInsertPreviewFusionUserPromptForJob(job);
  }

  if (isFloorplanMultiPlanJob(job)) {
    const batchCount = resolveBatchCountForJob(job);
    return buildFloorplanMultiPlanPrompt(job, 0, batchCount, resolveFloorplanVariantPlans(job.config, batchCount)[0], qualityMode);
  }

  if (job.mode === 'design-variants') {
    return buildDesignVariantPrompt(job, 0, resolveBatchCountForJob(job), resolveVariantStyles(job.config, resolveBatchCountForJob(job))[0] || 'modern-minimal', qualityMode);
  }

  return buildSmartPromptForJob(job, qualityMode);
}

function buildSmartPromptForJob(job: GenerationJob, qualityMode: QualityMode = resolveQualityModeForJob(job), overrides: Partial<BuildSmartPromptInputForJob> = {}): string {
  const isObjectInsert = isObjectInsertJob(job);
  const mode = (isObjectInsert ? 'object-insert' : job.mode) as SmartPromptMode;
  const userPromptFallback = typeof job.config.userPrompt === 'string' ? job.config.userPrompt : job.prompt;
  return buildSmartPrompt({
    mode,
    config: job.config,
    userPrompt: readSmartPromptUserSupplement(mode, job.config, userPromptFallback),
    hasMaterialReferences: readStringArray(job.config.materialReferenceAssetIds).length > 0
      || readStringArray(job.config.materialTextureAssetIds).length > 0
      || readMaterialTextureSourceNames(job.config).length > 0
      || isObjectInsert,
    materialNames: readMaterialTextureSourceNames(job.config),
    hasMask: job.config.maskMode === 'asset-mask',
    useFullImageMask: job.config.maskMode === 'full-image',
    hasFurnitureReference: readStringArray(job.config.furnitureReferenceAssetIds).length > 0 || isObjectInsert,
    qualityMode,
    ...overrides,
  });
}

function readObjectInsertPreviewFusionUserPromptForJob(job: GenerationJob): string {
  const nested = isRecord(job.config.objectInsert) ? job.config.objectInsert : {};
  const values = [
    typeof nested.extraPrompt === 'string' ? nested.extraPrompt : '',
    typeof job.config.objectInsertExtraPrompt === 'string' ? job.config.objectInsertExtraPrompt : '',
    typeof job.config.userPrompt === 'string' ? job.config.userPrompt : '',
    typeof job.config.customPrompt === 'string' ? job.config.customPrompt : '',
    job.prompt,
  ];
  return values.map(value => value.trim()).find(value => value.length > 0 && !looksLikeLegacyObjectInsertPrompt(value))
    || 'Naturally integrate the furniture arrangement shown in the placement preview.';
}

function looksLikeLegacyObjectInsertPrompt(value: string): boolean {
  return /\bimage\s+[3-9]\b|Generation config JSON|Object list:|placement guide|edit-area mask|object_insert|object insert placement mode/iu.test(value);
}

interface BuildSmartPromptInputForJob {
  config: Record<string, unknown>;
  variantStyle: string;
  variantName: string;
}

function readModelSnapshotMetadata(value: unknown): GenerationRecord['modelSnapshotMetadata'] {
  if (!isRecord(value)) return null;
  if (value.sourceType !== 'model-snapshot') return null;
  if (typeof value.createdAt !== 'string') return null;
  return {
    sourceType: 'model-snapshot',
    inputSource: value.inputSource === 'uploaded-snapshot' ? 'uploaded-snapshot' : value.inputSource === 'model-capture' ? 'model-capture' : undefined,
    sourceModelAssetId: typeof value.sourceModelAssetId === 'string' ? value.sourceModelAssetId : undefined,
    snapshotAssetId: typeof value.snapshotAssetId === 'string' ? value.snapshotAssetId : undefined,
    modelPreviewUrl: typeof value.modelPreviewUrl === 'string' ? value.modelPreviewUrl : undefined,
    usedOptimizedModel: typeof value.usedOptimizedModel === 'boolean' ? value.usedOptimizedModel : undefined,
    optimizationStatus: value.optimizationStatus === 'pending' || value.optimizationStatus === 'processing' || value.optimizationStatus === 'succeeded' || value.optimizationStatus === 'failed' || value.optimizationStatus === 'skipped' ? value.optimizationStatus : undefined,
    width: typeof value.width === 'number' && value.width > 0 ? value.width : undefined,
    height: typeof value.height === 'number' && value.height > 0 ? value.height : undefined,
    camera: isRecord(value.camera) ? value.camera as GenerationRecord['modelSnapshotMetadata'] extends infer M ? M extends { camera?: infer C } ? C : never : never : undefined,
    viewMode: value.viewMode === 'orbit' || value.viewMode === 'walkthrough' ? value.viewMode : undefined,
    clippingEnabled: typeof value.clippingEnabled === 'boolean' ? value.clippingEnabled : undefined,
    clippingHeight: typeof value.clippingHeight === 'number' ? value.clippingHeight : undefined,
    xrayEnabled: typeof value.xrayEnabled === 'boolean' ? value.xrayEnabled : undefined,
    edgesEnabled: typeof value.edgesEnabled === 'boolean' ? value.edgesEnabled : undefined,
    createdAt: value.createdAt,
  };
}

function markTiming(
  diagnostics: GenerationJobDiagnostics,
  key: keyof NonNullable<GenerationJobDiagnostics['timing']>,
  phase?: NonNullable<GenerationJobDiagnostics['phase']>,
): void {
  diagnostics.timing = {
    ...diagnostics.timing,
    [key]: new Date().toISOString(),
  };
  if (phase) diagnostics.phase = phase;
}

function finalizeDurations(diagnostics: GenerationJobDiagnostics): void {
  const timing = diagnostics.timing || {};
  diagnostics.timing = {
    ...timing,
    prepareInputDurationMs: durationBetween(timing.prepareInputStartedAt, timing.prepareInputFinishedAt),
    providerDurationMs: durationBetween(timing.providerRequestStartedAt, timing.providerRequestFinishedAt),
    postprocessDurationMs: durationBetween(timing.postprocessStartedAt, timing.postprocessFinishedAt),
    saveResultDurationMs: durationBetween(timing.saveResultStartedAt, timing.saveResultFinishedAt),
    totalDurationMs: durationBetween(timing.jobStartedAt || timing.jobCreatedAt, timing.jobFinishedAt),
  };
  diagnostics.timing.providerMs = diagnostics.provider?.providerMs ?? diagnostics.timing.providerDurationMs;
}

function durationBetween(start: string | undefined, end: string | undefined): number | undefined {
  if (!start || !end) return undefined;
  const duration = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(duration) && duration >= 0 ? duration : undefined;
}

function logJobTiming(jobId: string, diagnostics: GenerationJobDiagnostics, error?: string): void {
  console.info(`[GenerationJob ${jobId}] timing`, {
    prepareInput: diagnostics.timing?.prepareInputDurationMs,
    provider: diagnostics.timing?.providerDurationMs,
    providerMs: diagnostics.timing?.providerMs,
    postprocess: diagnostics.timing?.postprocessDurationMs,
    saveResult: diagnostics.timing?.saveResultDurationMs,
    total: diagnostics.timing?.totalDurationMs,
    providerName: diagnostics.provider?.name,
    model: diagnostics.provider?.model,
    providerModel: diagnostics.provider?.providerModel,
    qualityMode: diagnostics.images?.qualityMode,
    inputImages: diagnostics.images?.inputImages,
    referenceImages: diagnostics.images?.referenceImages,
    referenceCount: diagnostics.images?.referenceCount,
    inputBefore: diagnostics.images?.inputWidthBefore && diagnostics.images?.inputHeightBefore ? `${diagnostics.images.inputWidthBefore}x${diagnostics.images.inputHeightBefore}` : undefined,
    inputAfter: diagnostics.images?.inputWidthAfter && diagnostics.images?.inputHeightAfter ? `${diagnostics.images.inputWidthAfter}x${diagnostics.images.inputHeightAfter}` : undefined,
    inputBytesBefore: diagnostics.images?.inputBytesBefore,
    inputBytesAfter: diagnostics.images?.inputBytesAfter,
    referenceBytesBefore: diagnostics.images?.referenceBytesBefore,
    referenceBytesAfter: diagnostics.images?.referenceBytesAfter,
    payloadBytesApprox: diagnostics.images?.payloadBytesApprox,
    localInpaintEnabled: diagnostics.images?.localInpaintEnabled,
    maskBbox: diagnostics.images?.maskBbox,
    originalSize: diagnostics.images?.originalWidth && diagnostics.images?.originalHeight ? `${diagnostics.images.originalWidth}x${diagnostics.images.originalHeight}` : undefined,
    maskSize: diagnostics.images?.maskWidth && diagnostics.images?.maskHeight ? `${diagnostics.images.maskWidth}x${diagnostics.images.maskHeight}` : undefined,
    furnitureReferenceCount: diagnostics.images?.furnitureReferenceCount,
    retryCount: diagnostics.provider?.retryCount,
    fallbackProvider: diagnostics.provider?.fallbackProvider,
    error,
  });
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function readErrorStatus(error: Error): number | undefined {
  const status = (error as Error & { status?: unknown; statusCode?: unknown; httpStatus?: unknown }).status
    ?? (error as Error & { statusCode?: unknown }).statusCode
    ?? (error as Error & { httpStatus?: unknown }).httpStatus;
  if (typeof status === 'number') return status;
  const match = /HTTP\s+(\d{3})|returned\s+(\d{3})/iu.exec(error.message);
  const parsed = Number(match?.[1] || match?.[2]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isMaskMode(value: unknown): value is MaskMode {
  return value === 'asset-mask' || value === 'full-image';
}

function isMissingProviderSecretError(error: unknown): boolean {
  return error instanceof Error && (
    error.message.includes('GRSAI_API_KEY is required')
    || error.message.includes('GEMINI_API_KEY is required')
    || readErrorStringField(error, 'providerError') === 'missing_provider_secret'
  );
}

function isTimeoutGenerationFailure(error: unknown, statusCode?: number): boolean {
  if (statusCode === 408 || statusCode === 504) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('timed out')
    || message.includes('timeout')
    || message.includes('aborterror')
    || message.includes('aborted');
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

function readConfigStringValue(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function readGenerationJobStep(config: Record<string, unknown>): GenerationJob['step'] {
  return isGenerationJobStep(config.step) ? config.step : null;
}

function isGenerationJobStep(value: unknown): value is NonNullable<GenerationJob['step']> {
  return value === 'floorplan_to_3d'
    || value === 'style_render'
    || value === 'local_inpainting'
    || value === 'model_snapshot_render'
    || value === 'design_variants'
    || value === 'material_replace'
    || value === 'plan_colorize'
    || value === 'panorama_quick_render'
    || value === 'object_insert'
    || value === 'free_reference_image';
}

function isObjectInsertJob(job: GenerationJob): boolean {
  return job.step === 'object_insert' || readGenerationJobStep(job.config) === 'object_insert' || isRecord(job.config.objectInsert);
}

type ObjectInsertDebugMode = 'full' | 'source_prompt' | 'source_object' | 'source_object_mask' | 'source_object_preview';
type ObjectInsertPositionConstraintStrength = 'low' | 'medium' | 'high';
type ObjectInsertPlacementMode = 'strict' | 'natural';
type ObjectInsertHarmonyPriority = 'layout' | 'style' | 'balance';
type ObjectInsertFusionPreference = 'conservative' | 'balanced' | 'design';
type ObjectInsertSurface = 'floor' | 'wall' | 'ceiling' | 'tabletop' | 'outdoor-ground' | 'auto';
type ObjectFidelity = 'strict' | 'balanced' | 'loose';

interface ObjectInsertItemForJob {
  id: string;
  objectType: string;
  objectLabel?: string;
  referenceAssetIds: string[];
  placementPreviewAssetId?: string;
  placementMaskAssetId?: string;
  objectInsertSurface: ObjectInsertSurface;
  objectFidelity: ObjectFidelity;
  enforceContactShadow: boolean;
  enforceOcclusion: boolean;
  enforcePerspectiveScale: boolean;
  placementMode: ObjectInsertPlacementMode;
  placementIntent: string;
  extraPrompt: string;
  placement?: Record<string, unknown>;
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

function isObjectInsertConfig(config: Record<string, unknown>): boolean {
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

function readObjectInsertType(config: Record<string, unknown>): string {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = readConfigStringValue(nested.objectType) || readConfigStringValue(config.objectType);
  return value || 'custom';
}

function readObjectInsertSurface(config: Record<string, unknown>): ObjectInsertSurface {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = readConfigStringValue(nested.objectInsertSurface) || readConfigStringValue(config.objectInsertSurface);
  return value === 'floor'
    || value === 'wall'
    || value === 'ceiling'
    || value === 'tabletop'
    || value === 'outdoor-ground'
    || value === 'auto'
    ? value
    : 'auto';
}

function readObjectFidelity(config: Record<string, unknown>): ObjectFidelity {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = readConfigStringValue(nested.objectFidelity) || readConfigStringValue(config.objectFidelity);
  return value === 'strict' || value === 'balanced' || value === 'loose' ? value : 'balanced';
}

function readObjectInsertBooleanConstraint(
  config: Record<string, unknown>,
  key: 'enforceContactShadow' | 'enforceOcclusion' | 'enforcePerspectiveScale',
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

function readObjectInsertJobConfig(job: GenerationJob): {
  sourceImageAssetId: string;
  objectReferenceAssetId: string;
  previewAssetId: string;
  maskAssetId: string;
  positionConstraintStrength: ObjectInsertPositionConstraintStrength;
  placementMode: ObjectInsertPlacementMode;
  placementIntent: string;
  harmonyPriority: ObjectInsertHarmonyPriority;
  objectType: string;
  objectInsertSurface: ObjectInsertSurface;
  objectFidelity: ObjectFidelity;
  enforceContactShadow: boolean;
  enforceOcclusion: boolean;
  enforcePerspectiveScale: boolean;
  allowAutoAdjustPosition: boolean;
  allowAutoAdjustRotation: boolean;
  allowAutoAdjustScale: boolean;
  placement?: Record<string, unknown>;
} {
  const nested = isRecord(job.config.objectInsert) ? job.config.objectInsert : {};
  return {
    sourceImageAssetId: readConfigStringValue(nested.sourceImageAssetId) || readConfigStringValue(job.config.sourceImageAssetId),
    objectReferenceAssetId: readConfigStringValue(nested.objectReferenceAssetId) || readConfigStringValue(job.config.objectReferenceAssetId),
    previewAssetId: readConfigStringValue(nested.guideAssetId)
      || readConfigStringValue(nested.previewAssetId)
      || readConfigStringValue(job.config.placementGuideAssetId)
      || readConfigStringValue(job.config.placementPreviewAssetId),
    maskAssetId: readConfigStringValue(nested.maskAssetId)
      || readConfigStringValue(job.config.placementMaskAssetId)
      || readConfigStringValue(job.config.maskAssetId),
    positionConstraintStrength: readObjectInsertPositionConstraintStrength(job.config),
    placementMode: readObjectInsertPlacementMode(job.config),
    placementIntent: readObjectInsertPlacementIntent(job.config),
    harmonyPriority: readObjectInsertHarmonyPriority(job.config),
    objectType: readObjectInsertType(job.config),
    objectInsertSurface: readObjectInsertSurface(job.config),
    objectFidelity: readObjectFidelity(job.config),
    enforceContactShadow: readObjectInsertBooleanConstraint(job.config, 'enforceContactShadow'),
    enforceOcclusion: readObjectInsertBooleanConstraint(job.config, 'enforceOcclusion'),
    enforcePerspectiveScale: readObjectInsertBooleanConstraint(job.config, 'enforcePerspectiveScale'),
    allowAutoAdjustPosition: readObjectInsertAutoAdjust(job.config, 'allowAutoAdjustPosition'),
    allowAutoAdjustRotation: readObjectInsertAutoAdjust(job.config, 'allowAutoAdjustRotation'),
    allowAutoAdjustScale: readObjectInsertAutoAdjust(job.config, 'allowAutoAdjustScale'),
    placement: isRecord(nested.placement)
      ? nested.placement
      : isRecord(job.config.objectPlacement)
        ? job.config.objectPlacement
        : undefined,
  };
}

function readObjectInsertItemsFromJob(job: GenerationJob): ObjectInsertItemForJob[] {
  const nested = isRecord(job.config.objectInsert) ? job.config.objectInsert : {};
  const rawItems = Array.isArray(nested.objectItems) ? nested.objectItems : [];
  const items = rawItems
    .filter(isRecord)
    .map((item, index): ObjectInsertItemForJob => ({
      id: readConfigStringValue(item.id) || `object-item-${index + 1}`,
      objectType: readConfigStringValue(item.objectType) || 'custom',
      objectLabel: readConfigStringValue(item.objectLabel) || undefined,
      referenceAssetIds: readStringArray(item.referenceAssetIds).slice(0, 6),
      placementPreviewAssetId: readConfigStringValue(item.placementPreviewAssetId),
      placementMaskAssetId: readConfigStringValue(item.placementMaskAssetId),
      objectInsertSurface: readObjectInsertSurface({ ...job.config, objectInsert: { ...nested, ...item } }),
      objectFidelity: readObjectFidelity({ ...job.config, objectInsert: { ...nested, ...item } }),
      enforceContactShadow: typeof item.enforceContactShadow === 'boolean' ? item.enforceContactShadow : readObjectInsertBooleanConstraint(job.config, 'enforceContactShadow'),
      enforceOcclusion: typeof item.enforceOcclusion === 'boolean' ? item.enforceOcclusion : readObjectInsertBooleanConstraint(job.config, 'enforceOcclusion'),
      enforcePerspectiveScale: typeof item.enforcePerspectiveScale === 'boolean' ? item.enforcePerspectiveScale : readObjectInsertBooleanConstraint(job.config, 'enforcePerspectiveScale'),
      placementMode: item.placementMode === 'strict' ? 'strict' : item.placementMode === 'natural' ? 'natural' : readObjectInsertPlacementMode(job.config),
      placementIntent: readConfigStringValue(item.placementIntent),
      extraPrompt: readConfigStringValue(item.extraPrompt),
      placement: isRecord(item.placement) ? item.placement : undefined,
    }))
    .filter(item => item.referenceAssetIds.length > 0 || item.placementPreviewAssetId || item.placementMaskAssetId);

  if (items.length > 0) return items.slice(0, 8);

  const legacy = readObjectInsertJobConfig(job);
  const referenceAssetIds = readStringArray(nested.objectReferenceAssetIds);
  if (legacy.objectReferenceAssetId) referenceAssetIds.unshift(legacy.objectReferenceAssetId);
  const uniqueReferenceAssetIds = Array.from(new Set(referenceAssetIds.filter(isNonEmptyString))).slice(0, 6);
  if (uniqueReferenceAssetIds.length === 0 && !legacy.previewAssetId && !legacy.maskAssetId) return [];
  return [{
    id: 'legacy-object-1',
    objectType: 'custom',
    objectLabel: 'Object 1',
    referenceAssetIds: uniqueReferenceAssetIds,
    placementPreviewAssetId: legacy.previewAssetId,
    placementMaskAssetId: legacy.maskAssetId,
    objectInsertSurface: legacy.objectInsertSurface,
    objectFidelity: legacy.objectFidelity,
    enforceContactShadow: legacy.enforceContactShadow,
    enforceOcclusion: legacy.enforceOcclusion,
    enforcePerspectiveScale: legacy.enforcePerspectiveScale,
    placementMode: legacy.placementMode,
    placementIntent: legacy.placementIntent,
    extraPrompt: readConfigStringValue(nested.extraPrompt) || readConfigStringValue(job.config.objectInsertExtraPrompt) || readConfigStringValue(job.config.customPrompt),
    placement: legacy.placement,
  }];
}

function buildObjectInsertOrderedAssetIds(input: {
  sourceAssetId: string;
  items: ObjectInsertItemForJob[];
  needsObject: boolean;
  needsPreview: boolean;
  needsMask: boolean;
  legacyObjectReferenceAssetId: string;
  legacyPreviewAssetId: string;
  legacyMaskAssetId: string;
}): string[] {
  const ordered = [input.sourceAssetId];
  if (input.items.length > 0) {
    if (input.needsObject) {
      for (const item of input.items) ordered.push(...item.referenceAssetIds);
    }
    const placementControlAssetIds: string[] = [];
    for (const item of input.items) {
      if (input.needsPreview) placementControlAssetIds.push(item.placementPreviewAssetId || '');
      if (input.needsMask) placementControlAssetIds.push(item.placementMaskAssetId || '');
    }
    ordered.push(...Array.from(new Set(placementControlAssetIds.filter(isNonEmptyString))));
  } else {
    if (input.needsObject) ordered.push(input.legacyObjectReferenceAssetId);
    if (input.needsPreview) ordered.push(input.legacyPreviewAssetId);
    if (input.needsMask) ordered.push(input.legacyMaskAssetId);
  }

  return ordered.filter(isNonEmptyString);
}

function mapObjectInsertInputDataUrls(
  items: ObjectInsertItemForJob[],
  orderedAssetIds: string[],
  dataUrls: string[],
): string[] {
  const byAssetId = new Map<string, string>();
  orderedAssetIds.forEach((assetId, index) => {
    const dataUrl = dataUrls[index];
    if (isNonEmptyString(assetId) && isNonEmptyString(dataUrl) && !byAssetId.has(assetId)) {
      byAssetId.set(assetId, dataUrl);
    }
  });

  if (items.length === 0) return dataUrls;
  return orderedAssetIds.map(assetId => byAssetId.get(assetId)).filter(isNonEmptyString);
}

function buildObjectInsertInputOrder(
  items: ObjectInsertItemForJob[],
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
    objectInsertSurface: item.objectInsertSurface,
    objectFidelity: item.objectFidelity,
    enforceContactShadow: item.enforceContactShadow,
    enforceOcclusion: item.enforceOcclusion,
    enforcePerspectiveScale: item.enforcePerspectiveScale,
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

function readMaterialTextureSourceNames(config: Record<string, unknown>): string[] {
  const sources = config.materialTextureSources;
  if (!Array.isArray(sources)) return [];
  return sources
    .map(source => isRecord(source) && typeof source.name === 'string' ? source.name.trim() : '')
    .filter(isNonEmptyString);
}

function isGrsaiProvider(name: ProviderName): boolean {
  return name === 'grsai-banana2' || name === 'grsai-nano-banana';
}

function readEditTarget(value: unknown): GenerateImageInput['editTarget'] {
  if (value === 'material' || value === 'furniture' || value === 'general') return value;
  return undefined;
}

function readQualityMode(value: unknown): QualityMode {
  return value === 'draft' || value === 'fast' || value === 'balanced' || value === 'high' ? value : readDefaultQualityMode();
}

function readDefaultQualityMode(): QualityMode {
  const value = process.env.PROVIDER_DEFAULT_QUALITY_MODE || process.env.DEFAULT_QUALITY_MODE;
  return value === 'draft' || value === 'fast' || value === 'balanced' || value === 'high' ? value : 'fast';
}

function resolveQualityModeForJob(job: GenerationJob): QualityMode {
  if (job.config.qualityMode !== undefined) return readQualityMode(job.config.qualityMode);
  if (job.mode === 'panorama-roam-render' || job.mode === 'design-variants') return 'draft';
  return readDefaultQualityMode();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
