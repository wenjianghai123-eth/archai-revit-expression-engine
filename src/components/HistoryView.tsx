import React from 'react';
import { Clock, Download, Image as ImageIcon, Loader2, RotateCcw, Trash2, XCircle } from 'lucide-react';
import { GenerationHistoryItem, GenerationStep } from '../types';
import { buildResultImageFilename, downloadAsset, downloadFallbackMessage } from '../utils/downloadAsset';
import { getOriginalResultAssetId, getOriginalResultImageUrl } from '../utils/resultImage';
import { ResultCard } from './common/ResultCard';

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
  [GenerationStep.ObjectInsert]: '元素植入',
  [GenerationStep.FreeReferenceImage]: '自由参考生图',
  [GenerationStep.ImagePolish]: '质感提升',
};

export function HistoryView({ items, onReuse, onDelete, onClear }: HistoryViewProps) {
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = React.useState<string | null>(null);

  const handleDownload = async (item: GenerationHistoryItem) => {
    if (!readHistoryOutputImage(item) || downloadingId) return;
    setDownloadingId(item.id);
    setDownloadError(null);
    setDownloadMessage(null);
    try {
      const selectedResult = item.generationResults?.find(result => result.isSelected) || item.generationResults?.[0];
      const imageUrl = getOriginalResultImageUrl(selectedResult, item.outputImage);
      const assetId = getOriginalResultAssetId(selectedResult);
      await downloadAsset({
        url: imageUrl,
        assetId,
      }, buildResultImageFilename({
        projectName: item.projectName || item.projectId || 'archai-project',
        featureLabel: item.step === GenerationStep.ObjectInsert ? '元素植入' : stepLabels[item.step] || 'AI生成',
      }));
      setDownloadMessage('已开始下载');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setDownloadError(message === downloadFallbackMessage ? downloadFallbackMessage : '下载失败，请稍后重试');
    } finally {
      setDownloadingId(null);
    }
  };

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
          <div className="result-grid">
            {items.map((item) => (
              <ResultCard
                key={item.id}
                image={readHistoryOutputImage(item)}
                sourceImage={item.inputImageUrl || item.inputImageDataPreview}
                imageAssetId={getOriginalResultAssetId(item.generationResults?.find(result => result.isSelected) || item.generationResults?.[0])}
                sourceImageAssetId={item.inputImageAssetId}
                title={item.style}
                subtitle={item.prompt}
                status={<span className="arch-pill uppercase">{item.provider}</span>}
                aspectRatio={item.step === GenerationStep.PanoramaQuickRender ? '2:1' : '16:9'}
                featureName={stepLabels[item.step] || item.style}
                step={item.step}
                actions={(
                  <>
                    <button onClick={() => onReuse(item)} disabled={!readHistoryOutputImage(item)} className="flex-1 bg-slate-900 text-white">
                      <RotateCcw className="h-3.5 w-3.5" />打开结果
                    </button>
                    <button onClick={() => void handleDownload(item)} disabled={!readHistoryOutputImage(item) || Boolean(downloadingId)} className="border border-slate-200 bg-white text-slate-600">
                      {downloadingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      保存
                    </button>
                    <button onClick={() => onDelete(item.id)} className="border border-slate-200 bg-white text-rose-500" title="删除记录">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="arch-pill bg-blue-50 text-blue-700">{stepLabels[item.step] || '方案变体'}</span>
                      {item.step === GenerationStep.ObjectInsert && readObjectInsertPlacementModeLabel(item) ? (
                        <span className="arch-pill">{readObjectInsertPlacementModeLabel(item)}</span>
                      ) : null}
                      <span className="arch-pill uppercase">{item.provider}</span>
                    </div>
                    <time className="text-[10px] font-mono text-slate-400">{item.createdAt}</time>
                  </div>
                  {(item.inputImageName || item.storageWarning) && (
                      <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-slate-400">
                        {item.inputImageName ? `输入: ${item.inputImageName}` : ''}
                        {item.storageWarning ? ` ${item.storageWarning}` : ''}
                      </p>
                    )}
                  {downloadMessage && downloadingId === null ? <p className="text-xs font-semibold text-emerald-700">{downloadMessage}</p> : null}
                  {downloadError ? <p className="text-xs font-semibold text-amber-700">{downloadError}</p> : null}
              </ResultCard>
            ))}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}

function readHistoryOutputImage(item: GenerationHistoryItem): string | null {
  const selectedResult = item.generationResults?.find(result => result.isSelected) || item.generationResults?.[0];
  return getOriginalResultImageUrl(selectedResult, item.outputImage);
}

function readObjectInsertPlacementModeLabel(item: GenerationHistoryItem): string | null {
  const value = item.config?.objectInsert?.placementMode || item.config?.placementMode;
  if (value === 'strict') return '精确摆放';
  if (value === 'natural') return '自然摆放';
  return null;
}
