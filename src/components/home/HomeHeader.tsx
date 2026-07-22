import { Plus } from 'lucide-react';

export function HomeHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#111827] sm:text-[32px]">今天想从哪里开始？</h1>
        <p className="mt-2 text-sm leading-6 text-[#667085]">从图纸、白模或已有方案出发，快速完成设计表达。</p>
      </div>
      <button type="button" onClick={onCreate} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[13px] bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 sm:w-auto">
        <Plus className="h-4 w-4" />
        新建设计任务
      </button>
    </header>
  );
}
