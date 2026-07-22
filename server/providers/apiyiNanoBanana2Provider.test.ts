import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { loadAssetAsInlineData } from './apiyiImageInput';
import {
  buildApiYiParts,
  collectApiYiImageSources,
  createApiYiNanoBanana2Provider,
} from './apiyiNanoBanana2Provider';
import type { GenerateImageInput } from './types';

const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function createInput(overrides: Partial<GenerateImageInput> = {}): GenerateImageInput {
  return {
    mode: 'style-render',
    step: 'free_reference_image',
    inputImageDataUrl: onePixelPng,
    referenceImageDataUrls: [onePixelPng, onePixelPng],
    prompt: '生成自然协调的室内效果图',
    config: {
      step: 'free_reference_image',
      freeReferenceAspectRatio: '16:9',
      apiyiImageSize: '2K',
    },
    targetAspectRatio: '16:9',
    ...overrides,
  };
}

describe('API易 Nano Banana 2 provider', () => {
  it('builds one text part followed by pure inlineData image parts', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({
        responseId: 'apiyi-response-1',
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
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const provider = createApiYiNanoBanana2Provider({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
    });

    const output = await provider.generateImage(createInput());
    const request = requests[0];
    const body = JSON.parse(String(request.init?.body)) as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
      generationConfig: { imageConfig: { aspectRatio: string; imageSize: string } };
    };
    const parts = body.contents[0].parts;

    expect(request.url).toBe('https://api.apiyi.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent');
    expect((request.init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toEqual({ text: expect.any(String) });
    expect(parts.slice(1).every(part => 'inlineData' in part && !('text' in part))).toBe(true);
    expect(parts.slice(1).every(part => {
      const inlineData = part.inlineData as { data: string };
      return !inlineData.data.startsWith('data:image/');
    })).toBe(true);
    expect(body.generationConfig.imageConfig).toEqual({ aspectRatio: '16:9', imageSize: '2K' });
    expect(output.provider).toBe('apiyi-nano-banana2-edit');
    expect(output.dataUrl).toBe(onePixelPng);
  });

  it('passes the free-reference 2:1 aspect ratio through to APIYI', async () => {
    const requests: RequestInit[] = [];
    const provider = createApiYiNanoBanana2Provider({
      apiKey: 'test-key',
      fetchImpl: vi.fn(async (_url, init) => {
        requests.push(init || {});
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: onePixelPng.replace(/^data:image\/png;base64,/u, '') } }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }) as typeof fetch,
    });
    await provider.generateImage(createInput({ targetAspectRatio: '2:1', config: { step: 'free_reference_image', freeReferenceAspectRatio: '2:1' } }));
    const body = JSON.parse(String(requests[0].body)) as { generationConfig: { imageConfig: { aspectRatio: string } } };
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('2:1');
  });

  it('sends only source image and placement preview for object_insert_preview_fusion', () => {
    const sources = collectApiYiImageSources(createInput({
      mode: 'inpaint',
      step: 'object_insert',
      materialImageDataUrl: onePixelPng,
      referenceImageDataUrls: [onePixelPng, 'data:image/png;base64,another'],
      maskImageDataUrl: onePixelPng,
      config: {
        step: 'object_insert',
        objectInsertMode: 'object_insert_preview_fusion',
        objectInsert: { mode: 'object_insert_preview_fusion' },
      },
    }));
    expect(sources).toEqual([onePixelPng, onePixelPng]);
  });

  it('keeps the text part separate from all image parts', () => {
    const parts = buildApiYiParts('prompt', [
      { mimeType: 'image/png', data: 'abc' },
      { mimeType: 'image/jpeg', data: 'def' },
    ]);
    expect(parts).toEqual([
      { text: 'prompt' },
      { inlineData: { mimeType: 'image/png', data: 'abc' } },
      { inlineData: { mimeType: 'image/jpeg', data: 'def' } },
    ]);
  });

  it('keeps role-based continuous edit images in current, original, reference order', async () => {
    const current = 'data:image/png;base64,Y3VycmVudA==';
    const original = 'data:image/png;base64,b3JpZ2luYWw=';
    const reference = 'data:image/png;base64,cmVmZXJlbmNl';
    const sources = collectApiYiImageSources(createInput({
      inputImages: [
        { role: 'current', url: current },
        { role: 'original-structure-reference', url: original },
        { role: 'material-reference', url: reference },
      ],
    }));
    expect(sources).toEqual([current, original, reference]);
  });

  it('includes a continuous edit mask in the role-based APIYI image order', () => {
    const current = 'data:image/png;base64,Y3VycmVudA==';
    const original = 'data:image/png;base64,b3JpZ2luYWw=';
    const mask = 'data:image/png;base64,bWFzaw==';
    expect(collectApiYiImageSources(createInput({ inputImages: [
      { role: 'current', url: current },
      { role: 'original-structure-reference', url: original },
      { role: 'mask', url: mask },
    ] }))).toEqual([current, original, mask]);
  });

  it('stores the APIYi response id as providerTaskId', async () => {
    const provider = createApiYiNanoBanana2Provider({
      apiKey: 'test-key',
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ responseId: 'provider-task-123', candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: onePixelPng.replace(/^data:image\/png;base64,/u, '') } }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch,
    });
    const output = await provider.generateImage(createInput({ inputImages: [{ role: 'current', url: onePixelPng }, { role: 'original-structure-reference', url: onePixelPng }] }));
    expect(output.metadata).toMatchObject({ providerTaskId: 'provider-task-123', requestId: expect.any(String) });
  });

  it('adds the floorplan English text requirement to APIYi floorplan prompts', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({
        responseId: 'apiyi-floorplan-response',
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
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const provider = createApiYiNanoBanana2Provider({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await provider.generateImage(createInput({
      mode: 'floorplan',
      step: 'floorplan_to_3d',
      referenceImageDataUrls: [],
      prompt: 'Convert to a colored floor plan.',
      config: {
        generationStep: 'floorplan_to_3d',
        floorplanOutputMode: 'single',
      },
    }));

    const body = JSON.parse(String(requests[0].init?.body)) as {
      contents: Array<{ parts: Array<{ text?: string }> }>;
    };
    const text = body.contents[0].parts[0].text || '';
    expect(text).toContain('Convert to a colored floor plan.');
    expect(text).toContain('All visible text, labels, legends, room names, annotations, and material notes');
    expect(text).toContain('Do not use Chinese characters');
  });

  it('converts webp input to png inlineData', async () => {
    const webp = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: '#ffffff',
      },
    }).webp().toBuffer();
    const inlineData = await loadAssetAsInlineData(`data:image/webp;base64,${webp.toString('base64')}`);
    expect(inlineData.mimeType).toBe('image/png');
    expect(Buffer.from(inlineData.data, 'base64').subarray(1, 4).toString()).toBe('PNG');
  });

  it('uses the detected file header before building APIYi inlineData', async () => {
    const webp = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: '#ffffff',
      },
    }).webp().toBuffer();
    const inlineData = await loadAssetAsInlineData(`data:image/jpeg;base64,${webp.toString('base64')}`);

    expect(inlineData.mimeType).toBe('image/png');
    expect(Buffer.from(inlineData.data, 'base64').subarray(1, 4).toString()).toBe('PNG');
  });

  it('fails clearly when APIYI_API_KEY is missing', async () => {
    const provider = createApiYiNanoBanana2Provider({ apiKey: '' });
    const previous = process.env.APIYI_API_KEY;
    delete process.env.APIYI_API_KEY;
    try {
      await expect(provider.generateImage(createInput())).rejects.toMatchObject({
        providerError: 'APIYI_API_KEY_MISSING',
        userMessage: '未配置 API易 API Key，请在后端 .env 中配置 APIYI_API_KEY。',
      });
    } finally {
      if (previous === undefined) delete process.env.APIYI_API_KEY;
      else process.env.APIYI_API_KEY = previous;
    }
  });

  it('maps unauthorized responses to APIYI_UNAUTHORIZED', async () => {
    const provider = createApiYiNanoBanana2Provider({
      apiKey: 'invalid-key',
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ error: { message: 'unauthorized' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
    });
    await expect(provider.generateImage(createInput())).rejects.toMatchObject({
      providerError: 'APIYI_UNAUTHORIZED',
      statusCode: 401,
    });
  });

  it('fails with APIYI_IMAGE_RESULT_NOT_FOUND when candidates contain no image', async () => {
    const provider = createApiYiNanoBanana2Provider({
      apiKey: 'test-key',
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'no image' }] } }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch,
    });
    await expect(provider.generateImage(createInput())).rejects.toMatchObject({
      providerError: 'APIYI_IMAGE_RESULT_NOT_FOUND',
    });
  });
});
