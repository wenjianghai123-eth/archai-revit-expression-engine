import { Download, Expand, Maximize2, Minus, Plus } from 'lucide-react';

interface ZoomToolbarProps {
  zoom: number;
  isFullscreen: boolean;
  canDownload: boolean;
  isDownloading: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onToggleFullscreen: () => void;
  onDownload: () => void;
}

export function ZoomToolbar({
  zoom,
  isFullscreen,
  canDownload,
  isDownloading,
  onZoomIn,
  onZoomOut,
  onReset,
  onToggleFullscreen,
  onDownload,
}: ZoomToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-slate-200 bg-white px-3 py-2">
      <ToolbarButton label="缩小" onClick={onZoomOut}><Minus className="h-4 w-4" /></ToolbarButton>
      <span className="min-w-14 text-center text-[11px] font-black text-slate-500">{Math.round(zoom * 100)}%</span>
      <ToolbarButton label="放大" onClick={onZoomIn}><Plus className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton label="适应窗口" onClick={onReset}><Expand className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton label={isFullscreen ? '退出全屏' : '全屏'} onClick={onToggleFullscreen}><Maximize2 className="h-4 w-4" /></ToolbarButton>
      <ToolbarButton label={isDownloading ? '下载中…' : '下载'} onClick={onDownload} disabled={!canDownload || isDownloading}><Download className="h-4 w-4" /></ToolbarButton>
    </div>
  );
}

function ToolbarButton({ label, onClick, disabled = false, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
      {children}<span className="hidden sm:inline">{label}</span>
    </button>
  );
}
