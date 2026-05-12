import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { getImageSizeFromDataUrl } from './imageMetadata';
import { normalizeGeneratedImageDataUrl } from './normalizeImage';

describe('normalizeGeneratedImageDataUrl', () => {
  it('resizes provider output to the requested target dimensions', async () => {
    const input = await makePngDataUrl(1024, 1024);

    const output = await normalizeGeneratedImageDataUrl({
      dataUrl: input,
      targetWidth: 800,
      targetHeight: 600,
      mode: 'style-render',
    });

    await expect(getImageSizeFromDataUrl(output)).resolves.toEqual({ width: 800, height: 600 });
  });

  it('returns the original data URL when target dimensions are missing', async () => {
    const input = await makePngDataUrl(320, 240);

    await expect(normalizeGeneratedImageDataUrl({ dataUrl: input })).resolves.toBe(input);
  });

  it('throws a clear error for invalid image data URLs', async () => {
    await expect(normalizeGeneratedImageDataUrl({
      dataUrl: 'data:text/plain;base64,Zm9v',
      targetWidth: 800,
      targetHeight: 600,
    })).rejects.toThrow('Invalid image data URL.');
  });
});

async function makePngDataUrl(width: number, height: number): Promise<string> {
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#ffffff',
    },
  }).png().toBuffer();

  return `data:image/png;base64,${buffer.toString('base64')}`;
}
