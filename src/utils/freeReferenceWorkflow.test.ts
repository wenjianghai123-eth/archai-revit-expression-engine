import { describe, expect, it } from 'vitest';
import {
  buildFreeReferenceControlPrompt,
  buildFreeReferenceTargetSize,
  findFreeReferenceConflicts,
} from './freeReferenceWorkflow';

describe('free reference workflow', () => {
  it('supports source and product aspect ratios', () => {
    expect(buildFreeReferenceTargetSize(1024, 'source', { width: 1600, height: 900 })).toMatchObject({ width: 1024, height: 576 });
    expect(buildFreeReferenceTargetSize(1024, '3:2')).toMatchObject({ width: 1024, height: 683, aspectRatio: '3:2' });
    expect(buildFreeReferenceTargetSize(1024, '2:1')).toMatchObject({ width: 1024, height: 512, aspectRatio: '2:1' });
  });

  it('compiles role, weight, focus and structure controls', () => {
    const prompt = buildFreeReferenceControlPrompt([{
      assetId: 'asset-1', role: 'material', strength: 'high', weight: 90, focusArea: 'custom', focusDescription: '木饰面',
    }], 'strict', '现代极简');
    expect(prompt).toContain('严格保持原图结构');
    expect(prompt).toContain('材质参考 · 权重 90%');
    expect(prompt).toContain('木饰面');
    expect(prompt).toContain('现代极简');
  });

  it('warns about competing high-weight references', () => {
    const warnings = findFreeReferenceConflicts([
      { assetId: 'a', role: 'style', strength: 'high', weight: 90 },
      { assetId: 'b', role: 'style', strength: 'high', weight: 80 },
    ]);
    expect(warnings[0]).toContain('互相冲突');
  });
});
