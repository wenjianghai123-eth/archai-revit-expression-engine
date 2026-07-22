import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Lock, Pencil, Trash2, Unlock } from 'lucide-react';
import type { ReactNode } from 'react';

export interface ObjectInsertLayerView {
  id: string;
  label: string;
  thumbnailUrl?: string;
  visible: boolean;
  locked: boolean;
}

export function ObjectInsertLayerPanel({ items, activeItemId, onSelect, onToggleVisible, onToggleLocked, onMove, onDuplicate, onDelete, onRename }: {
  items: ObjectInsertLayerView[];
  activeItemId: string | null;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string) => void;
}) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-3">
    <div className="flex items-center justify-between"><div><p className="text-xs font-black text-slate-900">图层</p><p className="mt-0.5 text-[10px] font-semibold text-slate-400">从上到下为画布层级</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{items.length} 层</span></div>
    <div className="mt-3 space-y-1.5">{[...items].reverse().map((item, reverseIndex) => {
      const originalIndex = items.length - reverseIndex - 1;
      const active = item.id === activeItemId;
      return <div key={item.id} onClick={() => onSelect(item.id)} className={`grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border p-2 ${active ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}>
        <div className="h-9 overflow-hidden rounded-lg bg-white">{item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className="h-full w-full object-contain" /> : null}</div>
        <span className="truncate text-xs font-bold text-slate-700">{item.label}</span>
        <div className="flex items-center gap-0.5">
          <IconButton label={item.visible ? '隐藏' : '显示'} onClick={() => onToggleVisible(item.id)}>{item.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</IconButton>
          <IconButton label={item.locked ? '解锁' : '锁定'} onClick={() => onToggleLocked(item.id)}>{item.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}</IconButton>
          <IconButton label="上移" disabled={originalIndex === items.length - 1} onClick={() => onMove(item.id, 1)}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
          <IconButton label="下移" disabled={originalIndex === 0} onClick={() => onMove(item.id, -1)}><ArrowDown className="h-3.5 w-3.5" /></IconButton>
          <IconButton label="重命名" onClick={() => onRename(item.id)}><Pencil className="h-3.5 w-3.5" /></IconButton>
          <IconButton label="复制" onClick={() => onDuplicate(item.id)}><Copy className="h-3.5 w-3.5" /></IconButton>
          <IconButton label="删除" danger onClick={() => onDelete(item.id)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
        </div>
      </div>;
    })}</div>
  </section>;
}

function IconButton({ label, children, onClick, disabled = false, danger = false }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={event => { event.stopPropagation(); onClick(); }} className={`rounded-md p-1 disabled:opacity-25 ${danger ? 'text-rose-500 hover:bg-rose-100' : 'text-slate-500 hover:bg-white hover:text-blue-600'}`}>{children}</button>;
}
