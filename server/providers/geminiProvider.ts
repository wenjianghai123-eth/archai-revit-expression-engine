import crypto from 'node:crypto';
import { GoogleGenAI, Modality, type Part } from '@google/genai';
import { GenerateImageInput, GenerateImageOutput, ImageGenerationProvider } from './types';

const floorplanTextLanguageRequirement = [
  'Text language requirement:',
  'All visible text, labels, legends, room names, annotations, and material notes in the generated image must be in English only.',
  'Do not use Chinese characters. Do not mix Chinese and English.',
  'If room labels are needed, use concise English labels such as Living Room, Bedroom, Master Bedroom, Kitchen, Dining Area, Bathroom, Balcony, Entrance, Foyer, Corridor, Storage, Study, Guest Room, Laundry, Closet, Terrace, Open Area, Service Area.',
  'If a legend is generated, all legend entries must be in English, such as Legend, Furniture, Wall, Door, Window, Floor Finish, Wood Floor, Tile Floor, Carpet, Stone, Planting, Water Area, Circulation, Private Area, Public Area, Service Area.',
  'If the input plan contains Chinese room names or Chinese annotations, translate them into concise English labels in the output image. Do not copy Chinese text from the input plan.',
].join(' ');

interface DataUrlParts {
  mimeType: string;
  base64Data: string;
}

export function createGeminiProvider(apiKey: string): ImageGenerationProvider {
  const ai = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image-preview';

  return {
    name: 'gemini',
    async generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
      const warnings: string[] = [];
      const parts = buildRequestParts(input, warnings);

      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          responseModalities: [Modality.IMAGE],
        },
      });

      const image = extractImageDataUrl(response.candidates?.[0]?.content?.parts);
      if (!image) {
        throw createGeminiOutputError(`Gemini 模型 ${model} 未返回图片结果。`, response);
      }

      return {
        id: response.responseId || crypto.randomUUID(),
        provider: 'gemini',
        dataUrl: image.dataUrl,
        mimeType: image.mimeType,
        createdAt: response.createTime || new Date().toISOString(),
        warnings,
      };
    },
  };
}

function createGeminiOutputError(message: string, rawResponse: unknown): Error {
  const error = new Error(message) as Error & {
    provider?: string;
    providerError?: string;
    providerStatus?: string;
    userMessage?: string;
    rawSnippet?: string;
  };
  error.provider = 'gemini';
  error.providerError = 'invalid_provider_output';
  error.providerStatus = 'failed';
  error.userMessage = message;
  error.rawSnippet = createRawSnippet(rawResponse);
  return error;
}

function createRawSnippet(value: unknown): string {
  try {
    return (JSON.stringify(value) || String(value)).slice(0, 800);
  } catch {
    return String(value).slice(0, 800);
  }
}

