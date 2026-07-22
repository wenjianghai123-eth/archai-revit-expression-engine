import { ArrowLeft, Clock, FileDown, Flag, GitBranch, Share2, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import type { EditSessionDetail } from '../../lib/api';
import type { DesignWorkflowDetail } from '../../types';
import { designWorkflowStages } from '../../constants/designWorkflow';
import { AspectRatioImage } from '../common/AspectRatioImage';

interface ProjectDeliveryOverviewProps {
  editSessions: EditSessionDetail[];
  customerShareStatus: 'not-created' | 'active' | 'revoked';
  selectedReportCount: number;
  reportOptionCount: number;
  reportExportedAt?: string | null;
  designWorkflow?: DesignWorkflowDetail | null;
  onBackDesignWorkflow?: () => void;
  onOpenSession: (sessionId: string) => void;
}

export function ProjectDeliveryOverview({
  editSessions,
  customerShareStatus,
  selectedReportCount,
  reportOptionCount,
  reportExportedAt,
  designWorkflow,
  onBackDesignWorkflow,
  onOpenSession,
}: ProjectDeliveryOverviewProps) {
  const primaryVersions = editSessions.flatMap(detail => {
    const version = detail.versions.find(item => item.id === detail.session.primaryVersionId);
    return version ? [{ detail, version }] : [];
  });
  const candidateVersions = editSessions.flatMap(detail => (
    detail.versions
      .filter(version => (
        version.versionNumber > 0
        && version.id !== detail.session.primaryVersionId
        && version.id !== detail.session.finalVersionId
      ))
      .map(version => ({ detail, version }))
  ));
  const modificationCount = editSessions.reduce(
    (sum, detail) => sum + detail.messages.filter(message => message.role === 'user').length,
    0,
  );
  const recentModifications = editSessions
    .flatMap(detail => detail.messages
      .filter(message => message.role === 'user')
      .map(message => ({ detail, message })))
    .sort((a, b) => b.message.createdAt.localeCompare(a.message.createdAt))
    .slice(0, 6);
  const currentWorkflowNode = designWorkflow?.nodes.find(
    node => node.id === designWorkflow.workflow.currentNodeId,
  );

  return (
    <section className="arch-card mb-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">方案交付闭环</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            汇总主方案、候选方案、连续修改历史、客户分享与汇报导出状态。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {currentWorkflowNode?.parentNodeId && onBackDesignWorkflow ? (
            <button
              type="button"
              onClick={onBackDesignWorkflow}
              className="arch-button-secondary px-3 py-2 text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              返回上一流程步骤
            </button>
          ) : null}
          <span className="arch-pill">{editSessions.length} 个连续修改会话</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <DeliveryMetric
          icon={<GitBranch className="h-4 w-4" />}
          label="设计表达流程"
          value={readWorkflowStage(designWorkflow)}
        />
        <DeliveryMetric
          icon={<Star className="h-4 w-4" />}
          label="主方案"
          value={primaryVersions.length ? `${primaryVersions.length} 个` : '未设置'}
        />
        <DeliveryMetric
          icon={<GitBranch className="h-4 w-4" />}
          label="候选方案"
          value={`${candidateVersions.length} 个`}
        />
        <DeliveryMetric
          icon={<Clock className="h-4 w-4" />}
          label="修改历史"
          value={`${modificationCount} 轮`}
        />
        <DeliveryMetric
          icon={<Share2 className="h-4 w-4" />}
          label="客户分享状态"
          value={readShareStatus(customerShareStatus)}
        />
        <DeliveryMetric
          icon={<FileDown className="h-4 w-4" />}
          label="汇报导出状态"
          value={reportExportedAt
            ? `已导出 ${new Date(reportExportedAt).toLocaleDateString('zh-CN')}`
            : reportOptionCount
              ? `待导出 · 已选择 ${selectedReportCount}/${reportOptionCount}`
              : '暂无方案'}
        />
      </div>

      {primaryVersions.length ? (
        <div className="mt-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Flag className="h-4 w-4 text-blue-600" />
            主方案
          </h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {primaryVersions.map(({ detail, version }) => (
              <button
                type="button"
                key={version.id}
                onClick={() => onOpenSession(detail.session.id)}
                className="rounded-2xl border bg-slate-50 p-2 text-left hover:border-blue-300"
              >
                <AspectRatioImage
                  src={version.publicUrl}
                  alt={version.displayName || `V${version.versionNumber}`}
                  ratio="16:9"
                  fit="cover"
                  enableLightbox={false}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    {version.displayName || `V${version.versionNumber}`}
                  </span>
                  {detail.session.finalVersionId === version.id ? (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                      最终方案
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-[11px] text-slate-500">{detail.session.title}</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
          尚未设置主方案。进入连续修改会话后，可在任意版本上点击“设为主方案”。
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800">候选方案</h3>
          {candidateVersions.length ? (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {candidateVersions.slice(0, 6).map(({ detail, version }) => (
                <button
                  type="button"
                  key={version.id}
                  onClick={() => onOpenSession(detail.session.id)}
                  className="rounded-xl border bg-white p-2 text-left hover:border-blue-300"
                >
                  <AspectRatioImage
                    src={version.publicUrl}
                    alt={version.displayName || `V${version.versionNumber}`}
                    ratio="16:9"
                    fit="cover"
                    enableLightbox={false}
                  />
                  <p className="mt-1 truncate text-[11px] font-bold text-slate-700">
                    V{version.versionNumber} · {version.displayName || version.userInstruction || '候选方案'}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-500">
              暂无候选方案。
            </p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-bold text-slate-800">修改历史</h3>
          {recentModifications.length ? (
            <div className="mt-2 space-y-2">
              {recentModifications.map(({ detail, message }) => (
                <button
                  type="button"
                  key={message.id}
                  onClick={() => onOpenSession(detail.session.id)}
                  className="flex w-full items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-700">{message.content}</p>
                    <p className="mt-1 truncate text-[10px] text-slate-400">{detail.session.title}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold text-slate-500">
                    {readMessageStatus(message.status)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-500">
              暂无连续修改记录。
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function DeliveryMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-blue-600">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {label}
        </span>
      </div>
      <p className="mt-2 text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

function readShareStatus(status: ProjectDeliveryOverviewProps['customerShareStatus']) {
  if (status === 'active') return '已分享';
  if (status === 'revoked') return '已撤销';
  return '未创建';
}

function readMessageStatus(status: string) {
  if (status === 'succeeded') return '已完成';
  if (status === 'failed' || status === 'cancelled' || status === 'timeout') return '失败';
  return '处理中';
}

function readWorkflowStage(detail: DesignWorkflowDetail | null | undefined) {
  if (!detail) return '未开始';
  const current = detail.nodes.find(node => node.id === detail.workflow.currentNodeId);
  return designWorkflowStages.find(stage => stage.key === current?.stageKey)?.label || '未开始';
}
