import { ArrowRight, FolderKanban, Plus } from 'lucide-react';
import { demoImageFallbacks } from '../../constants/demoImageFallbacks';
import { CaseImage } from '../common/CaseImage';
import { formatHomeDate } from './homeData';
import type { RecentProjectSummary } from './homeTypes';

export function ContinueProjectPanel({
  project,
  onContinue,
  onCreateProject,
}: {
  project: RecentProjectSummary | null;
  onContinue: (projectId: string) => void;
  onCreateProject: () => void;
}) {
  return (
    <section className="min-w-0 rounded-[18px] border border-[#E7EAF0] bg-white p-4 sm:p-5" aria-labelledby="continue-project-title">
      <div>
        <h2 id="continue-project-title" className="text-xl font-semibold text-[#111827]">继续最近项目</h2>
        <p className="mt-1 text-sm text-[#667085]">根据最近生成记录恢复项目上下文</p>
      </div>

      {project ? (
        <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-[minmax(220px,42%)_minmax(0,1fr)] sm:items-stretch">
          <CaseImage
            src={project.thumbnail}
            previousUiSrc={demoImageFallbacks.project_cover.previousUiSrc}
            fallbackSrc={demoImageFallbacks.project_cover.fallbackSrc}
            finalFallbackSrc={demoImageFallbacks.project_cover.finalFallbackSrc}
            alt={`${project.name}最近生成或项目封面`}
            className="aspect-video w-full rounded-[14px] border border-[#E7EAF0]"
            isDemoAsset
          />
          <div className="flex min-w-0 flex-col justify-center">
            <p className="text-xs font-medium text-blue-600">当前阶段 · {project.currentStage}</p>
            <h3 className="mt-2 truncate text-lg font-semibold text-[#111827]">{project.name}</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[#667085]">
              <div>
                <span className="block text-slate-400">最后修改</span>
                <strong className="mt-1 block font-medium text-slate-700">{formatHomeDate(project.updatedAt)}</strong>
              </div>
              <div>
                <span className="block text-slate-400">生成结果</span>
                <strong className="mt-1 block font-medium text-slate-700">{project.generationCount} 条</strong>
              </div>
            </div>
            <button type="button" onClick={() => onContinue(project.id)} className="mt-5 inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">
              继续编辑
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex min-h-48 flex-col items-center justify-center rounded-[15px] border border-dashed border-[#D8DEE8] bg-[#F8F9FB] p-6 text-center">
          <FolderKanban className="h-7 w-7 text-slate-300" />
          <h3 className="mt-3 text-sm font-semibold text-[#111827]">暂无可恢复的最近项目</h3>
          <p className="mt-1 max-w-sm text-xs leading-5 text-[#667085]">创建项目或完成一次带项目关联的生成后，可从这里继续。</p>
          <button type="button" onClick={onCreateProject} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#E7EAF0] bg-white px-4 py-2.5 text-sm font-medium text-blue-600 hover:border-blue-200 hover:bg-blue-50">
            <Plus className="h-4 w-4" />
            创建第一个项目
          </button>
        </div>
      )}
    </section>
  );
}
