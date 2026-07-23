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
const defaultRequestTimeoutMs = 120000;
const defaultMaxRetries = 1;
const defaultRetryBackoffMs = 1500;
const modelMaintenanceUserMessage = '当前生成模型正在维护，请稍后重试，或切换其他生成模型。';

const floorplanTextLanguageRequirement = [
  'Text language requirement:',
  'All visible text, labels, legends, room names, annotations, and material notes in the generated image must be in English only.',
  'Do not use Chinese characters. Do not mix Chinese and English.',
  'If room labels are needed, use concise English labels such as Living Room, Bedroom, Master Bedroom, Kitchen, Dining Area, Bathroom, Balcony, Entrance, Foyer, Corridor, Storage, Study, Guest Room, Laundry, Closet, Terrace, Open Area, Service Area.',
  'If a legend is generated, all legend entries must be in English, such as Legend, Furniture, Wall, Door, Window, Floor Finish, Wood Floor, Tile Floor, Carpet, Stone, Planting, Water Area, Circulation, Private Area, Public Area, Service Area.',
  'If the input plan contains Chinese room names or Chinese annotations, translate them into concise English labels in the output image. Do not copy Chinese text from the input plan.',
].join(' ');

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
  const configuredAspectRatio = process.env.GRSAI_ASPECT_RATIO || defaultAspectRatio;
  const imageSize = process.env.GRSAI_IMAGE_SIZE || defaultImageSize;
  const pollIntervalMs = readPositiveInteger(process.env.GRSAI_POLL_INTERVAL_MS, defaultPollIntervalMs);
  const requestTimeoutMs = readPositiveInteger(process.env.GRSAI_TIMEOUT_MS, defaultRequestTimeoutMs);
  const pollTimeoutMs = readPositiveInteger(process.env.GRSAI_POLL_TIMEOUT_MS, readPositiveInteger(process.env.GRSAI_TIMEOUT_MS, defaultPollTimeoutMs));
  const maxRetries = readNonNegativeInteger(process.env.GRSAI_MAX_RETRIES, defaultMaxRetries);
  const retryBackoffMs = readPositiveInteger(process.env.GRSAI_RETRY_BACKOFF_MS, defaultRetryBackoffMs);

  return {
    name: providerName,
    async generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
      const apiKey = readApiKey(options.apiKey);
      const prompt = buildPrompt(input);
      const urls = buildReferenceUrls(input);
      logObjectInsertProviderPreflight(input, prompt, urls);
      validateObjectInsertImageIndexes(input, prompt, urls, providerName);
      const payloadBytesApprox = urls.reduce((sum, url) => sum + estimateDataUrlBytes(url), 0);
      const aspectRatio = input.targetAspectRatio || configuredAspectRatio || defaultAspectRatio;
      if (process.env.NODE_ENV !== 'production') {
        console.debug({
          event: 'provider_request_prepare',
          provider: providerName,
          step: input.step,
          aspectRatio,
          imageSize,
          inputImageCount: urls.length,
        });
      }
      const requestStartedAt = Date.now();
      const diagnostics = {
        retryCount: 0,
        httpStatus: undefined as number | undefined,
      };
      const taskId = await createGeneration({
        apiKey,
        baseUrl,
        requestTimeoutMs,
        maxRetries,
        retryBackoffMs,
        diagnostics,
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
      const result = await pollGeneration({ apiKey, baseUrl, taskId, pollIntervalMs, pollTimeoutMs, requestTimeoutMs, maxRetries, retryBackoffMs, diagnostics });
      console.info('Grsai Banana2 provider timing', {
        provider: providerName,
        model,
        durationMs: Date.now() - requestStartedAt,
        httpStatus: diagnostics.httpStatus,
        retryCount: diagnostics.retryCount,
        imageCount: urls.length,
        inputImageBytes: estimateDataUrlBytes(input.inputImageDataUrl),
        referenceImageCount: Math.max(0, urls.length - 1),
        payloadBytesApprox,
      });
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
          providerDurationMs: Date.now() - requestStartedAt,
          httpStatus: diagnostics.httpStatus,
          retryCount: diagnostics.retryCount,
          inputImages: 1,
          imageCount: urls.length,
          referenceImageCount: Math.max(0, urls.length - 1),
          payloadBytesApprox,
        },
        createdAt: new Date().toISOString(),
        warnings,
      };
    },
  };
}

async function createGeneration(input: {
  apiKey: string;
  baseUrl: string;
  body: Record<string, unknown>;
  requestTimeoutMs: number;
  maxRetries: number;
  retryBackoffMs: number;
  diagnostics: { retryCount: number; httpStatus?: number };
}): Promise<string> {
  const response = await fetchWithRetry(`${input.baseUrl}/v1/draw/nano-banana`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input.body),
  }, input);
  input.diagnostics.httpStatus = response.status;
  const body = await readJson(response) as GrsaiCreateResponse;

  if (!response.ok) {
    throw createHttpError(`Grsai Banana2 create failed: HTTP ${response.status}${formatResponseSummary(body)}`, response.status, body);
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
  requestTimeoutMs: number;
  maxRetries: number;
  retryBackoffMs: number;
  diagnostics: { retryCount: number; httpStatus?: number };
}): Promise<GrsaiTaskResult> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < input.pollTimeoutMs) {
    const response = await fetchWithRetry(`${input.baseUrl}/v1/draw/result`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: input.taskId }),
    }, input);
    input.diagnostics.httpStatus = response.status;
    const body = await readJson(response) as GrsaiResultResponse;

    if (!response.ok) {
      throw createHttpError(`Grsai Banana2 result failed: HTTP ${response.status}${formatResponseSummary(body)}`, response.status, body);
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
      throw createTaskFailureError(result);
    }

    await delay(input.pollIntervalMs);
  }

  throw createHttpError(`Grsai request timed out after ${input.pollTimeoutMs}ms`, 408);
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

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: {
    requestTimeoutMs: number;
    maxRetries: number;
    retryBackoffMs: number;
    diagnostics: { retryCount: number; httpStatus?: number };
  },
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, options.requestTimeoutMs);
      options.diagnostics.httpStatus = response.status;
      if (isRetryableStatus(response.status)) {
        const possibleSafetyBody = await readJson(response.clone());
        if (isSafetyRejectedProviderPayload('', possibleSafetyBody)) {
          return response;
        }
      }
      if (!isRetryableStatus(response.status) || attempt >= options.maxRetries) {
        return response;
      }

      options.diagnostics.retryCount += 1;
      console.warn('Grsai request returned retryable status; retrying.', {
        status: response.status,
        attempt: attempt + 1,
        maxRetries: options.maxRetries,
      });
      await delay(options.retryBackoffMs * (attempt + 1));
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt >= options.maxRetries) {
        throw error;
      }

      options.diagnostics.retryCount += 1;
      console.warn('Grsai request failed; retrying.', {
        error: error instanceof Error ? error.message : 'unknown error',
        attempt: attempt + 1,
        maxRetries: options.maxRetries,
      });
      await delay(options.retryBackoffMs * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Grsai request failed.');
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw createHttpError(`Grsai request timed out after ${timeoutMs}ms`, 408);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as Error & { status?: unknown }).status;
  return error.message.includes('timed out')
    || status === 429
    || (typeof status === 'number' && status >= 500);
}

function createHttpError(message: string, status: number, rawBody?: unknown): Error {
  const error = new Error(formatHttpErrorMessage(message, status)) as Error & {
    status?: number;
    statusCode?: number;
    provider?: string;
    providerError?: string;
    providerStatus?: string;
    userMessage?: string;
    rawSnippet?: string;
  };
  error.status = status;
  error.statusCode = status;
  error.provider = 'grsai-banana2';
  error.providerError = isSafetyRejectedProviderPayload(message, rawBody) ? 'PROVIDER_SAFETY_REJECTED' : 'http_error';
  error.providerStatus = 'failed';
  if (error.providerError === 'PROVIDER_SAFETY_REJECTED') {
    error.userMessage = 'AI 平台安全策略拒绝了本次生成。请根据平台返回原因调整输入图片或描述后重试。';
  }
  if (rawBody !== undefined) {
    error.rawSnippet = createRawSnippet(rawBody);
  }
  return error;
}

function createRawSnippet(value: unknown): string {
  try {
    return (JSON.stringify(value) || String(value)).slice(0, 800);
  } catch {
    return String(value).slice(0, 800);
  }
}

function formatHttpErrorMessage(message: string, status: number): string {
  if (status === 429) return 'Grsai returned 429 rate limit';
  if (status >= 500) return 'Grsai returned 5xx upstream error';
  return message;
}

function isSafetyRejectedProviderPayload(message: string, rawBody: unknown): boolean {
  const text = [message, rawBody === undefined ? '' : createRawSnippet(rawBody)].join('\n');
  return /safety|policy|moderation|violation|rejected|blocked|unsafe|sensitive|违规|安全策略|内容审核|拒绝/iu.test(text);
}

