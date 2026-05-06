import { afterEach, describe, expect, it, vi } from 'vitest';

import { isProviderFallbackEnabled } from './fallback';
import { createGrsaiNanoBananaProvider } from './grsaiNanoBananaProvider';
import type { GenerateImageInput } from './types';

const input: GenerateImageInput = {
  mode: 'style-render',
  inputImageDataUrl: 'data:image/png;base64,aW5wdXQ=',
  prompt: 'warm lobby render',
  config: {},
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Grsai Nano Banana provider output contract', () => {
  it('returns a valid data URL when Grsai returns a data URL', async () => {
    mockFetchSequence([
      jsonResponse({ id: 'task_1' }),
      jsonResponse({ id: 'result_1', status: 'succeeded', imageUrl: 'data:image/png;base64,cmVzdWx0' }),
    ]);

    const output = await createGrsaiNanoBananaProvider({ apiKey: 'test-key' }).generateImage(input);

    expect(output).toMatchObject({
      id: 'result_1',
      provider: 'grsai-nano-banana',
      dataUrl: 'data:image/png;base64,cmVzdWx0',
      mimeType: 'image/png',
    });
    expect(output.remoteUrl).toBeUndefined();
  });

  it('downloads a remote URL and returns a data URL plus remoteUrl metadata', async () => {
    mockFetchSequence([
      jsonResponse({ id: 'task_2' }),
      jsonResponse({ id: 'result_2', status: 'succeeded', imageUrl: 'https://cdn.example.com/result.png' }),
      binaryResponse('image/png', 'downloaded-result'),
    ]);

    const output = await createGrsaiNanoBananaProvider({ apiKey: 'test-key' }).generateImage(input);

    expect(output.remoteUrl).toBe('https://cdn.example.com/result.png');
    expect(output.mimeType).toBe('image/png');
    expect(output.dataUrl).toBe(`data:image/png;base64,${Buffer.from('downloaded-result').toString('base64')}`);
  });

  it('throws when a remote URL cannot be downloaded instead of returning the URL as a data URL', async () => {
    mockFetchSequence([
      jsonResponse({ id: 'task_3' }),
      jsonResponse({ id: 'result_3', status: 'succeeded', imageUrl: 'https://cdn.example.com/missing.png' }),
      jsonResponse({ error: 'not found' }, 404),
    ]);

    await expect(createGrsaiNanoBananaProvider({ apiKey: 'test-key' }).generateImage(input))
      .rejects.toThrow('HTTP 404');
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

function binaryResponse(contentType: string, body: string, status = 200): Response {
  const buffer = Buffer.from(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(null),
    headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? contentType : null },
    arrayBuffer: () => Promise.resolve(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)),
  } as unknown as Response;
}
