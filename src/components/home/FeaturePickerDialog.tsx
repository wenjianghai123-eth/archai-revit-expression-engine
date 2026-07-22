import { Check, Plus, X } from 'lucide-react';
import type { FeatureDefinition } from '../../featureRegistry';
import { CaseImage } from '../common/CaseImage';

export function FeaturePickerDialog({
  features,
  visibleFeatureIds,
  onAdd,
  onRemove,
  onClose,
}: {
  features: FeatureDefinition[];
  visibleFeatureIds: Set<string>;
  onAdd: (featureId: string) => void;
  onRemove: (featureId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="feature-picker-title">
      <div className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-[18px] bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#E7EAF0] px-4 py-4 sm:px-5">
          <div>
            <h2 id="feature-picker-title" className="text-lg font-semibold text-[#111827]">管理首页功能</h2>
            <p className="mt-1 text-xs leading-5 text-[#667085]">默认六个核心功能始终保留，其他功能可以按需添加或移除。</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100" aria-label="关闭功能管理">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto p-3 custom-scrollbar sm:p-4">
          <div className="grid gap-2">
            {features.map(feature => {
              const isAdded = visibleFeatureIds.has(feature.id);
              return (
                <div key={feature.id} className="grid min-w-0 grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 rounded-[15px] border border-[#E7EAF0] p-2.5">
                  <CaseImage
                    src={feature.image}
                    previousUiSrc={feature.previousUiImage}
                    fallbackSrc={feature.fallbackImage}
                    finalFallbackSrc={feature.finalFallbackImage}
                    alt={feature.imageAlt || `${feature.title}功能示例`}
                    className="h-14 w-[72px] rounded-xl"
                    isDemoAsset={Boolean(feature.previousUiImage || feature.fallbackImage || feature.finalFallbackImage)}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#111827]">{feature.title}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-[#667085]">{feature.desc}</p>
                  </div>
                  <button type="button" onClick={() => isAdded ? onRemove(feature.id) : onAdd(feature.id)} className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition ${isAdded ? 'bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                    {isAdded ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    {isAdded ? '移除' : '添加'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
