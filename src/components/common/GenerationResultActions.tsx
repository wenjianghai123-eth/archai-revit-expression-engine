import { Download, Eye, ImageIcon, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import type { NormalizedGenerationResult } from '../../utils/normalizeGenerationResult';
import { downloadImageFile } from '../../utils/downloadImageFile';
import { useFullscreenImageViewer } from './FullscreenImageViewer';

export interface GenerationResultActionsProps {
  result: NormalizedGenerationResult;
  featureName: string;
  projectName?: string | null;
  compact?: boolean;
  className?: string;
}

export function GenerationResultActions({ result, featureName, projectName, compact = false, className = '' }: GenerationResultActionsProps) {
  const { openImageViewer } = useFullscreenImageViewer();
  const [isDownloading, setIsDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const buttonClassName = `inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 ${compact ? 'h-8 px-2 text-[11px]' : 'h-10 px-3 text-xs'}`;

  const saveResult = async () => {
    if ((!result.resultImageUrl && !result.resultAssetId) || isDownloading) return;
    setIsDownloading(true);
    setMessage(null);
    try {
      await downloadImageFile({
        imageUrl: result.resultImageUrl,
        assetId: result.resultAssetId,
        filename: result.resultFilename,
        featureName,
        projectName,
      });
      setMessage('已开始保存文件');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败，请稍后重试。');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button
          type="button"
          title={result.originalImageUrl ? '全屏查看原始图片' : '暂无原始图片'}
          disabled={!result.originalImageUrl}
          onClick={() => result.originalImageUrl && openImageViewer({ imageUrl: result.originalImageUrl, title: `${featureName} · 原始图片`, imageType: 'original' })}
          className={buttonClassName}
        ><ImageIcon className="h-3.5 w-3.5" />查看原图</button>
        <button
          type="button"
          title={result.resultImageUrl ? '全屏查看生成结果' : '生成完成后可查看结果'}
          disabled={!result.resultImageUrl}
          onClick={() => result.resultImageUrl && openImageViewer({ imageUrl: result.resultImageUrl, title: `${featureName} · 生成结果`, imageType: 'result' })}
          className={buttonClassName}
        ><Eye className="h-3.5 w-3.5" />查看结果图</button>
        <button
          type="button"
          title={result.resultImageUrl || result.resultAssetId ? '下载当前结果到本地' : '生成完成后可保存结果'}
          disabled={(!result.resultImageUrl && !result.resultAssetId) || isDownloading}
          onClick={() => void saveResult()}
          className={buttonClassName}
        >{isDownloading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}保存文件</button>
      </div>
      {message ? <p className={`mt-1.5 text-[11px] font-semibold ${message.includes('失败') || message.includes('暂无') ? 'text-rose-700' : 'text-emerald-700'}`}>{message}</p> : null}
      {!result.resultImageUrl && !result.resultAssetId ? <p className="mt-1.5 text-[11px] text-slate-500">生成完成后可查看和保存结果。</p> : null}
    </div>
  );
}
