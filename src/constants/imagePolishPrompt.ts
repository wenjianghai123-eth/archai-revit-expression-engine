import type {
  ImagePolishControlLevel,
  ImagePolishControls,
  ImagePolishElementLevel,
  ImagePolishMode,
  ImagePolishPreserveStrictness,
} from '../types';

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
    value: 'standard',
    label: '标准提质',
    description: '轻度优化现有材质表现与真实感，但不改变材质大类、不自动补全新材质。',
  },
  {
    value: 'materialization',
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

export const IMAGE_POLISH_ELEMENT_LEVEL_OPTIONS: Array<{ value: Exclude<ImagePolishElementLevel, 'none'>; label: string }> = [
  { value: 'low', label: '少量' },
  { value: 'medium', label: '适量' },
  { value: 'high', label: '较多' },
];

export const IMAGE_POLISH_PRESERVE_STRICTNESS_OPTIONS: Array<{
  value: ImagePolishPreserveStrictness;
  label: string;
  description: string;
}> = [
  { value: 'strict', label: '严格', description: '最大限度保持原图构图、结构、视角、主要家具位置和材质身份。' },
  { value: 'standard', label: '标准', description: '保持主要空间关系，同时允许更明显的光影与质感优化。' },
  { value: 'loose', label: '宽松', description: '仍保持空间逻辑，但允许更强的氛围、细节和真实感提升。' },
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
  standard: {
    clarity: 'high',
    lightingOptimization: 'high',
    materialDetail: 'medium',
    removeModelFeel: 'medium',
    colorPreservation: 'high',
    structurePreservation: 'high',
    denoise: 'medium',
    shadow: 'medium',
    reflection: 'medium',
  },
  materialization: {
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

export interface ImagePolishOptions {
  addPeople: boolean;
  peopleLevel: ImagePolishElementLevel;
  addPlants: boolean;
  plantLevel: ImagePolishElementLevel;
  preserveStrictness: ImagePolishPreserveStrictness;
}

export const DEFAULT_IMAGE_POLISH_OPTIONS: ImagePolishOptions = {
  addPeople: false,
  peopleLevel: 'none',
  addPlants: false,
  plantLevel: 'none',
  preserveStrictness: 'strict',
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

export const IMAGE_POLISH_PROMPT = `执行“保守提质”。这不是重新渲染、重新设计、材质替换或白模材质化。只允许提升现有画面的真实感、清晰度、光影、阴影、边缘干净度和已有材质表现质量。原图是什么材质，就保持什么材质。仅提升现有材质的真实感与表现质量，不进行材质替换，不进行材质重设计，不进行白模材质化。必须保留原图的结构、相机、透视、构图、画幅、家具位置、材质身份、材质种类、材质边界和颜色关系。严禁新增材质类型，严禁自动材质化，严禁补充新的拼缝、纹理系统或装饰层次；严禁新增人物、绿植、家具、装饰物或建筑构件；严禁替换材质、改变颜色或移动任何主要元素。`;

export const IMAGE_POLISH_NEGATIVE_PROMPT = '禁止新增人物、行人、访客、工作人员、绿植、家具、装饰物和建筑构件；不要自动材质化，不要增加新的材质类型，不要新增新的拼缝，不要重新设计墙地顶材质，不要丰富材质体系，不要改变原有材质系统；禁止替换材质、改变颜色、改变结构、改变镜头、改变透视、改变构图、改变画幅、移动家具、重新设计、过度渲染、文字、水印、logo、拼贴、卡通化、插画化；people, person, pedestrian, crowd, staff, visitor。';

export const IMAGE_POLISH_DEFAULT_PROMPT = IMAGE_POLISH_PROMPT;
export const IMAGE_POLISH_DEFAULT_NEGATIVE_PROMPT = IMAGE_POLISH_NEGATIVE_PROMPT;

export const IMAGE_POLISH_STANDARD_PROMPT = `执行“标准提质”。允许轻微优化现有材质表现、清晰度、真实感、光影和阴影层次，但不得改变材质大类、材质边界、颜色体系、空间结构、镜头、透视、构图、家具位置或设备内容。不得自动材质化，不得补充全新的材质类型、拼缝系统、纹理系统或装饰层次。`;

export const IMAGE_POLISH_STANDARD_NEGATIVE_PROMPT = '禁止新增人物、行人、访客、工作人员、绿植、家具、装饰物和建筑构件；不要自动材质化，不要增加新的材质类型，不要新增新的拼缝，不要重新设计墙地顶材质，不要丰富材质体系，不要改变原有材质系统；禁止替换材质大类、改变空间结构、改变相机角度、改变透视、改变构图和画幅、移动或删除主要家具、文字、水印、logo、拼贴、卡通化、插画化；people, person, pedestrian, crowd, staff, visitor。';

export const IMAGE_POLISH_MATERIAL_ENHANCE_PROMPT = `执行“白模材质化”。允许根据白模、灰模和已有设计线索合理补全真实材质、自然光影、阴影与反射。必须严格锁定原始空间结构、建筑构件、相机视角、透视、画幅、构图和主要家具位置，不得重新设计空间。不得新增人物、绿植、家具或与原设计无关的装饰；不得移动、删除或替换主要家具和建筑元素。`;

export const IMAGE_POLISH_MATERIAL_ENHANCE_NEGATIVE_PROMPT = '禁止改变空间结构、建筑构件、相机角度、透视、构图和画幅；禁止移动或删除主要家具；禁止新增人物、行人、访客、工作人员、绿植、家具和无关装饰；禁止重新设计、错误阴影、过曝、低清晰度、文字、水印、logo、拼贴、卡通化、插画化；people, person, pedestrian, crowd, staff, visitor。';

export interface ImagePolishPromptInput {
  mode?: ImagePolishMode;
  controls?: Partial<ImagePolishControls> | null;
  enhanceMaterials?: boolean;
  addPeople?: unknown;
  peopleLevel?: unknown;
  addPlants?: unknown;
  plantLevel?: unknown;
  preserveStrictness?: unknown;
}

export function resolveImagePolishMode(value: unknown, enhanceMaterials = false): ImagePolishMode {
  if (value === 'conservative' || value === 'standard' || value === 'materialization') return value;
  if (value === 'white-model-materialization') return 'materialization';
  return enhanceMaterials ? 'materialization' : 'conservative';
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

export function resolveImagePolishOptions(value: Partial<ImagePolishOptions> | ImagePolishPromptInput | null | undefined): ImagePolishOptions {
  if (!isRecord(value)) return { ...DEFAULT_IMAGE_POLISH_OPTIONS };
  const addPeople = value.addPeople === true;
  const addPlants = value.addPlants === true;
  const rawPeopleLevel = normalizeImagePolishElementLevel(value.peopleLevel);
  const rawPlantLevel = normalizeImagePolishElementLevel(value.plantLevel);
  return {
    addPeople,
    peopleLevel: addPeople ? normalizeEnabledElementLevel(rawPeopleLevel) : 'none',
    addPlants,
    plantLevel: addPlants ? normalizeEnabledElementLevel(rawPlantLevel) : 'none',
    preserveStrictness: isImagePolishPreserveStrictness(value.preserveStrictness)
      ? value.preserveStrictness
      : DEFAULT_IMAGE_POLISH_OPTIONS.preserveStrictness,
  };
}

export function resolveImagePolishPrompts(
  input: boolean | ImagePolishPromptInput = false,
): { prompt: string; negativePrompt: string; mode: ImagePolishMode; controls: ImagePolishControls; options: ImagePolishOptions } {
  const normalizedInput = typeof input === 'boolean' ? { enhanceMaterials: input } : input;
  const mode = resolveImagePolishMode(normalizedInput.mode, normalizedInput.enhanceMaterials === true);
  const controls = resolveImagePolishControls(normalizedInput.controls, mode);
  const options = resolveImagePolishOptions(normalizedInput);
  const basePrompt = buildImagePolishBasePrompt(mode, options);
  const negativePrompt = buildImagePolishNegativePrompt(mode, options);
  const controlPrompt = (Object.keys(controls) as Array<keyof ImagePolishControls>)
    .map(key => `- ${CONTROL_PROMPT_LABELS[key]}：${CONTROL_LEVEL_PROMPTS[controls[key]]}。`)
    .join('\n');
  const hardBoundary = buildHardBoundary(mode, options);

  return {
    mode,
    controls,
    options,
    prompt: [
      basePrompt,
      '',
      '本次控制强度：',
      controlPrompt,
      '',
      buildOptionalElementPrompt(options),
      '',
      buildPreserveStrictnessPrompt(options.preserveStrictness),
      '',
      hardBoundary,
    ].join('\n'),
    negativePrompt,
  };
}

export function getPeopleLevelPrompt(value: ImagePolishElementLevel): string {
  const normalized = normalizeEnabledElementLevel(value);
  if (normalized === 'low') return '增加约3—6名人物，分布稀疏自然。';
  if (normalized === 'high') return '增加约16—25名人物，但保持动线畅通，不形成拥挤。';
  return '增加约8—15名人物，分布自然，形成适度使用氛围。';
}

function buildImagePolishBasePrompt(mode: ImagePolishMode, options: ImagePolishOptions): string {
  if (!options.addPeople && !options.addPlants) {
    if (isImagePolishMaterializationMode(mode)) {
      return IMAGE_POLISH_MATERIAL_ENHANCE_PROMPT;
    }
    if (mode === 'standard') {
      return IMAGE_POLISH_STANDARD_PROMPT;
    }
    return IMAGE_POLISH_DEFAULT_PROMPT;
  }

  const optionalBoundary = readEnabledElementBoundary(options);
  if (isImagePolishMaterializationMode(mode)) {
    return `执行“白模材质化”。允许根据白模、灰模和已有设计线索合理补全真实材质、自然光影、阴影与反射。必须严格锁定原始空间结构、建筑构件、相机视角、透视、画幅、构图和主要家具位置，不得重新设计空间。${optionalBoundary}不得移动、删除或替换主要家具和建筑元素。`;
  }
  if (mode === 'standard') {
    return `执行“标准提质”。允许轻微优化现有材质表现、清晰度、真实感、光影和阴影层次，但不得改变材质大类、材质边界、颜色体系、空间结构、镜头、透视、构图、家具位置或设备内容。不得自动材质化，不得补充全新的材质类型、拼缝系统、纹理系统或装饰层次。${optionalBoundary}严禁替换材质大类、改变颜色体系或移动任何主要元素。`;
  }

  return `执行“保守提质”。这不是重新渲染、重新设计、材质替换或白模材质化。只允许提升现有画面的真实感、清晰度、光影、阴影、边缘干净度和已有材质表现质量。原图是什么材质，就保持什么材质。仅提升现有材质的真实感与表现质量，不进行材质替换，不进行材质重设计，不进行白模材质化。必须保留原图的结构、相机、透视、构图、画幅、家具位置、材质身份、材质种类、材质边界和颜色关系。严禁新增材质类型，严禁自动材质化，严禁补充新的拼缝、纹理系统或装饰层次。${optionalBoundary}严禁替换材质、改变颜色或移动任何主要元素。`;
}

function buildOptionalElementPrompt(options: ImagePolishOptions): string {
  const lines = ['可选元素控制：'];
  if (options.addPeople) {
    lines.push(
      '- 增加人物：必须增加真实自然的人物。',
      `- 人物数量：${getPeopleLevelPrompt(options.peopleLevel)}`,
      '- 人物活动：自然行走、交谈、等候、使用空间设施，并符合空间功能的人物活动。',
      options.addPlants
        ? '- 人物和绿植是本次仅允许新增的内容。'
        : '- 人物是本次唯一允许新增的内容。',
      options.addPlants
        ? '- 保持建筑结构、空间结构、机位、家具、设备和其他非人物、非绿植区域不变。'
        : '- 保持建筑结构、空间结构、机位、家具、设备、绿植和非人物区域不变。',
    );
  } else {
    lines.push('- 增加人物：不增加；不得新增任何人物，不得出现行人、访客、工作人员或其他角色。');
  }

  if (options.addPlants) {
    lines.push(`- 增加绿植：允许新增${readElementLevelLabel(options.plantLevel)}绿植；绿植应自然融入空间，不得改变布局或遮挡关键设计。`);
  } else {
    lines.push('- 增加绿植：不增加；不得新增绿植。');
  }

  return lines.join('\n');
}

function buildPreserveStrictnessPrompt(value: ImagePolishPreserveStrictness): string {
  if (value === 'loose') {
    return '原图保持强度：宽松。仍需保持空间结构、相机视角、透视和主要布局一致，但允许更明显的真实感、氛围、材质细节和光影层次提升。';
  }
  if (value === 'standard') {
    return '原图保持强度：标准。保持主要空间关系、构图、相机视角和家具位置一致，允许自然的清晰度、光影、材质细节和真实感优化。';
  }
  return '原图保持强度：严格。最大限度保持原图结构、相机视角、透视、构图、画幅、主要家具位置、材质身份和色彩关系，只做克制提质。';
}

function buildHardBoundary(mode: ImagePolishMode, options: ImagePolishOptions): string {
  const contentLabel = options.addPeople && options.addPlants
    ? '人物和绿植增强设置新增人物和绿植'
    : options.addPeople
      ? '人物增强设置新增人物'
      : options.addPlants
        ? '绿植增强设置新增绿植'
        : '';

  if (contentLabel) {
    const preservedElements = options.addPlants
      ? '家具、设备、材质、标识和屏幕内容'
      : '家具、设备、材质、绿植、标识和屏幕内容';
    return `最终系统约束：严格保持原图建筑结构、空间关系、相机机位、透视、构图、${preservedElements}不变。仅允许按照${contentLabel}，除此之外不得新增、删除、移动或替换任何元素。`;
  }

  if (isImagePolishMaterializationMode(mode)) {
    return '最终硬性约束：只补全材质和光影表达；不得新增人物、绿植、家具或装饰；结构、相机、透视、构图、画幅及主要家具位置必须与输入图一致。';
  }
  return '最终硬性约束：不得新增人物、绿植、家具、装饰物或建筑构件；不得替换材质，不得改变颜色，不得改变结构、相机、透视、构图或画幅。';
}

function buildImagePolishNegativePrompt(mode: ImagePolishMode, options: ImagePolishOptions): string {
  if (!options.addPeople && !options.addPlants) {
    if (isImagePolishMaterializationMode(mode)) return IMAGE_POLISH_MATERIAL_ENHANCE_NEGATIVE_PROMPT;
    if (mode === 'standard') return IMAGE_POLISH_STANDARD_NEGATIVE_PROMPT;
    return IMAGE_POLISH_DEFAULT_NEGATIVE_PROMPT;
  }

  const forbidden = [
    options.addPeople ? null : '新增人物、行人、访客、工作人员',
    options.addPeople ? null : 'people, person, pedestrian, crowd, staff, visitor',
    options.addPlants ? null : '新增绿植',
    isImagePolishMaterializationMode(mode) ? null : '自动材质化',
    isImagePolishMaterializationMode(mode) ? null : '增加新的材质类型',
    isImagePolishMaterializationMode(mode) ? null : '新增新的拼缝',
    isImagePolishMaterializationMode(mode) ? null : '重新设计墙地顶材质',
    isImagePolishMaterializationMode(mode) ? null : '丰富材质体系',
    isImagePolishMaterializationMode(mode) ? null : '改变原有材质系统',
    '新增家具',
    '无关装饰',
    '改变空间结构',
    '改变建筑构件',
    '改变相机角度',
    '改变透视',
    '改变构图和画幅',
    '移动或删除主要家具',
    '重新设计',
    '错误阴影',
    '过曝',
    '低清晰度',
    '文字',
    '水印',
    'logo',
    '拼贴',
    '卡通化',
    '插画化',
  ].filter((item): item is string => Boolean(item));

  return `禁止${forbidden.join('、')}。`;
}

export function isImagePolishMaterializationMode(mode: ImagePolishMode): boolean {
  return mode === 'materialization' || mode === 'white-model-materialization';
}

function readEnabledElementBoundary(options: ImagePolishOptions): string {
  if (options.addPeople && options.addPlants) {
    return '可选新增元素仅限本次明确要求的人物和绿植数量；不得新增家具、装饰物或建筑构件；';
  }
  if (options.addPeople) {
    return '可选新增元素仅限本次明确要求的人物；不得新增绿植、家具、装饰物或建筑构件；';
  }
  if (options.addPlants) {
    return '可选新增元素仅限本次明确要求的绿植；不得新增人物、家具、装饰物或建筑构件；';
  }
  return '不得新增人物、绿植、家具、装饰物或建筑构件；';
}

function normalizeImagePolishElementLevel(value: unknown): ImagePolishElementLevel {
  if (value === 'none' || value === 'low' || value === 'medium' || value === 'high') return value;
  if (value === 'few') return 'low';
  if (value === 'moderate') return 'medium';
  if (value === 'many') return 'high';
  return 'none';
}

function normalizeEnabledElementLevel(value: ImagePolishElementLevel): Exclude<ImagePolishElementLevel, 'none'> {
  return value === 'none' ? 'medium' : value;
}

function readElementLevelLabel(value: ImagePolishElementLevel): string {
  if (value === 'low') return '少量';
  if (value === 'high') return '较多';
  return '适量';
}

function isImagePolishPreserveStrictness(value: unknown): value is ImagePolishPreserveStrictness {
  return value === 'strict' || value === 'standard' || value === 'loose';
}

function isImagePolishControlLevel(value: unknown): value is ImagePolishControlLevel {
  return value === 'off' || value === 'low' || value === 'medium' || value === 'high';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
