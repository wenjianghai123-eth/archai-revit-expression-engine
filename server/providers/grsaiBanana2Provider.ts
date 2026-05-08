import crypto from 'node:crypto';
import path from 'node:path';
import { GenerateImageInput, GenerateImageOutput, ImageGenerationProvider, ProviderName } from './types';

const defaultBaseUrl = 'https://grsai.dakka.com.cn';
const defaultModel = 'nano-banana-2';
const defaultAspectRatio = 'auto';
const defaultImageSize = '1K';
const defaultPollIntervalMs = 2500;
const defaultPollTimeoutMs = 180000;
const defaultDownloadTimeoutMs = 30000;

interface GrsaiBanana2ProviderOptions {
  apiKey?: string;
  name?: Extract<ProviderName, 'grsai-banana2' | 'grsai-nano-banana'>;
}

interface GrsaiCreateResponse {
  code?: number;
  data?: unknown;
  msg?: string;
  id?: string;
}

interface GrsaiResultResponse {
  code?: number;
  data?: unknown;
  msg?: string;
}

interface GrsaiTaskResult {
  id?: string;
  results?: Array<{ url?: string; content?: string }>;
  progress?: number;
  status?: string;
  failure_reason?: string;
  error?: string;
}

interface DownloadedImage {
  dataUrl: string;
  mimeType: string;
}

interface NormalizedDataUrl {
  dataUrl: string;
  mimeType: string;
  byteLength: number;
}

export function createGrsaiBanana2Provider(options: GrsaiBanana2ProviderOptions = {}): ImageGenerationProvider {
  const providerName = options.name || 'grsai-banana2';
  const baseUrl = normalizeBaseUrl(process.env.GRSAI_BASE_URL || defaultBaseUrl);
  const model = process.env.GRSAI_MODEL || defaultModel;
  const aspectRatio = process.env.GRSAI_ASPECT_RATIO || defaultAspectRatio;
  const imageSize = process.env.GRSAI_IMAGE_SIZE || defaultImageSize;
  const pollIntervalMs = readPositiveInteger(process.env.GRSAI_POLL_INTERVAL_MS, defaultPollIntervalMs);
  const pollTimeoutMs = readPositiveInteger(process.env.GRSAI_POLL_TIMEOUT_MS, defaultPollTimeoutMs);

  return {
    name: providerName,
    async generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
      const apiKey = readApiKey(options.apiKey);
      const prompt = buildPrompt(input);
      const urls = buildReferenceUrls(input);
      const taskId = await createGeneration({
        apiKey,
        baseUrl,
        body: {
          model,
          prompt,
          aspectRatio,
          imageSize,
          urls,
          webHook: '-1',
          shutProgress: false,
        },
      });
      const result = await pollGeneration({ apiKey, baseUrl, taskId, pollIntervalMs, pollTimeoutMs });
      const firstResult = result.results?.[0];

      if (!firstResult?.url) {
        throw new Error('Grsai Banana2 succeeded but returned no result image URL.');
      }

      const image = await normalizeResultImage(firstResult.url);
      const warnings = firstResult.content ? [`Grsai returned text: ${firstResult.content}`] : [];
      logProviderResult({
        dataUrl: image.dataUrl,
        mimeType: image.mimeType,
        remoteUrl: firstResult.url.startsWith('data:') ? undefined : firstResult.url,
      });

      return {
        id: result.id || taskId || crypto.randomUUID(),
        provider: providerName,
        dataUrl: image.dataUrl,
        remoteUrl: firstResult.url.startsWith('data:') ? undefined : firstResult.url,
        mimeType: image.mimeType,
        metadata: {
          taskId,
          model,
          progress: result.progress,
        },
        createdAt: new Date().toISOString(),
        warnings,
      };
    },
  };
}

async function createGeneration(input: { apiKey: string; baseUrl: string; body: Record<string, unknown> }): Promise<string> {
  const response = await fetch(`${input.baseUrl}/v1/draw/nano-banana`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input.body),
  });
  const body = await readJson(response) as GrsaiCreateResponse;

  if (!response.ok) {
    throw new Error(`Grsai Banana2 create failed: HTTP ${response.status}${formatResponseSummary(body)}`);
  }

  if (typeof body.code === 'number' && body.code !== 0) {
    throw new Error(`Grsai Banana2 create failed: code ${body.code}${formatResponseSummary(body)}`);
  }

  const taskId = extractTaskId(body);
  if (!taskId) {
    throw new Error('Grsai Banana2 create response did not include task id.');
  }

  return taskId;
}

