import React, { PointerEvent, useRef, useState } from 'react';
import { Eraser, Maximize2 } from 'lucide-react';

interface MaskEditorProps {
  imageDataUrl: string;
  imageName: string;
  maskImageDataUrl: string | null;
  useFullImage: boolean;
  onMaskChange: (maskDataUrl: string | null, useFullImage: boolean) => void;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

const minRectSize = 0.01;

export function MaskEditor({ imageDataUrl, imageName, maskImageDataUrl, useFullImage, onMaskChange }: MaskEditorProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [draftRect, setDraftRect] = useState<Rect | null>(null);
  const [selectedRect, setSelectedRect] = useState<Rect | null>(null);

  const activeRect = draftRect || selectedRect;

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const point = getRelativePoint(event);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(point);
    setDraftRect({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart) return;
    const point = getRelativePoint(event);
    if (!point) return;

    setDraftRect(normalizeRect(dragStart, point));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart || !draftRect) {
      setDragStart(null);
      setDraftRect(null);
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);

    if (draftRect.width < minRectSize || draftRect.height < minRectSize) {
      setDragStart(null);
      setDraftRect(null);
      return;
    }

    setSelectedRect(draftRect);
    setDragStart(null);
    setDraftRect(null);
    onMaskChange(createMaskDataUrl(draftRect), false);
  };

  const handleClear = () => {
    setSelectedRect(null);
    setDraftRect(null);
    setDragStart(null);
    onMaskChange(null, false);
  };

  const handleUseFullImage = () => {
    const fullRect = { x: 0, y: 0, width: 1, height: 1 };
    setSelectedRect(fullRect);
    setDraftRect(null);
    setDragStart(null);
    onMaskChange(createMaskDataUrl(fullRect), true);
  };

  const getRelativePoint = (event: PointerEvent<HTMLDivElement>): Point | null => {
    const frame = frameRef.current;
    if (!frame) return null;

    const bounds = frame.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">4. 选择局部 mask</p>
          <p className="truncate text-[10px] font-medium text-slate-500">{imageName}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-500 transition-colors hover:text-slate-800"
          >
            <Eraser className="h-3.5 w-3.5" />
            清除
          </button>
          <button
            onClick={handleUseFullImage}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-2 py-1.5 text-[10px] font-bold text-white transition-colors hover:bg-black"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            整图
          </button>
        </div>
      </div>

      <div
        ref={frameRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative aspect-[16/9] cursor-crosshair overflow-hidden rounded-lg border border-slate-200 bg-white touch-none"
      >
        <img src={imageDataUrl} alt={imageName} className="h-full w-full select-none object-contain" draggable={false} />
        {activeRect && (
          <div
            className="absolute border-2 border-white bg-blue-500/35 shadow-[0_0_0_9999px_rgba(15,23,42,0.28)]"
            style={{
              left: `${activeRect.x * 100}%`,
              top: `${activeRect.y * 100}%`,
              width: `${activeRect.width * 100}%`,
              height: `${activeRect.height * 100}%`,
            }}
          />
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] font-medium text-slate-500">
        <span>{maskImageDataUrl ? (useFullImage ? '已选择整图区域' : '已选择矩形区域') : '拖拽绘制需要重绘的区域'}</span>
        <span>黑底白区 mask</span>
      </div>
    </div>
  );
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

function createMaskDataUrl(rect: Rect): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 576;

  const context = canvas.getContext('2d');
  if (!context) return '';

  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffffff';
  context.fillRect(
    Math.round(rect.x * canvas.width),
    Math.round(rect.y * canvas.height),
    Math.round(rect.width * canvas.width),
    Math.round(rect.height * canvas.height),
  );

  return canvas.toDataURL('image/png');
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