function buildRequestParts(input: GenerateImageInput, warnings: string[]): Part[] {
  const isObjectInsert = isObjectInsertInput(input);
  const parts: Part[] = [
    {
      text: buildPrompt(input),
    },
    {
      inlineData: toInlineData(input.inputImageDataUrl),
    },
  ];

  if (input.materialImageDataUrl) {
    parts.push({
      text: isObjectInsert
        ? 'Furniture/object reference image. Use only for general form, material, color, and proportion guidance:'
        : isFreeReferenceImageInput(input)
          ? 'Reference image. Use for style, material, atmosphere, details, or composition intent:'
        : 'Reference material image:',
    });
    parts.push({
      inlineData: toInlineData(input.materialImageDataUrl),
    });
  }

  if (isObjectInsert && readObjectInsertPreviewFusionMode(input.config)) {
    appendReferenceImages(
      parts,
      'Placement preview image. It shows the desired furniture arrangement, approximate positions, approximate sizes, orientations, furniture colors, materials, and style:',
      input.referenceImageDataUrls?.slice(0, 1),
    );
  } else if (isObjectInsert) {
    appendObjectInsertReferenceImages(parts, input.config, input.referenceImageDataUrls, input.materialImageDataUrl ? 3 : 2);
  } else {
    appendReferenceImages(
      parts,
      isFreeReferenceImageInput(input)
        ? 'Reference image. Use for style, material, color, mood, detailing, furniture language, or design guidance:'
        : 'Additional reference image:',
      input.referenceImageDataUrls,
    );
  }
  appendReferenceImages(parts, 'Material reference image. Use only for material, color, texture, and surface quality:', input.materialReferenceImageDataUrls);
  appendReferenceImages(parts, 'Furniture reference image. Use only for furniture type, form, proportion, material, color, and style:', input.furnitureReferenceImageDataUrls);

  if (input.maskImageDataUrl) {
    parts.push({
      text: isObjectInsert
        ? buildObjectInsertMaskImageLabel(input.config)
        : input.maskMode === 'full-image'
        ? 'Full-image inpainting mask. The user explicitly wants the whole image eligible for repainting:'
        : 'Mask image for inpainting. If this model cannot use a mask directly, preserve unmasked areas as much as possible:',
    });
    parts.push({
      inlineData: toInlineData(input.maskImageDataUrl),
    });
  } else if (input.mode === 'inpaint') {
    warnings.push('未提供 maskImageDataUrl；Gemini 将尝试基于整张图和提示词进行编辑。');
  }

  return parts;
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
      `Generation config JSON: ${JSON.stringify(input.config)}`,
    ].join('\n');
  }

  if (input.qualityMode === 'draft' || input.qualityMode === 'fast') {
    return [
      input.prompt,
      'Keep the first image composition and canvas ratio. Return only the generated image.',
    ].filter(Boolean).join('\n');
  }

  if (input.mode === 'model-render' || input.mode === 'panorama-roam-render') {
    return [
      input.prompt,
      'Do not add text, watermarks, labels, borders, or UI elements.',
    ].filter(Boolean).join('\n');
  }

  if (input.mode === 'style-render') {
    return [
      'Generate a high-quality architectural, interior, or spatial rendering from the uploaded reference image.',
      'Preserve the subject, composition, spatial relationships, perspective, proportions, and main outlines from the reference image.',
      'Keep the exact same canvas aspect ratio, framing, composition boundary, and image proportions as the first input image. Do not crop, extend, pad, add borders, or change the canvas ratio.',
      'Transform materials, lighting, color palette, furniture, details, and atmosphere according to the selected style and user prompt.',
      'Return an image as the primary output. Do not add text, watermarks, labels, borders, or UI elements.',
      `User prompt: ${input.prompt}`,
      `Generation config JSON: ${JSON.stringify(input.config)}`,
    ].join('\n');
  }

  return [
    input.mode === 'floorplan'
      ? isFloorplanLayoutVariantInput(input)
        ? 'Convert the input image into a professional interior colored floor plan with clear, realistic, and clean material rendering. Strictly preserve the original architectural layout, room boundaries, walls, doors, windows, openings, columns, functional zoning, proportions, canvas ratio, and top-down plan representation. Same-type furniture may be arranged differently inside the original room boundaries when requested, but circulation and scale must remain reasonable. Do not generate a perspective rendering, elevation, 3D bird-eye view, or change the architectural layout.'
        : 'Convert the input image into a professional interior colored floor plan with clear, realistic, and clean material rendering. Strictly preserve the original layout, room boundaries, walls, doors, windows, openings, columns, furniture positions, furniture outlines, proportions, canvas ratio, and top-down plan representation. Do not generate a perspective rendering, elevation, 3D bird-eye view, or change the architectural layout.'
      : 'Edit or improve the uploaded architectural image according to the prompt.',
    'Keep the exact same canvas aspect ratio, framing, composition boundary, and image proportions as the first input image.',
    'Return an image as the primary output.',
    `User prompt: ${input.prompt}`,
    `Generation config JSON: ${JSON.stringify(input.config)}`,
    ...(input.mode === 'floorplan' ? [floorplanTextLanguageRequirement] : []),
  ].join('\n');
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
    'Prioritize harmonious interior design, functional reasonableness, visual balance, realistic floor contact, and normal usable scale consistent with existing furniture.',
    'Do not mechanically copy the reference image direction. If the reference angle is unsuitable for the original scene, rotate or reposition the object into a more natural orientation.',
    'Avoid placing the object alone in the middle of empty floor unless that is clearly the correct furniture relationship.',
    'Preserve the overall style and design order of the original image. Avoid damaging the existing room structure, camera framing, or unrelated furniture.',
  ];

  return [
    ...common,
    ...(placementMode === 'strict' ? strictPrompt : naturalPrompt),
    'Produce one natural photorealistic architectural rendering. Do not generate brand Logo, trademarks, watermarks, text, people, sensitive content, labels, borders, UI, collage, or split-screen comparison.',
    `Generation config JSON: ${JSON.stringify(input.config)}`,
  ].filter(Boolean).join('\n');
}

