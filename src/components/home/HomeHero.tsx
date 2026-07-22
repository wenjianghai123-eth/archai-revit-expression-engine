import { ArrowRight, PlayCircle, Sparkles } from 'lucide-react';
import type { ShowcaseCase } from '../../constants/showcaseCases';
import type { GenerationStep } from '../../types';
import { ShowcaseComparison } from '../showcase/ShowcaseAssets';
import { HomeScenarioActions } from './HomeScenarioActions';

export function HomeHero({
  showcaseCase,
  onStart,
  onStartScenario,
  onOpenDemo,
}: {
  showcaseCase: ShowcaseCase;
  onStart: () => void;
  onStartScenario: (scenarioId: string, step: GenerationStep) => void;
  onOpenDemo?: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-[22px] bg-[#111827] text-white shadow-[0_18px_50px_rgba(17,24,39,0.16)]">
      <div className="grid min-w-0 gap-6 p-5 sm:p-6 lg:min-h-[300px] lg:grid-cols-[minmax(0,7fr)_minmax(360px,5fr)] lg:items-center lg:p-7">
        <div className="min-w-0">
          <div className="flex w-fit items-center gap-2 text-xs font-medium text-blue-200">
            <Sparkles className="h-4 w-4" />
            烛照AI 建筑空间智能表达工作台
          </div>
          <h2 className="mt-4 max-w-2xl text-[28px] font-semibold leading-[1.25] tracking-[-0.03em] sm:text-[34px]">
            把设计意图快速转化为可比较、可修改、可交付的成果
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">选择一个常用场景开始，生成结果可以继续进入方案变体、局部修改、连续编辑和汇报流程。</p>
          <div className="mt-5">
            <HomeScenarioActions onStartScenario={onStartScenario} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={onStart} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[13px] bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/30">
              开始创作
              <ArrowRight className="h-4 w-4" />
            </button>
            {onOpenDemo ? (
              <button type="button" onClick={onOpenDemo} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[13px] border border-white/15 bg-white/[0.07] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
                <PlayCircle className="h-4 w-4" />
                演示项目
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-white/10 bg-white/[0.06] p-2.5">
          <ShowcaseComparison showcaseCase={showcaseCase} loading="eager" />
        </div>
      </div>
    </section>
  );
}
