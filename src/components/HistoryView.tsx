import React from 'react';
import { Clock, Image as ImageIcon, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { GenerationHistoryItem, GenerationStep } from '../types';

interface HistoryViewProps {
  items: GenerationHistoryItem[];
  onReuse: (item: GenerationHistoryItem) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

const stepLabels: Partial<Record<GenerationStep, string>> = {
  [GenerationStep.FloorplanTo3D]: '平面转效果图',
  [GenerationStep.StyleRender]: '风格渲染',
  [GenerationStep.LocalInpainting]: '局部修饰',
  [GenerationStep.ModelSnapshotRender]: '白模快渲',
  [GenerationStep.PlanColorize]: '图纸智能表达',
  [GenerationStep.PanoramaQuickRender]: '漫游全景快渲',
};

export function HistoryView({ items, onReuse, onDelete, onClear }: HistoryViewProps) {
  return (
    <div className="arch-page">
      <div className="arch-page-inner">
        <div className="arch-page-header flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">生成记录</h1>
            <p className="mt-1 text-sm text-slate-500">本地生成历史会保存在当前浏览器中。</p>
          </div>
          {items.length > 0 && (
            <button
              onClick={onClear}
              className="arch-button-danger text-xs"
            >
              <XCircle className="h-4 w-4" />
              清空记录
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="arch-empty flex-1">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">还没有生成记录</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">完成一次生成后，记录会自动保存到 localStorage。</p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((item) => (
              <article key={item.id} className="arch-card">
                <div className="h-32 bg-slate-100">
                  {item.outputImage ? (
                    <img src={item.outputImage} alt="历史生成结果" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-slate-300" />
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="arch-pill bg-blue-50 text-blue-700">{stepLabels[item.step] || '方案变体'}</span>
                      <span className="arch-pill uppercase">{item.provider}</span>
                    </div>
                    <time className="text-[10px] font-mono text-slate-400">{item.createdAt}</time>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">{item.style}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.prompt}</p>
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
                      className="arch-button-primary py-2 text-xs"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      打开结果
                    </button>
                    <button
                      onClick={() => onDelete(item.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-400 transition-colors hover:text-red-600"
                      title="删除记录"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}
