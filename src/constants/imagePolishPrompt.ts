import type { ImagePolishControlLevel, ImagePolishControls, ImagePolishMode } from '../types';

export const IMAGE_POLISH_MODE_OPTIONS: Array<{
  value: ImagePolishMode;
  label: string;
  description: string;
}> = [
  {
    value: 'conservative',
    label: '保守提质',
    description: '只优化清晰度、噪点、光影、阴影与边缘，不新增内容、不换材质、不改颜色。',
  },
  {
    value: 'white-model-materialization',
    label: '白模材质化',
    description: '为白模合理补全材质与光影，同时锁定结构、镜头、构图和主要家具位置。',
  },
];

export const IMAGE_POLISH_CONTROL_OPTIONS: Array<{
  key: keyof ImagePolishControls;
  label: string;
  description: string;
}> = [
  { key: 'clarity', label: '清晰度', description: '提升细节可读性与边缘干净度' },
  { key: 'lightingOptimization', label: '光影优化', description: '自然化环境光与明暗过渡' },
  { key: 'materialDetail', label: '材质细节', description: '增强已有材质或白模材质表现' },
  { key: 'removeModelFeel', label: '去模型感', description: '减少灰模感、塑料感和未完成感' },
  { key: 'colorPreservation', label: '色彩保持', description: '锁定原图的色相与色彩关系' },
  { key: 'structurePreservation', label: '结构保持', description: '锁定结构、镜头、透视和构图' },
  { key: 'denoise', label: '降噪', description: '减少噪点、脏点与压缩伪影' },
  { key: 'shadow', label: '阴影', description: '优化接触阴影与空间层次' },
  { key: 'reflection', label: '反射', description: '优化玻璃、金属等已有表面的反射' },
];

export const IMAGE_POLISH_CONTROL_LEVEL_OPTIONS: Array<{ value: ImagePolishControlLevel; label: string }> = [
  { value: 'off', label: '关闭' },
  { value: 'low', label: '轻度' },
  { value: 'medium', label: '适中' },
  { value: 'high', label: '加强' },
];

export const DEFAULT_IMAGE_POLISH_CONTROLS: Record<ImagePolishMode, ImagePolishControls> = {
  conservative: {
    clarity: 'medium',
    lightingOptimization: 'medium',
    materialDetail: 'low',
    removeModelFeel: 'low',
    colorPreservation: 'high',
    structurePreservation: 'high',
    denoise: 'medium',
    shadow: 'medium',
    reflection: 'low',
  },
  'white-model-materialization': {
    clarity: 'high',
    lightingOptimization: 'high',
    materialDetail: 'high',
    removeModelFeel: 'high',
    colorPreservation: 'medium',
    structurePreservation: 'high',
    denoise: 'medium',
    shadow: 'high',
    reflection: 'medium',
  },
};

const CONTROL_PROMPT_LABELS: Record<keyof ImagePolishControls, string> = {
  clarity: '清晰度',
  lightingOptimization: '光影优化',
  materialDetail: '材质细节',
  removeModelFeel: '去模型感',
  colorPreservation: '色彩保持',
  structurePreservation: '结构保持',
  denoise: '降噪',
  shadow: '阴影优化',
  reflection: '反射优化',
};

const CONTROL_LEVEL_PROMPTS: Record<ImagePolishControlLevel, string> = {
  off: '关闭，不执行该项增强',
  low: '轻度处理，变化必须克制',
  medium: '适中处理，保持自然且不过度',
  high: '重点处理，但不得突破模式的硬性边界',
};

export const IMAGE_POLISH_PROMPT = `执行“保守提质”。这不是重新渲染、重新设计或材质替换。
只允许提升清晰度、降噪、光影自然度、阴影、边缘洁净度和轻度真实感。
必须保留原图的结构、相机、透视、构图、画幅、家具位置、材质身份和颜色关系。
严禁新增人物、绿植、家具、装饰物或建筑构件；严禁替换材质、改变颜色或移动任何主要元素。`;

export const IMAGE_POLISH_NEGATIVE_PROMPT = '禁止新增人物、绿植、家具、装饰物和建筑构件；禁止替换材质、改变颜色、改变结构、改变镜头、改变透视、改变构图、改变画幅、移动家具、重新设计、过度渲染、文字、水印、logo、拼贴、卡通化、插画化。';

