import { describe, expect, it } from 'vitest';
import { buildSmartPrompt, readSmartPromptUserSupplement } from './intelligentPromptTemplates';
import { replacementTargets, type ReplacementTarget } from '../utils/materialReplacementTarget';

const materialByReplacementTarget: Record<ReplacementTarget, string> = {
  plant: 'plant',
  wall: 'microcement',
  floor: 'walnut',
  furniture: 'fabric',
  lighting: 'linear-light',
  artwork: 'art-paint',
  decor: 'metal',
};

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
        enablePhysicalMaterialLayout: true,
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

  it('omits physical size and seam instructions unless advanced layout is enabled', () => {
    const prompt = buildSmartPrompt({
      mode: 'material-replace',
      config: {
        targetObjectType: 'floor',
        targetMaterial: 'walnut',
        enablePhysicalMaterialLayout: false,
        materialRealSizeMm: 900,
        materialJointWidthMm: 3,
      },
    });

    expect(prompt).not.toContain('real-world material scale');
    expect(prompt).not.toContain('Joint width');
    expect(prompt).not.toContain('Keep seams continuous');
  });

  it('keeps a smart refined mask limited to the detected object', () => {
    const prompt = buildSmartPrompt({
      mode: 'material-replace',
      hasMask: true,
      config: {
        editMode: 'mask',
        selectionMode: 'smart-select',
        maskSelectionMode: 'smart',
        targetObjectType: 'sofa',
        targetMaterial: 'fabric',
        semanticAssistFromSelection: true,
      },
    });

    expect(prompt).toContain('Material / soft furnishing replacement mode: smart-select.');
    expect(prompt).toContain('Only modify the confirmed highlighted selection mask');
    expect(prompt).toContain('Smart-select scope: only modify the confirmed selected local object');
    expect(prompt).toContain('Semantic assist from selection is enabled');
    expect(prompt).toContain('Built-in control constraints:');
    expect(prompt).toContain('严格保持建筑结构不变');
    expect(prompt).toContain('不保留旧目标再叠加新目标');
  });

  it('builds furniture material replacement prompts without floor or ground replacement bias', () => {
    const prompt = buildSmartPrompt({
      mode: 'material-replace',
      hasMask: true,
      hasMaterialReferences: true,
      config: {
        replacementTarget: 'furniture',
        targetObjectType: 'table-chair',
        targetMaterial: 'fabric',
        editMode: 'mask',
        selectionMode: 'smart-select',
        maskSelectionMode: 'smart',
        smartMaskConfirmed: true,
        materialDirection: 'auto',
        materialTextureAlignment: 'auto',
      },
    });

    expect(prompt).toContain('Selection target: confirmed selected local object / material region');
    expect(prompt).toContain('Mask has the highest spatial priority');
    expect(prompt).not.toContain('Replacement target: table, chair, or furniture surfaces only');
    expect(prompt).not.toContain('Replacement target: floor surfaces only');
    expect(prompt).not.toContain('Paving origin');
    expect(prompt).not.toContain('floor material candidate');
  });

  it('builds no-mask plant replacement prompts as semantic auto object replacement', () => {
    const prompt = buildSmartPrompt({
      mode: 'material-replace',
      hasMaterialReferences: true,
      hasMask: false,
      config: {
        selectionMode: 'semantic-auto',
        replacementTarget: 'plant',
        targetObjectType: 'plant',
        targetMaterial: 'plant',
        editMode: 'mask',
        editingScope: 'semantic-auto',
      },
    });

    expect(prompt).toContain('Replacement target: plant and greenery objects only');
    expect(prompt).toContain('No mask is provided. Automatically identify only existing plant and greenery objects');
    expect(prompt).toContain('replace their plant appearance in place');
    expect(prompt).toContain('Do not add new plants');
    expect(prompt).toContain('Preserve all non-plant areas unchanged');
    expect(prompt).not.toContain('Mask has the highest spatial priority');
  });

  it('keeps paving and seam language limited to floor material replacement', () => {
    const wallPrompt = buildSmartPrompt({
      mode: 'material-replace',
      hasMaterialReferences: true,
      config: {
        selectionMode: 'semantic-auto',
        replacementTarget: 'wall',
        targetObjectType: 'wall',
        targetMaterial: 'microcement',
        editMode: 'smart-type',
        materialDirection: 'auto',
        materialTextureAlignment: 'auto',
      },
    });
    const floorPrompt = buildSmartPrompt({
      mode: 'material-replace',
      hasMaterialReferences: true,
      config: {
        selectionMode: 'semantic-auto',
        replacementTarget: 'floor',
        targetObjectType: 'floor',
        targetMaterial: 'walnut',
        editMode: 'smart-type',
        materialDirection: 'herringbone',
        materialTextureAlignment: 'custom-origin',
        materialTextureOrigin: { x: 0.25, y: 0.75 },
      },
    });

    expect(wallPrompt).toContain('Replacement target: wall surfaces only');
    expect(wallPrompt).not.toContain('Paving origin');
    expect(floorPrompt).toContain('Paving origin: (0.250, 0.750)');
    expect(floorPrompt).toContain('Tile, wood, or grain direction: herringbone');
  });

  it.each(replacementTargets)('builds semantic-auto in-place replacement prompt for %s', (replacementTarget) => {
    const prompt = buildSmartPrompt({
      mode: 'material-replace',
      hasMaterialReferences: true,
      hasMask: false,
      config: {
        selectionMode: 'semantic-auto',
        replacementTarget,
        targetObjectType: replacementTarget === 'furniture' ? 'table-chair' : replacementTarget,
        targetMaterial: materialByReplacementTarget[replacementTarget],
        editMode: 'smart-type',
        editingScope: 'semantic-auto',
        replacementStrategy: 'replace-existing',
      },
    });

    expect(prompt).toContain('Specified-object replacement scope: current-object.');
    expect(prompt).toContain('Use the currently selected');
    expect(prompt).toContain('Remove the old visual appearance of the current target');
    expect(prompt).toContain('Keep the current target silhouette, position, size');
    expect(prompt).toContain('Do not replace other');
    expect(prompt).toContain('in place');
    expect(prompt).toContain('Built-in control constraints:');
    expect(prompt).toContain('严格保持建筑结构不变');
    expect(prompt).toContain('不修改无关家具、设备、装饰、导视和远景元素');
    expect(prompt).toContain('不保留旧目标再叠加新目标');
    expect(prompt).not.toMatch(/\binsert new\b|\bplace new\b|\badd some\b|\badd a few\b/iu);
  });

  it('builds smart-select prompt from confirmed selection instead of target area', () => {
    const prompt = buildSmartPrompt({
      mode: 'material-replace',
      hasMaterialReferences: true,
      hasMask: true,
      config: {
        selectionMode: 'smart-select',
        replacementTarget: 'floor',
        targetObjectType: 'floor',
        targetMaterial: 'walnut',
        editMode: 'mask',
        editingScope: 'masked',
        replacementStrategy: 'replace-masked',
        maskSelectionMode: 'smart',
        smartMaskConfirmed: true,
        semanticAssistFromSelection: false,
      },
    });

    expect(prompt).toContain('Material / soft furnishing replacement mode: smart-select.');
    expect(prompt).toContain('Mask has the highest spatial priority');
    expect(prompt).toContain('Only pixels inside the confirmed white smart-selection mask may be edited');
    expect(prompt).toContain('Do not infer a global target category');
    expect(prompt).not.toContain('Automatic semantic mode: identify all existing');
    expect(prompt).not.toContain('Replacement target: floor surfaces only');
    expect(prompt).not.toContain('Semantic assist from selection is enabled');
    expect(prompt).not.toMatch(/\binsert new\b|\bplace new\b|\badd some\b|\badd a few\b/iu);
  });

  it('builds all-scene material-category replacement prompts for wood', () => {
    const prompt = buildSmartPrompt({
      mode: 'material-replace',
      hasMaterialReferences: true,
      hasMask: false,
      config: {
        materialReplacementMode: 'material-category',
        materialCategory: 'wood',
        replacementScope: 'all-scene',
        selectionMode: 'semantic-auto',
        targetMaterial: 'walnut',
      },
    });

    expect(prompt).toContain('Material category replacement mode: 同类材质替换');
    expect(prompt).toContain('Selected MaterialCategory: wood');
    expect(prompt).toContain('木饰面、木梁、木柜、木门、木桌、木椅');
    expect(prompt).toContain('Automatically identify all wood / 木材 material regions in the whole source image');
    expect(prompt).toContain('自动识别并替换原图中所有木质表面，包括木饰面、木构件、木柜、木桌、木椅等');
    expect(prompt).toContain('只替换材质贴图、颜色、纹理、光泽和粗糙度');
    expect(prompt).toContain('将所有识别出的wood材质区域替换为参考材质');
    expect(prompt).toContain('Strictly preserve all non-target materials unchanged');
    expect(prompt).toContain('物体轮廓、位置、尺寸、相机机位');
    expect(prompt).not.toContain('Replacement target: wall surfaces only');
    expect(prompt).not.toContain('Replacement target: floor surfaces only');
  });

  it('limits material-category replacement to same material inside the selected region', () => {
    const prompt = buildSmartPrompt({
      mode: 'material-replace',
      hasMaterialReferences: true,
      hasMask: true,
      config: {
        materialReplacementMode: 'material-category',
        materialCategory: 'wood',
        replacementScope: 'selected-region',
        selectionMode: 'smart-select',
        maskSelectionMode: 'smart',
        smartMaskConfirmed: true,
        targetMaterial: 'dark-wood',
      },
    });

    expect(prompt).toContain('Replacement scope: selected-region / 指定区域内同类材质');
    expect(prompt).toContain('Only inside the user-confirmed selected region');
    expect(prompt).toContain('Within that selected region, replace only the identified wood material regions');
    expect(prompt).toContain('Inside the selected region, non-wood materials must remain unchanged');
    expect(prompt).toContain('Similar material outside the mask must remain unchanged');
  });

  it('builds stone material-category prompt without changing other materials', () => {
    const prompt = buildSmartPrompt({
      mode: 'material-replace',
      hasMaterialReferences: true,
      config: {
        materialReplacementMode: 'material-category',
        materialCategory: 'stone',
        replacementScope: 'all-scene',
        selectionMode: 'semantic-auto',
        targetMaterial: 'marble',
      },
    });

    expect(prompt).toContain('Selected MaterialCategory: stone');
    expect(prompt).toContain('大理石、岩板、水磨石、石材墙地面、石材台面');
    expect(prompt).toContain('Do not change material categories that do not match the selected MaterialCategory');
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
