import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { uploadsDir } from './fileStorage';
import { ModelAsset } from './storage';

const execFileAsync = promisify(execFile);

export interface ModelConversionConfig {
  enabled: boolean;
  blenderBin: string;
  timeoutMs: number;
}

export interface MaterializedModelInput {
  inputPath: string;
  cleanup: () => Promise<void>;
}

export interface ModelConversionResult {
  content: Buffer;
  size: number;
  stdout: string;
  stderr: string;
}

export class ModelConversionDisabledError extends Error {
  constructor() {
    super('当前服务器未启用模型转换服务');
    this.name = 'ModelConversionDisabledError';
  }
}

export function getModelConversionConfig(): ModelConversionConfig {
  const enabledValue = process.env.MODEL_CONVERSION_ENABLED;
  return {
    enabled: enabledValue?.trim() === 'true',
    blenderBin: process.env.BLENDER_BIN || 'blender',
    timeoutMs: Math.max(1_000, Number(process.env.MODEL_CONVERSION_TIMEOUT_MS || 180_000)),
  };
}

export async function assertModelConversionAvailable(): Promise<void> {
  const config = getModelConversionConfig();
  if (!config.enabled) {
    throw new ModelConversionDisabledError();
  }

  try {
    await execFileAsync(config.blenderBin, ['--version'], {
      timeout: 10_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    throw new Error(normalizeBlenderError(error));
  }
}

export async function materializeModelInput(asset: ModelAsset): Promise<MaterializedModelInput> {
  const localPath = await resolveLocalUploadPath(asset.filename);
  if (localPath) {
    return {
      inputPath: localPath,
      cleanup: async () => undefined,
    };
  }

  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`模型源文件下载失败：${response.status} ${response.statusText}`);
  }

  const content = Buffer.from(await response.arrayBuffer());
  const tempDir = await createTempDir();
  const inputPath = path.join(tempDir, `input.${asset.fileType}`);
  await writeFile(inputPath, content);

  return {
    inputPath,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

export async function convertModelToGlb(input: { inputPath: string; fileType: 'dae' | 'obj' }): Promise<ModelConversionResult> {
  const config = getModelConversionConfig();
  if (!config.enabled) {
    throw new ModelConversionDisabledError();
  }

  const tempDir = await createTempDir();
  const outputPath = path.join(tempDir, 'converted.glb');

  try {
    const pythonScript = buildBlenderPythonScript(input.inputPath, outputPath, input.fileType);
    const { stdout, stderr } = await execFileAsync(config.blenderBin, [
      '--background',
      '--python-expr',
      pythonScript,
    ], {
      timeout: config.timeoutMs,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });

    const outputStats = await stat(outputPath);
    if (outputStats.size <= 0) {
      throw new Error('Blender 未生成有效的 GLB 文件。');
    }

    return {
      content: await readFile(outputPath),
      size: outputStats.size,
      stdout,
      stderr,
    };
  } catch (error) {
    throw new Error(normalizeBlenderError(error));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function buildBlenderPythonScript(inputPath: string, outputPath: string, fileType: 'dae' | 'obj'): string {
  const inputLiteral = JSON.stringify(inputPath);
  const outputLiteral = JSON.stringify(outputPath);
  const fileTypeLiteral = JSON.stringify(fileType);

  return `
import bpy

input_path = ${inputLiteral}
output_path = ${outputLiteral}
file_type = ${fileTypeLiteral}

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

if file_type == 'dae':
    bpy.ops.wm.collada_import(filepath=input_path)
elif file_type == 'obj':
    if hasattr(bpy.ops.wm, 'obj_import'):
        bpy.ops.wm.obj_import(filepath=input_path)
    else:
        bpy.ops.import_scene.obj(filepath=input_path)
else:
    raise RuntimeError('Unsupported model format for conversion: ' + file_type)

bpy.ops.export_scene.gltf(filepath=output_path, export_format='GLB')
`;
}

async function createTempDir(): Promise<string> {
  const tempRoot = path.join(os.tmpdir(), 'archai-model-conversion');
  await mkdir(tempRoot, { recursive: true });
  const tempDir = path.join(tempRoot, randomUUID());
  await mkdir(tempDir, { recursive: true });
  return tempDir;
}

async function resolveLocalUploadPath(filename: string): Promise<string | null> {
  const resolved = path.resolve(uploadsDir, filename);
  if (!resolved.startsWith(uploadsDir)) {
    return null;
  }

  return access(resolved)
    .then(() => resolved)
    .catch(() => null);
}

function normalizeBlenderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOENT|not found|spawn/i.test(message)) {
    return `Blender 可执行文件不可用，请检查 BLENDER_BIN 配置：${getModelConversionConfig().blenderBin}`;
  }
  if (/timed out|timeout/i.test(message)) {
    return '模型转换超时，请尝试简化模型后重试。';
  }
  return message || '模型转换失败。';
}
