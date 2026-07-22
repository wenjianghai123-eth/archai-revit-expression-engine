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
    expect(body.prompt).toContain('do not globally restyle the image');
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
