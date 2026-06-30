import { GenerationImageViewer, type ViewMode } from './common/GenerationImageViewer';

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
  aspectRatio?: '16:9' | '2:1' | '1:1';
  featureName?: string;
  step?: unknown;
}

export function ResultImageTabs({
  resultImageUrl,
  originalImageUrl,
  viewMode,
  onViewModeChange,
  isGenerating,
  generationProgress,
  className,
  frameClassName,
  tabListClassName,
  tabButtonClassName,
  showTabs,
  resultMissingMessage,
  originalMissingMessage,
  compareMissingMessage,
  overlayMissingMessage,
  aspectRatio,
  featureName,
  step,
}: ResultImageTabsProps) {
  return (
    <GenerationImageViewer
      sourceImageUrl={originalImageUrl}
      resultImageUrl={resultImageUrl}
      viewMode={viewMode ? legacyToViewMode(viewMode) : undefined}
      onViewModeChange={nextMode => onViewModeChange?.(viewModeToLegacy(nextMode))}
      isGenerating={isGenerating}
      generationProgress={generationProgress}
      className={className}
      frameClassName={frameClassName}
      tabListClassName={tabListClassName}
      tabButtonClassName={tabButtonClassName}
      showTabs={showTabs}
      resultMissingMessage={resultMissingMessage}
      sourceMissingMessage={originalMissingMessage || overlayMissingMessage}
      compareMissingMessage={compareMissingMessage || overlayMissingMessage}
      aspectRatio={aspectRatio}
      featureName={featureName}
      step={step}
    />
  );
}

function legacyToViewMode(viewMode: ResultImageViewMode): ViewMode {
  if (viewMode === 'after') return 'result';
  if (viewMode === 'original') return 'source';
  if (viewMode === 'compare') return 'side-by-side';
  return 'overlay';
}

function viewModeToLegacy(viewMode: ViewMode): ResultImageViewMode {
  if (viewMode === 'result') return 'after';
  if (viewMode === 'source') return 'original';
  if (viewMode === 'side-by-side') return 'compare';
  return 'overlay';
}
