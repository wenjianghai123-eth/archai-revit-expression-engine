import { describe, expect, it } from 'vitest';
import { createResultViewerData } from './resultViewerData';

describe('createResultViewerData', () => {
  it('maps the real selected generation result fields for the viewer', () => {
    expect(createResultViewerData({
      inputImage: {
        id: 'input-1',
        assetId: 'source-asset',
        name: 'plan.png',
        type: 'image/png',
        size: 10,
        dataUrl: '/source.png',
      },
      selectedResult: {
        id: 'result-1',
        imageUrl: '/generated.png',
        assetId: 'result-asset',
        isSelected: true,
        isFavorite: false,
      },
      outputImage: '/legacy-output.png',
    })).toEqual({
      originalImage: '/source.png',
      originalAssetId: 'source-asset',
      resultImage: '/generated.png',
      resultAssetId: 'result-asset',
    });
  });

  it('keeps the legacy output image as a compatibility fallback', () => {
    expect(createResultViewerData({
      inputImage: null,
      selectedResult: null,
      outputImage: '/legacy-output.png',
    })).toEqual({
      originalImage: undefined,
      originalAssetId: undefined,
      resultImage: '/legacy-output.png',
      resultAssetId: undefined,
    });
  });

  it('uses the stored original output metadata when present', () => {
    const data = createResultViewerData({
      inputImage: null,
      selectedResult: {
        id: 'result-1',
        imageUrl: '/optimized-preview.webp',
        assetId: 'preview-asset',
        isSelected: true,
        isFavorite: false,
        metadata: {
          originalUrl: '/full-result.png',
          originalAssetId: 'full-result-asset',
        },
      },
      outputImage: null,
    });

    expect(data.resultImage).toContain('/full-result.png');
    expect(data.resultAssetId).toBe('full-result-asset');
  });
});