function normalizeImageDataUrl(dataUrl: string): NormalizedDataUrl {
  const match = /^data:(image\/[a-z0-9.+-]+)(?:;charset=[^;,]+)?;base64,([a-z0-9+/=\s]+)$/iu.exec(dataUrl);
  if (!match) {
    throw new Error(`Grsai Banana2 returned an invalid image data URL. Expected data:image/...;base64,<base64>. Raw prefix: ${dataUrl.slice(0, 80)}`);
  }

  const mimeType = match[1].toLowerCase();
  const payload = match[2].replace(/\s/g, '');
  const content = Buffer.from(payload, 'base64');

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
  if (isObjectInsertInput(input)) {
    return [
      input.inputImageDataUrl,
      ...(readObjectInsertPreviewFusionMode(input.config)
        ? (input.referenceImageDataUrls || []).slice(0, 1)
        : [
            input.materialImageDataUrl,
            ...(input.referenceImageDataUrls || []),
            input.maskImageDataUrl,
          ]),
    ].filter(isNonEmptyString);
  }

  const materialReferences = (input.materialReferenceImageDataUrls || []).slice(0, 3);
  const furnitureReferences = (input.furnitureReferenceImageDataUrls || []).slice(0, 3);
  const maxAdditionalReferences = Math.max(0, readPositiveInteger(process.env.MAX_PROVIDER_REFERENCE_IMAGES, 6) - materialReferences.length - furnitureReferences.length - (input.materialImageDataUrl ? 1 : 0));
  return [
    input.inputImageDataUrl,
    input.maskImageDataUrl,
    input.materialImageDataUrl,
    ...materialReferences,
    ...furnitureReferences,
    ...(input.referenceImageDataUrls || []).slice(0, maxAdditionalReferences),
  ].filter(isNonEmptyString);
}

function validateObjectInsertImageIndexes(input: GenerateImageInput, prompt: string, urls: string[], providerName: ProviderName): void {
  if (!isObjectInsertInput(input)) return;
  const maxReferencedImageIndex = Math.max(
    readMaxPromptImageIndex(prompt),
    readMaxObjectInsertOrderImageIndex(input.config),
  );
  if (maxReferencedImageIndex <= urls.length) return;

  const error = new Error(`OBJECT_INSERT_IMAGE_INDEX_MISMATCH: prompt references image ${maxReferencedImageIndex} but only ${urls.length} urls were provided.`) as Error & {
    provider?: string;
    providerError?: string;
    providerStatus?: string;
    userMessage?: string;
    rawSnippet?: string;
  };
  error.provider = providerName;
  error.providerError = 'OBJECT_INSERT_IMAGE_INDEX_MISMATCH';
  error.providerStatus = 'failed';
  error.userMessage = `多对象植入输入图片索引错误：prompt 引用了 image ${maxReferencedImageIndex}，但实际只上传了 ${urls.length} 张输入图。`;
  error.rawSnippet = JSON.stringify({
    urlsLength: urls.length,
    maxReferencedImageIndex,
    objectInsertInputOrder: input.config.objectInsertInputOrder,
    objectList: extractObjectListFromPrompt(prompt),
  }).slice(0, 1200);
  throw error;
}

function logObjectInsertProviderPreflight(input: GenerateImageInput, prompt: string, urls: string[]): void {
  if (!isObjectInsertInput(input) || process.env.NODE_ENV === 'production') return;
  const objectItems = readObjectInsertRawItems(input.config);
  const previewFusionMode = readObjectInsertPreviewFusionMode(input.config);
  const maxReferencedImageIndex = Math.max(
    readMaxPromptImageIndex(prompt),
    readMaxObjectInsertOrderImageIndex(input.config),
  );
  console.info('[ObjectInsert] provider preflight', {
    objectInsertMode: previewFusionMode ? 'object_insert_preview_fusion' : 'legacy_object_insert',
    urlsCount: urls.length,
    urlsLength: urls.length,
    expectedProviderImageCount: previewFusionMode ? 2 : undefined,
    objectItemsLength: objectItems.length,
    objectInsertInputOrder: input.config.objectInsertInputOrder,
    maxReferencedImageIndex,
    promptPreview: prompt.slice(0, 1000),
    objectList: extractObjectListFromPrompt(prompt),
  });
}

function readMaxPromptImageIndex(prompt: string): number {
  let max = 0;
  const pattern = /\bimage\s+(\d+)\b/giu;
  let match = pattern.exec(prompt);
  while (match) {
    const index = Number(match[1]);
    if (Number.isFinite(index)) max = Math.max(max, index);
    match = pattern.exec(prompt);
  }
  return max;
}

function readMaxObjectInsertOrderImageIndex(config: Record<string, unknown>): number {
  const rawOrder = Array.isArray(config.objectInsertInputOrder) ? config.objectInsertInputOrder.filter(isRecord) : [];
  return rawOrder.reduce((max, order) => Math.max(
    max,
    ...readNumberArray(order.referenceImageIndexes),
    readPositiveNumber(order.placementGuideImageIndex) || 0,
    readPositiveNumber(order.placementMaskImageIndex) || 0,
  ), 0);
}

function readObjectInsertRawItems(config: Record<string, unknown>): Record<string, unknown>[] {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  return Array.isArray(nested.objectItems) ? nested.objectItems.filter(isRecord) : [];
}

function extractObjectListFromPrompt(prompt: string): string {
  const start = prompt.indexOf('Object list:');
  if (start < 0) return '';
  const following = prompt.slice(start).split('\n');
  const lines = following.filter(line => line === 'Object list:' || /^Object \d+:/u.test(line));
  return lines.join('\n').slice(0, 1200);
}

function buildPrompt(input: GenerateImageInput): string {
  if (isObjectInsertInput(input)) {
    return buildObjectInsertPrompt(input);
  }

  if (isImagePolishInput(input)) {
    return input.prompt;
  }

  if (isFreeReferenceImageInput(input)) {
    return [
      'Free reference image generation.',
      'The first image is the source image and must be the main base.',
      'If following images are provided, they are optional reference images.',
      'Use any provided reference images for style, material, color, mood, furniture language, detailing, and design guidance.',
      'Generate one coherent, natural final image according to the user prompt.',
      'Do not create a collage, split image, comparison layout, or mechanical paste-up of the reference images.',
      'Keep the result visually unified, complete, and coordinated with the source image.',
      'Do not add text, watermarks, labels, borders, or UI.',
      `User prompt: ${input.prompt}`,
    ].filter(isNonEmptyString).join('\n');
  }

  if (input.qualityMode === 'draft' || input.qualityMode === 'fast') {
    if (input.mode === 'inpaint' || input.mode === 'material-replace') return buildInpaintPrompt(input);
    return [
      input.prompt,
      'Keep composition and canvas ratio. Return image only; no text, labels, watermarks, borders, or UI.',
    ].filter(isNonEmptyString).join('\n');
  }

  if (input.mode === 'inpaint') {
    return buildInpaintPrompt(input);
  }

  if (input.mode === 'model-render' || input.mode === 'panorama-roam-render') {
    return [
      input.prompt,
      'Do not add text, watermarks, labels, borders, or UI elements.',
    ].filter(isNonEmptyString).join('\n');
  }

  const pieces: string[] = [];
  pieces.push(
    'The first image is the original scene to edit or render.',
    'Keep the exact same canvas aspect ratio, framing, composition boundary, and image proportions as the first input image. Do not crop, extend, pad, add borders, or change the canvas ratio.',
  );
  if (input.maskImageDataUrl) {
    pieces.push('The mask image limits the editable region. White is editable; black and unmasked areas must remain unchanged. Do not modify outside the white mask.');
  }
  if (input.materialImageDataUrl || (input.materialReferenceImageDataUrls?.length || 0) > 0) {
    pieces.push('Material reference images are only for material texture, color, pattern, reflection, roughness, and surface quality. Do not copy objects or backgrounds from them.');
  }
  if ((input.furnitureReferenceImageDataUrls?.length || 0) > 0) {
    pieces.push('Furniture reference images are only for furniture type, shape, proportion, material, color, and style. Do not copy their backgrounds.');
  }

  if (input.mode === 'floorplan') {
    pieces.push('Convert the input image into a professional interior colored floor plan with clear, realistic, and clean material rendering.');
    if (isFloorplanLayoutVariantInput(input)) {
      pieces.push('Strictly preserve the original architectural layout, room boundaries, walls, doors, windows, openings, columns, functional zoning, proportions, and top-down plan representation. Same-type furniture may be arranged differently inside the original room boundaries when requested, but circulation and scale must remain reasonable.');
    } else {
      pieces.push('Strictly preserve the original floor plan layout, room boundaries, walls, doors, windows, openings, columns, furniture positions, furniture outlines, and proportions.');
    }
    pieces.push(
      'Use light marble, white marble, light stone, or light tile for living rooms, dining rooms, corridors, and public areas; dark tiles, anti-slip tiles, or durable stain-resistant materials for kitchens, bathrooms, balconies, and wet areas; white oak flooring, light wood flooring, or warm wood materials for bedrooms and studies.',
      'Keep walls, windows, and door openings in their original style and outline. Preserve the top-down plan representation. Do not generate a perspective rendering, elevation, 3D bird-eye view, or change the architectural layout.',
    );
  }

  if (input.mode === 'style-render') {
    pieces.push('请以第一张输入图为空间结构基准，保持构图、透视、比例和主要空间关系，主要改变风格、材质、光影和表达方式。');
  }

  if (input.editTarget === 'material') {
    pieces.push('Edit target is material: only change material, color, texture, reflection, roughness, and surface quality. Do not change furniture shape or fixed architecture.');
  } else if (input.editTarget === 'furniture') {
    pieces.push('Edit target is furniture: only modify the furniture inside the white mask. Do not replace other furniture. Preserve perspective, scale, lighting, walls, floor, ceiling, doors, windows, fixed structures, and all unmasked areas.');
  }

  if (input.editTarget === 'material') {
    pieces.push('Edit target is material: only change material, color, texture, reflection, roughness, and surface quality. Do not change furniture shape or fixed architecture.');
  } else if (input.editTarget === 'furniture') {
    pieces.push('Edit target is furniture: only modify the furniture inside the white mask. Do not replace other furniture. Preserve perspective, scale, lighting, walls, floor, ceiling, doors, windows, fixed structures, and all unmasked areas.');
  }

  pieces.push(input.prompt);
  pieces.push(`Generation config JSON: ${JSON.stringify(input.config)}`);
  if (input.mode === 'floorplan') {
    pieces.push('Do not add watermarks, borders, UI elements, title bars, or unrelated explanatory text.');
    pieces.push(floorplanTextLanguageRequirement);
  } else {
    pieces.push('不要添加文字、水印、标签、边框或界面元素。');
  }

  return pieces.filter(Boolean).join('\n');
}

