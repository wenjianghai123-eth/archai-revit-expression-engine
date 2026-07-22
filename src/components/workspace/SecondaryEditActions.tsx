import { Download, FileText, ImagePlus, Layers, Paintbrush, RefreshCw, Send, Settings2, Share2, Sparkles, Zap } from 'lucide-react';
import { getResultRecommendations, type ResultRecommendation } from '../../constants/productWorkflows';
import { GenerationStep, ResultSendTargetStep, SecondaryEditAction } from '../../types';
import { materialRepairActions, resultSendTargets, secondaryEditActions } from '../../utils/secondaryEdit';
import { RelatedFeatureChips } from '../common/RelatedFeatureChips';

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

export function ContinuousEditAction({
  resultId,
  disabled = false,
  onAction,
}: SecondaryEditActionsProps) {
  return (
    <button
      type="button"
      onClick={() => onAction(resultId, 'continue-edit')}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-1 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:border-blue-200 hover:bg-blue-100 disabled:opacity-50"
    >
      <ImagePlus className="h-3.5 w-3.5" />
      连续修改
    </button>
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
  onSecondaryAction?: (resultId: string, action: SecondaryEditAction) => void;
  onUtilityAction?: (action: 'download' | 'share' | 'pdf') => void;
}

export function ResultSendActions({
  resultId,
  currentStep,
  disabled = false,
  compact = false,
  onSend,
  onSecondaryAction,
  onUtilityAction,
}: ResultSendActionsProps) {
  const configuredRecommendations = getResultRecommendations(currentStep);
  const recommendations: ResultRecommendation[] = configuredRecommendations.length > 0
    ? configuredRecommendations
    : resultSendTargets
        .filter(item => item.step !== currentStep)
        .map(item => ({ id: `send-${item.step}`, label: readResultSendLabel(item.step), kind: 'send' as const, targetStep: item.step }));

  return (
    <RelatedFeatureChips
      title={compact ? undefined : '推荐下一步'}
      items={recommendations.map(item => ({
        id: item.id,
        label: item.label,
        icon: <RecommendationIcon recommendation={item} />,
        disabled: disabled || (item.kind === 'secondary' && !onSecondaryAction) || (item.kind === 'utility' && !onUtilityAction),
      }))}
      onSelect={id => {
        const recommendation = recommendations.find(item => item.id === id);
        if (!recommendation) return;
        if (recommendation.kind === 'send') onSend(resultId, recommendation.targetStep);
        if (recommendation.kind === 'secondary') onSecondaryAction?.(resultId, recommendation.action);
        if (recommendation.kind === 'utility') onUtilityAction?.(recommendation.action);
      }}
      variant="chips"
    />
  );
}

function RecommendationIcon({ recommendation }: { recommendation: ResultRecommendation }) {
  if (recommendation.kind === 'send') return <SendIcon step={recommendation.targetStep} />;
  if (recommendation.kind === 'secondary') return <RefreshCw className="h-3 w-3 shrink-0" />;
  if (recommendation.action === 'download') return <Download className="h-3 w-3 shrink-0" />;
  if (recommendation.action === 'share') return <Share2 className="h-3 w-3 shrink-0" />;
  return <FileText className="h-3 w-3 shrink-0" />;
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
  if (step === GenerationStep.ImagePolish) return <Sparkles className="h-3 w-3 shrink-0" />;
  return <Send className="h-3 w-3 shrink-0" />;
}

function readResultSendLabel(step: ResultSendTargetStep): string {
  if (step === GenerationStep.MaterialReplace) return '材质软装替换';
  if (step === GenerationStep.ObjectInsert) return '元素植入';
  if (step === GenerationStep.DesignVariants) return '方案变体';
  if (step === GenerationStep.ImagePolish) return '质感提升';
  return '自由参考生图';
}
