import { describe, expect, it } from 'vitest';
import { GenerationStep } from '../types';
import {
  designWorkflowStages,
  getDesignWorkflowStageForStep,
  getNextDesignWorkflowStage,
} from './designWorkflow';

describe('design workflow definitions', () => {
  it('keeps the required stage order without changing GenerationStep values', () => {
    expect(designWorkflowStages.map(stage => stage.key)).toEqual([
      'input',
      'base-render',
      'design-variants',
      'material-replace',
      'object-insert',
      'continuous-edit',
      'image-polish',
      'delivery',
    ]);
    expect(GenerationStep.FloorplanTo3D).toBe(1);
    expect(GenerationStep.ModelSnapshotRender).toBe(4);
    expect(GenerationStep.DesignVariants).toBe(5);
    expect(GenerationStep.MaterialReplace).toBe(6);
    expect(GenerationStep.ObjectInsert).toBe(9);
    expect(GenerationStep.ImagePolish).toBe(11);
  });

  it('maps existing generation steps into workflow stages', () => {
    expect(getDesignWorkflowStageForStep(GenerationStep.FloorplanTo3D)).toBe('base-render');
    expect(getDesignWorkflowStageForStep(GenerationStep.ModelSnapshotRender)).toBe('base-render');
    expect(getDesignWorkflowStageForStep(GenerationStep.DesignVariants)).toBe('design-variants');
    expect(getDesignWorkflowStageForStep(GenerationStep.MaterialReplace)).toBe('material-replace');
    expect(getDesignWorkflowStageForStep(GenerationStep.ObjectInsert)).toBe('object-insert');
    expect(getDesignWorkflowStageForStep(GenerationStep.ImagePolish)).toBe('image-polish');
    expect(getNextDesignWorkflowStage('continuous-edit')?.key).toBe('image-polish');
  });
});
