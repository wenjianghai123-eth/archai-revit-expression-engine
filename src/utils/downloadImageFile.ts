import { downloadAsset, buildResultImageFilename, type DownloadAssetSource } from './downloadAsset';

export interface DownloadImageFileInput extends DownloadAssetSource {
  imageUrl?: string | null;
  filename?: string;
  featureName?: string;
  projectName?: string | null;
}

export async function downloadImageFile(input: DownloadImageFileInput): Promise<void> {
  const url = input.imageUrl || input.url || null;
  if (!url && !input.assetId && !input.outputAssetId) throw new Error('暂无可保存的结果图片。');
  const filename = input.filename || buildResultImageFilename({
    projectName: `烛照AI_${input.projectName || '项目'}`,
    featureLabel: input.featureName || '生成结果',
  });
  await downloadAsset({ url, assetId: input.assetId, outputAssetId: input.outputAssetId }, filename);
}
