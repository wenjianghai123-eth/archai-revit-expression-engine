import { useMemo, useState } from 'react';
import { AlertCircle, ImageIcon } from 'lucide-react';
import { listPanoramaRecords } from '../storage/panoramas';
import { PanoramaRecord } from '../types';
import { PanoramaViewer } from './PanoramaViewer';

interface PanoramaSharePageProps {
  shareId: string;
}

export function PanoramaSharePage({ shareId }: PanoramaSharePageProps) {
  const record = useMemo(() => findPanoramaRecord(shareId) || readFallbackRecordFromUrl(shareId), [shareId]);
  const [previewMode, setPreviewMode] = useState<'360' | 'image'>('360');
  const imageUrl = record?.renderedPanoramaUrl || record?.panoramaUrl || '';

  if (!record || !imageUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-4 text-xl font-bold text-slate-950">全景分享不可用</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            没有找到对应的全景记录。本地模式下分享页依赖当前浏览器保存的记录；如果需要跨设备访问，请使用项目分享或后续云端全景存储。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-200">ArchAI Panorama</p>
          <h1 className="mt-1 text-xl font-bold">漫游全景分享</h1>
          <p className="mt-1 text-xs text-slate-400">创建时间：{formatDate(record.createdAt)}</p>
        </div>
        <div className="inline-flex rounded-xl bg-white/10 p-1 text-sm font-bold">
          <button type="button" onClick={() => setPreviewMode('360')} className={`rounded-lg px-3 py-2 ${previewMode === '360' ? 'bg-white text-slate-950' : 'text-slate-300'}`}>
            360预览
          </button>
          <button type="button" onClick={() => setPreviewMode('image')} className={`rounded-lg px-3 py-2 ${previewMode === 'image' ? 'bg-white text-slate-950' : 'text-slate-300'}`}>
            普通图片
          </button>
        </div>
      </header>

      <main className="p-4">
        {previewMode === '360' ? (
          <PanoramaViewer imageUrl={imageUrl} className="h-[calc(100vh-132px)] min-h-[520px] rounded-2xl" minHeight={520} />
        ) : (
          <div className="mx-auto max-w-7xl overflow-hidden rounded-2xl border border-white/10 bg-black">
            <img src={imageUrl} alt="全景普通图片" className="w-full object-contain" />
          </div>
        )}
      </main>

      <div className="fixed bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-2 text-xs font-bold text-white backdrop-blur">
        <ImageIcon className="h-3.5 w-3.5" />
        拖拽环视，滚轮或双指缩放
      </div>
    </div>
  );
}

function findPanoramaRecord(shareId: string): PanoramaRecord | null {
  return listPanoramaRecords().find(record => record.shareId === shareId) || null;
}

function readFallbackRecordFromUrl(shareId: string): PanoramaRecord | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const imageUrl = params.get('image');
  if (!imageUrl) return null;
  return {
    id: `shared-${shareId}`,
    modelUrl: '',
    cameraState: {},
    panoramaUrl: imageUrl,
    thumbnailUrl: imageUrl,
    shareId,
    createdAt: params.get('createdAt') || new Date().toISOString(),
  };
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}
