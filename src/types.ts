export enum GenerationStep {
  FloorplanTo3D = 1,
  StyleRender = 2,
  LocalInpainting = 3,
  ModelSnapshotRender = 4,
  DesignVariants = 5,
  MaterialReplace = 6,
  PlanColorize = 7,
  PanoramaQuickRender = 8,
  ObjectInsert = 9,
}

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
  | 'object_insert';
export type GenerationProvider = 'mock' | 'gemini' | 'grsai-banana2' | 'grsai-nano-banana';
export type AsyncGenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timeout';
export type GenerationJobPhase = 'queued' | 'prepare-input' | 'provider-request' | 'postprocess' | 'save-result' | 'succeeded' | 'failed' | 'cancelled' | 'timeout';
export type QualityMode = 'draft' | 'fast' | 'balanced' | 'high';
export type VariantGenerationStrategy = 'style-matrix' | 'same-style';
export type DesignVariantBatchCount = 2 | 4 | 8;
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
export type MaterialReplaceStrength = 'subtle' | 'balanced' | 'strong';
export type SecondaryEditAction = 'regenerate' | 'similar' | 'realism' | 'lighting' | 'style' | 'continue-edit';
export type ObjectInsertDebugMode = 'full' | 'source_prompt' | 'source_object' | 'source_object_mask' | 'source_object_preview';
export type PlanDrawingType = 'residential' | 'commercial' | 'office' | 'hotel' | 'landscape' | 'site-plan' | 'custom';
export type PlanExpressionTemplate = 'zoning-color' | 'colored-plan' | 'landscape-plan' | 'furniture-enhance' | 'annotation-plan' | 'circulation-analysis';
export type MaterialReplaceEditMode = 'smart-type' | 'mask';
export type MaterialReplaceTargetObject =
  | 'floor'
  | 'wall'
  | 'ceiling'
  | 'cabinet'
  | 'sofa'
  | 'table-chair'
  | 'lighting'
  | 'plant'
  | 'door-window'
  | 'feature-wall'
  | 'other';
export type MaterialReplaceTargetMaterial =
  | 'light-wood'
  | 'dark-wood'
  | 'walnut'
  | 'microcement'
  | 'rock-slab'
  | 'marble'
  | 'terrazzo'
  | 'tile'
  | 'leather'
  | 'fabric'
  | 'metal'
  | 'glass'
  | 'art-paint'
  | 'linear-light'
  | 'warm-light-strip'
  | 'plant'
  | 'custom';

export interface GenerationJobDiagnostics {
  phase?: GenerationJobPhase;
  timing?: {
    jobCreatedAt?: string;
    jobStartedAt?: string;
    jobFinishedAt?: string;
    providerMs?: number;
    providerDurationMs?: number;
    totalDurationMs?: number;
  };
  provider?: {
    name?: string;
    model?: string;
    httpStatus?: number;
    statusCode?: number;
    retryCount?: number;
    fallbackProvider?: string;
    fallbackReason?: string;
    providerError?: string;
    providerStatus?: string;
    userMessage?: string;
    rawSnippet?: string;
    providerMs?: number;
    providerModel?: string;
  };
  images?: {
    qualityMode?: QualityMode;
    inputImages?: number;
    referenceImages?: number;
    inputBytesBefore?: number;
    inputBytesAfter?: number;
    referenceBytesBefore?: number;
    referenceBytesAfter?: number;
    payloadBytesApprox?: number;
    inputWidthBefore?: number;
    inputHeightBefore?: number;
    inputWidthAfter?: number;
    inputHeightAfter?: number;
    referenceCount?: number;
  };
}

