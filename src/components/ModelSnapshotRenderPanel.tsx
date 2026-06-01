import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Box, Camera, CheckCircle2, RefreshCw, Upload } from 'lucide-react';
import { AssetModel, GenerationConfig, ModelSnapshotMetadata, StepState, UploadedImage } from '../types';
import { getModelAsset, listModelAssets, ModelAssetRecord, optimizeModelAsset, uploadImageAsset, uploadModelAsset } from '../lib/api';
import { ModelViewer, ModelViewerHandle } from './ModelViewer';
import { mapModelAssetRecordToAssetModel, mapModelToOriginalSource } from './modelAssetUtils';
import { SmartPromptAssistant } from './workspace/SmartPromptAssistant';

interface ModelSnapshotRenderPanelProps {
  state: StepState;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onGenerate: () => void;
}

const modelAccept = '.glb,.gltf,.obj,.dae,.stl,.zip,model/gltf-binary,model/gltf+json,model/vnd.collada+xml,model/stl,application/zip,application/x-zip-compressed';
const MAX_MODEL_SIZE_MB = 600;
const MAX_MODEL_SIZE_BYTES = MAX_MODEL_SIZE_MB * 1024 * 1024;
const MODEL_OPTIMIZATION_THRESHOLD_BYTES = 30 * 1024 * 1024;

