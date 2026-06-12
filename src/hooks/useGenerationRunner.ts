import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { generateFloorplanTo3D, generateInpainting, generateStyleRender } from '../api/generation';
import { buildSmartPrompt, readSmartPromptUserSupplement, type SmartPromptMode } from '../promptTemplates/intelligentPromptTemplates';
import { resolvePlanColorizeStyles } from '../constants/planColorizeStyles';
import { resolveFloorplanBatchCount, resolveFloorplanVariantPlans } from '../constants/floorplanVariants';
import { saveGenerationRecord } from '../storage/history';
import {
  createGenerationJob,
  createProjectGeneration,
  getGenerationJob,
  getImageAsset,
  getProject,
  listProjectGenerations,
  uploadImageAsset,
  type CreditBalance,
} from '../lib/api';
import { GenerationBatchItem, GenerationConfig, GenerationHistoryItem, GenerationJobStep, GenerationMode, GenerationProvider, GenerationResultOption, GenerationRunStateOverride, GenerationStep, ObjectInsertDebugMode, ObjectInsertHarmonyPriority, ObjectInsertItemConfig, ObjectInsertPlacementMode, ObjectInsertPositionConstraintStrength, StepState, UploadedImage, VariantStyleKey } from '../types';
import { getGenerationCreditCost } from '../utils/generationCredits';
import { isGenerationJobRunningStatus, normalizeGenerationJobResult } from '../utils/generationJobResult';

interface UseGenerationRunnerOptions {
  currentStep: GenerationStep;
  ensureActiveProject: () => Promise<EnsureActiveProjectResult>;
  stepStates: Record<GenerationStep, StepState>;
  setStepStates: Dispatch<SetStateAction<Record<GenerationStep, StepState>>>;
  creditBalance: CreditBalance | null;
  refreshCreditBalance: () => Promise<void>;
  setHistoryItems: Dispatch<SetStateAction<GenerationHistoryItem[]>>;
}

interface EnsureActiveProjectResult {
  projectId: string;
  projectName?: string;
  wasCreated: boolean;
}

