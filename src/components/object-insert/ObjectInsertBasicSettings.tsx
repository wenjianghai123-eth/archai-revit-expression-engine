import { Redo2, Undo2 } from 'lucide-react';
import type { ObjectInsertPlacementMode, ObjectInsertSurface } from '../../types';

export function ObjectInsertBasicSettings({ placementMode, surface, candidateCount, showGuides, canUndo, canRedo, onPlacementMode, onSurface, onCandidateCount, onSnap, onToggleGuides, onUndo, onRedo }: {
  placementMode: ObjectInsertPlacementMode;
  surface: ObjectInsertSurface;
  candidateCount: 1 | 2 | 3;
  showGuides: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onPlacementMode: (value: ObjectInsertPlacementMode) => void;
  onSurface: (value: ObjectInsertSurface) => void;
  onCandidateCount: (value: 1 | 2 | 3) => void;
  onSnap: () => void;
  onToggleGuides: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
    <p className="text-xs font-black text-slate-900">基础设置</p>
    <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-white p-1">{(['natural', 'strict'] as const).map(mode => <button key={mode} type="button" onClick={() => onPlacementMode(mode)} className={`rounded-lg px-2 py-2 text-xs font-black ${placementMode === mode ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>{mode === 'natural' ? '自然摆放' : '精确摆放'}</button>)}</div>
    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2"><select value={surface} onChange={event => onSurface(event.currentTarget.value as ObjectInsertSurface)} className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-slate-700"><option value="auto">自动吸附</option><option value="floor">地面吸附</option><option value="wall">墙面吸附</option><option value="tabletop">桌面吸附</option><option value="ceiling">天花吸附</option><option value="outdoor-ground">室外地面</option></select><button type="button" onClick={onSnap} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-700 ring-1 ring-blue-100">立即吸附</button></div>
    <div className="mt-3"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">生成候选</p><div className="mt-1 grid grid-cols-3 gap-1 rounded-xl bg-white p-1">{([1, 2, 3] as const).map(count => <button key={count} type="button" onClick={() => onCandidateCount(count)} className={`rounded-lg px-2 py-1.5 text-xs font-black ${candidateCount === count ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>{count} 张</button>)}</div></div>
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={onToggleGuides} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${showGuides ? 'bg-cyan-100 text-cyan-800' : 'bg-white text-slate-600'}`}>落地点 / 透视辅助</button><button type="button" disabled={!canUndo} onClick={onUndo} className="rounded-lg bg-white p-1.5 text-slate-600 disabled:opacity-30" aria-label="撤销"><Undo2 className="h-4 w-4" /></button><button type="button" disabled={!canRedo} onClick={onRedo} className="rounded-lg bg-white p-1.5 text-slate-600 disabled:opacity-30" aria-label="重做"><Redo2 className="h-4 w-4" /></button></div>
  </section>;
}
