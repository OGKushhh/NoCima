import axios from 'axios';
import {API_BASE, METADATA_ENDPOINTS} from '../constants/endpoints';
import {
  setMetadataWithTimestamp, getMetadataIfFresh, getMetadataAnyAge,
  getCategoryTimestamp, isAnyCategoryStale, clearAllMetadataCache,
} from '../storage/cache';
import {ContentItem, TrendingContent} from '../types';
import {METADATA_TTL_MS} from '../constants/endpoints';

const metadataApi = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

export type ContentCategory =
  | 'movies' | 'dubbed-movies' | 'hindi' | 'asian-movies'
  | 'anime'  | 'anime-movies'  | 'series' | 'tvshows'
  | 'asian-series' | 'arabic-series' | 'trending' | 'featured';

type ContentDict = Record<string, ContentItem>;

export type BackgroundUpdateCallback = (
  category: ContentCategory,
  data: ContentDict | TrendingContent,
) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Internal: fetch from API, normalise, and write to cache
// ─────────────────────────────────────────────────────────────────────────────
const fetchAndCache = async (
  category: ContentCategory,
): Promise<ContentDict | TrendingContent | null> => {
  const endpoint = METADATA_ENDPOINTS[category];
  if (!endpoint) {
    console.warn(`[Metadata] Unknown category: ${category}`);
    return null;
  }

  const response = await metadataApi.get(endpoint);
  let data = response.data;

  // Normalise arabic-series fields → standard ContentItem fields
  if (
    category !== 'trending' &&
    category !== 'featured' &&
    data &&
    typeof data === 'object' &&
    !Array.isArray(data)
  ) {
    Object.keys(data).forEach(id => {
      if (!data[id]) return;
      data[id].id = id;

      if (category === 'arabic-series' || data[id].is_ramadan !== undefined) {
        const item = data[id];
        if (item.year && !item.Year) {
          const n = parseInt(item.year, 10);
          if (!isNaN(n) && n >= 2000 && n <= 2030) item.Year = String(n);
        }
        if (item.is_ramadan !== undefined) item.IsRamadan = !!item.is_ramadan;
        if (item.title    && !item.Title)       item.Title       = item.title;
        if (item.genres_en && !item.Genres)     item.Genres      = item.genres_en;
        if (item.genres_ar && !item.GenresAr)   item.GenresAr    = item.genres_ar;
        if (item.poster   && !item.Image)       item.Image       = item.poster;
        if (item.poster   && !item['Image Source']) item['Image Source'] = item.poster;
        if (item.rating !== undefined && !item.Rating) item.Rating = String(item.rating);
        if (item.quality  && !item.Format)      item.Format      = item.quality;
        if (item.country  && !item.Country)     item.Country     = item.country;
        if (item.episode_count !== undefined)   item.NumberOfEpisodes = item.episode_count;
        if (!item.Category) item.Category = 'arabic-series';
      }
    });
  }

  await setMetadataWithTimestamp(category, data);
  console.log(`[Metadata] Fetched & cached: ${category}`);
  return data;
};

