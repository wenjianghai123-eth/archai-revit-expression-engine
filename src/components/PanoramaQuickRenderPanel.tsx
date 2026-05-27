import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Box, Camera, CheckCircle2, ImageIcon, QrCode, Sparkles, Trash2, Upload } from 'lucide-react';
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
import { listModelAssets, uploadImageAsset, uploadModelAsset } from '../lib/api';
import { saveGenerationRecord } from '../storage/history';
import { savePanoramaRecord } from '../storage/panoramas';
import { ModelViewer, ModelViewerHandle } from './ModelViewer';
import {
  isLargeOriginalModel,
  mapModelAssetRecordToAssetModel,
  readConversionStatusLabel,
  readOptimizationStatusLabel,
  readPreferredModelVersionLabel,
  resolvePreferredModelSource,
} from './modelAssetUtils';
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

interface PanoramaRenderResult {
  imageUrl: string;
  renderedAt: string;
}

interface PanoramaCaptureSlot {
  slotIndex: number;
  title: string;
  rawImage: UploadedImage;
  capture: PanoramaCapturePayload;
  panoramaRecord: PanoramaRecord;
  modelId: string;
  projectId?: string | null;
  createdAt: string;
  updatedAt: string;
  renderResult?: PanoramaRenderResult;
}

const modelAccept = '.glb,.gltf,.obj,.dae,.stl,.zip,model/gltf-binary,model/gltf+json,model/vnd.collada+xml,model/stl,application/zip,application/x-zip-compressed';
const MAX_MODEL_SIZE_MB = 600;
const MAX_MODEL_SIZE_BYTES = MAX_MODEL_SIZE_MB * 1024 * 1024;
const PANORAMA_SLOT_INDICES = [1, 2, 3, 4] as const;
const PANORAMA_SLOT_STORAGE_PREFIX = 'archai:panorama-quick-render-slots:v1';
const buildingTypeOptions = ['住宅', '商业', '办公', '酒店', '展厅', '景观', '建筑外立面'];
const spaceTypeOptions = ['客厅', '卧室', '大堂', '办公区', '展厅', '庭院', '外立面'];
const renderStyleOptions = ['电影级写实', '现代极简', '自然木质', '轻奢', '侘寂', '工业风'];
const atmosphereOptions = ['自然日光', '暖光', '高级灯光', '黄昏', '夜景', '清爽明亮'];
const changeStrengthOptions = [
  { value: 'weak', label: '弱', desc: '忠实渲染 / 小幅优化' },
  { value: 'medium', label: '中等', desc: '材质、灯光、氛围适度增强' },
  { value: 'strong', label: '强', desc: '更自由、更丰富的创意表达' },
] as const;
const panoramaQualityOptions = [
  { value: 'standard', label: '标准', desc: '2048 x 1024，速度更快' },
  { value: 'high', label: '高清', desc: '4096 x 2048，更清晰，适合最终出图' },
] as const;

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
  const [models, setModels] = useState<AssetModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [panoramaRecord, setPanoramaRecord] = useState<PanoramaRecord | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'image' | '360'>('360');
  const [primaryPreviewTab, setPrimaryPreviewTab] = useState<'model' | 'panorama'>('model');
  const [panoramaPreviewKind, setPanoramaPreviewKind] = useState<'raw' | 'rendered'>('raw');
  const [slots, setSlots] = useState<PanoramaCaptureSlot[]>([]);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number>(1);
  const [captureSlotIndex, setCaptureSlotIndex] = useState<number>(1);
  const [selectedSlotIndices, setSelectedSlotIndices] = useState<number[]>([]);
  const [batchQueue, setBatchQueue] = useState<number[]>([]);
  const [batchActiveSlotIndex, setBatchActiveSlotIndex] = useState<number | null>(null);
  const [isBatchRendering, setIsBatchRendering] = useState(false);
  const [slotsStorageKey, setSlotsStorageKey] = useState('');
  const lastHandledOutputRef = useRef<string>('');

  const activeSlot = slots.find(slot => slot.slotIndex === activeSlotIndex) || null;
  const currentRawPanoramaUrl = activeSlot?.rawImage.url || activeSlot?.rawImage.dataUrl || panoramaRecord?.panoramaUrl || state.inputImage?.url || state.inputImage?.dataUrl || '';
  const currentRenderedPanoramaUrl = activeSlot?.renderResult?.imageUrl || panoramaRecord?.renderedPanoramaUrl || '';
  const panoramaUrl = panoramaPreviewKind === 'rendered' ? currentRenderedPanoramaUrl : currentRawPanoramaUrl;
  const canShowRenderedPanorama = Boolean(currentRenderedPanoramaUrl);
  const renderableSelectedSlots = slots.filter(slot => selectedSlotIndices.includes(slot.slotIndex));
  const shareUrl = useMemo(() => {
    if (!panoramaRecord?.shareId || typeof window === 'undefined') return '';
    const url = new URL(`/share/panorama/${encodeURIComponent(panoramaRecord.shareId)}`, window.location.origin);
    const sharedImageUrl = currentRenderedPanoramaUrl || currentRawPanoramaUrl || panoramaRecord.renderedPanoramaUrl || panoramaRecord.panoramaUrl;
    if (sharedImageUrl && !sharedImageUrl.startsWith('data:')) {
      url.searchParams.set('image', new URL(sharedImageUrl, window.location.origin).toString());
    }
    url.searchParams.set('createdAt', panoramaRecord.createdAt);
    return url.toString();
  }, [currentRawPanoramaUrl, currentRenderedPanoramaUrl, panoramaRecord?.shareId, panoramaRecord?.renderedPanoramaUrl, panoramaRecord?.panoramaUrl, panoramaRecord?.createdAt]);
  const qrCodeUrl = shareUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=168x168&data=${encodeURIComponent(shareUrl)}`
    : '';
  const preferredModelSource = model ? resolvePreferredModelSource(model) : null;
  const modelVersionLabel = model ? readPreferredModelVersionLabel(model) : '尚未选择模型';
  const shouldShowOriginalModelWarning = model ? isLargeOriginalModel(model) : false;
  const canCapturePanorama = Boolean(model?.previewable && preferredModelSource?.url);
  const panoramaChangeStrength = config.panoramaChangeStrength || 'medium';
  const panoramaQuality = config.panoramaQuality || 'high';

  const applySlotAsCurrent = useCallback((slot: PanoramaCaptureSlot, nextPreviewKind: 'raw' | 'rendered' = 'raw') => {
    setActiveSlotIndex(slot.slotIndex);
    setCaptureSlotIndex(slot.slotIndex);
    setPanoramaRecord(slot.panoramaRecord);
    setPrimaryPreviewTab('panorama');
    setPanoramaPreviewKind(nextPreviewKind === 'rendered' && slot.renderResult ? 'rendered' : 'raw');
    onUpdateInputImage(slot.rawImage);
    onUpdateConfig({
      sourceModelAssetId: slot.modelId,
      sourceImageAssetId: slot.rawImage.assetId || slot.rawImage.id,
      panoramaAssetId: slot.rawImage.assetId || slot.rawImage.id,
      targetWidth: slot.rawImage.width,
      targetHeight: slot.rawImage.height,
      targetAspectRatio: '2:1',
      qualityMode: 'high',
      panoramaQuality: slot.capture.panoramaQuality || panoramaQuality,
      panoramaChangeStrength,
      panoramaCapture: slot.capture,
    });
  }, [onUpdateConfig, onUpdateInputImage, panoramaChangeStrength, panoramaQuality]);

  const submitSlotForGeneration = useCallback((slotIndex: number): boolean => {
    const slot = slots.find(item => item.slotIndex === slotIndex);
    if (!slot) {
      setMessage('请先保存该位置的渲染前全景图。');
      return false;
    }

    applySlotAsCurrent(slot, 'raw');
    window.setTimeout(() => onGenerate(), 0);
    return true;
  }, [applySlotAsCurrent, onGenerate, slots]);

  useEffect(() => {
    setIsLoadingModels(true);
    void listModelAssets()
      .then(records => {
        const nextModels = records.map(record => mapModelAssetRecord(record));
        setModels(nextModels);
        setModel(current => current || nextModels.find(item => item.previewable) || nextModels[0] || null);
      })
      .catch(error => setMessage(error instanceof Error ? error.message : '模型资产加载失败。'))
      .finally(() => setIsLoadingModels(false));
  }, []);

  useEffect(() => {
    if (!model?.id) {
      setSlots([]);
      setSlotsStorageKey('');
      setActiveSlotIndex(1);
      setCaptureSlotIndex(1);
      setSelectedSlotIndices([]);
      return;
    }

    const key = getPanoramaSlotStorageKey(projectId, model.id);
    const storedSlots = readStoredPanoramaSlots(key);
    setSlots(storedSlots);
    setSlotsStorageKey(key);
    const nextActiveIndex = storedSlots[0]?.slotIndex || 1;
    setActiveSlotIndex(nextActiveIndex);
    setCaptureSlotIndex(nextActiveIndex);
    setSelectedSlotIndices(storedSlots[0] ? [storedSlots[0].slotIndex] : []);
    setPanoramaRecord(storedSlots[0]?.panoramaRecord || null);
    setPanoramaPreviewKind('raw');
  }, [model?.id, projectId]);

  useEffect(() => {
    if (!model?.id || !slotsStorageKey) return;
    if (slotsStorageKey !== getPanoramaSlotStorageKey(projectId, model.id)) return;
    writeStoredPanoramaSlots(slotsStorageKey, slots);
  }, [model?.id, projectId, slots, slotsStorageKey]);

  useEffect(() => {
    if (!state.outputImage || state.outputImage === lastHandledOutputRef.current) return;
    lastHandledOutputRef.current = state.outputImage;
    const targetSlotIndex = batchActiveSlotIndex || activeSlotIndex;
    const renderedAt = new Date().toISOString();
    const matchedSlot = slots.find(slot => slot.slotIndex === targetSlotIndex) || null;
    const updatedRecord: PanoramaRecord | null = matchedSlot
      ? {
          ...matchedSlot.panoramaRecord,
          renderedPanoramaUrl: state.outputImage || undefined,
          thumbnailUrl: state.outputImage || matchedSlot.panoramaRecord.thumbnailUrl,
        }
      : null;

    setSlots(previous => previous.map(slot => {
      if (slot.slotIndex !== targetSlotIndex) return slot;
      return {
        ...slot,
        updatedAt: renderedAt,
        panoramaRecord: updatedRecord || slot.panoramaRecord,
        renderResult: {
          imageUrl: state.outputImage || '',
          renderedAt,
        },
      };
    }));

    if (updatedRecord) {
      setPanoramaRecord(updatedRecord);
      savePanoramaRecord(updatedRecord);
    }
    setPrimaryPreviewTab('panorama');
    setPanoramaPreviewKind('rendered');

    if (batchActiveSlotIndex !== null) {
      setBatchQueue(previous => {
        const [nextSlotIndex, ...remaining] = previous;
        if (nextSlotIndex) {
          window.setTimeout(() => submitSlotForGeneration(nextSlotIndex), 250);
        } else {
          window.setTimeout(() => {
            setIsBatchRendering(false);
            setBatchActiveSlotIndex(null);
          }, 0);
        }
        return remaining;
      });
    }
  }, [activeSlotIndex, batchActiveSlotIndex, slots, state.outputImage, submitSlotForGeneration]);

  const handleModelUpload = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !['glb', 'gltf', 'obj', 'dae', 'stl', 'zip'].includes(extension)) {
      setMessage('请上传 GLB、GLTF、OBJ、DAE 或 STL 模型。推荐使用转换后的 GLB。');
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
      setModels(previous => [nextModel, ...previous.filter(item => item.id !== nextModel.id)]);
      setModel(nextModel);
      setPanoramaRecord(null);
      setPrimaryPreviewTab('model');
      onUpdateInputImage(null);
      const captureSize = getPanoramaCaptureSize(panoramaQuality);
      onUpdateConfig({
        panoramaCapture: undefined,
        panoramaAssetId: undefined,
        sourceImageAssetId: undefined,
        sourceModelAssetId: nextModel.id,
        qualityMode: 'high',
        panoramaQuality,
        targetWidth: captureSize.width,
        targetHeight: captureSize.height,
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
      setMessage('请先选择或上传一个 3D 模型。');
      return;
    }
    const source = resolvePreferredModelSource(model);
    if (!viewerRef.current) {
      setMessage('当前模型预览尚未准备好，请稍后再试。');
      return;
    }

    setIsCapturing(true);
    setMessage(null);
    try {
      let actualPanoramaQuality = panoramaQuality;
      let capture = await viewerRef.current.capturePanorama(getPanoramaCaptureSize(panoramaQuality)).catch(async error => {
        if (panoramaQuality !== 'high') throw error;
        actualPanoramaQuality = 'standard';
        setMessage('当前设备生成高清全景底图失败，已自动降级为标准质量。');
        return viewerRef.current?.capturePanorama(getPanoramaCaptureSize('standard'));
      });
      if (!capture) {
        throw new Error('当前模型预览无法生成全景图，请稍后再试。');
      }
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
        sourceModelUrl: source.url,
        modelFileType: source.fileType === 'glb' || source.fileType === 'gltf' ? source.fileType : undefined,
        camera: {
          position: capture.camera?.position,
          rotation: capture.camera?.rotation,
          quaternion: capture.camera?.quaternion,
          target: capture.camera?.target,
          fov: capture.camera?.fov,
        },
        fov: capture.camera?.fov,
        viewMode: capture.viewMode,
        panoramaQuality: actualPanoramaQuality,
        capturedAt: new Date().toISOString(),
      };
      const record: PanoramaRecord = {
        id: `panorama-${Date.now()}`,
        projectId,
        modelUrl: source.url || model.modelUrl || model.originalUrl || '',
        cameraState: payload.camera,
        panoramaUrl: imageAsset.url || capture.dataUrl,
        thumbnailUrl: imageAsset.url || capture.dataUrl,
        shareId: createShareId(),
        createdAt: payload.capturedAt,
      };
      const targetSlotIndex = captureSlotIndex;
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
          qualityMode: 'high',
          panoramaQuality: actualPanoramaQuality,
          panoramaChangeStrength,
          panoramaCapture: payload,
        },
        sourceModelAssetId: model.id,
        snapshotAssetId: imageAsset.id,
        panoramaRecord: record,
      });
      setSlots(previous => {
        const existingSlot = previous.find(slot => slot.slotIndex === targetSlotIndex);
        const nextSlot: PanoramaCaptureSlot = {
          slotIndex: targetSlotIndex,
          title: existingSlot?.title || `位置 ${targetSlotIndex}`,
          rawImage: uploadedPanorama,
          capture: payload,
          panoramaRecord: record,
          modelId: model.id,
          projectId,
          createdAt: existingSlot?.createdAt || payload.capturedAt,
          updatedAt: payload.capturedAt,
        };
        return upsertPanoramaSlot(previous, nextSlot);
      });
      setActiveSlotIndex(targetSlotIndex);
      setSelectedSlotIndices(previous => previous.includes(targetSlotIndex) ? previous : [...previous, targetSlotIndex]);
      setPanoramaRecord(record);
      setPanoramaPreviewKind('raw');
      setPreviewMode('360');
      setPrimaryPreviewTab('panorama');
      onHistoryRecord?.(historyRecord);
      onUpdateInputImage(uploadedPanorama);
      onUpdateConfig({
        sourceModelAssetId: model.id,
        sourceImageAssetId: imageAsset.id,
        panoramaAssetId: imageAsset.id,
        targetWidth: capture.width,
        targetHeight: capture.height,
        targetAspectRatio: '2:1',
        qualityMode: 'high',
        panoramaQuality: actualPanoramaQuality,
        panoramaChangeStrength,
        panoramaCapture: payload,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '当前视点捕捉失败，请重试。');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleActivateSlot = (slotIndex: number) => {
    setCaptureSlotIndex(slotIndex);
    const slot = slots.find(item => item.slotIndex === slotIndex);
    if (!slot) {
      setActiveSlotIndex(slotIndex);
      setPanoramaRecord(null);
      setPanoramaPreviewKind('raw');
      return;
    }
    applySlotAsCurrent(slot, panoramaPreviewKind);
  };

  const handleToggleSlotSelection = (slotIndex: number) => {
    setSelectedSlotIndices(previous => (
      previous.includes(slotIndex)
        ? previous.filter(index => index !== slotIndex)
        : [...previous, slotIndex].sort((a, b) => a - b)
    ));
  };

  const handleDeleteSlot = (slotIndex: number) => {
    const remainingSlots = slots.filter(slot => slot.slotIndex !== slotIndex);
    setSlots(remainingSlots);
    setSelectedSlotIndices(previous => previous.filter(index => index !== slotIndex));
    if (activeSlotIndex === slotIndex) {
      const nextSlot = remainingSlots[0] || null;
      const nextIndex = nextSlot?.slotIndex || slotIndex;
      setActiveSlotIndex(nextIndex);
      setCaptureSlotIndex(nextIndex);
      setPanoramaRecord(nextSlot?.panoramaRecord || null);
      setPanoramaPreviewKind('raw');
      if (nextSlot) {
        onUpdateInputImage(nextSlot.rawImage);
      } else {
        onUpdateInputImage(null);
      }
    }
  };

  const handleGenerateActiveSlot = () => {
    if (state.isGenerating || isBatchRendering) return;
    const slot = activeSlot || slots.find(item => item.slotIndex === captureSlotIndex);
    if (!slot) {
      setMessage('请先在模型中截图并保存一个渲染前全景图。');
      return;
    }
    setBatchQueue([]);
    setIsBatchRendering(false);
    setBatchActiveSlotIndex(slot.slotIndex);
    submitSlotForGeneration(slot.slotIndex);
  };

  const handleGenerateSelectedSlots = () => {
    if (state.isGenerating || isBatchRendering) return;
    const targetSlots = renderableSelectedSlots.length > 0 ? renderableSelectedSlots : (activeSlot ? [activeSlot] : []);
    if (targetSlots.length === 0) {
      setMessage('请先选择至少一个已保存的全景槽位。');
      return;
    }
    const [firstSlot, ...remainingSlots] = targetSlots.sort((a, b) => a.slotIndex - b.slotIndex);
    setBatchQueue(remainingSlots.map(slot => slot.slotIndex));
    setIsBatchRendering(targetSlots.length > 1);
    setBatchActiveSlotIndex(firstSlot.slotIndex);
    submitSlotForGeneration(firstSlot.slotIndex);
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
                <p className="mt-1 text-xs text-slate-500">{model ? `${model.fileName} / ${model.size} / ${modelVersionLabel}` : '选择或上传模型后可进行漫游查看'}</p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setPrimaryPreviewTab('model')}
                    className={`rounded-md px-3 py-1.5 ${primaryPreviewTab === 'model' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    模型预览
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrimaryPreviewTab('panorama')}
                    className={`rounded-md px-3 py-1.5 ${primaryPreviewTab === 'panorama' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    全景图预览
                  </button>
                </div>
                {primaryPreviewTab === 'panorama' && (currentRawPanoramaUrl || currentRenderedPanoramaUrl) ? (
                  <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setPanoramaPreviewKind('raw')}
                      className={`rounded-md px-2 py-1 ${panoramaPreviewKind === 'raw' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
                    >
                      原始全景图
                    </button>
                    <button
                      type="button"
                      onClick={() => canShowRenderedPanorama && setPanoramaPreviewKind('rendered')}
                      disabled={!canShowRenderedPanorama}
                      className={`rounded-md px-2 py-1 disabled:opacity-40 ${panoramaPreviewKind === 'rendered' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}
                    >
                      AI 渲染图
                    </button>
                  </div>
                ) : null}
                {primaryPreviewTab === 'panorama' && panoramaUrl ? (
                  <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-bold">
                    <button type="button" onClick={() => setPreviewMode('360')} className={`rounded-md px-2 py-1 ${previewMode === '360' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>
                      360
                    </button>
                    <button type="button" onClick={() => setPreviewMode('image')} className={`rounded-md px-2 py-1 ${previewMode === 'image' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>
                      图片
                    </button>
                  </div>
                ) : null}
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
            </div>

            <div className="h-[calc(100vh-168px)] min-h-[420px] xl:min-h-[560px]">
              {primaryPreviewTab === 'panorama' ? (
                <MainPanoramaPreview imageUrl={panoramaUrl} previewMode={previewMode} />
              ) : model ? (
                <ModelViewer ref={viewerRef} asset={model} minHeight={560} initialView="interior" />
              ) : (
                <div className="flex h-full items-center justify-center bg-slate-50 p-8 text-center">
                  <div className="max-w-sm">
                    <Box className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-4 text-sm font-bold text-slate-900">选择或上传模型</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">优先使用转换后的 GLB 或轻量化模型，从当前位置生成 360 全景截图。</p>
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
                <p className="mt-1 text-xs text-slate-500">当前位置生成 360 全景截图，全景图为 2:1 标准比例。</p>
              </div>
            </div>

            {message ? <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">{message}</div> : null}

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">渲染前全景槽位</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">最多保存 4 个位置，可选择多个槽位批量 AI 渲染。</p>
                </div>
                <span className="rounded bg-white px-2 py-1 text-[10px] font-bold text-slate-500">{slots.length}/4</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {PANORAMA_SLOT_INDICES.map(slotIndex => {
                  const slot = slots.find(item => item.slotIndex === slotIndex);
                  const isActive = activeSlotIndex === slotIndex;
                  const isSelected = selectedSlotIndices.includes(slotIndex);
                  return (
                    <div
                      key={slotIndex}
                      className={`rounded-lg border bg-white p-2 transition-colors ${isActive ? 'border-blue-500 ring-1 ring-blue-200' : 'border-slate-200'}`}
                    >
                      <button type="button" onClick={() => handleActivateSlot(slotIndex)} className="block w-full text-left">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-800">位置 {slotIndex}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${slot?.renderResult ? 'bg-emerald-50 text-emerald-700' : slot ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>
                            {slot?.renderResult ? '已渲染' : slot ? '已截图' : '空'}
                          </span>
                        </div>
                        {slot ? (
                          <img
                            src={slot.rawImage.url || slot.rawImage.dataUrl}
                            alt={`位置 ${slotIndex} 原始全景图`}
                            className="mt-2 aspect-[2/1] w-full rounded-md bg-slate-100 object-cover"
                          />
                        ) : (
                          <div className="mt-2 flex aspect-[2/1] items-center justify-center rounded-md border border-dashed border-slate-200 text-[10px] font-bold text-slate-300">
                            未保存
                          </div>
                        )}
                        <p className="mt-1 truncate text-[10px] text-slate-400">{slot ? new Date(slot.updatedAt).toLocaleString() : '点击选择槽位'}</p>
                      </button>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <label className={`inline-flex items-center gap-1 text-[10px] font-bold ${slot ? 'text-slate-600' : 'text-slate-300'}`}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!slot}
                            onChange={() => handleToggleSlotSelection(slotIndex)}
                            className="h-3 w-3 rounded border-slate-300"
                          />
                          批量
                        </label>
                        <button
                          type="button"
                          onClick={() => handleDeleteSlot(slotIndex)}
                          disabled={!slot}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-500 disabled:opacity-30"
                          title="删除槽位"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500">截图保存到</span>
                <div className="inline-flex rounded-lg bg-white p-1 text-xs font-bold shadow-sm">
                  {PANORAMA_SLOT_INDICES.map(slotIndex => (
                    <button
                      key={slotIndex}
                      type="button"
                      onClick={() => {
                        setCaptureSlotIndex(slotIndex);
                        handleActivateSlot(slotIndex);
                      }}
                      className={`rounded-md px-2 py-1 ${captureSlotIndex === slotIndex ? 'bg-slate-950 text-white' : 'text-slate-500'}`}
                    >
                      {slotIndex}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCaptureViewpoint}
              disabled={!canCapturePanorama || isCapturing || state.isGenerating || isBatchRendering}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              {isCapturing ? '正在生成全景...' : '当前位置生成 360 全景截图'}
            </button>

            <button
              type="button"
              onClick={handleGenerateActiveSlot}
              disabled={!activeSlot?.rawImage.assetId || state.isGenerating || isBatchRendering}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {state.isGenerating || isBatchRendering ? '正在 AI 渲染全景...' : 'AI 渲染当前槽位'}
            </button>

            <button
              type="button"
              onClick={handleGenerateSelectedSlots}
              disabled={renderableSelectedSlots.length === 0 || state.isGenerating || isBatchRendering}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {isBatchRendering ? `批量渲染中 ${batchActiveSlotIndex || ''}` : `批量渲染已选槽位（${renderableSelectedSlots.length}）`}
            </button>

            <ResultPreview
              imageUrl={panoramaUrl}
              previewKind={panoramaPreviewKind}
              canShowRendered={canShowRenderedPanorama}
              onPreviewKindChange={setPanoramaPreviewKind}
              previewMode={previewMode}
              onPreviewModeChange={setPreviewMode}
            />

            {shareUrl ? <PanoramaShareCard shareUrl={shareUrl} qrCodeUrl={qrCodeUrl} /> : null}

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">模型文件</p>
              <p className="mt-2 truncate text-sm font-bold text-slate-800">{model?.fileName || '尚未上传模型'}</p>
              <p className="mt-1 text-xs text-slate-500">{model ? `${model.fileType.toUpperCase()} / ${model.size}` : '支持 GLB / GLTF / OBJ / DAE / STL / ZIP'}</p>
              {model ? (
                <div className="mt-3 space-y-1 rounded-lg bg-white px-3 py-2 text-[11px] leading-5 text-slate-500">
                  <p><span className="font-bold text-slate-700">当前加载：</span>{modelVersionLabel}</p>
                  <p><span className="font-bold text-slate-700">转换状态：</span>{readConversionStatusLabel(model)}</p>
                  <p><span className="font-bold text-slate-700">轻量化状态：</span>{readOptimizationStatusLabel(model.optimizationStatus)}</p>
                  <p><span className="font-bold text-slate-700">预览地址：</span>{preferredModelSource?.fileType.toUpperCase() || model.fileType.toUpperCase()}</p>
                </div>
              ) : null}
              {shouldShowOriginalModelWarning ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>建议先转换为 GLB 或使用轻量化模型，以获得更流畅的全景预览体验。</span>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">模型资产</p>
              {isLoadingModels ? (
                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">正在加载模型资产...</div>
              ) : models.length > 0 ? (
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {models.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setModel(item);
                        setPanoramaRecord(null);
                        setPrimaryPreviewTab('model');
                        setMessage(null);
                        onUpdateInputImage(null);
                        onUpdateConfig({
                          panoramaCapture: undefined,
                          panoramaAssetId: undefined,
                          sourceImageAssetId: undefined,
                          sourceModelAssetId: item.id,
                        });
                      }}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${model?.id === item.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-slate-800">{item.name}</span>
                        <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{resolvePreferredModelSource(item).fileType.toUpperCase()}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">{item.fileName}</p>
                      <p className="mt-1 text-[11px] font-semibold text-emerald-700">{readPreferredModelVersionLabel(item)}</p>
                      {!item.previewable ? <p className="mt-1 text-[11px] font-semibold text-amber-700">该格式暂不支持全景预览</p> : null}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-500">
                  还没有模型资产，请上传 GLB、GLTF、OBJ、DAE 或 STL 模型。推荐先转换为 GLB。
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-sm font-bold text-slate-900">AI 全景渲染参数</p>
              <div>
                <p className="text-xs font-bold text-slate-600">改动强度</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {changeStrengthOptions.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onUpdateConfig({ panoramaChangeStrength: option.value })}
                      className={`rounded-lg border px-2 py-2 text-left transition-colors ${panoramaChangeStrength === option.value ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      <span className="block text-sm font-bold">{option.label}</span>
                      <span className="mt-1 block text-[10px] leading-4">{option.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-600">全景质量</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {panoramaQualityOptions.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        const size = getPanoramaCaptureSize(option.value);
                        onUpdateConfig({
                          panoramaQuality: option.value,
                          qualityMode: 'high',
                          targetWidth: size.width,
                          targetHeight: size.height,
                          targetAspectRatio: '2:1',
                        });
                      }}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${panoramaQuality === option.value ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      <span className="block text-sm font-bold">{option.label}</span>
                      <span className="mt-1 block text-[10px] leading-4">{option.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
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
              <p className="mt-2 text-xs leading-5 text-slate-500">捕捉内容包含相机位置、朝向、目标点、FOV 和模型资产 ID，输出为 2:1 标准全景图。</p>
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

function MainPanoramaPreview({ imageUrl, previewMode }: { imageUrl: string; previewMode: 'image' | '360' }) {
  if (!imageUrl) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 p-8 text-center">
        <div className="max-w-sm">
          <Camera className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-4 text-sm font-bold text-slate-900">请先在模型中定位视角并生成全景快渲。</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">生成后将在这里以大图方式预览 2:1 标准全景图，可切换普通图片或 360 预览。</p>
        </div>
      </div>
    );
  }

  if (previewMode === '360') {
    return <PanoramaViewer imageUrl={imageUrl} className="h-full w-full bg-slate-950" minHeight={560} />;
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-950 p-4">
      <img src={imageUrl} alt="全景图大图预览" className="max-h-full w-full max-w-full object-contain" />
    </div>
  );
}

function ResultPreview({
  imageUrl,
  previewKind,
  canShowRendered,
  onPreviewKindChange,
  previewMode,
  onPreviewModeChange,
}: {
  imageUrl: string;
  previewKind: 'raw' | 'rendered';
  canShowRendered: boolean;
  onPreviewKindChange: (kind: 'raw' | 'rendered') => void;
  previewMode: 'image' | '360';
  onPreviewModeChange: (mode: 'image' | '360') => void;
}) {
  if (!imageUrl) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs font-bold text-slate-400">
        生成全景后将在这里显示 2:1 标准全景图和 360 预览。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <p className="text-sm font-bold text-slate-900">{previewKind === 'rendered' ? 'AI 渲染后全景图' : '渲染前原始全景图'}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <div className="inline-flex rounded-lg bg-white p-1 text-xs font-bold shadow-sm">
            <button type="button" onClick={() => onPreviewKindChange('raw')} className={`rounded-md px-2 py-1 ${previewKind === 'raw' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}>
              原图
            </button>
            <button type="button" onClick={() => canShowRendered && onPreviewKindChange('rendered')} disabled={!canShowRendered} className={`rounded-md px-2 py-1 disabled:opacity-40 ${previewKind === 'rendered' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}>
              AI 图
            </button>
          </div>
          <div className="inline-flex rounded-lg bg-white p-1 text-xs font-bold shadow-sm">
            <button type="button" onClick={() => onPreviewModeChange('image')} className={`rounded-md px-2 py-1 ${previewMode === 'image' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}>
              图片
            </button>
            <button type="button" onClick={() => onPreviewModeChange('360')} className={`rounded-md px-2 py-1 ${previewMode === '360' ? 'bg-slate-950 text-white' : 'text-slate-500'}`}>
              360
            </button>
          </div>
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

function mapModelAssetRecord(asset: Parameters<typeof mapModelAssetRecordToAssetModel>[0]): AssetModel {
  return mapModelAssetRecordToAssetModel(asset, { category: '漫游全景' });
}

function getPanoramaCaptureSize(quality: GenerationConfig['panoramaQuality']): { width: number; height: number } {
  return quality === 'standard'
    ? { width: 2048, height: 1024 }
    : { width: 4096, height: 2048 };
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

function upsertPanoramaSlot(slots: PanoramaCaptureSlot[], nextSlot: PanoramaCaptureSlot): PanoramaCaptureSlot[] {
  return [
    ...slots.filter(slot => slot.slotIndex !== nextSlot.slotIndex),
    nextSlot,
  ].sort((a, b) => a.slotIndex - b.slotIndex);
}

function getPanoramaSlotStorageKey(projectId: string | null | undefined, modelId: string): string {
  return `${PANORAMA_SLOT_STORAGE_PREFIX}:${projectId || 'default'}:${modelId}`;
}

function readStoredPanoramaSlots(storageKey: string): PanoramaCaptureSlot[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is PanoramaCaptureSlot => isValidStoredPanoramaSlot(item))
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .slice(0, PANORAMA_SLOT_INDICES.length);
  } catch (error) {
    console.warn('Failed to read panorama slots from localStorage', error);
    return [];
  }
}

function writeStoredPanoramaSlots(storageKey: string, slots: PanoramaCaptureSlot[]): void {
  if (typeof window === 'undefined') return;
  try {
    const serializableSlots = slots.map(slot => ({
      ...slot,
      rawImage: {
        ...slot.rawImage,
        dataUrl: slot.rawImage.url || slot.rawImage.dataUrl,
      },
    }));
    window.localStorage.setItem(storageKey, JSON.stringify(serializableSlots));
  } catch (error) {
    console.warn('Failed to persist panorama slots to localStorage', error);
  }
}

function isValidStoredPanoramaSlot(value: unknown): value is PanoramaCaptureSlot {
  if (!value || typeof value !== 'object') return false;
  const slot = value as Partial<PanoramaCaptureSlot>;
  return typeof slot.slotIndex === 'number'
    && PANORAMA_SLOT_INDICES.includes(slot.slotIndex as typeof PANORAMA_SLOT_INDICES[number])
    && Boolean(slot.rawImage?.dataUrl || slot.rawImage?.url)
    && Boolean(slot.capture?.captureType === 'panorama-viewpoint')
    && Boolean(slot.panoramaRecord?.panoramaUrl)
    && typeof slot.modelId === 'string';
}
