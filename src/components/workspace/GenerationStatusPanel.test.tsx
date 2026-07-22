import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIGS } from '../../constants';
import { GenerationStep, type StepState } from '../../types';
import { GenerationStatusPanel } from './GenerationStatusPanel';

const state: StepState = {
  config: { ...DEFAULT_CONFIGS[GenerationStep.PlanColorize] },
  inputImage: null,
  materialImage: null,
  materialTextures: [],
  furnitureReferences: [],
  maskImage: null,
  useFullImageMask: false,
  outputImage: '/result.png',
  generationResults: [],
  selectedGenerationResultId: null,
  isGenerating: false,
  generationStatus: 'success',
  generationError: null,
  generationWarnings: [],
  generationProvider: null,
  generationResultId: null,
  generationCreatedAt: null,
  generationJobId: null,
  generationJobStatus: null,
  generationJobDiagnostics: null,
  generationProgress: 100,
  generationLogs: [],
  viewMode: 'after',
};

function renderPanel(showResultViewer = true) {
  return renderToStaticMarkup(
    <GenerationStatusPanel
      step={GenerationStep.PlanColorize}
      state={state}
      title="图纸智能表达结果"
      statusLabel="已完成"
      elapsedSeconds={0}
      canGenerate
      previewImage="/result.png"
      originalImageUrl="/source.png"
      resultOptions={[]}
      selectedResultId={null}
      viewModeOptions={[
        { value: 'after', label: '结果图', disabled: false },
        { value: 'original', label: '原图', disabled: false },
        { value: 'compare', label: '对比', disabled: false },
        { value: 'overlay', label: '叠加对比', disabled: false },
      ]}
      topPanels={null}
      onGenerate={() => undefined}
      onRegenerate={() => undefined}
      onCancelGeneration={() => undefined}
      onSelectGenerationResult={() => undefined}
      onToggleGenerationFavorite={() => undefined}
      onSecondaryEditResult={() => undefined}
      onSendResultToStep={() => undefined}
      onSetViewMode={() => undefined}
      onNextStep={() => undefined}
      onReset={() => undefined}
      showResultViewer={showResultViewer}
    />,
  );
}

describe('GenerationStatusPanel result viewer', () => {
  it('renders only one tab list after removing the duplicate manual tabs', () => {
    expect((renderPanel().match(/>叠加对比<\/button>/gu) || [])).toHaveLength(1);
  });

  it('can hide the sidebar viewer when the central workspace owns result display', () => {
    expect(renderPanel(false)).not.toContain('>叠加对比</button>');
  });

  it('keeps the action footer outside the independently scrollable content', () => {
    const markup = renderPanel(false);

    expect(markup).toContain('drawing-right-panel-content');
    expect(markup).toContain('drawing-right-panel-footer');
    expect(markup.indexOf('drawing-right-panel-content')).toBeLessThan(markup.indexOf('drawing-right-panel-footer'));
    expect(markup).not.toContain('xl:w-80');
  });

  it('provides shared original, result, save and progress controls for generic generation steps', () => {
    const markup = renderPanel(false);

    expect(markup).toContain('查看原图');
    expect(markup).toContain('查看结果图');
    expect(markup).toContain('保存文件');
    expect(markup).toContain('生成完成');
    expect(markup).toContain('100%');
  });
});
