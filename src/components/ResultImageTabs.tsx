import React, { useState } from 'react';
import { ImageIcon, RefreshCw } from 'lucide-react';
import { OverlayCompareViewer } from './OverlayCompareViewer';

export type ResultImageViewMode = 'after' | 'original' | 'compare' | 'overlay';

interface ResultImageTabsProps {
  resultImageUrl?: string | null;
  originalImageUrl?: string | null;
  viewMode?: ResultImageViewMode;
  onViewModeChange?: (viewMode: ResultImageViewMode) => void;
  isGenerating?: boolean;
  generationProgress?: number;
  className?: string;
  frameClassName?: string;
  tabListClassName?: string;
  tabButtonClassName?: string;
  showTabs?: boolean;
  resultMissingMessage?: string;
  originalMissingMessage?: string;
  compareMissingMessage?: string;
  overlayMissingMessage?: string;
}

const viewModeOptions: Array<{ value: ResultImageViewMode; label: string }> = [
  { value: 'after', label: '结果图' },
  { value: 'original', label: '原图' },
  { value: 'compare', label: '对比' },
  { value: 'overlay', label: '叠加对比' },
];

export function ResultImageTabs({
  resultImageUrl,
  originalImageUrl,
  viewMode,
  onViewModeChange,
  isGenerating = false,
  generationProgress = 0,
  className = '',
  frameClassName = '',
  tabListClassName = '',
  tabButtonClassName = '',
  showTabs = true,
  resultMissingMessage = '暂无生成结果',
  originalMissingMessage = '该历史记录缺少原图',
  compareMissingMessage = '需要同时具备原图和结果图才能对比',
  overlayMissingMessage = '需要同时具备原图和结果图才能叠加对比',
}: ResultImageTabsProps) {
  const [internalViewMode, setInternalViewMode] = useState<ResultImageViewMode>('after');
  const activeViewMode = viewMode ?? internalViewMode;

  const handleSetViewMode = (nextViewMode: ResultImageViewMode) => {
    setInternalViewMode(nextViewMode);
    onViewModeChange?.(nextViewMode);
  };

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      {showTabs ? (
        <div className={`flex overflow-hidden rounded-lg bg-slate-200 p-0.5 ${tabListClassName}`}>
          {viewModeOptions.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSetViewMode(option.value)}
              className={`rounded-md px-4 py-1.5 text-[10px] font-bold transition ${
                activeViewMode === option.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              } ${tabButtonClassName}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className={`min-h-0 flex-1 overflow-hidden rounded border border-slate-200 bg-white shadow-2xl ${frameClassName}`}>
        {renderViewer({
          viewMode: activeViewMode,
          resultImageUrl,
          originalImageUrl,
          isGenerating,
          generationProgress,
          resultMissingMessage,
          originalMissingMessage,
          compareMissingMessage,
          overlayMissingMessage,
        })}
      </div>
    </div>
  );
}

function renderViewer({
  viewMode,
  resultImageUrl,
  originalImageUrl,
  isGenerating,
  generationProgress,
  resultMissingMessage,
  originalMissingMessage,
  compareMissingMessage,
  overlayMissingMessage,
}: {
  viewMode: ResultImageViewMode;
  resultImageUrl?: string | null;
  originalImageUrl?: string | null;
  isGenerating: boolean;
  generationProgress: number;
  resultMissingMessage: string;
  originalMissingMessage: string;
  compareMissingMessage: string;
  overlayMissingMessage: string;
}) {
  if (isGenerating) {
    return (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center bg-white/80 text-blue-600">
        <RefreshCw className="mb-3 h-8 w-8 animate-spin" />
        <p className="text-sm font-bold">正在生成预览...</p>
        <p className="mt-2 text-xs text-slate-500">{generationProgress}%</p>
      </div>
    );
  }

  if (viewMode === 'original') {
    return originalImageUrl
      ? <img src={originalImageUrl} alt="原图" className="h-full min-h-[220px] w-full bg-white object-contain" referrerPolicy="no-referrer" />
      : <ImageEmptyState message={originalMissingMessage} />;
  }

  if (viewMode === 'compare') {
    if (!originalImageUrl || !resultImageUrl) {
      return <ImageEmptyState message={compareMissingMessage} />;
    }

    return (
      <div className="grid h-full min-h-[220px] w-full grid-cols-2 bg-white">
        <img src={originalImageUrl} alt="原图" className="h-full w-full border-r border-slate-200 object-contain" referrerPolicy="no-referrer" />
        <img src={resultImageUrl} alt="结果图" className="h-full w-full object-contain" referrerPolicy="no-referrer" />
      </div>
    );
  }

  if (viewMode === 'overlay') {
    if (!originalImageUrl || !resultImageUrl) {
      return <ImageEmptyState message={overlayMissingMessage} />;
    }

    return <OverlayCompareViewer originalImageUrl={originalImageUrl} generatedImageUrl={resultImageUrl} className="h-full" />;
  }

  return resultImageUrl
    ? <img src={resultImageUrl} alt="结果图" className="h-full min-h-[220px] w-full bg-white object-contain" referrerPolicy="no-referrer" />
    : <ImageEmptyState title={resultMissingMessage} message="上传图片并完成生成后，结果会显示在这里。" />;
}

function ImageEmptyState({ title, message }: { title?: string; message: string }) {
  return (
    <div className="flex h-full min-h-[220px] flex-col items-center justify-center bg-slate-50 px-4 text-center text-slate-400">
      <ImageIcon className="mb-4 h-10 w-10 opacity-40" />
      {title ? <h3 className="text-base font-bold text-slate-800">{title}</h3> : null}
      <p className="mt-2 max-w-sm text-sm leading-6">{message}</p>
    </div>
  );
}
