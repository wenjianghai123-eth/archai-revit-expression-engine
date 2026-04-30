export type GenerationMode = 'floorplan' | 'style-render' | 'inpaint';
export type ProviderName = 'mock' | 'gemini' | 'grsai-nano-banana';

export interface GenerateImageInput {
  mode: GenerationMode;
  inputImageDataUrl: string;
  materialImageDataUrl?: string;
  maskImageDataUrl?: string;
  prompt: string;
  config: Record<string, unknown>;
}

export interface GenerateImageOutput {
  id: string;
  provider: ProviderName;
  imageDataUrl: string;
  createdAt: string;
  warnings: string[];
}

export interface ImageGenerationProvider {
  name: ProviderName;
  generateImage(input: GenerateImageInput): Promise<GenerateImageOutput>;
}
