export type SmartPromptMode =
  | 'floorplan'
  | 'style-render'
  | 'inpaint'
  | 'model-render'
  | 'design-variants'
  | 'material-replace'
  | 'plan-colorize'
  | 'panorama-roam-render'
  | 'object-insert';

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
  'Preserve the exact equirectangular 2:1 canvas, full 360 continuity, camera position, spatial layout, geometry, proportions, horizon, doors, windows, walls, ceiling, floor, and the main room or building structure.',
  'Do not convert it into a normal perspective view. Do not output a line drawing, blueprint, collage, split-screen image, cropped view, padded view, border, label, or watermark.',
].join('\n');

const objectInsertBasePrompt = [
  'Intelligent Object Insert for architectural/interior local editing.',
  'Input image 1: the original interior/architectural scene image.',
  'Input image 2: the furniture/object reference image. Use it mainly for furniture type, material, color, proportion, and design language.',
  'Input image 3: the placement guide. In natural mode it is a suggested target area; in strict mode it is a precise guide box.',
  'Input image 4, if provided: the edit-area mask. White is editable; black and unmasked areas must remain unchanged.',
  'Match perspective, scale, lighting, shadows, materials, depth of field, and scene atmosphere.',
  'Keep all unmasked regions unchanged.',
  'Do not freely change the camera framing, room layout, wall/floor/ceiling structure, or unrelated furniture.',
  'Do not generate brand Logo, trademarks, watermarks, text, people, or sensitive content.',
  'Output one natural photorealistic architectural/interior rendering.',
].join('\n');

const panoramaReferenceTypeLabels: Record<string, string> = {
  revit_screenshot: 'Revit screenshot',
  floor_plan: 'floor plan',
  material_reference: 'material reference',
  style_reference: 'style reference',
  render_reference: 'render reference',
};

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

const materialPatternScalePrompts: Record<string, string> = {
  small: 'Texture scale: small. Use fine-grained material texture with compact pattern scale, suitable for close interior detail.',
  medium: 'Texture scale: medium. Use balanced, realistic material pattern scale that matches architectural surfaces.',
  large: 'Texture scale: large. Use larger slabs, wider planks, or broader grain/pattern scale while keeping proportions believable.',
};

const materialDirectionPrompts: Record<string, string> = {
  auto: 'Tile, wood, or grain direction: auto. Choose the most natural direction according to the target surface, perspective, and existing architecture.',
  horizontal: 'Tile, wood, or grain direction: horizontal. Align the main pattern horizontally along the target surface.',
  vertical: 'Tile, wood, or grain direction: vertical. Align the main pattern vertically along the target surface.',
  diagonal: 'Tile, wood, or grain direction: diagonal. Use a diagonal laying direction with controlled perspective alignment.',
  herringbone: 'Tile, wood, or grain direction: herringbone. Use a refined herringbone pattern where suitable for the selected material.',
};

const materialFinishPrompts: Record<string, string> = {
  matte: 'Surface finish: matte. Keep reflections low, with soft diffuse light response and calm material behavior.',
  satin: 'Surface finish: satin. Use a gentle soft sheen with subtle reflection and realistic mid-roughness surface behavior.',
  glossy: 'Surface finish: glossy. Add clearer highlights and controlled reflections while avoiding mirror-like distortion unless the material requires it.',
  rough: 'Surface finish: rough. Emphasize tactile roughness, micro texture, and low reflectivity with natural shadow breakup.',
};

const materialReplaceScopePrompts: Record<string, string> = {
  'material-only': 'Replacement scope: material only. Only change the target material; do not change geometry, furniture shape, furniture layout, object count, camera angle, or spatial structure.',
  'material-and-soft-decor': 'Replacement scope: material and soft decor refinement. Material changes are primary; allow minor local soft furnishing detail adjustments only when they help the target material feel integrated.',
  creative: 'Replacement scope: creative optimization. Allow more visible design refinement, color coordination, and local styling improvements while preserving the original geometry, layout, camera, and structural relationships.',
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
    case 'object-insert':
      return buildObjectInsertPrompt(input, userPrompt);
  }
}

export function readSmartPromptUserSupplement(mode: SmartPromptMode, config?: object, fallback = ''): string {
  const customPrompt = readConfigString(config, 'customPrompt');
  const explicitUserPrompt = readConfigString(config, 'userPrompt');
  const prompt = readConfigString(config, 'prompt');

  if (mode === 'material-replace') {
    return readConfigString(config, 'customMaterialPrompt') || customPrompt || explicitUserPrompt || fallback.trim() || prompt;
  }

  if (mode === 'object-insert') {
    return readConfigString(config, 'objectInsertExtraPrompt') || customPrompt || explicitUserPrompt || fallback.trim() || prompt;
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
    buildFloorplanExpressionControlPrompt(input.config),
    buildFloorplanTemplatePrompt(input.config),
    buildFloorplanRoomLabelsPrompt(input.config),
    buildStructuredContext(input.config, input.mode),
    input.hasMaterialReferences ? '已提供的材质参考图优先作为颜色、纹理、质感和铺贴方向参考，不要复制参考图中的无关物体、背景或透视构图。' : undefined,
    input.materialNames && input.materialNames.length > 0 ? `材质参考名称：${input.materialNames.join('、')}。` : undefined,
    changeStrengthInstruction(readSmartPromptChangeStrength(input.config, input.mode), input.mode),
    userPrompt ? `用户补充要求：${userPrompt}` : '用户未输入补充要求，请根据结构化参数生成稳定、克制、专业的默认彩平效果。',
    '如补充要求与保持原始平面结构冲突，以保持结构、墙体、门窗、家具位置和画布比例为准。',
  ];
  return joinPrompt(parts);
}