export function useGenerationRunner({
  currentStep,
  ensureActiveProject,
  stepStates,
  setStepStates,
  creditBalance,
  refreshCreditBalance,
  setHistoryItems,
}: UseGenerationRunnerOptions) {
  const estimatedCreditCost = getGenerationCreditCost(getGenerationRecordMode(currentStep), stepStates[currentStep].config);
  const isCreditsInsufficient = Boolean(creditBalance && creditBalance.balance < estimatedCreditCost);

  const handleGenerate = useCallback(async (stateOverride?: GenerationRunStateOverride) => {
    const baseState = stepStates[currentStep];
    const stateAtStart: StepState = stateOverride
      ? {
          ...baseState,
          ...stateOverride,
          config: {
            ...baseState.config,
            ...(stateOverride.config || {}),
          },
      }
      : baseState;
    const requiredCredits = getGenerationCreditCost(getGenerationRecordMode(currentStep), stateAtStart.config);
    if (creditBalance && creditBalance.balance < requiredCredits) {
      setStepStates(prev => ({
        ...prev,
        [currentStep]: {
          ...prev[currentStep],
          generationStatus: 'error',
          generationError: `剩余额度不足，本次需要 ${requiredCredits} credits。升级套餐入口将在商业化版本开放。`,
        }
      }));
      return;
    }

    if (currentStep === GenerationStep.MaterialReplace && !stateAtStart.inputImage) {
      setStepStates(prev => ({
        ...prev,
        [currentStep]: {
          ...prev[currentStep],
          generationStatus: 'error',
          generationError: '请先上传或选择一张图片。',
        }
      }));
      return;
    }

    if (!stateAtStart.inputImage) {
      setStepStates(prev => ({
        ...prev,
        [currentStep]: {
          ...prev[currentStep],
          generationStatus: 'error',
          generationError: currentStep === GenerationStep.ModelSnapshotRender ? '请先截取或上传一张模型截图。' : '请先上传图片后再生成预览。',
        }
      }));
      return;
    }

    if (currentStep === GenerationStep.ObjectInsert) {
      const debugMode = readObjectInsertDebugMode(stateAtStart.config);
      const needsObject = objectInsertIncludesObject(debugMode);
      const needsPreview = objectInsertIncludesPreview(debugMode);
      const needsMask = objectInsertIncludesMask(debugMode);
      const needsPlacement = needsPreview || needsMask;
      const objectReferenceAssetId = readObjectReferenceAssetId(stateAtStart);
      const placementPreviewAssetId = readObjectInsertPreviewAssetId(stateAtStart.config);
      const placementMaskAssetId = readObjectInsertMaskAssetId(stateAtStart.config);
      const objectPlacement = readObjectInsertPlacement(stateAtStart.config);
      const objectItems = readObjectInsertItems(stateAtStart.config);
      const hasObjectItems = objectItems.length > 0;
      const objectItemsHaveReference = objectItems.some(item => item.referenceAssetIds.length > 0);
      const hasPlacement = Boolean(objectPlacement?.width && objectPlacement.height);
      const missingMessage = !stateAtStart.inputImage.assetId
          ? '原始场景图尚未上传为素材，请重新上传原图。'
        : needsObject && !stateAtStart.materialImage && !objectItemsHaveReference
          ? '请先上传物体参考图。'
        : needsObject && !objectReferenceAssetId && !objectItemsHaveReference
          ? '物体参考图尚未上传为素材，请重新上传物体图。'
        : needsPreview && !placementPreviewAssetId && !hasObjectItems
          ? 'placement guide 尚未上传，请先点击生成融合效果图重新准备任务。'
        : needsMask && !placementMaskAssetId && !hasObjectItems
          ? 'placement mask 尚未上传，请先点击生成融合效果图重新准备任务。'
        : needsPlacement && !hasPlacement && !hasObjectItems
          ? '请先在画布中摆放物体位置。'
        : '';

      if (missingMessage) {
        setStepStates(prev => ({
          ...prev,
          [currentStep]: {
            ...prev[currentStep],
            generationStatus: 'error',
            generationError: missingMessage,
            generationLogs: [...prev[currentStep].generationLogs, `error: ${missingMessage}`].slice(-8),
          },
        }));
        return;
      }
    }

    const materialReplaceEditMode = stateAtStart.config.editMode === 'mask' ? 'mask' : 'smart-type';
    const hasMaterialReplaceTarget = Boolean(
      stateAtStart.config.targetMaterial ||
      stateAtStart.materialTextures.length > 0 ||
      (stateAtStart.config.customMaterialPrompt || '').trim(),
    );

    if (currentStep === GenerationStep.MaterialReplace && materialReplaceEditMode === 'smart-type' && !stateAtStart.config.targetObjectType) {
      setStepStates(prev => ({
        ...prev,
        [currentStep]: {
          ...prev[currentStep],
          generationStatus: 'error',
          generationError: '请选择要替换的区域类型',
        }
      }));
      return;
    }

    if (currentStep === GenerationStep.MaterialReplace && materialReplaceEditMode === 'mask' && !stateAtStart.maskImage?.dataUrl && !stateAtStart.useFullImageMask) {
      setStepStates(prev => ({
        ...prev,
        [currentStep]: {
          ...prev[currentStep],
          generationStatus: 'error',
          generationError: '请先选择需要替换的区域。',
        }
      }));
      return;
    }

    if (
      currentStep === GenerationStep.MaterialReplace &&
      !hasMaterialReplaceTarget
    ) {
      setStepStates(prev => ({
        ...prev,
        [currentStep]: {
          ...prev[currentStep],
          generationStatus: 'error',
          generationError: '请选择目标材质，或输入想要替换成什么效果。',
        }
      }));
      return;
    }

    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        isGenerating: true,
        generationStatus: 'uploading',
        generationError: null,
        generationWarnings: [],
        generationProvider: null,
        generationResultId: null,
        generationCreatedAt: new Date().toISOString(),
        generationJobId: null,
        generationJobStatus: null,
        generationJobDiagnostics: null,
        generationProgress: 0,
        generationLogs: [],
      }
    }));

    await new Promise(resolve => setTimeout(resolve, 120));

    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        generationStatus: 'generating',
        generationLogs: [...prev[currentStep].generationLogs, 'generating: 准备生成任务。'],
      }
    }));

    let activeProject: EnsureActiveProjectResult;
    try {
      activeProject = await ensureActiveProject();
    } catch (error) {
      const message = error instanceof Error ? error.message : '自动创建项目失败，请稍后重试或手动创建项目。';
      setStepStates(prev => ({
        ...prev,
        [currentStep]: {
          ...prev[currentStep],
          isGenerating: false,
          generationStatus: 'error',
          generationError: message,
          generationJobStatus: 'failed',
          generationProgress: 100,
          generationLogs: [...prev[currentStep].generationLogs, `error: ${message}`].slice(-8),
        },
      }));
      return;
    }

    const activeProjectId = activeProject.projectId;
    const autoProjectNotice = activeProject.wasCreated && activeProject.projectName
      ? `已自动创建项目 ${activeProject.projectName}`
      : null;
    let activeProjectName = activeProject.projectName || null;
    if (!activeProjectName && activeProjectId) {
      try {
        activeProjectName = (await getProject(activeProjectId)).name;
      } catch {
        activeProjectName = null;
      }
    }
    if (autoProjectNotice) {
      setStepStates(prev => ({
        ...prev,
        [currentStep]: {
          ...prev[currentStep],
          generationWarnings: [...prev[currentStep].generationWarnings, autoProjectNotice],
          generationLogs: [...prev[currentStep].generationLogs, `project: ${autoProjectNotice}`].slice(-8),
        },
      }));
    }

    const canUseAsyncJob = Boolean(
      activeProjectId &&
      stateAtStart.inputImage.assetId,
    );
    if (import.meta.env.DEV && currentStep === GenerationStep.PanoramaQuickRender) {
      console.debug('[PanoramaQuickRender] generation runner preflight', {
        selectedProjectId: activeProjectId,
        inputImageAssetId: stateAtStart.inputImage.assetId,
        inputImageId: stateAtStart.inputImage.id,
        configPanoramaAssetId: stateAtStart.config.panoramaAssetId,
        canUseAsyncJob,
        willCreateGenerationJob: canUseAsyncJob,
      });
    }

    if (canUseAsyncJob && activeProjectId && stateAtStart.inputImage.assetId) {
      try {
        const generationMode = getGenerationRecordMode(currentStep);
        const generationStep = getGenerationJobStep(currentStep);
        const promptForRequest = buildPromptForGeneration(currentStep, stateAtStart.config.prompt, stateAtStart);
        const userSupplementPrompt = readSupplementalPromptForGeneration(currentStep, stateAtStart.config);
        const configForRequest = buildConfigForGeneration(currentStep, stateAtStart.config);
        const targetSizeConfig = buildTargetSizeConfig(stateAtStart.inputImage);
        const isPanoramaQuickRender = currentStep === GenerationStep.PanoramaQuickRender;
        const isObjectInsert = currentStep === GenerationStep.ObjectInsert;
        const isFreeReferenceImage = currentStep === GenerationStep.FreeReferenceImage;
        const isPlanColorize = currentStep === GenerationStep.PlanColorize;
        const isFloorplanMultiPlan = currentStep === GenerationStep.FloorplanTo3D
          && stateAtStart.config.floorplanOutputMode === 'multi';
        const freeReferenceTargetSizeConfig = isFreeReferenceImage
          ? buildFreeReferenceTargetSizeConfig(stateAtStart.config)
          : {};
        const freeReferenceAssetIds = isFreeReferenceImage
          ? readConfigStringArray(stateAtStart.config.referenceImageAssetIds).slice(0, 6)
          : [];
        const planColorizeStyles = isPlanColorize
          ? resolvePlanColorizeStyles(
              stateAtStart.config.planColorizeBatchEnabled
                ? stateAtStart.config.planColorizeStyleIds
                : stateAtStart.config.selectedStyleId || stateAtStart.config.planColorizeStyleIds?.[0],
              stateAtStart.config.selectedStyleId,
            )
          : [];
        const planColorizeBatchGroupId = isPlanColorize
          ? stateAtStart.config.batchGroupId || createBatchGroupId('plan-colorize')
          : undefined;
        const floorplanBatchCount = isFloorplanMultiPlan ? resolveFloorplanBatchCount(stateAtStart.config.batchCount) : 1;
        const floorplanBatchGroupId = isFloorplanMultiPlan
          ? stateAtStart.config.batchGroupId || createBatchGroupId('floorplan-multi')
          : undefined;
        const floorplanVariantPlans = isFloorplanMultiPlan
          ? resolveFloorplanVariantPlans({ ...stateAtStart.config, batchCount: floorplanBatchCount }, floorplanBatchCount)
          : [];
        const objectInsertDebugMode = isObjectInsert ? readObjectInsertDebugMode(stateAtStart.config) : 'full';
        const objectInsertNeedsObject = objectInsertIncludesObject(objectInsertDebugMode);
        const objectInsertNeedsPreview = objectInsertIncludesPreview(objectInsertDebugMode);
        const objectInsertNeedsMask = objectInsertIncludesMask(objectInsertDebugMode);
        const objectInsertPositionConstraintStrength = isObjectInsert ? readObjectInsertPositionConstraintStrength(stateAtStart.config) : 'high';
        const objectInsertPlacementMode = isObjectInsert ? readObjectInsertPlacementMode(stateAtStart.config) : 'natural';
        const objectInsertPlacementIntent = isObjectInsert ? readObjectInsertPlacementIntent(stateAtStart.config) : '';
        const objectInsertHarmonyPriority = isObjectInsert ? readObjectInsertHarmonyPriority(stateAtStart.config) : 'layout';
        const objectInsertAllowAutoAdjustPosition = isObjectInsert ? readObjectInsertAutoAdjust(stateAtStart.config, 'allowAutoAdjustPosition') : true;
        const objectInsertAllowAutoAdjustRotation = isObjectInsert ? readObjectInsertAutoAdjust(stateAtStart.config, 'allowAutoAdjustRotation') : true;
        const objectInsertAllowAutoAdjustScale = isObjectInsert ? readObjectInsertAutoAdjust(stateAtStart.config, 'allowAutoAdjustScale') : true;
        const panoramaReferenceAssetIds = isPanoramaQuickRender
          ? readConfigStringArray(stateAtStart.config.panoramaReferenceAssetIds).slice(0, 6)
          : [];
        const objectReferenceAssetId = isObjectInsert
          ? readObjectReferenceAssetId(stateAtStart)
          : undefined;
        const placementPreviewAssetId = isObjectInsert ? readObjectInsertPreviewAssetId(stateAtStart.config) : undefined;
        const placementMaskAssetId = isObjectInsert ? readObjectInsertMaskAssetId(stateAtStart.config) : undefined;
        const objectPlacement = isObjectInsert ? readObjectInsertPlacement(stateAtStart.config) : undefined;
        const objectInsertItems = isObjectInsert ? readObjectInsertItems(stateAtStart.config) : [];
        const objectInsertConfig = isObjectInsert && (objectPlacement || objectInsertItems.length > 0)
          ? {
              sourceImageAssetId: stateAtStart.inputImage.assetId,
              objectItems: objectInsertItems.length > 0 ? objectInsertItems : undefined,
              globalExtraPrompt: stateAtStart.config.objectInsertExtraPrompt || stateAtStart.config.customPrompt || '',
              objectReferenceAssetId: objectInsertNeedsObject ? objectReferenceAssetId : undefined,
              guideAssetId: objectInsertNeedsPreview ? placementPreviewAssetId : undefined,
              previewAssetId: objectInsertNeedsPreview ? placementPreviewAssetId : undefined,
              maskAssetId: objectInsertNeedsMask ? placementMaskAssetId : undefined,
              placement: objectPlacement || objectInsertItems[0]?.placement || { x: 0, y: 0, width: 0, height: 0, rotation: 0 },
              extraPrompt: stateAtStart.config.objectInsertExtraPrompt || stateAtStart.config.customPrompt || '',
              debugMode: objectInsertDebugMode,
              positionConstraintStrength: objectInsertPositionConstraintStrength,
              placementMode: objectInsertPlacementMode,
              placementIntent: objectInsertPlacementIntent,
              harmonyPriority: objectInsertHarmonyPriority,
              allowAutoAdjustPosition: objectInsertAllowAutoAdjustPosition,
              allowAutoAdjustRotation: objectInsertAllowAutoAdjustRotation,
              allowAutoAdjustScale: objectInsertAllowAutoAdjustScale,
            }
          : undefined;
        const furnitureReferenceAssetIds = stateAtStart.furnitureReferences
          .map(reference => reference.assetId)
          .filter((assetId): assetId is string => Boolean(assetId));
        let inputAssetIds = Array.from(new Set([
          stateAtStart.inputImage.assetId,
          ...(stateAtStart.materialImage?.assetId ? [stateAtStart.materialImage.assetId] : []),
          ...stateAtStart.materialTextures
            .map(texture => texture.assetId)
            .filter((assetId): assetId is string => Boolean(assetId)),
          ...furnitureReferenceAssetIds,
        ]));
        let maskAssetId: string | undefined;
        const hasPaintedMask = Boolean(stateAtStart.maskImage?.dataUrl);
        const isMaskedEditStep = currentStep === GenerationStep.LocalInpainting
          || (currentStep === GenerationStep.MaterialReplace && materialReplaceEditMode === 'mask');
        const maskMode = isObjectInsert
          ? objectInsertNeedsMask ? 'asset-mask' : undefined
          : isMaskedEditStep
          ? stateAtStart.useFullImageMask
            ? 'full-image'
            : hasPaintedMask
              ? 'asset-mask'
              : undefined
          : undefined;
        if (isObjectInsert) {
          maskAssetId = objectInsertNeedsMask ? placementMaskAssetId : undefined;
        }
        if (isMaskedEditStep && maskMode === 'asset-mask' && stateAtStart.maskImage?.dataUrl) {
          const maskFile = dataUrlToFile(stateAtStart.maskImage.dataUrl, `archai-mask-${Date.now()}`);
          const maskAsset = await uploadImageAsset(maskFile, maskFile.name);
          maskAssetId = maskAsset.id;
          inputAssetIds = Array.from(new Set([...inputAssetIds, maskAsset.id]));
        }
        if (isPanoramaQuickRender) {
          inputAssetIds = [
            stateAtStart.inputImage.assetId,
            ...panoramaReferenceAssetIds.filter(assetId => assetId !== stateAtStart.inputImage?.assetId),
          ];
        }
        if (isObjectInsert) {
          const multiObjectAssetIds = objectInsertItems.flatMap(item => [
            ...(objectInsertNeedsObject ? item.referenceAssetIds : []),
            objectInsertNeedsPreview ? item.placementPreviewAssetId : undefined,
            objectInsertNeedsMask ? item.placementMaskAssetId : undefined,
          ]).filter((assetId): assetId is string => Boolean(assetId));
          inputAssetIds = [
            stateAtStart.inputImage.assetId,
            ...(multiObjectAssetIds.length > 0
              ? multiObjectAssetIds
              : [
                  objectInsertNeedsObject ? objectReferenceAssetId : undefined,
                  objectInsertNeedsPreview ? placementPreviewAssetId : undefined,
                  objectInsertNeedsMask ? placementMaskAssetId : undefined,
                ].filter((assetId): assetId is string => Boolean(assetId))),
          ];
        }
        if (isFreeReferenceImage) {
          inputAssetIds = [
            stateAtStart.inputImage.assetId,
            ...(freeReferenceAssetIds.length > 0
              ? freeReferenceAssetIds
              : [stateAtStart.materialImage?.assetId || stateAtStart.config.referenceImageAssetId]),
          ].filter((assetId): assetId is string => Boolean(assetId));
        }
        if (isFloorplanMultiPlan) {
          await runFloorplanMultiPlanJobs({
            activeProjectId,
            activeProjectName,
            inputAssetIds: [stateAtStart.inputImage.assetId],
            stateAtStart,
            currentStep,
            generationMode,
            generationStep,
            userSupplementPrompt,
            configForRequest,
            targetSizeConfig,
            floorplanBatchGroupId,
            floorplanVariantPlans,
            retryVariantIndex: stateAtStart.config.floorplanRetryVariantIndex,
            setStepStates,
            setHistoryItems,
            refreshCreditBalance,
          });
          return;
        }
        if (import.meta.env.DEV) {
          console.debug('[GenerationRunner] POST /api/generation-jobs', {
            mode: generationMode,
            step: generationStep,
            currentStep,
            projectId: activeProjectId,
            inputAssetIds,
            panoramaAssetId: isPanoramaQuickRender ? stateAtStart.inputImage.assetId : undefined,
            panoramaReferenceAssetIds: isPanoramaQuickRender ? panoramaReferenceAssetIds : undefined,
            objectInsert: isObjectInsert ? {
              debugMode: objectInsertDebugMode,
              objectReferenceAssetId,
              placementPreviewAssetId,
              placementMaskAssetId,
              placement: objectPlacement,
              positionConstraintStrength: objectInsertPositionConstraintStrength,
              placementMode: objectInsertPlacementMode,
              placementIntent: objectInsertPlacementIntent,
              harmonyPriority: objectInsertHarmonyPriority,
              allowAutoAdjustPosition: objectInsertAllowAutoAdjustPosition,
              allowAutoAdjustRotation: objectInsertAllowAutoAdjustRotation,
              allowAutoAdjustScale: objectInsertAllowAutoAdjustScale,
            } : undefined,
            freeReferenceImage: isFreeReferenceImage ? {
              sourceImageAssetId: stateAtStart.inputImage.assetId,
              referenceImageAssetIds: freeReferenceAssetIds,
              prompt: userSupplementPrompt,
              resolution: stateAtStart.config.freeReferenceResolution || 1024,
              aspectRatio: stateAtStart.config.freeReferenceAspectRatio || '1:1',
              willCallCreateGenerationJob: true,
            } : undefined,
            willCreateGenerationJob: true,
          });
        }
        const job = await createGenerationJob({
          projectId: activeProjectId,
          mode: generationMode,
          step: generationStep,
          prompt: promptForRequest,
            config: {
              ...configForRequest,
              ...targetSizeConfig,
              ...freeReferenceTargetSizeConfig,
              mode: generationMode,
              step: generationStep,
            qualityMode: stateAtStart.config.qualityMode || 'balanced',
            batchCount: currentStep === GenerationStep.DesignVariants && (stateAtStart.config.batchCount === 2 || stateAtStart.config.batchCount === 4 || stateAtStart.config.batchCount === 8)
              ? stateAtStart.config.batchCount
              : isPlanColorize
                ? Math.min(Math.max(planColorizeStyles.length || 1, 1), 6) as GenerationConfig['batchCount']
                : isFloorplanMultiPlan
                  ? floorplanBatchCount
                : 1,
            variantStrategy: currentStep === GenerationStep.DesignVariants ? stateAtStart.config.variantStrategy || 'style-matrix' : undefined,
            stylePackId: currentStep === GenerationStep.DesignVariants ? stateAtStart.config.stylePackId || 'interior-common' : undefined,
            variantStyles: currentStep === GenerationStep.DesignVariants ? resolveVariantStyles(stateAtStart.config) : undefined,
            variantNames: currentStep === GenerationStep.DesignVariants
              ? resolveVariantNames(stateAtStart.config)
              : isFloorplanMultiPlan
                ? floorplanVariantPlans.map(plan => plan.variantName)
                : undefined,
            customStyleLabel: currentStep === GenerationStep.DesignVariants ? stateAtStart.config.customStyleLabel : undefined,
            planColorizeBatchEnabled: isPlanColorize ? planColorizeStyles.length > 1 || stateAtStart.config.planColorizeBatchEnabled === true : undefined,
            planColorizeStyleIds: isPlanColorize ? planColorizeStyles.map(style => style.id) : undefined,
            planColorizeStyleNames: isPlanColorize ? planColorizeStyles.map(style => style.name) : undefined,
            planColorizeStylePromptHints: isPlanColorize ? planColorizeStyles.map(style => style.promptHint) : undefined,
            selectedStyleId: isPlanColorize ? planColorizeStyles[0]?.id : undefined,
            selectedStyleName: isPlanColorize ? planColorizeStyles[0]?.name : undefined,
            selectedStylePromptHint: isPlanColorize ? planColorizeStyles[0]?.promptHint : undefined,
            batchGroupId: isPlanColorize ? planColorizeBatchGroupId : isFloorplanMultiPlan ? floorplanBatchGroupId : undefined,
            floorplanOutputMode: currentStep === GenerationStep.FloorplanTo3D ? stateAtStart.config.floorplanOutputMode || 'single' : undefined,
            floorplanVariantType: isFloorplanMultiPlan ? stateAtStart.config.floorplanVariantType || 'material_style' : undefined,
            floorplanVariantFocus: isFloorplanMultiPlan ? stateAtStart.config.floorplanVariantFocus || 'material_style' : undefined,
            floorplanStyleTemplateIds: isFloorplanMultiPlan ? floorplanVariantPlans.map(plan => plan.selectedStyleId).filter((id): id is string => Boolean(id)) : undefined,
            floorplanStyleTemplateNames: isFloorplanMultiPlan ? floorplanVariantPlans.map(plan => plan.selectedStyleName).filter((name): name is string => Boolean(name)) : undefined,
            floorplanLayoutVariantIds: isFloorplanMultiPlan ? floorplanVariantPlans.map(plan => plan.layoutVariantId).filter((id): id is string => Boolean(id)) : undefined,
            floorplanLayoutVariantNames: isFloorplanMultiPlan ? floorplanVariantPlans.map(plan => plan.layoutVariantName).filter((name): name is string => Boolean(name)) : undefined,
            userPrompt: userSupplementPrompt,
            editTarget: currentStep === GenerationStep.MaterialReplace
              ? 'material'
              : currentStep === GenerationStep.ObjectInsert
                ? 'furniture'
              : currentStep === GenerationStep.LocalInpainting ? stateAtStart.config.editTarget || 'general' : stateAtStart.config.editTarget,
            strength: currentStep === GenerationStep.DesignVariants
              ? stateAtStart.config.strength || 'balanced'
              : currentStep === GenerationStep.MaterialReplace
                ? stateAtStart.config.strength || 'balanced'
              : stateAtStart.config.strength || stateAtStart.config.inpaintingStrength || 'medium',
            preserveStructure: Boolean(stateAtStart.config.preserveStructure ?? stateAtStart.config.keepOriginalMaterial),
            preserveCamera: currentStep === GenerationStep.DesignVariants ? stateAtStart.config.preserveCamera ?? true : undefined,
            feather: stateAtStart.config.feather ?? 0,
            editMode: currentStep === GenerationStep.MaterialReplace ? materialReplaceEditMode : undefined,
            maskMode,
            maskAssetId,
            sourceModelAssetId: stateAtStart.config.sourceModelAssetId,
            sourceImageAssetId: stateAtStart.inputImage.assetId,
            snapshotAssetId: currentStep === GenerationStep.ModelSnapshotRender ? stateAtStart.inputImage.assetId : undefined,
            panoramaAssetId: currentStep === GenerationStep.PanoramaQuickRender ? stateAtStart.inputImage.assetId : undefined,
            panoramaSourceAssetId: isPanoramaQuickRender ? stateAtStart.inputImage.assetId : undefined,
            panoramaReferenceAssetIds: isPanoramaQuickRender ? panoramaReferenceAssetIds : undefined,
            panoramaReferenceTypes: isPanoramaQuickRender ? stateAtStart.config.panoramaReferenceTypes : undefined,
            panoramaReferenceMode: isPanoramaQuickRender && panoramaReferenceAssetIds.length > 0 ? 'reference_guided' : undefined,
            panoramaReferenceStrength: isPanoramaQuickRender ? stateAtStart.config.panoramaReferenceStrength || 'medium' : undefined,
            objectReferenceAssetId: isObjectInsert && objectInsertNeedsObject ? objectReferenceAssetId : undefined,
            placementGuideAssetId: isObjectInsert && objectInsertNeedsPreview ? placementPreviewAssetId : undefined,
            placementPreviewAssetId: isObjectInsert && objectInsertNeedsPreview ? placementPreviewAssetId : undefined,
            placementMaskAssetId: isObjectInsert && objectInsertNeedsMask ? placementMaskAssetId : undefined,
            objectPlacement: isObjectInsert ? objectPlacement : undefined,
            objectInsert: objectInsertConfig,
            objectInsertDebugMode: isObjectInsert ? objectInsertDebugMode : undefined,
            positionConstraintStrength: isObjectInsert ? objectInsertPositionConstraintStrength : undefined,
            placementMode: isObjectInsert ? objectInsertPlacementMode : undefined,
            placementIntent: isObjectInsert ? objectInsertPlacementIntent : undefined,
            harmonyPriority: isObjectInsert ? objectInsertHarmonyPriority : undefined,
            allowAutoAdjustPosition: isObjectInsert ? objectInsertAllowAutoAdjustPosition : undefined,
            allowAutoAdjustRotation: isObjectInsert ? objectInsertAllowAutoAdjustRotation : undefined,
            allowAutoAdjustScale: isObjectInsert ? objectInsertAllowAutoAdjustScale : undefined,
            objectInsertExtraPrompt: isObjectInsert ? stateAtStart.config.objectInsertExtraPrompt || stateAtStart.config.customPrompt : undefined,
            referenceImageAssetId: isFreeReferenceImage ? freeReferenceAssetIds[0] || stateAtStart.materialImage?.assetId || stateAtStart.config.referenceImageAssetId : undefined,
            referenceImageAssetIds: isFreeReferenceImage ? freeReferenceAssetIds : undefined,
            freeReferenceResolution: isFreeReferenceImage ? stateAtStart.config.freeReferenceResolution || 1024 : undefined,
            freeReferenceAspectRatio: isFreeReferenceImage ? stateAtStart.config.freeReferenceAspectRatio || '1:1' : undefined,
            inputSource: currentStep === GenerationStep.ModelSnapshotRender ? stateAtStart.config.inputSource : currentStep === GenerationStep.PanoramaQuickRender ? 'panorama-capture' : undefined,
            modelSnapshotMetadata: stateAtStart.config.modelSnapshotMetadata,
            panoramaCapture: currentStep === GenerationStep.PanoramaQuickRender ? stateAtStart.config.panoramaCapture : undefined,
            buildingType: stateAtStart.config.buildingType,
            spaceType: stateAtStart.config.spaceType,
            renderStyle: stateAtStart.config.renderStyle,
            atmosphere: stateAtStart.config.atmosphere,
            smartMaterial: stateAtStart.config.smartMaterial,
            changeStrength: stateAtStart.config.changeStrength,
            panoramaChangeStrength: stateAtStart.config.panoramaChangeStrength,
            panoramaQuality: stateAtStart.config.panoramaQuality,
            customPrompt: stateAtStart.config.customPrompt,
            targetObjectType: currentStep === GenerationStep.MaterialReplace ? stateAtStart.config.targetObjectType : undefined,
            targetMaterial: currentStep === GenerationStep.MaterialReplace ? stateAtStart.config.targetMaterial : undefined,
            customMaterialPrompt: currentStep === GenerationStep.MaterialReplace ? stateAtStart.config.customMaterialPrompt : undefined,
            preserveLighting: currentStep === GenerationStep.MaterialReplace ? stateAtStart.config.preserveLighting ?? true : undefined,
            preserveGeometry: stateAtStart.config.preserveGeometry ?? true,
            materialTextureAssetIds: stateAtStart.materialTextures
              .map(texture => texture.assetId)
              .filter((assetId): assetId is string => Boolean(assetId)),
            materialReferenceAssetIds: stateAtStart.materialTextures
              .map(texture => texture.assetId)
              .filter((assetId): assetId is string => Boolean(assetId)),
            materialTextureSources: stateAtStart.materialTextures.map(texture => ({
              id: texture.id,
              name: texture.name,
              url: texture.url,
              source: texture.source,
              targetObjectType: currentStep === GenerationStep.MaterialReplace ? stateAtStart.config.targetObjectType : undefined,
            })),
            furnitureReferenceAssetIds,
            furnitureReferenceSources: stateAtStart.furnitureReferences.map(reference => ({
              id: reference.id,
              name: reference.name,
              url: reference.url,
              source: reference.source,
            })),
          },
          inputAssetIds,
        });
        if (import.meta.env.DEV) {
          console.debug('[GenerationRunner] POST /api/generation-jobs created', {
            jobId: job.id,
            status: job.status,
            provider: job.provider,
          });
        }
        void refreshCreditBalance();

        setStepStates(prev => ({
          ...prev,
          [currentStep]: {
            ...prev[currentStep],
            generationStatus: 'generating',
            generationJobId: job.id,
            generationJobStatus: job.status,
            generationJobDiagnostics: job.diagnostics || null,
            generationProgress: job.progress,
            generationProvider: parseGenerationProvider(job.provider),
            generationLogs: [...prev[currentStep].generationLogs, `queued: 任务 ${job.id} 已创建。`],
          },
        }));

        let latestJob = job;
        let normalizedJob = normalizeGenerationJobResult(latestJob);
        logGenerationJobPollDebug(job.id, latestJob, normalizedJob, !isGenerationJobRunningStatus(normalizedJob.status));
        const pollStartedAt = Date.now();
        const pollTimeoutMs = 10 * 60 * 1000;
        while (isGenerationJobRunningStatus(normalizedJob.status)) {
          const elapsedMs = Date.now() - pollStartedAt;
          if (elapsedMs >= pollTimeoutMs) {
            latestJob = await getGenerationJob(job.id);
            normalizedJob = normalizeGenerationJobResult(latestJob);
            logGenerationJobPollDebug(job.id, latestJob, normalizedJob, !isGenerationJobRunningStatus(normalizedJob.status));
            if (!isGenerationJobRunningStatus(normalizedJob.status)) break;

            setStepStates(prev => ({
              ...prev,
              [currentStep]: {
                ...prev[currentStep],
                isGenerating: false,
                generationStatus: 'error',
                generationError: '生成时间较长，可稍后在项目记录中查看',
                generationJobStatus: toAsyncGenerationStatus(normalizedJob.status) || prev[currentStep].generationJobStatus,
                generationJobDiagnostics: latestJob.diagnostics || null,
                generationProgress: latestJob.progress,
                generationLogs: [...prev[currentStep].generationLogs, 'timeout: 生成时间较长，可稍后在项目记录中查看'].slice(-8),
              },
            }));
            void refreshCreditBalance();
            return;
          }

          await delay(getGenerationJobPollDelayMs(elapsedMs));
          latestJob = await getGenerationJob(job.id);
          normalizedJob = normalizeGenerationJobResult(latestJob);
          logGenerationJobPollDebug(job.id, latestJob, normalizedJob, !isGenerationJobRunningStatus(normalizedJob.status));
          setStepStates(prev => ({
            ...prev,
            [currentStep]: {
              ...prev[currentStep],
              generationStatus: normalizedJob.status === 'queued'
                ? 'uploading'
                : normalizedJob.status === 'running'
                  ? 'generating'
                  : prev[currentStep].generationStatus,
              generationJobStatus: toAsyncGenerationStatus(normalizedJob.status) || prev[currentStep].generationJobStatus,
              generationJobDiagnostics: latestJob.diagnostics || null,
              generationProgress: normalizedJob.status === 'succeeded' ? 100 : latestJob.progress,
              generationLogs: [
                ...prev[currentStep].generationLogs,
                `${readJobPhaseLabel(latestJob.diagnostics?.phase, normalizedJob.status)}: 任务进度 ${normalizedJob.status === 'succeeded' ? 100 : latestJob.progress}%`,
              ].slice(-8),
            },
          }));
        }

        if (normalizedJob.status === 'succeeded') {
          void refreshCreditBalance();
          const providerName = parseGenerationProvider(latestJob.provider);
          const materializedResultImages = await materializeNormalizedResultImages(normalizedJob, latestJob);
          const generationResults = materializedResultImages.map((result, index) => ({
                id: result.id,
                imageUrl: result.imageUrl,
                assetId: result.assetId || normalizedJob.outputAssetIds[index],
                isSelected: result.isSelected,
                isFavorite: result.isFavorite,
                createdAt: result.createdAt,
                metadata: result.metadata,
                variantIndex: currentStep === GenerationStep.DesignVariants
                  ? readMetadataNumber(result.metadata, 'variantIndex') ?? index
                  : currentStep === GenerationStep.FloorplanTo3D
                    ? readMetadataNumber(result.metadata, 'variantIndex') ?? index
                  : currentStep === GenerationStep.PlanColorize
                    ? readMetadataNumber(result.metadata, 'planColorizeStyleIndex') ?? index
                    : undefined,
                variantCode: currentStep === GenerationStep.DesignVariants
                  ? readMetadataString(result.metadata, 'variantCode') || readVariantCode(index)
                  : currentStep === GenerationStep.FloorplanTo3D
                    ? readMetadataString(result.metadata, 'variantCode') || readVariantCode(index)
                  : currentStep === GenerationStep.PlanColorize
                    ? readMetadataString(result.metadata, 'selectedStyleId')
                    : undefined,
                variantName: currentStep === GenerationStep.DesignVariants
                  ? readMetadataString(result.metadata, 'variantName') || resolveVariantNames(stateAtStart.config)[index]
                  : currentStep === GenerationStep.FloorplanTo3D
                    ? readMetadataString(result.metadata, 'variantName') || readMetadataString(result.metadata, 'selectedStyleName') || readMetadataString(result.metadata, 'layoutVariantName')
                  : currentStep === GenerationStep.PlanColorize
                    ? readMetadataString(result.metadata, 'selectedStyleName') || readMetadataString(result.metadata, 'variantName')
                    : undefined,
                variantLabel: currentStep === GenerationStep.DesignVariants
                  ? readMetadataString(result.metadata, 'variantName') || readVariantLabel(index)
                  : currentStep === GenerationStep.FloorplanTo3D
                    ? readMetadataString(result.metadata, 'variantName') || `三维彩平方案 ${index + 1}`
                  : currentStep === GenerationStep.PlanColorize
                    ? readMetadataString(result.metadata, 'selectedStyleName') || `彩平 ${index + 1}`
                    : undefined,
                variantStyle: currentStep === GenerationStep.DesignVariants ? readVariantStyle(readMetadataString(result.metadata, 'variantStyle') || resolveVariantStyles(stateAtStart.config)[index]) : undefined,
                variantStyleLabel: currentStep === GenerationStep.DesignVariants
                  ? readVariantStyleLabel(readMetadataString(result.metadata, 'variantStyle') || resolveVariantStyles(stateAtStart.config)[index])
                  : currentStep === GenerationStep.FloorplanTo3D
                    ? [
                        readMetadataString(result.metadata, 'selectedStyleName'),
                        readMetadataString(result.metadata, 'layoutVariantName'),
                      ].filter(Boolean).join(' / ') || undefined
                  : currentStep === GenerationStep.PlanColorize
                    ? readMetadataString(result.metadata, 'selectedStyleName')
                    : undefined,
                stylePackId: currentStep === GenerationStep.DesignVariants
                  ? readMetadataString(result.metadata, 'stylePackId') || stateAtStart.config.stylePackId || 'interior-common'
                  : currentStep === GenerationStep.FloorplanTo3D
                    ? readMetadataString(result.metadata, 'batchGroupId')
                  : currentStep === GenerationStep.PlanColorize
                    ? readMetadataString(result.metadata, 'batchGroupId')
                    : undefined,
              }));
          const selectedResult = generationResults.find(result => result.isSelected) || generationResults[0];
          const providerWarnings: string[] = [];
          const record = selectedResult ? saveGenerationRecord({
            id: latestJob.id,
            projectId: activeProjectId,
            projectName: activeProjectName,
            step: currentStep,
            prompt: userSupplementPrompt,
            style: currentStep === GenerationStep.PanoramaQuickRender
              ? stateAtStart.config.renderStyle || stateAtStart.config.style || '漫游全景快渲'
              : readHistoryStyle(currentStep, stateAtStart.config),
            createdAt: new Date(latestJob.finishedAt || latestJob.updatedAt).toLocaleString('zh-CN', { hour12: false }),
            provider: providerName || 'mock',
            outputImage: selectedResult.imageUrl,
            inputImageUrl: stateAtStart.inputImage.url,
            inputImageDataPreview: stateAtStart.inputImage.url ? undefined : stateAtStart.inputImage.dataUrl,
            inputImageAssetId: stateAtStart.inputImage.assetId,
            config: currentStep === GenerationStep.MaterialReplace
              ? { ...stateAtStart.config, prompt: '', customMaterialPrompt: stateAtStart.config.customMaterialPrompt || '' }
              : stateAtStart.config,
            editTarget: stateAtStart.config.editTarget,
            furnitureReferences: stateAtStart.furnitureReferences,
            generationResults,
            inputImageName: stateAtStart.inputImage.name,
            materialImageName: stateAtStart.materialImage?.name,
            maskImageName: stateAtStart.maskImage?.name,
            sourceModelAssetId: stateAtStart.config.sourceModelAssetId,
            snapshotAssetId: stateAtStart.inputImage.assetId,
            modelSnapshotMetadata: stateAtStart.config.modelSnapshotMetadata,
          }) : null;
          if (record) {
            setHistoryItems(items => [record, ...items.filter(item => item.id !== record.id)]);
          }
          await refreshProjectGenerationRecords(activeProjectId);

          setStepStates(prev => ({
            ...prev,
            [currentStep]: {
              ...prev[currentStep],
              outputImage: selectedResult?.imageUrl || prev[currentStep].outputImage,
              generationResults,
              selectedGenerationResultId: selectedResult?.id || prev[currentStep].selectedGenerationResultId,
              isGenerating: false,
              generationStatus: 'success',
              generationError: null,
              generationWarnings: [
                ...(autoProjectNotice ? [autoProjectNotice] : []),
                ...providerWarnings,
                ...(record?.storageWarning ? [record.storageWarning] : []),
                ...(selectedResult ? [] : ['生成已完成，但暂未获取到结果图，请稍后在项目记录中查看。']),
              ],
              generationProvider: providerName,
              generationResultId: latestJob.id,
              generationCreatedAt: latestJob.finishedAt || latestJob.updatedAt,
              generationJobStatus: 'succeeded',
              generationJobDiagnostics: latestJob.diagnostics || null,
              generationProgress: 100,
              generationLogs: [...prev[currentStep].generationLogs, 'succeeded: 生成结果已保存到项目记录。'].slice(-8),
              viewMode: 'after',
            },
          }));
          return;
        }

        const readableJobError = normalizedJob.errorMessage || formatGenerationJobError(latestJob);
        setStepStates(prev => ({
          ...prev,
          [currentStep]: {
            ...prev[currentStep],
            isGenerating: false,
            generationStatus: 'error',
            generationError: readableJobError,
            generationJobStatus: toAsyncGenerationStatus(normalizedJob.status) || prev[currentStep].generationJobStatus,
            generationJobDiagnostics: latestJob.diagnostics || null,
            generationProgress: latestJob.progress,
            generationLogs: [...prev[currentStep].generationLogs, `${normalizedJob.status}: ${readableJobError}`].slice(-8),
          },
        }));
        void refreshCreditBalance();
        return;
      } catch (jobError) {
        const jobErrorMessage = jobError instanceof Error ? jobError.message : '未知错误';
        if (jobErrorMessage.includes('Credits are insufficient') || jobErrorMessage.includes('额度不足')) {
          setStepStates(prev => ({
            ...prev,
            [currentStep]: {
              ...prev[currentStep],
              isGenerating: false,
              generationStatus: 'error',
              generationError: `剩余额度不足。本次需要 ${requiredCredits} credits，升级套餐入口将在商业化版本开放。`,
              generationLogs: [...prev[currentStep].generationLogs, 'credits: 额度不足，任务未创建。'].slice(-8),
            },
          }));
          void refreshCreditBalance();
          return;
        }

        if (!isLegacyGenerationFallbackEnabled()) {
          setStepStates(prev => ({
            ...prev,
            [currentStep]: {
              ...prev[currentStep],
              isGenerating: false,
              generationStatus: 'error',
              generationError: `异步生成任务不可用：${jobErrorMessage}`,
              generationLogs: [...prev[currentStep].generationLogs, 'error: 旧生成接口 fallback 已禁用。'].slice(-8),
            },
          }));
          void refreshCreditBalance();
          return;
        }

        setStepStates(prev => ({
          ...prev,
          [currentStep]: {
            ...prev[currentStep],
            generationWarnings: [
              ...prev[currentStep].generationWarnings,
              `异步任务不可用，已回退到旧生成接口：${jobErrorMessage}`,
            ],
            generationLogs: [...prev[currentStep].generationLogs, 'fallback: 使用旧 /api/generate 接口。'].slice(-8),
          },
        }));
      }
    }

    if (!isLegacyGenerationFallbackEnabled()) {
      setStepStates(prev => ({
        ...prev,
        [currentStep]: {
          ...prev[currentStep],
          isGenerating: false,
          generationStatus: 'error',
          generationError: '当前环境已禁用旧生成接口。请确认输入图已成功上传为素材，以便通过任务系统生成。',
          generationLogs: [...prev[currentStep].generationLogs, 'error: 旧生成接口 fallback 已禁用。'].slice(-8),
        },
      }));
      return;
    }

    try {
      let response;

      switch (currentStep) {
        case GenerationStep.FloorplanTo3D:
          response = await generateFloorplanTo3D({
            inputImageDataUrl: stateAtStart.inputImage.dataUrl,
            materialImageDataUrl: stateAtStart.materialImage?.dataUrl,
            prompt: buildPromptForGeneration(currentStep, stateAtStart.config.prompt, stateAtStart),
            config: forceSingleOutputConfig(buildConfigForGeneration(currentStep, stateAtStart.config)),
          });
          break;

        case GenerationStep.StyleRender:
          response = await generateStyleRender({
            inputImageDataUrl: stateAtStart.inputImage.dataUrl,
            prompt: buildPromptForGeneration(currentStep, stateAtStart.config.prompt, stateAtStart),
            config: forceSingleOutputConfig(stateAtStart.config),
          });
          break;

        case GenerationStep.LocalInpainting:
        case GenerationStep.MaterialReplace:
          response = await generateInpainting({
            inputImageDataUrl: stateAtStart.inputImage.dataUrl,
            maskImageDataUrl: stateAtStart.maskImage?.dataUrl,
            prompt: buildPromptForGeneration(currentStep, stateAtStart.config.prompt, stateAtStart),
            config: forceSingleOutputConfig(stateAtStart.config),
          });
          break;

        case GenerationStep.ModelSnapshotRender:
        case GenerationStep.PanoramaQuickRender:
        case GenerationStep.DesignVariants:
        case GenerationStep.ObjectInsert:
        case GenerationStep.FreeReferenceImage:
          throw new Error('该功能需要通过项目任务系统生成，请确认输入图已成功上传为素材。');
      }

      let projectSaveWarning: string | null = null;
      const backendOutputImageUrl = response.outputImageUrl || response.imageUrl || null;
      const displayOutputImage = backendOutputImageUrl || response.imageDataUrl;
      if (activeProjectId) {
        let outputImageUrl: string | null = backendOutputImageUrl;

        if (!outputImageUrl) {
          try {
          const outputFile = dataUrlToFile(response.imageDataUrl, `archai-result-${response.id}`);
          const outputAsset = await uploadImageAsset(outputFile, outputFile.name);
          outputImageUrl = outputAsset.url;
          } catch (uploadError) {
            const message = uploadError instanceof Error ? uploadError.message : '生成结果上传失败。';
            projectSaveWarning = `生成结果暂未保存为文件，将使用预览数据记录：${message}`;
          }
        }

        try {
          await createProjectGeneration(activeProjectId, {
            mode: getGenerationRecordMode(currentStep),
            step: getGenerationJobStep(currentStep),
            prompt: readSupplementalPromptForGeneration(currentStep, stateAtStart.config),
            inputImageUrl: stateAtStart.inputImage.url,
            inputImageDataPreview: stateAtStart.inputImage.url ? null : stateAtStart.inputImage.dataUrl,
            outputImageUrl,
            outputImageDataPreview: outputImageUrl ? null : response.imageDataUrl,
            provider: response.provider,
            status: 'succeeded',
          });
        } catch (saveError) {
          const message = saveError instanceof Error ? saveError.message : '项目生成记录保存失败。';
          projectSaveWarning = projectSaveWarning
            ? `${projectSaveWarning}；项目记录保存失败：${message}`
            : `生成已完成，但未能写入项目记录：${message}`;
        }
      }

      setStepStates(prev => {
      const currentState = prev[currentStep];
      const record = saveGenerationRecord({
          id: response.id,
          projectId: activeProjectId,
          projectName: activeProjectName,
          step: currentStep,
          prompt: readSupplementalPromptForGeneration(currentStep, currentState.config),
          style: readHistoryStyle(currentStep, currentState.config),
          createdAt: new Date(response.createdAt).toLocaleString('zh-CN', { hour12: false }),
          provider: response.provider,
          outputImage: displayOutputImage,
          inputImageUrl: currentState.inputImage?.url,
          inputImageDataPreview: currentState.inputImage?.url ? undefined : currentState.inputImage?.dataUrl,
          inputImageAssetId: currentState.inputImage?.assetId,
          config: currentStep === GenerationStep.MaterialReplace
            ? { ...currentState.config, prompt: '', customMaterialPrompt: currentState.config.customMaterialPrompt || '' }
            : currentState.config,
          editTarget: currentState.config.editTarget,
          furnitureReferences: currentState.furnitureReferences,
          inputImageName: currentState.inputImage?.name,
          materialImageName: currentState.materialImage?.name,
          maskImageName: currentState.maskImage?.name,
          sourceModelAssetId: currentState.config.sourceModelAssetId,
          snapshotAssetId: currentState.inputImage?.assetId,
          modelSnapshotMetadata: currentState.config.modelSnapshotMetadata,
        });
      setHistoryItems(items => [record, ...items.filter(item => item.id !== record.id)]);
      const warnings = [
        ...(autoProjectNotice ? [autoProjectNotice] : []),
        ...response.warnings,
        ...(record.storageWarning ? [record.storageWarning] : []),
        ...(projectSaveWarning ? [projectSaveWarning] : []),
      ];

      return {
        ...prev,
        [currentStep]: {
          ...currentState,
          outputImage: displayOutputImage,
          generationResults: [{
            id: response.id,
            imageUrl: displayOutputImage,
            isSelected: true,
            isFavorite: false,
            createdAt: response.createdAt,
          }],
          selectedGenerationResultId: response.id,
          isGenerating: false,
          generationStatus: 'success',
          generationError: null,
          generationWarnings: warnings,
          generationProvider: response.provider,
          generationResultId: response.id,
          generationCreatedAt: response.createdAt,
          generationProgress: 100,
          generationLogs: [...currentState.generationLogs, 'success: 旧生成接口返回成功。'].slice(-8),
          viewMode: 'after'
        }
      };
      });
    } catch (error) {
      setStepStates(prev => ({
        ...prev,
        [currentStep]: {
          ...prev[currentStep],
          isGenerating: false,
          generationStatus: 'error',
          generationError: error instanceof Error ? error.message : '生成失败，请稍后重试.',
          generationJobStatus: 'failed',
          generationJobDiagnostics: null,
          generationProgress: 100,
          generationLogs: [...prev[currentStep].generationLogs, `error: ${error instanceof Error ? error.message : '生成失败。'}`].slice(-8),
        }
      }));
    }
  }, [
    creditBalance,
    currentStep,
    ensureActiveProject,
    refreshCreditBalance,
    setHistoryItems,
    setStepStates,
    stepStates,
  ]);

  return {
    estimatedCreditCost,
    isCreditsInsufficient,
    handleGenerate,
  };
}

