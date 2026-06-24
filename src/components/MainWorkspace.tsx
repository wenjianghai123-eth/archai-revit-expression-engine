import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { GenerationConfig, GenerationHistoryItem, GenerationProvider, GenerationRunStateOverride, GenerationStep, MaterialAsset, MaterialTexture, ReferenceImage, ResultSendTargetStep, SecondaryEditAction, StepState, UploadedImage } from '../types';
import { createUploadedImage, validateImageFile } from '../utils/file';
import { getProject, uploadImageAsset } from '../lib/api';
import { GenerationStatusPanel } from './workspace/GenerationStatusPanel';
import { InputImagePanel } from './workspace/InputImagePanel';
import { InpaintMaskPanel } from './workspace/InpaintMaskPanel';
import { PromptConfigPanel } from './workspace/PromptConfigPanel';
import { MaterialTexturesPanel, StyleSelectorPanel } from './workspace/ReferenceImagesPanel';
import { ResultPreviewPanel } from './workspace/ResultPreviewPanel';
import { getOriginalResultAssetId, getOriginalResultImageUrl } from '../utils/resultImage';
import { ModelSnapshotRenderPanel } from './ModelSnapshotRenderPanel';
import { PanoramaQuickRenderPanel } from './PanoramaQuickRenderPanel';
import { DesignVariantsPanel } from './DesignVariantsPanel';
import { PlanColorizePanel } from './PlanColorizePanel';
import { MaterialReplaceConfigPanel } from './MaterialReplaceConfigPanel';
import { ObjectInsertPanel } from './ObjectInsertPanel';
import { FreeReferenceImagePanel } from './FreeReferenceImagePanel';
import { UploadErrors, UploadTarget, ViewModeOption } from './workspace/workspaceTypes';
import { getUploadedImageSrc, isLocalInpaintingStep, maxFurnitureReferences, maxMaterialTextures, readGenerationStatusLabel } from './workspace/workspaceUtils';

const MaterialLibrary = lazy(() => import('./MaterialLibrary').then(module => ({ default: module.MaterialLibrary })));
const PromptTemplatePanel = lazy(() => import('./PromptTemplatePanel').then(module => ({ default: module.PromptTemplatePanel })));

interface WorkspaceProps {
  step: GenerationStep;
  state: StepState;
  selectedProjectId?: string | null;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onUpdateMaterialImage: (image: UploadedImage | null) => void;
  onUpdateMaterialTextures: (textures: MaterialTexture[]) => void;
  onUpdateFurnitureReferences: (references: ReferenceImage[]) => void;
  onUpdateMaskImage: (maskDataUrl: string | null, useFullImage: boolean, feather?: number) => void;
  onGenerate: (stateOverride?: GenerationRunStateOverride) => void;
  onRegenerate: () => void;
  onCancelGeneration: () => void;
  onSelectGenerationResult: (resultId: string) => void;
  onToggleGenerationFavorite: (resultId: string) => void;
  onSecondaryEditResult: (resultId: string, action: SecondaryEditAction) => void;
  onSendResultToStep: (resultId: string, targetStep: ResultSendTargetStep) => void;
  onContinueObjectInsertRefine: (image: UploadedImage, source: { resultId?: string; label: string }) => void;
  onRenameGenerationResult: (resultId: string, variantName: string) => void;
  onSetViewMode: (viewMode: StepState['viewMode']) => void;
  onNextStep: () => void;
  onReset: () => void;
  onHistoryRecord?: (record: GenerationHistoryItem) => void;
  backendProvider: GenerationProvider | null;
  isCreditsInsufficient: boolean;
  estimatedCreditCost: number;
  isAdmin?: boolean;
}