const floorplanRenderModePrompts: Record<string, string> = {
  'flat-color': 'Floor plan render mode: flat-color. Keep a pure flat colored plan expression; do not generate a perspective rendering, bird-eye view, 3D view, elevation, or interior effect image.',
  'semi-3d': 'Floor plan render mode: semi-3d. Create a layered semi-3D colored floor plan expression, while preserving the original floor plan structure, walls, openings, furniture outlines, and plan proportions.',
  presentation: 'Floor plan render mode: presentation. Strengthen presentation-board quality, material hierarchy, graphic completeness, clean composition, and readable spatial expression while preserving the original plan structure.',
};

const floorplanTemplatePrompts: Record<string, string> = {
  'residential-warm-wood': 'Floorplan color template: residential warm wood. Use warm wood tones, soft neutral materials, cozy residential zoning, and clear home-oriented function expression.',
  'premium-light-luxury': 'Floorplan color template: premium light luxury. Use refined stone, subtle metal accents, warm beige-gray palette, elegant material hierarchy, and report-ready polish.',
  'commercial-presentation': 'Floorplan color template: commercial presentation. Emphasize display zones, circulation clarity, brand-facing material contrast, and presentation readability.',
  'office-space': 'Floorplan color template: office workspace. Express workstations, meeting rooms, collaborative zones, reception, storage, circulation clarity, and professional neutral materials.',
  'landscape-masterplan': 'Floorplan color template: landscape masterplan. Use planting texture, paving hierarchy, outdoor circulation, site edges, water/green area distinction, and masterplan clarity.',
  'minimal-grayscale': 'Floorplan color template: minimal grayscale. Use restrained black-white-gray fills, subtle material contrast, clean linework, and strong plan readability.',
};

function buildFloorplanTemplatePrompt(config: object | undefined): string | undefined {
  const id = readConfigString(config, 'floorplanTemplateId') || 'residential-warm-wood';
  return floorplanTemplatePrompts[id] || floorplanTemplatePrompts['residential-warm-wood'];
}

function buildFloorplanRoomLabelsPrompt(config: object | undefined): string | undefined {
  const value = readConfigValue(config, 'floorplanRoomLabels');
  const labels = Array.isArray(value) ? value.filter(isRecord).slice(0, 20) : [];
  if (labels.length === 0) return undefined;
  const lines = labels.map((label, index) => {
    const name = readConfigString(label, 'name') || `Area ${index + 1}`;
    const type = readFloorplanRoomTypeLabel(label);
    const position = readConfigString(label, 'positionDescription');
    return `Room ${index + 1}: ${name} = ${type}${position ? `, location: ${position}` : ''}.`;
  });
  return joinPrompt([
    'Manual room labels: express each functional zone according to the following room labels. Keep room labels subtle and integrated with the plan; do not move walls, openings, room boundaries, or furniture outlines.',
    ...lines,
  ]);
}

function readFloorplanRoomTypeLabel(label: Record<string, unknown>): string {
  const type = readConfigString(label, 'roomType') || 'custom';
  if (type === 'custom') return readConfigString(label, 'customTypeLabel') || 'custom room';
  const labels: Record<string, string> = {
    'living-room': 'living room',
    'dining-room': 'dining room',
    bedroom: 'bedroom',
    kitchen: 'kitchen',
    bathroom: 'bathroom',
    balcony: 'balcony',
    entry: 'entry foyer',
    study: 'study',
    office: 'office area',
    commercial: 'commercial area',
  };
  return labels[type] || 'room';
}

const lineworkPreservationPrompts: Record<string, string> = {
  strict: 'Linework preservation: strict. Extremely strictly preserve the original linework, wall thickness, doors, windows, furniture outlines, room boundaries, and all plan geometry.',
  high: 'Linework preservation: high. Highly preserve the original linework and plan geometry, allowing only slight visual cleanup and professional graphic beautification.',
  medium: 'Linework preservation: medium. Keep the structure unchanged while allowing stronger graphic enhancement, clearer fills, material hierarchy, and presentation refinement.',
};

