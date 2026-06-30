import { useState } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import { GenerationStep, StepState } from '../../types';
import { buildResultImageFilename, downloadAsset, downloadFallbackMessage } from '../../utils/downloadAsset';
import { formatResultDimensions, getOriginalResultAssetId, getOriginalResultImageUrl } from '../../utils/resultImage';
import { ViewModeOption } from './workspaceTypes';
import { GenerationImageViewer, type ViewMode } from '../common/GenerationImageViewer';

interface ResultPreviewPanelProps {
  state: StepState;
  originalImageUrl: string | null;
  previewImage: string | null | undefined;
  providerLabel: string;
  step?: GenerationStep;
  projectName?: string | null;
  resultAssetId?: string | null;
  viewModeOptions?: ViewModeOption[];
  onSetViewMode?: (viewMode: StepState['viewMode']) => void;
  showToolbar?: boolean;
  className?: string;
}

export function ResultPreviewPanel({
  state,
  originalImageUrl,
  previewImage,
  providerLabel,
  step,
  projectName,
  resultAssetId,
  viewModeOptions = [],
  onSetViewMode,
  showToolbar = false,
  className = '',
}: ResultPreviewPanelProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const activeResult = state.generationResults.find(result => result.id === state.selectedGenerationResultId)
    || state.generationResults.find(result => result.isSelected)
    || state.generationResults[0]
    || null;
  const originalPreviewImage = getOriginalResultImageUrl(activeResult, previewImage);
  const originalAssetId = getOriginalResultAssetId(activeResult, resultAssetId);
  const dimensionsText = formatResultDimensions(activeResult);
  const featureLabel = step ? getGenerationStepDownloadLabel(step) : 'AI生成';
  const aspectRatio = step === GenerationStep.PanoramaQuickRender ? '2:1' : '16:9';
  const frameAspectClass = aspectRatio === '2:1' ? 'aspect-[2/1]' : 'aspect-video';

  const handleDownload = async () => {
    if (!originalPreviewImage || isDownloading) return;
    setIsDownloading(true);
    setDownloadMessage(null);
    setDownloadError(null);
    try {
      await downloadAsset({
        url: originalPreviewImage,
        assetId: originalAssetId,
      }, buildResultImageFilename({
        projectName,
        featureLabel,
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
    <main className={className || 'workspace-canvas flex min-w-0 flex-1 flex-col overflow-y-auto'}>
      {showToolbar ? (
        <div className="flex h-12 items-center justify-between border-b border-slate-200 bg-white/70 px-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{viewModeOptions.length > 0 ? '结果查看' : ''}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{providerLabel}</span>
        </div>
      ) : null}

      <div className={showToolbar ? 'flex min-h-0 flex-1 items-start justify-center p-4' : 'flex h-full items-start justify-center'}>
        <div className={`relative ${frameAspectClass} w-full ${showToolbar ? 'workspace-result-frame max-w-[1200px] overflow-hidden border bg-white shadow-2xl' : 'overflow-hidden rounded-2xl'}`}>
          {originalPreviewImage && !state.isGenerating ? (
            <div className="absolute right-3 top-3 z-20 flex flex-col items-end gap-1">
              {dimensionsText ? (
                <span className="rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold text-slate-600 shadow-sm ring-1 ring-slate-200">{dimensionsText}</span>
              ) : null}
              <button
                type="button"
                onClick={() => window.open(originalPreviewImage, '_blank', 'noopener,noreferrer')}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:text-blue-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                查看大图
              </button>
              <button
                type="button"
                onClick={() => void handleDownload()}
                disabled={isDownloading}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download className={`h-3.5 w-3.5 ${isDownloading ? 'animate-pulse' : ''}`} />
                {isDownloading ? '正在下载...' : '保存到本地'}
              </button>
              {downloadMessage ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 shadow-sm">{downloadMessage}</span> : null}
              {downloadError ? <span className="max-w-56 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 shadow-sm">{downloadError}</span> : null}
            </div>
          ) : null}
          <PreviewContent
            state={state}
            originalImageUrl={originalImageUrl}
            previewImage={originalPreviewImage}
            onViewModeChange={onSetViewMode}
            featureName={featureLabel}
            step={step}
            aspectRatio={aspectRatio}
          />
        </div>
      </div>
    </main>
  );
}

function getGenerationStepDownloadLabel(step: GenerationStep): string {
  if (step === GenerationStep.FloorplanTo3D) return '平面彩平';
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

interface PreviewContentProps {
  state: StepState;
  originalImageUrl: string | null;
  previewImage: string | null | undefined;
  onViewModeChange?: (viewMode: StepState['viewMode']) => void;
  featureName?: string;
  step?: GenerationStep;
  aspectRatio?: '16:9' | '2:1' | '1:1';
}

export function PreviewContent({ state, originalImageUrl, previewImage, onViewModeChange, featureName, step, aspectRatio }: PreviewContentProps) {
  return (
    <GenerationImageViewer
      sourceImageUrl={originalImageUrl}
      resultImageUrl={previewImage}
      aspectRatio={aspectRatio}
      viewMode={legacyToViewMode(state.viewMode)}
      onViewModeChange={nextMode => onViewModeChange?.(viewModeToLegacy(nextMode))}
      isGenerating={state.isGenerating}
      generationProgress={state.generationProgress}
      featureName={featureName}
      step={step}
      className="h-full"
      frameClassName="h-full rounded-none border-0 shadow-none"
      sourceMissingMessage="暂无原图，无法对比。"
    />
  );
}

function legacyToViewMode(viewMode: StepState['viewMode']): ViewMode {
  if (viewMode === 'after') return 'result';
  if (viewMode === 'original') return 'source';
  if (viewMode === 'compare') return 'side-by-side';
  return 'overlay';
}

function viewModeToLegacy(viewMode: ViewMode): StepState['viewMode'] {
  if (viewMode === 'result') return 'after';
  if (viewMode === 'source') return 'original';
  if (viewMode === 'side-by-side') return 'compare';
  return 'overlay';
}
