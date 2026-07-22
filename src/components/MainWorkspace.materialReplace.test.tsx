import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIGS } from '../constants';
import { GenerationStep, type GenerationConfig, type ReplacementTarget, type StepState } from '../types';
import { MainWorkspace } from './MainWorkspace';

vi.mock('./MaskEditor', () => ({ MaskEditor: () => <div data-testid="mask-editor" /> }));
vi.mock('./workspace/SmartMaskEditor', () => ({ SmartMaskEditor: () => <div data-testid="smart-mask-editor" /> }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const onGenerate = vi.fn();
const targetLabels: Record<ReplacementTarget, string> = {
  plant: '绿植',
  wall: '墙面',
  floor: '地面',
  furniture: '桌椅 / 家具',
  lighting: '灯具',
  artwork: '装饰画',
  decor: '摆件',
};

interface Scenario {
  source?: boolean;
  reference?: boolean;
  mask?: boolean;
  maskHasVisiblePixels?: boolean;
  maskMode?: 'smart' | 'precise';
  maskConfirmed?: boolean;
  maskWorkflowActive?: boolean;
  maskWorkflowMode?: GenerationConfig['maskWorkflowMode'];
  isGenerating?: boolean;
  editTarget?: 'general' | 'material' | 'furniture';
  targetObjectType?: GenerationConfig['targetObjectType'];
  replacementTarget?: GenerationConfig['replacementTarget'];
  replacementPrompt?: string;
  targetMaterial?: GenerationConfig['targetMaterial'];
  result?: boolean;
}

function createState({
  source = true,
  reference = false,
  mask = false,
  maskHasVisiblePixels = mask,
  maskMode = 'precise',
  maskConfirmed = maskMode === 'precise',
  maskWorkflowActive,
  maskWorkflowMode,
  isGenerating = false,
  editTarget = 'general',
  targetObjectType,
  replacementTarget,
  replacementPrompt = '',
  targetMaterial,
  result = false,
}: Scenario = {}): StepState {
  return {
    config: {
      ...DEFAULT_CONFIGS[GenerationStep.MaterialReplace],
      editTarget,
      editMode: maskWorkflowMode === 'none' ? 'smart-type' : 'mask',
      maskSelectionMode: maskMode,
      maskWorkflowMode,
      smartMaskConfirmed: maskConfirmed,
      smartMaskIsRefining: false,
      maskWorkflowActive,
      customMaterialPrompt: replacementPrompt,
      targetObjectType,
      replacementTarget,
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
    outputImage: result ? '/generated-result.png' : null,
    generationResults: result ? [{ id: 'result-1', imageUrl: '/generated-result.png', isSelected: true, isFavorite: false }] : [],
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

function previewButton() {
  const button = Array.from(container?.querySelectorAll('button') ?? [])
    .find(candidate => candidate.textContent?.includes('生成预览') || candidate.textContent?.includes('AI 生成中'));
  if (!(button instanceof HTMLButtonElement)) throw new Error('Missing generate preview button');
  return button;
}

function clickPreview() {
  act(() => previewButton().click());
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  onGenerate.mockReset();
});

describe('MainWorkspace material replacement preview', () => {
  it('shows source upload validation before generation', () => {
    const view = renderScenario({ source: false });
    expect(previewButton().disabled).toBe(true);
    clickPreview();
    expect(view.textContent).toContain('请先上传原始图片');
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('allows plant replacement without a mask and submits semantic-auto scope', () => {
    const view = renderScenario({
      editTarget: 'material',
      targetObjectType: 'plant',
      reference: true,
      mask: false,
      maskWorkflowMode: 'none',
    });
    expect(previewButton().disabled).toBe(false);
    expect(view.textContent).toContain('区域来源');
    expect(view.textContent).toContain('自动识别');
    clickPreview();
    expect(view.textContent).not.toContain('请选择需要替换的材质区域');
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate.mock.calls[0][0]).toMatchObject({
      config: {
        replacementTarget: 'plant',
        editingScope: 'semantic-auto',
        maskWorkflowMode: 'none',
        replacementStrategy: 'replace-existing',
        preserveUnmaskedArea: true,
      },
    });
  });

  it('uses smart-mask validation copy when smart workflow is active but unconfirmed', () => {
    const view = renderScenario({
      editTarget: 'material',
      targetObjectType: 'plant',
      reference: true,
      mask: false,
      maskMode: 'smart',
      maskConfirmed: false,
      maskWorkflowMode: 'smart',
      maskWorkflowActive: true,
    });
    clickPreview();
    expect(view.textContent).toContain('请先完成智能识别并确认替换区域');
    expect(view.textContent).not.toContain('精细涂抹模式');
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('uses manual-mask validation copy only for manual workflow', () => {
    const view = renderScenario({
      editTarget: 'material',
      targetObjectType: 'plant',
      reference: true,
      mask: false,
      maskMode: 'precise',
      maskConfirmed: false,
      maskWorkflowMode: 'manual',
      maskWorkflowActive: true,
    });
    clickPreview();
    expect(view.textContent).toContain('请先确认替换区域');
    expect(view.textContent).not.toContain('请先完成智能识别并确认替换区域');
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('submits smart workflow and masked scope after smart mask confirmation', () => {
    renderScenario({
      editTarget: 'general',
      targetObjectType: 'table-chair',
      reference: true,
      mask: true,
      maskMode: 'smart',
      maskConfirmed: true,
      maskWorkflowMode: 'smart',
    });
    clickPreview();
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate.mock.calls[0][0]).toMatchObject({
      config: {
        replacementTarget: 'furniture',
        editingScope: 'masked',
        maskWorkflowMode: 'smart',
        replacementStrategy: 'replace-masked',
        preserveUnmaskedArea: true,
      },
    });
  });

  it('submits manual workflow and masked scope after precise mask confirmation', () => {
    renderScenario({
      editTarget: 'material',
      targetObjectType: 'wall',
      reference: true,
      mask: true,
      maskMode: 'precise',
      maskConfirmed: true,
      maskWorkflowMode: 'manual',
    });
    clickPreview();
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate.mock.calls[0][0]).toMatchObject({
      config: {
        replacementTarget: 'wall',
        editingScope: 'masked',
        maskWorkflowMode: 'manual',
        replacementStrategy: 'replace-masked',
      },
    });
  });

  it.each(Object.entries(targetLabels) as Array<[ReplacementTarget, string]>)(
    'shows unified task summary for %s',
    (replacementTarget, label) => {
      const view = renderScenario({
        editTarget: 'material',
        targetObjectType: replacementTarget === 'furniture' ? 'table-chair' : replacementTarget,
        replacementTarget,
        reference: true,
        mask: false,
        maskWorkflowMode: 'none',
      });

      const summary = view.querySelector('[data-testid="material-replacement-task-summary"]');
      expect(summary?.textContent).toContain(`替换对象：${label}`);
      expect(summary?.textContent).toContain('区域来源：自动识别');
      expect(summary?.textContent).toContain('操作模式：原位替换');
      expect(summary?.textContent).toContain('额外新增：禁止');
      expect(summary?.textContent).toContain('非目标区域：保持不变');
    },
  );

  it('renders one material texture library in the default material replacement workspace', () => {
    const view = renderScenario();
    expect(view.querySelectorAll('[data-testid="material-textures-panel"]')).toHaveLength(1);
    expect(view.querySelectorAll('[data-testid="material-textures-empty-state"]')).toHaveLength(1);
    expect(view.textContent).toContain('暂无材质贴图，可上传本地图片或从项目素材中选择。');
    expect(view.querySelector('[title="上传材质贴图"]')).not.toBeNull();
  });

  it('hides the material texture library in furnishing mode', () => {
    const view = renderScenario({ editTarget: 'furniture', reference: true });
    expect(view.querySelectorAll('[data-testid="material-textures-panel"]')).toHaveLength(0);
  });

  it('disables during generation', () => {
    const view = renderScenario({ isGenerating: true });
    expect(previewButton().disabled).toBe(true);
    expect(view.textContent).toContain('正在生成预览');
  });
});
