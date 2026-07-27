import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIGS } from '../constants';
import { GenerationStep, type StepState } from '../types';
import * as api from '../lib/api';
import { PanoramaQuickRenderPanel } from './PanoramaQuickRenderPanel';

vi.mock('../lib/api', () => ({
  listModelAssets: vi.fn().mockResolvedValue([]),
  uploadImageAsset: vi.fn().mockResolvedValue({
    id: 'panorama-asset',
    url: '/uploads/panorama.png',
    publicUrl: '/uploads/panorama.png',
    thumbnailUrl: '/uploads/panorama-thumb.png',
    filename: 'panorama.png',
    mimeType: 'image/png',
    size: 12,
    createdAt: '2026-07-24T00:00:00.000Z',
  }),
  uploadModelAsset: vi.fn(),
}));

vi.mock('../utils/file', () => ({
  validateImageFile: vi.fn(() => null),
  createUploadedImage: vi.fn().mockResolvedValue({
    id: 'local-panorama',
    name: 'panorama.png',
    type: 'image/png',
    size: 12,
    dataUrl: 'data:image/png;base64,cGFub3JhbWE=',
    width: 4096,
    height: 2048,
    uploadStatus: 'local-preview',
  }),
}));

vi.mock('../storage/history', () => ({
  saveGenerationRecord: vi.fn((record) => record),
}));

vi.mock('../storage/panoramas', () => ({
  savePanoramaRecord: vi.fn(),
}));

vi.mock('./LazyModelViewer', () => ({
  LazyModelViewer: () => <div data-testid="lazy-model-viewer" />,
}));

vi.mock('./PanoramaViewer', () => ({
  PanoramaViewer: () => <div data-testid="panorama-viewer" />,
}));

vi.mock('./PromptVoiceAssistant', () => ({
  PromptVoiceAssistant: () => null,
}));

vi.mock('./workspace/SmartPromptAssistant', () => ({
  SmartPromptAssistant: () => null,
}));

vi.mock('./common/GenerationImageViewer', () => ({
  GenerationImageViewer: () => <div data-testid="generation-image-viewer" />,
}));

vi.mock('./common/GenerationResultActions', () => ({
  GenerationResultActions: () => null,
}));

vi.mock('./common/GenerationProgress', () => ({
  GenerationProgress: () => null,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PanoramaQuickRenderPanel', () => {
  it('uploads an existing 2:1 panorama without triggering AI generation', async () => {
    const onGenerate = vi.fn();
    const onUpdateInputImage = vi.fn();
    const onUpdateConfig = vi.fn();

    await act(async () => {
      root.render(
        <PanoramaQuickRenderPanel
          state={createState()}
          config={{ ...DEFAULT_CONFIGS[GenerationStep.PanoramaQuickRender] }}
          projectId="project-1"
          onUpdateConfig={onUpdateConfig}
          onUpdateInputImage={onUpdateInputImage}
          onGenerate={onGenerate}
        />,
      );
    });

    const fileInputs = Array.from(container.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
    const panoramaInput = fileInputs.find(input => input.accept.includes('image/')) || fileInputs[1];
    if (!panoramaInput) throw new Error('Panorama upload input was not rendered.');

    const file = new File(['panorama'], 'panorama.png', { type: 'image/png' });
    Object.defineProperty(panoramaInput, 'files', {
      value: [file],
      configurable: true,
    });

    await act(async () => {
      panoramaInput.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    expect(api.uploadImageAsset).toHaveBeenCalledTimes(1);
    expect(onGenerate).not.toHaveBeenCalled();
    expect(onUpdateInputImage).toHaveBeenCalledWith(expect.objectContaining({
      assetId: 'panorama-asset',
      width: 4096,
      height: 2048,
    }));
    expect(onUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({
      sourceImageAssetId: 'panorama-asset',
      panoramaAssetId: 'panorama-asset',
      inputSource: 'uploaded-panorama',
      taskType: 'panorama-upload',
      panoramaTaskType: 'panorama-upload',
      targetAspectRatio: '2:1',
      apiyiAspectRatio: '2:1',
    }));
  });
});

function createState(): StepState {
  return {
    config: { ...DEFAULT_CONFIGS[GenerationStep.PanoramaQuickRender] },
    inputImage: null,
    materialImage: null,
    materialTextures: [],
    furnitureReferences: [],
    maskImage: null,
    useFullImageMask: false,
    outputImage: null,
    generationResults: [],
    selectedGenerationResultId: null,
    isGenerating: false,
    generationStatus: 'ready',
    generationError: null,
    generationWarnings: [],
    generationProvider: null,
    generationResultId: null,
    generationCreatedAt: null,
    generationJobId: null,
    generationJobStatus: null,
    generationJobDiagnostics: null,
    generationProgress: 0,
    generationLogs: [],
    viewMode: 'after',
  };
}
