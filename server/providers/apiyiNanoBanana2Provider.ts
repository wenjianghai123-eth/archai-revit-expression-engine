import crypto from 'node:crypto';
import { loadAssetAsInlineData, type ApiYiInlineData } from './apiyiImageInput';
import type { GenerateImageInput, GenerateImageOutput, ImageGenerationProvider } from './types';

const providerName = 'apiyi-nano-banana2-edit' as const;
const defaultBaseUrl = 'https://api.apiyi.com';
const defaultModel = 'gemini-3.1-flash-image-preview';
const defaultTimeoutMs = 300_000;
const supportedAspectRatios = new Set(['1:1', '4:3', '3:4', '16:9', '9:16', '5:4', '4:5', '3:2', '2:3', '21:9']);
const supportedImageSizes = new Set(['512', '1K', '2K', '4K']);

interface ApiYiProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface ApiYiPart {
  text?: string;
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
}

interface ApiYiResponse {
  responseId?: string;
  createTime?: string;
  candidates?: Array<{
    content?: {
      parts?: ApiYiPart[];
    };
  }>;
}

export function createApiYiNanoBanana2Provider(options: ApiYiProviderOptions = {}): ImageGenerationProvider {
  const baseUrl = normalizeBaseUrl(options.baseUrl || process.env.APIYI_API_BASE_URL || defaultBaseUrl);
  const model = options.model || process.env.APIYI_IMAGE_MODEL || defaultModel;
  const timeoutMs = options.timeoutMs || readPositiveInteger(process.env.APIYI_IMAGE_TIMEOUT_MS, defaultTimeoutMs);
  const fetchImpl = options.fetchImpl || fetch;

  return {
    name: providerName,
    async generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
      if (process.env.APIYI_IMAGE_PROVIDER_ENABLED === 'false') {
        throw createApiYiError(
          'APIYI_REQUEST_FAILED',
          'API易图片编辑 provider 已被 APIYI_IMAGE_PROVIDER_ENABLED=false 禁用。',
          'API易图片编辑通道当前未启用，请联系管理员。',
        );
      }
      const apiKey = options.apiKey || process.env.APIYI_API_KEY;
      if (!apiKey) {
        throw createApiYiError(
          'APIYI_API_KEY_MISSING',
          'APIYI_API_KEY is required for API易 Nano Banana 2 image editing.',
          '未配置 API易 API Key，请在后端 .env 中配置 APIYI_API_KEY。',
        );
      }

      const prompt = buildApiYiPrompt(input);
      const imageSources = collectApiYiImageSources(input);
      if (imageSources.length === 0) {
        throw createApiYiError(
          'APIYI_REQUEST_FAILED',
          'API易图片编辑至少需要一张输入图片。',
          'API易图片编辑至少需要上传一张输入图片。',
        );
      }
      const inlineImages = await Promise.all(imageSources.map(source => loadAssetAsInlineData(source)));
      const aspectRatio = resolveAspectRatio(input);
      const imageSize = resolveImageSize(input);
      const parts = buildApiYiParts(prompt, inlineImages);
      const requestStartedAt = Date.now();

      if (process.env.NODE_ENV !== 'production') {
        console.debug({
          event: 'apiyi_request_prepare',
          jobId: typeof input.config.__generationJobId === 'string' ? input.config.__generationJobId : undefined,
          provider: providerName,
          model,
          inputImageCount: inlineImages.length,
          aspectRatio,
          imageSize,
          promptLength: prompt.length,
          hasApiKey: Boolean(apiKey),
        });
        console.debug({
          event: 'provider_request_prepare',
          provider: providerName,
          step: input.step,
          aspectRatio,
          imageSize,
          inputImageCount: inlineImages.length,
        });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseModalities: ['IMAGE'],
              imageConfig: {
                aspectRatio,
                imageSize,
              },
              thinkingConfig: {
                thinkingLevel: 'minimal',
                includeThoughts: false,
              },
            },
          }),
          signal: controller.signal,
        });
      } catch (error) {
        if (isAbortError(error)) {
          throw createApiYiError('APIYI_TIMEOUT', `API易请求超过 ${timeoutMs}ms。`, 'API易图片编辑请求超时，请稍后重试。');
        }
        throw createApiYiError('APIYI_REQUEST_FAILED', error instanceof Error ? error.message : 'API易请求失败。');
      } finally {
        clearTimeout(timeout);
      }

      const rawText = await response.text();
      const parsedBody = tryParseApiYiJson(rawText);
      if (!response.ok) {
        const errorBody = parsedBody || { responseText: rawText.slice(0, 400) };
        if (response.status === 401 || response.status === 403) {
          throw createApiYiError('APIYI_UNAUTHORIZED', `API易认证失败：HTTP ${response.status}`, 'API易认证失败，请检查后端 APIYI_API_KEY。', response.status, errorBody);
        }
        if (response.status === 429) {
          throw createApiYiError('APIYI_RATE_LIMITED', 'API易请求被限流。', 'API易请求过于频繁，请稍后重试。', response.status, errorBody);
        }
        throw createApiYiError('APIYI_REQUEST_FAILED', `API易请求失败：HTTP ${response.status}`, undefined, response.status, errorBody);
      }
      if (!parsedBody) {
        throw createApiYiError('APIYI_BAD_RESPONSE', 'API易返回了无法解析的 JSON 响应。', undefined, response.status);
      }
      const body = parsedBody;

      const image = extractApiYiImage(body);
      if (!image) {
        throw createApiYiError(
          'APIYI_IMAGE_RESULT_NOT_FOUND',
          'API易响应中没有找到 candidates[].content.parts[].inlineData.data。',
          'API易图片编辑失败，响应中没有图片结果，请稍后重试。',
          response.status,
          body,
        );
      }

      let content: Buffer;
      const normalizedBase64 = image.data.replace(/\s/g, '');
      if (!/^[a-z0-9+/]+={0,2}$/iu.test(normalizedBase64)) {
        throw createApiYiError('APIYI_BAD_RESPONSE', 'API易返回了无效的 base64 图片。', undefined, response.status, body);
      }
      content = Buffer.from(normalizedBase64, 'base64');
      if (content.length === 0) {
        throw createApiYiError('APIYI_BAD_RESPONSE', 'API易返回了空图片。', undefined, response.status, body);
      }

      const mimeType = normalizeOutputMimeType(image.mimeType);
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[APIYi] image edit response', {
          provider: providerName,
          status: response.status,
          hasInlineImage: true,
          mimeType,
          outputSizeBytes: content.length,
        });
      }

      return {
        id: typeof body.responseId === 'string' ? body.responseId : crypto.randomUUID(),
        provider: providerName,
        dataUrl: `data:${mimeType};base64,${content.toString('base64')}`,
        mimeType,
        binary: {
          content,
          mimeType,
        },
        metadata: {
          model,
          providerDurationMs: Date.now() - requestStartedAt,
          httpStatus: response.status,
          inputImages: inlineImages.length,
          imageCount: inlineImages.length,
          referenceImageCount: Math.max(0, inlineImages.length - 1),
          aspectRatio,
          imageSize,
          outputSizeBytes: content.length,
        },
        createdAt: typeof body.createTime === 'string' ? body.createTime : new Date().toISOString(),
        warnings: [],
      };
    },
  };
}

