import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { prepareImageForProvider, prepareMaskForProvider } from './prepareProviderImage';
import { toImageDataUrl } from './imageMetadata';

describe('prepareImageForProvider', () => {
  it('shrinks a large image to maxLongSide', async () => {
    const source = await sharp({
      create: {
        width: 2400,
        height: 1200,
        channels: 3,
        background: '#ffffff',
      },
    }).png().toBuffer();

    const prepared = await prepareImageForProvider({
      dataUrl: toImageDataUrl(source, 'image/png'),
      maxLongSide: 1024,
      preferMime: 'image/jpeg',
    });

    expect(Math.max(prepared.width, prepared.height)).toBe(1024);
    expect(prepared.originalWidth).toBe(2400);
    expect(prepared.outputBytes).toBeLessThan(prepared.originalBytes);
    expect(prepared.dataUrl).toMatch(/^data:image\/jpeg;base64,/u);
  });

  it('does not enlarge a small image', async () => {
    const source = await sharp({
      create: {
        width: 320,
        height: 240,
        channels: 3,
        background: '#ffffff',
      },
    }).jpeg().toBuffer();

    const prepared = await prepareImageForProvider({
      dataUrl: toImageDataUrl(source, 'image/jpeg'),
      maxLongSide: 1024,
      preferMime: 'image/jpeg',
    });

    expect(prepared.width).toBe(320);
    expect(prepared.height).toBe(240);
    expect(prepared.dataUrl).toMatch(/^data:image\/jpeg;base64,/u);
  });

  it('uses the provided smaller reference max long side', async () => {
    const source = await sharp({
      create: {
        width: 1600,
        height: 900,
        channels: 3,
        background: '#ffffff',
      },
    }).png().toBuffer();

    const prepared = await prepareImageForProvider({
      dataUrl: toImageDataUrl(source, 'image/png'),
      maxLongSide: 512,
      preferMime: 'image/jpeg',
    });

    expect(Math.max(prepared.width, prepared.height)).toBe(512);
  });

  it('resizes mask to match provider input dimensions with png output', async () => {
    const mask = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: '#000000',
      },
    }).png().toBuffer();

    const prepared = await prepareMaskForProvider({
      dataUrl: toImageDataUrl(mask, 'image/png'),
      width: 600,
      height: 400,
    });

    expect(prepared.width).toBe(600);
    expect(prepared.height).toBe(400);
    expect(prepared.dataUrl).toMatch(/^data:image\/png;base64,/u);
  });
});
