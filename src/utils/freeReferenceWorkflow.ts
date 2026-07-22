import type {
  FreeReferenceAspectRatio,
  FreeReferenceReference,
  FreeReferenceRole,
  FreeReferenceStructureControl,
} from '../types';

export const freeReferenceAspectRatioOptions: Array<{ value: Exclude<FreeReferenceAspectRatio, '3:4'>; label: string }> = [
  { value: 'source', label: '跟随原图' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '2:1', label: '2:1' },
];

export const freeReferenceStylePresets = [
  { id: 'modern-minimal', label: '现代极简', promptHint: '现代极简，克制配色，干净线条，精致材质与自然光。' },
  { id: 'warm-wood', label: '温润木质', promptHint: '温润木质空间，自然纹理，柔和暖光，舒适且高级。' },
  { id: 'wabi-sabi', label: '侘寂', promptHint: '侘寂风格，质朴肌理，低饱和自然色，安静克制。' },
  { id: 'nordic', label: '北欧', promptHint: '北欧风格，明亮自然光，浅木与中性色，轻盈舒适。' },
  { id: 'light-luxury', label: '轻奢', promptHint: '现代轻奢，精致石材和金属细节，层次照明，克制高级。' },
  { id: 'premium-gray', label: '高级灰', promptHint: '高级灰色调，细腻材质层次，低饱和、沉稳且专业。' },
] as const;

const roleLabels: Record<FreeReferenceRole, string> = {
  style: '风格',
  material: '材质',
  furniture: '家具',
  lighting: '灯光',
  composition: '构图',
  color: '色彩',
  detail: '细节',
};

const structureLabels: Record<FreeReferenceStructureControl, string> = {
  strict: '严格保持原图结构、空间关系和相机，只迁移明确指定的参考特征。',
  balanced: '保持主要结构和相机，允许为效果做小幅合理优化。',
  creative: '保留空间识别与主体关系，允许更明显的风格化变化。',
};

export function buildFreeReferenceTargetSize(
  resolution: 1024 | 1536 | 2048,
  aspectRatio: FreeReferenceAspectRatio,
  source?: { width?: number; height?: number } | null,
): { width: number; height: number; aspectRatio: string } {
  let ratio = aspectRatio;
  let widthRatio: number;
  let heightRatio: number;
  if (aspectRatio === 'source') {
    widthRatio = source?.width && source?.height ? source.width : 1;
    heightRatio = source?.width && source?.height ? source.height : 1;
    ratio = `${widthRatio}:${heightRatio}` as FreeReferenceAspectRatio;
  } else {
    [widthRatio, heightRatio] = aspectRatio.split(':').map(Number);
  }
  if (!widthRatio || !heightRatio) return { width: resolution, height: resolution, aspectRatio: '1:1' };
  return widthRatio >= heightRatio
    ? { width: resolution, height: Math.round(resolution * heightRatio / widthRatio), aspectRatio: ratio }
    : { width: Math.round(resolution * widthRatio / heightRatio), height: resolution, aspectRatio: ratio };
}

export function readFreeReferenceRoleLabel(role: FreeReferenceRole): string {
  return roleLabels[role];
}

export function buildFreeReferenceRoleSummary(reference: Pick<FreeReferenceReference, 'role' | 'strength' | 'weight' | 'focusArea' | 'focusDescription'>): string {
  const weight = typeof reference.weight === 'number' ? reference.weight : reference.strength === 'high' ? 85 : reference.strength === 'low' ? 30 : 60;
  const focus = reference.focusArea === 'custom' && reference.focusDescription?.trim()
    ? `，关注“${reference.focusDescription.trim()}”`
    : reference.focusArea && reference.focusArea !== 'full'
      ? `，关注${readFocusAreaLabel(reference.focusArea)}`
      : '';
  return `${roleLabels[reference.role]}参考 · 权重 ${weight}%${focus}`;
}

export function buildFreeReferenceControlPrompt(
  references: FreeReferenceReference[],
  structureControl: FreeReferenceStructureControl = 'balanced',
  stylePromptHint?: string,
): string {
  return [
    structureLabels[structureControl],
    stylePromptHint?.trim() ? `快速风格方向：${stylePromptHint.trim()}` : '',
    references.length > 0 ? '参考图角色摘要：' : '',
    ...references.map((reference, index) => `Image ${index + 2}: ${buildFreeReferenceRoleSummary(reference)}。只提取该角色相关信息，不要复制无关内容。`),
  ].filter(Boolean).join('\n');
}

export function findFreeReferenceConflicts(references: FreeReferenceReference[]): string[] {
  const warnings: string[] = [];
  const strongByRole = new Map<FreeReferenceRole, number>();
  references.forEach(reference => {
    const weight = typeof reference.weight === 'number' ? reference.weight : reference.strength === 'high' ? 85 : reference.strength === 'low' ? 30 : 60;
    if (weight >= 75) strongByRole.set(reference.role, (strongByRole.get(reference.role) || 0) + 1);
  });
  strongByRole.forEach((count, role) => {
    if (count > 1) warnings.push(`${roleLabels[role]}参考中有 ${count} 张高权重图片，若视觉方向不同可能互相冲突。`);
  });
  const totalWeight = references.reduce((sum, item) => sum + (item.weight ?? (item.strength === 'high' ? 85 : item.strength === 'low' ? 30 : 60)), 0);
  if (references.length >= 4 && totalWeight / references.length >= 75) warnings.push('高权重参考图较多，建议降低次要参考的权重以突出主方向。');
  return warnings;
}

function readFocusAreaLabel(value: NonNullable<FreeReferenceReference['focusArea']>): string {
  if (value === 'center') return '中心区域';
  if (value === 'foreground') return '前景';
  if (value === 'background') return '背景';
  if (value === 'left') return '左侧';
  if (value === 'right') return '右侧';
  return '指定区域';
}
