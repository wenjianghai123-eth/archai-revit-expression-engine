import { useCallback, useEffect, useRef, useState } from 'react';
import { BackendHealth, getBackendHealth } from '../api/health';
import {
  ApiConnectionStatus,
  getReadableApiConnectionError,
  isAbortError,
  sleep,
} from '../utils/apiConnectionStatus';

export interface BackendHealthState {
  status: ApiConnectionStatus;
  data: BackendHealth | null;
  message: string;
}

export function useBackendHealth(isSettingsOpen: boolean) {
  const requestIdRef = useRef(0);
  const [backendHealth, setBackendHealth] = useState<BackendHealthState>({
    status: 'idle',
    data: null,
    message: '等待后端健康检查。',
  });

  const refreshBackendHealth = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++requestIdRef.current;
    console.debug('[api-status] checking');
    setBackendHealth(prev => ({
      status: 'checking',
      data: prev.data,
      message: '正在连接API...',
    }));

    const delays = [300, 800, 1500];
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      try {
        const health = await getBackendHealth(signal);
        if (requestId !== requestIdRef.current) return;
        console.debug('[api-status] connected');
        setBackendHealth({
          status: 'connected',
          data: health,
          message: `后端在线，版本 ${health.version}，当前 provider: ${health.provider}。`,
        });
        return;
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        if (isAbortError(error)) {
          console.debug('[api-status] request aborted, ignored');
          return;
        }
        if (attempt < delays.length - 1) {
          console.warn('[api-status] retry', { attempt: attempt + 1, message: getReadableApiConnectionError(error) });
          await sleep(delays[attempt]);
          continue;
        }
        console.error('[api-status] failed', error);
        setBackendHealth({
          status: 'failed',
          data: null,
          message: '无法连接后端服务，请确认本地服务已启动或刷新重试。',
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const controller = new AbortController();
    void refreshBackendHealth(controller.signal);
    return () => controller.abort();
  }, [isSettingsOpen, refreshBackendHealth]);

  return {
    backendHealth,
    refreshBackendHealth,
  };
}
