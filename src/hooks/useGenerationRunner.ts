import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { generateFloorplanTo3D, generateInpainting, generateStyleRender } from '../api/generation';
import { buildFloorplanColorPrompt } from '../prompts/floorplanPrompts';
import { buildInpaintPrompt } from '../prompts/inpaintPrompts';
import { saveGenerationRecord } from '../storage/history';
import {
  createGenerationJob,
  createProjectGeneration,
  getGenerationJob,
  getImageAsset,
  uploadImageAsset,
  type CreditBalance,
} from '../lib/api';
import { GenerationConfig, GenerationHistoryItem, GenerationProvider, GenerationStep, StepState, UploadedImage } from '../types';

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
  const estimatedCreditCost = calculateGenerationCreditsCost(currentStep, stepStates[currentStep].config);
  const isCreditsInsufficient = Boolean(creditBalance && creditBalance.balance < estimatedCreditCost);

  const handleGenerate = useCallback(async () => {
    const stateAtStart = stepStates[currentStep];
    const requiredCredits = calculateGenerationCreditsCost(currentStep, stateAtStart.config);
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

    if (!stateAtStart.inputImage) {
      setStepStates(prev => ({
        ...prev,
        [currentStep]: {
          ...prev[currentStep],
          generationStatus: 'error',
          generationError: '请先上传图片后再生成预览。',
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

    if (canUseAsyncJob && selectedProjectId && stateAtStart.inputImage.assetId) {
      try {
        const generationMode = getGenerationRecordMode(currentStep);
        const promptForRequest = buildPromptForGeneration(currentStep, stateAtStart.config.prompt, stateAtStart);
        const configForRequest = buildConfigForGeneration(currentStep, stateAtStart.config);
        const targetSizeConfig = buildTargetSizeConfig(stateAtStart.inputImage);
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
        const maskMode = currentStep === GenerationStep.LocalInpainting
          ? stateAtStart.useFullImageMask
            ? 'full-image'
            : hasPaintedMask
              ? 'asset-mask'
              : undefined
          : undefined;
        if (currentStep === GenerationStep.LocalInpainting && maskMode === 'asset-mask' && stateAtStart.maskImage?.dataUrl) {
          const maskFile = dataUrlToFile(stateAtStart.maskImage.dataUrl, `archai-mask-${Date.now()}`);
          const maskAsset = await uploadImageAsset(maskFile, maskFile.name);
          maskAssetId = maskAsset.id;
          inputAssetIds = Array.from(new Set([...inputAssetIds, maskAsset.id]));
        }
        const job = await createGenerationJob({
          projectId: selectedProjectId,
          mode: generationMode,
          prompt: promptForRequest,
          config: {
            ...configForRequest,
            ...targetSizeConfig,
            mode: generationMode,
            batchCount: 1,
            userPrompt: stateAtStart.config.prompt,
            editTarget: currentStep === GenerationStep.LocalInpainting ? stateAtStart.config.editTarget || 'general' : stateAtStart.config.editTarget,
            strength: stateAtStart.config.strength || stateAtStart.config.inpaintingStrength || 'medium',
            preserveStructure: Boolean(stateAtStart.config.preserveStructure ?? stateAtStart.config.keepOriginalMaterial),
            feather: stateAtStart.config.feather ?? 0,
            maskMode,
            maskAssetId,
            materialTextureAssetIds: stateAtStart.materialTextures
              .map(texture => texture.assetId)
              .filter((assetId): assetId is string => Boolean(assetId)),
            materialTextureSources: stateAtStart.materialTextures.map(texture => ({
              id: texture.id,
              name: texture.name,
              url: texture.url,
              source: texture.source,
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
            ? latestJob.results.map(result => ({
                id: result.id,
                imageUrl: result.imageUrl,
                assetId: result.assetId,
                isSelected: result.isSelected,
                isFavorite: result.isFavorite,
                createdAt: result.createdAt,
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
            prompt: stateAtStart.config.prompt,
            style: readHistoryStyle(currentStep, stateAtStart.config),
            createdAt: new Date(latestJob.finishedAt || latestJob.updatedAt).toLocaleString('zh-CN', { hour12: false }),
            provider: providerName || 'mock',
            outputImage: selectedResult.imageUrl,
            inputImageUrl: stateAtStart.inputImage.url,
            inputImageDataPreview: stateAtStart.inputImage.url ? undefined : stateAtStart.inputImage.dataUrl,
            inputImageAssetId: stateAtStart.inputImage.assetId,
            config: stateAtStart.config,
            editTarget: stateAtStart.config.editTarget,
            furnitureReferences: stateAtStart.furnitureReferences,
            inputImageName: stateAtStart.inputImage.name,
            materialImageName: stateAtStart.materialImage?.name,
            maskImageName: stateAtStart.maskImage?.name,
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

        setStepStates(prev => ({
          ...prev,
          [currentStep]: {
            ...prev[currentStep],
            isGenerating: false,
            generationStatus: 'error',
            generationError: latestJob.status === 'cancelled' ? '生成任务已取消。' : latestJob.errorMessage || '生成任务失败。',
            generationJobStatus: latestJob.status,
            generationJobDiagnostics: latestJob.diagnostics || null,
            generationProgress: latestJob.progress,
            generationLogs: [...prev[currentStep].generationLogs, `${latestJob.status}: ${latestJob.errorMessage || '任务结束。'}`].slice(-8),
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
            prompt: stateAtStart.config.prompt,
            config: forceSingleOutputConfig(stateAtStart.config),
          });
          break;

        case GenerationStep.LocalInpainting:
          response = await generateInpainting({
            inputImageDataUrl: stateAtStart.inputImage.dataUrl,
            maskImageDataUrl: stateAtStart.maskImage?.dataUrl,
            prompt: buildPromptForGeneration(currentStep, stateAtStart.config.prompt, stateAtStart),
            config: forceSingleOutputConfig(stateAtStart.config),
          });
          break;
      }

      let projectSaveWarning: string | null = null;
      if (selectedProjectId) {
        let outputImageUrl: string | null = null;

        try {
          const outputFile = dataUrlToFile(response.imageDataUrl, `archai-result-${response.id}`);
          const outputAsset = await uploadImageAsset(outputFile, outputFile.name);
          outputImageUrl = outputAsset.url;
        } catch (uploadError) {
          const message = uploadError instanceof Error ? uploadError.message : '生成结果上传失败。';
          projectSaveWarning = `生成结果暂未保存为文件，将使用预览数据记录：${message}`;
        }

        try {
          await createProjectGeneration(selectedProjectId, {
            mode: getGenerationRecordMode(currentStep),
            prompt: stateAtStart.config.prompt,
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
          prompt: currentState.config.prompt,
          style: readHistoryStyle(currentStep, currentState.config),
          createdAt: new Date(response.createdAt).toLocaleString('zh-CN', { hour12: false }),
          provider: response.provider,
          outputImage: response.imageDataUrl,
          inputImageUrl: currentState.inputImage?.url,
          inputImageDataPreview: currentState.inputImage?.url ? undefined : currentState.inputImage?.dataUrl,
          inputImageAssetId: currentState.inputImage?.assetId,
          config: currentState.config,
          editTarget: currentState.config.editTarget,
          furnitureReferences: currentState.furnitureReferences,
          inputImageName: currentState.inputImage?.name,
          materialImageName: currentState.materialImage?.name,
          maskImageName: currentState.maskImage?.name,
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
          outputImage: response.imageDataUrl,
          generationResults: [{
            id: response.id,
            imageUrl: response.imageDataUrl,
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

function getGenerationRecordMode(step: GenerationStep): 'floorplan' | 'style-render' | 'inpaint' {
  if (step === GenerationStep.FloorplanTo3D) return 'floorplan';
  if (step === GenerationStep.StyleRender) return 'style-render';
  return 'inpaint';
}

function calculateGenerationCreditsCost(step: GenerationStep, config: GenerationConfig): number {
  const baseCost = step === GenerationStep.LocalInpainting ? 8 : 10;
  return baseCost;
}

function buildPromptForGeneration(step: GenerationStep, prompt: string, state?: StepState): string {
  if (step === GenerationStep.FloorplanTo3D) {
    return buildFloorplanColorPrompt({
      userPrompt: prompt,
      hasMaterialReferences: Boolean(state?.materialImage?.dataUrl || (state?.materialTextures.length || 0) > 0),
      materialNames: state?.materialTextures.map(texture => texture.name || '').filter(Boolean),
    });
  }

  if (step === GenerationStep.LocalInpainting && state) {
    return buildInpaintPrompt({
      userPrompt: prompt,
      hasMask: Boolean(state.maskImage?.dataUrl),
      useFullImageMask: Boolean(state.useFullImageMask),
      hasMaterialReference: Boolean(state.materialImage?.dataUrl || state.materialTextures.length > 0),
      hasFurnitureReference: state.furnitureReferences.length > 0,
      editTarget: state.config.editTarget || 'general',
    });
  }

  return prompt;
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
  const candidates = [
    { value: '1:1', ratio: 1 },
    { value: '4:3', ratio: 4 / 3 },
    { value: '3:4', ratio: 3 / 4 },
    { value: '16:9', ratio: 16 / 9 },
    { value: '9:16', ratio: 9 / 16 },
  ];
  return candidates.reduce((best, candidate) => (
    Math.abs(candidate.ratio - ratio) < Math.abs(best.ratio - ratio) ? candidate : best
  )).value;
}

function buildConfigForGeneration(step: GenerationStep, config: GenerationConfig): GenerationConfig {
  if (step !== GenerationStep.FloorplanTo3D) {
    return config;
  }

  const { style: _style, ...floorplanConfig } = config;
  return floorplanConfig;
}

function forceSingleOutputConfig(config: GenerationConfig): GenerationConfig {
  return { ...config, batchCount: 1 };
}

function readHistoryStyle(step: GenerationStep, config: GenerationConfig): string {
  if (step === GenerationStep.FloorplanTo3D) return '彩平表达';
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

