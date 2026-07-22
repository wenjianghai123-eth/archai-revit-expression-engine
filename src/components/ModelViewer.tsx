import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Box as BoxIcon } from 'lucide-react';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import {
  Box3,
  BufferGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  PerspectiveCamera as ThreePerspectiveCamera,
  Plane,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { AssetModel, ModelCameraPreset, ModelSnapshotCapture, ModelSnapshotCamera, ModelViewBookmark, PanoramaImageCapture } from '../types';
import { resolvePreferredModelUrl } from './modelAssetUtils';

export interface ModelViewerHandle {
  captureSnapshot: () => Promise<ModelSnapshotCapture>;
  capturePanorama: (options?: { width?: number; height?: number }) => Promise<PanoramaImageCapture>;
  applyCameraPreset: (preset: ModelCameraPreset) => boolean;
  applyCameraView: (view: Pick<ModelViewBookmark, 'camera' | 'viewMode'>) => boolean;
}

export interface ModelViewerProps {
  asset: AssetModel;
  minHeight?: number;
  initialView?: 'fit' | 'interior';
  defaultEdgesEnabled?: boolean;
}

type SupportedModelFormat = Exclude<AssetModel['fileType'], 'unknown' | 'zip'>;
type LoaderKind = 'GLTFLoader' | 'OBJLoader' | 'ColladaLoader' | 'STLLoader';
type ViewMode = 'orbit' | 'walkthrough';
type ViewPreset = 'fit' | 'top' | 'front' | 'side' | 'bird-eye';
type WalkSpeedPreset = 'slow' | 'standard' | 'fast';
type LensPreset = 'wide' | 'standard' | 'telephoto' | 'custom';

export interface ModelLoaderDefinition {
  kind: LoaderKind;
  load: (url: string) => Promise<Object3D>;
}

interface ModelBoundsInfo {
  center: Vector3;
  size: Vector3;
  minY: number;
  maxY: number;
  maxDimension: number;
  diagonal: number;
  walkBaseSpeed: number;
  vertexCount: number;
  triangleCount: number;
  defaultClippingHeight: number;
  edgesAvailableByDefault: boolean;
}

interface ViewerCommandApi {
  fitView: (preset?: ViewPreset) => void;
  enterInterior: () => boolean;
  applyCamera: (camera: ModelSnapshotCamera) => boolean;
}

export interface StableModelLoadIdentity {
  assetId: string;
  fileType: AssetModel['fileType'];
  modelUrl: string;
  loaderKind: LoaderKind | null;
}

const EDGE_TRIANGLE_LIMIT = 160_000;
const EDGE_VERTEX_LIMIT = 260_000;
const LENS_FOVS: Record<Exclude<LensPreset, 'custom'>, number> = {
  wide: 75,
  standard: 50,
  telephoto: 30,
};
const DEFAULT_CUSTOM_FOV = LENS_FOVS.standard;
const PREVIEW_BACKGROUND_COLOR = '#f1f5f9';
const PREVIEW_RENDERER_EXPOSURE = 1.25;

const clayMaterial = new MeshStandardMaterial({
  color: '#f1f5f9',
  roughness: 0.72,
  metalness: 0.02,
  side: DoubleSide,
});

const xrayMaterial = new MeshStandardMaterial({
  color: '#f8fafc',
  roughness: 0.88,
  metalness: 0,
  transparent: true,
  opacity: 0.26,
  depthWrite: false,
  side: DoubleSide,
});

export const MODEL_LOADER_REGISTRY: Record<SupportedModelFormat, ModelLoaderDefinition> = {
  glb: {
    kind: 'GLTFLoader',
    load: async url => {
      const gltf = await new GLTFLoader().loadAsync(url);
      return gltf.scene;
    },
  },
  gltf: {
    kind: 'GLTFLoader',
    load: async url => {
      const gltf = await new GLTFLoader().loadAsync(url);
      return gltf.scene;
    },
  },
  obj: {
    kind: 'OBJLoader',
    load: url => new OBJLoader().loadAsync(url),
  },
  dae: {
    kind: 'ColladaLoader',
    load: async url => {
      const collada = await new ColladaLoader().loadAsync(url);
      return collada.scene;
    },
  },
  stl: {
    kind: 'STLLoader',
    load: async url => {
      const geometry = await new STLLoader().loadAsync(url);
      return new Mesh(geometry as BufferGeometry, clayMaterial.clone());
    },
  },
};

export function getModelLoaderDefinition(fileType: AssetModel['fileType']): ModelLoaderDefinition | null {
  if (fileType === 'glb' || fileType === 'gltf' || fileType === 'obj' || fileType === 'dae' || fileType === 'stl') {
    return MODEL_LOADER_REGISTRY[fileType];
  }
  return null;
}

export function getStableModelLoadIdentity(asset: AssetModel): StableModelLoadIdentity {
  const modelUrl = resolveModelPreviewUrl(asset);
  const fileType = modelUrl !== asset.modelUrl && modelUrl ? 'glb' : asset.fileType;
  const loader = getModelLoaderDefinition(fileType);
  return {
    assetId: asset.id,
    fileType,
    modelUrl,
    loaderKind: loader?.kind ?? null,
  };
}

export function resolveModelPreviewUrl(asset: AssetModel): string {
  return resolvePreferredModelUrl(asset);
}

export function shouldReloadModel(previous: StableModelLoadIdentity, next: StableModelLoadIdentity): boolean {
  return previous.fileType !== next.fileType || previous.modelUrl !== next.modelUrl;
}

export function getModelPreviewError(asset: AssetModel): string | null {
  const identity = getStableModelLoadIdentity(asset);
  if (!identity.modelUrl) return '模型地址不可访问';
  if (!identity.loaderKind || !asset.previewable) return '当前格式暂不支持';
  return null;
}

export const ModelViewer = forwardRef<ModelViewerHandle, ModelViewerProps>(function ModelViewer(
  { asset, minHeight = 420, initialView = 'fit', defaultEdgesEnabled = false },
  ref,
) {
  const { ref: sizeRef, size } = useElementSize<HTMLDivElement>();
  const captureRef = useRef<() => ModelSnapshotCapture | null>(() => null);
  const panoramaRef = useRef<(options?: { width?: number; height?: number }) => PanoramaImageCapture | null>(() => null);
  const commandRef = useRef<ViewerCommandApi | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(() => initialView === 'interior' ? 'walkthrough' : 'orbit');
  const [performanceMode, setPerformanceMode] = useState(true);
  const [walkSpeedPreset, setWalkSpeedPreset] = useState<WalkSpeedPreset>('slow');
  const [lensPreset, setLensPreset] = useState<LensPreset>('standard');
  const [customFov, setCustomFov] = useState(DEFAULT_CUSTOM_FOV);
  const [clippingEnabled, setClippingEnabled] = useState(false);
  const [clippingHeight, setClippingHeight] = useState(0);
  const [xrayEnabled, setXrayEnabled] = useState(false);
  const [edgesEnabled, setEdgesEnabled] = useState(false);
  const [modelInfo, setModelInfo] = useState<ModelBoundsInfo | null>(null);
  const [viewerMessage, setViewerMessage] = useState<string | null>(null);
  const loadIdentity = getStableModelLoadIdentity(asset);
  const previewError = getModelPreviewError(asset);
  const canPreview = !previewError;
  const hasUsableSize = size.width > 100 && size.height > 100;
  const cameraFov = lensPreset === 'custom' ? customFov : LENS_FOVS[lensPreset];
  const isLargeModel = useMemo(() => {
    const originalFileSize = asset.originalFileSize || asset.metadata?.originalFileSize || 0;
    return originalFileSize >= 30 * 1024 * 1024
      || (modelInfo?.vertexCount ?? 0) > EDGE_VERTEX_LIMIT
      || (modelInfo?.triangleCount ?? 0) > EDGE_TRIANGLE_LIMIT;
  }, [asset.metadata?.originalFileSize, asset.originalFileSize, modelInfo?.triangleCount, modelInfo?.vertexCount]);

  useImperativeHandle(ref, () => ({
    async captureSnapshot() {
      const capture = captureRef.current();
      if (!capture) {
        throw new Error('当前模型预览无法截图，请检查模型资源是否允许 canvas 导出。');
      }
      return capture;
    },
    async capturePanorama(options) {
      const capture = panoramaRef.current(options);
      if (!capture) {
        throw new Error('当前模型预览无法生成全景图，请稍后再试。');
      }
      return capture;
    },
    applyCameraPreset(preset) {
      if (preset === 'interior') {
        const entered = commandRef.current?.enterInterior() === true;
        if (entered) setViewMode('walkthrough');
        return entered;
      }
      setViewMode('orbit');
      const viewPreset: ViewPreset = preset === 'exterior-front'
        ? 'front'
        : preset === 'exterior-side'
          ? 'side'
          : preset === 'bird-eye'
            ? 'bird-eye'
            : preset === 'top'
              ? 'top'
              : 'fit';
      commandRef.current?.fitView(viewPreset);
      return Boolean(commandRef.current);
    },
    applyCameraView(view) {
      if (!view.camera) return false;
      if (typeof view.camera.fov === 'number') {
        setCustomFov(view.camera.fov);
        setLensPreset('custom');
      }
      if (view.viewMode) setViewMode(view.viewMode);
      return commandRef.current?.applyCamera(view.camera) === true;
    },
  }), []);

  useEffect(() => {
    setViewMode(initialView === 'interior' ? 'walkthrough' : 'orbit');
    setClippingEnabled(false);
    setXrayEnabled(false);
    setEdgesEnabled(defaultEdgesEnabled);
    setPerformanceMode(true);
    setWalkSpeedPreset('slow');
    setLensPreset('standard');
    setCustomFov(DEFAULT_CUSTOM_FOV);
    setModelInfo(null);
    setViewerMessage(null);
  }, [asset.id, defaultEdgesEnabled, initialView]);

  const handleLensPresetChange = useCallback((preset: LensPreset) => {
    if (preset === 'custom') {
      setCustomFov(cameraFov);
    }
    setLensPreset(preset);
  }, [cameraFov]);

  const handleModelInfoChange = useCallback((info: ModelBoundsInfo | null) => {
    setModelInfo(info);
    if (!info) return;
    setClippingHeight(info.defaultClippingHeight);
    setEdgesEnabled(defaultEdgesEnabled && info.edgesAvailableByDefault);
    const largeByGeometry = info.vertexCount > EDGE_VERTEX_LIMIT || info.triangleCount > EDGE_TRIANGLE_LIMIT;
    setViewerMessage(largeByGeometry ? '模型较大，建议使用转换后的 GLB 或开启性能模式。' : null);
  }, [defaultEdgesEnabled]);

  useEffect(() => {
    if (isLargeModel && !viewerMessage) {
      setViewerMessage('模型较大，建议使用转换后的 GLB 或开启性能模式。');
    }
  }, [isLargeModel, viewerMessage]);

  const handleCaptureReady = useCallback((capture: () => ModelSnapshotCapture | null) => {
    captureRef.current = capture;
  }, []);

  const handlePanoramaReady = useCallback((capture: (options?: { width?: number; height?: number }) => PanoramaImageCapture | null) => {
    panoramaRef.current = capture;
  }, []);

  const handleCommandsReady = useCallback((commands: ViewerCommandApi | null) => {
    commandRef.current = commands;
  }, []);

  const handleEnterInterior = () => {
    const entered = commandRef.current?.enterInterior();
    if (entered) {
      setViewMode('walkthrough');
      setViewerMessage('已进入模型内部。W/S 前后，A/D 左右，Q/E 升降，Shift 加速，拖动鼠标调整视角。');
    } else {
      setViewerMessage('无法计算模型尺寸，请尝试重新上传或转换为 GLB。');
    }
  };

  if (!canPreview) {
    return <UnsupportedPreview asset={asset} errorMessage={previewError} minHeight={minHeight} />;
  }

  return (
    <div ref={sizeRef} className="relative h-full w-full bg-slate-100" style={{ minHeight }}>
      <PreviewToolbar
        viewMode={viewMode}
        performanceMode={performanceMode}
        walkSpeedPreset={walkSpeedPreset}
        lensPreset={lensPreset}
        cameraFov={cameraFov}
        customFov={customFov}
        clippingEnabled={clippingEnabled}
        clippingHeight={clippingHeight}
        xrayEnabled={xrayEnabled}
        edgesEnabled={edgesEnabled}
        modelInfo={modelInfo}
        viewerMessage={viewerMessage}
        onFitView={() => commandRef.current?.fitView('fit')}
        onTopView={() => commandRef.current?.fitView('top')}
        onFrontView={() => commandRef.current?.fitView('front')}
        onSideView={() => commandRef.current?.fitView('side')}
        onEnterInterior={handleEnterInterior}
        onViewModeChange={setViewMode}
        onPerformanceModeChange={setPerformanceMode}
        onWalkSpeedPresetChange={setWalkSpeedPreset}
        onLensPresetChange={handleLensPresetChange}
        onCustomFovChange={setCustomFov}
        onClippingEnabledChange={setClippingEnabled}
        onClippingHeightChange={setClippingHeight}
        onXrayEnabledChange={setXrayEnabled}
        onEdgesEnabledChange={setEdgesEnabled}
      />
      <PreviewErrorBoundary
        resetKey={`${loadIdentity.fileType}:${loadIdentity.modelUrl}`}
        fallback={runtimeError => <LoadFailed asset={asset} runtimeError={runtimeError} minHeight={minHeight} />}
      >
        <Canvas
          className="h-full w-full"
          style={{ width: '100%', height: '100%' }}
          frameloop="demand"
          shadows={!performanceMode}
          dpr={performanceMode ? [1, 1.25] : [1, 1.5]}
          gl={{ alpha: false, antialias: !performanceMode, preserveDrawingBuffer: true, localClippingEnabled: true }}
          onCreated={({ gl }) => configurePreviewRenderer(gl)}
        >
          <Scene
            assetId={loadIdentity.assetId}
            fileType={loadIdentity.fileType}
            modelUrl={loadIdentity.modelUrl}
            initialView={initialView}
            viewMode={viewMode}
            performanceMode={performanceMode}
            walkSpeedPreset={walkSpeedPreset}
            cameraFov={cameraFov}
            clippingEnabled={clippingEnabled}
            clippingHeight={clippingHeight}
            xrayEnabled={xrayEnabled}
            edgesEnabled={edgesEnabled}
            onCaptureReady={handleCaptureReady}
            onPanoramaReady={handlePanoramaReady}
            onCommandsReady={handleCommandsReady}
            onModelInfoChange={handleModelInfoChange}
          />
        </Canvas>
      </PreviewErrorBoundary>
      {!hasUsableSize ? (
        <div className="pointer-events-none absolute inset-0 z-20">
          <ModelPreviewLoading label="正在准备三维预览容器..." minHeight={minHeight} />
        </div>
      ) : null}
    </div>
  );
});

function PreviewToolbar({
  viewMode,
  performanceMode,
  walkSpeedPreset,
  lensPreset,
  cameraFov,
  customFov,
  clippingEnabled,
  clippingHeight,
  xrayEnabled,
  edgesEnabled,
  modelInfo,
  viewerMessage,
  onFitView,
  onTopView,
  onFrontView,
  onSideView,
  onEnterInterior,
  onViewModeChange,
  onPerformanceModeChange,
  onWalkSpeedPresetChange,
  onLensPresetChange,
  onCustomFovChange,
  onClippingEnabledChange,
  onClippingHeightChange,
  onXrayEnabledChange,
  onEdgesEnabledChange,
}: {
  viewMode: ViewMode;
  performanceMode: boolean;
  walkSpeedPreset: WalkSpeedPreset;
  lensPreset: LensPreset;
  cameraFov: number;
  customFov: number;
  clippingEnabled: boolean;
  clippingHeight: number;
  xrayEnabled: boolean;
  edgesEnabled: boolean;
  modelInfo: ModelBoundsInfo | null;
  viewerMessage: string | null;
  onFitView: () => void;
  onTopView: () => void;
  onFrontView: () => void;
  onSideView: () => void;
  onEnterInterior: () => void;
  onViewModeChange: (mode: ViewMode) => void;
  onPerformanceModeChange: (enabled: boolean) => void;
  onWalkSpeedPresetChange: (preset: WalkSpeedPreset) => void;
  onLensPresetChange: (preset: LensPreset) => void;
  onCustomFovChange: (fov: number) => void;
  onClippingEnabledChange: (enabled: boolean) => void;
  onClippingHeightChange: (height: number) => void;
  onXrayEnabledChange: (enabled: boolean) => void;
  onEdgesEnabledChange: (enabled: boolean) => void;
}) {
  const disabled = !modelInfo;
  const minHeight = modelInfo?.minY ?? -1.5;
  const maxHeight = modelInfo?.maxY ?? 1.5;

  return (
    <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex flex-col gap-2">
      <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
        <ToolButton label="适配视图" disabled={disabled} onClick={onFitView} />
        <ToolButton label="顶视图" disabled={disabled} onClick={onTopView} />
        <ToolButton label="正视图" disabled={disabled} onClick={onFrontView} />
        <ToolButton label="侧视图" disabled={disabled} onClick={onSideView} />
        <ToolButton label="进入内部" disabled={disabled} onClick={onEnterInterior} />
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <ToolButton label="外部环绕" active={viewMode === 'orbit'} onClick={() => onViewModeChange('orbit')} />
        <ToolButton label="室内漫游" active={viewMode === 'walkthrough'} onClick={() => onViewModeChange('walkthrough')} />
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <ToolButton label="性能模式" active={performanceMode} onClick={() => onPerformanceModeChange(true)} />
        <ToolButton label="高质量" active={!performanceMode} onClick={() => onPerformanceModeChange(false)} />
        <ToolButton label="开屋顶" active={clippingEnabled} disabled={disabled} onClick={() => onClippingEnabledChange(!clippingEnabled)} />
        <ToolButton label="X 光显示" active={xrayEnabled} disabled={disabled} onClick={() => onXrayEnabledChange(!xrayEnabled)} />
        <ToolButton label="白模结构线" active={edgesEnabled} disabled={disabled} onClick={() => onEdgesEnabledChange(!edgesEnabled)} />
      </div>
      <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur">
        <label className="flex items-center gap-2 font-bold text-slate-700">
          漫游速度
          <select
            value={walkSpeedPreset}
            onChange={event => onWalkSpeedPresetChange(event.currentTarget.value as WalkSpeedPreset)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 outline-none focus:border-blue-300"
          >
            <option value="slow">慢</option>
            <option value="standard">标准</option>
            <option value="fast">快</option>
          </select>
        </label>
        <label className="flex items-center gap-2 font-bold text-slate-700">
          镜头
          <select
            value={lensPreset}
            onChange={event => onLensPresetChange(event.currentTarget.value as LensPreset)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 outline-none focus:border-blue-300"
          >
            <option value="wide">广角</option>
            <option value="standard">标准</option>
            <option value="telephoto">长焦</option>
            <option value="custom">自定义</option>
          </select>
        </label>
        {lensPreset === 'custom' ? (
          <label className="flex min-w-[180px] flex-1 items-center gap-2 font-bold text-slate-700">
            FOV
            <input
              type="range"
              min={20}
              max={90}
              step={1}
              value={customFov}
              onChange={event => onCustomFovChange(Number(event.currentTarget.value))}
              className="h-2 min-w-0 flex-1 accent-slate-900"
            />
          </label>
        ) : null}
        <span className="font-bold text-slate-700">当前视角：{Math.round(cameraFov)}°</span>
        <span className="max-w-[360px] leading-5 text-slate-500">FOV 越大越广角，空间透视越强；FOV 越小越接近长焦，透视更平。</span>
        <label className="flex min-w-[240px] flex-1 items-center gap-3">
          <span className="shrink-0 font-bold text-slate-700">剖切高度</span>
          <input
            type="range"
            min={minHeight}
            max={maxHeight}
            step={(maxHeight - minHeight) / 120 || 0.01}
            value={clippingHeight}
            disabled={disabled || !clippingEnabled}
            onChange={event => onClippingHeightChange(Number(event.currentTarget.value))}
            className="h-2 min-w-0 flex-1 accent-slate-900 disabled:opacity-40"
          />
        </label>
        <span className="font-semibold text-slate-500">WASD 移动 · Q/E 上下 · Shift 加速 · 鼠标旋转视角</span>
        {viewerMessage ? <span className="font-semibold text-amber-700">{viewerMessage}</span> : null}
      </div>
    </div>
  );
}

function ToolButton({ label, active, disabled, onClick }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
    >
      {label}
    </button>
  );
}

function Scene({
  assetId,
  fileType,
  modelUrl,
  initialView,
  viewMode,
  performanceMode,
  walkSpeedPreset,
  cameraFov,
  clippingEnabled,
  clippingHeight,
  xrayEnabled,
  edgesEnabled,
  onCaptureReady,
  onPanoramaReady,
  onCommandsReady,
  onModelInfoChange,
}: {
  assetId: string;
  fileType: AssetModel['fileType'];
  modelUrl: string;
  initialView: ModelViewerProps['initialView'];
  viewMode: ViewMode;
  performanceMode: boolean;
  walkSpeedPreset: WalkSpeedPreset;
  cameraFov: number;
  clippingEnabled: boolean;
  clippingHeight: number;
  xrayEnabled: boolean;
  edgesEnabled: boolean;
  onCaptureReady: (capture: () => ModelSnapshotCapture | null) => void;
  onPanoramaReady: (capture: (options?: { width?: number; height?: number }) => PanoramaImageCapture | null) => void;
  onCommandsReady: (commands: ViewerCommandApi | null) => void;
  onModelInfoChange: (info: ModelBoundsInfo | null) => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const modelRef = useRef<Object3D | null>(null);
  const modelInfoRef = useRef<ModelBoundsInfo | null>(null);
  const [walkBaseSpeed, setWalkBaseSpeed] = useState(0.6);
  const { gl, camera, scene, invalidate } = useThree();

  useLayoutEffect(() => {
    configurePreviewRenderer(gl);
    gl.localClippingEnabled = true;
    gl.shadowMap.enabled = !performanceMode;
    invalidate();
  }, [gl, invalidate, performanceMode]);

  useEffect(() => {
    if (!(camera instanceof ThreePerspectiveCamera)) return;
    if (Math.abs(camera.fov - cameraFov) < 0.001) return;
    camera.fov = cameraFov;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, cameraFov, invalidate]);

  useLayoutEffect(() => {
    onCaptureReady(() => {
      const canvas = gl.domElement;
      gl.render(scene, camera);
      const dataUrl = canvas.toDataURL('image/png');
      const perspectiveCamera = camera instanceof ThreePerspectiveCamera ? camera : null;
      return {
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        camera: {
          position: camera.position.toArray(),
          rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
          quaternion: camera.quaternion.toArray(),
          target: controlsRef.current?.target.toArray(),
          fov: perspectiveCamera?.fov,
        },
        viewMode,
        clippingEnabled,
        clippingHeight,
        xrayEnabled,
        edgesEnabled,
      };
    });
  }, [camera, clippingEnabled, clippingHeight, edgesEnabled, gl, onCaptureReady, scene, viewMode, xrayEnabled]);

  useLayoutEffect(() => {
    onPanoramaReady((options) => {
      const perspectiveCamera = camera instanceof ThreePerspectiveCamera ? camera : null;
      const { width, height } = normalizePanoramaOutputSize(options);
      camera.updateMatrixWorld(true);
      const dataUrl = renderEquirectangularPanorama({
        renderer: gl,
        scene,
        sourceCamera: camera as ThreePerspectiveCamera,
        width,
        height,
      });
      return {
        dataUrl,
        width,
        height,
        camera: {
          position: camera.position.toArray(),
          rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
          quaternion: camera.quaternion.toArray(),
          target: controlsRef.current?.target.toArray(),
          fov: perspectiveCamera?.fov,
        },
        fov: perspectiveCamera?.fov,
        viewMode,
      };
    });
  }, [camera, gl, onPanoramaReady, scene, viewMode]);

  useEffect(() => {
    onCommandsReady({
      fitView: (preset = 'fit') => {
        if (modelRef.current) {
          fitCameraToObject(camera as ThreePerspectiveCamera, controlsRef.current, modelRef.current, preset);
          invalidate();
        }
      },
      enterInterior: () => {
        const entered = enterModelInterior(camera as ThreePerspectiveCamera, controlsRef.current, modelInfoRef.current);
        if (entered) invalidate();
        return entered;
      },
      applyCamera: cameraState => {
        if (!Array.isArray(cameraState.position) || cameraState.position.length < 3) return false;
        camera.position.fromArray(cameraState.position);
        if (Array.isArray(cameraState.quaternion) && cameraState.quaternion.length >= 4) {
          camera.quaternion.fromArray(cameraState.quaternion);
        } else if (Array.isArray(cameraState.rotation) && cameraState.rotation.length >= 3) {
          camera.rotation.set(cameraState.rotation[0], cameraState.rotation[1], cameraState.rotation[2]);
        }
        if (typeof cameraState.fov === 'number' && camera instanceof ThreePerspectiveCamera) {
          camera.fov = clamp(cameraState.fov, 20, 100);
          camera.updateProjectionMatrix();
        }
        if (controlsRef.current && Array.isArray(cameraState.target) && cameraState.target.length >= 3) {
          controlsRef.current.target.fromArray(cameraState.target);
          controlsRef.current.update();
        }
        camera.updateMatrixWorld(true);
        invalidate();
        return true;
      },
    });
    return () => onCommandsReady(null);
  }, [camera, invalidate, onCommandsReady]);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.enabled = viewMode === 'orbit';
    invalidate();
  }, [invalidate, viewMode]);

  const handleModelReady = useCallback((object: Object3D, info: ModelBoundsInfo) => {
    modelRef.current = object;
    modelInfoRef.current = info;
    setWalkBaseSpeed(info.walkBaseSpeed);
    onModelInfoChange(info);
    invalidate();
  }, [invalidate, onModelInfoChange]);

  return (
    <>
      <color attach="background" args={[PREVIEW_BACKGROUND_COLOR]} />
      <PerspectiveCamera makeDefault position={[3.8, 2.6, 4.8]} fov={cameraFov} near={0.01} far={1000} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[0, 0, 0]}
        minDistance={0.05}
        maxDistance={120}
        minPolarAngle={0}
        maxPolarAngle={Math.PI}
        enableDamping={!performanceMode}
        enabled={viewMode === 'orbit'}
        onChange={() => invalidate()}
      />
      <WalkthroughControls
        enabled={viewMode === 'walkthrough'}
        baseSpeed={walkBaseSpeed}
        speedPreset={walkSpeedPreset}
      />
      {modelUrl ? (
        <LoadedModel
          assetId={assetId}
          fileType={fileType}
          modelUrl={modelUrl}
          controlsRef={controlsRef}
          clippingEnabled={clippingEnabled}
          clippingHeight={clippingHeight}
          xrayEnabled={xrayEnabled}
          edgesEnabled={edgesEnabled}
          performanceMode={performanceMode}
          initialView={initialView}
          onModelReady={handleModelReady}
        />
      ) : null}
      <ambientLight intensity={performanceMode ? 1.18 : 1.05} />
      <hemisphereLight args={['#ffffff', '#cbd5e1', performanceMode ? 1.35 : 1.55]} />
      <directionalLight position={[5, 8, 5]} intensity={performanceMode ? 2.25 : 2.85} castShadow={!performanceMode} />
      <directionalLight position={[-5, 4, -4]} intensity={performanceMode ? 0.65 : 0.95} />
    </>
  );
}