function buildFloorplanExpressionControlPrompt(config: object | undefined): string {
  const renderMode = readConfigString(config, 'floorplanRenderMode') || 'semi-3d';
  const lineworkPreservation = readConfigString(config, 'lineworkPreservation') || 'high';
  return joinPrompt([
    floorplanRenderModePrompts[renderMode] || floorplanRenderModePrompts['semi-3d'],
    lineworkPreservationPrompts[lineworkPreservation] || lineworkPreservationPrompts.high,
    readConfigValue(config, 'enableLegend') === true ? 'Add a concise graphic legend where appropriate, without covering important plan content.' : undefined,
    readConfigValue(config, 'enableAreaText') === true ? 'Add clear area or functional text labels where appropriate; keep text minimal, legible, and aligned with the plan.' : undefined,
    readConfigValue(config, 'enableMaterialLegend') === true ? 'Add a material legend that explains key floor, wall, soft furnishing, and finish categories where appropriate.' : undefined,
  ]);
}

function buildStyleRenderPrompt(input: BuildSmartPromptInput, userPrompt: string): string {
  return joinPrompt([
    styleRenderBasePrompt,
    buildFreeReferenceImagePrompt(input.config),
    buildStructuredContext(input.config, input.mode),
    changeStrengthInstruction(readSmartPromptChangeStrength(input.config, input.mode), input.mode),
    userPrompt ? `User extra requirements: ${userPrompt}` : 'No extra user requirements. Follow the structured selections and produce a stable default architectural rendering.',
  ]);
}

const freeReferenceRolePrompts: Record<string, string> = {
  style: 'style reference',
  material: 'material reference',
  furniture: 'furniture reference',
  lighting: 'lighting reference',
  composition: 'composition reference',
  color: 'color palette reference',
  detail: 'detail reference',
};

const freeReferenceStrengthPrompts: Record<string, string> = {
  low: 'low strength, use this reference subtly',
  medium: 'medium strength, apply it clearly but keep the source image dominant',
  high: 'high strength, strongly follow this reference role while preserving the source image structure',
};

function buildFreeReferenceImagePrompt(config: object | undefined): string | undefined {
  if (readConfigString(config, 'step') !== 'free_reference_image') return undefined;
  const referencesValue = readConfigValue(config, 'freeReferenceReferences');
  const references = Array.isArray(referencesValue) ? referencesValue.filter(isRecord).slice(0, 6) : [];
  const referenceLines = references.map((reference, index) => {
    const role = readConfigString(reference, 'role') || 'style';
    const strength = readConfigString(reference, 'strength') || 'medium';
    return `Reference image ${index + 2}: ${freeReferenceRolePrompts[role] || freeReferenceRolePrompts.style}; ${freeReferenceStrengthPrompts[strength] || freeReferenceStrengthPrompts.medium}.`;
  });

  return joinPrompt([
    'Free reference image mode: Image 1 is the source image and must remain the dominant foundation for geometry, camera, perspective, composition, spatial layout, and main object relationships.',
    referenceLines.length > 0
      ? joinPrompt(referenceLines)
      : 'Additional images are references only. Use them for style, material, color, lighting, furniture language, composition intent, and details according to the user prompt.',
    'Do not mechanically collage reference images. Do not create a split-screen, comparison image, grid, before/after layout, mood board, UI, border, watermark, or text labels.',
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
    buildDesignVariantControlPrompt(input.config),
    buildStructuredContext(input.config, input.mode),
    changeStrengthInstruction(readSmartPromptChangeStrength(input.config, input.mode), input.mode),
    userPrompt ? `User extra requirements: ${userPrompt}` : 'No extra user requirements. Use the selected design direction and structured parameters to create a stable scheme option.',
  ]);
}

const variantChangeScopePrompts: Record<string, string> = {
  'material-only': 'Variation change scope: material-only. Only change materials and finishes; preserve furniture layout, lighting composition, structure, camera, and major colors unless required by material realism.',
  'soft-decoration': 'Variation change scope: soft-decoration. Change loose furniture/decor only, including textiles, artwork, plants, accessories, and movable styling elements.',
  lighting: 'Variation change scope: lighting. Mainly change lighting atmosphere, fixture glow, brightness balance, and mood while keeping layout and material system stable.',
  'furniture-layout': 'Variation change scope: furniture-layout. Adjust movable furniture layout while preserving structure, walls, openings, camera, and fixed built-ins.',
  'color-palette': 'Variation change scope: color-palette. Change color system only; keep forms, layout, materials types, structure, and camera stable.',
  'full-design': 'Variation change scope: full-design. Create a coherent alternative design while preserving the locked architectural constraints.',
};

const variantLockPrompts: Record<string, string> = {
  structure: 'Lock structure: preserve architectural structure, room boundaries, columns, beams, stairs, and built elements.',
  camera: 'Lock camera: preserve original camera angle, perspective, crop, field of view, and composition.',
  'walls-openings': 'Lock walls and openings: preserve wall positions, doors, windows, openings, and facade apertures.',
  'fixed-furniture': 'Lock fixed furniture: preserve built-in cabinets, counters, kitchen systems, wardrobes, and fixed millwork.',
  'floor-material': 'Lock floor material: preserve the existing floor material, pattern, color, and finish.',
  ceiling: 'Lock ceiling: preserve ceiling form, height, cornices, coffers, and fixed ceiling design.',
  'main-color': 'Lock main color: preserve the dominant color family and only make restrained supporting adjustments.',
};

