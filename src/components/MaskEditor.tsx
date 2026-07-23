import React, { PointerEvent, useEffect, useRef, useState } from 'react';
import { Brush, Check, Eraser, Eye, EyeOff, FlipHorizontal, Hand, Lasso, Maximize2, Minus, Plus, Redo2, RotateCcw, Scan, Shield, Square, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';

interface MaskEditorProps {
  imageDataUrl: string;
  imageName: string;
  maskImageDataUrl: string | null;
  protectionMaskDataUrl?: string | null;
  useFullImage: boolean;
  onMaskChange: (maskDataUrl: string | null, useFullImage: boolean, feather?: number, protectionMaskDataUrl?: string | null, expansion?: number, hasValidMaskPixels?: boolean) => void;
  allowFullImage?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmDisabled?: boolean;
  externalCommand?: MaskEditorExternalCommand | null;
}

export type MaskEditorExternalCommand = {
  id: number;
} & (
  | { type: 'undo' | 'redo' | 'clear' }
  | { type: 'select-tool'; tool: 'brush' | 'eraser' }
);

type MaskTool = 'brush' | 'eraser' | 'rectangle' | 'lasso' | 'pan';
type MaskLayer = 'edit' | 'protect';
type MaskSnapshot = { edit: string; protect: string };

interface Point {
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const maxHistoryLength = 20;

export function MaskEditor({ imageDataUrl, imageName, maskImageDataUrl, protectionMaskDataUrl = null, useFullImage, onMaskChange, allowFullImage = true, onConfirm, onCancel, confirmDisabled = false, externalCommand = null }: MaskEditorProps) {
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const protectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<MaskSnapshot[]>([]);
  const futureRef = useRef<MaskSnapshot[]>([]);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const startPointRef = useRef<Point | null>(null);
  const lassoPointsRef = useRef<Point[]>([]);
  const maskFromPropsRef = useRef<string | null>(null);
  const panStartRef = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(null);
  const lastExternalCommandIdRef = useRef<number | null>(null);

  const [tool, setTool] = useState<MaskTool>('brush');
  const [layer, setLayer] = useState<MaskLayer>('edit');
  const [brushSize, setBrushSize] = useState(24);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [draftRect, setDraftRect] = useState<Rect | null>(null);
  const [draftLassoPoints, setDraftLassoPoints] = useState<Point[]>([]);
  const [hasMask, setHasMask] = useState(Boolean(maskImageDataUrl));
  const [selectionPercent, setSelectionPercent] = useState(0);
  const [historyCount, setHistoryCount] = useState(0);
  const [futureCount, setFutureCount] = useState(0);
  const [showMask, setShowMask] = useState(true);
  const [maskOpacity, setMaskOpacity] = useState(48);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [feather, setFeather] = useState(0);
  const [protectedPercent, setProtectedPercent] = useState(0);
  const [cursorPoint, setCursorPoint] = useState<Point | null>(null);
  const [editorMessage, setEditorMessage] = useState('尚未绘制局部区域');

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || 1024;
      const height = image.naturalHeight || 576;
      setImageSize({ width, height });
    };
    image.src = imageDataUrl;
  }, [imageDataUrl]);

  useEffect(() => {
    if (!imageSize) return;

    const maskCanvas = maskCanvasRef.current;
    const protectionCanvas = protectionCanvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!maskCanvas || !protectionCanvas || !previewCanvas) return;

    maskCanvas.width = imageSize.width;
    maskCanvas.height = imageSize.height;
    protectionCanvas.width = imageSize.width;
    protectionCanvas.height = imageSize.height;
    previewCanvas.width = imageSize.width;
    previewCanvas.height = imageSize.height;

    const context = maskCanvas.getContext('2d');
    const protectionContext = protectionCanvas.getContext('2d');
    if (!context || !protectionContext) return;

    clearMaskCanvas(context, imageSize);
    clearMaskCanvas(protectionContext, imageSize);

    if (!maskImageDataUrl) {
      maskFromPropsRef.current = null;
      historyRef.current = [];
      futureRef.current = [];
      setHistoryCount(0);
      setFutureCount(0);
      setHasMask(false);
      setSelectionPercent(0);
      setProtectedPercent(0);
      setEditorMessage('尚未绘制局部区域');
      renderPreview();
    } else {
      maskFromPropsRef.current = maskImageDataUrl;
      loadMaskIntoCanvas(maskImageDataUrl, maskCanvas, imageSize, () => {
        updateSelectionStats();
        renderPreview();
      });
    }
    if (protectionMaskDataUrl) {
      loadMaskIntoCanvas(protectionMaskDataUrl, protectionCanvas, imageSize, () => {
        updateProtectionStats();
        renderPreview();
      });
    }
  }, [imageSize, maskImageDataUrl, protectionMaskDataUrl]);

  const pushHistory = () => {
    const maskCanvas = maskCanvasRef.current;
    const protectionCanvas = protectionCanvasRef.current;
    if (!maskCanvas || !protectionCanvas) return;

    historyRef.current = [...historyRef.current.slice(-(maxHistoryLength - 1)), { edit: maskCanvas.toDataURL('image/png'), protect: protectionCanvas.toDataURL('image/png') }];
    futureRef.current = [];
    setHistoryCount(historyRef.current.length);
    setFutureCount(0);
  };

  const captureSnapshot = (): MaskSnapshot | null => {
    const maskCanvas = maskCanvasRef.current;
    const protectionCanvas = protectionCanvasRef.current;
    if (!maskCanvas || !protectionCanvas) return null;
    return { edit: maskCanvas.toDataURL('image/png'), protect: protectionCanvas.toDataURL('image/png') };
  };

  const restoreSnapshot = (snapshot: MaskSnapshot) => {
    const maskCanvas = maskCanvasRef.current;
    const protectionCanvas = protectionCanvasRef.current;
    if (!maskCanvas || !protectionCanvas || !imageSize) return;
    let restored = 0;
    const done = () => {
      restored += 1;
      if (restored === 2) finishMaskEdit();
    };
    loadMaskIntoCanvas(snapshot.edit, maskCanvas, imageSize, done);
    loadMaskIntoCanvas(snapshot.protect, protectionCanvas, imageSize, done);
  };

  const exportMaskDataUrl = (sourceCanvas = maskCanvasRef.current): string => {
    if (!sourceCanvas) return '';

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = sourceCanvas.width;
    exportCanvas.height = sourceCanvas.height;

    const exportContext = exportCanvas.getContext('2d');
    const sourceContext = sourceCanvas.getContext('2d');
    if (!exportContext || !sourceContext) return '';

    exportContext.fillStyle = '#000000';
    exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    const imageData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const output = exportContext.getImageData(0, 0, exportCanvas.width, exportCanvas.height);

    for (let index = 0; index < imageData.data.length; index += 4) {
      const value = imageData.data[index] > 10 || imageData.data[index + 1] > 10 || imageData.data[index + 2] > 10 ? 255 : 0;
      output.data[index] = value;
      output.data[index + 1] = value;
      output.data[index + 2] = value;
      output.data[index + 3] = 255;
    }

    exportContext.putImageData(output, 0, 0);
    return exportCanvas.toDataURL('image/png');
  };

  const renderPreview = () => {
    const maskCanvas = maskCanvasRef.current;
    const protectionCanvas = protectionCanvasRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!maskCanvas || !protectionCanvas || !previewCanvas) return;

    const maskContext = maskCanvas.getContext('2d');
    const protectionContext = protectionCanvas.getContext('2d');
    const previewContext = previewCanvas.getContext('2d');
    if (!maskContext || !protectionContext || !previewContext) return;

    previewContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    if (!showMask) return;

    const maskData = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const protectionData = protectionContext.getImageData(0, 0, protectionCanvas.width, protectionCanvas.height);
    const previewData = previewContext.createImageData(previewCanvas.width, previewCanvas.height);

    for (let index = 0; index < maskData.data.length; index += 4) {
      const pixelIndex = index / 4;
      const x = pixelIndex % maskCanvas.width;
      const y = Math.floor(pixelIndex / maskCanvas.width);
      const selected = isMaskPixelSelected(maskData.data, pixelIndex);
      const protectedPixel = protectionData.data[index] > 10 || protectionData.data[index + 1] > 10 || protectionData.data[index + 2] > 10;
      if (protectedPixel) {
        previewData.data[index] = 244;
        previewData.data[index + 1] = 63;
        previewData.data[index + 2] = 94;
        previewData.data[index + 3] = Math.round(maskOpacity * 2.55);
      } else if (selected) {
        const edgePixel = x === 0
          || y === 0
          || x === maskCanvas.width - 1
          || y === maskCanvas.height - 1
          || !isMaskPixelSelected(maskData.data, pixelIndex - 1)
          || !isMaskPixelSelected(maskData.data, pixelIndex + 1)
          || !isMaskPixelSelected(maskData.data, pixelIndex - maskCanvas.width)
          || !isMaskPixelSelected(maskData.data, pixelIndex + maskCanvas.width);
        previewData.data[index] = edgePixel ? 16 : 37;
        previewData.data[index + 1] = edgePixel ? 185 : 99;
        previewData.data[index + 2] = edgePixel ? 129 : 235;
        previewData.data[index + 3] = edgePixel ? 235 : Math.round(maskOpacity * 2.3);
      }
    }

    previewContext.putImageData(previewData, 0, 0);
  };

  const finishMaskEdit = () => {
    const percent = updateSelectionStats();
    updateProtectionStats();
    renderPreview();
    onMaskChange(percent > 0 ? exportMaskDataUrl(maskCanvasRef.current) : null, false, feather, exportOptionalMask(protectionCanvasRef.current), 0, percent > 0);
  };

  const getActiveCanvas = () => layer === 'protect' ? protectionCanvasRef.current : maskCanvasRef.current;

  const drawStroke = (from: Point, to: Point) => {
    const context = getActiveCanvas()?.getContext('2d');
    if (!context) return;

    context.save();
    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = '#ffffff';
    context.lineWidth = brushSize;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
    renderPreview();
  };

  const drawDot = (point: Point) => {
    const context = getActiveCanvas()?.getContext('2d');
    if (!context) return;

    context.save();
    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    renderPreview();
  };

  const fillRect = (rect: Rect) => {
    const context = getActiveCanvas()?.getContext('2d');
    if (!context) return;

    context.fillStyle = '#ffffff';
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  };

  const fillLasso = (points: Point[]) => {
    if (points.length < 3) return;

    const context = getActiveCanvas()?.getContext('2d');
    if (!context) return;

    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    context.fill();
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'pan') {
      event.currentTarget.setPointerCapture(event.pointerId);
      isDrawingRef.current = true;
      panStartRef.current = { clientX: event.clientX, clientY: event.clientY, x: pan.x, y: pan.y };
      return;
    }
    const point = getCanvasPoint(event);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    pushHistory();
    isDrawingRef.current = true;
    setCursorPoint(point);
    lastPointRef.current = point;
    startPointRef.current = point;

    if (tool === 'brush' || tool === 'eraser') {
      drawDot(point);
      return;
    }

    if (tool === 'rectangle') {
      setDraftRect({ x: point.x, y: point.y, width: 0, height: 0 });
      return;
    }

    lassoPointsRef.current = [point];
    setDraftLassoPoints([point]);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'pan' && isDrawingRef.current && panStartRef.current) {
      setPan({
        x: panStartRef.current.x + event.clientX - panStartRef.current.clientX,
        y: panStartRef.current.y + event.clientY - panStartRef.current.clientY,
      });
      return;
    }
    const point = getCanvasPoint(event);
    if (!point) return;
    setCursorPoint(point);

    if (!isDrawingRef.current) return;

    if ((tool === 'brush' || tool === 'eraser') && lastPointRef.current) {
      drawStroke(lastPointRef.current, point);
      lastPointRef.current = point;
      return;
    }

    if (tool === 'rectangle' && startPointRef.current) {
      setDraftRect(normalizeRect(startPointRef.current, point));
      return;
    }

    if (tool === 'lasso') {
      const points = [...lassoPointsRef.current, point];
      lassoPointsRef.current = points;
      setDraftLassoPoints(points);
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    isDrawingRef.current = false;
    if (tool === 'pan') {
      panStartRef.current = null;
      return;
    }

    if (tool === 'rectangle' && draftRect && draftRect.width > 2 && draftRect.height > 2) {
      fillRect(draftRect);
    }

    if (tool === 'lasso') {
      fillLasso(lassoPointsRef.current);
    }

    lastPointRef.current = null;
    startPointRef.current = null;
    lassoPointsRef.current = [];
    setDraftRect(null);
    setDraftLassoPoints([]);
    finishMaskEdit();
  };

  const handlePointerLeave = () => {
    setCursorPoint(null);
  };

  const handleUndo = () => {
    const previous = historyRef.current.pop();
    setHistoryCount(historyRef.current.length);
    const current = captureSnapshot();
    if (!previous || !current) return;
    futureRef.current = [...futureRef.current.slice(-(maxHistoryLength - 1)), current];
    setFutureCount(futureRef.current.length);
    restoreSnapshot(previous);
  };

  const handleRedo = () => {
    const next = futureRef.current.pop();
    const current = captureSnapshot();
    if (!next || !current) return;
    historyRef.current = [...historyRef.current.slice(-(maxHistoryLength - 1)), current];
    setHistoryCount(historyRef.current.length);
    setFutureCount(futureRef.current.length);
    restoreSnapshot(next);
  };

  const resetViewport = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const updateZoom = (value: number) => setZoom(Math.max(0.5, Math.min(4, Number(value.toFixed(2)))));

  const handleClear = () => {
    const activeCanvas = getActiveCanvas();
    const context = activeCanvas?.getContext('2d');
    if (!context || !imageSize) return;

    pushHistory();
    clearMaskCanvas(context, imageSize);
    renderPreview();
    if (layer === 'edit') {
      setHasMask(false);
      setSelectionPercent(0);
      setEditorMessage('尚未绘制局部区域');
    } else {
      setProtectedPercent(0);
    }
    setDraftRect(null);
    setDraftLassoPoints([]);
    finishMaskEdit();
  };

  const handleUseFullImage = () => {
    const context = maskCanvasRef.current?.getContext('2d');
    const protectionContext = protectionCanvasRef.current?.getContext('2d');
    if (!context || !protectionContext || !imageSize) return;

    pushHistory();
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, imageSize.width, imageSize.height);
    clearMaskCanvas(protectionContext, imageSize);
    renderPreview();
    updateSelectionStats();
    onMaskChange(exportMaskDataUrl(maskCanvasRef.current), true, feather, null, 0, true);
  };

  const handleCancelFullImage = () => {
    const context = maskCanvasRef.current?.getContext('2d');
    if (!context || !imageSize) return;

    pushHistory();
    clearMaskCanvas(context, imageSize);
    renderPreview();
    setHasMask(false);
    setSelectionPercent(0);
    setEditorMessage('尚未绘制局部区域');
    onMaskChange(null, false, feather, exportOptionalMask(protectionCanvasRef.current), 0, false);
  };

  const handleInvert = () => {
    const canvas = getActiveCanvas();
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    pushHistory();
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < imageData.data.length; index += 4) {
      const selected = imageData.data[index] > 10 || imageData.data[index + 1] > 10 || imageData.data[index + 2] > 10;
      const value = selected ? 0 : 255;
      imageData.data[index] = value;
      imageData.data[index + 1] = value;
      imageData.data[index + 2] = value;
      imageData.data[index + 3] = selected ? 0 : 255;
    }
    context.putImageData(imageData, 0, 0);
    finishMaskEdit();
  };

  useEffect(() => {
    if (!externalCommand || lastExternalCommandIdRef.current === externalCommand.id) return;
    lastExternalCommandIdRef.current = externalCommand.id;
    if (externalCommand.type === 'undo') handleUndo();
    if (externalCommand.type === 'redo') handleRedo();
    if (externalCommand.type === 'clear') handleClear();
    if (externalCommand.type === 'select-tool') {
      setTool(externalCommand.tool);
      setLayer('edit');
    }
  });

  const handleMorph = (amount: number) => {
    const canvas = getActiveCanvas();
    if (!canvas || amount === 0) return;
    pushHistory();
    morphCanvasMask(canvas, amount);
    finishMaskEdit();
  };

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return null;

    const bounds = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: clamp((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  };

  const updateSelectionStats = (): number => {
    const canvas = maskCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return 0;

    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let selectedPixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 10 || data[index + 1] > 10 || data[index + 2] > 10) selectedPixels += 1;
    }
    const percent = (selectedPixels / (canvas.width * canvas.height)) * 100;
    setHasMask(percent > 0);
    setSelectionPercent(percent);
    if (percent === 0) {
      setEditorMessage('尚未绘制局部区域');
    } else if (percent < 0.1) {
      setEditorMessage('选区过小，建议扩大重绘区域。');
    } else {
      setEditorMessage(`选区面积 ${percent.toFixed(1)}%`);
    }
    return percent;
  };

  const updateProtectionStats = (): number => {
    const canvas = protectionCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return 0;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let pixels = 0;
    for (let index = 0; index < data.length; index += 4) if (data[index] > 10 || data[index + 1] > 10 || data[index + 2] > 10) pixels += 1;
    const percent = (pixels / (canvas.width * canvas.height)) * 100;
    setProtectedPercent(percent);
    return percent;
  };

  useEffect(() => {
    renderPreview();
  }, [showMask, maskOpacity]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && key === 'y') {
        event.preventDefault();
        handleRedo();
        return;
      }

      if (key === 'b') setTool('brush');
      if (key === 'e') setTool('eraser');
      if (key === 'r') setTool('rectangle');
      if (key === 'l') setTool('lasso');
      if (key === 'h') setTool('pan');
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden rounded-xl border border-slate-100 bg-slate-50 p-3 custom-scrollbar">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">4. 选择局部 mask</p>
          <p className="truncate text-[10px] font-medium text-slate-500">{imageName}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <ToolButton active={tool === 'brush'} label="画笔" onClick={() => setTool('brush')}>
            <Brush className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton active={tool === 'eraser'} label="橡皮" onClick={() => setTool('eraser')}>
            <Eraser className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton active={tool === 'rectangle'} label="矩形" onClick={() => setTool('rectangle')}>
            <Square className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton active={tool === 'lasso'} label="套索" onClick={() => setTool('lasso')}>
            <Lasso className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton active={tool === 'pan'} label="拖动画布" onClick={() => setTool('pan')}>
            <Hand className="h-3.5 w-3.5" />
          </ToolButton>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-slate-200/70 p-1">
          <button type="button" onClick={() => setLayer('edit')} className={`rounded-md px-2 py-1 text-[10px] font-black ${layer === 'edit' ? 'bg-blue-600 text-white' : 'text-slate-600'}`}>编辑区</button>
          <button type="button" onClick={() => setLayer('protect')} className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-black ${layer === 'protect' ? 'bg-rose-600 text-white' : 'text-slate-600'}`}><Shield className="h-3 w-3" />保护区</button>
        </div>
        <label className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-500">
          画笔
          <input
            type="range"
            min="4"
            max="80"
            step="1"
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
            className="min-w-24 flex-1 accent-blue-600"
          />
          <span className="w-7 text-right font-mono">{brushSize}</span>
        </label>
        <ToolButton active={false} label="撤销" onClick={handleUndo} disabled={historyCount === 0}>
          <RotateCcw className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton active={false} label="重做" onClick={handleRedo} disabled={futureCount === 0}>
          <Redo2 className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton active={!showMask} label={showMask ? '隐藏选区' : '显示选区'} onClick={() => setShowMask((value) => !value)}>
          {showMask ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </ToolButton>
        <ToolButton active={false} label="反选" onClick={handleInvert}>
          <FlipHorizontal className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton active={false} label="清空" onClick={handleClear}>
          <Trash2 className="h-3.5 w-3.5" />
        </ToolButton>
        {allowFullImage ? <><ToolButton active={useFullImage} label="整图" onClick={handleUseFullImage}>
          <Maximize2 className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton active={false} label="扩张" onClick={() => handleMorph(3)}>
          <Plus className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton active={false} label="收缩" onClick={() => handleMorph(-3)}>
          <Minus className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton active={false} label="取消整图" onClick={handleCancelFullImage} disabled={!useFullImage}>
          <X className="h-3.5 w-3.5" />
        </ToolButton></> : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2" data-testid="mask-viewport-toolbar">
        <ToolButton active={false} label="缩小" onClick={() => updateZoom(zoom - 0.2)} disabled={zoom <= 0.5}>
          <ZoomOut className="h-3.5 w-3.5" />
        </ToolButton>
        <span className="min-w-12 text-center text-[10px] font-black text-slate-600">{Math.round(zoom * 100)}%</span>
        <ToolButton active={false} label="放大" onClick={() => updateZoom(zoom + 0.2)} disabled={zoom >= 4}>
          <ZoomIn className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton active={zoom === 1 && pan.x === 0 && pan.y === 0} label="适应窗口" onClick={resetViewport}>
          <Scan className="h-3.5 w-3.5" />
        </ToolButton>
        <label className="flex min-w-44 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-500">
          蒙版透明度
          <input type="range" min="10" max="80" step="1" value={maskOpacity} onChange={event => setMaskOpacity(Number(event.target.value))} className="min-w-20 flex-1 accent-blue-600" />
          <span className="w-8 text-right font-mono">{maskOpacity}%</span>
        </label>
      </div>

      <label className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-500">
        羽化
        <input
          type="range"
          min="0"
          max="30"
          step="1"
          value={feather}
          onChange={(event) => {
            const nextFeather = Number(event.target.value);
            setFeather(nextFeather);
            onMaskChange(exportOptionalMask(maskCanvasRef.current), useFullImage, nextFeather, exportOptionalMask(protectionCanvasRef.current), 0, hasMask || useFullImage);
          }}
          className="min-w-28 flex-1 accent-blue-600"
        />
        <span className="w-10 text-right font-mono">{feather}px</span>
      </label>

      <div
        className="flex min-h-[300px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-2 lg:min-h-[360px]"
        onWheel={event => {
          event.preventDefault();
          updateZoom(zoom + (event.deltaY < 0 ? 0.15 : -0.15));
        }}
        onDoubleClick={resetViewport}
      >
        <div
          className="mask-editor-stage relative isolate max-h-full max-w-full overflow-hidden rounded bg-slate-50 shadow-inner"
          style={{
            aspectRatio: imageSize ? `${imageSize.width} / ${imageSize.height}` : '16 / 9',
            width: imageSize && imageSize.width >= imageSize.height ? '100%' : 'auto',
            height: imageSize && imageSize.width < imageSize.height ? '100%' : 'auto',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: tool === 'pan' && isDrawingRef.current ? 'none' : 'transform 120ms ease-out',
          }}
        >
          <img src={imageDataUrl} alt={imageName} className="absolute inset-0 h-full w-full select-none object-contain" draggable={false} />
          <canvas ref={maskCanvasRef} className="hidden" />
          <canvas ref={protectionCanvasRef} className="hidden" />
          <canvas
            ref={previewCanvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            className="mask-canvas absolute inset-0 h-full w-full touch-none cursor-none"
          />
          {cursorPoint && imageSize && (tool === 'brush' || tool === 'eraser') && (
            <div
              className={`pointer-events-none absolute rounded-full border-2 ${
                tool === 'eraser' ? 'border-dashed border-red-500 bg-red-500/5' : 'border-white bg-blue-500/10 shadow-[0_0_0_1px_rgba(37,99,235,0.7)]'
              }`}
              style={{
                left: `${(cursorPoint.x / imageSize.width) * 100}%`,
                top: `${(cursorPoint.y / imageSize.height) * 100}%`,
                width: `${(brushSize / imageSize.width) * 100}%`,
                height: `${(brushSize / imageSize.height) * 100}%`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          )}
          {draftRect && (
            <div
              className="pointer-events-none absolute border-2 border-white bg-blue-500/25 shadow-[0_0_0_9999px_rgba(15,23,42,0.18)]"
              style={{
                left: `${(draftRect.x / (imageSize?.width || 1)) * 100}%`,
                top: `${(draftRect.y / (imageSize?.height || 1)) * 100}%`,
                width: `${(draftRect.width / (imageSize?.width || 1)) * 100}%`,
                height: `${(draftRect.height / (imageSize?.height || 1)) * 100}%`,
              }}
            />
          )}
          {draftLassoPoints.length > 1 && imageSize && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}>
              <polyline
                points={draftLassoPoints.map((point) => `${point.x},${point.y}`).join(' ')}
                fill="rgba(37,99,235,0.18)"
                stroke="#ffffff"
                strokeWidth={Math.max(2, brushSize / 8)}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] font-medium text-slate-500">
        <span className={hasMask && selectionPercent < 0.1 ? 'text-amber-600' : ''}>
          {useFullImage ? '已选择整图区域' : `${editorMessage} · 保护区 ${protectedPercent.toFixed(1)}%`}
        </span>
        <span>{showMask ? `${layer === 'edit' ? '蓝色编辑区' : '红色保护区'} · 边界调整会写入 Mask` : '选区已隐藏'}</span>
      </div>
      {onConfirm || onCancel ? (
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 pt-2" data-testid="mask-editor-actions">
          {onCancel ? <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">取消编辑</button> : null}
          {onConfirm ? <button type="button" onClick={onConfirm} disabled={confirmDisabled} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"><Check className="h-4 w-4" />确认区域</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function ToolButton({
  active,
  children,
  label,
  onClick,
  disabled = false,
}: {
  active: boolean;
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-blue-600 bg-blue-600 text-white'
          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800'
      }`}
      title={label}
    >
      {children}
      {label}
    </button>
  );
}

