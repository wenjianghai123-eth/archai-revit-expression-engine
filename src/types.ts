export enum GenerationStep {
  FloorplanTo3D = 1, // 平面转三维
  StyleRender = 2, // 风格渲染
  LocalInpainting = 3, // 局部重绘
}

export type GenerationProvider = 'mock' | 'gemini' | 'grsai-nano-banana';

export interface GenerationConfig {
  prompt: string;
  style: string;
  lighting: string;
  materialStrength: number;
  showStructureLines?: boolean;
  enhanceInterior?: boolean;
  addCharacters?: boolean;
  inpaintingStrength?: 'weak' | 'medium' | 'strong';
  keepOriginalMaterial?: boolean;
}

export interface StepState {
  config: GenerationConfig;
  inputImage: UploadedImage | null;
  materialImage: UploadedImage | null;
  maskImage: UploadedImage | null;
  useFullImageMask: boolean;
  outputImage: string | null;
  isGenerating: boolean;
  generationStatus: 'ready' | 'uploading' | 'generating' | 'success' | 'error';
  generationError: string | null;
  generationWarnings: string[];
  generationProvider: GenerationProvider | null;
  generationResultId: string | null;
  generationCreatedAt: string | null;
  viewMode: 'original' | 'after' | 'compare';
}

export interface UploadedImage {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface PromptTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  config: Partial<GenerationConfig>;
}

export interface GenerationHistoryItem {
  id: string;
  step: GenerationStep;
  prompt: string;
  style: string;
  createdAt: string;
  provider: GenerationProvider;
  outputImage: string;
  config?: GenerationConfig;
  inputImageName?: string;
  materialImageName?: string;
  maskImageName?: string;
  resultStored?: boolean;
  storageWarning?: string;
}

export interface AssetModel {
  id: string;
  name: string;
  thumbnail: string;
  type: string;
  vertices: string;
  size: string;
  date: string;
  tags?: string[];
  source?: 'sample' | 'local';
  modelUrl?: string;
  fileName?: string;
  fileType?: 'glb' | 'gltf' | 'obj' | 'unknown';
  previewable?: boolean;
  storageWarning?: string;
}

export interface MaterialAsset {
  id: string;
  name: string;
  thumbnail: string;
  category: string;
  date: string;
  description?: string;
  tags?: string[];
}

export interface FurnitureStyle {
  id: string;
  name: string;
  thumbnail: string;
  style: string;
  category: string;
  description?: string;
  tags?: string[];
}
