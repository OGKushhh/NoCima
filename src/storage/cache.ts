import {storage, storageKeys, CATEGORY_KEYS} from './index';
import {METADATA_TTL_MS, VIDEO_URL_TTL_MS} from '../constants/endpoints';

// ─── Video URL Cache (6hr TTL) ──────────────────────────────────────

export const setVideoUrlCache = (key: string, url: string, qualities: string[]) => {
  const entry = {url, qualities, timestamp: Date.now()};
  storage.set(storageKeys.VIDEO_URL_CACHE + key, JSON.stringify(entry));
};

export const getVideoUrlCache = (key: string): {url: string; qualities: string[]} | null => {
  const raw = storage.getString(storageKeys.VIDEO_URL_CACHE + key);
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > VIDEO_URL_TTL_MS) {
      storage.remove(storageKeys.VIDEO_URL_CACHE + key);
      return null;
    }
    return {url: entry.url, qualities: entry.qualities};
  } catch {
    storage.remove(storageKeys.VIDEO_URL_CACHE + key);
    return null;
  }
};

// ─── Metadata Cache (per-category, 24hr TTL) ───────────────────────

/**
 * Store metadata for a specific category with a timestamp.
 */
export const setMetadataWithTimestamp = (category: string, data: any) => {
  const keys = CATEGORY_KEYS[category];
  if (!keys) return;

  storage.set(keys.data, JSON.stringify(data));
  storage.set(keys.timestamp, Date.now());
};

/**
 * Get cached metadata for a category.
 * Returns null if not cached OR if older than 24 hours.
 */
export const getMetadataIfFresh = (category: string): any | null => {
  const keys = CATEGORY_KEYS[category];
  if (!keys) return null;

  const ts = storage.getNumber(keys.timestamp);
  if (!ts) return null;

  // Expired?
  if (Date.now() - ts > METADATA_TTL_MS) return null;

  const raw = storage.getString(keys.data);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Get cached metadata regardless of age (fallback when offline).
 */
export const getMetadataAnyAge = (category: string): any | null => {
  const keys = CATEGORY_KEYS[category];
  if (!keys) return null;

  const raw = storage.getString(keys.data);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Get the timestamp for a category's last fetch (epoch ms).
 */
export const getCategoryTimestamp = (category: string): number => {
  const keys = CATEGORY_KEYS[category];
  if (!keys) return 0;
  return storage.getNumber(keys.timestamp) || 0;
};

/**
 * Check if ANY category is older than 24 hours.
 */
export const isAnyCategoryStale = (): boolean => {
  for (const category of Object.keys(CATEGORY_KEYS)) {
    const ts = getCategoryTimestamp(category);
    if (ts === 0 || Date.now() - ts > METADATA_TTL_MS) {
      return true;
    }
  }
  return false;
};

/**
 * Clear all cached metadata and timestamps.
 */
export const clearAllMetadataCache = () => {
  for (const category of Object.keys(CATEGORY_KEYS)) {
    const keys = CATEGORY_KEYS[category];
    storage.remove(keys.data);
    storage.remove(keys.timestamp);
  }
};

// ─── Legacy helpers (kept for SettingsScreen compatibility) ─────────

export const setMetadata = (key: string, data: any) => {
  storage.set(key, JSON.stringify(data));
};

export const getMetadata = (key: string): any | null => {
  const raw = storage.getString(key);
  return raw ? JSON.parse(raw) : null;
};

export const getLastSync = (): number => {
  // Return the most recent timestamp across all categories
  let latest = 0;
  for (const cat of Object.keys(CATEGORY_KEYS)) {
    const ts = getCategoryTimestamp(cat);
    if (ts > latest) latest = ts;
  }
  return latest;
};

export const setLastSync = () => {
  // No-op — timestamps are set per-category in setMetadataWithTimestamp
};

export const isSyncNeeded = (): boolean => isAnyCategoryStale();