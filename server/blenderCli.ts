import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface BlenderRunResult {
  stdout: string;
  stderr: string;
}

export interface BlenderAvailabilityDiagnostics {
  rawBlenderBin: string | undefined;
  normalizedBlenderBin: string;
  isAbsolutePath: boolean;
  exists: boolean | null;
  accessible: boolean | null;
}

export class BlenderCliError extends Error {
  readonly diagnostics: BlenderAvailabilityDiagnostics;
  readonly failureKind: 'startup' | 'execution' | 'timeout';
  readonly code?: string | number | null;
  readonly signal?: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly processStarted: boolean;

  constructor(message: string, input: {
    diagnostics: BlenderAvailabilityDiagnostics;
    failureKind: 'startup' | 'execution' | 'timeout';
    code?: string | number | null;
    signal?: NodeJS.Signals | null;
    stdout?: string;
    stderr?: string;
    processStarted?: boolean;
    cause?: unknown;
  }) {
    super(message);
    this.name = 'BlenderCliError';
    this.diagnostics = input.diagnostics;
    this.failureKind = input.failureKind;
    this.code = input.code;
    this.signal = input.signal;
    this.stdout = input.stdout || '';
    this.stderr = input.stderr || '';
    this.processStarted = input.processStarted ?? false;
    this.cause = input.cause;
  }
}

