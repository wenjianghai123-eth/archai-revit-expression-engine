/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useState, useCallback, useEffect, useRef } from 'react';
import { Sidebar, Stepper } from './components/Navigation';
import { HistoryView } from './components/HistoryView';
import { SettingsModal } from './components/SettingsModal';
import { LoginPage } from './components/LoginPage';
import { CreativeHome } from './components/CreativeHome';
import { ProjectList } from './components/ProjectList';
import {
  DesignWorkflowDetail,
  DesignWorkflowNode,
  AssetVersion,
  GenerationStep,
  GenerationHistoryItem,
  GenerationResultOption,
  ResultSendTargetStep,
  StepState,
  UploadedImage,
  SecondaryEditAction,
} from './types';
import {
  advanceProjectDesignWorkflow,
  backProjectDesignWorkflow,
  cancelGenerationJob,
  createAutoProject,
  createProjectDesignWorkflow,
  createEditSession,
  getImageAsset,
  getGenerationJob,
  getProjectDesignWorkflow,
  getEditSession,
  deleteProject,
  getAiProviders,
  listPromptTemplates,
  skipProjectDesignWorkflow,
  type AiProviderOption,
  type ImageAsset,
  updateGenerationResult,
  uploadImageAsset,
  type EditSessionDetail,
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
import { resolveAssetUrl } from './utils/assetUrl';
import { promptTemplateRecordToTemplate } from './utils/savedPromptTemplates';
import { readSelectedImageProvider, writeSelectedImageProvider } from './utils/aiProviderPreference';
import { getScenarioWorkflow } from './constants/productWorkflows';
import {
  getDesignWorkflowStage,
  getDesignWorkflowStageForStep,
  getNextDesignWorkflowStage,
} from './constants/designWorkflow';
import { DesignWorkflowBar } from './components/workflow/DesignWorkflowBar';
import {
  ApiConnectionStatus,
  getReadableApiConnectionError,
  isAbortError,
  sleep,
} from './utils/apiConnectionStatus';
import { motion, AnimatePresence } from 'motion/react';

const MainWorkspace = lazy(() => import('./components/MainWorkspace').then(module => ({ default: module.MainWorkspace })));
const LandingPage = lazy(() => import('./pages/LandingPage').then(module => ({ default: module.LandingPage })));
const AssetBank = lazy(() => import('./components/AssetBank').then(module => ({ default: module.AssetBank })));
const TemplatesLibrary = lazy(() => import('./components/TemplatesLibrary').then(module => ({ default: module.TemplatesLibrary })));
const ProjectDetail = lazy(() => import('./components/ProjectDetail').then(module => ({ default: module.ProjectDetail })));
const PublicSharePreview = lazy(() => import('./components/PublicSharePreview').then(module => ({ default: module.PublicSharePreview })));
const PanoramaSharePage = lazy(() => import('./components/PanoramaSharePage').then(module => ({ default: module.PanoramaSharePage })));
const AdminPage = lazy(() => import('./components/AdminPage').then(module => ({ default: module.AdminPage })));
const ImageEditSessionWorkspace = lazy(() => import('./components/ImageEditSessionWorkspace').then(module => ({ default: module.ImageEditSessionWorkspace })));
const apiStatusRetryDelays = [300, 800, 1500];
const fallbackAiProvider: AiProviderOption = { value: 'grsai-banana2', label: 'Grsai Banana2', enabled: true, missingConfig: [] };
const backendUnavailableMessage = '后端服务暂不可用，请稍后重试或检查部署配置。';
const activeEditSessionStorageKey = 'archai:active-edit-session-id';

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const [currentSearch, setCurrentSearch] = useState(() => window.location.search);
  const {
    user: currentUser,
    isLoading: isUserLoading,
    error: currentUserError,
    isSigningIn,
    authMessage,
    isAuthConfigured,
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
  const [selectedImageProvider, setSelectedImageProvider] = useState<AiProviderOption['value'] | undefined>(fallbackAiProvider.value);
  const [defaultImageProvider, setDefaultImageProvider] = useState<AiProviderOption['value'] | null>(fallbackAiProvider.value);
  const [imageProviders, setImageProviders] = useState<AiProviderOption[]>([fallbackAiProvider]);
  const [apiConnectionStatus, setApiConnectionStatus] = useState<ApiConnectionStatus>('checking');
  const [apiConnectionError, setApiConnectionError] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<GenerationHistoryItem[]>(() => listGenerationRecords());
  const [promptTemplates, setPromptTemplates] = useState(() => [] as ReturnType<typeof promptTemplateRecordToTemplate>[]);
  const [queuedSecondaryGenerationId, setQueuedSecondaryGenerationId] = useState<string | null>(null);
  const [editSessionDetail, setEditSessionDetail] = useState<EditSessionDetail | null>(null);
  const [designWorkflowDetail, setDesignWorkflowDetail] = useState<DesignWorkflowDetail | null>(null);
  const [isDesignWorkflowBusy, setIsDesignWorkflowBusy] = useState(false);
  const [designWorkflowError, setDesignWorkflowError] = useState<string | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const apiProviderRequestIdRef = useRef(0);
  const { backendHealth, refreshBackendHealth } = useBackendHealth(isSettingsOpen);
  const { creditBalance, creditError, refreshCreditBalance } = useCreditBalance(Boolean(currentUser));
  const panoramaShareId = readPanoramaShareId();
  const publicShareToken = readPublicShareToken();
  const isAdminPath = currentPath === '/admin';
  const selectedProviderInfo = imageProviders.find(provider => provider.value === selectedImageProvider);
  const providerUnavailableReason = selectedProviderInfo && !selectedProviderInfo.enabled
    ? selectedImageProvider === 'apiyi-nano-banana2-edit'
      ? '未配置 API易 API Key，请在后端 .env 中配置 APIYI_API_KEY。'
      : `当前 AI 接口缺少配置：${selectedProviderInfo.missingConfig.join('、')}。`
    : apiConnectionStatus === 'failed'
      ? apiConnectionError || '无法连接后端服务，请确认本地服务已启动或刷新重试。'
      : null;
  const isProviderConfigLoading = apiConnectionStatus === 'checking';

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
    window.localStorage.removeItem(activeEditSessionStorageKey);
    setEditSessionDetail(null);
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
      throw new Error(backendUnavailableMessage);
    }
  }, [selectedProjectId, setSelectedProjectId]);

  const refreshDesignWorkflow = useCallback(async (projectId = selectedProjectId) => {
    if (!projectId || !currentUser) {
      setDesignWorkflowDetail(null);
      return null;
    }
    const detail = await getProjectDesignWorkflow(projectId);
    setDesignWorkflowDetail(detail);
    return detail;
  }, [currentUser, selectedProjectId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedProjectId || !currentUser) {
      setDesignWorkflowDetail(null);
      return;
    }
    setDesignWorkflowError(null);
    void getProjectDesignWorkflow(selectedProjectId)
      .then(detail => {
        if (!cancelled) setDesignWorkflowDetail(detail);
      })
      .catch(error => {
        if (!cancelled) {
          setDesignWorkflowError(
            error instanceof Error ? error.message : '设计表达流程加载失败。',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser, selectedProjectId]);

  const openDesignWorkflowStage = useCallback(async (detail: DesignWorkflowDetail) => {
    setDesignWorkflowDetail(detail);
    const node = detail.nodes.find(item => item.id === detail.workflow.currentNodeId);
    if (!node) return;
    if (node.stageKey === 'delivery') {
      setActiveTab('project-detail');
      return;
    }
    if (node.stageKey === 'continuous-edit') {
      setActiveTab('generate');
      if (!editSessionDetail) {
        setDesignWorkflowError('当前位于连续修改阶段，请在上一阶段结果中点击“连续修改”进入会话。');
      }
      return;
    }
    if (node.stageKey === 'input') return;

    const stage = getDesignWorkflowStage(node.stageKey);
    let targetStep = stage?.generationStep || null;
    if (node.stageKey === 'base-render') {
      const root = detail.nodes.find(item => item.parentNodeId === null);
      targetStep = root?.sourceFeature === 'model-snapshot-render'
        ? GenerationStep.ModelSnapshotRender
        : GenerationStep.FloorplanTo3D;
    }
    if (!targetStep) return;

    const assetId = node.inputAssetId || node.outputAssetId;
    const asset = assetId ? await getImageAsset(assetId) : null;
    setCurrentStep(targetStep);
    setActiveTab('generate');
    setStepStates(previous => ({
      ...previous,
      [targetStep]: {
        ...previous[targetStep],
        inputImage: asset ? imageAssetToUploadedImage(asset) : previous[targetStep].inputImage,
        config: {
          ...previous[targetStep].config,
          designWorkflowId: detail.workflow.id,
          designWorkflowNodeId: node.id,
          designWorkflowStageKey: node.stageKey,
          sourceImageAssetId: assetId || previous[targetStep].config.sourceImageAssetId,
        },
      },
    }));
  }, [
    editSessionDetail,
    setActiveTab,
    setCurrentStep,
    setStepStates,
  ]);

  const handleStartDesignWorkflow = useCallback(async () => {
    const inputImage = stepStates[currentStep].inputImage;
    if (!selectedProjectId || !inputImage?.assetId) {
      setDesignWorkflowError('请先完成图片上传并取得正式 assetId。');
      return;
    }
    setIsDesignWorkflowBusy(true);
    setDesignWorkflowError(null);
    try {
      const detail = await createProjectDesignWorkflow({
        projectId: selectedProjectId,
        inputAssetId: inputImage.assetId,
        sourceFeature: readWorkspaceFeatureSlug(currentStep),
      });
      setDesignWorkflowDetail(detail);
    } catch (error) {
      setDesignWorkflowError(
        error instanceof Error ? error.message : '设计表达流程创建失败。',
      );
    } finally {
      setIsDesignWorkflowBusy(false);
    }
  }, [currentStep, selectedProjectId, stepStates]);

  const handleAdvanceDesignWorkflow = useCallback(async () => {
    if (!selectedProjectId || !designWorkflowDetail) return;
    const currentNode = findCurrentWorkflowNode(designWorkflowDetail);
    const nextStage = currentNode
      ? getNextDesignWorkflowStage(currentNode.stageKey)
      : null;
    if (!currentNode || !nextStage) return;
    setIsDesignWorkflowBusy(true);
    setDesignWorkflowError(null);
    try {
      const detail = await advanceProjectDesignWorkflow({
        projectId: selectedProjectId,
        workflowId: designWorkflowDetail.workflow.id,
        stageKey: nextStage.key,
        sourceFeature: currentNode.stageKey,
        inputAssetId: currentNode.outputAssetId || currentNode.inputAssetId,
        parentJobId: currentNode.outputJobId || currentNode.parentJobId,
        parentResultId: currentNode.outputResultId || currentNode.parentResultId,
      });
      await openDesignWorkflowStage(detail);
    } catch (error) {
      setDesignWorkflowError(
        error instanceof Error ? error.message : '无法进入下一流程步骤。',
      );
    } finally {
      setIsDesignWorkflowBusy(false);
    }
  }, [
    designWorkflowDetail,
    openDesignWorkflowStage,
    selectedProjectId,
  ]);

  const handleSkipDesignWorkflow = useCallback(async () => {
    if (!selectedProjectId || !designWorkflowDetail) return;
    setIsDesignWorkflowBusy(true);
    setDesignWorkflowError(null);
    try {
      const detail = await skipProjectDesignWorkflow(
        selectedProjectId,
        designWorkflowDetail.workflow.id,
      );
      await openDesignWorkflowStage(detail);
    } catch (error) {
      setDesignWorkflowError(
        error instanceof Error ? error.message : '跳过流程步骤失败。',
      );
    } finally {
      setIsDesignWorkflowBusy(false);
    }
  }, [designWorkflowDetail, openDesignWorkflowStage, selectedProjectId]);

  const handleBackDesignWorkflow = useCallback(async () => {
    if (!selectedProjectId || !designWorkflowDetail) return;
    setIsDesignWorkflowBusy(true);
    setDesignWorkflowError(null);
    try {
      const detail = await backProjectDesignWorkflow(
        selectedProjectId,
        designWorkflowDetail.workflow.id,
      );
      await openDesignWorkflowStage(detail);
    } catch (error) {
      setDesignWorkflowError(
        error instanceof Error ? error.message : '回退流程步骤失败。',
      );
    } finally {
      setIsDesignWorkflowBusy(false);
    }
  }, [designWorkflowDetail, openDesignWorkflowStage, selectedProjectId]);

  const handleWorkflowGenerationCompleted = useCallback(
    async () => {
      await refreshDesignWorkflow();
    },
    [refreshDesignWorkflow],
  );

  const { isCreditsInsufficient, handleGenerate } = useGenerationRunner({
    currentStep,
    ensureActiveProject,
    stepStates,
    setStepStates,
    creditBalance,
    refreshCreditBalance,
    setHistoryItems,
    onGenerationCompleted: handleWorkflowGenerationCompleted,
  });

  const handleStartContinuousEdit = useCallback(async (image: UploadedImage) => {
    if (!currentUser) throw new Error('登录状态已失效，请重新登录。');
    if (image.uploadStatus !== 'uploaded') throw new Error(image.uploadStatus === 'failed' ? image.uploadError || '图片上传失败，请重新上传。' : '图片正在上传，完成后可连续修改。');
    if (!image.assetId) throw new Error('图片上传完成但未返回正式资产 ID，请重新上传。');
    try {
      const project = await ensureActiveProject();
      const detail = await createEditSession({ sourceAssetId: image.assetId, projectId: project.projectId, title: `${image.name || '图片'} · 连续修改`, aspectRatio: '16:9', permanentConstraints: { strictStructure: true, preserveCamera: true, preserveAspectRatio: true, forbidNewComponents: true } });
      if (!detail.session?.id) throw new Error('后端未返回连续修改会话 ID。');
      if (!detail.versions.some(version => version.versionNumber === 0 && version.id === detail.session.originalVersionId)) throw new Error('连续修改会话创建成功，但后端未返回原图版本 V0。');
      setEditSessionDetail(detail);
      setActiveTab('generate');
      window.localStorage.setItem(activeEditSessionStorageKey, detail.session.id);
    } catch (error) {
      console.error('[continuous-edit] create session failed', { assetId: image.assetId, error });
      const message = error instanceof Error ? error.message : '连续修改会话创建失败。';
      setApiConnectionError(message);
      throw error;
    }
  }, [currentUser, ensureActiveProject, setActiveTab]);

  useEffect(() => {
    if (!currentUser || editSessionDetail) return;
    const sessionId = window.localStorage.getItem(activeEditSessionStorageKey);
    if (!sessionId) return;
    void getEditSession(sessionId).then(detail => {
      setEditSessionDetail(detail);
      setActiveTab('generate');
      if (detail.session.projectId) setSelectedProjectId(detail.session.projectId);
    }).catch(() => window.localStorage.removeItem(activeEditSessionStorageKey));
  }, [currentUser, editSessionDetail, setActiveTab, setSelectedProjectId]);

  const handleOpenEditSession = useCallback(async (sessionId: string) => {
    const detail = await getEditSession(sessionId);
    setEditSessionDetail(detail);
    if (detail.session.projectId) setSelectedProjectId(detail.session.projectId);
    setActiveTab('generate');
    window.localStorage.setItem(activeEditSessionStorageKey, detail.session.id);
  }, [setActiveTab, setSelectedProjectId]);

  useEffect(() => {
    if (!queuedSecondaryGenerationId) return;
    setQueuedSecondaryGenerationId(null);
    void handleGenerate();
  }, [handleGenerate, queuedSecondaryGenerationId]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++apiProviderRequestIdRef.current;

    const loadProviders = async () => {
      console.debug('[api-status] checking');
      setApiConnectionStatus('checking');
      setApiConnectionError(null);

      for (let attempt = 0; attempt < apiStatusRetryDelays.length; attempt += 1) {
        try {
          const config = await getAiProviders({ signal: controller.signal });
          if (requestId !== apiProviderRequestIdRef.current) return;
          const selectedProvider = readSelectedImageProvider(
            config.defaultProvider,
            config.providers.map(provider => provider.value),
          );
          const hasDisabledProvider = config.providers.some(provider => !provider.enabled);
          setDefaultImageProvider(config.defaultProvider);
          setImageProviders(config.providers);
          setSelectedImageProvider(selectedProvider);
          setApiConnectionStatus(hasDisabledProvider ? 'degraded' : 'connected');
          setApiConnectionError(null);
          console.debug(hasDisabledProvider ? '[api-status] connected: degraded provider config' : '[api-status] connected');
          return;
        } catch (error) {
          if (requestId !== apiProviderRequestIdRef.current) return;
          if (isAbortError(error)) {
            console.debug('[api-status] request aborted, ignored');
            return;
          }

          if (attempt < apiStatusRetryDelays.length - 1) {
            console.warn('[api-status] retry', { attempt: attempt + 1, message: getReadableApiConnectionError(error) });
            await sleep(apiStatusRetryDelays[attempt]);
            continue;
          }

          console.warn('[api-status] failed', getReadableApiConnectionError(error));
          setDefaultImageProvider(fallbackAiProvider.value);
          setImageProviders([fallbackAiProvider]);
          setSelectedImageProvider(fallbackAiProvider.value);
          setApiConnectionStatus('failed');
          setApiConnectionError(backendUnavailableMessage);
        }
      }
    };

    void loadProviders();
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!selectedImageProvider) return;
    setStepStates(previous => {
      const next = { ...previous };
      for (const step of Object.values(GenerationStep).filter((value): value is GenerationStep => typeof value === 'number')) {
        next[step] = {
          ...previous[step],
          config: {
            ...previous[step].config,
            aiProvider: selectedImageProvider,
          },
        };
      }
      return next;
    });
  }, [selectedImageProvider, setStepStates]);

  const handleImageProviderChange = useCallback((provider: AiProviderOption['value']) => {
    setSelectedImageProvider(provider);
    if (defaultImageProvider) {
      writeSelectedImageProvider(provider, defaultImageProvider);
    }
  }, [defaultImageProvider]);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
      setCurrentSearch(window.location.search);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (currentPath !== '/app') return;
    const requestedStep = readWorkspaceFeatureStep(currentSearch);
    if (!requestedStep) {
      setActiveScenarioId(null);
      setActiveTab('home');
      return;
    }
    setCurrentStep(requestedStep);
    setActiveTab('generate');
  }, [currentPath, currentSearch, setActiveTab, setCurrentStep]);

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

  const handleDeleteGenerationResult = useCallback((resultId: string) => {
    setStepStates(prev => {
      const remaining = prev[currentStep].generationResults.filter(item => item.id !== resultId);
      const selected = remaining.find(item => item.isSelected) || remaining[0] || null;
      return {
        ...prev,
        [currentStep]: {
          ...prev[currentStep],
          generationResults: remaining.map(item => ({ ...item, isSelected: item.id === selected?.id })),
          selectedGenerationResultId: selected?.id || null,
          outputImage: selected?.imageUrl || null,
        },
      };
    });
  }, [currentStep, setStepStates]);

  const handleStartContinuousEditFromResult = useCallback(async (
    result: GenerationResultOption,
    label: string,
  ) => {
    const imageUrl = getOriginalResultImageUrl(result, result.imageUrl);
    if (!imageUrl) throw new Error('当前结果没有可用的图片地址。');

    let assetId = getOriginalResultAssetId(result, result.assetId) || undefined;
    if (!assetId) {
      const response = await fetch(resolveAssetUrl(imageUrl));
      if (!response.ok) throw new Error('无法读取当前结果，请先下载后重新上传。');
      const blob = await response.blob();
      const asset = await uploadImageAsset(blob, `${label || '生成结果'}.png`);
      assetId = asset.id;
    }

    if (
      designWorkflowDetail
      && findCurrentWorkflowNode(designWorkflowDetail)?.stageKey !== 'continuous-edit'
    ) {
      const parentJobId = result.jobId;
      if (!selectedProjectId || !parentJobId) {
        throw new Error('连续修改流程需要已保存的 generation job。');
      }
      const advanced = await advanceProjectDesignWorkflow({
        projectId: selectedProjectId,
        workflowId: designWorkflowDetail.workflow.id,
        stageKey: 'continuous-edit',
        sourceFeature: typeof result.metadata?.sourceFeature === 'string'
          ? result.metadata.sourceFeature
          : readWorkspaceFeatureSlug(currentStep),
        inputAssetId: assetId,
        parentJobId,
        parentResultId: result.id,
      });
      setDesignWorkflowDetail(advanced);
    }

    await handleStartContinuousEdit({
      id: `continuous-result-${result.id}-${Date.now()}`,
      name: `${label || '生成结果'}.png`,
      type: readImageMimeType(imageUrl),
      size: 0,
      dataUrl: imageUrl,
      url: imageUrl.startsWith('data:') ? undefined : imageUrl,
      assetId,
      uploadStatus: 'uploaded',
    });
  }, [
    currentStep,
    designWorkflowDetail,
    handleStartContinuousEdit,
    selectedProjectId,
  ]);

  const handleSendEditVersionToPolish = useCallback(async (version: AssetVersion) => {
    if (!selectedProjectId) throw new Error('请先选择项目。');
    let workflowNode: DesignWorkflowNode | null = null;
    if (designWorkflowDetail) {
      const parentJobId = version.generationJobId;
      if (!parentJobId) throw new Error('当前版本没有关联 generation job，无法写入正式流程关系。');
      const job = await getGenerationJob(parentJobId);
      const parentResult = job.results?.find(result => result.assetId === version.assetId)
        || job.results?.[0];
      if (!parentResult) throw new Error('当前版本没有关联 generation result。');
      const advanced = await advanceProjectDesignWorkflow({
        projectId: selectedProjectId,
        workflowId: designWorkflowDetail.workflow.id,
        stageKey: 'image-polish',
        sourceFeature: 'continuous-edit',
        inputAssetId: version.assetId,
        parentJobId,
        parentResultId: parentResult.id,
      });
      setDesignWorkflowDetail(advanced);
      workflowNode = advanced.node;
    }
    const asset = await getImageAsset(version.assetId);
    const inputImage = imageAssetToUploadedImage(asset);
    setCurrentStep(GenerationStep.ImagePolish);
    setActiveTab('generate');
    setEditSessionDetail(null);
    window.localStorage.removeItem(activeEditSessionStorageKey);
    setStepStates(previous => ({
      ...previous,
      [GenerationStep.ImagePolish]: {
        ...previous[GenerationStep.ImagePolish],
        inputImage,
        config: {
          ...previous[GenerationStep.ImagePolish].config,
          sourceImageAssetId: version.assetId,
          ...(workflowNode && designWorkflowDetail ? {
            designWorkflowId: designWorkflowDetail.workflow.id,
            designWorkflowNodeId: workflowNode.id,
            designWorkflowStageKey: workflowNode.stageKey,
          } : {}),
        },
        outputImage: null,
        generationResults: [],
        selectedGenerationResultId: null,
        generationStatus: 'ready',
        generationError: null,
        continuationSource: {
          parentResultId: version.id,
          parentJobId: version.generationJobId,
          parentRecordId: null,
          imageUrl: version.publicUrl,
          assetId: version.assetId,
          label: version.displayName || `V${version.versionNumber}`,
          action: `send-to-${GenerationStep.ImagePolish}` as const,
          createdAt: new Date().toISOString(),
        },
      },
    }));
  }, [
    designWorkflowDetail,
    selectedProjectId,
    setActiveTab,
    setCurrentStep,
    setStepStates,
  ]);

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
    if (action === 'continue-edit') {
      void handleStartContinuousEditFromResult(result, label).catch(error => {
        console.error('[continuous-edit] create session from result failed', {
          resultId: result.id,
          assetId: result.assetId,
          error,
        });
        setApiConnectionError(
          error instanceof Error ? error.message : '无法从当前结果创建连续修改会话。',
        );
      });
      return;
    }

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
        maskHasVisiblePixels: false,
        protectionMaskImage: null,
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
  }, [
    currentStep,
    handleStartContinuousEditFromResult,
    setStepStates,
    stepStates,
  ]);

  const handleSendResultToStep = useCallback((resultId: string, targetStep: ResultSendTargetStep) => {
    void (async () => {
      const currentState = stepStates[currentStep];
      const result = currentState.generationResults.find(item => item.id === resultId)
        || (currentState.outputImage
          ? {
              id: currentState.generationResultId || resultId,
              imageUrl: currentState.outputImage,
              assetId: undefined,
              jobId: currentState.generationJobId || undefined,
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
      const parentJobId = result.jobId || currentState.generationJobId;
      const parentRecordId = currentState.generationResultId;
      const targetWorkflowStage = getDesignWorkflowStageForStep(targetStep);
      let workflowNode: DesignWorkflowNode | null = null;

      if (designWorkflowDetail && targetWorkflowStage) {
        if (!selectedProjectId || !assetId || !parentJobId) {
          setDesignWorkflowError('流程传递需要正式 assetId 和 generation job，请等待结果保存完成后重试。');
          return;
        }
        const advanced = await advanceProjectDesignWorkflow({
          projectId: selectedProjectId,
          workflowId: designWorkflowDetail.workflow.id,
          stageKey: targetWorkflowStage,
          sourceFeature: readWorkspaceFeatureSlug(currentStep),
          inputAssetId: assetId,
          parentJobId,
          parentResultId: result.id,
        });
        setDesignWorkflowDetail(advanced);
        workflowNode = advanced.node;
      }

      const nextInputImage: UploadedImage = {
        id: `send-${targetStep}-${result.id}-${Date.now()}`,
        name: `${label}.png`,
        type: readImageMimeType(imageUrl),
        size: 0,
        dataUrl: imageUrl,
        url: imageUrl.startsWith('data:') ? undefined : imageUrl,
        assetId,
        uploadStatus: assetId ? 'uploaded' : undefined,
      };
      const action = `send-to-${targetStep}` as const;

      setCurrentStep(targetStep);
      setActiveTab('generate');
      setStepStates(prev => {
        const previous = prev[targetStep];
        const continuationConfig = buildContinuationConfigForTarget(
          targetStep,
          previous.config,
          nextInputImage.assetId,
          {
            parentResultId: result.id,
            parentJobId,
            parentRecordId,
          },
        );
        const nextConfig = workflowNode && designWorkflowDetail
          ? {
              ...continuationConfig,
              designWorkflowId: designWorkflowDetail.workflow.id,
              designWorkflowNodeId: workflowNode.id,
              designWorkflowStageKey: workflowNode.stageKey,
            }
          : continuationConfig;
        return {
          ...prev,
          [targetStep]: {
            ...previous,
            inputImage: nextInputImage,
            materialImage: targetStep === GenerationStep.FreeReferenceImage
              ? previous.materialImage
              : null,
            materialTextures: targetStep === GenerationStep.MaterialReplace
              ? previous.materialTextures
              : [],
            furnitureReferences: [],
            maskImage: null,
            maskHasVisiblePixels: false,
            protectionMaskImage: null,
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
    })().catch(error => {
      setDesignWorkflowError(
        error instanceof Error ? error.message : '设计表达流程传递失败。',
      );
    });
  }, [
    currentStep,
    designWorkflowDetail,
    selectedProjectId,
    setActiveTab,
    setCurrentStep,
    setStepStates,
    stepStates,
  ]);

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
          maskHasVisiblePixels: false,
          protectionMaskImage: null,
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
            imageUrl: resolveAssetUrl(image.url || image.dataUrl),
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
          maskHasVisiblePixels: false,
          protectionMaskImage: null,
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
    setActiveScenarioId(null);
    startCreate(setCurrentStep, step);
  }, [setCurrentStep, startCreate]);

  const handleEnterHomeFromLanding = useCallback(() => {
    setActiveScenarioId(null);
    window.history.pushState({}, '', '/app');
    setCurrentPath('/app');
    setCurrentSearch('');
    setActiveTab('home');
  }, [setActiveTab]);

  const handleStartFromLanding = useCallback((step: GenerationStep) => {
    setActiveScenarioId(null);
    const nextUrl = `/app?feature=${readWorkspaceFeatureSlug(step)}`;
    window.history.pushState({}, '', nextUrl);
    setCurrentPath('/app');
    setCurrentSearch(`?feature=${readWorkspaceFeatureSlug(step)}`);
    setCurrentStep(step);
    setActiveTab('generate');
  }, [setActiveTab, setCurrentStep]);

  const handleStartScenario = useCallback((scenarioId: string, step: GenerationStep) => {
    setActiveScenarioId(scenarioId);
    if (window.location.pathname === '/') {
      const nextUrl = `/app?feature=${readWorkspaceFeatureSlug(step)}`;
      window.history.pushState({}, '', nextUrl);
      setCurrentPath('/app');
      setCurrentSearch(`?feature=${readWorkspaceFeatureSlug(step)}`);
    }
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
        <LandingPage
          onEnterHome={handleEnterHomeFromLanding}
          onStartCreate={handleStartFromLanding}
          onStartScenario={handleStartScenario}
        />
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
        isAuthConfigured={isAuthConfigured}
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
                onStartScenario={handleStartScenario}
                onOpenTemplates={() => setActiveTab('templates')}
                onOpenAssets={() => setActiveTab('assets')}
                onOpenHistory={() => setActiveTab('history')}
                onOpenProject={handleOpenProjectWithReset}
                onOpenProjects={() => setActiveTab('projects')}
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
                  onOpenEditSession={sessionId => {
                    void handleOpenEditSession(sessionId);
                  }}
                  onStartContinuousEditResult={handleStartContinuousEditFromResult}
                  designWorkflow={designWorkflowDetail}
                  onBackDesignWorkflow={() => {
                    void handleBackDesignWorkflow();
                  }}
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
                creditBalance={creditBalance?.balance ?? null}
                selectedProvider={selectedImageProvider}
                providers={imageProviders}
                isProviderLoading={isProviderConfigLoading}
                onProviderChange={handleImageProviderChange}
              />
              {getScenarioWorkflow(activeScenarioId) ? (
                <ScenarioWorkflowBanner scenarioId={activeScenarioId as string} onClose={() => setActiveScenarioId(null)} />
              ) : null}
              {selectedProjectId ? (
                <DesignWorkflowBar
                  detail={designWorkflowDetail}
                  hasFormalInputAsset={Boolean(stepStates[currentStep].inputImage?.assetId)}
                  isBusy={isDesignWorkflowBusy}
                  error={designWorkflowError}
                  onStart={() => {
                    void handleStartDesignWorkflow();
                  }}
                  onBack={() => {
                    void handleBackDesignWorkflow();
                  }}
                  onSkip={() => {
                    void handleSkipDesignWorkflow();
                  }}
                  onAdvance={() => {
                    void handleAdvanceDesignWorkflow();
                  }}
                />
              ) : null}
              
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
                      {editSessionDetail ? <ImageEditSessionWorkspace initialDetail={editSessionDetail} creditBalance={creditBalance?.balance??null} onRefreshCredits={refreshCreditBalance} onSendVersionToPolish={handleSendEditVersionToPolish} onClose={()=>{setEditSessionDetail(null);window.localStorage.removeItem(activeEditSessionStorageKey);}}/> : <MainWorkspace
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
                        onDeleteGenerationResult={handleDeleteGenerationResult}
                        onSetViewMode={handleSetViewMode}
                        onNextStep={handleNextStep}
                        onReset={handleResetConfig}
                        onHistoryRecord={record => setHistoryItems(items => [record, ...items.filter(item => item.id !== record.id)])}
                        backendProvider={backendHealth.data?.provider || null}
                        isCreditsInsufficient={isCreditsInsufficient}
                        providerUnavailableReason={providerUnavailableReason}
                        isAdmin={currentUser.role === 'admin'}
                        onStartContinuousEdit={handleStartContinuousEdit}
                        creditBalance={creditBalance?.balance ?? null}
                        onRefreshCreditBalance={refreshCreditBalance}
                        onEnsureProject={async () => (await ensureActiveProject()).projectId}
                      />}
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
                <AssetBank
                  templates={promptTemplates}
                  currentProjectId={selectedProjectId}
                  currentUserId={currentUser.id}
                  isAdmin={currentUser.role === 'admin'}
                  onApplyTemplate={handleApplyTemplate}
                />
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
        providerSource={backendHealth.data?.provider === 'gemini'
          || backendHealth.data?.provider === 'grsai-banana2'
          || backendHealth.data?.provider === 'grsai-nano-banana'
          || backendHealth.data?.provider === 'apiyi-nano-banana2-edit'
          ? 'Real provider'
          : backendHealth.data?.provider === 'mock' ? 'Mock provider' : '未知（后端未连接）'}
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

function imageAssetToUploadedImage(asset: ImageAsset): UploadedImage {
  const imageUrl = asset.publicUrl || asset.url;
  return {
    id: asset.id,
    name: asset.filename,
    type: asset.mimeType,
    size: asset.size,
    dataUrl: imageUrl,
    url: imageUrl,
    publicUrl: asset.publicUrl,
    thumbnailUrl: asset.thumbnailUrl,
    assetId: asset.id,
    uploadStatus: 'uploaded',
  };
}

function findCurrentWorkflowNode(detail: DesignWorkflowDetail): DesignWorkflowNode | null {
  return detail.nodes.find(node => node.id === detail.workflow.currentNodeId) || null;
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

  if (targetStep === GenerationStep.ImagePolish) {
    return {
      ...base,
      preserveStructure: base.preserveStructure ?? true,
      preserveCamera: base.preserveCamera ?? true,
      preserveColor: base.preserveColor ?? true,
      preserveMaterialAppearance: base.preserveMaterialAppearance ?? true,
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
  if (step === GenerationStep.MaterialReplace) return '材质软装替换';
  if (step === GenerationStep.ObjectInsert) return '元素植入';
  if (step === GenerationStep.DesignVariants) return '方案变体';
  if (step === GenerationStep.ImagePolish) return '质感提升';
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

function readWorkspaceFeatureStep(search = window.location.search): GenerationStep | null {
  const feature = new URLSearchParams(search).get('feature');
  if (feature === 'floor-plan-color') return GenerationStep.FloorplanTo3D;
  if (feature === 'free-reference-image') return GenerationStep.FreeReferenceImage;
  if (feature === 'image-polish') return GenerationStep.ImagePolish;
  if (feature === 'material-replace') return GenerationStep.MaterialReplace;
  if (feature === 'object-insert') return GenerationStep.ObjectInsert;
  if (feature === 'design-variants') return GenerationStep.DesignVariants;
  if (feature === 'plan-colorize') return GenerationStep.PlanColorize;
  if (feature === 'model-snapshot-render') return GenerationStep.ModelSnapshotRender;
  return null;
}

function readWorkspaceFeatureSlug(step: GenerationStep): string {
  if (step === GenerationStep.ImagePolish) return 'image-polish';
  if (step === GenerationStep.FreeReferenceImage) return 'free-reference-image';
  if (step === GenerationStep.MaterialReplace) return 'material-replace';
  if (step === GenerationStep.ObjectInsert) return 'object-insert';
  if (step === GenerationStep.DesignVariants) return 'design-variants';
  if (step === GenerationStep.PlanColorize) return 'plan-colorize';
  if (step === GenerationStep.ModelSnapshotRender) return 'model-snapshot-render';
  return 'floor-plan-color';
}

function ScenarioWorkflowBanner({ scenarioId, onClose }: { scenarioId: string; onClose: () => void }) {
  const scenario = getScenarioWorkflow(scenarioId);
  if (!scenario) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-900">
      <span className="shrink-0 font-black">{scenario.title}</span>
      <span className="text-blue-300">推荐流程</span>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap py-0.5 font-bold">
        {scenario.steps.map((step, index) => (
          <React.Fragment key={step}>
            <span className="rounded-full bg-white px-2.5 py-1 shadow-sm">{step}</span>
            {index < scenario.steps.length - 1 ? <span className="text-blue-300">→</span> : null}
          </React.Fragment>
        ))}
      </div>
      <button type="button" onClick={onClose} className="shrink-0 rounded-full px-2 py-1 font-black text-blue-500 hover:bg-white" aria-label="关闭推荐流程">×</button>
    </div>
  );
}