function buildObjectInsertPreviewFusionPrompt(input: GenerateImageInput): string {
  const userPrompt = readObjectInsertPreviewFusionUserPrompt(input.config, input.prompt);
  return [
    'Image 1 is the original scene.',
    'Image 2 is the clean placement preview. It shows the object type, approximate location, approximate size, and approximate orientation intended by the user.',
    '',
    'Insert the object into the original scene near the position indicated in Image 2.',
    'The overlay position is a soft anchor, not a rigid bounding box.',
    'Small local adjustments are allowed for realism, perspective, floor contact, circulation, and composition, but the object must stay in the same nearby area.',
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
    'Do not redesign the whole room. Do not move unrelated furniture. Do not add extra copies of the object. Do not create a collage or split-screen.',
    '',
    '中文补充：用户拖动图层所示的位置是主要参考位置。请将物体自然融合到该位置附近，允许为了真实感做小范围微调，但不要偏离过远，不要移动到画面其他区域。重点保证自然摆放、真实光影、统一透视和合理尺度。',
    'User extra instruction:',
    userPrompt,
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
  ].filter(Boolean).join('\n');
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
    .filter(item => item.length > 0);
  return fields.length > 0 ? fields.join(', ') : JSON.stringify(placement);
}

function readNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map(readPositiveNumber).filter((item): item is number => typeof item === 'number') : [];
}

function readPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function appendObjectInsertReferenceImages(
  parts: Part[],
  config: Record<string, unknown>,
  dataUrls: string[] | undefined,
  firstImageIndex: number,
): void {
  const labelsByImageIndex = buildObjectInsertImageLabels(config);
  (dataUrls || []).forEach((dataUrl, offset) => {
    const imageIndex = firstImageIndex + offset;
    parts.push({
      text: labelsByImageIndex.get(imageIndex) || buildObjectInsertGuideImageLabel(config),
    });
    parts.push({ inlineData: toInlineData(dataUrl) });
  });
}

function buildObjectInsertImageLabels(config: Record<string, unknown>): Map<number, string> {
  const labels = new Map<number, string>();
  const rawOrder = Array.isArray(config.objectInsertInputOrder) ? config.objectInsertInputOrder.filter(isRecord) : [];
  rawOrder.forEach((order, index) => {
    const objectNumber = typeof order.itemIndex === 'number' && Number.isFinite(order.itemIndex)
      ? Math.round(order.itemIndex) + 1
      : index + 1;
    for (const imageIndex of readNumberArray(order.referenceImageIndexes)) {
      labels.set(imageIndex, `Object ${objectNumber} reference image. Use only for this object's type, form, material, color, proportion, and design language:`);
    }
    const guideIndex = readPositiveNumber(order.placementGuideImageIndex);
    if (guideIndex) {
      labels.set(guideIndex, `Object ${objectNumber} placement guide image. ${buildObjectInsertGuideImageLabel(config)}`);
    }
    const maskIndex = readPositiveNumber(order.placementMaskImageIndex);
    if (maskIndex) {
      labels.set(maskIndex, `Object ${objectNumber} placement mask image. ${buildObjectInsertMaskImageLabel(config)}`);
    }
  });
  return labels;
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
    return `Input order: image 1 is ${sceneLabel}; image 2 is a furniture/object reference; the mask image indicates the local editing area. No placement guide is provided in this debug request.`;
  }
  if (mode === 'source_object_preview') {
    return `Input order: image 1 is ${sceneLabel}; image 2 is a furniture/object reference; image 3 is a placement guide with translucent object placement and outline. No mask is provided in this debug request.`;
  }
  if (mode === 'source_placement_preview') {
    return `Input order: image 1 is ${sceneLabel}; image 2 is a clean placement preview made from the original scene plus the user's dragged object layers. No object reference image, mask, editor border, or UI control is provided.`;
  }
  return `Input order: image 1 is ${sceneLabel}; image 2 is a furniture/object reference; image 3 is a placement guide with translucent object placement and outline; the mask image indicates the precise local editing area.`;
}

