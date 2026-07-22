import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIGS } from '../constants';
import { GenerationStep, type GenerationConfig, type StepState } from '../types';
import { MainWorkspace } from './MainWorkspace';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const onSetViewMode = vi.fn();
const onGenerate = vi.fn();
const onRegenerate = vi.fn();

interface WorkspaceScenario {
  withResult?: boolean;
  isGenerating?: boolean;
  generationStatus?: StepState['generationStatus'];
  generationError?: string | null;
}

function createState({
  withResult = false,
  isGenerating = false,
  generationStatus = withResult ? 'success' : 'ready',
  generationError = null,
}: WorkspaceScenario = {}): StepState {
  return {
    config: { ...DEFAULT_CONFIGS[GenerationStep.FloorplanTo3D] },
    inputImage: {
      id: 'source-image',
      name: 'plan.png',
      type: 'image/png',
      size: 10,
      dataUrl: '/source-plan.png',
      uploadStatus: 'uploaded',
      uploadProgress: 100,
    },
    materialImage: null,
    materialTextures: [],
    furnitureReferences: [],
    maskImage: null,
    useFullImageMask: false,
    outputImage: withResult ? '/result-plan.png' : null,
    generationResults: withResult ? [{ id: 'result-1', imageUrl: '/result-plan.png', isSelected: true, isFavorite: false }] : [],
    selectedGenerationResultId: withResult ? 'result-1' : null,
    isGenerating,
    generationStatus,
    generationError,
    generationWarnings: [],
    generationProvider: null,
    generationResultId: withResult ? 'result-1' : null,
    generationCreatedAt: null,
    generationJobId: null,
    generationJobStatus: isGenerating ? 'running' : withResult ? 'succeeded' : generationStatus === 'error' ? 'failed' : null,
    generationJobDiagnostics: null,
    generationProgress: withResult ? 100 : 0,
    generationLogs: [],
    viewMode: 'original',
  };
}

function Harness({ scenario = {} }: { scenario?: WorkspaceScenario }) {
  const [state, setState] = useState(() => createState(scenario));
  const updateConfig = (patch: Partial<GenerationConfig>) => setState(current => ({
    ...current,
    config: { ...current.config, ...patch },
  }));
  const setViewerMode = (viewMode: StepState['viewMode']) => {
    onSetViewMode(viewMode);
    setState(current => ({ ...current, viewMode }));
  };

  return (
    <MainWorkspace
      step={GenerationStep.FloorplanTo3D}
      state={state}
      onUpdateConfig={updateConfig}
      onUpdateInputImage={() => undefined}
      onUpdateMaterialImage={() => undefined}
      onUpdateMaterialTextures={() => undefined}
      onUpdateFurnitureReferences={() => undefined}
      onUpdateMaskImage={() => undefined}
      onGenerate={onGenerate}
      onRegenerate={onRegenerate}
      onCancelGeneration={() => undefined}
      onSelectGenerationResult={() => undefined}
      onToggleGenerationFavorite={() => undefined}
      onSecondaryEditResult={() => undefined}
      onSendResultToStep={() => undefined}
      onContinueObjectInsertRefine={() => undefined}
      onRenameGenerationResult={() => undefined}
      onSetViewMode={setViewerMode}
      onNextStep={() => undefined}
      onReset={() => undefined}
      backendProvider={null}
      isCreditsInsufficient={false}
    />
  );
}

function renderWorkspace(scenario: WorkspaceScenario = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness scenario={scenario} />));
  return container;
}

function clickTool(tool: string) {
  const button = container?.querySelector(`[data-tool="${tool}"]`);
  if (!button) throw new Error(`Missing drawing tool ${tool}`);
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  onSetViewMode.mockReset();
  onGenerate.mockReset();
  onRegenerate.mockReset();
});

