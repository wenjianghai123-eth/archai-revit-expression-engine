import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SmartMaskEditor } from './SmartMaskEditor';
import type { GenerationConfig, UploadedImage } from '../../types';
import type { RefineMaskResult } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  refineImageMask: vi.fn(),
}));

vi.mock('../../utils/maskPixels', () => ({
  maskHasVisiblePixels: vi.fn(async (mask: string | null) => Boolean(mask)),
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

async function brushOnCanvas(clientX = 20, clientY = 20) {
  const canvas = container?.querySelector('[data-testid="smart-selection-mask-overlay"]') as HTMLCanvasElement | null;
  expect(canvas).toBeTruthy();
  await act(async () => {
    canvas?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX, clientY, pointerId: 1 }));
    canvas?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX, clientY, pointerId: 1 }));
  });
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
      selectionMode: 'smart-select',
      maskSelectionMode: 'smart',
      maskWorkflowMode: 'smart',
      maskWorkflowActive: true,
      smartSelectionStatus: 'idle',
      smartSelectionConfirmed: false,
      smartMaskConfirmed: false,
      smartMaskIsRefining: false,
      targetObjectType: 'plant',
      replacementTarget: 'plant',
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
          onConfirmRefinedMask={onConfirm}
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

beforeAll(() => {
  installCanvasMocks();
  class TestImage {
    naturalWidth = 100;
    naturalHeight = 80;
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;
    crossOrigin = '';
    private _src = '';

    set src(value: string) {
      this._src = value;
      queueMicrotask(() => this.onload?.());
    }

    get src() {
      return this._src;
    }
  }
  vi.stubGlobal('Image', TestImage);
  if (!('PointerEvent' in globalThis)) {
    vi.stubGlobal('PointerEvent', MouseEvent);
  }
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  canvasUrlStore.clear();
  canvasUrlId = 0;
  vi.clearAllMocks();
});

describe('SmartMaskEditor', () => {
  it('renders smart selection tools without the old recognition buttons', async () => {
    await renderHarness();

    expect(container?.textContent).toContain('智能选区');
    expect(container?.textContent).toContain('添加选区');
    expect(container?.textContent).toContain('排除选区');
    expect(container?.textContent).toContain('确认选区');
    expect(container?.textContent).toContain('请在需要替换的对象上点击或轻刷一下');
    expect(container?.textContent).not.toContain('开始智能识别');
    expect(container?.textContent).not.toContain('重新识别');
  });

  it('predicts a selection immediately after one click or light brush', async () => {
    const deferred = createDeferred<RefineMaskResult>();
    mockedRefineImageMask.mockReturnValueOnce(deferred.promise);
    await renderHarness();

    await brushOnCanvas();
    expect(container?.textContent).toContain('推测中');

    await act(async () => {
      deferred.resolve({
        refinedMask: 'data:image/png;base64,refined-mask',
        detectedObject: 'plant',
        confidence: 0.91,
        method: 'edge-aware-seeded-region-growing',
      });
      await deferred.promise;
      await Promise.resolve();
    });

    expect(mockedRefineImageMask).toHaveBeenCalledWith(
      expect.objectContaining({
        imageAssetId: 'asset-source',
        roughMask: expect.stringMatching(/^data:image\/png;base64,canvas-/),
        maskMode: 'smart',
        targetObject: 'plant',
        targetType: 'plant',
      }),
      expect.any(Object),
    );
    expect(container?.textContent).toContain('智能选区已更新，请检查高亮区域。');
    expect(container?.querySelector('[data-testid="mask-value"]')?.textContent).toMatch(/^data:image\/png;base64,canvas-/);
    expect(container?.querySelector('[data-testid="config-value"]')?.textContent).toContain('"smartSelectionStatus":"preview"');
  });

  it('confirms the preview mask as the smart-select generation mask', async () => {
    mockedRefineImageMask.mockResolvedValueOnce({
      refinedMask: 'data:image/png;base64,refined-mask',
      detectedObject: 'plant',
      confidence: 0.91,
      method: 'edge-aware-seeded-region-growing',
    });
    const onConfirm = vi.fn();
    await renderHarness(onConfirm);

    await brushOnCanvas();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    clickByText('确认选区');
    await act(async () => {
      await Promise.resolve();
    });

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      refinedMask: expect.stringMatching(/^data:image\/png;base64,canvas-/),
      detectedObject: 'plant',
    }));
    expect(container?.querySelector('[data-testid="config-value"]')?.textContent).toContain('"smartSelectionStatus":"confirmed"');
    expect(container?.querySelector('[data-testid="config-value"]')?.textContent).toContain('"smartSelectionConfirmed":true');
  });

  it('does not let an outdated prediction overwrite the latest selection', async () => {
    const first = createDeferred<RefineMaskResult>();
    const second = createDeferred<RefineMaskResult>();
    mockedRefineImageMask
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    await renderHarness();

    await brushOnCanvas(20, 20);
    await brushOnCanvas(60, 20);

    await act(async () => {
      second.resolve({
        refinedMask: 'data:image/png;base64,second-refined-mask',
        detectedObject: 'plant',
        confidence: 0.92,
        method: 'edge-aware-seeded-region-growing',
      });
      await second.promise;
      await Promise.resolve();
    });
    const latestMask = container?.querySelector('[data-testid="mask-value"]')?.textContent || '';

    await act(async () => {
      first.resolve({
        refinedMask: 'data:image/png;base64,first-refined-mask',
        detectedObject: 'plant',
        confidence: 0.5,
        method: 'edge-aware-seeded-region-growing',
      });
      await first.promise.catch(() => undefined);
      await Promise.resolve();
    });

    expect(mockedRefineImageMask).toHaveBeenCalledTimes(2);
    expect(container?.querySelector('[data-testid="mask-value"]')?.textContent).toBe(latestMask);
  });

  it('supports subtract mode and clear', async () => {
    mockedRefineImageMask
      .mockResolvedValueOnce({
        refinedMask: 'data:image/png;base64,refined-mask',
        detectedObject: 'plant',
        confidence: 0.91,
        method: 'edge-aware-seeded-region-growing',
      })
      .mockResolvedValueOnce({
        refinedMask: 'data:image/png;base64,subtract-mask',
        detectedObject: 'floor',
        confidence: 0.8,
        method: 'edge-aware-seeded-region-growing',
      });
    await renderHarness();

    await brushOnCanvas(20, 20);
    await act(async () => {
      await Promise.resolve();
    });
    clickByText('排除选区');
    await brushOnCanvas(25, 25);
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedRefineImageMask).toHaveBeenLastCalledWith(
      expect.objectContaining({
        negativeStrokes: expect.any(Array),
        previousMask: expect.stringMatching(/^data:image\/png;base64,canvas-/),
      }),
      expect.any(Object),
    );

    clickByText('清空');
    expect(container?.querySelector('[data-testid="mask-value"]')?.textContent).toBe('');
    expect(container?.querySelector('[data-testid="config-value"]')?.textContent).toContain('"smartSelectionStatus":"idle"');
  });
});

