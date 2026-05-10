import axios from 'axios';
import {API_BASE, METADATA_ENDPOINTS} from '../constants/endpoints';
import {
  setMetadataWithTimestamp, getMetadataIfFresh, getMetadataAnyAge,
  getCategoryTimestamp, isAnyCategoryStale, clearAllMetadataCache,
} from '../storage/cache';
import {ContentItem, TrendingContent} from '../types';

const metadataApi = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

export type ContentCategory = 'movies' | 'dubbed-movies' | 'hindi' | 'asian-movies' | 'anime' | 'anime-movies' | 'series' | 'tvshows' | 'asian-series' | 'trending' | 'featured';

type ContentDict = Record<string, ContentItem>;

// ─── Core: Load a single category ─────────────────────────────────
export const loadCategory = async (
  category: ContentCategory,
  forceRefresh = false,
): Promise<ContentDict | TrendingContent | null> => {
  // 1. Return fresh cache unless forced
  if (!forceRefresh) {
    const fresh = await getMetadataIfFresh(category);
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
        if (!data[id]) return;
        data[id].id = id;
        // ── Normalize arabic-series lowercase fields → standard ContentItem fields ──
        if (category === 'arabic-series' || data[id].is_ramadan !== undefined) {
          const item = data[id];
          // year → Year (validate it's a real year)
          if (item.year && !item.Year) {
            const n = parseInt(item.year, 10);
            if (!isNaN(n) && n >= 2000 && n <= 2030) item.Year = String(n);
          }
          // is_ramadan → IsRamadan
          if (item.is_ramadan !== undefined) item.IsRamadan = !!item.is_ramadan;
          // title → Title
          if (item.title && !item.Title) item.Title = item.title;
          // genres_en → Genres
          if (item.genres_en && !item.Genres) item.Genres = item.genres_en;
          // genres_ar → GenresAr
          if (item.genres_ar && !item.GenresAr) item.GenresAr = item.genres_ar;
          // poster → Image (for card rendering)
          if (item.poster && !item.Image) item.Image = item.poster;
          // country → Country
          if (item.country && !item.Country) item.Country = item.country;
          // episode_count → NumberOfEpisodes
          if (item.episode_count !== undefined) item.NumberOfEpisodes = item.episode_count;
          // Normalize Category
          if (!item.Category) item.Category = 'arabic-series';
        }
      });
    }

    await setMetadataWithTimestamp(category, data);
    console.log(`[Metadata] Fetched & cached: ${category}`);
    return data;
  } catch (error: any) {
    console.warn(`[Metadata] Failed to fetch ${category}: ${error.message}`);

    const stale = await getMetadataAnyAge(category);
    if (stale !== null) {
      console.log(`[Metadata] Using stale cache for: ${category}`);
      return stale;
    }

    throw new Error(`Failed to load ${category}. Check your internet connection.`);
  }
};

// ─── Convenience wrappers ─────────────────────────────────────────

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

/** Search across all categories — uses disk cache if available, fetches if not */
export const searchContent = async (query: string): Promise<ContentItem[]> => {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return [];

  const availableCategories: ContentCategory[] = ['movies', 'series', 'anime', 'tvshows', 'asian-series', 'dubbed-movies', 'hindi', 'asian-movies'];
  let allResults: ContentItem[] = [];

  for (const cat of availableCategories) {
    // Try disk cache first; if empty, fetch from API so search always works
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
      const titleMatch = item.Title?.toLowerCase().includes(lowerQuery);
      const genreMatch = item.Genres?.some(g => g.toLowerCase().includes(lowerQuery));
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

// ─── All syncable categories in order ────────────────────────────────────────
export const SYNC_CATEGORIES: ContentCategory[] = [
  'movies', 'series', 'anime', 'tvshows', 'asian-series', 'arabic-series',
  'dubbed-movies', 'hindi', 'asian-movies', 'anime-movies',
  'trending', 'featured',
];

export interface SyncProgress {
  category: string;          // current category being fetched
  done: number;              // how many finished
  total: number;             // total to fetch
  percent: number;           // 0-100
  fromCache: boolean;        // true if this category was already fresh (skipped)
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

// ─── Full sync all categories with progress ───────────────────────────────────
/**
 * Syncs all stale categories one by one (sequential so progress is meaningful).
 * Calls onProgress after each category completes.
 * Pass forceRefresh=true to re-fetch everything regardless of cache age.
 */
export const syncAllWithProgress = async (
  onProgress?: SyncProgressCallback,
  forceRefresh = false,
): Promise<void> => {
  const total = SYNC_CATEGORIES.length;
  for (let i = 0; i < SYNC_CATEGORIES.length; i++) {
    const cat = SYNC_CATEGORIES[i];
    const isStale = forceRefresh || getCategoryTimestamp(cat) === 0 ||
      Date.now() - getCategoryTimestamp(cat) > 24 * 60 * 60 * 1000;

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
  // Final 100%
  onProgress?.({
    category: 'done',
    done: total,
    total,
    percent: 100,
    fromCache: false,
  });
};

// ─── Auto-refresh (24hr check) ───────────────────────────────────────────────
export const refreshStaleCategories = async (
  onProgress?: SyncProgressCallback,
): Promise<void> => {
  await syncAllWithProgress(onProgress, false);
};

// ─── Settings sync ───────────────────────────────────────────────────────────
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
  const categories: ContentCategory[] = ['movies', 'anime', 'series', 'tvshows', 'asian-series', 'trending', 'featured'];
  for (const cat of categories) {
    const ts = getCategoryTimestamp(cat);
    if (ts > latest) latest = ts;
  }
  return latest;
};