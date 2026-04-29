import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  Backdrop,
  Float,
  MeshDistortMaterial,
  OrbitControls,
  PerspectiveCamera,
  RoundedBox,
  Stage,
  useGLTF,
} from '@react-three/drei';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Box,
  ChevronUp,
  Clock,
  Download,
  HardDrive,
  Maximize2,
  Plus,
  Search,
  Tag,
  Trash2,
  Upload,
} from 'lucide-react';
import { AssetModel } from '../types';
import { downloadDataUrl } from '../utils/download';

const MAX_MODEL_SIZE_MB = 50;
const MAX_MODEL_SIZE_BYTES = MAX_MODEL_SIZE_MB * 1024 * 1024;
const PREVIEWABLE_TYPES = new Set(['glb', 'gltf']);
const ALLOWED_TYPES = new Set(['glb', 'gltf', 'obj']);

const SAMPLE_ASSETS: AssetModel[] = [
  {
    id: 'sample-1',
    name: '现代住宅体块 示例',
    thumbnail: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=200',
    type: '示例模型',
    vertices: '演示几何',
    size: '示例',
    date: '2026-04-20',
    tags: ['示例资产', '住宅', '现代'],
    source: 'sample',
    fileType: 'unknown',
    previewable: false,
  },
  {
    id: 'sample-2',
    name: '极简办公空间 示例',
    thumbnail: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=200',
    type: '示例模型',
    vertices: '演示几何',
    size: '示例',
    date: '2026-04-18',
    tags: ['示例资产', '办公', '极简'],
    source: 'sample',
    fileType: 'unknown',
    previewable: false,
  },
  {
    id: 'sample-3',
    name: '商业综合体 示例',
    thumbnail: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=200',
    type: '示例模型',
    vertices: '演示几何',
    size: '示例',
    date: '2026-04-15',
    tags: ['示例资产', '商业'],
    source: 'sample',
    fileType: 'unknown',
    previewable: false,
  },
];

function getFileExtension(fileName: string): AssetModel['fileType'] {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'glb' || extension === 'gltf' || extension === 'obj') {
    return extension;
  }
  return 'unknown';
}

function validateModelFile(file: File): string | null {
  const fileType = getFileExtension(file.name);

  if (!ALLOWED_TYPES.has(fileType || 'unknown')) {
    return '仅支持上传 .glb、.gltf、.obj 文件；OBJ 当前仅保存元数据。';
  }

  if (file.size > MAX_MODEL_SIZE_BYTES) {
    return `模型文件不能超过 ${MAX_MODEL_SIZE_MB}MB。`;
  }

  return null;
}

function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function LocalModelPreview({ url }: { url: string }) {
  const gltf = useGLTF(url);
  return <primitive object={gltf.scene} />;
}

function DemoModelPreview() {
  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
      <RoundedBox args={[2, 3, 2]} radius={0.05} smoothness={4}>
        <MeshDistortMaterial color="#2563eb" speed={2} distort={0.2} radius={1} />
      </RoundedBox>
    </Float>
  );
}

function Scene({ asset }: { asset: AssetModel }) {
  const canPreviewModel = Boolean(asset.previewable && asset.modelUrl);

  return (
    <>
      <PerspectiveCamera makeDefault position={[5, 5, 5]} fov={50} />
      <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} />
      <Stage intensity={0.5} environment="city" shadows={{ type: 'contact', opacity: 0.2 }} adjustCamera={canPreviewModel}>
        {canPreviewModel && asset.modelUrl ? (
          <LocalModelPreview key={asset.modelUrl} url={asset.modelUrl} />
        ) : (
          <DemoModelPreview />
        )}
      </Stage>
      <Backdrop receiveShadow floor={20} segments={20} scale={[50, 30, 10]} position={[0, -2, -10]}>
        <meshStandardMaterial color="#f8fafc" />
      </Backdrop>
      <ambientLight intensity={0.5} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} castShadow />
    </>
  );
}

class PreviewErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode; resetKey: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function UnsupportedPreview({ asset }: { asset: AssetModel }) {
  const isObj = asset.fileType === 'obj';
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 px-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm mb-4">
        <Box className="w-8 h-8 text-slate-300" />
      </div>
      <h3 className="text-sm font-bold text-slate-800">当前资产暂无 3D 预览</h3>
      <p className="mt-2 max-w-md text-xs leading-6 text-slate-500">
        {isObj
          ? 'OBJ 文件在 MVP 中仅作为元数据资产保存，暂不解析材质与几何预览。'
          : '示例资产用于展示流程；上传本地 GLB/GLTF 后可在这里查看真实模型。'}
      </p>
    </div>
  );
}

