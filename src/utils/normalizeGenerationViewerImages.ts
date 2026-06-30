import { buildApiUrl } from '../lib/apiBaseUrl';

export type GenerationViewerAspectRatio = '16:9' | '2:1' | '1:1';

export interface NormalizedViewerImages {
  sourceImageUrl?: string;
  sourceImageAssetId?: string;
  resultImageUrl?: string;
  resultImageAssetId?: string;
  aspectRatio?: GenerationViewerAspectRatio;
}

export function normalizeGenerationViewerImages(input: unknown): NormalizedViewerImages {
  const record = isRecord(input) ? input : {};
  const config = readRecord(record.config);
  const nestedRecord = readRecord(record.record);
  const job = readRecord(record.job);
  const result = readRecord(record.result);
  const metadata = readRecord(record.metadata);
  const resultMetadata = readRecord(result.metadata);

  const sourceImageAssetId = readFirstString(
    record.sourceImageAssetId,
    record.sourceAssetId,
    record.inputImageAssetId,
    firstString(record.inputAssetIds),
    firstAssetId(record.inputAssets),
    config.sourceImageAssetId,
    config.sourceAssetId,
    config.inputImageAssetId,
    firstString(config.inputAssetIds),
    nestedRecord.sourceImageAssetId,
    nestedRecord.sourceAssetId,
    firstString(nestedRecord.inputAssetIds),
    job.sourceImageAssetId,
    job.sourceAssetId,
    firstString(job.inputAssetIds),
  ) || undefined;

  const resultImageAssetId = readFirstString(
    record.resultImageAssetId,
    record.outputImageAssetId,
    record.outputAssetId,
    firstString(record.outputAssetIds),
    resultMetadata.originalAssetId,
    resultMetadata.outputAssetId,
    resultMetadata.original_asset_id,
    resultMetadata.output_asset_id,
    result.assetId,
    result.outputAssetId,
    result.output_asset_id,
    metadata.originalAssetId,
    metadata.outputAssetId,
    metadata.original_asset_id,
    metadata.output_asset_id,
    nestedRecord.outputAssetId,
    firstString(nestedRecord.outputAssetIds),
    job.outputAssetId,
    firstString(job.outputAssetIds),
  ) || undefined;

  const sourceImageUrl = readFirstString(
    record.sourceImageUrl,
    record.sourceAssetUrl,
    record.inputImageUrl,
    record.inputImageDataPreview,
    firstUrl(record.inputAssets),
    config.sourceImageUrl,
    config.inputImageUrl,
    nestedRecord.inputImageUrl,
    nestedRecord.inputImageDataPreview,
    job.inputImageUrl,
    sourceImageAssetId ? buildImageAssetUrl(sourceImageAssetId) : undefined,
  ) || undefined;

  const resultImageUrl = readFirstString(
    record.resultImageUrl,
    record.outputImageUrl,
    record.outputUrl,
    record.resultUrl,
    record.imageUrl,
    record.previewUrl,
    resultMetadata.originalUrl,
    resultMetadata.outputUrl,
    resultMetadata.original_url,
    resultMetadata.output_url,
    result.outputUrl,
    result.resultUrl,
    result.imageUrl,
    result.previewUrl,
    nestedRecord.outputUrl,
    nestedRecord.previewUrl,
    job.outputUrl,
    job.previewUrl,
    record.thumbnailUrl,
    record.thumbnail,
    resultImageAssetId ? buildImageAssetUrl(resultImageAssetId) : undefined,
  ) || undefined;

  return {
    sourceImageUrl,
    sourceImageAssetId,
    resultImageUrl,
    resultImageAssetId,
    aspectRatio: readAspectRatio(record.aspectRatio) || readAspectRatio(config.aspectRatio),
  };
}

export function buildImageAssetUrl(assetId: string): string {
  return buildApiUrl(`/api/assets/${encodeURIComponent(assetId)}/download`);
}

function readFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function firstString(value: unknown): string | undefined {
  return Array.isArray(value) ? value.find((item): item is string => typeof item === 'string' && item.trim().length > 0)?.trim() : undefined;
}

function firstAssetId(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = readFirstString(item.assetId, item.id);
    if (id) return id;
  }
  return undefined;
}

function firstUrl(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    if (!isRecord(item)) continue;
    const url = readFirstString(item.url, item.dataUrl, item.imageUrl);
    if (url) return url;
  }
  return undefined;
}

function readAspectRatio(value: unknown): GenerationViewerAspectRatio | undefined {
  return value === '2:1' || value === '1:1' || value === '16:9' ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