async function pollGeneration(input: {
  apiKey: string;
  baseUrl: string;
  taskId: string;
  pollIntervalMs: number;
  pollTimeoutMs: number;
}): Promise<GrsaiTaskResult> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < input.pollTimeoutMs) {
    const response = await fetch(`${input.baseUrl}/v1/draw/result`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: input.taskId }),
    });
    const body = await readJson(response) as GrsaiResultResponse;

    if (!response.ok) {
      throw new Error(`Grsai Banana2 result failed: HTTP ${response.status}${formatResponseSummary(body)}`);
    }

    if (body.code === -22) {
      throw new Error(`Grsai Banana2 task not found: ${input.taskId}`);
    }

    if (typeof body.code === 'number' && body.code !== 0) {
      throw new Error(`Grsai Banana2 result failed: code ${body.code}${formatResponseSummary(body)}`);
    }

    const result = normalizeTaskResult(body.data);
    const status = String(result.status || '').toLowerCase();

    if (status === 'succeeded') {
      if (!result.results?.some(item => isNonEmptyString(item.url))) {
        throw new Error('Grsai Banana2 succeeded but results were empty.');
      }
      return result;
    }

    if (status === 'failed') {
      throw new Error(formatTaskFailure(result));
    }

    await delay(input.pollIntervalMs);
  }

  throw new Error(`Grsai Banana2 task timed out after ${input.pollTimeoutMs}ms.`);
}

export async function downloadImageAsDataUrl(url: string): Promise<string> {
  return (await downloadImage(url)).dataUrl;
}

async function normalizeResultImage(value: string): Promise<DownloadedImage> {
  if (value.startsWith('data:')) {
    const normalized = normalizeImageDataUrl(value);
    return {
      dataUrl: normalized.dataUrl,
      mimeType: normalized.mimeType,
    };
  }

  if (!isHttpUrl(value)) {
    throw new Error('Grsai Banana2 returned an unsupported image reference.');
  }

  return downloadImage(value);
}

