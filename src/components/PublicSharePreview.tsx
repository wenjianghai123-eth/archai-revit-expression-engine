import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Clock, ImageIcon, Loader2, Lock, Share2 } from 'lucide-react';
import { getPublicShare, PublicShareGeneration, PublicSharePayload } from '../lib/api';
import { PanoramaViewer } from './PanoramaViewer';
import { AspectRatioImage } from './common/AspectRatioImage';

interface PublicSharePreviewProps {
  token: string;
}

export function PublicSharePreview({ token }: PublicSharePreviewProps) {
  const [share, setShare] = useState<PublicSharePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compareGenerationId, setCompareGenerationId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadShare() {
      setIsLoading(true);
      setError(null);

      try {
        const nextShare = await getPublicShare(token);
        if (isMounted) setShare(nextShare);
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : '分享链接不可用。');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadShare();

    return () => {
      isMounted = false;
    };
  }, [token]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-bold shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          正在加载客户预览...
        </div>
      </div>
    );
  }

  if (error || !share) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-950">分享链接不可访问</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {error || '该链接可能已被撤销、已过期，或项目已不存在。'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-blue-600">
                <Share2 className="h-4 w-4" />
                Client Preview
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{share.project.name}</h1>
              {share.project.description ? (
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{share.project.description}</p>
              ) : null}
            </div>
            <div className="flex w-fit items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
              <Clock className="h-4 w-4" />
              链接有效至 {formatDate(share.link.expiresAt)}
            </div>
          </div>
        </header>

        {share.generations.length === 0 ? (
          <section className="flex flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
                <ImageIcon className="h-7 w-7" />
              </div>
              <h2 className="mt-4 text-lg font-bold text-slate-950">暂无可预览方案</h2>
              <p className="mt-2 text-sm text-slate-500">项目生成结果保存后，会出现在客户预览页中。</p>
            </div>
          </section>
        ) : (
          <section className="grid gap-4">
            {share.generations.map(generation => (
              <PublicGenerationCard
                key={generation.id}
                generation={generation}
                isComparing={compareGenerationId === generation.id}
                onToggleCompare={() => setCompareGenerationId(current => current === generation.id ? null : generation.id)}
              />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

function PublicGenerationCard({
  generation,
  isComparing,
  onToggleCompare,
}: {
  generation: PublicShareGeneration;
  isComparing: boolean;
  onToggleCompare: () => void;
}) {
  const resultImages = useMemo(() => getPublicResultImages(generation), [generation]);
  const [panoramaMode, setPanoramaMode] = useState<'360' | 'image'>('360');
  const inputImage = generation.inputImageDataPreview || generation.inputImageUrl || null;
  const primaryResult = resultImages.find(result => result.isSelected) || resultImages[0] || null;
  const isPanorama = generation.mode === 'panorama-roam-render';

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{modeLabel(generation.mode, generation.step)}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              生成时间：{formatDate(generation.createdAt)}
            </span>
          </div>
          {generation.prompt ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{generation.prompt}</p> : null}
        </div>
        <button
          onClick={onToggleCompare}
          disabled={!inputImage || !primaryResult}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          原图 / 结果对比
        </button>
        {isPanorama && primaryResult ? (
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
            <button type="button" onClick={() => setPanoramaMode('360')} className={`rounded-lg px-3 py-2 ${panoramaMode === '360' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}>
              360预览
            </button>
            <button type="button" onClick={() => setPanoramaMode('image')} className={`rounded-lg px-3 py-2 ${panoramaMode === 'image' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}>
              普通图
            </button>
          </div>
        ) : null}
      </div>

      {isPanorama && primaryResult && panoramaMode === '360' ? (
        <PanoramaViewer imageUrl={primaryResult.imageUrl} className="h-[520px] rounded-xl" minHeight={520} />
      ) : isComparing && inputImage && primaryResult ? (
        <div className="grid gap-3 md:grid-cols-2">
          <PreviewImage src={inputImage} label="原图" />
          <PreviewImage src={primaryResult.imageUrl} label="结果图" />
        </div>
      ) : resultImages.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {resultImages.map(result => (
            <PreviewImage key={result.id} src={result.imageUrl} label={result.isSelected ? '当前方案' : '备选方案'} />
          ))}
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-300">
          <AlertCircle className="h-8 w-8" />
        </div>
      )}
    </article>
  );
}

function PreviewImage({ src, label }: { src: string; label: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <AspectRatioImage src={src} alt={label} className="rounded-none border-0 shadow-none" />
      <figcaption className="border-t border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500">{label}</figcaption>
    </figure>
  );
}

function getPublicResultImages(generation: PublicShareGeneration): Array<{ id: string; imageUrl: string; isSelected: boolean }> {
  if (generation.results.length > 0) {
    return generation.results.map(result => ({
      id: result.id,
      imageUrl: result.imageUrl,
      isSelected: result.isSelected,
    }));
  }

  const fallbackImage = generation.outputImageDataPreview || generation.outputImageUrl;
  return fallbackImage ? [{ id: generation.id, imageUrl: fallbackImage, isSelected: true }] : [];
}

function modeLabel(mode: PublicShareGeneration['mode'], step?: PublicShareGeneration['step']): string {
  if (step === 'object_insert') return '元素植入';
  if (step === 'free_reference_image') return '自由参考生图';
  if (mode === 'floorplan') return '平面生成';
  if (mode === 'style-render') return '风格渲染';
  if (mode === 'plan-colorize') return '图纸智能表达';
  if (mode === 'panorama-roam-render') return '漫游全景快渲';
  if (mode === 'model-render') return '白模快渲';
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
