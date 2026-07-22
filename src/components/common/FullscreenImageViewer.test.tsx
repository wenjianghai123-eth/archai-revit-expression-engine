import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FullscreenImageViewer } from './FullscreenImageViewer';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderViewer(onClose = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(
    <FullscreenImageViewer
      open
      request={{ imageUrl: '/result.png', title: '生成结果', imageType: 'result' }}
      onClose={onClose}
    />,
  ));
  return { view: container, onClose };
}

function clickButton(view: HTMLElement, label: string) {
  const button = Array.from(view.querySelectorAll('button')).find(item => item.textContent?.includes(label) || item.getAttribute('aria-label') === label);
  if (!button) throw new Error(`Button not found: ${label}`);
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  document.body.style.overflow = '';
});

describe('FullscreenImageViewer', () => {
  it('uses contain rendering, locks background scrolling and closes with Escape', () => {
    const { view, onClose } = renderViewer();

    expect(view.querySelector('[role="dialog"]')).toBeTruthy();
    expect(view.querySelector('img')?.className).toContain('object-contain');
    expect(document.body.style.overflow).toBe('hidden');
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('supports zoom and fit-to-window reset', () => {
    const { view } = renderViewer();

    clickButton(view, '放大图片');
    expect(view.textContent).toContain('125%');
    clickButton(view, '适应窗口');
    expect(view.textContent).toContain('100%');
  });
});
