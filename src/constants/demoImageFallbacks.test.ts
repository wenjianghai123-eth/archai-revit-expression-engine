import { describe, expect, it } from 'vitest';
import { demoImageFallbacks, getFeatureDemoImage } from './demoImageFallbacks';

const requiredFeatureIds = [
  'floor_plan_color',
  'free_reference_image',
  'material_replace',
  'object_insert',
  'scheme_variant',
  'image_polish',
  'model_snapshot_render',
  'panorama_render',
] as const;

describe('demo image fallbacks', () => {
  it('provides local-first demo assets for every required feature', () => {
    for (const id of requiredFeatureIds) {
      const asset = demoImageFallbacks[id];
      expect(asset.localSrc?.startsWith('/cases/')).toBe(true);
      expect(asset.previousUiSrc).toContain('images.unsplash.com');
      expect(asset.fallbackSrc).toContain('images.unsplash.com');
      expect(asset.finalFallbackSrc.startsWith('/cases/fallback-')).toBe(true);
      expect(asset.alt.length).toBeGreaterThan(0);
      expect(asset.isDemoAsset).toBe(true);
    }
  });

  it('maps panorama and shared preset entries to the centralized configuration', () => {
    expect(getFeatureDemoImage('panorama_quick_render')).toBe(demoImageFallbacks.panorama_render);
    expect(getFeatureDemoImage('style_render')).toBe(demoImageFallbacks.free_reference_image);
    expect(getFeatureDemoImage('missing')).toBeNull();
  });

  it('keeps the final fallback local so remote failures cannot leave empty cards', () => {
    for (const asset of Object.values(demoImageFallbacks)) {
      expect(asset.finalFallbackSrc.startsWith('/cases/')).toBe(true);
    }
  });
});
