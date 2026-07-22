import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIGS } from '../constants';
import { GenerationStep, type StepState } from '../types';
import { ImagePolishPanel } from './ImagePolishPanel';

function createState(): StepState {
  return {
    config: { ...DEFAULT_CONFIGS[GenerationStep.ImagePolish] },
    inputImage: null,
    materialImage: null,
    materialTextures: [],
    furnitureReferences: [],
    maskImage: null,
    useFullImageMask: false,
    outputImage: null,
    generationResults: [],
    selectedGenerationResultId: null,
    isGenerating: false,
    generationStatus: 'ready',
    generationError: null,
    generationWarnings: [],
    generationProvider: null,
    generationResultId: null,
    generationCreatedAt: null,
    generationJobId: null,
    generationJobStatus: null,
    generationJobDiagnostics: null,
    generationProgress: 0,
    generationLogs: [],
    viewMode: 'after',
  };
}

describe('ImagePolishPanel', () => {
  it('renders the two polish modes and all nine generation controls', () => {
    const html = renderToStaticMarkup(
      <ImagePolishPanel
        state={createState()}
        onUpdateInputImage={() => undefined}
        onUpdateConfig={() => undefined}
        onGenerate={() => undefined}
      />,
    );

    expect(html).toContain('保守提质');
    expect(html).toContain('白模材质化');
    expect(html).toContain('清晰度');
    expect(html).toContain('光影优化');
    expect(html).toContain('材质细节');
    expect(html).toContain('去模型感');
    expect(html).toContain('色彩保持');
    expect(html).toContain('结构保持');
    expect(html).toContain('降噪');
    expect(html).toContain('阴影');
    expect(html).toContain('反射');
    expect(html).toContain('不新增人物、绿植或家具');
  });
});
