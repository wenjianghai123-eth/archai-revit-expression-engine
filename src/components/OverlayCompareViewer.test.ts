import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { OverlayCompareViewer } from './OverlayCompareViewer';

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

function pointerEvent(type: string, clientX: number, buttons = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    buttons: { value: buttons },
    pointerId: { value: 1 },
  });
  return event;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

describe('OverlayCompareViewer', () => {
  it('renders original and generated images with an accessible slider', () => {
    const view = render(React.createElement(OverlayCompareViewer, { originalImageUrl: '/original.png', generatedImageUrl: '/generated.png' }));
    const slider = view.querySelector('[role="slider"]');

    expect(slider?.getAttribute('aria-label')).toBe('拖动查看原图和结果图叠加对比');
    expect(slider?.getAttribute('aria-valuenow')).toBe('50');
    expect(view.querySelector('img[alt="原图"]')).toBeTruthy();
    expect(view.querySelector('img[alt="结果图"]')).toBeTruthy();
  });

  it('updates slider position after pointer drag', () => {
    const view = render(React.createElement(OverlayCompareViewer, { originalImageUrl: '/original.png', generatedImageUrl: '/generated.png' }));
    const slider = view.querySelector('[role="slider"]') as HTMLDivElement;
    slider.setPointerCapture = () => undefined;
    slider.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 120,
      width: 200,
      height: 120,
      toJSON: () => undefined,
    });

    act(() => {
      slider.dispatchEvent(pointerEvent('pointerdown', 150));
      slider.dispatchEvent(pointerEvent('pointermove', 160, 0));
    });

    expect(slider.getAttribute('aria-valuenow')).toBe('80');
  });

  it('shows an empty state when images are missing', () => {
    const view = render(React.createElement(OverlayCompareViewer, { originalImageUrl: '/original.png', generatedImageUrl: null }));

    expect(view.textContent).toContain('暂无原图，无法对比。');
  });
});
