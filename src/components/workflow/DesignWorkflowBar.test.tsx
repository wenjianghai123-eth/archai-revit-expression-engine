import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { DesignWorkflowBar } from './DesignWorkflowBar';

describe('DesignWorkflowBar', () => {
  it('requires a formal asset before starting', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(
      <DesignWorkflowBar
        detail={null}
        hasFormalInputAsset={false}
        isBusy={false}
        error={null}
        onStart={() => undefined}
        onBack={() => undefined}
        onSkip={() => undefined}
        onAdvance={() => undefined}
      />,
    ));
    expect(container.textContent).toContain('请先完成图片上传并取得正式 assetId');
    expect(container.querySelector('button')?.disabled).toBe(true);
    act(() => root.unmount());
  });

  it('shows current, completed, skipped, back, and advance states', () => {
    const onBack = vi.fn();
    const onSkip = vi.fn();
    const onAdvance = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(
      <DesignWorkflowBar
        detail={{
          workflow: {
            id: 'workflow-1',
            userId: 'user-1',
            projectId: 'project-1',
            title: '设计表达流程',
            status: 'active',
            currentNodeId: 'node-3',
            createdAt: '2026-07-16T00:00:00Z',
            updatedAt: '2026-07-16T00:00:00Z',
          },
          nodes: [
            node('node-1', null, 'input', 'completed'),
            node('node-2', 'node-1', 'base-render', 'skipped'),
            {
              ...node('node-3', 'node-2', 'design-variants', 'completed'),
              outputAssetId: 'asset-result',
              outputJobId: 'job-1',
              outputResultId: 'result-1',
            },
          ],
        }}
        hasFormalInputAsset
        isBusy={false}
        error={null}
        onStart={() => undefined}
        onBack={onBack}
        onSkip={onSkip}
        onAdvance={onAdvance}
      />,
    ));

    expect(container.textContent).toContain('当前：方案变体');
    expect(container.textContent).toContain('跳过此步');
    const buttons = Array.from(container.querySelectorAll('button'));
    act(() => buttons.find(button => button.textContent?.includes('回退'))
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    act(() => buttons.find(button => button.textContent?.includes('跳过此步'))
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    act(() => buttons.find(button => button.textContent?.includes('进入下一步'))
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onAdvance).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
});

function node(
  id: string,
  parentNodeId: string | null,
  stageKey: 'input' | 'base-render' | 'design-variants',
  status: 'active' | 'completed' | 'skipped',
) {
  return {
    id,
    workflowId: 'workflow-1',
    parentNodeId,
    stageKey,
    status,
    sourceFeature: null,
    inputAssetId: 'asset-input',
    parentJobId: null,
    parentResultId: null,
    outputJobId: null,
    outputResultId: null,
    outputAssetId: null,
    metadata: {},
    createdAt: '2026-07-16T00:00:00Z',
    updatedAt: '2026-07-16T00:00:00Z',
  };
}
