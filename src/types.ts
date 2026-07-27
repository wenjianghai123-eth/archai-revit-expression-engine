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
export type GenerationProvider = 'mock' | 'gemini' | 'grsai-banana2' | 'grsai-nano-banana' | 'apiyi' | 'apiyi-nano-banana2-edit';
export type SelectableImageProvider = 'apiyi';
export type AsyncGenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timeout';
export type GenerationJobPhase = 'queued' | 'prepare-input' | 'provider-request' | 'postprocess' | 'save-result' | 'succeeded' | 'failed' | 'cancelled' | 'timeout';
export type QualityMode = 'draft' | 'fast' | 'balanced' | 'high';
export type ImagePolishMode = 'conservative' | 'standard' | 'materialization' | 'white-model-materialization';
export type ImagePolishControlLevel = 'off' | 'low' | 'medium' | 'high';
export type ImagePolishElementLevel = 'none' | 'low' | 'medium' | 'high';
export type ImagePolishPreserveStrictness = 'strict' | 'standard' | 'loose';
export interface ImagePolishControls {
  clarity: ImagePolishControlLevel;
  lightingOptimization: ImagePolishControlLevel;
  materialDetail: ImagePolishControlLevel;
  removeModelFeel: ImagePolishControlLevel;
  colorPreservation: ImagePolishControlLevel;
  structurePreservation: ImagePolishControlLevel;
  denoise: ImagePolishControlLevel;
  shadow: ImagePolishControlLevel;
  reflection: ImagePolishControlLevel;
}
export type VariantGenerationStrategy = 'style-matrix' | 'same-style';
export type VariantChangeScope = 'material-only' | 'soft-decoration' | 'lighting' | 'furniture-layout' | 'color-palette' | 'full-design';
export type VariantLock = 'structure' | 'space-layout' | 'fixed-hard-decoration' | 'camera' | 'walls-openings' | 'fixed-furniture' | 'floor-material' | 'ceiling' | 'main-color';
export type DesignVariantBatchCount = 1 | 2 | 4 | 6 | 8;
export type DesignVariantDiversity = 'low' | 'balanced' | 'high';
export type DesignVariantVariableKey =
  | 'material-system'
  | 'color-system'
  | 'lighting-atmosphere'
  | 'furniture-style'
  | 'furniture-layout'
  | 'soft-decoration-richness'
  | 'decoration-details'
  | 'brand-character'
  | 'overall-design-style';
export type DesignVariantVariableValues = Partial<Record<DesignVariantVariableKey, string>>;
export interface DesignVariantMatrixItem {
  variantIndex: number;
  changedVariables: DesignVariantVariableKey[];
  lockedVariables: DesignVariantVariableKey[];
  values: DesignVariantVariableValues;
  description: string;
  differenceSummary: string;
  parentResultId?: string | null;
  parentJobId?: string | null;
}
export type PlanColorizeBatchCount = 1 | 2 | 3 | 4 | 5 | 6;
export type FloorplanMultiPlanBatchCount = 1 | 2 | 4 | 6;
export type FloorplanMultiPlanMode = 'single' | 'multi';
export type FloorplanVariantType = 'material_style' | 'furniture_layout' | 'mixed';
export type FloorplanVariantFocus = 'material_style' | 'furniture_layout' | 'both';
export type FloorplanRenderMode = 'flat-color' | 'semi-3d' | 'presentation';
export type LineworkPreservation = 'strict' | 'high' | 'medium';
export type FloorPlanExpressionMode = 'precise-material' | 'three-dimensional' | 'analysis' | 'multi-option';
export type FloorPlanTextLanguage = 'zh-CN' | 'en' | 'none';
export type FloorPlanRegionType = 'living' | 'dining' | 'bedroom' | 'kitchen' | 'bathroom' | 'circulation' | 'service' | 'outdoor' | 'commercial' | 'office' | 'other';
export type VariantStyleKey =
  | 'modern-minimal'
  | 'modern-oriental'
  | 'wabi-sabi'
  | 'cream-style'
  | 'light-luxury'
  | 'new-chinese'
  | 'japanese-wabi-sabi'
  | 'industrial'
  | 'mediterranean'
  | 'french-modern'
  | 'italian-minimal'
  | 'nordic-natural'
  | 'art-deco'
  | 'futuristic'
  | 'commercial-showroom'
  | 'hotel-lobby'
  | 'office-space'
  | 'natural-wood'
  | 'premium-gray'
  | 'japanese'
  | 'custom';
