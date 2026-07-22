import { lazy, useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, Redo2, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { refineImageMask, type RefineMaskResult } from '../../lib/api';
import type { GenerationConfig, SmartMaskStage, UploadedImage } from '../../types';
import { maskHasVisiblePixels } from '../../utils/maskPixels';
import type { MaskEditorExternalCommand } from '../MaskEditor';

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
  onConfirmRefinedMask?: (result: RefineMaskResult) => void;
  onCancelEditing?: () => void;
}

type SmartMaskCommand = MaskEditorExternalCommand['type'];

const stageLabels: Record<SmartMaskStage, string> = {
  idle: '等待开始',
  'rough-marking': '粗略涂抹',
  'ready-to-segment': '可开始识别',
  segmenting: '识别中…',
  reviewing: '检查识别区域',
  confirmed: '已确认区域',
  error: '识别失败',
};

const stageHints: Record<SmartMaskStage, string> = {
  idle: '步骤1：粗略涂抹目标；步骤2：点击“开始智能识别”；步骤3：检查并确认识别区域。',
  'rough-marking': '步骤1：请先用画笔粗略涂抹目标区域。',
  'ready-to-segment': '步骤2：已检测到粗略涂抹，可以点击“开始智能识别”。',
  segmenting: '正在根据原图和粗略涂抹识别完整对象边界。',
  reviewing: '智能识别已完成，请检查选区后确认。',
  confirmed: '智能涂抹区域已确认，可以继续生成。',
  error: '识别失败，粗略涂抹已保留，可以重新识别或继续调整。',
};

