import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIGS } from '../constants';
import { GenerationStep, type StepState } from '../types';
import { ModelSnapshotRenderPanel } from './ModelSnapshotRenderPanel';

vi.mock('../lib/api', () => ({
  getModelAsset: vi.fn(),
  listModelAssets: vi.fn().mockResolvedValue([]),
  optimizeModelAsset: vi.fn(),
  uploadImageAsset: vi.fn(),
  uploadModelAsset: vi.fn(),
}));

function createState(): StepState {
  return {
    config: { ...DEFAULT_CONFIGS[GenerationStep.ModelSnapshotRender] },
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

describe('ModelSnapshotRenderPanel', () => {
  it('renders clear model/screenshot modes, camera presets, bookmarks, and batch actions', () => {
    const html = renderToStaticMarkup(
      <ModelSnapshotRenderPanel
        state={createState()}
        onUpdateConfig={() => undefined}
        onUpdateInputImage={() => undefined}
        onGenerate={() => undefined}
      />,
    );

    expect(html).toContain('真实模型取景');
    expect(html).toContain('模型截图输入');
    expect(html).toContain('相机预设');
    expect(html).toContain('室内');
    expect(html).toContain('外立面');
    expect(html).toContain('鸟瞰');
    expect(html).toContain('多视角列表');
    expect(html).toContain('保存当前视角');
    expect(html).toContain('批量快渲 0 个视角');
    expect(html).toContain('暂不支持 FBX 和 SKP 原生文件');
  });
});
