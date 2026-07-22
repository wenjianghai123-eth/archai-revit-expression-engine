import { describe, expect, it } from 'vitest';
import { compileFloorPlanMaterialPrompt, readFloorPlanMaterialPromptInput } from './floorPlanMaterialPrompt';
import { collectApiYiImageSources } from '../providers/apiyiNanoBanana2Provider';

describe('floor plan material prompt compiler', () => {
  it('states image roles, geometry locks and region material schedule', () => {
    const prompt = compileFloorPlanMaterialPrompt({
      sourceAssetId: 'source',
      controlAssetId: 'control',
      regionSetId: 'regions',
      textLanguage: 'zh-CN',
      referenceAssetIds: ['material'],
      assignments: [{ regionId: 'region-1', number: 1, roomName: 'Kitchen', regionType: 'kitchen', regionUsage: '备餐', materialName: 'grey anti-slip tile', materialAssetId: 'material', fallbackMode: 'reference', scale: 1, rotation: 0, direction: 'horizontal', jointMode: 'subtle' }],
    });
    expect(prompt).toContain('Image 1 is the original black-and-white floor plan');
    expect(prompt).toContain('Image 2 is the deterministic material placement control image');
    expect(prompt).toContain('Do not exchange materials between regions');
    expect(prompt).toContain('top-down orthographic floor plan');
    expect(prompt).toContain('Region 1: Kitchen — grey anti-slip tile.');
    expect(prompt).toContain('type: kitchen; use: 备餐');
    expect(prompt).toContain('Text language requirement: Simplified Chinese.');
    expect(prompt).toContain('Optional material reference: Image 3.');
  });

  it('defaults legacy material requests to English and preserves no-text explicitly', () => {
    const legacy = readFloorPlanMaterialPromptInput({
      floorPlanMaterialMapping: true,
      sourceImageAssetId: 'source',
      floorPlanControlAssetId: 'control',
      floorPlanRegionSetId: 'regions',
      floorPlanMaterialAssignments: [{ regionId: 'region-1', number: 1, roomName: '', materialName: 'stone', materialAssetId: null, fallbackMode: 'default', scale: 1, rotation: 0, direction: 'auto', jointMode: 'subtle' }],
    });
    const noText = readFloorPlanMaterialPromptInput({
      floorPlanMaterialMapping: true,
      floorPlanTextLanguage: 'none',
      sourceImageAssetId: 'source',
      floorPlanControlAssetId: 'control',
      floorPlanRegionSetId: 'regions',
      floorPlanMaterialAssignments: [{ regionId: 'region-1', number: 1, roomName: '', materialName: 'stone', materialAssetId: null, fallbackMode: 'default', scale: 1, rotation: 0, direction: 'auto', jointMode: 'subtle' }],
    });

    expect(legacy?.textLanguage).toBe('en');
    expect(noText?.textLanguage).toBe('none');
    expect(compileFloorPlanMaterialPrompt(noText!)).toContain('do not generate any new text');
  });

  it('rejects a reference assignment without a material asset', () => {
    expect(readFloorPlanMaterialPromptInput({
      floorPlanMaterialMapping: true,
      sourceImageAssetId: 'source',
      floorPlanControlAssetId: 'control',
      floorPlanRegionSetId: 'regions',
      floorPlanMaterialAssignments: [{ regionId: 'region-1', number: 1, roomName: '', materialName: '', materialAssetId: null, fallbackMode: 'reference', scale: 1, rotation: 0, direction: 'auto', jointMode: 'subtle' }],
    })).toBeNull();
  });

  it('keeps original, control and optional material references in provider order', () => {
    expect(collectApiYiImageSources({
      mode: 'plan-colorize',
      step: 'plan_colorize',
      inputImageDataUrl: 'source-fallback',
      prompt: 'compiled',
      config: {},
      inputImages: [
        { role: 'original-floor-plan', url: 'image-1-original' },
        { role: 'material-control', url: 'image-2-control' },
        { role: 'material-reference', url: 'image-3-reference' },
      ],
    })).toEqual(['image-1-original', 'image-2-control', 'image-3-reference']);
  });
});
