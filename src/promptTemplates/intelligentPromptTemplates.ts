export type SmartPromptMode =
  | 'floorplan'
  | 'style-render'
  | 'inpaint'
  | 'model-render'
  | 'design-variants'
  | 'material-replace'
  | 'plan-colorize'
  | 'panorama-roam-render';

export type SmartPromptChangeStrength = 'weak' | 'medium' | 'strong';

export interface BuildSmartPromptInput {
  mode: SmartPromptMode;
  config?: object;
  userPrompt?: string;
  hasMaterialReferences?: boolean;
  materialNames?: string[];
  hasMask?: boolean;
  useFullImageMask?: boolean;
  hasFurnitureReference?: boolean;
  variantStyle?: string;
  variantName?: string;
  qualityMode?: string;
}

export const SMART_PROMPT_OPTIONS = {
  buildingTypes: ['自动判断', '住宅', '商业', '办公', '酒店', '展厅', '餐饮', '教育', '医疗', '景观', '建筑外立面'],
  spaceTypes: ['自动判断', '客厅', '餐厅', '卧室', '厨房', '卫生间', '大堂', '办公区', '会议室', '展厅', '庭院', '外立面', '总图场地'],
  styles: ['自动判断', '现代极简', '自然木质', '意式轻奢', '侘寂', '新中式', '北欧温暖', '工业风', '商业展示', '电影级写实', '写实建筑表现'],
  materials: ['自动判断', '浅木色', '胡桃木', '微水泥', '浅色石材', '大理石', '水磨石', '瓷砖', '艺术涂料', '金属', '玻璃', '布艺软装', '绿植景观'],
  lighting: ['自动匹配', '自然日光', '柔和漫射光', '暖光灯带', '高级灯光', '清爽明亮', '黄昏', '夜景', '黄金时刻'],
  changeStrengths: [
    { value: 'weak', label: '轻微', desc: '尽量保持原图，仅做克制优化' },
    { value: 'medium', label: '中等', desc: '稳定结构，适度增强材质和氛围' },
    { value: 'strong', label: '明显', desc: '结构稳定，表达更完整、更有设计感' },
  ],
} as const;

const floorplanBasePrompt = [
  '请将输入图转换为专业的室内平面彩平图，使用清晰、写实、干净的材质表达。',
  '严格保持原图的户型结构、空间边界、墙体、门窗、门洞、柱体、固定结构、家具位置、家具轮廓和比例关系不变。',
  '不新增、不删除、不移动任何房间、墙体、门窗、开口、柱体或家具，不改变户型结构、家具尺寸关系、画布比例、视角和构图边界。',
  '保持俯视平面图表达，不要生成透视效果图、立面图、三维鸟瞰图、室内效果图或改变建筑布局。',
].join('\n');

const styleRenderBasePrompt = [
  'The input image is an architectural or interior reference image. Create a polished design rendering while preserving the original camera angle, perspective, spatial layout, major openings, composition, and object scale.',
  'Do not crop, add borders, add text, add watermarks, or change the core structure.',
  'Improve material realism, lighting, shadow quality, color harmony, and presentation quality.',
].join('\n');

const inpaintBasePrompt = [
  'You are a professional architectural and interior image editing assistant.',
  'Preserve the original camera angle, perspective, spatial structure, lighting direction, composition, visual boundary, and canvas ratio.',
  'Do not crop, extend, pad, add borders, add text, add watermarks, or change the image proportions.',
].join('\n');

const modelRenderBasePrompt = [
  'The input image is a 3D clay or white model viewport snapshot. Transform it into a realistic architectural or interior rendering.',
  'Preserve the original geometry, massing, layout, camera angle, perspective, composition, and spatial proportions.',
  'Add appropriate materials, lighting, shadows, environment, furniture, landscape details, and atmosphere. Do not change the fundamental structure unless explicitly requested.',
].join('\n');

const designVariantsBasePrompt = [
  'Create a design option from the input image. Preserve the original layout, camera angle, perspective, walls, openings, fixed structure, and main furniture positions.',
  'Generate a coherent alternative design direction with improved materials, lighting, furnishing, color palette, and presentation quality.',
  'Do not crop, add borders, add text, add watermarks, or change the core spatial structure.',
].join('\n');

