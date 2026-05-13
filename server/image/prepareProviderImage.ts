import sharp from 'sharp';
import { toImageDataUrl } from './imageMetadata';

export interface PrepareImageForProviderInput {
  dataUrl: string;
  maxLongSide?: number;
  quality?: number;
  preferMime?: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface PreparedProviderImage {
  dataUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  originalBytes: number;
  outputBytes: number;
  mime: string;
}

const defaultMaxLongSide = 1536;
const defaultQuality = 85;

export async function prepareImageForProvider(input: PrepareImageForProviderInput): Promise<PreparedProviderImage> {
  const parsed = parseAnyImageDataUrl(input.dataUrl);
  const metadata = await sharp(parsed.content).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to read provider image dimensions.');
  }

  const maxLongSide = input.maxLongSide ?? defaultMaxLongSide;
  const scale = Math.min(1, maxLongSide / Math.max(metadata.width, metadata.height));
  const width = Math.max(1, Math.round(metadata.width * scale));
  const height = Math.max(1, Math.round(metadata.height * scale));
  const mime = chooseOutputMime(parsed.mimeType, input.preferMime, Boolean(metadata.hasAlpha));
  const quality = input.quality ?? defaultQuality;

  let pipeline = sharp(parsed.content).rotate();
  if (scale < 1) {
    pipeline = pipeline.resize(width, height, { fit: 'inside', withoutEnlargement: true });
  }

  if (mime === 'image/jpeg') {
    pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true });
  } else if (mime === 'image/webp') {
    pipeline = pipeline.webp({ quality });
  } else {
    pipeline = pipeline.png();
  }

  const output = await pipeline.toBuffer();
  return {
    dataUrl: toImageDataUrl(output, mime),
    width,
    height,
    originalWidth: metadata.width,
    originalHeight: metadata.height,
    originalBytes: parsed.content.length,
    outputBytes: output.length,
    mime,
  };
}

export async function prepareMaskForProvider(input: {
  dataUrl: string;
  width: number;
  height: number;
}): Promise<PreparedProviderImage> {
  const parsed = parseAnyImageDataUrl(input.dataUrl);
  const metadata = await sharp(parsed.content).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to read provider mask dimensions.');
  }

  const output = await sharp(parsed.content)
    .resize(input.width, input.height, { fit: 'fill', kernel: sharp.kernel.nearest })
    .greyscale()
    .threshold(10)
    .png()
    .toBuffer();

  return {
    dataUrl: toImageDataUrl(output, 'image/png'),
    width: input.width,
    height: input.height,
    originalWidth: metadata.width,
    originalHeight: metadata.height,
    originalBytes: parsed.content.length,
    outputBytes: output.length,
    mime: 'image/png',
  };
}

function chooseOutputMime(
  inputMime: string,
  preferMime: PrepareImageForProviderInput['preferMime'],
  hasAlpha: boolean,
): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (hasAlpha && preferMime === 'image/jpeg') return 'image/png';
  if (preferMime) return preferMime;
  if (hasAlpha || inputMime === 'image/png') return 'image/png';
  if (inputMime === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

function parseAnyImageDataUrl(dataUrl: string): { mimeType: string; content: Buffer } {
  const match = /^data:([^;,]+)((?:;[^,]*)?),(.*)$/su.exec(dataUrl);
  if (!match || !match[1].startsWith('image/')) {
    throw new Error('Invalid image data URL.');
  }

  const mimeType = match[1].toLowerCase();
  const parameters = match[2] || '';
  const payload = match[3];
  const isBase64 = /(?:^|;)base64(?:;|$)/iu.test(parameters);
  const content = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload));
  if (content.length === 0) {
    throw new Error('Image data URL is empty.');
  }

  return { mimeType, content };
}
