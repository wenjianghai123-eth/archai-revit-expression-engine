export type InpaintEditTarget = 'general' | 'material' | 'furniture';

export interface BuildInpaintPromptInput {
  userPrompt: string;
  hasMask: boolean;
  useFullImageMask: boolean;
  hasMaterialReference: boolean;
  hasFurnitureReference?: boolean;
  editTarget?: InpaintEditTarget;
}

export function buildInpaintPrompt(input: BuildInpaintPromptInput): string {
  const editTarget = input.editTarget || 'general';
  const pieces: string[] = [
    'You are a professional architectural and interior image editing assistant.',
    'Preserve the original camera angle, perspective, spatial structure, lighting direction, composition, visual boundary, and canvas ratio.',
    'Do not crop, extend, pad, add borders, add text, add watermarks, or change the image proportions.',
  ];

  if (input.hasMask) {
    pieces.push(
      'The white area of the mask is the editable region. Keep the black area and all unmasked areas as unchanged as possible.',
      'Do not repaint the whole image. Only edit the masked or clearly selected target region.',
    );
  } else if (input.useFullImageMask) {
    pieces.push(
      'The user allows full-image editing, but the original composition, spatial structure, camera view, canvas ratio, and main object relationships must remain stable.',
    );
  } else {
    pieces.push(
      'No mask was provided. Identify the target object or region from the user request, and keep unrelated areas as stable as possible.',
    );
  }

  if (editTarget === 'material') {
    pieces.push(
      'Edit target: material replacement or material refinement.',
      'Only replace or improve material, color, texture, tactile quality, reflection, roughness, and surface detail in the target area.',
      'Do not change furniture shape, spatial structure, doors, windows, floors, ceilings, walls, fixed architecture, or the overall composition.',
    );
    if (input.hasMaterialReference) {
      pieces.push(
        'Material reference images are for material texture, color, pattern, and surface quality only. Do not copy objects, layout, or background from the reference images.',
      );
    }
  } else if (editTarget === 'furniture') {
    pieces.push(
      'Edit target: furniture modification.',
      'Replace, add, remove, or refine furniture according to the mask and user request.',
      'Keep the room perspective, scale, proportions, light direction, camera view, and overall style consistent with the original image.',
      'Do not change walls, floors, doors, windows, ceilings, fixed structures, unrelated furniture, or unmasked areas.',
    );
    if (input.hasFurnitureReference) {
      pieces.push(
        'Furniture reference images are for furniture type, form, proportion, material, color, and style only. Do not copy the reference image background.',
      );
    }
  } else {
    pieces.push(
      'Edit target: general local improvement.',
      'Modify the requested target area while keeping unrelated regions, structure, perspective, lighting, and composition stable.',
    );
  }

  const trimmedUserPrompt = input.userPrompt.trim();
  if (trimmedUserPrompt) {
    pieces.push(`User edit request: ${trimmedUserPrompt}`);
  } else {
    pieces.push(
      'User edit request is empty. Apply a restrained architectural visual refinement only where appropriate, without changing the design scheme.',
    );
  }

  pieces.push(
    'Final result must look natural and integrated with the original scene, with plausible contact shadows, perspective, scale, and material behavior.',
  );

  return pieces.join('\n');
}
