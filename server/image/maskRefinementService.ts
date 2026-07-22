import sharp from 'sharp';

export type MaskRefinementMode = 'smart' | 'precise';

export interface RefineMaskServiceInput {
  sourceImage: Buffer;
  roughMask: Buffer;
  mode: MaskRefinementMode;
  targetObject?: string;
}

export interface RefineMaskServiceResult {
  mask: Buffer;
  detectedObject: string;
  confidence: number;
  method: 'precise-pass-through' | 'edge-aware-seeded-region-growing';
}

export class MaskRefinementError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'MaskRefinementError';
    this.code = code;
  }
}

const MAX_WORKING_EDGE = 768;

/**
 * Refines a user-painted seed mask without requiring a heavyweight Python
 * segmentation runtime. Smart mode uses the source image itself as the
 * guidance signal and grows only through colour-similar, low-edge neighbours.
 */
export async function refineImageMask(input: RefineMaskServiceInput): Promise<RefineMaskServiceResult> {
  const sourceMetadata = await sharp(input.sourceImage).metadata().catch(() => null);
  if (!sourceMetadata?.width || !sourceMetadata.height) {
    throw new MaskRefinementError('无法读取原始图片。', 'MASK_REFINEMENT_IMAGE_INVALID');
  }

  const originalWidth = sourceMetadata.width;
  const originalHeight = sourceMetadata.height;
  const workScale = Math.min(1, MAX_WORKING_EDGE / Math.max(originalWidth, originalHeight));
  const width = Math.max(1, Math.round(originalWidth * workScale));
  const height = Math.max(1, Math.round(originalHeight * workScale));

  let source: Buffer;
  let rough: Buffer;
  try {
    source = await sharp(input.sourceImage)
      .resize(width, height, { fit: 'fill' })
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer();
    rough = await sharp(input.roughMask)
      .resize(width, height, { fit: 'fill', kernel: sharp.kernel.nearest })
      .greyscale()
      .raw()
      .toBuffer();
  } catch {
    throw new MaskRefinementError('粗略 Mask 不是有效图片。', 'MASK_REFINEMENT_MASK_INVALID');
  }

  const seed = new Uint8Array(width * height);
  let seedCount = 0;
  for (let index = 0; index < seed.length; index += 1) {
    if (rough[index] >= 32) {
      seed[index] = 1;
      seedCount += 1;
    }
  }
  if (seedCount === 0) {
    throw new MaskRefinementError('粗略 Mask 为空，请先涂抹目标区域。', 'MASK_REFINEMENT_EMPTY_MASK');
  }

  if (input.mode === 'precise') {
    return {
      mask: await encodeMask(seed, width, height, originalWidth, originalHeight),
      detectedObject: normalizeObjectName(input.targetObject) || 'selected-region',
      confidence: 1,
      method: 'precise-pass-through',
    };
  }

  const seedStats = calculateSeedStats(source, seed, width, height);
  const colourThreshold = clamp(40 + seedStats.spread * 1.35, 42, 108);
  const localThreshold = clamp(34 + seedStats.spread, 38, 82);
  const edgeThreshold = clamp(30 + seedStats.spread * 0.85, 36, 88);
  const grown = growSeededRegion({
    source,
    seed,
    width,
    height,
    mean: seedStats.mean,
    colourThreshold,
    localThreshold,
    edgeThreshold,
  });
  const refined = closeSmallGaps(grown, width, height, seed);
  const refinedCount = countSelected(refined);
  const detectedObject = normalizeObjectName(input.targetObject)
    || inferObjectName(seedStats.centroidX, seedStats.centroidY, refinedCount / refined.length);
  const coherence = clamp(1 - seedStats.spread / 120, 0, 1);
  const expansion = clamp((refinedCount / seedCount - 1) / 8, 0, 1);
  const confidence = Number(clamp(0.58 + coherence * 0.25 + expansion * 0.12, 0.55, 0.95).toFixed(2));

  return {
    mask: await encodeMask(refined, width, height, originalWidth, originalHeight),
    detectedObject,
    confidence,
    method: 'edge-aware-seeded-region-growing',
  };
}

