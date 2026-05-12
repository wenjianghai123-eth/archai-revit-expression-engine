import { describe, expect, it } from 'vitest';

import { mockProvider } from './mockProvider';
import type { GenerateImageInput } from './types';

const input: GenerateImageInput = {
  mode: 'floorplan',
  inputImageDataUrl: 'data:image/png;base64,aW5wdXQ=',
  prompt: 'mock floorplan',
  config: {},
};

describe('mock provider', () => {
  it('returns a base64 image data URL when GENERATION_PROVIDER=mock', async () => {
    process.env.GENERATION_PROVIDER = 'mock';

    try {
      const output = await mockProvider.generateImage(input);

      expect(output.provider).toBe('mock');
      expect(output.dataUrl).toMatch(/^data:image\/svg\+xml;base64,/u);
      expect(Buffer.from(output.dataUrl.split(',')[1] || '', 'base64').toString('utf8')).toContain('<svg');
    } finally {
      delete process.env.GENERATION_PROVIDER;
    }
  });

  it('uses targetWidth and targetHeight for the mock SVG canvas', async () => {
    const output = await mockProvider.generateImage({
      ...input,
      targetWidth: 800,
      targetHeight: 600,
    });
    const svg = Buffer.from(output.dataUrl.split(',')[1] || '', 'base64').toString('utf8');

    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="600"');
    expect(svg).toContain('viewBox="0 0 800 600"');
  });
});
