import axios from 'axios';
import {API_BASE, METADATA_ENDPOINTS} from '../constants/endpoints';
import {
  setMetadataWithTimestamp, getMetadataIfFresh, getMetadataAnyAge,
  getCategoryTimestamp, isAnyCategoryStale, clearAllMetadataCache,
} from '../storage/cache';
import {ContentItem, TrendingContent} from '../types';

// Axios instance for HF Spaces metadata API
const metadataApi = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// ─── Supported category types ───────────────────────────────────────
export type ContentCategory = 'movies' | 'anime' | 'series' | 'tvshows' | 'asian-series' | 'trending' | 'featured';

type ContentDict = Record<string, ContentItem>;

// ─── Core: Load a single category ───────────────────────────────────
/**
 * Load metadata for ONE category only.
 *
 * Flow:
 *  1. Check cache — if fresh (<24hr), return immediately
 *  2. Otherwise fetch from HF Spaces API  (e.g. /api/movies)
 *  3. Store on disk with timestamp in AsyncStorage
 *  4. On network error, return stale cache if available
 */
export const loadCategory = async (
  category: ContentCategory,
  forceRefresh = false,
): Promise<ContentDict | TrendingContent | null> => {
  // 1. Return fresh cache unless forced
  if (!forceRefresh) {
    const fresh = getMetadataIfFresh(category);
    if (fresh !== null) return fresh;
  }

  // 2. Fetch from HF Spaces API
  const endpoint = METADATA_ENDPOINTS[category];
  if (!endpoint) {
    console.warn(`[Metadata] Unknown category: ${category}`);
    return null;
  }

  try {
    const response = await metadataApi.get(endpoint);
    let data = response.data;

    // Normalize: for content dicts (movies, series, etc.), inject `id` into each item
    if (category !== 'trending' && category !== 'featured' && data && typeof data === 'object' && !Array.isArray(data)) {
      Object.keys(data).forEach(id => {
        if (data[id]) data[id].id = id;
      });
    }

    // 3. Store with timestamp
    setMetadataWithTimestamp(category, data);

    console.log(`[Metadata] ✅ Fetched & cached: ${category}`);
    return data;
  } catch (error: any) {
    console.warn(`[Metadata] ❌ Failed to fetch ${category}: ${error.message}`);

    // 4. Fallback: return stale cache (even if expired)
    const stale = getMetadataAnyAge(category);
    if (stale !== null) {
      console.log(`[Metadata] ⚠️ Using stale cache for: ${category}`);
      return stale;
    }

    throw new Error(`Failed to load ${category}. Check your internet connection.`);
  }
};

// ─── Convenience wrappers ───────────────────────────────────────────

/** Load movies dict */
export const loadMovies = async (forceRefresh = false): Promise<ContentDict> => {
  const data = await loadCategory('movies', forceRefresh);
  return (data as ContentDict) || {};
};

/** Load trending content */
export const loadTrending = async (forceRefresh = false): Promise<TrendingContent | null> => {
  const data = await loadCategory('trending', forceRefresh);
  return data as TrendingContent | null;
};

/** Load featured content */
export const loadFeatured = async (forceRefresh = false): Promise<TrendingContent | null> => {
  const data = await loadCategory('featured', forceRefresh);
  return data as TrendingContent | null;
};

/** Load series dict */
export const loadSeries = async (forceRefresh = false): Promise<ContentDict> => {
  const data = await loadCategory('series', forceRefresh);
  return (data as ContentDict) || {};
};

/** Load anime dict */
export const loadAnime = async (forceRefresh = false): Promise<ContentDict> => {
  const data = await loadCategory('anime', forceRefresh);
  return (data as ContentDict) || {};
};

/** Load TV shows dict */
export const loadTVShows = async (forceRefresh = false): Promise<ContentDict> => {
  const data = await loadCategory('tvshows', forceRefresh);
  return (data as ContentDict) || {};
};

// ─── Search & Filter utilities ──────────────────────────────────────