function buildObjectInsertPrompt(input: GenerateImageInput): string {
  if (readObjectInsertPreviewFusionMode(input.config)) {
    return buildObjectInsertPreviewFusionPrompt(input);
  }

  const objectItems = readObjectInsertItemsForPrompt(input.config);
  if (objectItems.length > 1) {
    return buildMultiObjectInsertPrompt(input, objectItems);
  }

  const placementMode = readObjectInsertPlacementMode(input.config);
  const common = [
    input.prompt,
    buildObjectInsertProviderInputPrompt(input),
    readObjectInsertLocalEditPrompt(input.config),
    buildObjectInsertImmutableScenePrompt(),
    hasPlanarGraphicObjectInsert(input.config) ? buildPlanarGraphicInsertionRulesPrompt() : buildVolumetricObjectInsertionRulesPrompt(),
    buildObjectInsertPlacementControlPrompt(input.config),
    buildObjectInsertFusionQualityPrompt(input.config),
    buildObjectInsertNaturalScenePrompt(input.config),
    buildObjectInsertSpatialRelationPrompt(input),
  ];

  const strictPrompt = [
    'Object insert placement mode: strict / precise placement.',
    'Image 1 is the original interior or architectural scene.',
    'Image 2 is the furniture or object reference image when provided.',
    'Image 3 is the placement guide when provided.',
    'Image 4 is the edit-area mask when provided.',
    'Insert one similar furniture/object based on image 2 into the area specified by the guide.',
    'Fit the guide center, size, angle, and position as closely as possible.',
    'Match camera perspective, usable real-world scale, lighting, shadow direction and softness, material integration, floor/wall/ceiling contact, and occlusion.',
    'The inserted object must not look like a pasted cutout, miniature model, floating object, or isolated prop.',
    'Keep all unrelated regions unchanged, especially camera framing, room layout, fixed structure, and existing furniture outside the edit area.',
  ];

  const naturalPrompt = [
    'Object insert placement mode: natural / intelligent furnishing placement.',
    'Image 1 is the original interior or architectural scene.',
    'Image 2 is the furniture or object reference image when provided.',
    'Image 3 is a suggested placement area guide when provided.',
    'Image 4 is the edit-area mask when provided.',
    'Use image 2 mainly for furniture type, material, color, proportion, and design language.',
    'Add one coordinated similar furniture/object near the suggested area from image 3.',
    'Treat the guide and placement metadata as a soft design region: the final position, orientation, and scale may be optimized according to the original scene layout, existing furniture relationships, circulation path, perspective, occlusion, and overall composition.',
    'Prioritize functional reasonableness, visual balance, realistic floor contact, and normal usable scale consistent with existing furniture while preserving all existing scene materials and objects.',
    'Do not mechanically copy the reference image direction. If the reference angle is unsuitable for the original scene, rotate or reposition the object into a more natural orientation.',
    'Avoid placing the object alone in the middle of empty floor unless that is clearly the correct furniture relationship.',
    'Preserve the original style and design order without restyling the room. Avoid damaging the existing room structure, camera framing, materials, or unrelated furniture.',
  ];

  return [
    ...common,
    ...(placementMode === 'strict' ? strictPrompt : naturalPrompt),
    buildObjectInsertUnrequestedContentPrompt(input.config),
  ].filter(isNonEmptyString).join('\n');
}

function buildObjectInsertPreviewFusionPrompt(input: GenerateImageInput): string {
  const userPrompt = readObjectInsertPreviewFusionUserPrompt(input.config, input.prompt);
  const hasPlanarGraphic = hasPlanarGraphicObjectInsert(input.config);
  if (readObjectInsertWorkflowMode(input.config) === 'scene-enrichment') {
    return [
      'Image 1 is the original architectural or interior scene and is the strict structure, camera, perspective, and composition reference.',
      'Image 2 repeats the source scene as a full-canvas placement guide. Use it only to preserve the original framing and editable scene extent.',
      buildObjectInsertImmutableScenePrompt(),
      buildObjectInsertSceneEnrichmentPrompt(input.config),
      readObjectInsertCandidatePromptForProvider(input.config),
      buildObjectInsertFusionQualityPrompt(input.config),
      'This is an object_insert scene-enrichment task. Do not treat it as image polishing and do not run a whole-image style rewrite.',
      'Keep walls, doors, windows, ceiling, fixed furniture, camera, geometry, layout, and all unrelated content unchanged.',
      userPrompt ? `User extra instruction: ${userPrompt}` : '',
    ].filter(isNonEmptyString).join('\n');
  }
  if (hasPlanarGraphic) {
    return buildPlanarGraphicInsertionPrompt(input, userPrompt);
  }
  return [
    'Image 1 is the original scene.',
    'Image 2 is the clean placement preview. It shows the object type, approximate location, approximate size, and approximate orientation intended by the user.',
    buildObjectInsertImmutableScenePrompt(),
    buildVolumetricObjectInsertionRulesPrompt(),
    readObjectInsertCandidatePromptForProvider(input.config),
    '',
    'Insert the object into the original scene near the position indicated in Image 2.',
    'The overlay position is a soft anchor, not a rigid bounding box.',
    'Small local adjustments are allowed only for the inserted object realism, perspective, floor contact, circulation, and scale; existing scene content and materials must stay unchanged.',
    'Keep the final placement close to the user-indicated overlay position.',
    'Do not move the object to a far-away area of the scene.',
    'Do not relocate it to a different side of the room.',
    '',
    'Prioritize:',
    '1. natural integration,',
    '2. realistic lighting and shadows,',
    '3. correct scale,',
    '4. coherent perspective,',
    '5. believable contact with floor / wall / support surface,',
    '6. placement near the user-indicated layer position.',
    '',
    'For multiple objects, keep every object near its own overlay position. Do not omit objects and do not swap their positions.',
    'The result should look like the object is naturally placed near the indicated overlay position, not rigidly pasted, and not relocated far away.',
    'Do not redesign the whole room. Do not move unrelated furniture. Do not change wall/floor/ceiling/countertop/furniture/equipment/signage/screen materials or content. Do not add extra copies of the object. Do not create a collage or split-screen.',
    buildObjectInsertUnrequestedContentPrompt(input.config),
    '',
    '中文补充：用户拖动图层所示的位置是主要参考位置。请将物体自然融合到该位置附近，允许为了真实感做小范围微调，但不要偏离过远，不要移动到画面其他区域。重点保证自然摆放、真实光影、统一透视和合理尺度。',
    'User extra instruction:',
    userPrompt,
  ].join('\n');
}

