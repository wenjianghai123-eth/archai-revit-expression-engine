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
    error.userMessage = 'AI 平台安全策略拒绝了本次生成。建议更换无水印、无 Logo、无人物、无品牌标识的参考图，或改用文字描述家具；也可以删减高风险提示词后重试。';
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
    return [
      input.prompt,
      buildObjectInsertProviderInputPrompt(input),
      readObjectInsertLocalEditPrompt(input.config),
      buildObjectInsertPositionConstraintPrompt(input.config),
      'Insert one similar upholstered chair according to the placement guide and selected position constraint strength.',
      'Use the masked / guided area as the placement authority.',
      'Keep the chair aligned with the guide box center, size, and rotation according to the selected position constraint strength.',
      'Place it behind the long sofa if spatially applicable.',
      'Respect occlusion: if the sofa blocks the chair, the chair should be partially occluded.',
      'Use image 2 only for general chair form, upholstery material, color, and proportion guidance when it is provided.',
      'Use image 3 placement guide and image 4 mask for location, scale, direction, outline, and local edit area according to the selected position constraint strength when provided.',
      'Match perspective, scale, lighting, shadows, materials, depth of field, and scene atmosphere. Keep all unmasked regions unchanged.',
      'Do not freely change composition, camera framing, room layout, sofa position, wall/floor/ceiling structure, or unrelated furniture.',
      'Produce one natural photorealistic architectural rendering. Do not generate brand Logo, trademarks, watermarks, text, people, sensitive content, labels, borders, collage, or split-screen.',
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
    pieces.push(
      'Convert the input image into a professional interior colored floor plan with clear, realistic, and clean material rendering.',
      'Strictly preserve the original floor plan layout, room boundaries, walls, doors, windows, openings, columns, furniture positions, furniture outlines, and proportions.',
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

function isObjectInsertInput(input: GenerateImageInput): boolean {
  return input.step === 'object_insert'
    || input.config.step === 'object_insert'
    || isRecord(input.config.objectInsert);
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

function buildObjectInsertPositionConstraintPrompt(config: Record<string, unknown>): string {
  const strength = readObjectInsertPositionConstraintStrength(config);
  if (strength === 'low') {
    return 'Position constraint strength: low. The chair may be naturally adjusted near the guided area when needed for perspective, floor contact, or occlusion, but it should remain close to the placement guide.';
  }
  if (strength === 'medium') {
    return 'Position constraint strength: medium. Keep the chair close to the placement guide center, size, and rotation, allowing only small natural corrections for perspective, floor contact, or occlusion.';
  }
  return 'Position constraint strength: high. The chair must stay inside the guide / mask area and must not visibly drift away from the guide box center, size, or rotation.';
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