export function ModelSnapshotRenderPanel({ state, onUpdateConfig, onUpdateInputImage, onGenerate }: ModelSnapshotRenderPanelProps) {
  const viewerRef = useRef<ModelViewerHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const snapshotInputRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<AssetModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<AssetModel | null>(null);
  const [inputMode, setInputMode] = useState<'model-capture' | 'uploaded-snapshot'>('model-capture');
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [originalLoadApprovals, setOriginalLoadApprovals] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setIsLoadingModels(true);
    void listModelAssets()
      .then(records => {
        const nextModels = records.map(record => mapModelAssetRecord(record));
        setModels(nextModels);
        setSelectedModel(current => current || nextModels.find(model => model.previewable) || nextModels[0] || null);
      })
      .catch(error => setMessage(error instanceof Error ? error.message : '模型资产加载失败。'))
      .finally(() => setIsLoadingModels(false));
  }, []);

  useEffect(() => {
    if (!selectedModel || !isOptimizationInProgress(selectedModel.optimizationStatus)) return;

    const interval = window.setInterval(() => {
      void refreshModelAsset(selectedModel.id);
    }, 2500);

    return () => window.clearInterval(interval);
  }, [selectedModel?.id, selectedModel?.optimizationStatus]);

  const snapshotUrl = state.inputImage?.dataUrl || state.inputImage?.url || null;
  const isSelectedModelBlocked = selectedModel ? isModelPreviewBlocked(selectedModel) && !originalLoadApprovals[selectedModel.id] : false;
  const canCapture = Boolean(selectedModel && selectedModel.previewable && (selectedModel.convertedUrl || selectedModel.modelUrl) && !isSelectedModelBlocked);

  async function refreshModelAsset(modelId: string) {
    const record = await getModelAsset(modelId);
    const updated = mapModelAssetRecord(record, originalLoadApprovals[record.id]);
    setModels(previous => previous.map(item => item.id === updated.id ? updated : item));
    setSelectedModel(current => current?.id === updated.id ? updated : current);
  }

  const handleModelUpload = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    if (file.size > MAX_MODEL_SIZE_BYTES) {
      setMessage(`模型文件过大，最大支持 ${MAX_MODEL_SIZE_MB}MB。建议压缩模型或导出为 GLB 后重新上传。`);
      return;
    }

    setIsUploadingModel(true);
    setMessage(null);
    try {
      const asset = await uploadModelAsset(file);
      const model = mapModelAssetRecord(asset);
      setModels(previous => [model, ...previous.filter(item => item.id !== model.id)]);
      setSelectedModel(model);
      onUpdateInputImage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '模型上传失败，请重试。');
    } finally {
      setIsUploadingModel(false);
    }
  };

  const handleSnapshotUpload = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    if (!/^image\/(png|jpe?g|webp)$/iu.test(file.type)) {
      setMessage('请上传 jpg、png 或 webp 格式的模型截图。');
      return;
    }

    setIsUploadingModel(true);
    setMessage(null);
    try {
      const asset = await uploadImageAsset(file, file.name);
      const dataUrl = await fileToDataUrl(file);
      const dimensions = await readImageDimensions(dataUrl).catch(() => null);
      const metadata: ModelSnapshotMetadata = {
        sourceType: 'model-snapshot',
        inputSource: 'uploaded-snapshot',
        snapshotAssetId: asset.id,
        ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
        createdAt: new Date().toISOString(),
      };
      onUpdateInputImage({
        id: `uploaded-model-snapshot-${Date.now()}`,
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl,
        url: asset.url,
        assetId: asset.id,
        width: dimensions?.width,
        height: dimensions?.height,
      });
      onUpdateConfig({
        sourceModelAssetId: undefined,
        sourceImageAssetId: asset.id,
        snapshotAssetId: asset.id,
        inputSource: 'uploaded-snapshot',
        modelSnapshotMetadata: metadata,
        customPrompt: state.config.customPrompt,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '截图上传失败，请重试。');
    } finally {
      setIsUploadingModel(false);
    }
  };

  const handleCapture = async () => {
    if (!selectedModel) {
      setMessage('请先选择一个 3D 模型');
      return;
    }
    if (!viewerRef.current) {
      setMessage('当前模型预览无法截图，请检查模型资源是否允许 canvas 导出。');
      return;
    }

    setIsCapturing(true);
    setMessage(null);
    try {
      const capture = await viewerRef.current.captureSnapshot();
      const file = dataUrlToFile(capture.dataUrl, `model-snapshot-${Date.now()}.png`);
      const asset = await uploadImageAsset(file, file.name);
      const metadata: ModelSnapshotMetadata = {
        sourceType: 'model-snapshot',
        inputSource: 'model-capture',
        sourceModelAssetId: selectedModel.id,
        snapshotAssetId: asset.id,
        modelPreviewUrl: selectedModel.convertedUrl || (selectedModel.usesOptimizedPreview ? selectedModel.modelUrl : selectedModel.previewUrl || selectedModel.optimizedUrl),
        usedOptimizedModel: Boolean(selectedModel.usesOptimizedPreview),
        optimizationStatus: selectedModel.optimizationStatus,
        width: capture.width,
        height: capture.height,
        camera: capture.camera,
        viewMode: capture.viewMode,
        clippingEnabled: capture.clippingEnabled,
        clippingHeight: capture.clippingHeight,
        xrayEnabled: capture.xrayEnabled,
        edgesEnabled: capture.edgesEnabled,
        createdAt: new Date().toISOString(),
      };
      const image: UploadedImage = {
        id: `model-snapshot-${Date.now()}`,
        name: file.name,
        type: 'image/png',
        size: file.size,
        dataUrl: capture.dataUrl,
        url: asset.url,
        assetId: asset.id,
        width: capture.width,
        height: capture.height,
      };

      onUpdateInputImage(image);
      onUpdateConfig({
        sourceModelAssetId: selectedModel.id,
        sourceImageAssetId: asset.id,
        snapshotAssetId: asset.id,
        inputSource: 'model-capture',
        modelSnapshotMetadata: metadata,
        customPrompt: state.config.customPrompt,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '截图上传失败，请重试。');
    } finally {
      setIsCapturing(false);
    }
  };

  const selectedModelDetails = useMemo(() => {
    if (!selectedModel) return '尚未选择模型';
    return `${selectedModel.fileName} / ${selectedModel.size}`;
  }, [selectedModel]);

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
        ref={snapshotInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={event => {
          void handleSnapshotUpload(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />

      <section className="min-w-0 flex-1 overflow-y-auto bg-slate-100 p-4 custom-scrollbar">
        <div className="grid min-h-full gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setInputMode('model-capture')}
                  className={`rounded-lg px-3 py-2 text-sm font-bold ${inputMode === 'model-capture' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  模型取景
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('uploaded-snapshot')}
                  className={`rounded-lg px-3 py-2 text-sm font-bold ${inputMode === 'uploaded-snapshot' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  上传截图
                </button>
              </div>
            </div>
            {message ? (
              <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{message}</span>
              </div>
            ) : null}

            {inputMode === 'uploaded-snapshot' ? (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900">上传模型截图</p>
                    <p className="mt-1 text-xs text-slate-500">上传 SU / Rhino / Blender / 白模截图</p>
                  </div>
                </div>
                <div className="flex h-[calc(100vh-168px)] min-h-[420px] flex-col items-center justify-center bg-slate-50 p-6 xl:min-h-[560px]">
                  {snapshotUrl ? (
                    <img src={snapshotUrl} alt="上传的模型截图" className="max-h-full w-full max-w-full object-contain" />
                  ) : (
                    <div className="max-w-sm text-center">
                      <Camera className="mx-auto h-10 w-10 text-slate-300" />
                      <p className="mt-3 text-sm font-bold text-slate-800">上传 SU / Rhino / Blender / 白模截图</p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">该截图将直接作为结构参考图，不需要上传 3D 模型。</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => snapshotInputRef.current?.click()}
                    disabled={isUploadingModel}
                    className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    {snapshotUrl ? '重新上传截图' : '上传截图'}
                  </button>
                </div>
              </div>
            ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">模型视角</p>
                  <p className="mt-1 text-xs text-slate-500">{selectedModelDetails}</p>
                </div>
                <div className="hidden text-xs font-semibold text-slate-400 sm:block">旋转、缩放、漫游并截取当前视角</div>
              </div>
              <div className="h-[calc(100vh-168px)] min-h-[420px] xl:min-h-[560px]">
                {selectedModel && isSelectedModelBlocked ? (
                  <ModelOptimizationGate
                    model={selectedModel}
                    onRefresh={() => void refreshModelAsset(selectedModel.id)}
                    onRetry={() => {
                      void optimizeModelAsset(selectedModel.id).then(record => {
                        const updated = mapModelAssetRecord(record, originalLoadApprovals[record.id]);
                        setModels(previous => previous.map(item => item.id === updated.id ? updated : item));
                        setSelectedModel(updated);
                      });
                    }}
                    onLoadOriginal={() => {
                      setOriginalLoadApprovals(previous => ({ ...previous, [selectedModel.id]: true }));
                      setSelectedModel(mapModelFromApprovedOriginal(selectedModel));
                    }}
                  />
                ) : selectedModel ? (
                  <ModelViewer ref={viewerRef} asset={selectedModel} minHeight={560} />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">请先选择一个 3D 模型</div>
                )}
              </div>
            </div>
            )}
          </div>

          <aside className="max-h-none space-y-4 overflow-y-visible rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:max-h-[calc(100vh-112px)] xl:overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white">
                <Box className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-950">白模快渲</p>
                <p className="mt-1 text-xs text-slate-500">上传 3D 白模，选好角度，一键生成效果图</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">模型文件信息</p>
              <p className="mt-2 truncate text-sm font-bold text-slate-800">{selectedModel?.fileName || '尚未选择模型'}</p>
              <p className="mt-1 text-xs text-slate-500">{selectedModel ? `${selectedModel.fileType.toUpperCase()} / ${selectedModel.size}` : '请上传或选择模型资产'}</p>
              {selectedModel?.optimizationStatus === 'failed' && isModelServiceUnavailable(selectedModel.optimizationError) ? (
                <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-2 py-1.5 text-[11px] leading-5 text-amber-700">
                  当前服务器未启用模型轻量化/转换服务，已继续使用原始模型。
                </p>
              ) : null}
              {selectedModel ? <ModelOptimizationSummary model={selectedModel} /> : null}
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">当前视角截图</p>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {snapshotUrl ? (
                  <>
                    <img src={snapshotUrl} alt="模型视角截图预览" className="h-40 w-full object-cover" />
                    <div className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      已截取当前视角
                    </div>
                  </>
                ) : (
                  <div className="flex h-36 flex-col items-center justify-center px-4 text-center text-xs leading-5 text-slate-500">
                    <Camera className="mb-3 h-8 w-8 text-slate-300" />
                    尚未截取视角
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <button
                type="button"
                onClick={inputMode === 'uploaded-snapshot' ? () => snapshotInputRef.current?.click() : handleCapture}
                disabled={inputMode === 'model-capture' ? (!canCapture || isCapturing) : isUploadingModel}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
              >
                <Camera className="h-4 w-4" />
                {inputMode === 'uploaded-snapshot' ? (snapshotUrl ? '重新上传截图' : '上传截图') : snapshotUrl ? '重新截取' : '截取当前视角'}
              </button>
              <button
                type="button"
                onClick={onGenerate}
                disabled={!snapshotUrl || state.isGenerating}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
              >
                {inputMode === 'uploaded-snapshot' ? '使用该截图生成' : '使用该视角生成'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingModel}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {isUploadingModel ? '上传中...' : '上传模型'}
            </button>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              <p className="font-bold text-slate-800">支持 GLB、GLTF、OBJ、DAE、STL、ZIP，单个模型最大 {MAX_MODEL_SIZE_MB}MB。DAE/OBJ 如包含贴图，请上传 ZIP 资源包。</p>
              <p>超过 30MB 的模型会优先等待后端轻量化预览，避免浏览器直接加载大模型。</p>
              <p className="font-semibold text-amber-700">暂不支持 FBX 和 SKP 原生文件。</p>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">模型资产</p>
              {isLoadingModels ? (
                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">正在加载模型资产...</div>
              ) : models.length > 0 ? (
                <div className="max-h-60 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {models.map(model => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        setSelectedModel(model);
                        onUpdateInputImage(null);
                        setMessage(null);
                      }}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedModel?.id === model.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-slate-800">{model.name}</span>
                        <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{model.fileType.toUpperCase()}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">{model.fileName}</p>
                      {model.convertedUrl ? <p className="mt-1 text-[11px] font-semibold text-emerald-600">已转换为 GLB，预览优先使用转换文件</p> : null}
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">{readOptimizationStatusLabel(model.optimizationStatus)}</p>
                      {!model.previewable ? <p className="mt-2 text-[11px] font-semibold text-amber-700">该格式暂不支持截图预览</p> : null}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-500">
                  还没有模型资产，请先上传 GLB、GLTF、OBJ、DAE 或 STL 模型。推荐使用 GLB。
                </div>
              )}
            </div>

            <div className="space-y-3 border-t border-slate-100 pt-4">
              <SmartPromptAssistant mode="model-render" config={state.config} compact onUpdateConfig={onUpdateConfig} />
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">额外补充要求</span>
                <textarea
                  value={state.config.customPrompt || state.config.prompt}
                  onChange={event => onUpdateConfig({ customPrompt: event.target.value })}
                  placeholder="可选：补充材质、光线、场景或设计意图；不填写也会根据上方参数生成。"
                  className="mt-2 h-24 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-300"
                />
              </label>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

function ModelOptimizationGate({ model, onRefresh, onRetry, onLoadOriginal }: { model: AssetModel; onRefresh: () => void; onRetry: () => void; onLoadOriginal: () => void }) {
  const status = model.optimizationStatus;
  const isFailed = status === 'failed';

  return (
    <div className="flex h-full items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
        <RefreshCw className={`mx-auto h-8 w-8 text-blue-500 ${isOptimizationInProgress(status) ? 'animate-spin' : ''}`} />
        <p className="mt-4 text-sm font-bold text-slate-900">
          {isFailed ? '模型轻量化失败' : '模型正在轻量化处理，请稍候...'}
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {isFailed
            ? `模型轻量化失败：${model.optimizationError || 'Model optimization requires Blender on the server.'}`
            : '大体积 STL / OBJ / DAE / GLB 会优先生成 Web 预览 GLB，避免浏览器直接加载原始大模型。'}
        </p>
        {isFailed ? (
          <p className="mt-2 text-xs leading-5 text-amber-700">模型较大，建议转换为 GLB 后上传，或在服务器安装 Blender 以启用自动轻量化。</p>
        ) : null}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={onRefresh} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700">
            刷新状态
          </button>
          {isFailed ? (
            <button type="button" onClick={onRetry} className="rounded-xl bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700">
              重新轻量化
            </button>
          ) : null}
          {isFailed || model.optimizationStatus === 'skipped' ? (
            <button type="button" onClick={onLoadOriginal} className="rounded-xl bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 sm:col-span-2">
              尝试加载原始模型
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ModelOptimizationSummary({ model }: { model: AssetModel }) {
  return (
    <div className="mt-3 space-y-1 rounded-lg bg-white px-3 py-2 text-[11px] leading-5 text-slate-500">
      <p><span className="font-bold text-slate-700">转换状态：</span>{readConversionStatusLabel(model)}</p>
      <p><span className="font-bold text-slate-700">轻量化状态：</span>{readOptimizationStatusLabel(model.optimizationStatus)}</p>
      <p><span className="font-bold text-slate-700">当前加载：</span>{model.convertedUrl ? '转换后 GLB' : model.usesOptimizedPreview ? '轻量化预览' : '原始模型'}</p>
      <p><span className="font-bold text-slate-700">原始大小：</span>{formatFileSize(model.originalFileSize || 0)}</p>
      {model.optimizedFileSize ? <p><span className="font-bold text-slate-700">预览大小：</span>{formatFileSize(model.optimizedFileSize)}</p> : null}
    </div>
  );
}

function mapModelAssetRecord(asset: ModelAssetRecord, forceOriginal = false): AssetModel {
  return mapModelAssetRecordToAssetModel(asset, { forceOriginal, category: '未分类' });
}

function mapModelFromApprovedOriginal(model: AssetModel): AssetModel {
  return mapModelToOriginalSource(model);
}

function isOptimizationInProgress(status: AssetModel['optimizationStatus']) {
  return status === 'pending' || status === 'processing';
}

function isModelPreviewBlocked(model: AssetModel): boolean {
  if (model.usesOptimizedPreview) return false;
  if (model.conversionStatus === 'failed' || model.convertedUrl) return false;
  if (model.optimizationStatus === 'failed' && isModelServiceUnavailable(model.optimizationError)) return false;
  const originalSize = model.originalFileSize || 0;
  if (isOptimizationInProgress(model.optimizationStatus)) return originalSize >= MODEL_OPTIMIZATION_THRESHOLD_BYTES;
  if (model.optimizationStatus === 'failed') return originalSize >= MODEL_OPTIMIZATION_THRESHOLD_BYTES;
  return originalSize >= MODEL_OPTIMIZATION_THRESHOLD_BYTES && !model.previewUrl && !model.optimizedUrl;
}

function isModelServiceUnavailable(message?: string | null): boolean {
  return Boolean(message && /Blender|未启用模型轻量化\/转换服务|requires Blender/i.test(message));
}

function readOptimizationStatusLabel(status: AssetModel['optimizationStatus']) {
  if (status === 'pending' || status === 'processing') return '正在轻量化';
  if (status === 'succeeded') return '轻量化完成';
  if (status === 'failed') return '轻量化失败';
  if (status === 'skipped') return '未处理';
  return '未处理';
}

function readConversionStatusLabel(model: AssetModel) {
  if (model.convertedUrl || model.conversionStatus === 'succeeded') return '已转换为 GLB';
  if (model.conversionStatus === 'converting') return '转换中';
  if (model.conversionStatus === 'failed') return '转换失败';
  if (model.fileType === 'obj' || model.fileType === 'dae' || model.fileType === 'zip') return '未转换';
  return '无需转换';
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('截图读取失败'));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (width > 0 && height > 0) {
        resolve({ width, height });
      } else {
        reject(new Error('Unable to read snapshot dimensions.'));
      }
    };
    image.onerror = () => reject(new Error('Unable to read snapshot dimensions.'));
    image.src = dataUrl;
  });
}
