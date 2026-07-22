export type FloorplanMultiPlanMode = 'single' | 'multi';
export type FloorplanVariantType = 'material_style' | 'furniture_layout' | 'mixed';
export type FloorplanVariantFocus = 'material_style' | 'furniture_layout' | 'both';
export type FloorplanMultiPlanBatchCount = 1 | 2 | 4 | 6;

export interface FloorplanStyleTemplate {
  id: string;
  name: string;
  promptHint: string;
}

export interface FloorplanLayoutTemplate {
  id: string;
  name: string;
  promptHint: string;
}

export interface FloorplanColorTemplate {
  id: string;
  name: string;
  promptHint: string;
}

export interface FloorplanVariantPlan {
  variantIndex: number;
  variantName: string;
  selectedStyleId?: string;
  selectedStyleName?: string;
  stylePromptHint?: string;
  layoutVariantId?: string;
  layoutVariantName?: string;
  layoutPromptHint?: string;
}

export const floorplanStyleTemplates: FloorplanStyleTemplate[] = [
  {
    id: 'modern-wood',
    name: '现代木质',
    promptHint: '以温润木饰面、浅色石材、自然光和克制软装为主，形成现代舒适的三维彩平表达。',
  },
  {
    id: 'warm-light-luxury',
    name: '轻奢暖色',
    promptHint: '使用暖色石材、金属线条、柔和灯光和精致软装，突出轻奢品质与空间层次。',
  },
  {
    id: 'premium-gray',
    name: '高级灰',
    promptHint: '采用高级灰、微水泥、深浅石材和低饱和配色，强调冷静、克制、专业的设计感。',
  },
  {
    id: 'nordic-fresh',
    name: '北欧清新',
    promptHint: '以浅木色、白墙、柔和织物、绿植和清爽自然光表现明亮轻松的居住氛围。',
  },
  {
    id: 'commercial-display',
    name: '商业展示',
    promptHint: '强化展示面、清晰动线、重点照明和耐用材质，适合商业空间或样板展示。',
  },
  {
    id: 'muted-art',
    name: '低饱和艺术',
    promptHint: '使用低饱和色彩、艺术软装、细腻材质和柔和对比，形成有审美记忆点的空间表达。',
  },
];

export const floorplanLayoutTemplates: FloorplanLayoutTemplate[] = [
  {
    id: 'living-reception',
    name: '客厅会客型布局',
    promptHint: '客厅或公共区以会客交流为核心，沙发、茶几、单椅形成围合关系，家具朝向自然，动线保持顺畅。',
  },
  {
    id: 'home-comfort',
    name: '居家舒适型布局',
    promptHint: '家具布置更偏生活化和舒适使用，软装完整但不过度拥挤，强调日常居住尺度和温馨感。',
  },
  {
    id: 'display-arrangement',
    name: '展示陈列型布局',
    promptHint: '重点区域采用更清晰的陈列关系和视觉焦点，家具与装饰形成展示性构图，适合汇报呈现。',
  },
  {
    id: 'open-communication',
    name: '开放交流型布局',
    promptHint: '公共空间强调开放交流，家具朝向和组合关系更开放，保留通行空间与互动场景。',
  },
  {
    id: 'high-density-functional',
    name: '高密度功能型布局',
    promptHint: '在不改变墙体和功能边界的前提下增加功能性家具组合，保持比例协调、通行合理和空间可读性。',
  },
];

