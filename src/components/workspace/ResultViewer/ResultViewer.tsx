import { useEffect, useRef, useState } from 'react';
import { ImageIcon, LoaderCircle } from 'lucide-react';
import type { StepState } from '../../../types';
import { resolveAssetUrl } from '../../../utils/assetUrl';
import { buildResultImageFilename, downloadAsset, downloadFallbackMessage } from '../../../utils/downloadAsset';
import { CompareSlider } from './CompareSlider';
import { ImageCanvas, type ImageCanvasHandle } from './ImageCanvas';
import { OverlayCompare } from './OverlayCompare';
import { ResultTabs } from './ResultTabs';
import { ZoomToolbar } from './ZoomToolbar';
import type { ResultViewerData } from './resultViewerData';

interface ResultViewerProps {
  data: ResultViewerData;
  viewMode: StepState['viewMode'];
  onViewModeChange: (viewMode: StepState['viewMode']) => void;
  isGenerating?: boolean;
  generationProgress?: number;
  projectName?: string | null;
  featureLabel?: string;
  className?: string;
  showTabs?: boolean;
}

export function ResultViewer({
  data,
  viewMode,
  onViewModeChange,
  isGenerating = false,
  generationProgress = 0,
  projectName,
  featureLabel = '图纸表达',
  className = '',
  showTabs = true,
}: ResultViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<ImageCanvasHandle>(null);
  const sourceUrl = resolveAssetUrl(data.originalImage);
  const resultUrl = resolveAssetUrl(data.resultImage);
  const [zoom, setZoom] = useState(1);
  const [opacity, setOpacity] = useState(0.5);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    canvasRef.current?.reset();
  }, [resultUrl, sourceUrl, viewMode]);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen?.();
    } catch (error) {
      console.error('[result-viewer] fullscreen failed', error);
      setMessage('当前浏览器无法进入全屏。');
    }
  };

  const handleDownload = async () => {
    const useSource = viewMode === 'original';
    const url = useSource ? sourceUrl : resultUrl;
    const assetId = useSource ? data.originalAssetId : data.resultAssetId;
    if ((!url && !assetId) || isDownloading) return;
    setIsDownloading(true);
    setMessage(null);
    try {
      await downloadAsset({ url, assetId }, buildResultImageFilename({ projectName, featureLabel: useSource ? `${featureLabel}-原图` : featureLabel }));
      setMessage('已开始下载');
    } catch (error) {
      setMessage(error instanceof Error && error.message === downloadFallbackMessage ? downloadFallbackMessage : '下载失败，请稍后重试。');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <section ref={rootRef} className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${isFullscreen ? 'h-screen w-screen rounded-none' : ''} ${className}`}>
      <header className="flex min-h-14 shrink-0 flex-col items-start justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-900">图纸表达结果查看器</p>
          <p className="hidden text-[10px] font-semibold text-slate-400 sm:block">滚轮缩放 · 拖拽移动 · 双击适应窗口</p>
        </div>
        {showTabs ? <div className="max-w-full overflow-x-auto">
          <ResultTabs value={viewMode} hasSource={Boolean(sourceUrl)} hasResult={Boolean(resultUrl)} onChange={onViewModeChange} />
        </div> : null}
      </header>

      <div className="drawing-canvas-container relative min-h-0 flex-1 bg-slate-50">
        <ImageCanvas ref={canvasRef} onZoomChange={setZoom}>
          <ViewerContent viewMode={viewMode} sourceUrl={sourceUrl} resultUrl={resultUrl} opacity={opacity} />
        </ImageCanvas>
        {isGenerating ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-center gap-2 bg-blue-600/90 px-4 py-2 text-xs font-black text-white shadow">
            <LoaderCircle className="h-4 w-4 animate-spin" />正在生成图纸表达结果… {generationProgress}%
          </div>
        ) : null}
      </div>

      {viewMode === 'overlay' && sourceUrl && resultUrl ? (
        <label className="flex shrink-0 items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-600">
          <span className="whitespace-nowrap">结果透明度</span>
          <input aria-label="结果透明度" type="range" min="0" max="1" step="0.01" value={opacity} onChange={event => setOpacity(Number(event.currentTarget.value))} className="w-full accent-blue-600" />
          <span className="w-10 text-right">{Math.round(opacity * 100)}%</span>
        </label>
      ) : null}

      <ZoomToolbar
        zoom={zoom}
        isFullscreen={isFullscreen}
        canDownload={viewMode === 'original' ? Boolean(sourceUrl || data.originalAssetId) : Boolean(resultUrl || data.resultAssetId)}
        isDownloading={isDownloading}
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onReset={() => canvasRef.current?.reset()}
        onToggleFullscreen={() => void toggleFullscreen()}
        onDownload={() => void handleDownload()}
      />
      {message ? <p role="status" className="shrink-0 border-t border-slate-100 px-3 py-1.5 text-center text-[10px] font-bold text-slate-500">{message}</p> : null}
    </section>
  );
}

function ViewerContent({ viewMode, sourceUrl, resultUrl, opacity }: { viewMode: StepState['viewMode']; sourceUrl: string; resultUrl: string; opacity: number }) {
  if (viewMode === 'original') return sourceUrl ? <ViewerImage src={sourceUrl} alt="原图" /> : <EmptyViewer message="请先上传原始图纸" />;
  if (viewMode === 'compare') return sourceUrl && resultUrl ? <CompareSlider sourceImageUrl={sourceUrl} resultImageUrl={resultUrl} /> : <EmptyViewer message="需要原图和结果图才能对比" />;
  if (viewMode === 'overlay') return sourceUrl && resultUrl ? <OverlayCompare sourceImageUrl={sourceUrl} resultImageUrl={resultUrl} opacity={opacity} /> : <EmptyViewer message="需要原图和结果图才能叠加对比" />;
  return resultUrl ? <ViewerImage src={resultUrl} alt="结果图" /> : <EmptyViewer message="生成完成后将在中央显示大图结果" />;
}

function ViewerImage({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} draggable={false} className="h-full w-full bg-white object-contain" />;
}

function EmptyViewer({ message }: { message: string }) {
  return <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50 px-6 text-center text-slate-400"><ImageIcon className="mb-3 h-10 w-10 opacity-40" /><p className="text-sm font-bold">{message}</p></div>;
}
