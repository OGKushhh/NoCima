/**
 * Video Service for AbdoBest.
 *
 * Handles:
 *  - Stream URL resolution (with 6h URL cache via AsyncStorage)
 *  - Download state persistence (via AsyncStorage)
 *
 * Download feature is currently disabled.
 * When re-enabled, HLS downloads will require a compatible media library.
 *
 * Storage architecture:
 *  - AsyncStorage → download queue, settings, URL cache (6h TTL)
 *  - react-native-blob-util → metadata JSON files on disk, per-category (24h TTL)
 *
 * Metadata persistence:
 *  - Cached metadata (movies, series, anime catalogs) is stored on disk
 *    and persists until the user clears cache or uninstalls
 *  - The 24h TTL only controls when to RE-FETCH from the server
 *  - The 6h TTL only applies to extracted video URL reuse
 *  - Completed downloads, user preferences, and cached catalogs persist
 *    forever (until user clears data or uninstalls)
 */

import {extractVideoUrl, refreshVideoUrl} from './api';
import {storage} from '../storage';
import {storageKeys} from '../storage';

export interface VideoServiceCallbacks {
  onProgress?: (progress: number) => void;
  onCompleted?: (localPath: string) => void;
  onError?: (error: string) => void;
}

/**
 * Get a stream URL for a content item.
 * Uses URL cache (6h TTL) to avoid redundant /extract calls.
 *
 * URL caching behavior:
 *  - First call → extract from backend → cache with 6h timestamp
 *  - Within 6h → return cached URL immediately (no network call)
 *  - After 6h → re-extract once, update cache
 *  - This is NOT session-based — the cache persists across app restarts
 */
export const getStreamUrl = async (contentId: string, sourceUrl: string) => {
  if (!sourceUrl) {
    throw new Error('No source URL available for this content');
  }
  return extractVideoUrl(sourceUrl);
};

/**
 * Force-refresh a stream URL (bypasses cache).
 */
export const getRefreshedStreamUrl = async (cacheKey: string, sourceUrl: string) => {
  return refreshVideoUrl(cacheKey);
};

/**
 * Persist download state to AsyncStorage.
 * This data persists indefinitely (not session-based).
 */
export const saveDownloadState = (downloads: any[]) => {
  storage.set(storageKeys.DOWNLOADS_LIST, JSON.stringify(downloads));
};

/**
 * Load download state from AsyncStorage.
 * Survives app restarts, device reboots, and process kills.
 */
export const getDownloadState = (): any[] => {
  const raw = storage.getString(storageKeys.DOWNLOADS_LIST);
  return raw ? JSON.parse(raw) : [];
};