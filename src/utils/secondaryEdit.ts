import { GenerationConfig, GenerationStep, ResultSendTargetStep, SecondaryEditAction } from '../types';

export const secondaryEditActions: Array<{ action: SecondaryEditAction; label: string; shortLabel: string }> = [
  { action: 'regenerate', label: '重新生成', shortLabel: '重生' },
  { action: 'similar', label: '生成类似方案', shortLabel: '类似' },
  { action: 'realism', label: '增强真实感', shortLabel: '真实' },
  { action: 'lighting', label: '调整灯光', shortLabel: '灯光' },
  { action: 'style', label: '替换风格', shortLabel: '风格' },
  { action: 'continue-edit', label: '作为新输入图继续编辑', shortLabel: '继续' },
];

export const materialRepairActions: Array<{ action: SecondaryEditAction; label: string; shortLabel: string }> = [
  { action: 'material-clean-boundary', label: '边界更干净', shortLabel: '净边' },
  { action: 'material-smaller-texture', label: '纹理缩小', shortLabel: '纹理小' },
  { action: 'material-larger-texture', label: '纹理放大', shortLabel: '纹理大' },
  { action: 'material-less-reflection', label: '减少反光', shortLabel: '降反光' },
  { action: 'material-keep-lighting', label: '保持原光照', shortLabel: '原光照' },
  { action: 'material-selected-area-only', label: '只改选中区域', shortLabel: '只选区' },
];

export const resultSendTargets: Array<{ step: ResultSendTargetStep; label: string; shortLabel: string }> = [
  { step: GenerationStep.MaterialReplace, label: '发送到材质替换', shortLabel: '材质替换' },
  { step: GenerationStep.ObjectInsert, label: '发送到元素植入', shortLabel: '元素植入' },
  { step: GenerationStep.DesignVariants, label: '基于此图做方案变体', shortLabel: '方案变体' },
  { step: GenerationStep.FreeReferenceImage, label: '发送到自由参考生图', shortLabel: '自由参考' },
];

export const secondaryEditActionLabels: Record<SecondaryEditAction, string> = Object.fromEntries(
  [...secondaryEditActions, ...materialRepairActions].map(item => [item.action, item.label]),
) as Record<SecondaryEditAction, string>;

export const continuationActionLabels: Record<string, string> = {
  ...secondaryEditActionLabels,
  ...Object.fromEntries(resultSendTargets.map(item => [`send-to-${item.step}`, item.label])),
};

const actionInstructions: Record<SecondaryEditAction, string> = {
  regenerate: '以当前结果图为输入重新生成一版，保留主要构图、空间关系和设计方向，优化画面完成度。',
  similar: '基于当前结果图生成类似方案，保留空间结构、视角和核心设计语言，做轻微构图与材质变化。',
  realism: '增强真实感，提升材质纹理、反射、阴影、尺度和摄影质感，避免过度风格化。',
  lighting: '重新调整灯光层次和氛围，优化主光、辅光、阴影、色温与空间明暗关系。',
  style: '在保留结构和视角的基础上替换为新的设计风格，增强风格一致性。',
  'continue-edit': '将当前结果作为新的输入继续编辑，保留主体结构并根据当前参数继续优化。',
  'material-clean-boundary': '让材质替换边界更干净，边缘贴合原物体轮廓，避免溢出、糊边、脏边和影响未选区域。',
  'material-smaller-texture': '将当前材质纹理比例缩小，纹理更细密、更符合真实尺度，保持原铺贴方向和整体设计不变。',
  'material-larger-texture': '将当前材质纹理比例放大，纹理更舒展、更清晰，避免过密重复，保持原铺贴方向和整体设计不变。',
  'material-less-reflection': '减少表面反光和高光强度，降低镜面感，让材质更自然、更柔和，并保留原始光照方向。',
  'material-keep-lighting': '严格保持原图光照、阴影、明暗层次和色温，只优化材质本身，不重新打光。',
  'material-selected-area-only': '只修改选中或目标区域，未选区域、周边物体、家具、结构和背景必须保持不变。',
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
  } else if (action === 'material-clean-boundary') {
    patch.changeStrength = 'weak';
    patch.preserveStructure = true;
    patch.preserveGeometry = true;
  } else if (action === 'material-smaller-texture') {
    patch.materialPatternScale = 'small';
    patch.changeStrength = 'weak';
    patch.preserveGeometry = true;
  } else if (action === 'material-larger-texture') {
    patch.materialPatternScale = 'large';
    patch.changeStrength = 'weak';
    patch.preserveGeometry = true;
  } else if (action === 'material-less-reflection') {
    patch.materialFinish = 'matte';
    patch.preserveLighting = true;
    patch.changeStrength = 'weak';
  } else if (action === 'material-keep-lighting') {
    patch.preserveLighting = true;
    patch.changeStrength = 'weak';
  } else if (action === 'material-selected-area-only') {
    patch.materialReplaceScope = 'material-only';
    patch.preserveGeometry = true;
    patch.changeStrength = 'weak';
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
