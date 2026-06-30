import { useEffect, useMemo, useState } from 'react';
import { ImageIcon, RefreshCw } from 'lucide-react';
import { getImageAsset } from '../../lib/api';
import {
  buildImageAssetUrl,
  normalizeGenerationViewerImages,
  type GenerationViewerAspectRatio,
} from '../../utils/normalizeGenerationViewerImages';
import { ImageOverlayCompare } from './ImageOverlayCompare';

export type ViewMode = 'result' | 'source' | 'side-by-side' | 'overlay';

interface GenerationImageViewerProps {
  images?: unknown;
  sourceImageUrl?: string | null;
  sourceImageAssetId?: string | null;
  resultImageUrl?: string | null;
  resultImageAssetId?: string | null;
  aspectRatio?: GenerationViewerAspectRatio;
  viewMode?: ViewMode;
  onViewModeChange?: (viewMode: ViewMode) => void;
  defaultViewMode?: ViewMode;
  isGenerating?: boolean;
  generationProgress?: number;
  featureName?: string;
  step?: unknown;
  className?: string;
  frameClassName?: string;
  tabListClassName?: string;
  tabButtonClassName?: string;
  showTabs?: boolean;
  resultMissingMessage?: string;
  sourceMissingMessage?: string;
  compareMissingMessage?: string;
}

const viewModeOptions: Array<{ value: ViewMode; label: string }> = [
  { value: 'result', label: '结果图' },
  { value: 'source', label: '原图' },
  { value: 'side-by-side', label: '对比' },
  { value: 'overlay', label: '叠加对比' },
];

