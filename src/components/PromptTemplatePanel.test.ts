import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GenerationStep } from '../types';
import { PromptTemplatePanel } from './PromptTemplatePanel';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(element: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(element));
  return container;
}

function clickText(text: string) {
  const node = Array.from(container?.querySelectorAll('button') || []).find(button => button.textContent?.includes(text));
  if (!node) throw new Error(`button not found: ${text}`);
  act(() => node.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('PromptTemplatePanel', () => {
  it('applies a template without auto generating', () => {
    const onApplyPrompt = vi.fn();
    render(React.createElement(PromptTemplatePanel, { isOpen: true, step: GenerationStep.LocalInpainting, editTarget: 'furniture', currentPrompt: '', onApplyPrompt, onClose: () => undefined }));
    clickText('应用模板');
    expect(onApplyPrompt).toHaveBeenCalledWith(expect.stringContaining('mask 白色区域'));
  });

  it('requires explicit append or replace when prompt exists', () => {
    const onApplyPrompt = vi.fn();
    render(React.createElement(PromptTemplatePanel, { isOpen: true, step: GenerationStep.LocalInpainting, editTarget: 'furniture', currentPrompt: '已有提示', onApplyPrompt, onClose: () => undefined }));
    expect(container?.textContent).toContain('替换当前提示词');
    clickText('追加到当前提示词');
    clickText('应用模板');
    expect(onApplyPrompt).toHaveBeenCalledWith(expect.stringContaining('已有提示'));
  });
});
