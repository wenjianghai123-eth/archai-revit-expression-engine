import React, { useCallback, useRef, useState } from 'react';

interface OverlayCompareViewerProps {
  originalImageUrl?: string | null;
  generatedImageUrl?: string | null;
  originalLabel?: string;
  generatedLabel?: string;
  className?: string;
}

export function OverlayCompareViewer({
  originalImageUrl,
  generatedImageUrl,
  originalLabel = '原图',
  generatedLabel = '结果图',
  className = '',
}: OverlayCompareViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);

  const updatePosition = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const nextPosition = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(98, Math.max(2, nextPosition)));
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePosition(event.clientX);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.buttons !== 1) return;
    updatePosition(event.clientX);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setPosition(value => Math.max(2, value - 2));
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setPosition(value => Math.min(98, value + 2));
    }
  };

  if (!originalImageUrl || !generatedImageUrl) {
    return (
      <div className={`flex h-full min-h-[220px] items-center justify-center bg-slate-50 text-center text-sm font-medium text-slate-400 ${className}`}>
        生成结果后可查看叠加对比
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label="拖拽查看原图和生成图叠加对比"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
      className={`relative h-full min-h-[220px] touch-none select-none overflow-hidden bg-white outline-none ${className}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
    >
      <img src={originalImageUrl} alt={originalLabel} className="absolute inset-0 h-full w-full object-contain" referrerPolicy="no-referrer" />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        <img src={generatedImageUrl} alt={generatedLabel} className="h-full w-full object-contain" referrerPolicy="no-referrer" />
      </div>
      <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[10px] font-bold text-slate-700 shadow-sm">{generatedLabel}</span>
      <span className="absolute right-3 top-3 rounded-full bg-slate-900/80 px-2 py-1 text-[10px] font-bold text-white shadow-sm">{originalLabel}</span>
      <div className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.15)]" style={{ left: `${position}%` }}>
        <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-slate-900/80 text-xs font-black text-white shadow-lg">
          ↔
        </div>
      </div>
    </div>
  );
}
