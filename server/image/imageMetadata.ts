import sharp from 'sharp';

export interface ParsedDataUrl {
  mimeType: string;
  content: Buffer;
}

export function parseImageDataUrl(dataUrl: string): ParsedDataUrl {
  const match = /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/u.exec(dataUrl);
  if (!match || !match[1].startsWith('image/')) {
    throw new Error('Invalid image data URL.');
  }

  const content = Buffer.from(match[2], 'base64');
  if (content.length === 0) {
    throw new Error('Image data URL is empty.');
  }

  return {
    mimeType: match[1].toLowerCase(),
    content,
  };
}

export function toImageDataUrl(content: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${content.toString('base64')}`;
}

export async function getImageSizeFromDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
  const parsed = parseImageDataUrl(dataUrl);
  const metadata = await sharp(parsed.content).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to read image dimensions from data URL.');
  }

  return {
    width: metadata.width,
    height: metadata.height,
  };
}

export function isValidTargetDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 64 && value <= 8192;
}