function buildDesignVariantControlPrompt(config: object | undefined): string {
  const scope = readDesignVariantChangeScope(config);
  const locks = readDesignVariantLocks(config);
  const index = readFiniteNumber(readConfigValue(config, 'variantIndex')) || 0;
  const note = readDesignVariantStrategyNote(config, index);
  return joinPrompt([
    variantChangeScopePrompts[scope] || variantChangeScopePrompts['full-design'],
    locks.length > 0 ? `Locked items for this variant: ${locks.map(lock => variantLockPrompts[lock]).filter(Boolean).join(' ')}` : undefined,
    note ? `Variant-specific strategy note: ${note}` : undefined,
  ]);
}

function readDesignVariantChangeScope(config: object | undefined): string {
  const value = readConfigString(config, 'variantChangeScope');
  return variantChangeScopePrompts[value] ? value : 'full-design';
}

function readDesignVariantLocks(config: object | undefined): string[] {
  const locks = readStringArray(config, 'variantLocks');
  const valid = locks.filter(lock => Boolean(variantLockPrompts[lock]));
  return valid.length > 0 ? valid : ['structure', 'camera', 'walls-openings'];
}

function readDesignVariantStrategyNote(config: object | undefined, index: number): string {
  const notes = readStringArray(config, 'variantStrategyNotes');
  return (notes[index] || '').trim().slice(0, 200);
}

function buildMaterialReplacePrompt(input: BuildSmartPromptInput, userPrompt: string): string {
  const targetObjectKey = readConfigString(input.config, 'targetObjectType') || 'other';
  const targetMaterialKey = readConfigString(input.config, 'targetMaterial') || 'custom';
  const targetObjectTypeLabel = targetObjectLabels[targetObjectKey] || targetObjectLabels.other;
  const targetMaterialLabel = targetMaterialLabels[targetMaterialKey] || readSmartMaterial(input.config) || targetMaterialLabels.custom;
  const editMode = readConfigString(input.config, 'editMode') === 'mask' ? 'mask' : 'smart-type';
  const basePrompt = editMode === 'mask' ? materialReplaceMaskPrompt : materialReplaceSmartPrompt;
  const patternScale = readConfigString(input.config, 'materialPatternScale') || 'medium';
  const materialDirection = readConfigString(input.config, 'materialDirection') || 'auto';
  const materialFinish = readConfigString(input.config, 'materialFinish') || 'matte';
  const replaceScope = readConfigString(input.config, 'materialReplaceScope') || 'material-only';

  return joinPrompt([
    basePrompt
      .replace('{targetObjectTypeLabel}', targetObjectTypeLabel)
      .replace('{targetMaterialLabel}', targetMaterialLabel),
    input.hasMaterialReferences ? 'Use the material reference only for texture, color, finish, and material feeling. Do not copy its composition or objects.' : undefined,
    materialPatternScalePrompts[patternScale] || materialPatternScalePrompts.medium,
    materialDirectionPrompts[materialDirection] || materialDirectionPrompts.auto,
    materialFinishPrompts[materialFinish] || materialFinishPrompts.matte,
    materialReplaceScopePrompts[replaceScope] || materialReplaceScopePrompts['material-only'],
    buildStructuredContext(input.config, input.mode, { includeMaterial: false }),
    changeStrengthInstruction(readSmartPromptChangeStrength(input.config, input.mode), input.mode),
    userPrompt ? `User extra requirements: ${userPrompt}` : 'No extra user requirements. Use the selected target area and material to produce a stable material replacement.',
  ]);
}

function buildPlanColorizePrompt(input: BuildSmartPromptInput, userPrompt: string): string {
  const drawingType = readConfigString(input.config, 'drawingType') || 'residential';
  const template = readConfigString(input.config, 'template') || 'colored-plan';
  const selectedStyleName = readConfigString(input.config, 'selectedStyleName');
  const selectedStylePromptHint = readConfigString(input.config, 'selectedStylePromptHint');
  const labels = readStringArray(input.config, 'manualRoomLabels');
  return joinPrompt([
    planColorizeBasePrompt,
    drawingTypePrompts[drawingType],
    planTemplatePrompts[template],
    selectedStyleName ? `Selected colored-plan style: ${selectedStyleName}.` : undefined,
    selectedStylePromptHint,
    'Keep the original plan structure, walls, doors, windows, room divisions, and circulation geometry unchanged. The selected style should only affect color palette, material fills, atmosphere, and presentation expression.',
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
    buildPanoramaReferencePrompt(input.config),
    changeStrengthInstruction(readSmartPromptChangeStrength(input.config, input.mode), input.mode),
    userPrompt ? `User extra requirements: ${userPrompt}` : 'No extra user requirements. Use the structured selections to create a stable default 360 panorama render.',
  ]);
}

