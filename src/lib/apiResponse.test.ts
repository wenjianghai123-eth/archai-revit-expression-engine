import { describe, expect, it } from 'vitest';
import { parseApiResponse, readApiErrorMessage } from './apiResponse';

describe('parseApiResponse', () => {
  it('returns null for 204 no content responses', async () => {
    const response = new Response(null, { status: 204 });

    await expect(parseApiResponse(response)).resolves.toBeNull();
  });

  it('throws a clear error for empty non-204 responses', async () => {
    const response = new Response('', { status: 200 });

    await expect(parseApiResponse(response)).rejects.toThrow('API returned empty response. status=200');
  });

  it('throws a clear error for HTML responses', async () => {
    const response = new Response('<!doctype html><html><body>Oops</body></html>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });

    await expect(parseApiResponse(response)).rejects.toThrow(
      'API returned non-JSON response. status=404, body=<!doctype html><html><body>Oops</body></html>',
    );
  });

  it('parses JSON payloads', async () => {
    const response = new Response(JSON.stringify({ ok: true, data: { id: 'job-1' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(parseApiResponse<{ ok: boolean; data: { id: string } }>(response)).resolves.toMatchObject({
      ok: true,
      data: { id: 'job-1' },
    });
  });
});

describe('readApiErrorMessage', () => {
  it('reads string and nested error messages', () => {
    expect(readApiErrorMessage('直接错误')).toBe('直接错误');
    expect(readApiErrorMessage({ message: 'message 错误' })).toBe('message 错误');
    expect(readApiErrorMessage({ error: 'error 错误' })).toBe('error 错误');
    expect(readApiErrorMessage({ error: { message: 'nested 错误' } })).toBe('nested 错误');
  });
});
