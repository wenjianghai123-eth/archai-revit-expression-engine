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
  FreeReferenceImage = 10,
  ImagePolish = 11,
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
  | 'object_insert'
  | 'free_reference_image'
  | 'image_polish';
export type GenerationProvider = 'mock' | 'gemini' | 'grsai-banana2' | 'grsai-nano-banana' | 'apiyi-nano-banana2-edit';
export type SelectableImageProvider = 'grsai-banana2' | 'apiyi-nano-banana2-edit';
export type AsyncGenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timeout';
export type GenerationJobPhase = 'queued' | 'prepare-input' | 'provider-request' | 'postprocess' | 'save-result' | 'succeeded' | 'failed' | 'cancelled' | 'timeout';
export type QualityMode = 'draft' | 'fast' | 'balanced' | 'high';
export type VariantGenerationStrategy = 'style-matrix' | 'same-style';
export type VariantChangeScope = 'material-only' | 'soft-decoration' | 'lighting' | 'furniture-layout' | 'color-palette' | 'full-design';
export type VariantLock = 'structure' | 'camera' | 'walls-openings' | 'fixed-furniture' | 'floor-material' | 'ceiling' | 'main-color';
export type DesignVariantBatchCount = 2 | 4 | 8;
export type PlanColorizeBatchCount = 1 | 2 | 3 | 4 | 5 | 6;
export type FloorplanMultiPlanBatchCount = 2 | 4 | 6;
export type FloorplanMultiPlanMode = 'single' | 'multi';
export type FloorplanVariantType = 'material_style' | 'furniture_layout' | 'mixed';
export type FloorplanVariantFocus = 'material_style' | 'furniture_layout' | 'both';
export type FloorplanRenderMode = 'flat-color' | 'semi-3d' | 'presentation';
export type LineworkPreservation = 'strict' | 'high' | 'medium';
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
export type MaterialPatternScale = 'small' | 'medium' | 'large';
export type MaterialDirection = 'auto' | 'horizontal' | 'vertical' | 'diagonal' | 'herringbone';
export type MaterialFinish = 'matte' | 'satin' | 'glossy' | 'rough';
export type MaterialReplaceScope = 'material-only' | 'material-and-soft-decor' | 'creative';
export type SecondaryEditAction =
  | 'regenerate'
  | 'similar'
  | 'realism'
  | 'lighting'
  | 'style'
  | 'continue-edit'
  | 'material-clean-boundary'
  | 'material-smaller-texture'
  | 'material-larger-texture'
  | 'material-less-reflection'
  | 'material-keep-lighting'
  | 'material-selected-area-only';
export type ResultSendTargetStep =
  | GenerationStep.MaterialReplace
  | GenerationStep.ObjectInsert
  | GenerationStep.DesignVariants
  | GenerationStep.FreeReferenceImage;
export type ContinuationAction = SecondaryEditAction | `send-to-${ResultSendTargetStep}`;
export type FreeReferenceRole = 'style' | 'material' | 'furniture' | 'lighting' | 'composition' | 'color' | 'detail';
export type FreeReferenceStrength = 'low' | 'medium' | 'high';
export type ObjectInsertDebugMode = 'full' | 'source_prompt' | 'source_object' | 'source_object_mask' | 'source_object_preview' | 'source_placement_preview';
export type ObjectInsertPositionConstraintStrength = 'low' | 'medium' | 'high';
export type ObjectInsertPlacementMode = 'strict' | 'natural';
export type ObjectInsertPlacementConstraintMode = 'soft-anchor' | 'strict' | 'natural';
export type ObjectInsertHarmonyPriority = 'layout' | 'style' | 'balance';
export type ObjectInsertFusionPreference = 'conservative' | 'balanced' | 'design';
export type ObjectInsertSurface = 'floor' | 'wall' | 'ceiling' | 'tabletop' | 'outdoor-ground' | 'auto';
export type ObjectInsertType = 'sofa' | 'chair' | 'table' | 'lamp' | 'plant' | 'artwork' | 'sculpture' | 'car' | 'person' | 'tree' | 'signage' | 'custom';
export type ObjectFidelity = 'strict' | 'balanced' | 'loose';
export type ObjectInsertUIMode = 'simple' | 'advanced';
export type ObjectInsertCandidateStrategy = 'strict-placement' | 'natural-fit' | 'object-fidelity' | 'scene-harmony';
export type FloorplanRoomType = 'living-room' | 'dining-room' | 'bedroom' | 'kitchen' | 'bathroom' | 'balcony' | 'entry' | 'study' | 'office' | 'commercial' | 'custom';
export type FloorplanTemplateId = 'residential-warm-wood' | 'premium-light-luxury' | 'commercial-presentation' | 'office-space' | 'landscape-masterplan' | 'minimal-grayscale';
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

export interface FreeReferenceReference {
  assetId: string;
  role: FreeReferenceRole;
  strength: FreeReferenceStrength;
}