function clearMaskCanvas(context: CanvasRenderingContext2D, size: { width: number; height: number }) {
  context.clearRect(0, 0, size.width, size.height);
}

function loadMaskIntoCanvas(dataUrl: string, canvas: HTMLCanvasElement, size: { width: number; height: number }, onLoad: () => void): void {
  const image = new Image();
  image.onload = () => {
    const context = canvas.getContext('2d');
    if (!context) return;
    clearMaskCanvas(context, size);
    context.drawImage(image, 0, 0, size.width, size.height);
    onLoad();
  };
  image.src = dataUrl;
}

function exportOptionalMask(canvas: HTMLCanvasElement | null): string | null {
  if (!canvas) return null;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index] > 10 || data[index + 1] > 10 || data[index + 2] > 10) return canvas.toDataURL('image/png');
  }
  return null;
}

function morphCanvasMask(canvas: HTMLCanvasElement, amount: number): void {
  const radius = Math.max(1, Math.min(12, Math.abs(Math.round(amount))));
  const source = document.createElement('canvas');
  source.width = canvas.width;
  source.height = canvas.height;
  source.getContext('2d')?.drawImage(canvas, 0, 0);
  const context = canvas.getContext('2d');
  if (!context) return;
  const offsets = Array.from({ length: 24 }, (_, index) => {
    const angle = (index / 24) * Math.PI * 2;
    return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
  });
  if (amount > 0) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0);
    offsets.forEach(offset => context.drawImage(source, offset.x, offset.y));
    return;
  }
  const inverse = document.createElement('canvas');
  inverse.width = canvas.width;
  inverse.height = canvas.height;
  const inverseContext = inverse.getContext('2d');
  if (!inverseContext) return;
  inverseContext.fillStyle = '#ffffff';
  inverseContext.fillRect(0, 0, inverse.width, inverse.height);
  inverseContext.globalCompositeOperation = 'destination-out';
  inverseContext.drawImage(source, 0, 0);
  const expandedInverse = document.createElement('canvas');
  expandedInverse.width = canvas.width;
  expandedInverse.height = canvas.height;
  const expandedContext = expandedInverse.getContext('2d');
  if (!expandedContext) return;
  expandedContext.drawImage(inverse, 0, 0);
  offsets.forEach(offset => expandedContext.drawImage(inverse, offset.x, offset.y));
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'destination-out';
  context.drawImage(expandedInverse, 0, 0);
  context.globalCompositeOperation = 'source-over';
}

function normalizeRect(start: Point, end: Point): Rect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isMaskPixelSelected(data: Uint8ClampedArray, pixelIndex: number): boolean {
  if (pixelIndex < 0 || pixelIndex * 4 + 2 >= data.length) return false;
  const offset = pixelIndex * 4;
  return data[offset] > 10 || data[offset + 1] > 10 || data[offset + 2] > 10;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable;
}
