import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GenerateImageInput } from './providers/types';

const input: GenerateImageInput = {
  mode: 'floorplan',
  inputImageDataUrl: 'data:image/png;base64,aW5wdXQ=',
  prompt: 'provider config test',
  config: {},
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.GENERATION_PROVIDER;
  delete process.env.AI_PROVIDER;
  delete process.env.GRSAI_API_KEY;
});

describe('generation provider configuration', () => {
  it('fails clearly without GRSAI_API_KEY when GENERATION_PROVIDER=grsai', async () => {
    vi.resetModules();
    process.env.GENERATION_PROVIDER = 'grsai';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const generationService = await import('./generationService');

    expect(generationService.getGenerationProviderName()).toBe('grsai-banana2');
    await expect(generationService.generateWithFallbackResponse(input)).rejects.toThrow('GRSAI_API_KEY is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('generates successfully with mock when GENERATION_PROVIDER=mock', async () => {
    vi.resetModules();
    process.env.GENERATION_PROVIDER = 'mock';

    const generationService = await import('./generationService');
    const response = await generationService.generateWithFallbackResponse(input);

    expect(generationService.getGenerationProviderName()).toBe('mock');
    expect(response.provider).toBe('mock');
    expect(response.imageDataUrl).toMatch(/^data:image\/svg\+xml;base64,/u);
  });
});
