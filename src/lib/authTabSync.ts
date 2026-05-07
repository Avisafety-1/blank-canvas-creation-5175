/**
 * Cross-tab auth synchronization using BroadcastChannel.
 *
 * Prevents the "rotating refresh token" race condition where two tabs
 * both try to refresh at the same time, causing one tab's refresh token
 * to be revoked and the user to be logged out.
 *
 * Strategy:
 * 1. When a tab refreshes a token, it sets a localStorage lock + broadcasts the new session.
 * 2. Other tabs see the lock and skip their own refresh, instead picking up the session from storage.
 * 3. Sign-out is broadcast so all tabs log out together.
 */

import type { Session } from '@supabase/supabase-js';

const CHANNEL_NAME = 'avisafe-auth';
const REFRESH_LOCK_KEY = 'avisafe_refresh_lock';
const LOCK_TTL_MS = 8_000; // 8 seconds — generous to cover slow networks

export type TabSyncMessage =
  | { type: 'SESSION_UPDATE'; access_token: string; refresh_token: string }
  | { type: 'SIGNED_OUT' };

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (channel) return channel;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    return channel;
  } catch {
    // BroadcastChannel not supported (older Safari) — graceful degradation
    return null;
  }
}

/**
 * Broadcast that this tab just refreshed/received a new session.
 * Also sets the localStorage refresh lock so other tabs know not to refresh.
 */
export function broadcastSession(session: Session): void {
  try {
    localStorage.setItem(REFRESH_LOCK_KEY, Date.now().toString());
  } catch { /* ignore */ }

  const ch = getChannel();
  if (!ch) return;

  try {
    const msg: TabSyncMessage = {
      type: 'SESSION_UPDATE',
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    };
    ch.postMessage(msg);
  } catch {
    // postMessage can fail if channel is closed
  }
}

/**
 * Broadcast that this tab signed out.
 */
export function broadcastSignOut(): void {
  const ch = getChannel();
  if (!ch) return;
  try {
    ch.postMessage({ type: 'SIGNED_OUT' } as TabSyncMessage);
  } catch { /* ignore */ }
}

/**
 * Check if another tab recently refreshed the token.
 * If true, the calling tab should NOT call refreshSession() — the fresh
 * tokens are already in localStorage (Supabase persists them automatically).
 */
export function isRefreshLockedByOtherTab(): boolean {
  try {
    const lock = localStorage.getItem(REFRESH_LOCK_KEY);
    if (!lock) return false;
    const age = Date.now() - parseInt(lock, 10);
    return age >= 0 && age < LOCK_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Set the refresh lock (called before this tab starts a refresh).
 */
export function setRefreshLock(): void {
  try {
    localStorage.setItem(REFRESH_LOCK_KEY, Date.now().toString());
  } catch { /* ignore */ }
}

/**
 * Listen for messages from other tabs.
 * Returns a cleanup function.
 */
export function onTabMessage(callback: (msg: TabSyncMessage) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};

  const handler = (e: MessageEvent<TabSyncMessage>) => {
    if (e.data && typeof e.data.type === 'string') {
      callback(e.data);
    }
  };
  ch.addEventListener('message', handler);
  return () => {
    ch.removeEventListener('message', handler);
  };
}
