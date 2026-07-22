import { SlidersHorizontal } from 'lucide-react';
import type { FeatureDefinition } from '../../featureRegistry';
import { HomeFeatureCard } from './HomeFeatureCard';

export function HomeFeatureGrid({
  features,
  onStartFeature,
  onManage,
}: {
  features: FeatureDefinition[];
  onStartFeature: (feature: FeatureDefinition) => void;
  onManage: () => void;
}) {
  return (
    <section aria-labelledby="home-core-features">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="home-core-features" className="text-xl font-semibold text-[#111827]">核心功能</h2>
          <p className="mt-1 text-sm text-[#667085]">从方案生成到精细修改的常用工作流</p>
        </div>
        <button type="button" onClick={onManage} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl px-3 text-sm font-medium text-blue-600 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">
          <SlidersHorizontal className="h-4 w-4" />
          管理首页功能
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {features.map(feature => (
          <HomeFeatureCard key={feature.id} feature={feature} onStart={() => onStartFeature(feature)} />
        ))}
      </div>
    </section>
  );
}
