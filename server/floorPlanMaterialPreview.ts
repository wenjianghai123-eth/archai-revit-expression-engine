import sharp from 'sharp';
import { renderFloorPlanRegionMask } from './floorPlanSegmentation';
import type { FloorPlanRegion, SaveFloorPlanRegionMaterialInput } from './storage';

export interface ComposeFloorPlanMaterialPreviewInput {
  sourceImage: Buffer;
  width: number;
  height: number;
  regions: FloorPlanRegion[];
  assignments: SaveFloorPlanRegionMaterialInput[];
  materialImages: Map<string, Buffer>;
}

const MAX_PIXELS = 40_000_000;

export async function composeFloorPlanMaterialPreview(input: ComposeFloorPlanMaterialPreviewInput): Promise<Buffer> {
  const { width, height } = input;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > MAX_PIXELS) {
    throw new MaterialPreviewError('平面图尺寸无效或过大。', 'FLOOR_PLAN_MATERIAL_PREVIEW_SIZE_INVALID');
  }

  let source: Buffer;
  try {
    source = await sharp(input.sourceImage)
      .rotate()
      .resize(width, height, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer();
  } catch {
    throw new MaterialPreviewError('无法解析原始平面图。', 'FLOOR_PLAN_MATERIAL_PREVIEW_SOURCE_INVALID');
  }

  const output = Buffer.from(source);
  const assignments = new Map(input.assignments.map(assignment => [assignment.regionId, assignment]));

  for (const region of input.regions) {
    const assignment = assignments.get(region.id);
    if (!assignment || assignment.fallbackMode === 'ai-auto') continue;

    const maskPng = await renderFloorPlanRegionMask(width, height, region.polygon);
    const mask = await sharp(maskPng).greyscale().raw().toBuffer();
    const bounds = polygonBounds(region.polygon, width, height);

    if (assignment.fallbackMode === 'default') {
      applySolidFill(output, mask, width, bounds, [232, 226, 214], 0.68);
      continue;
    }

    const assetId = assignment.materialAssetId;
    const textureImage = assetId ? input.materialImages.get(assetId) : null;
    if (!assetId || !textureImage) {
      throw new MaterialPreviewError(`区域 ${region.id} 缺少材质参考图。`, 'FLOOR_PLAN_MATERIAL_REFERENCE_REQUIRED');
    }
    const tile = await createTextureTile(textureImage, assignment, region, width, height);
    applyTexture(output, mask, width, bounds, tile, assignment.jointMode);
  }

  restoreOriginalLinework(output, source);
  return sharp(output, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

export class MaterialPreviewError extends Error {
  constructor(message: string, readonly code: string) { super(message); }
}

interface PixelBounds { minX: number; minY: number; maxX: number; maxY: number }
interface TextureTile { data: Buffer; width: number; height: number; originX: number; originY: number }

async function createTextureTile(
  image: Buffer,
  assignment: SaveFloorPlanRegionMaterialInput,
  region: FloorPlanRegion,
  width: number,
  height: number,
): Promise<TextureTile> {
  const bounds = polygonBounds(region.polygon, width, height);
  const regionWidth = Math.max(1, bounds.maxX - bounds.minX + 1);
  const regionHeight = Math.max(1, bounds.maxY - bounds.minY + 1);
  const directionRotation = assignment.direction === 'vertical'
    ? 90
    : assignment.direction === 'diagonal'
      ? 45
      : assignment.direction === 'auto' && regionHeight > regionWidth
        ? 90
        : 0;
  const rotation = normalizeRotation(directionRotation + assignment.rotation);
  const baseSize = Math.round(Math.min(width, height) * 0.22 * assignment.scale);
  const tileSize = clamp(baseSize, 24, Math.min(2048, Math.max(width, height)));
  try {
    const { data, info } = await sharp(image)
      .rotate(rotation, { background: { r: 245, g: 245, b: 245, alpha: 1 } })
      .resize(tileSize, tileSize, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, originX: bounds.minX, originY: bounds.minY };
  } catch {
    throw new MaterialPreviewError(`区域 ${region.id} 的材质参考图无法解析。`, 'FLOOR_PLAN_MATERIAL_IMAGE_INVALID');
  }
}

function applyTexture(
  output: Buffer,
  mask: Buffer,
  imageWidth: number,
  bounds: PixelBounds,
  tile: TextureTile,
  jointMode: SaveFloorPlanRegionMaterialInput['jointMode'],
) {
  const jointWidth = jointMode === 'visible' ? 2 : jointMode === 'subtle' ? 1 : 0;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const pixelIndex = y * imageWidth + x;
      const maskAlpha = mask[pixelIndex] / 255;
      if (maskAlpha <= 0) continue;
      const tx = positiveModulo(x - tile.originX, tile.width);
      const ty = positiveModulo(y - tile.originY, tile.height);
      const tileIndex = (ty * tile.width + tx) * 3;
      const isJoint = jointWidth > 0 && (tx < jointWidth || ty < jointWidth);
      const target: [number, number, number] = isJoint
        ? jointMode === 'visible' ? [155, 155, 155] : [205, 205, 205]
        : [tile.data[tileIndex], tile.data[tileIndex + 1], tile.data[tileIndex + 2]];
      blendPixel(output, pixelIndex, target, maskAlpha * 0.88);
    }
  }
}

function applySolidFill(output: Buffer, mask: Buffer, imageWidth: number, bounds: PixelBounds, color: [number, number, number], opacity: number) {
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const pixelIndex = y * imageWidth + x;
      const maskAlpha = mask[pixelIndex] / 255;
      if (maskAlpha > 0) blendPixel(output, pixelIndex, color, maskAlpha * opacity);
    }
  }
}

function blendPixel(output: Buffer, pixelIndex: number, target: [number, number, number], alpha: number) {
  const offset = pixelIndex * 4;
  const inverse = 1 - alpha;
  output[offset] = Math.round(output[offset] * inverse + target[0] * alpha);
  output[offset + 1] = Math.round(output[offset + 1] * inverse + target[1] * alpha);
  output[offset + 2] = Math.round(output[offset + 2] * inverse + target[2] * alpha);
  output[offset + 3] = 255;
}

function restoreOriginalLinework(output: Buffer, source: Buffer) {
  for (let offset = 0; offset < source.length; offset += 4) {
    const luminance = 0.2126 * source[offset] + 0.7152 * source[offset + 1] + 0.0722 * source[offset + 2];
    const ink = clamp((210 - luminance) / 90, 0, 1);
    if (ink <= 0) continue;
    const inverse = 1 - ink;
    output[offset] = Math.round(output[offset] * inverse + source[offset] * ink);
    output[offset + 1] = Math.round(output[offset + 1] * inverse + source[offset + 1] * ink);
    output[offset + 2] = Math.round(output[offset + 2] * inverse + source[offset + 2] * ink);
  }
}

function polygonBounds(polygon: [number, number][], width: number, height: number): PixelBounds {
  const xs = polygon.map(point => point[0]);
  const ys = polygon.map(point => point[1]);
  return {
    minX: clamp(Math.floor(Math.min(...xs) * width), 0, width - 1),
    minY: clamp(Math.floor(Math.min(...ys) * height), 0, height - 1),
    maxX: clamp(Math.ceil(Math.max(...xs) * width), 0, width - 1),
    maxY: clamp(Math.ceil(Math.max(...ys) * height), 0, height - 1),
  };
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function normalizeRotation(value: number): number {
  return ((value % 360) + 360) % 360;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
