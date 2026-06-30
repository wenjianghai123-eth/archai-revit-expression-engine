import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckSquare,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileDown,
  FolderKanban,
  ImageIcon,
  Link2,
  Loader2,
  Share2,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import {
  createShareLink,
  GenerationRecord,
  getProject,
  listProjectGenerations,
  Project,
  revokeShareLink,
  ShareLink,
} from '../lib/api';
import { buildResultImageFilename, downloadAsset, downloadFallbackMessage } from '../utils/downloadAsset';
import { formatResultDimensions, getOriginalResultAssetId, getOriginalResultImageUrl } from '../utils/resultImage';
import { AspectRatioImage } from './common/AspectRatioImage';
import { ResultImageTabs } from './ResultImageTabs';

interface ProjectDetailProps {
  projectId: string;
  onBack: () => void;
  onOpenGenerate: () => void;
  onDeleteProject: (projectId: string) => Promise<void>;
}

interface CreatedShareState {
  link: ShareLink;
  url: string;
}

interface ReportOption {
  key: string;
  generation: GenerationRecord;
  imageUrl: string;
  label: string;
}

export function ProjectDetail({ projectId, onBack, onOpenGenerate, onDeleteProject }: ProjectDetailProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [generations, setGenerations] = useState<GenerationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createdShare, setCreatedShare] = useState<CreatedShareState | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [isRevokingShare, setIsRevokingShare] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [selectedReportKeys, setSelectedReportKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let isMounted = true;

    async function loadProject() {
      setIsLoading(true);
      setError(null);

      try {
        const [nextProject, nextGenerations] = await Promise.all([
          getProject(projectId),
          listProjectGenerations(projectId),
        ]);

        if (isMounted) {
          setProject(nextProject);
          setGenerations(nextGenerations);
          setSelectedReportKeys(prev => mergeDefaultReportSelection(prev, nextGenerations));
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : '项目详情加载失败。');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadProject();

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const reportOptions = useMemo(() => buildReportOptions(generations), [generations]);
  const selectedReportOptions = reportOptions.filter(option => selectedReportKeys[option.key]);
  const hasGenerations = generations.length > 0;
  const hasSelectedReportOptions = selectedReportOptions.length > 0;

  const handleCreateShare = async () => {
    setIsCreatingShare(true);
    setShareError(null);
    setShareMessage(null);

    try {
      const result = await createShareLink(projectId);
      setCreatedShare({ link: result.shareLink, url: result.url || `${window.location.origin}/share/${result.shareLink.token}` });
      setShareMessage('分享链接已创建，默认 7 天后过期。');
    } catch (createError) {
      setShareError(createError instanceof Error ? createError.message : '创建分享链接失败。');
    } finally {
      setIsCreatingShare(false);
    }
  };

  const handleCopyShare = async () => {
    if (!createdShare) return;

    try {
      await navigator.clipboard.writeText(createdShare.url);
      setShareMessage('分享链接已复制。');
      setShareError(null);
    } catch {
      setShareError('浏览器暂不允许自动复制，请手动复制链接。');
    }
  };

  const handleRevokeShare = async () => {
    if (!createdShare) return;

    setIsRevokingShare(true);
    setShareError(null);

    try {
      const revoked = await revokeShareLink(projectId, createdShare.link.id);
      setCreatedShare({ ...createdShare, link: revoked });
      setShareMessage('分享链接已撤销。');
    } catch (revokeError) {
      setShareError(revokeError instanceof Error ? revokeError.message : '撤销分享链接失败。');
    } finally {
      setIsRevokingShare(false);
    }
  };

  const handleToggleReportOption = (key: string) => {
    setSelectedReportKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSetAllReportOptions = (isSelected: boolean) => {
    setSelectedReportKeys(Object.fromEntries(reportOptions.map(option => [option.key, isSelected])));
  };

  const handlePrintReport = () => {
    if (!hasSelectedReportOptions) return;
    window.setTimeout(() => window.print(), 50);
  };

  const handleDeleteProject = async () => {
    const confirmed = window.confirm('确定删除该项目吗？删除后项目将从列表中移除，历史生成记录不会在项目列表中显示。');
    if (!confirmed) return;

    setIsDeletingProject(true);
    setError(null);

    try {
      await onDeleteProject(projectId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '项目删除失败。');
      setIsDeletingProject(false);
    }
  };

  return (
    <div className="arch-page">
      <div className="arch-page-inner print-hidden">
        <header className="arch-page-header">
          <button onClick={onBack} className="arch-button-ghost mb-4 flex w-fit items-center gap-2 px-0 hover:bg-transparent">
            <ArrowLeft className="h-4 w-4" />
            返回项目列表
          </button>

          {isLoading ? (
            <div className="flex items-center gap-3 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              正在加载项目详情
            </div>
          ) : error ? (
            <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : project ? (
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-blue-600">
                  <FolderKanban className="h-4 w-4" />
                  Project Detail
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{project.name}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  {project.description || '暂无项目描述。'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="arch-pill">{project.status === 'archived' ? '已归档' : '进行中'}</span>
                  <span className="arch-pill">创建：{formatDate(project.createdAt)}</span>
                  <span className="arch-pill">更新：{formatDate(project.updatedAt)}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={onOpenGenerate} className="arch-button-primary w-fit" disabled={isDeletingProject}>
                  <Sparkles className="h-4 w-4" />
                  进入 AI 生成工作台
                </button>
                <button onClick={() => void handleDeleteProject()} className="arch-button-secondary w-fit text-red-600" disabled={isDeletingProject}>
                  {isDeletingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  删除项目
                </button>
              </div>
            </div>
          ) : null}
        </header>

        <main className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_340px]">
          <section className="arch-card flex min-h-0 flex-col p-4">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">生成记录</h2>
                <p className="mt-1 text-xs text-slate-500">项目内保存的后端生成结果会优先展示在这里。</p>
              </div>
              <span className="arch-pill">{generations.length} 条</span>
            </div>

            {!hasGenerations ? (
              <div className="arch-empty flex-1">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
                  <ImageIcon className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">暂无项目生成记录</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                  从当前项目进入 AI 生成工作台并完成生成后，结果会自动关联到这里。
                </p>
                <button onClick={onOpenGenerate} className="arch-button-primary mt-5">
                  <Sparkles className="h-4 w-4" />
                  开始生成
                </button>
              </div>
            ) : (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                {generations.map(generation => (
                  <GenerationCard
                    key={generation.id}
                    generation={generation}
                    projectName={project?.name || null}
                    selectedReportKeys={selectedReportKeys}
                    onToggleReportOption={handleToggleReportOption}
                  />
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <ReportExportPanel
              reportOptions={reportOptions}
              selectedCount={selectedReportOptions.length}
              onPrint={handlePrintReport}
              onSelectAll={() => handleSetAllReportOptions(true)}
              onSelectNone={() => handleSetAllReportOptions(false)}
            />

            <SharePanel
              createdShare={createdShare}
              shareError={shareError}
              shareMessage={shareMessage}
              isCreatingShare={isCreatingShare}
              isRevokingShare={isRevokingShare}
              onCreateShare={handleCreateShare}
              onCopyShare={handleCopyShare}
              onRevokeShare={handleRevokeShare}
            />

            <div className="arch-card p-4">
              <h2 className="text-base font-bold text-slate-900">项目信息</h2>
              <div className="mt-4 space-y-3 text-sm">
                <InfoRow label="项目 ID" value={project?.id || projectId} />
                <InfoRow label="状态" value={project?.status === 'archived' ? '已归档' : '进行中'} />
                <InfoRow label="封面" value={project?.coverImageUrl || '暂未设置'} />
              </div>
            </div>

            <div className="arch-card p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">版本时间线</h2>
                  <p className="text-xs text-slate-500">后续可扩展为更完整的版本对比。</p>
                </div>
              </div>
            </div>
          </aside>
        </main>
      </div>

      {project ? (
        <ProjectReportPrintView
          project={project}
          reportOptions={selectedReportOptions}
        />
      ) : null}
    </div>
  );
}

function GenerationCard({
  generation,
  projectName,
  selectedReportKeys,
  onToggleReportOption,
}: {
  generation: GenerationRecord;
  projectName?: string | null;
  selectedReportKeys: Record<string, boolean>;
  onToggleReportOption: (key: string) => void;
}) {
  const resultImages = useMemo(() => getResultImages(generation), [generation]);
  const inputImage = generation.inputImageDataPreview || generation.inputImageUrl || null;
  const primaryResult = resultImages.find(result => result.isSelected) || resultImages[0] || null;
  const placementModeLabel = readObjectInsertPlacementModeLabel(primaryResult?.metadata);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);

  const handleDownload = async (key: string, result: { imageUrl: string; assetId?: string; metadata?: Record<string, unknown> }) => {
    if (downloadingKey) return;
    setDownloadingKey(key);
    setDownloadError(null);
    setDownloadMessage(null);
    try {
      const originalImageUrl = getOriginalResultImageUrl(result, result.imageUrl);
      const originalAssetId = getOriginalResultAssetId(result, result.assetId);
      await downloadAsset({
        url: originalImageUrl,
        assetId: originalAssetId,
      }, buildResultImageFilename({
        projectName,
        featureLabel: generation.step === 'object_insert' ? '元素植入' : modeLabel(generation.mode, generation.step),
      }));
      setDownloadMessage('已开始下载');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setDownloadError(message === downloadFallbackMessage ? downloadFallbackMessage : '下载失败，请稍后重试');
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <span className="arch-pill">{modeLabel(generation.mode, generation.step)}</span>
            {generation.step === 'object_insert' && placementModeLabel ? (
              <span className="arch-pill">{placementModeLabel}</span>
            ) : null}
            <span className="arch-pill">{generation.provider}</span>
            <span className="arch-pill">{generation.status === 'succeeded' ? '成功' : '失败'}</span>
          </div>
          <span className="text-xs font-semibold text-slate-400">{formatDate(generation.createdAt)}</span>
        </div>

        <ResultImageTabs
          resultImageUrl={getOriginalResultImageUrl(primaryResult, generation.outputImageUrl || generation.outputImageDataPreview)}
          originalImageUrl={inputImage}
          tabListClassName="mb-3 w-fit"
          tabButtonClassName="px-3"
          frameClassName="rounded-xl shadow-none"
        />

        {resultImages.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {resultImages.map(result => {
              const reportKey = buildReportKey(generation.id, result.id);
              return (
                <div key={result.id} className="relative">
                  <button
                    onClick={() => onToggleReportOption(reportKey)}
                    className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold text-slate-700 shadow-sm"
                  >
                    {selectedReportKeys[reportKey] ? <CheckSquare className="h-3.5 w-3.5 text-blue-600" /> : <Square className="h-3.5 w-3.5" />}
                    导出
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(getOriginalResultImageUrl(result, result.imageUrl) || result.imageUrl, '_blank', 'noopener,noreferrer')}
                    className="absolute right-28 top-2 z-10 flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold text-slate-700 shadow-sm hover:text-blue-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    原图
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownload(reportKey, result)}
                    disabled={Boolean(downloadingKey)}
                    className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold text-slate-700 shadow-sm hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Download className={`h-3.5 w-3.5 ${downloadingKey === reportKey ? 'animate-pulse' : ''}`} />
                    {downloadingKey === reportKey ? '正在下载...' : '保存到本地'}
                  </button>
                  <PreviewImage
                    src={getOriginalResultImageUrl(result, result.imageUrl) || result.imageUrl}
                    sourceImageUrl={inputImage}
                    label={[
                      readObjectInsertPlacementModeLabel(result.metadata) || (result.isFavorite ? '已收藏方案' : result.isSelected ? '当前方案' : '备选方案'),
                      formatResultDimensions(result),
                    ].filter(Boolean).join(' · ')}
                    aspectRatio={generation.step === 'panorama_quick_render' ? '2:1' : '16:9'}
                    featureName={modeLabel(generation.mode, generation.step)}
                    step={generation.step}
                  />
                </div>
              );
            })}
          </div>
        ) : null}
        {downloadMessage ? <p className="text-xs font-semibold text-emerald-700">{downloadMessage}</p> : null}
        {downloadError ? <p className="text-xs font-semibold text-amber-700">{downloadError}</p> : null}

        <div>
          <p className="line-clamp-2 text-sm font-semibold leading-6 text-slate-800">
            {generation.prompt || '未填写提示词'}
          </p>
        </div>
      </div>
    </article>
  );
}

function ReportExportPanel({
  reportOptions,
  selectedCount,
  onPrint,
  onSelectAll,
  onSelectNone,
}: {
  reportOptions: ReportOption[];
  selectedCount: number;
  onPrint: () => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}) {
  return (
    <div className="arch-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">PDF 汇报</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">选择方案后使用浏览器打印或另存为 PDF。</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <FileDown className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
        <div className="flex gap-2">
          <button onClick={onSelectAll} className="text-blue-600 hover:text-blue-700">全选</button>
          <button onClick={onSelectNone} className="text-slate-500 hover:text-slate-700">清空</button>
        </div>
      </div>
      <button onClick={onPrint} disabled={selectedCount === 0} className="arch-button-primary mt-4 w-full">
        <FileDown className="h-4 w-4" />
        导出汇报 PDF
      </button>
    </div>
  );
}

function SharePanel({
  createdShare,
  shareError,
  shareMessage,
  isCreatingShare,
  isRevokingShare,
  onCreateShare,
  onCopyShare,
  onRevokeShare,
}: {
  createdShare: CreatedShareState | null;
  shareError: string | null;
  shareMessage: string | null;
  isCreatingShare: boolean;
  isRevokingShare: boolean;
  onCreateShare: () => void;
  onCopyShare: () => void;
  onRevokeShare: () => void;
}) {
  return (
    <div className="arch-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">客户分享</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">公开预览页只展示项目名称、方案图片和生成时间。</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Share2 className="h-4 w-4" />
        </div>
      </div>

      <button onClick={onCreateShare} disabled={isCreatingShare} className="arch-button-primary mt-4 w-full">
        {isCreatingShare ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
        创建分享链接
      </button>

      {createdShare ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {createdShare.link.revokedAt ? '已撤销' : '可访问'}
          </p>
          <input
            value={createdShare.url}
            readOnly
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
          />
          <p className="mt-2 text-xs text-slate-500">过期时间：{formatDate(createdShare.link.expiresAt)}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button onClick={onCopyShare} className="arch-button-secondary justify-center px-2 text-xs">
              <Copy className="h-4 w-4" />
            </button>
            <a href={createdShare.url} target="_blank" rel="noreferrer" className="arch-button-secondary justify-center px-2 text-xs">
              <ExternalLink className="h-4 w-4" />
            </a>
            <button
              onClick={onRevokeShare}
              disabled={isRevokingShare || Boolean(createdShare.link.revokedAt)}
              className="arch-button-secondary justify-center px-2 text-xs text-red-600 disabled:opacity-50"
            >
              {isRevokingShare ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      ) : null}

      {shareMessage ? <p className="mt-3 text-xs font-semibold text-emerald-600">{shareMessage}</p> : null}
      {shareError ? <p className="mt-3 text-xs font-semibold text-red-600">{shareError}</p> : null}
    </div>
  );
}

function ProjectReportPrintView({ project, reportOptions }: { project: Project; reportOptions: ReportOption[] }) {
  return (
    <section className="pdf-report-print">
      <header className="pdf-report-header">
        <p className="pdf-report-kicker">深圳广田股份有限公司 · 烛照AI 项目表达报告</p>
        <h1>{project.name}</h1>
        <p>{project.description || '暂无项目描述。'}</p>
        <div className="pdf-report-meta">
          <span>导出时间：{formatDate(new Date().toISOString())}</span>
        </div>
      </header>

      {reportOptions.map((option, index) => {
        const generation = option.generation;
        const inputImage = generation.inputImageDataPreview || generation.inputImageUrl || null;
        return (
          <article key={option.key} className="pdf-report-item">
            <div className="pdf-report-item-title">
              <span>方案 {index + 1}</span>
              <span>{modeLabel(generation.mode, generation.step)} · {formatDate(generation.createdAt)}</span>
            </div>
            <div className="pdf-report-images">
              <PrintImage src={option.imageUrl} label={option.label} />
              <PrintImage src={inputImage} label="原图" />
              <PrintImage src={option.imageUrl} label="结果图" />
            </div>
            <div className="pdf-report-prompt">
              <strong>Prompt</strong>
              <p>{generation.prompt || '未填写提示词'}</p>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function PrintImage({ src, label }: { src: string | null; label: string }) {
  return (
    <figure>
      <div className="pdf-report-image-frame">
        {src ? <img src={src} alt={label} referrerPolicy="no-referrer" /> : <span>暂无图片</span>}
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function PreviewImage({
  src,
  sourceImageUrl,
  label,
  aspectRatio,
  featureName,
  step,
}: {
  src: string;
  sourceImageUrl?: string | null;
  label: string;
  aspectRatio?: '16:9' | '2:1' | '1:1';
  featureName?: string;
  step?: string | null;
}) {
  return (
    <figure className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <ResultImageTabs
        resultImageUrl={src}
        originalImageUrl={sourceImageUrl}
        aspectRatio={aspectRatio}
        featureName={featureName}
        step={step}
        frameClassName="rounded-none border-0 shadow-none"
        tabListClassName="m-2 mb-2"
      />
      <figcaption className="border-t border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">{label}</figcaption>
    </figure>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-all text-sm font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function buildReportOptions(generations: GenerationRecord[]): ReportOption[] {
  return generations.flatMap(generation => {
    const images = getResultImages(generation);
    return images.map(image => ({
      key: buildReportKey(generation.id, image.id),
      generation,
      imageUrl: image.imageUrl,
      label: image.isFavorite ? '已收藏方案缩略图' : image.isSelected ? '当前方案缩略图' : '方案缩略图',
    }));
  });
}

function mergeDefaultReportSelection(
  currentSelection: Record<string, boolean>,
  generations: GenerationRecord[],
): Record<string, boolean> {
  const nextSelection: Record<string, boolean> = {};
  for (const option of buildReportOptions(generations)) {
    nextSelection[option.key] = currentSelection[option.key] ?? true;
  }
  return nextSelection;
}

function getResultImages(generation: GenerationRecord): Array<{ id: string; imageUrl: string; assetId?: string; isSelected: boolean; isFavorite: boolean; metadata?: Record<string, unknown> }> {
  if (generation.results && generation.results.length > 0) {
    return generation.results.map(result => ({
      id: result.id,
      imageUrl: getOriginalResultImageUrl(result, result.imageUrl) || result.imageUrl,
      assetId: getOriginalResultAssetId(result, result.assetId) || undefined,
      isSelected: result.isSelected,
      isFavorite: result.isFavorite,
      metadata: result.metadata,
    }));
  }

  const fallbackImage = generation.outputImageUrl || generation.outputImageDataPreview;
  return fallbackImage
    ? [{
        id: generation.id,
        imageUrl: fallbackImage,
        isSelected: true,
        isFavorite: false,
      }]
    : [];
}

function readObjectInsertPlacementModeLabel(metadata: Record<string, unknown> | undefined): string | null {
  const value = typeof metadata?.placementMode === 'string' ? metadata.placementMode : '';
  if (value === 'strict') return '精确摆放';
  if (value === 'natural') return '自然摆放';
  return null;
}

function buildReportKey(generationId: string, resultId: string): string {
  return `${generationId}:${resultId}`;
}

function modeLabel(mode: GenerationRecord['mode'], step?: GenerationRecord['step']): string {
  if (step === 'image_polish') return '质感提升';
  if (step === 'object_insert') return '元素植入';
  if (step === 'free_reference_image') return '自由参考生图';
  if (mode === 'floorplan') return '平面生成';
  if (mode === 'style-render') return '风格渲染';
  if (mode === 'design-variants') return '方案变体';
  if (mode === 'plan-colorize') return '图纸智能表达';
  if (mode === 'panorama-roam-render') return '漫游全景快渲';
  if (mode === 'model-render') return '白模快渲';
  if (mode === 'material-replace') return '材质软装替换';
  if ((mode as string) === 'object-insert') return '元素植入';
  return '局部重绘';
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

