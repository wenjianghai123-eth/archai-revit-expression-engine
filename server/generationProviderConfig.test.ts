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
  delete process.env.APIYI_API_KEY;
  delete process.env.APIYI_IMAGE_PROVIDER_ENABLED;
});

describe('generation provider configuration', () => {
  it('resolves API易 per generation job without replacing the process default provider', async () => {
    vi.resetModules();
    const generationService = await import('./generationService');
    expect(generationService.getGenerationProviderName({ aiProvider: 'apiyi-nano-banana2-edit' })).toBe('apiyi-nano-banana2-edit');
    expect(generationService.getGenerationProviderName({ aiProvider: 'grsai-banana2' })).toBe('grsai-banana2');
  });

  it('maps the apiyi environment alias to the registered API易 provider', async () => {
    vi.resetModules();
    process.env.GENERATION_PROVIDER = 'apiyi';
    const generationService = await import('./generationService');

    expect(generationService.getGenerationProviderName()).toBe('apiyi-nano-banana2-edit');
  });

  it('prefers the explicit AI_PROVIDER and reports provider configuration safely', async () => {
    vi.resetModules();
    process.env.GENERATION_PROVIDER = 'grsai';
    process.env.AI_PROVIDER = 'apiyi-nano-banana2-edit';
    process.env.APIYI_API_KEY = 'test-key';
    const generationService = await import('./generationService');

    expect(generationService.getGenerationProviderName()).toBe('apiyi-nano-banana2-edit');
    expect(generationService.getSelectableGenerationProviders()).toEqual(expect.objectContaining({
      defaultProvider: 'apiyi-nano-banana2-edit',
      providers: expect.arrayContaining([
        expect.objectContaining({
          value: 'apiyi-nano-banana2-edit',
          enabled: true,
          missingConfig: [],
        }),
      ]),
    }));
  });

  it('fails clearly without GRSAI_API_KEY when GENERATION_PROVIDER=grsai', async () => {
    vi.resetModules();
    process.env.GENERATION_PROVIDER = 'grsai';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const generationService = await import('./generationService');

    expect(generationService.getGenerationProviderName()).toBe('grsai-banana2');
    await expect(generationService.generateWithFallbackResponse(input)).rejects.toThrow('GRSAI_API_KEY is required');
    expect(fetchMock).not.toHaveBeenCalled();
  }, 15000);

  it('generates successfully with mock when GENERATION_PROVIDER=mock', async () => {
    vi.resetModules();
    process.env.GENERATION_PROVIDER = 'mock';

    const generationService = await import('./generationService');
    const response = await generationService.generateWithFallbackResponse(input);

    expect(generationService.getGenerationProviderName()).toBe('mock');
    expect(response.provider).toBe('mock');
    expect(response.imageDataUrl).toMatch(/^data:image\/svg\+xml;base64,/u);
  }, 15000);
});
