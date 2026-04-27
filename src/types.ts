export enum GenerationStep {
  FloorplanTo3D = 1, // 平面转三维
  LocalInpainting = 2, // 局部重绘
}

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
  inputImage: string | null;
  outputImage: string | null;
  isGenerating: boolean;
  viewMode: 'original' | 'after' | 'compare';
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