function configurePreviewRenderer(renderer: WebGLRenderer): void {
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = PREVIEW_RENDERER_EXPOSURE;
}

function WalkthroughControls({
  enabled,
  baseSpeed,
  speedPreset,
}: {
  enabled: boolean;
  baseSpeed: number;
  speedPreset: WalkSpeedPreset;
}) {
  const { camera, gl, invalidate } = useThree();
  const keysRef = useRef(new Set<string>());
  const draggingRef = useRef(false);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const forward = useRef(new Vector3());
  const right = useRef(new Vector3());
  const up = useRef(new Vector3(0, 1, 0));

  useEffect(() => {
    if (!enabled) {
      keysRef.current.clear();
      draggingRef.current = false;
      return;
    }
    camera.rotation.order = 'YXZ';
    yawRef.current = camera.rotation.y;
    pitchRef.current = camera.rotation.x;
  }, [camera, enabled]);

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.tabIndex = 0;
    if (!enabled) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.activeElement !== canvas) return;
      keysRef.current.add(event.code);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight'].includes(event.code)) {
        event.preventDefault();
        invalidate();
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
      invalidate();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      canvas.focus();
      yawRef.current = camera.rotation.y;
      pitchRef.current = camera.rotation.x;
      draggingRef.current = true;
      canvas.setPointerCapture(event.pointerId);
      invalidate();
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      yawRef.current -= event.movementX * 0.003;
      pitchRef.current -= event.movementY * 0.003;
      pitchRef.current = Math.max(-Math.PI / 2 + 0.04, Math.min(Math.PI / 2 - 0.04, pitchRef.current));
      camera.rotation.set(pitchRef.current, yawRef.current, 0);
      invalidate();
    };
    const handlePointerUp = (event: PointerEvent) => {
      draggingRef.current = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      invalidate();
    };
    const handleBlur = () => {
      keysRef.current.clear();
      draggingRef.current = false;
      invalidate();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [camera, enabled, gl, invalidate]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const keys = keysRef.current;
    const hasMovementKey = keys.has('KeyW') || keys.has('KeyS') || keys.has('KeyA') || keys.has('KeyD') || keys.has('KeyQ') || keys.has('KeyE');
    if (!hasMovementKey) return;

    const presetMultiplier = speedPreset === 'slow' ? 0.5 : speedPreset === 'fast' ? 1.8 : 1;
    const boostMultiplier = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1;
    const fineMultiplier = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('AltLeft') || keys.has('AltRight') ? 0.25 : 1;
    const step = baseSpeed * presetMultiplier * boostMultiplier * fineMultiplier * Math.min(delta, 0.05);
    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    if (forward.current.lengthSq() < 0.0001) {
      forward.current.set(0, 0, -1).applyAxisAngle(up.current, yawRef.current);
    }
    forward.current.normalize();
    right.current.crossVectors(forward.current, up.current).normalize();

    if (keys.has('KeyW')) camera.position.addScaledVector(forward.current, step);
    if (keys.has('KeyS')) camera.position.addScaledVector(forward.current, -step);
    if (keys.has('KeyD')) camera.position.addScaledVector(right.current, step);
    if (keys.has('KeyA')) camera.position.addScaledVector(right.current, -step);
    if (keys.has('KeyQ')) camera.position.y += step;
    if (keys.has('KeyE')) camera.position.y -= step;
    invalidate();
  });

  return null;
}

