import { GenerationBatchItem, GenerationResultOption } from '../types';

interface ResultLike {
  imageUrl?: string | null;
  assetId?: string | null;
  metadata?: Record<string, unknown>;
}

export function getOriginalResultImageUrl(result: ResultLike | null | undefined, fallback?: string | null): string | null {
  return readFirstString(
    result?.metadata?.originalUrl,
    result?.metadata?.outputUrl,
    result?.metadata?.original_url,
    result?.metadata?.output_url,
    result?.imageUrl,
    fallback,
  );
}

export function getOriginalResultAssetId(result: ResultLike | null | undefined, fallback?: string | null): string | null {
  return readFirstString(
    result?.metadata?.originalAssetId,
    result?.metadata?.outputAssetId,
    result?.metadata?.original_asset_id,
    result?.metadata?.output_asset_id,
    result?.assetId,
    fallback,
  );
}

export function getResultDimensions(result: ResultLike | null | undefined): { width: number; height: number } | null {
  const width = readPositiveNumber(
    result?.metadata?.originalWidth,
    result?.metadata?.width,
    result?.metadata?.original_width,
  );
  const height = readPositiveNumber(
    result?.metadata?.originalHeight,
    result?.metadata?.height,
    result?.metadata?.original_height,
  );
  if (!width || !height) return null;
  return { width, height };
}

export function formatResultDimensions(result: GenerationResultOption | GenerationBatchItem | null | undefined): string | null {
  const dimensions = getResultDimensions(result);
  return dimensions ? `${dimensions.width} × ${dimensions.height}` : null;
}

function readFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function readPositiveNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
  }
  return null;
}
