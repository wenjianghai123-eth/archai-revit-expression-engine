import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { generateFloorplanTo3D, generateInpainting, generateStyleRender } from '../api/generation';
import { buildSmartPrompt, readSmartPromptUserSupplement, type SmartPromptMode } from '../promptTemplates/intelligentPromptTemplates';
import { resolvePlanColorizeStyles } from '../constants/planColorizeStyles';
import { saveGenerationRecord } from '../storage/history';
import {
  createGenerationJob,
  createProjectGeneration,
  getGenerationJob,
  getImageAsset,
  uploadImageAsset,
  type CreditBalance,
} from '../lib/api';
import { GenerationConfig, GenerationHistoryItem, GenerationJobStep, GenerationMode, GenerationProvider, GenerationRunStateOverride, GenerationStep, ObjectInsertDebugMode, ObjectInsertPositionConstraintStrength, StepState, UploadedImage, VariantStyleKey } from '../types';
import { getGenerationCreditCost } from '../utils/generationCredits';

interface UseGenerationRunnerOptions {
  currentStep: GenerationStep;
  selectedProjectId: string | null;
  stepStates: Record<GenerationStep, StepState>;
  setStepStates: Dispatch<SetStateAction<Record<GenerationStep, StepState>>>;
  creditBalance: CreditBalance | null;
  refreshCreditBalance: () => Promise<void>;
  setHistoryItems: Dispatch<SetStateAction<GenerationHistoryItem[]>>;
}