export type MaterialReplaceStrength = 'subtle' | 'balanced' | 'strong';
export type MaterialPatternScale = 'small' | 'medium' | 'large';
export type MaterialDirection = 'auto' | 'horizontal' | 'vertical' | 'diagonal' | 'herringbone';
export type MaterialFinish = 'matte' | 'satin' | 'glossy' | 'rough';
export type MaterialReplaceScope = 'material-only' | 'material-and-soft-decor' | 'creative';
export type MaterialReplacementMode = 'object-category' | 'material-category' | 'smart-select';
/** @deprecated Use MaterialReplacementMode. */
export type MaterialReplaceTargetMode = MaterialReplacementMode;
export type MaterialCategory =
  | 'wood'
  | 'stone'
  | 'metal'
  | 'glass'
  | 'fabric'
  | 'leather'
  | 'tile'
  | 'paint'
  | 'concrete'
  | 'custom';
export type MaterialReplacementTargetScope = 'all-scene' | 'selected-region' | 'current-object';
export type MaterialCandidateCount = 1 | 2 | 3 | 4;
export type MaterialTextureAlignment = 'auto' | 'surface' | 'center' | 'edge' | 'custom-origin';
export interface MaterialTextureOrigin { x: number; y: number }
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
  | GenerationStep.FreeReferenceImage
  | GenerationStep.ImagePolish;
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
export type InsertElementKind = 'volumetric-object' | 'planar-graphic';
export type PlanarAttachmentMode = 'flat-decal' | 'flat-sign' | 'raised-lettering' | 'screen-content';
export type ObjectInsertType =
  | 'sofa'
  | 'chair'
  | 'table'
  | 'lamp'
  | 'plant'
  | 'artwork'
  | 'sculpture'
  | 'car'
  | 'person'
  | 'tree'
  | 'signage'
  | 'logo'
  | 'wall-text'
  | 'hospital-signage'
  | 'brand-signage'
  | 'poster'
  | 'wayfinding'
  | 'screen-content'
  | 'custom';
export type ObjectFidelity = 'strict' | 'balanced' | 'loose';
export type ObjectInsertUIMode = 'simple' | 'advanced';
export type ObjectInsertCandidateStrategy = 'strict-placement' | 'natural-fit' | 'object-fidelity' | 'scene-harmony';
export type ObjectInsertWorkflowMode = 'placement' | 'scene-enrichment';
export type SceneEnrichmentLevel = 'few' | 'moderate' | 'many';
export interface ObjectInsertSceneEnrichment {
  plants: SceneEnrichmentLevel;
  people: SceneEnrichmentLevel;
  decorations: SceneEnrichmentLevel;
}
export type FloorplanRoomType = 'living-room' | 'dining-room' | 'bedroom' | 'kitchen' | 'bathroom' | 'balcony' | 'entry' | 'study' | 'office' | 'commercial' | 'custom';
export type FloorplanTemplateId = 'residential-warm-wood' | 'premium-light-luxury' | 'commercial-presentation' | 'office-space' | 'landscape-masterplan' | 'minimal-grayscale';
export type PlanDrawingType = 'residential' | 'commercial' | 'office' | 'hotel' | 'landscape' | 'site-plan' | 'custom';
export type PlanExpressionTemplate = 'zoning-color' | 'colored-plan' | 'landscape-plan' | 'furniture-enhance' | 'annotation-plan' | 'circulation-analysis';
export type MaterialReplaceEditMode = 'smart-type' | 'mask';
export type MaterialMaskSelectionMode = 'smart';
export type MaskWorkflowMode = 'none' | 'smart';
export type SelectionMode = 'semantic-auto' | 'smart-select';
export type SmartSelectionStatus = 'idle' | 'predicting' | 'preview' | 'confirmed' | 'error';
export type SmartMaskStage = SmartSelectionStatus;
export type MaterialReplaceTargetObject =
  | 'floor'
  | 'wall'
  | 'ceiling'
  | 'cabinet'
  | 'sofa'
  | 'table-chair'
  | 'lighting'
  | 'plant'
  | 'artwork'
  | 'decor'
  | 'door-window'
  | 'feature-wall'
  | 'other';
