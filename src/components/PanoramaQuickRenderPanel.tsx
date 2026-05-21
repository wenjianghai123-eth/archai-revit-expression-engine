import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Camera, CheckCircle2, ImageIcon, QrCode, Sparkles, Upload } from 'lucide-react';
import {
  AssetModel,
  GenerationConfig,
  GenerationHistoryItem,
  GenerationProvider,
  GenerationStep,
  PanoramaCapturePayload,
  PanoramaRecord,
  StepState,
  UploadedImage,
} from '../types';
import { ModelAssetRecord, uploadImageAsset, uploadModelAsset } from '../lib/api';
import { saveGenerationRecord } from '../storage/history';
import { savePanoramaRecord } from '../storage/panoramas';
import { ModelViewer, ModelViewerHandle } from './ModelViewer';
import { PanoramaViewer } from './PanoramaViewer';

interface PanoramaQuickRenderPanelProps {
  state: StepState;
  config: GenerationConfig;
  projectId?: string | null;
  provider?: GenerationProvider | null;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onGenerate: () => void;
  onHistoryRecord?: (record: GenerationHistoryItem) => void;
}

const modelAccept = '.glb,.gltf,model/gltf-binary,model/gltf+json';
const MAX_MODEL_SIZE_MB = 600;
const MAX_MODEL_SIZE_BYTES = MAX_MODEL_SIZE_MB * 1024 * 1024;
const buildingTypeOptions = ['住宅', '商业', '办公', '酒店', '展厅', '景观', '建筑外立面'];
const spaceTypeOptions = ['客厅', '卧室', '大堂', '办公区', '展厅', '庭院', '外立面'];
const renderStyleOptions = ['电影级写实', '现代极简', '自然木质', '轻奢', '侘寂', '工业风'];
const atmosphereOptions = ['自然日光', '暖光', '高级灯光', '黄昏', '夜景', '清爽明亮'];

