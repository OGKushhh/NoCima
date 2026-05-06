/**
 * View Tracking Service
 *
 * On play → immediately POST to /api/view/:category/:id
 *           If the POST fails, store in MMKV pending queue (retry on next launch / foreground)
 * On app foreground / launch → retry all pending failed counts
 */

import {storage} from '../storage';
import {postViewCount} from './api';

const PENDING_PREFIX = 'vpend:';   // vpend:category:id → count
const INDEX_KEY      = 'vpend_index'; // JSON array of "category:id" keys

// ── Public API ───────────────────────────────────────────────────────

/**
 * Call when user presses Play on any title or episode.
 * Tries to POST immediately; on failure queues for retry.
 */
export const recordPlay = (contentId: string, category: string): void => {
  if (!contentId || !category) return;

  // Fire-and-forget: try immediately, fallback to queue
  postViewCount(category, contentId, 1)
    .catch(() => {
      // Network failed — queue it for later retry
      queuePending(category, contentId, 1);
    });
};

/**
 * Retry all previously failed view counts.
 * Call on app launch and on foreground resume.
 */
export const retrySyncViews = async (): Promise<void> => {
  const index = readIndex();
  if (!index.length) return;

  const results = await Promise.allSettled(
    index.map(async (compositeKey) => {
      const [category, ...rest] = compositeKey.split(':');
      const contentId = rest.join(':');
      const count = storage.getNumber(`${PENDING_PREFIX}${compositeKey}`) ?? 0;
      if (count <= 0) return compositeKey; // nothing to send, treat as done
      await postViewCount(category, contentId, count);
      storage.delete(`${PENDING_PREFIX}${compositeKey}`);
      return compositeKey;
    })
  );

  // Prune index — remove keys we successfully sent
  const sent = results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map(r => r.value);
  const remaining = index.filter(k => !sent.includes(k));
  writeIndex(remaining);
};

// ── Helpers ──────────────────────────────────────────────────────────

const queuePending = (category: string, contentId: string, count: number): void => {
  const compositeKey = `${category}:${contentId}`;
  const storageKey = `${PENDING_PREFIX}${compositeKey}`;
  const current = storage.getNumber(storageKey) ?? 0;
  storage.set(storageKey, current + count);
  const index = readIndex();
  if (!index.includes(compositeKey)) {
    index.push(compositeKey);
    writeIndex(index);
  }
};

const readIndex = (): string[] => {
  try {
    return JSON.parse(storage.getString(INDEX_KEY) ?? '[]');
  } catch {
    return [];
  }
};

const writeIndex = (index: string[]): void => {
  storage.set(INDEX_KEY, JSON.stringify(index));
};
