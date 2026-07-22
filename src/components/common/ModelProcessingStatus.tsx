import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { AssetModel } from '../../types';

interface ModelProcessingStatusProps {
  model: AssetModel;
  compact?: boolean;
}

export function ModelProcessingStatus({ model, compact = false }: ModelProcessingStatusProps) {
  const stages = readModelProcessingStages(model);
  return (
    <div className={`space-y-2 rounded-xl border border-slate-100 bg-white ${compact ? 'p-2' : 'p-3'}`}>
      {stages.map(stage => (
        <div key={stage.label}>
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="font-bold text-slate-700">{stage.label}</span>
            <span className={`inline-flex items-center gap-1 font-semibold ${readStageTone(stage.status)}`}>
              {stage.status === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {stage.status === 'succeeded' ? <CheckCircle2 className="h-3 w-3" /> : null}
              {stage.status === 'failed' ? <AlertTriangle className="h-3 w-3" /> : null}
              {stage.text}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${stage.status === 'failed' ? 'bg-rose-400' : stage.status === 'succeeded' || stage.status === 'skipped' ? 'bg-emerald-500' : stage.status === 'running' ? 'w-2/3 animate-pulse bg-blue-500' : 'w-1/5 bg-slate-300'}`}
              style={stage.status === 'succeeded' || stage.status === 'skipped' || stage.status === 'failed' ? { width: '100%' } : undefined}
            />
          </div>
          {stage.error ? <p className="mt-1 break-words text-[10px] leading-4 text-rose-600">{stage.error}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function readModelProcessingStages(model: AssetModel) {
  const conversionRequired = model.format === 'obj' || model.format === 'dae' || model.format === 'zip'
    || model.fileType === 'obj' || model.fileType === 'dae' || model.fileType === 'zip';
  const conversionStatus = model.convertedUrl || model.conversionStatus === 'succeeded'
    ? 'succeeded'
    : model.conversionStatus === 'converting'
      ? 'running'
      : model.conversionStatus === 'failed'
        ? 'failed'
        : conversionRequired ? 'pending' : 'skipped';
  const optimizationStatus = model.optimizationStatus === 'processing' || model.optimizationStatus === 'pending'
    ? 'running'
    : model.optimizationStatus === 'succeeded'
      ? 'succeeded'
      : model.optimizationStatus === 'failed'
        ? 'failed'
        : 'skipped';

  return [
    {
      label: '格式转换',
      status: conversionStatus,
      text: conversionStatus === 'succeeded' ? 'GLB 已就绪' : conversionStatus === 'running' ? '正在转换' : conversionStatus === 'failed' ? '转换失败' : conversionStatus === 'skipped' ? '无需转换' : '等待转换',
      error: conversionStatus === 'failed' ? model.conversionError || undefined : undefined,
    },
    {
      label: '预览轻量化',
      status: optimizationStatus,
      text: optimizationStatus === 'succeeded' ? '轻量模型已就绪' : optimizationStatus === 'running' ? '正在处理' : optimizationStatus === 'failed' ? '轻量化失败' : '使用当前模型',
      error: optimizationStatus === 'failed' ? model.optimizationError || undefined : undefined,
    },
  ] as const;
}

function readStageTone(status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'): string {
  if (status === 'running') return 'text-blue-700';
  if (status === 'succeeded') return 'text-emerald-700';
  if (status === 'failed') return 'text-rose-700';
  return 'text-slate-500';
}