export interface ModelSnapshotCamera {
  position?: number[];
  rotation?: number[];
  quaternion?: number[];
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

export interface PanoramaImageCapture {
  dataUrl: string;
  width: number;
  height: number;
  camera: ModelSnapshotCamera;
  fov?: number;
  viewMode?: 'orbit' | 'walkthrough';
}

export interface PanoramaCapturePayload {
  captureType: 'panorama-viewpoint';
  sourceModelAssetId: string;
  sourceModelUrl?: string;
  modelFileType?: 'glb' | 'gltf';
  camera: ModelSnapshotCamera;
  fov?: number;
  viewMode?: 'orbit' | 'walkthrough';
  panoramaQuality?: 'standard' | 'high';
  capturedAt: string;
}

export interface PanoramaRecord {
  id: string;
  projectId?: string | null;
  modelUrl: string;
  cameraState: ModelSnapshotCamera;
  panoramaUrl: string;
  renderedPanoramaUrl?: string;
  thumbnailUrl?: string;
  shareId: string;
  createdAt: string;
}

export interface ModelSnapshotMetadata {
  sourceType: 'model-snapshot';
  inputSource?: 'model-capture' | 'uploaded-snapshot';
  sourceModelAssetId?: string;
  snapshotAssetId?: string;
  modelPreviewUrl?: string;
  usedOptimizedModel?: boolean;
  optimizationStatus?: ModelOptimizationMetadata['optimizationStatus'];
  width?: number;
  height?: number;
  camera?: ModelSnapshotCamera;
  viewMode?: 'orbit' | 'walkthrough';
  clippingEnabled?: boolean;
  clippingHeight?: number;
  xrayEnabled?: boolean;
  edgesEnabled?: boolean;
  createdAt: string;
}

export interface ModelOptimizationMetadata {
  originalUrl: string;
  convertedUrl?: string;
  convertedFormat?: 'glb' | 'gltf';
  conversionStatus?: 'idle' | 'converting' | 'succeeded' | 'failed';
  conversionError?: string | null;
  convertedAt?: string;
  previewUrl?: string;
  optimizedUrl?: string;
  thumbnailUrl?: string;
  format: 'glb' | 'gltf' | 'obj' | 'dae' | 'stl' | 'zip';
  archiveMainModelPath?: string;
  archiveMainModelFileType?: 'glb' | 'gltf' | 'dae' | 'obj';
  archiveModelFileCount?: number;
  archiveSelectionWarning?: string;
  conversionWarning?: string | null;
  missingImageCount?: number;
  originalFileSize: number;
  optimizedFileSize?: number;
  optimizationStatus: 'pending' | 'processing' | 'succeeded' | 'failed' | 'skipped';
  optimizationError?: string;
  faceCount?: number;
  optimizedFaceCount?: number;
  createdAt?: string;
  completedAt?: string;
}

export interface GenerationConfig {
  prompt: string;
  step?: GenerationJobStep;
  style?: string;
  lighting: string;
  materialStrength: number;
  editTarget?: 'general' | 'material' | 'furniture';
  qualityMode?: QualityMode;
  sourceImageWidth?: number;
  sourceImageHeight?: number;
  targetWidth?: number;
  targetHeight?: number;
  targetAspectRatio?: string;
  materialTextureAssetIds?: string[];
  materialReferenceAssetIds?: string[];
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
  batchCount?: 1 | DesignVariantBatchCount;
  variantStrategy?: VariantGenerationStrategy;
  stylePackId?: string;
  variantStyles?: VariantStyleKey[];
  variantNames?: string[];
  customStyleLabel?: string;
  maskMode?: 'asset-mask' | 'full-image';
  maskAssetId?: string;
  editMode?: MaterialReplaceEditMode;
  buildingType?: string;
  spaceType?: string;
  renderStyle?: string;
  smartMaterial?: string;
  atmosphere?: string;
  changeStrength?: 'weak' | 'medium' | 'strong';
  panoramaChangeStrength?: 'weak' | 'medium' | 'strong';
  panoramaQuality?: 'standard' | 'high';
  customPrompt?: string;
  targetObjectType?: MaterialReplaceTargetObject;
  targetMaterial?: MaterialReplaceTargetMaterial;
  customMaterialPrompt?: string;
  preserveLighting?: boolean;
  preserveGeometry?: boolean;
  sourceModelAssetId?: string;
  sourceImageAssetId?: string;
  snapshotAssetId?: string;
  panoramaAssetId?: string;
  panoramaSourceAssetId?: string;
  panoramaReferenceAssetIds?: string[];
  panoramaReferenceTypes?: Array<'revit_screenshot' | 'floor_plan' | 'material_reference' | 'style_reference' | 'render_reference'>;
  panoramaReferenceMode?: 'reference_guided';
  panoramaReferenceStrength?: 'low' | 'medium' | 'high';
  objectReferenceAssetId?: string;
  placementPreviewAssetId?: string;
  placementMaskAssetId?: string;
  objectPlacement?: ObjectPlacement;
  objectInsert?: ObjectInsertConfig;
  objectInsertDebugMode?: ObjectInsertDebugMode;
  objectInsertExtraPrompt?: string;
  inputSource?: 'model-capture' | 'uploaded-snapshot';
  modelSnapshotMetadata?: ModelSnapshotMetadata;
  panoramaCapture?: PanoramaCapturePayload;
  drawingType?: PlanDrawingType;
  template?: PlanExpressionTemplate;
  enableZoningColor?: boolean;
  enableRoomLabels?: boolean;
  enableFurnitureEnhance?: boolean;
  enableCirculationArrows?: boolean;
  enableScaleEnhance?: boolean;
  enableLandscapeFill?: boolean;
  preserveLinework?: boolean;
  manualRoomLabels?: string[];
  parentResultId?: string | null;
  parentJobId?: string | null;
  parentRecordId?: string | null;
  secondaryEditAction?: SecondaryEditAction;
}

export interface ObjectPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface ObjectInsertConfig {
  sourceImageAssetId?: string;
  objectReferenceAssetId?: string;
  previewAssetId?: string;
  maskAssetId?: string;
  placement: ObjectPlacement;
  extraPrompt?: string;
  debugMode?: ObjectInsertDebugMode;
}

export interface GenerationResultOption {
  id: string;
  imageUrl: string;
  assetId?: string;
  jobId?: string;
  parentResultId?: string;
  isSelected: boolean;
  isFavorite: boolean;
  createdAt?: string;
  metadata?: Record<string, unknown>;
  variantIndex?: number;
  variantCode?: string;
  variantName?: string;
  variantLabel?: string;
  variantStyle?: VariantStyleKey;
  variantStyleLabel?: string;
  stylePackId?: string;
}

export interface ContinuationSource {
  parentResultId: string;
  parentJobId?: string | null;
  parentRecordId?: string | null;
  imageUrl: string;
  assetId?: string;
  label: string;
  action: SecondaryEditAction;
  createdAt: string;
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
  continuationSource?: ContinuationSource | null;
  selectedModelAsset?: AssetModel | null;
  modelSnapshot?: UploadedImage | null;
  modelSnapshotMetadata?: ModelSnapshotMetadata | null;
}

export interface GenerationRunStateOverride {
  config?: GenerationConfig;
  inputImage?: UploadedImage | null;
  materialImage?: UploadedImage | null;
  maskImage?: UploadedImage | null;
  useFullImageMask?: boolean;
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
  feature: 'floorplan' | 'style-render' | 'inpaint' | 'model-render' | 'design-variants' | 'material-replace' | 'plan-colorize' | 'panorama-roam-render' | 'object-insert';
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
  parentResultId?: string | null;
  parentJobId?: string | null;
  parentRecordId?: string | null;
  secondaryEditAction?: SecondaryEditAction;
  resultStored?: boolean;
  storageWarning?: string;
  panoramaRecord?: PanoramaRecord;
}

export interface AssetModel {
  id: string;
  name: string;
  fileName: string;
  fileType: 'glb' | 'gltf' | 'obj' | 'dae' | 'stl' | 'zip' | 'unknown';
  format?: 'glb' | 'gltf' | 'obj' | 'dae' | 'stl' | 'zip';
  modelUrl?: string;
  originalUrl?: string;
  convertedUrl?: string;
  convertedFormat?: 'glb' | 'gltf';
  conversionStatus?: 'idle' | 'converting' | 'succeeded' | 'failed';
  conversionError?: string | null;
  convertedAt?: string;
  previewUrl?: string;
  optimizedUrl?: string;
  thumbnailUrl?: string;
  metadata?: ModelOptimizationMetadata;
  optimizationStatus?: ModelOptimizationMetadata['optimizationStatus'];
  optimizationError?: string;
  originalFileSize?: number;
  optimizedFileSize?: number;
  usesOptimizedPreview?: boolean;
  allowOriginalModelLoad?: boolean;
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