const planColorizeBasePrompt = [
  'Transform the input black-and-white architectural plan into a clear colored presentation plan.',
  'Preserve the original walls, openings, layout, linework, proportions, canvas ratio, and spatial relationships.',
  'Add professional architectural graphics, clean color fills, readable hierarchy, and presentation-quality details. Do not change the core plan geometry.',
].join('\n');

const materialReplaceSmartPrompt = [
  'Replace or refine the selected architectural material or soft furnishing in the input image.',
  'Target object: {targetObjectTypeLabel}. Target material: {targetMaterialLabel}.',
  'Preserve geometry, boundaries, perspective, lighting direction, shadows, camera view, and all unrelated areas.',
  'Only change material color, texture, finish, reflection, roughness, tactile quality, and local soft decoration behavior where relevant.',
].join('\n');

const materialReplaceMaskPrompt = [
  'The white mask area is the editable region for material replacement.',
  'Target object: {targetObjectTypeLabel}. Target material: {targetMaterialLabel}.',
  'Keep black mask areas and all unmasked areas as unchanged as possible.',
  'Preserve geometry, boundaries, perspective, lighting direction, shadows, and camera view.',
].join('\n');

const panoramaBasePrompt = [
  'The input image is a 2:1 equirectangular 360 panorama captured from a 3D clay or white model.',
  'Transform it into a cinematic, photorealistic architectural or interior 360 panorama rendering.',
  'Preserve the exact equirectangular 2:1 canvas, full 360 continuity, camera position, spatial layout, geometry, proportions, horizon, and room or building structure.',
  'Do not convert it into a normal perspective view. Do not crop, pad, add borders, labels, or watermarks.',
].join('\n');

const targetObjectLabels: Record<string, string> = {
  floor: '地面',
  wall: '墙面',
  ceiling: '天花',
  cabinet: '柜体',
  sofa: '沙发',
  'table-chair': '桌椅',
  lighting: '灯具',
  plant: '绿植',
  'door-window': '门窗',
  'feature-wall': '背景墙',
  other: '目标区域',
};

const targetMaterialLabels: Record<string, string> = {
  'light-wood': '浅木色',
  'dark-wood': '深木色',
  walnut: '胡桃木',
  microcement: '微水泥',
  'rock-slab': '岩板',
  marble: '大理石',
  terrazzo: '水磨石',
  tile: '瓷砖',
  leather: '皮革',
  fabric: '布艺',
  metal: '金属',
  glass: '玻璃',
  'art-paint': '艺术涂料',
  'linear-light': '线性灯',
  'warm-light-strip': '暖光灯带',
  plant: '绿植',
  custom: '自定义材质',
};

const drawingTypePrompts: Record<string, string> = {
  residential: 'Plan type: residential interior plan.',
  commercial: 'Plan type: commercial space plan.',
  office: 'Plan type: office plan.',
  hotel: 'Plan type: hotel or hospitality plan.',
  landscape: 'Plan type: landscape plan.',
  'site-plan': 'Plan type: site plan or masterplan.',
  custom: 'Plan type: custom architectural drawing.',
};

const planTemplatePrompts: Record<string, string> = {
  'zoning-color': 'Focus on functional zoning colors with clear room or area differentiation.',
  'colored-plan': 'Create a polished colored floor plan with furniture, material fills, and clear visual hierarchy.',
  'landscape-plan': 'Enhance paving, planting, lawn, water, circulation, and outdoor materials.',
  'furniture-enhance': 'Clarify and enhance furniture, fixtures, and interior layout symbols.',
  'annotation-plan': 'Add concise room labels and readable annotation style.',
  'circulation-analysis': 'Add clear circulation arrows and movement hierarchy.',
};

