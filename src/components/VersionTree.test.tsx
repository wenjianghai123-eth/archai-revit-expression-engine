import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { AssetVersion } from '../types';
import { VersionTree } from './VersionTree';

describe('VersionTree', () => {
  it('renders the main chain and a branch under their actual parent', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(
      <VersionTree
        versions={[
          version('v0', null, 0),
          version('v1', 'v0', 1),
          version('v2', 'v1', 2),
          version('v3', 'v1', 3),
        ]}
        selectedVersionId="v2"
        currentVersionId="v2"
        primaryVersionId="v2"
        finalVersionId="v3"
        onSelect={() => undefined}
      />,
    ));

    expect(container.querySelector('[data-version-id="v1"]')?.getAttribute('data-parent-version-id')).toBe('v0');
    expect(container.querySelector('[data-version-id="v2"]')?.getAttribute('data-parent-version-id')).toBe('v1');
    expect(container.querySelector('[data-version-id="v3"]')?.getAttribute('data-parent-version-id')).toBe('v1');
    expect(container.textContent).toContain('父版本 V1');
    expect(container.textContent).toContain('2 个分支');
    expect(container.textContent).toContain('主方案');
    expect(container.textContent).toContain('最终');
    act(() => root.unmount());
  });

  it('selects a version without changing the tree', () => {
    const onSelect = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(
      <VersionTree
        versions={[version('v0', null, 0), version('v1', 'v0', 1)]}
        onSelect={onSelect}
      />,
    ));
    const v1 = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('V1'));
    act(() => v1?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onSelect).toHaveBeenCalledWith('v1');
    act(() => root.unmount());
  });

  it('supports zooming and collapsing a branch without changing selection', () => {
    const onSelect = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(
      <VersionTree
        versions={[
          version('v0', null, 0),
          version('v1', 'v0', 1),
          version('v2', 'v1', 2),
        ]}
        onSelect={onSelect}
      />,
    ));

    const zoomIn = container.querySelector('button[aria-label="放大版本树"]');
    act(() => zoomIn?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).toContain('110%');

    const collapse = container.querySelector('button[aria-label="折叠 V1 分支"]');
    act(() => collapse?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.querySelector('[data-version-id="v2"]')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});

function version(
  id: string,
  parentVersionId: string | null,
  versionNumber: number,
): AssetVersion {
  return {
    id,
    assetId: `asset-${id}`,
    sessionId: 'session-1',
    parentVersionId,
    versionNumber,
    storagePath: `${id}.png`,
    publicUrl: `/${id}.png`,
    userInstruction: versionNumber === 0 ? '' : `instruction-${id}`,
    compiledPrompt: '',
    provider: null,
    model: null,
    generationJobId: null,
    createdBy: 'user-1',
    createdAt: `2026-07-14T00:0${versionNumber}:00Z`,
  };
}