export function GenerationImageViewer({
  images,
  sourceImageUrl,
  sourceImageAssetId,
  resultImageUrl,
  resultImageAssetId,
  aspectRatio,
  viewMode,
  onViewModeChange,
  defaultViewMode = 'result',
  isGenerating = false,
  generationProgress = 0,
  featureName,
  step,
  className = '',
  frameClassName = '',
  tabListClassName = '',
  tabButtonClassName = '',
  showTabs = true,
  resultMissingMessage = '暂无生成结果',
  sourceMissingMessage = '暂无原图，无法对比。',
  compareMissingMessage = '暂无原图，无法对比。',
}: GenerationImageViewerProps) {
  const normalized = useMemo(() => normalizeGenerationViewerImages({
    ...(isRecord(images) ? images : {}),
    sourceImageUrl,
    sourceImageAssetId,
    resultImageUrl,
    resultImageAssetId,
    aspectRatio,
  }), [aspectRatio, images, resultImageAssetId, resultImageUrl, sourceImageAssetId, sourceImageUrl]);

  const [resolvedSourceUrl, setResolvedSourceUrl] = useState(normalized.sourceImageUrl);
  const [resolvedResultUrl, setResolvedResultUrl] = useState(normalized.resultImageUrl);
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>(defaultViewMode);
  const activeViewMode = viewMode ?? internalViewMode;
  const effectiveAspectRatio = aspectRatio || normalized.aspectRatio || '16:9';

  useEffect(() => {
    setResolvedSourceUrl(normalized.sourceImageUrl);
    setResolvedResultUrl(normalized.resultImageUrl);
  }, [normalized.resultImageUrl, normalized.sourceImageUrl]);

  useEffect(() => {
    void resolveMissingAssetUrl(normalized.sourceImageAssetId, normalized.sourceImageUrl, setResolvedSourceUrl);
    void resolveMissingAssetUrl(normalized.resultImageAssetId, normalized.resultImageUrl, setResolvedResultUrl);
  }, [normalized.resultImageAssetId, normalized.resultImageUrl, normalized.sourceImageAssetId, normalized.sourceImageUrl]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug({
      event: 'generation_viewer_images_normalized',
      featureName,
      step,
      hasSourceImage: Boolean(resolvedSourceUrl),
      hasResultImage: Boolean(resolvedResultUrl),
      sourceImageAssetId: normalized.sourceImageAssetId,
      resultImageAssetId: normalized.resultImageAssetId,
      aspectRatio: effectiveAspectRatio,
    });
  }, [effectiveAspectRatio, featureName, normalized.resultImageAssetId, normalized.sourceImageAssetId, resolvedResultUrl, resolvedSourceUrl, step]);

  const setMode = (nextMode: ViewMode) => {
    setInternalViewMode(nextMode);
    onViewModeChange?.(nextMode);
  };

  return (
    <div className={`flex min-h-0 w-full flex-col ${className}`}>
      {showTabs ? (
        <div className={`mb-3 flex max-w-full overflow-x-auto rounded-lg bg-slate-200 p-0.5 ${tabListClassName}`}>
          <div className="flex min-w-max gap-0.5">
            {viewModeOptions.map(option => {
              const disabled = isViewModeDisabled(option.value, Boolean(resolvedSourceUrl), Boolean(resolvedResultUrl));
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  disabled={disabled}
                  className={`whitespace-nowrap rounded-md px-4 py-1.5 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    activeViewMode === option.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  } ${tabButtonClassName}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className={`${readAspectRatioClass(effectiveAspectRatio)} w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${frameClassName}`}>
        {renderViewer({
          viewMode: activeViewMode,
          sourceImageUrl: resolvedSourceUrl,
          resultImageUrl: resolvedResultUrl,
          isGenerating,
          generationProgress,
          resultMissingMessage,
          sourceMissingMessage,
          compareMissingMessage,
        })}
      </div>
    </div>
  );
}

function renderViewer({
  viewMode,
  sourceImageUrl,
  resultImageUrl,
  isGenerating,
  generationProgress,
  resultMissingMessage,
  sourceMissingMessage,
  compareMissingMessage,
}: {
  viewMode: ViewMode;
  sourceImageUrl?: string;
  resultImageUrl?: string;
  isGenerating: boolean;
  generationProgress: number;
  resultMissingMessage: string;
  sourceMissingMessage: string;
  compareMissingMessage: string;
}) {
  if (isGenerating) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-white/80 text-blue-600">
        <RefreshCw className="mb-3 h-8 w-8 animate-spin" />
        <p className="text-sm font-bold">正在生成预览...</p>
        <p className="mt-2 text-xs text-slate-500">{generationProgress}%</p>
      </div>
    );
  }

  if (viewMode === 'source') {
    return sourceImageUrl
      ? <img src={sourceImageUrl} alt="原图" className="h-full w-full bg-white object-contain" referrerPolicy="no-referrer" />
      : <ImageEmptyState message={sourceMissingMessage} />;
  }

  if (viewMode === 'side-by-side') {
    if (!sourceImageUrl || !resultImageUrl) return <ImageEmptyState message={compareMissingMessage} />;
    return (
      <div className="grid h-full w-full bg-white md:grid-cols-2">
        <img src={sourceImageUrl} alt="原图" className="h-full w-full border-b border-slate-200 object-contain md:border-b-0 md:border-r" referrerPolicy="no-referrer" />
        <img src={resultImageUrl} alt="结果图" className="h-full w-full object-contain" referrerPolicy="no-referrer" />
      </div>
    );
  }

  if (viewMode === 'overlay') {
    return sourceImageUrl && resultImageUrl
      ? <ImageOverlayCompare sourceImageUrl={sourceImageUrl} resultImageUrl={resultImageUrl} className="h-full" />
      : <ImageEmptyState message={compareMissingMessage} />;
  }

  return resultImageUrl
    ? <img src={resultImageUrl} alt="结果图" className="h-full w-full bg-white object-contain" referrerPolicy="no-referrer" />
    : <ImageEmptyState title={resultMissingMessage} message="生成完成后，结果图会显示在这里。" />;
}

function isViewModeDisabled(viewMode: ViewMode, hasSourceImage: boolean, hasResultImage: boolean): boolean {
  if (viewMode === 'source') return !hasSourceImage;
  if (viewMode === 'result') return !hasResultImage;
  return !hasSourceImage || !hasResultImage;
}

function readAspectRatioClass(aspectRatio: GenerationViewerAspectRatio): string {
  if (aspectRatio === '2:1') return 'aspect-[2/1]';
  if (aspectRatio === '1:1') return 'aspect-square';
  return 'aspect-video';
}

async function resolveMissingAssetUrl(assetId: string | undefined, currentUrl: string | undefined, setUrl: (url: string | undefined) => void): Promise<void> {
  if (!assetId || currentUrl) return;
  try {
    const asset = await getImageAsset(assetId);
    setUrl(asset.url || buildImageAssetUrl(assetId));
  } catch {
    setUrl(buildImageAssetUrl(assetId));
  }
}

function ImageEmptyState({ title, message }: { title?: string; message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-slate-50 px-4 text-center text-slate-400">
      <ImageIcon className="mb-4 h-10 w-10 opacity-40" />
      {title ? <h3 className="text-base font-bold text-slate-800">{title}</h3> : null}
      <p className="mt-2 max-w-sm text-sm font-bold leading-6">{message}</p>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
