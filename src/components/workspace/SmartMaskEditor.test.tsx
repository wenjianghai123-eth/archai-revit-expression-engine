import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SmartMaskEditor } from './SmartMaskEditor';
import type { GenerationConfig, UploadedImage } from '../../types';
import type { RefineMaskResult } from '../../lib/api';

vi.mock('../MaskEditor', () => ({
  MaskEditor: (props: {
    onMaskChange: (
      maskDataUrl: string | null,
      useFullImage: boolean,
      feather?: number,
      protectionMaskDataUrl?: string | null,
      expansion?: number,
      hasValidMaskPixels?: boolean,
    ) => void;
    onCancel?: () => void;
    externalCommand?: { type: 'undo' | 'redo' | 'clear' } | null;
  }) => (
    <div data-testid="mask-editor" data-command={props.externalCommand?.type || ''}>
      <button type="button" onClick={() => props.onMaskChange('data:image/png;base64,rough-mask', false, 0, null, 0, true)}>模拟粗略涂抹</button>
      <button type="button" onClick={() => props.onMaskChange(null, false, 0, null, 0, false)}>模拟清空</button>
      <button type="button" onClick={() => props.onCancel?.()}>模拟取消</button>
    </div>
  ),
}));

vi.mock('../../lib/api', () => ({
  refineImageMask: vi.fn(),
}));

vi.mock('../../utils/maskPixels', () => ({
  maskHasVisiblePixels: vi.fn(async () => true),
}));