function readObjectInsertLocalEditPrompt(config: Record<string, unknown>): string {
  if (!readObjectInsertLocalEdit(config)) return '';
  return 'Local high-fidelity edit mode: image 1 is a crop around the placement region, expanded to include surrounding floor, adjacent furniture, walls, corners, light, shadows, and occlusion context. Edit only this crop region and preserve crop boundaries, unmasked areas, camera geometry, and scene structure so the system can seamlessly composite the edited crop back into the full original image.';
}

function readObjectInsertLocalEdit(config: Record<string, unknown>): boolean {
  return config.objectInsertLocalEdit === true;
}

function buildObjectInsertGuideImageLabel(config: Record<string, unknown>): string {
  return readObjectInsertPlacementMode(config) === 'strict'
    ? 'Placement guide image. Precise placement constraint: use for position, scale, direction, outline, and target area:'
    : 'Suggested placement area guide image. Soft placement constraint: use as an approximate target zone while optimizing natural position, direction, scale, and scene harmony:';
}

function buildObjectInsertMaskImageLabel(config: Record<string, unknown>): string {
  return readObjectInsertPlacementMode(config) === 'strict'
    ? 'Placement mask image. White indicates the precise local target area; preserve mask-outside areas as much as possible:'
    : 'Placement mask image. White indicates the editable local area around the suggested placement zone; preserve mask-outside areas as much as possible while allowing natural placement within the editable area:';
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
  ].filter(Boolean).join('\n');
}

function buildObjectInsertFusionQualityPrompt(config: Record<string, unknown>): string {
  return [
    'High-fidelity scene fusion requirements:',
    '- Generate a polished interior design visualization, not a simple object paste.',
    '- Use normal usable furniture scale; avoid tiny model-like objects.',
    '- Match the original camera perspective, horizon, floor plane, wall plane, lens feel, and existing furniture scale.',
    '- Create believable contact shadows, cast shadows, ambient occlusion, partial occlusion, and support/contact relationships.',
    '- Match the original light direction, softness, color temperature, material roughness, contrast, grain, and image sharpness.',
    '- If the reference object conflicts with the scene, preserve its core design language while moderately adapting color, material, finish, and proportion for harmony.',
    '- Preserve the original space structure and keep unedited regions stable.',
    `- Fusion preference detail: ${buildObjectInsertFusionPreferencePrompt(config)}`,
  ].join('\n');
}

function buildObjectInsertFusionPreferencePrompt(config: Record<string, unknown>): string {
  const preference = readObjectInsertFusionPreference(config);
  if (preference === 'conservative') {
    return 'conservative fusion, keep the original scene very stable while still fixing perspective, scale, contact shadows, and material integration.';
  }
  if (preference === 'design') {
    return 'strong design fusion, allow larger improvements to placement, scale, orientation, color, material, and grouping when needed for a convincing interior design result.';
  }
  return 'balanced fusion, keep the original scene stable while optimizing scale, functional relationship, style coordination, contact, shadow, and perspective.';
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

function appendReferenceImages(parts: Part[], label: string, dataUrls: string[] | undefined): void {
  for (const dataUrl of dataUrls || []) {
    parts.push({ text: label });
    parts.push({ inlineData: toInlineData(dataUrl) });
  }
}

function toInlineData(dataUrl: string): { mimeType: string; data: string } {
  const parts = parseDataUrl(dataUrl);
  return {
    mimeType: parts.mimeType,
    data: parts.base64Data,
  };
}

function parseDataUrl(dataUrl: string): DataUrlParts {
  const match = /^data:([^;,]+);base64,(.+)$/u.exec(dataUrl);
  if (!match) {
    throw new Error('图片 data URL 格式无效。');
  }

  return {
    mimeType: match[1],
    base64Data: match[2],
  };
}

function extractImageDataUrl(parts: Part[] | undefined): { dataUrl: string; mimeType: string } | null {
  const imagePart = parts?.find(part => part.inlineData?.data && part.inlineData.mimeType?.startsWith('image/'));
  if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) {
    return null;
  }

  return {
    dataUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
    mimeType: imagePart.inlineData.mimeType,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
