import crypto from 'node:crypto';
import { loadAssetAsInlineData, type ApiYiInlineData } from './apiyiImageInput';
import type { GenerateImageInput, GenerateImageOutput, ImageGenerationProvider } from './types';

const providerName = 'apiyi-nano-banana2-edit' as const;
const defaultBaseUrl = 'https://api.apiyi.com';
const defaultModel = 'gemini-3.1-flash-image-preview';
const defaultTimeoutMs = 300_000;
const supportedAspectRatios = new Set(['1:1', '4:3', '3:4', '16:9', '9:16', '5:4', '4:5', '3:2', '2:3', '2:1', '21:9']);
const supportedImageSizes = new Set(['512', '1K', '2K', '4K']);
const floorplanTextLanguageRequirement = [
  'Text language requirement:',
  'All visible text, labels, legends, room names, annotations, and material notes in the generated image must be in English only.',
  'Do not use Chinese characters. Do not mix Chinese and English.',
  'If room labels are needed, use concise English labels such as Living Room, Bedroom, Master Bedroom, Kitchen, Dining Area, Bathroom, Balcony, Entrance, Foyer, Corridor, Storage, Study, Guest Room, Laundry, Closet, Terrace, Open Area, Service Area.',
  'If a legend is generated, all legend entries must be in English, such as Legend, Furniture, Wall, Door, Window, Floor Finish, Wood Floor, Tile Floor, Carpet, Stone, Planting, Water Area, Circulation, Private Area, Public Area, Service Area.',
  'If the input plan contains Chinese room names or Chinese annotations, translate them into concise English labels in the output image. Do not copy Chinese text from the input plan.',
].join(' ');

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
          'APIYI_INPUT_IMAGE_REQUIRED',
          '请先上传图片。',
        );
      }
      const inlineImages = await Promise.all(imageSources.map(source => loadAssetAsInlineData(source)));
      const aspectRatio = resolveAspectRatio(input);
      const imageSize = resolveImageSize(input);
      const parts = buildApiYiParts(prompt, inlineImages);
      const requestStartedAt = Date.now();
      const requestId = crypto.randomUUID();

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
          requestId,
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
            'X-Request-ID': requestId,
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
          requestId,
          providerTaskId: typeof body.responseId === 'string' ? body.responseId : requestId,
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
  if (input.inputImages && input.inputImages.length > 0) {
    return input.inputImages.map(image => image.url).filter(Boolean);
  }
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

  if (isImagePolish(input)) {
    return [input.inputImageDataUrl].filter(Boolean);
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
    if (hasPlanarGraphicObjectInsert(input.config)) {
      return [
        'Image 1 is the original scene.',
        'Image 2 is the clean placement preview showing the exact planar graphic placement target.',
        buildObjectInsertImmutableScenePrompt(),
        buildPlanarGraphicInsertionRulesPrompt(),
        buildPlanarGraphicPlacementLockPrompt(input.config),
        buildPlanarGraphicDeterministicFusionPrompt(input.config),
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
        input.prompt,
      ].join('\n');
    }
    return [
      'Image 1 is the original scene.',
      'Image 2 is the clean placement preview, showing the object type, approximate location, approximate size, and approximate orientation intended by the user.',
      buildObjectInsertImmutableScenePrompt(),
      buildVolumetricObjectInsertionRulesPrompt(),
      '',
      'Insert the object into the original scene near the position indicated in Image 2.',
      'The overlay position is a soft anchor, not a rigid bounding box.',
      'Small local adjustments are allowed only for the inserted object realism, perspective, floor contact, circulation, and scale; existing scene content and materials must stay unchanged.',
      'Do not move the object to a far-away area of the scene. Do not relocate it to a different side of the room.',
      '',
      'Prioritize natural integration, realistic lighting and shadows, correct scale, coherent perspective, believable contact with floor / wall / support surface, and placement near the user-indicated layer position.',
      'For multiple objects, keep every object near its own overlay position. Do not omit objects and do not swap their positions.',
      'Do not redesign the whole room. Do not move unrelated furniture. Do not change wall/floor/ceiling/countertop/furniture/equipment/signage/screen materials or content. Do not add extra copies of the object. Do not create a collage or split-screen.',
      buildObjectInsertUnrequestedContentPrompt(input.config),
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

  if (input.mode === 'floorplan') {
    return [input.prompt, floorplanTextLanguageRequirement].filter(Boolean).join('\n');
  }

  return input.prompt;
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
  ].filter((value): value is string => Boolean(value));
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

function isImagePolish(input: GenerateImageInput): boolean {
  return input.step === 'image_polish'
    || input.config.generationStep === 'image_polish'
    || input.config.featureKey === 'image_polish';
}

function resolveAspectRatio(input: GenerateImageInput): string {
  const candidates = [
    input.targetAspectRatio,
    typeof input.config.aspectRatio === 'string' ? input.config.aspectRatio : undefined,
    typeof input.config.apiyiAspectRatio === 'string' ? input.config.apiyiAspectRatio : undefined,
  ];
  const configured = candidates.find(value => Boolean(value && supportedAspectRatios.has(value)));
  if (configured) return configured;
  if (input.targetWidth && input.targetHeight) {
    const target = input.targetWidth / input.targetHeight;
    const ratios = ['1:1', '4:3', '3:2', '16:9', '2:1', '9:16', '3:4'] as const;
    return ratios.reduce((best, value) => {
      const [width, height] = value.split(':').map(Number);
      const [bestWidth, bestHeight] = best.split(':').map(Number);
      return Math.abs(width / height - target) < Math.abs(bestWidth / bestHeight - target) ? value : best;
    }, '1:1' as typeof ratios[number]);
  }
  return '16:9';
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
