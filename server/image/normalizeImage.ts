import sharp from 'sharp';
import { parseImageDataUrl, toImageDataUrl, isValidTargetDimension } from './imageMetadata';
import type { GenerationMode } from '../providers/types';

export interface NormalizeGeneratedImageInput {
  dataUrl: string;
  targetWidth?: number;
  targetHeight?: number;
  mode?: GenerationMode;
}

export async function normalizeGeneratedImageDataUrl(input: NormalizeGeneratedImageInput): Promise<string> {
  if (input.targetWidth === undefined || input.targetHeight === undefined) {
    return input.dataUrl;
  }

  if (!isValidTargetDimension(input.targetWidth) || !isValidTargetDimension(input.targetHeight)) {
    return input.dataUrl;
  }

  const parsed = parseImageDataUrl(input.dataUrl);
  const outputMimeType = chooseOutputMimeType(parsed.mimeType);
  let pipeline = sharp(parsed.content)
    .resize(input.targetWidth, input.targetHeight, {
      fit: 'cover',
      position: 'centre',
    });

  if (outputMimeType === 'image/jpeg') {
    pipeline = pipeline.jpeg({ quality: 92 });
  } else if (outputMimeType === 'image/webp') {
    pipeline = pipeline.webp({ quality: 92 });
  } else {
    pipeline = pipeline.png();
  }

  return toImageDataUrl(await pipeline.toBuffer(), outputMimeType);
}

function chooseOutputMimeType(mimeType: string): 'image/png' | 'image/jpeg' | 'image/webp' {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'image/jpeg';
  if (mimeType === 'image/webp') return 'image/webp';
  return 'image/png';
}
