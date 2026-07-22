import { forwardRef, lazy, Suspense } from 'react';
import type { ModelViewerHandle, ModelViewerProps } from './ModelViewer';

const ModelViewerComponent = lazy(() => import('./ModelViewer').then(module => ({ default: module.ModelViewer })));

export const LazyModelViewer = forwardRef<ModelViewerHandle, ModelViewerProps>(function LazyModelViewer(props, ref) {
  return (
    <Suspense fallback={<ModelViewerLoading minHeight={props.minHeight || 420} />}>
      <ModelViewerComponent {...props} ref={ref} />
    </Suspense>
  );
});

function ModelViewerLoading({ minHeight }: { minHeight: number }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-50" style={{ minHeight }}>
      <div className="h-11 w-11 animate-spin rounded-full border-4 border-blue-100 border-t-blue-500" />
      <p className="text-xs font-bold text-slate-500">正在加载三维查看器…</p>
    </div>
  );
}
