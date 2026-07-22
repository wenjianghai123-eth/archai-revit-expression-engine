import { useEffect, useState } from 'react';
import { ArrowLeftRight, Layers3, X } from 'lucide-react';
import type { ShowcaseCase } from '../../constants/showcaseCases';
import { CaseImage, type CaseImageState } from '../common/CaseImage';

interface ShowcaseImageProps {
  src?: string | null;
  previousUiSrc?: string | null;
  fallbackSrc?: string | null;
  finalFallbackSrc?: string | null;
  alt: string;
  className?: string;
  objectFit?: 'cover' | 'contain';
  loading?: 'eager' | 'lazy';
  isDemoAsset?: boolean;
  onStateChange?: (state: CaseImageState) => void;
}

export function ShowcaseImage(props: ShowcaseImageProps) {
  return <CaseImage {...props} />;
}

export function ShowcaseComparison({
  showcaseCase,
  compact = false,
  loading = 'lazy',
}: {
  showcaseCase: ShowcaseCase;
  compact?: boolean;
  loading?: 'eager' | 'lazy';
}) {
  const [sourceState, setSourceState] = useState<CaseImageState>(pendingImageState);
  const [resultState, setResultState] = useState<CaseImageState>(pendingImageState);

  useEffect(() => {
    setSourceState(pendingImageState);
    setResultState(pendingImageState);
  }, [showcaseCase.id]);

  const sourceFailed = isUnavailableForComparison(sourceState);
  const resultFailed = isUnavailableForComparison(resultState);
  const showSource = !sourceFailed || resultFailed;
  const showResult = !resultFailed || sourceFailed;
  const singleImage = showSource !== showResult;
  const imageClassName = `w-full ${compact ? 'h-24' : 'aspect-[4/3]'}`;

  return (
    <div className={`grid min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white ${singleImage ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {showSource ? (
        <figure className={`min-w-0 ${showResult && !singleImage ? 'border-r border-slate-200' : ''}`}>
          <ShowcaseImage
            src={showcaseCase.sourceImage}
            previousUiSrc={showcaseCase.sourcePreviousUi}
            fallbackSrc={showcaseCase.sourceFallback}
            finalFallbackSrc={showcaseCase.sourceFinalFallback}
            alt={showcaseCase.sourceAlt || `${showcaseCase.title}参考图`}
            className={imageClassName}
            loading={loading}
            isDemoAsset={showcaseCase.fallbackIsDemoAsset}
            onStateChange={setSourceState}
          />
          <figcaption className="px-3 py-2 text-[11px] font-bold text-slate-500">
            {readShowcaseLabel(sourceState, 'source', singleImage)}
          </figcaption>
        </figure>
      ) : null}
      {showResult ? (
        <figure className="min-w-0">
          <ShowcaseImage
            src={showcaseCase.resultImage}
            previousUiSrc={showcaseCase.resultPreviousUi}
            fallbackSrc={showcaseCase.resultFallback}
            finalFallbackSrc={showcaseCase.resultFinalFallback}
            alt={showcaseCase.resultAlt || `${showcaseCase.title}效果图`}
            className={imageClassName}
            loading={loading}
            isDemoAsset={showcaseCase.fallbackIsDemoAsset}
            onStateChange={setResultState}
          />
          <figcaption className="px-3 py-2 text-[11px] font-bold text-slate-700">
            {readShowcaseLabel(resultState, 'result', singleImage)}
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}

type DemoView = 'source' | 'result' | 'compare' | 'versions';

export function ShowcaseDemoDialog({ cases, onClose }: { cases: ShowcaseCase[]; onClose: () => void }) {
  const [activeCaseId, setActiveCaseId] = useState(cases[0]?.id || '');
  const [view, setView] = useState<DemoView>('compare');
  const activeCase = cases.find(item => item.id === activeCaseId) || cases[0];

  if (!activeCase) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6">
      <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-black text-slate-950">演示项目</h2>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-black text-amber-700">预置演示流程 · 不调用真实模型</span>
            </div>
            <p className="mt-2 text-sm text-slate-500">浏览参考图、效果图、方案对比和版本关系；演示素材不会被当作实时生成结果，也不会扣点或写入生成记录。</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200" aria-label="关闭演示项目">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-w-0 gap-0 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="border-b border-slate-100 bg-slate-50 p-3 lg:border-b-0 lg:border-r">
            <p className="px-2 text-[11px] font-black uppercase tracking-widest text-slate-400">演示流程</p>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {cases.map(item => (
                <button key={item.id} type="button" onClick={() => setActiveCaseId(item.id)} className={`min-w-48 rounded-xl border p-3 text-left lg:min-w-0 ${item.id === activeCase.id ? 'border-blue-200 bg-white text-blue-800 shadow-sm' : 'border-transparent text-slate-600 hover:bg-white'}`}>
                  <p className="text-sm font-black">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 opacity-75">{item.description}</p>
                </button>
              ))}
            </div>
          </aside>

          <main className="min-w-0 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-blue-600">{activeCase.scenario}</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">{activeCase.title}</h3>
              </div>
              <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
                {([
                  ['source', '参考图'],
                  ['result', '效果图'],
                  ['compare', '方案对比'],
                  ['versions', '版本查看'],
                ] as const).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setView(id)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${view === id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>{label}</button>
                ))}
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              {view === 'source' ? (
                <ShowcaseImage
                  src={activeCase.sourceImage}
                  previousUiSrc={activeCase.sourcePreviousUi}
                  fallbackSrc={activeCase.sourceFallback}
                  finalFallbackSrc={activeCase.sourceFinalFallback}
                  alt={activeCase.sourceAlt || `${activeCase.title}参考图`}
                  className="min-h-64 max-h-[60vh] w-full"
                  objectFit="contain"
                  isDemoAsset={activeCase.fallbackIsDemoAsset}
                />
              ) : null}
              {view === 'result' ? (
                <ShowcaseImage
                  src={activeCase.resultImage}
                  previousUiSrc={activeCase.resultPreviousUi}
                  fallbackSrc={activeCase.resultFallback}
                  finalFallbackSrc={activeCase.resultFinalFallback}
                  alt={activeCase.resultAlt || `${activeCase.title}效果图`}
                  className="min-h-64 max-h-[60vh] w-full"
                  objectFit="contain"
                  isDemoAsset={activeCase.fallbackIsDemoAsset}
                />
              ) : null}
              {view === 'compare' ? <ShowcaseComparison showcaseCase={activeCase} /> : null}
              {view === 'versions' ? (
                <div className="overflow-x-auto p-4">
                  <div className="flex min-w-max items-center gap-3">
                    <VersionCard
                      label="V0 · 演示参考"
                      image={activeCase.sourceImage}
                      previousUiImage={activeCase.sourcePreviousUi}
                      fallbackImage={activeCase.sourceFallback}
                      finalFallbackImage={activeCase.sourceFinalFallback}
                      alt={activeCase.sourceAlt || `${activeCase.title}参考图`}
                      demo={activeCase.fallbackIsDemoAsset}
                    />
                    <ArrowLeftRight className="h-5 w-5 shrink-0 text-slate-300" />
                    <VersionCard
                      label="V1 · 演示效果"
                      image={activeCase.resultImage}
                      previousUiImage={activeCase.resultPreviousUi}
                      fallbackImage={activeCase.resultFallback}
                      finalFallbackImage={activeCase.resultFinalFallback}
                      alt={activeCase.resultAlt || `${activeCase.title}效果图`}
                      demo={activeCase.fallbackIsDemoAsset}
                      result
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {activeCase.highlights.map(highlight => <span key={highlight} className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{highlight}</span>)}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function VersionCard({
  label,
  image,
  previousUiImage,
  fallbackImage,
  finalFallbackImage,
  alt,
  demo = false,
  result = false,
}: {
  label: string;
  image: string;
  previousUiImage?: string;
  fallbackImage?: string;
  finalFallbackImage?: string;
  alt: string;
  demo?: boolean;
  result?: boolean;
}) {
  return (
    <div className={`w-44 overflow-hidden rounded-xl border bg-white ${result ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'}`}>
      <ShowcaseImage
        src={image}
        previousUiSrc={previousUiImage}
        fallbackSrc={fallbackImage}
        finalFallbackSrc={finalFallbackImage}
        alt={alt}
        className="h-28 w-full"
        isDemoAsset={demo}
      />
      <div className="flex items-center gap-2 p-3 text-xs font-black text-slate-700">
        <Layers3 className="h-3.5 w-3.5 text-blue-500" />
        {label}
      </div>
    </div>
  );
}

function readShowcaseLabel(state: CaseImageState, role: 'source' | 'result', singleImage: boolean): string {
  if (state.assetKind !== 'local') {
    if (singleImage) return '功能示例';
    return role === 'source' ? '演示参考' : '演示效果';
  }
  if (singleImage) return '案例图片';
  return role === 'source' ? '原图' : '案例结果';
}

function isUnavailableForComparison(state: CaseImageState): boolean {
  return state.status === 'failed' || state.assetKind === 'emergency';
}

const pendingImageState: CaseImageState = { status: 'loading', assetKind: 'local' };