describe('MainWorkspace drawing expression state isolation', () => {
  it('keeps all tools visible and opens 3D settings without changing viewer mode', () => {
    const view = renderWorkspace();
    expect(view.querySelectorAll('[data-tool]')).toHaveLength(6);
    expect(view.querySelector('[data-testid="drawing-viewer-toolbar"]')).toBeTruthy();
    expect(view.querySelector('[data-testid="drawing-action-panel"]')).toBeTruthy();
    expect(view.textContent).toContain('生成预览');

    clickTool('color-plan-3d');

    expect(view.querySelector('[data-tool="color-plan-3d"]')?.getAttribute('aria-selected')).toBe('true');
    expect(view.textContent).toContain('三维彩平参数');
    expect(view.querySelector('[data-testid="drawing-action-panel"]')).toBeTruthy();
    expect(view.textContent).toContain('生成预览');
    expect(onSetViewMode).not.toHaveBeenCalled();
    expect(view.querySelectorAll('[data-tool]')).toHaveLength(6);

    const originalTab = Array.from(view.querySelectorAll('[role="tab"]')).find(tab => tab.textContent?.includes('原图')) as HTMLButtonElement;
    const resultTab = Array.from(view.querySelectorAll('[role="tab"]')).find(tab => tab.textContent?.includes('结果图')) as HTMLButtonElement;
    expect(originalTab.disabled).toBe(false);
    expect(resultTab.disabled).toBe(true);
  });

  it('changes overlay viewing without losing the selected tool or navigation', () => {
    const view = renderWorkspace({ withResult: true });
    clickTool('color-plan-3d');

    const overlayTab = Array.from(view.querySelectorAll('[role="tab"]')).find(tab => tab.textContent?.includes('叠加对比')) as HTMLButtonElement;
    act(() => overlayTab.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(onSetViewMode).toHaveBeenCalledWith('overlay');
    expect(view.querySelector('[data-tool="color-plan-3d"]')?.getAttribute('aria-selected')).toBe('true');
    expect(view.querySelectorAll('[data-tool]')).toHaveLength(6);
    expect(view.querySelector('[data-testid="drawing-action-panel"]')).toBeTruthy();

    clickTool('region-recognition');
    expect(view.querySelector('[data-tool="region-recognition"]')?.getAttribute('aria-selected')).toBe('true');
    expect(view.textContent).toContain('地面区域识别与校正');
    expect(view.querySelector('[data-testid="drawing-viewer-toolbar"]')).toBeTruthy();
    expect(view.querySelector('[data-testid="drawing-action-panel"]')).toBeTruthy();
  });

  it('keeps the action panel mounted across every viewer mode without changing the active tool', () => {
    const view = renderWorkspace({ withResult: true });
    clickTool('color-plan-3d');

    for (const label of ['原图', '结果图', '对比', '叠加对比']) {
      const tab = Array.from(view.querySelectorAll('[role="tab"]')).find(item => item.textContent?.includes(label));
      expect(tab, `missing ${label} tab`).toBeTruthy();
      act(() => tab?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      expect(view.querySelector('[data-testid="drawing-action-panel"]')).toBeTruthy();
      expect(view.querySelector('[data-tool="color-plan-3d"]')?.getAttribute('aria-selected')).toBe('true');
    }
  });

  it('keeps the action panel visible and prevents duplicate submission while generating', () => {
    const view = renderWorkspace({ isGenerating: true, generationStatus: 'generating' });
    const actionPanel = view.querySelector('[data-testid="drawing-action-panel"]');

    expect(actionPanel).toBeTruthy();
    expect(actionPanel?.textContent).toContain('AI 生成中');
    const footerButtons = actionPanel?.querySelectorAll('button') || [];
    expect(Array.from(footerButtons).filter(button => (button as HTMLButtonElement).disabled).length).toBeGreaterThan(0);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('keeps regenerate actions and the tool navigation after generation completes', () => {
    const view = renderWorkspace({ withResult: true });
    const actionPanel = view.querySelector('[data-testid="drawing-action-panel"]');

    expect(actionPanel).toBeTruthy();
    expect(actionPanel?.textContent).toContain('重新生成');
    expect(view.querySelectorAll('[data-tool]')).toHaveLength(6);
  });

  it('shows generation errors and retry without losing the uploaded drawing or settings', () => {
    const view = renderWorkspace({ generationStatus: 'error', generationError: '图纸生成失败，请重试' });
    const actionPanel = view.querySelector('[data-testid="drawing-action-panel"]');

    expect(actionPanel).toBeTruthy();
    expect(actionPanel?.textContent).toContain('图纸生成失败，请重试');
    expect(actionPanel?.textContent).toContain('重试');
    expect(view.querySelector('img[src="/source-plan.png"]')).toBeTruthy();
    expect(view.textContent).toContain('智能提示词助手');
    expect(view.querySelectorAll('[data-tool]')).toHaveLength(6);
  });

  it('renders all layout regions and keeps the action footer separate from scrollable content', () => {
    const view = renderWorkspace();
    const workspace = view.querySelector('.drawing-workspace');
    const settingsPanel = view.querySelector('[data-testid="drawing-settings-panel"]');
    const viewer = view.querySelector('[data-testid="drawing-viewer"]');
    const actionPanel = view.querySelector('[data-testid="drawing-action-panel"]');

    expect(workspace?.className).toContain('grid-cols-1');
    expect(workspace?.className).toContain('min-w-0');
    expect(settingsPanel).toBeTruthy();
    expect(viewer).toBeTruthy();
    expect(actionPanel?.classList.contains('hidden')).toBe(false);
    expect(actionPanel?.className).toContain('overflow-hidden');
    expect(actionPanel?.className).not.toContain('xl:w-80');
    expect(actionPanel?.querySelector('.drawing-right-panel-content')).toBeTruthy();
    expect(actionPanel?.querySelector('.drawing-right-panel-footer')).toBeTruthy();
    expect(actionPanel?.querySelector('.drawing-right-panel-footer')?.textContent).toContain('生成预览');
  });
});