function buildObjectInsertPrompt(input: BuildSmartPromptInput, userPrompt: string): string {
  const debugMode = readObjectInsertDebugMode(input.config);
  const placementMode = readObjectInsertPlacementMode(input.config);
  return joinPrompt([
    objectInsertBasePrompt,
    buildObjectInsertModePrompt(input.config),
    buildObjectInsertInputModePrompt(debugMode, placementMode),
    buildObjectInsertPositionConstraintPrompt(input.config),
    buildObjectInsertSpatialRelationPrompt(input.config, userPrompt),
    buildObjectInsertProfessionalConstraintsPrompt(input.config),
    buildStructuredContext(input.config, input.mode),
    buildObjectPlacementPrompt(input.config),
    changeStrengthInstruction(readSmartPromptChangeStrength(input.config, input.mode), input.mode),
    userPrompt ? `用户补充要求：${userPrompt}` : '用户未输入补充要求，请根据摆放示意和参考图生成稳定、自然、写实的建筑/室内效果图。',
    '只输出一张真实自然的建筑/室内效果图。不要添加文字、标签、品牌 Logo、商标、水印、UI、边框、拼贴或分屏对比。',
  ]);
}

function buildObjectInsertModePrompt(config: object | undefined): string {
  const placementMode = readObjectInsertPlacementMode(config);
  const intent = readObjectInsertPlacementIntent(config);
  const harmonyPriority = readObjectInsertHarmonyPriority(config);
  const autoAdjust = [
    readObjectInsertAutoAdjust(config, 'allowAutoAdjustPosition') ? 'position' : '',
    readObjectInsertAutoAdjust(config, 'allowAutoAdjustRotation') ? 'orientation' : '',
    readObjectInsertAutoAdjust(config, 'allowAutoAdjustScale') ? 'scale' : '',
  ].filter(Boolean);

  if (placementMode === 'strict') {
    return joinPrompt([
      'Placement mode: strict / precise placement.',
      'Generate a similar furniture/object in the guide-specified area.',
      'Fit the guide center, size, position, and angle as closely as possible.',
      intent ? `User placement intent: ${intent}.` : undefined,
      'Match perspective, scale, light, shadow, material integration, floor contact, and occlusion while keeping unrelated areas unchanged.',
    ]);
  }

  return joinPrompt([
    'Placement mode: natural / intelligent furnishing placement.',
    'The user-drawn box means a suggested area, approximate size range, and placement intent rather than an absolute transform.',
    'Use the reference image mainly for furniture type, material, color, proportion, and design language.',
    'Optimize the final furniture position, orientation, and scale according to the original scene layout, existing furniture relationships, circulation path, perspective, occlusion, and overall composition.',
    'Prioritize harmonious interior design, functional reasonableness, visual balance, realistic floor contact, and scale consistency with existing furniture.',
    'Do not mechanically copy the reference image direction. If the reference angle is unsuitable for the original scene, adjust it into a more natural orientation.',
    `Harmony priority: ${harmonyPriority}. Auto-adjust allowed for: ${autoAdjust.length > 0 ? autoAdjust.join(', ') : 'none'}.`,
    intent ? `User placement intent: ${intent}. Give this intent strong priority when choosing the natural spatial relationship.` : undefined,
  ]);
}

function buildObjectInsertInputModePrompt(mode: string, placementMode: string): string {
  if (mode === 'source_prompt') {
    return [
      'Debug input: only image 1 and the text prompt are provided.',
      'Without a placement guide or mask, keep the edit conservative and do not freely alter the composition.',
    ].join('\n');
  }

  if (mode === 'source_object') {
    return [
      'Debug input: image 1 and image 2 are provided, but no placement guide or mask is provided.',
      'Use image 2 only for chair form, material, color, and proportion; keep placement conservative if the target position is not explicit.',
    ].join('\n');
  }

  if (mode === 'source_object_mask') {
    return [
      'Debug input: image 1, image 2, and the edit-area mask are provided, but no placement guide is provided.',
      'The chair must stay inside the white mask area. Keep black and unmasked areas unchanged.',
    ].join('\n');
  }

  if (mode === 'source_object_preview') {
    return [
      'Debug input: image 1, image 2, and image 3 placement guide are provided, but no mask is provided.',
      placementMode === 'strict'
        ? 'Image 3 is the strongest authority for the furniture position, center, size, rotation, and guide box.'
        : 'Image 3 is a suggested target area. Use it as a soft placement guide and optimize the final furniture relationship naturally.',
    ].join('\n');
  }

  if (mode === 'source_placement_preview') {
    return [
      'Input mode: image 1 is the original scene; image 2 is a clean placement preview made from the original scene plus the user-dragged object layer.',
      'Image 2 is the main soft-anchor placement reference. It contains no editor borders, handles, controls, masks, or UI.',
      'Use image 2 for object type, approximate location, approximate size, and approximate orientation.',
    ].join('\n');
  }

  return placementMode === 'strict'
    ? 'Full input: image 1 original scene, image 2 furniture/object reference, image 3 placement guide, and image 4 edit-area mask. The placement guide and mask define location, size, rotation, and edit extent according to the selected position constraint strength.'
    : 'Full input: image 1 original scene, image 2 furniture/object reference, image 3 suggested placement area, and image 4 edit-area mask. The guide and mask indicate a local area for natural placement optimization.';
}

