import { describe, expect, it } from 'vitest';
import {
  assignDesignVariantStylePresets,
  buildStylePresetPrompt,
  designVariantCinematicQualityPrompt,
  designVariantCounts,
  designVariantStylePresets,
  readDesignVariantCount,
} from './designVariantStylePresets';

describe('designVariantStylePresets', () => {
  it('allows only the configured variant counts and defaults to one', () => {
    expect(designVariantCounts).toEqual([1, 2, 4, 6, 8]);
    expect(readDesignVariantCount(undefined)).toBe(1);
    expect(readDesignVariantCount(6)).toBe(6);
    expect(readDesignVariantCount(3)).toBe(1);
  });

  it('defines at least twelve structured style presets', () => {
    expect(designVariantStylePresets.length).toBeGreaterThanOrEqual(12);
    for (const preset of designVariantStylePresets) {
      expect(preset).toEqual(expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        lightingMood: expect.any(String),
        furnitureLanguage: expect.any(String),
        decorationLanguage: expect.any(String),
        textureLanguage: expect.any(String),
        cluster: expect.any(String),
      }));
      expect(preset.colorPalette.length).toBeGreaterThan(0);
      expect(preset.materialLanguage.length).toBeGreaterThan(0);
      expect(preset.negativeRules.length).toBeGreaterThan(0);
    }
  });

  it('assigns non-repeated styles and prefers multiple clusters', () => {
    const assigned = assignDesignVariantStylePresets(8, ['modern-minimal', 'modern-minimal', 'light-luxury']);
    const ids = assigned.map(style => style.id);
    const clusters = new Set(assigned.map(style => style.cluster));

    expect(assigned).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
    expect(clusters.size).toBeGreaterThanOrEqual(6);
  });

  it('builds a structured prompt for every variant style', () => {
    const preset = designVariantStylePresets.find(style => style.id === 'mediterranean')!;
    const prompt = buildStylePresetPrompt(preset);

    expect(prompt).toContain('StylePresetId: mediterranean');
    expect(prompt).toContain('Color palette');
    expect(prompt).toContain('Material language');
    expect(prompt).toContain('不得新增拱门');
    expect(designVariantCinematicQualityPrompt).toContain('4K超高清');
  });
});
