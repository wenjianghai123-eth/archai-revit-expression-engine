/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { Sidebar, Stepper } from './components/Navigation';
import { MainWorkspace } from './components/MainWorkspace';
import { AssetBank } from './components/AssetBank';
import { HistoryView } from './components/HistoryView';
import { SettingsModal } from './components/SettingsModal';
import { LoginPage } from './components/LoginPage';
import { TemplatesLibrary } from './components/TemplatesLibrary';
import { CreativeHome } from './components/CreativeHome';
import { ProjectDetail } from './components/ProjectDetail';
import { ProjectList } from './components/ProjectList';
import { PublicSharePreview } from './components/PublicSharePreview';
import { AdminPage } from './components/AdminPage';
import { GenerationConfig, GenerationStep, GenerationHistoryItem, GenerationProvider, StepState, UploadedImage } from './types';
import { PROMPT_TEMPLATES } from './constants';
import { generateFloorplanTo3D, generateInpainting, generateStyleRender } from './api/generation';
import {
  cancelGenerationJob,
  createGenerationJob,
  createProjectGeneration,
  getGenerationJob,
  getImageAsset,
  updateGenerationResult,
  uploadImageAsset,
} from './lib/api';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useBackendHealth } from './hooks/useBackendHealth';
import { useCreditBalance } from './hooks/useCreditBalance';
import { useGenerationWorkflow } from './hooks/useGenerationWorkflow';
import { useProjectSelection } from './hooks/useProjectSelection';
import { clearGenerationHistory, deleteGenerationRecord, listGenerationRecords, saveGenerationRecord } from './storage/history';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const {
    user: currentUser,
    isLoading: isUserLoading,
    error: currentUserError,
    isSigningIn,
    authMessage,
    isSupabaseConfigured,
    signInWithEmail,
    signOut,
  } = useCurrentUser();
  const {
    activeTab,
    setActiveTab,
    selectedProjectId,
    openProject: handleOpenProject,
    backToProjects: handleBackToProjects,
    startCreate,
  } = useProjectSelection();
  const {
    currentStep,
    setCurrentStep,
    stepStates,
    setStepStates,
    handleUpdateConfig,
    handleUpdateInputImage,
    handleUpdateMaterialImage,
    handleUpdateMaterialTextures,
    handleUpdateMaskImage,
    handleResetConfig,
    handleApplyTemplate,
  } = useGenerationWorkflow(() => setActiveTab('generate'));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<GenerationHistoryItem[]>(() => listGenerationRecords());
  const { backendHealth, refreshBackendHealth } = useBackendHealth(isSettingsOpen);
  const { creditBalance, creditError, refreshCreditBalance } = useCreditBalance(Boolean(currentUser));
  const publicShareToken = readPublicShareToken();
  const isAdminPath = window.location.pathname === '/admin';

  const handleReuseHistory = useCallback((item: GenerationHistoryItem) => {
    setCurrentStep(item.step);
    setStepStates(prev => ({
      ...prev,
      [item.step]: {
        ...prev[item.step],
        config: {
          ...prev[item.step].config,
          ...(item.config || {}),
          prompt: item.prompt,
          style: item.style,
        },
        outputImage: item.outputImage,
        generationResults: item.outputImage
          ? [{
              id: item.id,
              imageUrl: item.outputImage,
              isSelected: true,
              isFavorite: false,
              createdAt: item.createdAt,
            }]
          : [],
        selectedGenerationResultId: item.outputImage ? item.id : null,
        generationProvider: item.provider,
        generationResultId: item.id,
        generationCreatedAt: item.createdAt,
        viewMode: 'after',
      }
    }));
    setActiveTab('generate');
  }, []);

  const handleDeleteHistory = useCallback((id: string) => {
    deleteGenerationRecord(id);
    setHistoryItems(listGenerationRecords());
  }, []);

  const handleClearHistory = useCallback(() => {
    clearGenerationHistory();
    setHistoryItems([]);
  }, []);

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

    if (currentStep === GenerationStep.LocalInpainting && !stateAtStart.maskImage && !stateAtStart.useFullImageMask) {
      setStepStates(prev => ({
        ...prev,
        [currentStep]: {
          ...prev[currentStep],
          generationStatus: 'error',
          generationError: '请先绘制局部 mask，或选择整图后再生成。',
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
        generationCreatedAt: null,
        generationJobId: null,
        generationJobStatus: null,
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
      stateAtStart.inputImage.assetId &&
      (currentStep !== GenerationStep.LocalInpainting || stateAtStart.maskImage || stateAtStart.useFullImageMask),
    );

    if (canUseAsyncJob && selectedProjectId && stateAtStart.inputImage.assetId) {
      try {
        const inputAssetIds = Array.from(new Set([
          stateAtStart.inputImage.assetId,
          ...(stateAtStart.materialImage?.assetId ? [stateAtStart.materialImage.assetId] : []),
          ...stateAtStart.materialTextures
            .map(texture => texture.assetId)
            .filter((assetId): assetId is string => Boolean(assetId)),
        ]));
        let maskAssetId: string | undefined;
        const maskMode = currentStep === GenerationStep.LocalInpainting
          ? stateAtStart.useFullImageMask ? 'full-image' : 'asset-mask'
          : undefined;
        if (currentStep === GenerationStep.LocalInpainting && maskMode === 'asset-mask' && stateAtStart.maskImage?.dataUrl) {
          const maskFile = dataUrlToFile(stateAtStart.maskImage.dataUrl, `archai-mask-${Date.now()}`);
          const maskAsset = await uploadImageAsset(maskFile, maskFile.name);
          maskAssetId = maskAsset.id;
        }
        const job = await createGenerationJob({
          projectId: selectedProjectId,
          mode: getGenerationRecordMode(currentStep),
          prompt: stateAtStart.config.prompt,
          config: {
            ...stateAtStart.config,
            mode: getGenerationRecordMode(currentStep),
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
              source: texture.source,
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
            generationProgress: job.progress,
            generationProvider: parseGenerationProvider(job.provider),
            generationLogs: [...prev[currentStep].generationLogs, `queued: 任务 ${job.id} 已创建。`],
          },
        }));

        let latestJob = job;
        while (latestJob.status === 'queued' || latestJob.status === 'running') {
          await delay(2000);
          latestJob = await getGenerationJob(job.id);
          setStepStates(prev => ({
            ...prev,
            [currentStep]: {
              ...prev[currentStep],
              generationStatus: latestJob.status === 'queued' ? 'uploading' : 'generating',
              generationJobStatus: latestJob.status,
              generationProgress: latestJob.progress,
              generationLogs: [
                ...prev[currentStep].generationLogs,
                `${latestJob.status}: 任务进度 ${latestJob.progress}%`,
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
          const providerWarnings = currentStep === GenerationStep.LocalInpainting && latestJob.provider === 'grsai-nano-banana'
            ? ['当前 provider 暂未支持真实局部重绘，已使用 mock 结果。']
            : [];
          const record = saveGenerationRecord({
            id: latestJob.id,
            step: currentStep,
            prompt: stateAtStart.config.prompt,
            style: stateAtStart.config.style,
            createdAt: new Date(latestJob.finishedAt || latestJob.updatedAt).toLocaleString('zh-CN', { hour12: false }),
            provider: providerName || 'mock',
            outputImage: selectedResult.imageUrl,
            config: stateAtStart.config,
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
            prompt: stateAtStart.config.prompt,
            config: stateAtStart.config,
          });
          break;

        case GenerationStep.StyleRender:
          response = await generateStyleRender({
            inputImageDataUrl: stateAtStart.inputImage.dataUrl,
            prompt: stateAtStart.config.prompt,
            config: stateAtStart.config,
          });
          break;

        case GenerationStep.LocalInpainting:
          response = await generateInpainting({
            inputImageDataUrl: stateAtStart.inputImage.dataUrl,
            maskImageDataUrl: stateAtStart.maskImage?.dataUrl,
            prompt: stateAtStart.config.prompt,
            config: stateAtStart.config,
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
          step: currentStep,
          prompt: currentState.config.prompt,
          style: currentState.config.style,
          createdAt: new Date(response.createdAt).toLocaleString('zh-CN', { hour12: false }),
          provider: response.provider,
          outputImage: response.imageDataUrl,
          config: currentState.config,
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
          generationProgress: 100,
          generationLogs: [...prev[currentStep].generationLogs, `error: ${error instanceof Error ? error.message : '生成失败。'}`].slice(-8),
        }
      }));
    }
  }, [currentStep, selectedProjectId, stepStates]);

  const handleCancelGeneration = useCallback(async () => {
    const jobId = stepStates[currentStep].generationJobId;
    if (!jobId) return;

    try {
      const job = await cancelGenerationJob(jobId);
      setStepStates(prev => ({
        ...prev,
        [currentStep]: {
          ...prev[currentStep],
          isGenerating: false,
          generationStatus: 'error',
          generationError: '生成任务已取消。',
          generationJobStatus: job.status,
          generationProgress: job.progress,
          generationLogs: [...prev[currentStep].generationLogs, 'cancelled: 用户取消了任务。'].slice(-8),
        },
      }));
      void refreshCreditBalance();
    } catch (error) {
      setStepStates(prev => ({
        ...prev,
        [currentStep]: {
          ...prev[currentStep],
          generationWarnings: [
            ...prev[currentStep].generationWarnings,
            `取消任务失败：${error instanceof Error ? error.message : '未知错误'}`,
          ],
        },
      }));
    }
  }, [currentStep, refreshCreditBalance, stepStates]);

  const handleSelectGenerationResult = useCallback((resultId: string) => {
    const result = stepStates[currentStep].generationResults.find(item => item.id === resultId);
    if (!result) return;

    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        outputImage: result.imageUrl,
        selectedGenerationResultId: result.id,
        generationResults: prev[currentStep].generationResults.map(item => ({
          ...item,
          isSelected: item.id === result.id,
        })),
      },
    }));

    void updateGenerationResult(result.id, { isSelected: true }).catch(() => undefined);
  }, [currentStep, stepStates]);

  const handleToggleGenerationFavorite = useCallback((resultId: string) => {
    const result = stepStates[currentStep].generationResults.find(item => item.id === resultId);
    if (!result) return;

    const nextFavorite = !result.isFavorite;
    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        generationResults: prev[currentStep].generationResults.map(item => item.id === resultId ? { ...item, isFavorite: nextFavorite } : item),
      },
    }));

    void updateGenerationResult(result.id, { isFavorite: nextFavorite }).catch(() => undefined);
  }, [currentStep, stepStates]);

  const handleSetViewMode = useCallback((viewMode: StepState['viewMode']) => {
    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        viewMode,
      },
    }));
  }, [currentStep]);

  const handleNextStep = useCallback(() => {
    const nextStep = currentStep + 1;
    if (nextStep <= 3) {
      // Pass the current output as the next step's input
      const currentOutput = stepStates[currentStep].outputImage;
      const generatedInput: UploadedImage | null = currentOutput
        ? {
            id: `generated-${Date.now()}`,
            name: '上一步生成结果',
            type: 'image/svg+xml',
            size: 0,
            dataUrl: currentOutput,
          }
        : null;
      
      setStepStates(prev => ({
        ...prev,
        [nextStep]: {
          ...prev[nextStep as GenerationStep],
          inputImage: generatedInput,
          maskImage: null,
          useFullImageMask: false,
          outputImage: null,
          generationResults: [],
          selectedGenerationResultId: null,
          generationStatus: generatedInput ? 'ready' : prev[nextStep as GenerationStep].generationStatus,
          generationError: null,
          generationWarnings: [],
          generationProvider: null,
          generationResultId: null,
          generationCreatedAt: null,
        }
      }));
      
      setCurrentStep(nextStep as GenerationStep);
    }
  }, [creditBalance, currentStep, refreshCreditBalance, selectedProjectId, stepStates]);

  const handleStartCreate = useCallback((step: GenerationStep = GenerationStep.FloorplanTo3D) => {
    startCreate(setCurrentStep, step);
  }, [setCurrentStep, startCreate]);

  if (publicShareToken) {
    return <PublicSharePreview token={publicShareToken} />;
  }

  if (isUserLoading && !currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm font-bold text-slate-500">
        正在读取当前用户...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginPage
        isSigningIn={isSigningIn}
        error={currentUserError}
        message={authMessage}
        isSupabaseConfigured={isSupabaseConfigured}
        onSignIn={signInWithEmail}
      />
    );
  }

  if (isAdminPath) {
    return <AdminPage currentUser={currentUser} />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-100 text-slate-900 selection:bg-arch-accent selection:text-arch-bg">
      {/* Sidebar */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onSettingsOpen={() => setIsSettingsOpen(true)} />

      {/* Main Content Area */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden min-w-0 pb-20 lg:pb-0">
        <AnimatePresence mode="wait">
          {activeTab === 'home' ? (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-0 flex-1 overflow-hidden"
            >
              <CreativeHome
                templates={PROMPT_TEMPLATES}
                historyItems={historyItems}
                onStartCreate={handleStartCreate}
                onOpenTemplates={() => setActiveTab('templates')}
                onOpenAssets={() => setActiveTab('assets')}
                onOpenHistory={() => setActiveTab('history')}
              />
            </motion.div>
          ) : activeTab === 'projects' ? (
            <motion.div
              key="projects"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-0 flex-1 overflow-hidden"
            >
              <ProjectList onOpenProject={handleOpenProject} />
            </motion.div>
          ) : activeTab === 'project-detail' && selectedProjectId ? (
            <motion.div
              key={`project-${selectedProjectId}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-0 flex-1 overflow-hidden"
            >
              <ProjectDetail
                projectId={selectedProjectId}
                onBack={handleBackToProjects}
                onOpenGenerate={() => handleStartCreate(GenerationStep.FloorplanTo3D)}
              />
            </motion.div>
          ) : activeTab === 'generate' ? (
            <motion.div 
              key="generate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-0 flex-1 flex-col overflow-hidden min-w-0"
            >
              <Stepper currentStep={currentStep} onStepChange={setCurrentStep} />
              
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
                  >
                    <MainWorkspace 
                      step={currentStep}
                      state={stepStates[currentStep]}
                      onUpdateConfig={handleUpdateConfig}
                      onUpdateInputImage={handleUpdateInputImage}
                      onUpdateMaterialImage={handleUpdateMaterialImage}
                      onUpdateMaterialTextures={handleUpdateMaterialTextures}
                      onUpdateMaskImage={handleUpdateMaskImage}
                      onGenerate={handleGenerate}
                      onCancelGeneration={handleCancelGeneration}
                      onSelectGenerationResult={handleSelectGenerationResult}
                      onToggleGenerationFavorite={handleToggleGenerationFavorite}
                      onSetViewMode={handleSetViewMode}
                      onNextStep={handleNextStep}
                      onReset={handleResetConfig}
                      backendProvider={backendHealth.data?.provider || null}
                      creditBalance={creditBalance?.balance ?? null}
                      estimatedCreditCost={estimatedCreditCost}
                      isCreditsInsufficient={isCreditsInsufficient}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          ) : activeTab === 'assets' ? (
            <motion.div 
              key="assets"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-0 flex-1 overflow-hidden"
            >
              <AssetBank />
            </motion.div>
          ) : activeTab === 'templates' ? (
            <motion.div
              key="templates"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-0 flex-1 overflow-hidden"
            >
              <TemplatesLibrary templates={PROMPT_TEMPLATES} currentConfig={stepStates[currentStep].config} onApply={handleApplyTemplate} />
            </motion.div>
          ) : activeTab === 'history' ? (
            <motion.div
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-0 flex-1 overflow-hidden"
            >
              <HistoryView
                items={historyItems}
                onReuse={handleReuseHistory}
                onDelete={handleDeleteHistory}
                onClear={handleClearHistory}
              />
            </motion.div>
          ) : (
            <motion.div 
              key="fallback"
              className="flex-1 flex items-center justify-center text-slate-400 bg-slate-50"
            >
              正在开发中...
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <SettingsModal
        isOpen={isSettingsOpen}
        providerMode={backendHealth.data?.provider || '未知'}
        backendHealth={backendHealth.message}
        providerSource={backendHealth.data?.provider === 'gemini' || backendHealth.data?.provider === 'grsai-nano-banana' ? 'Real provider' : backendHealth.data?.provider === 'mock' ? 'Mock provider' : '未知（后端未连接）'}
        currentUser={currentUser}
        currentUserStatus={isUserLoading ? '正在读取当前用户' : currentUserError || creditError || `剩余额度：${creditBalance?.balance ?? '读取中'} credits`}
        onSignOut={signOut}
        isChecking={backendHealth.status === 'checking'}
        onRefresh={refreshBackendHealth}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

function getGenerationRecordMode(step: GenerationStep): 'floorplan' | 'style-render' | 'inpaint' {
  if (step === GenerationStep.FloorplanTo3D) return 'floorplan';
  if (step === GenerationStep.StyleRender) return 'style-render';
  return 'inpaint';
}

function calculateGenerationCreditsCost(step: GenerationStep, config: GenerationConfig): number {
  const baseCost = step === GenerationStep.LocalInpainting ? 8 : 10;
  const batchCount = config.batchCount === 2 || config.batchCount === 4 ? config.batchCount : 1;
  return baseCost * batchCount;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseGenerationProvider(value: string): GenerationProvider | null {
  if (value === 'mock' || value === 'gemini' || value === 'grsai-nano-banana') {
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

function readPublicShareToken(): string | null {
  const match = /^\/share\/([^/?#]+)/u.exec(window.location.pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

