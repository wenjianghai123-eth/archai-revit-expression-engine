import { AlertCircle, CheckCircle2, Clock3, LoaderCircle, XCircle } from 'lucide-react';
import type { GenerationTaskStatus, NormalizedGenerationResult } from '../../utils/normalizeGenerationResult';
import { readGenerationProgressLabel } from '../../utils/normalizeGenerationResult';

export interface GenerationProgressProps {
  status: GenerationTaskStatus;
  progress?: number | null;
  label?: string;
  errorMessage?: string | null;
  compact?: boolean;
  className?: string;
}

export function GenerationProgress({ status, progress = null, label, errorMessage, compact = false, className = '' }: GenerationProgressProps) {
  const normalizedProgress = typeof progress === 'number' && Number.isFinite(progress)
    ? Math.max(0, Math.min(100, Math.round(progress)))
    : null;
  const indeterminate = normalizedProgress === null && !['idle', 'completed', 'failed', 'cancelled'].includes(status);
  const displayProgress = status === 'completed' ? 100 : normalizedProgress;
  const statusLabel = label || readGenerationProgressLabel(status);
  const Icon = status === 'completed' ? CheckCircle2 : status === 'failed' ? XCircle : status === 'idle' ? Clock3 : status === 'cancelled' ? AlertCircle : LoaderCircle;
  const tone = status === 'failed' || status === 'cancelled' ? 'text-rose-700' : status === 'completed' ? 'text-emerald-700' : 'text-blue-700';

  return (
    <div role="status" aria-live="polite" className={`rounded-xl border border-slate-200 bg-white ${compact ? 'p-3' : 'p-4'} ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className={`flex min-w-0 items-center gap-2 text-xs font-black ${tone}`}>
          <Icon className={`h-4 w-4 shrink-0 ${!['idle', 'completed', 'failed', 'cancelled'].includes(status) ? 'animate-spin' : ''}`} />
          <span className="truncate">{statusLabel}</span>
        </div>
        <span className="shrink-0 text-[11px] font-bold text-slate-500">{displayProgress === null ? '阶段进度' : `${displayProgress}%`}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        {indeterminate ? (
          <div data-testid="indeterminate-progress" className="h-full w-1/3 animate-pulse rounded-full bg-blue-500" />
        ) : (
          <div className={`h-full rounded-full transition-all ${status === 'failed' || status === 'cancelled' ? 'bg-rose-500' : status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${displayProgress || 0}%` }} />
        )}
      </div>
      {errorMessage && status === 'failed' ? <p className="mt-2 text-xs font-semibold leading-5 text-rose-700">{errorMessage}</p> : null}
    </div>
  );
}

export function NormalizedGenerationProgress({ result, compact, className }: { result: NormalizedGenerationResult; compact?: boolean; className?: string }) {
  return <GenerationProgress status={result.status} progress={result.progress} label={result.progressLabel} errorMessage={result.errorMessage} compact={compact} className={className} />;
}