interface RunFloorplanMultiPlanJobsOptions {
  activeProjectId: string;
  activeProjectName: string | null;
  inputAssetIds: string[];
  stateAtStart: StepState;
  currentStep: GenerationStep;
  generationMode: GenerationMode;
  generationStep: GenerationJobStep;
  userSupplementPrompt: string;
  configForRequest: GenerationConfig;
  targetSizeConfig: Partial<GenerationConfig>;
  floorplanBatchGroupId?: string;
  floorplanVariantPlans: ReturnType<typeof resolveFloorplanVariantPlans>;
  retryVariantIndex?: number;
  setStepStates: Dispatch<SetStateAction<Record<GenerationStep, StepState>>>;
  setHistoryItems: Dispatch<SetStateAction<GenerationHistoryItem[]>>;
  refreshCreditBalance: () => Promise<void>;
}

async function runFloorplanMultiPlanJobs({
  activeProjectId,
  activeProjectName,
  inputAssetIds,
  stateAtStart,
  currentStep,
  generationMode,
  generationStep,
  userSupplementPrompt,
  configForRequest,
  targetSizeConfig,
  floorplanBatchGroupId,
  floorplanVariantPlans,
  retryVariantIndex,
  setStepStates,
  setHistoryItems,
  refreshCreditBalance,
}: RunFloorplanMultiPlanJobsOptions): Promise<void> {
  const sourceImageAssetId = stateAtStart.inputImage?.assetId || inputAssetIds[0];
  const batchGroupId = floorplanBatchGroupId || stateAtStart.config.batchGroupId || createBatchGroupId('floorplan-multi');
  const totalVariants = floorplanVariantPlans.length;
  const retryMode = typeof retryVariantIndex === 'number';
  const plansToRun = retryMode
    ? floorplanVariantPlans.filter(plan => plan.variantIndex === retryVariantIndex)
    : floorplanVariantPlans;
  const initialBatchItems: GenerationBatchItem[] = floorplanVariantPlans.map(plan => {
    const existing = stateAtStart.generationBatchItems?.find(item => item.variantIndex === plan.variantIndex);
    if (retryMode && plan.variantIndex !== retryVariantIndex && existing) return existing;
    return {
      variantIndex: plan.variantIndex,
      variantName: plan.variantName,
      selectedStyleId: plan.selectedStyleId,
      selectedStyleName: plan.selectedStyleName,
      layoutVariantId: plan.layoutVariantId,
      layoutVariantName: plan.layoutVariantName,
      batchGroupId,
      status: 'queued',
      imageUrl: retryMode ? existing?.imageUrl : undefined,
      assetId: retryMode ? existing?.assetId : undefined,
      errorMessage: undefined,
      metadata: existing?.metadata,
      jobId: retryMode && plan.variantIndex !== retryVariantIndex ? existing?.jobId : undefined,
    };
  });

  setStepStates(prev => ({
    ...prev,
    [currentStep]: {
      ...prev[currentStep],
      isGenerating: true,
      generationStatus: 'generating',
      generationError: null,
      generationWarnings: [],
      generationBatchItems: initialBatchItems,
      generationProgress: retryMode ? prev[currentStep].generationProgress : 0,
      generationLogs: [...prev[currentStep].generationLogs, `batch: ${retryMode ? `重试第 ${(retryVariantIndex ?? 0) + 1}` : `准备 ${totalVariants}`} 个三维彩平方案。`].slice(-8),
    },
  }));

  if (import.meta.env.DEV) {
    console.debug('[FloorplanMultiPlan] batch start', { batchGroupId, totalVariants, retryVariantIndex, sourceImageAssetId });
  }

  if (!activeProjectId || !sourceImageAssetId || inputAssetIds.length === 0) {
    const message = !activeProjectId ? 'projectId 缺失。' : 'sourceImageAssetId 缺失。';
    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        isGenerating: false,
        generationStatus: 'error',
        generationError: message,
        generationBatchItems: initialBatchItems.map(item => plansToRun.some(plan => plan.variantIndex === item.variantIndex) ? { ...item, status: 'failed', errorMessage: message } : item),
      },
    }));
    return;
  }

  let lastProvider: GenerationProvider | null = null;

  for (const plan of plansToRun) {
    const variantFocus = readFloorplanPayloadVariantFocus(stateAtStart.config.floorplanVariantType, stateAtStart.config.floorplanVariantFocus);
    const prompt = buildFloorplanVariantRequestPrompt(userSupplementPrompt, plan);
    const missingMessage = !activeProjectId
      ? 'projectId 缺失。'
      : !sourceImageAssetId
        ? 'sourceImageAssetId 缺失。'
        : !prompt.trim()
          ? 'prompt 为空。'
          : generationStep !== 'floorplan_to_3d'
            ? 'generationStep 非平面图生成三维彩平。'
            : inputAssetIds.length === 0
              ? 'inputAssetIds 缺少原图素材。'
              : !batchGroupId
                ? 'batchGroupId 缺失。'
                : '';

    if (missingMessage) {
      updateFloorplanBatchItem(setStepStates, currentStep, plan.variantIndex, { status: 'failed', errorMessage: missingMessage });
      continue;
    }

    const config = {
      ...configForRequest,
      ...targetSizeConfig,
      mode: generationMode,
      step: generationStep,
      qualityMode: stateAtStart.config.qualityMode || 'balanced',
      batchCount: 1,
      sourceImageAssetId,
      floorplanOutputMode: 'multi',
      floorplanVariantType: stateAtStart.config.floorplanVariantType || 'material_style',
      floorplanVariantFocus: stateAtStart.config.floorplanVariantFocus || 'material_style',
      batchGroupId,
      variantIndex: plan.variantIndex,
      schemeName: plan.variantName,
      selectedStyleId: plan.selectedStyleId,
      selectedStyleName: plan.selectedStyleName,
      layoutVariantId: plan.layoutVariantId,
      layoutVariantName: plan.layoutVariantName,
      variantFocus,
      floorplanStyleTemplateIds: plan.selectedStyleId ? [plan.selectedStyleId] : [],
      floorplanStyleTemplateNames: plan.selectedStyleName ? [plan.selectedStyleName] : [],
      floorplanLayoutVariantIds: plan.layoutVariantId ? [plan.layoutVariantId] : [],
      floorplanLayoutVariantNames: plan.layoutVariantName ? [plan.layoutVariantName] : [],
      variantNames: [plan.variantName],
      userPrompt: userSupplementPrompt,
      preserveStructure: true,
    } as GenerationConfig;

    const payload = {
      projectId: activeProjectId,
      mode: generationMode,
      step: generationStep,
      prompt,
      config: config as unknown as Record<string, unknown>,
      inputAssetIds: [sourceImageAssetId],
    };

    if (import.meta.env.DEV) {
      console.debug('[FloorplanMultiPlan] variant payload', { batchGroupId, totalVariants, variantIndex: plan.variantIndex, payload });
    }

    try {
      updateFloorplanBatchItem(setStepStates, currentStep, plan.variantIndex, { status: 'queued', errorMessage: undefined });
      const job = await createGenerationJob(payload);
      void refreshCreditBalance();
      lastProvider = parseGenerationProvider(job.provider);
      updateFloorplanBatchItem(setStepStates, currentStep, plan.variantIndex, { status: 'running', jobId: job.id });
      setStepStates(prev => ({
        ...prev,
        [currentStep]: {
          ...prev[currentStep],
          generationJobId: job.id,
          generationJobStatus: job.status,
          generationProvider: lastProvider,
          generationLogs: [...prev[currentStep].generationLogs, `queued: 方案 ${plan.variantIndex + 1} 任务 ${job.id} 已创建。`].slice(-8),
        },
      }));

      if (import.meta.env.DEV) {
        console.debug('[FloorplanMultiPlan] job created', { variantIndex: plan.variantIndex, jobId: job.id, status: job.status });
      }

      const latestJob = await pollGenerationJobUntilTerminal(job, currentStep, setStepStates);
      const normalizedJob = normalizeGenerationJobResult(latestJob);
      lastProvider = parseGenerationProvider(latestJob.provider);

      if (normalizedJob.status !== 'succeeded') {
        const message = formatGenerationJobError(latestJob);
        updateFloorplanBatchItem(setStepStates, currentStep, plan.variantIndex, { status: 'failed', errorMessage: message });
        if (import.meta.env.DEV) {
          console.debug('[FloorplanMultiPlan] job failed', { variantIndex: plan.variantIndex, jobId: latestJob.id, status: latestJob.status, errorMessage: message });
        }
        continue;
      }

      const materializedResultImages = await materializeNormalizedResultImages(normalizedJob, latestJob);
      const firstImage = materializedResultImages[0];
      if (!firstImage) throw new Error('生成任务成功但未返回结果图。');
      const metadata = {
        ...(firstImage.metadata || {}),
        variantIndex: plan.variantIndex,
        variantCode: readVariantCode(plan.variantIndex),
        variantName: plan.variantName,
        variantLabel: readVariantLabel(plan.variantIndex),
        selectedStyleId: plan.selectedStyleId,
        selectedStyleName: plan.selectedStyleName,
        layoutVariantId: plan.layoutVariantId,
        layoutVariantName: plan.layoutVariantName,
        batchGroupId,
        batchCount: totalVariants,
      };
      const resultOption: GenerationResultOption = {
        id: firstImage.id,
        imageUrl: firstImage.imageUrl,
        assetId: firstImage.assetId || normalizedJob.outputAssetIds[0],
        isSelected: false,
        isFavorite: firstImage.isFavorite,
        createdAt: firstImage.createdAt,
        metadata,
        variantIndex: plan.variantIndex,
        variantCode: readVariantCode(plan.variantIndex),
        variantName: plan.variantName,
        variantLabel: plan.variantName,
        variantStyleLabel: [plan.selectedStyleName, plan.layoutVariantName].filter(Boolean).join(' / ') || undefined,
        stylePackId: batchGroupId,
      };

      updateFloorplanBatchItem(setStepStates, currentStep, plan.variantIndex, {
        status: 'succeeded',
        imageUrl: resultOption.imageUrl,
        assetId: resultOption.assetId,
        metadata,
        errorMessage: undefined,
      });
      setStepStates(prev => {
        const existing = prev[currentStep].generationResults.filter(result => result.variantIndex !== plan.variantIndex);
        const nextResults = [...existing, resultOption]
          .sort((a, b) => (a.variantIndex ?? 0) - (b.variantIndex ?? 0))
          .map((result, index) => ({ ...result, isSelected: index === 0 }));
        const selected = nextResults[0];
        const completed = (prev[currentStep].generationBatchItems || []).filter(item => item.status === 'succeeded' || item.status === 'failed').length;
        return {
          ...prev,
          [currentStep]: {
            ...prev[currentStep],
            outputImage: selected?.imageUrl || prev[currentStep].outputImage,
            selectedGenerationResultId: selected?.id || prev[currentStep].selectedGenerationResultId,
            generationResults: nextResults,
            generationResultId: selected?.id || prev[currentStep].generationResultId,
            generationProvider: lastProvider,
            generationProgress: Math.round((completed / Math.max(1, totalVariants)) * 100),
            generationLogs: [...prev[currentStep].generationLogs, `success: 方案 ${plan.variantIndex + 1} 已生成。`].slice(-8),
          },
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '方案生成失败。';
      updateFloorplanBatchItem(setStepStates, currentStep, plan.variantIndex, { status: 'failed', errorMessage: message });
      if (import.meta.env.DEV) {
        console.debug('[FloorplanMultiPlan] variant failed', { variantIndex: plan.variantIndex, errorMessage: message });
      }
    }
  }

  void refreshCreditBalance();
  let finalResults: GenerationResultOption[] = [];
  let finalItems: GenerationBatchItem[] = [];
  setStepStates(prev => {
    const current = prev[currentStep];
    finalResults = current.generationResults;
    finalItems = current.generationBatchItems || [];
    const totalCompleted = finalItems.filter(item => item.status === 'succeeded' || item.status === 'failed').length;
    const totalSuccess = finalItems.filter(item => item.status === 'succeeded').length;
    const totalFailed = finalItems.filter(item => item.status === 'failed').length;
    const selected = finalResults.find(result => result.isSelected) || finalResults[0];
    if (import.meta.env.DEV) {
      console.debug('[FloorplanMultiPlan] batch summary', { batchGroupId, success: totalSuccess, failed: totalFailed, completed: totalCompleted });
    }
    return {
      ...prev,
      [currentStep]: {
        ...current,
        isGenerating: false,
        generationStatus: totalSuccess > 0 ? 'success' : 'error',
        generationError: totalSuccess > 0 ? null : '所有方案生成失败，请查看每个方案卡片的失败原因。',
        generationProgress: 100,
        outputImage: selected?.imageUrl || current.outputImage,
        selectedGenerationResultId: selected?.id || current.selectedGenerationResultId,
        generationProvider: lastProvider || current.generationProvider,
        generationLogs: [...current.generationLogs, `batch: completed=${totalCompleted}, success=${totalSuccess}, failed=${totalFailed}`].slice(-8),
      },
    };
  });

  if (finalResults.length > 0) {
    const selected = finalResults.find(result => result.isSelected) || finalResults[0];
    const record = saveGenerationRecord({
      id: batchGroupId,
      projectId: activeProjectId,
      projectName: activeProjectName,
      step: currentStep,
      prompt: userSupplementPrompt,
      style: '三维彩平多方案',
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
      provider: lastProvider || 'mock',
      outputImage: selected.imageUrl,
      inputImageUrl: stateAtStart.inputImage?.url,
      inputImageDataPreview: stateAtStart.inputImage?.url ? undefined : stateAtStart.inputImage?.dataUrl,
      inputImageAssetId: sourceImageAssetId,
      config: { ...stateAtStart.config, batchGroupId, batchCount: totalVariants as GenerationConfig['batchCount'] },
      generationResults: finalResults,
      inputImageName: stateAtStart.inputImage?.name,
    });
    setHistoryItems(items => [record, ...items.filter(item => item.id !== record.id)]);
  }
}

function updateFloorplanBatchItem(
  setStepStates: Dispatch<SetStateAction<Record<GenerationStep, StepState>>>,
  currentStep: GenerationStep,
  variantIndex: number,
  patch: Partial<GenerationBatchItem>,
): void {
  setStepStates(prev => ({
    ...prev,
    [currentStep]: {
      ...prev[currentStep],
      generationBatchItems: (prev[currentStep].generationBatchItems || []).map(item => (
        item.variantIndex === variantIndex ? { ...item, ...patch } : item
      )),
    },
  }));
}

async function pollGenerationJobUntilTerminal(
  job: Awaited<ReturnType<typeof createGenerationJob>>,
  currentStep: GenerationStep,
  setStepStates: Dispatch<SetStateAction<Record<GenerationStep, StepState>>>,
): Promise<Awaited<ReturnType<typeof getGenerationJob>>> {
  let latestJob = job;
  let normalizedJob = normalizeGenerationJobResult(latestJob);
  const pollStartedAt = Date.now();
  const pollTimeoutMs = 10 * 60 * 1000;
  logGenerationJobPollDebug(job.id, latestJob, normalizedJob, !isGenerationJobRunningStatus(normalizedJob.status));
  while (isGenerationJobRunningStatus(normalizedJob.status)) {
    const elapsedMs = Date.now() - pollStartedAt;
    if (elapsedMs >= pollTimeoutMs) {
      latestJob = await getGenerationJob(job.id);
      normalizedJob = normalizeGenerationJobResult(latestJob);
      if (!isGenerationJobRunningStatus(normalizedJob.status)) break;
      return {
        ...latestJob,
        status: 'timeout',
        errorMessage: latestJob.errorMessage || '生成时间较长，可稍后在项目记录中查看',
      };
    }
    await delay(getGenerationJobPollDelayMs(elapsedMs));
    latestJob = await getGenerationJob(job.id);
    normalizedJob = normalizeGenerationJobResult(latestJob);
    logGenerationJobPollDebug(job.id, latestJob, normalizedJob, !isGenerationJobRunningStatus(normalizedJob.status));
    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        generationJobStatus: toAsyncGenerationStatus(normalizedJob.status) || prev[currentStep].generationJobStatus,
        generationJobDiagnostics: latestJob.diagnostics || null,
        generationLogs: [
          ...prev[currentStep].generationLogs,
          `${readJobPhaseLabel(latestJob.diagnostics?.phase, normalizedJob.status)}: ${job.id} ${normalizedJob.status}`,
        ].slice(-8),
      },
    }));
  }
  return latestJob;
}