function readObjectInsertDebugMode(config: object | undefined): string {
  const mode = readConfigString(config, 'objectInsertDebugMode')
    || (isRecord(readConfigValue(config, 'objectInsert')) ? readConfigString(readConfigValue(config, 'objectInsert') as object, 'debugMode') : '');
  return mode === 'source_prompt'
    || mode === 'source_object'
    || mode === 'source_object_mask'
    || mode === 'source_object_preview'
    || mode === 'source_placement_preview'
    ? mode
    : 'full';
}

function buildObjectInsertPositionConstraintPrompt(config: object | undefined): string {
  if (readObjectInsertPlacementMode(config) === 'natural') {
    return [
      'Position constraint strength is secondary in natural mode.',
      'Use the guide as a soft target area and avoid treating the user box as a rigid position, angle, or scale requirement.',
      'Optimize placement for scene layout harmony, existing furniture relationships, circulation, perspective, occlusion, and composition.',
    ].join('\n');
  }
  const strength = readObjectInsertPositionConstraintStrength(config);
  if (strength === 'low') {
    return [
      'Position constraint strength: low.',
      'The generated chair may be naturally adjusted near the guided area when needed for perspective, floor contact, occlusion, or scene logic.',
      'Keep it close to the placement guide and do not move it to a different functional area.',
    ].join('\n');
  }
  if (strength === 'medium') {
    return [
      'Position constraint strength: medium.',
      'Keep the chair as close as possible to the user placement guide center, size, and rotation, while allowing only small natural corrections for perspective, floor contact, and occlusion.',
      'The chair should remain visually aligned with the guide / mask area.',
    ].join('\n');
  }
  return [
    'Position constraint strength: high.',
    'The chair must be generated inside the guide / mask specified area and must not visibly drift away from the guide box center, size, or rotation.',
    'Treat the placement guide, mask, and normalized placement metadata as strict location and scale constraints.',
    'Keep all unmasked regions unchanged.',
  ].join('\n');
}

function readObjectInsertPlacementMode(config: object | undefined): string {
  const nested = readConfigValue(config, 'objectInsert');
  const nestedValue = isRecord(nested) ? readConfigString(nested, 'placementMode') : '';
  const value = nestedValue || readConfigString(config, 'placementMode');
  return value === 'strict' || value === 'natural' ? value : 'natural';
}

function readObjectInsertPlacementIntent(config: object | undefined): string {
  const nested = readConfigValue(config, 'objectInsert');
  const nestedValue = isRecord(nested) ? readConfigString(nested, 'placementIntent') : '';
  return (nestedValue || readConfigString(config, 'placementIntent')).trim();
}

function readObjectInsertHarmonyPriority(config: object | undefined): string {
  const nested = readConfigValue(config, 'objectInsert');
  const nestedValue = isRecord(nested) ? readConfigString(nested, 'harmonyPriority') : '';
  const value = nestedValue || readConfigString(config, 'harmonyPriority');
  return value === 'style' || value === 'balance' || value === 'layout' ? value : 'layout';
}

function readObjectInsertAutoAdjust(
  config: object | undefined,
  key: 'allowAutoAdjustPosition' | 'allowAutoAdjustRotation' | 'allowAutoAdjustScale',
): boolean {
  const nested = readConfigValue(config, 'objectInsert');
  const nestedValue = isRecord(nested) ? readConfigValue(nested, key) : undefined;
  const value = typeof nestedValue === 'boolean' ? nestedValue : readConfigValue(config, key);
  return typeof value === 'boolean' ? value : true;
}

function buildObjectInsertProfessionalConstraintsPrompt(config: object | undefined): string {
  const surface = readObjectInsertSurface(config);
  const fidelity = readObjectFidelity(config);
  const surfacePrompt = surface === 'floor'
    ? 'Placement surface: floor. The inserted object must stand on the ground plane with a natural contact shadow.'
    : surface === 'outdoor-ground'
      ? 'Placement surface: outdoor ground. The inserted object must stand on the outdoor ground plane with a natural contact shadow.'
      : surface === 'wall'
        ? 'Placement surface: wall. The inserted object must be attached to the wall, not floating.'
        : surface === 'ceiling'
          ? 'Placement surface: ceiling. The inserted object must hang from or attach to the ceiling.'
          : surface === 'tabletop'
            ? 'Placement surface: tabletop. The inserted object must sit on the tabletop, with correct scale and occlusion.'
            : 'Placement surface: auto. Infer the correct supporting surface from the scene, guide, reference object, and user intent.';
  const fidelityPrompt = fidelity === 'strict'
    ? 'Object fidelity: strict. Preserve the reference object shape, material, color, proportions, and distinctive details as closely as possible.'
    : fidelity === 'loose'
      ? 'Object fidelity: loose. The object may be adapted moderately for scene harmony while keeping its core type and design intent recognizable.'
      : 'Object fidelity: balanced. Preserve the object identity while adapting lighting, perspective, scale, and minor material response for natural integration.';
  return joinPrompt([
    surfacePrompt,
    fidelityPrompt,
    readObjectInsertBooleanConstraint(config, 'enforceContactShadow')
      ? 'Contact shadow constraint: generate physically plausible contact shadows where the inserted object touches the supporting surface.'
      : undefined,
    readObjectInsertBooleanConstraint(config, 'enforceOcclusion')
      ? 'Occlusion constraint: preserve correct front-back occlusion with existing scene elements; the inserted object must not ignore nearby furniture, walls, railings, plants, or tabletop edges.'
      : undefined,
    readObjectInsertBooleanConstraint(config, 'enforcePerspectiveScale')
      ? 'Perspective scale constraint: match the original camera perspective, horizon, vanishing direction, object scale, and distance cues.'
      : undefined,
  ]);
}

