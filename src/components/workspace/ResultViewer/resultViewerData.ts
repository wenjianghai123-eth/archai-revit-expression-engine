import type { GenerationResultOption, UploadedImage } from '../../../types';
import { readAssetImageUrl } from '../../../utils/assetUrl';
import { getOriginalResultAssetId, getOriginalResultImageUrl } from '../../../utils/resultImage';

export interface ResultViewerData {
  originalImage?: string;
  originalAssetId?: string;
  resultImage?: string;
  resultAssetId?: string;
}

interface CreateResultViewerDataInput {
  inputImage: UploadedImage | null;
  selectedResult: GenerationResultOption | null;
  outputImage: string | null;
}

export function createResultViewerData({
  inputImage,
  selectedResult,
  outputImage,
}: CreateResultViewerDataInput): ResultViewerData {
  const originalImage = readAssetImageUrl(inputImage);
  const resultImage = getOriginalResultImageUrl(selectedResult, outputImage);
  const resultAssetId = getOriginalResultAssetId(selectedResult);

  return {
    originalImage: originalImage || undefined,
    originalAssetId: inputImage?.assetId || undefined,
    resultImage: resultImage || undefined,
    resultAssetId: resultAssetId || undefined,
  };
}
