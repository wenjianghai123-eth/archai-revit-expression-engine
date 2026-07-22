import { ArrowRight, Clock3, Image as ImageIcon } from 'lucide-react';
import type { GenerationHistoryItem } from '../../types';
import { getGenerationStepDemoImage } from '../../constants/demoImageFallbacks';
import { CaseImage } from '../common/CaseImage';
import { formatHomeDate, readGenerationStepLabel } from './homeData';

export function RecentGenerationList({
  items,
  onOpenHistory,
}: {
  items: GenerationHistoryItem[];
  onOpenHistory: () => void;
}) {
  const recentItems = items.slice(0, 3);
  return (
    <section className="min-w-0 rounded-[18px] border border-[#E7EAF0] bg-white p-4 sm:p-5" aria-labelledby="recent-generation-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="recent-generation-title" className="text-xl font-semibold text-[#111827]">最近生成</h2>
          <p className="mt-1 text-sm text-[#667085]">最近完成的设计表达</p>
        </div>
        <button type="button" onClick={onOpenHistory} className="min-h-11 shrink-0 rounded-xl px-2 text-xs font-medium text-blue-600 hover:bg-blue-50">查看全部</button>
      </div>

      {recentItems.length ? (
        <div className="mt-3 divide-y divide-[#E7EAF0]">
          {recentItems.map(item => {
            const fallback = getGenerationStepDemoImage(item.step);
            return (
            <button key={item.id} type="button" onClick={onOpenHistory} className="group flex min-h-[76px] w-full min-w-0 items-center gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100">
              <CaseImage
                src={item.outputImage}
                previousUiSrc={fallback.previousUiSrc}
                fallbackSrc={fallback.fallbackSrc}
                finalFallbackSrc={fallback.finalFallbackSrc}
                alt={`${readGenerationStepLabel(item.step)}最近生成结果`}
                className="aspect-[4/3] w-20 shrink-0 rounded-lg border border-[#E7EAF0]"
                isDemoAsset
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#111827]">{readGenerationStepLabel(item.step)}</p>
                <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-[#667085]">
                  <Clock3 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{formatHomeDate(item.createdAt)}</span>
                </div>
              </div>
              <span className="shrink-0 rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">已完成</span>
              <ArrowRight className="hidden h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-blue-600 sm:block" />
            </button>
          );})}
        </div>
      ) : (
        <div className="mt-4 flex min-h-48 flex-col items-center justify-center rounded-[15px] bg-[#F8F9FB] p-6 text-center">
          <ImageIcon className="h-7 w-7 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-[#111827]">还没有生成记录</p>
          <p className="mt-1 text-xs text-[#667085]">完成一次生成后会显示在这里。</p>
        </div>
      )}
    </section>
  );
}