function readObjectInsertSurface(config: object | undefined): string {
  const nested = readConfigValue(config, 'objectInsert');
  const nestedValue = isRecord(nested) ? readConfigString(nested, 'objectInsertSurface') : '';
  const value = nestedValue || readConfigString(config, 'objectInsertSurface');
  return value === 'floor'
    || value === 'wall'
    || value === 'ceiling'
    || value === 'tabletop'
    || value === 'outdoor-ground'
    || value === 'auto'
    ? value
    : 'auto';
}

function readObjectFidelity(config: object | undefined): string {
  const nested = readConfigValue(config, 'objectInsert');
  const nestedValue = isRecord(nested) ? readConfigString(nested, 'objectFidelity') : '';
  const value = nestedValue || readConfigString(config, 'objectFidelity');
  return value === 'strict' || value === 'balanced' || value === 'loose' ? value : 'balanced';
}

function readObjectInsertBooleanConstraint(
  config: object | undefined,
  key: 'enforceContactShadow' | 'enforceOcclusion' | 'enforcePerspectiveScale',
): boolean {
  const nested = readConfigValue(config, 'objectInsert');
  const nestedValue = isRecord(nested) ? readConfigValue(nested, key) : undefined;
  const value = typeof nestedValue === 'boolean' ? nestedValue : readConfigValue(config, key);
  return typeof value === 'boolean' ? value : true;
}

function buildObjectInsertSpatialRelationPrompt(config: object | undefined, userPrompt: string): string | undefined {
  const text = [
    userPrompt,
    readObjectInsertPlacementIntent(config),
    readConfigString(config, 'objectInsertExtraPrompt'),
    readConfigString(config, 'customPrompt'),
  ].join('\n');
  const relations = [
    { pattern: /放在.{0,8}沙发后|沙发后面|沙发后侧|behind.{0,12}sofa/iu, label: '放在沙发后方或后侧时，应尊重沙发遮挡、通行空间和组合关系。' },
    { pattern: /靠墙|贴墙|against.{0,8}wall|near.{0,8}wall/iu, label: '靠墙摆放时，应保持合理离墙距离、落地关系和空间留白。' },
    { pattern: /餐桌旁|餐桌边|餐桌附近|beside.{0,12}dining|near.{0,12}dining/iu, label: '餐桌旁摆放时，应形成可使用的餐区或辅助座位关系。' },
    { pattern: /窗边|窗旁|near.{0,8}window|by.{0,8}window/iu, label: '窗边摆放时，应顺应采光方向并保持视觉平衡。' },
    { pattern: /角落|墙角|corner/iu, label: '角落摆放时，应避免堵塞动线并利用空间边界形成自然归属。' },
    { pattern: /玄关处|玄关|entryway|foyer/iu, label: '玄关处摆放时，应符合入户动线和收纳/停留逻辑。' },
  ].filter(item => item.pattern.test(text)).map(item => item.label);
  if (relations.length === 0) return undefined;
  return joinPrompt([
    '识别到空间关系语义，请在自然摆放逻辑中优先体现：',
    ...relations.map(relation => `- ${relation}`),
  ]);
}

function readObjectInsertPositionConstraintStrength(config: object | undefined): string {
  const nested = readConfigValue(config, 'objectInsert');
  const nestedValue = isRecord(nested) ? readConfigString(nested, 'positionConstraintStrength') : '';
  const value = nestedValue || readConfigString(config, 'positionConstraintStrength');
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'high';
}

