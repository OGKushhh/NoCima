/**
 * API service for AbdoBest
 *
 * /extract endpoint:
 *   POST { url: pageUrl }
 *   Response: { stream_url, quality_options, cached }
 *
 * /api/view/:category/:id:
 *   GET  → { views }
 *   POST { increment_by } → { views }
 */

import axios from 'axios';
import {API_BASE} from '../constants/endpoints';
import {getVideoUrlCache, setVideoUrlCache} from '../storage/cache';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000, // 2min — Playwright extraction + HF Spaces cold start
});

export interface ExtractResult {
  video_url: string;       // normalised from stream_url
  quality_options: string[];
  cached: boolean;
}

/**
 * Extract a playable stream URL for a given page URL.
 *
 * Cache layer (6 h):
 *  1. Local MMKV cache → instant, no network
 *  2. Backend /extract → may trigger Playwright scraping (slow first run)
 *     Backend itself also caches and returns `cached: true` on hits.
 */
export const extractVideoUrl = async (pageUrl: string): Promise<ExtractResult> => {
  if (!pageUrl || !pageUrl.startsWith('http')) {
    throw new Error('Invalid or missing source URL for extraction');
  }

  // 1. Local 6-hour cache
  const localHit = getVideoUrlCache(pageUrl);
  if (localHit) {
    console.log('[API] Local cache hit');
    return {video_url: localHit.url, quality_options: localHit.qualities, cached: true};
  }

  // 2. Call backend /extract
  console.log('[API] Calling /extract for:', pageUrl.substring(0, 80));
  const response = await api.post('/extract', {url: pageUrl});
  const data = response.data;

  const streamUrl: string = data.stream_url || data.video_url || '';
  if (!streamUrl) {
    throw new Error(data.error || 'Server returned no stream URL');
  }

  // Use quality_options from server if provided, else derive from URL
  const qualities: string[] =
    data.quality_options?.length
      ? data.quality_options
      : streamUrl.toLowerCase().includes('master')
      ? ['Auto', '1080p', '720p', '480p', '360p']
      : ['Auto'];

  // 3. Store locally
  setVideoUrlCache(pageUrl, streamUrl, qualities);

  return {video_url: streamUrl, quality_options: qualities, cached: data.cached ?? false};
};

export const refreshVideoUrl = async (pageUrl: string): Promise<ExtractResult> => {
  // Delete local cache entry so we force a fresh /extract call
  // (we can't call storage.delete here directly but we can pass a busted key)
  const bustUrl = `${pageUrl}${pageUrl.includes('?') ? '&' : '?'}_nc=${Date.now()}`;
  return extractVideoUrl(bustUrl);
};

export const checkApiHealth = async (): Promise<boolean> => {
  try {
    const r = await api.get('/health', {timeout: 10000});
    return r.data?.status === 'healthy';
  } catch {
    return false;
  }
};

// ─── View counter endpoints ─────────────────────────────────────────

export const postViewCount = async (
  category: string,
  contentId: string,
  incrementBy = 1,
): Promise<number> => {
  const r = await api.post(`/api/view/${category}/${contentId}`, {increment_by: incrementBy});
  return r.data?.views ?? 0;
};

export const getViewCount = async (
  category: string,
  contentId: string,
): Promise<number> => {
  const r = await api.get(`/api/view/${category}/${contentId}`);
  return r.data?.views ?? 0;
};

/**
 * Fetch global top-viewed items for a category.
 * The backend stores flat counts: { "category:id": N }
 * We GET /api/view/<category>/<id> for each, so instead we use
 * the search endpoint to get items, then sort by views from storage.
 *
 * Practical shortcut: load a category dict from metadata and sort
 * by the `Views` field already embedded in each item.
 */
export const fetchTopViewed = async (
  category: string,
  ids: string[],
  limit = 20,
): Promise<Array<{id: string; category: string; views: number}>> => {
  if (!ids.length) return [];
  // Fetch view counts in parallel (batch, max 20)
  const sample = ids.slice(0, Math.min(ids.length, 40));
  const results = await Promise.allSettled(
    sample.map(id => getViewCount(category, id).then(v => ({id, category, views: v})))
  );
  return results
    .filter((r): r is PromiseFulfilledResult<{id: string; category: string; views: number}> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter(r => r.views > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
};
