import {
  ArrowRight,
  Armchair,
  Boxes,
  Images,
  Layers3,
  ScanLine,
  Sparkles,
  UploadCloud,
  WandSparkles,
} from 'lucide-react';
import { HeroSection } from '../components/ui/hero-section-with-smooth-bg-shader';
import { GenerationStep } from '../types';

interface LandingPageProps {
  onStartCreate: (step: GenerationStep) => void;
}

const coreFeatures = [
  {
    title: '平面彩平',
    description: '将平面图快速转化为清晰、美观的彩平表达。',
    step: GenerationStep.FloorplanTo3D,
    icon: ScanLine,
    tone: 'from-teal-500/20 to-cyan-300/10 text-teal-800',
  },
  {
    title: '自由参考生图',
    description: '上传原图与参考图，自由输入提示词生成设计效果。',
    step: GenerationStep.FreeReferenceImage,
    icon: Images,
    tone: 'from-blue-500/20 to-indigo-300/10 text-blue-800',
  },
  {
    title: '材质软装替换',
    description: '快速替换空间材质、软装和氛围风格。',
    step: GenerationStep.MaterialReplace,
    icon: Layers3,
    tone: 'from-amber-500/20 to-orange-300/10 text-amber-900',
  },
  {
    title: '元素植入',
    description: '拖动家具到指定位置，AI 自然融合进原图。',
    step: GenerationStep.ObjectInsert,
    icon: Armchair,
    tone: 'from-rose-500/20 to-pink-300/10 text-rose-900',
  },
  {
    title: '方案变体',
    description: '基于同一方案批量生成不同风格与设计变体。',
    step: GenerationStep.DesignVariants,
    icon: Boxes,
    tone: 'from-violet-500/20 to-fuchsia-300/10 text-violet-900',
  },
] as const;

const workflowSteps = [
  {
    number: '01',
    title: '上传素材',
    description: '上传平面图、参考图、家具图或效果图。',
    icon: UploadCloud,
  },
  {
    number: '02',
    title: '选择功能与参数',
    description: '选择彩平、自由参考生图、材质替换、元素植入或方案变体。',
    icon: Layers3,
  },
  {
    number: '03',
    title: 'AI 生成方案',
    description: '系统根据素材与提示词生成设计效果。',
    icon: WandSparkles,
  },
  {
    number: '04',
    title: '保存与复用',
    description: '保存结果、继续微调，或上传到提示词模板沉淀经验。',
    icon: Sparkles,
  },
] as const;

export function LandingPage({ onStartCreate }: LandingPageProps) {
  const scrollToFeatures = () => {
    document.getElementById('core-features')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-transparent text-slate-950">
      <HeroSection
        onButtonClick={() => onStartCreate(GenerationStep.FloorplanTo3D)}
        onSecondaryButtonClick={scrollToFeatures}
      />

      <main className="relative z-10">
        <section id="core-features" className="scroll-mt-6 px-4 py-20 sm:px-6 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="CORE WORKFLOWS"
              title="为设计表达提速的五个核心能力"
              description="从图纸表达、参考生图到局部调整与方案推演，把高频工作集中在同一个工作台。"
            />

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {coreFeatures.map(({ title, description, step, icon: Icon, tone }) => (
                <button
                  key={title}
                  type="button"
                  onClick={() => onStartCreate(step)}
                  className="group flex min-h-64 flex-col rounded-[28px] border border-white/60 bg-white/52 p-5 text-left shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:bg-white/68 hover:shadow-[0_26px_70px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/80"
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-8 text-lg font-bold tracking-tight text-slate-950">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
                  <span className="mt-auto flex items-center gap-2 pt-7 text-sm font-bold text-slate-900">
                    进入功能
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 lg:pb-28">
          <div className="mx-auto max-w-7xl rounded-[34px] border border-white/55 bg-slate-950/88 px-5 py-14 text-white shadow-[0_28px_90px_rgba(15,23,42,0.22)] backdrop-blur-2xl sm:px-8 lg:px-12">
            <SectionHeading
              eyebrow="HOW IT WORKS"
              title="四步完成一次设计表达"
              description="保留熟悉的设计判断，把重复、耗时的表达工作交给 AI。"
              dark
            />

            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {workflowSteps.map(({ number, title, description, icon: Icon }) => (
                <article key={number} className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.07] p-5">
                  <span className="absolute right-4 top-3 text-4xl font-black tracking-tighter text-white/[0.08]">{number}</span>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-cyan-100">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-7 text-base font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 lg:pb-28">
          <div className="mx-auto flex max-w-5xl flex-col items-center rounded-[34px] border border-white/60 bg-white/48 px-6 py-14 text-center shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:px-10">
            <p className="text-xs font-bold tracking-[0.24em] text-slate-600">READY TO CREATE</p>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">
              让方案更快被看见，也更容易被理解
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              进入 AI 生成工作台，选择一个核心功能，开始完成你的下一张设计表达。
            </p>
            <button
              type="button"
              onClick={() => onStartCreate(GenerationStep.FloorplanTo3D)}
              className="group mt-8 flex min-h-14 items-center justify-center gap-2 rounded-full bg-slate-950 px-8 py-4 text-sm font-bold text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white sm:text-base"
            >
              开始创作
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  dark?: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className={`text-xs font-bold tracking-[0.24em] ${dark ? 'text-cyan-200' : 'text-slate-600'}`}>{eyebrow}</p>
      <h2 className={`mt-4 text-balance text-3xl font-bold tracking-[-0.035em] sm:text-4xl lg:text-5xl ${dark ? 'text-white' : 'text-slate-950'}`}>
        {title}
      </h2>
      <p className={`mx-auto mt-5 max-w-2xl text-pretty text-sm leading-7 sm:text-base ${dark ? 'text-slate-300' : 'text-slate-600'}`}>
        {description}
      </p>
    </div>
  );
}