const acceptedImageTypes = 'image/png,image/jpeg,image/webp';

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
  onSetViewMode,
  onNextStep,
  onReset,
  onHistoryRecord,
  backendProvider,
  isCreditsInsufficient,
  estimatedCreditCost,
  isAdmin = false,
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

  const isFloorplanStep = step === GenerationStep.FloorplanTo3D;
  const isStyleRenderStep = step === GenerationStep.StyleRender;
  const isModelSnapshotStep = step === GenerationStep.ModelSnapshotRender;
  const isDesignVariantsStep = step === GenerationStep.DesignVariants;
  const isPlanColorizeStep = step === GenerationStep.PlanColorize;
  const isMaterialReplaceStep = step === GenerationStep.MaterialReplace;
  const isPanoramaQuickRenderStep = step === GenerationStep.PanoramaQuickRender;
  const isObjectInsertStep = step === GenerationStep.ObjectInsert;
  const isFreeReferenceImageStep = step === GenerationStep.FreeReferenceImage;
  const materialReplaceEditMode = state.config.editMode === 'mask' ? 'mask' : 'smart-type';
  const hasMaterialReplaceTarget = Boolean(state.config.targetMaterial || state.materialTextures.length > 0 || (state.config.customMaterialPrompt || '').trim());
  const hasMaskSelection = Boolean(state.maskImage?.dataUrl || state.useFullImageMask);
  const hasMaterialReplaceObject = Boolean(state.config.targetObjectType);
  const canGenerate = Boolean(state.inputImage)
    && !state.isGenerating
    && !isCreditsInsufficient
    && (!isMaterialReplaceStep || (
      hasMaterialReplaceTarget
      && (materialReplaceEditMode === 'mask' ? hasMaskSelection : hasMaterialReplaceObject)
    ));
  const providerForStatus = backendProvider || state.generationProvider;
  const originalImageUrl = state.inputImage ? getUploadedImageSrc(state.inputImage) : null;
  const resultOptions = state.generationResults.length > 0
    ? state.generationResults
    : state.outputImage
      ? [{ id: state.generationResultId || 'legacy-result', imageUrl: state.outputImage, isSelected: true, isFavorite: false }]
      : [];
  const selectedResult = resultOptions.find(result => result.id === state.selectedGenerationResultId)
    || resultOptions.find(result => result.isSelected)
    || resultOptions[0]
    || null;
  const previewImage = getOriginalResultImageUrl(selectedResult, state.outputImage);
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

    const validationError = validateImageFile(file);
    if (validationError) {
      setUploadErrors(prev => ({ ...prev, [target]: validationError }));
      return;
    }

    try {
      const localImage = await createUploadedImage(file);
      let image = localImage;

      try {
        const asset = await uploadImageAsset(file, file.name);
        image = { ...localImage, assetId: asset.id, url: asset.url };
      } catch {
        // Keep dataUrl fallback when backend upload is unavailable.
      }

      if (target === 'input') onUpdateInputImage(image);
      else onUpdateMaterialImage(image);
      setUploadErrors(prev => ({ ...prev, [target]: null }));
    } catch (error) {
      setUploadErrors(prev => ({
        ...prev,
        [target]: error instanceof Error ? error.message : '图片读取失败，请重试。',
      }));
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
      const validationError = validateImageFile(file);
      if (validationError) {
        setUploadErrors(prev => ({ ...prev, furniture: validationError }));
        continue;
      }

      const localImage = await createUploadedImage(file);
      let assetId: string | undefined;
      let url = localImage.dataUrl;

      try {
        const asset = await uploadImageAsset(file, file.name);
        assetId = asset.id;
        url = asset.url;
      } catch {
        // Keep the local preview when backend upload is unavailable.
      }

      nextReferences.push({
        id: `${localImage.id}-furniture`,
        name: localImage.name,
        url,
        dataUrl: localImage.dataUrl,
        assetId,
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
      const validationError = validateImageFile(file);
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
      } catch {
        // Keep the local preview when backend upload is unavailable.
      }

      nextTextures.push({
        id: `${localImage.id}-texture`,
        name: localImage.name,
        url,
        dataUrl: localImage.dataUrl,
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
    onUpdateMaterialTextures(state.materialTextures.filter(texture => texture.id !== id));
    setUploadErrors(prev => ({ ...prev, texture: null }));
  };

  const handleRemoveFurnitureReference = (id: string) => {
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

  if (isDesignVariantsStep) {
    return (
      <div className="workspace-layout workspace-surface flex min-h-0 flex-1 overflow-hidden">
        <input ref={inputFileRef} type="file" accept={acceptedImageTypes} className="hidden" onChange={event => { void handleFileSelected('input', event.currentTarget.files); event.currentTarget.value = ''; }} />
        <DesignVariantsPanel
          state={state}
          resultOptions={resultOptions}
          selectedResultId={selectedResult?.id || null}
          previewImage={previewImage}
          uploadError={uploadErrors.input}
          estimatedCreditCost={estimatedCreditCost}
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
        />
        <GenerationStatusPanel
          step={step}
          state={state}
          title="方案变体结果"
          statusLabel={statusLabel}
          elapsedSeconds={elapsedSeconds}
          canGenerate={canGenerate}
          previewImage={previewImage}
          originalImageUrl={originalImageUrl}
          resultOptions={resultOptions}
          selectedResultId={selectedResult?.id || null}
          viewModeOptions={viewModeOptions}
          topPanels={null}
          estimatedCreditCost={estimatedCreditCost}
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

  if (isPlanColorizeStep) {
    return (
      <div className="workspace-layout workspace-surface flex min-h-0 flex-1 overflow-hidden">
        <input ref={inputFileRef} type="file" accept={acceptedImageTypes} className="hidden" onChange={event => { void handleFileSelected('input', event.currentTarget.files); event.currentTarget.value = ''; }} />
        <PlanColorizePanel
          state={state}
          previewImage={previewImage}
          uploadError={uploadErrors.input}
          onUploadInput={() => handleUploadClick('input')}
          onUpdateInputImage={onUpdateInputImage}
          onUpdateConfig={onUpdateConfig}
          onGenerate={onGenerate}
        />
        <GenerationStatusPanel
          step={step}
          state={state}
          title="图纸智能表达结果"
          statusLabel={statusLabel}
          elapsedSeconds={elapsedSeconds}
          canGenerate={canGenerate}
          previewImage={previewImage}
          originalImageUrl={originalImageUrl}
          resultOptions={resultOptions}
          selectedResultId={selectedResult?.id || null}
          viewModeOptions={viewModeOptions}
          topPanels={null}
          estimatedCreditCost={estimatedCreditCost}
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

  if (isModelSnapshotStep) {
    return (
      <div className="workspace-layout workspace-surface flex min-h-0 flex-1 overflow-hidden">
        <ModelSnapshotRenderPanel
          state={state}
          onUpdateConfig={onUpdateConfig}
          onUpdateInputImage={onUpdateInputImage}
          onGenerate={onGenerate}
        />
        <GenerationStatusPanel
          step={step}
          state={state}
          title={resultPanelTitle}
          statusLabel={statusLabel}
          elapsedSeconds={elapsedSeconds}
          canGenerate={Boolean(state.inputImage) && !state.isGenerating && !isCreditsInsufficient}
          previewImage={previewImage}
          originalImageUrl={originalImageUrl}
          resultOptions={resultOptions}
          selectedResultId={selectedResult?.id || null}
          viewModeOptions={viewModeOptions}
          topPanels={null}
          estimatedCreditCost={estimatedCreditCost}
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
      />
    );
  }

  return (
    <div className="workspace-layout workspace-surface flex min-h-0 flex-1 overflow-hidden p-3">
      <input ref={inputFileRef} type="file" accept={acceptedImageTypes} className="hidden" onChange={event => { void handleFileSelected('input', event.currentTarget.files); event.currentTarget.value = ''; }} />
      <input ref={materialFileRef} type="file" accept={acceptedImageTypes} className="hidden" onChange={event => { void handleFileSelected('material', event.currentTarget.files); event.currentTarget.value = ''; }} />
      <input ref={materialTextureFileRef} type="file" accept={acceptedImageTypes} multiple className="hidden" onChange={event => { void handleTextureFiles(event.currentTarget.files); event.currentTarget.value = ''; }} />
      <input ref={furnitureReferenceFileRef} type="file" accept={acceptedImageTypes} multiple className="hidden" onChange={event => { void handleFurnitureReferenceFiles(event.currentTarget.files); event.currentTarget.value = ''; }} />

      <aside className="workspace-side-panel glass-panel flex w-80 shrink-0 flex-col overflow-y-auto rounded-l-3xl border border-white/60 p-4 custom-scrollbar">
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
        <div className="mt-5 space-y-5">
          {!isMaterialReplaceStep ? (
            <PromptConfigPanel
              step={step}
              config={state.config}
              isFloorplanStep={isFloorplanStep}
              compactInpaint={isLocalInpaintingStep(step)}
              onUpdateConfig={onUpdateConfig}
              onOpenPromptTemplatePanel={() => setIsPromptTemplatePanelOpen(true)}
            />
          ) : null}
          {isMaterialReplaceStep ? (
            <MaterialReplaceConfigPanel config={state.config} materialReferenceCount={state.materialTextures.length} onUpdateConfig={onUpdateConfig} />
          ) : null}
        </div>
      </aside>

      {step === GenerationStep.LocalInpainting || (isMaterialReplaceStep && materialReplaceEditMode === 'mask') ? (
        <InpaintMaskPanel
          inputImage={state.inputImage}
          maskImageDataUrl={state.maskImage?.dataUrl || null}
          useFullImageMask={state.useFullImageMask}
          providerForStatus={providerForStatus}
          onUploadInput={() => handleUploadClick('input')}
          onUpdateMaskImage={onUpdateMaskImage}
          materialTexturesPanel={materialTexturesPanel}
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
        previewImage={previewImage}
        originalImageUrl={originalImageUrl}
        resultOptions={resultOptions}
        selectedResultId={selectedResult?.id || null}
        viewModeOptions={viewModeOptions}
        topPanels={(
          <>
            {isStyleRenderStep ? <StyleSelectorPanel config={state.config} onUpdateConfig={onUpdateConfig} /> : null}
            {isFloorplanStep || isMaterialReplaceStep ? materialTexturesPanel : null}
          </>
        )}
        estimatedCreditCost={estimatedCreditCost}
        projectName={projectName || selectedProjectId || 'archai-project'}
        onGenerate={onGenerate}
        onRegenerate={onRegenerate}
        onCancelGeneration={onCancelGeneration}
        onSelectGenerationResult={onSelectGenerationResult}
        onToggleGenerationFavorite={onToggleGenerationFavorite}
        onSecondaryEditResult={onSecondaryEditResult}
        onSendResultToStep={onSendResultToStep}
        onRetryBatchItem={variantIndex => onGenerate({ config: { ...state.config, floorplanRetryVariantIndex: variantIndex } })}
        onSetViewMode={onSetViewMode}
        onNextStep={onNextStep}
        onReset={onReset}
      />

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
