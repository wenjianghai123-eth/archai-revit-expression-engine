import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import { createGeminiProvider } from './providers/geminiProvider';
import { createMockGeneration, mockProvider } from './providers/mockProvider';
import { GenerateImageInput, GenerateImageOutput, ImageGenerationProvider } from './providers/types';

const app = express();
const port = Number(process.env.PORT || 8787);
const version = '0.1.0';
const maxImageMb = Number(process.env.MAX_IMAGE_MB || 10);
const jsonLimit = `${Math.max(maxImageMb * 3, 15)}mb`;
const provider = selectProvider();

interface GenerateRequestBody {
  inputImageDataUrl: string;
  materialImageDataUrl?: string;
  maskImageDataUrl?: string;
  prompt: string;
  config: Record<string, unknown>;
}

interface GenerateResponseBody {
  id: string;
  provider: 'mock' | 'gemini';
  imageDataUrl: string;
  createdAt: string;
  warnings: string[];
}

app.use(express.json({ limit: jsonLimit }));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, version, provider: provider.name });
});

app.post('/api/generate/floorplan', async (req: Request, res: Response, next: NextFunction) => {
  const body = validateGenerateBody(req.body);
  if (body.ok === false) {
    res.status(400).json({ error: body.error });
    return;
  }

  try {
    res.json(await generateWithFallback({ ...body.value, mode: 'floorplan' }));
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate/inpaint', async (req: Request, res: Response, next: NextFunction) => {
  const body = validateGenerateBody(req.body);
  if (body.ok === false) {
    res.status(400).json({ error: body.error });
    return;
  }

  try {
    res.json(await generateWithFallback({ ...body.value, mode: 'inpaint' }));
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (!isPayloadTooLargeError(error)) {
    next(error);
    return;
  }

  res.status(413).json({
    error: `请求体过大。当前 MVP 接口限制为 ${jsonLimit}，请压缩图片后重试。`,
  });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ error: '服务器处理失败，请稍后重试。' });
});

app.listen(port, () => {
  console.log(`ArchAI Expression Engine API listening on http://localhost:${port} using ${provider.name} provider`);
});

function validateGenerateBody(body: unknown): { ok: true; value: GenerateRequestBody } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: '请求体必须是 JSON 对象。' };
  }

  if (!isNonEmptyString(body.inputImageDataUrl)) {
    return { ok: false, error: 'inputImageDataUrl 为必填项。' };
  }

  const inputImageError = validateDataUrlSize('inputImageDataUrl', body.inputImageDataUrl);
  if (inputImageError) {
    return { ok: false, error: inputImageError };
  }

  if (!isNonEmptyString(body.prompt)) {
    return { ok: false, error: 'prompt 为必填项。' };
  }

  if (!isRecord(body.config)) {
    return { ok: false, error: 'config 必须是对象。' };
  }

  const materialImageDataUrl = body.materialImageDataUrl;
  const maskImageDataUrl = body.maskImageDataUrl;

  if (materialImageDataUrl !== undefined && typeof materialImageDataUrl !== 'string') {
    return { ok: false, error: 'materialImageDataUrl 必须是字符串。' };
  }

  if (maskImageDataUrl !== undefined && typeof maskImageDataUrl !== 'string') {
    return { ok: false, error: 'maskImageDataUrl 必须是字符串。' };
  }

  if (typeof materialImageDataUrl === 'string') {
    const materialImageError = validateDataUrlSize('materialImageDataUrl', materialImageDataUrl);
    if (materialImageError) {
      return { ok: false, error: materialImageError };
    }
  }

  if (typeof maskImageDataUrl === 'string') {
    const maskImageError = validateDataUrlSize('maskImageDataUrl', maskImageDataUrl);
    if (maskImageError) {
      return { ok: false, error: maskImageError };
    }
  }

  const validMaterialImageDataUrl = typeof materialImageDataUrl === 'string' ? materialImageDataUrl : undefined;
  const validMaskImageDataUrl = typeof maskImageDataUrl === 'string' ? maskImageDataUrl : undefined;

  return {
    ok: true,
    value: {
      inputImageDataUrl: body.inputImageDataUrl,
      materialImageDataUrl: validMaterialImageDataUrl,
      maskImageDataUrl: validMaskImageDataUrl,
      prompt: body.prompt,
      config: body.config,
    },
  };
}

async function generateWithFallback(input: GenerateImageInput): Promise<GenerateResponseBody> {
  if (provider.name === 'mock') {
    return provider.generateImage(input);
  }

  try {
    return await provider.generateImage(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini provider 生成失败。';
    return createMockGeneration(input, [
      `Gemini provider 未能完成本次生成：${message}`,
      '已自动回退到 mock provider，避免请求中断。',
    ]);
  }
}

function selectProvider(): ImageGenerationProvider {
  const requestedProvider = process.env.AI_PROVIDER || 'mock';
  const apiKey = process.env.GEMINI_API_KEY;

  if (requestedProvider === 'gemini' && apiKey) {
    return createGeminiProvider(apiKey);
  }

  if (requestedProvider === 'gemini' && !apiKey) {
    console.warn('AI_PROVIDER=gemini 但未设置 GEMINI_API_KEY，已回退到 mock provider。');
  }

  return mockProvider;
}

function validateDataUrlSize(fieldName: string, dataUrl: string): string | null {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) {
    return `${fieldName} 必须是 data URL。`;
  }

  const encoded = dataUrl.slice(commaIndex + 1);
  const estimatedBytes = Math.ceil((encoded.length * 3) / 4);
  const maxBytes = maxImageMb * 1024 * 1024;

  if (estimatedBytes > maxBytes) {
    return `${fieldName} 超过 ${maxImageMb}MB，请压缩后重试。`;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPayloadTooLargeError(error: unknown): boolean {
  return isRecord(error) && error.type === 'entity.too.large';
}
