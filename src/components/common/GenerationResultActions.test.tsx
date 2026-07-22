import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedGenerationResult } from '../../utils/normalizeGenerationResult';
import { FullscreenImageViewerProvider } from './FullscreenImageViewer';
import { GenerationResultActions } from './GenerationResultActions';

const downloadImageFileMock = vi.fn<(input: unknown) => Promise<void>>(async () => undefined);

vi.mock('../../utils/downloadImageFile', () => ({
  downloadImageFile: (input: unknown) => downloadImageFileMock(input),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const baseResult: NormalizedGenerationResult = {
  originalImageUrl: '/original.png',
  resultImageUrl: '/result.png',
  taskId: 'job-1',
  status: 'completed',
  progress: 100,
  progressLabel: '生成完成',
  errorMessage: null,
};

function renderActions(result: NormalizedGenerationResult) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(
    <FullscreenImageViewerProvider>
      <GenerationResultActions result={result} featureName="方案变体" projectName="酒店大堂" />
    </FullscreenImageViewerProvider>,
  ));
  return container;
}

function getButton(view: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(view.querySelectorAll('button')).find(item => item.textContent?.includes(label));
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  downloadImageFileMock.mockClear();
});

describe('GenerationResultActions', () => {
  it('enables both viewers and opens the shared fullscreen result viewer', () => {
    const view = renderActions(baseResult);

    expect(getButton(view, '查看原图').disabled).toBe(false);
    expect(getButton(view, '查看结果图').disabled).toBe(false);
    act(() => getButton(view, '查看结果图').click());
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('方案变体 · 生成结果');
  });

  it('disables unavailable image actions and explains the empty result', () => {
    const view = renderActions({ ...baseResult, originalImageUrl: null, resultImageUrl: null, status: 'idle', progress: null });

    expect(getButton(view, '查看原图').disabled).toBe(true);
    expect(getButton(view, '查看结果图').disabled).toBe(true);
    expect(getButton(view, '保存文件').disabled).toBe(true);
    expect(view.textContent).toContain('生成完成后可查看和保存结果');
  });

  it('downloads the result exactly once', async () => {
    const view = renderActions(baseResult);

    await act(async () => {
      getButton(view, '保存文件').click();
      await Promise.resolve();
    });
    expect(downloadImageFileMock).toHaveBeenCalledTimes(1);
    expect(downloadImageFileMock).toHaveBeenCalledWith(expect.objectContaining({ imageUrl: '/result.png', featureName: '方案变体' }));
  });
});