export function buildSmartPrompt(input: BuildSmartPromptInput): string {
  const config = input.config;
  const userPrompt = readMeaningfulText(input.userPrompt) || readSmartPromptUserSupplement(input.mode, config);
  const qualityMode = readMeaningfulText(input.qualityMode) || readConfigString(config, 'qualityMode');

  if ((qualityMode === 'draft' || qualityMode === 'fast') && input.mode !== 'model-render' && input.mode !== 'panorama-roam-render') {
    return buildCompactSmartPrompt({ ...input, userPrompt });
  }

  switch (input.mode) {
    case 'floorplan':
      return buildFloorplanPrompt(input, userPrompt);
    case 'style-render':
      return buildStyleRenderPrompt(input, userPrompt);
    case 'inpaint':
      return buildInpaintPrompt(input, userPrompt);
    case 'model-render':
      return buildModelRenderPrompt(input, userPrompt);
    case 'design-variants':
      return buildDesignVariantsPrompt(input, userPrompt);
    case 'material-replace':
      return buildMaterialReplacePrompt(input, userPrompt);
    case 'plan-colorize':
      return buildPlanColorizePrompt(input, userPrompt);
    case 'panorama-roam-render':
      return buildPanoramaPrompt(input, userPrompt);
  }
}

export function readSmartPromptUserSupplement(mode: SmartPromptMode, config?: object, fallback = ''): string {
  const customPrompt = readConfigString(config, 'customPrompt');
  const explicitUserPrompt = readConfigString(config, 'userPrompt');
  const prompt = readConfigString(config, 'prompt');

  if (mode === 'material-replace') {
    return readConfigString(config, 'customMaterialPrompt') || customPrompt || explicitUserPrompt || fallback.trim() || prompt;
  }

  if (mode === 'plan-colorize' || mode === 'model-render' || mode === 'panorama-roam-render' || mode === 'design-variants') {
    return customPrompt || explicitUserPrompt || fallback.trim() || prompt;
  }

  return prompt || customPrompt || explicitUserPrompt || fallback.trim();
}

export function readSmartPromptChangeStrength(config?: object, mode?: SmartPromptMode): SmartPromptChangeStrength {
  const changeStrength = readConfigString(config, 'changeStrength');
  if (changeStrength === 'weak' || changeStrength === 'medium' || changeStrength === 'strong') return changeStrength;

  const panoramaStrength = readConfigString(config, 'panoramaChangeStrength');
  if (panoramaStrength === 'weak' || panoramaStrength === 'medium' || panoramaStrength === 'strong') return panoramaStrength;

  const inpaintingStrength = readConfigString(config, 'inpaintingStrength');
  if (inpaintingStrength === 'weak' || inpaintingStrength === 'medium' || inpaintingStrength === 'strong') return inpaintingStrength;

  const strength = readConfigString(config, 'strength');
  if (strength === 'weak' || strength === 'subtle') return 'weak';
  if (strength === 'strong') return 'strong';
  if (strength === 'medium' || strength === 'balanced') return 'medium';

  return mode === 'material-replace' ? 'medium' : 'medium';
}

function buildFloorplanPrompt(input: BuildSmartPromptInput, userPrompt: string): string {
  const parts = [
    floorplanBasePrompt,
    buildStructuredContext(input.config, input.mode),
    input.hasMaterialReferences ? '已提供的材质参考图优先作为颜色、纹理、质感和铺贴方向参考，不要复制参考图中的无关物体、背景或透视构图。' : undefined,
    input.materialNames && input.materialNames.length > 0 ? `材质参考名称：${input.materialNames.join('、')}。` : undefined,
    changeStrengthInstruction(readSmartPromptChangeStrength(input.config, input.mode), input.mode),
    userPrompt ? `用户补充要求：${userPrompt}` : '用户未输入补充要求，请根据结构化参数生成稳定、克制、专业的默认彩平效果。',
    '如补充要求与保持原始平面结构冲突，以保持结构、墙体、门窗、家具位置和画布比例为准。',
  ];
  return joinPrompt(parts);
}

function buildStyleRenderPrompt(input: BuildSmartPromptInput, userPrompt: string): string {
  return joinPrompt([
    styleRenderBasePrompt,
    buildStructuredContext(input.config, input.mode),
    changeStrengthInstruction(readSmartPromptChangeStrength(input.config, input.mode), input.mode),
    userPrompt ? `User extra requirements: ${userPrompt}` : 'No extra user requirements. Follow the structured selections and produce a stable default architectural rendering.',
  ]);
}

