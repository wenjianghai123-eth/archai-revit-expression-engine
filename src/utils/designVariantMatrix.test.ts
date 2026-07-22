import { describe, expect, it } from 'vitest';
import { buildDesignVariantMatrixPrompt, buildDesignVariantReportNarrative, findSimilarDesignVariantPairs, resolveDesignVariantMatrix } from './designVariantMatrix';

describe('design variant matrix', () => {
  it('resolves all eight design variables for every option', () => {
    const matrix = resolveDesignVariantMatrix({ stylePackId: 'interior-common', variantDiversity: 'high' }, 4);

    expect(matrix).toHaveLength(4);
    expect(Object.keys(matrix[0].values)).toHaveLength(8);
    expect(matrix[0].changedVariables).toHaveLength(8);
    expect(matrix[0].differenceSummary).toContain('材质体系');
  });

  it('keeps changed and locked variables mutually exclusive and preserves parent relation', () => {
    const matrix = resolveDesignVariantMatrix({
      variantMatrixVariables: ['material-system', 'lighting-atmosphere'],
      variantVariableLocks: ['color-system'],
      parentResultId: 'parent-result',
      parentJobId: 'parent-job',
    }, 2);

    expect(matrix[0]).toMatchObject({
      changedVariables: ['material-system', 'lighting-atmosphere'],
      lockedVariables: ['color-system'],
      parentResultId: 'parent-result',
      parentJobId: 'parent-job',
    });
  });

  it('detects similar low-diversity options and compiles matrix controls into prompt/report copy', () => {
    const matrix = resolveDesignVariantMatrix({ variantDiversity: 'low' }, 4);
    const pairs = findSimilarDesignVariantPairs(matrix);
    const prompt = buildDesignVariantMatrixPrompt(matrix[0], 'low');
    const report = buildDesignVariantReportNarrative(matrix[0], '方案 A');

    expect(pairs).toContainEqual(expect.objectContaining({ leftIndex: 0, rightIndex: 1, similarity: expect.closeTo(0.875) }));
    expect(prompt).toContain('Design-variable matrix');
    expect(prompt).toContain('材质体系');
    expect(prompt).toContain(matrix[0].differenceSummary);
    expect(report).toContain('方案 A');
    expect(report).toContain('材质体系');
  });
});
