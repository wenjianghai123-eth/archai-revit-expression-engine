import type {
  GenerationConfig,
  MaterialMaskSelectionMode,
  MaterialReplaceTargetObject,
  MaterialReplacementEditingScope,
  ReplacementStrategy,
  ReplacementTarget,
} from '../types';

export type {
  MaterialReplacementEditingScope,
  ReplacementStrategy,
  ReplacementTarget,
};

export const replacementTargets: readonly ReplacementTarget[] = [
  'plant',
  'wall',
  'floor',
  'furniture',
  'lighting',
  'artwork',
  'decor',
];

const replacementTargetSet = new Set<ReplacementTarget>(replacementTargets);

const materialTargetObjects = new Set<MaterialReplaceTargetObject>([
  'floor',
  'wall',
  'ceiling',
  'cabinet',
  'sofa',
  'table-chair',
  'lighting',
  'plant',
  'artwork',
  'decor',
  'door-window',
  'feature-wall',
  'other',
]);

const legacyTargetAliases: Record<string, ReplacementTarget> = {
  floor: 'floor',
  wall: 'wall',
  'feature-wall': 'wall',
  ceiling: 'wall',
  cabinet: 'furniture',
  sofa: 'furniture',
  chair: 'furniture',
  table: 'furniture',
  'table-chair': 'furniture',
  furniture: 'furniture',
  'door-window': 'furniture',
  plant: 'plant',
  greenery: 'plant',
  lighting: 'lighting',
  light: 'lighting',
  lamp: 'lighting',
  artwork: 'artwork',
  art: 'artwork',
  painting: 'artwork',
  decor: 'decor',
  decoration: 'decor',
  ornament: 'decor',
  accessory: 'decor',
  other: 'decor',
  custom: 'decor',
};

const targetLabels: Record<ReplacementTarget, string> = {
  plant: '绿植',
  wall: '墙面',
  floor: '地面',
  furniture: '桌椅 / 家具',
  lighting: '灯具',
  artwork: '装饰画',
  decor: '摆件',
};

export function normalizeMaterialReplaceTargetObject(value: unknown): MaterialReplaceTargetObject | null {
  return typeof value === 'string' && materialTargetObjects.has(value as MaterialReplaceTargetObject)
    ? value as MaterialReplaceTargetObject
    : null;
}

export function normalizeReplacementTarget(value: unknown): ReplacementTarget | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim();
  if (replacementTargetSet.has(normalized as ReplacementTarget)) return normalized as ReplacementTarget;
  return legacyTargetAliases[normalized] || null;
}

export function resolveReplacementTargetFromConfig(config: { replacementTarget?: unknown; targetObjectType?: unknown }): ReplacementTarget | null {
  return normalizeReplacementTarget(config.replacementTarget) || normalizeReplacementTarget(config.targetObjectType);
}

export function toMaterialReplaceTargetObject(target: ReplacementTarget): MaterialReplaceTargetObject {
  if (target === 'furniture') return 'table-chair';
  return target;
}

export function readReplacementTargetLabel(target: ReplacementTarget | null | undefined): string {
  return target ? targetLabels[target] : '未选择';
}

export function resolveEditingScope(hasConfirmedMask: boolean): MaterialReplacementEditingScope {
  return hasConfirmedMask ? 'masked' : 'semantic-auto';
}

export function resolveReplacementStrategy(scope: MaterialReplacementEditingScope): ReplacementStrategy {
  return scope === 'masked' ? 'replace-masked' : 'replace-existing';
}

export function readEditingScopeLabel(
  scope: MaterialReplacementEditingScope | null | undefined,
  maskSelectionMode?: MaterialMaskSelectionMode,
): string {
  if (scope === 'masked') return maskSelectionMode === 'smart' ? '智能Mask' : '精致涂抹';
  if (scope === 'semantic-auto') return '自动识别';
  return '未确认';
}

export function readReplacementStrategyLabel(strategy: ReplacementStrategy | null | undefined): string {
  if (strategy === 'replace-masked') return 'Mask内原位替换';
  if (strategy === 'replace-existing') return '原位替换';
  return '未确认';
}

export function resolveReplacementStrategyFromConfig(
  config: Pick<GenerationConfig, 'editingScope' | 'replacementStrategy'>,
  hasConfirmedMask: boolean,
): ReplacementStrategy {
  if (config.replacementStrategy === 'replace-existing' || config.replacementStrategy === 'replace-masked') {
    return config.replacementStrategy;
  }
  return resolveReplacementStrategy(
    config.editingScope === 'masked' || config.editingScope === 'semantic-auto'
      ? config.editingScope
      : resolveEditingScope(hasConfirmedMask),
  );
}
