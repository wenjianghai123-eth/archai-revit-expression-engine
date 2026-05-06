import { useCallback, useEffect, useState } from 'react';
import { CreditBalance, getCreditBalance } from '../lib/api';

export function useCreditBalance(enabled: boolean) {
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [creditError, setCreditError] = useState<string | null>(null);

  const refreshCreditBalance = useCallback(async () => {
    if (!enabled) return;

    try {
      setCreditBalance(await getCreditBalance());
      setCreditError(null);
    } catch (error) {
      setCreditError(error instanceof Error ? error.message : '额度读取失败。');
    }
  }, [enabled]);

  useEffect(() => {
    void refreshCreditBalance();
  }, [refreshCreditBalance]);

  return {
    creditBalance,
    creditError,
    refreshCreditBalance,
  };
}
