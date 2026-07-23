import React, { Suspense, lazy, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { GenerationConfig, GenerationHistoryItem, GenerationProvider, GenerationRunStateOverride, GenerationStep, MaterialAsset, MaterialTexture, ReferenceImage, ResultSendTargetStep, SecondaryEditAction, StepState, UploadedImage, type MaskWorkflowMode } from '../types';
import { createLocalPreviewImage, createUploadedImage, hydrateUploadedImageDataUrl, revokeUploadedImagePreview, validateImageFile } from '../utils/file';
import { getImageAsset, getProject, uploadImageAsset } from '../lib/api';
import { GenerationStatusPanel } from './workspace/GenerationStatusPanel';
import { InputImagePanel } from './workspace/InputImagePanel';
import { InpaintMaskPanel } from './workspace/InpaintMaskPanel';
import { PromptConfigPanel } from './workspace/PromptConfigPanel';
import { MaterialTexturesPanel, StyleSelectorPanel } from './workspace/ReferenceImagesPanel';
import { ResultPreviewPanel } from './workspace/ResultPreviewPanel';
import { getOriginalResultAssetId } from '../utils/resultImage';
import { DesignVariantsPanel } from './DesignVariantsPanel';
import { PlanColorizePanel } from './PlanColorizePanel';
import { MaterialReplaceConfigPanel } from './MaterialReplaceConfigPanel';
import { ObjectInsertPanel } from './ObjectInsertPanel';
import { FreeReferenceImagePanel } from './FreeReferenceImagePanel';
import { ImagePolishPanel } from './ImagePolishPanel';
import { FloorPlanRegionPanel } from './FloorPlanRegionPanel';
import { UploadErrors, UploadTarget, ViewModeOption } from './workspace/workspaceTypes';
import { getUploadedImageSrc, isLocalInpaintingStep, maxFurnitureReferences, maxMaterialTextures, readGenerationStatusLabel } from './workspace/workspaceUtils';
import { IMAGE_UPLOAD_ACCEPT, readImageTypeUploadError } from '../utils/imageValidation';
import {
  allowLatestFloorPlanRegionSet,
  clearFloorPlanWorkspaceCache,
  floorPlanAssetStorageKey,
  suppressLatestFloorPlanRegionSet,
} from '../utils/floorPlanWorkspace';
import {
  AUTO_MATERIAL_REPLACEMENT_PROMPT,
  getMaterialReplacePreviewButtonState,
  resolveMaterialReplacementMode,
  validateMaterialReplacePreviewInput,
} from '../utils/materialReplaceReadiness';
import {
  resolveReplacementStrategy,
  resolveReplacementTargetFromConfig,
  type MaterialReplacementEditingScope,
} from '../utils/materialReplacementTarget';
import { createResultViewerData, ResultViewer } from './workspace/ResultViewer';
import { DrawingToolNavigation } from './drawing-expression/DrawingToolNavigation';
import { DrawingViewerToolbar } from './drawing-expression/DrawingViewerToolbar';
import {
  buildDrawingToolConfigPatch,
  createDrawingExpressionUiState,
  drawingExpressionUiReducer,
  fromStepViewMode,
  resolveDrawingWorkflowStage,
  toStepViewMode,
  usesFloorPlanRegionWorkflow,
  type DrawingTool,
} from './drawing-expression/drawingExpressionState';

const MaterialLibrary = lazy(() => import('./MaterialLibrary').then(module => ({ default: module.MaterialLibrary })));
const PromptTemplatePanel = lazy(() => import('./PromptTemplatePanel').then(module => ({ default: module.PromptTemplatePanel })));
const ModelSnapshotRenderPanel = lazy(() => import('./ModelSnapshotRenderPanel').then(module => ({ default: module.ModelSnapshotRenderPanel })));
const PanoramaQuickRenderPanel = lazy(() => import('./PanoramaQuickRenderPanel').then(module => ({ default: module.PanoramaQuickRenderPanel })));
interface WorkspaceProps {
  step: GenerationStep;
  state: StepState;
  selectedProjectId?: string | null;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onUpdateMaterialImage: (image: UploadedImage | null) => void;
  onUpdateMaterialTextures: (textures: MaterialTexture[]) => void;
  onUpdateFurnitureReferences: (references: ReferenceImage[]) => void;
  onUpdateMaskImage: (maskDataUrl: string | null, useFullImage: boolean, feather?: number, protectionMaskDataUrl?: string | null, expansion?: number, hasValidMaskPixels?: boolean) => void;
  onGenerate: (stateOverride?: GenerationRunStateOverride) => void;
  onRegenerate: () => void;
  onCancelGeneration: () => void;
  onSelectGenerationResult: (resultId: string) => void;
  onToggleGenerationFavorite: (resultId: string) => void;
  onSecondaryEditResult: (resultId: string, action: SecondaryEditAction) => void;
  onSendResultToStep: (resultId: string, targetStep: ResultSendTargetStep) => void;
  onContinueObjectInsertRefine: (image: UploadedImage, source: { resultId?: string; label: string }) => void;
  onRenameGenerationResult: (resultId: string, variantName: string) => void;
  onDeleteGenerationResult?: (resultId: string) => void;
  onSetViewMode: (viewMode: StepState['viewMode']) => void;
  onNextStep: () => void;
  onReset: () => void;
  onHistoryRecord?: (record: GenerationHistoryItem) => void;
  backendProvider: GenerationProvider | null;
  isCreditsInsufficient: boolean;
  providerUnavailableReason?: string | null;
  isAdmin?: boolean;
  onStartContinuousEdit?: (image: UploadedImage) => Promise<void>;
  creditBalance?: number | null;
  onRefreshCreditBalance?: () => Promise<void>;
  onEnsureProject?: () => Promise<string>;
}

export function MainWorkspace({
  step,
  state,
  selectedProjectId,
  onUpdateConfig,
  onUpdateInputImage,
  onUpdateMaterialImage,
  onUpdateMaterialTextures,
  onUpdateFurnitureReferences,
  onUpdateMaskImage,
  onGenerate,
  onRegenerate,
  onCancelGeneration,
  onSelectGenerationResult,
  onToggleGenerationFavorite,
  onSecondaryEditResult,
  onSendResultToStep,
  onContinueObjectInsertRefine,
  onRenameGenerationResult,
  onDeleteGenerationResult,
  onSetViewMode,
  onNextStep,
  onReset,
  onHistoryRecord,
  backendProvider,
  isCreditsInsufficient,
  providerUnavailableReason = null,
  isAdmin = false,
  onStartContinuousEdit,
  creditBalance = null,
  onRefreshCreditBalance,
  onEnsureProject,
}: WorkspaceProps) {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const materialFileRef = useRef<HTMLInputElement>(null);
  const materialTextureFileRef = useRef<HTMLInputElement>(null);
  const furnitureReferenceFileRef = useRef<HTMLInputElement>(null);
  const [uploadErrors, setUploadErrors] = useState<UploadErrors>({ input: null, material: null, texture: null, furniture: null });
  const [isMaterialLibraryOpen, setIsMaterialLibraryOpen] = useState(false);
  const [isPromptTemplatePanelOpen, setIsPromptTemplatePanelOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [isCreatingContinuousEdit, setIsCreatingContinuousEdit] = useState(false);
  const [continuousEditError, setContinuousEditError] = useState<string | null>(null);
  const [floorPlanWorkspaceRevision, setFloorPlanWorkspaceRevision] = useState(0);
  const [floorPlanHasDerivedState, setFloorPlanHasDerivedState] = useState(false);
  const floorPlanRequestGenerationRef = useRef(0);
  const floorPlanRestoreGenerationRef = useRef(0);
  const floorPlanUploadAbortRef = useRef<AbortController | null>(null);
  const floorPlanResettingRef = useRef(false);
  const [drawingUiState, dispatchDrawingUi] = useReducer(drawingExpressionUiReducer, state, createDrawingExpressionUiState);

  const isFloorplanStep = step === GenerationStep.FloorplanTo3D;
  const usesDrawingRegionWorkflow = isFloorplanStep && usesFloorPlanRegionWorkflow(drawingUiState.activeTool);
  const isStyleRenderStep = step === GenerationStep.StyleRender;

  useEffect(() => {
    if (!isFloorplanStep) return;
    dispatchDrawingUi({ type: 'sync-workflow-stage', workflowStage: resolveDrawingWorkflowStage(state) });
  }, [isFloorplanStep, state.generationStatus, state.inputImage, state.isGenerating]);

  useEffect(() => {
    if (!isFloorplanStep) return;
    dispatchDrawingUi({ type: 'set-viewer-mode', viewerMode: fromStepViewMode(state.viewMode) });
  }, [isFloorplanStep, state.viewMode]);

  const handleSelectDrawingTool = useCallback((tool: DrawingTool) => {
    dispatchDrawingUi({ type: 'select-tool', tool });
    onUpdateConfig(buildDrawingToolConfigPatch(tool, state.config));
  }, [onUpdateConfig, state.config]);

  const handleSetDrawingViewerMode = useCallback((viewerMode: typeof drawingUiState.viewerMode) => {
    dispatchDrawingUi({ type: 'set-viewer-mode', viewerMode });
    onSetViewMode(toStepViewMode(viewerMode));
  }, [onSetViewMode]);

  useEffect(() => {
    let active = true;
    const restoreGeneration = floorPlanRestoreGenerationRef.current;
    if (!isFloorplanStep || state.inputImage || floorPlanResettingRef.current) return () => { active = false; };
    const assetId = window.localStorage.getItem(floorPlanAssetStorageKey);
    if (!assetId) return () => { active = false; };
    getImageAsset(assetId).then(asset => {
      if (!active || restoreGeneration !== floorPlanRestoreGenerationRef.current || floorPlanResettingRef.current) return;
      const url = asset.publicUrl || asset.url;
      onUpdateInputImage({ id: asset.id, assetId: asset.id, name: asset.filename || '已上传平面图', type: asset.mimeType, size: asset.size, dataUrl: url, url, publicUrl: url, thumbnailUrl: asset.thumbnailUrl, uploadStatus: 'uploaded', uploadProgress: 100 });
    }).catch(error => {
      if (active && restoreGeneration === floorPlanRestoreGenerationRef.current) {
        console.error('[floor-plan-segment] restore source asset failed', { assetId, error });
        window.localStorage.removeItem(floorPlanAssetStorageKey);
      }
    });
    return () => { active = false; };
  }, [isFloorplanStep, onUpdateInputImage, state.inputImage]);

  useEffect(() => () => {
    floorPlanRequestGenerationRef.current += 1;
    floorPlanRestoreGenerationRef.current += 1;
    floorPlanUploadAbortRef.current?.abort();
    floorPlanUploadAbortRef.current = null;
  }, []);
  const isModelSnapshotStep = step === GenerationStep.ModelSnapshotRender;
  const isDesignVariantsStep = step === GenerationStep.DesignVariants;
  const isPlanColorizeStep = step === GenerationStep.PlanColorize;
  const isMaterialReplaceStep = step === GenerationStep.MaterialReplace;
  const isPanoramaQuickRenderStep = step === GenerationStep.PanoramaQuickRender;
  const isObjectInsertStep = step === GenerationStep.ObjectInsert;
  const isFreeReferenceImageStep = step === GenerationStep.FreeReferenceImage;
  const isImagePolishStep = step === GenerationStep.ImagePolish;
  const materialReplaceEditMode = state.config.editMode === 'mask' ? 'mask' : 'smart-type';
  const configuredMaterialSelectionMode = state.config.selectionMode === 'semantic-auto' || state.config.selectionMode === 'smart-select'
    ? state.config.selectionMode
    : null;
  const materialReplaceSelectionMode = configuredMaterialSelectionMode
    || (materialReplaceEditMode !== 'mask'
      ? 'semantic-auto'
      : 'smart-select');
  const sourceImageUrl = state.inputImage ? getUploadedImageSrc(state.inputImage) : null;
  const activeReplacementReference = state.materialTextures[0] || state.materialImage;
  const activeReplacementReferenceUrl = activeReplacementReference
    ? activeReplacementReference.previewUrl
      || activeReplacementReference.publicUrl
      || activeReplacementReference.url
      || activeReplacementReference.thumbnailUrl
      || activeReplacementReference.dataUrl
    : null;
  const hasMaskSelection = Boolean(state.maskImage?.dataUrl || state.useFullImageMask);
  const materialReplacementTarget = resolveReplacementTargetFromConfig(state.config);
  const configuredMaskWorkflowMode = materialReplaceSelectionMode === 'semantic-auto'
    ? 'none'
    : 'smart';
  const materialMaskWorkflowMode: MaskWorkflowMode = materialReplaceSelectionMode === 'semantic-auto'
    ? 'none'
    : hasMaskSelection
      ? 'smart'
      : configuredMaskWorkflowMode;
  const materialReplaceMaskWorkflowActive = materialMaskWorkflowMode !== 'none';
  const hasValidMaskPixels = hasMaskSelection && (state.maskHasVisiblePixels ?? true);
  const materialReplacementEditingScope: MaterialReplacementEditingScope = materialMaskWorkflowMode === 'none' ? 'semantic-auto' : hasMaskSelection ? 'masked' : 'semantic-auto';
  const materialReplacementStrategy = resolveReplacementStrategy(materialReplacementEditingScope);
  const isReplacementUploadInProgress = state.inputImage?.uploadStatus === 'uploading'
    || state.inputImage?.uploadStatus === 'local-preview'
    || state.materialTextures.some(texture => texture.uploadStatus === 'uploading' || texture.uploadStatus === 'local-preview');
  const replacementType = state.config.editTarget || 'general';
  const effectiveReplacementType = replacementType === 'general' && materialReplacementTarget ? 'material' : replacementType;
  const isFurnishingMode = replacementType === 'furniture';
  const isMaterialMode = !isFurnishingMode;
  const materialReplacementMode = resolveMaterialReplacementMode(effectiveReplacementType);
  const materialReplaceButtonState = getMaterialReplacePreviewButtonState({
    hasSourceImage: Boolean(sourceImageUrl),
    isUploading: isReplacementUploadInProgress,
    isGeneratingPreview: state.isGenerating,
  });
  const previewValidation = validateMaterialReplacePreviewInput({
    mode: materialReplacementMode,
    hasSourceImage: Boolean(sourceImageUrl),
    hasReference: Boolean(activeReplacementReferenceUrl),
    hasMask: hasMaskSelection,
    hasValidMaskPixels,
    hasTargetObject: Boolean(materialReplacementTarget),
    replacementTarget: materialReplacementTarget,
    selectionMode: materialReplaceSelectionMode,
    maskWorkflowMode: materialMaskWorkflowMode,
    maskWorkflowActive: materialReplaceMaskWorkflowActive,
    smartSelectionStatus: state.config.smartSelectionStatus,
    maskConfirmed: materialReplaceSelectionMode !== 'smart-select'
      || state.config.smartSelectionConfirmed === true
      || state.config.smartMaskConfirmed === true,
    replacementPrompt: state.config.customMaterialPrompt || state.config.prompt || '',
    useDefaultPreset: Boolean(state.config.targetMaterial),
    isSegmenting: state.config.smartSelectionStatus === 'predicting' || state.config.smartMaskIsRefining === true,
    enablePhysicalMaterialLayout: materialReplacementMode === 'local-material' && state.config.enablePhysicalMaterialLayout === true,
    materialRealSizeMm: state.config.materialRealSizeMm,
    materialJointWidthMm: state.config.materialJointWidthMm,
  });
  const [previewValidationErrors, setPreviewValidationErrors] = useState<string[]>([]);
  const [maskEditorOpenRequest, setMaskEditorOpenRequest] = useState(0);
  const previewValidationKey = previewValidation.missingItems.join('|');
  const canClickPreview = materialReplaceButtonState.canClickPreview;
  const previewButtonHint = materialReplaceButtonState.previewButtonHint;
  const canGenerate = isMaterialReplaceStep
    ? canClickPreview
    : Boolean(state.inputImage)
      && !state.isGenerating
      && !isCreditsInsufficient
      && !providerUnavailableReason;
  const generateDisabledReason = isMaterialReplaceStep
    ? previewButtonHint
    : providerUnavailableReason
      || (state.isGenerating ? '正在生成，请稍候。' : null)
      || (!state.inputImage ? '请先上传原图。' : null)
      || (isCreditsInsufficient ? '当前算力点余额不足。' : null);

  useEffect(() => {
    if (!isMaterialReplaceStep || previewValidationErrors.length === 0) return;
    setPreviewValidationErrors(current => {
      if (current.join('|') === previewValidationKey) return current;
      return previewValidation.missingItems;
    });
  }, [isMaterialReplaceStep, previewValidation.missingItems, previewValidationErrors.length, previewValidationKey]);

  const handleGeneratePreview = useCallback((stateOverride?: GenerationRunStateOverride) => {
    if (!isMaterialReplaceStep) {
      onGenerate(stateOverride);
      return;
    }
    if (!previewValidation.valid) {
      setPreviewValidationErrors(previewValidation.missingItems);
      return;
    }

    setPreviewValidationErrors([]);
    if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
      console.debug('[MaterialReplacement payload]', {
        replacementTarget: materialReplaceSelectionMode === 'semantic-auto' ? materialReplacementTarget : undefined,
        semanticAssistFromSelection: materialReplaceSelectionMode === 'smart-select'
          ? state.config.semanticAssistFromSelection !== false
          : undefined,
        editingScope: materialReplacementEditingScope,
        hasConfirmedMask: hasMaskSelection && (
          materialReplaceSelectionMode !== 'smart-select'
          || state.config.smartSelectionConfirmed === true
          || state.config.smartMaskConfirmed === true
        ),
        materialReference: Boolean(activeReplacementReferenceUrl),
        preserveUnmaskedArea: true,
      });
    }
    if (materialReplacementMode === 'auto-enhance') {
      const existingPrompt = (state.config.customMaterialPrompt || state.config.prompt || '').trim();
      onGenerate({
        ...stateOverride,
        config: {
          ...stateOverride?.config,
          editTarget: 'general',
          editMode: 'smart-type',
          selectionMode: 'semantic-auto',
          targetObjectType: 'other',
          replacementTarget: 'decor',
          editingScope: 'semantic-auto',
          replacementStrategy: 'replace-existing',
          preserveUnmaskedArea: true,
          semanticObjectSelections: [],
          customMaterialPrompt: existingPrompt || AUTO_MATERIAL_REPLACEMENT_PROMPT,
        },
      });
      return;
    }
    onGenerate({
      ...stateOverride,
      config: {
        ...stateOverride?.config,
        replacementTarget: materialReplaceSelectionMode === 'semantic-auto' ? materialReplacementTarget || undefined : undefined,
        targetObjectType: materialReplaceSelectionMode === 'semantic-auto' ? state.config.targetObjectType : undefined,
        selectionMode: materialReplaceSelectionMode,
        editingScope: materialReplacementEditingScope,
        replacementStrategy: materialReplacementStrategy,
        editMode: materialMaskWorkflowMode === 'none' ? 'smart-type' : 'mask',
        maskSelectionMode: materialMaskWorkflowMode === 'smart' ? 'smart' : undefined,
        maskWorkflowMode: materialMaskWorkflowMode,
        maskWorkflowActive: materialReplaceMaskWorkflowActive,
        semanticAssistFromSelection: materialReplaceSelectionMode === 'smart-select'
          ? state.config.semanticAssistFromSelection !== false
          : undefined,
        smartSelectionStatus: state.config.smartSelectionStatus,
        smartMaskStage: undefined,
        preserveUnmaskedArea: true,
      },
    });
  }, [activeReplacementReferenceUrl, hasMaskSelection, isMaterialReplaceStep, materialMaskWorkflowMode, materialReplaceMaskWorkflowActive, materialReplaceSelectionMode, materialReplacementEditingScope, materialReplacementMode, materialReplacementStrategy, materialReplacementTarget, onGenerate, previewValidation.missingItems, previewValidation.valid, state.config.customMaterialPrompt, state.config.prompt, state.config.smartMaskConfirmed, state.config.smartSelectionConfirmed, state.config.smartSelectionStatus, state.config.targetObjectType]);

  const handleRequestMaskEditor = useCallback((_mode: 'smart') => {
    const nextWorkflowMode: MaskWorkflowMode = 'smart';
    if (materialMaskWorkflowMode !== 'none' && materialMaskWorkflowMode !== nextWorkflowMode) {
      onUpdateMaskImage(null, false, state.config.feather ?? 0, null, state.config.maskExpansion ?? 0, false);
    }
    onUpdateConfig({
      editTarget: 'material',
      editMode: 'mask',
      selectionMode: 'smart-select',
      maskSelectionMode: 'smart',
      maskWorkflowMode: nextWorkflowMode,
      maskWorkflowActive: true,
      targetObjectType: undefined,
      replacementTarget: undefined,
      preserveUnmaskedArea: true,
      smartSelectionStatus: 'idle',
      smartSelectionConfirmed: false,
      smartMaskStage: undefined,
      smartMaskConfirmed: false,
      smartMaskIsRefining: false,
      smartMaskDetectedObject: undefined,
      smartMaskConfidence: undefined,
      smartMaskRefinementMethod: undefined,
      semanticAssistFromSelection: state.config.semanticAssistFromSelection !== false,
    });
    setMaskEditorOpenRequest(value => value + 1);
  }, [materialMaskWorkflowMode, onUpdateConfig, onUpdateMaskImage, state.config.feather, state.config.maskExpansion, state.config.semanticAssistFromSelection]);

  useEffect(() => {
    if (!import.meta.env.DEV || import.meta.env.MODE === 'test' || !isMaterialReplaceStep) return;
    console.debug('[MaterialReplacement] preview readiness', {
      hasSourceImage: Boolean(sourceImageUrl),
      replacementType,
      hasReference: Boolean(activeReplacementReferenceUrl),
      maskMode: materialReplaceSelectionMode,
      maskWorkflowMode: materialMaskWorkflowMode,
      maskWorkflowActive: materialReplaceMaskWorkflowActive,
      hasMask: hasMaskSelection,
      hasValidMaskPixels,
      maskConfirmed: materialReplaceSelectionMode !== 'smart-select'
        || state.config.smartSelectionConfirmed === true
        || state.config.smartMaskConfirmed === true,
      smartSelectionStatus: state.config.smartSelectionStatus,
      isUploading: isReplacementUploadInProgress,
      isSegmenting: state.config.smartSelectionStatus === 'predicting' || state.config.smartMaskIsRefining === true,
      isGeneratingPreview: state.isGenerating,
      canClickPreview,
      previewButtonHint,
      validationMissingItems: previewValidation.missingItems,
    });
  }, [activeReplacementReferenceUrl, canClickPreview, hasMaskSelection, hasValidMaskPixels, isMaterialReplaceStep, isReplacementUploadInProgress, materialMaskWorkflowMode, materialReplaceMaskWorkflowActive, materialReplaceSelectionMode, previewButtonHint, previewValidationKey, replacementType, sourceImageUrl, state.config.smartMaskConfirmed, state.config.smartMaskIsRefining, state.config.smartSelectionConfirmed, state.config.smartSelectionStatus, state.isGenerating]);
  const providerForStatus = backendProvider || state.generationProvider;
  const resultOptions = state.generationResults.length > 0
    ? state.generationResults
    : state.outputImage
      ? [{ id: state.generationResultId || 'legacy-result', imageUrl: state.outputImage, isSelected: true, isFavorite: false }]
      : [];
  const selectedResult = resultOptions.find(result => result.id === state.selectedGenerationResultId)
    || resultOptions.find(result => result.isSelected)
    || resultOptions[0]
    || null;
  const resultViewerData = createResultViewerData({
    inputImage: state.inputImage,
    selectedResult,
    outputImage: state.outputImage,
  });
  const originalImageUrl = resultViewerData.originalImage || null;
  const previewImage = resultViewerData.resultImage || null;
  const generationStartedAt = state.generationJobDiagnostics?.timing?.jobStartedAt || state.generationCreatedAt;
  const statusLabel = readGenerationStatusLabel(state.generationJobDiagnostics?.phase, state.generationJobStatus, state.generationStatus);
  const resultPanelTitle = isModelSnapshotStep ? '白模快渲结果' : isFloorplanStep ? '材质设置与结果' : isStyleRenderStep ? '渲染设置与结果' : '输出 / 状态';
  const viewModeOptions: ViewModeOption[] = [
    { value: 'after', label: '结果图', disabled: !previewImage },
    { value: 'original', label: '原图', disabled: !originalImageUrl },
    { value: 'compare', label: '对比', disabled: !previewImage || !originalImageUrl },
    { value: 'overlay', label: '叠加对比', disabled: !previewImage || !originalImageUrl },
  ];

  useEffect(() => {
    if (!state.isGenerating || !generationStartedAt) {
      setElapsedSeconds(0);
      return;
    }

    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - new Date(generationStartedAt).getTime()) / 1000)));
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [generationStartedAt, state.isGenerating]);

  useEffect(() => {
    let isMounted = true;
    if (!selectedProjectId) {
      setProjectName(null);
      return () => {
        isMounted = false;
      };
    }

    void getProject(selectedProjectId)
      .then(project => {
        if (isMounted) setProjectName(project.name);
      })
      .catch(() => {
        if (isMounted) setProjectName(null);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedProjectId]);

  const handleUploadClick = (target: UploadTarget) => {
    if (target === 'input') inputFileRef.current?.click();
    else if (target === 'material') materialFileRef.current?.click();
    else if (target === 'texture') materialTextureFileRef.current?.click();
    else furnitureReferenceFileRef.current?.click();
  };

  const handleFileSelected = async (target: UploadTarget, fileList: FileList | null) => {
    if (target === 'texture') {
      await handleTextureFiles(fileList);
      return;
    }
    if (target === 'furniture') {
      await handleFurnitureReferenceFiles(fileList);
      return;
    }

    const file = fileList?.[0];
    if (!file) return;

    const validationError = validateImageFile(file, `workspace:${GenerationStep[step]}:${target}`);
    if (validationError) {
      setUploadErrors(prev => ({ ...prev, [target]: validationError }));
      return;
    }

    const tracksFloorPlanSource = target === 'input' && isFloorplanStep;
    const requestGeneration = tracksFloorPlanSource ? floorPlanRequestGenerationRef.current + 1 : null;
    let uploadAbortController: AbortController | null = null;
    if (tracksFloorPlanSource && requestGeneration !== null) {
      floorPlanRequestGenerationRef.current = requestGeneration;
      floorPlanRestoreGenerationRef.current += 1;
      floorPlanUploadAbortRef.current?.abort();
      uploadAbortController = new AbortController();
      floorPlanUploadAbortRef.current = uploadAbortController;
      floorPlanResettingRef.current = false;
    }
    const isCurrentRequest = () => requestGeneration === null || requestGeneration === floorPlanRequestGenerationRef.current;

    try {
      const previousImage = target === 'input' ? state.inputImage : state.materialImage;
      const localImage = createLocalPreviewImage(file);
      revokeUploadedImagePreview(previousImage);
      if (!isCurrentRequest()) {
        revokeUploadedImagePreview(localImage);
        return;
      }
      if (target === 'input') onUpdateInputImage({ ...localImage, uploadStatus: 'uploading' });
      else onUpdateMaterialImage({ ...localImage, uploadStatus: 'uploading' });
      const hydrationPromise = hydrateUploadedImageDataUrl(localImage, file).catch(() => localImage);
      let image = localImage;

      try {
        const asset = await uploadImageAsset(file, file.name, {
          onProgress: progress => {
            if (!isCurrentRequest()) return;
            const next = { ...localImage, uploadStatus: 'uploading' as const, uploadProgress: progress };
            if (target === 'input') onUpdateInputImage(next);
            else onUpdateMaterialImage(next);
          },
          signal: uploadAbortController?.signal,
        });
        const hydrated = await hydrationPromise;
        if (!isCurrentRequest()) {
          revokeUploadedImagePreview(localImage);
          return;
        }
        image = {
          ...hydrated,
          assetId: asset.id,
          url: asset.publicUrl || asset.url,
          publicUrl: asset.publicUrl || asset.url,
          thumbnailUrl: asset.thumbnailUrl,
          uploadStatus: 'uploaded',
          uploadProgress: 100,
        };
      } catch (error) {
        if (!isCurrentRequest() || uploadAbortController?.signal.aborted) {
          revokeUploadedImagePreview(localImage);
          return;
        }
        const uploadError = readImageTypeUploadError(error);
        if (uploadError) {
          const failedImage = { ...localImage, uploadStatus: 'failed' as const, uploadError };
          if (target === 'input') onUpdateInputImage(failedImage);
          else onUpdateMaterialImage(failedImage);
          setUploadErrors(prev => ({ ...prev, [target]: uploadError }));
          return;
        }
        image = { ...localImage, uploadStatus: 'failed', uploadError: '上传失败，可重试' };
      }

      if (target === 'input') onUpdateInputImage(image);
      else onUpdateMaterialImage(image);
      if (target === 'input' && isFloorplanStep && image.uploadStatus === 'uploaded' && image.assetId) {
        allowLatestFloorPlanRegionSet(image.assetId);
        window.localStorage.setItem(floorPlanAssetStorageKey, image.assetId);
      }
      setUploadErrors(prev => ({ ...prev, [target]: null }));
    } catch (error) {
      if (!isCurrentRequest()) return;
      setUploadErrors(prev => ({
        ...prev,
        [target]: error instanceof Error ? error.message : '图片读取失败，请重试。',
      }));
    } finally {
      if (uploadAbortController && floorPlanUploadAbortRef.current === uploadAbortController) {
        floorPlanUploadAbortRef.current = null;
      }
    }
  };

  const handleFurnitureReferenceFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const availableSlots = maxFurnitureReferences - state.furnitureReferences.length;
    if (availableSlots <= 0) {
      setUploadErrors(prev => ({ ...prev, furniture: `最多只能选择 ${maxFurnitureReferences} 张家具参考图。` }));
      return;
    }

    const nextReferences: ReferenceImage[] = [];
    for (const file of files.slice(0, availableSlots)) {
      const validationError = validateImageFile(file, `workspace:${GenerationStep[step]}:furniture-reference`);
      if (validationError) {
        setUploadErrors(prev => ({ ...prev, furniture: validationError }));
        continue;
      }

      const localImage = createLocalPreviewImage(file);
      let assetId: string | undefined;
      let url = localImage.previewUrl || localImage.dataUrl;

      try {
        const asset = await uploadImageAsset(file, file.name);
        assetId = asset.id;
        url = asset.publicUrl || asset.url;
      } catch (error) {
        const uploadError = readImageTypeUploadError(error);
        if (uploadError) {
          setUploadErrors(prev => ({ ...prev, furniture: uploadError }));
          continue;
        }
        // Keep the local preview when backend upload is unavailable.
      }

      nextReferences.push({
        id: `${localImage.id}-furniture`,
        name: localImage.name,
        url,
        dataUrl: localImage.dataUrl,
        previewUrl: localImage.previewUrl,
        publicUrl: url,
        thumbnailUrl: undefined,
        assetId,
        uploadStatus: assetId ? 'uploaded' : 'failed',
        uploadProgress: assetId ? 100 : 0,
        source: 'upload',
      });
    }

    if (nextReferences.length > 0) {
      onUpdateFurnitureReferences([...state.furnitureReferences, ...nextReferences].slice(0, maxFurnitureReferences));
      setUploadErrors(prev => ({ ...prev, furniture: null }));
    }
  };

  const handleTextureFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const availableSlots = maxMaterialTextures - state.materialTextures.length;
    if (availableSlots <= 0) {
      setUploadErrors(prev => ({ ...prev, texture: `最多只能选择 ${maxMaterialTextures} 张材质贴图。` }));
      return;
    }

    const acceptedFiles = files.slice(0, availableSlots);
    if (files.length > availableSlots) {
      setUploadErrors(prev => ({ ...prev, texture: `已添加前 ${availableSlots} 张，材质贴图最多 ${maxMaterialTextures} 张。` }));
    } else {
      setUploadErrors(prev => ({ ...prev, texture: null }));
    }

    const nextTextures: MaterialTexture[] = [];
    for (const file of acceptedFiles) {
      const validationError = validateImageFile(file, `workspace:${GenerationStep[step]}:material-reference`);
      if (validationError) {
        setUploadErrors(prev => ({ ...prev, texture: validationError }));
        continue;
      }

      const localImage = await createUploadedImage(file);
      let assetId: string | undefined;
      let url = localImage.dataUrl;

      try {
        const asset = await uploadImageAsset(file, file.name);
        assetId = asset.id;
        url = asset.url;
      } catch (error) {
        const uploadError = readImageTypeUploadError(error);
        if (uploadError) {
          setUploadErrors(prev => ({ ...prev, texture: uploadError }));
          continue;
        }
        // Keep the local preview when backend upload is unavailable.
      }

      nextTextures.push({
        id: `${localImage.id}-texture`,
        name: localImage.name,
        url,
        dataUrl: localImage.dataUrl,
        previewUrl: localImage.previewUrl,
        assetId,
        source: 'upload',
      });
    }

    if (nextTextures.length > 0) {
      onUpdateMaterialTextures([...state.materialTextures, ...nextTextures].slice(0, maxMaterialTextures));
    }
  };

  const handleSelectLibraryMaterial = (material: MaterialAsset) => {
    if (state.materialTextures.length >= maxMaterialTextures) {
      setUploadErrors(prev => ({ ...prev, texture: `最多只能选择 ${maxMaterialTextures} 张材质贴图。` }));
      return;
    }

    const alreadySelected = state.materialTextures.some(texture => texture.id === `library-${material.id}`);
    if (alreadySelected) {
      setUploadErrors(prev => ({ ...prev, texture: '这张材质已经在参考列表中。' }));
      return;
    }

    onUpdateMaterialTextures([
      ...state.materialTextures,
      {
        id: `library-${material.id}`,
        name: material.name,
        url: material.thumbnail,
        source: 'library',
      },
    ]);
    setUploadErrors(prev => ({ ...prev, texture: null }));
    setIsMaterialLibraryOpen(false);
  };

  const handleRemoveMaterialTexture = (id: string) => {
    const removed = state.materialTextures.find(texture => texture.id === id);
    revokeBlobUrl(removed?.previewUrl);
    onUpdateMaterialTextures(state.materialTextures.filter(texture => texture.id !== id));
    setUploadErrors(prev => ({ ...prev, texture: null }));
  };

  const handleRemoveFurnitureReference = (id: string) => {
    const removed = state.furnitureReferences.find(reference => reference.id === id);
    revokeBlobUrl(removed?.previewUrl);
    onUpdateFurnitureReferences(state.furnitureReferences.filter(reference => reference.id !== id));
    setUploadErrors(prev => ({ ...prev, furniture: null }));
  };

  const handleTextureLimit = () => {
    setUploadErrors(prev => ({ ...prev, texture: `最多只能选择 ${maxMaterialTextures} 张材质贴图。` }));
  };

  const materialTexturesPanel = (
    <MaterialTexturesPanel
      textures={state.materialTextures}
      uploadError={uploadErrors.texture}
      onUploadTexture={() => handleUploadClick('texture')}
      onOpenMaterialLibrary={() => setIsMaterialLibraryOpen(true)}
      onRemoveMaterialTexture={handleRemoveMaterialTexture}
      onTextureLimit={handleTextureLimit}
    />
  );

  const handleRetryDesignVariant = (variantIndex: number) => {
    const existingResult = resultOptions.find(result => result.variantIndex === variantIndex) || resultOptions[variantIndex];
    const variantStyles = Array.isArray(state.config.variantStyles) ? state.config.variantStyles : [];
    const variantNames = Array.isArray(state.config.variantNames) ? state.config.variantNames : [];
    const variantNotes = Array.isArray(state.config.variantStrategyNotes) ? state.config.variantStrategyNotes : [];
    const retryName = existingResult?.variantName || variantNames[variantIndex] || `方案 ${String.fromCharCode(65 + variantIndex)}`;
    const retryStyle = existingResult?.variantStyle || variantStyles[variantIndex] || variantStyles[0] || 'modern-minimal';
    onGenerate({
      config: {
        ...state.config,
        batchCount: 1,
        batchGroupId: state.config.batchGroupId || `design-variants-${Date.now()}`,
        targetVariantIndex: variantIndex,
        retryVariantIndex: variantIndex,
        variantNames: [retryName],
        variantStyles: [retryStyle],
        variantStrategyNotes: [existingResult?.strategyNote || variantNotes[variantIndex] || ''],
        variantChangeScope: state.config.variantChangeScope || 'full-design',
        variantLocks: state.config.variantLocks || ['structure', 'camera', 'walls-openings'],
      },
    });
  };

  const handleStartContinuousEditClick = async () => {
    const image = state.inputImage;
    setContinuousEditError(null);
    if (!image) {
      setContinuousEditError('请先选择并上传输入图片。');
      return;
    }

    if (image.uploadStatus === 'uploading' || image.uploadStatus === 'local-preview' || image.uploadStatus === 'idle') {
      setContinuousEditError('图片正在上传，完成后可连续修改。');
      return;
    }
    if (image.uploadStatus === 'failed') {
      setContinuousEditError(image.uploadError || '图片上传失败，请重新上传后重试。');
      return;
    }
    if (image.uploadStatus !== 'uploaded' || !image.assetId) {
      setContinuousEditError('图片尚未取得正式资产 ID，请重新上传后重试。');
      return;
    }
    if (!onStartContinuousEdit) {
      setContinuousEditError('连续修改功能当前不可用，请刷新页面或检查前端版本。');
      return;
    }
    setIsCreatingContinuousEdit(true);
    try {
      await onStartContinuousEdit(image);
    } catch (error) {
      const message = error instanceof Error ? error.message : '连续修改会话创建失败，请重试。';
      console.error('[continuous-edit] create session failed', { assetId: image.assetId, error });
      setContinuousEditError(message);
    } finally {
      setIsCreatingContinuousEdit(false);
    }
  };

  const invalidateFloorPlanRequests = useCallback(() => {
    floorPlanRequestGenerationRef.current += 1;
    floorPlanRestoreGenerationRef.current += 1;
    floorPlanUploadAbortRef.current?.abort();
    floorPlanUploadAbortRef.current = null;
  }, []);

  const handleResetFloorPlanRegionsAndMaterials = useCallback(() => {
    const sourceImage = state.inputImage;
    if (!sourceImage) return;
    invalidateFloorPlanRequests();
    if (sourceImage.assetId) suppressLatestFloorPlanRegionSet(sourceImage.assetId);
    revokeFloorPlanDerivedBlobUrls(state);
    if (state.isGenerating) onCancelGeneration();
    onReset();
    onUpdateInputImage(sourceImage);
    setUploadErrors({ input: null, material: null, texture: null, furniture: null });
    setContinuousEditError(null);
    setIsCreatingContinuousEdit(false);
    setFloorPlanHasDerivedState(false);
    setFloorPlanWorkspaceRevision(current => current + 1);
    dispatchDrawingUi({
      type: 'reset',
      state: { activeTool: 'region-recognition', viewerMode: 'original', workflowStage: 'uploaded', isInspectingResult: false },
    });
  }, [invalidateFloorPlanRequests, onCancelGeneration, onReset, onUpdateInputImage, state]);

  const handleResetFloorPlanAll = useCallback(() => {
    const hasAdvancedWork = floorPlanHasDerivedState
      || state.materialTextures.length > 0
      || Boolean(state.materialImage || state.maskImage || state.outputImage || state.generationJobId || state.generationResults.length);
    if (hasAdvancedWork && !window.confirm('全部重置将清除当前平面图、区域划分、材质配置和生成结果。历史记录不会被删除。是否继续？')) {
      return;
    }

    floorPlanResettingRef.current = true;
    invalidateFloorPlanRequests();
    revokeFloorPlanAllBlobUrls(state);
    clearFloorPlanWorkspaceCache(state.inputImage?.assetId);
    for (const input of [inputFileRef.current, materialFileRef.current, materialTextureFileRef.current, furnitureReferenceFileRef.current]) {
      if (input) input.value = '';
    }
    if (state.isGenerating) onCancelGeneration();
    onReset();
    setUploadErrors({ input: null, material: null, texture: null, furniture: null });
    setContinuousEditError(null);
    setIsCreatingContinuousEdit(false);
    setFloorPlanHasDerivedState(false);
    setFloorPlanWorkspaceRevision(current => current + 1);
    dispatchDrawingUi({
      type: 'reset',
      state: { activeTool: 'region-recognition', viewerMode: 'original', workflowStage: 'empty', isInspectingResult: false },
    });
    Promise.resolve().then(() => {
      floorPlanResettingRef.current = false;
    });
  }, [floorPlanHasDerivedState, invalidateFloorPlanRequests, onCancelGeneration, onReset, state]);

  if (isDesignVariantsStep) {
    return (
      <div className="workspace-layout workspace-surface flex min-h-0 flex-1 overflow-hidden">
        <input ref={inputFileRef} type="file" accept={IMAGE_UPLOAD_ACCEPT} className="hidden" onChange={event => { void handleFileSelected('input', event.currentTarget.files); event.currentTarget.value = ''; }} />
        <DesignVariantsPanel
          state={state}
          resultOptions={resultOptions}
          selectedResultId={selectedResult?.id || null}
          previewImage={previewImage}
          uploadError={uploadErrors.input}
          projectName={projectName || selectedProjectId || 'archai-project'}
          onUploadInput={() => handleUploadClick('input')}
          onUpdateInputImage={onUpdateInputImage}
          onUpdateConfig={onUpdateConfig}
          onGenerate={onGenerate}
          onSelectGenerationResult={onSelectGenerationResult}
          onToggleGenerationFavorite={onToggleGenerationFavorite}
          onSecondaryEditResult={onSecondaryEditResult}
          onSendResultToStep={onSendResultToStep}
          onRetryVariant={handleRetryDesignVariant}
          onRenameGenerationResult={onRenameGenerationResult}
          onDeleteGenerationResult={onDeleteGenerationResult || (() => undefined)}
          canGenerate={canGenerate}
          disabledReason={generateDisabledReason}
          onCancelGeneration={onCancelGeneration}
          onReset={onReset}
        />
      </div>
    );
  }

  if (isPlanColorizeStep) {
    return (
      <div className="workspace-layout workspace-surface flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:flex-row lg:gap-0 lg:overflow-hidden">
        <input ref={inputFileRef} type="file" accept={IMAGE_UPLOAD_ACCEPT} className="hidden" onChange={event => { void handleFileSelected('input', event.currentTarget.files); event.currentTarget.value = ''; }} />
        <PlanColorizePanel
          state={state}
          viewerData={resultViewerData}
          projectName={projectName || selectedProjectId || 'archai-project'}
          uploadError={uploadErrors.input}
          onUploadInput={() => handleUploadClick('input')}
          onUpdateInputImage={onUpdateInputImage}
          onUpdateConfig={onUpdateConfig}
          onGenerate={onGenerate}
          onSetViewMode={onSetViewMode}
        />
        <GenerationStatusPanel
          step={step}
          state={state}
          title="图纸智能表达结果"
          statusLabel={statusLabel}
          elapsedSeconds={elapsedSeconds}
          canGenerate={canGenerate}
          disabledReason={generateDisabledReason}
          previewImage={previewImage}
          originalImageUrl={originalImageUrl}
          resultOptions={resultOptions}
          selectedResultId={selectedResult?.id || null}
          viewModeOptions={viewModeOptions}
          topPanels={null}
          projectName={projectName || selectedProjectId || 'archai-project'}
          onGenerate={onGenerate}
          onRegenerate={onRegenerate}
          onCancelGeneration={onCancelGeneration}
          onSelectGenerationResult={onSelectGenerationResult}
          onToggleGenerationFavorite={onToggleGenerationFavorite}
          onSecondaryEditResult={onSecondaryEditResult}
          onSendResultToStep={onSendResultToStep}
          onSetViewMode={onSetViewMode}
          onNextStep={onGenerate}
          onReset={onReset}
          showResultViewer={false}
          className="max-h-[65vh] lg:max-h-none"
        />
      </div>
    );
  }

  if (isModelSnapshotStep) {
    return (
      <div className="workspace-layout workspace-surface flex min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<ModelWorkspaceLoading label="正在加载白模快渲工作区…" />}>
          <ModelSnapshotRenderPanel
            state={state}
            onUpdateConfig={onUpdateConfig}
            onUpdateInputImage={onUpdateInputImage}
            onGenerate={onGenerate}
          />
        </Suspense>
        <GenerationStatusPanel
          step={step}
          state={state}
          title={resultPanelTitle}
          statusLabel={statusLabel}
          elapsedSeconds={elapsedSeconds}
          canGenerate={Boolean(state.inputImage) && !state.isGenerating && !isCreditsInsufficient}
          disabledReason={generateDisabledReason}
          previewImage={previewImage}
          originalImageUrl={originalImageUrl}
          resultOptions={resultOptions}
          selectedResultId={selectedResult?.id || null}
          viewModeOptions={viewModeOptions}
          topPanels={null}
          projectName={projectName || selectedProjectId || 'archai-project'}
          onGenerate={onGenerate}
          onRegenerate={onRegenerate}
          onCancelGeneration={onCancelGeneration}
          onSelectGenerationResult={onSelectGenerationResult}
          onToggleGenerationFavorite={onToggleGenerationFavorite}
          onSecondaryEditResult={onSecondaryEditResult}
          onSendResultToStep={onSendResultToStep}
          onSetViewMode={onSetViewMode}
          onNextStep={onGenerate}
          onReset={onReset}
        />
      </div>
    );
  }

  if (isPanoramaQuickRenderStep) {
    return (
      <div className="workspace-layout workspace-surface flex min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<ModelWorkspaceLoading label="正在加载全景模型工作区…" />}>
          <PanoramaQuickRenderPanel
            state={state}
            config={state.config}
            projectId={selectedProjectId}
            projectName={projectName || selectedProjectId || 'archai-project'}
            provider={providerForStatus}
            onUpdateConfig={onUpdateConfig}
            onUpdateInputImage={onUpdateInputImage}
            onGenerate={onGenerate}
            onHistoryRecord={onHistoryRecord}
            onSecondaryEditResult={onSecondaryEditResult}
          />
        </Suspense>
      </div>
    );
  }

  if (isObjectInsertStep) {
    return (
      <div className="workspace-layout workspace-surface flex min-h-0 flex-1 overflow-hidden">
        <ObjectInsertPanel
          state={state}
          onUpdateInputImage={onUpdateInputImage}
          onUpdateMaterialImage={onUpdateMaterialImage}
          onUpdateConfig={onUpdateConfig}
          onGenerate={onGenerate}
          onContinueRefineSource={onContinueObjectInsertRefine}
          onSecondaryEditResult={onSecondaryEditResult}
          onSendResultToStep={onSendResultToStep}
          projectName={projectName || selectedProjectId || 'archai-project'}
          isAdmin={isAdmin}
        />
      </div>
    );
  }

  if (isFreeReferenceImageStep) {
    return (
      <FreeReferenceImagePanel
        state={state}
        projectName={projectName || selectedProjectId || 'archai-project'}
        onUpdateInputImage={onUpdateInputImage}
        onUpdateMaterialImage={onUpdateMaterialImage}
        onUpdateConfig={onUpdateConfig}
        onGenerate={onGenerate}
        onSendResultToStep={onSendResultToStep}
        onSecondaryEditResult={onSecondaryEditResult}
      />
    );
  }

  if (isImagePolishStep) {
    return (
      <ImagePolishPanel
        state={state}
        projectName={projectName || selectedProjectId || 'archai-project'}
        onUpdateInputImage={onUpdateInputImage}
        onUpdateConfig={onUpdateConfig}
        onGenerate={onGenerate}
        onSendResultToStep={onSendResultToStep}
        onSecondaryEditResult={onSecondaryEditResult}
      />
    );
  }

  return (
    <div className={`workspace-layout workspace-surface flex min-h-0 flex-1 ${isMaterialReplaceStep ? 'material-replacement-workspace' : ''} ${isFloorplanStep ? 'flex-col overflow-hidden' : 'overflow-hidden p-3'}`}>
      <input ref={inputFileRef} type="file" accept={IMAGE_UPLOAD_ACCEPT} className="hidden" onChange={event => { void handleFileSelected('input', event.currentTarget.files); event.currentTarget.value = ''; }} />
      <input ref={materialFileRef} type="file" accept={IMAGE_UPLOAD_ACCEPT} className="hidden" onChange={event => { void handleFileSelected('material', event.currentTarget.files); event.currentTarget.value = ''; }} />
      <input ref={materialTextureFileRef} type="file" accept={IMAGE_UPLOAD_ACCEPT} multiple className="hidden" onChange={event => { void handleTextureFiles(event.currentTarget.files); event.currentTarget.value = ''; }} />
      <input ref={furnitureReferenceFileRef} type="file" accept={IMAGE_UPLOAD_ACCEPT} multiple className="hidden" onChange={event => { void handleFurnitureReferenceFiles(event.currentTarget.files); event.currentTarget.value = ''; }} />

      {isFloorplanStep ? (
        <DrawingToolNavigation
          activeTool={drawingUiState.activeTool}
          workflowStage={drawingUiState.workflowStage}
          onSelectTool={handleSelectDrawingTool}
        />
      ) : null}

      <div className={isFloorplanStep
        ? 'drawing-workspace grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-3'
        : 'contents'}>
      <aside data-testid={isFloorplanStep ? 'drawing-settings-panel' : undefined} className={`drawing-left-panel workspace-side-panel glass-panel flex shrink-0 flex-col overflow-y-auto overflow-x-hidden border border-white/60 p-4 custom-scrollbar ${isMaterialReplaceStep ? 'material-replacement-left-panel' : ''} ${isFloorplanStep ? 'w-full rounded-2xl lg:rounded-l-3xl' : 'w-80 rounded-l-3xl'}`}>
        <InputImagePanel
          step={step}
          inputImage={state.inputImage}
          materialImage={state.materialImage}
          config={state.config}
          uploadErrors={uploadErrors}
          showMaterialUpload={!isLocalInpaintingStep(step)}
          showFurnitureReferences={step === GenerationStep.LocalInpainting && (state.config.editTarget || 'general') === 'furniture'}
          furnitureReferences={state.furnitureReferences}
          onUploadClick={handleUploadClick}
          onUpdateInputImage={onUpdateInputImage}
          onUpdateMaterialImage={onUpdateMaterialImage}
          onUpdateConfig={onUpdateConfig}
          onRemoveFurnitureReference={handleRemoveFurnitureReference}
          onFileDrop={(target, files) => { void handleFileSelected(target, files); }}
        />
        {state.inputImage && onStartContinuousEdit ? <div className="mt-3">
          <button type="button" onClick={()=>{void handleStartContinuousEditClick();}} disabled={isCreatingContinuousEdit||state.inputImage.uploadStatus!=='uploaded'||!state.inputImage.assetId} className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
            {isCreatingContinuousEdit?'正在创建会话…':state.inputImage.uploadStatus==='uploading'||state.inputImage.uploadStatus==='local-preview'?'图片正在上传…':state.inputImage.uploadStatus==='failed'?'图片上传失败，请重试':'开始连续修改'}
          </button>
          {state.inputImage.uploadStatus==='uploading'||state.inputImage.uploadStatus==='local-preview'?<p className="mt-2 text-xs text-slate-500">图片正在上传，完成后可连续修改</p>:null}
          {continuousEditError?<p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{continuousEditError}</p>:null}
        </div>:null}
        <div className="mt-5 space-y-5">
          {!isMaterialReplaceStep ? (
            <PromptConfigPanel
              step={step}
              config={state.config}
              isFloorplanStep={isFloorplanStep}
              compactInpaint={isLocalInpaintingStep(step)}
              activeDrawingTool={isFloorplanStep ? drawingUiState.activeTool : undefined}
              onUpdateConfig={onUpdateConfig}
              onOpenPromptTemplatePanel={() => setIsPromptTemplatePanelOpen(true)}
            />
          ) : null}
          {isMaterialReplaceStep ? (
            <>
              <MaterialReplaceConfigPanel config={state.config} materialReferenceCount={state.materialTextures.length} onUpdateConfig={onUpdateConfig} onRequestMaskEditor={handleRequestMaskEditor} />
              {isMaterialMode ? materialTexturesPanel : null}
            </>
          ) : null}
        </div>
      </aside>

      {isFloorplanStep ? (
        <section data-testid="drawing-viewer" className="drawing-viewer relative z-[1] flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <DrawingViewerToolbar
            viewerMode={drawingUiState.viewerMode}
            hasOriginal={Boolean(originalImageUrl)}
            hasResult={Boolean(previewImage)}
            canReturnToEditor={usesDrawingRegionWorkflow && drawingUiState.isInspectingResult}
            onChange={handleSetDrawingViewerMode}
            onReturnToEditor={() => dispatchDrawingUi({ type: 'return-to-editor' })}
          />
          {usesDrawingRegionWorkflow && !drawingUiState.isInspectingResult ? (
            <FloorPlanRegionPanel
              key={`floor-plan-workspace-${floorPlanWorkspaceRevision}`}
              image={state.inputImage}
              onUpload={() => handleUploadClick('input')}
              onResetRegionsAndMaterials={handleResetFloorPlanRegionsAndMaterials}
              onResetAll={handleResetFloorPlanAll}
              onDerivedStateChange={setFloorPlanHasDerivedState}
              creditBalance={creditBalance}
              onRefreshCreditBalance={onRefreshCreditBalance}
              onEnsureProject={onEnsureProject}
              config={state.config}
              onUpdateConfig={onUpdateConfig}
              activeTool={drawingUiState.activeTool}
              onRequestTool={handleSelectDrawingTool}
            />
          ) : (
            <ResultViewer
              data={resultViewerData}
              viewMode={toStepViewMode(drawingUiState.viewerMode)}
              onViewModeChange={viewMode => handleSetDrawingViewerMode(fromStepViewMode(viewMode))}
              isGenerating={state.isGenerating}
              generationProgress={state.generationProgress}
              projectName={projectName || selectedProjectId || 'archai-project'}
              featureLabel="图纸表达"
              className="h-full min-h-0 flex-1 rounded-none border-0 shadow-none"
              showTabs={false}
            />
          )}
        </section>
      ) : step === GenerationStep.LocalInpainting || isMaterialReplaceStep ? (
        <InpaintMaskPanel
          inputImage={state.inputImage}
          maskImageDataUrl={state.maskImage?.dataUrl || null}
          protectionMaskDataUrl={state.protectionMaskImage?.dataUrl || null}
          useFullImageMask={state.useFullImageMask}
          providerForStatus={providerForStatus}
          onUploadInput={() => handleUploadClick('input')}
          onUpdateMaskImage={onUpdateMaskImage}
          materialTexturesPanel={isMaterialReplaceStep ? null : materialTexturesPanel}
          mode={isMaterialReplaceStep ? 'material-replace' : 'local-inpaint'}
          config={state.config}
          resultImageUrl={previewImage}
          resultAssetId={getOriginalResultAssetId(selectedResult)}
          materialTextureUrl={state.materialTextures[0]?.previewUrl || state.materialTextures[0]?.publicUrl || state.materialTextures[0]?.url || null}
          onUpdateConfig={onUpdateConfig}
          editorOpenRequest={maskEditorOpenRequest}
        />
      ) : (
        <ResultPreviewPanel
          state={state}
          originalImageUrl={originalImageUrl}
          previewImage={previewImage}
          providerLabel={providerForStatus || 'provider 待连接'}
          step={step}
          projectName={projectName || selectedProjectId || 'archai-project'}
          resultAssetId={getOriginalResultAssetId(selectedResult)}
          viewModeOptions={viewModeOptions}
          onSetViewMode={onSetViewMode}
          showToolbar
        />
      )}

      <GenerationStatusPanel
        step={step}
        state={state}
        title={resultPanelTitle}
        statusLabel={statusLabel}
        elapsedSeconds={elapsedSeconds}
        canGenerate={canGenerate}
        disabledReason={generateDisabledReason}
        previewImage={previewImage}
        originalImageUrl={originalImageUrl}
        resultOptions={resultOptions}
        selectedResultId={selectedResult?.id || null}
        viewModeOptions={viewModeOptions}
        topPanels={(
          <>
            {isStyleRenderStep ? <StyleSelectorPanel config={state.config} onUpdateConfig={onUpdateConfig} /> : null}
            {isFloorplanStep ? materialTexturesPanel : null}
          </>
        )}
        validationErrors={isMaterialReplaceStep ? previewValidationErrors : undefined}
        projectName={projectName || selectedProjectId || 'archai-project'}
        onGenerate={isMaterialReplaceStep ? handleGeneratePreview : onGenerate}
        onRegenerate={isMaterialReplaceStep ? () => handleGeneratePreview() : onRegenerate}
        onCancelGeneration={onCancelGeneration}
        onSelectGenerationResult={onSelectGenerationResult}
        onToggleGenerationFavorite={onToggleGenerationFavorite}
        onSecondaryEditResult={onSecondaryEditResult}
        onSendResultToStep={onSendResultToStep}
        onRetryBatchItem={variantIndex => onGenerate({ config: { ...state.config, floorplanRetryVariantIndex: variantIndex } })}
        onSetViewMode={onSetViewMode}
        onNextStep={onNextStep}
        onReset={isFloorplanStep ? handleResetFloorPlanAll : onReset}
        resetLabel={isFloorplanStep ? '全部重置' : undefined}
        layout={isFloorplanStep ? 'floor-plan' : 'default'}
      />
      </div>

      <Suspense fallback={null}>
        <MaterialLibrary
          isOpen={isMaterialLibraryOpen}
          onClose={() => setIsMaterialLibraryOpen(false)}
          onSelect={handleSelectLibraryMaterial}
          selectedId={state.materialTextures.find(texture => texture.source === 'library')?.id.replace(/^library-/u, '')}
        />
        <PromptTemplatePanel
          isOpen={isPromptTemplatePanelOpen}
          step={step}
          editTarget={state.config.editTarget}
          currentPrompt={state.config.prompt}
          onApplyPrompt={prompt => onUpdateConfig({ prompt })}
          onClose={() => setIsPromptTemplatePanelOpen(false)}
        />
      </Suspense>
    </div>
  );
}

function revokeBlobUrl(url: string | null | undefined): void {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

function revokeFloorPlanDerivedBlobUrls(state: StepState): void {
  revokeUploadedImagePreview(state.materialImage);
  revokeUploadedImagePreview(state.maskImage);
  state.materialTextures.forEach(texture => revokeBlobUrl(texture.previewUrl));
  state.furnitureReferences.forEach(reference => revokeBlobUrl(reference.previewUrl));
}

function ModelWorkspaceLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-[420px] min-w-0 flex-1 flex-col items-center justify-center gap-4 bg-slate-50 text-slate-500">
      <div className="h-11 w-11 animate-spin rounded-full border-4 border-blue-100 border-t-blue-500" />
      <p className="text-sm font-bold">{label}</p>
    </div>
  );
}

function revokeFloorPlanAllBlobUrls(state: StepState): void {
  revokeUploadedImagePreview(state.inputImage);
  revokeFloorPlanDerivedBlobUrls(state);
}
