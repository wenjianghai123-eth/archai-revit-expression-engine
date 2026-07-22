import { describe, expect, it } from 'vitest';
import { buildSmartPrompt, readSmartPromptUserSupplement } from './intelligentPromptTemplates';

describe('intelligent prompt templates', () => {
  it('builds a stable floorplan prompt without user text', () => {
    const prompt = buildSmartPrompt({
      mode: 'floorplan',
      config: {
        buildingType: 'residential',
        spaceType: 'living room',
        renderStyle: 'realistic colored plan',
        smartMaterial: 'light wood',
        lighting: 'natural daylight',
        changeStrength: 'medium',
        prompt: '',
      },
    });

    expect(prompt).toContain('Building type: residential.');
    expect(prompt).toContain('Space type: living room.');
    expect(prompt).toContain('Main material direction: light wood.');
    expect(prompt).toContain('Text language requirement:');
    expect(prompt).toContain('Do not use Chinese characters');
  });

  it('translates Chinese floorplan room labels into English prompt labels', () => {
    const prompt = buildSmartPrompt({
      mode: 'floorplan',
      config: {
        floorplanRoomLabels: [
          { id: 'r1', name: '客厅', roomType: 'living-room', positionDescription: '平面中部' },
          { id: 'r2', name: '主卧', roomType: 'bedroom', positionDescription: '右下角' },
        ],
      },
    });

    expect(prompt).toContain('Living Room = Living Room');
    expect(prompt).toContain('Master Bedroom = Bedroom');
    expect(prompt).not.toContain('location: 平面中部');
    expect(prompt).toContain('translate only newly recreated labels into concise English');
  });

  it('applies product mode and text language to the classic plan-colorize prompt', () => {
    const chinese = buildSmartPrompt({
      mode: 'plan-colorize',
      config: { floorPlanExpressionMode: 'analysis', floorPlanTextLanguage: 'zh-CN', enableRoomLabels: true },
    });
    const noText = buildSmartPrompt({
      mode: 'plan-colorize',
      config: { floorPlanExpressionMode: 'three-dimensional', floorPlanTextLanguage: 'none', enableRoomLabels: true, manualRoomLabels: ['客厅'] },
    });

    expect(chinese).toContain('Product mode: analytical drawing expression');
    expect(chinese).toContain('labels in Simplified Chinese');
    expect(chinese).toContain('Text language requirement: Simplified Chinese.');
    expect(noText).toContain('Product mode: three-dimensional colored plan');
    expect(noText).toContain('do not generate any new text');
    expect(noText).not.toContain('Use these labels when appropriate');
  });

  it('treats visible text as supplemental requirements', () => {
    const prompt = buildSmartPrompt({
      mode: 'model-render',
      config: {
        buildingType: 'office',
        spaceType: 'lobby',
        renderStyle: 'modern minimal',
        smartMaterial: 'light stone',
        atmosphere: 'premium lighting',
        customPrompt: 'add a reception counter near the entrance',
      },
    });

    expect(prompt).toContain('The input image is a 3D clay or white model viewport snapshot');
    expect(prompt).toContain('Design style: modern minimal.');
    expect(prompt).toContain('User extra requirements: add a reception counter near the entrance');
  });

  it('reads the right supplemental field per feature', () => {
    expect(readSmartPromptUserSupplement('material-replace', {
      prompt: 'legacy prompt',
      customMaterialPrompt: 'only replace the wall material',
    })).toBe('only replace the wall material');
    expect(readSmartPromptUserSupplement('plan-colorize', {
      prompt: 'legacy prompt',
      customPrompt: 'mark the main circulation',
    })).toBe('mark the main circulation');
    expect(readSmartPromptUserSupplement('model-render', {
      prompt: 'history template',
      userPrompt: 'add an entrance canopy',
    }, 'internal prompt')).toBe('add an entrance canopy');
  });

  it('adds professional material replacement controls to the prompt', () => {
    const prompt = buildSmartPrompt({
      mode: 'material-replace',
      config: {
        targetObjectType: 'floor',
        targetMaterial: 'walnut',
        materialPatternScale: 'large',
        materialDirection: 'herringbone',
        materialFinish: 'satin',
        materialReplaceScope: 'material-only',
        materialRealSizeMm: 900,
        materialJointWidthMm: 3,
        materialTextureAlignment: 'custom-origin',
        materialTextureOrigin: { x: 0.2, y: 0.75 },
        semanticObjectSelections: [
          { id: 'floor-left', objectType: 'floor', x: 0.25, y: 0.6 },
          { id: 'wall-right', objectType: 'wall', x: 0.8, y: 0.35 },
        ],
        hasProtectionMask: true,
        strength: 'balanced',
      },
      hasMaterialReferences: true,
    });

    expect(prompt).toContain('Texture scale: large.');
    expect(prompt).toContain('Tile, wood, or grain direction: herringbone.');
    expect(prompt).toContain('Surface finish: satin.');
    expect(prompt).toContain('Replacement scope: material only.');
    expect(prompt).toContain('do not change geometry, furniture shape, furniture layout');
    expect(prompt).toContain('approximately 900 mm');
    expect(prompt).toContain('Joint width: approximately 3 mm');
    expect(prompt).toContain('Paving origin: (0.200, 0.750)');
    expect(prompt).toContain('floor at (0.250, 0.600)');
    expect(prompt).toContain('wall at (0.800, 0.350)');
    expect(prompt).toContain('Protected pixels are explicitly excluded');
  });

  it('keeps a smart refined mask limited to the detected object', () => {
    const prompt = buildSmartPrompt({
      mode: 'material-replace',
      hasMask: true,
      config: {
        editMode: 'mask',
        maskSelectionMode: 'smart',
        targetObjectType: 'sofa',
        targetMaterial: 'fabric',
      },
    });

    expect(prompt).toContain('automatically detected by AI');
    expect(prompt).toContain('Modify only the detected object region');
    expect(prompt).toContain('Preserve the original geometry, lighting, perspective and surrounding objects');
  });

  it('adds professional object insert constraints to the prompt', () => {
    const prompt = buildSmartPrompt({
      mode: 'object-insert',
      config: {
        objectInsertSurface: 'tabletop',
        objectFidelity: 'strict',
        enforceContactShadow: true,
        enforceOcclusion: true,
        enforcePerspectiveScale: true,
        placementMode: 'strict',
      },
      hasFurnitureReference: true,
    });

    expect(prompt).toContain('Placement surface: tabletop.');
    expect(prompt).toContain('sit on the tabletop');
    expect(prompt).toContain('Object fidelity: strict.');
    expect(prompt).toContain('Preserve the reference object shape');
    expect(prompt).toContain('Contact shadow constraint:');
    expect(prompt).toContain('Occlusion constraint:');
    expect(prompt).toContain('Perspective scale constraint:');
  });

  it('adds design variant scope, locks, and strategy note to the prompt', () => {
    const prompt = buildSmartPrompt({
      mode: 'design-variants',
      config: {
        variantIndex: 1,
        variantChangeScope: 'furniture-layout',
        variantLocks: ['structure', 'camera', 'walls-openings'],
        variantStrategyNotes: ['warmer palette', 'open the lounge seating but keep circulation clear'],
        changeStrength: 'medium',
      },
      variantName: '方案 B',
      variantStyle: 'modern-minimal',
    });

    expect(prompt).toContain('Variation change scope: furniture-layout.');
    expect(prompt).toContain('Adjust movable furniture layout while preserving structure');
    expect(prompt).toContain('Lock structure:');
    expect(prompt).toContain('Lock camera:');
    expect(prompt).toContain('Lock walls and openings:');
    expect(prompt).toContain('Variant-specific strategy note: open the lounge seating but keep circulation clear');
  });

  it('adds free reference image roles and strengths to the prompt', () => {
    const prompt = buildSmartPrompt({
      mode: 'style-render',
      config: {
        step: 'free_reference_image',
        freeReferenceReferences: [
          { assetId: 'asset-style', role: 'style', strength: 'medium' },
          { assetId: 'asset-material', role: 'material', strength: 'high' },
          { assetId: 'asset-lighting', role: 'lighting', strength: 'low' },
        ],
      },
      userPrompt: 'create a calm hotel lobby rendering',
    });

    expect(prompt).toContain('Free reference image mode');
    expect(prompt).toContain('Reference image 2: style reference');
    expect(prompt).toContain('medium strength');
    expect(prompt).toContain('Reference image 3: material reference');
    expect(prompt).toContain('high strength');
    expect(prompt).toContain('Reference image 4: lighting reference');
    expect(prompt).toContain('low strength');
    expect(prompt).toContain('Do not mechanically collage reference images');
    expect(prompt).toContain('Do not create a split-screen');
  });
});