export function buildApiYiParts(prompt: string, images: ApiYiInlineData[]): ApiYiPart[] {
  return [
    { text: prompt },
    ...images.map(image => ({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data,
      },
    })),
  ];
}

export function collectApiYiImageSources(input: GenerateImageInput): string[] {
  const isPreviewFusion = isObjectInsertPreviewFusion(input);
  if (isPreviewFusion) {
    return [input.inputImageDataUrl, ...(input.referenceImageDataUrls || []).slice(0, 1)].filter(Boolean);
  }

  if (isFreeReferenceImage(input)) {
    return [
      input.inputImageDataUrl,
      ...(input.referenceImageDataUrls || []),
    ].filter(Boolean);
  }

  return [
    input.inputImageDataUrl,
    input.materialImageDataUrl,
    ...(input.referenceImageDataUrls || []),
    ...(input.materialReferenceImageDataUrls || []),
    ...(input.furnitureReferenceImageDataUrls || []),
    input.maskImageDataUrl,
  ].filter((value): value is string => Boolean(value));
}

function buildApiYiPrompt(input: GenerateImageInput): string {
  if (isObjectInsertPreviewFusion(input)) {
    return [
      'Image 1 is the original scene.',
      'Image 2 is the clean placement preview, showing the object type, approximate location, approximate size, and approximate orientation intended by the user.',
      '',
      'Insert the object into the original scene near the position indicated in Image 2.',
      'The overlay position is a soft anchor, not a rigid bounding box.',
      'Small local adjustments are allowed for realism, perspective, floor contact, circulation, and composition, but the object must stay in the same nearby area.',
      'Do not move the object to a far-away area of the scene. Do not relocate it to a different side of the room.',
      '',
      'Prioritize natural integration, realistic lighting and shadows, correct scale, coherent perspective, believable contact with floor / wall / support surface, and placement near the user-indicated layer position.',
      'For multiple objects, keep every object near its own overlay position. Do not omit objects and do not swap their positions.',
      'Do not redesign the whole room. Do not move unrelated furniture. Do not add extra copies of the object. Do not create a collage or split-screen.',
      input.prompt,
    ].join('\n');
  }

  if (isFreeReferenceImage(input)) {
    return [
      'The first image is the source image and must remain the main base.',
      'Following images, when present, are optional references for style, material, color, mood, furniture language, composition, and details.',
      'Generate one coherent final image. Do not create a collage or split-screen comparison.',
      input.prompt,
    ].join('\n');
  }

  return input.prompt;
}