export function PanoramaQuickRenderPanel({
  state,
  config,
  projectId = null,
  provider = null,
  onUpdateConfig,
  onUpdateInputImage,
  onGenerate,
  onHistoryRecord,
}: PanoramaQuickRenderPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<ModelViewerHandle>(null);
  const [model, setModel] = useState<AssetModel | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [panoramaRecord, setPanoramaRecord] = useState<PanoramaRecord | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'image' | '360'>('360');

  const panoramaUrl = state.outputImage || panoramaRecord?.renderedPanoramaUrl || panoramaRecord?.panoramaUrl || state.inputImage?.url || state.inputImage?.dataUrl || '';
  const shareUrl = useMemo(() => {
    if (!panoramaRecord?.shareId || typeof window === 'undefined') return '';
    const url = new URL(`/share/panorama/${encodeURIComponent(panoramaRecord.shareId)}`, window.location.origin);
    const sharedImageUrl = state.outputImage || panoramaRecord.renderedPanoramaUrl || panoramaRecord.panoramaUrl;
    if (sharedImageUrl && !sharedImageUrl.startsWith('data:')) {
      url.searchParams.set('image', new URL(sharedImageUrl, window.location.origin).toString());
    }
    url.searchParams.set('createdAt', panoramaRecord.createdAt);
    return url.toString();
  }, [panoramaRecord?.shareId, panoramaRecord?.renderedPanoramaUrl, panoramaRecord?.panoramaUrl, panoramaRecord?.createdAt, state.outputImage]);
  const qrCodeUrl = shareUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=168x168&data=${encodeURIComponent(shareUrl)}`
    : '';

  useEffect(() => {
    if (!panoramaRecord || !state.outputImage) return;
    const nextRecord: PanoramaRecord = {
      ...panoramaRecord,
      renderedPanoramaUrl: state.outputImage,
      thumbnailUrl: state.outputImage,
    };
    setPanoramaRecord(nextRecord);
    savePanoramaRecord(nextRecord);
  }, [panoramaRecord?.id, state.outputImage]);

  const handleModelUpload = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'glb' && extension !== 'gltf') {
      setMessage('第一阶段仅支持上传 GLB / GLTF 模型。');
      return;
    }

    if (file.size > MAX_MODEL_SIZE_BYTES) {
      setMessage(`模型文件过大，当前最大支持 ${MAX_MODEL_SIZE_MB}MB。`);
      return;
    }

    setIsUploading(true);
    setMessage(null);
    try {
      const asset = await uploadModelAsset(file);
      const nextModel = mapModelAssetRecord(asset);
      setModel(nextModel);
      setPanoramaRecord(null);
      onUpdateInputImage(null);
      onUpdateConfig({
        panoramaCapture: undefined,
        panoramaAssetId: undefined,
        sourceImageAssetId: undefined,
        sourceModelAssetId: nextModel.id,
        targetWidth: 2048,
        targetHeight: 1024,
        targetAspectRatio: '2:1',
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '模型上传失败，请重试。');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCaptureViewpoint = async () => {
    if (!model) {
      setMessage('请先上传 GLB / GLTF 模型。');
      return;
    }
    if (!viewerRef.current) {
      setMessage('当前模型预览尚未准备好，请稍后再试。');
      return;
    }

    setIsCapturing(true);
    setMessage(null);
    try {
      const capture = await viewerRef.current.capturePanorama({ width: 2048, height: 1024 });
      const imageFile = dataUrlToFile(capture.dataUrl, `panorama-${Date.now()}.png`);
      const imageAsset = await uploadImageAsset(imageFile, imageFile.name);
      const uploadedPanorama: UploadedImage = {
        id: imageAsset.id,
        name: imageFile.name,
        type: imageFile.type,
        size: imageFile.size,
        dataUrl: capture.dataUrl,
        url: imageAsset.url,
        assetId: imageAsset.id,
        width: capture.width,
        height: capture.height,
      };
      const payload: PanoramaCapturePayload = {
        captureType: 'panorama-viewpoint',
        sourceModelAssetId: model.id,
        sourceModelUrl: model.modelUrl,
        modelFileType: model.fileType === 'glb' || model.fileType === 'gltf' ? model.fileType : undefined,
        camera: {
          position: capture.camera?.position,
          rotation: capture.camera?.rotation,
          target: capture.camera?.target,
          fov: capture.camera?.fov,
        },
        fov: capture.camera?.fov,
        viewMode: capture.viewMode,
        capturedAt: new Date().toISOString(),
      };
      const record: PanoramaRecord = {
        id: `panorama-${Date.now()}`,
        projectId,
        modelUrl: model.modelUrl || model.originalUrl || '',
        cameraState: payload.camera,
        panoramaUrl: imageAsset.url || capture.dataUrl,
        thumbnailUrl: imageAsset.url || capture.dataUrl,
        shareId: createShareId(),
        createdAt: payload.capturedAt,
      };
      savePanoramaRecord(record);
      const historyRecord = saveGenerationRecord({
        id: record.id,
        projectId,
        step: GenerationStep.PanoramaQuickRender,
        prompt: '基于当前漫游视点生成 360 全景图',
        style: '漫游全景快渲',
        createdAt: record.createdAt,
        provider: provider || 'mock',
        outputImage: record.panoramaUrl,
        inputImageUrl: record.panoramaUrl,
        inputImageAssetId: imageAsset.id,
        config: {
          ...config,
          sourceModelAssetId: model.id,
          sourceImageAssetId: imageAsset.id,
          panoramaAssetId: imageAsset.id,
          targetWidth: capture.width,
          targetHeight: capture.height,
          targetAspectRatio: '2:1',
          panoramaCapture: payload,
        },
        sourceModelAssetId: model.id,
        snapshotAssetId: imageAsset.id,
        panoramaRecord: record,
      });
      setPanoramaRecord(record);
      setPreviewMode('360');
      onHistoryRecord?.(historyRecord);
      onUpdateInputImage(uploadedPanorama);
      onUpdateConfig({
        sourceModelAssetId: model.id,
        sourceImageAssetId: imageAsset.id,
        panoramaAssetId: imageAsset.id,
        targetWidth: capture.width,
        targetHeight: capture.height,
        targetAspectRatio: '2:1',
        panoramaCapture: payload,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '当前视点捕捉失败，请重试。');
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={modelAccept}
        className="hidden"
        onChange={event => {
          void handleModelUpload(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />

      <section className="min-w-0 flex-1 overflow-y-auto bg-slate-100 p-4 custom-scrollbar">
        <div className="grid min-h-full gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-slate-950">漫游预览</p>
                <p className="mt-1 text-xs text-slate-500">{model ? `${model.fileName} / ${model.size}` : '上传 GLB / GLTF 后可进行基础漫游查看'}</p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                {model ? '重新上传模型' : '上传模型'}
              </button>
            </div>

            <div className="h-[calc(100vh-168px)] min-h-[420px] xl:min-h-[560px]">
              {model ? (
                <ModelViewer ref={viewerRef} asset={model} minHeight={560} />
              ) : (
                <div className="flex h-full items-center justify-center bg-slate-50 p-8 text-center">
                  <div className="max-w-sm">
                    <Box className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-4 text-sm font-bold text-slate-900">上传 GLB / GLTF 模型</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">当前阶段用于漫游取点、生成 2:1 全景图，并接入 AI 全景渲染与分享预览。</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:max-h-[calc(100vh-112px)] xl:overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white">
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-950">漫游全景快渲</p>
                <p className="mt-1 text-xs text-slate-500">捕捉 2:1 全景，AI 渲染后可 360 预览和分享。</p>
              </div>
            </div>

            {message ? <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">{message}</div> : null}

            <button
              type="button"
              onClick={handleCaptureViewpoint}
              disabled={!model || isCapturing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              {isCapturing ? '正在生成全景...' : '以当前视点生成全景'}
            </button>

            <button
              type="button"
              onClick={onGenerate}
              disabled={!state.inputImage?.assetId || state.isGenerating}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {state.isGenerating ? '正在 AI 渲染全景...' : 'AI 渲染全景图'}
            </button>

            <ResultPreview
              imageUrl={panoramaUrl}
              previewMode={previewMode}
              onPreviewModeChange={setPreviewMode}
            />

            {shareUrl ? <PanoramaShareCard shareUrl={shareUrl} qrCodeUrl={qrCodeUrl} /> : null}

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">模型文件</p>
              <p className="mt-2 truncate text-sm font-bold text-slate-800">{model?.fileName || '尚未上传模型'}</p>
              <p className="mt-1 text-xs text-slate-500">{model ? `${model.fileType.toUpperCase()} / ${model.size}` : '支持 GLB / GLTF'}</p>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-900">AI 全景渲染参数</p>
              <SelectField label="建筑类型" value={config.buildingType || ''} options={buildingTypeOptions} emptyLabel="自动判断" onChange={value => onUpdateConfig({ buildingType: value })} />
              <SelectField label="空间类型" value={config.spaceType || ''} options={spaceTypeOptions} emptyLabel="自动判断" onChange={value => onUpdateConfig({ spaceType: value })} />
              <SelectField label="风格" value={config.renderStyle || ''} options={renderStyleOptions} emptyLabel="电影级写实" onChange={value => onUpdateConfig({ renderStyle: value })} />
              <SelectField label="氛围" value={config.atmosphere || ''} options={atmosphereOptions} emptyLabel="自动匹配" onChange={value => onUpdateConfig({ atmosphere: value })} />
              <label className="block text-xs font-bold text-slate-600">
                补充提示词
                <textarea
                  value={config.customPrompt || ''}
                  onChange={event => onUpdateConfig({ customPrompt: event.target.value })}
                  rows={3}
                  className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-5 text-slate-800"
                  placeholder="可补充材质、灯光、业态、重点空间等要求。"
                />
              </label>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`h-4 w-4 ${config.panoramaCapture ? 'text-emerald-500' : 'text-slate-300'}`} />
                <p className="text-sm font-bold text-slate-800">{config.panoramaCapture ? '已捕捉当前视点' : '尚未捕捉视点'}</p>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">捕捉内容包含相机位置、朝向、目标点、FOV 和模型资产 ID。</p>
              {config.panoramaCapture ? (
                <pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] leading-4 text-slate-100">
                  {JSON.stringify(config.panoramaCapture, null, 2)}
                </pre>
              ) : null}
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

function ResultPreview({
  imageUrl,
  previewMode,
  onPreviewModeChange,
}: {
  imageUrl: string;
  previewMode: 'image' | '360';
  onPreviewModeChange: (mode: 'image' | '360') => void;
}) {
  if (!imageUrl) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs font-bold text-slate-400">
        生成全景后将在这里显示普通图片和 360 预览。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <p className="text-sm font-bold text-slate-900">全景结果</p>
        <div className="inline-flex rounded-lg bg-white p-1 text-xs font-bold shadow-sm">
          <button type="button" onClick={() => onPreviewModeChange('image')} className={`rounded-md px-2 py-1 ${previewMode === 'image' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}>
            普通图
          </button>
          <button type="button" onClick={() => onPreviewModeChange('360')} className={`rounded-md px-2 py-1 ${previewMode === '360' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}>
            360预览
          </button>
        </div>
      </div>
      {previewMode === '360' ? (
        <PanoramaViewer imageUrl={imageUrl} className="h-64" minHeight={256} />
      ) : (
        <img src={imageUrl} alt="全景普通图片" className="aspect-[2/1] w-full object-cover" />
      )}
    </div>
  );
}

function PanoramaShareCard({ shareUrl, qrCodeUrl }: { shareUrl: string; qrCodeUrl: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <QrCode className="h-4 w-4 text-slate-700" />
        <p className="text-sm font-bold text-slate-900">分享二维码</p>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <img src={qrCodeUrl} alt="全景分享二维码" className="h-28 w-28 rounded-lg border border-slate-200 bg-white p-1" />
        <div className="min-w-0 flex-1">
          <p className="break-all text-[11px] leading-4 text-slate-500">{shareUrl}</p>
          <a href={shareUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600">
            <ImageIcon className="h-3.5 w-3.5" />
            打开分享页
          </a>
        </div>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  emptyLabel,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  emptyLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-bold text-slate-600">
      {label}
      <select value={value} onChange={event => onChange(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
        <option value="">{emptyLabel}</option>
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function mapModelAssetRecord(asset: ModelAssetRecord): AssetModel {
  const previewUrl = asset.optimizedUrl || asset.previewUrl || asset.metadata?.optimizedUrl || asset.metadata?.previewUrl;
  const fileType = previewUrl ? 'glb' : asset.fileType;
  return {
    id: asset.id,
    name: asset.originalFilename.replace(/\.[^.]+$/u, ''),
    fileName: asset.originalFilename,
    fileType,
    format: asset.format || asset.fileType,
    modelUrl: previewUrl || asset.url,
    originalUrl: asset.url,
    previewUrl: asset.previewUrl || asset.metadata?.previewUrl,
    optimizedUrl: asset.optimizedUrl || asset.metadata?.optimizedUrl,
    thumbnailUrl: asset.thumbnailUrl || asset.metadata?.thumbnailUrl,
    metadata: asset.metadata,
    optimizationStatus: asset.metadata?.optimizationStatus || 'skipped',
    optimizationError: asset.metadata?.optimizationError,
    originalFileSize: asset.metadata?.originalFileSize || asset.size,
    optimizedFileSize: asset.metadata?.optimizedFileSize,
    usesOptimizedPreview: Boolean(previewUrl),
    thumbnail: '',
    size: formatFileSize(asset.size),
    date: asset.createdAt.slice(0, 10),
    source: 'uploaded',
    provider: '本地后端',
    status: 'ready',
    qualityStatus: 'usable',
    category: '漫游全景',
    previewable: fileType === 'glb' || fileType === 'gltf',
  };
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '未知';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, encoded] = dataUrl.split(',');
  const mimeType = /^data:([^;,]+)/u.exec(header || '')?.[1] || 'image/png';
  const binary = window.atob(encoded || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], filename, { type: mimeType });
}

function createShareId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `share-${Date.now()}`;
}