function buildObjectInsertImmutableScenePrompt(): string {
  return [
    'Element insertion definition: only add the specified new element(s), do not modify any existing content in the original image.',
    '仅新增，不改原图。严格保持建筑结构、空间结构、相机机位、透视、构图、墙面、地面、顶面、柜台、家具、设备、屏幕、已有标识、导视、装饰、材质种类、材质边界和色彩体系不变。',
    'Area outside the target placement / selection must stay strictly frozen. Inside the target area, only insert the new element; do not redo wall, floor, ceiling, countertop, furniture, equipment, signage, screen, or decorative materials.',
    'Do not change wall material. Do not change floor material. Do not change ceiling material. Do not change countertop material. Do not change furniture material. Do not change equipment, wayfinding, screens, existing signs, camera position, perspective, composition, or any non-target content.',
    'No whole-image atmosphere changes, no whole-image quality pass, no global style rewrite, no unified style rewrite, and no surrounding-region redesign.',
  ].join('\n');
}

function buildVolumetricObjectInsertionRulesPrompt(): string {
  return [
    'Volumetric object insertion branch:',
    '- Insert the requested three-dimensional object as a new believable scene object.',
    '- Match the original camera perspective, scale, light direction, shadow softness, contact, occlusion, and support surface.',
    '- Only the inserted object may be adapted for natural contact; existing walls, floors, ceilings, countertops, furniture, equipment, screens, signs, and materials must not be repainted or redesigned.',
  ].join('\n');
}

function buildPlanarGraphicInsertionRulesPrompt(): string {
  return [
    'Planar graphic insertion branch:',
    '- Controlled planar attachment: the user placement box is the final locked size and position, not a soft suggestion.',
    '- Preserve the reference graphic/logo/text/emblem/poster/wayfinding/screen content itself; do not redraw, reinterpret, rewrite, or redesign it.',
    '- Remove obvious reference-image background when needed, especially white backgrounds.',
    '- Keep graphic content, text content, proportions, letterforms, emblem pattern, and edges clear and accurate.',
    '- Attach the graphic to the indicated wall, screen, or surface with the exact user-locked width, height, aspect ratio, rotation, alignment, perspective, lighting, white balance, and very subtle contact shadow / environmental blending.',
    '- The planar graphic body is a deterministic composite: coreMask is locked, edgeBandMask is only a 1-2 original-pixel transition/contact band, and protectedBackgroundMask is frozen.',
    '- Only adjust the inserted planar graphic for color, brightness, white balance, contrast, grain, compression texture, and sharpness matching; do not adjust the original wall/screen/background pixels to fit it.',
    '- Do not enlarge, shrink, crop, stretch, or change the planar graphic proportions for visual harmony.',
    '- Do not use large mask expansion, large feather, big blur, gray halo, double edge, or full-object AI redraw for planar graphics.',
    '- The result should look like a real installed wall sign, poster, wayfinding panel, or screen image, not a floating sticker layer.',
    '- Do not change the wall/screen material itself or surrounding content.',
  ].join('\n');
}

function buildPlanarGraphicInsertionPrompt(input: GenerateImageInput, userPrompt: string): string {
  return [
    'Image 1 is the original scene.',
    'Image 2 is the clean placement preview showing the exact planar graphic placement target.',
    buildObjectInsertImmutableScenePrompt(),
    buildPlanarGraphicInsertionRulesPrompt(),
    buildPlanarGraphicPlacementLockPrompt(input.config),
    buildPlanarGraphicDeterministicFusionPrompt(input.config),
    'For planar graphics, any candidate strategy is subordinate to the locked placement box; do not optimize scale or choose a new size.',
    '',
    'Insert only the requested planar graphic content at the indicated wall/screen/surface position.',
    'Use deterministic planar compositing as the main method: keep the graphic core exactly from the placement preview/reference, then perform only minimal edge/contact/environment fusion.',
    'Do not use the ordinary volumetric-object insertion strategy for this item.',
    'Do not AI-redraw the planar graphic core. If a mask is provided, treat the white mask as edgeBand/contact only; never repaint the graphic body or surrounding wall.',
    'Do not let the model decide a new size. The placement box width and height are hard constraints.',
    'Do not generate a similar logo. Do not invent or rewrite text. Do not alter fonts, letterforms, icon geometry, or emblem pattern.',
    'Keep edges crisp and natural, avoid blur, halo, jagged borders, sticker look, floating layer look, or low-resolution reconstruction.',
    'For hospital signage, make it look like a real installed hospital wall sign, not a pasted logo image.',
    buildObjectInsertUnrequestedContentPrompt(input.config),
    userPrompt ? `User extra instruction: ${userPrompt}` : '',
  ].filter(isNonEmptyString).join('\n');
}

function buildPlanarGraphicPlacementLockPrompt(config: Record<string, unknown>): string {
  const items = readPlanarGraphicPlacementItems(config);
  if (items.length === 0) {
    return [
      'Planar graphic size lock:',
      'Use Image 2 as the exact hard placement box. The final graphic size must match the placement preview; do not enlarge, shrink, or change aspect ratio.',
    ].join('\n');
  }
  return [
    'Planar graphic size lock:',
    'Strictly attach each planar graphic according to the placement box position, width, height, aspect ratio, and rotation below.',
    'Final size must match the placement preview. Do not automatically enlarge, shrink, crop, stretch, or change proportion. Only perspective attachment and natural fusion are allowed.',
    '请将该二维平面图形严格按照用户当前放置框的位置、宽度、高度和比例贴附到目标平面上。最终生成中的图形尺寸必须与放置预览一致，不得自动放大、缩小或改变比例。只允许进行透视贴附与自然融合。',
    ...items.map((item, index) => `Planar graphic ${index + 1} (${item.label}): ${formatPlanarPlacementForPrompt(item.placement)}`),
  ].join('\n');
}

function buildPlanarGraphicDeterministicFusionPrompt(config: Record<string, unknown>): string {
  const items = readPlanarGraphicPlacementItems(config);
  if (items.length === 0) {
    return [
      'Planar deterministic composite + local fusion:',
      'Use deterministic compositing for the planar graphic body. The graphic core is locked; only edgeBand/contact pixels may be lightly fused. Keep all placement-outside background pixels frozen.',
    ].join('\n');
  }
  return [
    'Planar deterministic composite + local fusion:',
    'Do not treat the whole planar graphic as an AI inpainting target. The core graphic/logo/text/poster/screen content must be preserved exactly from the deterministic placement preview/reference.',
    'Mask model: coreMask=locked and never redrawn; edgeBandMask=only an extremely narrow 1-2 original-pixel transition/contact band; protectedBackgroundMask=all original pixels outside the placement box frozen.',
    'If a provider mask is present, it represents only the edgeBand/contact band. Do not expand it into the graphic body or surrounding wall.',
    'Apply color, exposure, white balance, contrast, grain, compression texture, and sharpness matching only to the inserted planar graphic, never to the wall/screen/background.',
    'Preserve logo brand colors, text, fonts, letterforms, emblem geometry, and screen/poster content. Avoid large Gaussian blur, halo, gray glow, double edge, jagged border, hard PPT sticker look, or low-resolution reconstruction.',
    'Attachment-mode rules: flat-decal = almost no shadow; flat-sign = very light contact shadow only; raised-lettering = small directional shadow/thickness while outer bounds stay locked; screen-content = change only screen content and keep bezel/frame unchanged.',
    ...items.map((item, index) => `Planar fusion ${index + 1} (${item.label}): attachmentMode=${item.attachmentMode || 'flat-sign'}, fusionStrategy=${item.fusionStrategy || 'deterministic-planar-composite'}, aiEditableRegion=${item.aiEditableRegion || 'edge-band-only'}, coreMask=${item.coreMaskMode || 'locked'}, edgeBandPx=${item.edgeBandPx ?? 2}, maxMaskExpansionPx=${item.maxMaskExpansionPx ?? item.edgeBandPx ?? 2}.`),
  ].join('\n');
}

