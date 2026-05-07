/**
 * Generic offline cache helper using localStorage.
 * Stores fetched data with timestamps for TTL-based expiry.
 */

const DEFAULT_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Get cached data from localStorage.
 * Returns null if no cache exists or if data has expired.
 */
export function getCachedData<T>(key: string, maxAge: number = DEFAULT_MAX_AGE): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    
    // Check TTL
    if (Date.now() - entry.timestamp > maxAge) {
      localStorage.removeItem(key);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Store data in localStorage cache with current timestamp.
 */
export function setCachedData<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch (e) {
    // localStorage might be full - silently fail
    console.warn('offlineCache: Could not write to localStorage', e);
  }
}

/**
 * Remove cached data for a specific key.
 */
export function removeCachedData(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