function LoadedModel({
  assetId,
  fileType,
  modelUrl,
  controlsRef,
  clippingEnabled,
  clippingHeight,
  xrayEnabled,
  edgesEnabled,
  performanceMode,
  initialView,
  onModelReady,
}: {
  assetId: string;
  fileType: AssetModel['fileType'];
  modelUrl: string;
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  clippingEnabled: boolean;
  clippingHeight: number;
  xrayEnabled: boolean;
  edgesEnabled: boolean;
  performanceMode: boolean;
  initialView: ModelViewerProps['initialView'];
  onModelReady: (object: Object3D, info: ModelBoundsInfo) => void;
}) {
  const [model, setModel] = useState<Object3D | null>(null);
  const modelRef = useRef<Object3D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clippingPlaneRef = useRef(new Plane(new Vector3(0, -1, 0), clippingHeight));
  const loadRequestRef = useRef(0);
  const assetIdRef = useRef(assetId);
  const { camera, invalidate } = useThree();

  useEffect(() => {
    assetIdRef.current = assetId;
  }, [assetId]);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++loadRequestRef.current;
    const loader = getModelLoaderDefinition(fileType);
    if (!loader || !modelUrl) {
      if (modelRef.current) {
        disposeModelObject(modelRef.current);
        modelRef.current = null;
      }
      setModel(null);
      setError('不支持的模型格式。支持格式：GLB、GLTF、OBJ、DAE、STL。');
      return;
    }

    setError(null);
    loader.load(modelUrl)
      .then(object => {
        if (cancelled || requestId !== loadRequestRef.current) {
          disposeModelObject(object);
          return;
        }
        const { object: normalized, info } = normalizeModelObject(object, fileType);
        if (modelRef.current && modelRef.current !== normalized) {
          disposeModelObject(modelRef.current);
        }
        modelRef.current = normalized;
        if (initialView === 'interior') {
          fitCameraToPanoramaStart(camera as ThreePerspectiveCamera, controlsRef.current, info);
        } else {
          fitCameraToObject(camera as ThreePerspectiveCamera, controlsRef.current, normalized, 'fit');
        }
        setModel(normalized);
        onModelReady(normalized, info);
        invalidate();
      })
      .catch(error => {
        if (cancelled || requestId !== loadRequestRef.current) return;
        const message = error instanceof Error ? error.message : '模型加载失败。建议将模型转换为 GLB 后重新上传。';
        console.error('ModelViewer failed to load model', {
          modelAssetId: assetIdRef.current,
          stableModelUrl: modelUrl,
          extension: fileType,
          loaderType: loader.kind,
          error: message,
        });
        setError(message);
      });

    return () => {
      cancelled = true;
    };
  }, [camera, controlsRef, fileType, initialView, invalidate, modelUrl, onModelReady]);

  useEffect(() => () => {
    if (modelRef.current) {
      disposeModelObject(modelRef.current);
      modelRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!model) return;
    clippingPlaneRef.current.constant = clippingHeight;
    applyModelDisplayState(model, {
      clippingPlanes: clippingEnabled ? [clippingPlaneRef.current] : [],
      xrayEnabled,
      edgesEnabled,
    });
    invalidate();
  }, [clippingEnabled, clippingHeight, edgesEnabled, invalidate, model, xrayEnabled]);

  useEffect(() => {
    if (!model) return;
    applyModelPerformanceState(model, { shadowsEnabled: !performanceMode });
    invalidate();
  }, [invalidate, model, performanceMode]);

  if (error) {
    throw new Error(error);
  }

  if (!model) return null;
  return <primitive object={model} dispose={null} />;
}