const { refineImageMask } = await import('../../lib/api');
const mockedRefineImageMask = vi.mocked(refineImageMask);

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const inputImage: UploadedImage = {
  id: 'source',
  name: 'source.png',
  type: 'image/png',
  size: 12,
  dataUrl: '',
  assetId: 'asset-source',
  publicUrl: '/source.png',
  uploadStatus: 'uploaded',
  uploadProgress: 100,
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function clickByText(text: string) {
  const button = Array.from(container?.querySelectorAll('button') || [])
    .find(item => item.textContent?.includes(text));
  expect(button).toBeTruthy();
  act(() => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  return button as HTMLButtonElement;
}

async function renderHarness(onConfirm = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  function Harness() {
    const [mask, setMask] = useState<string | null>(null);
    const [config, setConfig] = useState<GenerationConfig>({
      prompt: '',
      lighting: '匹配原图',
      materialStrength: 0.8,
      editMode: 'mask',
      maskSelectionMode: 'smart',
      maskWorkflowMode: 'smart',
      maskWorkflowActive: true,
      smartMaskStage: 'rough-marking',
      smartMaskConfirmed: false,
      smartMaskIsRefining: false,
      targetObjectType: 'plant',
    });
    return (
      <>
        <SmartMaskEditor
          inputImage={inputImage}
          imageUrl="/source.png"
          maskImageDataUrl={mask}
          protectionMaskDataUrl={null}
          useFullImageMask={false}
          config={config}
          onUpdateMaskImage={(nextMask) => setMask(nextMask)}
          onUpdateConfig={(patch) => setConfig(current => ({ ...current, ...patch }))}
          onConfirmRefinedMask={(result) => {
            setMask(result.refinedMask);
            setConfig(current => ({
              ...current,
              smartMaskStage: 'confirmed',
              smartMaskConfirmed: true,
              smartMaskIsRefining: false,
            }));
            onConfirm(result);
          }}
        />
        <output data-testid="mask-value">{mask || ''}</output>
        <output data-testid="config-value">{JSON.stringify(config)}</output>
      </>
    );
  }

  await act(async () => {
    root?.render(<Harness />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return { onConfirm };
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  vi.clearAllMocks();
});

describe('SmartMaskEditor', () => {
  it('shows a visible workflow toolbar and painting editor after entering smart mask mode', async () => {
    await renderHarness();
    const toolbar = container?.querySelector('[data-testid="smart-mask-workflow-toolbar"]');
    expect(toolbar).toBeTruthy();
    expect(toolbar?.className).toContain('sticky');
    expect(toolbar?.className).toContain('z-20');
    expect(container?.querySelector('[data-testid="mask-editor"]')).toBeTruthy();
    expect(container?.textContent).toContain('步骤1：请先用画笔粗略涂抹目标区域');
  });

  it('keeps start segmentation disabled before rough painting, then enables it after rough painting', async () => {
    await renderHarness();
    const startBefore = Array.from(container?.querySelectorAll('button') || [])
      .find(item => item.textContent?.includes('开始智能识别')) as HTMLButtonElement;
    expect(startBefore).toBeTruthy();
    expect(startBefore.disabled).toBe(true);

    clickByText('模拟粗略涂抹');

    const startAfter = Array.from(container?.querySelectorAll('button') || [])
      .find(item => item.textContent?.includes('开始智能识别')) as HTMLButtonElement;
    expect(startAfter).toBeTruthy();
    expect(startAfter.disabled).toBe(false);
    expect(container?.textContent).toContain('当前状态：可开始识别');
  });

  it('moves through segmenting, reviewing, and confirmed stages while saving the refined mask', async () => {
    const deferred = createDeferred<RefineMaskResult>();
    mockedRefineImageMask.mockReturnValueOnce(deferred.promise);
    const onConfirm = vi.fn();
    await renderHarness(onConfirm);

    clickByText('模拟粗略涂抹');
    clickByText('开始智能识别');
    expect(container?.textContent).toContain('识别中…');

    await act(async () => {
      deferred.resolve({
        refinedMask: 'data:image/png;base64,refined-mask',
        detectedObject: 'plant',
        confidence: 0.91,
        method: 'edge-aware-seeded-region-growing',
      });
      await deferred.promise;
    });

    expect(mockedRefineImageMask).toHaveBeenCalledWith(
      expect.objectContaining({
        imageAssetId: 'asset-source',
        roughMask: 'data:image/png;base64,rough-mask',
        maskMode: 'smart',
        targetObject: 'plant',
      }),
      expect.any(Object),
    );
    expect(container?.textContent).toContain('智能识别已完成，请检查选区后确认。');
    expect(container?.textContent).toContain('AI 优化 Mask');
    expect(container?.textContent).toContain('确认区域');

    clickByText('确认区域');

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      refinedMask: 'data:image/png;base64,refined-mask',
      detectedObject: 'plant',
    }));
    expect(container?.querySelector('[data-testid="mask-value"]')?.textContent).toBe('data:image/png;base64,refined-mask');
    expect(container?.querySelector('[data-testid="config-value"]')?.textContent).toContain('"smartMaskStage":"confirmed"');
    expect(container?.querySelector('[data-testid="config-value"]')?.textContent).toContain('"smartMaskConfirmed":true');
  });

  it('keeps the rough mask and enters error stage when segmentation fails', async () => {
    mockedRefineImageMask.mockRejectedValueOnce(new Error('识别服务暂不可用'));
    await renderHarness();

    clickByText('模拟粗略涂抹');
    clickByText('开始智能识别');
    await act(async () => {
      await Promise.resolve();
    });

    expect(container?.textContent).toContain('识别服务暂不可用');
    expect(container?.textContent).toContain('当前状态：识别失败');
    expect(container?.querySelector('[data-testid="mask-value"]')?.textContent).toBe('data:image/png;base64,rough-mask');
    expect(container?.textContent).toContain('重新识别');
  });

  it('clears smart mask state when the user clears rough painting', async () => {
    await renderHarness();
    clickByText('模拟粗略涂抹');
    clickByText('清空涂抹');
    expect(container?.querySelector('[data-testid="mask-value"]')?.textContent).toBe('');
    expect(container?.querySelector('[data-testid="config-value"]')?.textContent).toContain('"smartMaskStage":"rough-marking"');
    expect(container?.querySelector('[data-testid="config-value"]')?.textContent).toContain('"smartMaskConfirmed":false');
  });
});
