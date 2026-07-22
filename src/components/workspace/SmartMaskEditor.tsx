import { lazy, useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Sparkles, X } from 'lucide-react';
import { refineImageMask, type RefineMaskResult } from '../../lib/api';
import type { GenerationConfig, UploadedImage } from '../../types';
import { maskHasVisiblePixels } from '../../utils/maskPixels';

const MaskEditor = lazy(() => import('../MaskEditor').then(module => ({ default: module.MaskEditor })));

interface SmartMaskEditorProps {
  inputImage: UploadedImage;
  imageUrl: string;
  maskImageDataUrl: string | null;
  protectionMaskDataUrl: string | null;
  useFullImageMask: boolean;
  config?: GenerationConfig;
  onUpdateMaskImage: (
    maskDataUrl: string | null,
    useFullImage: boolean,
    feather?: number,
    protectionMaskDataUrl?: string | null,
    expansion?: number,
    hasValidMaskPixels?: boolean,
  ) => void;
  onUpdateConfig?: (config: Partial<GenerationConfig>) => void;
}

export function SmartMaskEditor({
  inputImage,
  imageUrl,
  maskImageDataUrl,
  protectionMaskDataUrl,
  useFullImageMask,
  config,
  onUpdateMaskImage,
  onUpdateConfig,
}: SmartMaskEditorProps) {
  const requestRef = useRef<AbortController | null>(null);
  const sourceKeyRef = useRef(inputImage.assetId || imageUrl);
  const updateConfigRef = useRef(onUpdateConfig);
  const [roughMask, setRoughMask] = useState<string | null>(null);
  const [refinement, setRefinement] = useState<RefineMaskResult | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    updateConfigRef.current = onUpdateConfig;
  }, [onUpdateConfig]);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    const nextSourceKey = inputImage.assetId || imageUrl;
    const sourceChanged = sourceKeyRef.current !== nextSourceKey;
    sourceKeyRef.current = nextSourceKey;
    requestRef.current?.abort();
    requestRef.current = null;
    setRoughMask(null);
    setRefinement(null);
    setIsRefining(false);
    setError(null);
    if (sourceChanged) {
      updateConfigRef.current?.({
        smartMaskConfirmed: false,
        smartMaskIsRefining: false,
        smartMaskDetectedObject: undefined,
        smartMaskConfidence: undefined,
        smartMaskRefinementMethod: undefined,
      });
    }
  }, [imageUrl, inputImage.assetId]);

  const handleMaskChange: SmartMaskEditorProps['onUpdateMaskImage'] = (
    nextMask,
    useFullImage,
    feather,
    nextProtectionMask,
    expansion,
    hasValidMaskPixels,
  ) => {
    requestRef.current?.abort();
    setRefinement(null);
    setRoughMask(null);
    setIsRefining(false);
    setError(null);
    onUpdateConfig?.({
      smartMaskConfirmed: false,
      smartMaskIsRefining: false,
      smartMaskDetectedObject: undefined,
      smartMaskConfidence: undefined,
      smartMaskRefinementMethod: undefined,
    });
    onUpdateMaskImage(nextMask, useFullImage, feather, nextProtectionMask, expansion, hasValidMaskPixels);
  };

  const refineMask = async () => {
    if (!maskImageDataUrl || useFullImageMask) {
      setError('请先粗略涂抹需要识别的目标区域。');
      return;
    }

    const imageAssetId = inputImage.assetId;
    const inlineImage = imageUrl.startsWith('data:image/') ? imageUrl : undefined;
    if (!imageAssetId && !inlineImage) {
      setError('原图尚未上传为正式资产，请等待上传完成后再优化 Mask。');
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setIsRefining(true);
    setError(null);
    setRoughMask(maskImageDataUrl);
    setRefinement(null);
    onUpdateConfig?.({ smartMaskConfirmed: false, smartMaskIsRefining: true });

    try {
      const result = await refineImageMask({
        ...(imageAssetId ? { imageAssetId } : { image: inlineImage }),
        roughMask: maskImageDataUrl,
        maskMode: 'smart',
        targetObject: config?.targetObjectType,
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const hasValidPixels = await maskHasVisiblePixels(result.refinedMask);
      if (controller.signal.aborted) return;
      if (!hasValidPixels) {
        setError('智能优化返回了空蒙版，请重新涂抹后再试。');
        return;
      }
      setRefinement(result);
    } catch (refineError) {
      if (controller.signal.aborted) return;
      console.error('[smart-mask] refinement failed', {
        assetId: inputImage.assetId,
        error: refineError,
      });
      setError(refineError instanceof Error ? refineError.message : '智能 Mask 优化失败，请重试或改用精致涂抹。');
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setIsRefining(false);
        onUpdateConfig?.({ smartMaskIsRefining: false });
      }
    }
  };

  const confirmRefinement = () => {
    if (!refinement) return;
    onUpdateMaskImage(
      refinement.refinedMask,
      false,
      config?.feather,
      protectionMaskDataUrl,
      config?.maskExpansion,
      true,
    );
    onUpdateConfig?.({
      smartMaskConfirmed: true,
      smartMaskIsRefining: false,
      smartMaskDetectedObject: refinement.detectedObject,
      smartMaskConfidence: refinement.confidence,
      smartMaskRefinementMethod: refinement.method,
    });
    setRefinement(null);
    setError(null);
  };

  const continueEditing = () => {
    if (!refinement) return;
    onUpdateMaskImage(
      refinement.refinedMask,
      false,
      config?.feather,
      protectionMaskDataUrl,
      config?.maskExpansion,
      true,
    );
    setRefinement(null);
    setRoughMask(null);
    onUpdateConfig?.({ smartMaskConfirmed: false, smartMaskIsRefining: false });
  };

  const cancelSmartMask = () => {
    requestRef.current?.abort();
    if (roughMask) {
      onUpdateMaskImage(roughMask, false, config?.feather, protectionMaskDataUrl, config?.maskExpansion, true);
    }
    setRefinement(null);
    setRoughMask(null);
    setIsRefining(false);
    setError(null);
    onUpdateConfig?.({
      maskSelectionMode: 'precise',
      smartMaskConfirmed: undefined,
      smartMaskIsRefining: false,
      smartMaskDetectedObject: undefined,
      smartMaskConfidence: undefined,
      smartMaskRefinementMethod: undefined,
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="min-h-[360px] flex-1">
        <MaskEditor
          imageDataUrl={imageUrl}
          imageName={inputImage.name}
          maskImageDataUrl={maskImageDataUrl}
          protectionMaskDataUrl={protectionMaskDataUrl}
          useFullImage={useFullImageMask}
          allowFullImage={false}
          onMaskChange={handleMaskChange}
        />
      </div>

      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-black text-slate-800">粗略涂抹后先优化边界</p>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">优化完成后需要确认，不会直接开始生成。</p>
          </div>
          <button
            type="button"
            disabled={!maskImageDataUrl || useFullImageMask || isRefining}
            onClick={() => void refineMask()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isRefining ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isRefining ? '正在识别完整对象…' : 'AI 优化 Mask'}
          </button>
        </div>
        {error ? <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
      </div>

      {roughMask && refinement ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <MaskPreview title="原始粗略 Mask" src={roughMask} />
            <MaskPreview title="AI 优化 Mask" src={refinement.refinedMask} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-slate-500">
              识别对象：{formatDetectedObject(refinement.detectedObject)} · 置信度 {Math.round(refinement.confidence * 100)}%
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={cancelSmartMask} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">
                <X className="h-3.5 w-3.5" />取消智能 Mask
              </button>
              <button type="button" onClick={continueEditing} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700">继续修改优化结果</button>
              <button type="button" onClick={confirmRefinement} className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">
                <Check className="h-3.5 w-3.5" />确认优化区域
              </button>
            </div>
          </div>
        </div>
      ) : config?.smartMaskConfirmed ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
          <span><Check className="mr-1 inline h-4 w-4" />智能 Mask 已确认，可以生成</span>
          <button type="button" onClick={cancelSmartMask} className="rounded-lg bg-white px-2 py-1 text-[10px] text-slate-600">改为手动调整</button>
        </div>
      ) : null}
    </div>
  );
}

function MaskPreview({ title, src }: { title: string; src: string }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
      <figcaption className="bg-white px-3 py-2 text-[10px] font-black text-slate-600">{title}</figcaption>
      <img src={src} alt={title} className="aspect-video w-full object-contain" />
    </figure>
  );
}

function formatDetectedObject(value: string): string {
  const labels: Record<string, string> = {
    sofa: '沙发',
    wall: '墙面',
    floor: '地面',
    ceiling: '天花',
    cabinet: '柜体',
    'table-chair': '桌椅',
    object: '目标对象',
    'selected-region': '选中区域',
  };
  return labels[value] || value;
}