function buildInpaintPrompt(input: BuildSmartPromptInput, userPrompt: string): string {
  const editTarget = readConfigString(input.config, 'editTarget') || 'general';
  return joinPrompt([
    inpaintBasePrompt,
    input.hasMask
      ? 'The white area of the mask is the editable region. Keep the black area and all unmasked areas as unchanged as possible.'
      : input.useFullImageMask
        ? 'The user allows full-image editing, but the original composition, spatial structure, camera view, canvas ratio, and main object relationships must remain stable.'
        : 'No mask was provided. Identify the target object or region from the request and keep unrelated areas stable.',
    editTarget === 'material'
      ? 'Edit target: material replacement or material refinement. Only change material, color, texture, tactile quality, reflection, roughness, and surface detail in the target area.'
      : editTarget === 'furniture'
        ? 'Edit target: furniture modification. Only modify the target furniture and keep room perspective, scale, structure, lighting, and unrelated furniture unchanged.'
        : 'Edit target: general local improvement. Modify the requested target area while keeping unrelated regions, structure, perspective, lighting, and composition stable.',
    input.hasMaterialReferences ? 'Material reference images are for material texture, color, pattern, and surface quality only. Do not copy objects, layout, or background from reference images.' : undefined,
    input.hasFurnitureReference ? 'Furniture reference images are for furniture type, form, proportion, material, color, and style only. Do not copy the reference image background.' : undefined,
    buildStructuredContext(input.config, input.mode),
    changeStrengthInstruction(readSmartPromptChangeStrength(input.config, input.mode), input.mode),
    userPrompt ? `User edit request: ${userPrompt}` : 'User edit request is empty. Apply restrained architectural visual refinement only where appropriate, without changing the design scheme.',
    'Final result must look natural and integrated with the original scene, with plausible contact shadows, perspective, scale, and material behavior.',
  ]);
}

function buildModelRenderPrompt(input: BuildSmartPromptInput, userPrompt: string): string {
  return joinPrompt([
    modelRenderBasePrompt,
    buildStructuredContext(input.config, input.mode),
    changeStrengthInstruction(readSmartPromptChangeStrength(input.config, input.mode), input.mode),
    userPrompt ? `User extra requirements: ${userPrompt}` : 'No extra user requirements. Use the structured selections to create a stable default render.',
  ]);
}

function buildDesignVariantsPrompt(input: BuildSmartPromptInput, userPrompt: string): string {
  return joinPrompt([
    designVariantsBasePrompt,
    input.variantName ? `Variant name: ${input.variantName}.` : undefined,
    input.variantStyle ? `Variant style direction: ${input.variantStyle}.` : undefined,
    buildStructuredContext(input.config, input.mode),
    changeStrengthInstruction(readSmartPromptChangeStrength(input.config, input.mode), input.mode),
    userPrompt ? `User extra requirements: ${userPrompt}` : 'No extra user requirements. Use the selected design direction and structured parameters to create a stable scheme option.',
  ]);
}

function buildMaterialReplacePrompt(input: BuildSmartPromptInput, userPrompt: string): string {
  const targetObjectKey = readConfigString(input.config, 'targetObjectType') || 'other';
  const targetMaterialKey = readConfigString(input.config, 'targetMaterial') || 'custom';
  const targetObjectTypeLabel = targetObjectLabels[targetObjectKey] || targetObjectLabels.other;
  const targetMaterialLabel = targetMaterialLabels[targetMaterialKey] || readSmartMaterial(input.config) || targetMaterialLabels.custom;
  const editMode = readConfigString(input.config, 'editMode') === 'mask' ? 'mask' : 'smart-type';
  const basePrompt = editMode === 'mask' ? materialReplaceMaskPrompt : materialReplaceSmartPrompt;

  return joinPrompt([
    basePrompt
      .replace('{targetObjectTypeLabel}', targetObjectTypeLabel)
      .replace('{targetMaterialLabel}', targetMaterialLabel),
    input.hasMaterialReferences ? 'Use the material reference only for texture, color, finish, and material feeling. Do not copy its composition or objects.' : undefined,
    buildStructuredContext(input.config, input.mode, { includeMaterial: false }),
    changeStrengthInstruction(readSmartPromptChangeStrength(input.config, input.mode), input.mode),
    userPrompt ? `User extra requirements: ${userPrompt}` : 'No extra user requirements. Use the selected target area and material to produce a stable material replacement.',
  ]);
}