export function AssetBank() {
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const [models, setModels] = useState<AssetModel[]>(SAMPLE_ASSETS);
  const [selectedAsset, setSelectedAsset] = useState<AssetModel | null>(SAMPLE_ASSETS[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'type' | 'date' | 'size'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [tagInput, setTagInput] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  const handleAddTag = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && tagInput.trim() && selectedAsset) {
      const newTag = tagInput.trim();
      const updatedAsset = {
        ...selectedAsset,
        tags: [...(selectedAsset.tags || []), newTag],
      };
      setModels((previous) => previous.map((model) => (model.id === selectedAsset.id ? updatedAsset : model)));
      setSelectedAsset(updatedAsset);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!selectedAsset) {
      return;
    }

    const updatedAsset = {
      ...selectedAsset,
      tags: (selectedAsset.tags || []).filter((tagValue) => tagValue !== tagToRemove),
    };
    setModels((previous) => previous.map((model) => (model.id === selectedAsset.id ? updatedAsset : model)));
    setSelectedAsset(updatedAsset);
  };

  const handleFileUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.glb,.gltf,.obj,model/gltf-binary,model/gltf+json';
    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      target.value = '';

      if (!file) {
        return;
      }

      const error = validateModelFile(file);
      if (error) {
        setUploadError(error);
        return;
      }

      const fileType = getFileExtension(file.name);
      const previewable = PREVIEWABLE_TYPES.has(fileType || 'unknown');
      const modelUrl = previewable ? URL.createObjectURL(file) : undefined;

      if (modelUrl) {
        objectUrlsRef.current.add(modelUrl);
      }

      const newModel: AssetModel = {
        id: `local-${Date.now()}`,
        name: file.name.replace(/\.[^.]+$/, ''),
        thumbnail: 'https://images.unsplash.com/photo-1503387762-5929c3674681?auto=format&fit=crop&q=80&w=200',
        type: previewable ? `${fileType?.toUpperCase()} 本地模型` : 'OBJ 元数据',
        vertices: previewable ? '本地预览' : '未解析',
        size: formatFileSize(file.size),
        date: new Date().toISOString().slice(0, 10),
        tags: previewable ? ['本地上传', '可预览'] : ['本地上传', '元数据'],
        source: 'local',
        modelUrl,
        fileName: file.name,
        fileType,
        previewable,
        storageWarning: 'MVP 不会把大型模型文件写入 localStorage，仅在当前会话保留预览 URL。',
      };

      setUploadError(null);
      setModels((previous) => [newModel, ...previous]);
      setSelectedAsset(newModel);
    };
    input.click();
  };

  const handleDeleteAsset = (assetId: string) => {
    setModels((previous) => {
      const targetAsset = previous.find((asset) => asset.id === assetId);
      if (targetAsset?.modelUrl) {
        URL.revokeObjectURL(targetAsset.modelUrl);
        objectUrlsRef.current.delete(targetAsset.modelUrl);
      }

      const nextModels = previous.filter((asset) => asset.id !== assetId);
      if (selectedAsset?.id === assetId) {
        setSelectedAsset(nextModels[0] || null);
      }
      return nextModels;
    });
  };

  const handleDownloadAsset = (asset: AssetModel) => {
    if (!asset.modelUrl || !asset.fileName) {
      setUploadError('示例资产没有可下载的本地模型文件。');
      return;
    }
    downloadDataUrl(asset.modelUrl, asset.fileName);
  };

  const handleSort = (field: 'name' | 'type' | 'date' | 'size') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const sortedAndFilteredAssets = useMemo(() => {
    const filtered = models.filter((item) => {
      const query = searchQuery.toLowerCase();
      const tagsMatch = item.tags?.some((tagValue) => tagValue.toLowerCase().includes(query)) || false;
      return (
        item.name.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query) ||
        item.size.toLowerCase().includes(query) ||
        tagsMatch
      );
    });

    return [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'date':
          comparison = a.date.localeCompare(b.date);
          break;
        case 'size':
          comparison = (parseFloat(a.size) || 0) - (parseFloat(b.size) || 0);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [models, searchQuery, sortBy, sortOrder]);

  const selectedAssetNeedsPlaceholder = Boolean(selectedAsset && selectedAsset.source === 'local' && !selectedAsset.previewable);

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-slate-50 animate-in fade-in duration-500">
      <div className="w-full md:w-96 border-r border-slate-200 flex flex-col bg-white shrink-0">
        <div className="p-5 border-b border-slate-100 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">资产管理</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">示例资产 / 本地模型</p>
            </div>
            <button
              onClick={handleFileUpload}
              className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
              title="上传 GLB / GLTF / OBJ"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={handleFileUpload}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-blue-200 bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100 transition-colors"
          >
            <Upload className="w-4 h-4" />
            上传本地模型（GLB / GLTF / OBJ）
          </button>

          {uploadError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索模型名称、类型或标签..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-blue-300 outline-none transition-all placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {(['type', 'size', 'date', 'name'] as const).map((field) => (
                <button
                  key={field}
                  onClick={() => handleSort(field)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all shrink-0 ${
                    sortBy === field
                      ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {field === 'type' ? '类型' : field === 'size' ? '大小' : field === 'date' ? '日期' : '名称'}
                  {sortBy === field && <ChevronUp className={`w-3 h-3 ${sortOrder === 'desc' ? 'rotate-180' : ''}`} />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
          {sortedAndFilteredAssets.length > 0 ? (
            sortedAndFilteredAssets.map((item) => {
              const isSelected = selectedAsset?.id === item.id;
              return (
                <motion.div
                  key={item.id}
                  onClick={() => setSelectedAsset(item)}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    isSelected ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="flex gap-4">
                    <div className="w-16 h-16 rounded-lg overflow-hidden border border-slate-100 shrink-0">
                      <img src={item.thumbnail} className="w-full h-full object-cover" alt={item.name} referrerPolicy="no-referrer" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <h3 className="text-sm font-bold text-slate-800 truncate">{item.name}</h3>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteAsset(item.id);
                          }}
                          className="ml-auto rounded-lg p-1 text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                          title="删除资产"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-bold uppercase">
                          {item.type}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            item.source === 'local' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                          }`}
                        >
                          {item.source === 'local' ? '本地上传' : '示例资产'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3" /> {item.date} · {item.size}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                <Search className="w-6 h-6 opacity-20" />
              </div>
              <p className="text-xs font-medium">未找到符合条件的模型</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-slate-100 relative">
        {selectedAsset ? (
          <div className="flex-1 relative">
            <div className="absolute inset-0 z-0">
              {selectedAssetNeedsPlaceholder ? (
                <UnsupportedPreview asset={selectedAsset} />
              ) : (
                <PreviewErrorBoundary
                  resetKey={selectedAsset.id}
                  fallback={<UnsupportedPreview asset={selectedAsset} />}
                >
                  <Suspense
                    fallback={
                      <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-slate-50">
                        <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin" />
                        <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">正在加载三维预览...</span>
                      </div>
                    }
                  >
                    <Canvas shadows dpr={[1, 2]}>
                      <Scene asset={selectedAsset} />
                    </Canvas>
                  </Suspense>
                </PreviewErrorBoundary>
              )}
            </div>

            <div className="absolute top-6 left-6 z-10 space-y-4">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                key={selectedAsset.id}
                className="bg-white/90 backdrop-blur-md p-6 rounded-2xl border border-slate-200 shadow-xl max-w-sm"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 tracking-tight">{selectedAsset.name}</h2>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {selectedAsset.source === 'local' ? '本地上传资产' : '示例资产'}
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                    <Box className="w-4 h-4 text-blue-600" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">状态</p>
                    <p className="text-sm font-mono font-bold text-slate-700">{selectedAsset.vertices}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">格式</p>
                    <p className="text-sm font-mono font-bold text-slate-700">{selectedAsset.type}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">日期</p>
                    <p className="text-sm font-mono font-bold text-slate-700">{selectedAsset.date}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">文件大小</p>
                    <p className="text-sm font-mono font-bold text-slate-700">{selectedAsset.size}</p>
                  </div>
                </div>

                {selectedAsset.storageWarning && (
                  <div className="mt-4 flex gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
                    <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{selectedAsset.storageWarning}</span>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">标签</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedAsset.tags?.map((tagValue) => (
                      <span key={tagValue} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] flex items-center gap-1">
                        <Tag className="w-2.5 h-2.5" />
                        {tagValue}
                        <button onClick={() => handleRemoveTag(tagValue)} className="hover:text-red-500" title="移除标签">
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="输入标签并按回车..."
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={handleAddTag}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-100 rounded text-[10px] outline-none focus:border-blue-300"
                  />
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => handleDownloadAsset(selectedAsset)}
                    disabled={!selectedAsset.modelUrl}
                    className="flex-1 arch-button-primary py-2.5 flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>下载本地文件</span>
                  </button>
                  <button
                    disabled
                    className="p-2.5 bg-slate-100 text-slate-300 rounded-xl cursor-not-allowed"
                    title="MVP 暂未支持全屏预览"
                  >
                    <Maximize2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteAsset(selectedAsset.id)}
                    className="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
                    title="删除资产"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <Box className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-sm font-medium">请从左侧选择或上传一个资产进行预览</p>
          </div>
        )}
      </div>
    </div>
  );
}