export const floorplanColorTemplates: FloorplanColorTemplate[] = [
  {
    id: 'residential-warm-wood',
    name: '住宅温馨木色',
    promptHint: 'Floorplan color template: warm residential wood palette. Use warm wood flooring, soft neutral walls, cozy residential furniture fills, restrained stone accents, and clear home-like functional zoning.',
  },
  {
    id: 'premium-light-luxury',
    name: '高端轻奢彩平',
    promptHint: 'Floorplan color template: premium light luxury. Use refined stone, warm metal accents, soft beige-gray palette, polished material hierarchy, and elegant presentation quality.',
  },
  {
    id: 'commercial-presentation',
    name: '商业汇报彩平',
    promptHint: 'Floorplan color template: commercial presentation. Emphasize display zones, public circulation, brand-facing material contrast, clear graphic hierarchy, and report-ready readability.',
  },
  {
    id: 'office-space',
    name: '办公空间彩平',
    promptHint: 'Floorplan color template: office workspace. Express workstations, meeting rooms, collaborative zones, reception, storage, circulation clarity, and professional neutral material systems.',
  },
  {
    id: 'landscape-masterplan',
    name: '景观总平彩平',
    promptHint: 'Floorplan color template: landscape masterplan. Use planting textures, paving hierarchy, water/green area distinction, outdoor circulation, site edges, and masterplan presentation clarity.',
  },
  {
    id: 'minimal-grayscale',
    name: '极简黑白灰彩平',
    promptHint: 'Floorplan color template: minimal grayscale. Use restrained black-white-gray fills, subtle material contrast, clean lines, minimal labels, and strong plan readability.',
  },
];

export function resolveFloorplanBatchCount(value: unknown): FloorplanMultiPlanBatchCount {
  return value === 2 || value === 4 || value === 6 ? value : 1;
}

export function resolveFloorplanVariantPlans(config: Record<string, unknown>, batchCount: number): FloorplanVariantPlan[] {
  const variantType = readFloorplanVariantType(config.floorplanVariantType);
  const names = Array.isArray(config.variantNames)
    ? config.variantNames.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const requestedStyleIds = Array.isArray(config.floorplanStyleTemplateIds)
    ? config.floorplanStyleTemplateIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  const requestedLayoutIds = Array.isArray(config.floorplanLayoutVariantIds)
    ? config.floorplanLayoutVariantIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  return Array.from({ length: Math.max(1, Math.min(6, Math.floor(batchCount))) }, (_, index) => {
    const style = variantType === 'furniture_layout'
      ? undefined
      : findFloorplanStyleTemplate(requestedStyleIds[index]) || floorplanStyleTemplates[index % floorplanStyleTemplates.length];
    const layout = variantType === 'material_style'
      ? undefined
      : findFloorplanLayoutTemplate(requestedLayoutIds[index]) || floorplanLayoutTemplates[index % floorplanLayoutTemplates.length];
    const styleName = style?.name;
    const layoutName = layout?.name;
    const defaultName = variantType === 'material_style'
      ? styleName || `材质方案 ${index + 1}`
      : variantType === 'furniture_layout'
        ? layoutName || `布局方案 ${index + 1}`
        : [styleName, layoutName].filter(Boolean).join(' + ') || `混合方案 ${index + 1}`;

    return {
      variantIndex: index,
      variantName: names[index] || defaultName,
      selectedStyleId: style?.id,
      selectedStyleName: styleName,
      stylePromptHint: style?.promptHint,
      layoutVariantId: layout?.id,
      layoutVariantName: layoutName,
      layoutPromptHint: layout?.promptHint,
    };
  });
}

export function findFloorplanStyleTemplate(id: unknown): FloorplanStyleTemplate | undefined {
  return typeof id === 'string' ? floorplanStyleTemplates.find(template => template.id === id) : undefined;
}

export function findFloorplanLayoutTemplate(id: unknown): FloorplanLayoutTemplate | undefined {
  return typeof id === 'string' ? floorplanLayoutTemplates.find(template => template.id === id) : undefined;
}

export function findFloorplanColorTemplate(id: unknown): FloorplanColorTemplate | undefined {
  return typeof id === 'string' ? floorplanColorTemplates.find(template => template.id === id) : undefined;
}

export function readFloorplanVariantType(value: unknown): FloorplanVariantType {
  return value === 'furniture_layout' || value === 'mixed' ? value : 'material_style';
}

export function readFloorplanVariantFocus(value: unknown): FloorplanVariantFocus {
  return value === 'furniture_layout' || value === 'both' ? value : 'material_style';
}
