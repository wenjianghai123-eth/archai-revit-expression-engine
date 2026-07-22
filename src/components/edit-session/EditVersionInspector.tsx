import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArchiveRestore,
  Download,
  Flag,
  GitBranch,
  Save,
  Sparkles,
  Star,
} from 'lucide-react';
import type { AssetVersion, EditSession } from '../../types';

interface EditVersionInspectorProps {
  session: EditSession;
  versions: AssetVersion[];
  selected: AssetVersion;
  parent: AssetVersion | null;
  children: AssetVersion[];
  compareVersionId: string | null;
  disabled?: boolean;
  onCompareVersionChange: (versionId: string | null) => void;
  onMakeCurrent: () => void;
  onSaveMetadata: (input: { displayName?: string | null; note?: string | null }) => Promise<unknown>;
  onMarkPrimary: () => Promise<void>;
  onMarkFinal: () => Promise<void>;
  onRestore: () => Promise<void>;
  onExport: () => Promise<void>;
  onSendToPolish?: () => Promise<void>;
}

export function EditVersionInspector({
  session,
  versions,
  selected,
  parent,
  children,
  compareVersionId,
  disabled,
  onCompareVersionChange,
  onMakeCurrent,
  onSaveMetadata,
  onMarkPrimary,
  onMarkFinal,
  onRestore,
  onExport,
  onSendToPolish,
}: EditVersionInspectorProps) {
  const [displayName, setDisplayName] = useState(selected.displayName || '');
  const [note, setNote] = useState(selected.note || '');
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(selected.displayName || '');
    setNote(selected.note || '');
    setActionError(null);
  }, [selected.id, selected.displayName, selected.note]);

  const runAction = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '操作失败，请重试。');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    await runAction(() => onSaveMetadata({
      displayName: displayName.trim() || null,
      note: note.trim(),
    }));
    setIsSaving(false);
  };

  return (
    <section className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-2xl border bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <StatusPill label={`当前查看 V${selected.versionNumber}`} />
          <StatusPill label={parent ? `父版本 V${parent.versionNumber}` : '原始起点'} />
          <StatusPill
            label={children.length
              ? `${children.length} 个子版本${children.length > 1 ? '（含分支）' : ''}`
              : '暂无子版本'}
          />
          {selected.restoredFromVersionId ? <StatusPill label="恢复副本" /> : null}
          {session.primaryVersionId === selected.id ? <StatusPill label="主方案" accent="blue" /> : null}
          {session.finalVersionId === selected.id ? <StatusPill label="最终方案" accent="amber" /> : null}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">
            对比版本
            <select
              value={compareVersionId || ''}
              onChange={event => onCompareVersionChange(event.target.value || null)}
              className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm font-semibold"
            >
              <option value="">不对比</option>
              {versions
                .filter(version => version.id !== selected.id)
                .map(version => (
                  <option key={version.id} value={version.id}>
                    V{version.versionNumber} · {version.displayName || version.userInstruction || '原图'}
                  </option>
                ))}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <ActionButton
              label="设为当前工作版本"
              disabled={disabled || session.currentVersionId === selected.id}
              onClick={onMakeCurrent}
            />
            <ActionButton
              label="恢复为新版本"
              icon={<ArchiveRestore className="h-3.5 w-3.5" />}
              disabled={disabled}
              onClick={() => void runAction(onRestore)}
            />
          </div>
        </div>

        <p className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-blue-700">
          <GitBranch className="h-3.5 w-3.5" />
          恢复操作会创建一个以 V{selected.versionNumber} 为父版本的新节点，旧版本保持不变。
        </p>
      </div>

      <div className="rounded-2xl border bg-white p-3">
        <input
          value={displayName}
          onChange={event => setDisplayName(event.target.value)}
          placeholder={`V${selected.versionNumber} 名称`}
          className="w-full rounded-xl border px-3 py-2 text-sm font-semibold"
        />
        <textarea
          value={note}
          onChange={event => setNote(event.target.value)}
          placeholder="版本备注"
          className="mt-2 h-16 w-full resize-none rounded-xl border px-3 py-2 text-xs"
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <ActionButton
            label={isSaving ? '保存中…' : '保存名称与备注'}
            icon={<Save className="h-3.5 w-3.5" />}
            disabled={disabled || isSaving}
            onClick={() => void handleSave()}
          />
          <ActionButton
            label="导出版本"
            icon={<Download className="h-3.5 w-3.5" />}
            disabled={disabled}
            onClick={() => void runAction(onExport)}
          />
          <ActionButton
            label="设为主方案"
            icon={<Star className="h-3.5 w-3.5" />}
            disabled={disabled || session.primaryVersionId === selected.id}
            onClick={() => void runAction(onMarkPrimary)}
          />
          <ActionButton
            label="标记最终方案"
            icon={<Flag className="h-3.5 w-3.5" />}
            disabled={disabled || session.finalVersionId === selected.id}
            onClick={() => void runAction(onMarkFinal)}
          />
          {onSendToPolish ? (
            <ActionButton
              label="进入质感提升"
              icon={<Sparkles className="h-3.5 w-3.5" />}
              disabled={disabled}
              onClick={() => void runAction(onSendToPolish)}
            />
          ) : null}
        </div>
        {selected.exportedAt ? (
          <p className="mt-2 text-[11px] font-semibold text-emerald-600">
            已导出：{new Date(selected.exportedAt).toLocaleString('zh-CN')}
          </p>
        ) : null}
        {actionError ? <p className="mt-2 text-xs text-red-600">{actionError}</p> : null}
      </div>
    </section>
  );
}

function StatusPill({
  label,
  accent = 'slate',
}: {
  label: string;
  accent?: 'slate' | 'blue' | 'amber';
}) {
  const className = accent === 'blue'
    ? 'bg-blue-50 text-blue-700'
    : accent === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-white text-slate-600';
  return <span className={`rounded-full border px-2.5 py-1 font-bold ${className}`}>{label}</span>;
}

function ActionButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-9 items-center justify-center gap-1 rounded-lg border bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  );
}
