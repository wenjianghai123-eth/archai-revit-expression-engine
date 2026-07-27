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
  cropScale?: number;
  maxAreaRatio?: number;
}

export interface LocalInpaintContext {
  originalImageDataUrl: string;
  originalMaskDataUrl: string;
  originalWidth: number;
  originalHeight: number;
  maskWidth: number;
  maskHeight: number;
  bbox: MaskBoundingBox;
  cropImageDataUrl: string;
  cropMaskDataUrl: string;
}

export async function prepareEditableMask(input: { maskImageDataUrl: string; protectionMaskDataUrl?: string; expansion?: number }): Promise<string> {
  const parsed = parseImageDataUrl(input.maskImageDataUrl);
  const metadata = await sharp(parsed.content).metadata();
  if (!metadata.width || !metadata.height) return input.maskImageDataUrl;
  const radius = Math.min(30, Math.abs(Math.round(input.expansion || 0)));
  let pipeline = sharp(parsed.content).resize(metadata.width, metadata.height, { fit: 'fill' }).greyscale().threshold(10);
  // libvips treats black as the foreground for these morphology operations,
  // so erode expands our white edit mask while dilate contracts it.
  if (radius > 0) pipeline = input.expansion && input.expansion < 0 ? pipeline.dilate(radius) : pipeline.erode(radius);
  const edit = await pipeline.raw().toBuffer();
  if (input.protectionMaskDataUrl) {
    const protection = parseImageDataUrl(input.protectionMaskDataUrl);
    const protectedPixels = await sharp(protection.content).resize(metadata.width, metadata.height, { fit: 'fill', kernel: sharp.kernel.nearest }).greyscale().threshold(10).raw().toBuffer();
    for (let index = 0; index < edit.length; index += 1) if (protectedPixels[index] > 10) edit[index] = 0;
  }
  const output = await sharp(edit, { raw: { width: metadata.width, height: metadata.height, channels: 1 } }).png().toBuffer();
  return toImageDataUrl(output, 'image/png');
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
  const maxAreaRatio = input.maxAreaRatio ?? 0.65;
  if ((bbox.width * bbox.height) / (imageMeta.width * imageMeta.height) >= maxAreaRatio) return null;

  const padded = input.cropScale && Number.isFinite(input.cropScale)
    ? scaleBoundingBox(bbox, imageMeta.width, imageMeta.height, input.cropScale)
    : padBoundingBox(bbox, imageMeta.width, imageMeta.height, input.paddingRatio ?? 0.15);
  const region = { left: padded.x, top: padded.y, width: padded.width, height: padded.height };
  const cropImage = await sharp(image.content).extract(region).png().toBuffer();
  const cropMask = await sharp(normalizedMask).extract(region).png().toBuffer();

  return {
    originalImageDataUrl: input.inputImageDataUrl,
    originalMaskDataUrl: input.maskImageDataUrl,
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
  featherRadius?: number;
}): Promise<string> {
  const original = parseImageDataUrl(input.originalImageDataUrl);
  const crop = parseImageDataUrl(input.resultCropDataUrl);
  const mask = parseImageDataUrl(input.maskCropDataUrl);
  const cropRaw = await sharp(crop.content).resize(input.bbox.width, input.bbox.height, { fit: 'cover' }).ensureAlpha().raw().toBuffer();
  const maskRaw = await sharp(mask.content)
    .resize(input.bbox.width, input.bbox.height, { fit: 'fill', kernel: sharp.kernel.nearest })
    .greyscale()
    .blur(Math.max(0.3, input.featherRadius ?? 0.3))
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

export interface PlanarPreviewPlacement {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  rotation?: unknown;
  cornerPoints?: unknown;
  normalizedBox?: unknown;
}

export async function composePlanarGraphicPreviewResult(input: {
  baseImageDataUrl: string;
  originalImageDataUrl: string;
  placementPreviewDataUrl: string;
  placements?: PlanarPreviewPlacement[];
  featherRadius?: number;
}): Promise<string> {
  const base = parseImageDataUrl(input.baseImageDataUrl);
  const original = parseImageDataUrl(input.originalImageDataUrl);
  const preview = parseImageDataUrl(input.placementPreviewDataUrl);
  const baseMetadata = await sharp(base.content).metadata();
  const originalMetadata = await sharp(original.content).metadata();
  if (!baseMetadata.width || !baseMetadata.height || !originalMetadata.width || !originalMetadata.height) {
    return input.baseImageDataUrl;
  }

  const width = baseMetadata.width;
  const height = baseMetadata.height;
  const originalRaw = await sharp(original.content)
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const previewRaw = await sharp(preview.content)
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const placementMask = await renderPlanarPlacementMask({
    width,
    height,
    sourceWidth: originalMetadata.width,
    sourceHeight: originalMetadata.height,
    placements: input.placements || [],
  });
  const alpha = Buffer.alloc(width * height, 0);
  let changedPixels = 0;

  for (let index = 0; index < alpha.length; index += 1) {
    if (placementMask[index] <= 0) continue;
    const offset = index * 4;
    const diff = Math.max(
      Math.abs(previewRaw[offset] - originalRaw[offset]),
      Math.abs(previewRaw[offset + 1] - originalRaw[offset + 1]),
      Math.abs(previewRaw[offset + 2] - originalRaw[offset + 2]),
      Math.abs(previewRaw[offset + 3] - originalRaw[offset + 3]),
    );
    if (diff > 2) {
      alpha[index] = 255;
      changedPixels += 1;
    }
  }

  if (changedPixels < 4 && input.placements?.length) {
    placementMask.copy(alpha);
    changedPixels = alpha.some(value => value > 0) ? 1 : 0;
  }
  if (changedPixels === 0) return input.baseImageDataUrl;

  const maskRaw = await sharp(alpha, { raw: { width, height, channels: 1 } })
    .blur(Math.max(0.3, input.featherRadius ?? 0.6))
    .greyscale()
    .raw()
    .toBuffer();
  for (let index = 0; index < maskRaw.length; index += 1) {
    previewRaw[index * 4 + 3] = maskRaw[index];
  }

  const overlay = await sharp(previewRaw, {
    raw: { width, height, channels: 4 },
  }).png().toBuffer();
  const composed = await sharp(base.content)
    .resize(width, height, { fit: 'fill' })
    .composite([{ input: overlay, left: 0, top: 0 }])
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

function scaleBoundingBox(box: MaskBoundingBox, imageWidth: number, imageHeight: number, scale: number): MaskBoundingBox {
  const safeScale = Math.min(2.2, Math.max(1.1, scale));
  const targetWidth = Math.min(imageWidth, Math.max(box.width, Math.round(box.width * safeScale)));
  const targetHeight = Math.min(imageHeight, Math.max(box.height, Math.round(box.height * safeScale)));
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const x = clamp(Math.round(centerX - targetWidth / 2), 0, Math.max(0, imageWidth - targetWidth));
  const y = clamp(Math.round(centerY - targetHeight / 2), 0, Math.max(0, imageHeight - targetHeight));
  return { x, y, width: targetWidth, height: targetHeight };
}

export async function cropImageDataUrlToBox(dataUrl: string, bbox: MaskBoundingBox): Promise<string> {
  const parsed = parseImageDataUrl(dataUrl);
  const metadata = await sharp(parsed.content).metadata();
  if (!metadata.width || !metadata.height) return dataUrl;
  const left = clamp(bbox.x, 0, Math.max(0, metadata.width - 1));
  const top = clamp(bbox.y, 0, Math.max(0, metadata.height - 1));
  const width = Math.max(1, Math.min(bbox.width, metadata.width - left));
  const height = Math.max(1, Math.min(bbox.height, metadata.height - top));
  const crop = await sharp(parsed.content)
    .resize(metadata.width, metadata.height, { fit: 'fill' })
    .extract({ left, top, width, height })
    .png()
    .toBuffer();
  return toImageDataUrl(crop, 'image/png');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function renderPlanarPlacementMask(input: {
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  placements: PlanarPreviewPlacement[];
}): Promise<Buffer> {
  const polygons = input.placements
    .map(placement => resolvePlacementPolygon(placement, input.width, input.height, input.sourceWidth, input.sourceHeight))
    .filter((points): points is Array<{ x: number; y: number }> => points.length >= 3);
  if (polygons.length === 0) return Buffer.alloc(input.width * input.height, 255);

  const polygonMarkup = polygons
    .map(points => `<polygon points="${points.map(point => `${point.x},${point.y}`).join(' ')}" fill="white"/>`)
    .join('');
  const svg = Buffer.from([
    `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">`,
    '<rect width="100%" height="100%" fill="black"/>',
    polygonMarkup,
    '</svg>',
  ].join(''));
  return sharp(svg).removeAlpha().greyscale().raw().toBuffer();
}

function resolvePlacementPolygon(
  placement: PlanarPreviewPlacement,
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number,
): Array<{ x: number; y: number }> {
  const explicitCorners = Array.isArray(placement.cornerPoints)
    ? placement.cornerPoints
        .map(point => isRecord(point) ? { x: readFiniteNumber(point.x), y: readFiniteNumber(point.y) } : null)
        .filter((point): point is { x: number; y: number } => Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y)))
    : [];
  if (explicitCorners.length >= 3) {
    const scaleX = width / Math.max(1, sourceWidth);
    const scaleY = height / Math.max(1, sourceHeight);
    return explicitCorners.map(point => ({
      x: roundMaskPoint(clamp(point.x * scaleX, 0, width)),
      y: roundMaskPoint(clamp(point.y * scaleY, 0, height)),
    }));
  }

  const normalizedBox = isRecord(placement.normalizedBox) ? placement.normalizedBox : null;
  const box = normalizedBox
    ? {
        x: readFiniteNumber(normalizedBox.x) * width,
        y: readFiniteNumber(normalizedBox.y) * height,
        width: readFiniteNumber(normalizedBox.width) * width,
        height: readFiniteNumber(normalizedBox.height) * height,
      }
    : {
        x: readFiniteNumber(placement.x) * width / Math.max(1, sourceWidth),
        y: readFiniteNumber(placement.y) * height / Math.max(1, sourceHeight),
        width: readFiniteNumber(placement.width) * width / Math.max(1, sourceWidth),
        height: readFiniteNumber(placement.height) * height / Math.max(1, sourceHeight),
      };
  if (!Number.isFinite(box.x) || !Number.isFinite(box.y) || box.width <= 0 || box.height <= 0) return [];

  const rotation = readFiniteNumber(placement.rotation);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radians = rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    { x: -box.width / 2, y: -box.height / 2 },
    { x: box.width / 2, y: -box.height / 2 },
    { x: box.width / 2, y: box.height / 2 },
    { x: -box.width / 2, y: box.height / 2 },
  ].map(point => ({
    x: roundMaskPoint(clamp(cx + point.x * cos - point.y * sin, 0, width)),
    y: roundMaskPoint(clamp(cy + point.x * sin + point.y * cos, 0, height)),
  }));
}

function readFiniteNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function roundMaskPoint(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
