export const downloadFallbackMessage = '下载失败，请右键图片另存为。';
export const downloadRetryMessage = '下载失败，请稍后重试';

export interface DownloadAssetSource {
  url?: string | null;
  assetId?: string | null;
  outputAssetId?: string | null;
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export async function downloadUrl(url: string, filename: string): Promise<void> {
  await downloadAsset(url, filename);
}

export async function downloadAsset(source: string | DownloadAssetSource, filename: string): Promise<void> {
  const normalized = normalizeDownloadSource(source);
  if (!normalized.url && !normalized.assetId) throw new Error(downloadRetryMessage);

  if (normalized.assetId) {
    await fetchBlobAndDownload(
      `/api/assets/${encodeURIComponent(normalized.assetId)}/download?filename=${encodeURIComponent(filename)}`,
      filename,
      false,
    );
    return;
  }

  if (normalized.url?.startsWith('data:image/')) {
    downloadDataUrl(normalized.url, filename);
    return;
  }

  if (!normalized.url) throw new Error(downloadRetryMessage);

  try {
    await fetchBlobAndDownload(normalized.url, filename, true);
  } catch {
    openDownloadFallback(normalized.url);
    throw new Error(downloadFallbackMessage);
  }
}

export function downloadJson(object: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(object, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  URL.revokeObjectURL(url);
}

export function buildResultImageFilename(input: {
  projectName?: string | null;
  featureLabel: string;
  date?: Date;
  extension?: string;
}): string {
  const projectName = sanitizeFilenamePart(input.projectName || 'archai-project');
  const featureLabel = sanitizeFilenamePart(input.featureLabel);
  const extension = sanitizeExtension(input.extension || 'png');
  return `${projectName}_${featureLabel}_${formatDownloadTimestamp(input.date || new Date())}.${extension}`;
}

function normalizeDownloadSource(source: string | DownloadAssetSource): { url?: string; assetId?: string } {
  if (typeof source === 'string') return { url: source };
  return {
    url: source.url || undefined,
    assetId: source.outputAssetId || source.assetId || undefined,
  };
}

async function fetchBlobAndDownload(url: string, filename: string, allowCorsFallback: boolean): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'same-origin' });
  } catch (error) {
    if (allowCorsFallback) throw new Error(downloadFallbackMessage);
    throw new Error(`下载失败：${error instanceof Error ? error.message : '网络请求失败'}`);
  }

  if (!response.ok) {
    throw new Error(await readDownloadError(response));
  }

  const blob = await response.blob();
  if (blob.size === 0) throw new Error('下载失败：原图资源为空');

  const objectUrl = URL.createObjectURL(blob);
  try {
    downloadDataUrl(objectUrl, filename);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

async function readDownloadError(response: Response): Promise<string> {
  try {
    const body = await response.clone().json() as { error?: { message?: string }; message?: string };
    const message = body.error?.message || body.message;
    if (message) return `下载失败：${message}`;
  } catch {
    // Fall through to status text.
  }
  return `下载失败：HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
}

function openDownloadFallback(url: string): void {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function sanitizeFilenamePart(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/gu, '-')
    .replace(/\s+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);
  return sanitized || 'archai';
}

function sanitizeExtension(value: string): string {
  const sanitized = value.toLowerCase().replace(/[^a-z0-9]+/gu, '');
  return sanitized || 'png';
}

function formatDownloadTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}
