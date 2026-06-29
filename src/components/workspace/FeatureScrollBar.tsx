import React, { useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import { FeatureDefinition } from '../../featureRegistry';

interface FeatureScrollBarProps {
  features: FeatureDefinition[];
  activeFeatureId?: string | null;
  onSelectFeature: (feature: FeatureDefinition) => void;
  onAddFeature: () => void;
}

export function FeatureScrollBar({
  features,
  activeFeatureId = null,
  onSelectFeature,
  onAddFeature,
}: FeatureScrollBarProps) {
  const activeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeButtonRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [activeFeatureId]);

  return (
    <div className="relative min-w-0 px-4 pb-3 md:px-5">
      <div className="pointer-events-none absolute bottom-3 left-4 top-0 z-10 w-5 bg-gradient-to-r from-white/70 to-transparent md:left-5" />
      <div className="pointer-events-none absolute bottom-3 right-4 top-0 z-10 w-5 bg-gradient-to-l from-white/70 to-transparent md:right-5" />
      <div className="w-full overflow-x-auto whitespace-nowrap pb-1 custom-scrollbar">
        <div className="flex w-max flex-nowrap items-center gap-2">
          {features.map(feature => {
            const isActive = feature.id === activeFeatureId;
            const Icon = feature.icon;

            return (
              <button
                key={feature.id}
                ref={isActive ? activeButtonRef : undefined}
                type="button"
                onClick={() => onSelectFeature(feature)}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition ${
                  isActive
                    ? 'border-teal-300 bg-teal-50 text-teal-800 shadow-sm shadow-teal-100'
                    : 'border-white/70 bg-white/55 text-slate-600 shadow-sm hover:border-teal-200 hover:bg-white/85 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{feature.title}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onAddFeature}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-teal-300/70 bg-white/45 px-3 text-xs font-medium text-teal-700 shadow-sm transition hover:bg-teal-50 hover:text-teal-900"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>添加功能</span>
          </button>
        </div>
      </div>
    </div>
  );
}
