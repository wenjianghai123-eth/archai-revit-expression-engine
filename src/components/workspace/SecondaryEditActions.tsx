import { ImagePlus, RefreshCw, Settings2, Sparkles, Zap } from 'lucide-react';
import { SecondaryEditAction } from '../../types';
import { secondaryEditActions } from '../../utils/secondaryEdit';

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

function SecondaryEditIcon({ action }: { action: SecondaryEditAction }) {
  if (action === 'regenerate') return <RefreshCw className="h-3 w-3 shrink-0" />;
  if (action === 'similar') return <Sparkles className="h-3 w-3 shrink-0" />;
  if (action === 'realism') return <Sparkles className="h-3 w-3 shrink-0" />;
  if (action === 'lighting') return <Zap className="h-3 w-3 shrink-0" />;
  if (action === 'style') return <Settings2 className="h-3 w-3 shrink-0" />;
  return <ImagePlus className="h-3 w-3 shrink-0" />;
}
