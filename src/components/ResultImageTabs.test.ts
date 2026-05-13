import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ResultImageTabs } from './ResultImageTabs';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(element: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(element);
  });
  return container;
}

function clickButton(label: string) {
  const button = Array.from(container?.querySelectorAll('button') || []).find(item => item.textContent === label);
  if (!button) throw new Error(`Button not found: ${label}`);
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

describe('ResultImageTabs', () => {
  it('renders result, original, compare and overlay tabs', () => {
    const view = render(React.createElement(ResultImageTabs, { originalImageUrl: '/input.png', resultImageUrl: '/output.png' }));

    expect(view.textContent).toContain('结果图');
    expect(view.textContent).toContain('原图');
    expect(view.textContent).toContain('对比');
    expect(view.textContent).toContain('叠加对比');
    expect(view.querySelector('img[alt="结果图"]')?.getAttribute('src')).toBe('/output.png');

    clickButton('原图');
    expect(view.querySelector('img[alt="原图"]')?.getAttribute('src')).toBe('/input.png');

    clickButton('对比');
    expect(view.querySelectorAll('img[alt="原图"]').length).toBe(1);
    expect(view.querySelectorAll('img[alt="结果图"]').length).toBe(1);

    clickButton('叠加对比');
    expect(view.querySelector('[role="slider"]')).toBeTruthy();
  });

  it('keeps result visible and shows clear empty states when original image is missing', () => {
    const view = render(React.createElement(ResultImageTabs, { resultImageUrl: '/output.png', originalImageUrl: null }));

    expect(view.querySelector('img[alt="结果图"]')?.getAttribute('src')).toBe('/output.png');

    clickButton('原图');
    expect(view.textContent).toContain('该历史记录缺少原图');

    clickButton('对比');
    expect(view.textContent).toContain('需要同时具备原图和结果图才能对比');

    clickButton('叠加对比');
    expect(view.textContent).toContain('需要同时具备原图和结果图才能叠加对比');
  });
});