function readPlanarGraphicPlacementItems(config: Record<string, unknown>): Array<{
  label: string;
  placement?: Record<string, unknown>;
  attachmentMode?: string;
  fusionStrategy?: string;
  aiEditableRegion?: string;
  coreMaskMode?: string;
  edgeBandPx?: number;
  maxMaskExpansionPx?: number;
}> {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const rawItems = Array.isArray(nested.objectItems) ? nested.objectItems.filter(isRecord) : [];
  const items = rawItems
    .filter(item => readInsertElementKind(
      item.insertElementKind || item.elementType,
      readConfigString(item.objectType) || readConfigString(nested.objectType) || readConfigString(config.objectType),
      { ...config, objectInsert: { ...nested, ...item } },
    ) === 'planar-graphic')
    .map((item, index) => ({
      label: readConfigString(item.objectLabel) || readConfigString(item.objectType) || `planar graphic ${index + 1}`,
      placement: isRecord(item.placement) ? item.placement : undefined,
      attachmentMode: readConfigString(item.attachmentMode),
      fusionStrategy: readConfigString(item.fusionStrategy),
      aiEditableRegion: readConfigString(item.aiEditableRegion),
      coreMaskMode: readConfigString(item.coreMaskMode),
      edgeBandPx: readConfigNumber(item.edgeBandPx),
      maxMaskExpansionPx: readConfigNumber(item.maxMaskExpansionPx),
    }));
  if (items.length > 0) return items;
  if (!hasPlanarGraphicObjectInsert(config)) return [];
  return [{
    label: readConfigString(nested.objectLabel) || readConfigString(config.objectLabel) || readConfigString(nested.objectType) || readConfigString(config.objectType) || 'planar graphic',
    placement: isRecord(nested.placement) ? nested.placement : isRecord(config.objectPlacement) ? config.objectPlacement : undefined,
    attachmentMode: readConfigString(nested.attachmentMode) || readConfigString(config.attachmentMode),
    fusionStrategy: readConfigString(nested.fusionStrategy) || readConfigString(config.fusionStrategy),
    aiEditableRegion: readConfigString(nested.aiEditableRegion) || readConfigString(config.aiEditableRegion),
    coreMaskMode: readConfigString(nested.coreMaskMode) || readConfigString(config.coreMaskMode),
    edgeBandPx: readConfigNumber(nested.edgeBandPx) ?? readConfigNumber(config.edgeBandPx),
    maxMaskExpansionPx: readConfigNumber(nested.maxMaskExpansionPx) ?? readConfigNumber(config.maxMaskExpansionPx),
  }];
}

function formatPlanarPlacementForPrompt(placement: Record<string, unknown> | undefined): string {
  if (!placement) return 'placement box missing; use Image 2 placement preview as the exact hard box';
  const normalizedBox = isRecord(placement.normalizedBox) ? placement.normalizedBox : undefined;
  const normalized = normalizedBox
    ? `; normalizedBox x=${readPromptNumber(normalizedBox.x)}, y=${readPromptNumber(normalizedBox.y)}, width=${readPromptNumber(normalizedBox.width)}, height=${readPromptNumber(normalizedBox.height)}`
    : '';
  const cornerPoints = Array.isArray(placement.cornerPoints)
    ? `; cornerPoints=${placement.cornerPoints.filter(isRecord).map(point => `(${readPromptNumber(point.x)},${readPromptNumber(point.y)})`).join(' ')}`
    : '';
  const surfacePlane = typeof placement.surfacePlane === 'string' ? `; surfacePlane=${placement.surfacePlane}` : '';
  return `x=${readPromptNumber(placement.x)}, y=${readPromptNumber(placement.y)}, width=${readPromptNumber(placement.width)}, height=${readPromptNumber(placement.height)}, rotation=${readPromptNumber(placement.rotation)}, anchor=${placement.anchor === 'center' ? 'center' : 'top-left'}, sizeLocked=true${normalized}${cornerPoints}${surfacePlane}`;
}

function readPromptNumber(value: unknown): number | string {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 'unknown';
}

function buildObjectInsertUnrequestedContentPrompt(config: Record<string, unknown>): string {
  const hasPlanarGraphic = hasPlanarGraphicObjectInsert(config);
  const insertsPeople = objectInsertRequestsType(config, 'person');
  return [
    hasPlanarGraphic
      ? 'Do not add unrelated logos, unrelated text, watermarks, borders, UI, collage, or split-screen; the requested planar graphic/text is allowed and must be preserved.'
      : 'Do not generate brand logos, trademarks, watermarks, text, labels, borders, UI, collage, or split-screen unless explicitly requested as the inserted element.',
    insertsPeople
      ? 'Do not add extra unrequested people beyond the requested inserted person/people.'
      : 'Do not add people unless the requested inserted element is a person.',
  ].join('\n');
}

function readObjectInsertPreviewFusionUserPrompt(config: Record<string, unknown>, fallback: string): string {
  const value = readObjectInsertExtraPrompt(config) || fallback.trim();
  if (!value || looksLikeLegacyObjectInsertPrompt(value)) {
    return 'Naturally integrate the furniture arrangement shown in the placement preview.';
  }
  return value;
}

function looksLikeLegacyObjectInsertPrompt(value: string): boolean {
  return /\bimage\s+[3-9]\b|Generation config JSON|Object list:|placement guide|edit-area mask|object_insert|object insert placement mode/iu.test(value);
}

interface ObjectInsertPromptItem {
  index: number;
  objectType: string;
  objectLabel?: string;
  referenceImageIndexes: number[];
  placementGuideImageIndex?: number;
  placementMaskImageIndex?: number;
  placementMode: string;
  placementIntent?: string;
  extraPrompt?: string;
  placement?: Record<string, unknown>;
}

function buildMultiObjectInsertPrompt(input: GenerateImageInput, items: ObjectInsertPromptItem[]): string {
  const guideIndexes = Array.from(new Set(items.map(item => item.placementGuideImageIndex).filter((index): index is number => Boolean(index))));
  const maskIndexes = Array.from(new Set(items.map(item => item.placementMaskImageIndex).filter((index): index is number => Boolean(index))));
  const sharedGuideIndex = guideIndexes.length === 1 ? guideIndexes[0] : undefined;
  const sharedMaskIndex = maskIndexes.length === 1 ? maskIndexes[0] : undefined;
  const itemLines = items.map(item => {
    const name = item.objectLabel || item.objectType || `object ${item.index + 1}`;
    const refs = item.referenceImageIndexes.length > 0 ? item.referenceImageIndexes.map(index => `image ${index}`).join(', ') : 'provided reference images';
    const guide = item.placementGuideImageIndex && !sharedGuideIndex ? ` guide: image ${item.placementGuideImageIndex};` : '';
    const mask = item.placementMaskImageIndex && !sharedMaskIndex ? ` mask: image ${item.placementMaskImageIndex};` : '';
    const placement = item.placement ? ` placement metadata: ${formatObjectPlacementForPrompt(item.placement)};` : '';
    const intent = item.placementIntent ? ` intent: ${item.placementIntent};` : '';
    const extra = item.extraPrompt ? ` extra: ${item.extraPrompt};` : '';
    return `Object ${item.index + 1}: ${name}; references: ${refs}; mode: ${item.placementMode};${placement}${guide}${mask}${intent}${extra}`;
  });

  return [
    input.prompt,
    'Multi-object insert / high-fidelity intelligent furnishing composition.',
    'Image 1 is the original interior or architectural scene and must remain the main base.',
    'All following images are grouped according to the object list below: all object reference images first, then each object placement guide and optional mask in object order.',
    sharedGuideIndex ? `Shared placement guide: image ${sharedGuideIndex}. It shows the combined target placement for all objects.` : '',
    sharedMaskIndex ? `Shared editable mask: image ${sharedMaskIndex}. It marks the combined editable area for all inserted objects.` : '',
    readObjectInsertLocalEditPrompt(input.config),
    buildObjectInsertPlacementControlPrompt(input.config),
    buildObjectInsertFusionQualityPrompt(input.config),
    buildObjectInsertNaturalScenePrompt(input.config),
    'For each object, use its reference images to understand type, form, material, color, proportion, details, and design language. Do not copy reference image backgrounds.',
    'Insert all listed objects into the original scene at the same time and produce one coherent final image.',
    'Each object has its own reference image set, placement region, placement mode, and optional mask; do not merge uploaded references into a single object.',
    'For strict objects, fit their placement guide position, scale, direction, and target area as closely as possible.',
    'For natural objects, treat placement guides as soft target areas and optimize final position, orientation, scale, occlusion, and floor/ceiling contact according to the scene layout, existing furniture, circulation, perspective, and overall composition.',
    'Coordinate all new objects with each other and with the existing interior style. Preserve functional reasonableness, circulation, visual balance, lighting, shadows, material integration, realistic occlusion, and believable contact with floor, wall, tabletop, or ceiling.',
    'If objects form a natural set, such as table with chairs, sofa with coffee table, or ceiling light above a table, arrange them as a coherent furniture group.',
    'Every inserted object must appear at normal usable size. Do not make furniture too small, decorative, floating, flat, or pasted on top of the photo.',
    'Do not insert only the first object. Do not create a collage, split image, comparison sheet, text, labels, borders, brand Logo, trademarks, or watermarks.',
    'Object list:',
    ...itemLines,
    buildObjectInsertSpatialRelationPrompt(input),
    readObjectInsertExtraPrompt(input.config) ? `Global extra prompt: ${readObjectInsertExtraPrompt(input.config)}` : '',
    `Generation config JSON: ${JSON.stringify(input.config)}`,
  ].filter(isNonEmptyString).join('\n');
}

