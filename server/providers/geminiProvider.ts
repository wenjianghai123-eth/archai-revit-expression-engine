import crypto from 'node:crypto';
import { GoogleGenAI, Modality, type Part } from '@google/genai';
import { GenerateImageInput, GenerateImageOutput, ImageGenerationProvider } from './types';

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
        : 'Reference material image:',
    });
    parts.push({
      inlineData: toInlineData(input.materialImageDataUrl),
    });
  }

  appendReferenceImages(parts, isObjectInsert ? 'Placement guide image. Use only for position, scale, and direction:' : 'Additional reference image:', input.referenceImageDataUrls);
  appendReferenceImages(parts, 'Material reference image. Use only for material, color, texture, and surface quality:', input.materialReferenceImageDataUrls);
  appendReferenceImages(parts, 'Furniture reference image. Use only for furniture type, form, proportion, material, color, and style:', input.furnitureReferenceImageDataUrls);

  if (input.maskImageDataUrl) {
    parts.push({
      text: isObjectInsert
        ? 'Placement mask image. White indicates the local target area; preserve unmarked areas as much as possible:'
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
    return [
      input.prompt,
      buildObjectInsertProviderInputPrompt(input),
      'Use the second image only for general form, material, color, and proportion guidance when it is provided.',
      'Use the placement guide or mask only for location, scale, direction, and local target area when provided.',
      'Generate a similar unbranded furniture/object in the designated area of the first interior/architectural scene.',
      'Match perspective, scale, lighting, shadows, materials, occlusion, depth, and scene atmosphere. Keep unrelated areas unchanged.',
      'Produce one natural photorealistic architectural rendering. Do not generate brand Logo, trademarks, watermarks, text, people, sensitive content, labels, borders, UI, collage, or split-screen comparison.',
      `Generation config JSON: ${JSON.stringify(input.config)}`,
    ].filter(Boolean).join('\n');
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
      ? 'Convert the input image into a professional interior colored floor plan with clear, realistic, and clean material rendering. Strictly preserve the original layout, room boundaries, walls, doors, windows, openings, columns, furniture positions, furniture outlines, proportions, canvas ratio, and top-down plan representation. Do not generate a perspective rendering, elevation, 3D bird-eye view, or change the architectural layout.'
      : 'Edit or improve the uploaded architectural image according to the prompt.',
    'Keep the exact same canvas aspect ratio, framing, composition boundary, and image proportions as the first input image.',
    'Return an image as the primary output.',
    `User prompt: ${input.prompt}`,
    `Generation config JSON: ${JSON.stringify(input.config)}`,
  ].join('\n');
}

function isObjectInsertInput(input: GenerateImageInput): boolean {
  return input.step === 'object_insert'
    || input.config.step === 'object_insert'
    || isRecord(input.config.objectInsert);
}

function buildObjectInsertProviderInputPrompt(input: GenerateImageInput): string {
  const mode = readObjectInsertDebugMode(input.config);
  if (mode === 'source_prompt') {
    return 'Input order: image 1 is the original interior/architectural scene. This debug request sends only the source image and prompt.';
  }
  if (mode === 'source_object') {
    return 'Input order: image 1 is the original interior/architectural scene; image 2 is a furniture/object reference. No placement guide or mask is provided in this debug request.';
  }
  if (mode === 'source_object_mask') {
    return 'Input order: image 1 is the original interior/architectural scene; image 2 is a furniture/object reference; the mask image indicates the local editing area. No placement guide is provided in this debug request.';
  }
  if (mode === 'source_object_preview') {
    return 'Input order: image 1 is the original interior/architectural scene; image 2 is a furniture/object reference; image 3 is a placement guide. No mask is provided in this debug request.';
  }
  return 'Input order: image 1 is the original interior/architectural scene; image 2 is a furniture/object reference; image 3 is a placement guide; the mask image indicates the local editing area.';
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
