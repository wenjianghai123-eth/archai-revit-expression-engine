export enum GenerationStep {
  FloorplanTo3D = 1,
  StyleRender = 2,
  LocalInpainting = 3,
  ModelSnapshotRender = 4,
  DesignVariants = 5,
}

export type GenerationMode = 'floorplan' | 'style-render' | 'inpaint' | 'model-render' | 'design-variants';
export type GenerationProvider = 'mock' | 'gemini' | 'grsai-banana2' | 'grsai-nano-banana';
export type AsyncGenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type GenerationJobPhase = 'queued' | 'prepare-input' | 'provider-request' | 'postprocess' | 'save-result' | 'succeeded' | 'failed' | 'cancelled';
export type VariantGenerationStrategy = 'style-matrix' | 'same-style';
export type VariantStyleKey =
  | 'modern-minimal'
  | 'wabi-sabi'
  | 'cream-style'
  | 'light-luxury'
  | 'industrial'
  | 'commercial-showroom'
  | 'hotel-lobby'
  | 'office-space'
  | 'natural-wood'
  | 'premium-gray'
  | 'custom';

export interface GenerationJobDiagnostics {
  phase?: GenerationJobPhase;
  timing?: {
    jobCreatedAt?: string;
    jobStartedAt?: string;
    jobFinishedAt?: string;
    providerDurationMs?: number;
    totalDurationMs?: number;
  };
  provider?: {
    name?: string;
    model?: string;
    retryCount?: number;
    fallbackProvider?: string;
  };
  images?: {
    payloadBytesApprox?: number;
  };
}

export interface ModelSnapshotCamera {
  position?: number[];
  rotation?: number[];
  target?: number[];
  fov?: number;
}

export interface ModelSnapshotCapture {
  dataUrl: string;
  width: number;
  height: number;
  camera?: ModelSnapshotCamera;
  viewMode?: 'orbit' | 'walkthrough';
  clippingEnabled?: boolean;
  clippingHeight?: number;
  xrayEnabled?: boolean;
  edgesEnabled?: boolean;
}

export interface ModelSnapshotMetadata {
  sourceType: 'model-snapshot';
  sourceModelAssetId: string;
  width: number;
  height: number;
  camera?: ModelSnapshotCamera;
  viewMode?: 'orbit' | 'walkthrough';
  clippingEnabled?: boolean;
  clippingHeight?: number;
  xrayEnabled?: boolean;
  edgesEnabled?: boolean;
  createdAt: string;
}

export interface GenerationConfig {
  prompt: string;
  style?: string;
  lighting: string;
  materialStrength: number;
  editTarget?: 'general' | 'material' | 'furniture';
  sourceImageWidth?: number;
  sourceImageHeight?: number;
  targetWidth?: number;
  targetHeight?: number;
  targetAspectRatio?: string;
  materialTextureAssetIds?: string[];
  materialTextureSources?: unknown[];
  furnitureReferenceAssetIds?: string[];
  furnitureReferenceSources?: unknown[];
  showStructureLines?: boolean;
  enhanceInterior?: boolean;
  addCharacters?: boolean;
  inpaintingStrength?: 'weak' | 'medium' | 'strong';
  strength?: 'weak' | 'medium' | 'strong' | 'subtle' | 'balanced';
  keepOriginalMaterial?: boolean;
  preserveStructure?: boolean;
  preserveCamera?: boolean;
  feather?: number;
  batchCount?: 1 | 2 | 4;
  variantStrategy?: VariantGenerationStrategy;
  variantStyles?: VariantStyleKey[];
  customStyleLabel?: string;
  maskMode?: 'asset-mask' | 'full-image';
  maskAssetId?: string;
  buildingType?: string;
  spaceType?: string;
  renderStyle?: string;
  atmosphere?: string;
  customPrompt?: string;
  preserveGeometry?: boolean;
  sourceModelAssetId?: string;
  sourceImageAssetId?: string;
  snapshotAssetId?: string;
  modelSnapshotMetadata?: ModelSnapshotMetadata;
}

export interface GenerationResultOption {
  id: string;
  imageUrl: string;
  assetId?: string;
  isSelected: boolean;
  isFavorite: boolean;
  createdAt?: string;
  metadata?: Record<string, unknown>;
  variantIndex?: number;
  variantLabel?: string;
  variantStyle?: VariantStyleKey;
  variantStyleLabel?: string;
}

