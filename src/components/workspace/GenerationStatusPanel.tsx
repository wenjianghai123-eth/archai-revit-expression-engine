import { BookOpen, FileJson, Heart, RefreshCw, Settings2, Zap } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { GenerationBatchItem, GenerationResultOption, GenerationStep, ResultSendTargetStep, SecondaryEditAction, StepState } from '../../types';
import { buildResultImageFilename, downloadAsset, downloadJson, downloadFallbackMessage } from '../../utils/downloadAsset';
import { continuationActionLabels } from '../../utils/secondaryEdit';
import { formatResultDimensions, getOriginalResultAssetId, getOriginalResultImageUrl } from '../../utils/resultImage';
import { ViewModeOption } from './workspaceTypes';
import { PreviewContent } from './ResultPreviewPanel';
import { MaterialRepairActions, ResultSendActions, SecondaryEditActions } from './SecondaryEditActions';
import { SavePromptTemplateModal } from '../SavePromptTemplateModal';
import { canSavePromptTemplate } from '../../utils/savedPromptTemplates';
import { AspectRatioImage } from '../common/AspectRatioImage';
import { GenerationImageViewer } from '../common/GenerationImageViewer';
import { ResultQualityReport } from '../common/ResultQualityReport';
import { GenerationResultActions } from '../common/GenerationResultActions';
import { NormalizedGenerationProgress } from '../common/GenerationProgress';
import { normalizeStepGenerationResult } from '../../utils/normalizeGenerationResult';

interface GenerationStatusPanelProps {
  step: GenerationStep;
  state: StepState;
  title: string;
  statusLabel: string;
  elapsedSeconds: number;
  canGenerate: boolean;
  disabledReason?: string | null;
  validationErrors?: string[];
  previewImage: string | null | undefined;
  originalImageUrl: string | null;
  resultOptions: GenerationResultOption[];
  selectedResultId: string | null;
  viewModeOptions: ViewModeOption[];
  topPanels: ReactNode;
  projectName?: string | null;
  onGenerate: () => void;
  onRegenerate: () => void;
  onCancelGeneration: () => void;
  onSelectGenerationResult: (resultId: string) => void;
  onToggleGenerationFavorite: (resultId: string) => void;
  onSecondaryEditResult: (resultId: string, action: SecondaryEditAction) => void;
  onSendResultToStep: (resultId: string, targetStep: ResultSendTargetStep) => void;
  onRetryBatchItem?: (variantIndex: number) => void;
  onSetViewMode: (viewMode: StepState['viewMode']) => void;
  onNextStep: () => void;
  onReset: () => void;
  resetLabel?: string;
  showResultViewer?: boolean;
  className?: string;
  layout?: 'default' | 'floor-plan';
}

