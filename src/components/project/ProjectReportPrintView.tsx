import type { ReactNode } from 'react';
import type { ProjectReportImage, ProjectReportPackage, ProjectReportScheme } from '../../reporting/projectReport';
import { resolveAssetUrl } from '../../utils/assetUrl';

export function ProjectReportPrintView({ report }: { report: ProjectReportPackage }) {
  return (
    <section className="pdf-report-print">
      <ReportCover report={report} />

      <ReportSection title="项目目标">
        <p className="pdf-report-body-copy">{report.project.objective}</p>
        <div className="pdf-report-meta-grid">
          <ReportMeta label="项目状态" value={report.project.status === 'archived' ? '已归档' : '进行中'} />
          <ReportMeta label="候选方案" value={`${report.summary.candidateSchemeCount} 个`} />
          <ReportMeta label="修改记录" value={`${report.summary.modificationCount} 条`} />
          <ReportMeta label="分享状态" value={shareStatusLabel(report.sharing.status)} />
        </div>
        {report.sharing.url ? (
          <div className="pdf-report-share-link">
            <strong>客户分享链接</strong>
            <span>{report.sharing.url}</span>
          </div>
        ) : null}
      </ReportSection>

      {report.primaryScheme ? (
        <ReportSection title="主方案">
          <SchemePrintCard scheme={report.primaryScheme} prominent />
        </ReportSection>
      ) : null}

      {report.candidateSchemes.length ? (
        <ReportSection title="候选方案">
          {report.candidateSchemes.map(scheme => <SchemePrintCard key={scheme.id} scheme={scheme} />)}
        </ReportSection>
      ) : null}

      {report.materialNotes.length ? (
        <ReportSection title="材质说明">
          <div className="pdf-report-note-list">
            {report.materialNotes.map(note => (
              <div key={note.id}>
                <strong>{note.region || '材质配置'}</strong>
                <span>{note.material}</span>
              </div>
            ))}
          </div>
        </ReportSection>
      ) : null}

      {report.modificationHistory.length ? (
        <ReportSection title="修改历史">
          <ol className="pdf-report-history">
            {report.modificationHistory.map((item, index) => (
              <li key={item.id}>
                <span>{index + 1}</span>
                <div>
                  <strong>{item.instruction}</strong>
                  <p>{item.sessionTitle} · {formatDate(item.createdAt)} · {messageStatusLabel(item.status)}</p>
                </div>
              </li>
            ))}
          </ol>
        </ReportSection>
      ) : null}

      <footer className="pdf-report-footer">
        <span>烛照AI 项目汇报包</span>
        <span>数据模型：{report.schemaVersion}</span>
        <span>生成时间：{formatDate(report.generatedAt)}</span>
      </footer>
    </section>
  );
}

function ReportCover({ report }: { report: ProjectReportPackage }) {
  return (
    <header className="pdf-report-cover">
      <div className="pdf-report-cover-copy">
        <p className="pdf-report-kicker">深圳广田股份有限公司 · 烛照AI 项目表达报告</p>
        <h1>{report.project.name}</h1>
        <p>{report.project.objective}</p>
        <div className="pdf-report-meta">
          <span>创建：{formatDate(report.project.createdAt)}</span>
          <span>更新：{formatDate(report.project.updatedAt)}</span>
          <span>导出：{formatDate(report.generatedAt)}</span>
        </div>
      </div>
      <PrintImage image={report.cover} label="项目封面" cover />
    </header>
  );
}

function SchemePrintCard({ scheme, prominent = false }: { scheme: ProjectReportScheme; prominent?: boolean }) {
  return (
    <article className={`pdf-report-item ${prominent ? 'pdf-report-item-primary' : ''}`}>
      <div className="pdf-report-item-title">
        <span>{scheme.title}</span>
        <span>{scheme.feature} · {formatDate(scheme.createdAt)}</span>
      </div>
      <div className="pdf-report-images pdf-report-images-compare">
        <PrintImage image={scheme.sourceImage || null} label="原图" />
        <PrintImage image={scheme.resultImage} label={scheme.isPrimary ? '主方案' : '结果图'} />
      </div>
      <div className="pdf-report-description-grid">
        <div>
          <strong>方案说明</strong>
          <p>{scheme.description}</p>
        </div>
        <div>
          <strong>与原图差异</strong>
          <p>{scheme.differenceSummary || '请结合前后对比图核对方案变化。'}</p>
        </div>
      </div>
      {scheme.materialSummary.length ? (
        <div className="pdf-report-prompt">
          <strong>材质说明</strong>
          <p>{scheme.materialSummary.join('；')}</p>
        </div>
      ) : null}
      {scheme.prompt ? (
        <div className="pdf-report-prompt">
          <strong>生成指令</strong>
          <p>{scheme.prompt}</p>
        </div>
      ) : null}
    </article>
  );
}

function PrintImage({ image, label, cover = false }: { image: ProjectReportImage | null; label: string; cover?: boolean }) {
  const resolvedSrc = resolveAssetUrl(image?.url);
  return (
    <figure className={cover ? 'pdf-report-cover-image' : undefined}>
      <div className="pdf-report-image-frame">
        {resolvedSrc ? <img src={resolvedSrc} alt={label} referrerPolicy="no-referrer" /> : <span>暂无图片</span>}
      </div>
      {!cover ? <figcaption>{label}</figcaption> : null}
    </figure>
  );
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pdf-report-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ReportMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function shareStatusLabel(status: ProjectReportPackage['sharing']['status']): string {
  if (status === 'active') return '已创建';
  if (status === 'revoked') return '已撤销';
  if (status === 'expired') return '已过期';
  return '未创建';
}

function messageStatusLabel(status: string): string {
  if (status === 'succeeded') return '已完成';
  if (status === 'failed' || status === 'cancelled' || status === 'timeout') return '未完成';
  return '处理中';
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
