import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { composeLocalInpaintResult, createLocalInpaintContext, getMaskBoundingBox } from './localInpaint';
import { toImageDataUrl } from './imageMetadata';

describe('local inpaint image helpers', () => {
  it('computes bbox from a binary mask', async () => {
    const mask = await createMask(10, 8, { x: 2, y: 3, width: 4, height: 2 });

    await expect(getMaskBoundingBox(toImageDataUrl(mask, 'image/png'))).resolves.toEqual({ x: 2, y: 3, width: 4, height: 2 });
  });

  it('creates crop context and composes result back to original size', async () => {
    const original = await sharp({ create: { width: 20, height: 12, channels: 3, background: '#000000' } }).png().toBuffer();
    const mask = await createMask(20, 12, { x: 5, y: 4, width: 4, height: 4 });
    const context = await createLocalInpaintContext({
      inputImageDataUrl: toImageDataUrl(original, 'image/png'),
      maskImageDataUrl: toImageDataUrl(mask, 'image/png'),
      paddingRatio: 0,
    });

    expect(context?.bbox).toEqual({ x: 5, y: 4, width: 4, height: 4 });

    const cropResult = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const composed = await composeLocalInpaintResult({
      originalImageDataUrl: toImageDataUrl(original, 'image/png'),
      resultCropDataUrl: toImageDataUrl(cropResult, 'image/png'),
      maskCropDataUrl: context?.cropMaskDataUrl || '',
      bbox: context?.bbox || { x: 0, y: 0, width: 1, height: 1 },
    });
    const metadata = await sharp(Buffer.from(composed.split(',')[1], 'base64')).metadata();
    expect(metadata.width).toBe(20);
    expect(metadata.height).toBe(12);
  });
});

function createMask(width: number, height: number, rect: { x: number; y: number; width: number; height: number }): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 3, 0);
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const index = (y * width + x) * 3;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}
