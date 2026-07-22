import { lazy, Suspense, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Shield, Upload, X } from 'lucide-react';
import { GenerationConfig, GenerationProvider, GenerationStep, MaterialReplaceTargetObject, SemanticObjectSelection, UploadedImage } from '../../types';
import { GenerationImageViewer } from '../common/GenerationImageViewer';

const MaskEditor = lazy(() => import('../MaskEditor').then(module => ({ default: module.MaskEditor })));
const SmartMaskEditor = lazy(() => import('./SmartMaskEditor').then(module => ({ default: module.SmartMaskEditor })));

interface InpaintMaskPanelProps {
  inputImage: UploadedImage | null;
  maskImageDataUrl: string | null;
  protectionMaskDataUrl?: string | null;
  useFullImageMask: boolean;
  providerForStatus: GenerationProvider | null;
  onUploadInput: () => void;
  onUpdateMaskImage: (maskDataUrl: string | null, useFullImage: boolean, feather?: number, protectionMaskDataUrl?: string | null, expansion?: number, hasValidMaskPixels?: boolean) => void;
  materialTexturesPanel: ReactNode;
  mode?: 'local-inpaint' | 'material-replace';
  config?: GenerationConfig;
  resultImageUrl?: string | null;
  resultAssetId?: string | null;
  materialTextureUrl?: string | null;
  onUpdateConfig?: (config: Partial<GenerationConfig>) => void;
}

const objectLabels: Record<MaterialReplaceTargetObject, string> = {
  floor: '地面', wall: '墙面', ceiling: '天花', cabinet: '柜体', sofa: '沙发', 'table-chair': '桌椅', lighting: '灯具', plant: '绿植', 'door-window': '门窗', 'feature-wall': '背景墙', other: '其他',
};

