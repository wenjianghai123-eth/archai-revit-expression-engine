import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { uploadsDir } from '../fileStorage';
import { normalizeImageMimeType, sniffImageMimeType } from '../imageValidation';
import { getImageAsset } from '../storage';

export interface ApiYiInlineData {
  mimeType: 'image/png' | 'image/jpeg';
  data: string;
}

export async function loadAssetAsInlineData(assetIdOrUrl: string, options: { userId?: string } = {}): Promise<ApiYiInlineData> {
  const source = assetIdOrUrl.trim();
  if (!source) {
    throw createUnsupportedMimeError('图片素材为空。');
  }

  let resolvedSource = source;
  if (!source.startsWith('data:') && !source.startsWith('/uploads/') && !/^https?:\/\//iu.test(source) && options.userId) {
    const asset = await getImageAsset(source, options.userId);
    if (!asset) {
      throw createUnsupportedMimeError('找不到原始图片素材。');
    }
    resolvedSource = asset.url;
  }

  const parsed = resolvedSource.startsWith('data:')
    ? parseDataUrl(resolvedSource)
    : await readUrlOrUpload(resolvedSource);

  const mimeType = sniffImageMimeType(parsed.content) || normalizeMimeType(parsed.mimeType);

  if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
    return {
      mimeType,
      data: parsed.content.toString('base64'),
    };
  }

  try {
    const converted = await sharp(parsed.content).rotate().png().toBuffer();
    return {
      mimeType: 'image/png',
      data: converted.toString('base64'),
    };
  } catch {
    throw createUnsupportedMimeError(
      `不支持的图片格式：${mimeType}`,
      mimeType === 'image/webp'
        ? 'API易接口暂不支持直接使用 WEBP，请转换为 JPG/PNG 后重试。'
        : undefined,
    );
  }
}

function parseDataUrl(dataUrl: string): { mimeType: string; content: Buffer } {
  const match = /^data:([^;,]+)((?:;[^,]*)?),(.*)$/su.exec(dataUrl);
  if (!match || !match[1].startsWith('image/')) {
    throw createUnsupportedMimeError('图片 data URL 格式无效。');
  }

  const parameters = match[2] || '';
  const payload = match[3];
  if (/(?:^|;)base64(?:;|$)/iu.test(parameters) && !isStrictBase64(payload)) {
    throw createUnsupportedMimeError('Image base64 payload is invalid.');
  }
  const content = /(?:^|;)base64(?:;|$)/iu.test(parameters)
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload));
  if (content.length === 0) {
    throw createUnsupportedMimeError('图片内容为空。');
  }
  return {
    mimeType: normalizeMimeType(match[1]),
    content,
  };
}

function isStrictBase64(value: string): boolean {
  const normalized = value.replace(/\s/g, '');
  if (!normalized || normalized.startsWith('data:')) return false;
  if (!/^[a-z0-9+/]+={0,2}$/iu.test(normalized)) return false;
  return Buffer.from(normalized, 'base64').length > 0;
}

async function readUrlOrUpload(value: string): Promise<{ mimeType: string; content: Buffer }> {
  if (/^https?:\/\//iu.test(value)) {
    const response = await fetch(value);
    if (!response.ok) {
      throw createUnsupportedMimeError(`无法读取图片素材：HTTP ${response.status}`);
    }
    return {
      mimeType: normalizeMimeType(response.headers.get('content-type') || inferMimeType(value)),
      content: Buffer.from(await response.arrayBuffer()),
    };
  }

  if (value.startsWith('/uploads/')) {
    const relativePath = decodeURIComponent(value.replace(/^\/uploads\//u, ''));
    const resolvedPath = path.resolve(uploadsDir, relativePath);
    if (!resolvedPath.startsWith(path.resolve(uploadsDir))) {
      throw createUnsupportedMimeError('图片路径不合法。');
    }
    return {
      mimeType: inferMimeType(value),
      content: await readFile(resolvedPath),
    };
  }

  throw createUnsupportedMimeError('无法解析图片素材。请传入原始图片 data URL 或可读取的图片 URL。');
}

function normalizeMimeType(value: string): string {
  return normalizeImageMimeType(value);
}

function inferMimeType(value: string): string {
  const pathname = value.split('?')[0].toLowerCase();
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') || pathname.endsWith('.jfif')) return 'image/jpeg';
  if (pathname.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
}

function createUnsupportedMimeError(message: string, userMessage?: string): Error {
  const error = new Error(message) as Error & {
    provider?: string;
    providerError?: string;
    providerStatus?: string;
    userMessage?: string;
  };
  error.provider = 'apiyi';
  error.providerError = 'APIYI_UNSUPPORTED_IMAGE_MIME_TYPE';
  error.providerStatus = 'failed';
  error.userMessage = userMessage || 'API易图片编辑不支持当前图片格式，请使用 PNG 或 JPEG 后重试。';
  return error;
}
