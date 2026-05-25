export const GENERATION_MODES = [
  'floorplan',
  'style-render',
  'inpaint',
  'model-render',
  'design-variants',
  'material-replace',
  'plan-colorize',
  'panorama-roam-render',
] as const;

export type GenerationMode = typeof GENERATION_MODES[number];

export function isGenerationMode(value: unknown): value is GenerationMode {
  return typeof value === 'string' && (GENERATION_MODES as readonly string[]).includes(value);
}

export const MODEL_FILE_TYPES = ['glb', 'gltf', 'obj', 'dae', 'stl'] as const;
export type ModelFileType = typeof MODEL_FILE_TYPES[number];

export const DEFAULT_MAX_MODEL_MB = 600;
