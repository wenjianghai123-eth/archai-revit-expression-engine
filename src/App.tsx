/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Sidebar, Stepper } from './components/Navigation';
import { MainWorkspace } from './components/MainWorkspace';
import { AssetBank } from './components/AssetBank';
import { HistoryView } from './components/HistoryView';
import { SettingsModal } from './components/SettingsModal';
import { TemplatesLibrary } from './components/TemplatesLibrary';
import { CreativeHome } from './components/CreativeHome';
import { GenerationStep, StepState, GenerationConfig, GenerationHistoryItem, PromptTemplate, UploadedImage } from './types';
import { DEFAULT_CONFIGS, PROMPT_TEMPLATES } from './constants';
import { generateFloorplanTo3D, generateInpainting, generateStyleRender } from './api/generation';
import { BackendHealth, getBackendHealth } from './api/health';
import { clearGenerationHistory, deleteGenerationRecord, listGenerationRecords, saveGenerationRecord } from './storage/history';
import { motion, AnimatePresence } from 'motion/react';

interface BackendHealthState {
  status: 'checking' | 'online' | 'offline';
  data: BackendHealth | null;
  message: string;
}

export default function App() {
  const [currentStep, setCurrentStep] = useState<GenerationStep>(GenerationStep.FloorplanTo3D);
  const [activeTab, setActiveTab] = useState('home');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<GenerationHistoryItem[]>(() => listGenerationRecords());
  const [backendHealth, setBackendHealth] = useState<BackendHealthState>({
    status: 'checking',
    data: null,
    message: '等待后端健康检查。',
  });
  
  const [stepStates, setStepStates] = useState<Record<GenerationStep, StepState>>({
    [GenerationStep.FloorplanTo3D]: {
      config: DEFAULT_CONFIGS[GenerationStep.FloorplanTo3D],
      inputImage: null,
      materialImage: null,
      maskImage: null,
      useFullImageMask: false,
      outputImage: null,
      isGenerating: false,
      generationStatus: 'ready',
      generationError: null,
      generationWarnings: [],
      generationProvider: null,
      generationResultId: null,
      generationCreatedAt: null,
      viewMode: 'original'
    },
    [GenerationStep.StyleRender]: {
      config: DEFAULT_CONFIGS[GenerationStep.StyleRender],
      inputImage: null,
      materialImage: null,
      maskImage: null,
      useFullImageMask: false,
      outputImage: null,
      isGenerating: false,
      generationStatus: 'ready',
      generationError: null,
      generationWarnings: [],
      generationProvider: null,
      generationResultId: null,
      generationCreatedAt: null,
      viewMode: 'original'
    },
    [GenerationStep.LocalInpainting]: {
      config: DEFAULT_CONFIGS[GenerationStep.LocalInpainting],
      inputImage: null,
      materialImage: null,
      maskImage: null,
      useFullImageMask: false,
      outputImage: null,
      isGenerating: false,
      generationStatus: 'ready',
      generationError: null,
      generationWarnings: [],
      generationProvider: null,
      generationResultId: null,
      generationCreatedAt: null,
      viewMode: 'original'
    }
  });

  const handleUpdateConfig = useCallback((config: Partial<GenerationConfig>) => {
    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        config: { ...prev[currentStep].config, ...config }
      }
    }));
  }, [currentStep]);

  const handleUpdateInputImage = useCallback((image: UploadedImage | null) => {
    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        inputImage: image,
        maskImage: null,
        useFullImageMask: false,
        outputImage: image ? prev[currentStep].outputImage : null,
        generationStatus: 'ready',
        generationError: null,
        generationWarnings: [],
        generationProvider: null,
        generationResultId: null,
        generationCreatedAt: null,
        viewMode: image ? prev[currentStep].viewMode : 'original',
      }
    }));
  }, [currentStep]);

  const handleUpdateMaterialImage = useCallback((image: UploadedImage | null) => {
    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        materialImage: image,
      }
    }));
  }, [currentStep]);

  const handleUpdateMaskImage = useCallback((maskDataUrl: string | null, useFullImage: boolean) => {
    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        maskImage: maskDataUrl
          ? {
              id: `mask-${Date.now()}`,
              name: useFullImage ? '整图 mask' : '矩形 mask',
              type: 'image/png',
              size: 0,
              dataUrl: maskDataUrl,
            }
          : null,
        useFullImageMask: useFullImage,
        generationStatus: 'ready',
        generationError: null,
        generationWarnings: [],
        generationProvider: null,
        generationResultId: null,
        generationCreatedAt: null,
      }
    }));
  }, [currentStep]);

  const handleResetConfig = useCallback(() => {
    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
          ...prev[currentStep],
          config: DEFAULT_CONFIGS[currentStep],
          inputImage: null,
          materialImage: null,
          maskImage: null,
          useFullImageMask: false,
          outputImage: null,
          isGenerating: false,
          generationStatus: 'ready',
          generationError: null,
          generationWarnings: [],
          generationProvider: null,
          generationResultId: null,
          generationCreatedAt: null,
          viewMode: 'original'
      }
    }));
  }, [currentStep]);

  const handleApplyTemplate = useCallback((template: PromptTemplate) => {
    const targetStep =
      template.feature === 'floorplan'
        ? GenerationStep.FloorplanTo3D
        : template.feature === 'style-render'
          ? GenerationStep.StyleRender
          : GenerationStep.LocalInpainting;

    setStepStates(prev => ({
      ...prev,
      [targetStep]: {
        ...prev[targetStep],
        config: { ...prev[targetStep].config, ...template.config }
      }
    }));
    setCurrentStep(targetStep);
    setActiveTab('generate');
  }, []);

  const refreshBackendHealth = useCallback(async () => {
    setBackendHealth(prev => ({
      status: 'checking',
      data: prev.data,
      message: '正在检查后端健康状态...',
    }));

    try {
      const health = await getBackendHealth();
      setBackendHealth({
        status: 'online',
        data: health,
        message: `后端在线，版本 ${health.version}，当前 provider: ${health.provider}。`,
      });
    } catch (error) {
      setBackendHealth({
        status: 'offline',
        data: null,
        message: error instanceof Error ? error.message : '后端健康检查失败。',
      });
    }
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    void refreshBackendHealth();
  }, [isSettingsOpen, refreshBackendHealth]);

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

  const handleGenerate = useCallback(async () => {
    const stateAtStart = stepStates[currentStep];
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
      }
    }));

    await new Promise(resolve => setTimeout(resolve, 120));

    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        generationStatus: 'generating',
      }
    }));

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

      return {
        ...prev,
        [currentStep]: {
          ...currentState,
          outputImage: response.imageDataUrl,
          isGenerating: false,
          generationStatus: 'success',
          generationError: null,
          generationWarnings: record.storageWarning ? [...response.warnings, record.storageWarning] : response.warnings,
          generationProvider: response.provider,
          generationResultId: response.id,
          generationCreatedAt: response.createdAt,
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
          generationError: error instanceof Error ? error.message : '生成失败，请稍后重试。',
        }
      }));
    }
  }, [currentStep, stepStates]);

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
  }, [currentStep, stepStates]);

  const handleStartCreate = useCallback((step: GenerationStep = GenerationStep.FloorplanTo3D) => {
    setCurrentStep(step);
    setActiveTab('generate');
  }, []);

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
                      onUpdateMaskImage={handleUpdateMaskImage}
                      onGenerate={handleGenerate}
                      onNextStep={handleNextStep}
                      onReset={handleResetConfig}
                      backendProvider={backendHealth.data?.provider || null}
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
        isChecking={backendHealth.status === 'checking'}
        onRefresh={refreshBackendHealth}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