export type ReplacementTarget = 'plant' | 'wall' | 'floor' | 'furniture' | 'lighting' | 'artwork' | 'decor';
export type MaterialReplacementEditingScope = 'masked' | 'semantic-auto';
export type ReplacementStrategy = 'replace-existing' | 'replace-masked';
export interface SemanticObjectSelection {
  id: string;
  objectType: MaterialReplaceTargetObject;
  x: number;
  y: number;
  label?: string;
}
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
  /** 0-100. Kept optional so existing saved jobs remain valid. */
  weight?: number;
  /** Normalized crop rectangle in the original reference image. */
  crop?: FreeReferenceCrop;
  focusArea?: FreeReferenceFocusArea;
  focusDescription?: string;
}

export interface FreeReferenceCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FreeReferenceFocusArea = 'full' | 'center' | 'foreground' | 'background' | 'left' | 'right' | 'custom';
export type FreeReferenceStructureControl = 'strict' | 'balanced' | 'creative';
export type FreeReferenceCandidateCount = 1 | 2 | 4;
export type FreeReferenceAspectRatio = 'source' | '1:1' | '4:3' | '3:2' | '16:9' | '9:16' | '2:1' | '3:4';
export type FreeReferenceWorkflowMode = 'custom' | 'quick-style';

export interface FloorplanRoomLabel {
  id: string;
  name: string;
  roomType: FloorplanRoomType;
  positionDescription: string;
  customTypeLabel?: string;
}

export type RegionPolygon = [number, number][];

export type RegionEditOperation =
  | { type: 'rename'; regionId: string; name: string }
  | { type: 'delete'; regionId: string }
  | { type: 'add-polygon'; regionId: string; polygon: RegionPolygon }
  | { type: 'brush'; regionId: string; point: [number, number]; radius: number }
  | { type: 'erase'; regionId: string; point: [number, number]; radius: number }
  | { type: 'merge'; sourceRegionIds: string[]; outputRegionId: string }
  | { type: 'split'; sourceRegionId: string; outputRegionIds: string[] }
  | { type: 'update-metadata'; regionId: string; regionType: FloorPlanRegionType | null; regionUsage: string }
  | { type: 'restore-auto' };

export interface FloorPlanRegion {
  id: string;
  number: number;
  polygon: RegionPolygon;
  areaRatio: number;
  suggestedName: string | null;
  name: string;
  regionType?: FloorPlanRegionType | null;
  regionUsage?: string;
  confidence: number;
  maskAssetId: string | null;
  maskUrl: string | null;
}

