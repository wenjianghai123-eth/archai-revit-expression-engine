import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createStoredFilename, fileStorageProvider, uploadsDir } from './fileStorage';
import { isProviderFallbackEnabled } from './providers/fallback';
import { createGeminiProvider } from './providers/geminiProvider';
import { createGrsaiBanana2Provider } from './providers/grsaiBanana2Provider';
import { createGrsaiNanoBananaProvider } from './providers/grsaiNanoBananaProvider';
import { createMockGeneration, mockProvider } from './providers/mockProvider';
import { GenerateImageInput, GenerateImageOutput, ImageGenerationProvider, MaskMode, ProviderName } from './providers/types';
import { getImageSizeFromDataUrl, isValidTargetDimension } from './image/imageMetadata';
import { normalizeGeneratedImageDataUrl } from './image/normalizeImage';
import { prepareImageForProvider, prepareMaskForProvider, PreparedProviderImage } from './image/prepareProviderImage';
import { composeLocalInpaintResult, createLocalInpaintContext, LocalInpaintContext } from './image/localInpaint';
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
  createdAt: string;
  warnings: string[];
}

const maxImageMb = Number(process.env.MAX_IMAGE_MB || 10);
const provider = selectProvider();
const queuedGenerationJobIds: string[] = [];
let isGenerationWorkerRunning = false;

export function getGenerationProviderName(): ProviderName {
  return provider.name;
}

export function calculateGenerationCreditsCost(mode: GenerationRecord['mode'], config: Record<string, unknown>): number {
  const baseCost = mode === 'inpaint' || mode === 'material-replace' ? 8 : 10;
  return baseCost * resolveBatchCountForJobConfig(mode, config);
}

export async function refundGenerationJobCredits(jobId: string): Promise<void> {
  const job = await getGenerationJob(jobId);
  if (!job) return;

  const existingRefund = await getCreditTransactionByReference(job.userId, 'refund', job.id);
  if (existingRefund) return;

  const debit = await getCreditTransactionByReference(job.userId, 'debit', job.id);
  if (!debit || debit.amount >= 0) return;

  await adjustCredits({
    userId: job.userId,
    type: 'refund',
    amount: Math.abs(debit.amount),
    reason: `Refund generation job ${job.mode}`,
    referenceType: 'generation_job',
    referenceId: job.id,
  });
}

export async function restorePendingGenerationJobs(): Promise<void> {
  if (isGenerationWorkerDisabled()) return;

  const jobs = await listRunnableGenerationJobs();
  for (const job of jobs) {
    enqueueGenerationJob(job.id);
  }
}

