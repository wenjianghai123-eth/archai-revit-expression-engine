import { GenerationStep, StepState, UploadedImage } from '../../types';

export const maxMaterialTextures = 3;
export const maxFurnitureReferences = 3;
export const styleOptions = ['现代主义', '极简风格', '北欧风格', '日式侘寂', '工业风格', '新中式'];

export function modeLabel(step: GenerationStep): string {
  if (step === GenerationStep.ImagePolish) return '质感提升';
  if (step === GenerationStep.FloorplanTo3D) return '平面生成';
  if (step === GenerationStep.StyleRender) return '风格渲染';
  if (step === GenerationStep.ModelSnapshotRender) return '白模快渲';
  if (step === GenerationStep.DesignVariants) return '方案变体';
  if (step === GenerationStep.PlanColorize) return '图纸智能表达';
  if (step === GenerationStep.MaterialReplace) return '材质软装替换';
  if (step === GenerationStep.PanoramaQuickRender) return '漫游全景快渲';
  if (step === GenerationStep.ObjectInsert) return '元素植入';
  if (step === GenerationStep.FreeReferenceImage) return '自由参考生图';
  return '局部重绘';
}

export function readGenerationStatusLabel(
  phase: StepState['generationJobDiagnostics'] extends infer D ? D extends { phase?: infer P } ? P : never : never,
  jobStatus: StepState['generationJobStatus'],
  generationStatus: StepState['generationStatus'],
): string {
  if (phase === 'prepare-input') return '准备输入中';
  if (phase === 'provider-request') return '正在调用 AI 生成';
  if (phase === 'postprocess') return '正在后处理图片';
  if (phase === 'save-result') return '正在保存结果';
  if (phase === 'succeeded') return '已完成';
  if (phase === 'failed') return '生成失败';
  if (phase === 'cancelled') return '已取消';
  if (jobStatus === 'queued') return '准备输入中';
  if (jobStatus === 'running') return '正在调用 AI 生成';
  if (jobStatus === 'succeeded') return '已完成';
  if (jobStatus === 'failed') return '生成失败';
  if (jobStatus === 'cancelled') return '已取消';
  if (generationStatus === 'uploading') return '准备输入中';
  if (generationStatus === 'generating') return '正在调用 AI 生成';
  if (generationStatus === 'success') return '已完成';
  if (generationStatus === 'error') return '生成失败';
  return '待生成';
}

export function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function isLocalInpaintingStep(step: GenerationStep): boolean {
  return step === GenerationStep.LocalInpainting || step === GenerationStep.MaterialReplace;
}

export function getUploadedImageSrc(image: UploadedImage): string {
  return image.url || image.dataUrl;
}

export function getDataUrlExtension(dataUrl: string): string {
  const mimeType = /^data:([^;,]+)/u.exec(dataUrl)?.[1];
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/svg+xml') return 'svg';
  return 'png';
}
