/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useState, useCallback, useEffect } from 'react';
import { Sidebar, Stepper } from './components/Navigation';
import { HistoryView } from './components/HistoryView';
import { SettingsModal } from './components/SettingsModal';
import { LoginPage } from './components/LoginPage';
import { CreativeHome } from './components/CreativeHome';
import { ProjectList } from './components/ProjectList';
import { GenerationStep, GenerationHistoryItem, ResultSendTargetStep, StepState, UploadedImage, SecondaryEditAction } from './types';
import {
  cancelGenerationJob,
  createAutoProject,
  deleteProject,
  listPromptTemplates,
  updateGenerationResult,
} from './lib/api';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useBackendHealth } from './hooks/useBackendHealth';
import { useCreditBalance } from './hooks/useCreditBalance';
import { useGenerationWorkflow } from './hooks/useGenerationWorkflow';
import { useGenerationRunner } from './hooks/useGenerationRunner';
import { useProjectSelection } from './hooks/useProjectSelection';
import { clearGenerationHistory, deleteGenerationRecord, listGenerationRecords } from './storage/history';
import { buildSecondaryEditConfigPatch } from './utils/secondaryEdit';
import { getOriginalResultAssetId, getOriginalResultImageUrl } from './utils/resultImage';
import { promptTemplateRecordToTemplate } from './utils/savedPromptTemplates';
import { motion, AnimatePresence } from 'motion/react';

