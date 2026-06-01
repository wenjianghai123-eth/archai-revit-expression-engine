import { GenerationConfig, GenerationStep, SecondaryEditAction } from '../types';

export const secondaryEditActions: Array<{ action: SecondaryEditAction; label: string; shortLabel: string }> = [
  { action: 'regenerate', label: '重新生成', shortLabel: '重生' },
  { action: 'similar', label: '生成类似方案', shortLabel: '类似' },
  { action: 'realism', label: '增强真实感', shortLabel: '真实' },
  { action: 'lighting', label: '调整灯光', shortLabel: '灯光' },
  { action: 'style', label: '替换风格', shortLabel: '风格' },
  { action: 'continue-edit', label: '作为新输入图继续编辑', shortLabel: '继续' },
];

export const secondaryEditActionLabels: Record<SecondaryEditAction, string> = Object.fromEntries(
  secondaryEditActions.map(item => [item.action, item.label]),
) as Record<SecondaryEditAction, string>;

const actionInstructions: Record<SecondaryEditAction, string> = {
  regenerate: '以当前结果图为输入重新生成一版，保留主要构图、空间关系和设计方向，优化画面完成度。',
  similar: '基于当前结果图生成类似方案，保留空间结构、视角和核心设计语言，做轻微构图与材质变化。',
  realism: '增强真实感，提升材质纹理、反射、阴影、尺度和摄影质感，避免过度风格化。',
  lighting: '重新调整灯光层次和氛围，优化主光、辅光、阴影、色温与空间明暗关系。',
  style: '在保留结构和视角的基础上替换为新的设计风格，增强风格一致性。',
  'continue-edit': '将当前结果作为新的输入继续编辑，保留主体结构并根据当前参数继续优化。',
};

export function buildSecondaryEditConfigPatch(
  step: GenerationStep,
  config: GenerationConfig,
  action: SecondaryEditAction,
): Partial<GenerationConfig> {
  const instruction = actionInstructions[action];
  const patch: Partial<GenerationConfig> = {
    preserveStructure: config.preserveStructure ?? true,
  };

  if (action === 'similar') {
    patch.changeStrength = 'weak';
    patch.panoramaChangeStrength = 'weak';
    patch.preserveCamera = config.preserveCamera ?? true;
  } else if (action === 'realism') {
    patch.qualityMode = 'high';
    patch.materialStrength = Math.max(config.materialStrength || 0.8, 0.9);
    patch.changeStrength = 'medium';
    patch.panoramaChangeStrength = 'medium';
  } else if (action === 'lighting') {
    patch.lighting = '层次丰富的真实灯光';
    patch.atmosphere = '优化灯光氛围';
    patch.changeStrength = 'medium';
    patch.panoramaChangeStrength = 'medium';
    patch.preserveLighting = false;
  } else if (action === 'style') {
    patch.changeStrength = 'strong';
    patch.panoramaChangeStrength = 'strong';
    patch.preserveCamera = config.preserveCamera ?? true;
  } else if (action === 'continue-edit') {
    patch.changeStrength = config.changeStrength || 'medium';
    patch.panoramaChangeStrength = config.panoramaChangeStrength || config.changeStrength || 'medium';
  } else {
    patch.changeStrength = 'medium';
    patch.panoramaChangeStrength = config.panoramaChangeStrength || 'medium';
  }

  const supplementalKey = readSupplementalPromptKey(step);
  patch[supplementalKey] = appendSecondaryInstruction(String(config[supplementalKey] || ''), instruction);
  return patch;
}

function readSupplementalPromptKey(step: GenerationStep): 'prompt' | 'customPrompt' | 'customMaterialPrompt' {
  if (step === GenerationStep.MaterialReplace) return 'customMaterialPrompt';
  if (
    step === GenerationStep.ModelSnapshotRender ||
    step === GenerationStep.DesignVariants ||
    step === GenerationStep.PlanColorize ||
    step === GenerationStep.PanoramaQuickRender
  ) {
    return 'customPrompt';
  }
  return 'prompt';
}

function appendSecondaryInstruction(currentPrompt: string, instruction: string): string {
  const addition = `二次编辑：${instruction}`;
  const trimmed = currentPrompt.trim();
  if (!trimmed) return addition;
  if (trimmed.includes(instruction)) return currentPrompt;
  return `${trimmed}\n${addition}`;
}
