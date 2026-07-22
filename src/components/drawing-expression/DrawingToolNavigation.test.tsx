import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrawingToolNavigation } from './DrawingToolNavigation';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('DrawingToolNavigation', () => {
  it('renders all drawing tools with explicit stable keys and selects 3D color plan', () => {
    const onSelectTool = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(
      <DrawingToolNavigation activeTool="region-recognition" workflowStage="uploaded" onSelectTool={onSelectTool} />,
    ));

    expect(container.querySelectorAll('[data-tool]')).toHaveLength(6);
    expect(Array.from(container.querySelectorAll('[data-tool]')).map(element => element.getAttribute('data-tool'))).toEqual([
      'color-plan-2d',
      'color-plan-3d',
      'region-recognition',
      'material-mapping',
      'functional-zoning',
      'circulation-analysis',
    ]);

    const button = container.querySelector('[data-tool="color-plan-3d"]');
    act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onSelectTool).toHaveBeenCalledWith('color-plan-3d');
    expect(container.querySelector('.drawing-tool-navigation-scroll')).toBeTruthy();
  });
});