/** Search across multiple category dicts at once */
export const searchContent = async (query: string): Promise<ContentItem[]> => {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return [];

  // Search across all available categories
  const availableCategories: ContentCategory[] = ['movies', 'series', 'anime', 'tvshows', 'asian-series'];
  let allResults: ContentItem[] = [];

  // Fetch all available categories (uses cache if fresh)
  const dicts = await Promise.all(
    availableCategories.map(cat => loadCategory(cat).catch(() => null))
  );

  for (const data of dicts) {
    if (!data || typeof data !== 'object') continue;
    const items = Object.values(data) as ContentItem[];
    const matches = items.filter(item => {
      const titleMatch = item.Title?.toLowerCase().includes(lowerQuery);
      const genreMatch = item.Genres?.some(g => g.toLowerCase().includes(lowerQuery));
      const genreArMatch = item.GenresAr?.some(g => g.toLowerCase().includes(lowerQuery));
      const countryMatch = item.Country?.toLowerCase().includes(lowerQuery);
      const formatMatch = item.Format?.toLowerCase().includes(lowerQuery);
      return titleMatch || genreMatch || genreArMatch || countryMatch || formatMatch;
    });
    allResults = [...allResults, ...matches];
  }

  // Deduplicate by id
  const seen = new Set<string>();
  return allResults.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

/** Legacy: search within a single movies dict (kept for backward compat) */
export const searchContentInDict = (movies: ContentDict, query: string): ContentItem[] => {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return [];

  return Object.values(movies).filter(item => {
    const titleMatch = item.Title?.toLowerCase().includes(lowerQuery);
    const genreMatch = item.Genres?.some(g => g.toLowerCase().includes(lowerQuery));
    const genreArMatch = item.GenresAr?.some(g => g.toLowerCase().includes(lowerQuery));
    const countryMatch = item.Country?.toLowerCase().includes(lowerQuery);
    const formatMatch = item.Format?.toLowerCase().includes(lowerQuery);
    return titleMatch || genreMatch || genreArMatch || countryMatch || formatMatch;
  });
};

/** Filter items by genre (strip emoji prefix if present) */
export const filterByGenre = (movies: ContentDict, genre: string): ContentItem[] => {
  // Strip emoji prefix for matching (e.g. "💥 Action" → "Action")
  const cleanGenre = genre.replace(/^[\p{Emoji}\s]+/u, '').trim();
  return Object.values(movies).filter(item => {
    return item.Genres?.some(g =>
      g.toLowerCase().includes(cleanGenre.toLowerCase())
    ) || item.GenresAr?.includes(genre);
  });
};

/** Convert dict to array */
export const getMoviesArray = (movies: ContentDict): ContentItem[] => {
  return Object.values(movies);
};

// ─── Auto-refresh (24hr check) ──────────────────────────────────────

/**
 * Refresh all stale categories in the background.
 * Call this on app startup.
 * Only fetches categories whose cache is older than 24 hours.
 */
export const refreshStaleCategories = async (): Promise<void> => {
  const staleCategories: ContentCategory[] = ['movies', 'trending', 'featured'];

  // Check which ones are stale
  const toRefresh = staleCategories.filter(cat => {
    const ts = getCategoryTimestamp(cat);
    return ts === 0 || Date.now() - ts > 24 * 60 * 60 * 1000;
  });

  if (toRefresh.length === 0) {
    console.log('[Metadata] ✅ All categories fresh, no refresh needed');
    return;
  }

  console.log(`[Metadata] 🔄 Refreshing stale categories: ${toRefresh.join(', ')}`);

  // Fire-and-forget: fetch all stale categories in parallel
  await Promise.allSettled(
    toRefresh.map(cat => loadCategory(cat, true))
  );
};

// ─── Settings sync (kept for SettingsScreen) ────────────────────────

export const syncIfNeeded = async (): Promise<boolean> => {
  if (!isAnyCategoryStale()) return false;
  try {
    await refreshStaleCategories();
    return true;
  } catch {
    return false;
  }
};

export const getLastSyncTime = (): number => {
  // Return most recent timestamp across all categories
  let latest = 0;
  const categories: ContentCategory[] = ['movies', 'anime', 'series', 'tvshows', 'asian-series', 'trending', 'featured'];
  for (const cat of categories) {
    const ts = getCategoryTimestamp(cat);
    if (ts > latest) latest = ts;
  }
  return latest;
};
