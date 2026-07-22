import { Check, Columns2 } from 'lucide-react';
import type { GenerationResultOption } from '../../types';
import { getOriginalResultImageUrl } from '../../utils/resultImage';

export function DesignVariantComparison({
  results,
  selectedIds,
  onToggle,
}: {
  results: GenerationResultOption[];
  selectedIds: string[];
  onToggle: (resultId: string) => void;
}) {
  const selected = selectedIds.map(id => results.find(result => result.id === id)).filter((result): result is GenerationResultOption => Boolean(result));
  return (
    <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-black text-slate-900"><Columns2 className="h-4 w-4 text-blue-600" />两方案对比</p>
          <p className="mt-0.5 text-[11px] text-slate-500">从结果中选择两项，直接并排检查差异。</p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-blue-700">已选 {selected.length} / 2</span>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {results.map((result, index) => {
          const active = selectedIds.includes(result.id);
          return (
            <button key={result.id} type="button" onClick={() => onToggle(result.id)} className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${active ? 'border-blue-500 bg-blue-600 text-white' : 'border-blue-100 bg-white text-slate-600'}`}>
              {active ? <Check className="mr-1 inline h-3.5 w-3.5" /> : null}
              {result.variantName || result.variantLabel || `方案 ${index + 1}`}
            </button>
          );
        })}
      </div>
      {selected.length === 2 ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {selected.map((result, index) => (
            <article key={result.id} className="overflow-hidden rounded-xl border border-blue-100 bg-white">
              <div className="aspect-video bg-slate-100"><img src={getOriginalResultImageUrl(result, result.imageUrl) || result.imageUrl} alt={result.variantName || `对比方案 ${index + 1}`} className="h-full w-full object-contain" /></div>
              <div className="p-3">
                <p className="text-sm font-black text-slate-900">{result.variantName || result.variantLabel || `方案 ${index + 1}`}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{result.differenceSummary || readMetadataString(result.metadata, 'differenceSummary') || '等待差异摘要'}</p>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function readMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}
