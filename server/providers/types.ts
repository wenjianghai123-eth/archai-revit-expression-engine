export type GenerationMode = 'floorplan' | 'style-render' | 'inpaint' | 'model-render' | 'design-variants' | 'material-replace' | 'plan-colorize' | 'panorama-roam-render';
export type GenerationJobStep =
  | 'floorplan_to_3d'
  | 'style_render'
  | 'local_inpainting'
  | 'model_snapshot_render'
  | 'design_variants'
  | 'material_replace'
  | 'plan_colorize'
  | 'panorama_quick_render'
  | 'object_insert'
  | 'free_reference_image';
export type ProviderName = 'mock' | 'gemini' | 'grsai-banana2' | 'grsai-nano-banana';
export type MaskMode = 'asset-mask' | 'full-image';
export type QualityMode = 'draft' | 'fast' | 'balanced' | 'high';

export interface GenerateImageInput {
  mode: GenerationMode;
  step?: GenerationJobStep | string | null;
  inputImageDataUrl: string;
  materialImageDataUrl?: string;
  referenceImageDataUrls?: string[];
  materialReferenceImageDataUrls?: string[];
  furnitureReferenceImageDataUrls?: string[];
  maskImageDataUrl?: string;
  maskMode?: MaskMode;
  prompt: string;
  config: Record<string, unknown>;
  targetWidth?: number;
  targetHeight?: number;
  targetAspectRatio?: string;
  editTarget?: 'general' | 'material' | 'furniture';
  qualityMode?: QualityMode;
}

export interface GenerateImageOutput {
  id: string;
  provider: ProviderName;
  dataUrl: string;
  remoteUrl?: string;
  mimeType?: string;
  // TODO: Let storage upload this binary payload directly to avoid remote URL -> data URL -> Buffer churn.
  binary?: {
    content: Uint8Array;
    mimeType: string;
  };
  metadata?: Record<string, unknown>;
  createdAt: string;
  warnings: string[];
}

export interface ImageGenerationProvider {
  name: ProviderName;
  generateImage(input: GenerateImageInput): Promise<GenerateImageOutput>;
}
