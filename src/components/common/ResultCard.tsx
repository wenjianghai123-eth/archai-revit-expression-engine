import type { ReactNode } from 'react';
import { GenerationImageViewer } from './GenerationImageViewer';

interface ResultCardProps {
  image?: string | null;
  sourceImage?: string | null;
  imageAssetId?: string | null;
  sourceImageAssetId?: string | null;
  title: string;
  subtitle?: string;
  status?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  active?: boolean;
  loading?: boolean;
  onImageClick?: () => void;
  aspectRatio?: '16:9' | '2:1' | '1:1';
  featureName?: string;
  step?: unknown;
}

export function ResultCard({
  image,
  sourceImage,
  imageAssetId,
  sourceImageAssetId,
  title,
  subtitle,
  status,
  actions,
  children,
  active = false,
  loading = false,
  onImageClick,
  aspectRatio,
  featureName,
  step,
}: ResultCardProps) {
  return (
    <article className={`result-card ${active ? 'result-card-active' : ''}`}>
      <div onDoubleClick={onImageClick}>
        <GenerationImageViewer
          sourceImageUrl={sourceImage}
          sourceImageAssetId={sourceImageAssetId}
          resultImageUrl={image}
          resultImageAssetId={imageAssetId}
          isGenerating={loading}
          aspectRatio={aspectRatio}
          featureName={featureName || title}
          step={step}
          frameClassName="rounded-none border-0 shadow-none"
          tabListClassName="m-2 mb-2"
          sourceMissingMessage="暂无原图，无法对比。"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-slate-900">{title}</h3>
            {subtitle ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{subtitle}</p> : null}
          </div>
          {status}
        </div>
        {children ? <div className="mt-3 min-h-0 flex-1">{children}</div> : <div className="flex-1" />}
        {actions ? <div className="card-footer-actions mt-4">{actions}</div> : null}
      </div>
    </article>
  );
}
