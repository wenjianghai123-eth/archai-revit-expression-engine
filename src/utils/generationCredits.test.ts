import { describe, expect, it } from 'vitest';
import { getGenerationCreditCost, getGenerationOutputCount } from './generationCredits';

describe('free reference generation credits', () => {
  it('charges one credit per requested candidate', () => {
    expect(getGenerationOutputCount('style-render', { step: 'free_reference_image', batchCount: 1 })).toBe(1);
    expect(getGenerationCreditCost('style-render', { step: 'free_reference_image', batchCount: 2 })).toBe(2);
    expect(getGenerationCreditCost('style-render', { generationStep: 'free_reference_image', batchCount: 4 })).toBe(4);
  });
});

describe('material replacement generation credits', () => {
  it('charges for 2-4 paving candidates', () => {
    expect(getGenerationCreditCost('material-replace', { step: 'material_replace', batchCount: 2 })).toBe(2);
    expect(getGenerationCreditCost('material-replace', { step: 'material_replace', batchCount: 3 })).toBe(3);
    expect(getGenerationCreditCost('material-replace', { step: 'material_replace', batchCount: 4 })).toBe(4);
    expect(getGenerationCreditCost('material-replace', { batchCount: 1, materialCandidateCount: 3 })).toBe(3);
    expect(getGenerationCreditCost('material-replace', {})).toBe(1);
  });
});
