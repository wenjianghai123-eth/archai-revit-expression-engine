import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createStoredFilename, fileStorageProvider, uploadsDir } from './fileStorage';
import { isProviderFallbackEnabled } from './providers/fallback';
import { createGeminiProvider } from './providers/geminiProvider';
import { createGrsaiNanoBananaProvider } from './providers/grsaiNanoBananaProvider';
import { createMockGeneration, mockProvider } from './providers/mockProvider';
import { GenerateImageInput, GenerateImageOutput, ImageGenerationProvider, MaskMode, ProviderName } from './providers/types';
import {
  adjustCredits,
  createGenerationRecord,
  createGenerationResult,
  createImageAsset,
  GenerationJob,
  GenerationRecord,
  getCreditTransactionByReference,
  getGenerationJob,
  getImageAsset,
  ImageAsset,
  listRunnableGenerationJobs,
  updateGenerationJob,
} from './storage';
import { readBatchCount, isNonEmptyString } from './validation';

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
  const baseCost = mode === 'inpaint' ? 8 : 10;
  return baseCost * readBatchCount(config.batchCount);
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

  return (process.env.AI_PROVIDER || 'mock') === 'mock' && (process.env.AUTH_MODE || 'dev') === 'dev';
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

  try {
    await updateGenerationJob(job.id, {
      status: 'running',
      progress: 10,
      startedAt: new Date().toISOString(),
      errorMessage: null,
    });

    const input = await buildGenerateInputFromJob(job);
    const batchCount = readBatchCount(job.config.batchCount);
    const outputAssetIds: string[] = [];
    let firstOutput: GenerateImageOutput | null = null;
    let firstOutputAsset: ImageAsset | null = null;

    for (let index = 0; index < batchCount; index += 1) {
      const output = await generateWithFallback(input);
      const progress = 25 + Math.round(((index + 1) / batchCount) * 55);
      await updateGenerationJob(job.id, { progress });

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
      });

      if (!firstOutput) firstOutput = output;
    }

    if (!firstOutput || !firstOutputAsset) {
      throw new Error('Provider did not return a generation result.');
    }

    await updateGenerationJob(job.id, {
      status: 'succeeded',
      progress: 100,
      outputAssetId: firstOutputAsset.id,
      outputAssetIds,
      finishedAt: new Date().toISOString(),
    });

    await createGenerationRecord({
      userId: job.userId,
      projectId: job.projectId,
      jobId: job.id,
      mode: job.mode,
      prompt: job.prompt,
      inputImageUrl: await getInputAssetUrl(job.inputAssetIds[0], job.userId),
      outputImageUrl: firstOutputAsset.url,
      provider: firstOutput.provider,
      status: 'succeeded',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed.';
    console.error('Generation job failed', { jobId: job.id, error: message });
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
  const inputImageDataUrl = await getImageAssetDataUrl(job.inputAssetIds[0], job.userId);
  if (!inputImageDataUrl) {
    throw new Error('Input image asset was not found.');
  }

  const materialImageDataUrl = job.inputAssetIds[1] ? await getImageAssetDataUrl(job.inputAssetIds[1], job.userId) : undefined;
  const maskMode = job.mode === 'inpaint' && isMaskMode(job.config.maskMode) ? job.config.maskMode : undefined;
  const maskAssetId = maskMode === 'asset-mask' && typeof job.config.maskAssetId === 'string' ? job.config.maskAssetId : null;
  const maskImageDataUrl = maskMode === 'full-image'
    ? createFullImageMaskDataUrl()
    : maskAssetId ? await getImageAssetDataUrl(maskAssetId, job.userId) : undefined;

  return {
    mode: job.mode,
    inputImageDataUrl,
    materialImageDataUrl,
    maskImageDataUrl,
    maskMode,
    prompt: job.prompt,
    config: job.config,
  };
}

function createFullImageMaskDataUrl(): string {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#fff"/></svg>';
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function getImageAssetDataUrl(assetId: string | undefined, userId: string): Promise<string | undefined> {
  if (!assetId) return undefined;
  const asset = await getImageAsset(assetId, userId);
  if (!asset) return undefined;

  if (!asset.url.startsWith('/uploads/')) {
    return asset.url.startsWith('data:') ? asset.url : undefined;
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

async function generateWithFallback(input: GenerateImageInput): Promise<GenerateImageOutput> {
  if (provider.name === 'mock') {
    return normalizeProviderOutput(await provider.generateImage(input));
  }

  try {
    return normalizeProviderOutput(await provider.generateImage(input));
  } catch (error) {
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
  return value === 'mock' || value === 'gemini' || value === 'grsai-nano-banana';
}

function isValidImageDataUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  const match = /^data:([^;,]+)((?:;[^,]*)?),(.*)$/u.exec(value);
  return Boolean(match && match[1].startsWith('image/') && match[3].length > 0);
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

function isMaskMode(value: unknown): value is MaskMode {
  return value === 'asset-mask' || value === 'full-image';
}
