import React, { useMemo, useState } from 'react';
import { ArrowRight, Box, Clock, Database, History, Layers, Plus, Sparkles, X } from 'lucide-react';
import {
  debugFeatureClick,
  defaultFeatureIds,
  getOptionalFeatures,
  getVisibleFeatures,
  readStoredVisibleFeatureIds,
  writeStoredVisibleFeatureIds,
} from '../featureRegistry';
import { AssetModel, GenerationHistoryItem, GenerationStep, PromptTemplate } from '../types';

interface CreativeHomeProps {
  templates: PromptTemplate[];
  historyItems: GenerationHistoryItem[];
  onStartCreate: (step?: GenerationStep) => void;
  onOpenTemplates: () => void;
  onOpenAssets: () => void;
  onOpenHistory: () => void;
}

const ASSET_STORAGE_KEY = 'archai-model-assets-v1';

export function CreativeHome({ templates, historyItems, onStartCreate, onOpenTemplates, onOpenAssets, onOpenHistory }: CreativeHomeProps) {
  const assets = useMemo(readStoredAssets, []);
  const recommendedTemplates = templates.slice(0, 4);
  const recentItems = historyItems.slice(0, 4);
  const modelAssets = assets.slice(0, 4);
  const [addedFeatureIds, setAddedFeatureIds] = useState<string[]>(() => readStoredVisibleFeatureIds());
  const [isFeaturePickerOpen, setIsFeaturePickerOpen] = useState(false);
  const visibleTools = getVisibleFeatures(addedFeatureIds);
  const optionalTools = getOptionalFeatures();
  const visibleFeatureIdSet = new Set(visibleTools.map(feature => feature.id));

  const handleAddFeature = (featureId: string) => {
    if (defaultFeatureIds.includes(featureId as typeof defaultFeatureIds[number]) || addedFeatureIds.includes(featureId)) return;
    const nextIds = [...addedFeatureIds, featureId];
    setAddedFeatureIds(nextIds);
    writeStoredVisibleFeatureIds(nextIds);
  };

  const handleRemoveFeature = (featureId: string) => {
    if (defaultFeatureIds.includes(featureId as typeof defaultFeatureIds[number])) return;
    const nextIds = addedFeatureIds.filter(id => id !== featureId);
    setAddedFeatureIds(nextIds);
    writeStoredVisibleFeatureIds(nextIds);
  };

  const handleStartFeature = (feature: typeof visibleTools[number]) => {
    debugFeatureClick(feature);
    onStartCreate(feature.step);
  };

  return (
    <div className="arch-page custom-scrollbar" style={{ overflowY: 'auto', padding: 12 }}>
      <div className="mx-auto flex max-w-7xl flex-col gap-3">
        <section className="relative shrink-0 overflow-hidden rounded-2xl bg-slate-950 text-white shadow-xl">
          <img
            src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=1600"
            alt="建筑 AI 创作背景"
            className="absolute inset-0 h-full w-full object-cover opacity-30"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/90 to-slate-950/35" />
          <div className="relative grid gap-3 p-3 lg:grid-cols-[1fr_240px]">
            <div className="flex min-h-[112px] flex-col justify-center">
              <div className="mb-2 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-blue-100">
                <Sparkles className="h-3.5 w-3.5" />
                烛照AI 建筑空间智能表达工作台
              </div>
              <h1 className="max-w-3xl text-2xl font-bold leading-tight tracking-tight md:text-3xl">烛照AI 建筑空间智能表达工作台</h1>
              <p className="mt-2 max-w-2xl text-sm leading-5 text-slate-300">
                面向广田设计业务，支持平面彩平、自由参考生图、材质软装替换、元素植入与方案变体等高频工作流。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => handleStartFeature(visibleTools[0])}
                  className="arch-button-primary"
                >
                  开始创作
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={onOpenTemplates}
                  className="arch-button-secondary border-white/15 bg-white/10 text-white backdrop-blur hover:bg-white/15 hover:text-white"
                >
                  查看模板
                </button>
              </div>
            </div>

            <div className="hidden rounded-xl border border-white/10 bg-white/10 p-2 backdrop-blur-md lg:block">
              <div className="grid gap-2">
                <PreviewCard label="Before" image="https://images.unsplash.com/photo-1600607687644-c7171b42498f?auto=format&fit=crop&q=80&w=800" />
                <PreviewCard label="After" image="https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&q=80&w=800" featured />
              </div>
            </div>
          </div>
        </section>

        <section className="grid shrink-0 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleTools.map((tool) => {
            const Icon = tool.icon;
            const canRemove = !defaultFeatureIds.includes(tool.id as typeof defaultFeatureIds[number]);
            return (
              <article key={tool.id} className="arch-card flex h-full min-h-[300px] flex-col overflow-hidden">
                <div className="relative h-24 shrink-0">
                  <img src={tool.image} alt={tool.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 to-transparent" />
                  <div className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-600 shadow-lg">
                    <Icon className="h-4 w-4" />
                  </div>
                  {canRemove ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveFeature(tool.id)}
                      className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[10px] font-black text-slate-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      隐藏
                    </button>
                  ) : null}
                </div>
                <div className="flex min-h-0 flex-1 flex-col p-3">
                  <h2 className="line-clamp-2 min-h-[40px] text-base font-bold leading-5 text-slate-900">{tool.title}</h2>
                  <p className="mt-1 line-clamp-2 min-h-[40px] text-xs leading-5 text-slate-500">{tool.desc}</p>
                  <div className="mt-2 grid h-9 grid-cols-2 gap-1.5 text-[11px] font-bold text-slate-500">
                    <span className="flex min-w-0 items-center truncate rounded-full bg-slate-50 px-2 py-1" title={tool.input}>{tool.input}</span>
                    <span className="flex min-w-0 items-center truncate rounded-full bg-slate-50 px-2 py-1" title={tool.output}>{tool.output}</span>
                  </div>
                  <button
                    onClick={() => handleStartFeature(tool)}
                    className="arch-button-primary mt-auto h-11 w-full text-xs"
                  >
                    立即使用
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })}
          <button
            type="button"
            onClick={() => setIsFeaturePickerOpen(true)}
            className="flex h-full min-h-[300px] flex-col rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
          >
            <div className="flex h-24 shrink-0 items-center justify-center rounded-xl bg-white/80 text-blue-600">
              <Plus className="h-8 w-8" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col pt-3">
              <h2 className="text-base font-black text-slate-900">+ 添加功能</h2>
              <p className="mt-1 line-clamp-2 min-h-[40px] text-xs leading-5 text-slate-500">从更多功能中选择要固定在首页的入口。</p>
              <span className="mt-auto flex h-11 w-full items-center justify-center rounded-xl bg-white text-xs font-black text-blue-700 shadow-sm">
                更多功能
                <ArrowRight className="ml-2 h-4 w-4" />
              </span>
            </div>
          </button>
        </section>

        {isFeaturePickerOpen ? (
          <FeaturePicker
            optionalTools={optionalTools}
            visibleFeatureIdSet={visibleFeatureIdSet}
            onAddFeature={handleAddFeature}
            onRemoveFeature={handleRemoveFeature}
            onClose={() => setIsFeaturePickerOpen(false)}
          />
        ) : null}

        <section className="grid shrink-0 gap-3 xl:grid-cols-3">
          <HomeModule title="推荐提示词模板" icon={Layers} action="查看全部" onAction={onOpenTemplates}>
            {recommendedTemplates.length > 0 ? (
              recommendedTemplates.slice(0, 3).map((template) => (
                <MiniImageCard key={template.id} image={template.previewImage} title={template.title} meta={template.category} />
              ))
            ) : (
              <EmptyModuleText text="暂无推荐模板。" />
            )}
          </HomeModule>

          <HomeModule title="最近生成记录" icon={History} action="打开历史" onAction={onOpenHistory}>
            {recentItems.length > 0 ? (
              recentItems.slice(0, 3).map((item) => (
                <MiniImageCard key={item.id} image={item.outputImage} title={stepLabel(item.step)} meta={item.createdAt} fallbackIcon={Clock} />
              ))
            ) : (
              <EmptyModuleText text="还没有生成记录，完成一次生成后会显示在这里。" />
            )}
          </HomeModule>

          <HomeModule title="三维模型资产" icon={Database} action="进入资产库" onAction={onOpenAssets}>
            {modelAssets.length > 0 ? (
              modelAssets.slice(0, 3).map((asset) => (
                <MiniImageCard key={asset.id} image={asset.thumbnail} title={asset.name} meta={`${asset.fileType.toUpperCase()} / ${asset.category || '未分类'}`} fallbackIcon={Box} />
              ))
            ) : (
              <EmptyModuleText text="暂无三维模型资产，上传模型后会显示在这里。" />
            )}
          </HomeModule>
        </section>
      </div>
    </div>
  );
}

