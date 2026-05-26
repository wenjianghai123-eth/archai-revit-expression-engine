import { execFile } from 'node:child_process';
import { cp, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileStorageProvider, uploadsDir } from './fileStorage';
import { getModelAsset, updateModelAsset, ModelAsset, ModelOptimizationMetadata } from './storage';

const execFileAsync = promisify(execFile);

export interface ModelOptimizationConfig {
  enabled: boolean;
  thresholdBytes: number;
  targetFaces: number;
  blenderBin: string;
  timeoutMs: number;
}

export function getModelOptimizationConfig(): ModelOptimizationConfig {
  const enabledValue = process.env.MODEL_OPTIMIZATION_ENABLED ?? process.env.ENABLE_MODEL_OPTIMIZATION;
  return {
    enabled: enabledValue === undefined ? true : enabledValue.trim() === 'true',
    thresholdBytes: Math.max(0, Number(process.env.MODEL_OPTIMIZATION_THRESHOLD_MB || 30)) * 1024 * 1024,
    targetFaces: Math.max(1_000, Number(process.env.MODEL_PREVIEW_TARGET_FACES || 200_000)),
    blenderBin: process.env.BLENDER_BIN || 'blender',
    timeoutMs: Math.max(1_000, Number(process.env.MODEL_OPTIMIZATION_TIMEOUT_MS || 15 * 60 * 1000)),
  };
}

export function buildInitialModelOptimizationMetadata(input: {
  url: string;
  fileType: ModelAsset['fileType'];
  size: number;
}): ModelOptimizationMetadata {
  const config = getModelOptimizationConfig();
  const shouldOptimize = config.enabled && input.size >= config.thresholdBytes;
  const now = new Date().toISOString();

  return {
    originalUrl: input.url,
    format: input.fileType,
    originalFileSize: input.size,
    optimizationStatus: shouldOptimize ? 'pending' : 'skipped',
    createdAt: now,
    completedAt: shouldOptimize ? undefined : now,
  };
}

export function shouldOptimizeModelAsset(asset: ModelAsset): boolean {
  const config = getModelOptimizationConfig();
  if (!config.enabled) return false;
  return asset.size >= config.thresholdBytes;
}

export function startModelOptimization(assetId: string, options: { force?: boolean } = {}): void {
  if (!options.force && process.env.ARCHAI_DISABLE_MODEL_OPTIMIZATION_WORKER === 'true') return;
  try {
    setTimeout(() => {
      void optimizeModelAsset(assetId).catch(error => {
        console.error('Model optimization failed unexpectedly', { assetId, error });
      });
    }, 0);
  } catch (error) {
    console.error('Model optimization worker failed to start', { assetId, error });
  }
}

export async function optimizeModelAsset(assetId: string): Promise<ModelAsset | null> {
  const asset = await getModelAsset(assetId);
  if (!asset) return null;

  const baseMetadata = asset.metadata || buildInitialModelOptimizationMetadata({
    url: asset.url,
    fileType: asset.fileType,
    size: asset.size,
  });

  await updateModelAsset(asset.id, {
    metadata: {
      ...baseMetadata,
      optimizationStatus: 'processing',
      optimizationError: undefined,
    },
  });

  try {
    const previewFilename = `models/preview/${asset.id}.glb`;
    const outputPath = path.resolve(uploadsDir, previewFilename);
    await mkdir(path.dirname(outputPath), { recursive: true });

    if (asset.fileType === 'glb') {
      const originalPath = resolveLocalUploadPath(asset.filename);
      await cp(originalPath, outputPath);
    } else {
      await runBlenderConversion(asset, outputPath);
    }

    const optimizedStats = await stat(outputPath);
    const optimizedUrl = fileStorageProvider.getPublicUrl(previewFilename);
    const completedAt = new Date().toISOString();
    return updateModelAsset(asset.id, {
      previewUrl: optimizedUrl,
      optimizedUrl,
      metadata: {
        ...baseMetadata,
        previewUrl: optimizedUrl,
        optimizedUrl,
        optimizedFileSize: optimizedStats.size,
        optimizationStatus: 'succeeded',
        optimizationError: undefined,
        completedAt,
      },
    });
  } catch (error) {
    const message = normalizeOptimizationError(error);
    return updateModelAsset(asset.id, {
      metadata: {
        ...baseMetadata,
        optimizationStatus: 'failed',
        optimizationError: message,
        completedAt: new Date().toISOString(),
      },
    });
  }
}

async function runBlenderConversion(asset: ModelAsset, outputPath: string): Promise<void> {
  const config = getModelOptimizationConfig();
  const scriptPath = path.resolve(process.cwd(), 'scripts', 'convert_model_to_glb.py');
  const inputPath = resolveLocalUploadPath(asset.filename);

  await execFileAsync(config.blenderBin, [
    '-b',
    '--python',
    scriptPath,
    '--',
    '--input',
    inputPath,
    '--output',
    outputPath,
    '--target-faces',
    String(config.targetFaces),
  ], {
    timeout: config.timeoutMs,
    windowsHide: true,
  });
}

function resolveLocalUploadPath(filename: string): string {
  const resolved = path.resolve(uploadsDir, filename);
  if (!resolved.startsWith(uploadsDir)) {
    throw new Error('Invalid model upload path.');
  }
  return resolved;
}

function normalizeOptimizationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOENT|not found|spawn/i.test(message)) {
    return `Blender 可执行文件不可用，请检查 BLENDER_BIN 配置：${getModelOptimizationConfig().blenderBin}`;
  }
  return message || 'Model optimization failed.';
}
