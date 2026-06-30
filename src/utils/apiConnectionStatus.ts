export type ApiConnectionStatus = 'idle' | 'checking' | 'connected' | 'degraded' | 'failed';

export function isAbortError(error: unknown): boolean {
  const message = String(error instanceof Error ? `${error.name}: ${error.message}` : error);
  return (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
    || message.includes('AbortError')
    || message.toLowerCase().includes('aborted')
    || message.toLowerCase().includes('signal is aborted')
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => globalThis.setTimeout(resolve, ms));
}

export function getReadableApiConnectionError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return '无法连接后端服务，请确认本地服务已启动或刷新重试。';
}
