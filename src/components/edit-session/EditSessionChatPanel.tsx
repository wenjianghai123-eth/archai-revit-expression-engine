import { Check, RefreshCw, Send } from 'lucide-react';
import type {
  AssetVersion,
  EditConstraint,
  EditJobState,
  EditMessage,
} from '../../types';
import type { SendEditInput } from '../../hooks/useImageEditSession';

const constraintOptions: Array<{ key: EditConstraint; label: string }> = [
  { key: 'strictStructure', label: '严格保持结构' },
  { key: 'preserveCamera', label: '保持相机' },
  { key: 'preserveAspectRatio', label: '保持画幅' },
  { key: 'materialOnly', label: '只改材质' },
  { key: 'lightingOnly', label: '只改灯光' },
  { key: 'furnitureOnly', label: '只改软装' },
  { key: 'forbidNewComponents', label: '禁止增加构件' },
];

interface EditSessionChatPanelProps {
  messages: EditMessage[];
  versions: AssetVersion[];
  selectedVersionNumber: number;
  jobState: EditJobState | null;
  instruction: string;
  constraints: Partial<Record<EditConstraint, boolean>>;
  retryInput: SendEditInput | null;
  isGenerating: boolean;
  finalSize: '2K' | '4K';
  previewCreditCost: number;
  finalCreditCost: number;
  onInstructionChange: (value: string) => void;
  onConstraintsChange: (value: Partial<Record<EditConstraint, boolean>>) => void;
  onPrepareRetry: (input: SendEditInput) => void;
  onSend: () => void;
  onRetry: () => void;
  onFinalSizeChange: (value: '2K' | '4K') => void;
  onFinalize: () => void;
}

export function EditSessionChatPanel({
  messages,
  versions,
  selectedVersionNumber,
  jobState,
  instruction,
  constraints,
  retryInput,
  isGenerating,
  finalSize,
  previewCreditCost,
  finalCreditCost,
  onInstructionChange,
  onConstraintsChange,
  onPrepareRetry,
  onSend,
  onRetry,
  onFinalSizeChange,
  onFinalize,
}: EditSessionChatPanelProps) {
  return (
    <aside className="flex min-h-0 flex-col rounded-2xl border bg-white">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            输入第一条修改指令开始连续编辑
          </p>
        ) : messages.map(message => {
          const active = jobState?.messageId === message.id ? jobState : null;
          const status = active?.status || message.status;
          const failure = active?.error || message.errorMessage;
          const outputVersion = versions.find(version => version.id === message.outputVersionId);

          return (
            <div key={message.id} className="rounded-2xl bg-slate-100 p-3">
              <p className="text-sm leading-6 text-slate-800">{message.content}</p>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className={readStatusClassName(status)}>
                  {readStatus(status, active?.progress)}
                </span>
                {outputVersion ? <span>生成 V{outputVersion.versionNumber}</span> : null}
              </div>
              {failure ? (
                <p className="mt-2 text-xs leading-5 text-red-600">
                  {message.errorCode ? `${message.errorCode}: ` : ''}
                  {failure}
                </p>
              ) : null}
              {active?.status === 'failed' ? (
                <button
                  type="button"
                  onClick={() => onPrepareRetry({
                    instruction: active.instruction,
                    baseVersionId: active.baseVersionId,
                    imageSize: active.imageSize,
                    generationKind: active.generationKind,
                    maskAssetId: active.maskAssetId,
                    constraints: active.constraints,
                  })}
                  className="mt-2 text-xs font-bold text-blue-600"
                >
                  <RefreshCw className="mr-1 inline h-3 w-3" />
                  准备重试
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="border-t p-4">
        <textarea
          value={instruction}
          onChange={event => onInstructionChange(event.target.value)}
          disabled={isGenerating}
          placeholder={`描述对 V${selectedVersionNumber} 的修改`}
          className="h-24 w-full resize-none rounded-xl border p-3 text-sm outline-none focus:border-blue-500"
        />

        <div className="mt-2 flex flex-wrap gap-1.5">
          {constraintOptions.map(option => (
            <button
              type="button"
              key={option.key}
              onClick={() => onConstraintsChange({
                ...constraints,
                [option.key]: !constraints[option.key],
              })}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                constraints[option.key]
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'text-slate-500'
              }`}
            >
              {constraints[option.key]
                ? <Check className="mr-1 inline h-3 w-3" />
                : null}
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-2">
          <button
            type="button"
            onClick={retryInput ? onRetry : onSend}
            disabled={isGenerating || (!retryInput && !instruction.trim())}
            className="flex items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {isGenerating
              ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              : <Send className="mr-2 h-4 w-4" />}
            {retryInput
              ? '重试本轮'
              : `发送修改 · 1K · ${previewCreditCost} 算力点`}
          </button>

          <div className="flex gap-2">
            <select
              aria-label="高清定稿分辨率"
              value={finalSize}
              onChange={event => onFinalSizeChange(event.target.value as '2K' | '4K')}
              className="rounded-xl border px-3 text-xs"
            >
              <option>2K</option>
              <option>4K</option>
            </select>
            <button
              type="button"
              onClick={onFinalize}
              disabled={isGenerating}
              className="flex flex-1 items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              高清定稿 · {finalSize} · {finalCreditCost} 算力点
            </button>
          </div>
          <p className="text-[11px] leading-5 text-slate-500">
            高清定稿会以 V{selectedVersionNumber} 为输入创建新的子版本，不会覆盖原版本。
          </p>
        </div>
      </div>
    </aside>
  );
}

function readStatus(status: string, progress?: number) {
  if (status === 'queued') return '排队中';
  if (status === 'running') return `生成中 ${progress ?? 0}%`;
  if (status === 'succeeded') return '生成成功';
  if (status === 'failed') return '生成失败';
  if (status === 'cancelled') return '已取消';
  if (status === 'timeout') return '已超时';
  return status;
}

function readStatusClassName(status: string) {
  if (status === 'failed' || status === 'cancelled' || status === 'timeout') return 'text-red-600';
  if (status === 'succeeded') return 'text-emerald-600';
  return 'text-blue-600';
}
