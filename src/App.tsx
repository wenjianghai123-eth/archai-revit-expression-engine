/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useState, useCallback } from 'react';
import { Sidebar, Stepper } from './components/Navigation';
import { HistoryView } from './components/HistoryView';
import { SettingsModal } from './components/SettingsModal';
import { LoginPage } from './components/LoginPage';
import { CreativeHome } from './components/CreativeHome';
import { ProjectList } from './components/ProjectList';
import { GenerationStep, GenerationHistoryItem, StepState, UploadedImage } from './types';
import { PROMPT_TEMPLATES } from './constants';
import {
  cancelGenerationJob,
  deleteProject,
  updateGenerationResult,
} from './lib/api';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useBackendHealth } from './hooks/useBackendHealth';
import { useCreditBalance } from './hooks/useCreditBalance';
import { useGenerationWorkflow } from './hooks/useGenerationWorkflow';
import { useGenerationRunner } from './hooks/useGenerationRunner';
import { useProjectSelection } from './hooks/useProjectSelection';
import { clearGenerationHistory, deleteGenerationRecord, listGenerationRecords } from './storage/history';
import { motion, AnimatePresence } from 'motion/react';

const MainWorkspace = lazy(() => import('./components/MainWorkspace').then(module => ({ default: module.MainWorkspace })));
const AssetBank = lazy(() => import('./components/AssetBank').then(module => ({ default: module.AssetBank })));
const TemplatesLibrary = lazy(() => import('./components/TemplatesLibrary').then(module => ({ default: module.TemplatesLibrary })));
const ProjectDetail = lazy(() => import('./components/ProjectDetail').then(module => ({ default: module.ProjectDetail })));
const PublicSharePreview = lazy(() => import('./components/PublicSharePreview').then(module => ({ default: module.PublicSharePreview })));
const PanoramaSharePage = lazy(() => import('./components/PanoramaSharePage').then(module => ({ default: module.PanoramaSharePage })));
const AdminPage = lazy(() => import('./components/AdminPage').then(module => ({ default: module.AdminPage })));

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
    setSelectedProjectId,
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
    handleUpdateFurnitureReferences,
    handleUpdateMaskImage,
    handleResetConfig,
    handleApplyTemplate,
    resetWorkflow,
  } = useGenerationWorkflow(() => setActiveTab('generate'));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<GenerationHistoryItem[]>(() => listGenerationRecords());
  const { backendHealth, refreshBackendHealth } = useBackendHealth(isSettingsOpen);
  const { creditBalance, creditError, refreshCreditBalance } = useCreditBalance(Boolean(currentUser));
  const panoramaShareId = readPanoramaShareId();
  const publicShareToken = readPublicShareToken();
  const isAdminPath = window.location.pathname === '/admin';

  const handleReuseHistory = useCallback((item: GenerationHistoryItem) => {
    const historyInputImage = buildHistoryInputImage(item);
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
        inputImage: historyInputImage || prev[item.step].inputImage,
        outputImage: item.outputImage,
        generationResults: item.generationResults?.length
          ? item.generationResults
          : item.outputImage
            ? [{
                id: item.id,
                imageUrl: item.outputImage,
                isSelected: true,
                isFavorite: false,
                createdAt: item.createdAt,
              }]
            : [],
        selectedGenerationResultId: item.generationResults?.find(result => result.isSelected)?.id || item.generationResults?.[0]?.id || (item.outputImage ? item.id : null),
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

  const handleOpenProjectWithReset = useCallback((projectId: string) => {
    resetWorkflow();
    handleOpenProject(projectId);
  }, [handleOpenProject, resetWorkflow]);

  const handleBackToProjectsWithReset = useCallback(() => {
    resetWorkflow();
    handleBackToProjects();
  }, [handleBackToProjects, resetWorkflow]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    await deleteProject(projectId);
    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
      setActiveTab('projects');
    }
    resetWorkflow();
    setHistoryItems(listGenerationRecords());
  }, [resetWorkflow, selectedProjectId, setActiveTab, setSelectedProjectId]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    setSelectedProjectId(null);
    setActiveTab('home');
    resetWorkflow();
    setHistoryItems(listGenerationRecords());
    if (window.location.pathname === '/admin') {
      window.history.pushState({}, '', '/');
    }
  }, [resetWorkflow, setActiveTab, setSelectedProjectId, signOut]);

  const { estimatedCreditCost, isCreditsInsufficient, handleGenerate } = useGenerationRunner({
    currentStep,
    selectedProjectId,
    stepStates,
    setStepStates,
    creditBalance,
    refreshCreditBalance,
    setHistoryItems,
  });

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
          generationJobDiagnostics: job.diagnostics || null,
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

  const handleRenameGenerationResult = useCallback((resultId: string, variantName: string) => {
    const result = stepStates[currentStep].generationResults.find(item => item.id === resultId);
    if (!result) return;
    const nextMetadata = { ...(result.metadata || {}), variantName };

    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        generationResults: prev[currentStep].generationResults.map(item => item.id === resultId
          ? { ...item, variantName, variantLabel: variantName, metadata: nextMetadata }
          : item),
      },
    }));

    void updateGenerationResult(result.id, { metadata: { variantName } }).catch(() => undefined);
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

  if (panoramaShareId) {
    return (
      <Suspense fallback={<PageLoading />}>
        <PanoramaSharePage shareId={panoramaShareId} />
      </Suspense>
    );
  }

  if (publicShareToken) {
    return (
      <Suspense fallback={<PageLoading />}>
        <PublicSharePreview token={publicShareToken} />
      </Suspense>
    );
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
    return (
      <Suspense fallback={<PageLoading />}>
        <AdminPage currentUser={currentUser} onBackToApp={() => { window.location.href = '/'; }} onSignOut={() => { void handleSignOut(); }} />
      </Suspense>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-100 text-slate-900 selection:bg-arch-accent selection:text-arch-bg">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSettingsOpen={() => setIsSettingsOpen(true)}
        isAdmin={currentUser.role === 'admin'}
        currentUser={currentUser}
        creditBalance={creditBalance}
        creditError={creditError}
        onSignOut={() => { void handleSignOut(); }}
      />

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
              <ProjectList onOpenProject={handleOpenProjectWithReset} onDeleteProject={handleDeleteProject} />
            </motion.div>
          ) : activeTab === 'project-detail' && selectedProjectId ? (
            <motion.div
              key={`project-${selectedProjectId}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-0 flex-1 overflow-hidden"
            >
              <Suspense fallback={<PanelLoading />}>
                <ProjectDetail
                  projectId={selectedProjectId}
                  onBack={handleBackToProjectsWithReset}
                  onOpenGenerate={() => handleStartCreate(GenerationStep.FloorplanTo3D)}
                  onDeleteProject={handleDeleteProject}
                />
              </Suspense>
            </motion.div>
          ) : activeTab === 'generate' ? (
            <motion.div 
              key="generate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-0 flex-1 flex-col overflow-hidden min-w-0"
            >
              <Stepper
                currentStep={currentStep}
                onStepChange={setCurrentStep}
                estimatedCreditCost={estimatedCreditCost}
                creditBalance={creditBalance?.balance ?? null}
              />
              
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
                    <Suspense fallback={<PanelLoading />}>
                      <MainWorkspace
                        step={currentStep}
                        state={stepStates[currentStep]}
                        selectedProjectId={selectedProjectId}
                        onUpdateConfig={handleUpdateConfig}
                        onUpdateInputImage={handleUpdateInputImage}
                        onUpdateMaterialImage={handleUpdateMaterialImage}
                        onUpdateMaterialTextures={handleUpdateMaterialTextures}
                        onUpdateFurnitureReferences={handleUpdateFurnitureReferences}
                        onUpdateMaskImage={handleUpdateMaskImage}
                        onGenerate={handleGenerate}
                        onRegenerate={handleGenerate}
                        onCancelGeneration={handleCancelGeneration}
                        onSelectGenerationResult={handleSelectGenerationResult}
                        onToggleGenerationFavorite={handleToggleGenerationFavorite}
                        onRenameGenerationResult={handleRenameGenerationResult}
                        onSetViewMode={handleSetViewMode}
                        onNextStep={handleNextStep}
                        onReset={handleResetConfig}
                        onHistoryRecord={record => setHistoryItems(items => [record, ...items.filter(item => item.id !== record.id)])}
                        backendProvider={backendHealth.data?.provider || null}
                        isCreditsInsufficient={isCreditsInsufficient}
                      />
                    </Suspense>
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
              <Suspense fallback={<PanelLoading />}>
                <AssetBank />
              </Suspense>
            </motion.div>
          ) : activeTab === 'templates' ? (
            <motion.div
              key="templates"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="min-h-0 flex-1 overflow-hidden"
            >
              <Suspense fallback={<PanelLoading />}>
                <TemplatesLibrary templates={PROMPT_TEMPLATES} currentConfig={stepStates[currentStep].config} onApply={handleApplyTemplate} />
              </Suspense>
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
        providerSource={backendHealth.data?.provider === 'gemini' || backendHealth.data?.provider === 'grsai-banana2' || backendHealth.data?.provider === 'grsai-nano-banana' ? 'Real provider' : backendHealth.data?.provider === 'mock' ? 'Mock provider' : '未知（后端未连接）'}
        currentUser={currentUser}
        currentUserStatus={isUserLoading ? '正在读取当前用户' : currentUserError || creditError || `剩余额度：${creditBalance?.balance ?? '读取中'} credits`}
        onSignOut={handleSignOut}
        isChecking={backendHealth.status === 'checking'}
        onRefresh={refreshBackendHealth}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

function PageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm font-bold text-slate-500">
      正在加载...
    </div>
  );
}

function PanelLoading() {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-slate-50 text-sm font-bold text-slate-400">
      正在加载...
    </div>
  );
}

function readPublicShareToken(): string | null {
  if (window.location.pathname.startsWith('/share/panorama/')) return null;
  const match = /^\/share\/([^/?#]+)/u.exec(window.location.pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

function readPanoramaShareId(): string | null {
  const match = /^\/share\/panorama\/([^/?#]+)/u.exec(window.location.pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

function buildHistoryInputImage(item: GenerationHistoryItem): UploadedImage | null {
  const imageUrl = item.inputImageUrl || item.inputImageDataPreview;
  if (!imageUrl) return null;

  return {
    id: item.inputImageAssetId || `${item.id}-input`,
    name: item.inputImageName || '历史原图',
    type: 'image/*',
    size: 0,
    dataUrl: item.inputImageDataPreview || imageUrl,
    url: item.inputImageUrl,
    assetId: item.inputImageAssetId,
  };
}
