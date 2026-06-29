import type { ReactNode } from 'react';

export type RelatedFeatureItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
};

type RelatedFeatureChipsProps = {
  title?: string;
  items: RelatedFeatureItem[];
  activeId?: string;
  onSelect: (id: string) => void;
  variant?: 'chips' | 'segmented';
  className?: string;
};

export function RelatedFeatureChips({
  title = '相关功能',
  items,
  activeId,
  onSelect,
  variant = 'chips',
  className = '',
}: RelatedFeatureChipsProps) {
  if (items.length === 0) return null;

  if (variant === 'segmented') {
    return (
      <div className={`overflow-x-auto no-scrollbar ${className}`}>
        <div className="inline-flex max-w-full rounded-2xl border border-white/50 bg-white/45 p-1 shadow-sm backdrop-blur">
          {items.map(item => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                disabled={item.disabled}
                aria-pressed={active}
                className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  active
                    ? 'bg-white text-slate-950 shadow-sm'
                    : 'text-slate-600 hover:bg-white/55 hover:text-slate-950'
                }`}
              >
                {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-2 ${className}`}>
      {title ? <span className="shrink-0 text-xs font-semibold text-slate-500">{title}</span> : null}
      {items.map(item => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            disabled={item.disabled}
            aria-pressed={active}
            className={`inline-flex h-8 min-w-0 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
              active
                ? 'border-cyan-200 bg-cyan-50/90 text-cyan-800 shadow-sm'
                : 'border-slate-200 bg-white/70 text-slate-700 hover:border-cyan-200 hover:bg-white hover:text-cyan-800'
            }`}
          >
            {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
            <span className="whitespace-nowrap">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
