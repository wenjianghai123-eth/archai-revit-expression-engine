import type { StepState } from '../../../types';

interface ResultTabsProps {
  value: StepState['viewMode'];
  hasSource: boolean;
  hasResult: boolean;
  onChange: (value: StepState['viewMode']) => void;
}

const options: Array<{ value: StepState['viewMode']; label: string }> = [
  { value: 'after', label: '结果图' },
  { value: 'original', label: '原图' },
  { value: 'compare', label: '对比' },
  { value: 'overlay', label: '叠加对比' },
];

export function ResultTabs({ value, hasSource, hasResult, onChange }: ResultTabsProps) {
  return (
    <div role="tablist" aria-label="图纸表达结果视图" className="flex min-w-max gap-1 rounded-lg bg-slate-100 p-1">
      {options.map(option => {
        const disabled = option.value === 'original'
          ? !hasSource
          : option.value === 'after'
            ? !hasResult
            : !hasSource || !hasResult;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={value === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`whitespace-nowrap rounded-md px-4 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-35 ${
              value === option.value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