function calculateSeedStats(source: Buffer, seed: Uint8Array, width: number, height: number): {
  mean: [number, number, number];
  spread: number;
  centroidX: number;
  centroidY: number;
} {
  let count = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < seed.length; index += 1) {
    if (!seed[index]) continue;
    count += 1;
    sumR += source[index * 3];
    sumG += source[index * 3 + 1];
    sumB += source[index * 3 + 2];
    sumX += index % width;
    sumY += Math.floor(index / width);
  }
  const mean: [number, number, number] = [sumR / count, sumG / count, sumB / count];
  let variance = 0;
  for (let index = 0; index < seed.length; index += 1) {
    if (!seed[index]) continue;
    variance += colourDistance(source, index, mean) ** 2;
  }
  return {
    mean,
    spread: Math.sqrt(variance / count),
    centroidX: sumX / count / Math.max(1, width - 1),
    centroidY: sumY / count / Math.max(1, height - 1),
  };
}

function growSeededRegion(input: {
  source: Buffer;
  seed: Uint8Array;
  width: number;
  height: number;
  mean: [number, number, number];
  colourThreshold: number;
  localThreshold: number;
  edgeThreshold: number;
}): Uint8Array {
  const output = new Uint8Array(input.seed);
  const queued = new Uint8Array(input.seed.length);
  const queue = new Int32Array(input.seed.length);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < input.seed.length; index += 1) {
    if (!input.seed[index]) continue;
    queue[tail] = index;
    tail += 1;
    queued[index] = 1;
  }

  const maximumArea = Math.floor(input.seed.length * 0.9);
  while (head < tail && tail < maximumArea) {
    const current = queue[head];
    head += 1;
    const x = current % input.width;
    const y = Math.floor(current / input.width);
    const neighbours = [
      x > 0 ? current - 1 : -1,
      x + 1 < input.width ? current + 1 : -1,
      y > 0 ? current - input.width : -1,
      y + 1 < input.height ? current + input.width : -1,
    ];
    for (const next of neighbours) {
      if (next < 0 || queued[next]) continue;
      const targetDistance = colourDistance(input.source, next, input.mean);
      const localDistance = pixelDistance(input.source, current, next);
      const edge = luminanceDistance(input.source, current, next);
      if (targetDistance > input.colourThreshold || localDistance > input.localThreshold || edge > input.edgeThreshold) continue;
      queued[next] = 1;
      output[next] = 1;
      queue[tail] = next;
      tail += 1;
      if (tail >= maximumArea) break;
    }
  }
  return output;
}

function closeSmallGaps(input: Uint8Array, width: number, height: number, seed: Uint8Array): Uint8Array {
  const dilated = new Uint8Array(input.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      for (let dy = -1; dy <= 1 && !dilated[index]; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && input[ny * width + nx]) {
            dilated[index] = 1;
            break;
          }
        }
      }
    }
  }
  const closed = new Uint8Array(input.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      let keep = true;
      for (let dy = -1; dy <= 1 && keep; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || !dilated[ny * width + nx]) {
            keep = false;
            break;
          }
        }
      }
      closed[index] = keep || seed[index] ? 1 : 0;
    }
  }
  return closed;
}

async function encodeMask(mask: Uint8Array, width: number, height: number, targetWidth: number, targetHeight: number): Promise<Buffer> {
  const pixels = Buffer.alloc(mask.length);
  for (let index = 0; index < mask.length; index += 1) pixels[index] = mask[index] ? 255 : 0;
  return sharp(pixels, { raw: { width, height, channels: 1 } })
    .resize(targetWidth, targetHeight, { fit: 'fill', kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
}

function colourDistance(source: Buffer, index: number, colour: [number, number, number]): number {
  const offset = index * 3;
  return Math.sqrt(
    (source[offset] - colour[0]) ** 2
    + (source[offset + 1] - colour[1]) ** 2
    + (source[offset + 2] - colour[2]) ** 2,
  );
}

function pixelDistance(source: Buffer, first: number, second: number): number {
  const a = first * 3;
  const b = second * 3;
  return Math.sqrt(
    (source[a] - source[b]) ** 2
    + (source[a + 1] - source[b + 1]) ** 2
    + (source[a + 2] - source[b + 2]) ** 2,
  );
}

function luminanceDistance(source: Buffer, first: number, second: number): number {
  return Math.abs(luminance(source, first) - luminance(source, second));
}

function luminance(source: Buffer, index: number): number {
  const offset = index * 3;
  return source[offset] * 0.2126 + source[offset + 1] * 0.7152 + source[offset + 2] * 0.0722;
}

function countSelected(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) count += value ? 1 : 0;
  return count;
}

function normalizeObjectName(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length <= 64 ? normalized : null;
}

function inferObjectName(_centroidX: number, centroidY: number, areaRatio: number): string {
  if (areaRatio >= 0.2 && centroidY >= 0.55) return 'floor';
  if (areaRatio >= 0.24) return 'wall';
  return 'object';
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
