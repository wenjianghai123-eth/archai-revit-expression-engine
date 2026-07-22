import { getDesignVariantPack } from '../constants/designVariantPacks';
import type {
  DesignVariantBatchCount,
  DesignVariantDiversity,
  DesignVariantMatrixItem,
  DesignVariantVariableKey,
  DesignVariantVariableValues,
  VariantStyleKey,
} from '../types';

export const designVariantVariableDefinitions: Array<{ key: DesignVariantVariableKey; label: string }> = [
  { key: 'material-system', label: '材质体系' },
  { key: 'color-system', label: '色彩体系' },
  { key: 'lighting-atmosphere', label: '灯光氛围' },
  { key: 'furniture-style', label: '家具样式' },
  { key: 'furniture-layout', label: '家具布局' },
  { key: 'soft-decoration-richness', label: '软装丰富度' },
  { key: 'brand-character', label: '品牌气质' },
  { key: 'overall-design-style', label: '整体设计风格' },
];

export const designVariantVariableKeys = new Set<DesignVariantVariableKey>(designVariantVariableDefinitions.map(item => item.key));

export function isDesignVariantVariableKey(value: unknown): value is DesignVariantVariableKey {
  return typeof value === 'string' && designVariantVariableKeys.has(value as DesignVariantVariableKey);
}

const fallbackSeeds: Record<DesignVariantVariableKey, string[]> = {
  'material-system': ['浅色石材 + 木饰面', '暖白涂料 + 织物', '微水泥 + 原木', '石材 + 金属', '自然木 + 亚麻', '灰色石材 + 深色金属', '混凝土 + 黑钢', '深木 + 高品质石材'],
  'color-system': ['黑白灰与暖木', '奶油米白', '低饱和大地色', '暖灰与金属点缀', '浅木与自然绿', '高级灰', '深灰高对比', '暖棕与米金'],
  'lighting-atmosphere': ['明亮均匀自然光', '柔和暖光', '克制漫射光', '层次重点照明', '自然日光', '中性专业光', '戏剧性明暗对比', '酒店式暖光层次'],
  'furniture-style': ['简洁现代家具', '圆润柔软家具', '低矮自然家具', '精致轻奢家具', '原木休闲家具', '理性几何家具', '工业混搭家具', '典雅酒店家具'],
  'furniture-layout': ['保持原布局并优化间距', '围合式交流布局', '留白型松弛布局', '中心焦点布局', '面向采光布局', '轴线清晰布局', '灵活混合布局', '礼序对称布局'],
  'soft-decoration-richness': ['少量点缀', '适度丰富', '克制留白', '丰富精致', '自然适中', '少而有序', '个性丰富', '完整陈设'],
  'brand-character': ['克制专业', '亲和柔软', '自然松弛', '精致高级', '健康自然', '理性稳重', '个性先锋', '典雅礼序'],
  'overall-design-style': ['现代极简', '奶油风', '侘寂', '轻奢', '自然木质', '高级灰', '工业风', '酒店大堂风'],
};

const styleLabels: Record<string, string> = {
  'modern-minimal': '现代极简',
  'cream-style': '奶油风',
  'wabi-sabi': '侘寂',
  'light-luxury': '轻奢',
  'natural-wood': '自然木质',
  'premium-gray': '高级灰',
  industrial: '工业风',
  'hotel-lobby': '酒店大堂风',
  'commercial-showroom': '商业展示风',
  'office-space': '办公空间风',
  custom: '自定义风格',
};

interface DesignVariantMatrixConfigLike {
  stylePackId?: unknown;
  variantStyles?: unknown;
  variantNames?: unknown;
  variantDiversity?: unknown;
  variantMatrixVariables?: unknown;
  variantVariableLocks?: unknown;
  variantMatrix?: unknown;
  parentResultId?: unknown;
  parentJobId?: unknown;
}

export function readDesignVariantDiversity(value: unknown): DesignVariantDiversity {
  return value === 'low' || value === 'high' ? value : 'balanced';
}

export function resolveDesignVariantMatrix(
  config: DesignVariantMatrixConfigLike,
  batchCount: DesignVariantBatchCount,
): DesignVariantMatrixItem[] {
  const pack = getDesignVariantPack(typeof config.stylePackId === 'string' ? config.stylePackId : undefined);
  const diversity = readDesignVariantDiversity(config.variantDiversity);
  const activeKeys = readVariableKeys(config.variantMatrixVariables, designVariantVariableDefinitions.map(item => item.key));
  const lockedKeys = readVariableKeys(config.variantVariableLocks, []);
  const changedKeys = activeKeys.filter(key => !lockedKeys.includes(key));
  const styles = Array.isArray(config.variantStyles) ? config.variantStyles.filter((value): value is VariantStyleKey => typeof value === 'string') : pack.styles;
  const names = Array.isArray(config.variantNames) ? config.variantNames.filter((value): value is string => typeof value === 'string') : [];
  const existing = Array.isArray(config.variantMatrix) ? config.variantMatrix.filter(isMatrixRecord) : [];

  return Array.from({ length: batchCount }, (_, index) => {
    const sourceIndex = diversity === 'low' ? Math.floor(index / 2) : diversity === 'high' ? (index * 3) % 8 : index;
    const existingItem = existing.find(item => item.variantIndex === index);
    const values = buildVariableValues(pack.variableSeeds, styles[index], sourceIndex, existingItem?.values);
    const itemChanged = readVariableKeys(existingItem?.changedVariables, changedKeys).filter(key => !lockedKeys.includes(key));
    const itemLocked = readVariableKeys(existingItem?.lockedVariables, lockedKeys);
    const differenceSummary = buildDifferenceSummary(values, itemChanged);
    const name = names[index]?.trim() || `方案 ${String.fromCharCode(65 + index)}`;
    return {
      variantIndex: index,
      changedVariables: itemChanged,
      lockedVariables: itemLocked,
      values,
      description: readShortText(existingItem?.description) || `${name}以${readVariableValue(values, 'overall-design-style')}为整体方向，重点调整${itemChanged.map(readDesignVariantVariableLabel).join('、') || '方案细节'}。`,
      differenceSummary: readShortText(existingItem?.differenceSummary) || differenceSummary,
      parentResultId: readOptionalString(existingItem?.parentResultId) || readOptionalString(config.parentResultId),
      parentJobId: readOptionalString(existingItem?.parentJobId) || readOptionalString(config.parentJobId),
    };
  });
}

