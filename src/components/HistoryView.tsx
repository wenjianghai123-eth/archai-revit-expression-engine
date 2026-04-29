import React from 'react';
import { Clock, Image as ImageIcon, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { GenerationHistoryItem, GenerationStep } from '../types';

interface HistoryViewProps {
  items: GenerationHistoryItem[];
  onReuse: (item: GenerationHistoryItem) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

const stepLabels: Record<GenerationStep, string> = {
  [GenerationStep.FloorplanTo3D]: '平面转效果图',
  [GenerationStep.LocalInpainting]: '局部修饰',
};

export function HistoryView({ items, onReuse, onDelete, onClear }: HistoryViewProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">生成记录</h1>
            <p className="mt-1 text-sm text-slate-500">本地生成历史会保存在当前浏览器中。</p>
          </div>
          {items.length > 0 && (
            <button
              onClick={onClear}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition-colors hover:text-red-600"
            >
              <XCircle className="h-4 w-4" />
              清空记录
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white p-10 text-center">
            <Clock className="mb-4 h-10 w-10 text-slate-300" />
            <h2 className="text-base font-bold text-slate-900">还没有生成记录</h2>
            <p className="mt-2 max-w-sm text-sm text-slate-500">完成一次生成后，记录会自动保存到 localStorage。</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="aspect-[16/10] bg-slate-100">
                  {item.outputImage ? (
                    <img src={item.outputImage} alt="历史生成结果" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-slate-300" />
                    </div>
                  )}
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">{stepLabels[item.step]}</span>
                      <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">{item.provider}</span>
                    </div>
                    <time className="text-[10px] font-mono text-slate-400">{item.createdAt}</time>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">{item.style}</p>
                    <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-500">{item.prompt}</p>
                    {(item.inputImageName || item.storageWarning) && (
                      <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-slate-400">
                        {item.inputImageName ? `输入: ${item.inputImageName}` : ''}
                        {item.storageWarning ? ` ${item.storageWarning}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button
                      onClick={() => onReuse(item)}
                      disabled={!item.outputImage}
                      className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-black disabled:opacity-40"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      打开结果
                    </button>
                    <button
                      onClick={() => onDelete(item.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors hover:text-red-600"
                      title="删除记录"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
