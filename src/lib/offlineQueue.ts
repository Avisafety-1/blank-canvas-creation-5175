import { supabase } from '@/integrations/supabase/client';

const QUEUE_KEY = 'avisafe_offline_queue';

export interface QueuedOperation {
  id: string;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data: Record<string, unknown>;
  matchColumn?: string;
  matchValue?: string;
  timestamp: number;
  retries: number;
  description?: string;
}

/**
 * Add an operation to the offline queue
 */
export const addToQueue = (op: Omit<QueuedOperation, 'id' | 'timestamp' | 'retries'>) => {
  const queue = getQueue();
  const operation: QueuedOperation = {
    ...op,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    retries: 0,
  };
  queue.push(operation);
  saveQueue(queue);
  console.log(`[OfflineQueue] Added ${op.operation} on ${op.table}:`, op.description || '');
  return operation.id;
};

/**
 * Get all pending operations
 */
export const getQueue = (): QueuedOperation[] => {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

/**
 * Get the number of pending operations
 */
export const getQueueLength = (): number => {
  return getQueue().length;
};

/**
 * Save queue to localStorage
 */
const saveQueue = (queue: QueuedOperation[]) => {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

/**
 * Remove an operation from the queue
 */
export const removeFromQueue = (id: string) => {
  const queue = getQueue().filter(op => op.id !== id);
  saveQueue(queue);
};

/**
 * Process all queued operations sequentially
 * Returns the number of successfully synced and failed operations
 */
export const processQueue = async (): Promise<{ synced: number; failed: number }> => {
  const queue = getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining: QueuedOperation[] = [];

  for (const op of queue) {
    try {
      const success = await executeOperation(op);
      if (success) {
        synced++;
        console.log(`[OfflineQueue] Synced: ${op.operation} on ${op.table}`, op.description || '');
      } else {
        op.retries++;
        if (op.retries < 3) {
          remaining.push(op);
        } else {
          failed++;
          console.error(`[OfflineQueue] Giving up after 3 retries: ${op.operation} on ${op.table}`);
        }
      }
    } catch (err) {
      console.error(`[OfflineQueue] Error executing operation:`, err);
      op.retries++;
      if (op.retries < 3) {
        remaining.push(op);
      } else {
        failed++;
      }
    }
  }

  saveQueue(remaining);
  return { synced, failed };
};

/**
 * Execute a single queued operation against Supabase
 */
const executeOperation = async (op: QueuedOperation): Promise<boolean> => {
  try {
    switch (op.operation) {
      case 'insert': {
        const { error } = await supabase
          .from(op.table as any)
          .insert(op.data as any);
        if (error) {
          console.error(`[OfflineQueue] Insert error on ${op.table}:`, error);
          return false;
        }
        return true;
      }
      case 'update': {
        if (!op.matchColumn || !op.matchValue) {
          console.error('[OfflineQueue] Update requires matchColumn and matchValue');
          return false;
        }
        const { error } = await supabase
          .from(op.table as any)
          .update(op.data as any)
          .eq(op.matchColumn, op.matchValue);
        if (error) {
          console.error(`[OfflineQueue] Update error on ${op.table}:`, error);
          return false;
        }
        return true;
      }
      case 'delete': {
        if (!op.matchColumn || !op.matchValue) {
          console.error('[OfflineQueue] Delete requires matchColumn and matchValue');
          return false;
        }
        const { error } = await supabase
          .from(op.table as any)
          .delete()
          .eq(op.matchColumn, op.matchValue);
        if (error) {
          console.error(`[OfflineQueue] Delete error on ${op.table}:`, error);
          return false;
        }
        return true;
      }
      default:
        console.error(`[OfflineQueue] Unknown operation: ${op.operation}`);
        return false;
    }
  } catch (err) {
    console.error(`[OfflineQueue] Execution error:`, err);
    return false;
  }
};

/**
 * Clear all queued operations (use with caution)
 */
export const clearQueue = () => {
  localStorage.removeItem(QUEUE_KEY);
};
