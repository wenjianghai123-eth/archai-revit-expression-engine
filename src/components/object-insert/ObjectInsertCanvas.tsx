import type { CSSProperties, PointerEvent, RefObject } from 'react';
import { Move, RotateCw } from 'lucide-react';
import type { ObjectPlacement } from '../../types';

export type ObjectInsertCanvasInteraction = 'move' | 'resize' | 'rotate';

export interface ObjectInsertCanvasItem {
  id: string;
  label: string;
  imageUrl: string;
  placement: ObjectPlacement;
  visible: boolean;
  locked: boolean;
  zIndex: number;
}

export function ObjectInsertCanvas({ sourceUrl, sourceLabel, aspectRatio, items, activeItemId, selected, showGuides, stageRef, getPlacementStyle, onClearSelection, onStartInteraction }: {
  sourceUrl: string;
  sourceLabel: string;
  aspectRatio: string;
  items: ObjectInsertCanvasItem[];
  activeItemId: string | null;
  selected: boolean;
  showGuides: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
  getPlacementStyle: (placement: ObjectPlacement) => CSSProperties;
  onClearSelection: () => void;
  onStartInteraction: (itemId: string, mode: ObjectInsertCanvasInteraction, event: PointerEvent<HTMLElement>) => void;
}) {
  return (
    <div ref={stageRef} className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-950 shadow-inner" style={{ aspectRatio }} onPointerDown={onClearSelection}>
      <img src={sourceUrl} alt={sourceLabel} className="absolute inset-0 h-full w-full select-none object-contain" draggable={false} />
      {showGuides ? <>
        <div className="pointer-events-none absolute left-0 right-0 top-1/2 z-[5] border-t border-dashed border-cyan-300/70" />
        <div className="pointer-events-none absolute bottom-[18%] left-0 right-0 z-[5] border-t border-dashed border-amber-300/80" />
        <span className="pointer-events-none absolute bottom-[18%] left-2 z-[5] -translate-y-1 rounded bg-slate-950/70 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">落地参考</span>
      </> : null}
      {items.filter(item => item.visible).map(item => {
        const active = item.id === activeItemId;
        return <div key={item.id} className={`absolute touch-none select-none ${item.locked ? 'cursor-not-allowed' : 'cursor-move'} ${active && selected ? 'ring-2 ring-blue-400' : 'ring-1 ring-white/70'}`} style={{ ...getPlacementStyle(item.placement), zIndex: 10 + item.zIndex }} onPointerDown={event => { event.stopPropagation(); if (!item.locked) onStartInteraction(item.id, 'move', event); }}>
          <img src={item.imageUrl} alt={item.label} className="h-full w-full select-none object-contain" draggable={false} />
          {showGuides && active ? <div className="pointer-events-none absolute -bottom-px left-1/2 h-5 border-l border-dashed border-amber-300" /> : null}
          {active && selected && !item.locked ? <>
            <button type="button" aria-label="旋转物体" className="absolute left-1/2 top-0 flex h-8 w-8 -translate-x-1/2 -translate-y-11 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-600 shadow-lg" onPointerDown={event => { event.stopPropagation(); onStartInteraction(item.id, 'rotate', event); }}><RotateCw className="h-4 w-4" /></button>
            <button type="button" aria-label="缩放物体" className="absolute bottom-0 right-0 flex h-8 w-8 translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-600 shadow-lg" onPointerDown={event => { event.stopPropagation(); onStartInteraction(item.id, 'resize', event); }}><Move className="h-4 w-4 rotate-45" /></button>
          </> : null}
        </div>;
      })}
    </div>
  );
}
