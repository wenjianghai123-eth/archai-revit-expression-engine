import crypto from 'node:crypto';
import { GenerateImageInput, GenerateImageOutput, ImageGenerationProvider } from './types';

const providerName = 'grsai-nano-banana';
const defaultBaseUrl = 'https://grsai.dakka.com.cn';
const defaultModel = 'nano-banana-fast';
const defaultAspectRatio = '4:3';
const defaultImageSize = '1K';
const pollIntervalMs = Number(process.env.GRSAI_POLL_INTERVAL_MS || 3000);
const pollTimeoutMs = Number(process.env.GRSAI_POLL_TIMEOUT_MS || 300000);

interface GrsaiProviderOptions {
  apiKey: string;
}

interface CreateTaskResponse {
  id?: string;
  taskId?: string;
  data?: unknown;
}

interface TaskResult {
  id?: string;
  status?: string;
  results?: Array<{ url?: string; content?: string }>;
  outputImageUrls?: string[];
  imageUrl?: string;
  url?: string;
  content?: string;
  failureReason?: string;
  failure_reason?: string;
  error?: string;
}

export function createGrsaiNanoBananaProvider(options: GrsaiProviderOptions): ImageGenerationProvider {
  const baseUrl = normalizeBaseUrl(process.env.GRSAI_BASE_URL || defaultBaseUrl);
  const model = process.env.GRSAI_MODEL || defaultModel;
  const aspectRatio = process.env.GRSAI_ASPECT_RATIO || defaultAspectRatio;
  const imageSize = process.env.GRSAI_IMAGE_SIZE || defaultImageSize;

  return {
    name: providerName,
    async generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
      if (input.mode === 'inpaint') {
        throw new Error('Grsai Nano Banana provider 当前暂未支持真实局部重绘。');
      }

      const prompt = input.mode === 'style-render'
        ? buildStyleRenderPrompt(input)
        : buildFloorplanPrompt(input);
      const taskId = await createTask({
        apiKey: options.apiKey,
        baseUrl,
        body: {
          model,
          prompt,
          aspectRatio,
          imageSize,
          urls: [input.inputImageDataUrl, input.materialImageDataUrl].filter(isNonEmptyString),
          webHook: '-1',
          shutProgress: true,
        },
      });
      const result = await pollTaskResult({ apiKey: options.apiKey, baseUrl, taskId });
      const imageUrl = extractImageUrl(result);

      if (!imageUrl) {
        throw new Error('Nano Banana returned success but no result image URL.');
      }

      const warnings: string[] = [];
      const resultContent = result.results?.[0]?.content || result.content;
      if (resultContent) {
        warnings.push(`Grsai returned text: ${resultContent}`);
      }

      const normalizedImage = await normalizeResultImage(imageUrl);

      return {
        id: result.id || taskId || crypto.randomUUID(),
        provider: providerName,
        dataUrl: normalizedImage.dataUrl,
        remoteUrl: normalizedImage.remoteUrl,
        mimeType: normalizedImage.mimeType,
        metadata: { taskId },
        createdAt: new Date().toISOString(),
        warnings,
      };
    },
  };
}

function buildStyleRenderPrompt(input: GenerateImageInput): string {
  const config = input.config || {};
  const style = typeof config.style === 'string' ? config.style : 'modern architectural visualization';
  const lighting = typeof config.lighting === 'string' ? config.lighting : 'natural daylight';
  return [
    'Create a high quality architectural style render from the reference image.',
    `Style: ${style}.`,
    `Lighting: ${lighting}.`,
    input.prompt,
    'Preserve the original composition, perspective, and main spatial structure.',
    'Do not add text, watermarks, labels, or UI elements.',
  ].filter(Boolean).join('\n');
}

function buildFloorplanPrompt(input: GenerateImageInput): string {
  const config = input.config || {};
  const style = typeof config.style === 'string' ? config.style : 'modern architecture';
  return [
    'Transform the uploaded floorplan into a clean colored architectural presentation plan.',
    `Style: ${style}.`,
    input.prompt,
    'Keep room relationships, doors, windows, walls, and circulation clear.',
    'Do not add text, watermarks, labels, or extra borders.',
  ].filter(Boolean).join('\n');
}

async function createTask(input: { apiKey: string; baseUrl: string; body: Record<string, unknown> }): Promise<string> {
  const response = await fetch(`${input.baseUrl}/api/v1/task`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input.body),
  });

  const body = await readJson(response) as CreateTaskResponse;
  if (!response.ok) {
    throw new Error(`Grsai create task failed: ${readResponseError(body) || response.status}`);
  }

  const data = isRecord(body.data) ? body.data : {};
  const taskId = body.taskId || body.id || readString(data.taskId) || readString(data.id);
  if (!taskId) {
    throw new Error('Grsai create task response did not include task id.');
  }

  return taskId;
}

async function pollTaskResult(input: { apiKey: string; baseUrl: string; taskId: string }): Promise<TaskResult> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < pollTimeoutMs) {
    const response = await fetch(`${input.baseUrl}/api/v1/task/${encodeURIComponent(input.taskId)}`, {
      headers: { Authorization: `Bearer ${input.apiKey}` },
    });
    const body = await readJson(response);

    if (!response.ok) {
      throw new Error(`Grsai poll task failed: ${readResponseError(body) || response.status}`);
    }

    const result = normalizeTaskResult(body);
    const status = String(result.status || '').toLowerCase();
    if (status === 'success' || status === 'succeeded' || status === 'completed' || extractImageUrl(result)) {
      return result;
    }

    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      throw new Error(formatFailure(result));
    }

    await delay(pollIntervalMs);
  }

  throw new Error(`Grsai task timed out after ${pollTimeoutMs}ms.`);
}

async function normalizeResultImage(value: string): Promise<{ dataUrl: string; remoteUrl?: string; mimeType: string }> {
  if (value.startsWith('data:')) {
    const mimeType = readDataUrlMimeType(value);
    return { dataUrl: value, mimeType };
  }

  if (!isHttpUrl(value)) {
    throw new Error('Grsai returned an unsupported image reference.');
  }

  const downloaded = await remoteImageToDataUrl(value);
  return { ...downloaded, remoteUrl: value };
}

async function remoteImageToDataUrl(url: string): Promise<{ dataUrl: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  if (!contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`Remote result is not an image: ${contentType}`);
  }

  const content = Buffer.from(await response.arrayBuffer());
  return {
    dataUrl: `data:${contentType};base64,${content.toString('base64')}`,
    mimeType: contentType,
  };
}

function normalizeTaskResult(value: unknown): TaskResult {
  if (!isRecord(value)) return {};
  const data = isRecord(value.data) ? value.data : value;
  return data as TaskResult;
}

function extractImageUrl(result: TaskResult): string | null {
  return result.results?.find(item => isNonEmptyString(item.url))?.url
    || result.outputImageUrls?.find(isNonEmptyString)
    || (isNonEmptyString(result.imageUrl) ? result.imageUrl : null)
    || (isNonEmptyString(result.url) ? result.url : null);
}

function formatFailure(result: TaskResult): string {
  return result.failureReason || result.failure_reason || result.error || 'Grsai task failed.';
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readResponseError(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (typeof value.error === 'string') return value.error;
  if (typeof value.message === 'string') return value.message;
  return null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/u, '');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}

function readDataUrlMimeType(dataUrl: string): string {
  const match = /^data:([^;,]+)(?:;[^,]*)?,/u.exec(dataUrl);
  if (!match || !match[1].startsWith('image/')) {
    throw new Error('Grsai returned an invalid image data URL.');
  }
  return match[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