export interface StepState {
  config: GenerationConfig;
  inputImage: UploadedImage | null;
  materialImage: UploadedImage | null;
  materialTextures: MaterialTexture[];
  furnitureReferences: ReferenceImage[];
  maskImage: UploadedImage | null;
  useFullImageMask: boolean;
  outputImage: string | null;
  generationResults: GenerationResultOption[];
  selectedGenerationResultId: string | null;
  isGenerating: boolean;
  generationStatus: 'ready' | 'uploading' | 'generating' | 'success' | 'error';
  generationError: string | null;
  generationWarnings: string[];
  generationProvider: GenerationProvider | null;
  generationResultId: string | null;
  generationCreatedAt: string | null;
  generationJobId: string | null;
  generationJobStatus: AsyncGenerationStatus | null;
  generationJobDiagnostics: GenerationJobDiagnostics | null;
  generationProgress: number;
  generationLogs: string[];
  viewMode: 'original' | 'after' | 'compare' | 'overlay';
  selectedModelAsset?: AssetModel | null;
  modelSnapshot?: UploadedImage | null;
  modelSnapshotMetadata?: ModelSnapshotMetadata | null;
}

export interface UploadedImage {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  url?: string;
  assetId?: string;
  width?: number;
  height?: number;
}

export interface MaterialTexture {
  id: string;
  name?: string;
  url: string;
  dataUrl?: string;
  assetId?: string;
  source: 'upload' | 'library';
}

export interface ReferenceImage {
  id: string;
  name?: string;
  url: string;
  dataUrl?: string;
  assetId?: string;
  source: 'upload' | 'library';
}

export interface PromptTemplate {
  id: string;
  title: string;
  category: string;
  feature: 'floorplan' | 'style-render' | 'inpaint' | 'model-render' | 'design-variants';
  supportedModes?: GenerationStep[] | string[];
  description: string;
  previewImage: string;
  prompt?: string;
  promptText: string;
  tags?: string[];
  variables?: {
    key: string;
    label: string;
    defaultValue?: string;
    placeholder?: string;
  }[];
  recommendedStyle?: string;
  recommendedLighting?: string;
  recommendedMaterialStrength?: number;
  useCase?: string;
  suitableImages?: string[];
  config: Partial<GenerationConfig>;
}

export interface GenerationHistoryItem {
  id: string;
  projectId?: string | null;
  step: GenerationStep;
  prompt: string;
  style: string;
  createdAt: string;
  provider: GenerationProvider;
  outputImage: string;
  inputImageUrl?: string;
  inputImageDataPreview?: string;
  inputImageAssetId?: string;
  config?: GenerationConfig;
  inputImageName?: string;
  materialImageName?: string;
  maskImageName?: string;
  editTarget?: GenerationConfig['editTarget'];
  furnitureReferences?: ReferenceImage[];
  generationResults?: GenerationResultOption[];
  sourceModelAssetId?: string;
  snapshotAssetId?: string;
  modelSnapshotMetadata?: ModelSnapshotMetadata;
  resultStored?: boolean;
  storageWarning?: string;
}

export interface AssetModel {
  id: string;
  name: string;
  fileName: string;
  fileType: 'glb' | 'gltf' | 'obj' | 'dae' | 'stl' | 'unknown';
  format?: 'glb' | 'gltf' | 'obj' | 'dae' | 'stl';
  modelUrl?: string;
  thumbnail: string;
  size: string;
  date: string;
  source: 'generated' | 'uploaded' | 'sample';
  sourceImageName?: string;
  sourceImageDataUrl?: string;
  prompt?: string;
  provider?: string;
  status?: 'ready' | 'generating' | 'failed' | 'optimizing';
  qualityStatus?: 'usable' | 'warning' | 'error' | 'unknown';
  vertices?: string;
  triangles?: string;
  materials?: string;
  textures?: string;
  tags?: string[];
  category?: string;
  storageWarning?: string;
  type?: string;
  previewable?: boolean;
}

export interface MaterialAsset {
  id: string;
  name: string;
  thumbnail: string;
  category: string;
  date: string;
  description?: string;
  tags?: string[];
  source?: 'local-import' | string;
  originalFileName?: string;
  originalPath?: string;
  importedAt?: string;
  hash?: string;
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
