import sharp from 'sharp';
import { parseImageDataUrl, toImageDataUrl } from './imageMetadata';

export interface MaskBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LocalInpaintInput {
  inputImageDataUrl: string;
  maskImageDataUrl: string;
  paddingRatio?: number;
}

export interface LocalInpaintContext {
  originalImageDataUrl: string;
  originalWidth: number;
  originalHeight: number;
  maskWidth: number;
  maskHeight: number;
  bbox: MaskBoundingBox;
  cropImageDataUrl: string;
  cropMaskDataUrl: string;
}

export async function createLocalInpaintContext(input: LocalInpaintInput): Promise<LocalInpaintContext | null> {
  const image = parseImageDataUrl(input.inputImageDataUrl);
  const mask = parseImageDataUrl(input.maskImageDataUrl);
  const imageMeta = await sharp(image.content).metadata();
  const maskMeta = await sharp(mask.content).metadata();
  if (!imageMeta.width || !imageMeta.height || !maskMeta.width || !maskMeta.height) return null;

  const normalizedMask = await sharp(mask.content)
    .resize(imageMeta.width, imageMeta.height, { fit: 'fill', kernel: sharp.kernel.nearest })
    .greyscale()
    .threshold(10)
    .png()
    .toBuffer();
  const bbox = await getMaskBoundingBox(toImageDataUrl(normalizedMask, 'image/png'));
  if (!bbox || bbox.width < 4 || bbox.height < 4) return null;

  const padded = padBoundingBox(bbox, imageMeta.width, imageMeta.height, input.paddingRatio ?? 0.15);
  const region = { left: padded.x, top: padded.y, width: padded.width, height: padded.height };
  const cropImage = await sharp(image.content).extract(region).png().toBuffer();
  const cropMask = await sharp(normalizedMask).extract(region).png().toBuffer();

  return {
    originalImageDataUrl: input.inputImageDataUrl,
    originalWidth: imageMeta.width,
    originalHeight: imageMeta.height,
    maskWidth: imageMeta.width,
    maskHeight: imageMeta.height,
    bbox: padded,
    cropImageDataUrl: toImageDataUrl(cropImage, 'image/png'),
    cropMaskDataUrl: toImageDataUrl(cropMask, 'image/png'),
  };
}

export async function getMaskBoundingBox(maskImageDataUrl: string): Promise<MaskBoundingBox | null> {
  const parsed = parseImageDataUrl(maskImageDataUrl);
  const image = sharp(parsed.content);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) return null;

  const raw = await image.greyscale().raw().toBuffer();
  let minX = metadata.width;
  let minY = metadata.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < metadata.height; y += 1) {
    for (let x = 0; x < metadata.width; x += 1) {
      if (raw[y * metadata.width + x] > 10) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export async function composeLocalInpaintResult(input: {
  originalImageDataUrl: string;
  resultCropDataUrl: string;
  maskCropDataUrl: string;
  bbox: MaskBoundingBox;
}): Promise<string> {
  const original = parseImageDataUrl(input.originalImageDataUrl);
  const crop = parseImageDataUrl(input.resultCropDataUrl);
  const mask = parseImageDataUrl(input.maskCropDataUrl);
  const cropRaw = await sharp(crop.content).resize(input.bbox.width, input.bbox.height, { fit: 'cover' }).ensureAlpha().raw().toBuffer();
  const maskRaw = await sharp(mask.content)
    .resize(input.bbox.width, input.bbox.height, { fit: 'fill', kernel: sharp.kernel.nearest })
    .greyscale()
    .threshold(10)
    .raw()
    .toBuffer();

  for (let index = 0; index < maskRaw.length; index += 1) {
    cropRaw[index * 4 + 3] = maskRaw[index];
  }

  const overlay = await sharp(cropRaw, {
    raw: { width: input.bbox.width, height: input.bbox.height, channels: 4 },
  }).png().toBuffer();

  const composed = await sharp(original.content)
    .composite([{ input: overlay, left: input.bbox.x, top: input.bbox.y }])
    .png()
    .toBuffer();

  return toImageDataUrl(composed, 'image/png');
}

function padBoundingBox(box: MaskBoundingBox, imageWidth: number, imageHeight: number, ratio: number): MaskBoundingBox {
  const pad = Math.round(Math.max(box.width, box.height) * ratio);
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const right = Math.min(imageWidth, box.x + box.width + pad);
  const bottom = Math.min(imageHeight, box.y + box.height + pad);
  return { x, y, width: right - x, height: bottom - y };
}