function normalizeModelObject(object: Object3D, fileType: AssetModel['fileType']): { object: Object3D; info: ModelBoundsInfo } {
  const root = new Group();
  const model = object.clone(true);
  preparePreviewMaterials(model, fileType === 'stl');
  model.updateMatrixWorld(true);

  const rawBox = new Box3().setFromObject(model);
  const rawCenter = new Vector3();
  const rawSize = new Vector3();
  rawBox.getCenter(rawCenter);
  rawBox.getSize(rawSize);

  const rawMaxDimension = Math.max(rawSize.x, rawSize.y, rawSize.z);
  const scale = Number.isFinite(rawMaxDimension) && rawMaxDimension > 0 ? 3 / rawMaxDimension : 1;
  model.position.set(-rawCenter.x, -rawCenter.y, -rawCenter.z);
  model.scale.setScalar(scale);
  model.traverse(child => {
    child.frustumCulled = false;
  });

  root.add(model);
  root.updateMatrixWorld(true);

  const info = calculateModelInfo(root);
  return { object: root, info };
}

function preparePreviewMaterials(object: Object3D, forceClay: boolean): void {
  object.traverse(child => {
    if (child instanceof Mesh) {
      if (forceClay || !child.material || (Array.isArray(child.material) && child.material.length === 0)) {
        child.material = clayMaterial.clone();
      } else if (Array.isArray(child.material)) {
        child.material = child.material.map(material => clonePreviewMaterial(material));
      } else {
        child.material = clonePreviewMaterial(child.material);
      }
      setMaterialMetadata(child.material, child.material);
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });
}

function clonePreviewMaterial(material: Material | null): Material {
  if (!material) return clayMaterial.clone();
  const clone = material.clone();
  clone.side = DoubleSide;
  return clone;
}

function setMaterialMetadata(materialOrMaterials: Material | Material[], original: Material | Material[]): void {
  const materials = Array.isArray(materialOrMaterials) ? materialOrMaterials : [materialOrMaterials];
  const originals = Array.isArray(original) ? original : [original];
  materials.forEach((material, index) => {
    material.side = DoubleSide;
    material.userData.previewMaterial = originals[index] || material;
  });
}

function calculateModelInfo(object: Object3D): ModelBoundsInfo {
  const box = new Box3().setFromObject(object);
  const center = new Vector3();
  const size = new Vector3();
  box.getCenter(center);
  box.getSize(size);

  let vertexCount = 0;
  let triangleCount = 0;
  object.traverse(child => {
    if (!(child instanceof Mesh)) return;
    const geometry = child.geometry;
    const positionCount = geometry.getAttribute('position')?.count ?? 0;
    vertexCount += positionCount;
    triangleCount += geometry.index ? geometry.index.count / 3 : positionCount / 3;
  });

  const maxDimension = Math.max(size.x, size.y, size.z);
  const diagonal = size.length();
  return {
    center,
    size,
    minY: box.min.y,
    maxY: box.max.y,
    maxDimension,
    diagonal,
    walkBaseSpeed: clamp(diagonal * 0.09, 0.25, 5),
    vertexCount,
    triangleCount,
    defaultClippingHeight: box.min.y + size.y * 0.7,
    edgesAvailableByDefault: vertexCount <= EDGE_VERTEX_LIMIT && triangleCount <= EDGE_TRIANGLE_LIMIT,
  };
}

function ensureModelEdges(object: Object3D): void {
  if (object.userData.previewEdgesGenerated) return;
  object.userData.previewEdgesGenerated = true;

  const edgeMaterial = new LineBasicMaterial({
    color: '#334155',
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const meshes: Mesh[] = [];
  object.traverse(child => {
    if (child instanceof Mesh) meshes.push(child);
  });
  meshes.forEach(mesh => {
    const edges = new LineSegments(new EdgesGeometry(mesh.geometry, 35), edgeMaterial.clone());
    edges.name = 'preview-edges';
    edges.visible = true;
    edges.renderOrder = 2;
    edges.userData.isPreviewEdges = true;
    mesh.add(edges);
  });
  edgeMaterial.dispose();
}

function applyModelDisplayState(
  object: Object3D,
  { clippingPlanes, xrayEnabled, edgesEnabled }: { clippingPlanes: Plane[]; xrayEnabled: boolean; edgesEnabled: boolean },
): void {
  if (edgesEnabled) {
    ensureModelEdges(object);
  }

  object.traverse(child => {
    if (child.userData.isPreviewEdges && child instanceof LineSegments) {
      child.visible = edgesEnabled;
      applyMaterialClipping(child.material, clippingPlanes);
      return;
    }
    if (!(child instanceof Mesh)) return;

    if (xrayEnabled) {
      child.material = Array.isArray(child.material)
        ? child.material.map(() => xrayMaterial.clone())
        : xrayMaterial.clone();
    } else {
      child.material = Array.isArray(child.material)
        ? child.material.map(material => material.userData.previewMaterial as Material || clayMaterial.clone())
        : child.material.userData.previewMaterial as Material || clayMaterial.clone();
    }
    applyMaterialClipping(child.material, clippingPlanes);
  });
}

function applyModelPerformanceState(object: Object3D, { shadowsEnabled }: { shadowsEnabled: boolean }): void {
  object.traverse(child => {
    if (child instanceof Mesh) {
      child.castShadow = shadowsEnabled;
      child.receiveShadow = shadowsEnabled;
    }
  });
}

function applyMaterialClipping(materialOrMaterials: Material | Material[], clippingPlanes: Plane[]): void {
  const materials = Array.isArray(materialOrMaterials) ? materialOrMaterials : [materialOrMaterials];
  materials.forEach(material => {
    material.clippingPlanes = clippingPlanes;
    material.clipShadows = clippingPlanes.length > 0;
    material.needsUpdate = true;
  });
}

function disposeModelObject(object: Object3D): void {
  const disposedGeometries = new Set<BufferGeometry>();
  const disposedMaterials = new Set<Material>();
  object.traverse(child => {
    if (child instanceof Mesh || child instanceof LineSegments) {
      const geometry = child.geometry;
      if (geometry && !disposedGeometries.has(geometry)) {
        geometry.dispose();
        disposedGeometries.add(geometry);
      }
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => {
        if (material && !disposedMaterials.has(material)) {
          material.dispose();
          disposedMaterials.add(material);
        }
      });
    }
  });
}

function fitCameraToObject(
  camera: ThreePerspectiveCamera,
  controls: OrbitControlsImpl | null,
  object: Object3D,
  preset: ViewPreset,
): void {
  const box = new Box3().setFromObject(object);
  const center = new Vector3();
  const size = new Vector3();
  box.getCenter(center);
  box.getSize(size);

  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  const distance = (maxDimension / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.45;
  const offsets: Record<ViewPreset, Vector3> = {
    fit: new Vector3(distance * 0.9, distance * 0.62, distance * 1.05),
    top: new Vector3(0, distance * 1.15, 0.001),
    front: new Vector3(0, distance * 0.22, distance * 1.25),
    side: new Vector3(distance * 1.25, distance * 0.22, 0),
    'bird-eye': new Vector3(distance * 0.92, distance * 1.12, distance * 0.92),
  };

  camera.position.copy(center).add(offsets[preset]);
  camera.near = Math.max(0.005, distance / 150);
  camera.far = Math.max(1000, distance * 120);
  camera.lookAt(center);
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
}

function enterModelInterior(
  camera: ThreePerspectiveCamera,
  controls: OrbitControlsImpl | null,
  info: ModelBoundsInfo | null,
): boolean {
  if (!info || !Number.isFinite(info.maxDimension) || info.maxDimension <= 0.001 || info.size.y <= 0.001) return false;

  const eyeHeight = info.minY + info.size.y * 0.42;
  const offset = Math.max(info.maxDimension * 0.08, 0.12);
  const position = new Vector3(info.center.x, eyeHeight, info.center.z + offset);
  const target = new Vector3(info.center.x, eyeHeight, info.center.z - info.maxDimension * 0.35);

  camera.position.copy(position);
  camera.near = Math.max(0.003, info.maxDimension / 600);
  camera.far = Math.max(1000, info.maxDimension * 160);
  camera.lookAt(target);
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(target);
    controls.update();
  }
  return true;
}

function fitCameraToPanoramaStart(
  camera: ThreePerspectiveCamera,
  controls: OrbitControlsImpl | null,
  info: ModelBoundsInfo | null,
): boolean {
  if (!info || !Number.isFinite(info.maxDimension) || info.maxDimension <= 0.001 || info.size.y <= 0.001) return false;

  const eyeHeight = info.minY + info.size.y * 0.45;
  const zOffset = Math.max(info.size.z * 0.18, info.maxDimension * 0.1, 0.16);
  const lookAhead = Math.max(info.size.z * 0.45, info.maxDimension * 0.35, 0.45);
  const position = new Vector3(info.center.x, eyeHeight, info.center.z + zOffset);
  const target = new Vector3(info.center.x, eyeHeight, info.center.z - lookAhead);

  camera.position.copy(position);
  camera.near = Math.max(0.003, info.maxDimension / 700);
  camera.far = Math.max(1000, info.maxDimension * 180);
  camera.lookAt(target);
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(target);
    controls.update();
  }
  return true;
}

type PanoramaFaceKey = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';

interface PanoramaCubeFace {
  key: PanoramaFaceKey;
  direction: Vector3;
  up: Vector3;
  right: Vector3;
}

const PANORAMA_CUBE_FACES: PanoramaCubeFace[] = [
  createPanoramaCubeFace('px', new Vector3(1, 0, 0), new Vector3(0, 1, 0)),
  createPanoramaCubeFace('nx', new Vector3(-1, 0, 0), new Vector3(0, 1, 0)),
  createPanoramaCubeFace('py', new Vector3(0, 1, 0), new Vector3(0, 0, -1)),
  createPanoramaCubeFace('ny', new Vector3(0, -1, 0), new Vector3(0, 0, 1)),
  createPanoramaCubeFace('pz', new Vector3(0, 0, 1), new Vector3(0, 1, 0)),
  createPanoramaCubeFace('nz', new Vector3(0, 0, -1), new Vector3(0, 1, 0)),
];

function createPanoramaCubeFace(key: PanoramaFaceKey, direction: Vector3, up: Vector3): PanoramaCubeFace {
  return {
    key,
    direction,
    up,
    right: new Vector3().crossVectors(direction, up).normalize(),
  };
}

function normalizePanoramaOutputSize(options?: { width?: number; height?: number }): { width: number; height: number } {
  const requestedWidth = options?.width || (options?.height ? options.height * 2 : 2048);
  const width = Math.round(clamp(requestedWidth, 1024, 4096) / 2) * 2;
  return {
    width,
    height: Math.round(width / 2),
  };
}

function renderEquirectangularPanorama({
  renderer,
  scene,
  sourceCamera,
  width,
  height,
}: {
  renderer: WebGLRenderer;
  scene: Parameters<WebGLRenderer['render']>[0];
  sourceCamera: ThreePerspectiveCamera;
  width: number;
  height: number;
}): string {
  const panoramaWidth = Math.round(width / 2) * 2;
  const panoramaHeight = Math.round(panoramaWidth / 2);
  const maxTextureSize = renderer.capabilities.maxTextureSize || 2048;
  const faceSize = Math.max(256, Math.min(2048, maxTextureSize, Math.round(panoramaWidth / 2)));
  const faces = {} as Record<PanoramaFaceKey, Uint8Array>;
  const renderTarget = new WebGLRenderTarget(faceSize, faceSize, { depthBuffer: true, stencilBuffer: false });
  const captureCamera = new ThreePerspectiveCamera(90, 1, sourceCamera.near, sourceCamera.far);
  captureCamera.position.copy(sourceCamera.position);
  captureCamera.updateProjectionMatrix();
  const previousTarget = renderer.getRenderTarget();
  const heading = new Vector3();
  sourceCamera.updateMatrixWorld(true);
  sourceCamera.getWorldDirection(heading);
  heading.y = 0;
  if (heading.lengthSq() < 0.0001) heading.set(0, 0, 1);
  heading.normalize();
  const headingYaw = Math.atan2(heading.x, heading.z);
  const yAxis = new Vector3(0, 1, 0);

  try {
    for (const face of PANORAMA_CUBE_FACES) {
      captureCamera.up.copy(face.up);
      captureCamera.lookAt(sourceCamera.position.clone().add(face.direction));
      captureCamera.updateProjectionMatrix();
      captureCamera.updateMatrixWorld(true);
      renderer.setRenderTarget(renderTarget);
      renderer.clear(true, true, true);
      renderer.render(scene, captureCamera);
      const pixels = new Uint8Array(faceSize * faceSize * 4);
      renderer.readRenderTargetPixels(renderTarget, 0, 0, faceSize, faceSize, pixels);
      faces[face.key] = pixels;
    }
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderTarget.dispose();
  }

  const canvas = document.createElement('canvas');
  canvas.width = panoramaWidth;
  canvas.height = panoramaHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建全景图画布。');
  const output = context.createImageData(panoramaWidth, panoramaHeight);
  const direction = new Vector3();

  for (let y = 0; y < panoramaHeight; y += 1) {
    const v = 0.5 - (y + 0.5) / panoramaHeight;
    const pitch = v * Math.PI;
    const cosPitch = Math.cos(pitch);
    for (let x = 0; x < panoramaWidth; x += 1) {
      const yaw = (0.5 - (x + 0.5) / panoramaWidth) * Math.PI * 2;
      direction.set(
        Math.sin(yaw) * cosPitch,
        Math.sin(pitch),
        Math.cos(yaw) * cosPitch,
      ).applyAxisAngle(yAxis, headingYaw).normalize();
      const sample = sampleCubeFaces(faces, direction, faceSize);
      const index = (y * panoramaWidth + x) * 4;
      output.data[index] = sample[0];
      output.data[index + 1] = sample[1];
      output.data[index + 2] = sample[2];
      output.data[index + 3] = 255;
    }
  }

  context.putImageData(output, 0, 0);
  renderer.render(scene, sourceCamera);
  return canvas.toDataURL('image/png');
}

function sampleCubeFaces(faces: Record<PanoramaFaceKey, Uint8Array>, direction: Vector3, faceSize: number): [number, number, number] {
  let selectedFace = PANORAMA_CUBE_FACES[0];
  let selectedDot = -Infinity;

  for (const face of PANORAMA_CUBE_FACES) {
    const dot = direction.dot(face.direction);
    if (dot > selectedDot) {
      selectedDot = dot;
      selectedFace = face;
    }
  }

  const localX = direction.dot(selectedFace.right) / selectedDot;
  const localY = direction.dot(selectedFace.up) / selectedDot;
  const data = faces[selectedFace.key];
  const px = clamp(((localX + 1) / 2) * (faceSize - 1), 0, faceSize - 1);
  const py = clamp(((localY + 1) / 2) * (faceSize - 1), 0, faceSize - 1);
  return sampleFaceBilinear(data, faceSize, px, py);
}

function sampleFaceBilinear(data: Uint8Array, faceSize: number, x: number, y: number): [number, number, number] {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(faceSize - 1, x0 + 1);
  const y1 = Math.min(faceSize - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const c00 = readFacePixel(data, faceSize, x0, y0);
  const c10 = readFacePixel(data, faceSize, x1, y0);
  const c01 = readFacePixel(data, faceSize, x0, y1);
  const c11 = readFacePixel(data, faceSize, x1, y1);

  return [
    bilinear(c00[0], c10[0], c01[0], c11[0], tx, ty),
    bilinear(c00[1], c10[1], c01[1], c11[1], tx, ty),
    bilinear(c00[2], c10[2], c01[2], c11[2], tx, ty),
  ];
}

function readFacePixel(data: Uint8Array, faceSize: number, x: number, y: number): [number, number, number] {
  const index = (y * faceSize + x) * 4;
  return [data[index], data[index + 1], data[index + 2]];
}

function bilinear(c00: number, c10: number, c01: number, c11: number, tx: number, ty: number): number {
  const top = c00 * (1 - tx) + c10 * tx;
  const bottom = c01 * (1 - tx) + c11 * tx;
  return Math.round(top * (1 - ty) + bottom * ty);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

class PreviewErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: (errorMessage?: string) => React.ReactNode; resetKey: string },
  { hasError: boolean; errorMessage?: string }
> {
  state: { hasError: boolean; errorMessage?: string } = { hasError: false };

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, errorMessage: error instanceof Error ? error.message : String(error) };
  }

  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: undefined });
    }
  }

  render() {
    return this.state.hasError ? this.props.fallback(this.state.errorMessage) : this.props.children;
  }
}

