import {
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  Loader2,
  SkipForward,
  Workflow,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type {
  DesignWorkflowDetail,
  DesignWorkflowNode,
  DesignWorkflowStageKey,
} from '../../types';
import { designWorkflowStages } from '../../constants/designWorkflow';

interface DesignWorkflowBarProps {
  detail: DesignWorkflowDetail | null;
  hasFormalInputAsset: boolean;
  isBusy: boolean;
  error: string | null;
  onStart: () => void;
  onBack: () => void;
  onSkip: () => void;
  onAdvance: () => void;
}

export function DesignWorkflowBar({
  detail,
  hasFormalInputAsset,
  isBusy,
  error,
  onStart,
  onBack,
  onSkip,
  onAdvance,
}: DesignWorkflowBarProps) {
  if (!detail) {
    return (
      <section className="mx-3 mt-2 rounded-2xl border border-blue-100 bg-blue-50/90 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-600 p-2 text-white">
              <Workflow className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">设计表达流程</p>
              <p className="mt-0.5 text-xs text-slate-500">
                使用正式资产串联基础出图、方案修改与交付。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onStart}
            disabled={!hasFormalInputAsset || isBusy}
            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isBusy ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : null}
            开始设计表达流程
          </button>
        </div>
        {!hasFormalInputAsset ? (
          <p className="mt-2 text-xs font-semibold text-amber-700">
            请先完成图片上传并取得正式 assetId。
          </p>
        ) : null}
        {error ? <p className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}
      </section>
    );
  }

  const currentNode = detail.nodes.find(
    node => node.id === detail.workflow.currentNodeId,
  ) || null;
  const pathNodes = buildCurrentPath(detail.nodes, currentNode);
  const pathByStage = new Map(pathNodes.map(node => [node.stageKey, node]));
  const currentStageIndex = designWorkflowStages.findIndex(
    stage => stage.key === currentNode?.stageKey,
  );
  const canBack = Boolean(currentNode?.parentNodeId);
  const canSkip = Boolean(currentNode && currentNode.stageKey !== 'delivery');
  const canAdvance = Boolean(
    currentNode
    && currentNode.stageKey !== 'delivery'
    && (
      currentNode.outputAssetId
      || (currentNode.stageKey !== 'continuous-edit' && currentNode.inputAssetId)
    ),
  );

  return (
    <section className="mx-3 mt-2 rounded-2xl border bg-white px-3 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Workflow className="h-4 w-4 text-blue-600" />
            {detail.workflow.title}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            当前：{currentNode ? readStageLabel(currentNode.stageKey) : '未开始'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <WorkflowButton label="回退" icon={<ArrowLeft className="h-3.5 w-3.5" />} disabled={!canBack || isBusy} onClick={onBack} />
          <WorkflowButton label="跳过此步" icon={<SkipForward className="h-3.5 w-3.5" />} disabled={!canSkip || isBusy} onClick={onSkip} />
          <WorkflowButton label="进入下一步" icon={<ArrowRight className="h-3.5 w-3.5" />} disabled={!canAdvance || isBusy} primary onClick={onAdvance} />
        </div>
      </div>

      <div className="mt-3 overflow-x-auto pb-1">
        <div className="flex min-w-max items-center">
          {designWorkflowStages.map((stage, index) => {
            const node = pathByStage.get(stage.key);
            const isCurrent = currentNode?.stageKey === stage.key;
            const isSkipped = node?.status === 'skipped';
            const isCompleted = Boolean(node && !isCurrent && node.status === 'completed')
              || index < currentStageIndex;
            return (
              <div key={stage.key} className="flex items-center">
                <div className="flex w-24 flex-col items-center text-center">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                    isCurrent
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : isSkipped
                        ? 'border-amber-300 bg-amber-50 text-amber-600'
                        : isCompleted
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : 'border-slate-200 bg-white text-slate-300'
                  }`}>
                    {isCompleted
                      ? <Check className="h-3.5 w-3.5" />
                      : isSkipped
                        ? <SkipForward className="h-3.5 w-3.5" />
                        : <Circle className="h-2.5 w-2.5 fill-current" />}
                  </div>
                  <span className={`mt-1 text-[10px] font-bold ${
                    isCurrent ? 'text-blue-700' : 'text-slate-500'
                  }`}>
                    {stage.shortLabel}
                  </span>
                </div>
                {index < designWorkflowStages.length - 1 ? (
                  <div className={`h-0.5 w-8 ${
                    index < currentStageIndex ? 'bg-emerald-400' : 'bg-slate-200'
                  }`} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {isBusy ? <p className="mt-2 text-xs text-blue-600">正在更新流程位置…</p> : null}
      {error ? <p className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}
    </section>
  );
}

function WorkflowButton({
  label,
  icon,
  disabled,
  primary,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 rounded-lg px-3 py-2 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-40 ${
        primary ? 'bg-blue-600 text-white' : 'border bg-white text-slate-600'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function buildCurrentPath(
  nodes: DesignWorkflowNode[],
  current: DesignWorkflowNode | null,
) {
  if (!current) return [];
  const byId = new Map(nodes.map(node => [node.id, node]));
  const path: DesignWorkflowNode[] = [];
  let cursor: DesignWorkflowNode | undefined = current;
  while (cursor) {
    path.unshift(cursor);
    cursor = cursor.parentNodeId ? byId.get(cursor.parentNodeId) : undefined;
  }
  return path;
}

function readStageLabel(stageKey: DesignWorkflowStageKey) {
  return designWorkflowStages.find(stage => stage.key === stageKey)?.label || stageKey;
}
