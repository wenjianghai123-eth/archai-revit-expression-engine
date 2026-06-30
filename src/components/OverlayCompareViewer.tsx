import { ImageOverlayCompare } from './common/ImageOverlayCompare';

interface OverlayCompareViewerProps {
  originalImageUrl?: string | null;
  generatedImageUrl?: string | null;
  originalLabel?: string;
  generatedLabel?: string;
  className?: string;
}

export function OverlayCompareViewer({
  originalImageUrl,
  generatedImageUrl,
  originalLabel = '原图',
  generatedLabel = '结果图',
  className = '',
}: OverlayCompareViewerProps) {
  return (
    <ImageOverlayCompare
      sourceImageUrl={originalImageUrl}
      resultImageUrl={generatedImageUrl}
      sourceLabel={originalLabel}
      resultLabel={generatedLabel}
      className={className}
    />
  );
}