function UnsupportedPreview({ asset, errorMessage, minHeight }: { asset: AssetModel; errorMessage: string | null; minHeight: number }) {
  const supported = '支持格式：GLB、GLTF、OBJ、DAE、STL。推荐格式：GLB。';
  const sketchup = 'SketchUp 用户建议：从 SketchUp 导出为 GLB、DAE、OBJ 或 STL 后上传。暂不支持 FBX 和 SKP 原生文件。';
  const message = errorMessage || (getModelLoaderDefinition(asset.fileType) ? '模型文件未持久化，请重新上传后预览' : '不支持的模型格式');

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50 px-8 text-center" style={{ minHeight }}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        <BoxIcon className="h-8 w-8 text-slate-300" />
      </div>
      <h3 className="text-sm font-bold text-slate-800">{message}</h3>
      <p className="mt-2 max-w-md text-xs leading-6 text-slate-500">{supported}</p>
      <p className="mt-1 max-w-md text-xs leading-6 text-slate-500">{sketchup}</p>
    </div>
  );
}

export function getModelLoadDiagnostics(asset: AssetModel, runtimeError?: string): string[] {
  const diagnostics = [
    runtimeError ? `加载器返回：${runtimeError}` : '',
    asset.conversionStatus === 'failed' && asset.conversionError ? `格式转换失败：${asset.conversionError}` : '',
    asset.optimizationStatus === 'failed' && asset.optimizationError ? `轻量化失败：${asset.optimizationError}` : '',
    asset.fileType === 'gltf' ? 'GLTF 可能缺少外部 .bin 或贴图文件，建议导出为单文件 GLB。' : '',
    !resolveModelPreviewUrl(asset) ? '模型 URL 不存在或当前登录用户无权访问。' : '',
    '检查模型文件是否损坏、浏览器显存是否充足，以及服务端返回的 Content-Type 和跨域配置。',
    '支持 GLB、GLTF、OBJ、DAE、STL；不支持原生 FBX 或 SKP。',
  ].filter(Boolean);
  return Array.from(new Set(diagnostics));
}

function LoadFailed({ asset, runtimeError, minHeight }: { asset: AssetModel; runtimeError?: string; minHeight: number }) {
  const diagnostics = getModelLoadDiagnostics(asset, runtimeError);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50 px-8 text-center" style={{ minHeight }}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50">
        <BoxIcon className="h-8 w-8 text-amber-500" />
      </div>
      <h3 className="text-sm font-bold text-slate-800">模型加载失败。建议将模型转换为 GLB 后重新上传。</h3>
      <ul className="mt-3 max-w-lg space-y-1 text-left text-xs leading-5 text-slate-500">
        {diagnostics.map(item => <li key={item}>• {item}</li>)}
      </ul>
    </div>
  );
}

function ModelPreviewLoading({ label, minHeight }: { label: string; minHeight: number }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-50" style={{ minHeight }}>
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-500" />
      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
    </div>
  );
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
