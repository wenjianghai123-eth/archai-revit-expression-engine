import { lazy, useState } from 'react';
import { Download, ExternalLink, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { GenerationStep, StepState } from '../../types';
import { buildResultImageFilename, downloadAsset, downloadFallbackMessage } from '../../utils/downloadAsset';
import { formatResultDimensions, getOriginalResultAssetId, getOriginalResultImageUrl } from '../../utils/resultImage';
import { ViewModeOption } from './workspaceTypes';

const OverlayCompareViewer = lazy(() => import('../OverlayCompareViewer').then(module => ({ default: module.OverlayCompareViewer })));

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
        featureLabel: step ? getGenerationStepDownloadLabel(step) : 'AI生成',
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
    <main className={className || 'workspace-canvas mx-3 flex min-w-0 flex-1 flex-col overflow-hidden'}>
      {showToolbar ? (
        <div className="flex h-12 items-center justify-between border-b border-slate-200 bg-white/70 px-4">
          <div className="flex overflow-hidden rounded-lg bg-slate-200 p-0.5">
            {viewModeOptions.map(({ value, label, disabled }) => (
              <button
                key={value}
                type="button"
                onClick={() => onSetViewMode?.(value)}
                disabled={disabled}
                className={`rounded-md px-4 py-1.5 text-[10px] font-bold uppercase disabled:opacity-40 ${
                  state.viewMode === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{providerLabel}</span>
        </div>
      ) : null}

      <div className={showToolbar ? 'min-h-0 flex-1 p-5' : 'h-full'}>
        <div className={`relative ${showToolbar ? 'workspace-result-frame h-full overflow-hidden border bg-white shadow-2xl' : 'h-full'}`}>
          {originalPreviewImage && !state.isGenerating ? (
            <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1">
              {dimensionsText ? (
                <span className="rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold text-slate-600 shadow-sm ring-1 ring-slate-200">{dimensionsText}</span>
              ) : null}
              <button
                type="button"
                onClick={() => window.open(originalPreviewImage, '_blank', 'noopener,noreferrer')}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:text-blue-700"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                查看原图
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
          <PreviewContent state={state} originalImageUrl={originalImageUrl} previewImage={originalPreviewImage} />
        </div>
      </div>
    </main>
  );
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

interface PreviewContentProps {
  state: StepState;
  originalImageUrl: string | null;
  previewImage: string | null | undefined;
}

export function PreviewContent({ state, originalImageUrl, previewImage }: PreviewContentProps) {
  if (state.isGenerating) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-white/80 text-blue-600">
        <RefreshCw className="mb-3 h-8 w-8 animate-spin" />
        <p className="text-sm font-bold">正在生成预览...</p>
        <p className="mt-2 text-xs text-slate-500">{state.generationProgress}%</p>
      </div>
    );
  }

  if (state.viewMode === 'original' && originalImageUrl) {
    return <img src={originalImageUrl} alt="原图" className="h-full w-full object-contain bg-white" referrerPolicy="no-referrer" />;
  }

  if (!previewImage) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-slate-50 text-center text-slate-400">
        <ImageIcon className="mb-4 h-10 w-10 opacity-40" />
        <h3 className="text-base font-bold text-slate-800">暂无生成结果</h3>
        <p className="mt-2 max-w-sm text-sm">上传图片并点击生成后，结果会显示在这里。</p>
      </div>
    );
  }

  if (state.viewMode === 'compare' && originalImageUrl && previewImage) {
    return (
      <div className="grid h-full w-full grid-cols-2 bg-white">
        <img src={originalImageUrl} alt="原图" className="h-full w-full border-r border-slate-200 object-contain" referrerPolicy="no-referrer" />
        <img src={previewImage} alt="结果图" className="h-full w-full object-contain" referrerPolicy="no-referrer" />
      </div>
    );
  }

  if (state.viewMode === 'overlay') {
    return <OverlayCompareViewer originalImageUrl={originalImageUrl} generatedImageUrl={previewImage} className="h-full" />;
  }

  return <img src={previewImage || ''} alt="生成结果" className="h-full w-full object-contain bg-white" referrerPolicy="no-referrer" />;
}
