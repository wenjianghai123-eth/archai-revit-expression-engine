import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { visibleFeatureIdsStorageKey } from '../featureRegistry';
import { GenerationStep, type GenerationHistoryItem } from '../types';
import { CreativeHome } from './CreativeHome';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const baseProps = {
  templates: [],
  historyItems: [],
  onStartCreate: vi.fn(),
  onStartScenario: vi.fn(),
  onOpenTemplates: vi.fn(),
  onOpenAssets: vi.fn(),
  onOpenHistory: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenProjects: vi.fn(),
};

function renderHome(overrides: Partial<React.ComponentProps<typeof CreativeHome>> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<CreativeHome {...baseProps} {...overrides} />));
  return container;
}

function click(element: Element | null) {
  if (!element) throw new Error('Expected clickable element.');
  act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function findButton(view: HTMLElement, label: string): HTMLButtonElement | null {
  return Array.from(view.querySelectorAll('button')).find(button => button.textContent?.includes(label)) || null;
}

beforeEach(() => {
  window.localStorage.clear();
  Object.values(baseProps).filter(value => typeof value === 'function').forEach(mock => mock.mockClear());
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('CreativeHome', () => {
  it('renders the six default features and routes a feature click to its existing GenerationStep', () => {
    const view = renderHome();
    for (const label of ['图纸表达中心', '自由参考生图', '材质软装替换', '元素植入', '方案变体', '质感提升']) {
      expect(view.textContent).toContain(label);
    }

    click(findButton(view, '自由参考生图'));
    expect(baseProps.onStartCreate).toHaveBeenCalledWith(GenerationStep.FreeReferenceImage);
  });

  it('opens feature management and preserves optional feature add/remove storage', () => {
    const view = renderHome();
    click(findButton(view, '管理首页功能'));
    expect(view.querySelector('[role="dialog"]')).toBeTruthy();

    const addButton = Array.from(view.querySelectorAll('[role="dialog"] button')).find(button => button.textContent?.includes('添加'));
    click(addButton || null);
    expect(JSON.parse(window.localStorage.getItem(visibleFeatureIdsStorageKey) || '[]')).toHaveLength(1);

    const removeButton = Array.from(view.querySelectorAll('[role="dialog"] button')).find(button => button.textContent?.includes('移除'));
    click(removeButton || null);
    expect(JSON.parse(window.localStorage.getItem(visibleFeatureIdsStorageKey) || '[]')).toEqual([]);

    click(view.querySelector('button[aria-label="关闭功能管理"]'));
    expect(view.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows concise empty states for project, history, templates and model assets', () => {
    const view = renderHome();
    expect(view.textContent).toContain('暂无可恢复的最近项目');
    expect(view.textContent).toContain('还没有生成记录');
    expect(view.textContent).toContain('暂无推荐模板');

    click(findButton(view, '模型资产'));
    expect(view.textContent).toContain('暂无模型资产');
  });

  it('summarizes a real project-linked history item and opens existing project/history entries', () => {
    const historyItem: GenerationHistoryItem = {
      id: 'history-1',
      projectId: 'project-1',
      projectName: '滨水展厅',
      step: GenerationStep.MaterialReplace,
      prompt: '替换地面材质',
      style: '材质确认',
      createdAt: '2026-07-17T08:00:00.000Z',
      provider: 'apiyi-nano-banana2-edit',
      outputImage: '/uploads/result.jpg',
    };
    const view = renderHome({ historyItems: [historyItem] });
    expect(view.textContent).toContain('滨水展厅');
    expect(view.textContent).toContain('材质软装替换');

    click(findButton(view, '继续编辑'));
    expect(baseProps.onOpenProject).toHaveBeenCalledWith('project-1');
    const historyButtons = Array.from(view.querySelectorAll('button')).filter(button => button.textContent?.includes('材质软装替换'));
    click(historyButtons.at(-1) || null);
    expect(baseProps.onOpenHistory).toHaveBeenCalled();
  });

  it('keeps mobile-safe layout classes and compact feature cards', () => {
    const view = renderHome();
    const page = view.firstElementChild;
    const grid = view.querySelector('[aria-labelledby="home-core-features"] .grid');
    const featureButton = findButton(view, '自由参考生图');
    expect(page?.className).toContain('overflow-x-hidden');
    expect(grid?.className).toContain('grid-cols-1');
    expect(grid?.className).toContain('lg:grid-cols-3');
    expect(featureButton?.className).toContain('min-h-[124px]');
  });
});
