import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';

import { applyFreeReferenceCrops, prepareGenerateInputForProvider, resolveProviderImageSettings } from './generationService';
import { getImageSizeFromDataUrl } from './image/imageMetadata';
import { toImageDataUrl } from './image/imageMetadata';

describe('generation quality preprocessing', () => {
  const originalEnv = {
    PROVIDER_IMAGE_MAX_LONG_SIDE: process.env.PROVIDER_IMAGE_MAX_LONG_SIDE,
    PROVIDER_REFERENCE_MAX_LONG_SIDE: process.env.PROVIDER_REFERENCE_MAX_LONG_SIDE,
    PROVIDER_IMAGE_JPEG_QUALITY: process.env.PROVIDER_IMAGE_JPEG_QUALITY,
    MAX_PROVIDER_REFERENCE_IMAGES: process.env.MAX_PROVIDER_REFERENCE_IMAGES,
    MAX_PROVIDER_PAYLOAD_BYTES: process.env.MAX_PROVIDER_PAYLOAD_BYTES,
    PROVIDER_DEFAULT_QUALITY_MODE: process.env.PROVIDER_DEFAULT_QUALITY_MODE,
    DEFAULT_QUALITY_MODE: process.env.DEFAULT_QUALITY_MODE,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('uses draft, fast, balanced, and high parameter defaults', () => {
    expect(resolveProviderImageSettings('draft')).toMatchObject({
      imageMaxLongSide: 768,
      referenceMaxLongSide: 512,
      quality: 72,
      maxReferenceImages: 1,
      maxPayloadBytes: 2_500_000,
    });
    expect(resolveProviderImageSettings('fast')).toMatchObject({
      imageMaxLongSide: 1024,
      referenceMaxLongSide: 768,
      quality: 78,
      maxReferenceImages: 2,
      maxPayloadBytes: 4_000_000,
    });
    expect(resolveProviderImageSettings('balanced')).toMatchObject({
      imageMaxLongSide: 1280,
      referenceMaxLongSide: 768,
      quality: 80,
      maxReferenceImages: 3,
      maxPayloadBytes: 6_000_000,
    });
    expect(resolveProviderImageSettings('high')).toMatchObject({
      imageMaxLongSide: 1536,
      referenceMaxLongSide: 1024,
      quality: 85,
      maxReferenceImages: 6,
      maxPayloadBytes: 10_000_000,
    });
  });

  it('defaults to fast and allows environment overrides', () => {
    expect(resolveProviderImageSettings(undefined).qualityMode).toBe('fast');

    process.env.PROVIDER_DEFAULT_QUALITY_MODE = 'balanced';
    process.env.PROVIDER_IMAGE_MAX_LONG_SIDE = '999';
    process.env.MAX_PROVIDER_REFERENCE_IMAGES = '4';

    expect(resolveProviderImageSettings(undefined)).toMatchObject({
      qualityMode: 'balanced',
      imageMaxLongSide: 999,
      maxReferenceImages: 4,
    });
  });

  it('fast mode reduces input dimensions and limits reference images', async () => {
    const input = await createImage(2400, 1200, '#ffffff');
    const references = await Promise.all([
      createImage(1600, 900, '#ff0000'),
      createImage(1600, 900, '#00ff00'),
      createImage(1600, 900, '#0000ff'),
    ]);

    const result = await prepareGenerateInputForProvider({
      mode: 'style-render',
      inputImageDataUrl: input,
      referenceImageDataUrls: references,
      prompt: 'render',
      config: {},
      qualityMode: 'fast',
    });

    expect(result.imageDiagnostics.qualityMode).toBe('fast');
    expect(result.imageDiagnostics.inputWidthBefore).toBe(2400);
    expect(result.imageDiagnostics.inputWidthAfter).toBe(1024);
    expect(result.imageDiagnostics.referenceCount).toBe(2);
    expect(result.input.referenceImageDataUrls).toHaveLength(2);
    expect(result.imageDiagnostics.payloadBytesApprox).toEqual(expect.any(Number));
  });

  it('keeps up to six formal free-reference inputs in balanced mode', async () => {
    const input = await createImage(32, 32, '#ffffff');
    const references = await Promise.all(Array.from({ length: 6 }, (_, index) => createImage(24, 24, index % 2 ? '#ff0000' : '#0000ff')));
    const result = await prepareGenerateInputForProvider({
      mode: 'style-render', step: 'free_reference_image', inputImageDataUrl: input, referenceImageDataUrls: references,
      prompt: 'render', config: { step: 'free_reference_image' }, qualityMode: 'balanced',
    });
    expect(result.input.referenceImageDataUrls).toHaveLength(6);
    expect(result.imageDiagnostics.referenceCount).toBe(6);
  });

  it('applies normalized crop controls before provider preprocessing', async () => {
    const input = await createImage(100, 80, '#ffffff');
    const [cropped] = await applyFreeReferenceCrops([input], {
      freeReferenceReferences: [{ crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }],
    });
    await expect(getImageSizeFromDataUrl(cropped)).resolves.toEqual({ width: 50, height: 40 });
  });
});

async function createImage(width: number, height: number, color: string): Promise<string> {
  const buffer = await sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();
  return toImageDataUrl(buffer, 'image/png');
}