type CanvasState = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

const canvasStates = new WeakMap<HTMLCanvasElement, CanvasState>();
const canvasUrlStore = new Map<string, Uint8ClampedArray>();
let canvasUrlId = 0;

function installCanvasMocks() {
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    top: 0,
    left: 0,
    right: 100,
    bottom: 80,
    toJSON: () => undefined,
  } as DOMRect);
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value(this: HTMLCanvasElement) {
      const state = getCanvasState(this);
      const url = `data:image/png;base64,canvas-${canvasUrlId += 1}`;
      canvasUrlStore.set(url, new Uint8ClampedArray(state.data));
      return url;
    },
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value(this: HTMLCanvasElement) {
      const canvas = this;
      const state = getCanvasState(canvas);
      const context = {
      fillStyle: '#ffffff',
      strokeStyle: '#ffffff',
      lineWidth: 1,
      lineCap: 'round',
      lineJoin: 'round',
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: () => fillMockSelection(state, canvas),
      fill: () => fillMockSelection(state, canvas),
      fillRect: (_x: number, _y: number, width: number, height: number) => {
        if (String(context.fillStyle).includes('000000')) {
          state.data.fill(0);
          for (let index = 3; index < state.data.length; index += 4) state.data[index] = 255;
          return;
        }
        fillMockSelection(state, canvas, Math.max(1, Math.round(width * height)));
      },
      clearRect: () => state.data.fill(0),
      drawImage: (image: { src?: string }) => {
        const stored = image.src ? canvasUrlStore.get(image.src) : null;
        if (stored) {
          state.data.set(stored.slice(0, state.data.length));
          return;
        }
        if (image.src?.includes('subtract-mask')) {
          fillMockSelection(state, canvas, 8, 8);
          return;
        }
        if (image.src?.includes('refined-mask') || image.src?.includes('second-refined-mask') || image.src?.includes('first-refined-mask')) {
          fillMockSelection(state, canvas, 20, 0);
        }
      },
      getImageData: () => ({ data: new Uint8ClampedArray(state.data), width: state.width, height: state.height }),
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
      putImageData: (imageData: ImageData) => {
        state.data = new Uint8ClampedArray(imageData.data);
      },
    };
      return context as unknown as CanvasRenderingContext2D;
    },
  });
}

function getCanvasState(canvas: HTMLCanvasElement): CanvasState {
  const width = canvas.width || 100;
  const height = canvas.height || 80;
  const existing = canvasStates.get(canvas);
  if (existing && existing.width === width && existing.height === height) return existing;
  const next = { data: new Uint8ClampedArray(width * height * 4), width, height };
  canvasStates.set(canvas, next);
  return next;
}

function fillMockSelection(state: CanvasState, canvas: HTMLCanvasElement, count = 12, startPixel = 0) {
  const size = Math.max(1, Math.min(count, state.width * state.height - startPixel));
  for (let pixel = startPixel; pixel < startPixel + size; pixel += 1) {
    const offset = pixel * 4;
    state.data[offset] = 255;
    state.data[offset + 1] = 255;
    state.data[offset + 2] = 255;
    state.data[offset + 3] = 255;
  }
  canvasStates.set(canvas, state);
}
