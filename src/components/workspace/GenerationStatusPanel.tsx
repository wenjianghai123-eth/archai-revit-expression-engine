import { Download, FileJson, Heart, RefreshCw, Settings2, Zap } from 'lucide-react';
import { type ReactNode } from 'react';
import { GenerationResultOption, GenerationStep, SecondaryEditAction, StepState } from '../../types';
import { downloadDataUrl, downloadJson } from '../../utils/download';
import { secondaryEditActionLabels } from '../../utils/secondaryEdit';
import { ViewModeOption } from './workspaceTypes';
import { formatElapsed, getDataUrlExtension } from './workspaceUtils';
import { PreviewContent } from './ResultPreviewPanel';
import { SecondaryEditActions } from './SecondaryEditActions';

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
  onGenerate: () => void;
  onRegenerate: () => void;
  onCancelGeneration: () => void;
  onSelectGenerationResult: (resultId: string) => void;
  onToggleGenerationFavorite: (resultId: string) => void;
  onSecondaryEditResult: (resultId: string, action: SecondaryEditAction) => void;
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
  onGenerate,
  onRegenerate,
  onCancelGeneration,
  onSelectGenerationResult,
  onToggleGenerationFavorite,
  onSecondaryEditResult,
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
          onSetViewMode={onSetViewMode}
          onSelectGenerationResult={onSelectGenerationResult}
          onToggleGenerationFavorite={onToggleGenerationFavorite}
          onSecondaryEditResult={onSecondaryEditResult}
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
        <span>{state.isGenerating ? formatElapsed(elapsedSeconds) : `${state.generationProgress}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, Math.max(0, state.generationProgress))}%` }} />
      </div>
      {state.isGenerating ? (
        <div className="mt-3 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-600">
          <p className="font-bold text-slate-800">{statusLabel}</p>
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
  onSetViewMode: (viewMode: StepState['viewMode']) => void;
  onSelectGenerationResult: (resultId: string) => void;
  onToggleGenerationFavorite: (resultId: string) => void;
  onSecondaryEditResult: (resultId: string, action: SecondaryEditAction) => void;
}

function ResultActions({
  step,
  state,
  previewImage,
  originalImageUrl,
  resultOptions,
  selectedResultId,
  viewModeOptions,
  onSetViewMode,
  onSelectGenerationResult,
  onToggleGenerationFavorite,
  onSecondaryEditResult,
}: ResultActionsProps) {
  const activeResult = resultOptions.find(result => result.id === selectedResultId)
    || resultOptions.find(result => result.isSelected)
    || resultOptions[0]
    || null;

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
        <PreviewContent state={state} originalImageUrl={originalImageUrl} previewImage={previewImage} />
      </div>
      {previewImage && activeResult ? (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">二次编辑</p>
            <span className="truncate text-[10px] font-semibold text-slate-400">{readResultLabel(activeResult, resultOptions)}</span>
          </div>
          <SecondaryEditActions resultId={activeResult.id} onAction={onSecondaryEditResult} compact disabled={state.isGenerating} />
        </div>
      ) : null}

      {previewImage ? (
        <>
          {resultOptions.length > 1 && (
            <div className="grid grid-cols-2 gap-2">
              {resultOptions.map((result, index) => (
                <div
                  key={result.id}
                  className={`relative overflow-hidden rounded-lg border bg-white ${result.id === selectedResultId ? 'border-blue-600 ring-2 ring-blue-100' : 'border-slate-200'}`}
                >
                  <button type="button" onClick={() => onSelectGenerationResult(result.id)} className="relative block w-full overflow-hidden">
                    <img src={result.imageUrl} alt={`方案 ${index + 1}`} className="h-20 w-full object-cover" referrerPolicy="no-referrer" />
                  </button>
                  <span className="absolute left-1 top-1 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-bold text-slate-700">方案 {index + 1}</span>
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
                  <div className="border-t border-slate-100 p-1.5">
                    <SecondaryEditActions resultId={result.id} onAction={onSecondaryEditResult} compact disabled={state.isGenerating} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => downloadDataUrl(previewImage, `archai-result-${Date.now()}.${getDataUrlExtension(previewImage)}`)}
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-100 hover:text-blue-700"
            >
              <Download className="mr-1 inline h-3.5 w-3.5" />
              下载图片
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
                  imageDataUrl: previewImage,
                  warnings: state.generationWarnings,
                },
              }, `archai-project-${Date.now()}.json`)}
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm ring-1 ring-slate-100 hover:text-blue-700"
            >
              <FileJson className="mr-1 inline h-3.5 w-3.5" />
              导出 JSON
            </button>
          </div>
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
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{secondaryEditActionLabels[source.action]} · {source.parentResultId}</p>
        </div>
      </div>
    </div>
  );
}

function readResultLabel(result: GenerationResultOption, resultOptions: GenerationResultOption[]): string {
  const index = resultOptions.findIndex(item => item.id === result.id);
  return result.variantName || result.variantLabel || (index >= 0 ? `方案 ${index + 1}` : '当前结果');
}

interface GenerationMessagesProps {
  state: StepState;
  onGenerate: () => void;
}

function GenerationMessages({ state, onGenerate }: GenerationMessagesProps) {
  return (
    <>
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
