import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIGS } from '../constants';
import { GenerationStep, type GenerationConfig, type StepState } from '../types';
import { MainWorkspace } from './MainWorkspace';

vi.mock('./MaskEditor', () => ({ MaskEditor: () => <div data-testid="mask-editor" /> }));
vi.mock('./workspace/SmartMaskEditor', () => ({ SmartMaskEditor: () => <div data-testid="smart-mask-editor" /> }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const onGenerate = vi.fn();

interface Scenario {
  source?: boolean;
  reference?: boolean;
  mask?: boolean;
  maskHasVisiblePixels?: boolean;
  maskMode?: 'smart' | 'precise';
  maskConfirmed?: boolean;
  isGenerating?: boolean;
  editTarget?: 'general' | 'material' | 'furniture';
  replacementPrompt?: string;
  targetMaterial?: GenerationConfig['targetMaterial'];
}

function createState({
  source = true,
  reference = false,
  mask = false,
  maskHasVisiblePixels = mask,
  maskMode = 'precise',
  maskConfirmed = maskMode === 'precise',
  isGenerating = false,
  editTarget = 'general',
  replacementPrompt = '',
  targetMaterial,
}: Scenario = {}): StepState {
  return {
    config: {
      ...DEFAULT_CONFIGS[GenerationStep.MaterialReplace],
      editTarget,
      editMode: 'mask',
      maskSelectionMode: maskMode,
      smartMaskConfirmed: maskConfirmed,
      smartMaskIsRefining: false,
      customMaterialPrompt: replacementPrompt,
      targetMaterial,
    },
    inputImage: source ? {
      id: 'source-image',
      name: 'source.png',
      type: 'image/png',
      size: 10,
      dataUrl: '',
      publicUrl: '/persisted-source.png',
      uploadStatus: 'uploaded',
      uploadProgress: 100,
    } : null,
    materialImage: null,
    materialTextures: reference ? [{
      id: 'reference-image',
      name: editTarget === 'furniture' ? '软装参考' : '材质参考',
      url: '/replacement-reference.png',
      source: 'upload',
      uploadStatus: 'uploaded',
    }] : [],
    furnitureReferences: [],
    maskImage: mask ? {
      id: 'mask-image',
      name: 'mask.png',
      type: 'image/png',
      size: 1,
      dataUrl: 'data:image/png;base64,valid-mask',
    } : null,
    maskHasVisiblePixels,
    useFullImageMask: false,
    outputImage: null,
    generationResults: [],
    selectedGenerationResultId: null,
    isGenerating,
    generationStatus: isGenerating ? 'generating' : 'ready',
    generationError: null,
    generationWarnings: [],
    generationProvider: null,
    generationResultId: null,
    generationCreatedAt: null,
    generationJobId: null,
    generationJobStatus: isGenerating ? 'running' : null,
    generationJobDiagnostics: null,
    generationProgress: 0,
    generationLogs: [],
    viewMode: 'original',
  };
}

function Harness({ scenario }: { scenario: Scenario }) {
  const [state, setState] = useState(() => createState(scenario));
  const updateConfig = (patch: Partial<GenerationConfig>) => setState(current => ({
    ...current,
    config: { ...current.config, ...patch },
  }));

  return <MainWorkspace
    step={GenerationStep.MaterialReplace}
    state={state}
    onUpdateConfig={updateConfig}
    onUpdateInputImage={() => undefined}
    onUpdateMaterialImage={() => undefined}
    onUpdateMaterialTextures={() => undefined}
    onUpdateFurnitureReferences={() => undefined}
    onUpdateMaskImage={() => undefined}
    onGenerate={onGenerate}
    onRegenerate={() => onGenerate()}
    onCancelGeneration={() => undefined}
    onSelectGenerationResult={() => undefined}
    onToggleGenerationFavorite={() => undefined}
    onSecondaryEditResult={() => undefined}
    onSendResultToStep={() => undefined}
    onContinueObjectInsertRefine={() => undefined}
    onRenameGenerationResult={() => undefined}
    onSetViewMode={() => undefined}
    onNextStep={() => undefined}
    onReset={() => undefined}
    backendProvider={null}
    isCreditsInsufficient={false}
  />;
}

function renderScenario(scenario: Scenario = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness scenario={scenario} />));
  return container;
}