async function downloadImage(url: string): Promise<DownloadedImage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), readPositiveInteger(process.env.GRSAI_DOWNLOAD_TIMEOUT_MS, defaultDownloadTimeoutMs));

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Grsai Banana2 image download failed: HTTP ${response.status}`);
    }

    const contentType = readImageContentType(response.headers.get('content-type'), url);
    const content = Buffer.from(await response.arrayBuffer());
    if (content.length === 0) {
      throw new Error('Grsai Banana2 image download returned an empty body.');
    }

    return {
      dataUrl: `data:${contentType};base64,${content.toString('base64')}`,
      mimeType: contentType,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Grsai Banana2 image download timed out after ${readPositiveInteger(process.env.GRSAI_DOWNLOAD_TIMEOUT_MS, defaultDownloadTimeoutMs)}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeImageDataUrl(dataUrl: string): NormalizedDataUrl {
  const match = /^data:([^;,]+)((?:;[^,]*)?),(.*)$/su.exec(dataUrl);
  if (!match || !match[1].startsWith('image/')) {
    throw new Error('Grsai Banana2 returned an invalid image data URL.');
  }

  const mimeType = match[1].toLowerCase();
  const parameters = match[2] || '';
  const payload = match[3];
  const isBase64 = /(?:^|;)base64(?:;|$)/iu.test(parameters);
  const content = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload));

  if (content.length === 0) {
    throw new Error('Grsai Banana2 returned an empty image data URL.');
  }

  return {
    dataUrl: `data:${mimeType};base64,${content.toString('base64')}`,
    mimeType,
    byteLength: content.length,
  };
}

function buildReferenceUrls(input: GenerateImageInput): string[] {
  return [
    input.inputImageDataUrl,
    input.materialImageDataUrl,
    input.maskImageDataUrl,
    ...(input.referenceImageDataUrls || []),
  ].filter(isNonEmptyString);
}

function buildPrompt(input: GenerateImageInput): string {
  if (input.mode === 'inpaint') {
    return buildInpaintPrompt(input);
  }

  const pieces: string[] = [];

  if (input.mode === 'floorplan') {
    pieces.push('请保留原始平面图的空间关系、墙体、门窗和动线，生成清晰、专业的建筑表达图。');
  }

  if (input.mode === 'style-render') {
    pieces.push('请以第一张输入图为空间结构基准，保持构图、透视、比例和主要空间关系，主要改变风格、材质、光影和表达方式。');
  }

  pieces.push(input.prompt);
  pieces.push(`Generation config JSON: ${JSON.stringify(input.config)}`);
  pieces.push('不要添加文字、水印、标签、边框或界面元素。');

  return pieces.filter(Boolean).join('\n');
}

function buildInpaintPrompt(input: GenerateImageInput): string {
  const pieces: string[] = [];
  const hasMask = input.maskMode === 'asset-mask' && isNonEmptyString(input.maskImageDataUrl);

  if (hasMask) {
    pieces.push(
      '请基于输入参考图进行局部修饰，仅修改用户涂抹或遮罩区域，其他区域保持不变。请将 mask 图中的白色区域作为需要修改的区域，黑色区域保持不变。',
    );
  } else {
    pieces.push(
      '请基于输入原图和用户提示词进行图像编辑。未提供遮罩时，请根据用户提示词判断需要修改的区域，并尽量保持原图的空间结构、构图、透视、比例和未涉及区域稳定。',
    );
  }

  if (input.materialImageDataUrl || (input.referenceImageDataUrls?.length || 0) > 0) {
    pieces.push('材质贴图和参考图作为材质、色彩、纹理与表达氛围参考，请只将相关特征应用到需要修饰的区域。');
  }

  pieces.push(input.prompt);
  pieces.push(`Generation config JSON: ${JSON.stringify(input.config)}`);
  pieces.push('不要添加文字、水印、标签、边框或界面元素。');

  return pieces.filter(Boolean).join('\n');
}

function extractTaskId(body: GrsaiCreateResponse): string | null {
  if (isNonEmptyString(body.id)) return body.id;
  if (isNonEmptyString(body.data)) return body.data;
  if (isRecord(body.data)) {
    if (isNonEmptyString(body.data.id)) return body.data.id;
    if (isNonEmptyString(body.data.taskId)) return body.data.taskId;
  }
  return null;
}

function normalizeTaskResult(value: unknown): GrsaiTaskResult {
  return isRecord(value) ? value as GrsaiTaskResult : {};
}

function formatTaskFailure(result: GrsaiTaskResult): string {
  return result.failure_reason || result.error || 'Grsai Banana2 task failed.';
}

function formatResponseSummary(value: unknown): string {
  if (!isRecord(value)) return '';
  const message = typeof value.msg === 'string' ? value.msg : undefined;
  const error = typeof value.error === 'string' ? value.error : undefined;
  const summary = [message, error].filter(isNonEmptyString).join(' ');
  return summary ? `: ${summary.slice(0, 300)}` : '';
}

function readApiKey(value: string | undefined): string {
  if (isNonEmptyString(value)) return value;
  throw new Error('GRSAI_API_KEY is required when GENERATION_PROVIDER=grsai, AI_PROVIDER=grsai-banana2, or AI_PROVIDER=grsai-nano-banana.');
}

function readImageContentType(headerValue: string | null, url: string): string {
  const contentType = headerValue?.split(';')[0]?.trim().toLowerCase();
  if (contentType?.startsWith('image/')) {
    return contentType;
  }

  if (contentType) {
    throw new Error(`Grsai Banana2 image download returned non-image content-type: ${contentType}`);
  }

  const extension = path.extname(new URL(url).pathname).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';

  throw new Error('Grsai Banana2 image download response did not include an image content-type.');
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/u, '');
}

function logProviderResult(input: { dataUrl: string; mimeType: string; remoteUrl?: string }): void {
  const remoteHost = input.remoteUrl ? safeReadHost(input.remoteUrl) : undefined;
  console.info('Grsai Banana2 provider result', {
    startsWithDataImage: input.dataUrl.startsWith('data:image/'),
    mimeType: input.mimeType,
    dataUrlLength: input.dataUrl.length,
    remoteHost,
  });
}

function safeReadHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
