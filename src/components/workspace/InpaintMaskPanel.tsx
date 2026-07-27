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
  editorOpenRequest?: number;
}

const objectLabels: Record<MaterialReplaceTargetObject, string> = {
  floor: '地面',
  wall: '墙面',
  ceiling: '天花',
  cabinet: '柜体',
  sofa: '沙发',
  'table-chair': '桌椅',
  lighting: '灯具',
  plant: '绿植',
  artwork: '装饰画',
  decor: '摆件',
  'door-window': '门窗',
  'feature-wall': '背景墙',
  other: '其他',
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
  editorOpenRequest = 0,
}: InpaintMaskPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const isMaterialReplace = mode === 'material-replace';
  const configuredMaterialSelectionMode = config?.selectionMode === 'semantic-auto' || config?.selectionMode === 'smart-select'
    ? config.selectionMode
    : null;
  const activeSelectionMode = isMaterialReplace
    ? configuredMaterialSelectionMode || (config?.editMode === 'mask' ? 'smart-select' : 'semantic-auto')
    : 'local-paint';
  const isSemantic = isMaterialReplace && activeSelectionMode === 'semantic-auto';
  const isSmartMask = isMaterialReplace && activeSelectionMode === 'smart-select';
  const [view, setView] = useState<'selection' | 'original' | 'control' | 'result'>('selection');
  const [panelSize, setPanelSize] = useState({ width: 0, height: 0 });
  const [draftMask, setDraftMask] = useState(maskImageDataUrl);
  const [draftProtectionMask, setDraftProtectionMask] = useState(protectionMaskDataUrl);
  const [draftUseFullImage, setDraftUseFullImage] = useState(useFullImageMask);
  const [draftFeather, setDraftFeather] = useState(config?.feather || 0);
  const [draftExpansion, setDraftExpansion] = useState(config?.maskExpansion || 0);
  const [draftHasValidPixels, setDraftHasValidPixels] = useState(Boolean(maskImageDataUrl || useFullImageMask));
  const sourceUrl = inputImage?.previewUrl || inputImage?.publicUrl || inputImage?.url || inputImage?.dataUrl || null;

  const resetDraftFromConfirmed = () => {
    setDraftMask(maskImageDataUrl);
    setDraftProtectionMask(protectionMaskDataUrl);
    setDraftUseFullImage(useFullImageMask);
    setDraftFeather(config?.feather || 0);
    setDraftExpansion(config?.maskExpansion || 0);
    setDraftHasValidPixels(Boolean(maskImageDataUrl || useFullImageMask));
  };

  const handleDraftMaskChange: InpaintMaskPanelProps['onUpdateMaskImage'] = (
    nextMask,
    nextUseFullImage,
    feather = 0,
    nextProtectionMask = null,
    expansion = 0,
    hasValidMaskPixels,
  ) => {
    if (!isMaterialReplace) {
      onUpdateMaskImage(nextMask, nextUseFullImage, feather, nextProtectionMask, expansion, hasValidMaskPixels);
      return;
    }
    setDraftMask(nextMask);
    setDraftProtectionMask(nextProtectionMask);
    setDraftUseFullImage(nextUseFullImage);
    setDraftFeather(feather);
    setDraftExpansion(expansion);
    setDraftHasValidPixels(nextMask ? hasValidMaskPixels ?? true : nextUseFullImage);
  };

  const confirmDraftMask = () => {
    onUpdateMaskImage(draftMask, draftUseFullImage, draftFeather, draftProtectionMask, draftExpansion, draftHasValidPixels);
    onUpdateConfig?.({
      selectionMode: draftMask || draftUseFullImage ? 'smart-select' : 'semantic-auto',
      maskSelectionMode: draftMask || draftUseFullImage ? 'smart' : undefined,
      maskWorkflowMode: draftMask || draftUseFullImage ? 'smart' : 'none',
      maskWorkflowActive: Boolean(draftMask || draftUseFullImage),
      smartSelectionStatus: draftMask || draftUseFullImage ? 'confirmed' : 'idle',
      smartSelectionConfirmed: undefined,
      smartMaskConfirmed: undefined,
      smartMaskIsRefining: false,
      smartMaskStage: undefined,
    });
    setView(isMaterialReplace ? 'control' : 'original');
  };

  const cancelMaskEditing = () => {
    resetDraftFromConfirmed();
    onUpdateConfig?.({
      selectionMode: maskImageDataUrl || useFullImageMask
        ? 'smart-select'
        : 'semantic-auto',
      maskWorkflowMode: maskImageDataUrl || useFullImageMask
        ? 'smart'
        : 'none',
      maskWorkflowActive: Boolean(maskImageDataUrl || useFullImageMask),
      smartMaskIsRefining: false,
      smartMaskStage: undefined,
    });
    setView('original');
  };

  useEffect(() => {
    if (resultImageUrl) setView('result');
  }, [resultImageUrl]);

  useEffect(() => {
    if (!isMaterialReplace || editorOpenRequest === 0) return;
    resetDraftFromConfirmed();
    setView('selection');
  }, [editorOpenRequest]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === 'undefined') return;
    const updateSize = () => {
      const rect = panel.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setPanelSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || import.meta.env.MODE === 'test' || !isMaterialReplace) return;
    console.debug('[MaskEditor render]', {
      isMaskEditorOpen: view === 'selection',
      maskMode: isSmartMask ? 'smart' : isSemantic ? 'semantic' : 'local-precise',
      sourceImageUrl: Boolean(sourceUrl),
      containerWidth: panelSize.width,
      containerHeight: panelSize.height,
      imageLoaded: Boolean(sourceUrl),
    });
  }, [isMaterialReplace, isSemantic, isSmartMask, panelSize.height, panelSize.width, sourceUrl, view]);

  const views = [
    ['selection', isSemantic ? '自动同类' : isSmartMask ? '智能选区' : '局部涂抹'] as const,
    ['original', '原图'] as const,
    ...(isMaterialReplace ? [['control', '控制图'] as const] : []),
    ['result', '结果图'] as const,
  ];

  return (
    <main ref={panelRef} className="replacement-center-panel flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white/70 px-4 py-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{isMaterialReplace ? '材质替换工作区' : '统一局部重绘工作区'}</span>
          <p className="text-xs font-medium text-slate-500">{isSemantic ? '不指定局部区域，由系统按已选目标区域自动替换同类目标。' : isSmartMask ? '在目标对象或局部材质区域上轻刷，系统自动扩展为完整选区；确认前不会生成。' : '手动绘制需要修改的局部修饰区域，蓝色是编辑区，红色是保护区。'}</p>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{providerForStatus ? '后端生成' : '后端待连接'}</span>
      </div>
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-100 bg-white/60 p-2">
        {views.map(([value, label]) => <button key={value} type="button" disabled={value === 'result' && !resultImageUrl} onClick={() => setView(value)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-black ${view === value ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-100'} disabled:opacity-40`}>{label}</button>)}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 custom-scrollbar">
        <div className="flex min-h-72 min-w-0 flex-1 lg:min-h-[420px] lg:h-[52vh]">
          <Suspense fallback={<div className="flex flex-1 items-center justify-center rounded-xl bg-slate-50 text-sm font-bold text-slate-400">正在加载 Mask 编辑器…</div>}>
          {!inputImage || !sourceUrl ? <UploadPlaceholder onUpload={onUploadInput} /> : view === 'selection' ? (
            isSemantic ? <SemanticObjectSelector imageUrl={sourceUrl} config={config} onUpdateConfig={onUpdateConfig} /> : isSmartMask ? (
              <SmartMaskEditor
                inputImage={inputImage}
                imageUrl={sourceUrl}
                maskImageDataUrl={draftMask}
                protectionMaskDataUrl={draftProtectionMask}
                useFullImageMask={draftUseFullImage}
                config={config}
                onUpdateMaskImage={handleDraftMaskChange}
                onUpdateConfig={onUpdateConfig}
                onConfirmRefinedMask={refinement => {
                  onUpdateMaskImage(refinement.refinedMask, false, draftFeather, draftProtectionMask, draftExpansion, true);
                  onUpdateConfig?.({
                    selectionMode: 'smart-select',
                    maskWorkflowMode: 'smart',
                    maskWorkflowActive: true,
                    smartSelectionStatus: 'confirmed',
                    smartSelectionConfirmed: true,
                    smartMaskStage: undefined,
                    smartMaskConfirmed: true,
                    smartMaskIsRefining: false,
                    smartMaskDetectedObject: refinement.detectedObject,
                    smartMaskConfidence: refinement.confidence,
                    smartMaskRefinementMethod: refinement.method,
                  });
                  setDraftMask(refinement.refinedMask);
                  setDraftHasValidPixels(true);
                  setView('control');
                }}
                onCancelEditing={cancelMaskEditing}
              />
            ) : (
              <MaskEditor imageDataUrl={sourceUrl} imageName={inputImage.name} maskImageDataUrl={isMaterialReplace ? draftMask : maskImageDataUrl} protectionMaskDataUrl={isMaterialReplace ? draftProtectionMask : protectionMaskDataUrl} useFullImage={isMaterialReplace ? draftUseFullImage : useFullImageMask} onMaskChange={handleDraftMaskChange} onConfirm={isMaterialReplace ? confirmDraftMask : undefined} onCancel={isMaterialReplace ? cancelMaskEditing : undefined} confirmDisabled={isMaterialReplace && !draftHasValidPixels} />
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
  const activeType = config?.targetObjectType || 'other';
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
  const usePhysicalLayout = config?.enablePhysicalMaterialLayout === true;
  const realSizeMm = Math.max(20, Math.min(5000, config?.materialRealSizeMm || 600));
  const jointWidthMm = Math.max(0, Math.min(50, config?.materialJointWidthMm ?? 2));
  const visualScale = config?.materialPatternScale === 'small' ? 0.08 : config?.materialPatternScale === 'large' ? 0.24 : 0.15;
  const tileSize = usePhysicalLayout
    ? Math.max(24, Math.min(Math.round(previewWidth * 0.4), Math.round(previewWidth * realSizeMm / 8000)))
    : Math.max(24, Math.round(previewWidth * visualScale));
  const jointSize = usePhysicalLayout ? Math.max(0, Math.min(8, Math.round(tileSize * jointWidthMm / realSizeMm))) : 0;
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
