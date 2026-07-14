import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIGS } from '../constants';
import { GenerationStep, StepState } from '../types';
import { Stepper } from './Navigation';
import { PlanColorizePanel } from './PlanColorizePanel';

function createState(overrides: Partial<StepState> = {}): StepState {
  return {
    config: { ...DEFAULT_CONFIGS[GenerationStep.PlanColorize] },
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
    ...overrides,
  };
}

describe('PlanColorizePanel', () => {
  it('renders the 图纸智能表达 workflow with expression options', () => {
    const html = renderToStaticMarkup(
      <PlanColorizePanel
        state={createState()}
        previewImage={null}
        uploadError={null}
        onUploadInput={() => undefined}
        onUpdateInputImage={() => undefined}
        onUpdateConfig={() => undefined}
        onGenerate={() => undefined}
      />,
    );

    expect(html).toContain('图纸智能表达');
    expect(html).toContain('上传 CAD 导出的黑白平面图，生成彩色分区、标注和表达图');
    expect(html).toContain('图纸类型');
    expect(html).toContain('表达模板');
    expect(html).toContain('功能分区上色');
    expect(html).toContain('房间名称标注');
    expect(html).toContain('动线箭头');
    expect(html).toContain('景观/铺装/绿化填充');
    expect(html).toContain('生成彩平');
  });

  it('uses compact 16:9 before and after preview cards', () => {
    const html = renderToStaticMarkup(
      <PlanColorizePanel
        state={createState()}
        previewImage={null}
        uploadError={null}
        onUploadInput={() => undefined}
        onUpdateInputImage={() => undefined}
        onUpdateConfig={() => undefined}
        onGenerate={() => undefined}
      />,
    );

    expect(html).toContain('2xl:grid-cols-2');
    expect(html).toContain('aspect-video');
    expect(html).not.toContain('min-h-[520px]');
  });

  it('allows generation without custom prompt after a source plan is selected', () => {
    const html = renderToStaticMarkup(
      <PlanColorizePanel
        state={createState({
          inputImage: {
            id: 'image_plan',
            assetId: 'image_plan',
            name: 'plan.png',
            type: 'image/png',
            size: 10,
            dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
          },
        })}
        previewImage={null}
        uploadError={null}
        onUploadInput={() => undefined}
        onUpdateInputImage={() => undefined}
        onUpdateConfig={() => undefined}
        onGenerate={() => undefined}
      />,
    );

    expect(html).toContain('plan.png');
    expect(html).not.toContain('disabled=""');
  });

  it('shows the 平面彩平 entry in the workspace stepper', () => {
    const html = renderToStaticMarkup(
      <Stepper currentStep={GenerationStep.FloorplanTo3D} onStepChange={() => undefined} />,
    );

    expect(html).toContain('平面彩平');
    expect(html).toContain('当前功能：平面彩平');
  });
});