function resolveAspectRatio(input: GenerateImageInput): string {
  const candidates = [
    input.targetAspectRatio,
    typeof input.config.aspectRatio === 'string' ? input.config.aspectRatio : undefined,
    typeof input.config.apiyiAspectRatio === 'string' ? input.config.apiyiAspectRatio : undefined,
  ];
  return candidates.find(value => Boolean(value && supportedAspectRatios.has(value))) || '16:9';
}

function resolveImageSize(input: GenerateImageInput): string {
  const configured = typeof input.config.apiyiImageSize === 'string' ? input.config.apiyiImageSize : '';
  if (supportedImageSizes.has(configured)) return configured;
  const resolution = typeof input.config.freeReferenceResolution === 'number' ? input.config.freeReferenceResolution : 0;
  if (resolution > 0 && resolution <= 512) return '512';
  if (resolution > 0 && resolution <= 1024) return '1K';
  if (resolution > 2048) return '4K';
  return '2K';
}

function extractApiYiImage(body: ApiYiResponse): { data: string; mimeType?: string } | null {
  for (const candidate of body.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (typeof part.inlineData?.data === 'string' && part.inlineData.data.trim().length > 0) {
        return {
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType,
        };
      }
    }
  }
  return null;
}

function tryParseApiYiJson(rawText: string): ApiYiResponse | null {
  if (!rawText.trim()) return {};
  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (!isRecord(parsed)) return null;
    return parsed as ApiYiResponse;
  } catch {
    return null;
  }
}

function createApiYiError(
  code: string,
  message: string,
  userMessage = 'API易图片编辑失败，请检查 API Key、图片格式或稍后重试。',
  statusCode?: number,
  rawResponse?: unknown,
): Error {
  const error = new Error(message) as Error & {
    provider?: string;
    providerError?: string;
    providerStatus?: string;
    userMessage?: string;
    statusCode?: number;
    rawSnippet?: string;
  };
  error.provider = providerName;
  error.providerError = code;
  error.providerStatus = 'failed';
  error.userMessage = userMessage;
  error.statusCode = statusCode;
  if (rawResponse !== undefined) error.rawSnippet = sanitizeResponseSnippet(rawResponse);
  return error;
}

function sanitizeResponseSnippet(value: unknown): string {
  try {
    return (JSON.stringify(value, (_key, child) => {
      if (typeof child === 'string' && child.length > 400) return `${child.slice(0, 120)}...[omitted,length=${child.length}]`;
      return child;
    }) || '').slice(0, 800);
  } catch {
    return '';
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/u, '');
}

function normalizeOutputMimeType(value: string | undefined): 'image/png' | 'image/jpeg' {
  return value === 'image/jpeg' || value === 'image/jpg' ? 'image/jpeg' : 'image/png';
}

function isObjectInsertPreviewFusion(input: GenerateImageInput): boolean {
  const nested = isRecord(input.config.objectInsert) ? input.config.objectInsert : {};
  return input.step === 'object_insert'
    && (input.config.objectInsertMode === 'object_insert_preview_fusion' || nested.mode === 'object_insert_preview_fusion');
}

function isFreeReferenceImage(input: GenerateImageInput): boolean {
  return input.step === 'free_reference_image' || input.config.step === 'free_reference_image';
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /aborted|timeout/iu.test(error.message));
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
