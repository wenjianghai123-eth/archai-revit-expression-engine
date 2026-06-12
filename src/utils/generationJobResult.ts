import { GenerationResultOption } from '../types';

export type NormalizedGenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timeout' | 'unknown';

export interface NormalizedGenerationJobResult {
  status: NormalizedGenerationJobStatus;
  resultImages: GenerationResultOption[];
  outputAssetIds: string[];
  errorMessage: string | null;
}

export function normalizeGenerationJobResult(job: unknown): NormalizedGenerationJobResult {
  const record = isRecord(job) ? job : {};
  const status = normalizeGenerationJobStatus(readString(record.status));
  const outputAssetIds = collectOutputAssetIds(record);
  const resultImages = collectResultImages(record);
  const errorMessage = readFirstString(
    record.errorMessage,
    record.error_message,
    record.failureReason,
    record.failure_reason,
    record.message,
    record.error,
  );

  return {
    status,
    resultImages,
    outputAssetIds,
    errorMessage,
  };
}

export function normalizeGenerationJobStatus(status: string | null | undefined): NormalizedGenerationJobStatus {
  const value = (status || '').trim().toLowerCase();
  if (value === 'succeeded' || value === 'success' || value === 'completed' || value === 'done') return 'succeeded';
  if (value === 'failed' || value === 'error') return 'failed';
  if (value === 'cancelled' || value === 'canceled') return 'cancelled';
  if (value === 'failed_timeout' || value === 'timeout' || value === 'timed_out') return 'timeout';
  if (value === 'queued' || value === 'pending') return 'queued';
  if (value === 'running' || value === 'processing' || value === 'in_progress') return 'running';
  return 'unknown';
}

export function isGenerationJobRunningStatus(status: NormalizedGenerationJobStatus): boolean {
  return status === 'queued' || status === 'running';
}

function collectResultImages(record: Record<string, unknown>): GenerationResultOption[] {
  const images: GenerationResultOption[] = [];
  const seen = new Set<string>();

  const appendImage = (imageUrl: string | undefined, input: Partial<GenerationResultOption> = {}) => {
    if (!imageUrl || seen.has(imageUrl)) return;
    seen.add(imageUrl);
    images.push({
      id: input.id || `result-${images.length + 1}`,
      imageUrl,
      assetId: input.assetId,
      jobId: input.jobId,
      parentResultId: input.parentResultId,
      isSelected: input.isSelected ?? images.length === 0,
      isFavorite: input.isFavorite ?? false,
      createdAt: input.createdAt,
      metadata: input.metadata,
    });
  };

  for (const result of readArray(record.results)) {
    if (!isRecord(result)) continue;
    const asset = isRecord(result.asset) ? result.asset : null;
    const metadata = isRecord(result.metadata) ? result.metadata : null;
    appendImage(readFirstString(
      metadata?.originalUrl,
      metadata?.original_url,
      metadata?.outputUrl,
      metadata?.output_url,
      result.originalUrl,
      result.original_url,
      result.outputUrl,
      result.output_url,
      result.outputImageUrl,
      result.output_image_url,
      result.resultUrl,
      result.result_url,
      result.imageUrl,
      result.image_url,
      result.url,
      asset?.url,
    ), {
      id: readFirstString(result.id) || undefined,
      assetId: readFirstString(metadata?.originalAssetId, metadata?.original_asset_id, metadata?.outputAssetId, metadata?.output_asset_id, result.originalAssetId, result.original_asset_id, result.outputAssetId, result.output_asset_id, result.assetId, result.asset_id, asset?.id) || undefined,
      jobId: readFirstString(result.jobId, result.job_id) || undefined,
      parentResultId: readFirstString(result.parentResultId, result.parent_result_id) || undefined,
      isSelected: readBoolean(result.isSelected, result.is_selected) ?? images.length === 0,
      isFavorite: readBoolean(result.isFavorite, result.is_favorite) ?? false,
      createdAt: readFirstString(result.createdAt, result.created_at) || undefined,
      metadata: metadata || undefined,
    });
  }

  appendImage(readFirstString(
    record.originalUrl,
    record.original_url,
    record.resultUrl,
    record.result_url,
    record.outputUrl,
    record.output_url,
    record.imageUrl,
    record.image_url,
    record.outputImageUrl,
    record.output_image_url,
    record.outputAssetUrl,
    record.output_asset_url,
  ), {
    id: readFirstString(record.id) || undefined,
    assetId: readFirstString(record.originalAssetId, record.original_asset_id, record.outputAssetId, record.output_asset_id) || undefined,
    createdAt: readFirstString(record.finishedAt, record.finished_at, record.updatedAt, record.updated_at) || undefined,
  });

  const result = isRecord(record.result) ? record.result : null;
  const resultAsset = isRecord(result?.asset) ? result.asset : null;
  const resultMetadata = isRecord(result?.metadata) ? result.metadata : null;
  appendImage(readFirstString(
    resultMetadata?.originalUrl,
    resultMetadata?.original_url,
    resultMetadata?.outputUrl,
    resultMetadata?.output_url,
    result?.originalUrl,
    result?.original_url,
    result?.outputUrl,
    result?.output_url,
    result?.outputImageUrl,
    result?.output_image_url,
    result?.resultUrl,
    result?.result_url,
    result?.imageUrl,
    result?.image_url,
    result?.url,
    resultAsset?.url,
  ), {
    id: readFirstString(result?.id, record.id) || undefined,
    assetId: readFirstString(resultMetadata?.originalAssetId, resultMetadata?.original_asset_id, resultMetadata?.outputAssetId, resultMetadata?.output_asset_id, result?.originalAssetId, result?.original_asset_id, result?.outputAssetId, result?.output_asset_id, result?.assetId, result?.asset_id, resultAsset?.id) || undefined,
    metadata: resultMetadata || undefined,
  });

  for (const generationRecord of readArray(record.records)) {
    if (!isRecord(generationRecord)) continue;
    appendImage(readFirstString(
      generationRecord.originalUrl,
      generationRecord.original_url,
      generationRecord.outputUrl,
      generationRecord.output_url,
      generationRecord.outputImageUrl,
      generationRecord.output_image_url,
      generationRecord.outputImageDataPreview,
      generationRecord.output_image_data_preview,
    ), {
      id: readFirstString(generationRecord.id) || undefined,
      assetId: readFirstString(generationRecord.originalAssetId, generationRecord.original_asset_id, generationRecord.outputAssetId, generationRecord.output_asset_id) || undefined,
      createdAt: readFirstString(generationRecord.createdAt, generationRecord.created_at) || undefined,
    });
  }

  return images;
}

function collectOutputAssetIds(record: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  for (const value of readStringArray(record.outputAssetIds, record.output_asset_ids)) ids.add(value);
  const singleId = readFirstString(record.outputAssetId, record.output_asset_id);
  if (singleId) ids.add(singleId);
  const originalId = readFirstString(record.originalAssetId, record.original_asset_id);
  if (originalId) ids.add(originalId);

  for (const result of readArray(record.results)) {
    if (!isRecord(result)) continue;
    const asset = isRecord(result.asset) ? result.asset : null;
    const metadata = isRecord(result.metadata) ? result.metadata : null;
    const assetId = readFirstString(metadata?.originalAssetId, metadata?.original_asset_id, metadata?.outputAssetId, metadata?.output_asset_id, result.originalAssetId, result.original_asset_id, result.outputAssetId, result.output_asset_id, result.assetId, result.asset_id, asset?.id);
    if (assetId) ids.add(assetId);
  }

  return Array.from(ids);
}

function readFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = readString(value);
    if (text) return text;
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function readStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