export const IMAGE_POLISH_DEFAULT_PROMPT = IMAGE_POLISH_PROMPT;
export const IMAGE_POLISH_DEFAULT_NEGATIVE_PROMPT = IMAGE_POLISH_NEGATIVE_PROMPT;

export const IMAGE_POLISH_MATERIAL_ENHANCE_PROMPT = `执行“白模材质化”。允许根据白模、灰模和已有设计线索合理补全真实材质、自然光影、阴影与反射。
必须严格锁定原始空间结构、建筑构件、相机视角、透视、画幅、构图和主要家具位置，不得重新设计空间。
不得新增人物、绿植、家具或与原设计无关的装饰；不得移动、删除或替换主要家具和建筑元素。`;

export const IMAGE_POLISH_MATERIAL_ENHANCE_NEGATIVE_PROMPT = '禁止改变空间结构、建筑构件、相机角度、透视、构图和画幅；禁止移动或删除主要家具；禁止新增人物、绿植、家具和无关装饰；禁止重新设计、错误阴影、过曝、低清晰度、文字、水印、logo、拼贴、卡通化、插画化。';

export interface ImagePolishPromptInput {
  mode?: ImagePolishMode;
  controls?: Partial<ImagePolishControls> | null;
  enhanceMaterials?: boolean;
}

export function resolveImagePolishMode(value: unknown, enhanceMaterials = false): ImagePolishMode {
  if (value === 'conservative' || value === 'white-model-materialization') return value;
  return enhanceMaterials ? 'white-model-materialization' : 'conservative';
}

export function resolveImagePolishControls(
  value: unknown,
  mode: ImagePolishMode,
): ImagePolishControls {
  const defaults = DEFAULT_IMAGE_POLISH_CONTROLS[mode];
  if (!isRecord(value)) return { ...defaults };
  const controls = Object.fromEntries(
    (Object.keys(defaults) as Array<keyof ImagePolishControls>).map(key => [
      key,
      isImagePolishControlLevel(value[key]) ? value[key] : defaults[key],
    ]),
  ) as unknown as ImagePolishControls;
  if (controls.structurePreservation === 'off') controls.structurePreservation = defaults.structurePreservation;
  if (mode === 'conservative' && controls.colorPreservation === 'off') controls.colorPreservation = defaults.colorPreservation;
  return controls;
}

export function resolveImagePolishPrompts(
  input: boolean | ImagePolishPromptInput = false,
): { prompt: string; negativePrompt: string; mode: ImagePolishMode; controls: ImagePolishControls } {
  const normalizedInput = typeof input === 'boolean' ? { enhanceMaterials: input } : input;
  const mode = resolveImagePolishMode(normalizedInput.mode, normalizedInput.enhanceMaterials === true);
  const controls = resolveImagePolishControls(normalizedInput.controls, mode);
  const basePrompt = mode === 'white-model-materialization'
    ? IMAGE_POLISH_MATERIAL_ENHANCE_PROMPT
    : IMAGE_POLISH_DEFAULT_PROMPT;
  const negativePrompt = mode === 'white-model-materialization'
    ? IMAGE_POLISH_MATERIAL_ENHANCE_NEGATIVE_PROMPT
    : IMAGE_POLISH_DEFAULT_NEGATIVE_PROMPT;
  const controlPrompt = (Object.keys(controls) as Array<keyof ImagePolishControls>)
    .map(key => `- ${CONTROL_PROMPT_LABELS[key]}：${CONTROL_LEVEL_PROMPTS[controls[key]]}。`)
    .join('\n');
  const hardBoundary = mode === 'white-model-materialization'
    ? '最终硬性约束：只补全材质和光影表达；结构、相机、透视、构图、画幅及主要家具位置必须与输入图一致。'
    : '最终硬性约束：不得新增人物、绿植、家具或装饰，不得替换材质，不得改变颜色，不得改变结构、相机、透视、构图或画幅。';

  return {
    mode,
    controls,
    prompt: `${basePrompt}\n\n本次控制强度：\n${controlPrompt}\n\n${hardBoundary}`,
    negativePrompt,
  };
}

function isImagePolishControlLevel(value: unknown): value is ImagePolishControlLevel {
  return value === 'off' || value === 'low' || value === 'medium' || value === 'high';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
