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
        throw new Error(`Gemini 模型 ${model} 未返回图片结果，已回退到 mock provider。`);
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

function buildRequestParts(input: GenerateImageInput, warnings: string[]): Part[] {
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
      text: 'Reference material image:',
    });
    parts.push({
      inlineData: toInlineData(input.materialImageDataUrl),
    });
  }

  appendReferenceImages(parts, 'Additional reference image:', input.referenceImageDataUrls);
  appendReferenceImages(parts, 'Material reference image. Use only for material, color, texture, and surface quality:', input.materialReferenceImageDataUrls);
  appendReferenceImages(parts, 'Furniture reference image. Use only for furniture type, form, proportion, material, color, and style:', input.furnitureReferenceImageDataUrls);

  if (input.maskImageDataUrl) {
    parts.push({
      text: input.maskMode === 'full-image'
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
  if (input.mode === 'model-render') {
    return [
      'Generate a high-quality realistic architectural or interior rendering from the uploaded 3D clay/white model viewport snapshot.',
      'Preserve the original geometry, massing, layout, spatial proportions, camera angle, perspective, composition, framing, and canvas aspect ratio.',
      'Add appropriate materials, lighting, shadows, environment, furniture, landscape, and atmosphere according to the user prompt.',
      'Do not alter the fundamental structure unless explicitly requested. Do not add text, watermarks, labels, borders, or UI elements.',
      `User prompt: ${input.prompt}`,
      `Generation config JSON: ${JSON.stringify(input.config)}`,
    ].join('\n');
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
