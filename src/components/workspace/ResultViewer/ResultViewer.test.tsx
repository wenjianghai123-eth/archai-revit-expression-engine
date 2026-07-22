import React, { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { StepState } from '../../../types';
import { ResultViewer } from './ResultViewer';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function Harness() {
  const [viewMode, setViewMode] = useState<StepState['viewMode']>('after');
  return <ResultViewer data={{ originalImage: '/input.png', resultImage: '/output.png' }} viewMode={viewMode} onViewModeChange={setViewMode} />;
}

function renderViewer() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
  return container;
}

function clickButton(label: string) {
  const button = Array.from(container?.querySelectorAll('button') || []).find(candidate => candidate.textContent?.trim() === label || candidate.getAttribute('aria-label') === label);
  if (!button) throw new Error(`Button not found: ${label}`);
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('ResultViewer', () => {
  it('renders exactly one functional result tab list', () => {
    const view = renderViewer();

    expect(view.querySelectorAll('[role="tablist"]')).toHaveLength(1);
    expect(view.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(view.querySelector('img[alt="结果图"]')?.getAttribute('src')).toBe('/output.png');

    clickButton('原图');
    expect(view.querySelector('img[alt="原图"]')?.getAttribute('src')).toBe('/input.png');

    clickButton('对比');
    expect(view.querySelector('[role="slider"]')?.getAttribute('aria-label')).toBe('拖动查看图纸表达前后对比');

    clickButton('叠加对比');
    expect(view.querySelector('input[aria-label="结果透明度"]')).toBeTruthy();
  });

  it('supports zoom controls and double-click fit-to-window', () => {
    const view = renderViewer();
    const canvas = view.querySelector('[data-testid="result-image-canvas"]') as HTMLDivElement;

    clickButton('放大');
    expect(view.textContent).toContain('120%');

    act(() => canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(view.textContent).toContain('100%');
  });

  it('uses contain rendering and exposes an adjustable overlay opacity', () => {
    const view = renderViewer();
    expect(view.querySelector('img[alt="结果图"]')?.className).toContain('object-contain');
    expect(view.innerHTML).not.toContain('object-cover');

    clickButton('叠加对比');
    const opacity = view.querySelector('input[aria-label="结果透明度"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(opacity, '0.8');
      opacity.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(view.textContent).toContain('80%');
  });
});