function readObjectInsertItemsForPrompt(config: Record<string, unknown>): ObjectInsertPromptItem[] {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const rawItems = Array.isArray(nested.objectItems) ? nested.objectItems.filter(isRecord) : [];
  const rawOrder = Array.isArray(config.objectInsertInputOrder) ? config.objectInsertInputOrder.filter(isRecord) : [];
  return rawItems.slice(0, 8).map((item, index) => {
    const order = rawOrder[index] || {};
    const placementMode = item.placementMode === 'strict' || item.placementMode === 'natural'
      ? item.placementMode
      : readObjectInsertPlacementMode(config);
    return {
      index,
      objectType: typeof item.objectType === 'string' && item.objectType.trim() ? item.objectType.trim() : 'custom object',
      objectLabel: typeof item.objectLabel === 'string' && item.objectLabel.trim() ? item.objectLabel.trim() : undefined,
      referenceImageIndexes: readNumberArray(order.referenceImageIndexes),
      placementGuideImageIndex: readPositiveNumber(order.placementGuideImageIndex),
      placementMaskImageIndex: readPositiveNumber(order.placementMaskImageIndex),
      placementMode,
      placementIntent: typeof item.placementIntent === 'string' && item.placementIntent.trim() ? item.placementIntent.trim() : undefined,
      extraPrompt: typeof item.extraPrompt === 'string' && item.extraPrompt.trim() ? item.extraPrompt.trim() : undefined,
      placement: isRecord(item.placement) ? item.placement : undefined,
    };
  }).filter(item => item.referenceImageIndexes.length > 0 || item.placementGuideImageIndex || item.placementMaskImageIndex);
}

function formatObjectPlacementForPrompt(placement: Record<string, unknown>): string {
  const fields = ['x', 'y', 'width', 'height', 'rotation']
    .map(key => {
      const value = placement[key];
      return typeof value === 'number' && Number.isFinite(value) ? `${key}=${Math.round(value * 10) / 10}` : '';
    })
    .filter(isNonEmptyString);
  return fields.length > 0 ? fields.join(', ') : JSON.stringify(placement);
}

function readNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map(readPositiveNumber).filter((item): item is number => typeof item === 'number') : [];
}

function readPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function isObjectInsertInput(input: GenerateImageInput): boolean {
  return input.step === 'object_insert'
    || input.config.step === 'object_insert'
    || isRecord(input.config.objectInsert);
}

function readObjectInsertPreviewFusionMode(config: Record<string, unknown>): boolean {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const values = [config.objectInsertMode, config.mode, nested.mode, nested.objectInsertMode]
    .filter((value): value is string => typeof value === 'string');
  return !values.some(value => value === 'legacy_object_insert' || value === 'precise_inpaint');
}

function isFreeReferenceImageInput(input: GenerateImageInput): boolean {
  return input.step === 'free_reference_image'
    || input.config.step === 'free_reference_image';
}

function isImagePolishInput(input: GenerateImageInput): boolean {
  return input.step === 'image_polish'
    || input.config.step === 'image_polish'
    || input.config.generationStep === 'image_polish'
    || input.config.featureKey === 'image_polish';
}

function isFloorplanLayoutVariantInput(input: GenerateImageInput): boolean {
  return input.mode === 'floorplan'
    && input.config.floorplanOutputMode === 'multi'
    && (input.config.floorplanVariantType === 'furniture_layout' || input.config.floorplanVariantType === 'mixed' || input.config.floorplanVariantFocus === 'furniture_layout' || input.config.floorplanVariantFocus === 'both');
}

function buildObjectInsertProviderInputPrompt(input: GenerateImageInput): string {
  const mode = readObjectInsertDebugMode(input.config);
  const sceneLabel = readObjectInsertLocalEdit(input.config)
    ? 'a local crop from the original interior/architectural scene around the target placement area'
    : 'the original interior/architectural scene';
  if (mode === 'source_prompt') {
    return `Input order: image 1 is ${sceneLabel}. This debug request sends only the source image and prompt.`;
  }
  if (mode === 'source_object') {
    return `Input order: image 1 is ${sceneLabel}; image 2 is a furniture/object reference. No placement guide or mask is provided in this debug request.`;
  }
  if (mode === 'source_object_mask') {
    return `Input order: image 1 is ${sceneLabel}; image 2 is a furniture/object reference; image 3 is the placement mask. No placement guide is provided in this debug request.`;
  }
  if (mode === 'source_object_preview') {
    return `Input order: image 1 is ${sceneLabel}; image 2 is a furniture/object reference; image 3 is a placement guide with translucent object placement and outline. No mask is provided in this debug request.`;
  }
  if (mode === 'source_placement_preview') {
    return `Input order: image 1 is ${sceneLabel}; image 2 is a clean placement preview made from the original scene plus the user's dragged object layers. No object reference image, mask, editor border, or UI control is provided.`;
  }
  return `Input order: image 1 is ${sceneLabel}; image 2 is a furniture/object reference; image 3 is a placement guide with translucent object placement and outline; image 4 is the precise placement mask.`;
}

function readObjectInsertLocalEditPrompt(config: Record<string, unknown>): string {
  if (!readObjectInsertLocalEdit(config)) return '';
  return 'Local high-fidelity edit mode: image 1 is a crop around the placement region, expanded to include surrounding floor, adjacent furniture, walls, corners, light, shadows, and occlusion context. Edit only this crop region and preserve crop boundaries, unmasked areas, camera geometry, and scene structure so the system can seamlessly composite the edited crop back into the full original image.';
}

function readObjectInsertLocalEdit(config: Record<string, unknown>): boolean {
  return config.objectInsertLocalEdit === true;
}

function buildObjectInsertPlacementControlPrompt(config: Record<string, unknown>): string {
  const placementMode = readObjectInsertPlacementMode(config);
  const intent = readObjectInsertPlacementIntent(config);
  const harmonyPriority = readObjectInsertHarmonyPriority(config);
  const fusionPreference = readObjectInsertFusionPreference(config);
  const autoAdjust = [
    readObjectInsertAutoAdjust(config, 'allowAutoAdjustPosition') ? 'position' : '',
    readObjectInsertAutoAdjust(config, 'allowAutoAdjustRotation') ? 'orientation' : '',
    readObjectInsertAutoAdjust(config, 'allowAutoAdjustScale') ? 'scale' : '',
  ].filter(Boolean);

  return [
    `Placement mode: ${placementMode}.`,
    `Harmony priority: ${harmonyPriority}.`,
    `Fusion preference: ${fusionPreference}.`,
    intent ? `User placement intent: ${intent}. Give this intent strong priority when choosing the natural placement relationship.` : undefined,
    placementMode === 'natural'
      ? `Auto-adjust allowed for: ${autoAdjust.length > 0 ? autoAdjust.join(', ') : 'none'}. In natural mode, the guide means suggested area and approximate size, not a rigid transform.`
      : 'Strict mode: use the guide and placement metadata as precise placement instructions.',
    buildObjectInsertPositionConstraintPrompt(config),
  ].filter(isNonEmptyString).join('\n');
}

function buildObjectInsertFusionQualityPrompt(config: Record<string, unknown>): string {
  return [
    'High-fidelity element-only fusion requirements:',
    '- This is element insertion, not image polishing, not whole-scene enhancement, not material replacement, and not room redesign.',
    '- Use normal usable furniture scale; avoid tiny model-like objects.',
    '- Match the original camera perspective, horizon, floor plane, wall plane, lens feel, and existing furniture scale.',
    '- Create believable contact shadows, cast shadows, ambient occlusion, partial occlusion, and support/contact relationships.',
    '- Match the original light direction, softness, color temperature, contrast, grain, and image sharpness for the inserted element only.',
    '- If the reference object conflicts with the scene, preserve its core design language while adapting only the inserted object for contact, scale, perspective, and light. Never modify existing scene materials.',
    '- Preserve the original space structure and keep all non-target regions stable.',
    `- Fusion preference detail: ${buildObjectInsertFusionPreferencePrompt(config)}`,
  ].join('\n');
}

function buildObjectInsertFusionPreferencePrompt(config: Record<string, unknown>): string {
  const preference = readObjectInsertFusionPreference(config);
  if (preference === 'conservative') {
    return 'conservative inserted-element fusion, keep the original scene very stable while still fixing the inserted element perspective, scale, contact shadows, and surface integration.';
  }
  if (preference === 'design') {
    return 'strong inserted-element fusion, allow larger improvements only to the inserted element placement, scale, orientation, color, material, and grouping when needed; do not alter existing scene materials or objects.';
  }
  return 'balanced inserted-element fusion, keep the original scene stable while optimizing the inserted element scale, functional relationship, contact, shadow, and perspective.';
}

