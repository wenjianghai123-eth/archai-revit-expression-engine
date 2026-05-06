import { useCallback, useEffect, useState } from 'react';
import { BackendHealth, getBackendHealth } from '../api/health';

export interface BackendHealthState {
  status: 'checking' | 'online' | 'offline';
  data: BackendHealth | null;
  message: string;
}

export function useBackendHealth(isSettingsOpen: boolean) {
  const [backendHealth, setBackendHealth] = useState<BackendHealthState>({
    status: 'checking',
    data: null,
    message: '等待后端健康检查。',
  });

  const refreshBackendHealth = useCallback(async () => {
    setBackendHealth(prev => ({
      status: 'checking',
      data: prev.data,
      message: '正在检查后端健康状态...',
    }));

    try {
      const health = await getBackendHealth();
      setBackendHealth({
        status: 'online',
        data: health,
        message: `后端在线，版本 ${health.version}，当前 provider: ${health.provider}。`,
      });
    } catch (error) {
      setBackendHealth({
        status: 'offline',
        data: null,
        message: error instanceof Error ? error.message : '后端健康检查失败。',
      });
    }
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    void refreshBackendHealth();
  }, [isSettingsOpen, refreshBackendHealth]);

  return {
    backendHealth,
    refreshBackendHealth,
  };
}