function buildFloorplanVariantRequestPrompt(userPrompt: string, plan: ReturnType<typeof resolveFloorplanVariantPlans>[number]): string {
  return [
    '平面图生成三维彩平多方案。',
    `方案名称：${plan.variantName}`,
    plan.selectedStyleName ? `材质/风格方向：${plan.selectedStyleName}` : '',
    plan.stylePromptHint || '',
    plan.layoutVariantName ? `家具摆放方向：${plan.layoutVariantName}` : '',
    plan.layoutPromptHint || '',
    '保持原始平面图空间结构、墙体、门窗、功能分区和主要比例关系不变。',
    userPrompt ? `用户补充：${userPrompt}` : '',
  ].filter(Boolean).join('\n');
}

function readFloorplanPayloadVariantFocus(type: unknown, focus: unknown): 'material' | 'layout' | 'mixed' {
  if (type === 'mixed' || focus === 'both') return 'mixed';
  if (type === 'furniture_layout' || focus === 'furniture_layout') return 'layout';
  return 'material';
}

function getGenerationRecordMode(step: GenerationStep): GenerationMode {
  if (step === GenerationStep.FloorplanTo3D) return 'floorplan';
  if (step === GenerationStep.StyleRender) return 'style-render';
  if (step === GenerationStep.FreeReferenceImage) return 'style-render';
  if (step === GenerationStep.ModelSnapshotRender) return 'model-render';
  if (step === GenerationStep.PanoramaQuickRender) return 'panorama-roam-render';
  if (step === GenerationStep.DesignVariants) return 'design-variants';
  if (step === GenerationStep.PlanColorize) return 'plan-colorize';
  if (step === GenerationStep.MaterialReplace) return 'material-replace';
  if (step === GenerationStep.ObjectInsert) return 'inpaint';
  return 'inpaint';
}