function buildPlanColorizePrompt(input: BuildSmartPromptInput, userPrompt: string): string {
  const drawingType = readConfigString(input.config, 'drawingType') || 'residential';
  const template = readConfigString(input.config, 'template') || 'colored-plan';
  const labels = readStringArray(input.config, 'manualRoomLabels');
  return joinPrompt([
    planColorizeBasePrompt,
    drawingTypePrompts[drawingType],
    planTemplatePrompts[template],
    buildStructuredContext(input.config, input.mode),
    readBooleanConfig(input.config, 'enableZoningColor') ? 'Use distinct but harmonious colors for different functional areas.' : undefined,
    readBooleanConfig(input.config, 'enableRoomLabels') ? 'Add concise room or area labels where appropriate.' : undefined,
    readBooleanConfig(input.config, 'enableFurnitureEnhance') ? 'Enhance furniture and fixture symbols while preserving layout.' : undefined,
    readBooleanConfig(input.config, 'enableCirculationArrows') ? 'Add subtle circulation arrows without cluttering the plan.' : undefined,
    readBooleanConfig(input.config, 'enableScaleEnhance') ? 'Improve scale readability with furniture, paving, texture, and line hierarchy.' : undefined,
    readBooleanConfig(input.config, 'enableLandscapeFill') ? 'Add landscape fills such as planting, paving, lawn, water, and outdoor texture.' : undefined,
    readConfigValue(input.config, 'preserveLinework') !== false ? 'Keep the original linework crisp and visible.' : undefined,
    labels.length > 0 ? `Use these labels when appropriate: ${labels.join(', ')}.` : undefined,
    changeStrengthInstruction(readSmartPromptChangeStrength(input.config, input.mode), input.mode),
    userPrompt ? `User extra requirements: ${userPrompt}` : 'No extra user requirements. Follow the selected plan template and structured parameters.',
  ]);
}

function buildPanoramaPrompt(input: BuildSmartPromptInput, userPrompt: string): string {
  return joinPrompt([
    panoramaBasePrompt,
    buildStructuredContext(input.config, input.mode),
    changeStrengthInstruction(readSmartPromptChangeStrength(input.config, input.mode), input.mode),
    userPrompt ? `User extra requirements: ${userPrompt}` : 'No extra user requirements. Use the structured selections to create a stable default 360 panorama render.',
  ]);
}

function buildCompactSmartPrompt(input: BuildSmartPromptInput): string {
  const context = buildStructuredContext(input.config, input.mode);
  const strength = changeStrengthInstruction(readSmartPromptChangeStrength(input.config, input.mode), input.mode);
  const note = input.userPrompt ? `Note: ${input.userPrompt}` : undefined;

  if (input.mode === 'floorplan' || input.mode === 'plan-colorize') {
    return joinPrompt(['Quick colored architectural plan. Preserve layout, walls, openings, linework, furniture positions, canvas ratio, and top-down plan view.', context, strength, note]);
  }

  if (input.mode === 'style-render' || input.mode === 'design-variants') {
    return joinPrompt(['Quick architectural render. Keep composition, perspective, layout, camera, and main outlines stable.', context, strength, input.variantStyle ? `Direction: ${input.variantStyle}.` : undefined, note]);
  }

  if (input.mode === 'material-replace') {
    return buildMaterialReplacePrompt(input, input.userPrompt || '');
  }

  return joinPrompt(['Quick local edit. Follow the mask when provided and keep unrelated areas unchanged.', context, strength, note]);
}

