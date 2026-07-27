import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerateImageInput } from './providers/types';

const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

const input: GenerateImageInput = {
  mode: 'floorplan',
  inputImageDataUrl: onePixelPng,
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
  it('always resolves image generation to API易 regardless of legacy client or env provider settings', async () => {
    vi.resetModules();
    process.env.GENERATION_PROVIDER = 'mock';
    process.env.AI_PROVIDER = 'grsai-banana2';
    const generationService = await import('./generationService');

    expect(generationService.getGenerationProviderName()).toBe('apiyi');
    expect(generationService.getGenerationProviderName({ aiProvider: 'mock' })).toBe('apiyi');
    expect(generationService.getGenerationProviderName({ aiProvider: 'apiyi-nano-banana2-edit' })).toBe('apiyi');
    expect(generationService.getGenerationProviderName({ selectedProvider: 'grsai-banana2' })).toBe('apiyi');
  });

  it('reports a single fixed API易 Nano Banana 2 backend channel', async () => {
    vi.resetModules();
    process.env.APIYI_API_KEY = 'test-key';
    const generationService = await import('./generationService');

    expect(generationService.getSelectableGenerationProviders()).toEqual({
      defaultProvider: 'apiyi',
      providers: [
        {
          value: 'apiyi',
          label: 'API易 Nano Banana 2',
          enabled: true,
          missingConfig: [],
        },
      ],
    });
  });

  it('requires only the backend APIYI_API_KEY for real image generation', async () => {
    vi.resetModules();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            inlineData: {
              mimeType: 'image/png',
              data: onePixelPng.replace(/^data:image\/png;base64,/u, ''),
            },
          }],
        },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    process.env.APIYI_API_KEY = 'test-key';
    process.env.GENERATION_PROVIDER = 'mock';

    const generationService = await import('./generationService');
    const response = await generationService.generateWithFallbackResponse(input);

    expect(response.provider).toBe('apiyi');
    expect(response.imageDataUrl).toBe(onePixelPng);
    const firstFetchCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    expect(String(firstFetchCall?.[0])).toContain('/v1beta/models/gemini-3.1-flash-image-preview:generateContent');
  }, 15000);

  it('fails clearly when APIYI_API_KEY is missing', async () => {
    vi.resetModules();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const generationService = await import('./generationService');

    expect(generationService.getGenerationProviderName()).toBe('apiyi');
    await expect(generationService.generateWithFallbackResponse(input)).rejects.toMatchObject({
      providerError: 'APIYI_API_KEY_MISSING',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  }, 15000);
});