function getGenerationJobStep(step: GenerationStep): GenerationJobStep {
  if (step === GenerationStep.FloorplanTo3D) return 'floorplan_to_3d';
  if (step === GenerationStep.StyleRender) return 'style_render';
  if (step === GenerationStep.ModelSnapshotRender) return 'model_snapshot_render';
  if (step === GenerationStep.PanoramaQuickRender) return 'panorama_quick_render';
  if (step === GenerationStep.DesignVariants) return 'design_variants';
  if (step === GenerationStep.PlanColorize) return 'plan_colorize';
  if (step === GenerationStep.MaterialReplace) return 'material_replace';
  if (step === GenerationStep.ObjectInsert) return 'object_insert';
  if (step === GenerationStep.FreeReferenceImage) return 'free_reference_image';
  return 'local_inpainting';
}

function formatGenerationJobError(job: Awaited<ReturnType<typeof getGenerationJob>>): string {
  if (job.status === 'cancelled') return '生成任务已取消。';
  const provider = job.diagnostics?.provider;
  const details = [
    provider?.name ? `provider=${provider.name}` : job.provider ? `provider=${job.provider}` : undefined,
    typeof (provider?.statusCode ?? provider?.httpStatus) === 'number' ? `statusCode=${provider?.statusCode ?? provider?.httpStatus}` : undefined,
    provider?.providerStatus ? `providerStatus=${provider.providerStatus}` : undefined,
    provider?.providerError ? `providerError=${provider.providerError}` : undefined,
    provider?.rawSnippet ? `raw=${provider.rawSnippet}` : undefined,
  ].filter((item): item is string => Boolean(item));
  const message = provider?.userMessage || job.errorMessage || job.failureReason || '生成任务失败。';
  const refundMessage = job.creditRefunded ? '已退还算力点。' : '';
  return [message, refundMessage, details.length > 0 ? details.join('\n') : '']
    .filter(part => part.trim().length > 0)
    .join('\n');
}

