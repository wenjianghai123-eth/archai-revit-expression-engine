import { ArrowRight } from 'lucide-react';
import type { FeatureDefinition } from '../../featureRegistry';
import { CaseImage } from '../common/CaseImage';

export function HomeFeatureCard({ feature, onStart }: { feature: FeatureDefinition; onStart: () => void }) {
  const Icon = feature.icon;
  return (
    <button
      type="button"
      onClick={onStart}
      className="group grid min-h-[124px] min-w-0 grid-cols-[108px_minmax(0,1fr)_32px] overflow-hidden rounded-[17px] border border-[#E7EAF0] bg-white text-left transition hover:border-blue-200 hover:bg-blue-50/20 hover:shadow-[0_8px_24px_rgba(17,24,39,0.06)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 sm:grid-cols-[128px_minmax(0,1fr)_36px]"
    >
      <div className="relative h-full min-h-[124px] overflow-hidden border-r border-[#E7EAF0] bg-slate-100">
        <CaseImage
          src={feature.image}
          previousUiSrc={feature.previousUiImage}
          fallbackSrc={feature.fallbackImage}
          finalFallbackSrc={feature.finalFallbackImage}
          alt={feature.imageAlt || `${feature.title}功能示例`}
          className="absolute inset-0 h-full w-full"
          isDemoAsset={Boolean(feature.previousUiImage || feature.fallbackImage || feature.finalFallbackImage)}
        />
        <span className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="min-w-0 self-center px-3 py-4 sm:px-4">
        <h3 className="truncate text-[15px] font-semibold text-[#111827]">{feature.title}</h3>
        <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[#667085]">{feature.desc}</p>
      </div>
      <span className="flex h-full items-center justify-center text-slate-300 transition group-hover:text-blue-600">
        <ArrowRight className="h-4 w-4" />
      </span>
    </button>
  );
}
