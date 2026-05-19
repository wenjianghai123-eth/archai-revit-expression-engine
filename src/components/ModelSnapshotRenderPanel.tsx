import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Box, Camera, CheckCircle2, Upload } from 'lucide-react';
import { AssetModel, GenerationConfig, ModelSnapshotMetadata, StepState, UploadedImage } from '../types';
import { listModelAssets, ModelAssetRecord, uploadImageAsset, uploadModelAsset } from '../lib/api';
import { ModelViewer, ModelViewerHandle } from './ModelViewer';

interface ModelSnapshotRenderPanelProps {
  state: StepState;
  onUpdateConfig: (config: Partial<GenerationConfig>) => void;
  onUpdateInputImage: (image: UploadedImage | null) => void;
  onGenerate: () => void;
}

const modelAccept = '.glb,.gltf,.obj,.dae,.stl,model/gltf-binary,model/gltf+json,model/vnd.collada+xml,model/stl';
const MAX_MODEL_SIZE_MB = 600;
const MAX_MODEL_SIZE_BYTES = MAX_MODEL_SIZE_MB * 1024 * 1024;
const previewableTypes = new Set<AssetModel['fileType']>(['glb', 'gltf', 'obj', 'dae', 'stl']);
const buildingTypes = ['住宅', '商业', '办公', '展厅', '酒店', '景观', '自定义'];
const spaceTypes = ['外立面', '客厅', '餐厅', '卧室', '大堂', '办公区', '庭院', '自定义'];
const renderStyles = ['现代极简', '自然木质', '轻奢', '侘寂', '工业风', '参数化', '写实建筑表现'];
const atmospheres = ['日景', '夜景', '暖光', '自然光', '高级灰', '清晨', '黄昏'];

export function ModelSnapshotRenderPanel({ state, onUpdateConfig, onUpdateInputImage, onGenerate }: ModelSnapshotRenderPanelProps) {
  const viewerRef = useRef<ModelViewerHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<AssetModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<AssetModel | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isUploadingModel, setIsUploadingModel] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setIsLoadingModels(true);
    void listModelAssets()
      .then(records => {
        const nextModels = records.map(mapModelAssetRecord);
        setModels(nextModels);
        setSelectedModel(current => current || nextModels.find(model => model.previewable) || nextModels[0] || null);
      })
      .catch(error => setMessage(error instanceof Error ? error.message : '模型资产加载失败。'))
      .finally(() => setIsLoadingModels(false));
  }, []);

  const snapshotUrl = state.inputImage?.dataUrl || state.inputImage?.url || null;
  const canCapture = Boolean(selectedModel && selectedModel.previewable && selectedModel.modelUrl);

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
        sourceModelAssetId: selectedModel.id,
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
        modelSnapshotMetadata: metadata,
        customPrompt: state.config.customPrompt || state.config.prompt,
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

      <section className="min-w-0 flex-1 overflow-y-auto bg-slate-100 p-4 custom-scrollbar">
        <div className="grid min-h-full gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4">
          {message ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{message}</span>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-slate-900">模型视角</p>
                <p className="mt-1 text-xs text-slate-500">{selectedModelDetails}</p>
              </div>
              <div className="hidden text-xs font-semibold text-slate-400 sm:block">
                旋转、缩放、漫游并截取当前视角
              </div>
            </div>
            <div className="h-[calc(100vh-168px)] min-h-[420px] xl:min-h-[560px]">
              {selectedModel ? (
                <ModelViewer ref={viewerRef} asset={selectedModel} minHeight={560} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">请先选择一个 3D 模型</div>
              )}
            </div>
          </div>
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
                onClick={handleCapture}
                disabled={!canCapture || isCapturing}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
              >
                <Camera className="h-4 w-4" />
                {snapshotUrl ? '重新截取' : '截取当前视角'}
              </button>
              <button
                type="button"
                onClick={onGenerate}
                disabled={!snapshotUrl || state.isGenerating}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
              >
                使用该视角生成
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
              <p className="font-bold text-slate-800">支持 GLB、GLTF、OBJ、DAE、STL 模型，单个模型最大 600MB。推荐使用 GLB 格式。</p>
              <p>SketchUp 用户建议：从 SketchUp 导出为 GLB、DAE、OBJ 或 STL 后上传。</p>
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
              <SelectField label="建筑类型" value={state.config.buildingType || '住宅'} options={buildingTypes} onChange={value => onUpdateConfig({ buildingType: value })} />
              <SelectField label="空间类型" value={state.config.spaceType || '外立面'} options={spaceTypes} onChange={value => onUpdateConfig({ spaceType: value })} />
              <SelectField label="渲染风格" value={state.config.renderStyle || state.config.style || '现代极简'} options={renderStyles} onChange={value => onUpdateConfig({ renderStyle: value, style: value })} />
              <SelectField label="氛围" value={state.config.atmosphere || state.config.lighting || '日景'} options={atmospheres} onChange={value => onUpdateConfig({ atmosphere: value, lighting: value })} />
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">自定义提示词</span>
                <textarea
                  value={state.config.customPrompt || state.config.prompt}
                  onChange={event => onUpdateConfig({ customPrompt: event.target.value, prompt: event.target.value })}
                  placeholder="补充材质、光线、场景或设计意图..."
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

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-blue-300"
      >
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function mapModelAssetRecord(asset: ModelAssetRecord): AssetModel {
  const previewable = previewableTypes.has(asset.fileType);
  return {
    id: asset.id,
    name: asset.originalFilename.replace(/\.[^.]+$/u, ''),
    fileName: asset.originalFilename,
    fileType: asset.fileType,
    format: asset.format || asset.fileType,
    modelUrl: asset.url,
    thumbnail: '',
    size: formatFileSize(asset.size),
    date: asset.createdAt.slice(0, 10),
    source: 'uploaded',
    provider: '本地后端',
    status: 'ready',
    qualityStatus: asset.fileType === 'obj' || asset.fileType === 'stl' ? 'unknown' : 'usable',
    category: '未分类',
    previewable,
  };
}

function formatFileSize(size: number): string {
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
