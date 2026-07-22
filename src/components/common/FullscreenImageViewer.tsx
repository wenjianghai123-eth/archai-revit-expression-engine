import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { Expand, ImageOff, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { resolveAssetUrl } from '../../utils/assetUrl';

export interface FullscreenImageViewerRequest {
  imageUrl: string;
  title: string;
  imageType: 'original' | 'result';
}

interface FullscreenImageViewerContextValue {
  openImageViewer: (request: FullscreenImageViewerRequest) => void;
  closeImageViewer: () => void;
}

const noopContext: FullscreenImageViewerContextValue = {
  openImageViewer: () => undefined,
  closeImageViewer: () => undefined,
};

const FullscreenImageViewerContext = createContext<FullscreenImageViewerContextValue>(noopContext);

export function FullscreenImageViewerProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<FullscreenImageViewerRequest | null>(null);
  const openImageViewer = useCallback((next: FullscreenImageViewerRequest) => setRequest(next), []);
  const closeImageViewer = useCallback(() => setRequest(null), []);
  const value = useMemo(() => ({ openImageViewer, closeImageViewer }), [closeImageViewer, openImageViewer]);

  return (
    <FullscreenImageViewerContext.Provider value={value}>
      {children}
      <FullscreenImageViewer open={Boolean(request)} request={request} onClose={closeImageViewer} />
    </FullscreenImageViewerContext.Provider>
  );
}

export function useFullscreenImageViewer(): FullscreenImageViewerContextValue {
  return useContext(FullscreenImageViewerContext);
}

export function FullscreenImageViewer({
  open,
  request,
  onClose,
}: {
  open: boolean;
  request: FullscreenImageViewerRequest | null;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loadError, setLoadError] = useState(false);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    setLoadError(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === '+' || event.key === '=') setScale(value => Math.min(8, value + 0.25));
      if (event.key === '-') setScale(value => Math.max(0.25, value - 0.25));
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open, request?.imageUrl, reset]);

  if (!open || !request) return null;
  const imageUrl = resolveAssetUrl(request.imageUrl);

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setScale(value => Math.max(0.25, Math.min(8, value * (event.deltaY > 0 ? 0.9 : 1.1))));
  };
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: offset.x, originY: offset.y };
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset({ x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y });
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={request.title} className="fixed inset-0 z-[200] flex min-h-0 flex-col bg-slate-950/95 text-white">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{request.title}</p>
          <p className="text-[11px] text-slate-400">{request.imageType === 'original' ? '原始图片' : '生成结果'} · 滚轮缩放 · 拖拽移动 · 双击适应窗口</p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭大图查看器" className="rounded-lg border border-white/15 bg-white/10 p-2 hover:bg-white/20"><X className="h-5 w-5" /></button>
      </header>

      <div
        className="relative min-h-0 flex-1 touch-none cursor-grab overflow-hidden active:cursor-grabbing"
        onWheel={handleWheel}
        onDoubleClick={reset}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {loadError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-300"><ImageOff className="h-10 w-10" /><p className="text-sm font-bold">图片加载失败，请返回后重试。</p></div>
        ) : (
          <img
            src={imageUrl}
            alt={request.title}
            draggable={false}
            onError={() => setLoadError(true)}
            className="absolute left-1/2 top-1/2 max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] select-none object-contain will-change-transform"
            style={{ transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})` }}
          />
        )}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-slate-950/90 px-3 py-3">
        <button type="button" aria-label="缩小图片" onClick={() => setScale(value => Math.max(0.25, value - 0.25))} className="rounded-lg bg-white/10 p-2 hover:bg-white/20"><Minus className="h-4 w-4" /></button>
        <span className="w-16 text-center text-xs font-bold">{Math.round(scale * 100)}%</span>
        <button type="button" aria-label="放大图片" onClick={() => setScale(value => Math.min(8, value + 0.25))} className="rounded-lg bg-white/10 p-2 hover:bg-white/20"><Plus className="h-4 w-4" /></button>
        <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20"><Expand className="h-4 w-4" />适应窗口</button>
        <button type="button" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20"><RotateCcw className="h-4 w-4" />100%</button>
      </footer>
    </div>
  );
}
