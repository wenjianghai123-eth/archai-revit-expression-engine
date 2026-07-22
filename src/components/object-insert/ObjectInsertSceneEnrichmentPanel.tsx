import type { ObjectInsertSceneEnrichment, SceneEnrichmentLevel } from '../../types';

const labels: Record<SceneEnrichmentLevel, string> = { few: '少', moderate: '适中', many: '多' };

export function ObjectInsertSceneEnrichmentPanel({ value, onChange }: { value: ObjectInsertSceneEnrichment; onChange: (value: ObjectInsertSceneEnrichment) => void }) {
  return <section className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3"><div><p className="text-xs font-black text-emerald-950">场景丰富</p><p className="mt-1 text-[11px] leading-5 text-emerald-800">数量会进入 object_insert 提示词和结果 metadata，不会转到质感提升。</p></div><div className="mt-3 space-y-3">{([['plants', '绿植'], ['people', '人物'], ['decorations', '装饰']] as const).map(([key, label]) => <div key={key}><div className="mb-1 flex justify-between text-xs font-bold text-slate-700"><span>{label}数量</span><span className="text-emerald-700">{labels[value[key]]}</span></div><div className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1">{(['few', 'moderate', 'many'] as const).map(level => <button key={level} type="button" onClick={() => onChange({ ...value, [key]: level })} className={`rounded-lg px-2 py-1.5 text-xs font-black ${value[key] === level ? 'bg-emerald-600 text-white' : 'text-slate-600'}`}>{labels[level]}</button>)}</div></div>)}</div></section>;
}
