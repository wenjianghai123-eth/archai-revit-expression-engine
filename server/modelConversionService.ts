import { randomUUID } from 'node:crypto';
import { createWriteStream, existsSync, statSync } from 'node:fs';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import * as yauzl from 'yauzl';
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

type ConvertibleInputFileType = 'glb' | 'gltf' | 'dae' | 'obj';

export interface ModelConversionConfig {
  enabled: boolean;
  blenderBin: string;
  timeoutMs: number;
}

export interface MaterializedModelInput {
  inputPath: string;
  fileType: ConvertibleInputFileType;
  workingDirectory: string;
  archive?: ModelArchiveInspection;
  cleanup: () => Promise<void>;
}

export interface ModelConversionResult {
  content: Buffer;
  size: number;
  stdout: string;
  stderr: string;
  conversionWarning?: string;
  missingImageCount: number;
}

export interface ModelArchiveInspection {
  mainModelPath: string;
  mainModelRelativePath: string;
  mainModelFileType: ConvertibleInputFileType;
  modelFileCount: number;
  selectionWarning?: string;
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

export class ModelArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelArchiveError';
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
    throw classifyBlenderError(error, { blenderBin: config.blenderBin });
  }
}

export async function materializeModelInput(asset: ModelAsset): Promise<MaterializedModelInput> {
  const localPath = await resolveLocalUploadPath(asset.filename);
  if (localPath) {
    if (asset.fileType === 'zip') {
      return materializeModelArchive(await readFile(localPath));
    }

    const fileType = getConvertibleFileType(asset.fileType);
    if (!fileType) {
      throw new ModelConversionExecutionError(`不支持转换的模型格式：${asset.fileType}`);
    }

    return {
      inputPath: localPath,
      fileType,
      workingDirectory: path.dirname(localPath),
      cleanup: async () => undefined,
    };
  }

  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`模型源文件下载失败：${response.status} ${response.statusText}`);
  }

  const content = Buffer.from(await response.arrayBuffer());
  if (asset.fileType === 'zip') {
    return materializeModelArchive(content);
  }

  const fileType = getConvertibleFileType(asset.fileType);
  if (!fileType) {
    throw new ModelConversionExecutionError(`不支持转换的模型格式：${asset.fileType}`);
  }

  const tempDir = await createTempDir();
  const inputPath = path.join(tempDir, `input.${fileType}`);
  await writeFile(inputPath, content);

  return {
    inputPath,
    fileType,
    workingDirectory: tempDir,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

export async function inspectModelArchive(content: Buffer): Promise<ModelArchiveInspection> {
  const materialized = await materializeModelArchive(content);
  try {
    if (!materialized.archive) {
      throw new ModelArchiveError('ZIP 资源包解析失败。');
    }
    return materialized.archive;
  } finally {
    await materialized.cleanup();
  }
}

async function materializeModelArchive(content: Buffer): Promise<MaterializedModelInput> {
  const tempDir = await createTempDir();
  try {
    const extractedFiles = await extractZipBuffer(content, tempDir);
    const archive = selectPrimaryModelFile(tempDir, extractedFiles);
    return {
      inputPath: archive.mainModelPath,
      fileType: archive.mainModelFileType,
      workingDirectory: path.dirname(archive.mainModelPath),
      archive,
      cleanup: async () => {
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export async function convertModelToGlb(input: { inputPath: string; fileType: ConvertibleInputFileType; workingDirectory?: string }): Promise<ModelConversionResult> {
  const config = getModelConversionConfig();
  if (!config.enabled) {
    throw new ModelConversionDisabledError();
  }

  if (input.fileType === 'glb') {
    const content = await readFile(input.inputPath);
    return {
      content,
      size: content.length,
      stdout: '',
      stderr: '',
      missingImageCount: 0,
    };
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
      workingDirectory: input.workingDirectory || path.dirname(input.inputPath),
      timeoutMs: config.timeoutMs,
    });
    const { stdout, stderr } = await runBlender(process.env.BLENDER_BIN, [
      '--background',
      '--python-expr',
      pythonScript,
    ], {
      timeoutMs: config.timeoutMs,
      logLabel: 'model-conversion',
      cwd: input.workingDirectory || path.dirname(input.inputPath),
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
      throw new ModelConversionExecutionError(formatOutputValidationErrorV2(
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
      throw new ModelConversionExecutionError(formatOutputValidationErrorV2(
        'Blender 已退出但生成的 GLB 文件为空',
        stdout,
        stderr,
        outputPath,
      ));
    }

    const outputDiagnostics = analyzeBlenderOutput(stdout, stderr);
    return {
      content: await readFile(outputPath),
      size: outputStats.size,
      stdout,
      stderr,
      conversionWarning: outputDiagnostics.conversionWarning,
      missingImageCount: outputDiagnostics.missingImageCount,
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
    throw classifyBlenderError(error, {
      blenderBin: config.blenderBin,
      inputFileType: input.fileType,
      timeoutMs: config.timeoutMs,
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function buildBlenderPythonScript(inputPath: string, outputPath: string, fileType: ConvertibleInputFileType): string {
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
print("WORKING_DIRECTORY=", os.path.dirname(input_path), flush=True)
os.chdir(os.path.dirname(input_path))
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
elif file_type == 'gltf':
    bpy.ops.import_scene.gltf(filepath=input_path)
elif file_type == 'glb':
    bpy.ops.import_scene.gltf(filepath=input_path)
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

function getConvertibleFileType(fileType: ModelAsset['fileType']): ConvertibleInputFileType | null {
  if (fileType === 'glb' || fileType === 'gltf' || fileType === 'dae' || fileType === 'obj') {
    return fileType;
  }
  return null;
}

async function extractZipBuffer(content: Buffer, outputDir: string): Promise<string[]> {
  const extractedFiles: string[] = [];

  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(content, { lazyEntries: true, decodeStrings: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(new ModelArchiveError(`ZIP 资源包无法读取：${openError instanceof Error ? openError.message : '未知错误'}`));
        return;
      }

      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        zipFile.close();
        reject(error instanceof Error ? error : new ModelArchiveError(String(error)));
      };

      zipFile.on('error', fail);
      zipFile.on('end', () => {
        if (settled) return;
        settled = true;
        resolve();
      });

      zipFile.on('entry', (entry: yauzl.Entry) => {
        const normalizedEntryPath = normalizeZipEntryPath(entry.fileName);
        if (!normalizedEntryPath) {
          fail(new ModelArchiveError(`ZIP 资源包包含不安全路径：${entry.fileName}`));
          return;
        }

        if (shouldIgnoreArchiveEntry(normalizedEntryPath)) {
          zipFile.readEntry();
          return;
        }

        const destination = path.resolve(outputDir, normalizedEntryPath);
        if (!isWithinDirectory(destination, outputDir)) {
          fail(new ModelArchiveError(`ZIP 资源包包含越界路径：${entry.fileName}`));
          return;
        }

        if (/\/$/u.test(entry.fileName)) {
          void mkdir(destination, { recursive: true }).then(() => zipFile.readEntry(), fail);
          return;
        }

        void mkdir(path.dirname(destination), { recursive: true })
          .then(() => writeZipEntry(zipFile, entry, destination))
          .then(() => {
            extractedFiles.push(normalizedEntryPath);
            zipFile.readEntry();
          }, fail);
      });

      zipFile.readEntry();
    });
  });

  return extractedFiles;
}

function writeZipEntry(zipFile: yauzl.ZipFile, entry: yauzl.Entry, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (streamError, stream) => {
      if (streamError || !stream) {
        reject(new ModelArchiveError(`ZIP 条目无法解压：${entry.fileName}`));
        return;
      }

      pipeline(stream, createWriteStream(destination)).then(resolve, reject);
    });
  });
}

function selectPrimaryModelFile(rootDir: string, extractedFiles: string[]): ModelArchiveInspection {
  const candidates = extractedFiles
    .map(relativePath => {
      const fileType = getArchiveModelFileType(relativePath);
      return fileType ? { relativePath, fileType } : null;
    })
    .filter((candidate): candidate is { relativePath: string; fileType: ConvertibleInputFileType } => Boolean(candidate))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  if (candidates.length === 0) {
    throw new ModelArchiveError('ZIP 资源包内未找到可转换模型文件。请包含 .glb / .gltf / .dae / .obj 主模型文件。');
  }

  const priority: ConvertibleInputFileType[] = ['glb', 'gltf', 'dae', 'obj'];
  const selected = priority
    .map(fileType => candidates.find(candidate => candidate.fileType === fileType))
    .find(Boolean);

  if (!selected) {
    throw new ModelArchiveError('ZIP 资源包内未找到可转换模型文件。');
  }

  const selectionWarning = candidates.length > 1
    ? `ZIP 资源包内发现 ${candidates.length} 个模型文件，已按 glb/gltf > dae > obj 优先级选择：${selected.relativePath}`
    : undefined;

  return {
    mainModelPath: path.resolve(rootDir, selected.relativePath),
    mainModelRelativePath: selected.relativePath,
    mainModelFileType: selected.fileType,
    modelFileCount: candidates.length,
    selectionWarning,
  };
}

function getArchiveModelFileType(relativePath: string): ConvertibleInputFileType | null {
  const extension = path.extname(relativePath).toLowerCase();
  if (extension === '.glb') return 'glb';
  if (extension === '.gltf') return 'gltf';
  if (extension === '.dae') return 'dae';
  if (extension === '.obj') return 'obj';
  return null;
}

function normalizeZipEntryPath(entryName: string): string | null {
  const normalized = entryName.replace(/\\/g, '/');
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[a-z]:/iu.test(normalized)) {
    return null;
  }

  const parts = normalized.split('/').filter(Boolean);
  if (parts.some(part => part === '..')) {
    return null;
  }

  return normalized.endsWith('/') ? `${parts.join('/')}/` : parts.join('/');
}

function shouldIgnoreArchiveEntry(relativePath: string): boolean {
  return relativePath.startsWith('__MACOSX/') || relativePath.endsWith('/.DS_Store') || relativePath === '.DS_Store';
}

function isWithinDirectory(candidate: string, directory: string): boolean {
  const relative = path.relative(directory, candidate);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function analyzeBlenderOutput(stdout: string, stderr: string): { missingImageCount: number; conversionWarning?: string } {
  const combinedOutput = `${stdout}\n${stderr}`;
  const missingImageCount = (combinedOutput.match(/Image not found/giu) || []).length;
  return {
    missingImageCount,
    conversionWarning: missingImageCount > 0
      ? '模型引用了外部贴图文件，但当前未上传，转换可能变慢或丢失材质。'
      : undefined,
  };
}

function formatBlenderExecutionMessageV2(error: BlenderCliError): string {
  const stderrPreview = summarizeOutput(error.stderr, 4000);
  const stdoutPreview = summarizeOutput(error.stdout, 2000);
  const outputDiagnostics = analyzeBlenderOutput(error.stdout, error.stderr);
  const preview = stderrPreview
    ? `stderrPreview=${stderrPreview}`
    : `stdoutPreview=${stdoutPreview || error.message}`;
  const warning = outputDiagnostics.conversionWarning ? ` warning=${outputDiagnostics.conversionWarning}` : '';
  return `Blender 转换失败：exitCode=${error.code ?? 'unknown'}${error.signal ? ` signal=${error.signal}` : ''} missingImageCount=${outputDiagnostics.missingImageCount}${warning} ${preview}`;
}

function formatBlenderTimeoutMessageV2(error: BlenderCliError, context: { inputFileType?: string; timeoutMs?: number }): string {
  const stderrPreview = summarizeOutput(error.stderr, 2000);
  const stdoutPreview = summarizeOutput(error.stdout, 2000);
  const outputDiagnostics = analyzeBlenderOutput(error.stdout, error.stderr);
  const warning = outputDiagnostics.conversionWarning ? ` ${outputDiagnostics.conversionWarning}` : '';
  return `模型较大或外部贴图缺失，Blender 转换超时。可尝试上传包含贴图的 ZIP 资源包，或延长 MODEL_CONVERSION_TIMEOUT_MS。inputFileType=${context.inputFileType || 'unknown'} timeoutMs=${context.timeoutMs ?? 'unknown'} exitCode=${error.code ?? 'TIMEOUT'} missingImageCount=${outputDiagnostics.missingImageCount}${warning} stderrPreview=${stderrPreview || 'empty'} stdoutPreview=${stdoutPreview || 'empty'}`;
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
  fileType: ConvertibleInputFileType;
  exitCode: string | number | null | undefined;
  signal: NodeJS.Signals | null | undefined;
  stdout: string;
  stderr: string;
  pythonScript: string;
}): void {
  const diagnostics = getOutputDiagnostics(input.outputPath);
  const outputDiagnostics = analyzeBlenderOutput(input.stdout, input.stderr);
  console.error('Blender conversion process failed', {
    blenderBin: input.blenderBin,
    inputPath: input.inputPath,
    outputPath: input.outputPath,
    fileType: input.fileType,
    exitCode: input.exitCode,
    signal: input.signal,
    stdoutPreview: summarizeOutput(input.stdout, 2000),
    stderrPreview: summarizeOutput(input.stderr, 4000),
    missingImageCount: outputDiagnostics.missingImageCount,
    conversionWarning: outputDiagnostics.conversionWarning,
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

function formatOutputValidationErrorV2(reason: string, stdout: string, stderr: string, outputPath: string): string {
  const diagnostics = getOutputDiagnostics(outputPath);
  const stderrPreview = summarizeOutput(stderr, 4000);
  const stdoutPreview = summarizeOutput(stdout, 2000);
  const outputDiagnostics = analyzeBlenderOutput(stdout, stderr);
  const preview = stderrPreview
    ? `stderrPreview=${stderrPreview}`
    : `stdoutPreview=${stdoutPreview || 'empty'}`;
  const warning = outputDiagnostics.conversionWarning ? ` warning=${outputDiagnostics.conversionWarning}` : '';
  return `Blender 转换失败：${reason}。exitCode=0 outputExists=${diagnostics.outputExists} outputDirExists=${diagnostics.outputDirExists} outputSize=${diagnostics.outputSize ?? 'unknown'} missingImageCount=${outputDiagnostics.missingImageCount}${warning} ${preview}`;
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

function classifyBlenderError(error: unknown, context: { blenderBin: string; inputFileType?: string; timeoutMs?: number }): Error {
  if (error instanceof BlenderCliError) {
    if (isBlenderStartupUnavailable(error)) {
      return new ModelConversionUnavailableError(formatBlenderUnavailableMessage(error, context.blenderBin), { cause: error });
    }

    if (error.failureKind === 'timeout') {
      return new ModelConversionExecutionError(formatBlenderTimeoutMessageV2(error, context), { cause: error });
    }

    if (error.failureKind === 'startup') {
      return new ModelConversionExecutionError(formatBlenderStartupFailureMessage(error), { cause: error });
    }

    return new ModelConversionExecutionError(formatBlenderExecutionMessageV2(error), { cause: error });
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
 