function buildObjectInsertNaturalScenePrompt(config: Record<string, unknown>): string {
  if (readObjectInsertPlacementMode(config) !== 'natural') return '';
  return [
    'Natural mode scene-understanding logic:',
    '- First infer the room type from the original image, such as bedroom, living room, dining room, study, entryway, retail, or office.',
    '- Place objects according to how they would actually be used in that room, with clear functional relationships and comfortable circulation.',
    '- In a bedroom, a chair should preferably become a vanity chair, bedside lounge chair, or reading-corner chair instead of a small isolated floor object.',
    '- Dining tables and chairs should form a dining set; sofas and coffee tables should form a conversation area; pendant lights should align above the relevant table or seating group.',
    '- If the new object can form a useful group with existing furniture, prioritize that group relationship over literal guide alignment.',
    '- The guide is a suggested zone, not an absolute transform; optimize final placement for function, balance, perspective, and believable contact.',
  ].join('\n');
}

function readObjectInsertWorkflowMode(config: Record<string, unknown>): 'placement' | 'scene-enrichment' {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = typeof nested.workflowMode === 'string' ? nested.workflowMode : config.objectInsertWorkflowMode;
  return value === 'scene-enrichment' ? 'scene-enrichment' : 'placement';
}

function hasPlanarGraphicObjectInsert(config: Record<string, unknown>): boolean {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  if (readInsertElementKind(nested.insertElementKind || config.insertElementKind, readConfigString(nested.objectType) || readConfigString(config.objectType), config) === 'planar-graphic') {
    return true;
  }
  const items = Array.isArray(nested.objectItems) ? nested.objectItems.filter(isRecord) : [];
  return items.some(item => readInsertElementKind(
    item.insertElementKind,
    readConfigString(item.objectType) || readConfigString(nested.objectType) || readConfigString(config.objectType),
    { ...config, objectInsert: { ...nested, ...item } },
  ) === 'planar-graphic');
}

function objectInsertRequestsType(config: Record<string, unknown>, type: string): boolean {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const values = [
    readConfigString(config.objectType),
    readConfigString(nested.objectType),
    ...(Array.isArray(nested.objectItems) ? nested.objectItems.filter(isRecord).map(item => readConfigString(item.objectType)) : []),
  ].filter(isNonEmptyString);
  return values.some(value => value === type);
}

function readInsertElementKind(value: unknown, objectType: string | undefined, config: Record<string, unknown>): 'volumetric-object' | 'planar-graphic' {
  if (value === 'planar-graphic' || value === 'volumetric-object') return value;
  if (isPlanarGraphicObjectType(objectType)) return 'planar-graphic';
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const surface = readConfigString(nested.objectInsertSurface) || readConfigString(config.objectInsertSurface);
  const text = [
    objectType || '',
    readConfigString(nested.objectLabel),
    readConfigString(config.objectLabel),
    readConfigString(nested.extraPrompt),
    readConfigString(config.objectInsertExtraPrompt),
    readConfigString(config.customPrompt),
    readConfigString(nested.placementIntent),
    readConfigString(config.placementIntent),
  ].join('\n');
  if (surface === 'wall' && /logo|标识|导视|海报|医院|名称|文字|屏幕|screen|poster|signage|wayfinding|brand/iu.test(text)) return 'planar-graphic';
  return 'volumetric-object';
}

function isPlanarGraphicObjectType(value: string | undefined): boolean {
  return value === 'signage'
    || value === 'logo'
    || value === 'wall-text'
    || value === 'hospital-signage'
    || value === 'brand-signage'
    || value === 'poster'
    || value === 'wayfinding'
    || value === 'screen-content';
}

function readConfigString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readConfigNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readObjectInsertCandidatePromptForProvider(config: Record<string, unknown>): string {
  if (typeof config.objectInsertCandidatePromptHint === 'string' && config.objectInsertCandidatePromptHint.trim()) {
    return config.objectInsertCandidatePromptHint.trim();
  }
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  if (typeof nested.objectInsertCandidatePromptHint === 'string' && nested.objectInsertCandidatePromptHint.trim()) {
    return nested.objectInsertCandidatePromptHint.trim();
  }
  const strategy = typeof config.objectInsertCandidateStrategy === 'string'
    ? config.objectInsertCandidateStrategy
    : typeof nested.objectInsertCandidateStrategy === 'string'
      ? nested.objectInsertCandidateStrategy
      : '';
  const prompts: Record<string, string> = {
    'strict-placement': 'Candidate strategy: strict-placement. Follow the user placement guide closely and minimize transform deviation.',
    'natural-fit': 'Candidate strategy: natural-fit. Optimize contact, perspective and scale while staying near the requested position.',
    'object-fidelity': 'Candidate strategy: object-fidelity. Prioritize the inserted object identity, shape, material and color.',
    'scene-harmony': 'Candidate strategy: scene-harmony. Prioritize lighting, shadow, occlusion and atmospheric harmony.',
  };
  return prompts[strategy] || '';
}

function buildObjectInsertSceneEnrichmentPrompt(config: Record<string, unknown>): string {
  if (readObjectInsertWorkflowMode(config) !== 'scene-enrichment') return '';
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const enrichment = isRecord(nested.sceneEnrichment)
    ? nested.sceneEnrichment
    : isRecord(config.objectInsertSceneEnrichment) ? config.objectInsertSceneEnrichment : {};
  const descriptions: Record<string, Record<string, string>> = {
    plants: {
      few: 'Add 1-2 context-appropriate plants.',
      moderate: 'Add 3-5 context-appropriate plants distributed with visual balance.',
      many: 'Add 6-9 plants with varied scale, avoiding blocked circulation or visual clutter.',
    },
    people: {
      few: 'Add 1-2 naturally posed people at plausible scale.',
      moderate: 'Add 3-5 naturally distributed people with plausible activities and scale.',
      many: 'Add 6-9 naturally distributed people while keeping circulation and focal areas clear.',
    },
    decorations: {
      few: 'Add 1-2 restrained decorative objects appropriate to the scene.',
      moderate: 'Add 3-5 coordinated decorative objects with a clear hierarchy.',
      many: 'Add 6-9 coordinated decorative objects without cluttering the composition.',
    },
  };
  const readLevel = (key: string, fallback: string) => {
    const value = enrichment[key];
    return value === 'few' || value === 'moderate' || value === 'many' ? value : fallback;
  };
  const plants = readLevel('plants', 'moderate');
  const people = readLevel('people', 'few');
  const decorations = readLevel('decorations', 'moderate');
  return [
    'Scene enrichment quantity controls:',
    `- Plants level: ${plants}. ${descriptions.plants[plants]}`,
    `- People level: ${people}. ${descriptions.people[people]}`,
    `- Decorations level: ${decorations}. ${descriptions.decorations[decorations]}`,
    '- Every new element must be inserted as a separate believable scene object with correct perspective, usable scale, contact, occlusion, light, and shadow.',
    '- Do not replace existing objects, do not redesign the room, do not change existing wall/floor/ceiling/furniture/countertop materials, and do not add more elements than the requested ranges.',
  ].join('\n');
}

function buildObjectInsertSpatialRelationPrompt(input: GenerateImageInput): string {
  const text = [
    input.prompt,
    readObjectInsertPlacementIntent(input.config),
    readObjectInsertExtraPrompt(input.config),
  ].join('\n');
  const relations = [
    { pattern: /放在.{0,8}沙发后|沙发后面|沙发后侧|behind.{0,12}sofa/iu, label: 'Place it behind or to the rear side of the sofa when scene geometry allows; respect sofa occlusion and circulation.' },
    { pattern: /靠墙|贴墙|against.{0,8}wall|near.{0,8}wall/iu, label: 'Place it close to a wall when suitable, with believable floor contact and spacing.' },
    { pattern: /餐桌旁|餐桌边|餐桌附近|beside.{0,12}dining|near.{0,12}dining/iu, label: 'Place it beside or near the dining table in a functional relationship.' },
    { pattern: /窗边|窗旁|near.{0,8}window|by.{0,8}window/iu, label: 'Place it near the window while preserving light direction and visual balance.' },
    { pattern: /角落|墙角|corner/iu, label: 'Place it into a suitable corner without blocking circulation.' },
    { pattern: /玄关处|玄关|entryway|foyer/iu, label: 'Place it near the entryway or foyer area when visible and spatially plausible.' },
  ].filter(item => item.pattern.test(text)).map(item => item.label);

  if (relations.length === 0) return '';
  return [
    'Detected spatial relationship intent:',
    ...relations.map(relation => `- ${relation}`),
  ].join('\n');
}

function buildObjectInsertPositionConstraintPrompt(config: Record<string, unknown>): string {
  if (readObjectInsertPlacementMode(config) === 'natural') {
    return 'Position constraint strength is secondary in natural mode. Use the guide as a soft target area and optimize placement for layout harmony, existing furniture relationships, circulation, perspective, and composition.';
  }
  const strength = readObjectInsertPositionConstraintStrength(config);
  if (strength === 'low') {
    return 'Position constraint strength: low. The object may be naturally adjusted near the guided area when needed for perspective, floor contact, or occlusion, but it should remain close to the placement guide.';
  }
  if (strength === 'medium') {
    return 'Position constraint strength: medium. Keep the object close to the placement guide center, size, and rotation, allowing only small natural corrections for perspective, floor contact, or occlusion.';
  }
  return 'Position constraint strength: high. The object must stay inside the guide / mask area and must not visibly drift away from the guide box center, size, or rotation.';
}

