import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  Float,
  MeshDistortMaterial,
  OrbitControls,
  PerspectiveCamera,
  RoundedBox,
  useGLTF,
} from '@react-three/drei';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Box,
  Clock,
  Download,
  Eye,
  FileBox,
  HardDrive,
  Image,
  Info,
  Plus,
  Search,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Box3, Vector3 } from 'three';
import { AssetModel } from '../types';
import { downloadUrl } from '../utils/download';
import { deleteModelAsset, listModelAssets, ModelAssetRecord, uploadModelAsset } from '../lib/api';

type ModelCategory = NonNullable<AssetModel['category']>;
type StatusFilter = '全部' | '可用' | '待优化' | '失败';

const STORAGE_KEY = 'archai-model-assets-v1';
const MAX_MODEL_SIZE_MB = 50;
const MAX_MODEL_SIZE_BYTES = MAX_MODEL_SIZE_MB * 1024 * 1024;
const PREVIEWABLE_TYPES = new Set<AssetModel['fileType']>(['glb', 'gltf']);
const ALLOWED_TYPES = new Set<AssetModel['fileType']>(['glb', 'gltf', 'obj']);
const CATEGORIES: Array<'全部' | ModelCategory> = ['全部', '家具', '建筑构件', '景观构件', '灯具', '植物', '装饰品', '未分类'];
const STATUS_FILTERS: StatusFilter[] = ['全部', '可用', '待优化', '失败'];

