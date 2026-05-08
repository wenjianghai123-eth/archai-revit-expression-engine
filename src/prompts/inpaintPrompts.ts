export interface BuildInpaintPromptInput {
  userPrompt: string;
  hasMask: boolean;
  useFullImageMask: boolean;
  hasMaterialReference: boolean;
}

export function buildInpaintPrompt(input: BuildInpaintPromptInput): string {
  const pieces: string[] = [];

  if (input.hasMask) {
    pieces.push(
      '你是一名专业建筑表现与室内设计图像编辑助手。请基于输入图进行局部重绘。用户已提供 mask / 涂抹区域，请严格优先修改 mask 白色区域或用户标注区域，未选区域应尽量保持不变，包括构图、透视、空间结构、主体比例、门窗位置、家具布局和整体风格。',
    );
  } else if (input.useFullImageMask) {
    pieces.push(
      '你是一名专业建筑表现与室内设计图像编辑助手。用户选择整图修改，请基于用户提示词对整张图进行整体优化或重绘，但仍需保持原图的主体空间结构、构图、透视关系和主要设计逻辑稳定，避免无关的大幅变形。',
    );
  } else {
    pieces.push(
      '你是一名专业建筑表现与室内设计图像编辑助手。用户未提供 mask / 涂抹区域，请根据用户提示词自动判断需要修改的对象、材质或区域。可以进行局部或全局智能编辑，但应尽量保持原图主体结构、空间关系、构图、透视、门窗位置、家具布局和未相关区域稳定。',
    );
  }

  if (input.hasMaterialReference) {
    pieces.push(
      '用户上传了材质贴图或参考图。请将材质贴图作为材质、纹理、颜色、质感和细节表现参考，应用到用户提示词指定的对象或区域；如果用户没有明确对象，请根据上下文判断最合理的应用区域。',
    );
  }

  const trimmedUserPrompt = input.userPrompt.trim();
  if (trimmedUserPrompt) {
    pieces.push(`用户具体修改需求：${trimmedUserPrompt}`);
  } else {
    pieces.push(
      '用户未填写具体修改需求时，请进行克制的建筑表现优化，例如提升材质真实感、光影层次、细节清晰度和整体画面质感，但不要改变原图设计方案。',
    );
  }

  pieces.push(
    '输出要求：结果应自然真实，与原图风格协调；避免文字、水印、标签、边框、明显拼接痕迹、错误透视、扭曲结构或不合理新增物体。',
  );

  return pieces.join('\n');
}
