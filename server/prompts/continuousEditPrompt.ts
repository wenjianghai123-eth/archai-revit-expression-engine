export interface ContinuousEditPromptInput {
  instruction: string;
  permanentConstraints: Record<string, unknown>;
  temporaryConstraints: Record<string, unknown>;
  featureType: string;
  currentVersion: { id: string; versionNumber: number };
  includesOriginalStructureReference: boolean;
  referenceImageRoles: string[];
  hasMask?: boolean;
}

export function compileContinuousEditPrompt(input: ContinuousEditPromptInput): string {
  const referenceStartIndex = input.hasMask ? 4 : 3;
  const referenceRoles = input.referenceImageRoles.length > 0
    ? input.referenceImageRoles.map((role, index) => `Image ${index + referenceStartIndex}: optional ${role} reference; use it only for the requested edit.`).join('\n')
    : 'No optional reference images are supplied.';
  return [
    'Continuous architectural image editing task.',
    `Feature type: ${input.featureType}. Current version: V${input.currentVersion.versionNumber} (${input.currentVersion.id}).`,
    'Image 1 is the current working version. Continue editing Image 1 and preserve all previously confirmed modifications already visible in it.',
    input.includesOriginalStructureReference
      ? 'Image 2 is the original V0 architectural structure reference. Use Image 2 only to preserve spatial structure, architectural components, camera, perspective, composition, and canvas framing.'
      : 'No original structure reference is supplied.',
    referenceRoles,
    input.hasMask ? 'Image 3 is the edit mask. White pixels are the only area allowed to change; black pixels are protected and must remain pixel-for-pixel as stable as possible. Do not modify anything outside the white mask.' : '',
    `User instruction for this turn: ${input.instruction}`,
    formatConstraints('Permanent constraints', input.permanentConstraints),
    formatConstraints('Temporary constraints for this turn', input.temporaryConstraints),
    'Execute only the modification explicitly requested in this turn.',
    'Keep every area that was not requested to change unchanged.',
    input.hasMask ? 'The mask boundary is mandatory: all unmasked areas must remain unchanged.' : '',
    'Do not add architectural components that do not exist in the original structure reference.',
    'Do not change the canvas aspect ratio, camera position, camera angle, perspective, or composition.',
    'Do not restart or redesign the space from scratch.',
  ].filter(Boolean).join('\n');
}

function formatConstraints(label: string, constraints: Record<string, unknown>): string {
  const entries = Object.entries(constraints).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (entries.length === 0) return `${label}: none.`;
  return `${label}: ${entries.map(([key, value]) => `${key}=${serializeValue(value)}`).join('; ')}.`;
}

function serializeValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return '[unserializable]'; }
}
