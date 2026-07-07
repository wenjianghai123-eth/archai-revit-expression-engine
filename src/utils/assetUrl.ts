import { buildApiUrl } from '../lib/apiBaseUrl';

type AssetLike = {
  publicUrl?: string | null;
  url?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
};

export function resolveAssetUrl(url?: string | null): string {
  const rawUrl = url?.trim() || '';
  if (!rawUrl) return '';

  if (/^(https?:|data:|blob:)/iu.test(rawUrl)) {
    return rawUrl;
  }

  const normalizedPath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  if (normalizedPath.startsWith('/uploads/') || normalizedPath.startsWith('/api/')) {
    return buildApiUrl(normalizedPath);
  }

  return normalizedPath;
}

export function readAssetImageUrl(asset?: AssetLike | null): string {
  if (!asset) return '';
  return asset.publicUrl || asset.url || asset.thumbnailUrl || asset.previewUrl || '';
}

export function logAssetUploadSuccess(asset: unknown): void {
  if (!import.meta.env.DEV || !isRecord(asset)) return;
  console.debug('[asset] upload success', {
    assetId: readString(asset.id),
    url: readString(asset.url),
    publicUrl: readString(asset.publicUrl),
    thumbnailUrl: readString(asset.thumbnailUrl),
    path: readString(asset.path),
    storageProvider: readString(asset.storageProvider),
  });
}

export function logAssetImageRender(rawUrl: string | null | undefined, resolvedUrl: string): void {
  if (!import.meta.env.DEV) return;
  console.debug('[asset] render image', {
    rawUrl: rawUrl || '',
    resolvedUrl,
  });
}

export function warnImageLoadFailure(rawUrl: string | null | undefined, resolvedUrl: string): void {
  if (!import.meta.env.DEV) return;
  console.warn('[image] failed to load', {
    rawUrl: rawUrl || '',
    resolvedUrl,
  });
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
