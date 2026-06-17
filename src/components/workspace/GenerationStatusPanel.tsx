import { BookOpen, Download, ExternalLink, FileJson, Heart, RefreshCw, Settings2, Zap } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { GenerationBatchItem, GenerationResultOption, GenerationStep, ResultSendTargetStep, SecondaryEditAction, StepState } from '../../types';
import { buildResultImageFilename, downloadAsset, downloadJson, downloadFallbackMessage } from '../../utils/downloadAsset';
import { continuationActionLabels } from '../../utils/secondaryEdit';
import { formatResultDimensions, getOriginalResultAssetId, getOriginalResultImageUrl } from '../../utils/resultImage';
import { ViewModeOption } from './workspaceTypes';
import { formatElapsed } from './workspaceUtils';
import { PreviewContent } from './ResultPreviewPanel';
import { MaterialRepairActions, ResultSendActions, SecondaryEditActions } from './SecondaryEditActions';
import { SavePromptTemplateModal } from '../SavePromptTemplateModal';
import { canSavePromptTemplate } from '../../utils/savedPromptTemplates';

interface GenerationStatusPanelProps {
  step: GenerationStep;
  state: StepState;
  title: string;
  statusLabel: string;
  elapsedSeconds: number;
  canGenerate: boolean;
  previewImage: string | null | undefined;
  originalImageUrl: string | null;
  resultOptions: GenerationResultOption[];
  selectedResultId: string | null;
  viewModeOptions: ViewModeOption[];
  topPanels: ReactNode;
  estimatedCreditCost: number;
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
}

export function GenerationStatusPanel({
  step,
  state,
  title,
  statusLabel,
  elapsedSeconds,
  canGenerate,
  previewImage,
  originalImageUrl,
  resultOptions,
  selectedResultId,
  viewModeOptions,
  topPanels,
  estimatedCreditCost,
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
}: GenerationStatusPanelProps) {
  return (
    <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white p-4 custom-scrollbar">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</span>
          <p className="mt-1 text-xs text-slate-500">{statusLabel}</p>
        </div>
        <Settings2 className="h-4 w-4 text-slate-300" />
      </div>

      <div className="space-y-4">
        {topPanels}
        <ContinuationSourceBanner state={state} />
        <GenerationProgress state={state} statusLabel={statusLabel} elapsedSeconds={elapsedSeconds} onCancelGeneration={onCancelGeneration} />
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
        />
        <GenerationMessages state={state} onGenerate={onGenerate} />
      </div>

      <div className="mt-auto border-t border-slate-100 pt-4">
        <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-center text-[11px] font-bold text-slate-500">
          本次预计消耗 {estimatedCreditCost} 算力点
        </div>
        <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={onReset} disabled={state.isGenerating} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 disabled:opacity-40">
          重置
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={!canGenerate}
          className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-50"
        >
          重新生成
        </button>
        <button
          type="button"
          onClick={previewImage ? onNextStep : onGenerate}
          disabled={!canGenerate && !previewImage}
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {state.isGenerating ? <RefreshCw className="mx-auto h-4 w-4 animate-spin" /> : previewImage ? '完成并导出' : <><Zap className="mr-1 inline h-4 w-4 text-blue-300" />生成预览</>}
        </button>
        </div>
      </div>
    </aside>
  );
}

interface GenerationProgressProps {
  state: StepState;
  statusLabel: string;
  elapsedSeconds: number;
  onCancelGeneration: () => void;
}

