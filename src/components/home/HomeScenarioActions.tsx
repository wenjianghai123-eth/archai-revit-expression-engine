import { ArrowUpRight } from 'lucide-react';
import { scenarioWorkflows } from '../../constants/productWorkflows';
import type { GenerationStep } from '../../types';

const homeScenarioActions = [
  { scenarioId: 'quick-report', label: '快速形成方案' },
  { scenarioId: 'client-iteration', label: '精细修改效果图' },
  { scenarioId: 'multi-option-review', label: '多方案比选与交付' },
] as const;

export function HomeScenarioActions({
  onStartScenario,
}: {
  onStartScenario: (scenarioId: string, step: GenerationStep) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
      {homeScenarioActions.map(action => {
        const scenario = scenarioWorkflows.find(item => item.id === action.scenarioId);
        if (!scenario) return null;
        return (
          <button
            key={action.scenarioId}
            type="button"
            onClick={() => onStartScenario(scenario.id, scenario.entryStep)}
            className="group flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-3 py-2.5 text-left text-xs font-medium text-slate-100 transition hover:border-blue-300/50 hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <span className="truncate">{action.label}</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-blue-300 transition group-hover:text-white" />
          </button>
        );
      })}
    </div>
  );
}