function buildStructuredContext(config: object | undefined, mode: SmartPromptMode, options: { includeMaterial?: boolean } = {}): string {
  const includeMaterial = options.includeMaterial !== false;
  const buildingType = readAutoAwareConfigString(config, 'buildingType');
  const spaceType = readAutoAwareConfigString(config, 'spaceType');
  const style = readAutoAwareConfigString(config, 'renderStyle') || readAutoAwareConfigString(config, 'style');
  const material = includeMaterial ? readSmartMaterial(config) : '';
  const lighting = readAutoAwareConfigString(config, 'atmosphere') || readAutoAwareConfigString(config, 'lighting');
  const parts = [
    buildingType ? `Building type: ${buildingType}.` : undefined,
    spaceType ? `Space type: ${spaceType}.` : undefined,
    style ? `Design style: ${style}.` : undefined,
    material ? `Main material direction: ${material}.` : undefined,
    lighting ? `Lighting and atmosphere: ${lighting}.` : undefined,
  ];

  if (mode === 'floorplan') {
    parts.push('Use these structured selections as presentation guidance while preserving the original plan geometry.');
  }

  return joinPrompt(parts);
}

function readSmartMaterial(config: object | undefined): string {
  const smartMaterial = readAutoAwareConfigString(config, 'smartMaterial');
  if (smartMaterial) return smartMaterial;
  const targetMaterial = readConfigString(config, 'targetMaterial');
  return targetMaterialLabels[targetMaterial] || '';
}

function changeStrengthInstruction(strength: SmartPromptChangeStrength, mode: SmartPromptMode): string {
  if (mode === 'material-replace') {
    if (strength === 'weak') return 'Change intensity: subtle. Replace the material gently and keep the original design feeling highly recognizable.';
    if (strength === 'strong') return 'Change intensity: strong. Make the material replacement clearly visible while preserving geometry and lighting.';
    return 'Change intensity: balanced. Make the material replacement clear, realistic, and integrated with the original scene.';
  }

  if (mode === 'plan-colorize' || mode === 'floorplan') {
    if (strength === 'weak') return 'Change strength: weak. Keep the original drawing very close, with restrained color and material expression.';
    if (strength === 'strong') return 'Change strength: strong. Improve presentation richness and hierarchy, but preserve all plan geometry and linework.';
    return 'Change strength: medium. Add clear color, material hierarchy, and presentation detail while preserving the plan.';
  }

  if (mode === 'panorama-roam-render') {
    if (strength === 'weak') return 'Change strength: weak. Preserve original elements, layout, structure, furniture positions, horizon, and spatial organization; focus on faithful rendering and subtle refinement.';
    if (strength === 'strong') return 'Change strength: strong. Preserve the core spatial structure, proportions, camera position, and 360 continuity, but allow richer scene details, stronger atmosphere, and more expressive materials.';
    return 'Change strength: medium. Preserve the original spatial layout, composition, and major design features while moderately enhancing materials, lighting, atmosphere, and texture quality.';
  }

  if (strength === 'weak') return 'Change strength: weak. Keep the original composition and design very stable, with subtle refinement only.';
  if (strength === 'strong') return 'Change strength: strong. Allow richer design expression and atmosphere, but preserve the core structure, camera, and spatial relationships.';
  return 'Change strength: medium. Preserve the original layout and main design features while moderately enhancing materials, lighting, atmosphere, and detail quality.';
}

function readConfigString(config: object | undefined, key: string): string {
  const value = readConfigValue(config, key);
  return readMeaningfulText(value);
}

function readAutoAwareConfigString(config: object | undefined, key: string): string {
  const value = readConfigString(config, key);
  return value === '自动判断' || value === '自动匹配' ? '' : value;
}

function readConfigValue(config: object | undefined, key: string): unknown {
  if (!config) return undefined;
  return (config as Record<string, unknown>)[key];
}

function readMeaningfulText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const normalized = trimmed.toLowerCase();
  if (normalized === 'none' || normalized === 'null' || normalized === 'undefined') return '';
  return trimmed;
}

function readBooleanConfig(config: object | undefined, key: string): boolean {
  return readConfigValue(config, key) === true;
}

function readStringArray(config: object | undefined, key: string): string[] {
  const value = readConfigValue(config, key);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function joinPrompt(parts: Array<string | undefined>): string {
  return parts
    .map(part => part?.trim())
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join('\n');
}
