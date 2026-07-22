import { describe, expect, it } from 'vitest';
import { allFeatures, defaultFeatureIds, getVisibleFeatures } from './featureRegistry';
import { GenerationStep } from './types';

describe('feature registry product metadata', () => {
  it('keeps the six default capabilities and their existing steps', () => {
    const visible = getVisibleFeatures([]);
    expect(visible.map(feature => feature.id)).toEqual([...defaultFeatureIds]);
    expect(visible).toHaveLength(6);
  });

  it('keeps real cases primary with original UI, demo and local final fallbacks', () => {
    for (const feature of allFeatures) {
      expect(feature.category).toBeTruthy();
      expect(feature.scenarios?.length).toBeGreaterThan(0);
      expect(feature.maturity).toBeTruthy();
      expect(feature.recommendedNextSteps?.length).toBeGreaterThan(0);
      expect(feature.image.startsWith('/cases/')).toBe(true);
      expect(feature.image).not.toContain('unsplash.com');
      expect(feature.previousUiImage).toContain('images.unsplash.com');
      expect(feature.fallbackImage).toContain('images.unsplash.com');
      expect(feature.finalFallbackImage?.startsWith('/cases/fallback-')).toBe(true);
      expect(feature.imageAlt).toBeTruthy();
    }
  });

  it('routes the legacy quick-style product entry into the shared free-reference workflow', () => {
    expect(allFeatures.find(feature => feature.id === 'style_render')).toMatchObject({
      step: GenerationStep.FreeReferenceImage,
      componentName: 'FreeReferenceImagePanel',
    });
  });
});
