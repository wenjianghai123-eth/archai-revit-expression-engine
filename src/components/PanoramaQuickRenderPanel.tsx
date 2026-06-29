import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Box, Camera, CheckCircle2, Download, ExternalLink, ImageIcon, QrCode, Sparkles, Trash2, Upload } from 'lucide-react';
import {
  AssetModel,
  GenerationConfig,
  GenerationHistoryItem,
  GenerationProvider,
  GenerationStep,
  PanoramaCapturePayload,
  PanoramaRecord,
  SecondaryEditAction,
  StepState,
  UploadedImage,
} from '../types';
import { listModelAssets, uploadImageAsset, uploadModelAsset } from '../lib/api';
import { saveGenerationRecord } from '../storage/history';
import { savePanoramaRecord } from '../storage/panoramas';
import { buildResultImageFilename, downloadAsset, downloadFallbackMessage } from '../utils/downloadAsset';
import { getOriginalResultAssetId, getOriginalResultImageUrl } from '../utils/resultImage';
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
import { PromptVoiceAssistant } from './PromptVoiceAssistant';
import { SmartPromptAssistant } from './workspace/SmartPromptAssistant';
import { IMAGE_UPLOAD_ACCEPT } from '../utils/imageValidation';
import { validateImageFile } from '../utils/file';

interface PanoramaQuickRenderPanelProps {
  state: StepState;
  config: GenerationConfig;
  projectId?: string | null;
  projectName?: string | null;
  provider?: GenerationProvider | null;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onGenerate: () => void;
  onHistoryRecord?: (record: GenerationHistoryItem) => void;
  onSecondaryEditResult?: (resultId: string, action: SecondaryEditAction) => void;
}

interface PanoramaRenderResult {
  imageUrl: string;
  renderedAt: string;
}

type PanoramaReferenceType = 'revit_screenshot' | 'floor_plan' | 'material_reference' | 'style_reference' | 'render_reference';

interface PanoramaReferenceImage {
  id: string;
  assetId: string;
  name: string;
  type: string;
  size: number;
  url: string;
  referenceType: PanoramaReferenceType;
  uploadedAt: string;
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
  referenceAssetIds?: string[];
  referenceTypes?: PanoramaReferenceType[];
  referenceImages?: PanoramaReferenceImage[];
  renderResult?: PanoramaRenderResult;
}