export function normalizeBlenderBin(rawValue: string | undefined): string {
  const trimmed = rawValue === undefined ? 'blender' : rawValue.trim();
  return trimmed.replace(/^(['"])(.*)\1$/u, '$2').trim();
}

export function getBlenderDiagnostics(rawValue: string | undefined): BlenderAvailabilityDiagnostics {
  const normalizedBlenderBin = normalizeBlenderBin(rawValue);
  const isAbsolutePath = path.isAbsolute(normalizedBlenderBin);
  let exists: boolean | null = null;
  let accessible: boolean | null = null;

  if (isAbsolutePath) {
    exists = fs.existsSync(normalizedBlenderBin);
    try {
      fs.accessSync(normalizedBlenderBin, fs.constants.X_OK);
      accessible = true;
    } catch {
      try {
        fs.accessSync(normalizedBlenderBin, fs.constants.R_OK);
        accessible = true;
      } catch {
        accessible = false;
      }
    }
  }

  return {
    rawBlenderBin: rawValue,
    normalizedBlenderBin,
    isAbsolutePath,
    exists,
    accessible,
  };
}

export async function assertBlenderAvailable(rawBlenderBin: string | undefined, timeoutMs = 10_000): Promise<void> {
  await runBlender(rawBlenderBin, ['--version'], { timeoutMs, logLabel: 'blender-version-check' });
}

export function runBlender(
  rawBlenderBin: string | undefined,
  args: string[],
  options: { timeoutMs: number; logLabel: string },
): Promise<BlenderRunResult> {
  const diagnostics = getBlenderDiagnostics(rawBlenderBin);
  if (!diagnostics.normalizedBlenderBin) {
    logBlenderDiagnostics(options.logLabel, diagnostics);
    throw new BlenderCliError('BLENDER_BIN is empty.', { diagnostics, failureKind: 'startup', code: 'BLENDER_BIN_EMPTY' });
  }

  if (diagnostics.isAbsolutePath && (!diagnostics.exists || !diagnostics.accessible)) {
    logBlenderDiagnostics(options.logLabel, diagnostics);
    throw new BlenderCliError('Blender executable is not accessible.', {
      diagnostics,
      failureKind: 'startup',
      code: diagnostics.exists === false ? 'ENOENT' : 'EACCES',
    });
  }

  return new Promise((resolve, reject) => {
    const child = spawn(diagnostics.normalizedBlenderBin, args, {
      shell: false,
      windowsHide: true,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let processStarted = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      logBlenderDiagnostics(options.logLabel, diagnostics, { code: 'TIMEOUT', stdout, stderr, processStarted });
      reject(new BlenderCliError('Blender execution timed out.', {
        diagnostics,
        failureKind: 'timeout',
        code: 'TIMEOUT',
        stdout,
        stderr,
        processStarted,
      }));
    }, options.timeoutMs);

    child.on('spawn', () => {
      processStarted = true;
    });
    child.stdout.on('data', chunk => stdoutChunks.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => stderrChunks.push(Buffer.from(chunk)));

    child.on('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      const code = (error as NodeJS.ErrnoException).code;
      logBlenderDiagnostics(options.logLabel, diagnostics, { code, message: error.message, stdout, stderr, processStarted });
      reject(new BlenderCliError(error.message, {
        diagnostics,
        failureKind: 'startup',
        code,
        stdout,
        stderr,
        processStarted,
        cause: error,
      }));
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      logBlenderDiagnostics(options.logLabel, diagnostics, { code, signal, stdout, stderr, processStarted });
      reject(new BlenderCliError(`Blender exited with code ${code}.`, {
        diagnostics,
        failureKind: 'execution',
        code,
        signal,
        stdout,
        stderr,
        processStarted,
      }));
    });
  });
}

export function formatBlenderCliError(error: unknown, fallbackBlenderBin: string): string {
  if (error instanceof BlenderCliError) {
    const stderrSummary = summarizeOutput(error.stderr, 1000);
    const stdoutSummary = summarizeOutput(error.stdout, 1000);
    const outputSummary = stderrSummary || stdoutSummary || error.message;
    if (error.failureKind === 'timeout') {
      const suffix = outputSummary ? ` ${outputSummary}` : '';
      return `Blender 执行超时，请检查模型复杂度或超时配置。${suffix}`;
    }
    if (isBlenderStartupUnavailable(error)) {
      const suffix = stderrSummary ? ` stderr: ${stderrSummary}` : '';
      return `Blender 可执行文件不可用，请检查 BLENDER_BIN 配置：${error.diagnostics.normalizedBlenderBin || fallbackBlenderBin}.${suffix}`;
    }
    if (error.failureKind === 'startup') {
      return `Blender 启动失败：code=${error.code ?? 'unknown'} ${outputSummary}`;
    }
    return `Blender 转换失败：exitCode=${error.code ?? 'unknown'}${error.signal ? ` signal=${error.signal}` : ''} ${
      stderrSummary ? `stderrPreview=${stderrSummary}` : `stdoutPreview=${stdoutSummary || error.message}`
    }`;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message;
}

export function isBlenderStartupUnavailable(error: BlenderCliError): boolean {
  if (error.failureKind !== 'startup') return false;
  if (!error.diagnostics.normalizedBlenderBin) return true;
  if (error.diagnostics.isAbsolutePath && error.diagnostics.exists === false) return true;

  const code = typeof error.code === 'string' ? error.code : '';
  return code === 'BLENDER_BIN_EMPTY' || code === 'ENOENT' || code === 'EACCES' || code === 'EPERM';
}

function logBlenderDiagnostics(
  label: string,
  diagnostics: BlenderAvailabilityDiagnostics,
  runtime?: { code?: string | number | null; signal?: NodeJS.Signals | null; message?: string; stdout?: string; stderr?: string; processStarted?: boolean },
): void {
  console.error('Blender CLI diagnostic', {
    label,
    rawBlenderBin: diagnostics.rawBlenderBin,
    normalizedBlenderBin: diagnostics.normalizedBlenderBin,
    isAbsolutePath: diagnostics.isAbsolutePath,
    exists: diagnostics.exists,
    accessible: diagnostics.accessible,
    spawnCode: runtime?.code,
    signal: runtime?.signal,
    processStarted: runtime?.processStarted,
    spawnMessage: runtime?.message,
    stdout: summarizeOutput(runtime?.stdout || '', 1000),
    stderr: summarizeStderr(runtime?.stderr || ''),
  });
}

function summarizeStderr(stderr: string): string {
  return summarizeOutput(stderr, 1000);
}

export function summarizeOutput(value: string, maxLength: number): string {
  return value.split(/\r?\n/u).filter(Boolean).slice(0, 20).join(' | ').slice(0, maxLength);
}
