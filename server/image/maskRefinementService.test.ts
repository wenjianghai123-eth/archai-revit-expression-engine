import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { refineImageMask } from './maskRefinementService';

describe('refineImageMask', () => {
  it.each([
    ['sofa', { left: 36, top: 26, width: 58, height: 34 }],
    ['wall', { left: 18, top: 12, width: 118, height: 42 }],
    ['floor', { left: 16, top: 54, width: 128, height: 36 }],
  ] as const)('expands a rough %s stroke to the complete bounded region', async (targetObject, region) => {
    const sourceImage = await createScene(region);
    const roughMask = await createMask({
      left: region.left + Math.floor(region.width / 2) - 4,
      top: region.top + Math.floor(region.height / 2) - 4,
      width: 8,
      height: 8,
    });

    const result = await refineImageMask({ sourceImage, roughMask, mode: 'smart', targetObject });
    const mask = await readMask(result.mask);

    expect(result.detectedObject).toBe(targetObject);
    expect(result.method).toBe('edge-aware-seeded-region-growing');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(mask[(region.top + 3) * 160 + region.left + 3]).toBeGreaterThan(200);
    expect(mask[(region.top + region.height - 4) * 160 + region.left + region.width - 4]).toBeGreaterThan(200);
    expect(mask[2 * 160 + 2]).toBe(0);
  });

  it('keeps precise masks unchanged instead of expanding them', async () => {
    const sourceImage = await createScene({ left: 30, top: 20, width: 80, height: 50 });
    const roughMask = await createMask({ left: 58, top: 38, width: 10, height: 9 });
    const result = await refineImageMask({ sourceImage, roughMask, mode: 'precise', targetObject: 'sofa' });
    const mask = await readMask(result.mask);
    const selected = mask.reduce((count, value) => count + (value > 200 ? 1 : 0), 0);

    expect(result.method).toBe('precise-pass-through');
    expect(result.confidence).toBe(1);
    expect(selected).toBe(90);
    expect(mask[38 * 160 + 58]).toBe(255);
    expect(mask[20 * 160 + 30]).toBe(0);
  });

  it('keeps furniture smart masks conservative when colour growing would consume the scene', async () => {
    const sourceImage = await sharp({ create: { width: 160, height: 100, channels: 3, background: { r: 180, g: 180, b: 176 } } }).png().toBuffer();
    const roughMask = await createMask({ left: 72, top: 48, width: 8, height: 8 });
    const result = await refineImageMask({ sourceImage, roughMask, mode: 'smart', targetObject: 'table-chair' });
    const mask = await readMask(result.mask);
    const selected = mask.reduce((count, value) => count + (value > 200 ? 1 : 0), 0);

    expect(result.detectedObject).toBe('table-chair');
    expect(selected / mask.length).toBeLessThan(0.35);
  });
});

async function createScene(region: { left: number; top: number; width: number; height: number }): Promise<Buffer> {
  return sharp({ create: { width: 160, height: 100, channels: 3, background: { r: 232, g: 228, b: 220 } } })
    .composite([{
      input: await sharp({ create: { width: region.width, height: region.height, channels: 3, background: { r: 72, g: 104, b: 132 } } }).png().toBuffer(),
      left: region.left,
      top: region.top,
    }])
    .png()
    .toBuffer();
}

async function createMask(region: { left: number; top: number; width: number; height: number }): Promise<Buffer> {
  return sharp({ create: { width: 160, height: 100, channels: 3, background: '#000000' } })
    .composite([{
      input: await sharp({ create: { width: region.width, height: region.height, channels: 3, background: '#ffffff' } }).png().toBuffer(),
      left: region.left,
      top: region.top,
    }])
    .png()
    .toBuffer();
}

async function readMask(mask: Buffer): Promise<Buffer> {
  return sharp(mask).greyscale().raw().toBuffer();
}
