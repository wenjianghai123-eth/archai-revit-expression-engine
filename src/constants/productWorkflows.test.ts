import { describe, expect, it } from 'vitest';
import { GenerationStep } from '../types';
import { getResultRecommendations, getScenarioWorkflow, scenarioWorkflows, workflowCategories } from './productWorkflows';

describe('scenario entrances', () => {
  it('defines the four product scenarios with a valid first step and follow-up flow', () => {
    expect(scenarioWorkflows.map(scenario => scenario.title)).toEqual([
      '快速做汇报',
      '客户连续改稿',
      '多方案比选',
      '白模快速出图',
    ]);
    expect(scenarioWorkflows.every(scenario => scenario.entryStep > 0 && scenario.steps.length >= 3)).toBe(true);
    expect(getScenarioWorkflow('white-model-render')?.entryStep).toBe(GenerationStep.ModelSnapshotRender);
  });

  it('keeps the three requested workflow groups', () => {
    expect(workflowCategories).toEqual(['快速形成方案', '精细修改方案', '形成交付成果']);
  });
});

describe('recommended next steps', () => {
  it('uses the existing result forwarding steps for floor plan and reference image results', () => {
    expect(getResultRecommendations(GenerationStep.FloorplanTo3D)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'send', targetStep: GenerationStep.DesignVariants }),
      expect.objectContaining({ kind: 'send', targetStep: GenerationStep.FreeReferenceImage }),
    ]));
    expect(getResultRecommendations(GenerationStep.FreeReferenceImage)).toHaveLength(3);
  });

  it('reuses secondary editing and exposes delivery actions where requested', () => {
    expect(getResultRecommendations(GenerationStep.MaterialReplace)).toContainEqual(expect.objectContaining({ kind: 'secondary', action: 'continue-edit' }));
    expect(getResultRecommendations(GenerationStep.ImagePolish).map(item => item.label)).toEqual(['下载', '分享', 'PDF 汇报']);
  });
});
