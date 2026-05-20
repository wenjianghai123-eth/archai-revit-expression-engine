import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
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
  Object3D,
  PerspectiveCamera as ThreePerspectiveCamera,
  Plane,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { AssetModel, ModelSnapshotCapture } from '../types';

export interface ModelViewerHandle {
  captureSnapshot: () => Promise<ModelSnapshotCapture>;
}

interface ModelViewerProps {
  asset: AssetModel;
  minHeight?: number;
}

type SupportedModelFormat = Exclude<AssetModel['fileType'], 'unknown'>;
type LoaderKind = 'GLTFLoader' | 'OBJLoader' | 'ColladaLoader' | 'STLLoader';
type ViewMode = 'orbit' | 'walkthrough';
type ViewPreset = 'fit' | 'top' | 'front' | 'side';

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
  vertexCount: number;
  triangleCount: number;
  defaultClippingHeight: number;
  edgesAvailableByDefault: boolean;
}

interface ViewerCommandApi {
  fitView: (preset?: ViewPreset) => void;
  enterInterior: () => boolean;
}

export interface StableModelLoadIdentity {
  assetId: string;
  fileType: AssetModel['fileType'];
  modelUrl: string;
  loaderKind: LoaderKind | null;
}

const EDGE_TRIANGLE_LIMIT = 160_000;
const EDGE_VERTEX_LIMIT = 260_000;

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
  return asset.optimizedUrl
    || asset.previewUrl
    || asset.metadata?.optimizedUrl
    || asset.metadata?.previewUrl
    || asset.modelUrl
    || asset.originalUrl
    || '';
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
  { asset, minHeight = 420 },
  ref,
) {
  const { ref: sizeRef, size } = useElementSize<HTMLDivElement>();
  const captureRef = useRef<() => ModelSnapshotCapture | null>(() => null);
  const commandRef = useRef<ViewerCommandApi | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('orbit');
  const [clippingEnabled, setClippingEnabled] = useState(false);
  const [clippingHeight, setClippingHeight] = useState(0);
  const [xrayEnabled, setXrayEnabled] = useState(false);
  const [edgesEnabled, setEdgesEnabled] = useState(true);
  const [modelInfo, setModelInfo] = useState<ModelBoundsInfo | null>(null);
  const [viewerMessage, setViewerMessage] = useState<string | null>(null);
  const loadIdentity = getStableModelLoadIdentity(asset);
  const previewError = getModelPreviewError(asset);
  const canPreview = !previewError;
  const hasUsableSize = size.width > 100 && size.height > 100;

  useImperativeHandle(ref, () => ({
    async captureSnapshot() {
      const capture = captureRef.current();
      if (!capture) {
        throw new Error('当前模型预览无法截图，请检查模型资源是否允许 canvas 导出。');
      }
      return capture;
    },
  }), []);

  useEffect(() => {
    setViewMode('orbit');
    setClippingEnabled(false);
    setXrayEnabled(false);
    setEdgesEnabled(true);
    setModelInfo(null);
    setViewerMessage(null);
  }, [asset.id]);

  const handleModelInfoChange = useCallback((info: ModelBoundsInfo | null) => {
    setModelInfo(info);
    if (!info) return;
    setClippingHeight(info.defaultClippingHeight);
    setEdgesEnabled(info.edgesAvailableByDefault);
    setViewerMessage(info.edgesAvailableByDefault ? null : '模型较大，已关闭边线以提升预览性能。');
  }, []);

  const handleCaptureReady = useCallback((capture: () => ModelSnapshotCapture | null) => {
    captureRef.current = capture;
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
        onClippingEnabledChange={setClippingEnabled}
        onClippingHeightChange={setClippingHeight}
        onXrayEnabledChange={setXrayEnabled}
        onEdgesEnabledChange={setEdgesEnabled}
      />
      <PreviewErrorBoundary resetKey={`${loadIdentity.fileType}:${loadIdentity.modelUrl}`} fallback={<LoadFailed minHeight={minHeight} />}>
        <Canvas
          className="h-full w-full"
          style={{ width: '100%', height: '100%' }}
          frameloop="always"
          shadows
          dpr={[1, 2]}
          gl={{ alpha: false, antialias: true, preserveDrawingBuffer: true, localClippingEnabled: true }}
        >
          <Scene
            assetId={loadIdentity.assetId}
            fileType={loadIdentity.fileType}
            modelUrl={loadIdentity.modelUrl}
            viewMode={viewMode}
            clippingEnabled={clippingEnabled}
            clippingHeight={clippingHeight}
            xrayEnabled={xrayEnabled}
            edgesEnabled={edgesEnabled}
            onCaptureReady={handleCaptureReady}
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
  onClippingEnabledChange,
  onClippingHeightChange,
  onXrayEnabledChange,
  onEdgesEnabledChange,
}: {
  viewMode: ViewMode;
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
        <ToolButton label="开屋顶" active={clippingEnabled} disabled={disabled} onClick={() => onClippingEnabledChange(!clippingEnabled)} />
        <ToolButton label="X 光显示" active={xrayEnabled} disabled={disabled} onClick={() => onXrayEnabledChange(!xrayEnabled)} />
        <ToolButton label="显示边线" active={edgesEnabled} disabled={disabled} onClick={() => onEdgesEnabledChange(!edgesEnabled)} />
      </div>
      <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm backdrop-blur">
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
  viewMode,
  clippingEnabled,
  clippingHeight,
  xrayEnabled,
  edgesEnabled,
  onCaptureReady,
  onCommandsReady,
  onModelInfoChange,
}: {
  assetId: string;
  fileType: AssetModel['fileType'];
  modelUrl: string;
  viewMode: ViewMode;
  clippingEnabled: boolean;
  clippingHeight: number;
  xrayEnabled: boolean;
  edgesEnabled: boolean;
  onCaptureReady: (capture: () => ModelSnapshotCapture | null) => void;
  onCommandsReady: (commands: ViewerCommandApi | null) => void;
  onModelInfoChange: (info: ModelBoundsInfo | null) => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const modelRef = useRef<Object3D | null>(null);
  const modelInfoRef = useRef<ModelBoundsInfo | null>(null);
  const { gl, camera, scene } = useThree();

  useLayoutEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

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

  useEffect(() => {
    onCommandsReady({
      fitView: (preset = 'fit') => {
        if (modelRef.current) fitCameraToObject(camera as ThreePerspectiveCamera, controlsRef.current, modelRef.current, preset);
      },
      enterInterior: () => enterModelInterior(camera as ThreePerspectiveCamera, controlsRef.current, modelInfoRef.current),
    });
    return () => onCommandsReady(null);
  }, [camera, onCommandsReady]);

  useEffect(() => {
    if (controlsRef.current) controlsRef.current.enabled = viewMode === 'orbit';
  }, [viewMode]);

  const handleModelReady = useCallback((object: Object3D, info: ModelBoundsInfo) => {
    modelRef.current = object;
    modelInfoRef.current = info;
    onModelInfoChange(info);
  }, [onModelInfoChange]);

  return (
    <>
      <color attach="background" args={['#f8fafc']} />
      <PerspectiveCamera makeDefault position={[3.8, 2.6, 4.8]} fov={42} near={0.01} far={1000} />
      <OrbitControls ref={controlsRef} makeDefault target={[0, 0, 0]} minDistance={0.05} maxDistance={80} minPolarAngle={0} maxPolarAngle={Math.PI} enableDamping />
      <WalkthroughControls enabled={viewMode === 'walkthrough'} />
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
          onModelReady={handleModelReady}
        />
      ) : null}
      <ambientLight intensity={0.9} />
      <hemisphereLight args={['#ffffff', '#cbd5e1', 1.15]} />
      <directionalLight position={[5, 8, 6]} intensity={1.55} castShadow />
      <directionalLight position={[-5, 3, -4]} intensity={0.45} />
    </>
  );
}

