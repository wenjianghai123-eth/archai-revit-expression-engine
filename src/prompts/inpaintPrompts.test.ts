import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIGS, PROMPT_TEMPLATES } from '../constants';
import { GenerationStep } from '../types';
import { buildInpaintPrompt } from './inpaintPrompts';

describe('buildInpaintPrompt', () => {
  it('keeps the local inpainting textarea empty by default', () => {
    expect(DEFAULT_CONFIGS[GenerationStep.LocalInpainting].prompt).toBe('');
  });

  it('keeps inpaint templates focused on user tasks rather than system constraints', () => {
    const inpaintTemplates = PROMPT_TEMPLATES.filter(template => template.feature === 'inpaint');

    expect(inpaintTemplates.length).toBeGreaterThan(0);
    for (const template of inpaintTemplates) {
      expect(template.promptText).not.toContain('unmasked areas');
      expect(template.config.prompt || '').not.toContain('unmasked areas');
    }
  });

  it('builds material-specific constraints', () => {
    const prompt = buildInpaintPrompt({
      userPrompt: 'replace the selected wall with warm stone',
      hasMask: true,
      useFullImageMask: false,
      hasMaterialReference: true,
      editTarget: 'material',
    });

    expect(prompt).toContain('Edit target: material');
    expect(prompt).toContain('material, color, texture');
    expect(prompt).toContain('Do not change furniture shape');
    expect(prompt).toContain('Material reference images are for material texture');
  });

  it('builds furniture-specific constraints', () => {
    const prompt = buildInpaintPrompt({
      userPrompt: 'replace the sofa with the reference lounge chair',
      hasMask: true,
      useFullImageMask: false,
      hasMaterialReference: false,
      hasFurnitureReference: true,
      editTarget: 'furniture',
    });

    expect(prompt).toContain('Edit target: furniture');
    expect(prompt).toContain('Only modify the furniture inside the white area of the mask');
    expect(prompt).toContain('Do not modify unmasked areas');
    expect(prompt).toContain('Do not replace any other furniture outside the mask');
    expect(prompt).toContain('perspective, scale, proportions');
    expect(prompt).toContain('Furniture reference images are for furniture type');
  });

  it('adds mask constraints when a mask exists', () => {
    const prompt = buildInpaintPrompt({
      userPrompt: 'change the selected floor',
      hasMask: true,
      useFullImageMask: false,
      hasMaterialReference: false,
      editTarget: 'general',
    });

    expect(prompt).toContain('The white area of the mask is the editable region');
    expect(prompt).toContain('Keep the black area and all unmasked areas');
  });

  it('does not mention mask white area when no mask exists', () => {
    const prompt = buildInpaintPrompt({
      userPrompt: 'change the lounge chair',
      hasMask: false,
      useFullImageMask: false,
      hasMaterialReference: false,
      editTarget: 'furniture',
    });

    expect(prompt).toContain('No mask was provided');
    expect(prompt).not.toContain('white area of the mask');
  });

  it('allows full-image edits while preserving composition and canvas ratio', () => {
    const prompt = buildInpaintPrompt({
      userPrompt: 'soften the whole render',
      hasMask: false,
      useFullImageMask: true,
      hasMaterialReference: false,
      editTarget: 'general',
    });

    expect(prompt).toContain('allows full-image editing');
    expect(prompt).toContain('composition');
    expect(prompt).toContain('canvas ratio');
  });

  it('preserves user prompt and creates safe defaults when prompt is empty', () => {
    expect(buildInpaintPrompt({
      userPrompt: 'make the cabinet walnut',
      hasMask: false,
      useFullImageMask: false,
      hasMaterialReference: false,
      editTarget: 'material',
    })).toContain('make the cabinet walnut');

    expect(buildInpaintPrompt({
      userPrompt: '',
      hasMask: false,
      useFullImageMask: false,
      hasMaterialReference: false,
      editTarget: 'general',
    })).toContain('User edit request is empty');
  });
});