export function buildDesignVariantMatrixPrompt(item: DesignVariantMatrixItem, diversity: DesignVariantDiversity): string {
  const changed = item.changedVariables.map(key => `${readDesignVariantVariableLabel(key)}=${readVariableValue(item.values, key)}`).join('; ');
  const locked = item.lockedVariables.map(key => `${readDesignVariantVariableLabel(key)}=${readVariableValue(item.values, key)}`).join('; ');
  return [
    `Design-variable matrix for this option. Diversity intensity: ${diversity}.`,
    changed ? `Variables that must change in this option: ${changed}.` : 'No design variable is explicitly requested to change; keep the option conservative.',
    locked ? `Locked design variables that must remain stable: ${locked}.` : '',
    `Difference from the source: ${item.differenceSummary}`,
    `Option explanation: ${item.description}`,
  ].filter(Boolean).join(' ');
}

export function buildDesignVariantReportNarrative(item: DesignVariantMatrixItem, name: string): string {
  const changes = item.changedVariables.map(key => `${readDesignVariantVariableLabel(key)}采用“${readVariableValue(item.values, key)}”`).join('，');
  const locks = item.lockedVariables.length > 0 ? `锁定${item.lockedVariables.map(readDesignVariantVariableLabel).join('、')}` : '保持既定结构和关键设计条件';
  return `${name}：${changes || item.differenceSummary}；${locks}。该方案适合用于比较${item.changedVariables.map(readDesignVariantVariableLabel).join('、') || '整体设计方向'}对空间表达的影响。`;
}

export function findSimilarDesignVariantPairs(items: DesignVariantMatrixItem[]): Array<{ leftIndex: number; rightIndex: number; similarity: number }> {
  const pairs: Array<{ leftIndex: number; rightIndex: number; similarity: number }> = [];
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const keys = Array.from(new Set([...items[left].changedVariables, ...items[right].changedVariables]));
      if (keys.length === 0) continue;
      const same = keys.filter(key => readVariableValue(items[left].values, key) === readVariableValue(items[right].values, key)).length;
      const similarity = same / keys.length;
      if (similarity >= 0.72) pairs.push({ leftIndex: left, rightIndex: right, similarity });
    }
  }
  return pairs;
}

export function readDesignVariantVariableLabel(key: DesignVariantVariableKey): string {
  return designVariantVariableDefinitions.find(item => item.key === key)?.label || key;
}

function buildVariableValues(
  packSeeds: Partial<Record<DesignVariantVariableKey, string[]>>,
  style: VariantStyleKey | undefined,
  index: number,
  existing: unknown,
): DesignVariantVariableValues {
  const existingValues = isRecord(existing) ? existing : {};
  return Object.fromEntries(designVariantVariableDefinitions.map(({ key }) => {
    const previous = readOptionalString(existingValues[key]);
    if (previous) return [key, previous];
    if (key === 'overall-design-style' && style) return [key, styleLabels[style] || style];
    const seeds = packSeeds[key]?.length ? packSeeds[key] : fallbackSeeds[key];
    return [key, seeds[index % seeds.length]];
  })) as DesignVariantVariableValues;
}

function buildDifferenceSummary(values: DesignVariantVariableValues, keys: DesignVariantVariableKey[]): string {
  if (keys.length === 0) return '相对原图仅做克制的细节优化。';
  return `相对原图重点改变：${keys.map(key => `${readDesignVariantVariableLabel(key)}为“${readVariableValue(values, key)}”`).join('；')}。`;
}

function readVariableValue(values: DesignVariantVariableValues, key: DesignVariantVariableKey): string {
  return values[key]?.trim() || '保持原图';
}

function readVariableKeys(value: unknown, fallback: DesignVariantVariableKey[]): DesignVariantVariableKey[] {
  if (!Array.isArray(value)) return [...fallback];
  return Array.from(new Set(value.filter(isDesignVariantVariableKey)));
}

function isMatrixRecord(value: unknown): value is Record<string, unknown> & { variantIndex: number } {
  return isRecord(value) && typeof value.variantIndex === 'number' && Number.isFinite(value.variantIndex);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readShortText(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 500) : '';
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
