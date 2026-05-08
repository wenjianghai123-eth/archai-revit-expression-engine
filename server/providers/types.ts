export type GenerationMode = 'floorplan' | 'style-render' | 'inpaint';
export type ProviderName = 'mock' | 'gemini' | 'grsai-banana2' | 'grsai-nano-banana';
export type MaskMode = 'asset-mask' | 'full-image';

export interface GenerateImageInput {
  mode: GenerationMode;
  inputImageDataUrl: string;
  materialImageDataUrl?: string;
  referenceImageDataUrls?: string[];
  maskImageDataUrl?: string;
  maskMode?: MaskMode;
  prompt: string;
  config: Record<string, unknown>;
}

export interface GenerateImageOutput {
  id: string;
  provider: ProviderName;
  dataUrl: string;
  remoteUrl?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  warnings: string[];
}

export interface ImageGenerationProvider {
  name: ProviderName;
  generateImage(input: GenerateImageInput): Promise<GenerateImageOutput>;
}
