import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  assertBlenderAvailable,
  BlenderCliError,
  isBlenderStartupUnavailable,
  normalizeBlenderBin,
  runBlender,
  summarizeOutput,
} from './blenderCli';
import { uploadsDir } from './fileStorage';
import { ModelAsset } from './storage';

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

export class ModelConversionUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'ModelConversionUnavailableError';
    this.cause = options?.cause;
  }
}

export class ModelConversionExecutionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'ModelConversionExecutionError';
    this.cause = options?.cause;
  }
}

export function getModelConversionConfig(): ModelConversionConfig {
  const enabledValue = process.env.MODEL_CONVERSION_ENABLED;
  return {
    enabled: enabledValue?.trim() === 'true',
    blenderBin: normalizeBlenderBin(process.env.BLENDER_BIN),
    timeoutMs: Math.max(1_000, Number(process.env.MODEL_CONVERSION_TIMEOUT_MS || 180_000)),
  };
}

export async function assertModelConversionAvailable(): Promise<void> {
  const config = getModelConversionConfig();
  if (!config.enabled) {
    throw new ModelConversionDisabledError();
  }

  try {
    await assertBlenderAvailable(process.env.BLENDER_BIN, 10_000);
    console.info('Model conversion Blender availability check passed', {
      blenderBin: config.blenderBin,
    });
  } catch (error) {
    throw classifyBlenderError(error, config.blenderBin);
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
  const outputPath = path.resolve(tempDir, 'converted.glb');
  if (path.extname(outputPath).toLowerCase() !== '.glb') {
    throw new ModelConversionExecutionError(`Blender 转换失败：输出路径扩展名不是 .glb：${outputPath}`);
  }

  const pythonScript = buildBlenderPythonScript(input.inputPath, outputPath, input.fileType);
  try {
    console.info('Model conversion Blender execution starting', {
      blenderBin: config.blenderBin,
      inputFileType: input.fileType,
      timeoutMs: config.timeoutMs,
    });
    const { stdout, stderr } = await runBlender(process.env.BLENDER_BIN, [
      '--background',
      '--python-expr',
      pythonScript,
    ], {
      timeoutMs: config.timeoutMs,
      logLabel: 'model-conversion',
    });

    const outputStats = await stat(outputPath).catch(error => {
      logBlenderConversionFailure({
        blenderBin: config.blenderBin,
        inputPath: input.inputPath,
        outputPath,
        fileType: input.fileType,
        exitCode: 0,
        signal: null,
        stdout,
        stderr,
        pythonScript,
      });
      throw new ModelConversionExecutionError(formatOutputValidationError(
        'Blender 已退出但未生成 GLB 输出文件',
        stdout,
        stderr,
        outputPath,
      ), { cause: error });
    });
    if (outputStats.size <= 0) {
      logBlenderConversionFailure({
        blenderBin: config.blenderBin,
        inputPath: input.inputPath,
        outputPath,
        fileType: input.fileType,
        exitCode: 0,
        signal: null,
        stdout,
        stderr,
        pythonScript,
      });
      throw new ModelConversionExecutionError(formatOutputValidationError(
        'Blender 已退出但生成的 GLB 文件为空',
        stdout,
        stderr,
        outputPath,
      ));
    }

    return {
      content: await readFile(outputPath),
      size: outputStats.size,
      stdout,
      stderr,
    };
  } catch (error) {
    if (error instanceof ModelConversionUnavailableError || error instanceof ModelConversionExecutionError) {
      throw error;
    }
    if (error instanceof BlenderCliError && !isBlenderStartupUnavailable(error)) {
      logBlenderConversionFailure({
        blenderBin: config.blenderBin,
        inputPath: input.inputPath,
        outputPath,
        fileType: input.fileType,
        exitCode: error.code,
        signal: error.signal,
        stdout: error.stdout,
        stderr: error.stderr,
        pythonScript,
      });
    }
    throw classifyBlenderError(error, config.blenderBin);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function buildBlenderPythonScript(inputPath: string, outputPath: string, fileType: 'dae' | 'obj'): string {
  const inputLiteral = JSON.stringify(inputPath);
  const outputLiteral = JSON.stringify(outputPath);
  const fileTypeLiteral = JSON.stringify(fileType);

  return `
import os
import bpy

input_path = ${inputLiteral}
output_path = ${outputLiteral}
file_type = ${fileTypeLiteral}

print("INPUT_PATH=", input_path, flush=True)
print("OUTPUT_PATH=", output_path, flush=True)
print("INPUT_EXISTS=", os.path.exists(input_path), flush=True)
os.makedirs(os.path.dirname(output_path), exist_ok=True)
print("OUTPUT_DIR_EXISTS=", os.path.isdir(os.path.dirname(output_path)), flush=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
print("BEFORE_IMPORT_OBJECTS=", len(bpy.data.objects), flush=True)

if file_type == 'dae':
    bpy.ops.wm.collada_import(filepath=input_path)
elif file_type == 'obj':
    if hasattr(bpy.ops.wm, 'obj_import'):
        bpy.ops.wm.obj_import(filepath=input_path)
    else:
        bpy.ops.import_scene.obj(filepath=input_path)
else:
    raise RuntimeError('Unsupported model format for conversion: ' + file_type)

objects = list(bpy.data.objects)
mesh_objects = [obj for obj in objects if obj.type == 'MESH']
print("AFTER_IMPORT_OBJECTS=", len(objects), flush=True)
print("MESH_OBJECTS=", len(mesh_objects), flush=True)

if not objects:
    if file_type == 'dae':
        raise RuntimeError('DAE 导入完成但场景为空')
    raise RuntimeError(file_type.upper() + ' 导入完成但场景为空')

if not mesh_objects:
    if file_type == 'dae':
        raise RuntimeError('DAE 导入成功但没有可导出的 Mesh 对象')
    raise RuntimeError(file_type.upper() + ' 导入成功但没有可导出的 Mesh 对象')

bpy.ops.export_scene.gltf(filepath=output_path, export_format='GLB', check_existing=False)

output_exists = os.path.exists(output_path)
output_size = os.path.getsize(output_path) if output_exists else 0
print("OUTPUT_EXISTS_AFTER_EXPORT=", output_exists, flush=True)
print("OUTPUT_SIZE=", output_size, flush=True)

if (not output_exists) or output_size <= 0:
    scene_objects = [(obj.name, obj.type) for obj in bpy.data.objects]
    print("SCENE_OBJECTS=", scene_objects, flush=True)
    raise RuntimeError('GLB 导出完成但未生成有效输出文件')
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

function logBlenderConversionFailure(input: {
  blenderBin: string;
  inputPath: string;
  outputPath: string;
  fileType: 'dae' | 'obj';
  exitCode: string | number | null | undefined;
  signal: NodeJS.Signals | null | undefined;
  stdout: string;
  stderr: string;
  pythonScript: string;
}): void {
  const diagnostics = getOutputDiagnostics(input.outputPath);
  console.error('Blender conversion process failed', {
    blenderBin: input.blenderBin,
    inputPath: input.inputPath,
    outputPath: input.outputPath,
    fileType: input.fileType,
    exitCode: input.exitCode,
    signal: input.signal,
    stdoutPreview: summarizeOutput(input.stdout, 2000),
    stderrPreview: summarizeOutput(input.stderr, 4000),
    outputExists: diagnostics.outputExists,
    outputDirExists: diagnostics.outputDirExists,
    outputSize: diagnostics.outputSize,
    pythonScriptPreview: input.pythonScript.slice(0, 1000),
  });
}

function formatOutputValidationError(reason: string, stdout: string, stderr: string, outputPath: string): string {
  const diagnostics = getOutputDiagnostics(outputPath);
  const stderrPreview = summarizeOutput(stderr, 4000);
  const stdoutPreview = summarizeOutput(stdout, 2000);
  const preview = stderrPreview
    ? `stderrPreview=${stderrPreview}`
    : `stdoutPreview=${stdoutPreview || 'empty'}`;
  return `Blender 转换失败：${reason}。exitCode=0 outputExists=${diagnostics.outputExists} outputDirExists=${diagnostics.outputDirExists} outputSize=${diagnostics.outputSize ?? 'unknown'} ${preview}`;
}

function getOutputDiagnostics(outputPath: string): {
  outputExists: boolean;
  outputDirExists: boolean;
  outputSize: number | null;
} {
  const outputExists = existsSync(outputPath);
  let outputDirExists = false;
  let outputSize: number | null = null;

  try {
    outputDirExists = statSync(path.dirname(outputPath)).isDirectory();
  } catch {
    outputDirExists = false;
  }

  if (outputExists) {
    try {
      outputSize = statSync(outputPath).size;
    } catch {
      outputSize = null;
    }
  }

  return {
    outputExists,
    outputDirExists,
    outputSize,
  };
}

function classifyBlenderError(error: unknown, blenderBin: string): Error {
  if (error instanceof BlenderCliError) {
    if (isBlenderStartupUnavailable(error)) {
      return new ModelConversionUnavailableError(formatBlenderUnavailableMessage(error, blenderBin), { cause: error });
    }

    if (error.failureKind === 'timeout') {
      return new ModelConversionExecutionError(formatBlenderTimeoutMessage(error), { cause: error });
    }

    if (error.failureKind === 'startup') {
      return new ModelConversionExecutionError(formatBlenderStartupFailureMessage(error), { cause: error });
    }

    return new ModelConversionExecutionError(formatBlenderExecutionMessage(error), { cause: error });
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/timed out|timeout/i.test(message)) {
    return new ModelConversionExecutionError('模型转换超时，请尝试简化模型后重试。', { cause: error });
  }
  return new ModelConversionExecutionError(message || '模型转换失败。', { cause: error });
}

function formatBlenderUnavailableMessage(error: BlenderCliError, fallbackBlenderBin: string): string {
  const stderrSummary = summarizeOutput(error.stderr, 1000);
  const suffix = stderrSummary ? ` stderr: ${stderrSummary}` : '';
  return `Blender 可执行文件不可用，请检查 BLENDER_BIN 配置：${error.diagnostics.normalizedBlenderBin || fallbackBlenderBin}.${suffix}`;
}

function formatBlenderExecutionMessage(error: BlenderCliError): string {
  const stderrPreview = summarizeOutput(error.stderr, 4000);
  const stdoutPreview = summarizeOutput(error.stdout, 2000);
  const preview = stderrPreview
    ? `stderrPreview=${stderrPreview}`
    : `stdoutPreview=${stdoutPreview || error.message}`;
  return `Blender 转换失败：exitCode=${error.code ?? 'unknown'}${error.signal ? ` signal=${error.signal}` : ''} ${preview}`;
}

function formatBlenderStartupFailureMessage(error: BlenderCliError): string {
  const stderrPreview = summarizeOutput(error.stderr, 4000);
  const stdoutPreview = summarizeOutput(error.stdout, 2000);
  const outputPreview = stderrPreview || stdoutPreview || error.message;
  return `Blender 启动失败：code=${error.code ?? 'unknown'} ${outputPreview}`;
}

function formatBlenderTimeoutMessage(error: BlenderCliError): string {
  const stderrPreview = summarizeOutput(error.stderr, 1000);
  const stdoutPreview = summarizeOutput(error.stdout, 1000);
  const outputPreview = stderrPreview || stdoutPreview;
  return `Blender 执行超时：exitCode=${error.code ?? 'TIMEOUT'}${outputPreview ? ` ${outputPreview}` : ''}`;
}