const SAMPLE_ASSETS: AssetModel[] = [
  {
    id: 'sample-1',
    name: '参考图生成-现代休闲椅',
    fileName: 'modern-lounge-chair.glb',
    fileType: 'glb',
    thumbnail: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=360',
    size: '18.4 MB',
    date: '2026-04-20',
    source: 'sample',
    sourceImageName: 'chair-reference.png',
    prompt: '根据参考图生成一张适合室内软装方案的现代休闲椅三维模型。',
    provider: '示例数据',
    status: 'ready',
    qualityStatus: 'usable',
    vertices: '待分析',
    triangles: '待分析',
    materials: '3',
    textures: '待分析',
    tags: ['参考图生成', '软装', '可复用'],
    category: '家具',
    previewable: false,
  },
  {
    id: 'sample-2',
    name: '参考图生成-立面格栅构件',
    fileName: 'facade-louver.gltf',
    fileType: 'gltf',
    thumbnail: 'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&q=80&w=360',
    size: '9.7 MB',
    date: '2026-04-18',
    source: 'sample',
    sourceImageName: 'facade-louver-ref.jpg',
    prompt: '保留参考图片中的竖向节奏，生成可用于方案推敲的建筑格栅构件。',
    provider: '示例数据',
    status: 'optimizing',
    qualityStatus: 'warning',
    vertices: '待分析',
    triangles: '待分析',
    materials: '2',
    textures: '待分析',
    tags: ['建筑外立面', '待优化'],
    category: '建筑构件',
    previewable: false,
  },
  {
    id: 'sample-3',
    name: '参考图生成-庭院植物组团',
    fileName: 'garden-plant-cluster.obj',
    fileType: 'obj',
    thumbnail: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&q=80&w=360',
    size: '12.1 MB',
    date: '2026-04-15',
    source: 'sample',
    sourceImageName: 'plant-cluster-reference.jpg',
    provider: '示例数据',
    status: 'ready',
    qualityStatus: 'unknown',
    vertices: '未知',
    triangles: '未知',
    materials: '未知',
    textures: '未知',
    tags: ['景观', 'OBJ 元数据'],
    category: '植物',
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

  if (!ALLOWED_TYPES.has(fileType)) {
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

function createModelThumbnail(fileType: AssetModel['fileType']): string {
  const label = fileType.toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240">
      <rect width="360" height="240" fill="#f8fafc"/>
      <rect x="42" y="32" width="276" height="176" rx="18" fill="#e2e8f0"/>
      <path d="M180 58 250 98v82l-70 40-70-40V98z" fill="#2563eb" opacity=".9"/>
      <path d="m180 58 70 40-70 40-70-40z" fill="#60a5fa"/>
      <path d="M180 138v82M110 98v82M250 98v82" stroke="#dbeafe" stroke-width="5" opacity=".8"/>
      <text x="180" y="196" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#0f172a">${label}</text>
    </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function mapModelAssetRecord(asset: ModelAssetRecord): AssetModel {
  const previewable = PREVIEWABLE_TYPES.has(asset.fileType);

  return {
    id: asset.id,
    name: asset.originalFilename.replace(/\.[^.]+$/, ''),
    fileName: asset.originalFilename,
    fileType: asset.fileType,
    modelUrl: asset.url,
    thumbnail: createModelThumbnail(asset.fileType),
    size: formatFileSize(asset.size),
    date: asset.createdAt.slice(0, 10),
    source: 'uploaded',
    provider: '本地后端',
    status: 'ready',
    qualityStatus: asset.fileType === 'obj' ? 'unknown' : 'usable',
    vertices: '待分析',
    triangles: '待分析',
    materials: '待分析',
    textures: '待分析',
    tags: previewable ? ['后端上传', '可预览'] : ['后端上传', 'OBJ 元数据'],
    category: '未分类',
    previewable,
    storageWarning: asset.fileType === 'obj' ? 'OBJ 当前暂不支持在线预览，已作为模型元数据保存。' : undefined,
  };
}

function readStoredAssets(): AssetModel[] {
  if (typeof window === 'undefined') {
    return SAMPLE_ASSETS;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return SAMPLE_ASSETS;
  }

  try {
    const parsed = JSON.parse(raw) as AssetModel[];
    return parsed.length > 0 ? parsed : [];
  } catch {
    return SAMPLE_ASSETS;
  }
}

function toPersistableAsset(asset: AssetModel): AssetModel {
  const modelUrl = asset.modelUrl?.startsWith('blob:') ? undefined : asset.modelUrl;
  return {
    ...asset,
    modelUrl,
    previewable: Boolean(modelUrl && PREVIEWABLE_TYPES.has(asset.fileType)),
    storageWarning:
      asset.source === 'uploaded'
        ? '模型文件未写入 localStorage。刷新页面后会保留元数据，但预览和下载需要重新上传文件。'
        : asset.storageWarning,
  };
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const rect = element.getBoundingClientRect();
      const nextSize = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      setSize(current => current.width === nextSize.width && current.height === nextSize.height ? current : nextSize);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

function LocalModelPreview({ url }: { url: string }) {
  const gltf = useGLTF(url);
  const model = useMemo(() => {
    const scene = gltf.scene.clone(true);
    scene.updateMatrixWorld(true);
    scene.traverse(object => {
      object.frustumCulled = false;
    });

    const box = new Box3().setFromObject(scene);
    const center = new Vector3();
    const size = new Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxDimension = Math.max(size.x, size.y, size.z);
    const scale = Number.isFinite(maxDimension) && maxDimension > 0 ? 2.8 / maxDimension : 1;
    const position: [number, number, number] = [
      -center.x * scale,
      -center.y * scale,
      -center.z * scale,
    ];

    return { scene, position, scale };
  }, [gltf.scene]);

  return <primitive object={model.scene} position={model.position} scale={model.scale} dispose={null} />;
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
      <color attach="background" args={['#f8fafc']} />
      <PerspectiveCamera makeDefault position={[3.8, 2.6, 4.8]} fov={42} near={0.01} far={1000} />
      <OrbitControls makeDefault target={[0, 0, 0]} minDistance={0.4} maxDistance={20} minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} enableDamping />
      {canPreviewModel && asset.modelUrl ? <LocalModelPreview url={asset.modelUrl} /> : <DemoModelPreview />}
      <ambientLight intensity={0.85} />
      <hemisphereLight args={['#ffffff', '#cbd5e1', 1.1]} />
      <directionalLight position={[5, 8, 6]} intensity={1.6} castShadow />
      <directionalLight position={[-5, 3, -4]} intensity={0.45} />
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
  const message = asset.fileType === 'obj' ? '该格式暂不支持在线预览' : '模型文件未持久化，请重新上传文件后预览';

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50 px-8 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Box className="h-8 w-8 text-slate-300" />
      </div>
      <h3 className="text-sm font-bold text-slate-800">{message}</h3>
      <p className="mt-2 max-w-md text-xs leading-6 text-slate-500">
        GLB / GLTF 会在当前会话保留 3D 预览；OBJ 暂时作为模型元数据资产管理。
      </p>
    </div>
  );
}

function ModelPreview({ asset }: { asset: AssetModel }) {
  const canPreview = Boolean(asset.previewable && asset.modelUrl && PREVIEWABLE_TYPES.has(asset.fileType));
  const { ref, size } = useElementSize<HTMLDivElement>();
  const hasUsableSize = size.width > 100 && size.height > 100;

  if (!canPreview) {
    return <UnsupportedPreview asset={asset} />;
  }

  return (
    <div ref={ref} className="relative h-full min-h-[480px] w-full bg-slate-100">
      {!hasUsableSize ? (
        <ModelPreviewLoading label="正在准备三维预览容器..." />
      ) : (
        <PreviewErrorBoundary resetKey={asset.id} fallback={<UnsupportedPreview asset={asset} />}>
          <Suspense fallback={<ModelPreviewLoading label="正在加载三维预览..." />}>
            <Canvas
              className="h-full w-full"
              style={{ width: '100%', height: '100%' }}
              frameloop="always"
              shadows
              dpr={[1, 2]}
              gl={{ alpha: false, antialias: true }}
            >
              <Scene asset={asset} />
            </Canvas>
          </Suspense>
        </PreviewErrorBoundary>
      )}
    </div>
  );
}

function ModelPreviewLoading({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[480px] w-full flex-col items-center justify-center gap-4 bg-slate-50">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-500" />
      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
    </div>
  );
}

function qualityLabel(status: AssetModel['qualityStatus']): string {
  if (status === 'usable') return '可用';
  if (status === 'warning') return '待优化';
  if (status === 'error') return '失败';
  return '未知';
}

function statusLabel(status: AssetModel['status']): string {
  if (status === 'ready') return '可用';
  if (status === 'optimizing') return '待优化';
  if (status === 'failed') return '失败';
  if (status === 'generating') return '生成中';
  return '未知';
}

function sourceLabel(source: AssetModel['source']): string {
  if (source === 'generated') return '生成';
  if (source === 'uploaded') return '上传';
  return '示例';
}

function matchesStatusFilter(asset: AssetModel, filter: StatusFilter): boolean {
  if (filter === '全部') return true;
  if (filter === '可用') return asset.status === 'ready' || asset.qualityStatus === 'usable';
  if (filter === '待优化') return asset.status === 'optimizing' || asset.qualityStatus === 'warning';
  return asset.status === 'failed' || asset.qualityStatus === 'error';
}

function AssetBadge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'blue' | 'green' | 'amber' | 'red' }) {
  const toneClass = {
    slate: 'bg-slate-100 text-slate-600',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-600',
  }[tone];

  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${toneClass}`}>{children}</span>;
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value || '未知'}</p>
    </div>
  );
}

export function AssetBank() {
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const [models, setModels] = useState<AssetModel[]>(readStoredAssets);
  const [selectedAsset, setSelectedAsset] = useState<AssetModel | null>(() => readStoredAssets()[0] || null);
  const [detailAsset, setDetailAsset] = useState<AssetModel | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'全部' | ModelCategory>('全部');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('全部');
  const [tagInput, setTagInput] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [isUploadingModel, setIsUploadingModel] = useState(false);

  const refreshBackendAssets = async () => {
    setIsLoadingAssets(true);
    try {
      const backendAssets = (await listModelAssets()).map(mapModelAssetRecord);
      setModels(backendAssets);
      setSelectedAsset(current => {
        if (current && backendAssets.some(asset => asset.id === current.id)) return current;
        return backendAssets[0] || null;
      });
      setDetailAsset(current => {
        if (current && backendAssets.some(asset => asset.id === current.id)) return current;
        return null;
      });
      setUploadError(null);
    } catch (error) {
      setUploadError(error instanceof Error ? `后端资产库暂不可用，已使用本地缓存：${error.message}` : '后端资产库暂不可用，已使用本地缓存。');
      setModels(readStoredAssets());
      setSelectedAsset(readStoredAssets()[0] || null);
    } finally {
      setIsLoadingAssets(false);
    }
  };

  useEffect(() => {
    void refreshBackendAssets();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const metadataOnly = models.map(toPersistableAsset);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(metadataOnly));
  }, [models]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current.clear();
    };
  }, []);

  const updateAsset = (updatedAsset: AssetModel) => {
    setModels((previous) => previous.map((model) => (model.id === updatedAsset.id ? updatedAsset : model)));
    setSelectedAsset((current) => (current?.id === updatedAsset.id ? updatedAsset : current));
    setDetailAsset((current) => (current?.id === updatedAsset.id ? updatedAsset : current));
  };

  const handleAddTag = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || !tagInput.trim() || !detailAsset) {
      return;
    }

    const newTag = tagInput.trim();
    const updatedAsset = {
      ...detailAsset,
      tags: Array.from(new Set([...(detailAsset.tags || []), newTag])),
    };
    updateAsset(updatedAsset);
    setTagInput('');
  };

  const handleRemoveTag = (asset: AssetModel, tagToRemove: string) => {
    updateAsset({
      ...asset,
      tags: (asset.tags || []).filter((tagValue) => tagValue !== tagToRemove),
    });
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

      setIsUploadingModel(true);
      void uploadModelAsset(file)
        .then(async (asset) => {
          const newModel = mapModelAssetRecord(asset);
          setUploadError(null);
          await refreshBackendAssets();
          setSelectedAsset(newModel);
          setDetailAsset(newModel);
        })
        .catch((uploadFailure) => {
          const fileType = getFileExtension(file.name);
          const previewable = PREVIEWABLE_TYPES.has(fileType);
          const modelUrl = previewable ? URL.createObjectURL(file) : undefined;

          if (modelUrl) {
            objectUrlsRef.current.add(modelUrl);
          }

          const newModel: AssetModel = {
            id: `uploaded-${Date.now()}`,
            name: file.name.replace(/\.[^.]+$/, ''),
            fileName: file.name,
            fileType,
            modelUrl,
            thumbnail: createModelThumbnail(fileType),
            size: formatFileSize(file.size),
            date: new Date().toISOString().slice(0, 10),
            source: 'uploaded',
            status: 'ready',
            qualityStatus: 'unknown',
            vertices: '待分析',
            triangles: '待分析',
            materials: '待分析',
            textures: '待分析',
            tags: previewable ? ['本地上传', '可预览'] : ['本地上传', 'OBJ 元数据'],
            category: '未分类',
            previewable,
            storageWarning: '后端上传失败，已临时保留在当前浏览器会话。刷新后可能只保留元数据。',
          };

          setUploadError(uploadFailure instanceof Error ? `后端上传失败，已使用本地 fallback：${uploadFailure.message}` : '后端上传失败，已使用本地 fallback。');
          setModels((previous) => [newModel, ...previous]);
          setSelectedAsset(newModel);
          setDetailAsset(newModel);
        })
        .finally(() => setIsUploadingModel(false));
      return;

      const fileType = getFileExtension(file.name);
      const previewable = PREVIEWABLE_TYPES.has(fileType);
      const modelUrl = previewable ? URL.createObjectURL(file) : undefined;

      if (modelUrl) {
        objectUrlsRef.current.add(modelUrl);
      }

      const newModel: AssetModel = {
        id: `uploaded-${Date.now()}`,
        name: file.name.replace(/\.[^.]+$/, ''),
        fileName: file.name,
        fileType,
        modelUrl,
        thumbnail: createModelThumbnail(fileType),
        size: formatFileSize(file.size),
        date: new Date().toISOString().slice(0, 10),
        source: 'uploaded',
        status: 'ready',
        qualityStatus: 'unknown',
        vertices: '待分析',
        triangles: '待分析',
        materials: '待分析',
        textures: '待分析',
        tags: previewable ? ['本地上传', '可预览'] : ['本地上传', 'OBJ 元数据'],
        category: '未分类',
        previewable,
        storageWarning: '模型文件未写入 localStorage。刷新页面后会保留元数据，但预览和下载需要重新上传文件。',
      };

      setUploadError(null);
      setModels((previous) => [newModel, ...previous]);
      setSelectedAsset(newModel);
      setDetailAsset(newModel);
    };
    input.click();
  };

  const handleDeleteAsset = (assetId: string) => {
    if (assetId.startsWith('model_')) {
      void deleteModelAsset(assetId)
        .then(() => refreshBackendAssets())
        .catch((error) => {
          setUploadError(error instanceof Error ? error.message : '后端模型删除失败。');
        });
      return;
    }

    setModels((previous) => {
      const targetAsset = previous.find((asset) => asset.id === assetId);
      if (targetAsset?.modelUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(targetAsset.modelUrl);
        objectUrlsRef.current.delete(targetAsset.modelUrl);
      }

      const nextModels = previous.filter((asset) => asset.id !== assetId);
      setSelectedAsset((current) => (current?.id === assetId ? nextModels[0] || null : current));
      setDetailAsset((current) => (current?.id === assetId ? null : current));
      return nextModels;
    });
  };

  const handleDownloadAsset = (asset: AssetModel) => {
    if (!asset.modelUrl || !asset.fileName) {
      setUploadError('模型文件无法从 localStorage 恢复。请重新上传文件后再预览或下载。');
      return;
    }
    void downloadUrl(asset.modelUrl, asset.fileName).catch((error) => {
      setUploadError(error instanceof Error ? error.message : '模型文件下载失败。');
    });
  };

  const filteredAssets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return models.filter((item) => {
      const searchableText = [item.name, item.sourceImageName, item.fileName, ...(item.tags || [])].filter(Boolean).join(' ').toLowerCase();
      const matchesSearch = !query || searchableText.includes(query);
      const matchesCategory = categoryFilter === '全部' || item.category === categoryFilter;
      return matchesSearch && matchesCategory && matchesStatusFilter(item, statusFilter);
    });
  }, [models, searchQuery, categoryFilter, statusFilter]);

  const previewAsset = selectedAsset || filteredAssets[0] || null;
  const hasAnyAsset = models.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#f5f7fb] animate-in fade-in duration-500">
      <div className="flex h-full min-h-0 flex-col">
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4">
          <div className="mx-auto max-w-7xl space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-200">
                  <Box className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-950">三维模型资产库</h2>
                  <p className="mt-1 text-sm text-slate-500">管理由参考图生成或手动上传的 GLB/GLTF/OBJ 模型资产</p>
                </div>
              </div>
              <button
                onClick={handleFileUpload}
                disabled={isUploadingModel}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-100 transition-colors hover:bg-blue-700"
              >
                <Upload className="h-4 w-4" />
                {isUploadingModel ? '上传中...' : '上传模型'}
              </button>
            </div>

            {uploadError && (
              <div className="flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {isLoadingAssets && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-700">
                正在从后端资产库加载模型列表...
              </div>
            )}

            <div className="grid gap-3 xl:grid-cols-[minmax(280px,420px)_1fr]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索模型名称、来源图或标签..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-11 pr-4 text-sm outline-none transition-all placeholder:text-slate-400 focus:border-blue-300 focus:bg-white"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((category) => (
                  <button
                    key={category}
                    onClick={() => setCategoryFilter(category)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${
                      categoryFilter === category
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">质量筛选</span>
              {STATUS_FILTERS.map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-bold transition-all ${
                    statusFilter === status
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="relative min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
          <div className="mx-auto max-w-7xl">
            {filteredAssets.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredAssets.map((item) => {
                  const isSelected = previewAsset?.id === item.id;
                  const qualityTone = item.qualityStatus === 'usable' ? 'green' : item.qualityStatus === 'error' ? 'red' : item.qualityStatus === 'warning' ? 'amber' : 'slate';

                  return (
                    <motion.article
                      key={item.id}
                      whileHover={{ y: -4 }}
                      className={`overflow-hidden rounded-[20px] border bg-white p-2 shadow-sm transition-all hover:border-blue-200 hover:shadow-xl hover:shadow-slate-200/70 ${
                        isSelected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'
                      }`}
                    >
                      <button
                        onClick={() => {
                          setSelectedAsset(item);
                          setDetailAsset(item);
                        }}
                        className="relative block h-36 w-full overflow-hidden rounded-2xl bg-slate-100 text-left"
                        title="预览模型"
                      >
                        <img src={item.thumbnail} className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" alt={item.name} referrerPolicy="no-referrer" />
                        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                          <AssetBadge tone="blue">{item.fileType.toUpperCase()}</AssetBadge>
                          <AssetBadge tone={qualityTone}>{qualityLabel(item.qualityStatus)}</AssetBadge>
                        </div>
                        <div className="absolute bottom-3 left-3 right-3 rounded-2xl bg-white/90 p-3 backdrop-blur">
                          <h3 className="truncate text-sm font-bold text-slate-950">{item.name}</h3>
                          <p className="mt-1 truncate text-[11px] font-medium text-slate-500">{item.fileName}</p>
                        </div>
                      </button>

                      <div className="flex h-44 flex-col p-3">
                        <div className="flex flex-wrap gap-1.5">
                          <AssetBadge>{item.category || '未分类'}</AssetBadge>
                          <AssetBadge>{sourceLabel(item.source)}</AssetBadge>
                          <AssetBadge>{statusLabel(item.status)}</AssetBadge>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-2 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1.5">
                            <HardDrive className="h-3.5 w-3.5" />
                            {item.size}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            {item.date}
                          </span>
                          <span className="col-span-2 truncate">
                            来源图：{item.sourceImageName || '暂无'}
                          </span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(item.tags || []).slice(0, 4).map((tagValue) => (
                            <span key={tagValue} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                              #{tagValue}
                            </span>
                          ))}
                        </div>

                        <div className="mt-auto grid grid-cols-4 gap-1.5 border-t border-slate-100 pt-2">
                          <button
                            onClick={() => {
                              setSelectedAsset(item);
                              setDetailAsset(item);
                            }}
                            className="flex items-center justify-center gap-1 rounded-xl bg-slate-50 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            预览
                          </button>
                          <button onClick={() => setDetailAsset(item)} className="flex items-center justify-center gap-1 rounded-xl bg-blue-50 py-2 text-[11px] font-bold text-blue-700 hover:bg-blue-100">
                            <Info className="h-3.5 w-3.5" />
                            详情
                          </button>
                          <button onClick={() => handleDownloadAsset(item)} className="flex items-center justify-center gap-1 rounded-xl bg-slate-50 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-100">
                            <Download className="h-3.5 w-3.5" />
                            下载
                          </button>
                          <button onClick={() => handleDeleteAsset(item.id)} className="flex items-center justify-center gap-1 rounded-xl bg-red-50 py-2 text-[11px] font-bold text-red-600 hover:bg-red-100">
                            <Trash2 className="h-3.5 w-3.5" />
                            删除
                          </button>
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-white p-6 text-center shadow-sm">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50">
                  <FileBox className="h-8 w-8 text-blue-500" />
                </div>
                <h3 className="text-lg font-bold text-slate-950">
                  {hasAnyAsset ? '没有符合筛选条件的三维模型资产' : '还没有三维模型资产'}
                </h3>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
                  {hasAnyAsset
                    ? '请尝试更换关键词、分类或质量筛选条件。'
                    : '还没有三维模型资产。上传 GLB/GLTF/OBJ，或通过参考图片生成模型后在这里统一管理。'}
                </p>
                <button onClick={handleFileUpload} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-100 hover:bg-blue-700">
                  <Upload className="h-4 w-4" />
                  上传模型
                </button>
              </div>
            )}
          </div>

          {detailAsset && (
            <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 p-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">模型详情</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">{detailAsset.name}</h3>
                </div>
                <button onClick={() => setDetailAsset(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="关闭详情">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="h-[560px] min-h-[480px] w-full overflow-hidden rounded-xl border border-slate-100 bg-slate-100">
                  <ModelPreview asset={detailAsset} />
                </div>

                {detailAsset.sourceImageDataUrl ? (
                  <div className="mt-5 overflow-hidden rounded-xl border border-slate-100">
                    <img src={detailAsset.sourceImageDataUrl} alt={detailAsset.sourceImageName || '来源参考图'} className="h-40 w-full object-cover" />
                  </div>
                ) : (
                  <div className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
                    <Image className="h-5 w-5 text-slate-300" />
                    <div>
                      <p className="text-xs font-bold text-slate-700">{detailAsset.sourceImageName || '暂无来源参考图预览'}</p>
                      <p className="mt-1 text-[11px] text-slate-500">未来接入参考图生成模型后，可在这里查看来源图片。</p>
                    </div>
                  </div>
                )}

                {detailAsset.prompt && (
                  <div className="mt-5 rounded-xl bg-slate-50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">生成提示词</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{detailAsset.prompt}</p>
                  </div>
                )}

                <div className="mt-5 grid grid-cols-2 gap-4">
                  <DetailRow label="Provider" value={detailAsset.provider || '未知'} />
                  <DetailRow label="来源" value={sourceLabel(detailAsset.source)} />
                  <DetailRow label="文件格式" value={detailAsset.fileType.toUpperCase()} />
                  <DetailRow label="文件大小" value={detailAsset.size} />
                  <DetailRow label="顶点数" value={detailAsset.vertices || '待分析'} />
                  <DetailRow label="面数" value={detailAsset.triangles || '待分析'} />
                  <DetailRow label="材质数量" value={detailAsset.materials || '待分析'} />
                  <DetailRow label="贴图数量" value={detailAsset.textures || '待分析'} />
                  <DetailRow label="质量状态" value={qualityLabel(detailAsset.qualityStatus)} />
                  <DetailRow label="分类" value={detailAsset.category || '未分类'} />
                </div>

                <div className="mt-5">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">标签</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(detailAsset.tags || []).map((tagValue) => (
                      <span key={tagValue} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                        <Tag className="h-3 w-3" />
                        {tagValue}
                        <button onClick={() => handleRemoveTag(detailAsset, tagValue)} className="text-slate-400 hover:text-red-500" title="移除标签">
                          <X className="h-3 w-3" />
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
                    className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-blue-300"
                  />
                </div>

                {detailAsset.storageWarning && (
                  <div className="mt-5 flex gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">
                    <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{detailAsset.storageWarning}</span>
                  </div>
                )}
              </div>

              <div className="grid shrink-0 grid-cols-2 gap-3 border-t border-slate-100 p-4">
                <button onClick={() => handleDownloadAsset(detailAsset)} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700">
                  <Download className="h-4 w-4" />
                  下载
                </button>
                <button onClick={() => handleDeleteAsset(detailAsset.id)} className="flex items-center justify-center gap-2 rounded-xl bg-red-50 py-2.5 text-sm font-bold text-red-600 hover:bg-red-100">
                  <Trash2 className="h-4 w-4" />
                  删除
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
