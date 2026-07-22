import { describe, expect, it } from 'vitest';
import {
  normalizeReplacementTarget,
  readEditingScopeLabel,
  readReplacementStrategyLabel,
  replacementTargets,
  resolveEditingScope,
  resolveReplacementStrategy,
  resolveReplacementTargetFromConfig,
  toMaterialReplaceTargetObject,
} from './materialReplacementTarget';

describe('material replacement target adapter', () => {
  it('exposes the seven formal replacement targets', () => {
    expect(replacementTargets).toEqual([
      'plant',
      'wall',
      'floor',
      'furniture',
      'lighting',
      'artwork',
      'decor',
    ]);
  });

  it('maps UI and legacy target values to a single replacement target', () => {
    expect(normalizeReplacementTarget('wall')).toBe('wall');
    expect(normalizeReplacementTarget('floor')).toBe('floor');
    expect(normalizeReplacementTarget('table-chair')).toBe('furniture');
    expect(normalizeReplacementTarget('sofa')).toBe('furniture');
    expect(normalizeReplacementTarget('cabinet')).toBe('furniture');
    expect(normalizeReplacementTarget('plant')).toBe('plant');
    expect(normalizeReplacementTarget('lighting')).toBe('lighting');
    expect(normalizeReplacementTarget('artwork')).toBe('artwork');
    expect(normalizeReplacementTarget('decor')).toBe('decor');
    expect(normalizeReplacementTarget('feature-wall')).toBe('wall');
    expect(normalizeReplacementTarget('other')).toBe('decor');
    expect(normalizeReplacementTarget('custom')).toBe('decor');
  });

  it('does not silently fall back invalid values to floor', () => {
    expect(normalizeReplacementTarget('surface')).toBeNull();
    expect(normalizeReplacementTarget('material')).toBeNull();
    expect(normalizeReplacementTarget(undefined)).toBeNull();
  });

  it('prefers explicit replacementTarget but keeps legacy targetObjectType compatibility', () => {
    expect(resolveReplacementTargetFromConfig({ replacementTarget: 'furniture', targetObjectType: 'floor' })).toBe('furniture');
    expect(resolveReplacementTargetFromConfig({ targetObjectType: 'table-chair' })).toBe('furniture');
    expect(resolveReplacementTargetFromConfig({ targetObjectType: 'feature-wall' })).toBe('wall');
  });

  it('maps normalized targets back to backend-compatible object types', () => {
    expect(toMaterialReplaceTargetObject('furniture')).toBe('table-chair');
    expect(toMaterialReplaceTargetObject('plant')).toBe('plant');
    expect(toMaterialReplaceTargetObject('lighting')).toBe('lighting');
    expect(toMaterialReplaceTargetObject('artwork')).toBe('artwork');
    expect(toMaterialReplaceTargetObject('decor')).toBe('decor');
    expect(toMaterialReplaceTargetObject('wall')).toBe('wall');
  });

  it('derives editing scope and replacement strategy from confirmed mask state', () => {
    expect(resolveEditingScope(false)).toBe('semantic-auto');
    expect(resolveEditingScope(true)).toBe('masked');
    expect(resolveReplacementStrategy('semantic-auto')).toBe('replace-existing');
    expect(resolveReplacementStrategy('masked')).toBe('replace-masked');
    expect(readEditingScopeLabel('semantic-auto')).toBe('自动识别');
    expect(readEditingScopeLabel('masked', 'smart')).toBe('智能Mask');
    expect(readReplacementStrategyLabel('replace-existing')).toBe('原位替换');
    expect(readReplacementStrategyLabel('replace-masked')).toBe('Mask内原位替换');
  });
});
