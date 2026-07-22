import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scenarioWorkflows } from '../constants/productWorkflows';
import { GenerationStep } from '../types';
import { LandingPage } from './LandingPage';

vi.mock('../components/ui/hero-section-with-smooth-bg-shader', () => ({
  HeroSection: ({ onButtonClick }: { onButtonClick?: () => void }) => (
    <button type="button" data-testid="landing-primary" onClick={onButtonClick}>开始创作</button>
  ),
}));

vi.mock('../components/common/CaseImage', () => ({
  CaseImage: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
}));

vi.mock('../components/showcase/ShowcaseAssets', () => ({
  ShowcaseComparison: () => <div data-testid="showcase-comparison" />,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderLanding() {
  const onEnterHome = vi.fn();
  const onStartCreate = vi.fn();
  const onStartScenario = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <LandingPage
        onEnterHome={onEnterHome}
        onStartCreate={onStartCreate}
        onStartScenario={onStartScenario}
      />,
    );
  });
  return { view: container, onEnterHome, onStartCreate, onStartScenario };
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

describe('LandingPage entry navigation', () => {
  it('sends both generic start buttons to the product home without selecting a generation step', () => {
    const { view, onEnterHome, onStartCreate } = renderLanding();
    const primaryButton = view.querySelector<HTMLButtonElement>('[data-testid="landing-primary"]');
    const footerButton = Array.from(view.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button !== primaryButton && button.textContent?.includes('开始创作'));

    act(() => primaryButton?.click());
    act(() => footerButton?.click());

    expect(onEnterHome).toHaveBeenCalledTimes(2);
    expect(onStartCreate).not.toHaveBeenCalled();
  });

  it('keeps explicit feature cards connected to their existing generation step', () => {
    const { view, onEnterHome, onStartCreate } = renderLanding();
    const floorPlanFeature = Array.from(view.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes('图纸表达中心'));

    act(() => floorPlanFeature?.click());

    expect(onStartCreate).toHaveBeenCalledWith(GenerationStep.FloorplanTo3D);
    expect(onEnterHome).not.toHaveBeenCalled();
  });

  it('preserves the existing scenario entry callback', () => {
    const { view, onStartScenario } = renderLanding();
    const scenario = scenarioWorkflows[0];
    const scenarioButton = Array.from(view.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.includes(scenario.title));

    act(() => scenarioButton?.click());

    expect(onStartScenario).toHaveBeenCalledWith(scenario.id, scenario.entryStep);
  });
});
