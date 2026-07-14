export interface FloorPlanMaterialAssignmentSummary {
  regionId: string;
  number: number;
  roomName: string;
  materialName: string;
  materialAssetId: string | null;
  fallbackMode: 'reference' | 'default' | 'ai-auto';
  scale: number;
  rotation: number;
  direction: 'auto' | 'horizontal' | 'vertical' | 'diagonal';
  jointMode: 'subtle' | 'visible' | 'none';
}

export interface FloorPlanMaterialPromptInput {
  sourceAssetId: string;
  controlAssetId: string;
  regionSetId: string;
  assignments: FloorPlanMaterialAssignmentSummary[];
  referenceAssetIds?: string[];
}

export function compileFloorPlanMaterialPrompt(input: FloorPlanMaterialPromptInput): string {
  const referenceImageIndex = new Map((input.referenceAssetIds || []).map((assetId, index) => [assetId, index + 3]));
  const regionSummary = [...input.assignments]
    .sort((a, b) => a.number - b.number)
    .map(assignment => {
      const room = assignment.roomName || `Region ${assignment.number}`;
      const material = assignment.materialName
        || (assignment.fallbackMode === 'default'
          ? 'neutral professional default floor material'
          : assignment.fallbackMode === 'ai-auto'
            ? 'context-appropriate floor material selected by AI'
            : 'the supplied material reference');
      const reference = assignment.materialAssetId && referenceImageIndex.has(assignment.materialAssetId)
        ? ` Optional material reference: Image ${referenceImageIndex.get(assignment.materialAssetId)}.`
        : '';
      return `Region ${assignment.number}: ${room} — ${material}. Placement direction: ${assignment.direction}; texture scale: ${assignment.scale}; rotation: ${assignment.rotation} degrees; joints: ${assignment.jointMode}.${reference}`;
    });

  return [
    'Image roles:',
    'Image 1 is the original black-and-white floor plan and is the strict geometry and drawing reference.',
    'Image 2 is the deterministic material placement control image. It defines the exact floor-region boundaries and target material placement.',
    'Any images after Image 2 are optional material references. They are secondary to Image 2 and must not change region boundaries.',
    '',
    'Required result:',
    'Preserve the exact floor plan layout, wall boundaries, doors, windows, furniture arrangement, room labels, dimensions, symbols, axes and composition from Image 1.',
    'Apply each floor material only inside the corresponding region shown in Image 2.',
    'Do not exchange materials between regions. Do not allow any material to cross a region boundary.',
    'Do not move, enlarge, merge, split or redesign any room.',
    'Do not change the canvas, aspect ratio or framing.',
    'Keep all plan annotations readable, including labels, dimensions, symbols and axes.',
    'Render non-floor areas naturally and professionally.',
    'Improve furniture, walls, doors, glazing and shadows only where appropriate, without changing their positions or geometry.',
    'Maintain a high-end architectural presentation floor-plan style.',
    'The result must remain a top-down orthographic floor plan, not a perspective interior rendering.',
    'Produce one coherent final image. Do not create a collage, split screen, legend board or perspective view.',
    '',
    'Region material schedule:',
    ...regionSummary,
  ].join('\n');
}

export function readFloorPlanMaterialPromptInput(config: Record<string, unknown>): FloorPlanMaterialPromptInput | null {
  if (config.floorPlanMaterialMapping !== true) return null;
  const sourceAssetId = readString(config.sourceImageAssetId);
  const controlAssetId = readString(config.floorPlanControlAssetId);
  const regionSetId = readString(config.floorPlanRegionSetId);
  if (!sourceAssetId || !controlAssetId || !regionSetId || !Array.isArray(config.floorPlanMaterialAssignments)) return null;
  const assignments: FloorPlanMaterialAssignmentSummary[] = [];
  const regionIds = new Set<string>();
  for (const value of config.floorPlanMaterialAssignments.slice(0, 80)) {
    if (!isRecord(value)) return null;
    const regionId = readString(value.regionId);
    const number = typeof value.number === 'number' && Number.isInteger(value.number) && value.number > 0 ? value.number : null;
    const fallbackMode = value.fallbackMode;
    const direction = value.direction;
    const jointMode = value.jointMode;
    const scale = value.scale;
    const rotation = value.rotation;
    if (!regionId || regionIds.has(regionId) || !number) return null;
    if (fallbackMode !== 'reference' && fallbackMode !== 'default' && fallbackMode !== 'ai-auto') return null;
    if (direction !== 'auto' && direction !== 'horizontal' && direction !== 'vertical' && direction !== 'diagonal') return null;
    if (jointMode !== 'subtle' && jointMode !== 'visible' && jointMode !== 'none') return null;
    if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < 0.1 || scale > 20) return null;
    if (typeof rotation !== 'number' || !Number.isFinite(rotation) || rotation < -360 || rotation > 360) return null;
    const materialAssetId = value.materialAssetId === null ? null : readString(value.materialAssetId);
    if (fallbackMode === 'reference' && !materialAssetId) return null;
    regionIds.add(regionId);
    assignments.push({
      regionId,
      number,
      roomName: readString(value.roomName)?.slice(0, 80) || '',
      materialName: readString(value.materialName)?.slice(0, 80) || '',
      materialAssetId,
      fallbackMode,
      scale,
      rotation,
      direction,
      jointMode,
    });
  }
  const assignmentAssetIds = new Set(assignments.map(assignment => assignment.materialAssetId).filter((id): id is string => Boolean(id)));
  const referenceAssetIds = Array.isArray(config.floorPlanMaterialReferenceAssetIds)
    ? config.floorPlanMaterialReferenceAssetIds.filter((value): value is string => typeof value === 'string' && assignmentAssetIds.has(value.trim())).map(value => value.trim()).slice(0, 2)
    : [];
  return assignments.length ? { sourceAssetId, controlAssetId, regionSetId, assignments, referenceAssetIds } : null;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
