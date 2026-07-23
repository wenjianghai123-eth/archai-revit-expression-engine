import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIGS } from '../constants';
import { GenerationStep, type GenerationConfig, type GenerationRunStateOverride, type StepState, type UploadedImage } from '../types';
import { ImagePolishPanel } from './ImagePolishPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const uploadedImage: UploadedImage = {
  id: 'source-1',
  name: 'source.png',
  type: 'image/png',
  size: 100,
  dataUrl: 'data:image/png;base64,a',
  width: 1200,
  height: 800,
  assetId: 'asset-source-1',
  uploadStatus: 'uploaded',
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

describe('ImagePolishPanel', () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
    vi.restoreAllMocks();
  });

  it('renders all polish modes, optional elements and all nine generation controls before upload', () => {
    const html = renderToStaticMarkup(
      <ImagePolishPanel
        state={createState()}
        onUpdateInputImage={() => undefined}
        onUpdateConfig={() => undefined}
        onGenerate={() => undefined}
      />,
    );

    expect(html).toContain('保守提质');
    expect(html).toContain('标准提质');
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
    expect(html).toContain('可选元素');
    expect(html).toContain('增加人物');
    expect(html).toContain('增加绿植');
    expect(html).toContain('原图保护');
    expect(html).toContain('原图保持强度');
    expect(html).toContain('任务摘要');
    expect(html).toContain('人物：不增加');
    expect(html).toContain('绿植：不增加');
    expect(html).toContain('原图保持强度：严格');
    expect(html).toContain('增强内容：材质、光影、真实感');
  });

  it('keeps optional controls visible after uploading an image and keeps the left panel scrollable', () => {
    const html = renderToStaticMarkup(
      <ImagePolishPanel
        state={createState({ inputImage: uploadedImage })}
        onUpdateInputImage={() => undefined}
        onUpdateConfig={() => undefined}
        onGenerate={() => undefined}
      />,
    );

    expect(html).toContain('data-testid="image-polish-left-panel"');
    expect(html).toContain('overflow-y-auto');
    expect(html).toContain('pb-8');
    expect(html).toContain('可选元素');
    expect(html).toContain('增加人物');
    expect(html).toContain('增加绿植');
    expect(html).toContain('原图保护');
  });

  it('shows quantity choices after enabling people and plants', () => {
    const html = renderToStaticMarkup(
      <ImagePolishPanel
        state={createState({
          config: {
            addPeople: true,
            peopleLevel: 'low',
            addPlants: true,
            plantLevel: 'high',
          },
        })}
        onUpdateInputImage={() => undefined}
        onUpdateConfig={() => undefined}
        onGenerate={() => undefined}
      />,
    );

    expect(html).toContain('少量');
    expect(html).toContain('适量');
    expect(html).toContain('较多');
    expect(html).toContain('人物：少量');
    expect(html).toContain('绿植：较多');
  });

  it('updates task summary immediately and submits the latest optional element state', async () => {
    const onGenerate = vi.fn<(stateOverride?: GenerationRunStateOverride) => void>();
    await renderInteractiveHarness(onGenerate);

    await clickCheckboxByLabel('增加人物');
    expect(container?.textContent).toContain('人物：适量');
    expect(container?.textContent).toContain('绿植：不增加');

    await clickButtonByText('较多');
    expect(container?.textContent).toContain('人物：较多');

    await clickButtonByTextInSection('image-polish-protection', '标准');
    expect(container?.textContent).toContain('原图保持强度：标准');

    await clickButtonByText('立即提升');

    expect(onGenerate).toHaveBeenCalledTimes(1);
    const submittedConfig = onGenerate.mock.calls[0]?.[0]?.config as GenerationConfig | undefined;
    expect(submittedConfig?.addPeople).toBe(true);
    expect(submittedConfig?.peopleLevel).toBe('high');
    expect(submittedConfig?.peopleLevel).not.toBe('none');
    expect(submittedConfig?.addPlants).toBe(false);
    expect(submittedConfig?.plantLevel).toBe('none');
    expect(submittedConfig?.preserveStrictness).toBe('standard');
  });
});

async function renderInteractiveHarness(onGenerate: (stateOverride?: GenerationRunStateOverride) => void) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  function Harness() {
    const [state, setState] = useState<StepState>(createState({ inputImage: uploadedImage }));
    return (
      <ImagePolishPanel
        state={state}
        onUpdateInputImage={inputImage => setState(current => ({ ...current, inputImage }))}
        onUpdateConfig={patch => setState(current => ({ ...current, config: { ...current.config, ...patch } }))}
        onGenerate={onGenerate}
      />
    );
  }

  await act(async () => {
    root?.render(<Harness />);
  });
}

async function clickCheckboxByLabel(text: string) {
  const label = Array.from(container?.querySelectorAll('label') || [])
    .find(item => item.textContent?.includes(text));
  const input = label?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
  expect(input).toBeTruthy();
  await act(async () => {
    input?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function clickButtonByText(text: string) {
  const button = Array.from(container?.querySelectorAll('button') || [])
    .find(item => item.textContent?.includes(text));
  expect(button).toBeTruthy();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function clickButtonByTextInSection(testId: string, text: string) {
  const section = container?.querySelector(`[data-testid="${testId}"]`);
  expect(section).toBeTruthy();
  const button = Array.from(section?.querySelectorAll('button') || [])
    .find(item => item.textContent?.includes(text));
  expect(button).toBeTruthy();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

function createState(overrides: { config?: Partial<StepState['config']>; inputImage?: UploadedImage | null } = {}): StepState {
  return {
    config: { ...DEFAULT_CONFIGS[GenerationStep.ImagePolish], ...overrides.config },
    inputImage: overrides.inputImage ?? null,
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
