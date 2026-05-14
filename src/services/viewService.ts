/**
 * View Tracking Service
 *
 * On play → immediately POST to /api/view/:category/:id
 *           If the POST fails, store in MMKV pending queue (retry on next launch / foreground)
 * On app foreground / launch → retry all pending failed counts
 */

import {storage} from '../storage';
import {postViewCount, postEpisodeView} from './api';
import { encode as b64encode, decode as b64decode } from 'base-64';

const PENDING_PREFIX = 'vpend:';
const INDEX_KEY      = 'vpend_index';

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Encode contentId for safe use as an MMKV key.
 * Uses base-64 package — Hermes's built-in btoa only handles Latin1
 * and corrupts percent-encoded Unicode strings.
 */
const encodeForKey = (contentId: string): string => {
  if (/[:/\\?=&]/.test(contentId)) {
    return b64encode(encodeURIComponent(contentId))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
  return contentId;
};

const decodeFromKey = (encoded: string): string => {
  if (!/[:/\\?=&]/.test(encoded) && encoded.length > 20) {
    try {
      const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = decodeURIComponent(b64decode(padded));
      if (decoded.startsWith('http')) return decoded;
    } catch {}
  }
  return encoded;
};

const queuePending = (category: string, contentId: string, count: number): void => {
  const safeId = encodeForKey(contentId);
  const compositeKey = `${category}:${safeId}`;
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

// ── Public API ───────────────────────────────────────────────────────

/**
 * Call when user plays a specific episode.
 * Increments both the series-level total AND the per-episode counter.
 */
export const recordEpisodePlay = (seriesId: string, category: string, epNumber: number, seasonNumber: number = 1): void => {
  if (!seriesId || !category) return;
  postEpisodeView(category, seriesId, epNumber, seasonNumber)
    .catch(() => {
      // fallback: at least record the series-level view
      queuePending(category, seriesId, 1);
    });
};

/**
 * Call when user presses Play on any title or episode.
 * Tries to POST immediately; on failure queues for retry.
 */
export const recordPlay = (contentId: string, category: string): void => {
  if (!contentId || !category) return;

  postViewCount(category, contentId, 1)
    .catch(() => {
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
      // compositeKey = "category:safeEncodedId"
      const colonIdx = compositeKey.indexOf(':');
      const category = compositeKey.slice(0, colonIdx);
      const safeId   = compositeKey.slice(colonIdx + 1);
      const contentId = decodeFromKey(safeId);   // restore original URL if encoded

      const count = storage.getNumber(`${PENDING_PREFIX}${compositeKey}`) ?? 0;
      if (count <= 0) return compositeKey;

      await postViewCount(category, contentId, count);
      storage.delete(`${PENDING_PREFIX}${compositeKey}`);
      return compositeKey;
    })
  );

  const sent = results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
    .map(r => r.value);
  const remaining = index.filter(k => !sent.includes(k));
  writeIndex(remaining);
};
