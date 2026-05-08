import { afterEach, describe, expect, it, vi } from 'vitest';

import { isProviderFallbackEnabled } from './fallback';
import { createGrsaiBanana2Provider, downloadImageAsDataUrl } from './grsaiBanana2Provider';
import { createGrsaiNanoBananaProvider } from './grsaiNanoBananaProvider';
import type { GenerateImageInput } from './types';

const input: GenerateImageInput = {
  mode: 'style-render',
  inputImageDataUrl: 'data:image/png;base64,aW5wdXQ=',
  materialImageDataUrl: 'data:image/png;base64,bWF0ZXJpYWw=',
  referenceImageDataUrls: ['data:image/png;base64,dGV4dHVyZQ=='],
  prompt: 'warm lobby render',
  config: {},
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GRSAI_BASE_URL;
  delete process.env.GRSAI_MODEL;
  delete process.env.GRSAI_ASPECT_RATIO;
  delete process.env.GRSAI_IMAGE_SIZE;
  delete process.env.GRSAI_POLL_INTERVAL_MS;
  delete process.env.GRSAI_POLL_TIMEOUT_MS;
  delete process.env.GRSAI_DOWNLOAD_TIMEOUT_MS;
});

describe('Grsai Banana2 provider', () => {
  it('creates a generation task with the Banana2 request contract and returns a downloaded data URL', async () => {
    process.env.GRSAI_POLL_INTERVAL_MS = '1';
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    mockFetchSequence([
      jsonResponse({ code: 0, data: { id: 'task_1' }, msg: 'success' }),
      jsonResponse({
        code: 0,
        data: {
          id: 'task_1',
          status: 'succeeded',
          progress: 100,
          results: [{ url: 'https://cdn.example.com/result.png', content: 'done' }],
        },
        msg: 'success',
      }),
      binaryResponse('image/png', 'downloaded-result'),
    ]);

    const output = await createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage(input);
    const fetchMock = vi.mocked(fetch);
    const createRequest = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://grsai.dakka.com.cn/v1/draw/nano-banana');
    expect(createRequest).toMatchObject({
      model: 'nano-banana-2',
      aspectRatio: 'auto',
      imageSize: '1K',
      webHook: '-1',
      shutProgress: false,
    });
    expect(createRequest.urls).toEqual([
      'data:image/png;base64,aW5wdXQ=',
      'data:image/png;base64,bWF0ZXJpYWw=',
      'data:image/png;base64,dGV4dHVyZQ==',
    ]);
    expect(output).toMatchObject({
      id: 'task_1',
      provider: 'grsai-banana2',
      remoteUrl: 'https://cdn.example.com/result.png',
      mimeType: 'image/png',
      warnings: ['Grsai returned text: done'],
    });
    expect(output.dataUrl).toBe(`data:image/png;base64,${Buffer.from('downloaded-result').toString('base64')}`);
    expect(output.dataUrl).not.toMatch(/^https?:\/\//u);
  });

  it('keeps the legacy grsai-nano-banana alias on the Banana2 endpoint behavior', async () => {
    mockFetchSequence([
      jsonResponse({ code: 0, data: { id: 'task_alias' } }),
      jsonResponse({ code: 0, data: { id: 'task_alias', status: 'succeeded', results: [{ url: 'data:image/png;base64,cmVzdWx0' }] } }),
    ]);

    const output = await createGrsaiNanoBananaProvider({ apiKey: 'test-key' }).generateImage(input);

    expect(output.provider).toBe('grsai-nano-banana');
    expect(output.dataUrl).toBe('data:image/png;base64,cmVzdWx0');
  });

  it('normalizes non-base64 Grsai data URLs before returning to storage', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    mockFetchSequence([
      jsonResponse({ code: 0, data: { id: 'task_data_url' } }),
      jsonResponse({
        code: 0,
        data: {
          id: 'task_data_url',
          status: 'succeeded',
          results: [{ url: 'data:image/svg+xml;charset=UTF-8,%3Csvg%3E%3C%2Fsvg%3E' }],
        },
      }),
    ]);

    const output = await createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage(input);

    expect(output.dataUrl).toBe(`data:image/svg+xml;base64,${Buffer.from('<svg></svg>').toString('base64')}`);
    expect(output.dataUrl).not.toContain('charset=UTF-8');
  });

  it('polls through running status before succeeded', async () => {
    process.env.GRSAI_POLL_INTERVAL_MS = '1';
    mockFetchSequence([
      jsonResponse({ code: 0, data: { id: 'task_2' } }),
      jsonResponse({ code: 0, data: { id: 'task_2', status: 'running', progress: 50 } }),
      jsonResponse({ code: 0, data: { id: 'task_2', status: 'succeeded', progress: 100, results: [{ url: 'data:image/png;base64,cmVzdWx0' }] } }),
    ]);

    const output = await createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage(input);

    expect(output.dataUrl).toBe('data:image/png;base64,cmVzdWx0');
    expect(vi.mocked(fetch).mock.calls.filter(call => String(call[0]).endsWith('/v1/draw/result'))).toHaveLength(2);
  });

  it('throws when Grsai reports failed status', async () => {
    mockFetchSequence([
      jsonResponse({ code: 0, data: { id: 'task_failed' } }),
      jsonResponse({ code: 0, data: { id: 'task_failed', status: 'failed', failure_reason: 'quota exhausted', error: 'provider error' } }),
    ]);

    await expect(createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage(input))
      .rejects.toThrow('quota exhausted');
  });

  it('throws when create returns code != 0', async () => {
    mockFetchSequence([
      jsonResponse({ code: 123, msg: 'bad request' }),
    ]);

    await expect(createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage(input))
      .rejects.toThrow('Grsai Banana2 create failed: code 123: bad request');
  });

  it('throws a clear message when result returns code -22', async () => {
    mockFetchSequence([
      jsonResponse({ code: 0, data: { id: 'missing_task' } }),
      jsonResponse({ code: -22, msg: 'not found' }),
    ]);

    await expect(createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage(input))
      .rejects.toThrow('Grsai Banana2 task not found: missing_task');
  });

  it('throws when succeeded results are empty', async () => {
    mockFetchSequence([
      jsonResponse({ code: 0, data: { id: 'empty_result' } }),
      jsonResponse({ code: 0, data: { id: 'empty_result', status: 'succeeded', results: [] } }),
    ]);

    await expect(createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage(input))
      .rejects.toThrow('Grsai Banana2 succeeded but results were empty.');
  });

  it('rejects text/html result downloads instead of saving a temporary URL', async () => {
    mockFetchSequence([
      jsonResponse({ code: 0, data: { id: 'html_result' } }),
      jsonResponse({ code: 0, data: { id: 'html_result', status: 'succeeded', results: [{ url: 'https://cdn.example.com/result.png' }] } }),
      binaryResponse('text/html', '<html>error</html>'),
    ]);

    await expect(createGrsaiBanana2Provider({ apiKey: 'test-key' }).generateImage(input))
      .rejects.toThrow('non-image content-type: text/html');
  });

  it('throws when GRSAI_API_KEY is missing', async () => {
    await expect(createGrsaiBanana2Provider().generateImage(input))
      .rejects.toThrow('GRSAI_API_KEY is required');
  });

  it('downloads remote images as data URLs for downstream storage', async () => {
    mockFetchSequence([binaryResponse('image/jpeg', 'jpeg-result')]);

    const dataUrl = await downloadImageAsDataUrl('https://cdn.example.com/temp-result.jpg');

    expect(dataUrl).toBe(`data:image/jpeg;base64,${Buffer.from('jpeg-result').toString('base64')}`);
    expect(dataUrl).not.toBe('https://cdn.example.com/temp-result.jpg');
  });
});

describe('provider fallback configuration', () => {
  it('defaults provider fallback off in production and on outside production', () => {
    expect(isProviderFallbackEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(isProviderFallbackEnabled({ NODE_ENV: 'development' })).toBe(true);
  });

  it('respects explicit provider fallback overrides', () => {
    expect(isProviderFallbackEnabled({ NODE_ENV: 'production', ENABLE_PROVIDER_FALLBACK: 'true' })).toBe(true);
    expect(isProviderFallbackEnabled({ NODE_ENV: 'development', ENABLE_PROVIDER_FALLBACK: 'false' })).toBe(false);
  });
});

function mockFetchSequence(responses: Response[]): void {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal('fetch', fetchMock);
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: () => 'application/json' },
    arrayBuffer: () => Promise.resolve(Buffer.from(JSON.stringify(body)).buffer),
  } as unknown as Response;
}

function binaryResponse(contentType: string | null, body: string, status = 200): Response {
  const buffer = Buffer.from(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(null),
    headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? contentType : null },
    arrayBuffer: () => Promise.resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)),
  } as unknown as Response;
}
