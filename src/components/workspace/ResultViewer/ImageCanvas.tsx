import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';

export interface ImageCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

interface ImageCanvasProps {
  children: ReactNode;
  onZoomChange?: (zoom: number) => void;
}

const minimumZoom = 0.25;
const maximumZoom = 5;
const zoomStep = 0.2;

export const ImageCanvas = forwardRef<ImageCanvasHandle, ImageCanvasProps>(function ImageCanvas(
  { children, onZoomChange },
  ref,
) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const updateZoom = (next: number) => {
    const normalized = Math.max(minimumZoom, Math.min(maximumZoom, Number(next.toFixed(2))));
    setZoom(normalized);
    onZoomChange?.(normalized);
  };

  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    onZoomChange?.(1);
  };

  useImperativeHandle(ref, () => ({
    zoomIn: () => updateZoom(zoom + zoomStep),
    zoomOut: () => updateZoom(zoom - zoomStep),
    reset,
  }), [zoom]);

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    updateZoom(zoom + (event.deltaY < 0 ? zoomStep : -zoomStep));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
    setOffset(current => ({ x: current.x + deltaX, y: current.y + deltaY }));
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const transform: CSSProperties = {
    transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
    transformOrigin: 'center center',
  };

  return (
    <div
      data-testid="result-image-canvas"
      aria-label="大图查看画布，可滚轮缩放并拖拽移动"
      className={`canvas-stage relative h-full min-h-0 min-w-0 w-full touch-none select-none overflow-hidden bg-[radial-gradient(circle_at_center,_#ffffff_0%,_#f8fafc_60%,_#eef2f7_100%)] ${dragRef.current ? 'cursor-grabbing' : 'cursor-grab'}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onDoubleClick={reset}
    >
      <div className="canvas-overlay absolute inset-0 transition-transform duration-100 ease-out" style={transform}>
        {children}
      </div>
    </div>
  );
});