export function SmartMaskEditor({
  inputImage,
  imageUrl,
  maskImageDataUrl,
  protectionMaskDataUrl,
  useFullImageMask,
  config,
  onUpdateMaskImage,
  onUpdateConfig,
  onConfirmRefinedMask,
  onCancelEditing,
}: SmartMaskEditorProps) {
  const requestRef = useRef<AbortController | null>(null);
  const sourceKeyRef = useRef(inputImage.assetId || imageUrl);
  const updateConfigRef = useRef(onUpdateConfig);
  const commandIdRef = useRef(0);
  const [roughMask, setRoughMask] = useState<string | null>(null);
  const [roughMaskHasPixels, setRoughMaskHasPixels] = useState(Boolean(maskImageDataUrl && !useFullImageMask));
  const [refinement, setRefinement] = useState<RefineMaskResult | null>(null);
  const [editableRefinement, setEditableRefinement] = useState<RefineMaskResult | null>(null);
  const [stage, setStage] = useState<SmartMaskStage>(() => readInitialStage(config, Boolean(maskImageDataUrl && !useFullImageMask)));
  const [editorCommand, setEditorCommand] = useState<MaskEditorExternalCommand | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isRefining = stage === 'segmenting';
  const hasRoughMask = Boolean(maskImageDataUrl && !useFullImageMask && roughMaskHasPixels);
  const canStartSegmentation = hasRoughMask && !isRefining;

  useEffect(() => {
    updateConfigRef.current = onUpdateConfig;
  }, [onUpdateConfig]);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    if (config?.smartMaskStage && config.smartMaskStage !== stage) {
      setStage(config.smartMaskStage);
    }
  }, [config?.smartMaskStage, stage]);

  useEffect(() => {
    const nextSourceKey = inputImage.assetId || imageUrl;
    const sourceChanged = sourceKeyRef.current !== nextSourceKey;
    sourceKeyRef.current = nextSourceKey;
    requestRef.current?.abort();
    requestRef.current = null;
    setRoughMask(null);
    setRoughMaskHasPixels(Boolean(maskImageDataUrl && !useFullImageMask));
    setRefinement(null);
    setEditableRefinement(null);
    setError(null);
    if (sourceChanged) {
      updateSmartStage('rough-marking', {
        smartMaskConfirmed: false,
        smartMaskIsRefining: false,
        smartMaskDetectedObject: undefined,
        smartMaskConfidence: undefined,
        smartMaskRefinementMethod: undefined,
      });
    }
    // Source changes should reset local state only; stage updates are handled by the explicit calls above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, inputImage.assetId]);

  const updateSmartStage = (nextStage: SmartMaskStage, patch: Partial<GenerationConfig> = {}) => {
    setStage(nextStage);
    onUpdateConfig?.({
      maskWorkflowMode: 'smart',
      maskWorkflowActive: true,
      smartMaskStage: nextStage,
      ...patch,
    });
  };

  const handleMaskChange: SmartMaskEditorProps['onUpdateMaskImage'] = (
    nextMask,
    useFullImage,
    feather,
    nextProtectionMask,
    expansion,
    hasValidMaskPixels,
  ) => {
    const isAdjustingRefinedMask = editableRefinement !== null && refinement === null;
    const nextHasPixels = Boolean(nextMask && !useFullImage && (hasValidMaskPixels ?? true));
    requestRef.current?.abort();
    requestRef.current = null;
    setRefinement(null);
    if (!isAdjustingRefinedMask) setEditableRefinement(null);
    setRoughMask(null);
    setRoughMaskHasPixels(nextHasPixels);
    setError(null);
    updateSmartStage(nextHasPixels ? 'ready-to-segment' : 'rough-marking', {
      smartMaskConfirmed: false,
      smartMaskIsRefining: false,
      smartMaskDetectedObject: isAdjustingRefinedMask ? editableRefinement?.detectedObject : undefined,
      smartMaskConfidence: isAdjustingRefinedMask ? editableRefinement?.confidence : undefined,
      smartMaskRefinementMethod: isAdjustingRefinedMask ? editableRefinement?.method : undefined,
    });
    onUpdateMaskImage(nextMask, useFullImage, feather, nextProtectionMask, expansion, hasValidMaskPixels);
  };

  const runEditorCommand = (type: SmartMaskCommand) => {
    commandIdRef.current += 1;
    setEditorCommand({ id: commandIdRef.current, type });
    if (type === 'clear') {
      requestRef.current?.abort();
      requestRef.current = null;
      setRoughMask(null);
      setRefinement(null);
      setEditableRefinement(null);
      setRoughMaskHasPixels(false);
      setError(null);
      updateSmartStage('rough-marking', {
        smartMaskConfirmed: false,
        smartMaskIsRefining: false,
        smartMaskDetectedObject: undefined,
        smartMaskConfidence: undefined,
        smartMaskRefinementMethod: undefined,
      });
      onUpdateMaskImage(null, false, config?.feather, protectionMaskDataUrl, config?.maskExpansion, false);
    }
  };

  const refineMask = async () => {
    if (!canStartSegmentation || !maskImageDataUrl) {
      setError('请先粗略涂抹需要识别的目标区域。');
      updateSmartStage('error', {
        smartMaskConfirmed: false,
        smartMaskIsRefining: false,
      });
      return;
    }

    const imageAssetId = inputImage.assetId;
    const inlineImage = imageUrl.startsWith('data:image/') ? imageUrl : undefined;
    if (!imageAssetId && !inlineImage) {
      setError('原图尚未上传为正式资产，请等待上传完成后再开始智能识别。');
      updateSmartStage('error', {
        smartMaskConfirmed: false,
        smartMaskIsRefining: false,
      });
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setError(null);
    setRoughMask(maskImageDataUrl);
    setRefinement(null);
    setEditableRefinement(null);
    updateSmartStage('segmenting', {
      smartMaskConfirmed: false,
      smartMaskIsRefining: true,
    });

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
        setError('智能识别返回了空蒙版，请重新涂抹后再试。');
        updateSmartStage('error', {
          smartMaskConfirmed: false,
          smartMaskIsRefining: false,
        });
        return;
      }
      setRefinement(result);
      setEditableRefinement(result);
      updateSmartStage('reviewing', {
        smartMaskConfirmed: false,
        smartMaskIsRefining: false,
        smartMaskDetectedObject: result.detectedObject,
        smartMaskConfidence: result.confidence,
        smartMaskRefinementMethod: result.method,
      });
    } catch (refineError) {
      if (controller.signal.aborted) return;
      console.error('[smart-mask] refinement failed', {
        assetId: inputImage.assetId,
        error: refineError,
      });
      setError(refineError instanceof Error ? refineError.message : '智能 Mask 识别失败，请重试或改用精致涂抹。');
      updateSmartStage('error', {
        smartMaskConfirmed: false,
        smartMaskIsRefining: false,
      });
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
      }
    }
  };

  const confirmRefinement = () => {
    if (!refinement) return;
    updateSmartStage('confirmed', {
      smartMaskConfirmed: true,
      smartMaskIsRefining: false,
      smartMaskDetectedObject: refinement.detectedObject,
      smartMaskConfidence: refinement.confidence,
      smartMaskRefinementMethod: refinement.method,
    });
    if (onConfirmRefinedMask) {
      onConfirmRefinedMask(refinement);
    } else {
      onUpdateMaskImage(
        refinement.refinedMask,
        false,
        config?.feather,
        protectionMaskDataUrl,
        config?.maskExpansion,
        true,
      );
    }
    setRefinement(null);
    setEditableRefinement(null);
    setRoughMask(null);
    setRoughMaskHasPixels(true);
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
    setRoughMaskHasPixels(true);
    updateSmartStage('ready-to-segment', {
      smartMaskConfirmed: false,
      smartMaskIsRefining: false,
    });
  };

  const confirmEditedRefinement = () => {
    if (!maskImageDataUrl || !editableRefinement) return;
    const nextRefinement = {
      ...editableRefinement,
      refinedMask: maskImageDataUrl,
    };
    updateSmartStage('confirmed', {
      smartMaskConfirmed: true,
      smartMaskIsRefining: false,
      smartMaskDetectedObject: nextRefinement.detectedObject,
      smartMaskConfidence: nextRefinement.confidence,
      smartMaskRefinementMethod: nextRefinement.method,
    });
    if (onConfirmRefinedMask) {
      onConfirmRefinedMask(nextRefinement);
    } else {
      onUpdateMaskImage(nextRefinement.refinedMask, false, config?.feather, protectionMaskDataUrl, config?.maskExpansion, true);
    }
    setEditableRefinement(null);
    setRefinement(null);
    setRoughMask(null);
    setRoughMaskHasPixels(true);
    setError(null);
  };

  const cancelSmartMask = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    setRefinement(null);
    setEditableRefinement(null);
    setRoughMask(null);
    setError(null);
    updateSmartStage('idle', {
      maskWorkflowMode: 'none',
      maskWorkflowActive: false,
      smartMaskConfirmed: undefined,
      smartMaskIsRefining: false,
      smartMaskDetectedObject: undefined,
      smartMaskConfidence: undefined,
      smartMaskRefinementMethod: undefined,
    });
    onCancelEditing?.();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        data-testid="smart-mask-workflow-toolbar"
        className="sticky top-0 z-20 shrink-0 rounded-xl border border-emerald-100 bg-white/95 p-3 shadow-sm backdrop-blur"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black text-slate-900">智能涂抹流程</p>
            <p className="mt-1 text-[11px] font-semibold text-emerald-700">
              当前状态：{stageLabels[stage]}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">{stageHints[stage]}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => runEditorCommand('undo')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">
              <RotateCcw className="mr-1 inline h-3.5 w-3.5" />撤销
            </button>
            <button type="button" onClick={() => runEditorCommand('redo')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">
              <Redo2 className="mr-1 inline h-3.5 w-3.5" />重做
            </button>
            {(stage === 'rough-marking' || stage === 'ready-to-segment' || stage === 'error') ? (
              <button type="button" onClick={() => runEditorCommand('clear')} disabled={!maskImageDataUrl} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">
                <Trash2 className="mr-1 inline h-3.5 w-3.5" />清空涂抹
              </button>
            ) : null}
            {(stage === 'rough-marking' || stage === 'ready-to-segment' || stage === 'error') ? (
              <button
                type="button"
                disabled={!canStartSegmentation}
                onClick={() => void refineMask()}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Sparkles className="h-4 w-4" />
                {stage === 'error' ? '重新识别' : '开始智能识别'}
              </button>
            ) : null}
            {stage === 'segmenting' ? (
              <button type="button" disabled className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white opacity-70">
                <LoaderCircle className="h-4 w-4 animate-spin" />识别中…
              </button>
            ) : null}
            {stage === 'reviewing' ? (
              <>
                <button type="button" onClick={() => void refineMask()} disabled={!canStartSegmentation} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">
                  重新识别
                </button>
                <button type="button" onClick={confirmRefinement} className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">
                  <Check className="h-3.5 w-3.5" />确认区域
                </button>
              </>
            ) : null}
            {stage === 'confirmed' ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 ring-1 ring-emerald-200">
                <Check className="h-3.5 w-3.5" />已确认区域
              </span>
            ) : null}
            <button type="button" onClick={cancelSmartMask} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">
              <X className="mr-1 inline h-3.5 w-3.5" />取消
            </button>
          </div>
        </div>
        {error ? <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
      </div>

      <div className="min-h-[360px] flex-1">
        <MaskEditor
          imageDataUrl={imageUrl}
          imageName={inputImage.name}
          maskImageDataUrl={maskImageDataUrl}
          protectionMaskDataUrl={protectionMaskDataUrl}
          useFullImage={useFullImageMask}
          allowFullImage={false}
          onMaskChange={handleMaskChange}
          onConfirm={editableRefinement && !refinement ? confirmEditedRefinement : undefined}
          onCancel={onCancelEditing}
          confirmDisabled={!maskImageDataUrl}
          externalCommand={editorCommand}
        />
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
              <button type="button" onClick={continueEditing} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700">继续修改优化结果</button>
              <button type="button" onClick={confirmRefinement} className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">
                <Check className="h-3.5 w-3.5" />确认区域
              </button>
            </div>
          </div>
        </div>
      ) : config?.smartMaskConfirmed ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
          <span><Check className="mr-1 inline h-4 w-4" />智能 Mask 已确认，可以生成</span>
        </div>
      ) : null}
    </div>
  );
}

function readInitialStage(config: GenerationConfig | undefined, hasMask: boolean): SmartMaskStage {
  if (config?.smartMaskStage) return config.smartMaskStage;
  if (config?.smartMaskConfirmed) return 'confirmed';
  if (config?.smartMaskIsRefining) return 'segmenting';
  if (hasMask) return 'ready-to-segment';
  return config?.maskWorkflowMode === 'smart' ? 'rough-marking' : 'idle';
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
    plant: '绿植',
    lighting: '灯具',
    artwork: '装饰画',
    decor: '摆件',
    object: '目标对象',
    'selected-region': '选中区域',
  };
  return labels[value] || value;
}
