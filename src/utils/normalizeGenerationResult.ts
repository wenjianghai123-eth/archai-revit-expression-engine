import type { GenerationJobPhase, StepState } from '../types';
import { normalizeGenerationViewerImages } from './normalizeGenerationViewerImages';

export type GenerationTaskStatus =
  | 'idle'
  | 'submitting'
  | 'queued'
  | 'processing'
  | 'generating'
  | 'saving'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface NormalizedGenerationResult {
  originalImageUrl: string | null;
  originalAssetId?: string | null;
  resultImageUrl: string | null;
  resultAssetId?: string | null;
  taskId: string | null;
  status: GenerationTaskStatus;
  progress: number | null;
  progressLabel: string;
  errorMessage: string | null;
  resultFilename?: string;
}

export interface NormalizeStepGenerationResultOptions {
  originalImageUrl?: string | null;
  originalAssetId?: string | null;
  resultImageUrl?: string | null;
  resultAssetId?: string | null;
  resultFilename?: string;
}

export function normalizeStepGenerationResult(
  state: StepState,
  options: NormalizeStepGenerationResultOptions = {},
): NormalizedGenerationResult {
  const selectedResult = state.generationResults.find(result => result.id === state.selectedGenerationResultId)
    || state.generationResults.find(result => result.isSelected)
    || state.generationResults[0]
    || null;
  const images = normalizeGenerationViewerImages({
    sourceImageUrl: options.originalImageUrl,
    sourceImageAssetId: options.originalAssetId || state.inputImage?.assetId,
    inputImageUrl: state.inputImage?.previewUrl
      || state.inputImage?.publicUrl
      || state.inputImage?.url
      || state.inputImage?.thumbnailUrl
      || state.inputImage?.dataUrl,
    resultImageUrl: options.resultImageUrl,
    resultImageAssetId: options.resultAssetId,
    result: selectedResult,
    outputImageUrl: state.outputImage,
  });
  const status = normalizeGenerationTaskStatus({
    phase: state.generationJobDiagnostics?.phase,
    jobStatus: state.generationJobStatus,
    generationStatus: state.generationStatus,
    isGenerating: state.isGenerating,
  });
  const hasMeasuredProgress = Boolean(state.generationJobId)
    || status === 'completed'
    || status === 'failed'
    || status === 'cancelled';

  return {
    originalImageUrl: images.sourceImageUrl || null,
    originalAssetId: images.sourceImageAssetId || options.originalAssetId || null,
    resultImageUrl: images.resultImageUrl || null,
    resultAssetId: images.resultImageAssetId || options.resultAssetId || null,
    taskId: state.generationJobId,
    status,
    progress: hasMeasuredProgress ? clampProgress(state.generationProgress) : null,
    progressLabel: readGenerationProgressLabel(status),
    errorMessage: state.generationError,
    resultFilename: options.resultFilename,
  };
}

export function normalizeGenerationTaskStatus(input: {
  phase?: GenerationJobPhase | null;
  jobStatus?: StepState['generationJobStatus'];
  generationStatus?: StepState['generationStatus'];
  isGenerating?: boolean;
}): GenerationTaskStatus {
  if (input.jobStatus === 'cancelled') return 'cancelled';
  if (input.jobStatus === 'failed' || input.jobStatus === 'timeout' || input.phase === 'failed' || input.phase === 'timeout') return 'failed';
  if (input.jobStatus === 'succeeded' || input.phase === 'succeeded' || input.generationStatus === 'success') return 'completed';
  if (input.phase === 'save-result') return 'saving';
  if (input.phase === 'provider-request') return 'generating';
  if (input.phase === 'prepare-input' || input.phase === 'postprocess') return 'processing';
  if (input.jobStatus === 'queued' || input.phase === 'queued') return 'queued';
  if (input.jobStatus === 'running') return 'generating';
  if (input.generationStatus === 'uploading') return 'submitting';
  if (input.generationStatus === 'generating' || input.isGenerating) return 'generating';
  if (input.generationStatus === 'error') return 'failed';
  return 'idle';
}

export function readGenerationProgressLabel(status: GenerationTaskStatus): string {
  if (status === 'submitting') return '正在提交任务';
  if (status === 'queued') return '任务排队中';
  if (status === 'processing') return '正在分析输入内容';
  if (status === 'generating') return '正在生成结果';
  if (status === 'saving') return '正在保存生成结果';
  if (status === 'completed') return '生成完成';
  if (status === 'failed') return '生成失败';
  if (status === 'cancelled') return '任务已取消';
  return '等待提交';
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