function buildPromptForGeneration(step: GenerationStep, prompt: string, state?: StepState): string {
  if (step === GenerationStep.FreeReferenceImage) {
    const userPrompt = state ? readSupplementalPromptForGeneration(step, state.config, prompt) : prompt;
    return [
      '通用自由参考生图。',
      '第一张图是原图，必须作为主要基础。',
      '如果提供了后续图片，它们均为参考图，用于综合参考风格、材质、色彩、氛围、家具语言、细节和构图意图。',
      '根据用户提示词生成新的自然、协调、完整的效果图。',
      '不要机械拼贴参考图，不要生成拼图、分屏或对比图。',
      '保持画面完整，不要添加文字、水印、边框或 UI。',
      `用户提示词：${userPrompt}`,
    ].join('\n');
  }
  const mode = getSmartPromptMode(step);
  return buildSmartPrompt({
    mode,
    config: state?.config || { prompt },
    userPrompt: state ? readSupplementalPromptForGeneration(step, state.config, prompt) : prompt,
    hasMaterialReferences: Boolean(state?.materialImage?.dataUrl || (state?.materialTextures.length || 0) > 0),
    materialNames: state?.materialTextures.map(texture => texture.name || '').filter(Boolean),
    hasMask: Boolean(state?.maskImage?.dataUrl),
    useFullImageMask: Boolean(state?.useFullImageMask),
    hasFurnitureReference: Boolean(state && state.furnitureReferences.length > 0),
    qualityMode: state?.config.qualityMode,
  });
}

