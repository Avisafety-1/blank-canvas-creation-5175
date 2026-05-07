import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { processQueue } from '@/lib/offlineQueue';

const VERSION_KEY = 'avisafe_app_version';

function getLocalVersion(): string | null {
  return localStorage.getItem(VERSION_KEY);
}

function setLocalVersion(v: string) {
  localStorage.setItem(VERSION_KEY, v);
}

// Track the pending version so performReload can persist it
let pendingVersion: string | null = null;

interface ForceReloadState {
  showBanner: boolean;
  forceImmediate: boolean;
}

let globalState: ForceReloadState = { showBanner: false, forceImmediate: false };
let listeners: Set<() => void> = new Set();

const notify = () => listeners.forEach(fn => fn());

export const getForceReloadState = () => globalState;

export const subscribeForceReload = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

async function clearAllCaches() {
  // 1. Clear Cache Storage (service worker caches)
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    console.log('[ForceReload] Cleared Cache Storage');
  } catch (e) {
    console.warn('[ForceReload] Could not clear Cache Storage:', e);
  }

  // 2. Clear React Query persistence cache
  try {
    localStorage.removeItem('avisafe_query_cache');
    console.log('[ForceReload] Cleared React Query cache');
  } catch {}

  // 3. Clear offline data caches (keys starting with known prefixes)
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('offlineCache_') || key.startsWith('avisafe_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    console.log('[ForceReload] Cleared localStorage caches');
  } catch {}

  // 4. Trigger service worker update
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) {
      await reg.update();
      console.log('[ForceReload] Triggered SW update');
    }
  } catch (e) {
    console.warn('[ForceReload] Could not update SW:', e);
  }
}

export async function performReload() {
  // Sync offline queue first to avoid data loss
  try {
    const result = await processQueue();
    if (result.synced > 0) {
      console.log(`[ForceReload] Synced ${result.synced} offline operations before reload`);
    }
  } catch (e) {
    console.warn('[ForceReload] Could not sync offline queue:', e);
  }

  // If we don't have a pending version from broadcast, fetch from DB
  if (!pendingVersion) {
    try {
      const { data } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'app_version')
        .single();
      if (data?.value) pendingVersion = data.value;
    } catch {}
  }

  // Persist the new version BEFORE reload so the check won't trigger again
  if (pendingVersion) {
    setLocalVersion(pendingVersion);
    console.log(`[ForceReload] Saved version ${pendingVersion} to localStorage`);
    pendingVersion = null;
  }

  await clearAllCaches();
  window.location.reload();
}

export function useForceReload() {
  const { user } = useAuth();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!user) return;

    // --- Layer 1: Broadcast listener ---
    const channel = supabase.channel('global-force-reload');
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'reload' }, (payload) => {
        console.log('[ForceReload] Received broadcast signal', payload);
        const forceImmediate = payload?.payload?.forceImmediate === true;
        // Store version from broadcast so performReload can persist it
        if (payload?.payload?.version) {
          pendingVersion = payload.payload.version;
        }

        if (forceImmediate) {
          performReload();
        } else {
          globalState = { showBanner: true, forceImmediate: false };
          notify();
        }
      })
      .subscribe();

    // --- Layer 2: Version check on reconnect ---
    const handleOnline = async () => {
      try {
        const { data, error } = await supabase
          .from('app_config')
          .select('value')
          .eq('key', 'app_version')
          .single();

        if (error) {
          console.warn('[ForceReload] Could not check app version:', error);
          return;
        }

        const localVer = getLocalVersion();
        if (data && localVer && data.value !== localVer) {
          console.log(`[ForceReload] Version mismatch: local=${localVer}, remote=${data.value}`);
          pendingVersion = data.value;
          globalState = { showBanner: true, forceImmediate: false };
          notify();
        } else if (data && !localVer) {
          // First visit — seed localStorage with current DB version
          setLocalVersion(data.value);
        }
      } catch (e) {
        console.warn('[ForceReload] Version check failed:', e);
      }
    };

    window.addEventListener('online', handleOnline);

    // Also check on mount (in case user was offline and reloaded while online)
    if (navigator.onLine) {
      handleOnline();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [user?.id]);
}