export interface FloorplanRoomLabel {
  id: string;
  name: string;
  roomType: FloorplanRoomType;
  positionDescription: string;
  customTypeLabel?: string;
}

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
    localInpaintEnabled?: boolean;
    localEditMode?: 'masked_crop' | 'object_insert_crop';
    localCropScale?: number;
    originalWidth?: number;
    originalHeight?: number;
    maskWidth?: number;
    maskHeight?: number;
    furnitureReferenceCount?: number;
    maskBbox?: { x: number; y: number; width: number; height: number };
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
  aiProvider?: SelectableImageProvider;
  apiyiAspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '5:4' | '4:5' | '3:2' | '2:3' | '21:9';
  apiyiImageSize?: '512' | '1K' | '2K' | '4K';
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
  aspectRatio?: string;
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
  preserveColor?: boolean;
  preserveMaterialAppearance?: boolean;
  keepOriginalAspectRatio?: boolean;
  enhanceMaterials?: boolean;
  negativePrompt?: string;
  styleStrength?: 'low' | 'medium' | 'high';
  targetCount?: number;
  feather?: number;
  batchCount?: PlanColorizeBatchCount | DesignVariantBatchCount | FloorplanMultiPlanBatchCount;
  floorplanOutputMode?: FloorplanMultiPlanMode;
  floorplanVariantType?: FloorplanVariantType;
  floorplanVariantFocus?: FloorplanVariantFocus;
  floorplanRenderMode?: FloorplanRenderMode;
  lineworkPreservation?: LineworkPreservation;
  enableLegend?: boolean;
  enableAreaText?: boolean;
  enableMaterialLegend?: boolean;
  floorplanRoomLabels?: FloorplanRoomLabel[];
  floorplanTemplateId?: FloorplanTemplateId;
  floorplanStyleTemplateIds?: string[];
  floorplanStyleTemplateNames?: string[];
  floorplanLayoutVariantIds?: string[];
  floorplanLayoutVariantNames?: string[];
  variantStrategy?: VariantGenerationStrategy;
  stylePackId?: string;
  variantStyles?: VariantStyleKey[];
  variantNames?: string[];
  variantChangeScope?: VariantChangeScope;
  variantLocks?: VariantLock[];
  variantStrategyNotes?: string[];
  retryVariantIndex?: number;
  targetVariantIndex?: number;
  customStyleLabel?: string;
  planColorizeBatchEnabled?: boolean;
  planColorizeStyleIds?: string[];
  planColorizeStyleNames?: string[];
  planColorizeStylePromptHints?: string[];
  selectedStyleId?: string;
  selectedStyleName?: string;
  selectedStylePromptHint?: string;
  batchGroupId?: string;
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
  materialPatternScale?: MaterialPatternScale;
  materialDirection?: MaterialDirection;
  materialFinish?: MaterialFinish;
  materialReplaceScope?: MaterialReplaceScope;
  customMaterialPrompt?: string;
  preserveLighting?: boolean;
  preserveGeometry?: boolean;
  sourceModelAssetId?: string;
  sourceImageAssetId?: string;
  featureKey?: string;
  featureName?: string;
  promptMode?: 'fixed_internal_prompt' | string;
  generationStep?: GenerationJobStep;
  snapshotAssetId?: string;
  panoramaAssetId?: string;
  panoramaSourceAssetId?: string;
  panoramaReferenceAssetIds?: string[];
  panoramaReferenceTypes?: Array<'revit_screenshot' | 'floor_plan' | 'material_reference' | 'style_reference' | 'render_reference'>;
  panoramaReferenceMode?: 'reference_guided';
  panoramaReferenceStrength?: 'low' | 'medium' | 'high';
  objectReferenceAssetId?: string;
  referenceImageAssetId?: string;
  referenceImageAssetIds?: string[];
  freeReferenceReferences?: FreeReferenceReference[];
  freeReferenceResolution?: 1024 | 1536 | 2048;
  freeReferenceAspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16';
  placementGuideAssetId?: string;
  placementPreviewAssetId?: string;
  placementMaskAssetId?: string;
  objectPlacement?: ObjectPlacement;
  objectInsert?: ObjectInsertConfig;
  objectInsertMode?: 'object_insert_preview_fusion' | 'legacy_object_insert';
  objectInsertInputOrder?: Array<Record<string, unknown>>;
  objectInsertUIMode?: ObjectInsertUIMode;
  objectInsertCandidateStrategy?: ObjectInsertCandidateStrategy;
  objectInsertCandidateStrategies?: ObjectInsertCandidateStrategy[];
  objectInsertCandidatePromptHints?: string[];
  objectInsertDebugMode?: ObjectInsertDebugMode;
  objectInsertSurface?: ObjectInsertSurface;
  objectType?: ObjectInsertType | string;
  objectFidelity?: ObjectFidelity;
  enforceContactShadow?: boolean;
  enforceOcclusion?: boolean;
  enforcePerspectiveScale?: boolean;
  positionConstraintStrength?: ObjectInsertPositionConstraintStrength;
  placementMode?: ObjectInsertPlacementMode;
  placementIntent?: string;
  harmonyPriority?: ObjectInsertHarmonyPriority;
  objectInsertFusionPreference?: ObjectInsertFusionPreference;
  allowAutoAdjustPosition?: boolean;
  allowAutoAdjustRotation?: boolean;
  allowAutoAdjustScale?: boolean;
  placementConstraintMode?: ObjectInsertPlacementConstraintMode;
  placementAnchorStrength?: number;
  maxCenterOffsetRatio?: number;
  maxScaleAdjustmentRatio?: number;
  maxRotationAdjustmentDeg?: number;
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
  floorplanRetryVariantIndex?: number;
}

