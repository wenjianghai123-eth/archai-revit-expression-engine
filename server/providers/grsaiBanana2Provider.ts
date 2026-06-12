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
      const payloadBytesApprox = urls.reduce((sum, url) => sum + estimateDataUrlBytes(url), 0);
      const aspectRatio = input.targetAspectRatio || configuredAspectRatio || defaultAspectRatio;
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
      input.materialImageDataUrl,
      ...(input.referenceImageDataUrls || []),
      input.maskImageDataUrl,
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

function buildPrompt(input: GenerateImageInput): string {
  if (isObjectInsertInput(input)) {
    return buildObjectInsertPrompt(input);
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
  pieces.push('不要添加文字、水印、标签、边框或界面元素。');

  return pieces.filter(Boolean).join('\n');
}

function buildObjectInsertPrompt(input: GenerateImageInput): string {
  const objectItems = readObjectInsertItemsForPrompt(input.config);
  if (objectItems.length > 0) {
    return buildMultiObjectInsertPrompt(input, objectItems);
  }

  const placementMode = readObjectInsertPlacementMode(input.config);
  const common = [
    input.prompt,
    buildObjectInsertProviderInputPrompt(input),
    readObjectInsertLocalEditPrompt(input.config),
    buildObjectInsertPlacementControlPrompt(input.config),
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
    'Match perspective, scale, lighting, shadows, material integration, floor contact, and occlusion.',
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
    'Treat the guide and placement metadata as a soft constraint: the final position, orientation, and scale may be optimized according to the original scene layout, existing furniture relationships, circulation path, perspective, occlusion, and overall composition.',
    'Prioritize harmonious interior design, functional reasonableness, visual balance, realistic floor contact, and scale consistency with existing furniture.',
    'Do not mechanically copy the reference image direction. If the reference angle is unsuitable for the original scene, rotate or reposition the object into a more natural orientation.',
    'Preserve the overall style and design order of the original image. Avoid damaging the existing room structure, camera framing, or unrelated furniture.',
  ];

  return [
    ...common,
    ...(placementMode === 'strict' ? strictPrompt : naturalPrompt),
    'Produce one natural photorealistic architectural rendering. Do not generate brand Logo, trademarks, watermarks, text, people, sensitive content, labels, borders, collage, or split-screen.',
  ].filter(isNonEmptyString).join('\n');
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
}

function buildMultiObjectInsertPrompt(input: GenerateImageInput, items: ObjectInsertPromptItem[]): string {
  const itemLines = items.map(item => {
    const name = item.objectLabel || item.objectType || `object ${item.index + 1}`;
    const refs = item.referenceImageIndexes.length > 0 ? item.referenceImageIndexes.map(index => `image ${index}`).join(', ') : 'provided reference images';
    const guide = item.placementGuideImageIndex ? ` guide: image ${item.placementGuideImageIndex};` : '';
    const mask = item.placementMaskImageIndex ? ` mask: image ${item.placementMaskImageIndex};` : '';
    const intent = item.placementIntent ? ` intent: ${item.placementIntent};` : '';
    const extra = item.extraPrompt ? ` extra: ${item.extraPrompt};` : '';
    return `Object ${item.index + 1}: ${name}; references: ${refs}; mode: ${item.placementMode};${guide}${mask}${intent}${extra}`;
  });

  return [
    input.prompt,
    'Multi-object insert / intelligent furnishing composition.',
    'Image 1 is the original interior or architectural scene and must remain the main base.',
    'All following images are grouped object references, placement guides, and optional masks according to the object list below.',
    'For each object, use its reference images to understand type, form, material, color, proportion, details, and design language. Do not copy reference image backgrounds.',
    'Insert all listed objects into the original scene at the same time and produce one coherent final image.',
    'For strict objects, fit their placement guide position, scale, direction, and target area as closely as possible.',
    'For natural objects, treat placement guides as soft target areas and optimize final position, orientation, scale, occlusion, and floor/ceiling contact according to the scene layout, existing furniture, circulation, perspective, and overall composition.',
    'Coordinate all new objects with each other and with the existing interior style. Preserve functional reasonableness, circulation, visual balance, lighting, shadows, material integration, and realistic occlusion.',
    'If objects form a natural set, such as table with chairs, sofa with coffee table, or ceiling light above a table, arrange them as a coherent furniture group.',
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
    };
  }).filter(item => item.referenceImageIndexes.length > 0 || item.placementGuideImageIndex || item.placementMaskImageIndex);
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

function isFreeReferenceImageInput(input: GenerateImageInput): boolean {
  return input.step === 'free_reference_image'
    || input.config.step === 'free_reference_image';
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
  return `Input order: image 1 is ${sceneLabel}; image 2 is a furniture/object reference; image 3 is a placement guide with translucent object placement and outline; image 4 is the precise placement mask.`;
}

function readObjectInsertLocalEditPrompt(config: Record<string, unknown>): string {
  if (!readObjectInsertLocalEdit(config)) return '';
  return 'Local edit mode: edit only this crop region. The system will composite the edited crop back into the full original image, so keep crop boundaries and mask-outside areas visually stable.';
}

function readObjectInsertLocalEdit(config: Record<string, unknown>): boolean {
  return config.objectInsertLocalEdit === true;
}

function buildObjectInsertPlacementControlPrompt(config: Record<string, unknown>): string {
  const placementMode = readObjectInsertPlacementMode(config);
  const intent = readObjectInsertPlacementIntent(config);
  const harmonyPriority = readObjectInsertHarmonyPriority(config);
  const autoAdjust = [
    readObjectInsertAutoAdjust(config, 'allowAutoAdjustPosition') ? 'position' : '',
    readObjectInsertAutoAdjust(config, 'allowAutoAdjustRotation') ? 'orientation' : '',
    readObjectInsertAutoAdjust(config, 'allowAutoAdjustScale') ? 'scale' : '',
  ].filter(Boolean);

  return [
    `Placement mode: ${placementMode}.`,
    `Harmony priority: ${harmonyPriority}.`,
    intent ? `User placement intent: ${intent}. Give this intent strong priority when choosing the natural placement relationship.` : undefined,
    placementMode === 'natural'
      ? `Auto-adjust allowed for: ${autoAdjust.length > 0 ? autoAdjust.join(', ') : 'none'}. In natural mode, the guide means suggested area and approximate size, not a rigid transform.`
      : 'Strict mode: use the guide and placement metadata as precise placement instructions.',
    buildObjectInsertPositionConstraintPrompt(config),
  ].filter(isNonEmptyString).join('\n');
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
    return 'Position constraint strength: low. The chair may be naturally adjusted near the guided area when needed for perspective, floor contact, or occlusion, but it should remain close to the placement guide.';
  }
  if (strength === 'medium') {
    return 'Position constraint strength: medium. Keep the chair close to the placement guide center, size, and rotation, allowing only small natural corrections for perspective, floor contact, or occlusion.';
  }
  return 'Position constraint strength: high. The chair must stay inside the guide / mask area and must not visibly drift away from the guide box center, size, or rotation.';
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