function readSupplementalPromptForGeneration(step: GenerationStep, config: GenerationConfig, fallback = ''): string {
  if (step === GenerationStep.FreeReferenceImage) return (config.prompt || config.customPrompt || fallback || '').trim();
  return readSmartPromptUserSupplement(getSmartPromptMode(step), config, fallback);
}

function getSmartPromptMode(step: GenerationStep): SmartPromptMode {
  if (step === GenerationStep.ObjectInsert) return 'object-insert';
  return getGenerationRecordMode(step) as SmartPromptMode;
}

function readObjectReferenceAssetId(state: StepState): string | undefined {
  return state.config.objectInsert?.objectReferenceAssetId
    || state.config.objectReferenceAssetId
    || state.materialImage?.assetId;
}

function readObjectInsertItems(config: GenerationConfig): ObjectInsertItemConfig[] {
  const items = config.objectInsert?.objectItems;
  if (Array.isArray(items) && items.length > 0) {
    return items
      .map((item, index) => ({
        id: item.id || `object-item-${index + 1}`,
        objectType: item.objectType || 'custom',
        objectLabel: item.objectLabel,
        referenceAssetIds: Array.isArray(item.referenceAssetIds)
          ? item.referenceAssetIds.filter((assetId): assetId is string => typeof assetId === 'string' && assetId.trim().length > 0)
          : [],
        placement: item.placement,
        placementPreviewAssetId: item.placementPreviewAssetId,
        placementMaskAssetId: item.placementMaskAssetId,
        placementMode: item.placementMode,
        placementIntent: item.placementIntent,
        extraPrompt: item.extraPrompt,
      }))
      .filter(item => item.referenceAssetIds.length > 0 || item.placementPreviewAssetId || item.placementMaskAssetId);
  }

  const referenceAssetIds = [
    ...(config.objectInsert?.objectReferenceAssetIds || []),
    config.objectInsert?.objectReferenceAssetId,
    config.objectReferenceAssetId,
  ].filter((assetId): assetId is string => typeof assetId === 'string' && assetId.trim().length > 0);
  if (referenceAssetIds.length === 0) return [];
  return [{
    id: 'legacy-object-1',
    objectType: 'custom',
    objectLabel: '对象 1',
    referenceAssetIds,
    placement: config.objectInsert?.placement || config.objectPlacement,
    placementPreviewAssetId: config.objectInsert?.previewAssetId || config.objectInsert?.guideAssetId || config.placementPreviewAssetId || config.placementGuideAssetId,
    placementMaskAssetId: config.objectInsert?.maskAssetId || config.placementMaskAssetId || config.maskAssetId,
    placementMode: config.objectInsert?.placementMode || config.placementMode,
    placementIntent: config.objectInsert?.placementIntent || config.placementIntent,
    extraPrompt: config.objectInsert?.extraPrompt || config.objectInsertExtraPrompt || config.customPrompt,
  }];
}

function readObjectInsertPreviewAssetId(config: GenerationConfig): string | undefined {
  return config.objectInsert?.guideAssetId || config.objectInsert?.previewAssetId || config.placementGuideAssetId || config.placementPreviewAssetId;
}

function readObjectInsertMaskAssetId(config: GenerationConfig): string | undefined {
  return config.objectInsert?.maskAssetId || config.placementMaskAssetId || config.maskAssetId;
}

function readObjectInsertPlacement(config: GenerationConfig) {
  return config.objectInsert?.placement || config.objectPlacement;
}

function readObjectInsertDebugMode(config: GenerationConfig): ObjectInsertDebugMode {
  const mode = config.objectInsert?.debugMode || config.objectInsertDebugMode;
  return mode === 'source_prompt'
    || mode === 'source_object'
    || mode === 'source_object_mask'
    || mode === 'source_object_preview'
    ? mode
    : 'full';
}

function readObjectInsertPositionConstraintStrength(config: GenerationConfig): ObjectInsertPositionConstraintStrength {
  const value = config.objectInsert?.positionConstraintStrength || config.positionConstraintStrength;
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'high';
}

function readObjectInsertPlacementMode(config: GenerationConfig): ObjectInsertPlacementMode {
  const value = config.objectInsert?.placementMode || config.placementMode;
  return value === 'strict' || value === 'natural' ? value : 'natural';
}

function readObjectInsertPlacementIntent(config: GenerationConfig): string {
  return (config.objectInsert?.placementIntent || config.placementIntent || '').trim();
}

function readObjectInsertHarmonyPriority(config: GenerationConfig): ObjectInsertHarmonyPriority {
  const value = config.objectInsert?.harmonyPriority || config.harmonyPriority;
  return value === 'style' || value === 'balance' || value === 'layout' ? value : 'layout';
}

function readObjectInsertAutoAdjust(
  config: GenerationConfig,
  key: 'allowAutoAdjustPosition' | 'allowAutoAdjustRotation' | 'allowAutoAdjustScale',
): boolean {
  const value = config.objectInsert?.[key] ?? config[key];
  return value === undefined ? true : value !== false;
}

function objectInsertIncludesObject(mode: ObjectInsertDebugMode): boolean {
  return mode !== 'source_prompt';
}