export function useGenerationRunner({
  currentStep,
  selectedProjectId,
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
      const hasPlacement = Boolean(objectPlacement?.width && objectPlacement.height);
      const missingMessage = !selectedProjectId
        ? '请先选择项目，再创建元素植入生成任务。'
        : !stateAtStart.inputImage.assetId
          ? '原始场景图尚未上传为素材，请重新上传原图。'
        : needsObject && !stateAtStart.materialImage
          ? '请先上传物体参考图。'
        : needsObject && !objectReferenceAssetId
          ? '物体参考图尚未上传为素材，请重新上传物体图。'
        : needsPreview && !placementPreviewAssetId
          ? 'placement guide 尚未上传，请先点击生成融合效果图重新准备任务。'
        : needsMask && !placementMaskAssetId
          ? 'placement mask 尚未上传，请先点击生成融合效果图重新准备任务。'
        : needsPlacement && !hasPlacement
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

    const canUseAsyncJob = Boolean(
      selectedProjectId &&
      stateAtStart.inputImage.assetId,
    );
    if (import.meta.env.DEV && currentStep === GenerationStep.PanoramaQuickRender) {
      console.debug('[PanoramaQuickRender] generation runner preflight', {
        selectedProjectId,
        inputImageAssetId: stateAtStart.inputImage.assetId,
        inputImageId: stateAtStart.inputImage.id,
        configPanoramaAssetId: stateAtStart.config.panoramaAssetId,
        canUseAsyncJob,
        willCreateGenerationJob: canUseAsyncJob,
      });
    }

    if (canUseAsyncJob && selectedProjectId && stateAtStart.inputImage.assetId) {
      try {
        const generationMode = getGenerationRecordMode(currentStep);
        const generationStep = getGenerationJobStep(currentStep);
        const promptForRequest = buildPromptForGeneration(currentStep, stateAtStart.config.prompt, stateAtStart);
        const userSupplementPrompt = readSupplementalPromptForGeneration(currentStep, stateAtStart.config);
        const configForRequest = buildConfigForGeneration(currentStep, stateAtStart.config);
        const targetSizeConfig = buildTargetSizeConfig(stateAtStart.inputImage);
        const isPanoramaQuickRender = currentStep === GenerationStep.PanoramaQuickRender;
        const isObjectInsert = currentStep === GenerationStep.ObjectInsert;
        const isPlanColorize = currentStep === GenerationStep.PlanColorize;
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
        const objectInsertDebugMode = isObjectInsert ? readObjectInsertDebugMode(stateAtStart.config) : 'full';
        const objectInsertNeedsObject = objectInsertIncludesObject(objectInsertDebugMode);
        const objectInsertNeedsPreview = objectInsertIncludesPreview(objectInsertDebugMode);
        const objectInsertNeedsMask = objectInsertIncludesMask(objectInsertDebugMode);
        const objectInsertPositionConstraintStrength = isObjectInsert ? readObjectInsertPositionConstraintStrength(stateAtStart.config) : 'high';
        const panoramaReferenceAssetIds = isPanoramaQuickRender
          ? readConfigStringArray(stateAtStart.config.panoramaReferenceAssetIds).slice(0, 6)
          : [];
        const objectReferenceAssetId = isObjectInsert
          ? readObjectReferenceAssetId(stateAtStart)
          : undefined;
        const placementPreviewAssetId = isObjectInsert ? readObjectInsertPreviewAssetId(stateAtStart.config) : undefined;
        const placementMaskAssetId = isObjectInsert ? readObjectInsertMaskAssetId(stateAtStart.config) : undefined;
        const objectPlacement = isObjectInsert ? readObjectInsertPlacement(stateAtStart.config) : undefined;
        const objectInsertConfig = isObjectInsert && objectPlacement
          ? {
              sourceImageAssetId: stateAtStart.inputImage.assetId,
              objectReferenceAssetId: objectInsertNeedsObject ? objectReferenceAssetId : undefined,
              guideAssetId: objectInsertNeedsPreview ? placementPreviewAssetId : undefined,
              previewAssetId: objectInsertNeedsPreview ? placementPreviewAssetId : undefined,
              maskAssetId: objectInsertNeedsMask ? placementMaskAssetId : undefined,
              placement: objectPlacement,
              extraPrompt: stateAtStart.config.objectInsertExtraPrompt || stateAtStart.config.customPrompt || '',
              debugMode: objectInsertDebugMode,
              positionConstraintStrength: objectInsertPositionConstraintStrength,
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
          inputAssetIds = [
            stateAtStart.inputImage.assetId,
            objectInsertNeedsObject ? objectReferenceAssetId : undefined,
            objectInsertNeedsPreview ? placementPreviewAssetId : undefined,
            objectInsertNeedsMask ? placementMaskAssetId : undefined,
          ].filter((assetId): assetId is string => Boolean(assetId));
        }
        if (import.meta.env.DEV) {
          console.debug('[GenerationRunner] POST /api/generation-jobs', {
            mode: generationMode,
            step: generationStep,
            currentStep,
            projectId: selectedProjectId,
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
            } : undefined,
            willCreateGenerationJob: true,
          });
        }
        const job = await createGenerationJob({
          projectId: selectedProjectId,
          mode: generationMode,
          step: generationStep,
          prompt: promptForRequest,
          config: {
            ...configForRequest,
            ...targetSizeConfig,
            mode: generationMode,
            step: generationStep,
            qualityMode: stateAtStart.config.qualityMode || 'balanced',
            batchCount: currentStep === GenerationStep.DesignVariants && (stateAtStart.config.batchCount === 2 || stateAtStart.config.batchCount === 4 || stateAtStart.config.batchCount === 8)
              ? stateAtStart.config.batchCount
              : isPlanColorize
                ? Math.min(Math.max(planColorizeStyles.length || 1, 1), 6) as GenerationConfig['batchCount']
                : 1,
            variantStrategy: currentStep === GenerationStep.DesignVariants ? stateAtStart.config.variantStrategy || 'style-matrix' : undefined,
            stylePackId: currentStep === GenerationStep.DesignVariants ? stateAtStart.config.stylePackId || 'interior-common' : undefined,
            variantStyles: currentStep === GenerationStep.DesignVariants ? resolveVariantStyles(stateAtStart.config) : undefined,
            variantNames: currentStep === GenerationStep.DesignVariants ? resolveVariantNames(stateAtStart.config) : undefined,
            customStyleLabel: currentStep === GenerationStep.DesignVariants ? stateAtStart.config.customStyleLabel : undefined,
            planColorizeBatchEnabled: isPlanColorize ? planColorizeStyles.length > 1 || stateAtStart.config.planColorizeBatchEnabled === true : undefined,
            planColorizeStyleIds: isPlanColorize ? planColorizeStyles.map(style => style.id) : undefined,
            planColorizeStyleNames: isPlanColorize ? planColorizeStyles.map(style => style.name) : undefined,
            planColorizeStylePromptHints: isPlanColorize ? planColorizeStyles.map(style => style.promptHint) : undefined,
            selectedStyleId: isPlanColorize ? planColorizeStyles[0]?.id : undefined,
            selectedStyleName: isPlanColorize ? planColorizeStyles[0]?.name : undefined,
            selectedStylePromptHint: isPlanColorize ? planColorizeStyles[0]?.promptHint : undefined,
            batchGroupId: isPlanColorize ? planColorizeBatchGroupId : undefined,
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
            objectInsertExtraPrompt: isObjectInsert ? stateAtStart.config.objectInsertExtraPrompt || stateAtStart.config.customPrompt : undefined,
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
        const pollStartedAt = Date.now();
        while (latestJob.status === 'queued' || latestJob.status === 'running') {
          await delay(getGenerationJobPollDelayMs(Date.now() - pollStartedAt));
          latestJob = await getGenerationJob(job.id);
          setStepStates(prev => ({
            ...prev,
            [currentStep]: {
              ...prev[currentStep],
              generationStatus: latestJob.status === 'queued'
                ? 'uploading'
                : latestJob.status === 'running'
                  ? 'generating'
                  : prev[currentStep].generationStatus,
              generationJobStatus: latestJob.status,
              generationJobDiagnostics: latestJob.diagnostics || null,
              generationProgress: latestJob.progress,
              generationLogs: [
                ...prev[currentStep].generationLogs,
                `${readJobPhaseLabel(latestJob.diagnostics?.phase, latestJob.status)}: 任务进度 ${latestJob.progress}%`,
              ].slice(-8),
            },
          }));
        }

        if (latestJob.status === 'succeeded' && latestJob.outputAssetId) {
          void refreshCreditBalance();
          const outputAsset = await getImageAsset(latestJob.outputAssetId);
          const providerName = parseGenerationProvider(latestJob.provider);
          const generationResults = latestJob.results && latestJob.results.length > 0
            ? latestJob.results.map((result, index) => ({
                id: result.id,
                imageUrl: result.imageUrl,
                assetId: result.assetId,
                isSelected: result.isSelected,
                isFavorite: result.isFavorite,
                createdAt: result.createdAt,
                metadata: result.metadata,
                variantIndex: currentStep === GenerationStep.DesignVariants
                  ? readMetadataNumber(result.metadata, 'variantIndex') ?? index
                  : currentStep === GenerationStep.PlanColorize
                    ? readMetadataNumber(result.metadata, 'planColorizeStyleIndex') ?? index
                    : undefined,
                variantCode: currentStep === GenerationStep.DesignVariants
                  ? readMetadataString(result.metadata, 'variantCode') || readVariantCode(index)
                  : currentStep === GenerationStep.PlanColorize
                    ? readMetadataString(result.metadata, 'selectedStyleId')
                    : undefined,
                variantName: currentStep === GenerationStep.DesignVariants
                  ? readMetadataString(result.metadata, 'variantName') || resolveVariantNames(stateAtStart.config)[index]
                  : currentStep === GenerationStep.PlanColorize
                    ? readMetadataString(result.metadata, 'selectedStyleName') || readMetadataString(result.metadata, 'variantName')
                    : undefined,
                variantLabel: currentStep === GenerationStep.DesignVariants
                  ? readMetadataString(result.metadata, 'variantName') || readVariantLabel(index)
                  : currentStep === GenerationStep.PlanColorize
                    ? readMetadataString(result.metadata, 'selectedStyleName') || `彩平 ${index + 1}`
                    : undefined,
                variantStyle: currentStep === GenerationStep.DesignVariants ? readVariantStyle(readMetadataString(result.metadata, 'variantStyle') || resolveVariantStyles(stateAtStart.config)[index]) : undefined,
                variantStyleLabel: currentStep === GenerationStep.DesignVariants
                  ? readVariantStyleLabel(readMetadataString(result.metadata, 'variantStyle') || resolveVariantStyles(stateAtStart.config)[index])
                  : currentStep === GenerationStep.PlanColorize
                    ? readMetadataString(result.metadata, 'selectedStyleName')
                    : undefined,
                stylePackId: currentStep === GenerationStep.DesignVariants
                  ? readMetadataString(result.metadata, 'stylePackId') || stateAtStart.config.stylePackId || 'interior-common'
                  : currentStep === GenerationStep.PlanColorize
                    ? readMetadataString(result.metadata, 'batchGroupId')
                    : undefined,
              }))
            : [{
                id: latestJob.id,
                imageUrl: outputAsset.url,
                assetId: outputAsset.id,
                isSelected: true,
                isFavorite: false,
                createdAt: latestJob.finishedAt || latestJob.updatedAt,
              }];
          const selectedResult = generationResults.find(result => result.isSelected) || generationResults[0];
          const providerWarnings: string[] = [];
          const record = saveGenerationRecord({
            id: latestJob.id,
            projectId: selectedProjectId,
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
          });
          setHistoryItems(items => [record, ...items.filter(item => item.id !== record.id)]);

          setStepStates(prev => ({
            ...prev,
            [currentStep]: {
              ...prev[currentStep],
              outputImage: selectedResult.imageUrl,
              generationResults,
              selectedGenerationResultId: selectedResult.id,
              isGenerating: false,
              generationStatus: 'success',
              generationError: null,
              generationWarnings: [...providerWarnings, ...(record.storageWarning ? [record.storageWarning] : [])],
              generationProvider: providerName,
              generationResultId: latestJob.id,
              generationCreatedAt: latestJob.finishedAt || latestJob.updatedAt,
              generationJobStatus: latestJob.status,
              generationJobDiagnostics: latestJob.diagnostics || null,
              generationProgress: 100,
              generationLogs: [...prev[currentStep].generationLogs, 'succeeded: 生成结果已保存。'].slice(-8),
              viewMode: 'after',
            },
          }));
          return;
        }

        const readableJobError = formatGenerationJobError(latestJob);
        setStepStates(prev => ({
          ...prev,
          [currentStep]: {
            ...prev[currentStep],
            isGenerating: false,
            generationStatus: 'error',
            generationError: readableJobError,
            generationJobStatus: latestJob.status,
            generationJobDiagnostics: latestJob.diagnostics || null,
            generationProgress: latestJob.progress,
            generationLogs: [...prev[currentStep].generationLogs, `${latestJob.status}: ${readableJobError}`].slice(-8),
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
          generationError: '当前环境已禁用旧生成接口。请先选择项目并上传输入图，以便通过任务系统生成。',
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
          throw new Error('白模快渲需要通过项目任务系统生成，请先选择项目并截取模型视角。');
      }

      let projectSaveWarning: string | null = null;
      const backendOutputImageUrl = response.outputImageUrl || response.imageUrl || null;
      const displayOutputImage = backendOutputImageUrl || response.imageDataUrl;
      if (selectedProjectId) {
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
          await createProjectGeneration(selectedProjectId, {
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
          projectId: selectedProjectId,
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
  }, [currentStep, selectedProjectId, stepStates]);

  return {
    estimatedCreditCost,
    isCreditsInsufficient,
    handleGenerate,
  };
}

function getGenerationRecordMode(step: GenerationStep): GenerationMode {
  if (step === GenerationStep.FloorplanTo3D) return 'floorplan';
  if (step === GenerationStep.StyleRender) return 'style-render';
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

