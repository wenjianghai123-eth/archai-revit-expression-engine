import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

interface CompareSliderProps {
  sourceImageUrl: string;
  resultImageUrl: string;
}

export function CompareSlider({ sourceImageUrl, resultImageUrl }: CompareSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [position, setPosition] = useState(50);

  const updatePosition = (clientX: number) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    setPosition(Math.max(2, Math.min(98, ((clientX - bounds.left) / bounds.width) * 100)));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updatePosition(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (draggingRef.current) updatePosition(event.clientX);
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setPosition(current => Math.max(2, Math.min(98, current + (event.key === 'ArrowRight' ? 2 : -2))));
  };

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label="拖动查看图纸表达前后对比"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
      className="result-viewer-compare relative h-full w-full touch-none overflow-hidden"
      style={{ '--result-compare-position': `${position}%` } as CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
    >
      <img src={sourceImageUrl} alt="原图" draggable={false} className="result-viewer-compare-source h-full w-full bg-white object-contain" />
      <div className="result-viewer-compare-result h-full w-full bg-white">
        <img src={resultImageUrl} alt="结果图" draggable={false} className="h-full w-full object-contain" />
      </div>
      <span className="absolute left-3 top-3 hidden rounded-full bg-slate-950/80 px-2 py-1 text-[10px] font-black text-white md:block">原图</span>
      <span className="absolute right-3 top-3 hidden rounded-full bg-white/90 px-2 py-1 text-[10px] font-black text-slate-800 shadow md:block">结果图</span>
      <div className="result-viewer-compare-divider absolute inset-y-0 hidden w-0.5 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.2)] md:block">
        <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white shadow-lg">⇆</span>
      </div>
    </div>
  );
}