function WalkthroughControls({ enabled }: { enabled: boolean }) {
  const { camera, gl } = useThree();
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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!enabled || document.activeElement !== canvas) return;
      keysRef.current.add(event.code);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
        event.preventDefault();
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.code);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!enabled || event.button !== 0) return;
      canvas.focus();
      draggingRef.current = true;
      canvas.setPointerCapture(event.pointerId);
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!enabled || !draggingRef.current) return;
      yawRef.current -= event.movementX * 0.003;
      pitchRef.current -= event.movementY * 0.003;
      pitchRef.current = Math.max(-Math.PI / 2 + 0.04, Math.min(Math.PI / 2 - 0.04, pitchRef.current));
      camera.rotation.set(pitchRef.current, yawRef.current, 0);
    };
    const handlePointerUp = (event: PointerEvent) => {
      draggingRef.current = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [camera, enabled, gl]);

  useFrame((_, delta) => {
    if (!enabled) return;
    const keys = keysRef.current;
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 3.2 : 1.25;
    const step = speed * delta;
    camera.getWorldDirection(forward.current);
    right.current.crossVectors(forward.current, up.current).normalize();

    if (keys.has('KeyW')) camera.position.addScaledVector(forward.current, step);
    if (keys.has('KeyS')) camera.position.addScaledVector(forward.current, -step);
    if (keys.has('KeyD')) camera.position.addScaledVector(right.current, step);
    if (keys.has('KeyA')) camera.position.addScaledVector(right.current, -step);
    if (keys.has('KeyE')) camera.position.y += step;
    if (keys.has('KeyQ')) camera.position.y -= step;
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
  onModelReady: (object: Object3D, info: ModelBoundsInfo) => void;
}) {
  const [model, setModel] = useState<Object3D | null>(null);
  const modelRef = useRef<Object3D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clippingPlaneRef = useRef(new Plane(new Vector3(0, -1, 0), clippingHeight));
  const loadRequestRef = useRef(0);
  const assetIdRef = useRef(assetId);
  const { camera } = useThree();

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
        fitCameraToObject(camera as ThreePerspectiveCamera, controlsRef.current, normalized, 'fit');
        setModel(normalized);
        onModelReady(normalized, info);
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
  }, [camera, controlsRef, fileType, modelUrl, onModelReady]);

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
  }, [clippingEnabled, clippingHeight, edgesEnabled, model, xrayEnabled]);

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
  addModelEdges(root, info.edgesAvailableByDefault);
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
      child.castShadow = true;
      child.receiveShadow = true;
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
  return {
    center,
    size,
    minY: box.min.y,
    maxY: box.max.y,
    maxDimension,
    vertexCount,
    triangleCount,
    defaultClippingHeight: box.min.y + size.y * 0.7,
    edgesAvailableByDefault: vertexCount <= EDGE_VERTEX_LIMIT && triangleCount <= EDGE_TRIANGLE_LIMIT,
  };
}

function addModelEdges(object: Object3D, visible: boolean): void {
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
    edges.visible = visible;
    edges.renderOrder = 2;
    edges.userData.isPreviewEdges = true;
    mesh.add(edges);
  });
}

function applyModelDisplayState(
  object: Object3D,
  { clippingPlanes, xrayEnabled, edgesEnabled }: { clippingPlanes: Plane[]; xrayEnabled: boolean; edgesEnabled: boolean },
): void {
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

function LoadFailed({ minHeight }: { minHeight: number }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50 px-8 text-center" style={{ minHeight }}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-100 bg-amber-50">
        <BoxIcon className="h-8 w-8 text-amber-500" />
      </div>
      <h3 className="text-sm font-bold text-slate-800">模型加载失败。建议将模型转换为 GLB 后重新上传。</h3>
      <p className="mt-2 max-w-md text-xs leading-6 text-slate-500">
        GLTF 如果缺少外部 .bin 或贴图文件，建议优先导出为单文件 GLB。
      </p>
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
