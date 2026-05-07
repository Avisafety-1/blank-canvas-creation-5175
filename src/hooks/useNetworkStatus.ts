import { useState, useEffect, useCallback, useRef } from 'react';
import { processQueue, getQueueLength } from '@/lib/offlineQueue';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface NetworkStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
}

export const useNetworkStatus = () => {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingCount: getQueueLength(),
  });
  const queryClient = useQueryClient();
  const isSyncingRef = useRef(false);

  const syncQueue = useCallback(async () => {
    if (isSyncingRef.current) return;
    const count = getQueueLength();
    if (count === 0) return;

    isSyncingRef.current = true;
    setStatus(prev => ({ ...prev, isSyncing: true }));

    try {
      const result = await processQueue();
      
      // Invalidate all queries to refresh data
      await queryClient.invalidateQueries();

      if (result.synced > 0) {
        toast.success(`${result.synced} endring${result.synced > 1 ? 'er' : ''} synkronisert`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} endring${result.failed > 1 ? 'er' : ''} feilet synkronisering`);
      }
    } catch (error) {
      console.error('Sync queue error:', error);
    } finally {
      isSyncingRef.current = false;
      setStatus(prev => ({
        ...prev,
        isSyncing: false,
        pendingCount: getQueueLength(),
      }));
    }
  }, [queryClient]);

  useEffect(() => {
    const handleOnline = () => {
      setStatus(prev => ({ ...prev, isOnline: true }));
      // Trigger sync after short delay to allow network to stabilize
      setTimeout(() => syncQueue(), 1000);
    };

    const handleOffline = () => {
      setStatus(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check queue on mount
    setStatus(prev => ({ ...prev, pendingCount: getQueueLength() }));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncQueue]);

  // Refresh pending count periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setStatus(prev => ({ ...prev, pendingCount: getQueueLength() }));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return {
    isOnline: status.isOnline,
    isSyncing: status.isSyncing,
    pendingCount: status.pendingCount,
    syncQueue,
  };
};