function FeaturePicker({
  optionalTools,
  visibleFeatureIdSet,
  onAddFeature,
  onRemoveFeature,
  onClose,
}: {
  optionalTools: ReturnType<typeof getOptionalFeatures>;
  visibleFeatureIdSet: Set<string>;
  onAddFeature: (featureId: string) => void;
  onRemoveFeature: (featureId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">更多功能</h2>
            <p className="mt-1 text-xs text-slate-500">默认核心功能会一直保留，其他功能可按需添加到首页。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-3">
          <div className="grid gap-2">
            {optionalTools.map(tool => {
              const Icon = tool.icon;
              const isAdded = visibleFeatureIdSet.has(tool.id);
              return (
                <div key={tool.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-900">{tool.title}</p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{tool.desc}</p>
                  </div>
                  {isAdded ? (
                    <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-600">已添加</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => isAdded ? onRemoveFeature(tool.id) : onAddFeature(tool.id)}
                    className={`h-9 shrink-0 rounded-xl px-3 text-xs font-black transition ${
                      isAdded
                        ? 'bg-white text-slate-500 hover:bg-rose-50 hover:text-rose-600'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isAdded ? '移除' : '添加'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewCard({ label, image, featured = false }: { label: string; image: string; featured?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-xl border ${featured ? 'border-blue-300/40' : 'border-white/10'} bg-white/10`}>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-300">{label}</span>
        {featured && <span className="rounded-full bg-blue-500 px-2 py-1 text-[10px] font-bold text-white">AI Result</span>}
      </div>
      <img src={image} alt={label} className="h-12 w-full object-cover" referrerPolicy="no-referrer" />
    </div>
  );
}

function HomeModule({
  title,
  icon: Icon,
  action,
  onAction,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  action: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="arch-card flex min-h-0 flex-col p-3">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Icon className="h-4 w-4" />
          </div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
        </div>
        <button onClick={onAction} className="text-xs font-bold text-blue-600 hover:text-blue-700">
          {action}
        </button>
      </div>
      <div className="min-h-0 space-y-2">{children}</div>
    </div>
  );
}

function MiniImageCard({
  image,
  title,
  meta,
  fallbackIcon: FallbackIcon,
}: {
  image?: string | null;
  title: string;
  meta: string;
  fallbackIcon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2">
      <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
        {image ? (
          <img src={image} alt={title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : FallbackIcon ? (
          <FallbackIcon className="h-6 w-6 text-slate-300" />
        ) : null}
      </div>
      <div className="min-w-0 py-1">
        <p className="truncate text-sm font-bold text-slate-800">{title}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">{meta}</p>
      </div>
    </div>
  );
}

function EmptyModuleText({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50 p-5 text-sm leading-6 text-slate-500">{text}</div>;
}

function readStoredAssets(): AssetModel[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(ASSET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AssetModel[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stepLabel(step: GenerationStep): string {
  if (step === GenerationStep.FloorplanTo3D) return '平面彩平';
  if (step === GenerationStep.StyleRender) return '风格渲染';
  if (step === GenerationStep.PlanColorize) return '图纸智能表达';
  if (step === GenerationStep.ModelSnapshotRender) return '白模快渲';
  if (step === GenerationStep.PanoramaQuickRender) return '漫游全景快渲';
  if (step === GenerationStep.ObjectInsert) return '元素植入';
  if (step === GenerationStep.FreeReferenceImage) return '自由参考生图';
  if (step === GenerationStep.MaterialReplace) return '材质软装替换';
  if (step === GenerationStep.DesignVariants) return '方案变体';
  return '局部修饰';
}
