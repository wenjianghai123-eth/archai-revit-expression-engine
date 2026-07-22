import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Minus, Plus } from 'lucide-react';
import type { AssetVersion } from '../types';
import { AspectRatioImage } from './common/AspectRatioImage';

interface VersionTreeProps {
  versions: AssetVersion[];
  selectedVersionId?: string;
  currentVersionId?: string;
  primaryVersionId?: string | null;
  finalVersionId?: string | null;
  onSelect: (versionId: string) => void;
}

interface VersionNode {
  version: AssetVersion;
  children: VersionNode[];
  parentVersionNumber: number | null;
}

export function VersionTree({
  versions,
  selectedVersionId,
  currentVersionId,
  primaryVersionId,
  finalVersionId,
  onSelect,
}: VersionTreeProps) {
  const roots = useMemo(() => buildVersionTree(versions), [versions]);
  const [scale, setScale] = useState(1);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

  const toggleCollapsed = (versionId: string) => {
    setCollapsedIds(previous => {
      const next = new Set(previous);
      if (next.has(versionId)) next.delete(versionId);
      else next.add(versionId);
      return next;
    });
  };

  return (
    <section className="mt-3 rounded-2xl border bg-white p-4" aria-label="版本树">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">版本树</h3>
          <p className="mt-1 text-[11px] text-slate-500">
            分支始终显示在实际父版本下方，点击节点只切换查看版本。
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="缩小版本树"
            onClick={() => setScale(value => Math.max(0.7, value - 0.1))}
            className="rounded-lg border p-2 text-slate-600"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-12 text-center text-[11px] font-bold text-slate-500">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            aria-label="放大版本树"
            onClick={() => setScale(value => Math.min(1.4, value + 0.1))}
            className="rounded-lg border p-2 text-slate-600"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div
          className="flex min-w-max origin-top-left items-start gap-8"
          style={{ transform: `scale(${scale})` }}
        >
          {roots.map(root => (
            <VersionBranch
              key={root.version.id}
              node={root}
              selectedVersionId={selectedVersionId}
              currentVersionId={currentVersionId}
              primaryVersionId={primaryVersionId}
              finalVersionId={finalVersionId}
              collapsedIds={collapsedIds}
              onSelect={onSelect}
              onToggleCollapsed={toggleCollapsed}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function VersionBranch({
  node,
  selectedVersionId,
  currentVersionId,
  primaryVersionId,
  finalVersionId,
  collapsedIds,
  onSelect,
  onToggleCollapsed,
}: {
  node: VersionNode;
  selectedVersionId?: string;
  currentVersionId?: string;
  primaryVersionId?: string | null;
  finalVersionId?: string | null;
  collapsedIds: Set<string>;
  onSelect: (versionId: string) => void;
  onToggleCollapsed: (versionId: string) => void;
}) {
  const version = node.version;
  const isCollapsed = collapsedIds.has(version.id);
  const hasBranches = node.children.length > 1;

  return (
    <div
      className="flex items-start"
      data-version-id={version.id}
      data-parent-version-id={version.parentVersionId || ''}
    >
      <div className="relative w-44 shrink-0">
        <button
          type="button"
          onClick={() => onSelect(version.id)}
          className={`w-full rounded-xl border bg-white p-2 text-left shadow-sm transition ${
            selectedVersionId === version.id
              ? 'border-blue-500 ring-2 ring-blue-100'
              : 'border-slate-200 hover:border-blue-300'
          }`}
        >
          <AspectRatioImage
            src={version.publicUrl}
            alt={`V${version.versionNumber}`}
            ratio="16:9"
            fit="cover"
            enableLightbox={false}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <b>V{version.versionNumber}</b>
            <div className="flex flex-wrap justify-end gap-1">
              {currentVersionId === version.id ? <VersionBadge label="当前" tone="emerald" /> : null}
              {primaryVersionId === version.id ? <VersionBadge label="主方案" tone="blue" /> : null}
              {finalVersionId === version.id ? <VersionBadge label="最终" tone="amber" /> : null}
            </div>
          </div>
          <p
            className="mt-1 truncate text-[11px] font-semibold text-slate-600"
            title={version.displayName || version.userInstruction || '原图'}
          >
            {version.displayName || version.userInstruction || '原图'}
          </p>
          <p className="mt-1 text-[10px] text-slate-400">
            {version.parentVersionId
              ? `父版本 V${node.parentVersionNumber ?? '?'}`
              : '起点'}
            {hasBranches ? ` · ${node.children.length} 个分支` : ''}
          </p>
        </button>

        {node.children.length ? (
          <button
            type="button"
            aria-label={`${isCollapsed ? '展开' : '折叠'} V${version.versionNumber} 分支`}
            onClick={() => onToggleCollapsed(version.id)}
            className="absolute -right-3 -top-3 rounded-full border bg-white p-1 text-slate-500 shadow-sm hover:text-blue-600"
          >
            {isCollapsed
              ? <ChevronRight className="h-3.5 w-3.5" />
              : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </div>

      {!isCollapsed && node.children.length ? (
        <div className="ml-8 flex flex-col gap-4">
          {node.children.map(child => (
            <div
              key={child.version.id}
              className="relative before:absolute before:-left-8 before:top-16 before:w-8 before:border-t-2 before:border-slate-300"
            >
              <VersionBranch
                node={child}
                selectedVersionId={selectedVersionId}
                currentVersionId={currentVersionId}
                primaryVersionId={primaryVersionId}
                finalVersionId={finalVersionId}
                collapsedIds={collapsedIds}
                onSelect={onSelect}
                onToggleCollapsed={onToggleCollapsed}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function VersionBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'blue' | 'emerald' | 'amber';
}) {
  const className = tone === 'blue'
    ? 'bg-blue-50 text-blue-700'
    : tone === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-emerald-50 text-emerald-700';
  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${className}`}>{label}</span>;
}

function buildVersionTree(versions: AssetVersion[]): VersionNode[] {
  const sorted = [...versions].sort((a, b) => (
    a.versionNumber - b.versionNumber || a.createdAt.localeCompare(b.createdAt)
  ));
  const nodes = new Map(sorted.map(version => [
    version.id,
    {
      version,
      children: [] as VersionNode[],
      parentVersionNumber: null,
    },
  ]));
  const roots: VersionNode[] = [];

  for (const version of sorted) {
    const node = nodes.get(version.id);
    if (!node) continue;
    const parent = version.parentVersionId ? nodes.get(version.parentVersionId) : undefined;
    if (parent) {
      node.parentVersionNumber = parent.version.versionNumber;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