function readObjectInsertPlacementMode(config: Record<string, unknown>): string {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = typeof nested.placementMode === 'string'
    ? nested.placementMode
    : typeof config.placementMode === 'string'
      ? config.placementMode
      : '';
  return value === 'strict' || value === 'natural' ? value : 'natural';
}

function readObjectInsertHarmonyPriority(config: Record<string, unknown>): string {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = typeof nested.harmonyPriority === 'string'
    ? nested.harmonyPriority
    : typeof config.harmonyPriority === 'string'
      ? config.harmonyPriority
      : '';
  return value === 'style' || value === 'balance' || value === 'layout' ? value : 'layout';
}

function readObjectInsertFusionPreference(config: Record<string, unknown>): string {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = typeof nested.fusionPreference === 'string'
    ? nested.fusionPreference
    : typeof config.objectInsertFusionPreference === 'string'
      ? config.objectInsertFusionPreference
      : '';
  return value === 'conservative' || value === 'design' || value === 'balanced' ? value : 'balanced';
}

function readObjectInsertPlacementIntent(config: Record<string, unknown>): string {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = typeof nested.placementIntent === 'string'
    ? nested.placementIntent
    : typeof config.placementIntent === 'string'
      ? config.placementIntent
      : '';
  return value.trim();
}

function readObjectInsertExtraPrompt(config: Record<string, unknown>): string {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = typeof nested.extraPrompt === 'string'
    ? nested.extraPrompt
    : typeof config.objectInsertExtraPrompt === 'string'
      ? config.objectInsertExtraPrompt
      : typeof config.customPrompt === 'string'
        ? config.customPrompt
        : '';
  return value.trim();
}

function readObjectInsertAutoAdjust(
  config: Record<string, unknown>,
  key: 'allowAutoAdjustPosition' | 'allowAutoAdjustRotation' | 'allowAutoAdjustScale',
): boolean {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = typeof nested[key] === 'boolean' ? nested[key] : typeof config[key] === 'boolean' ? config[key] : undefined;
  return value === undefined ? true : value !== false;
}

function readObjectInsertPositionConstraintStrength(config: Record<string, unknown>): string {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = typeof nested.positionConstraintStrength === 'string'
    ? nested.positionConstraintStrength
    : typeof config.positionConstraintStrength === 'string'
      ? config.positionConstraintStrength
      : '';
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'high';
}

function readObjectInsertDebugMode(config: Record<string, unknown>): string {
  const nested = isRecord(config.objectInsert) ? config.objectInsert : {};
  const value = typeof nested.debugMode === 'string'
    ? nested.debugMode
    : typeof config.objectInsertDebugMode === 'string'
      ? config.objectInsertDebugMode
      : '';
  return value === 'source_prompt'
    || value === 'source_object'
    || value === 'source_object_mask'
    || value === 'source_object_preview'
    || value === 'source_placement_preview'
    ? value
    : 'full';
}

function buildInpaintPrompt(input: GenerateImageInput): string {
  if (input.qualityMode === 'draft' || input.qualityMode === 'fast') {
    const hasMask = input.maskMode === 'asset-mask' && isNonEmptyString(input.maskImageDataUrl);
    return [
      hasMask ? 'Quick masked edit. Only change the white mask area; keep all unmasked areas unchanged.' : 'Quick image edit. Keep layout, perspective, and unchanged areas stable.',
      input.editTarget === 'material' ? 'Change material/texture only.' : undefined,
      input.editTarget === 'furniture' ? 'Edit furniture only inside the mask.' : undefined,
      input.prompt,
      'No text, labels, watermarks, borders, or UI.',
    ].filter(isNonEmptyString).join('\n');
  }

  const pieces: string[] = [];
  const hasMask = input.maskMode === 'asset-mask' && isNonEmptyString(input.maskImageDataUrl);
  pieces.push(
    'The first image is the original scene image.',
    'Keep the exact same canvas aspect ratio, framing, composition boundary, and image proportions as the first input image.',
  );
  if (input.editTarget === 'material') {
    pieces.push('Edit target is material: only change material, color, texture, reflection, roughness, and surface quality. Do not change furniture shape or fixed architecture.');
  } else if (input.editTarget === 'furniture') {
    pieces.push('Edit target is furniture: only modify the furniture inside the white mask. Do not replace other furniture. Preserve perspective, scale, lighting, walls, floor, ceiling, doors, windows, fixed structures, and all unmasked areas.');
  }
  if ((input.furnitureReferenceImageDataUrls?.length || 0) > 0) {
    pieces.push('Furniture reference images are only for furniture type, shape, proportion, material, color, and style. Do not copy their backgrounds.');
  }

  if (hasMask) {
    pieces.push(
      '请基于输入参考图进行局部修饰，仅修改用户涂抹或遮罩区域，其他区域保持不变。请将 mask 图中的白色区域作为需要修改的区域，黑色区域保持不变。',
    );
    if (input.config.selectionMode === 'smart-select' || input.config.maskSelectionMode === 'smart') {
      pieces.push(
        'The selected area is automatically detected by AI. Modify only the detected object region. Preserve the original geometry, lighting, perspective and surrounding objects.',
        '仅允许修改确认选区覆盖区域，选区外所有建筑结构、家具、设备、软装、人物、绿植、材质、颜色和细节必须保持不变。',
      );
    }
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
  const result = isRecord(value) ? value as GrsaiTaskResult : {};
  const imageReferences = extractImageReferences(value);
  if (imageReferences.length === 0) return result;
  return {
    ...result,
    results: imageReferences.map((url, index) => ({
      ...(result.results?.[index] || {}),
      url,
    })),
  };
}

function extractImageReferences(value: unknown, keyHint = '', depth = 0): string[] {
  if (depth > 6) return [];
  if (typeof value === 'string') {
    const reference = normalizeImageReferenceString(value, keyHint);
    return reference ? [reference] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(item => extractImageReferences(item, keyHint, depth + 1));
  }
  if (!isRecord(value)) return [];

  const preferredKeys = ['url', 'imageUrl', 'imageDataUrl', 'dataUrl', 'remoteUrl', 'urls', 'images', 'image', 'output', 'outputs', 'result', 'results', 'data', 'content', 'b64_json', 'base64'];
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const key of preferredKeys) {
    if (!(key in value)) continue;
    seen.add(key);
    refs.push(...extractImageReferences(value[key], key, depth + 1));
  }
  for (const [key, child] of Object.entries(value)) {
    if (seen.has(key) || !/(image|img|url|output|result|data|content|base64|b64)/iu.test(key)) continue;
    refs.push(...extractImageReferences(child, key, depth + 1));
  }
  return Array.from(new Set(refs));
}

function normalizeImageReferenceString(value: string, keyHint: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^data:/iu.test(trimmed) || isHttpUrl(trimmed)) return trimmed;
  if (/^(b64_json|base64)$/iu.test(keyHint) && /^[a-z0-9+/=\s]+$/iu.test(trimmed)) {
    return `data:image/png;base64,${trimmed.replace(/\s/g, '')}`;
  }
  return null;
}

function createTaskFailureError(result: GrsaiTaskResult): Error {
  if (String(result.error || '').toLowerCase() === 'model maintenance') {
    const error = new Error(modelMaintenanceUserMessage) as Error & {
      providerError?: string;
      providerStatus?: string;
      failureReason?: string;
      userMessage?: string;
    };
    error.providerError = 'model maintenance';
    error.providerStatus = String(result.status || 'failed');
    error.failureReason = result.failure_reason;
    error.userMessage = modelMaintenanceUserMessage;
    return error;
  }
  return new Error(result.failure_reason || result.error || 'Grsai Banana2 task failed.');
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
  const error = new Error('GRSAI_API_KEY is required when GENERATION_PROVIDER=grsai, AI_PROVIDER=grsai-banana2, or AI_PROVIDER=grsai-nano-banana.') as Error & {
    provider?: string;
    providerError?: string;
    providerStatus?: string;
    userMessage?: string;
  };
  error.provider = 'grsai-banana2';
  error.providerError = 'missing_provider_secret';
  error.providerStatus = 'configuration_error';
  error.userMessage = 'GRSAI_API_KEY 未配置，无法调用 GRS AI。若只需本地测试，请设置 AI_PROVIDER=mock。';
  throw error;
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

function estimateDataUrlBytes(value: string): number {
  const match = /^data:[^,]+,(.*)$/su.exec(value);
  if (!match) return Buffer.byteLength(value);
  const payload = match[1];
  return Math.ceil(payload.length * 0.75);
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

function readNonNegativeInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
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
