import React, { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Float, MeshDistortMaterial, OrbitControls, PerspectiveCamera, RoundedBox, useGLTF } from '@react-three/drei';
import { Box3, Vector3 } from 'three';
import { Box } from 'lucide-react';
import type { AssetModel } from '../types';

const previewableTypes = new Set<AssetModel['fileType']>(['glb', 'gltf']);

export function AssetModelPreview({ asset }: { asset: AssetModel }) {
  const previewUrl = resolveAssetPreviewUrl(asset);
  const canPreview = Boolean(asset.previewable && previewUrl && (previewableTypes.has(asset.fileType) || asset.convertedUrl));
  const { ref, size } = useElementSize<HTMLDivElement>();
  const hasUsableSize = size.width > 100 && size.height > 100;

  if (!canPreview) return <UnsupportedPreview asset={asset} />;

  return (
    <div ref={ref} className="relative h-full min-h-[480px] w-full bg-slate-100">
      {!hasUsableSize ? <ModelPreviewLoading label="正在准备三维预览容器…" /> : (
        <PreviewErrorBoundary resetKey={`${asset.id}:${previewUrl}`} fallback={<UnsupportedPreview asset={asset} />}>
          <Suspense fallback={<ModelPreviewLoading label="正在加载三维预览…" />}>
            <Canvas className="h-full w-full" style={{ width: '100%', height: '100%' }} frameloop="always" shadows dpr={[1, 2]} gl={{ alpha: false, antialias: true }}>
              <Scene asset={asset} />
            </Canvas>
          </Suspense>
        </PreviewErrorBoundary>
      )}
    </div>
  );
}

function LocalModelPreview({ url }: { url: string }) {
  const gltf = useGLTF(url);
  const model = useMemo(() => {
    const scene = gltf.scene.clone(true);
    scene.updateMatrixWorld(true);
    scene.traverse(object => { object.frustumCulled = false; });
    const box = new Box3().setFromObject(scene);
    const center = new Vector3();
    const size = new Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDimension = Math.max(size.x, size.y, size.z);
    const scale = Number.isFinite(maxDimension) && maxDimension > 0 ? 2.8 / maxDimension : 1;
    return {
      scene,
      position: [-center.x * scale, -center.y * scale, -center.z * scale] as [number, number, number],
      scale,
    };
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
  const previewUrl = resolveAssetPreviewUrl(asset);
  return (
    <>
      <color attach="background" args={['#f8fafc']} />
      <PerspectiveCamera makeDefault position={[3.8, 2.6, 4.8]} fov={42} near={0.01} far={1000} />
      <OrbitControls makeDefault target={[0, 0, 0]} minDistance={0.4} maxDistance={20} minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} enableDamping />
      {asset.previewable && previewUrl ? <LocalModelPreview url={previewUrl} /> : <DemoModelPreview />}
      <ambientLight intensity={0.85} />
      <hemisphereLight args={['#ffffff', '#cbd5e1', 1.1]} />
      <directionalLight position={[5, 8, 6]} intensity={1.6} castShadow />
      <directionalLight position={[-5, 3, -4]} intensity={0.45} />
    </>
  );
}

class PreviewErrorBoundary extends React.Component<{ children: React.ReactNode; fallback: React.ReactNode; resetKey: string }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) this.setState({ hasError: false });
  }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

function UnsupportedPreview({ asset }: { asset: AssetModel }) {
  const message = asset.fileType === 'obj' || asset.fileType === 'dae' || asset.fileType === 'zip'
    ? '该格式需转换为 GLB 后预览'
    : '模型文件未持久化，请重新上传文件后预览';
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50 px-8 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm"><Box className="h-8 w-8 text-slate-300" /></div>
      <h3 className="text-sm font-bold text-slate-800">{message}</h3>
      <p className="mt-2 max-w-md text-xs leading-6 text-slate-500">DAE / OBJ / ZIP 可由后端转换为 GLB；暂不支持原生 FBX 和 SKP。</p>
    </div>
  );
}

export function ModelPreviewLoading({ label = '正在加载三维预览…' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[480px] w-full flex-col items-center justify-center gap-4 bg-slate-50">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-500" />
      <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</span>
    </div>
  );
}

function resolveAssetPreviewUrl(asset: AssetModel): string | undefined {
  return asset.convertedUrl || asset.optimizedUrl || asset.previewUrl || asset.metadata?.convertedUrl || asset.metadata?.optimizedUrl || asset.metadata?.previewUrl || asset.modelUrl;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      const nextSize = { width: Math.round(rect.width), height: Math.round(rect.height) };
      setSize(current => current.width === nextSize.width && current.height === nextSize.height ? current : nextSize);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, size };
}
