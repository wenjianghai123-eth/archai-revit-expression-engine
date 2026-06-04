export interface PlanColorizeStyleOption {
  id: string;
  name: string;
  description: string;
  promptHint: string;
}

export const maxPlanColorizeBatchCount = 6;

export const defaultPlanColorizeStyleId = 'modern-minimal-plan';

export const planColorizeStyleOptions: PlanColorizeStyleOption[] = [
  {
    id: 'modern-minimal-plan',
    name: '现代简约彩平',
    description: '清爽留白、低对比材质、功能分区明确。',
    promptHint: 'Use a modern minimalist colored floor plan style with clean neutral colors, crisp linework, restrained furniture fills, and clear functional zoning.',
  },
  {
    id: 'warm-wood-plan',
    name: '暖色木质彩平',
    description: '暖木色、柔和织物、居住氛围更亲和。',
    promptHint: 'Use warm wood tones, soft beige fabrics, gentle lighting cues, and cozy residential material expression while keeping the original plan geometry unchanged.',
  },
  {
    id: 'premium-gray-plan',
    name: '高级灰彩平',
    description: '灰阶石材、金属细节、克制高级感。',
    promptHint: 'Use a premium gray palette with refined stone, subtle metal accents, controlled contrast, and elegant material hierarchy for a high-end colored plan.',
  },
  {
    id: 'nordic-fresh-plan',
    name: '北欧清新彩平',
    description: '浅木、低饱和色、明亮自然的表达。',
    promptHint: 'Use a Nordic fresh colored plan style with light timber, muted pastel accents, bright daylight feeling, simple furniture, and readable room zoning.',
  },
  {
    id: 'commercial-display-plan',
    name: '商业展示彩平',
    description: '展示动线强、重点区域清楚、适合汇报。',
    promptHint: 'Use a commercial presentation colored plan style with clear circulation, stronger key-area emphasis, polished retail or exhibition material fills, and presentation-ready contrast.',
  },
  {
    id: 'landscape-analysis-plan',
    name: '景观分析彩平',
    description: '绿化、水体、铺装和户外节点表达更强。',
    promptHint: 'Use a landscape analysis colored plan style with planting, paving, lawn, water, outdoor furniture, soft shadows, and clear landscape-function distinction.',
  },
  {
    id: 'muted-art-plan',
    name: '低饱和艺术彩平',
    description: '柔和色系、艺术化材质纹理、视觉更安静。',
    promptHint: 'Use a muted artistic colored plan style with low-saturation colors, subtle paper-like texture, soft material fills, and refined quiet visual composition.',
  },
  {
    id: 'bright-sales-plan',
    name: '明亮销售展示彩平',
    description: '高可读、明亮饱满、适合营销展示。',
    promptHint: 'Use a bright sales-presentation colored plan style with clean vivid colors, high readability, polished furniture fills, clear room identity, and attractive marketing-style presentation.',
  },
];

export function findPlanColorizeStyle(id: unknown): PlanColorizeStyleOption | undefined {
  return typeof id === 'string'
    ? planColorizeStyleOptions.find(style => style.id === id)
    : undefined;
}

export function resolvePlanColorizeStyles(ids: unknown, fallbackId: unknown = defaultPlanColorizeStyleId): PlanColorizeStyleOption[] {
  const requestedIds = Array.isArray(ids)
    ? ids.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : typeof ids === 'string' && ids.trim().length > 0
      ? [ids]
      : [];
  const resolved: PlanColorizeStyleOption[] = [];

  for (const id of requestedIds) {
    const style = findPlanColorizeStyle(id);
    if (style && !resolved.some(item => item.id === style.id)) {
      resolved.push(style);
    }
    if (resolved.length >= maxPlanColorizeBatchCount) break;
  }

  if (resolved.length > 0) return resolved;
  return [findPlanColorizeStyle(fallbackId) || planColorizeStyleOptions[0]];
}