function buildObjectPlacementPrompt(config: object | undefined): string | undefined {
  const placement = readConfigValue(config, 'objectPlacement');
  if (!placement || typeof placement !== 'object' || Array.isArray(placement)) return undefined;
  const record = placement as Record<string, unknown>;
  const x = readFiniteNumber(record.x);
  const y = readFiniteNumber(record.y);
  const width = readFiniteNumber(record.width);
  const height = readFiniteNumber(record.height);
  const rotation = readFiniteNumber(record.rotation);
  if ([x, y, width, height, rotation].every(value => value === undefined)) return undefined;
  const sourceWidth = readFiniteNumber(readConfigValue(config, 'sourceImageWidth'));
  const sourceHeight = readFiniteNumber(readConfigValue(config, 'sourceImageHeight'));
  const normalized = buildNormalizedPlacementMetadata({ x, y, width, height, rotation, sourceWidth, sourceHeight });
  const strength = readObjectInsertPositionConstraintStrength(config);
  const placementMode = readObjectInsertPlacementMode(config);
  const metadataInstruction = placementMode === 'natural'
    ? 'Use this metadata as a suggested target area and approximate size range. The final furniture position, orientation, and scale may be adjusted nearby for layout harmony, circulation, perspective, occlusion, and composition.'
    : strength === 'low'
    ? 'Use this metadata together with the placement guide and mask. The generated chair may make small natural placement corrections near this area when required by perspective, floor contact, or occlusion.'
    : strength === 'medium'
      ? 'Use this metadata together with the placement guide and mask. The generated chair should remain closely centered, sized, and rotated according to these values, with only small natural corrections.'
      : 'Use this metadata together with the placement guide and mask. The generated chair should remain centered, sized, and rotated according to these values and must not drift outside the guided / masked area.';
  return [
    `Placement metadata in source-image pixels: x=${formatPlacementNumber(x)}, y=${formatPlacementNumber(y)}, width=${formatPlacementNumber(width)}, height=${formatPlacementNumber(height)}, rotation=${formatPlacementNumber(rotation)} degrees.`,
    normalized,
    metadataInstruction,
  ].filter((part): part is string => Boolean(part)).join('\n');
}

function buildPanoramaReferencePrompt(config: object | undefined): string | undefined {
  const referenceAssetIds = readStringArray(config, 'panoramaReferenceAssetIds');
  if (referenceAssetIds.length === 0) return undefined;

  const referenceTypes = readStringArray(config, 'panoramaReferenceTypes').slice(0, referenceAssetIds.length);
  const strength = readConfigString(config, 'panoramaReferenceStrength') || 'medium';
  const referenceTypeSummary = referenceTypes.length > 0
    ? referenceTypes.map((type, index) => `Image ${index + 2}: ${panoramaReferenceTypeLabels[type] || type}`).join('; ')
    : `Images 2-${referenceAssetIds.length + 1}: reference images`;
  const strengthInstruction = strength === 'low'
    ? 'Reference strength: low. Use references gently; keep the source panorama dominant.'
    : strength === 'high'
      ? 'Reference strength: high. Strongly borrow material, style, lighting, furniture, and functional cues while still preserving the first panorama structure exactly.'
      : 'Reference strength: medium. Apply references clearly but conservatively; keep the first panorama structure and major elements dominant.';

  return joinPrompt([
    'Reference-guided panorama mode is enabled.',
    'Image 1 is the source 360 equirectangular panorama and is the only authority for geometry, composition, camera position, room boundaries, openings, wall/ceiling/floor layout, and main spatial organization.',
    'Images 2-N are reference images only. Use them for materials, style, lighting, furniture, atmosphere, and space function cues; do not copy their camera angle, composition, unrelated objects, or background.',
    'If a reference is a floor plan, use it only to understand spatial relationships and functional zoning; never render the final output as a floor plan, blueprint, top-down plan, line drawing, collage, or split-screen image.',
    'The final output must remain a cinematic realistic architectural/interior 360 panorama with strict 2:1 equirectangular aspect ratio and continuous 360-degree coverage.',
    referenceTypeSummary,
    strengthInstruction,
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

  if (input.mode === 'object-insert') {
    return buildObjectInsertPrompt(input, input.userPrompt || '');
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

  if (mode === 'object-insert') {
    if (strength === 'weak') return 'Change strength: weak. Keep the source image highly stable and only integrate the inserted object with minimal surrounding adjustment.';
    if (strength === 'strong') return 'Change strength: strong. Integrate the object with more complete lighting, shadow, material, and occlusion reconstruction while preserving all unrelated areas.';
    return 'Change strength: medium. Naturally integrate the object with clear but restrained lighting, shadow, scale, perspective, and material matching.';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function formatPlacementNumber(value: number | undefined): string {
  return value === undefined ? 'unknown' : String(Number(value.toFixed(2)));
}

function buildNormalizedPlacementMetadata(input: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  sourceWidth?: number;
  sourceHeight?: number;
}): string | undefined {
  if (!input.sourceWidth || !input.sourceHeight || !input.width || !input.height || input.x === undefined || input.y === undefined) return undefined;
  const centerX = (input.x + input.width / 2) / input.sourceWidth;
  const centerY = (input.y + input.height / 2) / input.sourceHeight;
  const widthRatio = input.width / input.sourceWidth;
  const heightRatio = input.height / input.sourceHeight;
  return [
    'Normalized placement metadata:',
    `centerX=${formatRatio(centerX)}`,
    `centerY=${formatRatio(centerY)}`,
    `widthRatio=${formatRatio(widthRatio)}`,
    `heightRatio=${formatRatio(heightRatio)}`,
    `rotation=${formatPlacementNumber(input.rotation)} degrees`,
  ].join(' ');
}

function formatRatio(value: number): string {
  return String(Number(value.toFixed(4)));
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
