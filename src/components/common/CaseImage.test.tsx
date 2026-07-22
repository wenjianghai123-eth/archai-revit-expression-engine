import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { CaseImage } from './CaseImage';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderCaseImage(props: React.ComponentProps<typeof CaseImage>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<CaseImage {...props} />));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('CaseImage', () => {
  it('loads each configured fallback in order and labels demo assets', () => {
    const view = renderCaseImage({
      src: '/cases/missing.jpg',
      previousUiSrc: 'https://images.example.com/previous.jpg',
      fallbackSrc: 'https://images.example.com/demo.jpg',
      finalFallbackSrc: '/cases/final.jpg',
      alt: '功能示例图',
      isDemoAsset: true,
    });

    expect(view.querySelector('img')?.getAttribute('src')).toBe('/cases/missing.jpg');
    act(() => view.querySelector('img')?.dispatchEvent(new Event('error')));
    expect(view.querySelector('img')?.getAttribute('src')).toBe('https://images.example.com/previous.jpg');
    act(() => view.querySelector('img')?.dispatchEvent(new Event('error')));
    expect(view.querySelector('img')?.getAttribute('src')).toBe('https://images.example.com/demo.jpg');
    act(() => view.querySelector('img')?.dispatchEvent(new Event('error')));
    expect(view.querySelector('img')?.getAttribute('src')).toBe('/cases/final.jpg');
    act(() => view.querySelector('img')?.dispatchEvent(new Event('load')));
    expect(view.textContent).toContain('功能示例');
  });

  it('uses an embedded visual if every configured image fails without showing a text placeholder', () => {
    const view = renderCaseImage({
      src: '/cases/missing.jpg',
      finalFallbackSrc: '/cases/missing-final.jpg',
      alt: '案例图片',
    });

    act(() => view.querySelector('img')?.dispatchEvent(new Event('error')));
    act(() => view.querySelector('img')?.dispatchEvent(new Event('error')));
    expect(view.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(view.textContent).not.toContain('案例素材待补充');
    expect(view.querySelector('img')?.getAttribute('alt')).toBe('案例图片');
  });

  it('keeps a successfully loaded local case unlabelled and supports eager loading', () => {
    const view = renderCaseImage({
      src: '/cases/real.jpg',
      previousUiSrc: 'https://images.example.com/previous.jpg',
      fallbackSrc: 'https://images.example.com/fallback.jpg',
      finalFallbackSrc: '/cases/final.jpg',
      alt: '真实案例图',
      isDemoAsset: true,
      loading: 'eager',
    });

    act(() => view.querySelector('img')?.dispatchEvent(new Event('load')));
    expect(view.querySelector('img')?.getAttribute('loading')).toBe('eager');
    expect(view.textContent).not.toContain('功能示例');
  });

  it('deduplicates identical sources and stops advancing at the emergency image', () => {
    const view = renderCaseImage({
      src: '/cases/missing.jpg',
      previousUiSrc: '/cases/missing.jpg',
      fallbackSrc: '/cases/missing.jpg',
      finalFallbackSrc: '/cases/missing.jpg',
      alt: '去重回退图',
    });

    act(() => view.querySelector('img')?.dispatchEvent(new Event('error')));
    const emergencyImage = view.querySelector('img');
    expect(emergencyImage?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(emergencyImage?.getAttribute('onerror')).toBeNull();
  });
});