const MainWorkspace = lazy(() => import('./components/MainWorkspace').then(module => ({ default: module.MainWorkspace })));
const LandingPage = lazy(() => import('./pages/LandingPage').then(module => ({ default: module.LandingPage })));
const AssetBank = lazy(() => import('./components/AssetBank').then(module => ({ default: module.AssetBank })));
const TemplatesLibrary = lazy(() => import('./components/TemplatesLibrary').then(module => ({ default: module.TemplatesLibrary })));
const ProjectDetail = lazy(() => import('./components/ProjectDetail').then(module => ({ default: module.ProjectDetail })));
const PublicSharePreview = lazy(() => import('./components/PublicSharePreview').then(module => ({ default: module.PublicSharePreview })));
const PanoramaSharePage = lazy(() => import('./components/PanoramaSharePage').then(module => ({ default: module.PanoramaSharePage })));
const AdminPage = lazy(() => import('./components/AdminPage').then(module => ({ default: module.AdminPage })));

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
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
  const [promptTemplates, setPromptTemplates] = useState(() => [] as ReturnType<typeof promptTemplateRecordToTemplate>[]);
  const [queuedSecondaryGenerationId, setQueuedSecondaryGenerationId] = useState<string | null>(null);
  const { backendHealth, refreshBackendHealth } = useBackendHealth(isSettingsOpen);
  const { creditBalance, creditError, refreshCreditBalance } = useCreditBalance(Boolean(currentUser));
  const panoramaShareId = readPanoramaShareId();
  const publicShareToken = readPublicShareToken();
  const isAdminPath = currentPath === '/admin';

  const refreshPromptTemplates = useCallback(async () => {
    try {
      const records = await listPromptTemplates();
      setPromptTemplates(records.map(promptTemplateRecordToTemplate));
    } catch {
      setPromptTemplates([]);
    }
  }, []);

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

  const ensureActiveProject = useCallback(async () => {
    if (selectedProjectId) {
      return { projectId: selectedProjectId, wasCreated: false };
    }

    try {
      const project = await createAutoProject();
      setSelectedProjectId(project.id);
      return { projectId: project.id, projectName: project.name, wasCreated: true };
    } catch {
      throw new Error('自动创建项目失败，请稍后重试或手动创建项目。');
    }
  }, [selectedProjectId, setSelectedProjectId]);

  const { estimatedCreditCost, isCreditsInsufficient, handleGenerate } = useGenerationRunner({
    currentStep,
    ensureActiveProject,
    stepStates,
    setStepStates,
    creditBalance,
    refreshCreditBalance,
    setHistoryItems,
  });

  useEffect(() => {
    if (!queuedSecondaryGenerationId) return;
    setQueuedSecondaryGenerationId(null);
    void handleGenerate();
  }, [handleGenerate, queuedSecondaryGenerationId]);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (currentPath !== '/app') return;
    const requestedStep = readWorkspaceFeatureStep();
    if (!requestedStep) return;
    setCurrentStep(requestedStep);
    setActiveTab('generate');
  }, [currentPath, setActiveTab, setCurrentStep]);

  useEffect(() => {
    if (!currentUser) return;
    void refreshPromptTemplates();
    const handleTemplatesUpdated = () => {
      void refreshPromptTemplates();
    };
    window.addEventListener('prompt-templates-updated', handleTemplatesUpdated);
    return () => window.removeEventListener('prompt-templates-updated', handleTemplatesUpdated);
  }, [currentUser, refreshPromptTemplates]);

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
          generationError: job.creditRefunded ? '生成任务已取消。\n已退还算力点。' : '生成任务已取消。',
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

  const handleSecondaryEditResult = useCallback((resultId: string, action: SecondaryEditAction) => {
    const currentState = stepStates[currentStep];
    const result = currentState.generationResults.find(item => item.id === resultId)
      || (currentState.outputImage
        ? {
            id: currentState.generationResultId || resultId,
            imageUrl: currentState.outputImage,
            isSelected: true,
            isFavorite: false,
            createdAt: currentState.generationCreatedAt || undefined,
          }
        : null);

    if (!result) return;

    const label = result.variantName || result.variantLabel || '当前结果';
    const imageUrl = result.imageUrl;
    const nextInputImage: UploadedImage = {
      id: `secondary-${result.id}-${Date.now()}`,
      name: `${label}.png`,
      type: readImageMimeType(imageUrl),
      size: 0,
      dataUrl: imageUrl,
      url: imageUrl.startsWith('data:') ? undefined : imageUrl,
      assetId: result.assetId,
    };
    const configPatch = buildSecondaryEditConfigPatch(currentStep, currentState.config, action);

    setStepStates(prev => ({
      ...prev,
      [currentStep]: {
        ...prev[currentStep],
        inputImage: nextInputImage,
        maskImage: null,
        useFullImageMask: false,
        config: {
          ...prev[currentStep].config,
          ...configPatch,
          parentResultId: result.id,
          parentJobId: result.jobId || prev[currentStep].generationJobId,
          parentRecordId: prev[currentStep].generationResultId,
          secondaryEditAction: action,
        },
        continuationSource: {
          parentResultId: result.id,
          parentJobId: result.jobId || prev[currentStep].generationJobId,
          parentRecordId: prev[currentStep].generationResultId,
          imageUrl,
          assetId: result.assetId,
          label,
          action,
          createdAt: new Date().toISOString(),
        },
        outputImage: null,
        generationResults: [],
        selectedGenerationResultId: null,
        generationStatus: 'ready',
        generationError: null,
        generationWarnings: [],
        generationProvider: null,
        generationResultId: null,
        generationCreatedAt: null,
        generationJobId: null,
        generationJobStatus: null,
        generationJobDiagnostics: null,
        generationProgress: 0,
        generationLogs: [`secondary-edit: 已基于「${label}」创建二次编辑任务。`],
        viewMode: 'original',
      },
    }));
    setQueuedSecondaryGenerationId(`${result.id}:${action}:${Date.now()}`);
  }, [currentStep, setStepStates, stepStates]);

  const handleSendResultToStep = useCallback((resultId: string, targetStep: ResultSendTargetStep) => {
    const currentState = stepStates[currentStep];
    const result = currentState.generationResults.find(item => item.id === resultId)
      || (currentState.outputImage
        ? {
            id: currentState.generationResultId || resultId,
            imageUrl: currentState.outputImage,
            assetId: undefined,
            isSelected: true,
            isFavorite: false,
            createdAt: currentState.generationCreatedAt || undefined,
          }
        : null);

    if (!result) return;

    const imageUrl = getOriginalResultImageUrl(result, result.imageUrl);
    if (!imageUrl) return;

    const label = result.variantName || result.variantLabel || '当前结果';
    const assetId = getOriginalResultAssetId(result) || undefined;
    const nextInputImage: UploadedImage = {
      id: `send-${targetStep}-${result.id}-${Date.now()}`,
      name: `${label}.png`,
      type: readImageMimeType(imageUrl),
      size: 0,
      dataUrl: imageUrl,
      url: imageUrl.startsWith('data:') ? undefined : imageUrl,
      assetId,
    };
    const parentJobId = result.jobId || currentState.generationJobId;
    const parentRecordId = currentState.generationResultId;
    const action = `send-to-${targetStep}` as const;

    setCurrentStep(targetStep);
    setActiveTab('generate');
    setStepStates(prev => {
      const previous = prev[targetStep];
      const nextConfig = buildContinuationConfigForTarget(targetStep, previous.config, nextInputImage.assetId, {
        parentResultId: result.id,
        parentJobId,
        parentRecordId,
      });
      return {
        ...prev,
        [targetStep]: {
          ...previous,
          inputImage: nextInputImage,
          materialImage: targetStep === GenerationStep.FreeReferenceImage ? previous.materialImage : null,
          materialTextures: targetStep === GenerationStep.MaterialReplace ? previous.materialTextures : [],
          furnitureReferences: [],
          maskImage: null,
          useFullImageMask: false,
          config: nextConfig,
          outputImage: null,
          generationResults: [],
          selectedGenerationResultId: null,
          isGenerating: false,
          generationStatus: 'ready',
          generationError: null,
          generationWarnings: [],
          generationProvider: null,
          generationResultId: null,
          generationCreatedAt: null,
          generationJobId: null,
          generationJobStatus: null,
          generationJobDiagnostics: null,
          generationProgress: 0,
          generationLogs: [`send-result: 已将「${label}」发送到 ${readGenerationStepLabel(targetStep)}。`],
          viewMode: 'original',
          continuationSource: {
            parentResultId: result.id,
            parentJobId,
            parentRecordId,
            imageUrl,
            assetId,
            label,
            action,
            createdAt: new Date().toISOString(),
          },
        },
      };
    });
  }, [currentStep, setCurrentStep, setStepStates, stepStates]);

  const handleContinueObjectInsertRefine = useCallback((image: UploadedImage, source: { resultId?: string; label: string }) => {
    setCurrentStep(GenerationStep.ObjectInsert);
    setActiveTab('generate');
    setStepStates(prev => {
      const previous = prev[GenerationStep.ObjectInsert];
      return {
        ...prev,
        [GenerationStep.ObjectInsert]: {
          ...previous,
          inputImage: image,
          materialImage: null,
          materialTextures: [],
          furnitureReferences: [],
          maskImage: null,
          useFullImageMask: false,
          config: {
            ...previous.config,
            sourceImageAssetId: image.assetId,
            objectReferenceAssetId: undefined,
            placementPreviewAssetId: undefined,
            placementGuideAssetId: undefined,
            placementMaskAssetId: undefined,
            objectPlacement: undefined,
            objectInsertInputOrder: undefined,
            maskMode: undefined,
            maskAssetId: undefined,
            objectInsertMode: 'object_insert_preview_fusion',
            objectInsert: {
              ...(previous.config.objectInsert || {}),
              mode: 'object_insert_preview_fusion',
              sourceImageAssetId: image.assetId,
              objectItems: [],
              previewAssetId: undefined,
              guideAssetId: undefined,
              maskAssetId: undefined,
              objectReferenceAssetId: undefined,
              objectReferenceAssetIds: undefined,
              placement: undefined,
            },
          },
          outputImage: null,
          generationResults: [],
          selectedGenerationResultId: null,
          isGenerating: false,
          generationStatus: 'ready',
          generationError: null,
          generationWarnings: [],
          generationProvider: null,
          generationResultId: null,
          generationCreatedAt: null,
          generationJobId: null,
          generationJobStatus: null,
          generationJobDiagnostics: null,
          generationProgress: 0,
          generationLogs: [`continue-refine: 已将「${source.label}」作为新的元素植入原图。`],
          viewMode: 'original',
          continuationSource: {
            parentResultId: source.resultId || '',
            parentJobId: previous.generationJobId,
            parentRecordId: previous.generationResultId,
            imageUrl: image.url || image.dataUrl,
            assetId: image.assetId,
            label: source.label,
            action: 'continue-edit',
            createdAt: new Date().toISOString(),
          },
        },
      };
    });
  }, [setCurrentStep, setStepStates]);

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

  const handleStartFromLanding = useCallback((step: GenerationStep) => {
    const nextUrl = `/app?feature=${readWorkspaceFeatureSlug(step)}`;
    window.history.pushState({}, '', nextUrl);
    setCurrentPath('/app');
    setCurrentStep(step);
    setActiveTab('generate');
  }, [setActiveTab, setCurrentStep]);

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

  if (currentPath === '/') {
    return (
      <Suspense fallback={<PageLoading />}>
        <LandingPage onStartCreate={handleStartFromLanding} />
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
                templates={promptTemplates}
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
              className="workspace-theme flex min-h-0 flex-1 flex-col overflow-hidden min-w-0"
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
                        onSecondaryEditResult={handleSecondaryEditResult}
                        onSendResultToStep={handleSendResultToStep}
                        onContinueObjectInsertRefine={handleContinueObjectInsertRefine}
                        onRenameGenerationResult={handleRenameGenerationResult}
                        onSetViewMode={handleSetViewMode}
                        onNextStep={handleNextStep}
                        onReset={handleResetConfig}
                        onHistoryRecord={record => setHistoryItems(items => [record, ...items.filter(item => item.id !== record.id)])}
                        backendProvider={backendHealth.data?.provider || null}
                        isCreditsInsufficient={isCreditsInsufficient}
                        estimatedCreditCost={estimatedCreditCost}
                        isAdmin={currentUser.role === 'admin'}
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
                <TemplatesLibrary templates={promptTemplates} currentConfig={stepStates[currentStep].config} onApply={handleApplyTemplate} />
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

function buildContinuationConfigForTarget(
  targetStep: ResultSendTargetStep,
  previousConfig: StepState['config'],
  sourceImageAssetId: string | undefined,
  parent: { parentResultId: string; parentJobId?: string | null; parentRecordId?: string | null },
): StepState['config'] {
  const base = {
    ...previousConfig,
    sourceImageAssetId,
    parentResultId: parent.parentResultId,
    parentJobId: parent.parentJobId,
    parentRecordId: parent.parentRecordId,
  };

  if (targetStep === GenerationStep.MaterialReplace) {
    return {
      ...base,
      maskMode: undefined,
      maskAssetId: undefined,
      editMode: base.editMode || 'smart-type',
      preserveLighting: base.preserveLighting ?? true,
      preserveGeometry: base.preserveGeometry ?? true,
      preserveStructure: base.preserveStructure ?? true,
    };
  }

  if (targetStep === GenerationStep.ObjectInsert) {
    return {
      ...base,
      objectReferenceAssetId: undefined,
      placementGuideAssetId: undefined,
      placementPreviewAssetId: undefined,
      placementMaskAssetId: undefined,
      objectPlacement: undefined,
      objectInsertInputOrder: undefined,
      maskMode: undefined,
      maskAssetId: undefined,
      objectInsertMode: 'object_insert_preview_fusion',
      objectInsert: {
        ...(base.objectInsert || {}),
        mode: 'object_insert_preview_fusion',
        sourceImageAssetId,
        objectItems: [],
        previewAssetId: undefined,
        guideAssetId: undefined,
        maskAssetId: undefined,
        objectReferenceAssetId: undefined,
        objectReferenceAssetIds: undefined,
        placement: undefined,
      },
    };
  }

  if (targetStep === GenerationStep.DesignVariants) {
    return {
      ...base,
      preserveStructure: base.preserveStructure ?? true,
      preserveCamera: base.preserveCamera ?? true,
    };
  }

  return {
    ...base,
    referenceImageAssetId: undefined,
    referenceImageAssetIds: [],
    freeReferenceReferences: [],
  };
}

function readGenerationStepLabel(step: ResultSendTargetStep): string {
  if (step === GenerationStep.MaterialReplace) return '材质替换';
  if (step === GenerationStep.ObjectInsert) return '元素植入';
  if (step === GenerationStep.DesignVariants) return '方案变体';
  return '自由参考生图';
}

function readImageMimeType(imageUrl: string): string {
  const dataUrlMimeType = /^data:([^;,]+)/u.exec(imageUrl)?.[1];
  if (dataUrlMimeType) return dataUrlMimeType;
  const pathname = imageUrl.split('?')[0]?.toLowerCase() || '';
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

function readWorkspaceFeatureStep(): GenerationStep | null {
  const feature = new URLSearchParams(window.location.search).get('feature');
  if (feature === 'floor-plan-color') return GenerationStep.FloorplanTo3D;
  if (feature === 'free-reference-image') return GenerationStep.FreeReferenceImage;
  if (feature === 'material-replace') return GenerationStep.MaterialReplace;
  if (feature === 'object-insert') return GenerationStep.ObjectInsert;
  if (feature === 'design-variants') return GenerationStep.DesignVariants;
  return null;
}

function readWorkspaceFeatureSlug(step: GenerationStep): string {
  if (step === GenerationStep.FreeReferenceImage) return 'free-reference-image';
  if (step === GenerationStep.MaterialReplace) return 'material-replace';
  if (step === GenerationStep.ObjectInsert) return 'object-insert';
  if (step === GenerationStep.DesignVariants) return 'design-variants';
  return 'floor-plan-color';
}
