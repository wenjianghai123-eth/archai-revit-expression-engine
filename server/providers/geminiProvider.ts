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
        imageDataUrl: image,
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

  if (input.maskImageDataUrl) {
    parts.push({
      text: 'Mask image for inpainting. If this model cannot use a mask directly, preserve unmasked areas as much as possible:',
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
  return [
    input.mode === 'floorplan'
      ? 'Generate an architectural visual expression from the uploaded floorplan image.'
      : 'Edit or improve the uploaded architectural image according to the prompt.',
    'Return an image as the primary output.',
    `User prompt: ${input.prompt}`,
    `Generation config JSON: ${JSON.stringify(input.config)}`,
  ].join('\n');
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

function extractImageDataUrl(parts: Part[] | undefined): string | null {
  const imagePart = parts?.find(part => part.inlineData?.data && part.inlineData.mimeType?.startsWith('image/'));
  if (!imagePart?.inlineData?.data || !imagePart.inlineData.mimeType) {
    return null;
  }

  return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
}
