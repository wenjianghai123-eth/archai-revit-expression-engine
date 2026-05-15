import { lazy } from 'react';
import { Image as ImageIcon, RefreshCw } from 'lucide-react';
import { StepState } from '../../types';
import { ViewModeOption } from './workspaceTypes';

const OverlayCompareViewer = lazy(() => import('../OverlayCompareViewer').then(module => ({ default: module.OverlayCompareViewer })));

interface ResultPreviewPanelProps {
  state: StepState;
  originalImageUrl: string | null;
  previewImage: string | null | undefined;
  providerLabel: string;
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
  viewModeOptions = [],
  onSetViewMode,
  showToolbar = false,
  className = '',
}: ResultPreviewPanelProps) {
  return (
    <main className={className || 'flex min-w-0 flex-1 flex-col'}>
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
        <div className={showToolbar ? 'h-full overflow-hidden rounded border border-slate-200 bg-white shadow-2xl' : 'h-full'}>
          <PreviewContent state={state} originalImageUrl={originalImageUrl} previewImage={previewImage} />
        </div>
      </div>
    </main>
  );
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
