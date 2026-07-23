import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Check, LoaderCircle, Minus, Plus, Redo2, RotateCcw, Trash2, X } from 'lucide-react';
import { refineImageMask, type RefineMaskResult } from '../../lib/api';
import type { GenerationConfig, SmartSelectionStatus, UploadedImage } from '../../types';
import { maskHasVisiblePixels } from '../../utils/maskPixels';

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

type SmartSelectionTool = 'add' | 'subtract';
type Point = { x: number; y: number };
type MaskHistoryItem = string | null;

const maxHistoryLength = 20;

const statusLabels: Record<SmartSelectionStatus, string> = {
  idle: '等待选区',
  predicting: '推测中…',
  preview: '预览选区',
  confirmed: '已确认区域',
  error: '推测失败',
};

const statusHints: Record<SmartSelectionStatus, string> = {
  idle: '请在需要替换的对象上点击或轻刷一下。',
  predicting: '正在根据本次点击/轻刷推测完整目标区域，旧选区会保留到新结果返回。',
  preview: '智能选区已更新，请检查高亮区域。',
  confirmed: '区域已确认。',
  error: '选区推测失败，可以继续点击或轻刷来重试。',
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
  const requestIdRef = useRef(0);
  const sourceKeyRef = useRef(inputImage.assetId || imageUrl);
  const selectionMaskRef = useRef<string | null>(maskImageDataUrl && !useFullImageMask ? maskImageDataUrl : null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const seedCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const historyRef = useRef<MaskHistoryItem[]>([]);
  const futureRef = useRef<MaskHistoryItem[]>([]);

  const [status, setStatus] = useState<SmartSelectionStatus>(() => readInitialStatus(config, Boolean(maskImageDataUrl && !useFullImageMask)));
  const [selectionMask, setSelectionMask] = useState<string | null>(selectionMaskRef.current);
  const [lastPrediction, setLastPrediction] = useState<RefineMaskResult | null>(null);
  const [tool, setTool] = useState<SmartSelectionTool>('add');
  const [brushSize, setBrushSize] = useState(28);
  const [maskOpacity, setMaskOpacity] = useState(46);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [cursorPoint, setCursorPoint] = useState<Point | null>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [futureCount, setFutureCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isPredicting = status === 'predicting';
  const canConfirm = Boolean(selectionMask) && !isPredicting;

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      setImageSize({
        width: image.naturalWidth || 1024,
        height: image.naturalHeight || 576,
      });
    };
    image.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    const nextSourceKey = inputImage.assetId || imageUrl;
    const sourceChanged = sourceKeyRef.current !== nextSourceKey;
    sourceKeyRef.current = nextSourceKey;
    if (!sourceChanged) return;

    requestRef.current?.abort();
    requestRef.current = null;
    requestIdRef.current += 1;
    historyRef.current = [];
    futureRef.current = [];
    setHistoryCount(0);
    setFutureCount(0);
    setSelection(null);
    setLastPrediction(null);
    setError(null);
    updateSmartSelectionStatus('idle', {
      smartSelectionConfirmed: false,
      smartMaskConfirmed: false,
      smartMaskDetectedObject: undefined,
      smartMaskConfidence: undefined,
      smartMaskRefinementMethod: undefined,
    });
    onUpdateMaskImage(null, false, config?.feather, protectionMaskDataUrl, config?.maskExpansion, false);
    // Source changes must never reuse a previous image's mask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, inputImage.assetId]);

  useEffect(() => {
    if (isPredicting) return;
    const nextMask = maskImageDataUrl && !useFullImageMask ? maskImageDataUrl : null;
    if (nextMask === selectionMaskRef.current) return;
    setSelection(nextMask);
  }, [isPredicting, maskImageDataUrl, useFullImageMask]);

  useEffect(() => {
    void renderSelectionOverlay({
      canvas: overlayCanvasRef.current,
      maskDataUrl: selectionMask,
      size: imageSize,
      opacity: maskOpacity,
    });
  }, [imageSize, maskOpacity, selectionMask]);

  const setSelection = (nextMask: string | null) => {
    selectionMaskRef.current = nextMask;
    setSelectionMask(nextMask);
  };

  const updateSmartSelectionStatus = (
    nextStatus: SmartSelectionStatus,
    patch: Partial<GenerationConfig> = {},
  ) => {
    setStatus(nextStatus);
    onUpdateConfig?.({
      selectionMode: 'smart-select',
      editMode: 'mask',
      maskSelectionMode: 'smart',
      maskWorkflowMode: 'smart',
      maskWorkflowActive: true,
      smartSelectionStatus: nextStatus,
      smartSelectionConfirmed: nextStatus === 'confirmed',
      smartMaskStage: undefined,
      smartMaskIsRefining: nextStatus === 'predicting',
      smartMaskConfirmed: nextStatus === 'confirmed',
      ...patch,
    });
  };

  const pushHistory = () => {
    historyRef.current = [...historyRef.current.slice(-(maxHistoryLength - 1)), selectionMaskRef.current];
    futureRef.current = [];
    setHistoryCount(historyRef.current.length);
    setFutureCount(0);
  };

  const applySelectionMask = (
    nextMask: string | null,
    nextStatus: SmartSelectionStatus,
    confirmed: boolean,
    prediction?: RefineMaskResult | null,
  ) => {
    setSelection(nextMask);
    setLastPrediction(prediction ?? null);
    onUpdateMaskImage(nextMask, false, config?.feather, protectionMaskDataUrl, config?.maskExpansion, Boolean(nextMask));
    updateSmartSelectionStatus(nextStatus, {
      smartSelectionConfirmed: confirmed,
      smartMaskConfirmed: confirmed,
      smartMaskDetectedObject: prediction?.detectedObject,
      smartMaskConfidence: prediction?.confidence,
      smartMaskRefinementMethod: prediction?.method,
      editingScope: nextMask ? 'masked' : 'semantic-auto',
      replacementStrategy: nextMask ? 'replace-masked' : 'replace-existing',
      preserveUnmaskedArea: true,
    });
  };

  const handleUndo = () => {
    const previous = historyRef.current.pop();
    if (previous === undefined) return;
    futureRef.current = [...futureRef.current.slice(-(maxHistoryLength - 1)), selectionMaskRef.current];
    setHistoryCount(historyRef.current.length);
    setFutureCount(futureRef.current.length);
    applySelectionMask(previous, previous ? 'preview' : 'idle', false, previous ? lastPrediction : null);
    setError(null);
  };

  const handleRedo = () => {
    const next = futureRef.current.pop();
    if (next === undefined) return;
    historyRef.current = [...historyRef.current.slice(-(maxHistoryLength - 1)), selectionMaskRef.current];
    setHistoryCount(historyRef.current.length);
    setFutureCount(futureRef.current.length);
    applySelectionMask(next, next ? 'preview' : 'idle', false, next ? lastPrediction : null);
    setError(null);
  };

  const handleClear = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    requestIdRef.current += 1;
    pushHistory();
    applySelectionMask(null, 'idle', false, null);
    setError(null);
  };

  const handleConfirm = async () => {
    const confirmedMask = selectionMaskRef.current;
    if (!confirmedMask) {
      setError('请在需要替换的对象上点击或轻刷一下。');
      return;
    }
    const hasPixels = await maskHasVisiblePixels(confirmedMask);
    if (!hasPixels) {
      setError('选区为空，请重新点击或轻刷目标对象。');
      applySelectionMask(null, 'idle', false, null);
      return;
    }
    const result: RefineMaskResult = {
      refinedMask: confirmedMask,
      detectedObject: lastPrediction?.detectedObject || config?.targetObjectType || 'selected-region',
      confidence: lastPrediction?.confidence ?? 1,
      method: lastPrediction?.method || 'edge-aware-seeded-region-growing',
    };
    setError(null);
    applySelectionMask(confirmedMask, 'confirmed', true, result);
    onConfirmRefinedMask?.(result);
  };

  const cancelSmartSelection = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    requestIdRef.current += 1;
    onUpdateConfig?.({
      selectionMode: 'semantic-auto',
      editMode: 'smart-type',
      maskSelectionMode: undefined,
      maskWorkflowMode: 'none',
      maskWorkflowActive: false,
      smartSelectionStatus: 'idle',
      smartSelectionConfirmed: false,
      smartMaskStage: undefined,
      smartMaskConfirmed: undefined,
      smartMaskIsRefining: false,
      smartMaskDetectedObject: undefined,
      smartMaskConfidence: undefined,
      smartMaskRefinementMethod: undefined,
    });
    onCancelEditing?.();
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!imageSize) return;
    const point = getCanvasPoint(event, imageSize);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    clearSeedCanvas(seedCanvasRef.current, imageSize);
    drawSeedDot(seedCanvasRef.current, point, brushSize);
    isDrawingRef.current = true;
    lastPointRef.current = point;
    setCursorPoint(point);
    setError(null);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!imageSize) return;
    const point = getCanvasPoint(event, imageSize);
    if (!point) return;
    setCursorPoint(point);
    if (!isDrawingRef.current || !lastPointRef.current) return;
    drawSeedStroke(seedCanvasRef.current, lastPointRef.current, point, brushSize);
    lastPointRef.current = point;
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!imageSize || !isDrawingRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    isDrawingRef.current = false;
    lastPointRef.current = null;
    setCursorPoint(null);
    const seed = exportSeedMask(seedCanvasRef.current, imageSize);
    clearSeedCanvas(seedCanvasRef.current, imageSize);
    if (!seed.hasPixels) return;
    void runPrediction(seed.dataUrl, tool);
  };

  const runPrediction = async (seedMask: string, interactionTool: SmartSelectionTool) => {
    const imageAssetId = inputImage.assetId;
    const inlineImage = imageUrl.startsWith('data:image/') ? imageUrl : undefined;
    if (!imageAssetId && !inlineImage) {
      setError('原图尚未上传为正式资产，请等待上传完成后再使用智能选区。');
      updateSmartSelectionStatus('error', {
        smartSelectionConfirmed: false,
        smartMaskConfirmed: false,
      });
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    requestRef.current = controller;
    pushHistory();
    setError(null);
    updateSmartSelectionStatus('predicting', {
      smartSelectionConfirmed: false,
      smartMaskConfirmed: false,
    });

    try {
      const result = await refineImageMask({
        ...(imageAssetId ? { imageAssetId } : { image: inlineImage }),
        roughMask: seedMask,
        maskMode: 'smart',
        targetObject: config?.targetObjectType,
        targetType: config?.replacementTarget || config?.targetObjectType,
        previousMask: selectionMaskRef.current || undefined,
        positiveStrokes: interactionTool === 'add' ? [seedMask] : undefined,
        negativeStrokes: interactionTool === 'subtract' ? [seedMask] : undefined,
      }, { signal: controller.signal });
      if (controller.signal.aborted || requestIdRef.current !== requestId) return;
      const refinedHasPixels = await maskHasVisiblePixels(result.refinedMask);
      if (controller.signal.aborted || requestIdRef.current !== requestId) return;
      if (!refinedHasPixels) {
        throw new Error('智能选区返回了空蒙版，请换一个位置点击或轻刷。');
      }

      const combinedMask = await combineSelectionMasks({
        baseMask: selectionMaskRef.current,
        deltaMask: result.refinedMask,
        size: imageSize,
        operation: interactionTool === 'add' ? 'union' : 'subtract',
      });
      if (controller.signal.aborted || requestIdRef.current !== requestId) return;

      const nextPrediction: RefineMaskResult = {
        ...result,
        refinedMask: combinedMask || '',
      };
      applySelectionMask(combinedMask, combinedMask ? 'preview' : 'idle', false, combinedMask ? nextPrediction : null);
    } catch (predictionError) {
      if (controller.signal.aborted || requestIdRef.current !== requestId) return;
      console.error('[smart-selection] prediction failed', {
        assetId: inputImage.assetId,
        error: predictionError,
      });
      setError(predictionError instanceof Error ? predictionError.message : '智能选区推测失败，请重试。');
      updateSmartSelectionStatus('error', {
        smartSelectionConfirmed: false,
        smartMaskConfirmed: false,
      });
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
      }
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        data-testid="smart-mask-workflow-toolbar"
        className="sticky top-0 z-20 shrink-0 rounded-xl border border-emerald-100 bg-white/95 p-3 shadow-sm backdrop-blur"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black text-slate-900">智能选区</p>
            <p className="mt-1 text-[11px] font-semibold text-emerald-700">
              当前状态：{statusLabels[status]}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">{error || statusHints[status]}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              data-testid="smart-selection-tool-add"
              onClick={() => setTool('add')}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-black ${tool === 'add' ? 'bg-emerald-600 text-white' : 'border border-slate-200 text-slate-600'}`}
            >
              <Plus className="h-3.5 w-3.5" />添加选区
            </button>
            <button
              type="button"
              data-testid="smart-selection-tool-subtract"
              onClick={() => setTool('subtract')}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-black ${tool === 'subtract' ? 'bg-rose-600 text-white' : 'border border-slate-200 text-slate-600'}`}
            >
              <Minus className="h-3.5 w-3.5" />排除选区
            </button>
            <label className="flex min-w-36 items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-bold text-slate-500">
              画笔大小
              <input
                type="range"
                min="6"
                max="96"
                step="1"
                value={brushSize}
                onChange={event => setBrushSize(Number(event.target.value))}
                className="min-w-16 flex-1 accent-emerald-600"
              />
              <span className="w-7 text-right font-mono">{brushSize}</span>
            </label>
            <button type="button" onClick={handleUndo} disabled={historyCount === 0 || isPredicting} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">
              <RotateCcw className="mr-1 inline h-3.5 w-3.5" />撤销
            </button>
            <button type="button" onClick={handleRedo} disabled={futureCount === 0 || isPredicting} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">
              <Redo2 className="mr-1 inline h-3.5 w-3.5" />重做
            </button>
            <button type="button" onClick={handleClear} disabled={!selectionMask || isPredicting} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">
              <Trash2 className="mr-1 inline h-3.5 w-3.5" />清空
            </button>
            <button type="button" onClick={cancelSmartSelection} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">
              <X className="mr-1 inline h-3.5 w-3.5" />取消
            </button>
            <button
              type="button"
              data-testid="confirm-smart-selection"
              onClick={() => void handleConfirm()}
              disabled={!canConfirm}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" />确认选区
            </button>
          </div>
        </div>
        {error ? <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">点击 / 轻刷目标对象</p>
            <p className="truncate text-[10px] font-medium text-slate-500">{inputImage.name}</p>
          </div>
          <label className="flex min-w-44 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-500">
            高亮透明度
            <input
              type="range"
              min="16"
              max="72"
              step="1"
              value={maskOpacity}
              onChange={event => setMaskOpacity(Number(event.target.value))}
              className="min-w-20 flex-1 accent-emerald-600"
            />
            <span className="w-8 text-right font-mono">{maskOpacity}%</span>
          </label>
        </div>

        <div className="flex min-h-[360px] flex-1 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
          <div
            data-testid="smart-selection-stage"
            className="relative isolate max-h-full max-w-full overflow-hidden rounded bg-slate-50 shadow-inner"
            style={{
              aspectRatio: imageSize ? `${imageSize.width} / ${imageSize.height}` : '16 / 9',
              width: imageSize && imageSize.width >= imageSize.height ? '100%' : 'auto',
              height: imageSize && imageSize.width < imageSize.height ? '100%' : 'auto',
            }}
          >
            <img src={imageUrl} alt={inputImage.name} className="absolute inset-0 h-full w-full select-none object-contain" draggable={false} />
            <canvas
              ref={overlayCanvasRef}
              data-testid="smart-selection-mask-overlay"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={() => setCursorPoint(null)}
              className={`absolute inset-0 h-full w-full touch-none ${isPredicting ? 'cursor-wait' : 'cursor-none'}`}
            />
            <canvas ref={seedCanvasRef} className="hidden" />
            {cursorPoint && imageSize && !isPredicting ? (
              <div
                className={`pointer-events-none absolute rounded-full border-2 ${
                  tool === 'add'
                    ? 'border-white bg-emerald-400/10 shadow-[0_0_0_1px_rgba(16,185,129,0.8)]'
                    : 'border-dashed border-rose-500 bg-rose-500/10'
                }`}
                style={{
                  left: `${(cursorPoint.x / imageSize.width) * 100}%`,
                  top: `${(cursorPoint.y / imageSize.height) * 100}%`,
                  width: `${(brushSize / imageSize.width) * 100}%`,
                  height: `${(brushSize / imageSize.height) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
            ) : null}
            {isPredicting ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/10">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-xs font-black text-emerald-700 shadow">
                  <LoaderCircle className="h-4 w-4 animate-spin" />正在更新智能选区…
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-medium text-slate-500">
          <span>{selectionMask ? '高亮区域将作为最终替换范围；选区外保持不变。' : '尚未生成选区。'}</span>
          <span>{tool === 'add' ? '添加模式：点击遗漏区域或轻刷目标' : '排除模式：点击误选区域或轻刷背景'}</span>
        </div>
      </div>
    </div>
  );
}

function readInitialStatus(config: GenerationConfig | undefined, hasMask: boolean): SmartSelectionStatus {
  if (config?.smartSelectionStatus) return config.smartSelectionStatus;
  if (config?.smartSelectionConfirmed || config?.smartMaskConfirmed) return 'confirmed';
  if (config?.smartMaskIsRefining) return 'predicting';
  if (hasMask) return 'preview';
  return 'idle';
}

async function renderSelectionOverlay(input: {
  canvas: HTMLCanvasElement | null;
  maskDataUrl: string | null;
  size: { width: number; height: number } | null;
  opacity: number;
}): Promise<void> {
  const { canvas, maskDataUrl, size, opacity } = input;
  if (!canvas || !size) return;
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!maskDataUrl) return;

  const maskCanvas = await drawMaskToCanvas(maskDataUrl, size);
  const maskContext = maskCanvas.getContext('2d');
  if (!maskContext) return;
  const maskData = maskContext.getImageData(0, 0, size.width, size.height);
  const previewData = context.createImageData(size.width, size.height);
  const alpha = Math.round(opacity * 2.55);

  for (let pixelIndex = 0; pixelIndex < size.width * size.height; pixelIndex += 1) {
    if (!isSelected(maskData.data, pixelIndex)) continue;
    const offset = pixelIndex * 4;
    const x = pixelIndex % size.width;
    const y = Math.floor(pixelIndex / size.width);
    const edgePixel = x === 0
      || y === 0
      || x === size.width - 1
      || y === size.height - 1
      || !isSelected(maskData.data, pixelIndex - 1)
      || !isSelected(maskData.data, pixelIndex + 1)
      || !isSelected(maskData.data, pixelIndex - size.width)
      || !isSelected(maskData.data, pixelIndex + size.width);
    previewData.data[offset] = edgePixel ? 6 : 16;
    previewData.data[offset + 1] = edgePixel ? 95 : 185;
    previewData.data[offset + 2] = edgePixel ? 70 : 129;
    previewData.data[offset + 3] = edgePixel ? 235 : alpha;
  }

  context.putImageData(previewData, 0, 0);
}

function getCanvasPoint(event: PointerEvent<HTMLCanvasElement>, size: { width: number; height: number }): Point | null {
  const bounds = event.currentTarget.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  return {
    x: clamp((event.clientX - bounds.left) / bounds.width) * size.width,
    y: clamp((event.clientY - bounds.top) / bounds.height) * size.height,
  };
}

function clearSeedCanvas(canvas: HTMLCanvasElement | null, size: { width: number; height: number }) {
  if (!canvas) return;
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext('2d')?.clearRect(0, 0, size.width, size.height);
}

function drawSeedDot(canvas: HTMLCanvasElement | null, point: Point, brushSize: number) {
  const context = canvas?.getContext('2d');
  if (!context) return;
  context.save();
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawSeedStroke(canvas: HTMLCanvasElement | null, from: Point, to: Point, brushSize: number) {
  const context = canvas?.getContext('2d');
  if (!context) return;
  context.save();
  context.strokeStyle = '#ffffff';
  context.lineWidth = brushSize;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.restore();
}

function exportSeedMask(canvas: HTMLCanvasElement | null, size: { width: number; height: number }): { dataUrl: string; hasPixels: boolean } {
  const sourceContext = canvas?.getContext('2d');
  if (!canvas || !sourceContext) return { dataUrl: '', hasPixels: false };
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = size.width;
  outputCanvas.height = size.height;
  const outputContext = outputCanvas.getContext('2d');
  if (!outputContext) return { dataUrl: '', hasPixels: false };

  outputContext.fillStyle = '#000000';
  outputContext.fillRect(0, 0, size.width, size.height);
  const sourceData = sourceContext.getImageData(0, 0, size.width, size.height);
  const outputData = outputContext.getImageData(0, 0, size.width, size.height);
  let hasPixels = false;
  for (let index = 0; index < sourceData.data.length; index += 4) {
    const selected = sourceData.data[index + 3] > 10
      || sourceData.data[index] > 10
      || sourceData.data[index + 1] > 10
      || sourceData.data[index + 2] > 10;
    if (!selected) continue;
    hasPixels = true;
    outputData.data[index] = 255;
    outputData.data[index + 1] = 255;
    outputData.data[index + 2] = 255;
    outputData.data[index + 3] = 255;
  }
  outputContext.putImageData(outputData, 0, 0);
  return { dataUrl: outputCanvas.toDataURL('image/png'), hasPixels };
}

async function combineSelectionMasks(input: {
  baseMask: string | null;
  deltaMask: string;
  size: { width: number; height: number } | null;
  operation: 'union' | 'subtract';
}): Promise<string | null> {
  const { baseMask, deltaMask, size, operation } = input;
  if (!size) return null;
  const deltaCanvas = await drawMaskToCanvas(deltaMask, size);
  const deltaContext = deltaCanvas.getContext('2d');
  if (!deltaContext) return null;
  const deltaData = deltaContext.getImageData(0, 0, size.width, size.height);

  let baseData: ImageData | null = null;
  if (baseMask) {
    const baseCanvas = await drawMaskToCanvas(baseMask, size);
    const baseContext = baseCanvas.getContext('2d');
    baseData = baseContext?.getImageData(0, 0, size.width, size.height) || null;
  }

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = size.width;
  outputCanvas.height = size.height;
  const outputContext = outputCanvas.getContext('2d');
  if (!outputContext) return null;
  outputContext.fillStyle = '#000000';
  outputContext.fillRect(0, 0, size.width, size.height);
  const outputData = outputContext.getImageData(0, 0, size.width, size.height);
  let selectedCount = 0;

  for (let pixelIndex = 0; pixelIndex < size.width * size.height; pixelIndex += 1) {
    const baseSelected = baseData ? isSelected(baseData.data, pixelIndex) : false;
    const deltaSelected = isSelected(deltaData.data, pixelIndex);
    const selected = operation === 'union'
      ? baseSelected || deltaSelected
      : baseSelected && !deltaSelected;
    if (!selected) continue;
    selectedCount += 1;
    const offset = pixelIndex * 4;
    outputData.data[offset] = 255;
    outputData.data[offset + 1] = 255;
    outputData.data[offset + 2] = 255;
    outputData.data[offset + 3] = 255;
  }

  if (selectedCount === 0) return null;
  outputContext.putImageData(outputData, 0, 0);
  return outputCanvas.toDataURL('image/png');
}

function drawMaskToCanvas(dataUrl: string, size: { width: number; height: number }): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const image = new Image();
    image.onload = () => {
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(canvas);
        return;
      }
      context.clearRect(0, 0, size.width, size.height);
      context.drawImage(image, 0, 0, size.width, size.height);
      resolve(canvas);
    };
    image.onerror = () => reject(new Error('Mask 加载失败'));
    image.src = dataUrl;
  });
}

function isSelected(data: Uint8ClampedArray, pixelIndex: number): boolean {
  if (pixelIndex < 0 || pixelIndex * 4 + 2 >= data.length) return false;
  const offset = pixelIndex * 4;
  return data[offset] > 10 || data[offset + 1] > 10 || data[offset + 2] > 10;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
