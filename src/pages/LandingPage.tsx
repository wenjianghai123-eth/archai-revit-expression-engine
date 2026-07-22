import {
  ArrowRight,
  Layers3,
  Sparkles,
  UploadCloud,
  WandSparkles,
} from 'lucide-react';
import { CaseImage } from '../components/common/CaseImage';
import { ShowcaseComparison } from '../components/showcase/ShowcaseAssets';
import { HeroSection } from '../components/ui/hero-section-with-smooth-bg-shader';
import { scenarioWorkflows, workflowCategories } from '../constants/productWorkflows';
import { showcaseCases } from '../constants/showcaseCases';
import { allFeatures, defaultFeatureIds } from '../featureRegistry';
import { GenerationStep } from '../types';

interface LandingPageProps {
  onEnterHome: () => void;
  onStartCreate: (step: GenerationStep) => void;
  onStartScenario?: (scenarioId: string, step: GenerationStep) => void;
}

const coreFeatures = defaultFeatureIds
  .map(id => allFeatures.find(feature => feature.id === id))
  .filter((feature): feature is (typeof allFeatures)[number] => Boolean(feature));

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

export function LandingPage({ onEnterHome, onStartCreate, onStartScenario }: LandingPageProps) {
  const scrollToFeatures = () => {
    document.getElementById('core-features')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-transparent text-slate-950">
      <HeroSection
        description="面向建筑与室内设计的智能表达工作台，帮助设计师把图纸、白模和设计意图快速转化为可比较、可修改、可汇报、可交付的设计成果。"
        onButtonClick={onEnterHome}
        onSecondaryButtonClick={scrollToFeatures}
      />

      <main className="relative z-10">
        <section className="px-4 pt-20 sm:px-6 lg:pt-28">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="START WITH A SCENARIO"
              title="从真实设计任务开始"
              description="先选择今天要完成的工作，再沿着推荐流程继续修改、比较和交付。"
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {scenarioWorkflows.map(scenario => (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => onStartScenario ? onStartScenario(scenario.id, scenario.entryStep) : onStartCreate(scenario.entryStep)}
                  className="group min-w-0 rounded-3xl border border-white/60 bg-white/52 p-5 text-left shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur-2xl transition hover:-translate-y-1 hover:bg-white/70"
                >
                  <p className="text-xs font-black text-teal-700">使用场景</p>
                  <h2 className="mt-3 text-xl font-black text-slate-950">{scenario.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{scenario.description}</p>
                  <div className="mt-5 flex min-w-0 items-center gap-1 overflow-hidden text-[11px] font-bold text-slate-500">
                    {scenario.steps.map((step, index) => <span key={step} className="contents"><span className="shrink-0">{step}</span>{index < scenario.steps.length - 1 ? <ArrowRight className="h-3 w-3 shrink-0" /> : null}</span>)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section id="core-features" className="scroll-mt-6 px-4 py-20 sm:px-6 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <SectionHeading
              eyebrow="CORE WORKFLOWS"
              title="为设计表达提速的六个核心能力"
              description="功能按快速形成方案、精细修改方案和形成交付成果组织，保留现有能力与操作习惯。"
            />

            <div className="mt-10 grid gap-3 md:grid-cols-3">
              {workflowCategories.map(category => (
                <div key={category} className="rounded-2xl border border-white/60 bg-white/40 p-4 backdrop-blur-xl">
                  <p className="text-sm font-black text-slate-900">{category}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{allFeatures.filter(feature => feature.category === category).map(feature => feature.title).join(' · ')}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {coreFeatures.map(feature => {
                const Icon = feature.icon;
                const nextLabels = (feature.recommendedNextSteps || []).map(id => allFeatures.find(item => item.id === id)?.title || readNextStepLabel(id));
                return (
                <button
                  key={feature.id}
                  type="button"
                  onClick={() => onStartCreate(feature.step)}
                  className="group flex min-h-[430px] min-w-0 flex-col rounded-[28px] border border-white/60 bg-white/52 p-5 text-left shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-2xl transition duration-300 hover:-translate-y-1 hover:bg-white/68 hover:shadow-[0_26px_70px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/80"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-black text-teal-700">{feature.category}</span>
                    <span className="text-[11px] font-bold text-slate-400">{feature.maturity}</span>
                  </div>
                  <CaseImage
                    src={feature.image}
                    previousUiSrc={feature.previousUiImage}
                    fallbackSrc={feature.fallbackImage}
                    finalFallbackSrc={feature.finalFallbackImage}
                    alt={feature.imageAlt || `${feature.title}功能示例`}
                    className="mt-4 h-36 w-full rounded-2xl"
                    loading="lazy"
                    isDemoAsset={Boolean(feature.previousUiImage || feature.fallbackImage || feature.finalFallbackImage)}
                  />
                  <p className="mt-4 text-xs font-bold text-slate-500">适用：{feature.scenarios?.join(' / ')}</p>
                  <div className="mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-300/10 text-teal-800">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold tracking-tight text-slate-950">{feature.title}</h3>
                  <p className="mt-2 text-sm font-bold text-slate-700">{feature.output}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{feature.desc}</p>
                  <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-400">技术输入：{feature.input.replace(/^输入：/, '')}</p>
                  <p className="mt-2 text-[11px] font-bold text-blue-700">推荐下一步：{nextLabels.join(' → ')}</p>
                  <span className="mt-auto flex items-center gap-2 pt-5 text-sm font-bold text-slate-900">
                    进入功能
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </button>
              );})}
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 lg:pb-28">
          <div className="mx-auto grid max-w-7xl items-center gap-8 rounded-[34px] border border-white/60 bg-white/48 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-2xl md:grid-cols-2 sm:p-8">
            <div>
              <p className="text-xs font-black tracking-[0.2em] text-teal-700">CASE SHOWCASE</p>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-950">用案例和功能示例说明工作流</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">真实本地案例优先展示；素材尚未补齐时使用原 UI 演示图片，并明确标注为功能示例。</p>
              <div className="mt-5 flex flex-wrap gap-2">{showcaseCases[0].highlights.map(item => <span key={item} className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-700">{item}</span>)}</div>
            </div>
            <ShowcaseComparison showcaseCase={showcaseCases[0]} />
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
              进入产品首页，选择一个核心功能，再开始完成你的下一张设计表达。
            </p>
            <button
              type="button"
              onClick={onEnterHome}
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

function readNextStepLabel(id: string): string {
  if (id === 'continuous_edit') return '连续修改';
  if (id === 'pdf_report') return 'PDF 汇报';
  if (id === 'download') return '下载';
  if (id === 'share') return '分享';
  return id;
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
