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
export type ContentCategory = 'movies' | 'dubbed-movies' | 'hindi' | 'asian-movies' | 'anime' | 'anime-movies' | 'series' | 'tvshows' | 'asian-series' | 'trending' | 'featured';

type ContentDict = Record<string, ContentItem>;

// ─── NEW: Lightweight index (all-content.json) ─────────────────────
const ALL_CONTENT_URL = `${API_BASE}/api/all-content`;

// In‑memory cache for the index (re‑used across screens)
let allContentCache: any[] | null = null;

/**
 * Fetch the lightweight content index (all-content.json).
 * Returns an array of items with fields: id, title, image, category, genres, year, last_scraped.
 */
export const getAllContentIndex = async (forceRefresh = false): Promise<any[]> => {
  if (!forceRefresh && allContentCache) return allContentCache;
  try {
    const response = await axios.get(ALL_CONTENT_URL, { timeout: 30000 });
    allContentCache = response.data;
    console.log(`[Metadata] Fetched all-content.json (${allContentCache.length} items)`);
    return allContentCache;
  } catch (error: any) {
    console.error('[Metadata] Failed to fetch all-content.json', error);
    throw new Error(`Failed to load content index: ${error.message}`);
  }
};

// ─── Core: Load a single category ───────────────────────────────────
export const loadCategory = async (
  category: ContentCategory,
  forceRefresh = false,
): Promise<ContentDict | TrendingContent | null> => {
  // 1. Return fresh cache unless forced
  if (!forceRefresh) {
    const fresh = getMetadataIfFresh(category);
    if (fresh !== null) return fresh;
  }

  // 2. Fetch from API
  const endpoint = METADATA_ENDPOINTS[category];
  if (!endpoint) {
    console.warn(`[Metadata] Unknown category: ${category}`);
    return null;
  }

  try {
    const response = await metadataApi.get(endpoint);
    let data = response.data;

    if (category !== 'trending' && category !== 'featured' && data && typeof data === 'object' && !Array.isArray(data)) {
      Object.keys(data).forEach(id => {
        if (data[id]) data[id].id = id;
      });
    }

    setMetadataWithTimestamp(category, data);
    console.log(`[Metadata] Fetched & cached: ${category}`);
    return data;
  } catch (error: any) {
    console.warn(`[Metadata] Failed to fetch ${category}: ${error.message}`);

    const stale = getMetadataAnyAge(category);
    if (stale !== null) {
      console.log(`[Metadata] Using stale cache for: ${category}`);
      return stale;
    }

    throw new Error(`Failed to load ${category}. Check your internet connection.`);
  }
};

// ─── Convenience wrappers ───────────────────────────────────────────

export const loadMovies = async (forceRefresh = false): Promise<ContentDict> => {
  const data = await loadCategory('movies', forceRefresh);
  return (data as ContentDict) || {};
};

export const loadTrending = async (forceRefresh = false): Promise<TrendingContent | null> => {
  const data = await loadCategory('trending', forceRefresh);
  return data as TrendingContent | null;
};

export const loadFeatured = async (forceRefresh = false): Promise<TrendingContent | null> => {
  const data = await loadCategory('featured', forceRefresh);
  return data as TrendingContent | null;
};

export const loadSeries = async (forceRefresh = false): Promise<ContentDict> => {
  const data = await loadCategory('series', forceRefresh);
  return (data as ContentDict) || {};
};

export const loadAnime = async (forceRefresh = false): Promise<ContentDict> => {
  const data = await loadCategory('anime', forceRefresh);
  return (data as ContentDict) || {};
};

export const loadTVShows = async (forceRefresh = false): Promise<ContentDict> => {
  const data = await loadCategory('tvshows', forceRefresh);
  return (data as ContentDict) || {};
};

// ─── Search & Filter utilities ──────────────────────────────────────

/** Search across all cached categories locally */
export const searchContent = async (query: string): Promise<ContentItem[]> => {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return [];

  const availableCategories: ContentCategory[] = ['movies', 'series', 'anime', 'tvshows', 'asian-series', 'dubbed-movies', 'hindi', 'asian-movies'];
  let allResults: ContentItem[] = [];

  for (const cat of availableCategories) {
    const data = getMetadataAnyAge(cat);
    if (!data || typeof data !== 'object') continue;
    const items = Object.values(data) as ContentItem[];
    for (const item of items) {
      const titleMatch = item.Title?.toLowerCase().includes(lowerQuery);
      const genreMatch = item.Genres?.some(g => g.toLowerCase().includes(lowerQuery));
      const countryMatch = item.Country?.toLowerCase().includes(lowerQuery);
      if (titleMatch || genreMatch || countryMatch) {
        allResults.push(item);
      }
    }
    if (allResults.length >= 50) break;
  }

  const seen = new Set<string>();
  return allResults.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

/** Search within a single dict */
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

/** Filter items by genre */
export const filterByGenre = (movies: ContentDict, genre: string): ContentItem[] => {
  const cleanGenre = genre.replace(/^[\p{Emoji}\s]+/u, '').trim();
  return Object.values(movies).filter(item => {
    return item.Genres?.some(g =>
      g.toLowerCase().includes(cleanGenre.toLowerCase())
    ) || item.GenresAr?.includes(genre);
  });
};

/** Convert dict to array (null-safe) */
export const getMoviesArray = (movies: ContentDict | null): ContentItem[] => {
  if (!movies || typeof movies !== 'object') return [];
  return Object.values(movies);
};

// ─── Auto-refresh (24hr check) ──────────────────────────────────────

export const refreshStaleCategories = async (): Promise<void> => {
  const staleCategories: ContentCategory[] = ['movies', 'trending', 'featured'];
  const toRefresh = staleCategories.filter(cat => {
    const ts = getCategoryTimestamp(cat);
    return ts === 0 || Date.now() - ts > 24 * 60 * 60 * 1000;
  });

  if (toRefresh.length === 0) {
    console.log('[Metadata] All categories fresh, no refresh needed');
    return;
  }

  console.log(`[Metadata] Refreshing stale categories: ${toRefresh.join(', ')}`);
  await Promise.allSettled(
    toRefresh.map(cat => loadCategory(cat, true))
  );
};

// ─── Settings sync ──────────────────────────────────────────────────

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
  let latest = 0;
  const categories: ContentCategory[] = ['movies', 'anime', 'series', 'tvshows', 'asian-series', 'trending', 'featured'];
  for (const cat of categories) {
    const ts = getCategoryTimestamp(cat);
    if (ts > latest) latest = ts;
  }
  return latest;
};