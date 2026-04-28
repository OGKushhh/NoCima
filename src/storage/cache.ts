import RNFS from 'react-native-fs';
import {storage, storageKeys, CATEGORY_KEYS} from './index';
import {METADATA_TTL_MS, VIDEO_URL_TTL_MS} from '../constants/endpoints';

// ─── Metadata Directory ─────────────────────────────────────────────

const METADATA_DIR = `${RNFS.DocumentDirectoryPath}/metadata`;

/** Ensure the metadata directory exists. */
const ensureMetadataDir = (): void => {
  try {
    if (!RNFS.exists(METADATA_DIR)) {
      RNFS.mkdir(METADATA_DIR);
    }
  } catch (e) {
    console.warn('[Cache] Failed to create metadata dir:', e);
  }
};

/** Get the file path for a category's JSON file. */
const getCategoryFilePath = (category: string): string => {
  return `${METADATA_DIR}/${category}.json`;
};

// ─── Video URL Cache (6hr TTL) ── stays in MMKV ─────────────────────
// URL cache entries are small (url + qualities + timestamp) → MMKV is ideal.

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
      storage.delete(storageKeys.VIDEO_URL_CACHE + key);
      return null;
    }
    return {url: entry.url, qualities: entry.qualities};
  } catch {
    storage.delete(storageKeys.VIDEO_URL_CACHE + key);
    return null;
  }
};

// ─── Metadata Cache (per-category, 24hr TTL) ── now on disk ────────
// Large JSON blobs (13,500+ items) are stored as files via react-native-fs-turbo.
// Only timestamps stay in MMKV for fast staleness checks.

/**
 * Store metadata for a specific category.
 * - JSON data → written to disk as a file
 * - Timestamp → stored in MMKV for fast staleness checks
 */
export const setMetadataWithTimestamp = (category: string, data: any) => {
  const keys = CATEGORY_KEYS[category];
  if (!keys) return;

  ensureMetadataDir();

  try {
    const filePath = getCategoryFilePath(category);
    RNFS.writeFile(filePath, JSON.stringify(data), 'utf8');
    storage.set(keys.timestamp, Date.now());
  } catch (e) {
    console.warn(`[Cache] Failed to write metadata for ${category}:`, e);
  }
};

/**
 * Get cached metadata for a category.
 * Returns null if not cached OR if older than 24 hours.
 */
export const getMetadataIfFresh = (category: string): any | null => {
  const keys = CATEGORY_KEYS[category];
  if (!keys) return null;

  // Fast check: timestamp from MMKV
  const ts = storage.getNumber(keys.timestamp);
  if (!ts) return null;

  // Expired?
  if (Date.now() - ts > METADATA_TTL_MS) return null;

  // Read from disk
  try {
    const filePath = getCategoryFilePath(category);
    if (!RNFS.exists(filePath)) return null;

    const raw = RNFS.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Get cached metadata regardless of age (fallback when offline).
 */
export const getMetadataAnyAge = (category: string): any | null => {
  try {
    const filePath = getCategoryFilePath(category);
    if (!RNFS.exists(filePath)) return null;

    const raw = RNFS.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Get the timestamp for a category's last fetch (epoch ms).
 * Stored in MMKV for O(1) access — no disk read needed.
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
 * Clear all cached metadata files and timestamps.
 */
export const clearAllMetadataCache = () => {
  for (const category of Object.keys(CATEGORY_KEYS)) {
    const keys = CATEGORY_KEYS[category];
    storage.delete(keys.timestamp);

    try {
      const filePath = getCategoryFilePath(category);
      if (RNFS.exists(filePath)) {
        RNFS.unlink(filePath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
};

// ─── Legacy helpers (kept for SettingsScreen compatibility) ─────────

export const setMetadata = (key: string, data: any) => {
  ensureMetadataDir();
  try {
    const filePath = `${METADATA_DIR}/${key}.json`;
    RNFS.writeFile(filePath, JSON.stringify(data), 'utf8');
  } catch {
    // Silently fail
  }
};

export const getMetadata = (key: string): any | null => {
  try {
    const filePath = `${METADATA_DIR}/${key}.json`;
    if (!RNFS.exists(filePath)) return null;
    const raw = RNFS.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const getLastSync = (): number => {
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