export function GenerationStatusPanel({
  step,
  state,
  title,
  statusLabel,
  canGenerate,
  disabledReason = null,
  validationErrors = [],
  previewImage,
  originalImageUrl,
  resultOptions,
  selectedResultId,
  viewModeOptions,
  topPanels,
  projectName,
  onGenerate,
  onRegenerate,
  onCancelGeneration,
  onSelectGenerationResult,
  onToggleGenerationFavorite,
  onSecondaryEditResult,
  onSendResultToStep,
  onRetryBatchItem,
  onSetViewMode,
  onNextStep,
  onReset,
  resetLabel = '重置',
  showResultViewer = false,
  className = '',
  layout = 'default',
}: GenerationStatusPanelProps) {
  const layoutClassName = layout === 'floor-plan'
    ? 'w-full rounded-2xl lg:rounded-l-none'
    : 'w-full rounded-3xl lg:w-96 lg:rounded-l-none';
  const normalizedResult = normalizeStepGenerationResult(state, {
    originalImageUrl,
    resultImageUrl: previewImage,
  });
  const featureName = getGenerationStepDownloadLabel(step);
  return (
    <aside
      data-testid={layout === 'floor-plan' ? 'drawing-action-panel' : undefined}
      className={`drawing-right-panel workspace-side-panel glass-panel flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden border border-white/60 ${layoutClassName} ${className}`}
    >
      <div className="drawing-right-panel-header flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div className="min-w-0">
          <span className="workspace-section-title">{title}</span>
          <p className="mt-1 truncate text-xs text-slate-500">{statusLabel}</p>
        </div>
        <Settings2 className="h-4 w-4 shrink-0 text-slate-300" />
      </div>

      <div className="drawing-right-panel-content min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar">
        {topPanels}
        <ContinuationSourceBanner state={state} />
        <NormalizedGenerationProgress result={normalizedResult} compact />
        {state.isGenerating && state.generationJobId ? (
          <button type="button" onClick={onCancelGeneration} className="w-full rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600">取消任务</button>
        ) : null}
        <GenerationResultActions result={normalizedResult} featureName={featureName} projectName={projectName} compact />
        <ResultActions
          step={step}
          state={state}
          previewImage={previewImage}
          originalImageUrl={originalImageUrl}
          resultOptions={resultOptions}
          selectedResultId={selectedResultId}
          viewModeOptions={viewModeOptions}
          projectName={projectName}
          onSetViewMode={onSetViewMode}
          onSelectGenerationResult={onSelectGenerationResult}
          onToggleGenerationFavorite={onToggleGenerationFavorite}
          onSecondaryEditResult={onSecondaryEditResult}
          onSendResultToStep={onSendResultToStep}
          onRetryBatchItem={onRetryBatchItem}
          showResultViewer={showResultViewer}
        />
        <GenerationMessages state={state} onGenerate={onGenerate} />
      </div>

      <div className="preview-actions drawing-right-panel-footer relative z-[1] shrink-0 border-t border-slate-100 bg-white/95 p-4 pointer-events-auto backdrop-blur-sm">
        {validationErrors.length > 0 ? (
          <div role="alert" aria-live="polite" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <p className="font-bold">暂时无法生成，请补充以下内容：</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 font-semibold">
              {validationErrors.map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ) : null}
        <div className="drawing-action-buttons grid min-w-0 grid-cols-2 gap-2">
        <button type="button" onClick={onReset} disabled={state.isGenerating} className="min-w-0 rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold leading-tight text-slate-500 disabled:opacity-40">
          {resetLabel}
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={!canGenerate}
          className="min-w-0 rounded-lg border border-blue-100 bg-blue-50 px-2 py-2 text-xs font-bold leading-tight text-blue-700 disabled:opacity-50"
        >
          重新生成
        </button>
        <button
          type="button"
          data-testid="generate-preview-button"
          onClick={previewImage ? onNextStep : onGenerate}
          disabled={!canGenerate && !previewImage}
          className="drawing-action-primary col-span-2 min-w-0 rounded-lg bg-slate-900 px-3 py-2.5 text-xs font-bold leading-tight text-white disabled:opacity-50"
        >
          {state.isGenerating ? <><RefreshCw className="mr-1 inline h-4 w-4 animate-spin" />AI 生成中</> : previewImage ? '完成并导出' : <><Zap className="mr-1 inline h-4 w-4 text-blue-300" />生成预览</>}
        </button>
        </div>
        {!canGenerate && !previewImage && disabledReason ? (
          <p className="mt-2 text-center text-xs font-semibold text-amber-700">{disabledReason}</p>
        ) : null}
      </div>
    </aside>
  );
}

interface ResultActionsProps {
  step: GenerationStep;
  state: StepState;
  previewImage: string | null | undefined;
  originalImageUrl: string | null;
  resultOptions: GenerationResultOption[];
  selectedResultId: string | null;
  viewModeOptions: ViewModeOption[];
  projectName?: string | null;
  onSetViewMode: (viewMode: StepState['viewMode']) => void;
  onSelectGenerationResult: (resultId: string) => void;
  onToggleGenerationFavorite: (resultId: string) => void;
  onSecondaryEditResult: (resultId: string, action: SecondaryEditAction) => void;
  onSendResultToStep: (resultId: string, targetStep: ResultSendTargetStep) => void;
  onRetryBatchItem?: (variantIndex: number) => void;
  showResultViewer: boolean;
}

function ResultActions({
  step,
  state,
  previewImage,
  originalImageUrl,
  resultOptions,
  selectedResultId,
  viewModeOptions,
  projectName,
  onSetViewMode,
  onSelectGenerationResult,
  onToggleGenerationFavorite,
  onSecondaryEditResult,
  onSendResultToStep,
  onRetryBatchItem,
  showResultViewer,
}: ResultActionsProps) {
  const activeResult = resultOptions.find(result => result.id === selectedResultId)
    || resultOptions.find(result => result.isSelected)
    || resultOptions[0]
    || null;
  const originalPreviewImage = getOriginalResultImageUrl(activeResult, previewImage);
  const originalAssetId = getOriginalResultAssetId(activeResult);
  const dimensionsText = formatResultDimensions(activeResult);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [isSaveTemplateOpen, setIsSaveTemplateOpen] = useState(false);
  const canSaveTemplate = canSavePromptTemplate(step, state, activeResult, originalPreviewImage);

  const handleDownload = async () => {
    if (!originalPreviewImage || isDownloading) return;
    setIsDownloading(true);
    setDownloadError(null);
    setDownloadMessage(null);
    try {
      await downloadAsset({
        url: originalPreviewImage,
        assetId: originalAssetId,
      }, buildResultImageFilename({
        projectName,
        featureLabel: getGenerationStepDownloadLabel(step),
      }));
      setDownloadMessage('已开始下载');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setDownloadError(message === downloadFallbackMessage ? downloadFallbackMessage : '下载失败，请稍后重试');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleShare = async () => {
    if (!originalPreviewImage) return;
    setDownloadError(null);
    setShareMessage(null);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${projectName || '烛照AI'} · ${getGenerationStepDownloadLabel(step)}`,
          text: '烛照AI 设计表达结果',
          ...(originalPreviewImage.startsWith('http') ? { url: originalPreviewImage } : {}),
        });
        setShareMessage('已打开系统分享');
        return;
      }
      if (navigator.clipboard && originalPreviewImage.startsWith('http')) {
        await navigator.clipboard.writeText(originalPreviewImage);
        setShareMessage('结果链接已复制');
        return;
      }
      throw new Error('SHARE_NOT_SUPPORTED');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setDownloadError('当前浏览器无法直接分享，请先下载结果图。');
    }
  };

  const handleUtilityAction = (action: 'download' | 'share' | 'pdf') => {
    if (action === 'download') void handleDownload();
    if (action === 'share') void handleShare();
    if (action === 'pdf') window.print();
  };

  return (
    <div className="space-y-3">
      {showResultViewer && viewModeOptions.length > 0 ? (
        <div className="h-64 overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm">
          <PreviewContent
            state={state}
            originalImageUrl={originalImageUrl}
            previewImage={originalPreviewImage}
            onViewModeChange={onSetViewMode}
            featureName={getGenerationStepDownloadLabel(step)}
            step={step}
            aspectRatio={step === GenerationStep.PanoramaQuickRender ? '2:1' : '16:9'}
          />
        </div>
      ) : null}
      {originalPreviewImage && activeResult ? (
        <>
        <ResultQualityReport resultId={activeResult.id} metadata={activeResult.metadata} />
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">二次编辑</p>
            <span className="truncate text-[10px] font-semibold text-slate-400">{readResultLabel(activeResult, resultOptions)}</span>
          </div>
          {dimensionsText ? <p className="mb-2 text-[10px] font-bold text-slate-500">{dimensionsText}</p> : null}
          <SecondaryEditActions resultId={activeResult.id} onAction={onSecondaryEditResult} compact disabled={state.isGenerating} />
          {step === GenerationStep.MaterialReplace ? (
            <div className="mt-2">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-emerald-500">快捷修复</p>
              <MaterialRepairActions resultId={activeResult.id} onAction={onSecondaryEditResult} compact disabled={state.isGenerating} />
            </div>
          ) : null}
          <div className="mt-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">推荐下一步</p>
            <ResultSendActions
              resultId={activeResult.id}
              currentStep={step}
              onSend={onSendResultToStep}
              onSecondaryAction={onSecondaryEditResult}
              onUtilityAction={handleUtilityAction}
              compact
              disabled={state.isGenerating}
            />
          </div>
        </div>
        </>
      ) : null}

      {originalPreviewImage ? (
        <>
          {state.generationBatchItems && state.generationBatchItems.length > 0 ? (
            <div className="result-grid">
              {state.generationBatchItems.map(item => (
                <BatchItemCard key={item.variantIndex} item={item} projectName={projectName} sourceImageUrl={originalImageUrl} onRetry={() => onRetryBatchItem?.(item.variantIndex)} />
              ))}
            </div>
          ) : resultOptions.length > 1 && (
            <div className="grid grid-cols-2 gap-2">
              {resultOptions.map(result => (
                <div
                  key={result.id}
                  role="radio"
                  aria-checked={result.id === selectedResultId}
                  tabIndex={0}
                  onClick={() => onSelectGenerationResult(result.id)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') onSelectGenerationResult(result.id);
                  }}
                  className={`relative overflow-hidden rounded-lg border bg-white ${result.id === selectedResultId ? 'border-blue-600 ring-2 ring-blue-100' : 'border-slate-200'}`}
                >
                  <div className="relative block w-full overflow-hidden">
                    <GenerationImageViewer
                      sourceImageUrl={originalImageUrl}
                      resultImageUrl={getOriginalResultImageUrl(result, result.imageUrl) || result.imageUrl}
                      resultImageAssetId={getOriginalResultAssetId(result)}
                      aspectRatio={step === GenerationStep.PanoramaQuickRender ? '2:1' : '16:9'}
                      featureName={readResultLabel(result, resultOptions)}
                      step={step}
                      showTabs={false}
                      frameClassName="rounded-none border-0 shadow-none"
                      tabListClassName="m-1.5 mb-1.5"
                      tabButtonClassName="px-2"
                      sourceMissingMessage="暂无原图，无法对比。"
                    />
                  </div>
                  <span className="absolute left-1 top-1 max-w-[calc(100%-2rem)] truncate rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-bold text-slate-700">{readResultLabel(result, resultOptions)}</span>
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      onToggleGenerationFavorite(result.id);
                    }}
                    className={`absolute bottom-1 right-1 rounded-full bg-white/90 p-1 ${result.isFavorite ? 'text-rose-600' : 'text-slate-400'}`}
                    title={result.isFavorite ? '取消收藏' : '收藏方案'}
                  >
                    <Heart className={`h-3.5 w-3.5 ${result.isFavorite ? 'fill-current' : ''}`} />
                  </button>
                  {result.variantStyleLabel ? (
                    <p className="border-t border-slate-100 px-1.5 py-1 text-[9px] font-semibold leading-4 text-slate-500">{result.variantStyleLabel}</p>
                  ) : null}
                  <div className="border-t border-slate-100 p-1.5">
                    <SecondaryEditActions resultId={result.id} onAction={onSecondaryEditResult} compact disabled={state.isGenerating} />
                    {step === GenerationStep.MaterialReplace ? (
                      <div className="mt-1.5">
                        <MaterialRepairActions resultId={result.id} onAction={onSecondaryEditResult} compact disabled={state.isGenerating} />
                      </div>
                    ) : null}
                    <div className="mt-1.5">
                      <ResultSendActions
                        resultId={result.id}
                        currentStep={step}
                        onSend={onSendResultToStep}
                        onSecondaryAction={onSecondaryEditResult}
                        onUtilityAction={handleUtilityAction}
                        compact
                        disabled={state.isGenerating}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="action-row">
            {canSaveTemplate && activeResult ? (
              <button
                type="button"
                onClick={() => setIsSaveTemplateOpen(true)}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
              >
                <BookOpen className="mr-1 inline h-3.5 w-3.5" />
                保存为提示词模板
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => downloadJson({
                exportedAt: new Date().toISOString(),
                step,
                provider: state.generationProvider,
                prompt: state.config.prompt,
                config: state.config,
                result: {
                  id: state.generationResultId,
                  imageDataUrl: originalPreviewImage,
                  warnings: state.generationWarnings,
                },
              }, `archai-project-${Date.now()}.json`)}
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-100 hover:text-blue-700"
            >
              <FileJson className="mr-1 inline h-3.5 w-3.5" />
              导出 JSON
            </button>
          </div>
      {downloadMessage ? <p className="text-xs font-semibold text-emerald-700">{downloadMessage}</p> : null}
      {shareMessage ? <p className="text-xs font-semibold text-emerald-700">{shareMessage}</p> : null}
          {downloadError ? <p className="text-xs font-semibold text-amber-700">{downloadError}</p> : null}
          {isSaveTemplateOpen && activeResult ? (
            <SavePromptTemplateModal
              step={step}
              state={state}
              result={activeResult}
              previewImage={originalPreviewImage}
              onClose={() => setIsSaveTemplateOpen(false)}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ContinuationSourceBanner({ state }: { state: StepState }) {
  const source = state.continuationSource;
  if (!source) return null;

  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
      <div className="flex gap-3">
        <div className="w-24 shrink-0">
          <AspectRatioImage src={source.imageUrl} alt="二次编辑来源图" className="rounded-lg" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">继续生成来源</p>
          <p className="mt-1 truncate text-xs font-bold text-slate-900">由 {source.label} 继续生成</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{continuationActionLabels[source.action] || source.action} · {source.parentResultId}</p>
        </div>
      </div>
    </div>
  );
}

function BatchItemCard({ item, projectName, sourceImageUrl, onRetry }: { item: GenerationBatchItem; projectName?: string | null; sourceImageUrl: string | null; onRetry: () => void }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const originalImageUrl = getOriginalResultImageUrl(item, item.imageUrl);
  const originalAssetId = getOriginalResultAssetId(item);
  const dimensionsText = formatResultDimensions(item);

  const handleDownload = async () => {
    if (!originalImageUrl || isDownloading) return;
    setIsDownloading(true);
    setDownloadMessage(null);
    setDownloadError(null);
    try {
      await downloadAsset({
        url: originalImageUrl,
        assetId: originalAssetId,
      }, buildResultImageFilename({
        projectName,
        featureLabel: '平面生成',
      }));
      setDownloadMessage('已开始下载');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setDownloadError(message === downloadFallbackMessage ? downloadFallbackMessage : '下载失败，请稍后重试');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="relative flex items-center justify-center bg-slate-50">
        {originalImageUrl ? (
          <GenerationImageViewer
            sourceImageUrl={sourceImageUrl}
            resultImageUrl={originalImageUrl}
            resultImageAssetId={originalAssetId}
            featureName="平面彩平批量结果"
            step={GenerationStep.FloorplanTo3D}
            showTabs={false}
            frameClassName="rounded-none border-0 shadow-none"
            tabListClassName="m-2 mb-2"
            sourceMissingMessage="暂无原图，无法对比。"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center text-xs font-bold text-slate-400">{readBatchItemStatusLabel(item.status)}</div>
        )}
        <span className="absolute left-1 top-1 max-w-[calc(100%-0.5rem)] truncate rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-bold text-slate-700">{item.variantName}</span>
      </div>
      <div className="space-y-1.5 border-t border-slate-100 p-2">
        <p className="text-[10px] font-semibold text-slate-500">
          {[item.selectedStyleName, item.layoutVariantName].filter(Boolean).join(' / ') || `方案 ${item.variantIndex + 1}`}
        </p>
        <p className={`text-[10px] font-bold ${item.status === 'failed' ? 'text-rose-600' : item.status === 'succeeded' ? 'text-emerald-700' : 'text-blue-700'}`}>
          {readBatchItemStatusLabel(item.status)}
        </p>
        {dimensionsText ? <p className="text-[10px] font-bold text-slate-500">{dimensionsText}</p> : null}
        {item.errorMessage ? <p className="line-clamp-2 text-[10px] leading-4 text-rose-600">{item.errorMessage}</p> : null}
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => originalImageUrl && window.open(originalImageUrl, '_blank', 'noopener,noreferrer')} disabled={!originalImageUrl} className="rounded bg-slate-100 px-2 py-1.5 text-[10px] font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
            原图
          </button>
          <button type="button" onClick={() => void handleDownload()} disabled={!originalImageUrl || isDownloading} className="rounded bg-slate-100 px-2 py-1.5 text-[10px] font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
            {isDownloading ? '下载中' : '保存'}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-1.5">
          <button type="button" onClick={onRetry} disabled={item.status === 'running' || item.status === 'queued'} className="rounded bg-slate-100 px-2 py-1.5 text-[10px] font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
            重试此方案
          </button>
        </div>
        {downloadMessage ? <p className="text-[10px] font-semibold text-emerald-700">{downloadMessage}</p> : null}
        {downloadError ? <p className="text-[10px] font-semibold text-amber-700">{downloadError}</p> : null}
      </div>
    </div>
  );
}

function readBatchItemStatusLabel(status: GenerationBatchItem['status']): string {
  if (status === 'queued') return 'queued';
  if (status === 'running') return 'running';
  if (status === 'succeeded') return 'succeeded';
  return 'failed';
}

function readResultLabel(result: GenerationResultOption, resultOptions: GenerationResultOption[]): string {
  const index = resultOptions.findIndex(item => item.id === result.id);
  return result.variantName || result.variantLabel || (index >= 0 ? `方案 ${index + 1}` : '当前结果');
}

function readBatchProgressText(state: StepState): string | null {
  if (state.generationBatchItems && state.generationBatchItems.length > 0) {
    const completed = state.generationBatchItems.filter(item => item.status === 'succeeded' || item.status === 'failed').length;
    return `已完成 ${completed} / ${state.generationBatchItems.length}`;
  }
  const batchCount = typeof state.config.materialCandidateCount === 'number'
    ? state.config.materialCandidateCount
    : typeof state.config.batchCount === 'number' ? state.config.batchCount : 1;
  const isBatch = batchCount > 1 && (
    state.config.floorplanOutputMode === 'multi'
    || state.config.planColorizeBatchEnabled === true
    || state.config.variantStrategy !== undefined
    || state.config.materialCandidateCount !== undefined
  );
  if (!isBatch) return null;
  return `已完成 ${Math.min(state.generationResults.length, batchCount)} / ${batchCount}`;
}

function getGenerationStepDownloadLabel(step: GenerationStep): string {
  if (step === GenerationStep.FloorplanTo3D) return '平面生成';
  if (step === GenerationStep.StyleRender) return '风格渲染';
  if (step === GenerationStep.LocalInpainting) return '局部修饰';
  if (step === GenerationStep.ModelSnapshotRender) return '白模快渲';
  if (step === GenerationStep.DesignVariants) return '方案变体';
  if (step === GenerationStep.MaterialReplace) return '材质软装替换';
  if (step === GenerationStep.PlanColorize) return '图纸智能表达';
  if (step === GenerationStep.PanoramaQuickRender) return '全景快渲';
  if (step === GenerationStep.ObjectInsert) return '元素植入';
  if (step === GenerationStep.FreeReferenceImage) return '自由参考生图';
  if (step === GenerationStep.ImagePolish) return '质感提升';
  return 'AI生成';
}

interface GenerationMessagesProps {
  state: StepState;
  onGenerate: () => void;
}

function GenerationMessages({ state, onGenerate }: GenerationMessagesProps) {
  const batchSummary = readBatchSummaryText(state);
  return (
    <>
      {batchSummary ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-semibold text-blue-800">
          {batchSummary}
        </div>
      ) : null}

      {state.generationWarnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-700">Provider 能力提示</p>
          {state.generationWarnings.map(warning => (
            <p key={warning} className="text-xs leading-5 text-amber-800">{warning}</p>
          ))}
        </div>
      )}

      {state.generationError && (
        <div className="workspace-error-card whitespace-pre-wrap break-words rounded-xl border p-3 text-xs leading-5 text-red-700">
          {state.generationError}
          <button type="button" onClick={onGenerate} className="mt-2 block rounded bg-white px-2 py-1 text-[10px] font-bold text-red-600">
            重试
          </button>
        </div>
      )}

      {state.generationLogs.length > 0 && (
        <div className="max-h-28 overflow-y-auto rounded-xl bg-slate-50 p-3 font-mono text-[10px] text-slate-500 custom-scrollbar">
          {state.generationLogs.map((log, index) => <div key={`${log}-${index}`}>{log}</div>)}
        </div>
      )}
    </>
  );
}

function readBatchSummaryText(state: StepState): string | null {
  if (state.generationBatchItems && state.generationBatchItems.length > 0 && !state.isGenerating) {
    const successCount = state.generationBatchItems.filter(item => item.status === 'succeeded').length;
    const failedCount = state.generationBatchItems.filter(item => item.status === 'failed').length;
    const completed = successCount + failedCount;
    return `批量进度：已完成 ${completed} / ${state.generationBatchItems.length}，成功 ${successCount}，失败 ${failedCount}`;
  }
  const batchCount = typeof state.config.materialCandidateCount === 'number'
    ? state.config.materialCandidateCount
    : typeof state.config.batchCount === 'number' ? state.config.batchCount : 1;
  const isBatch = batchCount > 1 && (
    state.config.floorplanOutputMode === 'multi'
    || state.config.planColorizeBatchEnabled === true
    || state.config.variantStrategy !== undefined
    || state.config.materialCandidateCount !== undefined
  );
  if (!isBatch || state.isGenerating || state.generationStatus === 'ready') return null;
  const successCount = Math.min(state.generationResults.length, batchCount);
  const failedCount = state.generationStatus === 'success' ? Math.max(0, batchCount - successCount) : 0;
  return `批量进度：已完成 ${successCount} / ${batchCount}，成功 ${successCount}${failedCount > 0 ? `，失败 ${failedCount}` : ''}`;
}
