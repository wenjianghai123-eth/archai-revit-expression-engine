import { GenerationStep } from '../types';

export interface SafetyPrecheckResult {
  blocked: boolean;
  matchedTerms: string[];
  message: string;
}

export interface ImageSafetyNotice {
  warningLevel: 'info' | 'caution';
  matchedTerms: string[];
  message: string;
}

export function precheckGenerationExtraPrompt(_input: {
  extraPrompt: string;
  step?: GenerationStep;
}): SafetyPrecheckResult {
  return {
    blocked: false,
    matchedTerms: [],
    message: '',
  };
}

export function buildImageSafetyNotice(_input: {
  imageName?: string;
  role?: 'source_scene' | 'object_reference' | 'reference_image';
}): ImageSafetyNotice | null {
  return null;
}

export function formatSafetyRejectedMessage(): string {
  return 'AI 平台安全策略拒绝了本次生成。请根据平台返回原因调整输入图片或描述后重试。';
}

export function isSafetyRejectedText(value: string | undefined): boolean {
  if (!value) return false;
  return /safety|safe\s*ty|policy|moderation|violation|rejected|blocked|unsafe|sensitive|违规|安全策略|内容审核|拒绝/iu.test(value);
}
