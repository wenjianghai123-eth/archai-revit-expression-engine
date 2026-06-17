import { ImagePlus, Layers, Paintbrush, RefreshCw, Send, Settings2, Sparkles, Zap } from 'lucide-react';
import { GenerationStep, ResultSendTargetStep, SecondaryEditAction } from '../../types';
import { materialRepairActions, resultSendTargets, secondaryEditActions } from '../../utils/secondaryEdit';

interface SecondaryEditActionsProps {
  resultId: string;
  disabled?: boolean;
  compact?: boolean;
  onAction: (resultId: string, action: SecondaryEditAction) => void;
}

export function SecondaryEditActions({
  resultId,
  disabled = false,
  compact = false,
  onAction,
}: SecondaryEditActionsProps) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {secondaryEditActions.map(item => (
        <button
          key={item.action}
          type="button"
          onClick={() => onAction(resultId, item.action)}
          disabled={disabled}
          title={item.label}
          aria-label={item.label}
          className="inline-flex min-w-0 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
        >
          <SecondaryEditIcon action={item.action} />
          <span className="truncate">{compact ? item.shortLabel : item.label}</span>
        </button>
      ))}
    </div>
  );
}

export function MaterialRepairActions({
  resultId,
  disabled = false,
  compact = false,
  onAction,
}: SecondaryEditActionsProps) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {materialRepairActions.map(item => (
        <button
          key={item.action}
          type="button"
          onClick={() => onAction(resultId, item.action)}
          disabled={disabled}
          title={item.label}
          aria-label={item.label}
          className="inline-flex min-w-0 items-center justify-center gap-1 rounded-md border border-emerald-100 bg-white px-2 py-1.5 text-[10px] font-bold text-emerald-700 transition-colors hover:border-emerald-200 hover:bg-emerald-50 disabled:opacity-50"
        >
          <Paintbrush className="h-3 w-3 shrink-0" />
          <span className="truncate">{compact ? item.shortLabel : item.label}</span>
        </button>
      ))}
    </div>
  );
}

interface ResultSendActionsProps {
  resultId: string;
  currentStep: GenerationStep;
  disabled?: boolean;
  compact?: boolean;
  onSend: (resultId: string, targetStep: ResultSendTargetStep) => void;
}

export function ResultSendActions({
  resultId,
  currentStep,
  disabled = false,
  compact = false,
  onSend,
}: ResultSendActionsProps) {
  const targets = resultSendTargets.filter(item => item.step !== currentStep);

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {targets.map(item => (
        <button
          key={item.step}
          type="button"
          onClick={() => onSend(resultId, item.step)}
          disabled={disabled}
          title={item.label}
          aria-label={item.label}
          className="inline-flex min-w-0 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
        >
          <SendIcon step={item.step} />
          <span className="truncate">{compact ? item.shortLabel : item.label}</span>
        </button>
      ))}
    </div>
  );
}

function SecondaryEditIcon({ action }: { action: SecondaryEditAction }) {
  if (action === 'regenerate') return <RefreshCw className="h-3 w-3 shrink-0" />;
  if (action === 'similar') return <Sparkles className="h-3 w-3 shrink-0" />;
  if (action === 'realism') return <Sparkles className="h-3 w-3 shrink-0" />;
  if (action === 'lighting') return <Zap className="h-3 w-3 shrink-0" />;
  if (action === 'style') return <Settings2 className="h-3 w-3 shrink-0" />;
  if (action.startsWith('material-')) return <Paintbrush className="h-3 w-3 shrink-0" />;
  return <ImagePlus className="h-3 w-3 shrink-0" />;
}

function SendIcon({ step }: { step: ResultSendTargetStep }) {
  if (step === GenerationStep.MaterialReplace) return <Paintbrush className="h-3 w-3 shrink-0" />;
  if (step === GenerationStep.ObjectInsert) return <ImagePlus className="h-3 w-3 shrink-0" />;
  if (step === GenerationStep.DesignVariants) return <Layers className="h-3 w-3 shrink-0" />;
  return <Send className="h-3 w-3 shrink-0" />;
}