function GenerationProgress({ state, statusLabel, elapsedSeconds, onCancelGeneration }: GenerationProgressProps) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between text-[10px] font-bold text-slate-500">
        <span>{state.generationJobId || 'legacy fallback'}</span>
        <span>{state.isGenerating ? formatElapsed(elapsedSeconds) : state.generationStatus === 'error' ? '失败' : `${state.generationProgress}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${state.generationStatus === 'error' ? Math.min(99, Math.max(0, state.generationProgress)) : Math.min(100, Math.max(0, state.generationProgress))}%` }} />
      </div>
      {state.isGenerating ? (
        <div className="mt-3 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-600">
          <p className="font-bold text-slate-800">{statusLabel}</p>
          {readBatchProgressText(state) ? <p className="font-semibold text-blue-700">{readBatchProgressText(state)}</p> : null}
          <p>AI 生成中，复杂图片可能需要 1-3 分钟。</p>
          {elapsedSeconds > 60 ? (
            <p className="mt-1 font-semibold text-amber-700">生成时间较长，可能是第三方模型排队或图片较复杂，请不要重复点击。</p>
          ) : null}
        </div>
      ) : null}
      {state.isGenerating && state.generationJobId && (
        <button type="button" onClick={onCancelGeneration} className="mt-3 w-full rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
          取消任务
        </button>
      )}
    </div>
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

  return (
    <div className="space-y-3">
      <div className="flex overflow-hidden rounded-lg bg-slate-200 p-0.5">
        {viewModeOptions.map(({ value, label, disabled }) => (
          <button
            key={value}
            type="button"
            onClick={() => onSetViewMode(value)}
            disabled={disabled}
            className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold disabled:opacity-40 ${
              state.viewMode === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="h-48 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <PreviewContent state={state} originalImageUrl={originalImageUrl} previewImage={originalPreviewImage} />
      </div>
      {originalPreviewImage && activeResult ? (
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
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">发送到其他功能</p>
            <ResultSendActions resultId={activeResult.id} currentStep={step} onSend={onSendResultToStep} compact disabled={state.isGenerating} />
          </div>
        </div>
      ) : null}

      {originalPreviewImage ? (
        <>
          {state.generationBatchItems && state.generationBatchItems.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {state.generationBatchItems.map(item => (
                <BatchItemCard key={item.variantIndex} item={item} projectName={projectName} onRetry={() => onRetryBatchItem?.(item.variantIndex)} />
              ))}
            </div>
          ) : resultOptions.length > 1 && (
            <div className="grid grid-cols-2 gap-2">
              {resultOptions.map((result, index) => (
                <div
                  key={result.id}
                  className={`relative overflow-hidden rounded-lg border bg-white ${result.id === selectedResultId ? 'border-blue-600 ring-2 ring-blue-100' : 'border-slate-200'}`}
                >
                  <button type="button" onClick={() => onSelectGenerationResult(result.id)} className="relative block w-full overflow-hidden">
                    <img src={result.imageUrl} alt={`方案 ${index + 1}`} className="h-20 w-full object-cover" referrerPolicy="no-referrer" />
                  </button>
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
                      <ResultSendActions resultId={result.id} currentStep={step} onSend={onSendResultToStep} compact disabled={state.isGenerating} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
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
              onClick={() => window.open(originalPreviewImage, '_blank', 'noopener,noreferrer')}
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-100 hover:text-blue-700"
            >
              <ExternalLink className="mr-1 inline h-3.5 w-3.5" />
              查看原图
            </button>
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={isDownloading}
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-100 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className={`mr-1 inline h-3.5 w-3.5 ${isDownloading ? 'animate-pulse' : ''}`} />
              {isDownloading ? '正在下载...' : '保存到本地'}
            </button>
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
        <img src={source.imageUrl} alt="二次编辑来源图" className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-blue-100" referrerPolicy="no-referrer" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">继续生成来源</p>
          <p className="mt-1 truncate text-xs font-bold text-slate-900">由 {source.label} 继续生成</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{continuationActionLabels[source.action] || source.action} · {source.parentResultId}</p>
        </div>
      </div>
    </div>
  );
}

function BatchItemCard({ item, projectName, onRetry }: { item: GenerationBatchItem; projectName?: string | null; onRetry: () => void }) {
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
      <div className="relative flex h-24 items-center justify-center bg-slate-50">
        {originalImageUrl ? (
          <img src={originalImageUrl} alt={item.variantName} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="text-xs font-bold text-slate-400">{readBatchItemStatusLabel(item.status)}</span>
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
  const batchCount = typeof state.config.batchCount === 'number' ? state.config.batchCount : 1;
  const isBatch = batchCount > 1 && (
    state.config.floorplanOutputMode === 'multi'
    || state.config.planColorizeBatchEnabled === true
    || state.config.variantStrategy !== undefined
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
        <div className="whitespace-pre-wrap break-words rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-700">
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
  const batchCount = typeof state.config.batchCount === 'number' ? state.config.batchCount : 1;
  const isBatch = batchCount > 1 && (
    state.config.floorplanOutputMode === 'multi'
    || state.config.planColorizeBatchEnabled === true
    || state.config.variantStrategy !== undefined
  );
  if (!isBatch || state.isGenerating || state.generationStatus === 'ready') return null;
  const successCount = Math.min(state.generationResults.length, batchCount);
  const failedCount = state.generationStatus === 'success' ? Math.max(0, batchCount - successCount) : 0;
  return `批量进度：已完成 ${successCount} / ${batchCount}，成功 ${successCount}${failedCount > 0 ? `，失败 ${failedCount}` : ''}`;
}
