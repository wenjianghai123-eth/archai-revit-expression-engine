import React, { useMemo } from 'react';
import { ArrowRight, Box, Camera, Clock, Database, FileImage, History, Layers, LayoutGrid, Paintbrush, ScanLine, Sparkles, Wand2 } from 'lucide-react';
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

const toolCards = [
  {
    step: GenerationStep.FloorplanTo3D,
    title: '平面图生成三维彩平',
    desc: '上传黑白平面图，快速生成可用于方案沟通的三维彩平效果。',
    input: '输入：平面图',
    output: '输出：三维彩平',
    icon: ScanLine,
    image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&q=80&w=900',
  },
  {
    step: GenerationStep.PlanColorize,
    title: '图纸智能表达',
    desc: '上传 CAD 导出的黑白平面图，生成彩色分区、标注和表达图。',
    input: '输入：黑白平面图',
    output: '输出：彩色图纸表达',
    icon: FileImage,
    image: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&q=80&w=900',
  },
  {
    step: GenerationStep.StyleRender,
    title: '参考图风格渲染',
    desc: '基于参考图生成现代、侘寂、北欧、轻奢等建筑与室内效果。',
    input: '输入：参考图',
    output: '输出：风格效果图',
    icon: Wand2,
    image: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&q=80&w=900',
  },
  {
    step: GenerationStep.LocalInpainting,
    title: '局部重绘修饰',
    desc: '用画笔、矩形或套索选择局部区域，精修材质、家具和光影。',
    input: '输入：效果图 + mask',
    output: '输出：局部修饰图',
    icon: Paintbrush,
    image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&q=80&w=900',
  },
  {
    step: GenerationStep.ObjectInsert,
    title: '元素植入',
    desc: '上传原始效果图和物体参考图，在画布中拖拽摆放后导出植入示意。',
    input: '输入：效果图 + 物体图',
    output: '输出：preview / mask',
    icon: Layers,
    image: 'https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&q=80&w=900',
  },
  {
    step: GenerationStep.MaterialReplace,
    title: '材质软装替换',
    desc: '选择局部区域，替换地面、墙面、家具、灯光或材质。',
    input: '输入：效果图 + mask + 材质',
    output: '输出：局部替换效果图',
    icon: Layers,
    image: 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&q=80&w=900',
  },
  {
    step: GenerationStep.DesignVariants,
    title: '方案变体',
    desc: '一次生成多种设计方向，快速对比方案',
    input: '输入：原始空间图',
    output: '输出：2 / 4 张方案矩阵',
    icon: LayoutGrid,
    image: 'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&q=80&w=900',
  },
  {
    step: GenerationStep.ModelSnapshotRender,
    title: '白模快渲',
    desc: '上传 3D 白模，选好角度，一键生成效果图',
    input: '输入：GLB / GLTF 白模',
    output: '输出：建筑/室内效果图',
    icon: Box,
    image: 'https://images.unsplash.com/photo-1486718448742-163732cd1544?auto=format&fit=crop&q=80&w=900',
  },
  {
    step: GenerationStep.PanoramaQuickRender,
    title: '漫游全景快渲',
    desc: '上传 GLB / GLTF 模型，漫游查看并捕捉当前全景视点。',
    input: '输入：GLB / GLTF 模型',
    output: '输出：全景视点 payload',
    icon: Camera,
    image: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&q=80&w=900',
  },
];

export function CreativeHome({ templates, historyItems, onStartCreate, onOpenTemplates, onOpenAssets, onOpenHistory }: CreativeHomeProps) {
  const assets = useMemo(readStoredAssets, []);
  const recommendedTemplates = templates.slice(0, 4);
  const recentItems = historyItems.slice(0, 4);
  const modelAssets = assets.slice(0, 4);

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
                面向深圳广田股份有限公司设计业务，支持彩平、白模快渲、风格渲染、局部修饰、材质替换、方案变体与全景表达。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => onStartCreate(GenerationStep.FloorplanTo3D)}
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

        <section className="grid shrink-0 gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {toolCards.map((tool) => {
            const Icon = tool.icon;
            return (
              <article key={tool.step} className="arch-card">
                <div className="relative h-20">
                  <img src={tool.image} alt={tool.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 to-transparent" />
                  <div className="absolute bottom-2 left-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-blue-600 shadow-lg">
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <div className="p-3">
                  <h2 className="text-base font-bold text-slate-900">{tool.title}</h2>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{tool.desc}</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] font-bold text-slate-500">
                    <span className="rounded-full bg-slate-50 px-2 py-1">{tool.input}</span>
                    <span className="rounded-full bg-slate-50 px-2 py-1">{tool.output}</span>
                  </div>
                  <button
                    onClick={() => onStartCreate(tool.step)}
                    className="arch-button-primary mt-2 w-full py-2 text-xs"
                  >
                    立即使用
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </section>

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
  if (step === GenerationStep.FloorplanTo3D) return '平面-三维';
  if (step === GenerationStep.StyleRender) return '风格渲染';
  if (step === GenerationStep.PlanColorize) return '图纸智能表达';
  if (step === GenerationStep.ModelSnapshotRender) return '白模快渲';
  if (step === GenerationStep.PanoramaQuickRender) return '漫游全景快渲';
  if (step === GenerationStep.ObjectInsert) return '元素植入';
  return '局部修饰';
}
