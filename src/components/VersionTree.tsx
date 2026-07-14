import { useMemo } from 'react';
import type { AssetVersion } from '../types';
import { AspectRatioImage } from './common/AspectRatioImage';

interface VersionTreeProps {
  versions: AssetVersion[];
  selectedVersionId?: string;
  currentVersionId?: string;
  onSelect: (versionId: string) => void;
}

interface VersionNode {
  version: AssetVersion;
  children: VersionNode[];
  parentVersionNumber: number | null;
}

export function VersionTree({ versions, selectedVersionId, currentVersionId, onSelect }: VersionTreeProps) {
  const roots = useMemo(() => buildVersionTree(versions), [versions]);

  return (
    <div className="mt-3 overflow-x-auto rounded-2xl border bg-white p-4" aria-label="版本树">
      <div className="flex min-w-max items-start gap-8">
        {roots.map(root => <VersionBranch key={root.version.id} node={root} selectedVersionId={selectedVersionId} currentVersionId={currentVersionId} onSelect={onSelect} />)}
      </div>
    </div>
  );
}

function VersionBranch({ node, selectedVersionId, currentVersionId, onSelect }: { node: VersionNode; selectedVersionId?: string; currentVersionId?: string; onSelect: (versionId: string) => void }) {
  const version = node.version;
  return (
    <div className="flex items-start" data-version-id={version.id} data-parent-version-id={version.parentVersionId || ''}>
      <button type="button" onClick={() => onSelect(version.id)} className={`w-40 shrink-0 rounded-xl border bg-white p-2 text-left shadow-sm transition ${selectedVersionId===version.id?'border-blue-500 ring-2 ring-blue-100':'border-slate-200 hover:border-blue-300'}`}>
        <AspectRatioImage src={version.publicUrl} alt={`V${version.versionNumber}`} ratio="16:9" fit="cover" enableLightbox={false}/>
        <div className="mt-2 flex items-center justify-between"><b>V{version.versionNumber}</b>{currentVersionId===version.id?<span className="text-[10px] font-bold text-emerald-600">当前</span>:null}</div>
        <p className="mt-1 truncate text-[11px] text-slate-500" title={version.userInstruction||'原图'}>{version.userInstruction||'原图'}</p>
        <p className="mt-1 text-[10px] text-slate-400">{version.parentVersionId?`父版本 V${node.parentVersionNumber ?? '?'}`:'起点'}</p>
      </button>
      {node.children.length ? (
        <div className="ml-8 flex flex-col gap-4">
          {node.children.map(child => <div key={child.version.id} className="relative before:absolute before:-left-8 before:top-16 before:w-8 before:border-t-2 before:border-slate-300"><VersionBranch node={child} selectedVersionId={selectedVersionId} currentVersionId={currentVersionId} onSelect={onSelect}/></div>)}
        </div>
      ) : null}
    </div>
  );
}

function buildVersionTree(versions: AssetVersion[]): VersionNode[] {
  const sorted = [...versions].sort((a, b) => a.versionNumber - b.versionNumber || a.createdAt.localeCompare(b.createdAt));
  const nodes = new Map(sorted.map(version => [version.id, { version, children: [] as VersionNode[], parentVersionNumber: null }]));
  const roots: VersionNode[] = [];
  for (const version of sorted) {
    const node = nodes.get(version.id)!;
    const parent = version.parentVersionId ? nodes.get(version.parentVersionId) : undefined;
    if (parent) {
      node.parentVersionNumber = parent.version.versionNumber;
      parent.children.push(node);
    } else roots.push(node);
  }
  return roots;
}
