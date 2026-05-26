import { ModelAssetRecord } from '../lib/api';
import { AssetModel } from '../types';

const PREVIEWABLE_MODEL_TYPES = new Set<AssetModel['fileType']>(['glb', 'gltf', 'obj', 'dae', 'stl']);

export type PreferredModelSourceKind = 'converted' | 'optimized' | 'preview' | 'original';

export interface PreferredModelSource {
  kind: PreferredModelSourceKind;
  url: string;
  fileType: AssetModel['fileType'];
}

export function resolvePreferredModelSource(model: AssetModel): PreferredModelSource {
  const convertedUrl = model.convertedUrl || model.metadata?.convertedUrl;
  if (convertedUrl) {
    return {
      kind: 'converted',
      url: convertedUrl,
      fileType: model.convertedFormat || model.metadata?.convertedFormat || 'glb',
    };
  }

  const optimizedUrl = model.optimizedUrl || model.metadata?.optimizedUrl;
  if (optimizedUrl) {
    return { kind: 'optimized', url: optimizedUrl, fileType: 'glb' };
  }

  const previewUrl = model.previewUrl || model.metadata?.previewUrl;
  if (previewUrl) {
    return { kind: 'preview', url: previewUrl, fileType: 'glb' };
  }

  return {
    kind: 'original',
    url: model.originalUrl || model.modelUrl || '',
    fileType: model.format || model.fileType,
  };
}

export function resolvePreferredModelUrl(model: AssetModel): string {
  return resolvePreferredModelSource(model).url;
}

export function readPreferredModelVersionLabel(model: AssetModel): string {
  const source = resolvePreferredModelSource(model);
  if (source.kind === 'converted') return '使用转换后的 GLB';
  if (source.kind === 'optimized' || source.kind === 'preview') return '使用轻量化模型';
  return '使用原始模型';
}

export function isUsingOriginalModel(model: AssetModel): boolean {
  return resolvePreferredModelSource(model).kind === 'original';
}

export function isLargeOriginalModel(model: AssetModel, thresholdBytes = 30 * 1024 * 1024): boolean {
  return isUsingOriginalModel(model) && (model.originalFileSize || 0) >= thresholdBytes;
}

export function mapModelAssetRecordToAssetModel(
  asset: ModelAssetRecord,
  options: { forceOriginal?: boolean; category?: string } = {},
): AssetModel {
  const forceOriginal = options.forceOriginal ?? false;
  const convertedUrl = asset.convertedUrl || asset.metadata?.convertedUrl;
  const optimizedUrl = asset.optimizedUrl || asset.metadata?.optimizedUrl;
  const previewUrl = asset.previewUrl || asset.metadata?.previewUrl;
  const preferredUrl = convertedUrl || optimizedUrl || previewUrl;
  const modelUrl = forceOriginal ? asset.url : preferredUrl || asset.url;
  const fileType = forceOriginal
    ? asset.fileType
    : convertedUrl
      ? asset.convertedFormat || asset.metadata?.convertedFormat || 'glb'
      : optimizedUrl || previewUrl
        ? 'glb'
        : asset.fileType;
  const optimizationStatus = asset.metadata?.optimizationStatus || 'skipped';

  return {
    id: asset.id,
    name: asset.originalFilename.replace(/\.[^.]+$/u, ''),
    fileName: asset.originalFilename,
    fileType,
    format: asset.format || asset.fileType,
    modelUrl,
    originalUrl: asset.originalUrl || asset.metadata?.originalUrl || asset.url,
    convertedUrl,
    convertedFormat: asset.convertedFormat || asset.metadata?.convertedFormat,
    conversionStatus: asset.conversionStatus || asset.metadata?.conversionStatus || (asset.fileType === 'obj' || asset.fileType === 'dae' ? 'idle' : undefined),
    conversionError: asset.conversionError ?? asset.metadata?.conversionError,
    convertedAt: asset.convertedAt || asset.metadata?.convertedAt,
    previewUrl,
    optimizedUrl,
    thumbnailUrl: asset.thumbnailUrl || asset.metadata?.thumbnailUrl,
    metadata: asset.metadata,
    optimizationStatus,
    optimizationError: asset.metadata?.optimizationError,
    originalFileSize: asset.metadata?.originalFileSize || asset.size,
    optimizedFileSize: asset.metadata?.optimizedFileSize,
    usesOptimizedPreview: Boolean(!forceOriginal && preferredUrl),
    allowOriginalModelLoad: forceOriginal,
    thumbnail: '',
    size: formatModelFileSize(asset.size),
    date: asset.createdAt.slice(0, 10),
    source: 'uploaded',
    provider: '本地后端',
    status: isOptimizationInProgress(optimizationStatus) ? 'optimizing' : 'ready',
    qualityStatus: asset.fileType === 'obj' || asset.fileType === 'stl' ? 'unknown' : 'usable',
    category: options.category || '未分类',
    previewable: PREVIEWABLE_MODEL_TYPES.has(fileType),
  };
}

export function mapModelToOriginalSource(model: AssetModel): AssetModel {
  return {
    ...model,
    fileType: model.format || model.fileType,
    modelUrl: model.originalUrl || model.modelUrl,
    usesOptimizedPreview: false,
    convertedUrl: undefined,
    allowOriginalModelLoad: true,
  };
}

export function isOptimizationInProgress(status: AssetModel['optimizationStatus']): boolean {
  return status === 'pending' || status === 'processing';
}

export function readOptimizationStatusLabel(status: AssetModel['optimizationStatus']): string {
  if (status === 'pending' || status === 'processing') return '正在轻量化';
  if (status === 'succeeded') return '轻量化完成';
  if (status === 'failed') return '轻量化失败';
  if (status === 'skipped') return '未处理';
  return '未处理';
}

export function readConversionStatusLabel(model: AssetModel): string {
  if (model.convertedUrl || model.conversionStatus === 'succeeded') return '已转换为 GLB';
  if (model.conversionStatus === 'converting') return '转换中';
  if (model.conversionStatus === 'failed') return '转换失败';
  if (model.fileType === 'obj' || model.fileType === 'dae') return '未转换';
  return '无需转换';
}

export function formatModelFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return '未知';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}