export interface ObjectPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface ObjectInsertItemConfig {
  id: string;
  objectType: ObjectInsertType | string;
  objectLabel?: string;
  referenceAssetIds: string[];
  placement?: ObjectPlacement;
  placementPreviewAssetId?: string;
  placementMaskAssetId?: string;
  objectInsertSurface?: ObjectInsertSurface;
  objectFidelity?: ObjectFidelity;
  enforceContactShadow?: boolean;
  enforceOcclusion?: boolean;
  enforcePerspectiveScale?: boolean;
  placementMode?: ObjectInsertPlacementMode;
  placementIntent?: string;
  placementConstraintMode?: ObjectInsertPlacementConstraintMode;
  placementAnchorStrength?: number;
  maxCenterOffsetRatio?: number;
  maxScaleAdjustmentRatio?: number;
  maxRotationAdjustmentDeg?: number;
  extraPrompt?: string;
}

export interface ObjectInsertConfig {
  mode?: 'object_insert_preview_fusion' | 'legacy_object_insert';
  sourceImageAssetId?: string;
  objectItems?: ObjectInsertItemConfig[];
  globalExtraPrompt?: string;
  objectType?: ObjectInsertType | string;
  objectInsertSurface?: ObjectInsertSurface;
  objectFidelity?: ObjectFidelity;
  enforceContactShadow?: boolean;
  enforceOcclusion?: boolean;
  enforcePerspectiveScale?: boolean;
  objectReferenceAssetId?: string;
  objectReferenceAssetIds?: string[];
  guideAssetId?: string;
  previewAssetId?: string;
  maskAssetId?: string;
  compositePlacementGuideAssetId?: string;
  compositePlacementMaskAssetId?: string;
  placement?: ObjectPlacement;
  extraPrompt?: string;
  debugMode?: ObjectInsertDebugMode;
  positionConstraintStrength?: ObjectInsertPositionConstraintStrength;
  placementMode?: ObjectInsertPlacementMode;
  placementIntent?: string;
  harmonyPriority?: ObjectInsertHarmonyPriority;
  fusionPreference?: ObjectInsertFusionPreference;
  allowAutoAdjustPosition?: boolean;
  allowAutoAdjustRotation?: boolean;
  allowAutoAdjustScale?: boolean;
  placementConstraintMode?: ObjectInsertPlacementConstraintMode;
  placementAnchorStrength?: number;
  maxCenterOffsetRatio?: number;
  maxScaleAdjustmentRatio?: number;
  maxRotationAdjustmentDeg?: number;
  objectInsertCandidateStrategy?: ObjectInsertCandidateStrategy;
  objectInsertCandidateStrategies?: ObjectInsertCandidateStrategy[];
  objectInsertCandidatePromptHints?: string[];
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
  designDirection?: string;
  changeScopeLabel?: string;
  lockedItemsLabel?: string;
  strategyNote?: string;
  designDescription?: string;
}

export type GenerationBatchItemStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface GenerationBatchItem {
  variantIndex: number;
  variantName: string;
  selectedStyleId?: string;
  selectedStyleName?: string;
  layoutVariantId?: string;
  layoutVariantName?: string;
  batchGroupId?: string;
  jobId?: string;
  status: GenerationBatchItemStatus;
  imageUrl?: string;
  assetId?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface ContinuationSource {
  parentResultId: string;
  parentJobId?: string | null;
  parentRecordId?: string | null;
  imageUrl: string;
  assetId?: string;
  label: string;
  action: ContinuationAction;
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
  generationBatchItems?: GenerationBatchItem[];
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
  feature: 'floorplan' | 'style-render' | 'inpaint' | 'model-render' | 'design-variants' | 'material-replace' | 'plan-colorize' | 'panorama-roam-render' | 'object-insert' | 'free-reference-image' | 'image-polish';
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
  generationStep?: GenerationStep;
  featureName?: string;
  negativePrompt?: string;
  inputAssetIds?: string[];
  referenceAssetIds?: string[];
  materialAssetIds?: string[];
  sourceAssetId?: string;
  placementPreviewAssetId?: string;
  outputAssetId?: string;
  outputUrl?: string;
  previewAssetId?: string;
  isPublic?: boolean;
  createdBy?: string;
  createdAt?: string;
  createdFromGenerationRecordId?: string;
  createdFromJobId?: string;
  inputPreviews?: Array<{ label: string; url: string; assetId?: string }>;
  outputPreview?: Record<string, unknown>;
  parameterSummary?: Record<string, unknown>;
  templateSource?: string;
  coverAssetId?: string;
  coverUrl?: string;
}

export interface GenerationHistoryItem {
  id: string;
  projectId?: string | null;
  projectName?: string | null;
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