export function enqueueGenerationJob(jobId: string): void {
  if (!queuedGenerationJobIds.includes(jobId)) {
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

export async function generateWithFallbackResponse(input: GenerateImageInput): Promise<GenerateResponseBody> {
  return toGenerateResponseBody(await generateWithFallback(input));
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
  if (!job || job.status === 'cancelled' || job.status === 'succeeded') return;
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
    const variantStyles = resolveVariantStyles(job.config, batchCount);
    const outputAssetIds: string[] = [];
    let firstOutput: GenerateImageOutput | null = null;
    let firstOutputAsset: ImageAsset | null = null;

    for (let index = 0; index < batchCount; index += 1) {
      markTiming(diagnostics, 'providerRequestStartedAt', 'provider-request');
      await updateGenerationJob(job.id, { progress: resolveVariantStartProgress(batchCount, index), diagnostics });
      const variantStyle = variantStyles[index] || 'modern-minimal';
      const providerInput = job.mode === 'design-variants'
        ? {
            ...input,
            prompt: buildDesignVariantPrompt(job, index, batchCount, variantStyle),
            config: {
              ...input.config,
              variantIndex: index,
              variantCode: readVariantCode(index),
              variantLabel: readVariantLabel(index),
              variantName: resolveVariantName(job.config, index),
              variantStyle,
              stylePackId: typeof job.config.stylePackId === 'string' ? job.config.stylePackId : 'interior-common',
              batchCount,
            },
          }
        : input;
      const providerOutput = await generateWithFallback(providerInput);
      markTiming(diagnostics, 'providerRequestFinishedAt');
      diagnostics.provider = {
        ...diagnostics.provider,
        name: providerOutput.provider,
        model: typeof providerOutput.metadata?.model === 'string' ? providerOutput.metadata.model : diagnostics.provider?.model,
        httpStatus: typeof providerOutput.metadata?.httpStatus === 'number' ? providerOutput.metadata.httpStatus : diagnostics.provider?.httpStatus,
        retryCount: typeof providerOutput.metadata?.retryCount === 'number' ? providerOutput.metadata.retryCount : diagnostics.provider?.retryCount,
        fallbackProvider: typeof providerOutput.metadata?.fallbackProvider === 'string' ? providerOutput.metadata.fallbackProvider : diagnostics.provider?.fallbackProvider,
        fallbackReason: typeof providerOutput.metadata?.fallbackReason === 'string' ? providerOutput.metadata.fallbackReason : diagnostics.provider?.fallbackReason,
      };
      await updateGenerationJob(job.id, { progress: job.mode === 'design-variants' ? resolveVariantCompleteProgress(batchCount, index) : 75, diagnostics });

      markTiming(diagnostics, 'postprocessStartedAt', 'postprocess');
      let outputDataUrl = await normalizeGeneratedImageDataUrl({
        dataUrl: providerOutput.dataUrl,
        targetWidth: localInpaint ? localInpaint.bbox.width : input.targetWidth,
        targetHeight: localInpaint ? localInpaint.bbox.height : input.targetHeight,
        mode: job.mode,
      });
      if (localInpaint) {
        outputDataUrl = await composeLocalInpaintResult({
          originalImageDataUrl: localInpaint.originalImageDataUrl,
          resultCropDataUrl: outputDataUrl,
          maskCropDataUrl: localInpaint.cropMaskDataUrl,
          bbox: localInpaint.bbox,
        });
      }
      const output = {
        ...providerOutput,
        dataUrl: outputDataUrl,
      };
      markTiming(diagnostics, 'postprocessFinishedAt');
      const progress = resolveVariantCompleteProgress(batchCount, index);
      await updateGenerationJob(job.id, { progress });

      markTiming(diagnostics, 'saveResultStartedAt', 'save-result');
      await updateGenerationJob(job.id, { progress: job.mode === 'design-variants' ? progress : 88, diagnostics });
      const outputAsset = await saveGeneratedDataUrl(job.userId, output.dataUrl, `generation-${job.id}-${index + 1}`);
      if (!firstOutputAsset) firstOutputAsset = outputAsset;
      outputAssetIds.push(outputAsset.id);

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
              variantIndex: index,
              variantCode: readVariantCode(index),
              variantName: resolveVariantName(job.config, index),
              variantLabel: readVariantLabel(index),
              variantStyle,
              stylePackId: typeof job.config.stylePackId === 'string' ? job.config.stylePackId : 'interior-common',
              batchCount,
            }
          : job.mode === 'plan-colorize'
            ? {
                ...(providerOutput.metadata || {}),
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
              }
          : job.mode === 'material-replace'
            ? {
                ...(providerOutput.metadata || {}),
                mode: 'material-replace',
                targetObjectType: typeof job.config.targetObjectType === 'string' ? job.config.targetObjectType : undefined,
                targetMaterial: typeof job.config.targetMaterial === 'string' ? job.config.targetMaterial : undefined,
              }
          : undefined,
      });

      if (!firstOutput) firstOutput = output;
      markTiming(diagnostics, 'saveResultFinishedAt');
    }

    if (!firstOutput || !firstOutputAsset) {
      throw new Error('Provider did not return a generation result.');
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
    const message = error instanceof Error ? error.message : 'Generation failed.';
    markTiming(diagnostics, 'jobFinishedAt', 'failed');
    finalizeDurations(diagnostics);
    logJobTiming(job.id, diagnostics, message);
    console.error('Generation job failed', { jobId: job.id, error: message });
    await updateGenerationJob(job.id, {
      status: 'failed',
      progress: 100,
      errorMessage: message,
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
  const materialReferenceAssetIds = Array.from(new Set([
    ...readStringArray(job.config.materialTextureAssetIds),
    ...readStringArray(job.config.materialReferenceAssetIds),
  ]));
  const assetIds = Array.from(new Set([
    ...job.inputAssetIds,
    ...materialReferenceAssetIds,
  ]));
  const imageDataUrls = await Promise.all(assetIds.map(assetId => getImageAssetDataUrl(assetId, job.userId)));
  const inputImageDataUrl = imageDataUrls[0];
  if (!inputImageDataUrl) {
    throw new Error('Input image asset was not found.');
  }

  const ownedMaterialReferenceImageDataUrls = await getOwnedAssetDataUrls(materialReferenceAssetIds, job.userId, 3, 'material reference');
  const publicMaterialReferenceImageDataUrls = await getMaterialTextureSourceDataUrls(job.config);
  const materialReferenceImageDataUrls = [
    ...ownedMaterialReferenceImageDataUrls,
    ...publicMaterialReferenceImageDataUrls,
  ].slice(0, 3);
  const furnitureReferenceImageDataUrls = await getOwnedAssetDataUrls(readStringArray(job.config.furnitureReferenceAssetIds), job.userId, 3, 'furniture reference');
  const additionalImageDataUrls = imageDataUrls.slice(1).filter(isNonEmptyString);
  const materialImageDataUrl = materialReferenceImageDataUrls[0] || additionalImageDataUrls[0];
  const floorplanTextureUrls = job.mode === 'floorplan' ? await getFloorplanTextureDataUrls(job.config) : [];
  const referenceImageDataUrls = [
    ...additionalImageDataUrls.slice(1).filter(url => !materialReferenceImageDataUrls.includes(url) && !furnitureReferenceImageDataUrls.includes(url)),
    ...floorplanTextureUrls,
  ];
  const isMaskedEditMode = job.mode === 'inpaint' || job.mode === 'material-replace';
  const maskMode = isMaskedEditMode && isMaskMode(job.config.maskMode) ? job.config.maskMode : undefined;
  const maskAssetId = maskMode === 'asset-mask' && typeof job.config.maskAssetId === 'string' ? job.config.maskAssetId : null;
  const maskImageDataUrl = maskMode === 'full-image'
    ? createFullImageMaskDataUrl()
    : maskAssetId ? await getImageAssetDataUrl(maskAssetId, job.userId) : undefined;

  const targetDimensions = await resolveTargetDimensions(job.config, inputImageDataUrl);
  const rawInput: GenerateImageInput = {
    mode: job.mode,
    inputImageDataUrl,
    materialImageDataUrl,
    referenceImageDataUrls,
    materialReferenceImageDataUrls,
    furnitureReferenceImageDataUrls,
    maskImageDataUrl,
    maskMode,
    prompt: buildProviderPromptForJob(job),
    config: removeInternalConfig(job.config),
    targetWidth: targetDimensions.targetWidth,
    targetHeight: targetDimensions.targetHeight,
    targetAspectRatio: targetDimensions.targetAspectRatio,
    editTarget: job.mode === 'material-replace' ? 'material' : readEditTarget(job.config.editTarget),
  };

  const localInpaint = await maybeCreateLocalInpaintContext(rawInput);
  const providerInput = localInpaint
    ? {
        ...rawInput,
        inputImageDataUrl: localInpaint.cropImageDataUrl,
        maskImageDataUrl: localInpaint.cropMaskDataUrl,
        targetWidth: localInpaint.bbox.width,
        targetHeight: localInpaint.bbox.height,
        targetAspectRatio: getAspectRatioString(localInpaint.bbox.width, localInpaint.bbox.height),
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
  }
  return { ...prepared, localInpaint: localInpaint || undefined };
}

async function resolveTargetDimensions(
  config: Record<string, unknown>,
  inputImageDataUrl: string,
): Promise<{ targetWidth?: number; targetHeight?: number; targetAspectRatio?: string }> {
  const configWidth = isValidTargetDimension(config.targetWidth) ? config.targetWidth : undefined;
  const configHeight = isValidTargetDimension(config.targetHeight) ? config.targetHeight : undefined;
  if (configWidth && configHeight) {
    return {
      targetWidth: configWidth,
      targetHeight: configHeight,
      targetAspectRatio: typeof config.targetAspectRatio === 'string' ? config.targetAspectRatio : getAspectRatioString(configWidth, configHeight),
    };
  }

  try {
    const size = await getImageSizeFromDataUrl(inputImageDataUrl);
    return {
      targetWidth: size.width,
      targetHeight: size.height,
      targetAspectRatio: getAspectRatioString(size.width, size.height),
    };
  } catch (error) {
    console.warn('Unable to infer target image size; generated output will not be resized.', {
      error: error instanceof Error ? error.message : 'unknown error',
    });
    return {};
  }
}

async function prepareGenerateInputForProvider(input: GenerateImageInput): Promise<{ input: GenerateImageInput; imageDiagnostics: NonNullable<GenerationJobDiagnostics['images']> }> {
  const imageMaxLongSide = readPositiveInteger(process.env.PROVIDER_IMAGE_MAX_LONG_SIDE, 1536);
  const referenceMaxLongSide = readPositiveInteger(process.env.PROVIDER_REFERENCE_MAX_LONG_SIDE, 1024);
  const quality = readPositiveInteger(process.env.PROVIDER_IMAGE_JPEG_QUALITY, 85);
  const maxReferenceImages = readPositiveInteger(process.env.MAX_PROVIDER_REFERENCE_IMAGES, 6);
  const maxPayloadBytes = readPositiveInteger(process.env.MAX_PROVIDER_PAYLOAD_BYTES, 8_000_000);
  const prepared: Array<{ role: string; image: PreparedProviderImage }> = [];

  const inputImage = await prepareImageForProvider({
    dataUrl: input.inputImageDataUrl,
    maxLongSide: imageMaxLongSide,
    quality,
    preferMime: 'image/jpeg',
  });
  prepared.push({ role: 'input', image: inputImage });

  const materialImage = input.materialImageDataUrl
    ? await prepareReferenceImage(input.materialImageDataUrl, 'material', referenceMaxLongSide, quality, prepared)
    : undefined;
  const materialReferences = await prepareReferenceImages(input.materialReferenceImageDataUrls, 'material-reference', 3, referenceMaxLongSide, quality, prepared);
  const furnitureReferences = await prepareReferenceImages(input.furnitureReferenceImageDataUrls, 'furniture-reference', 3, referenceMaxLongSide, quality, prepared);
  const remainingReferenceSlots = Math.max(0, maxReferenceImages - materialReferences.length - furnitureReferences.length - (materialImage ? 1 : 0));
  const additionalReferences = await prepareReferenceImages(input.referenceImageDataUrls, 'reference', remainingReferenceSlots, referenceMaxLongSide, quality, prepared);
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
  const payloadBytesApprox = images.reduce((sum, image) => sum + image.outputBytes, 0);
  if (payloadBytesApprox > maxPayloadBytes) {
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
    },
    imageDiagnostics: {
      inputImages: 1,
      referenceImages: images.length - 1,
      inputBytesBefore: inputImage.originalBytes,
      inputBytesAfter: inputImage.outputBytes,
      referenceBytesBefore: images.slice(1).reduce((sum, image) => sum + image.originalBytes, 0),
      referenceBytesAfter: images.slice(1).reduce((sum, image) => sum + image.outputBytes, 0),
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
  if (input.mode !== 'inpaint') return null;
  if (input.editTarget !== 'furniture') return null;
  if (input.maskMode !== 'asset-mask' || !input.maskImageDataUrl) return null;

  return createLocalInpaintContext({
    inputImageDataUrl: input.inputImageDataUrl,
    maskImageDataUrl: input.maskImageDataUrl,
    paddingRatio: Number(process.env.LOCAL_INPAINT_PADDING_RATIO || 0.15),
  });
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

function getAspectRatioString(width: number, height: number): string {
  const ratio = width / height;
  const candidates = [
    { value: '1:1', ratio: 1 },
    { value: '4:3', ratio: 4 / 3 },
    { value: '3:4', ratio: 3 / 4 },
    { value: '16:9', ratio: 16 / 9 },
    { value: '9:16', ratio: 9 / 16 },
  ];
  return candidates.reduce((best, candidate) => (
    Math.abs(candidate.ratio - ratio) < Math.abs(best.ratio - ratio) ? candidate : best
  )).value;
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

function parseDataUrl(dataUrl: string): { mimeType: string; content: Buffer } {
  const match = /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/u.exec(dataUrl);
  if (!match) {
    throw new Error('Provider returned an invalid data URL.');
  }

  return {
    mimeType: match[1],
    content: Buffer.from(match[2], 'base64'),
  };
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
  const mimeType = contentType?.startsWith('image/') ? contentType : fallbackMimeType;
  if (!mimeType.startsWith('image/')) {
    throw new Error('Downloaded URL did not return an image.');
  }

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
    return normalizeProviderOutput(await provider.generateImage(input));
  }

  try {
    return normalizeProviderOutput(await provider.generateImage(input));
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
      return normalizeProviderOutput({
        ...fallbackOutput,
        metadata: {
          ...fallbackOutput.metadata,
          fallbackProvider: fallbackProvider.name,
          fallbackReason: message,
        },
      });
    }

    if (isMissingProviderSecretError(error) || isGrsaiProvider(provider.name)) {
      throw error;
    }

    if (!isProviderFallbackEnabled()) {
      throw error;
    }

    const message = error instanceof Error ? error.message : `${provider.name} provider failed.`;
    return normalizeProviderOutput(createMockGeneration(input, [
      `${provider.name} provider failed to complete this generation: ${message}`,
      '已自动回退到 mock provider，避免请求中断。',
    ]));
  }
}

function toGenerateResponseBody(output: GenerateImageOutput): GenerateResponseBody {
  return {
    id: output.id,
    provider: output.provider,
    imageDataUrl: output.dataUrl,
    createdAt: output.createdAt,
    warnings: output.warnings,
  };
}

function normalizeProviderOutput(output: GenerateImageOutput): GenerateImageOutput {
  if (!isNonEmptyString(output.id)) {
    throw new Error('Generation provider returned an invalid id.');
  }

  if (!isProviderName(output.provider)) {
    throw new Error('Generation provider returned an invalid provider name.');
  }

  if (!isNonEmptyString(output.createdAt)) {
    throw new Error('Generation provider returned an invalid createdAt value.');
  }

  if (!Array.isArray(output.warnings) || !output.warnings.every(item => typeof item === 'string')) {
    throw new Error('Generation provider returned invalid warnings.');
  }

  if (!isValidImageDataUrl(output.dataUrl)) {
    throw new Error('Generation provider returned an invalid image data URL.');
  }

  return output;
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
  const status = readErrorStatus(error);
  return error.message.includes('timed out')
    || status === 429
    || (typeof status === 'number' && status >= 500);
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
    console.warn('AI_PROVIDER=gemini but GEMINI_API_KEY is missing; falling back to mock provider.');
  }

  return mockProvider;
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

const designVariantBasePrompt = 'Create one distinct design variant from the input image. Preserve the original layout, structure, camera angle, perspective, and main proportions. Change the design through materials, colors, lighting, furniture, landscape, and atmosphere. Keep it realistic and suitable for architectural or interior presentation. Do not alter the core geometry.';

const materialReplaceObjectLabels: Record<string, string> = {
  floor: 'floor',
  wall: 'wall',
  ceiling: 'ceiling',
  cabinet: 'cabinet',
  sofa: 'sofa',
  'table-chair': 'table and chairs',
  lighting: 'lighting fixtures',
  plant: 'plants or greenery',
  'door-window': 'doors or windows',
  'feature-wall': 'feature wall',
  other: 'selected area',
};

const materialReplaceMaterialLabels: Record<string, string> = {
  'light-wood': 'light wood finish',
  'dark-wood': 'dark wood finish',
  walnut: 'walnut wood finish',
  microcement: 'microcement finish',
  'rock-slab': 'sintered stone slab',
  marble: 'marble finish',
  terrazzo: 'terrazzo finish',
  tile: 'ceramic tile finish',
  leather: 'leather material',
  fabric: 'fabric upholstery',
  metal: 'metal finish',
  glass: 'glass material',
  'art-paint': 'artistic paint finish',
  'linear-light': 'linear lighting',
  'warm-light-strip': 'warm LED light strip',
  plant: 'natural greenery',
  custom: 'custom material described by the user',
};

const materialReplaceSmartPrompt = 'Replace the {targetObjectTypeLabel} area with {targetMaterialLabel}. Preserve the original layout, camera angle, perspective, geometry, lighting, shadows, and other non-target areas. Keep the result realistic and naturally integrated. Do not change the room structure or add unrelated objects.';
const materialReplaceMaskPrompt = 'Edit only the masked area. Replace the selected {targetObjectTypeLabel} with {targetMaterialLabel}. Preserve the original layout, camera angle, perspective, geometry, lighting, shadows, and all unmasked areas. Keep the result realistic and naturally integrated. Do not change the room structure or add unrelated objects.';

function resolveBatchCountForJob(job: GenerationJob): 1 | 2 | 4 | 8 {
  return resolveBatchCountForJobConfig(job.mode, job.config);
}

function resolveBatchCountForJobConfig(mode: GenerationRecord['mode'], config: Record<string, unknown>): 1 | 2 | 4 | 8 {
  if (mode !== 'design-variants') return 1;
  return config.batchCount === 2 || config.batchCount === 4 || config.batchCount === 8 ? config.batchCount : 4;
}

function resolveVariantStyles(config: Record<string, unknown>, batchCount: 1 | 2 | 4 | 8): string[] {
  if (batchCount === 1) return ['modern-minimal'];
  const styles = Array.isArray(config.variantStyles)
    ? config.variantStyles.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const defaults = defaultVariantStylesByCount[batchCount];
  const resolved = [...styles];
  for (const style of defaults) {
    if (resolved.length >= batchCount) break;
    if (!resolved.includes(style)) resolved.push(style);
  }
  return resolved.slice(0, batchCount);
}

function buildDesignVariantPrompt(job: GenerationJob, index: number, batchCount: 1 | 2 | 4 | 8, style: string): string {
  const strategy = job.config.variantStrategy === 'same-style' ? 'same-style' : 'style-matrix';
  const strength = job.config.strength === 'subtle' || job.config.strength === 'strong' ? job.config.strength : 'balanced';
  const customStyle = style === 'custom' && typeof job.config.customStyleLabel === 'string'
    ? `Direction: ${job.config.customStyleLabel.trim()}.`
    : variantStylePrompts[style] || variantStylePrompts['modern-minimal'];
  const parts = [
    designVariantBasePrompt,
    customStyle,
    strategy === 'same-style' ? sameStyleVariantPrompts[index] : undefined,
    strength === 'subtle'
      ? 'Change intensity: subtle.'
      : strength === 'strong'
        ? 'Change intensity: strong, but keep the structure.'
        : 'Change intensity: balanced.',
    typeof job.config.customPrompt === 'string' && job.config.customPrompt.trim().length > 0
      ? `User note: ${job.config.customPrompt.trim()}`
      : undefined,
    `This is ${readVariantLabel(index)} of ${batchCount}.`,
  ];
  return parts.filter((part): part is string => Boolean(part && part.trim().length > 0)).join(' ');
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

function resolveVariantStartProgress(batchCount: 1 | 2 | 4 | 8, index: number): number {
  if (batchCount === 1) return 28;
  return index === 0 ? 15 : resolveVariantCompleteProgress(batchCount, index - 1);
}

function resolveVariantCompleteProgress(batchCount: 1 | 2 | 4 | 8, index: number): number {
  if (batchCount === 2) return index === 0 ? 60 : 90;
  if (batchCount === 4) return [40, 60, 80, 90][index] || 90;
  if (batchCount === 8) return [25, 35, 45, 55, 65, 75, 84, 92][index] || 92;
  return 80;
}

function buildProviderPromptForJob(job: GenerationJob): string {
  if (job.mode === 'design-variants') {
    return buildDesignVariantPrompt(job, 0, resolveBatchCountForJob(job), resolveVariantStyles(job.config, resolveBatchCountForJob(job))[0] || 'modern-minimal');
  }

  if (job.mode === 'material-replace') {
    return buildMaterialReplacePrompt(job);
  }

  if (job.mode === 'plan-colorize') {
    return buildPlanColorizePrompt(job);
  }

  if (job.mode !== 'model-render') return job.prompt;

  return [
    'This is a viewport snapshot from a 3D clay/white model.',
    'Transform this 3D clay/white model viewport snapshot into a realistic architectural/interior rendering.',
    'Preserve the original geometry, massing, layout, camera angle, perspective, composition, and spatial proportions.',
    'Add materials, lighting, shadows, environment, furniture, landscape details, and atmosphere as appropriate.',
    'Do not change the fundamental structure unless the user explicitly asks.',
    `Building type: ${readConfigString(job.config.buildingType, 'unspecified')}.`,
    `Space type: ${readConfigString(job.config.spaceType, 'unspecified')}.`,
    `Rendering style: ${readConfigString(job.config.renderStyle, 'realistic architectural visualization')}.`,
    `Atmosphere: ${readConfigString(job.config.atmosphere, 'natural daylight')}.`,
    `Additional user instruction: ${readConfigString(job.config.customPrompt, job.prompt || 'none')}.`,
  ].join(' ');
}

function buildMaterialReplacePrompt(job: GenerationJob): string {
  const targetObjectKey = typeof job.config.targetObjectType === 'string' ? job.config.targetObjectType.trim() : 'other';
  const targetMaterialKey = typeof job.config.targetMaterial === 'string' ? job.config.targetMaterial.trim() : 'custom';
  const targetObjectTypeLabel = materialReplaceObjectLabels[targetObjectKey] || materialReplaceObjectLabels.other;
  const targetMaterialLabel = materialReplaceMaterialLabels[targetMaterialKey] || materialReplaceMaterialLabels.custom;
  const strength = job.config.strength === 'subtle' || job.config.strength === 'strong' ? job.config.strength : 'balanced';
  const editMode = job.config.editMode === 'mask' ? 'mask' : 'smart-type';
  const hasMaterialReference = readStringArray(job.config.materialReferenceAssetIds).length > 0
    || readStringArray(job.config.materialTextureAssetIds).length > 0;
  const customMaterialPrompt = typeof job.config.customMaterialPrompt === 'string' ? job.config.customMaterialPrompt.trim() : '';
  const basePrompt = editMode === 'mask' ? materialReplaceMaskPrompt : materialReplaceSmartPrompt;
  const parts = [
    basePrompt
      .replace('{targetObjectTypeLabel}', targetObjectTypeLabel)
      .replace('{targetMaterialLabel}', targetMaterialLabel),
    hasMaterialReference
      ? 'Use the material reference only for texture, color, finish, and material feeling. Do not copy its composition or objects.'
      : undefined,
    strength === 'subtle'
      ? 'Change intensity: subtle.'
      : strength === 'strong'
        ? 'Change intensity: strong, but preserve the structure.'
        : 'Change intensity: balanced.',
    customMaterialPrompt ? `User note: ${customMaterialPrompt}` : undefined,
  ];
  return parts.filter((part): part is string => Boolean(part && part.trim().length > 0)).join(' ');
}

const planColorizeBasePrompt = 'Transform the input black-and-white architectural plan into a clear colored presentation plan. Preserve the original walls, openings, layout, linework, proportions, and spatial relationships. Add professional architectural graphics, clean color fills, readable hierarchy, and presentation-quality details. Do not change the core plan geometry.';
const planDrawingPrompts: Record<string, string> = {
  residential: 'Plan type: residential interior plan.',
  commercial: 'Plan type: commercial space plan.',
  office: 'Plan type: office plan.',
  hotel: 'Plan type: hotel or hospitality plan.',
  landscape: 'Plan type: landscape plan.',
  'site-plan': 'Plan type: site plan or masterplan.',
  custom: 'Plan type: custom architectural drawing.',
};
const planTemplatePrompts: Record<string, string> = {
  'zoning-color': 'Focus on functional zoning colors with clear room/area differentiation.',
  'colored-plan': 'Create a polished colored floor plan with furniture, material fills, and clear visual hierarchy.',
  'landscape-plan': 'Enhance paving, planting, lawn, water, circulation, and outdoor materials.',
  'furniture-enhance': 'Clarify and enhance furniture, fixtures, and interior layout symbols.',
  'annotation-plan': 'Add concise room labels and readable annotation style.',
  'circulation-analysis': 'Add clear circulation arrows and movement hierarchy.',
};

function buildPlanColorizePrompt(job: GenerationJob): string {
  const drawingType = typeof job.config.drawingType === 'string' ? job.config.drawingType : 'residential';
  const template = typeof job.config.template === 'string' ? job.config.template : 'colored-plan';
  const labels = readStringArray(job.config.manualRoomLabels);
  const parts = [
    planColorizeBasePrompt,
    planDrawingPrompts[drawingType],
    planTemplatePrompts[template],
    job.config.enableZoningColor ? 'Use distinct but harmonious colors for different functional areas.' : undefined,
    job.config.enableRoomLabels ? 'Add concise room or area labels where appropriate.' : undefined,
    job.config.enableFurnitureEnhance ? 'Enhance furniture and fixture symbols while preserving layout.' : undefined,
    job.config.enableCirculationArrows ? 'Add subtle circulation arrows without cluttering the plan.' : undefined,
    job.config.enableScaleEnhance ? 'Improve scale readability with furniture, paving, texture, and line hierarchy.' : undefined,
    job.config.enableLandscapeFill ? 'Add landscape fills such as planting, paving, lawn, water, and outdoor texture.' : undefined,
    job.config.preserveLinework !== false ? 'Keep the original linework crisp and visible.' : undefined,
    labels.length > 0 ? `Use these labels when appropriate: ${labels.join(', ')}.` : undefined,
    typeof job.config.customPrompt === 'string' && job.config.customPrompt.trim().length > 0 ? `User note: ${job.config.customPrompt.trim()}` : undefined,
  ];
  return parts.filter((part): part is string => Boolean(part && part.trim().length > 0)).join(' ');
}

function readConfigString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function readModelSnapshotMetadata(value: unknown): GenerationRecord['modelSnapshotMetadata'] {
  if (!isRecord(value)) return null;
  if (value.sourceType !== 'model-snapshot' || typeof value.sourceModelAssetId !== 'string') return null;
  if (typeof value.width !== 'number' || typeof value.height !== 'number' || typeof value.createdAt !== 'string') return null;
  return {
    sourceType: 'model-snapshot',
    sourceModelAssetId: value.sourceModelAssetId,
    width: value.width,
    height: value.height,
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
    postprocess: diagnostics.timing?.postprocessDurationMs,
    saveResult: diagnostics.timing?.saveResultDurationMs,
    total: diagnostics.timing?.totalDurationMs,
    providerName: diagnostics.provider?.name,
    model: diagnostics.provider?.model,
    inputImages: diagnostics.images?.inputImages,
    referenceImages: diagnostics.images?.referenceImages,
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
  const status = (error as Error & { status?: unknown }).status;
  if (typeof status === 'number') return status;
  const match = /HTTP\s+(\d{3})|returned\s+(\d{3})/iu.exec(error.message);
  const parsed = Number(match?.[1] || match?.[2]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isMaskMode(value: unknown): value is MaskMode {
  return value === 'asset-mask' || value === 'full-image';
}

function isMissingProviderSecretError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('GRSAI_API_KEY is required');
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

function isGrsaiProvider(name: ProviderName): boolean {
  return name === 'grsai-banana2' || name === 'grsai-nano-banana';
}

function readEditTarget(value: unknown): GenerateImageInput['editTarget'] {
  if (value === 'material' || value === 'furniture' || value === 'general') return value;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