// ─────────────────────────────────────────────────────────────────────────────
// loadCategory — stale-while-revalidate
//
// Behaviour:
//   • Cache fresh (< 24 h)   → return cache immediately, no network call.
//   • Cache stale (≥ 24 h)   → return cache immediately for instant display,
//                               kick off a background fetch, call
//                               onBackgroundUpdate(category, freshData) when done.
//   • No cache at all        → must wait for the network (first install / cleared).
//   • forceRefresh = true    → always wait for a fresh network response
//                               (pull-to-refresh path).
// ─────────────────────────────────────────────────────────────────────────────
export const loadCategory = async (
  category: ContentCategory,
  forceRefresh = false,
  onBackgroundUpdate?: BackgroundUpdateCallback,
): Promise<ContentDict | TrendingContent | null> => {

  // ── Force refresh: skip cache entirely ──────────────────────────────────
  if (forceRefresh) {
    try {
      return await fetchAndCache(category);
    } catch (error: any) {
      console.warn(`[Metadata] Force-fetch failed for ${category}: ${error.message}`);
      // Fall back to whatever is on disk
      return getMetadataAnyAge(category);
    }
  }

  // ── Check freshness ─────────────────────────────────────────────────────
  const ts      = getCategoryTimestamp(category);
  const ageMs   = ts ? Date.now() - ts : Infinity;
  const isStale = ageMs >= METADATA_TTL_MS;

  // ── Fresh cache: return immediately, no network ─────────────────────────
  if (!isStale) {
    const fresh = await getMetadataIfFresh(category);
    if (fresh !== null) return fresh;
  }

  // ── Stale or missing cache ──────────────────────────────────────────────
  const cached = await getMetadataAnyAge(category);

  if (cached !== null && onBackgroundUpdate) {
    // Return stale cache immediately so the UI renders without waiting,
    // then fetch in the background and notify caller when fresh data arrives.
    fetchAndCache(category)
      .then(fresh => {
        if (fresh) onBackgroundUpdate(category, fresh);
      })
      .catch(err => {
        console.warn(`[Metadata] Background fetch failed for ${category}: ${err.message}`);
      });
    return cached;
  }

  if (cached !== null && !onBackgroundUpdate) {
    // Caller didn't supply a callback — return stale cache and silently
    // re-fetch so next call gets fresh data (fire-and-forget).
    fetchAndCache(category).catch(() => {});
    return cached;
  }

  // ── No cache at all: must wait ───────────────────────────────────────────
  try {
    return await fetchAndCache(category);
  } catch (error: any) {
    console.warn(`[Metadata] Fetch failed for ${category}: ${error.message}`);
    throw new Error(`Failed to load ${category}. Check your internet connection.`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrappers (unchanged API)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Search & Filter utilities (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export const searchContent = async (query: string): Promise<ContentItem[]> => {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return [];

  const availableCategories: ContentCategory[] = [
    'movies', 'series', 'anime', 'tvshows', 'asian-series',
    'dubbed-movies', 'hindi', 'asian-movies',
  ];
  let allResults: ContentItem[] = [];

  for (const cat of availableCategories) {
    let data = await getMetadataAnyAge(cat);
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      try {
        data = await loadCategory(cat, false);
      } catch {
        continue;
      }
    }
    if (!data || typeof data !== 'object') continue;

    const items = Object.values(data) as ContentItem[];
    for (const item of items) {
      const titleMatch   = item.Title?.toLowerCase().includes(lowerQuery);
      const genreMatch   = item.Genres?.some(g => g.toLowerCase().includes(lowerQuery));
      const genreArMatch = item.GenresAr?.some(g => g.toLowerCase().includes(lowerQuery));
      const countryMatch = item.Country?.toLowerCase().includes(lowerQuery);
      if (titleMatch || genreMatch || genreArMatch || countryMatch) {
        allResults.push(item);
      }
    }
    if (allResults.length >= 60) break;
  }

  const seen = new Set<string>();
  return allResults.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

export const searchContentInDict = (movies: ContentDict, query: string): ContentItem[] => {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return [];

  return Object.values(movies).filter(item => {
    const titleMatch   = item.Title?.toLowerCase().includes(lowerQuery);
    const genreMatch   = item.Genres?.some(g => g.toLowerCase().includes(lowerQuery));
    const genreArMatch = item.GenresAr?.some(g => g.toLowerCase().includes(lowerQuery));
    const countryMatch = item.Country?.toLowerCase().includes(lowerQuery);
    const formatMatch  = item.Format?.toLowerCase().includes(lowerQuery);
    return titleMatch || genreMatch || genreArMatch || countryMatch || formatMatch;
  });
};

export const filterByGenre = (movies: ContentDict, genre: string): ContentItem[] => {
  const cleanGenre = genre.replace(/^[\p{Emoji}\s]+/u, '').trim();
  return Object.values(movies).filter(item =>
    item.Genres?.some(g => g.toLowerCase().includes(cleanGenre.toLowerCase())) ||
    item.GenresAr?.includes(genre),
  );
};

export const getMoviesArray = (movies: ContentDict | null): ContentItem[] => {
  if (!movies || typeof movies !== 'object') return [];
  return Object.values(movies);
};

// ─────────────────────────────────────────────────────────────────────────────
// Sync utilities (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export const SYNC_CATEGORIES: ContentCategory[] = [
  'movies', 'series', 'anime', 'tvshows', 'asian-series', 'arabic-series',
  'dubbed-movies', 'hindi', 'asian-movies', 'anime-movies',
  'trending', 'featured',
];

export interface SyncProgress {
  category: string;
  done: number;
  total: number;
  percent: number;
  fromCache: boolean;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

export const syncAllWithProgress = async (
  onProgress?: SyncProgressCallback,
  forceRefresh = false,
): Promise<void> => {
  const total = SYNC_CATEGORIES.length;
  for (let i = 0; i < SYNC_CATEGORIES.length; i++) {
    const cat = SYNC_CATEGORIES[i];
    const isStale =
      forceRefresh ||
      getCategoryTimestamp(cat) === 0 ||
      Date.now() - getCategoryTimestamp(cat) > METADATA_TTL_MS;

    onProgress?.({
      category: cat,
      done: i,
      total,
      percent: Math.round((i / total) * 100),
      fromCache: !isStale,
    });

    if (isStale) {
      try {
        await loadCategory(cat, true);
      } catch {
        // continue even if one fails
      }
    }
  }
  onProgress?.({category: 'done', done: total, total, percent: 100, fromCache: false});
};

export const refreshStaleCategories = async (
  onProgress?: SyncProgressCallback,
): Promise<void> => {
  await syncAllWithProgress(onProgress, false);
};

export const syncIfNeeded = async (
  onProgress?: SyncProgressCallback,
): Promise<boolean> => {
  if (!isAnyCategoryStale()) return false;
  try {
    await syncAllWithProgress(onProgress, false);
    return true;
  } catch {
    return false;
  }
};

export const getLastSyncTime = (): number => {
  let latest = 0;
  const categories: ContentCategory[] = [
    'movies', 'anime', 'series', 'tvshows', 'asian-series', 'trending', 'featured',
  ];
  for (const cat of categories) {
    const ts = getCategoryTimestamp(cat);
    if (ts > latest) latest = ts;
  }
  return latest;
};
