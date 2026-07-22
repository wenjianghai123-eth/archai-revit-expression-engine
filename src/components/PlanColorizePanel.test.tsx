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
  it('renders the 图纸表达中心 workflow with four compatible expression modes', () => {
    const html = renderToStaticMarkup(
      <PlanColorizePanel
        state={createState()}
        viewerData={{}}
        uploadError={null}
        onUploadInput={() => undefined}
        onUpdateInputImage={() => undefined}
        onUpdateConfig={() => undefined}
        onGenerate={() => undefined}
      />,
    );

    expect(html).toContain('图纸表达中心');
    expect(html).toContain('区域材质、三维彩平、分析图与多方案表达');
    expect(html).toContain('精准材质彩平');
    expect(html).toContain('三维彩平');
    expect(html).toContain('分析表达图');
    expect(html).toContain('多方案彩平');
    expect(html).toContain('不生成文字');
    expect(html).toContain('结构一致性');
    expect(html).toContain('图纸类型');
    expect(html).toContain('表达模板');
    expect(html).toContain('功能分区上色');
    expect(html).toContain('房间名称标注');
    expect(html).toContain('动线箭头');
    expect(html).toContain('景观/铺装/绿化填充');
    expect(html).toContain('生成彩平');
  });

  it('uses one large result viewer instead of compact duplicate preview cards', () => {
    const html = renderToStaticMarkup(
      <PlanColorizePanel
        state={createState()}
        viewerData={{}}
        uploadError={null}
        onUploadInput={() => undefined}
        onUpdateInputImage={() => undefined}
        onUpdateConfig={() => undefined}
        onGenerate={() => undefined}
      />,
    );

    expect(html).toContain('图纸表达结果查看器');
    expect(html).toContain('min-h-[520px]');
    expect(html).not.toContain('2xl:grid-cols-2');
    expect(html).not.toContain('表达结果</p>');
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
        viewerData={{ originalImage: 'data:image/png;base64,iVBORw0KGgo=' }}
        uploadError={null}
        onUploadInput={() => undefined}
        onUpdateInputImage={() => undefined}
        onUpdateConfig={() => undefined}
        onGenerate={() => undefined}
      />,
    );

    expect(html).toContain('plan.png');
    const view = document.createElement('div');
    view.innerHTML = html;
    const generateButton = Array.from(view.querySelectorAll('button')).find(button => button.textContent?.includes('生成彩平'));
    expect(generateButton?.hasAttribute('disabled')).toBe(false);
  });

  it('keeps the central viewer visible with a completed generation result', () => {
    const html = renderToStaticMarkup(
      <PlanColorizePanel
        state={createState({ generationStatus: 'success', viewMode: 'after' })}
        viewerData={{
          originalImage: '/uploads/source-plan.png',
          originalAssetId: 'source-asset',
          resultImage: '/uploads/generated-plan.png',
          resultAssetId: 'result-asset',
        }}
        uploadError={null}
        onUploadInput={() => undefined}
        onUpdateInputImage={() => undefined}
        onUpdateConfig={() => undefined}
        onGenerate={() => undefined}
      />,
    );

    expect(html).toContain('result-image-canvas');
    expect(html).toContain('/uploads/generated-plan.png');
    expect(html).toContain('object-contain');
  });

  it('shows the 平面彩平 entry in the workspace stepper', () => {
    const html = renderToStaticMarkup(
      <Stepper currentStep={GenerationStep.FloorplanTo3D} onStepChange={() => undefined} />,
    );

    expect(html).toContain('平面彩平');
    expect(html).toContain('当前功能：平面彩平');
  });
});
