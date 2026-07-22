import { ArrowLeftToLine } from 'lucide-react';
import type { DrawingViewerMode } from './drawingExpressionState';

interface DrawingViewerToolbarProps {
  viewerMode: DrawingViewerMode;
  hasOriginal: boolean;
  hasResult: boolean;
  canReturnToEditor: boolean;
  onChange: (viewerMode: DrawingViewerMode) => void;
  onReturnToEditor: () => void;
}

const viewerModes: Array<{ key: DrawingViewerMode; label: string }> = [
  { key: 'original', label: '原图' },
  { key: 'result', label: '结果图' },
  { key: 'compare', label: '左右对比' },
  { key: 'overlay', label: '叠加对比' },
];

export function DrawingViewerToolbar({
  viewerMode,
  hasOriginal,
  hasResult,
  canReturnToEditor,
  onChange,
  onReturnToEditor,
}: DrawingViewerToolbarProps) {
  return (
    <div className="viewer-toolbar relative z-10 flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2" data-testid="drawing-viewer-toolbar">
      <div className="min-w-0 overflow-x-auto overflow-y-hidden">
        <div className="flex min-w-max items-center gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="图纸查看方式">
          {viewerModes.map(mode => {
            const disabled = mode.key === 'original' ? !hasOriginal : mode.key === 'result' ? !hasResult : !hasOriginal || !hasResult;
            return (
              <button
                key={mode.key}
                type="button"
                role="tab"
                aria-selected={viewerMode === mode.key}
                disabled={disabled}
                onClick={() => onChange(mode.key)}
                className={`min-h-9 flex-none whitespace-nowrap rounded-md px-3 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-35 ${
                  viewerMode === mode.key ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
      </div>
      {canReturnToEditor ? (
        <button type="button" onClick={onReturnToEditor} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-blue-200 hover:text-blue-700">
          <ArrowLeftToLine className="h-4 w-4" />
          <span className="hidden sm:inline">返回编辑</span>
        </button>
      ) : null}
    </div>
  );
}
