import { describe, expect, it } from 'vitest';
import { isShowcaseDemoEnabled, showcaseCases } from './showcaseCases';

describe('showcase cases', () => {
  it('keeps local case assets primary and provides demo fallback results', () => {
    for (const showcaseCase of showcaseCases) {
      expect(showcaseCase.sourceImage.startsWith('/cases/')).toBe(true);
      expect(showcaseCase.resultImage.startsWith('/cases/')).toBe(true);
      expect(showcaseCase.resultPreviousUi).toContain('images.unsplash.com');
      expect(showcaseCase.resultFinalFallback?.startsWith('/cases/fallback-')).toBe(true);
      expect(showcaseCase.fallbackIsDemoAsset).toBe(true);
      expect(showcaseCase.highlights.length).toBeGreaterThan(0);
    }
  });

  it('only enables demo mode in development or by explicit configuration', () => {
    expect(isShowcaseDemoEnabled(true)).toBe(true);
    expect(isShowcaseDemoEnabled(false, 'true')).toBe(true);
    expect(isShowcaseDemoEnabled(false, 'false')).toBe(false);
    expect(isShowcaseDemoEnabled(false)).toBe(false);
  });
});