export function InpaintMaskPanel({
  inputImage,
  maskImageDataUrl,
  protectionMaskDataUrl = null,
  useFullImageMask,
  providerForStatus,
  onUploadInput,
  onUpdateMaskImage,
  materialTexturesPanel,
  mode = 'local-inpaint',
  config,
  resultImageUrl,
  resultAssetId,
  materialTextureUrl,
  onUpdateConfig,
}: InpaintMaskPanelProps) {
  const isMaterialReplace = mode === 'material-replace';
  const isSemantic = isMaterialReplace && config?.editMode !== 'mask';
  const isSmartMask = isMaterialReplace && config?.editMode === 'mask' && config.maskSelectionMode === 'smart';
  const [view, setView] = useState<'selection' | 'original' | 'control' | 'result'>('selection');
  const sourceUrl = inputImage?.previewUrl || inputImage?.publicUrl || inputImage?.url || inputImage?.dataUrl || null;

  useEffect(() => {
    if (resultImageUrl) setView('result');
  }, [resultImageUrl]);

  const views = [
    ['selection', isSemantic ? '对象选择' : isSmartMask ? '智能 Mask' : '精致 Mask'] as const,
    ['original', '原图'] as const,
    ...(isMaterialReplace ? [['control', '控制图'] as const] : []),
    ['result', '结果图'] as const,
  ];

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white/70 px-4 py-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{isMaterialReplace ? '材质替换工作区' : '统一局部重绘工作区'}</span>
          <p className="text-xs font-medium text-slate-500">{isSemantic ? '选择对象类型后在图片内连续点击，形成可控的多对象语义锚点。' : isSmartMask ? '先粗略涂抹，再由服务端识别完整对象；确认前不会生成。' : '蓝色是编辑区，红色是保护区；未选区域保持不变。'}</p>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{providerForStatus || 'provider 待连接'}</span>
      </div>
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-100 bg-white/60 p-2">
        {views.map(([value, label]) => <button key={value} type="button" disabled={value === 'result' && !resultImageUrl} onClick={() => setView(value)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-black ${view === value ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-100'} disabled:opacity-40`}>{label}</button>)}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 custom-scrollbar">
        <div className="flex min-h-72 flex-1 lg:min-h-[420px] lg:h-[52vh]">
          <Suspense fallback={<div className="flex flex-1 items-center justify-center rounded-xl bg-slate-50 text-sm font-bold text-slate-400">正在加载 Mask 编辑器…</div>}>
          {!inputImage || !sourceUrl ? <UploadPlaceholder onUpload={onUploadInput} /> : view === 'selection' ? (
            isSemantic ? <SemanticObjectSelector imageUrl={sourceUrl} config={config} onUpdateConfig={onUpdateConfig} /> : isSmartMask ? (
              <SmartMaskEditor
                inputImage={inputImage}
                imageUrl={sourceUrl}
                maskImageDataUrl={maskImageDataUrl}
                protectionMaskDataUrl={protectionMaskDataUrl}
                useFullImageMask={useFullImageMask}
                config={config}
                onUpdateMaskImage={onUpdateMaskImage}
                onUpdateConfig={onUpdateConfig}
              />
            ) : (
              <MaskEditor imageDataUrl={sourceUrl} imageName={inputImage.name} maskImageDataUrl={maskImageDataUrl} protectionMaskDataUrl={protectionMaskDataUrl} useFullImage={useFullImageMask} onMaskChange={onUpdateMaskImage} />
            )
          ) : view === 'original' ? (
            <ImageFrame src={sourceUrl} alt="原图" />
          ) : view === 'control' ? (
            <MaterialControlPreview sourceUrl={sourceUrl} maskUrl={maskImageDataUrl} protectionMaskUrl={protectionMaskDataUrl} materialUrl={materialTextureUrl} selections={config?.semanticObjectSelections || []} config={config} />
          ) : resultImageUrl ? (
            <GenerationImageViewer sourceImageUrl={sourceUrl} sourceImageAssetId={inputImage.assetId} resultImageUrl={resultImageUrl} resultImageAssetId={resultAssetId || undefined} featureName={isMaterialReplace ? '材质替换' : '局部重绘'} step={isMaterialReplace ? GenerationStep.MaterialReplace : GenerationStep.LocalInpainting} className="h-full w-full" frameClassName="h-full w-full" />
          ) : <div className="flex flex-1 items-center justify-center rounded-xl bg-slate-50 text-sm font-bold text-slate-400">生成完成后可查看结果</div>}
          </Suspense>
        </div>
        {materialTexturesPanel}
      </div>
    </main>
  );
}

function SemanticObjectSelector({ imageUrl, config, onUpdateConfig }: { imageUrl: string; config?: GenerationConfig; onUpdateConfig?: (config: Partial<GenerationConfig>) => void }) {
  const selections = config?.semanticObjectSelections || [];
  const activeType = config?.targetObjectType || 'floor';
  const [imageSize, setImageSize] = useState({ width: 16, height: 9 });
  useEffect(() => { void loadImage(imageUrl).then(image => setImageSize({ width: image.naturalWidth || 16, height: image.naturalHeight || 9 })); }, [imageUrl]);
  const addSelection = (event: MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const selection: SemanticObjectSelection = { id: `semantic-${Date.now()}-${selections.length}`, objectType: activeType, x: clamp01((event.clientX - bounds.left) / bounds.width), y: clamp01((event.clientY - bounds.top) / bounds.height), label: objectLabels[activeType] };
    onUpdateConfig?.({ semanticObjectSelections: [...selections, selection] });
  };
  return <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
    <div className="flex items-center justify-between text-xs font-bold text-slate-600"><span>当前对象：{objectLabels[activeType]}</span><span>已选择 {selections.length} 个</span></div>
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden"><button type="button" onClick={addSelection} style={{ aspectRatio: `${imageSize.width} / ${imageSize.height}`, width: imageSize.width >= imageSize.height ? '100%' : 'auto', height: imageSize.width < imageSize.height ? '100%' : 'auto' }} className="relative max-h-full max-w-full overflow-hidden rounded-lg bg-slate-900/5" aria-label={`在图片中选择${objectLabels[activeType]}`}>
      <img src={imageUrl} alt="语义对象选择" className="absolute inset-0 h-full w-full" draggable={false} />
      {selections.map((selection, index) => <span key={selection.id} className="pointer-events-none absolute flex h-7 min-w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-emerald-600 px-1 text-[10px] font-black text-white shadow-lg" style={{ left: `${selection.x * 100}%`, top: `${selection.y * 100}%` }} title={selection.label}>{index + 1}</span>)}
    </button></div>
    <div className="flex flex-wrap gap-1.5">{selections.map((selection, index) => <button key={selection.id} type="button" onClick={() => onUpdateConfig?.({ semanticObjectSelections: selections.filter(item => item.id !== selection.id) })} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">{index + 1}. {objectLabels[selection.objectType]} <X className="h-3 w-3 text-rose-500" /></button>)}</div>
  </div>;
}

function MaterialControlPreview({ sourceUrl, maskUrl, protectionMaskUrl, materialUrl, selections, config }: { sourceUrl: string; maskUrl: string | null; protectionMaskUrl: string | null; materialUrl?: string | null; selections: SemanticObjectSelection[]; config?: GenerationConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderRevisionRef = useRef(0);
  useEffect(() => {
    const revision = renderRevisionRef.current + 1;
    renderRevisionRef.current = revision;
    void renderMaterialControl({ sourceUrl, maskUrl, protectionMaskUrl, materialUrl, selections, config })
      .then(rendered => {
        const canvas = canvasRef.current;
        if (!canvas || renderRevisionRef.current !== revision) return;
        canvas.width = rendered.width;
        canvas.height = rendered.height;
        canvas.getContext('2d')?.drawImage(rendered, 0, 0);
      })
      .catch(error => console.error('[material-control-preview] render failed', error));
  }, [config, materialUrl, maskUrl, protectionMaskUrl, selections, sourceUrl]);
  return <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><canvas ref={canvasRef} className="max-h-full max-w-full object-contain" /><span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[10px] font-black text-slate-700 shadow"><Shield className="mr-1 inline h-3 w-3 text-rose-500" />蓝色/材质为替换区，红色为保护区</span>{!maskUrl && selections.length > 0 ? <span className="absolute bottom-3 left-3 rounded-lg bg-emerald-950/85 px-3 py-1.5 text-[10px] font-bold text-white">语义模式以编号锚点作为对象控制</span> : null}</div>;
}

async function renderMaterialControl(input: { sourceUrl: string; maskUrl: string | null; protectionMaskUrl: string | null; materialUrl?: string | null; selections: SemanticObjectSelection[]; config?: GenerationConfig }): Promise<HTMLCanvasElement> {
  const source = await loadImage(input.sourceUrl);
  const naturalWidth = source.naturalWidth || 1024;
  const naturalHeight = source.naturalHeight || 576;
  const previewScale = Math.min(1, 1600 / Math.max(naturalWidth, naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(naturalWidth * previewScale));
  canvas.height = Math.max(1, Math.round(naturalHeight * previewScale));
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (input.maskUrl) {
    const overlay = document.createElement('canvas'); overlay.width = canvas.width; overlay.height = canvas.height;
    const overlayContext = overlay.getContext('2d');
    if (overlayContext) {
      if (input.materialUrl) {
        const material = await loadImage(input.materialUrl);
        const tile = createMaterialPreviewTile(material, canvas.width, input.config);
        const pattern = overlayContext.createPattern(tile, 'repeat');
        applyMaterialPatternTransform(pattern, canvas, input.config);
        if (pattern) { overlayContext.fillStyle = pattern; overlayContext.fillRect(0, 0, overlay.width, overlay.height); }
      } else { overlayContext.fillStyle = 'rgba(16,185,129,0.7)'; overlayContext.fillRect(0, 0, overlay.width, overlay.height); }
      const alphaMask = await createAlphaMask(input.maskUrl, canvas.width, canvas.height);
      overlayContext.globalCompositeOperation = 'destination-in'; overlayContext.drawImage(alphaMask, 0, 0); overlayContext.globalCompositeOperation = 'source-over';
      context.globalAlpha = 0.72; context.drawImage(overlay, 0, 0); context.globalAlpha = 1;
    }
  }
  input.selections.forEach((selection, index) => { context.fillStyle = '#059669'; context.beginPath(); context.arc(selection.x * canvas.width, selection.y * canvas.height, Math.max(12, canvas.width * 0.012), 0, Math.PI * 2); context.fill(); context.fillStyle = '#fff'; context.font = `bold ${Math.max(12, canvas.width * 0.012)}px sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(String(index + 1), selection.x * canvas.width, selection.y * canvas.height); });
  if (input.protectionMaskUrl) { const protection = await createTintedMask(input.protectionMaskUrl, canvas.width, canvas.height, [244, 63, 94, 135]); context.drawImage(protection, 0, 0); }
  return canvas;
}

function createMaterialPreviewTile(material: HTMLImageElement, previewWidth: number, config?: GenerationConfig): HTMLCanvasElement {
  const realSizeMm = Math.max(20, Math.min(5000, config?.materialRealSizeMm || 600));
  const jointWidthMm = Math.max(0, Math.min(50, config?.materialJointWidthMm ?? 2));
  const tileSize = Math.max(24, Math.min(Math.round(previewWidth * 0.4), Math.round(previewWidth * realSizeMm / 8000)));
  const jointSize = Math.max(0, Math.min(8, Math.round(tileSize * jointWidthMm / realSizeMm)));
  const tile = document.createElement('canvas');
  tile.width = tileSize + jointSize;
  tile.height = Math.max(16, Math.round(tileSize * (material.naturalHeight || 1) / Math.max(1, material.naturalWidth || 1))) + jointSize;
  const context = tile.getContext('2d');
  if (!context) return tile;
  context.fillStyle = '#cbd5e1';
  context.fillRect(0, 0, tile.width, tile.height);
  context.drawImage(material, 0, 0, tile.width - jointSize, tile.height - jointSize);
  return tile;
}

function applyMaterialPatternTransform(pattern: CanvasPattern | null, canvas: HTMLCanvasElement, config?: GenerationConfig): void {
  if (!pattern || typeof pattern.setTransform !== 'function' || typeof DOMMatrix === 'undefined') return;
  const configuredOrigin = config?.materialTextureOrigin || { x: 0.5, y: 0.5 };
  const alignment = config?.materialTextureAlignment || 'auto';
  const origin = alignment === 'center'
    ? { x: 0.5, y: 0.5 }
    : alignment === 'edge'
      ? { x: 0, y: 0 }
      : configuredOrigin;
  const direction = config?.materialDirection || 'auto';
  const angle = direction === 'vertical' ? 90 : direction === 'diagonal' || direction === 'herringbone' ? 45 : 0;
  pattern.setTransform(new DOMMatrix().translate(origin.x * canvas.width, origin.y * canvas.height).rotate(angle));
}

async function createAlphaMask(url: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const image = await loadImage(url); const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const context = canvas.getContext('2d'); if (!context) return canvas; context.drawImage(image, 0, 0, width, height); const pixels = context.getImageData(0, 0, width, height); for (let i = 0; i < pixels.data.length; i += 4) pixels.data[i + 3] = pixels.data[i]; context.putImageData(pixels, 0, 0); return canvas;
}
async function createTintedMask(url: string, width: number, height: number, color: [number, number, number, number]): Promise<HTMLCanvasElement> { const alpha = await createAlphaMask(url, width, height); const context = alpha.getContext('2d'); if (!context) return alpha; const pixels = context.getImageData(0, 0, width, height); for (let i = 0; i < pixels.data.length; i += 4) { const a = pixels.data[i + 3] / 255; pixels.data[i] = color[0]; pixels.data[i + 1] = color[1]; pixels.data[i + 2] = color[2]; pixels.data[i + 3] = Math.round(color[3] * a); } context.putImageData(pixels, 0, 0); return alpha; }
function loadImage(url: string): Promise<HTMLImageElement> { return new Promise((resolve, reject) => { const image = new Image(); image.crossOrigin = 'anonymous'; image.onload = () => resolve(image); image.onerror = () => reject(new Error('图片加载失败')); image.src = url; }); }
function ImageFrame({ src, alt }: { src: string; alt: string }) { return <div className="flex flex-1 items-center justify-center overflow-hidden rounded-xl bg-slate-50"><img src={src} alt={alt} className="max-h-full max-w-full object-contain" /></div>; }
function UploadPlaceholder({ onUpload }: { onUpload: () => void }) { return <button type="button" onClick={onUpload} className="flex aspect-video w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-white text-slate-400 transition hover:border-blue-200 hover:bg-blue-50/40"><Upload className="mb-3 h-9 w-9" /><span className="text-sm font-bold text-slate-700">上传参考图开始编辑</span><span className="mt-1 text-xs font-medium">PNG / JPG / WEBP</span></button>; }
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