export interface FloorPlanRegionSet {
  id: string;
  userId: string;
  sourceAssetId: string;
  width: number;
  height: number;
  regions: FloorPlanRegion[];
  autoRegions: FloorPlanRegion[];
  overlayAssetId: string | null;
  overlayUrl: string | null;
  status: 'recognized' | 'confirmed';
  versionNumber: number;
  baseRegionSetId: string | null;
  lockedAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FloorPlanMaterialDirection = 'auto' | 'horizontal' | 'vertical' | 'diagonal';
export type FloorPlanMaterialJointMode = 'subtle' | 'visible' | 'none';
export type FloorPlanMaterialFallbackMode = 'reference' | 'default' | 'ai-auto';

export interface FloorPlanRegionMaterial {
  id: string;
  userId: string;
  regionSetId: string;
  regionId: string;
  materialAssetId: string | null;
  materialUrl: string | null;
  materialName: string;
  scale: number;
  rotation: number;
  direction: FloorPlanMaterialDirection;
  jointMode: FloorPlanMaterialJointMode;
  fallbackMode: FloorPlanMaterialFallbackMode;
  createdAt: string;
  updatedAt: string;
}

export type SaveFloorPlanRegionMaterialInput = Pick<FloorPlanRegionMaterial,
  'regionId' | 'materialAssetId' | 'materialName' | 'scale' | 'rotation' | 'direction' | 'jointMode' | 'fallbackMode'
>;

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

export type ModelCameraPreset = 'interior' | 'exterior-front' | 'exterior-side' | 'bird-eye' | 'top' | 'custom';

export interface ModelViewBookmark {
  id: string;
  name: string;
  preset: ModelCameraPreset;
  snapshotAssetId: string;
  snapshotUrl: string;
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
  bookmarkId?: string;
  bookmarkName?: string;
  cameraPreset?: ModelCameraPreset;
  batchGroupId?: string;
  batchIndex?: number;
  batchCount?: number;
  createdAt: string;
}

export interface ModelOptimizationMetadata {
  originalUrl: string;
  convertedUrl?: string;
  convertedFormat?: 'glb' | 'gltf';
  conversionStatus?: 'idle' | 'converting' | 'succeeded' | 'failed';
  conversionError?: string | null;
  convertedAt?: string;
  conversionStartedAt?: string;
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
  optimizationStartedAt?: string;
  optimizationError?: string;
  faceCount?: number;
  optimizedFaceCount?: number;
  createdAt?: string;
  completedAt?: string;
}

export interface GenerationConfig {
  prompt: string;
  aiProvider?: SelectableImageProvider;
  apiyiAspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '5:4' | '4:5' | '3:2' | '2:3' | '2:1' | '21:9';
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
  preserveArchitecture?: boolean;
  preserveSpatialLayout?: boolean;
  preserveHardscapeFramework?: boolean;
  preserveFurnitureLayout?: boolean;
  preserveColor?: boolean;
  preserveMaterialAppearance?: boolean;
  keepOriginalAspectRatio?: boolean;
  imagePolishMode?: ImagePolishMode;
  imagePolishControls?: ImagePolishControls;
  addPeople?: boolean;
  peopleLevel?: ImagePolishElementLevel;
  addPlants?: boolean;
  plantLevel?: ImagePolishElementLevel;
  preserveStrictness?: ImagePolishPreserveStrictness;
  /** @deprecated Use imagePolishMode and imagePolishControls. */
  enhanceMaterials?: boolean;
  negativePrompt?: string;
  styleStrength?: 'low' | 'medium' | 'high';
  targetCount?: number;
  feather?: number;
  maskExpansion?: number;
  batchCount?: PlanColorizeBatchCount | DesignVariantBatchCount | FloorplanMultiPlanBatchCount;
  floorplanOutputMode?: FloorplanMultiPlanMode;
  floorplanVariantType?: FloorplanVariantType;
  floorplanVariantFocus?: FloorplanVariantFocus;
  floorplanRenderMode?: FloorplanRenderMode;
  floorPlanExpressionMode?: FloorPlanExpressionMode;
  floorPlanTextLanguage?: FloorPlanTextLanguage;
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
  selectedStyleIds?: VariantStyleKey[];
  variantNames?: string[];
  variantChangeScope?: VariantChangeScope;
  variantLocks?: VariantLock[];
  variantStrategyNotes?: string[];
  variantDiversity?: DesignVariantDiversity;
  variantMatrixVariables?: DesignVariantVariableKey[];
  variantVariableLocks?: DesignVariantVariableKey[];
  variantMatrix?: DesignVariantMatrixItem[];
  qualityPreset?: string;
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
  protectionMaskAssetId?: string;
  hasProtectionMask?: boolean;
  selectionMode?: SelectionMode;
  editMode?: MaterialReplaceEditMode;
  /**
   * How a painted material-replacement mask is interpreted. This intentionally
   * differs from maskMode, which describes the existing asset-mask transport.
   */
  maskSelectionMode?: MaterialMaskSelectionMode;
  maskWorkflowMode?: MaskWorkflowMode;
  smartSelectionStatus?: SmartSelectionStatus;
  smartSelectionConfirmed?: boolean;
  smartMaskConfirmed?: boolean;
  smartMaskIsRefining?: boolean;
  smartMaskStage?: SmartMaskStage;
  maskWorkflowActive?: boolean;
  confirmedSmartMaskAssetId?: string;
  semanticAssistFromSelection?: boolean;
  smartMaskDetectedObject?: string;
  smartMaskConfidence?: number;
  smartMaskRefinementMethod?: string;
  buildingType?: string;
  spaceType?: string;
  renderStyle?: string;
  smartMaterial?: string;
  atmosphere?: string;
  changeStrength?: 'weak' | 'medium' | 'strong';
  panoramaChangeStrength?: 'weak' | 'medium' | 'strong';
  panoramaQuality?: 'standard' | 'high';
  customPrompt?: string;
  replacementTarget?: ReplacementTarget;
  editingScope?: MaterialReplacementEditingScope;
  replacementStrategy?: ReplacementStrategy;
  preserveUnmaskedArea?: boolean;
  materialReplacementMode?: MaterialReplacementMode;
  /** @deprecated Use materialReplacementMode. */
  materialReplaceMode?: MaterialReplaceTargetMode;
  materialCategory?: MaterialCategory;
  replacementScope?: MaterialReplacementTargetScope;
  targetObjectCategory?: MaterialReplaceTargetObject;
  confirmedSelectionMask?: boolean;
  targetObjectType?: MaterialReplaceTargetObject;
  targetMaterial?: MaterialReplaceTargetMaterial;
  materialPatternScale?: MaterialPatternScale;
  materialDirection?: MaterialDirection;
  materialFinish?: MaterialFinish;
  materialReplaceScope?: MaterialReplaceScope;
  customMaterialPrompt?: string;
  preserveLighting?: boolean;
  preserveGeometry?: boolean;
  semanticObjectSelections?: SemanticObjectSelection[];
  materialRealSizeMm?: number;
  materialJointWidthMm?: number;
  enablePhysicalMaterialLayout?: boolean;
  materialTextureAlignment?: MaterialTextureAlignment;
  materialTextureOrigin?: MaterialTextureOrigin;
  materialCandidateCount?: MaterialCandidateCount;
  sourceModelAssetId?: string;
  sourceImageAssetId?: string;
  featureKey?: string;
  featureName?: string;
  promptMode?: 'fixed_internal_prompt' | string;
  generationStep?: GenerationJobStep;
  snapshotAssetId?: string;
  modelViewBookmarks?: ModelViewBookmark[];
  modelViewBookmarkId?: string;
  modelViewBookmarkName?: string;
  modelCameraPreset?: ModelCameraPreset;
  modelViewBatchId?: string;
  modelViewBatchIndex?: number;
  modelViewBatchCount?: number;
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
  freeReferenceAspectRatio?: FreeReferenceAspectRatio;
  freeReferenceStructureControl?: FreeReferenceStructureControl;
  freeReferenceCandidateCount?: FreeReferenceCandidateCount;
  freeReferenceWorkflowMode?: FreeReferenceWorkflowMode;
  freeReferenceStylePresetId?: string;
  freeReferenceStylePromptHint?: string;
  placementGuideAssetId?: string;
  placementPreviewAssetId?: string;
  placementMaskAssetId?: string;
  objectPlacement?: ObjectPlacement;
  objectInsert?: ObjectInsertConfig;
  objectInsertMode?: 'object_insert_preview_fusion' | 'legacy_object_insert';
  objectInsertInputOrder?: Array<Record<string, unknown>>;
  objectInsertUIMode?: ObjectInsertUIMode;
  objectInsertWorkflowMode?: ObjectInsertWorkflowMode;
  objectInsertSceneEnrichment?: ObjectInsertSceneEnrichment;
  objectInsertCandidateStrategy?: ObjectInsertCandidateStrategy;
  objectInsertCandidateStrategies?: ObjectInsertCandidateStrategy[];
  objectInsertCandidatePromptHints?: string[];
  objectInsertDebugMode?: ObjectInsertDebugMode;
  objectInsertSurface?: ObjectInsertSurface;
  insertElementKind?: InsertElementKind;
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
  inputSource?: 'model-capture' | 'uploaded-snapshot' | 'panorama-capture' | 'uploaded-panorama';
  taskType?: 'panorama-generation' | 'panorama-upload' | string;
  panoramaTaskType?: 'panorama-generation' | 'panorama-upload';
  generationKind?: 'panorama-generation' | 'preview-edit' | 'final-render' | string;
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
  anchor?: 'top-left' | 'center';
  cornerPoints?: Array<{ x: number; y: number }>;
  normalizedBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  surfacePlane?: ObjectInsertSurface;
  sizeLocked?: boolean;
}

export interface ObjectInsertItemConfig {
  id: string;
  objectType: ObjectInsertType | string;
  objectLabel?: string;
  insertElementKind?: InsertElementKind;
  elementType?: InsertElementKind;
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
  planarSizeLocked?: boolean;
  attachmentMode?: PlanarAttachmentMode;
  fusionStrategy?: 'deterministic-planar-composite' | 'model-assisted-object-insert';
  lockPosition?: boolean;
  lockSize?: boolean;
  lockAspectRatio?: boolean;
  preserveGraphicContent?: boolean;
  preserveBackground?: boolean;
  aiEditableRegion?: 'edge-band-only' | 'full-object';
  coreMaskMode?: 'locked';
  edgeBandPx?: number;
  maxMaskExpansionPx?: number;
  extraPrompt?: string;
  visible?: boolean;
  locked?: boolean;
  zIndex?: number;
  backgroundRemovedAssetId?: string;
}

export interface ObjectInsertConfig {
  mode?: 'object_insert_preview_fusion' | 'legacy_object_insert';
  sourceImageAssetId?: string;
  objectItems?: ObjectInsertItemConfig[];
  globalExtraPrompt?: string;
  insertElementKind?: InsertElementKind;
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
  attachmentMode?: PlanarAttachmentMode;
  fusionStrategy?: 'deterministic-planar-composite' | 'model-assisted-object-insert';
  lockPosition?: boolean;
  lockSize?: boolean;
  lockAspectRatio?: boolean;
  preserveGraphicContent?: boolean;
  preserveBackground?: boolean;
  aiEditableRegion?: 'edge-band-only' | 'full-object';
  coreMaskMode?: 'locked';
  edgeBandPx?: number;
  maxMaskExpansionPx?: number;
  objectInsertCandidateStrategy?: ObjectInsertCandidateStrategy;
  objectInsertCandidateStrategies?: ObjectInsertCandidateStrategy[];
  objectInsertCandidatePromptHints?: string[];
  workflowMode?: ObjectInsertWorkflowMode;
  sceneEnrichment?: ObjectInsertSceneEnrichment;
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
  changedVariables?: DesignVariantVariableKey[];
  lockedVariables?: DesignVariantVariableKey[];
  variantVariableValues?: DesignVariantVariableValues;
  differenceSummary?: string;
  reportNarrative?: string;
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
  /** Cached when the mask is committed, so render-time readiness never scans Canvas pixels. */
  maskHasVisiblePixels?: boolean;
  protectionMaskImage?: UploadedImage | null;
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
  previewUrl?: string;
  url?: string;
  publicUrl?: string;
  thumbnailUrl?: string;
  assetId?: string;
  uploadStatus?: 'idle' | 'local-preview' | 'uploading' | 'uploaded' | 'failed';
  uploadProgress?: number;
  uploadError?: string;
  width?: number;
  height?: number;
}

export type EditConstraint = 'strictStructure' | 'preserveCamera' | 'preserveAspectRatio' | 'materialOnly' | 'lightingOnly' | 'furnitureOnly' | 'forbidNewComponents';

export interface EditSession {
  id: string;
  userId: string;
  projectId: string | null;
  sourceAssetId: string;
  originalVersionId: string;
  currentVersionId: string;
  primaryVersionId?: string | null;
  finalVersionId?: string | null;
  title: string;
  permanentConstraints: Record<string, unknown>;
  aspectRatio: string | null;
  status: 'active' | 'finalized' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface EditMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  baseVersionId: string | null;
  outputVersionId: string | null;
  generationJobId: string | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timeout';
  createdAt: string;
  clientRequestId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface AssetVersion {
  id: string;
  assetId: string;
  sessionId: string;
  parentVersionId: string | null;
  restoredFromVersionId?: string | null;
  versionNumber: number;
  displayName?: string | null;
  note?: string;
  storagePath: string;
  publicUrl: string;
  userInstruction: string;
  compiledPrompt: string;
  provider: string | null;
  model: string | null;
  generationJobId: string | null;
  createdBy: string;
  createdAt: string;
  exportedAt?: string | null;
}

export interface EditJobState {
  jobId: string;
  messageId: string;
  baseVersionId: string;
  instruction: string;
  imageSize: '1K' | '2K' | '4K';
  generationKind: 'preview-edit' | 'final-render';
  maskAssetId?: string;
  constraints: Partial<Record<EditConstraint, boolean>>;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timeout';
  progress: number;
  error: string | null;
}

export interface MaterialTexture {
  id: string;
  name?: string;
  url: string;
  dataUrl?: string;
  previewUrl?: string;
  publicUrl?: string;
  thumbnailUrl?: string;
  assetId?: string;
  uploadStatus?: 'idle' | 'local-preview' | 'uploading' | 'uploaded' | 'failed';
  uploadProgress?: number;
  uploadError?: string;
  source: 'upload' | 'library';
}

export interface ReferenceImage {
  id: string;
  name?: string;
  url: string;
  dataUrl?: string;
  previewUrl?: string;
  publicUrl?: string;
  thumbnailUrl?: string;
  assetId?: string;
  uploadStatus?: 'idle' | 'local-preview' | 'uploading' | 'uploaded' | 'failed';
  uploadProgress?: number;
  uploadError?: string;
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
