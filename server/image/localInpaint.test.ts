import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { composeLocalInpaintResult, createLocalInpaintContext, cropImageDataUrlToBox, getMaskBoundingBox } from './localInpaint';
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

  it('uses local crop for small masks and skips large masks', async () => {
    const original = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#000000' } }).png().toBuffer();
    const smallMask = await createMask(100, 100, { x: 10, y: 10, width: 20, height: 20 });
    const largeMask = await createMask(100, 100, { x: 0, y: 0, width: 90, height: 80 });

    await expect(createLocalInpaintContext({
      inputImageDataUrl: toImageDataUrl(original, 'image/png'),
      maskImageDataUrl: toImageDataUrl(smallMask, 'image/png'),
      paddingRatio: 0,
      maxAreaRatio: 0.65,
    })).resolves.toMatchObject({ bbox: { x: 10, y: 10, width: 20, height: 20 } });

    await expect(createLocalInpaintContext({
      inputImageDataUrl: toImageDataUrl(original, 'image/png'),
      maskImageDataUrl: toImageDataUrl(largeMask, 'image/png'),
      paddingRatio: 0,
      maxAreaRatio: 0.65,
    })).resolves.toBeNull();
  });

  it('supports scaled object-insert crop and crops guide images to the same bbox', async () => {
    const original = await sharp({ create: { width: 100, height: 80, channels: 3, background: '#111111' } }).png().toBuffer();
    const guide = await sharp({ create: { width: 100, height: 80, channels: 3, background: '#222222' } }).png().toBuffer();
    const mask = await createMask(100, 80, { x: 40, y: 30, width: 20, height: 20 });
    const context = await createLocalInpaintContext({
      inputImageDataUrl: toImageDataUrl(original, 'image/png'),
      maskImageDataUrl: toImageDataUrl(mask, 'image/png'),
      cropScale: 1.75,
      maxAreaRatio: 0.85,
    });

    expect(context?.bbox.width).toBe(35);
    expect(context?.bbox.height).toBe(35);
    expect(context?.bbox.x).toBe(33);
    expect(context?.bbox.y).toBe(23);

    const croppedGuide = await cropImageDataUrlToBox(toImageDataUrl(guide, 'image/png'), context?.bbox || { x: 0, y: 0, width: 1, height: 1 });
    const metadata = await sharp(Buffer.from(croppedGuide.split(',')[1], 'base64')).metadata();
    expect(metadata.width).toBe(35);
    expect(metadata.height).toBe(35);
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