const modelAccept = '.glb,.gltf,.obj,.dae,.stl,.zip,model/gltf-binary,model/gltf+json,model/vnd.collada+xml,model/stl,application/zip,application/x-zip-compressed';
const MAX_MODEL_SIZE_MB = 600;
const MAX_MODEL_SIZE_BYTES = MAX_MODEL_SIZE_MB * 1024 * 1024;
const PANORAMA_SLOT_INDICES = [1, 2, 3, 4] as const;
const PANORAMA_SLOT_STORAGE_PREFIX = 'archai:panorama-quick-render-slots:v1';
const MAX_PANORAMA_REFERENCE_IMAGES = 6;
const referenceTypeOptions: Array<{ value: PanoramaReferenceType; label: string }> = [
  { value: 'revit_screenshot', label: 'Revit 截图' },
  { value: 'floor_plan', label: '平面图' },
  { value: 'material_reference', label: '材质图' },
  { value: 'style_reference', label: '风格图' },
  { value: 'render_reference', label: '效果图' },
];
const panoramaReferenceStrengthOptions: Array<{ value: 'low' | 'medium' | 'high'; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];
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
  projectName = null,
  provider = null,
  onUpdateConfig,
  onUpdateInputImage,
  onGenerate,
  onHistoryRecord,
}: PanoramaQuickRenderPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const referenceFileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<ModelViewerHandle>(null);
  const [model, setModel] = useState<AssetModel | null>(null);
  const [models, setModels] = useState<AssetModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingReferences, setIsUploadingReferences] = useState(false);
  const [referenceImages, setReferenceImages] = useState<PanoramaReferenceImage[]>([]);
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
  const [pendingRenderSlotIndex, setPendingRenderSlotIndex] = useState<number | null>(null);
  const [pendingRenderAssetId, setPendingRenderAssetId] = useState('');
  const [pendingRenderRequestId, setPendingRenderRequestId] = useState('');
  const [slotsStorageKey, setSlotsStorageKey] = useState('');
  const lastHandledOutputRef = useRef<string>('');

  const activeSlot = slots.find(slot => slot.slotIndex === activeSlotIndex) || null;
  const activeRenderSlot = activeSlot || slots.find(item => item.slotIndex === captureSlotIndex) || null;
  const selectedGenerationResult = state.generationResults.find(result => result.isSelected) || state.generationResults[0];
  const currentRawPanoramaUrl = activeSlot?.rawImage.url || activeSlot?.rawImage.dataUrl || panoramaRecord?.panoramaUrl || state.inputImage?.url || state.inputImage?.dataUrl || '';
  const currentRenderedPanoramaUrl = getOriginalResultImageUrl(selectedGenerationResult, activeSlot?.renderResult?.imageUrl || panoramaRecord?.renderedPanoramaUrl) || '';
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
  const panoramaReferenceStrength = config.panoramaReferenceStrength || 'medium';
  const providerSupportsReferences = providerSupportsPanoramaReferences(provider);
  const referenceUsageText = `当前使用 ${getSlotRawAssetId(activeSlot) || state.inputImage?.assetId || state.inputImage?.id ? 1 : 0} 张全景图 + ${referenceImages.length} 张参考图`;
  const renderButtonDisabledReason = getRenderButtonDisabledReason({
    projectId,
    slot: activeRenderSlot,
    isGenerating: state.isGenerating,
    isBatchRendering,
    isPreparing: Boolean(pendingRenderAssetId),
  });
  const batchRenderButtonDisabledReason = getBatchRenderButtonDisabledReason({
    projectId,
    slots: renderableSelectedSlots,
    isGenerating: state.isGenerating,
    isBatchRendering,
    isPreparing: Boolean(pendingRenderAssetId),
  });

  const syncReferenceImages = useCallback((nextReferenceImages: PanoramaReferenceImage[]) => {
    const limitedReferences = normalizePanoramaReferenceImages(nextReferenceImages);
    setReferenceImages(limitedReferences);

    const sourceAssetId = getSlotRawAssetId(activeSlot) || state.inputImage?.assetId || state.inputImage?.id;
    if (activeSlot) {
      setSlots(previous => previous.map(slot => {
        if (slot.slotIndex !== activeSlot.slotIndex) return slot;
        return {
          ...slot,
          referenceAssetIds: readReferenceAssetIds(limitedReferences),
          referenceTypes: readReferenceTypes(limitedReferences),
          referenceImages: limitedReferences,
          updatedAt: new Date().toISOString(),
        };
      }));
    }

    onUpdateConfig(buildPanoramaReferenceConfig(sourceAssetId, limitedReferences, panoramaReferenceStrength));
  }, [activeSlot, onUpdateConfig, panoramaReferenceStrength, state.inputImage?.assetId, state.inputImage?.id]);

  const applySlotAsCurrent = useCallback((slot: PanoramaCaptureSlot, nextPreviewKind: 'raw' | 'rendered' = 'raw', nextReferenceImages?: PanoramaReferenceImage[]) => {
    const slotReferences = normalizePanoramaReferenceImages(nextReferenceImages ?? slot.referenceImages ?? []);
    const sourceAssetId = getSlotRawAssetId(slot);
    const normalizedRawImage = normalizeSlotRawImage(slot);
    setActiveSlotIndex(slot.slotIndex);
    setCaptureSlotIndex(slot.slotIndex);
    setPanoramaRecord(slot.panoramaRecord);
    setReferenceImages(slotReferences);
    setPrimaryPreviewTab('panorama');
    setPanoramaPreviewKind(nextPreviewKind === 'rendered' && slot.renderResult ? 'rendered' : 'raw');
    onUpdateInputImage(normalizedRawImage);
    onUpdateConfig({
      sourceModelAssetId: slot.modelId,
      sourceImageAssetId: sourceAssetId,
      panoramaAssetId: sourceAssetId,
      targetWidth: normalizedRawImage.width,
      targetHeight: normalizedRawImage.height,
      targetAspectRatio: '2:1',
      qualityMode: 'high',
      panoramaQuality: slot.capture.panoramaQuality || panoramaQuality,
      panoramaChangeStrength,
      panoramaCapture: slot.capture,
      ...buildPanoramaReferenceConfig(sourceAssetId, slotReferences, panoramaReferenceStrength),
    });
  }, [onUpdateConfig, onUpdateInputImage, panoramaChangeStrength, panoramaQuality, panoramaReferenceStrength]);

  const submitSlotForGeneration = useCallback((slotIndex: number): boolean => {
    const slot = slots.find(item => item.slotIndex === slotIndex);
    const disabledReason = getRenderButtonDisabledReason({
      projectId,
      slot,
      isGenerating: state.isGenerating,
      isBatchRendering: false,
      isPreparing: false,
    });
    if (disabledReason) {
      setMessage(disabledReason);
      return false;
    }
    if (!slot) return false;

    const sourceAssetId = getSlotRawAssetId(slot);
    if (!sourceAssetId) {
      setMessage('当前全景图缺少 assetId，无法创建 AI 生成任务。请重新截图生成全景图。');
      return false;
    }

    const slotReferences = normalizePanoramaReferenceImages(slot.referenceImages?.length ? slot.referenceImages : referenceImages);
    if (slotReferences.length > 0 && !providerSupportsReferences) {
      setMessage('当前 provider 不支持参考图增强。请切换到 Gemini、GRS Banana2/Nano Banana 或移除参考图后再渲染。');
      return false;
    }

    const missingAssetReference = slotReferences.find(reference => !reference.assetId);
    if (missingAssetReference) {
      setMessage(`参考图「${missingAssetReference.name || '未命名'}」缺少 assetId，请重新上传该参考图。`);
      return false;
    }

    const updatedSlot: PanoramaCaptureSlot = {
      ...slot,
      rawImage: normalizeSlotRawImage(slot),
      referenceAssetIds: readReferenceAssetIds(slotReferences),
      referenceTypes: readReferenceTypes(slotReferences),
      referenceImages: slotReferences,
      updatedAt: new Date().toISOString(),
    };
    const requestId = createRenderRequestId();
    setSlots(previous => upsertPanoramaSlot(previous, updatedSlot));
    applySlotAsCurrent(updatedSlot, 'raw', slotReferences);
    setPendingRenderSlotIndex(updatedSlot.slotIndex);
    setPendingRenderAssetId(sourceAssetId);
    setPendingRenderRequestId(requestId);
    setMessage('正在准备 AI 渲染任务...');
    debugPanoramaRender('queue render', {
      slotIndex,
      rawImageAssetId: slot.rawImage.assetId,
      rawImageId: slot.rawImage.id,
      pendingRenderAssetId: sourceAssetId,
      stateInputAssetId: state.inputImage?.assetId,
      configPanoramaAssetId: config.panoramaAssetId,
      requestId,
    });
    return true;
  }, [applySlotAsCurrent, config.panoramaAssetId, projectId, providerSupportsReferences, referenceImages, slots, state.inputImage?.assetId, state.isGenerating]);

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
      setReferenceImages([]);
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
    setReferenceImages(storedSlots[0]?.referenceImages || []);
    setPanoramaPreviewKind('raw');
  }, [model?.id, projectId]);

  useEffect(() => {
    if (!model?.id || !slotsStorageKey) return;
    if (slotsStorageKey !== getPanoramaSlotStorageKey(projectId, model.id)) return;
    writeStoredPanoramaSlots(slotsStorageKey, slots);
  }, [model?.id, projectId, slots, slotsStorageKey]);

  useEffect(() => {
    if (!pendingRenderAssetId || !pendingRenderRequestId) return;
    const stateInputAssetId = state.inputImage?.assetId || '';
    const stateInputId = state.inputImage?.id || '';
    const configPanoramaAssetId = config.panoramaAssetId || config.sourceImageAssetId || '';
    const isSynced = stateInputAssetId === pendingRenderAssetId
      || stateInputId === pendingRenderAssetId
      || configPanoramaAssetId === pendingRenderAssetId;

    debugPanoramaRender('pending sync check', {
      pendingRenderSlotIndex,
      pendingRenderAssetId,
      pendingRenderRequestId,
      stateInputAssetId,
      stateInputId,
      configPanoramaAssetId,
      isGenerating: state.isGenerating,
      isSynced,
      willCallGenerate: isSynced && !state.isGenerating,
    });

    if (!isSynced || state.isGenerating) return;

    setPendingRenderSlotIndex(null);
    setPendingRenderAssetId('');
    setPendingRenderRequestId('');
    setMessage('正在创建 AI 生成任务...');
    debugPanoramaRender('call onGenerate', {
      pendingRenderSlotIndex,
      pendingRenderAssetId,
      stateInputAssetId,
      configPanoramaAssetId,
      willCallGenerate: true,
    });
    onGenerate();
  }, [
    config.panoramaAssetId,
    config.sourceImageAssetId,
    onGenerate,
    pendingRenderAssetId,
    pendingRenderRequestId,
    pendingRenderSlotIndex,
    state.inputImage?.assetId,
    state.inputImage?.id,
    state.isGenerating,
  ]);

  useEffect(() => {
    if (state.generationStatus !== 'error') return;
    if (!pendingRenderAssetId && !isBatchRendering && batchActiveSlotIndex === null) return;
    setPendingRenderSlotIndex(null);
    setPendingRenderAssetId('');
    setPendingRenderRequestId('');
    setBatchQueue([]);
    setIsBatchRendering(false);
    setBatchActiveSlotIndex(null);
    setMessage(state.generationError || 'AI 全景渲染失败，请查看下方错误信息。');
    debugPanoramaRender('render failed, stop pending/batch', {
      generationError: state.generationError,
      generationStatus: state.generationStatus,
      generationProgress: state.generationProgress,
    });
  }, [batchActiveSlotIndex, isBatchRendering, pendingRenderAssetId, state.generationError, state.generationProgress, state.generationStatus]);

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
      const [nextSlotIndex, ...remaining] = batchQueue;
      setBatchQueue(remaining);
      if (nextSlotIndex) {
        setBatchActiveSlotIndex(nextSlotIndex);
        if (!submitSlotForGeneration(nextSlotIndex)) {
          setIsBatchRendering(false);
          setBatchActiveSlotIndex(null);
          setBatchQueue([]);
        }
      } else {
        setIsBatchRendering(false);
        setBatchActiveSlotIndex(null);
      }
    }
  }, [activeSlotIndex, batchActiveSlotIndex, batchQueue, slots, state.outputImage, submitSlotForGeneration]);

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
      setReferenceImages([]);
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
        ...buildPanoramaReferenceConfig(undefined, [], panoramaReferenceStrength),
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
          ...buildPanoramaReferenceConfig(imageAsset.id, referenceImages, panoramaReferenceStrength),
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
          referenceAssetIds: readReferenceAssetIds(referenceImages),
          referenceTypes: readReferenceTypes(referenceImages),
          referenceImages,
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
        ...buildPanoramaReferenceConfig(imageAsset.id, referenceImages, panoramaReferenceStrength),
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
      setReferenceImages([]);
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
        onUpdateInputImage(normalizeSlotRawImage(nextSlot));
        setReferenceImages(nextSlot.referenceImages || []);
      } else {
        onUpdateInputImage(null);
        setReferenceImages([]);
      }
    }
  };

  const handleGenerateActiveSlot = () => {
    const slot = activeSlot || slots.find(item => item.slotIndex === captureSlotIndex);
    debugPanoramaRender('click active render button', {
      slotIndex: slot?.slotIndex,
      rawImageAssetId: slot?.rawImage.assetId,
      rawImageId: slot?.rawImage.id,
      pendingRenderAssetId,
      stateInputAssetId: state.inputImage?.assetId,
      configPanoramaAssetId: config.panoramaAssetId,
      disabledReason: renderButtonDisabledReason,
    });
    const disabledReason = getRenderButtonDisabledReason({
      projectId,
      slot,
      isGenerating: state.isGenerating,
      isBatchRendering,
      isPreparing: Boolean(pendingRenderAssetId),
    });
    if (disabledReason) {
      setMessage(disabledReason);
      return;
    }
    setBatchQueue([]);
    setIsBatchRendering(false);
    setBatchActiveSlotIndex(slot.slotIndex);
    if (!submitSlotForGeneration(slot.slotIndex)) {
      setBatchActiveSlotIndex(null);
    }
  };

  const handleGenerateSelectedSlots = () => {
    const targetSlots = renderableSelectedSlots.length > 0 ? renderableSelectedSlots : (activeSlot ? [activeSlot] : []);
    debugPanoramaRender('click batch render button', {
      slotIndices: targetSlots.map(slot => slot.slotIndex),
      pendingRenderAssetId,
      stateInputAssetId: state.inputImage?.assetId,
      configPanoramaAssetId: config.panoramaAssetId,
      disabledReason: batchRenderButtonDisabledReason,
    });
    const disabledReason = getBatchRenderButtonDisabledReason({
      projectId,
      slots: targetSlots,
      isGenerating: state.isGenerating,
      isBatchRendering,
      isPreparing: Boolean(pendingRenderAssetId),
    });
    if (disabledReason) {
      setMessage(disabledReason);
      return;
    }
    const [firstSlot, ...remainingSlots] = targetSlots.sort((a, b) => a.slotIndex - b.slotIndex);
    setBatchQueue(remainingSlots.map(slot => slot.slotIndex));
    setIsBatchRendering(targetSlots.length > 1);
    setBatchActiveSlotIndex(firstSlot.slotIndex);
    if (!submitSlotForGeneration(firstSlot.slotIndex)) {
      setBatchQueue([]);
      setIsBatchRendering(false);
      setBatchActiveSlotIndex(null);
    }
  };

  const handleReferenceUpload = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const remainingSlots = MAX_PANORAMA_REFERENCE_IMAGES - referenceImages.length;
    if (remainingSlots <= 0) {
      setMessage(`最多支持 ${MAX_PANORAMA_REFERENCE_IMAGES} 张参考图。`);
      return;
    }

    const supportedFiles = files.filter(isSupportedReferenceImageFile).slice(0, remainingSlots);
    if (supportedFiles.length === 0) {
      setMessage('请上传 JPG、PNG 或 WebP 格式的参考图。');
      return;
    }

    setIsUploadingReferences(true);
    setMessage(files.length > supportedFiles.length ? `已忽略超出数量或格式不支持的参考图，最多 ${MAX_PANORAMA_REFERENCE_IMAGES} 张。` : null);
    try {
      const uploadedReferences = await Promise.all(supportedFiles.map(async file => {
        const asset = await uploadImageAsset(file, file.name);
        return {
          id: asset.id,
          assetId: asset.id,
          name: file.name || asset.filename,
          type: file.type || asset.mimeType,
          size: file.size || asset.size,
          url: asset.url,
          referenceType: 'revit_screenshot' as PanoramaReferenceType,
          uploadedAt: asset.createdAt || new Date().toISOString(),
        };
      }));
      syncReferenceImages([...referenceImages, ...uploadedReferences]);
    } catch (error) {
      setMessage(error instanceof Error ? `参考图上传失败：${error.message}` : '参考图上传失败，请重试。');
    } finally {
      setIsUploadingReferences(false);
    }
  };

  const handleReferenceTypeChange = (referenceId: string, referenceType: PanoramaReferenceType) => {
    syncReferenceImages(referenceImages.map(reference => (
      reference.id === referenceId ? { ...reference, referenceType } : reference
    )));
  };

  const handleRemoveReference = (referenceId: string) => {
    syncReferenceImages(referenceImages.filter(reference => reference.id !== referenceId));
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
      <input
        ref={referenceFileInputRef}
        type="file"
        accept={IMAGE_UPLOAD_ACCEPT}
        multiple
        className="hidden"
        onChange={event => {
          void handleReferenceUpload(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />

      <section className="workspace-surface min-w-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
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

            <PanoramaGenerationStateCard
              state={state}
              pendingRenderAssetId={pendingRenderAssetId}
              pendingRenderSlotIndex={pendingRenderSlotIndex}
            />

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

            <div className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">参考图增强</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">{referenceUsageText}</p>
                </div>
                <span className="rounded bg-white px-2 py-1 text-[10px] font-bold text-slate-500">
                  {referenceImages.length}/{MAX_PANORAMA_REFERENCE_IMAGES}
                </span>
              </div>

              {referenceImages.length === 0 ? (
                <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
                  仅使用白模全景图，材质可能不准确。可上传 Revit 截图、平面图、材质图或效果图作为 AI 参考。
                </div>
              ) : null}

              {referenceImages.length > 0 && !providerSupportsReferences ? (
                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-700">
                  当前 provider 不支持参考图增强，请切换到 Gemini、GRS Banana2/Nano Banana 或移除参考图。
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => referenceFileInputRef.current?.click()}
                  disabled={isUploadingReferences || referenceImages.length >= MAX_PANORAMA_REFERENCE_IMAGES}
                  className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-800 shadow-sm ring-1 ring-slate-200 disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {isUploadingReferences ? '上传中...' : '上传参考图'}
                </button>
                <div className="inline-flex rounded-lg bg-white p-1 text-xs font-bold shadow-sm ring-1 ring-slate-200">
                  {panoramaReferenceStrengthOptions.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onUpdateConfig({
                        ...buildPanoramaReferenceConfig(getSlotRawAssetId(activeSlot) || state.inputImage?.assetId || state.inputImage?.id, referenceImages, option.value),
                      })}
                      className={`rounded-md px-2 py-1 ${panoramaReferenceStrength === option.value ? 'bg-slate-950 text-white' : 'text-slate-500'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {referenceImages.length > 0 ? (
                <div className="space-y-2">
                  {referenceImages.map(reference => (
                    <div key={reference.id} className="flex gap-2 rounded-lg border border-slate-200 bg-white p-2">
                      <img src={reference.url} alt={reference.name} className="h-14 w-20 shrink-0 rounded-md bg-slate-100 object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-800">{reference.name}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <select
                            value={reference.referenceType}
                            onChange={event => handleReferenceTypeChange(reference.id, event.target.value as PanoramaReferenceType)}
                            className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700"
                          >
                            {referenceTypeOptions.map(option => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <span className="text-[10px] text-slate-400">assetId 已绑定</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveReference(reference.id)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-red-500"
                        title="移除参考图"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
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
              disabled={Boolean(renderButtonDisabledReason)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {pendingRenderAssetId ? '正在准备 AI 渲染任务...' : state.isGenerating || isBatchRendering ? '正在 AI 渲染全景...' : 'AI 渲染当前槽位'}
            </button>
            {renderButtonDisabledReason ? (
              <p className="mt-1 text-[11px] font-semibold leading-4 text-amber-700">{renderButtonDisabledReason}</p>
            ) : null}

            <button
              type="button"
              onClick={handleGenerateSelectedSlots}
              disabled={Boolean(batchRenderButtonDisabledReason)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {isBatchRendering ? `批量渲染中 ${batchActiveSlotIndex || ''}` : `批量渲染已选槽位（${renderableSelectedSlots.length}）`}
            </button>
            {batchRenderButtonDisabledReason ? (
              <p className="mt-1 text-[11px] font-semibold leading-4 text-amber-700">{batchRenderButtonDisabledReason}</p>
            ) : null}

            <ResultPreview
              imageUrl={panoramaUrl}
              previewKind={panoramaPreviewKind}
              canShowRendered={canShowRenderedPanorama}
              projectName={projectName || projectId || 'archai-project'}
              assetId={panoramaPreviewKind === 'rendered'
                ? getOriginalResultAssetId(selectedGenerationResult)
                : config.panoramaAssetId}
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
                      onClick={() => onUpdateConfig({ panoramaChangeStrength: option.value, changeStrength: option.value })}
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
              <SmartPromptAssistant
                mode="panorama-roam-render"
                config={config}
                compact
                fields={['buildingType', 'spaceType', 'renderStyle', 'smartMaterial', 'lighting']}
                onUpdateConfig={onUpdateConfig}
              />
              <label className="block text-xs font-bold text-slate-600">
                额外补充要求
                <div className="mt-2">
                  <PromptVoiceAssistant
                    generationStep={GenerationStep.PanoramaQuickRender}
                    currentPrompt={config.customPrompt || ''}
                    context={config as unknown as Record<string, unknown>}
                    onApplyPrompt={prompt => onUpdateConfig({ customPrompt: prompt })}
                  />
                </div>
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

function PanoramaGenerationStateCard({
  state,
  pendingRenderAssetId,
  pendingRenderSlotIndex,
}: {
  state: StepState;
  pendingRenderAssetId: string;
  pendingRenderSlotIndex: number | null;
}) {
  const shouldShow = Boolean(
    pendingRenderAssetId
      || state.generationStatus !== 'ready'
      || state.generationError
      || state.generationLogs.length > 0,
  );
  if (!shouldShow) return null;

  const recentLogs = state.generationLogs.slice(-4);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">AI 生成状态</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            {pendingRenderAssetId
              ? `正在准备槽位 ${pendingRenderSlotIndex || '-'} 的 AI 渲染任务...`
              : readPanoramaGenerationStatusLabel(state.generationStatus)}
          </p>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
          {Math.max(0, Math.min(100, state.generationProgress || 0))}%
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${state.generationStatus === 'error' ? 'bg-red-500' : 'bg-blue-600'}`}
          style={{ width: `${Math.max(pendingRenderAssetId ? 6 : 0, Math.min(100, state.generationProgress || 0))}%` }}
        />
      </div>
      {state.generationError ? (
        <div className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-700">
          {state.generationError}
        </div>
      ) : null}
      {state.generationJobStatus ? (
        <p className="mt-2 text-[11px] leading-4 text-slate-500">任务状态：{state.generationJobStatus}</p>
      ) : null}
      {recentLogs.length > 0 ? (
        <div className="mt-2 space-y-1 rounded-lg bg-slate-50 px-3 py-2">
          {recentLogs.map((log, index) => (
            <p key={`${log}-${index}`} className="whitespace-pre-wrap break-words text-[10px] leading-4 text-slate-500">{log}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ResultPreview({
  imageUrl,
  previewKind,
  canShowRendered,
  projectName,
  assetId,
  onPreviewKindChange,
  previewMode,
  onPreviewModeChange,
}: {
  imageUrl: string;
  previewKind: 'raw' | 'rendered';
  canShowRendered: boolean;
  projectName?: string | null;
  assetId?: string | null;
  onPreviewKindChange: (kind: 'raw' | 'rendered') => void;
  previewMode: 'image' | '360';
  onPreviewModeChange: (mode: 'image' | '360') => void;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!imageUrl || isDownloading) return;
    setIsDownloading(true);
    setDownloadMessage(null);
    setDownloadError(null);
    try {
      await downloadAsset({
        url: imageUrl,
        assetId,
      }, buildResultImageFilename({
        projectName,
        featureLabel: previewKind === 'rendered' ? '全景快渲' : '全景截图',
      }));
      setDownloadMessage('已开始下载');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setDownloadError(message === downloadFallbackMessage ? downloadFallbackMessage : '下载失败，请稍后重试');
    } finally {
      setIsDownloading(false);
    }
  };

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
          <button
            type="button"
            onClick={() => window.open(imageUrl, '_blank', 'noopener,noreferrer')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-sm hover:text-blue-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            查看原图
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={isDownloading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-sm hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className={`h-3.5 w-3.5 ${isDownloading ? 'animate-pulse' : ''}`} />
            {isDownloading ? '正在下载...' : '保存到本地'}
          </button>
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
      {downloadMessage || downloadError ? (
        <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold">
          {downloadMessage ? <span className="text-emerald-700">{downloadMessage}</span> : null}
          {downloadError ? <span className="text-amber-700">{downloadError}</span> : null}
        </div>
      ) : null}
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

function getSlotRawAssetId(slot: PanoramaCaptureSlot | null | undefined): string {
  return slot?.rawImage?.assetId || slot?.rawImage?.id || '';
}

function normalizeSlotRawImage(slot: PanoramaCaptureSlot): UploadedImage {
  const assetId = getSlotRawAssetId(slot);
  if (!assetId) return slot.rawImage;
  return {
    ...slot.rawImage,
    id: slot.rawImage.id || assetId,
    assetId,
  };
}

function getRenderButtonDisabledReason(input: {
  projectId?: string | null;
  slot?: PanoramaCaptureSlot | null;
  isGenerating: boolean;
  isBatchRendering: boolean;
  isPreparing: boolean;
}): string {
  if (!input.slot) return '请先生成 360 全景截图';
  if (!input.slot.rawImage) return '当前槽位没有原始全景图';
  if (!getSlotRawAssetId(input.slot)) return '全景图尚未上传为素材，请重新生成全景截图';
  if (input.isPreparing) return '正在准备 AI 渲染任务...';
  if (input.isGenerating) return 'AI 正在渲染中';
  if (input.isBatchRendering) return '批量渲染进行中';
  return '';
}

function getBatchRenderButtonDisabledReason(input: {
  projectId?: string | null;
  slots: PanoramaCaptureSlot[];
  isGenerating: boolean;
  isBatchRendering: boolean;
  isPreparing: boolean;
}): string {
  if (input.slots.length === 0) return '请先生成 360 全景截图';
  const invalidSlot = input.slots.find(slot => !slot.rawImage || !getSlotRawAssetId(slot));
  if (invalidSlot && !invalidSlot.rawImage) return `槽位 ${invalidSlot.slotIndex} 没有原始全景图`;
  if (invalidSlot) return `槽位 ${invalidSlot.slotIndex} 的全景图尚未上传为素材，请重新生成全景截图`;
  if (input.isPreparing) return '正在准备 AI 渲染任务...';
  if (input.isGenerating) return 'AI 正在渲染中';
  if (input.isBatchRendering) return '批量渲染进行中';
  return '';
}

function readPanoramaGenerationStatusLabel(status: StepState['generationStatus']): string {
  if (status === 'uploading') return '正在上传输入素材...';
  if (status === 'generating') return '正在创建或执行 AI 生成任务...';
  if (status === 'success') return 'AI 全景渲染已完成';
  if (status === 'error') return 'AI 全景渲染失败';
  return '等待生成';
}

function createRenderRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `render-${Date.now()}`;
}

function debugPanoramaRender(label: string, details: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.debug(`[PanoramaQuickRender] ${label}`, details);
  }
}

function normalizePanoramaReferenceImages(images: PanoramaReferenceImage[]): PanoramaReferenceImage[] {
  return images
    .filter(reference => Boolean(reference.url))
    .slice(0, MAX_PANORAMA_REFERENCE_IMAGES);
}

function readReferenceAssetIds(images: PanoramaReferenceImage[]): string[] {
  return normalizePanoramaReferenceImages(images)
    .map(reference => reference.assetId)
    .filter((assetId): assetId is string => Boolean(assetId));
}

function readReferenceTypes(images: PanoramaReferenceImage[]): PanoramaReferenceType[] {
  return normalizePanoramaReferenceImages(images).map(reference => reference.referenceType);
}

function buildPanoramaReferenceConfig(
  sourceAssetId: string | undefined,
  references: PanoramaReferenceImage[],
  strength: 'low' | 'medium' | 'high',
): Partial<GenerationConfig> {
  const referenceAssetIds = readReferenceAssetIds(references);
  return {
    panoramaSourceAssetId: sourceAssetId,
    panoramaReferenceAssetIds: referenceAssetIds,
    panoramaReferenceTypes: readReferenceTypes(references),
    panoramaReferenceMode: referenceAssetIds.length > 0 ? 'reference_guided' : undefined,
    panoramaReferenceStrength: strength,
  };
}

function providerSupportsPanoramaReferences(provider: GenerationProvider | null): boolean {
  if (!provider || provider === 'mock') return true;
  return provider === 'gemini'
    || provider === 'grsai-banana2'
    || provider === 'grsai-nano-banana'
    || provider === 'apiyi-nano-banana2-edit';
}

function isSupportedReferenceImageFile(file: File): boolean {
  return validateImageFile(file, 'panorama:reference') === null;
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