function objectInsertIncludesPreview(mode: ObjectInsertDebugMode): boolean {
  return mode === 'full' || mode === 'source_object_preview';
}

function objectInsertIncludesMask(mode: ObjectInsertDebugMode): boolean {
  return mode === 'full' || mode === 'source_object_mask';
}

function buildTargetSizeConfig(image: UploadedImage): Pick<GenerationConfig, 'sourceImageWidth' | 'sourceImageHeight' | 'targetWidth' | 'targetHeight' | 'targetAspectRatio'> {
  if (!image.width || !image.height) {
    return {};
  }

  return {
    sourceImageWidth: image.width,
    sourceImageHeight: image.height,
    targetWidth: image.width,
    targetHeight: image.height,
    targetAspectRatio: getAspectRatioString(image.width, image.height),
  };
}

function buildFreeReferenceTargetSizeConfig(config: GenerationConfig): Pick<GenerationConfig, 'targetWidth' | 'targetHeight' | 'targetAspectRatio'> {
  const resolution = config.freeReferenceResolution === 1536 || config.freeReferenceResolution === 2048
    ? config.freeReferenceResolution
    : 1024;
  const aspectRatio = config.freeReferenceAspectRatio || '1:1';
  const [widthRatio, heightRatio] = aspectRatio.split(':').map(Number);
  if (!widthRatio || !heightRatio) {
    return { targetWidth: resolution, targetHeight: resolution, targetAspectRatio: '1:1' };
  }
  if (widthRatio >= heightRatio) {
    return {
      targetWidth: resolution,
      targetHeight: Math.round(resolution * heightRatio / widthRatio),
      targetAspectRatio: aspectRatio,
    };
  }
  return {
    targetWidth: Math.round(resolution * widthRatio / heightRatio),
    targetHeight: resolution,
    targetAspectRatio: aspectRatio,
  };
}

function getAspectRatioString(width: number, height: number): string {
  const ratio = width / height;
  if (Math.abs(ratio - 2) <= 0.08) return '2:1';
  const candidates = [
    { value: '1:1', ratio: 1 },
    { value: '4:3', ratio: 4 / 3 },
    { value: '3:4', ratio: 3 / 4 },
    { value: '16:9', ratio: 16 / 9 },
    { value: '9:16', ratio: 9 / 16 },
  ];
  const best = candidates.reduce((currentBest, candidate) => (
    Math.abs(candidate.ratio - ratio) < Math.abs(currentBest.ratio - ratio) ? candidate : currentBest
  ));
  return Math.abs(best.ratio - ratio) <= 0.08 ? best.value : 'auto';
}

function buildConfigForGeneration(step: GenerationStep, config: GenerationConfig): GenerationConfig {
  if (step !== GenerationStep.FloorplanTo3D) {
    if (step === GenerationStep.PanoramaQuickRender) {
      const panoramaSize = config.panoramaQuality === 'standard'
        ? { width: 2048, height: 1024 }
        : { width: 4096, height: 2048 };
      return {
        ...config,
        qualityMode: 'high',
        panoramaQuality: config.panoramaQuality || 'high',
        targetWidth: config.targetWidth || panoramaSize.width,
        targetHeight: config.targetHeight || panoramaSize.height,
        targetAspectRatio: config.targetAspectRatio || '2:1',
      };
    }
    return config;
  }

  const { style: _style, ...floorplanConfig } = config;
  return floorplanConfig;
}

function forceSingleOutputConfig(config: GenerationConfig): GenerationConfig {
  return { ...config, batchCount: 1 };
}

function resolveVariantStyles(config: GenerationConfig) {
  const batchCount = config.batchCount === 2 || config.batchCount === 8 ? config.batchCount : 4;
  const defaults = batchCount === 2
    ? ['modern-minimal', 'natural-wood']
    : batchCount === 8
      ? ['modern-minimal', 'cream-style', 'wabi-sabi', 'light-luxury', 'natural-wood', 'premium-gray', 'industrial', 'hotel-lobby']
      : ['modern-minimal', 'cream-style', 'light-luxury', 'natural-wood'];
  const styles = Array.isArray(config.variantStyles) ? [...config.variantStyles] : [];
  for (const style of defaults) {
    if (styles.length >= batchCount) break;
    if (!styles.includes(style as never)) styles.push(style as never);
  }
  return styles.slice(0, batchCount);
}

function resolveVariantNames(config: GenerationConfig) {
  const batchCount = config.batchCount === 2 || config.batchCount === 8 ? config.batchCount : 4;
  const names = Array.isArray(config.variantNames) ? [...config.variantNames] : [];
  return Array.from({ length: batchCount }, (_, index) => names[index] || readVariantLabel(index));
}

function readVariantLabel(index: number): string {
  return `方案 ${String.fromCharCode(65 + index)}`;
}

function readVariantCode(index: number): string {
  return String.fromCharCode(65 + index);
}

function createBatchGroupId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readVariantStyle(style: string | undefined): VariantStyleKey | undefined {
  const allowed: VariantStyleKey[] = ['modern-minimal', 'wabi-sabi', 'cream-style', 'light-luxury', 'industrial', 'commercial-showroom', 'hotel-lobby', 'office-space', 'natural-wood', 'premium-gray', 'custom'];
  return allowed.find(item => item === style);
}

function readMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readMetadataNumber(metadata: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === 'number' ? value : undefined;
}

async function materializeNormalizedResultImages(
  normalizedJob: ReturnType<typeof normalizeGenerationJobResult>,
  job: Awaited<ReturnType<typeof getGenerationJob>>,
): Promise<GenerationResultOption[]> {
  if (normalizedJob.resultImages.length > 0) return normalizedJob.resultImages;

  const outputAssetIds = normalizedJob.outputAssetIds.length > 0
    ? normalizedJob.outputAssetIds
    : job.outputAssetId ? [job.outputAssetId] : [];

  const assets: Array<GenerationResultOption | null> = await Promise.all(outputAssetIds.map(async (assetId, index) => {
    try {
      const asset = await getImageAsset(assetId);
      return {
        id: `${job.id}:asset:${asset.id}`,
        imageUrl: asset.url,
        assetId: asset.id,
        isSelected: index === 0,
        isFavorite: false,
        createdAt: job.finishedAt || job.updatedAt,
      } satisfies GenerationResultOption;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('[GenerationRunner] failed to materialize output asset', {
          jobId: job.id,
          assetId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return null;
    }
  }));

  return assets.filter((asset): asset is GenerationResultOption => Boolean(asset));
}

async function refreshProjectGenerationRecords(projectId: string): Promise<void> {
  try {
    const records = await listProjectGenerations(projectId);
    if (import.meta.env.DEV) {
      console.debug('[GenerationRunner] refreshed project generation records', {
        projectId,
        recordCount: records.length,
      });
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.debug('[GenerationRunner] failed to refresh project generation records', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function toAsyncGenerationStatus(status: ReturnType<typeof normalizeGenerationJobResult>['status']): StepState['generationJobStatus'] {
  if (status === 'queued' || status === 'running' || status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'timeout') {
    return status;
  }
  return null;
}

function logGenerationJobPollDebug(
  jobId: string,
  job: unknown,
  normalizedJob: ReturnType<typeof normalizeGenerationJobResult>,
  stopPolling: boolean,
): void {
  if (!import.meta.env.DEV) return;
  console.debug('[GenerationRunner] poll generation job', {
    jobId,
    rawStatus: isRecord(job) ? job.status : undefined,
    normalizedStatus: normalizedJob.status,
    resultFields: readGenerationJobDebugResultFields(job),
    normalizedResultImages: normalizedJob.resultImages.map(result => ({
      id: result.id,
      imageUrl: result.imageUrl,
      assetId: result.assetId,
    })),
    outputAssetIds: normalizedJob.outputAssetIds,
    stopPolling,
  });
}

function readGenerationJobDebugResultFields(job: unknown): Record<string, unknown> {
  if (!isRecord(job)) return {};
  return {
    resultUrl: job.resultUrl,
    outputUrl: job.outputUrl,
    imageUrl: job.imageUrl,
    outputImageUrl: job.outputImageUrl,
    outputAssetUrl: job.outputAssetUrl,
    outputAssetId: job.outputAssetId,
    outputAssetIds: job.outputAssetIds,
    result: summarizeDebugResult(job.result),
    results: Array.isArray(job.results) ? job.results.map(summarizeDebugResult) : undefined,
    records: Array.isArray(job.records) ? job.records.map(summarizeDebugResult) : undefined,
  };
}

function summarizeDebugResult(value: unknown): Record<string, unknown> | unknown {
  if (!isRecord(value)) return value;
  const asset = isRecord(value.asset) ? value.asset : null;
  return {
    id: value.id,
    url: value.url,
    imageUrl: value.imageUrl,
    outputUrl: value.outputUrl,
    outputImageUrl: value.outputImageUrl,
    assetId: value.assetId,
    assetUrl: asset?.url,
  };
}

function readConfigStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function readVariantStyleLabel(style: string | undefined): string | undefined {
  if (!style) return undefined;
  const labels: Record<string, string> = {
    'modern-minimal': '现代极简',
    'wabi-sabi': '侘寂',
    'cream-style': '奶油风',
    'light-luxury': '轻奢',
    industrial: '工业风',
    'commercial-showroom': '商业展示风',
    'hotel-lobby': '酒店大堂风',
    'office-space': '办公空间风',
    'natural-wood': '自然木质',
    'premium-gray': '高级灰',
    custom: '自定义',
  };
  return labels[style] || style;
}

function readHistoryStyle(step: GenerationStep, config: GenerationConfig): string {
  if (step === GenerationStep.FloorplanTo3D) return '彩平表达';
  if (step === GenerationStep.PlanColorize) return config.template || '图纸智能表达';
  if (step === GenerationStep.ModelSnapshotRender) return config.renderStyle || config.style || '白模快渲';
  if (step === GenerationStep.ObjectInsert) return config.style || '元素植入';
  if (step === GenerationStep.FreeReferenceImage) return config.style || '自由参考生图';
  return config.style || '未设置风格';
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getGenerationJobPollDelayMs(elapsedMs: number): number {
  if (elapsedMs < 10_000) return 1_000;
  if (elapsedMs < 120_000) return 2_500;
  return 5_000;
}

function readJobPhaseLabel(phase: string | undefined, status: string): string {
  if (phase === 'prepare-input') return '准备输入中';
  if (phase === 'provider-request') return '正在调用 AI 生成';
  if (phase === 'postprocess') return '正在后处理图片';
  if (phase === 'save-result') return '正在保存结果';
  if (phase === 'succeeded') return '已完成';
  if (phase === 'failed') return '生成失败';
  if (phase === 'cancelled') return '已取消';
  return status;
}

function parseGenerationProvider(value: string): GenerationProvider | null {
  if (value === 'mock' || value === 'gemini' || value === 'grsai-banana2' || value === 'grsai-nano-banana') {
    return value;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dataUrlToFile(dataUrl: string, basename: string): File {
  const [header, encoded] = dataUrl.split(',');
  const mimeType = /^data:([^;,]+)/u.exec(header || '')?.[1] || 'image/png';
  const extension = getImageExtension(mimeType);
  const binary = window.atob(encoded || '');
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], `${basename}.${extension}`, { type: mimeType });
}

function getImageExtension(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

function isLegacyGenerationFallbackEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_ENABLE_LEGACY_GENERATION_FALLBACK === 'true';
}

