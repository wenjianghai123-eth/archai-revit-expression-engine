import 'dotenv/config';
import { fileStorageProvider } from './fileStorage';
import { runGenerationWorkerOnce } from './generationService';
import { ensureAppDatabase } from './storage';
import {
  createGenerationWorkerId,
  getGenerationWorkerSettings,
  logGenerationWorkerEvent,
} from './generationWorkerReliability';

const workerId = process.env.GENERATION_WORKER_ID?.trim() || createGenerationWorkerId('standalone');
const settings = getGenerationWorkerSettings();
let shuttingDown = false;

async function start(): Promise<void> {
  await ensureAppDatabase();
  await fileStorageProvider.ensureReady();
  logGenerationWorkerEvent('info', 'worker_started', {
    workerId,
    concurrency: settings.concurrency,
    leaseDurationMs: settings.leaseDurationMs,
    executionTimeoutMs: settings.executionTimeoutMs,
    pollIntervalMs: settings.pollIntervalMs,
    dataBackend: process.env.DATA_BACKEND || 'json',
  });

  await Promise.all(Array.from({ length: settings.concurrency }, (_, index) => runLoop(index)));
}

async function runLoop(slot: number): Promise<void> {
  while (!shuttingDown) {
    try {
      const processed = await runGenerationWorkerOnce(`${workerId}:${slot + 1}`);
      if (!processed) await delay(settings.pollIntervalMs);
    } catch (error) {
      logGenerationWorkerEvent('error', 'worker_loop_error', {
        workerId,
        slot,
        error: error instanceof Error ? error.message : String(error),
      });
      await delay(settings.pollIntervalMs);
    }
  }
}

function requestShutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logGenerationWorkerEvent('info', 'worker_shutdown_requested', { workerId, signal });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

process.on('SIGTERM', () => requestShutdown('SIGTERM'));
process.on('SIGINT', () => requestShutdown('SIGINT'));

await start();
