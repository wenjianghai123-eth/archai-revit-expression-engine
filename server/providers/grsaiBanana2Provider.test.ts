import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGrsaiBanana2Provider } from './grsaiBanana2Provider';
import type { GenerateImageInput } from './types';

const tinyPngDataUrl = 'data:image/png;base64,iVBORw0KGgo=';

const input: GenerateImageInput = {
  mode: 'style-render',
  inputImageDataUrl: tinyPngDataUrl,
  prompt: 'render',
  config: {},
};

describe('Grsai Banana2 provider timing, timeout and retry', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.GRSAI_API_KEY = 'test-key';
    process.env.GRSAI_MAX_RETRIES = '1';
    process.env.GRSAI_RETRY_BACKOFF_MS = '1';
    process.env.GRSAI_TIMEOUT_MS = '1000';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    delete process.env.GRSAI_API_KEY;
    delete process.env.GRSAI_MAX_RETRIES;
    delete process.env.GRSAI_RETRY_BACKOFF_MS;
    delete process.env.GRSAI_TIMEOUT_MS;
    delete process.env.GRSAI_ASPECT_RATIO;
  });

  it('returns provider timing metadata on success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: 'task-1' }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { id: 'task-1', status: 'succeeded', progress: 100, results: [{ url: tinyPngDataUrl }] } }));
    globalThis.fetch = fetchMock;

    const output = await createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage(input);

    expect(output.metadata).toMatchObject({
      taskId: 'task-1',
      model: expect.any(String),
      retryCount: 0,
      imageCount: 1,
    });
    expect(typeof output.metadata?.providerDurationMs).toBe('number');
  });

  it('sends the requested 16:9 aspect ratio instead of the environment auto fallback', async () => {
    process.env.GRSAI_ASPECT_RATIO = 'auto';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: 'task-16x9' }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { id: 'task-16x9', status: 'succeeded', progress: 100, results: [{ url: tinyPngDataUrl }] } }));
    globalThis.fetch = fetchMock;

    await createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage({
      ...input,
      targetAspectRatio: '16:9',
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { aspectRatio: string };
    expect(body.aspectRatio).toBe('16:9');
  });

  it('retries a retryable 5xx response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ msg: 'upstream unavailable' }, 502))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: 'task-1' }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { id: 'task-1', status: 'succeeded', progress: 100, results: [{ url: tinyPngDataUrl }] } }));
    globalThis.fetch = fetchMock;

    const output = await createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage(input);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(output.metadata?.retryCount).toBe(1);
  });

  it('does not retry a 4xx parameter error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ msg: 'bad request' }, 400));
    globalThis.fetch = fetchMock;

    await expect(createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage(input))
      .rejects.toThrow('HTTP 400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a clear timeout error', async () => {
    process.env.GRSAI_TIMEOUT_MS = '1';
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage(input))
      .rejects.toThrow('Grsai request timed out after 1ms');
  });

  it('keeps model-render prompt clean without config JSON or empty none notes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: 'task-1' }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { id: 'task-1', status: 'succeeded', progress: 100, results: [{ url: tinyPngDataUrl }] } }));
    globalThis.fetch = fetchMock;

    await createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage({
      mode: 'model-render',
      inputImageDataUrl: tinyPngDataUrl,
      prompt: 'The input image is a 3D clay or white model viewport snapshot. Building type: residential.',
      config: { customPrompt: '', sourceModelAssetId: undefined },
      targetAspectRatio: 'auto',
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { prompt: string; aspectRatio: string };
    expect(body.prompt).toContain('The input image is a 3D clay or white model viewport snapshot.');
    expect(body.prompt).not.toContain('Generation config JSON');
    expect(body.prompt).not.toMatch(/\bnone\b/i);
    expect(body.aspectRatio).toBe('auto');
  });

  it('compiles scene enrichment levels into the object_insert provider prompt', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: 'task-enrichment' }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { id: 'task-enrichment', status: 'succeeded', progress: 100, results: [{ url: tinyPngDataUrl }] } }));
    globalThis.fetch = fetchMock;

    await createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage({
      mode: 'inpaint',
      step: 'object_insert',
      inputImageDataUrl: tinyPngDataUrl,
      referenceImageDataUrls: [tinyPngDataUrl],
      prompt: 'enrich this scene',
      config: {
        objectInsertMode: 'object_insert_preview_fusion',
        objectInsertWorkflowMode: 'scene-enrichment',
        objectInsertSceneEnrichment: { plants: 'many', people: 'moderate', decorations: 'few' },
        objectInsertCandidateStrategy: 'scene-harmony',
        objectInsertCandidatePromptHint: 'Candidate strategy: scene-harmony. Prioritize lighting and shadow integration.',
        objectInsert: {
          mode: 'object_insert_preview_fusion',
          workflowMode: 'scene-enrichment',
          sceneEnrichment: { plants: 'many', people: 'moderate', decorations: 'few' },
        },
      },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { prompt: string; urls: string[] };
    expect(body.urls).toHaveLength(2);
    expect(body.prompt).toContain('This is an object_insert scene-enrichment task.');
    expect(body.prompt).toContain('Plants level: many. Add 6-9 plants');
    expect(body.prompt).toContain('People level: moderate. Add 3-5 naturally distributed people');
    expect(body.prompt).toContain('Decorations level: few. Add 1-2 restrained decorative objects');
    expect(body.prompt).toContain('Candidate strategy: scene-harmony. Prioritize lighting and shadow integration.');
    expect(body.prompt).toContain('do not run a whole-image style rewrite');
  });

  it('adds object-only preservation constraints for volumetric object insertion', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: 'task-object-insert' }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { id: 'task-object-insert', status: 'succeeded', progress: 100, results: [{ url: tinyPngDataUrl }] } }));
    globalThis.fetch = fetchMock;

    await createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage({
      mode: 'inpaint',
      step: 'object_insert',
      inputImageDataUrl: tinyPngDataUrl,
      referenceImageDataUrls: [tinyPngDataUrl],
      prompt: 'Insert a plant near the sofa.',
      config: {
        objectInsertMode: 'object_insert_preview_fusion',
        objectType: 'plant',
        insertElementKind: 'volumetric-object',
        objectInsert: {
          mode: 'object_insert_preview_fusion',
          objectItems: [{
            id: 'plant-1',
            objectType: 'plant',
            insertElementKind: 'volumetric-object',
            referenceAssetIds: ['asset-plant'],
            placement: { x: 120, y: 160, width: 220, height: 300, rotation: 0 },
          }],
        },
      },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { prompt: string };
    expect(body.prompt).toContain('Element insertion definition: only add the specified new element');
    expect(body.prompt).toContain('仅新增，不改原图');
    expect(body.prompt).toContain('Do not change wall material');
    expect(body.prompt).toContain('Do not change floor material');
    expect(body.prompt).toContain('Do not change ceiling material');
    expect(body.prompt).toContain('Do not change countertop material');
    expect(body.prompt).toContain('Volumetric object insertion branch');
    expect(body.prompt).toContain('The overlay position is a soft anchor, not a rigid bounding box.');
    expect(body.prompt).not.toContain('Planar graphic size lock');
    expect(body.prompt).not.toContain('Planar deterministic composite + local fusion');
    expect(body.prompt).not.toContain('coreMask=locked');
    expect(body.prompt).not.toContain('Generate a polished interior design visualization');
    expect(body.prompt).not.toContain('Do not optimize overall atmosphere');
    expect(body.prompt).not.toContain('improve the whole image');
  });

  it('uses the planar graphic insertion branch for logo and signage placement', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: 'task-planar-logo' }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { id: 'task-planar-logo', status: 'succeeded', progress: 100, results: [{ url: tinyPngDataUrl }] } }));
    globalThis.fetch = fetchMock;

    await createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage({
      mode: 'inpaint',
      step: 'object_insert',
      inputImageDataUrl: tinyPngDataUrl,
      referenceImageDataUrls: [tinyPngDataUrl],
      prompt: 'Place the hospital logo on the wall.',
      config: {
        objectInsertMode: 'object_insert_preview_fusion',
        objectType: 'logo',
        objectInsertSurface: 'wall',
        insertElementKind: 'planar-graphic',
        objectInsert: {
          mode: 'object_insert_preview_fusion',
          insertElementKind: 'planar-graphic',
          objectItems: [{
            id: 'logo-1',
            objectType: 'logo',
            insertElementKind: 'planar-graphic',
            planarSizeLocked: true,
            referenceAssetIds: ['asset-logo'],
            objectInsertSurface: 'wall',
            placement: {
              x: 96,
              y: 144,
              width: 240,
              height: 80,
              rotation: -4,
              anchor: 'top-left',
              cornerPoints: [{ x: 101.8, y: 135.8 }, { x: 341.2, y: 119.1 }, { x: 346.8, y: 198.9 }, { x: 107.4, y: 215.6 }],
              normalizedBox: { x: 0.08, y: 0.18, width: 0.2, height: 0.1 },
              surfacePlane: 'wall',
              sizeLocked: true,
            },
            attachmentMode: 'flat-sign',
            fusionStrategy: 'deterministic-planar-composite',
            lockPosition: true,
            lockSize: true,
            lockAspectRatio: true,
            preserveGraphicContent: true,
            preserveBackground: true,
            aiEditableRegion: 'edge-band-only',
            coreMaskMode: 'locked',
            edgeBandPx: 2,
            maxMaskExpansionPx: 2,
          }],
        },
      },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { prompt: string };
    expect(body.prompt).toContain('Planar graphic insertion branch');
    expect(body.prompt).toContain('Planar graphic size lock');
    expect(body.prompt).toContain('width=240');
    expect(body.prompt).toContain('height=80');
    expect(body.prompt).toContain('normalizedBox x=0.08');
    expect(body.prompt).toContain('cornerPoints=');
    expect(body.prompt).toContain('surfacePlane=wall');
    expect(body.prompt).toContain('sizeLocked=true');
    expect(body.prompt).toContain('Planar deterministic composite + local fusion');
    expect(body.prompt).toContain('coreMask=locked');
    expect(body.prompt).toContain('edgeBandMask=only an extremely narrow 1-2 original-pixel transition/contact band');
    expect(body.prompt).toContain('protectedBackgroundMask=all original pixels outside the placement box frozen');
    expect(body.prompt).toContain('attachmentMode=flat-sign');
    expect(body.prompt).toContain('aiEditableRegion=edge-band-only');
    expect(body.prompt).toContain('edgeBandPx=2');
    expect(body.prompt).toContain('Do not AI-redraw the planar graphic core');
    expect(body.prompt).toContain('Do not let the model decide a new size');
    expect(body.prompt).toContain('Do not automatically enlarge, shrink, crop, stretch, or change proportion');
    expect(body.prompt).toContain('Preserve the reference graphic/logo/text');
    expect(body.prompt).toContain('Keep graphic content, text content, proportions, letterforms, emblem pattern, and edges clear and accurate');
    expect(body.prompt).toContain('Do not use the ordinary volumetric-object insertion strategy');
    expect(body.prompt).toContain('Do not generate a similar logo');
    expect(body.prompt).toContain('Do not change the wall/screen material itself');
    expect(body.prompt).not.toContain('Volumetric object insertion branch');
    expect(body.prompt).not.toContain('Do not generate brand Logo');
  });

  it('adds the floorplan English text requirement to floorplan prompts', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: 'task-floorplan' }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { id: 'task-floorplan', status: 'succeeded', progress: 100, results: [{ url: tinyPngDataUrl }] } }));
    globalThis.fetch = fetchMock;

    await createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage({
      mode: 'floorplan',
      inputImageDataUrl: tinyPngDataUrl,
      prompt: 'Convert to a colored floor plan.',
      config: { floorplanOutputMode: 'single' },
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { prompt: string };
    expect(body.prompt).toContain('Convert to a colored floor plan.');
    expect(body.prompt).toContain('All visible text, labels, legends, room names, annotations, and material notes');
    expect(body.prompt).toContain('Do not use Chinese characters');
    expect(body.prompt).toContain('Do not add watermarks, borders, UI elements');
  });

  it('maps model maintenance task failures to a user-facing message with metadata', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: 'task-1' }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { id: 'task-1', status: 'failed', error: 'model maintenance', failure_reason: 'error' } }));
    globalThis.fetch = fetchMock;

    await expect(createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage(input))
      .rejects.toMatchObject({
        message: '当前生成模型正在维护，请稍后重试，或切换其他生成模型。',
        providerError: 'model maintenance',
        providerStatus: 'failed',
        userMessage: '当前生成模型正在维护，请稍后重试，或切换其他生成模型。',
      });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
