import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface PanoramaViewerProps {
  imageUrl: string;
  className?: string;
  minHeight?: number;
}

export function PanoramaViewer({ imageUrl, className = '', minHeight = 360 }: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !imageUrl) return;

    setLoadError(null);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth || 1, container.clientHeight || minHeight);
    container.appendChild(renderer.domElement);

    const geometry = new THREE.SphereGeometry(500, 64, 40);
    geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    let disposed = false;
    let frameId = 0;
    let lon = 0;
    let lat = 0;
    let pointerDown = false;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let lonStart = 0;
    let latStart = 0;
    let pinchStartDistance = 0;
    let pinchStartFov = camera.fov;

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      imageUrl,
      texture => {
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        material.map = texture;
        material.needsUpdate = true;
      },
      undefined,
      error => {
        console.error('Panorama texture failed to load', { imageUrl, error });
        if (!disposed) setLoadError('全景图加载失败。');
      },
    );

    const resize = () => {
      if (!container) return;
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight || minHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const updateCamera = () => {
      lat = Math.max(-85, Math.min(85, lat));
      const phi = THREE.MathUtils.degToRad(90 - lat);
      const theta = THREE.MathUtils.degToRad(lon);
      const target = new THREE.Vector3(
        500 * Math.sin(phi) * Math.cos(theta),
        500 * Math.cos(phi),
        500 * Math.sin(phi) * Math.sin(theta),
      );
      camera.lookAt(target);
    };

    const animate = () => {
      updateCamera();
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(animate);
    };

    const handlePointerDown = (event: PointerEvent) => {
      pointerDown = true;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      lonStart = lon;
      latStart = lat;
      renderer.domElement.setPointerCapture?.(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerDown) return;
      lon = lonStart - (event.clientX - pointerStartX) * 0.12;
      lat = latStart + (event.clientY - pointerStartY) * 0.12;
    };

    const handlePointerUp = (event: PointerEvent) => {
      pointerDown = false;
      renderer.domElement.releasePointerCapture?.(event.pointerId);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      camera.fov = Math.max(35, Math.min(95, camera.fov + event.deltaY * 0.03));
      camera.updateProjectionMatrix();
    };

    const getTouchDistance = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        pinchStartDistance = getTouchDistance(event.touches);
        pinchStartFov = camera.fov;
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || pinchStartDistance <= 0) return;
      event.preventDefault();
      const nextDistance = getTouchDistance(event.touches);
      const scale = pinchStartDistance / Math.max(1, nextDistance);
      camera.fov = Math.max(35, Math.min(95, pinchStartFov * scale));
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointercancel', handlePointerUp);
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });
    renderer.domElement.addEventListener('touchstart', handleTouchStart, { passive: true });
    renderer.domElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    resize();
    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointercancel', handlePointerUp);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      renderer.domElement.removeEventListener('touchstart', handleTouchStart);
      renderer.domElement.removeEventListener('touchmove', handleTouchMove);
      material.map?.dispose();
      material.dispose();
      geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [imageUrl, minHeight]);

  return (
    <div ref={containerRef} className={`relative overflow-hidden bg-slate-950 ${className}`} style={{ minHeight }}>
      {loadError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 p-4 text-center text-sm font-bold text-white">
          {loadError}
        </div>
      ) : null}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-slate-950/70 px-3 py-1 text-[11px] font-bold text-white">
        拖拽环视 · 滚轮缩放
      </div>
    </div>
  );
}
