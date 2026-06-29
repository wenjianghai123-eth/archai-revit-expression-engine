import type { ReactNode } from 'react';
import { AspectRatioImage } from './AspectRatioImage';

interface ResultCardProps {
  image?: string | null;
  title: string;
  subtitle?: string;
  status?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  active?: boolean;
  loading?: boolean;
  onImageClick?: () => void;
}

export function ResultCard({
  image,
  title,
  subtitle,
  status,
  actions,
  children,
  active = false,
  loading = false,
  onImageClick,
}: ResultCardProps) {
  return (
    <article className={`result-card ${active ? 'result-card-active' : ''}`}>
      <AspectRatioImage src={image} alt={title} loading={loading} onClick={onImageClick} />
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
