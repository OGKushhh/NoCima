/**
 * View Tracking Service for AbdoBest
 *
 * Flow:
 *  1. On every play → increment local counter in MMKV storage
 *  2. Every 24h → sync pending counts to the backend API
 *  3. Backend adds the number to the global count
 *
 * The 24h sync is best-effort (fire-and-forget). Views are never lost —
 * they stay in local storage until successfully sent.
 */

import {storage, storageKeys} from '../storage';
import axios from 'axios';
import {API_BASE} from '../constants/endpoints';

const VIEW_SYNC_KEY = 'view_pending_';
const VIEW_LAST_SYNC_KEY = 'view_last_sync';
const VIEW_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PendingView {
  contentId: string;
  category: string;
  count: number;
}

/** Increment local view count. Call this when user presses play. */
export const incrementViewCount = async (contentId: string, category: string): Promise<void> => {
  const key = `${VIEW_SYNC_KEY}${category}:${contentId}`;
  const current = storage.getNumber(key) || 0;
  storage.set(key, current + 1);

  // Try to sync if it's been > 24h
  await trySyncViews();
};

/** Sync pending view counts to backend if 24h has passed. */
export const trySyncViews = async (): Promise<void> => {
  const lastSync = storage.getNumber(VIEW_LAST_SYNC_KEY) || 0;
  if (Date.now() - lastSync < VIEW_SYNC_INTERVAL_MS) return;

  await forceSyncViews();
};

/** Force sync all pending views to backend regardless of timing. */
export const forceSyncViews = async (): Promise<void> => {
  const pending = getPendingViews();
  if (pending.length === 0) return;

  const api = axios.create({baseURL: API_BASE, timeout: 15000});

  const results = await Promise.allSettled(
    pending.map(({contentId, category, count}) =>
      api.post(`/api/view/${category}/${contentId}`, {increment_by: count})
    )
  );

  // Clear successfully synced entries
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      const key = `${VIEW_SYNC_KEY}${pending[i].category}:${pending[i].contentId}`;
      storage.delete(key);
    }
  });

  storage.set(VIEW_LAST_SYNC_KEY, Date.now());
};

/** Read all pending view entries from storage. */
const getPendingViews = (): PendingView[] => {
  const pending: PendingView[] = [];
  // MMKV doesn't have getAllKeys natively — we track keys in a separate index
  const indexRaw = storage.getString('view_pending_index') || '[]';
  let index: string[] = [];
  try { index = JSON.parse(indexRaw); } catch { index = []; }

  for (const key of index) {
    const count = storage.getNumber(`${VIEW_SYNC_KEY}${key}`) || 0;
    if (count > 0) {
      const [category, contentId] = key.split(':');
      if (category && contentId) {
        pending.push({contentId, category, count});
      }
    }
  }
  return pending;
};

/** Track a new view key in the pending index. */
const trackViewKey = (category: string, contentId: string) => {
  const key = `${category}:${contentId}`;
  const indexRaw = storage.getString('view_pending_index') || '[]';
  let index: string[] = [];
  try { index = JSON.parse(indexRaw); } catch { index = []; }
  if (!index.includes(key)) {
    index.push(key);
    storage.set('view_pending_index', JSON.stringify(index));
  }
};