function previewButton(): HTMLButtonElement {
  const button = container?.querySelector('[data-testid="generate-preview-button"]');
  if (!(button instanceof HTMLButtonElement)) throw new Error('Missing generate preview button');
  return button;
}

function clickPreview() {
  act(() => previewButton().click());
}

function remount(scenario: Scenario) {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  return renderScenario(scenario);
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  onGenerate.mockReset();
});

describe('MainWorkspace material replacement preview', () => {
  it('disables preview only before a source image exists', () => {
    const view = renderScenario({ source: false });
    expect(previewButton().disabled).toBe(true);
    expect(view.textContent).toContain('请先上传原始图片');
  });

  it('enables immediately after a URL-only source image is restored', () => {
    renderScenario({ source: true, reference: false, mask: false });
    expect(previewButton().disabled).toBe(false);
  });

  it('submits auto enhancement with only the source image and a safe default prompt', () => {
    renderScenario({ editTarget: 'general', reference: false, mask: false });
    clickPreview();
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate.mock.calls[0][0]).toMatchObject({
      config: {
        editTarget: 'general',
        editMode: 'smart-type',
        targetObjectType: 'other',
      },
    });
    expect(onGenerate.mock.calls[0][0].config.customMaterialPrompt).toContain('自动分析画面');
  });

  it('lists a missing local material region only after click', () => {
    const view = renderScenario({ editTarget: 'material', reference: true, mask: false });
    expect(previewButton().disabled).toBe(false);
    expect(view.textContent).not.toContain('暂时无法生成');
    clickPreview();
    expect(view.textContent).toContain('请选择需要替换的材质区域');
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('lists the reference-or-description rule and accepts either option', () => {
    const view = renderScenario({ editTarget: 'material', reference: false, mask: true });
    clickPreview();
    expect(view.textContent).toContain('请上传材质参考图或填写材质替换描述，至少完成一项');

    remount({ editTarget: 'material', reference: false, mask: true, replacementPrompt: '换成浅色石材' });
    clickPreview();
    expect(onGenerate).toHaveBeenCalledTimes(1);

    onGenerate.mockReset();
    remount({ editTarget: 'material', reference: true, mask: true, replacementPrompt: '' });
    clickPreview();
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('removes resolved validation items as the user completes a preset', () => {
    const view = renderScenario({ editTarget: 'material', reference: false, mask: true });
    clickPreview();
    expect(view.querySelector('[role="alert"]')?.textContent).toContain('请上传材质参考图或填写材质替换描述');
    const preset = Array.from(view.querySelectorAll('button')).find(button => button.textContent === '浅木色');
    if (!(preset instanceof HTMLButtonElement)) throw new Error('Missing material preset button');
    act(() => preset.click());
    expect(view.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows smart-mask confirmation and submits after confirmation', () => {
    const view = renderScenario({ editTarget: 'material', reference: true, mask: true, maskMode: 'smart', maskConfirmed: false });
    clickPreview();
    expect(view.textContent).toContain('请先确认智能识别的替换区域');
    expect(onGenerate).not.toHaveBeenCalled();

    remount({ editTarget: 'material', reference: true, mask: true, maskMode: 'smart', maskConfirmed: true });
    clickPreview();
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('disables during generation and restores the existing handler afterwards', () => {
    const view = renderScenario({ isGenerating: true });
    expect(previewButton().disabled).toBe(true);
    expect(view.textContent).toContain('正在生成预览');
    remount({ isGenerating: false, editTarget: 'general' });
    clickPreview();
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('keeps the action footer above local editor overlays', () => {
    renderScenario();
    const footer = container?.querySelector('.preview-actions');
    expect(footer?.className).toContain('pointer-events-auto');
    expect(footer?.className).toContain('z-[1]');
  });
});
