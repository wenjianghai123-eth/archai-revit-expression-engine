import { describe, expect, it } from 'vitest';
import { compileContinuousEditPrompt } from './continuousEditPrompt';

describe('continuous edit prompt compiler', () => {
  it('defines current, original, and optional reference image roles', () => {
    const prompt = compileContinuousEditPrompt({
      instruction: 'Replace the wall finish with light oak.',
      permanentConstraints: { preserveLayout: true },
      temporaryConstraints: { keepFurniture: true },
      featureType: 'material-edit',
      currentVersion: { id: 'version_v1', versionNumber: 1 },
      includesOriginalStructureReference: true,
      referenceImageRoles: ['material'],
    });
    expect(prompt).toContain('Image 1 is the current working version');
    expect(prompt).toContain('preserve all previously confirmed modifications');
    expect(prompt).toContain('Image 2 is the original V0 architectural structure reference');
    expect(prompt).toContain('Image 3: optional material reference');
    expect(prompt).toContain('Keep every area that was not requested to change unchanged');
    expect(prompt).toContain('Do not add architectural components');
    expect(prompt).toContain('Do not change the canvas aspect ratio');
    expect(prompt).toContain('Do not restart or redesign the space from scratch');
  });

  it('makes the mask boundary mandatory for local edits', () => {
    const prompt = compileContinuousEditPrompt({ instruction:'Change only the selected wall.',permanentConstraints:{},temporaryConstraints:{},featureType:'continuous-image-edit',currentVersion:{id:'v1',versionNumber:1},includesOriginalStructureReference:true,referenceImageRoles:[],hasMask:true });
    expect(prompt).toContain('Image 3 is the edit mask');
    expect(prompt).toContain('White pixels are the only area allowed to change');
    expect(prompt).toContain('all unmasked areas must remain unchanged');
  });
});
