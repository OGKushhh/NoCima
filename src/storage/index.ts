import {storage} from './Storage';

export {storage};

// ─── Storage Keys ───────────────────────────────────────────────────
export const storageKeys = {
  LANGUAGE: 'user_language',
  THEME: 'user_theme',
  SETTINGS: 'user_settings',
  VIDEO_URL_CACHE: 'video_url_cache_',
  DOWNLOADS_LIST: 'downloads_list',
  SKIPPED_UPDATE_VERSION: 'skipped_update_version',

  // Per-category metadata data blobs
  METADATA_MOVIES: 'metadata_movies',
  METADATA_ANIME: 'metadata_anime',
  METADATA_SERIES: 'metadata_series',
  METADATA_TVSHOWS: 'metadata_tvshows',
  METADATA_ASIAN_SERIES: 'metadata_asian_series',
  METADATA_TRENDING: 'metadata_trending',
  METADATA_FEATURED: 'metadata_featured',
  METADATA_DUBBED_MOVIES: 'metadata_dubbed_movies',
  METADATA_HINDI: 'metadata_hindi',
  METADATA_ASIAN_MOVIES: 'metadata_asian_movies',
  METADATA_ANIME_MOVIES: 'metadata_anime_movies',

  // Per-category timestamps (when last fetched)
  META_TS_MOVIES: 'meta_ts_movies',
  META_TS_ANIME: 'meta_ts_anime',
  META_TS_SERIES: 'meta_ts_series',
  META_TS_TVSHOWS: 'meta_ts_tvshows',
  META_TS_ASIAN_SERIES: 'meta_ts_asian_series',
  META_TS_TRENDING: 'meta_ts_trending',
  META_TS_FEATURED: 'meta_ts_featured',
  META_TS_DUBBED_MOVIES: 'meta_ts_dubbed_movies',
  META_TS_HINDI: 'meta_ts_hindi',
  META_TS_ASIAN_MOVIES: 'meta_ts_asian_movies',
  META_TS_ANIME_MOVIES: 'meta_ts_anime_movies',
};

// Map category name → storage key pair
export const CATEGORY_KEYS: Record<string, {data: string; timestamp: string}> = {
  movies: {data: storageKeys.METADATA_MOVIES, timestamp: storageKeys.META_TS_MOVIES},
  anime: {data: storageKeys.METADATA_ANIME, timestamp: storageKeys.META_TS_ANIME},
  series: {data: storageKeys.METADATA_SERIES, timestamp: storageKeys.META_TS_SERIES},
  tvshows: {data: storageKeys.METADATA_TVSHOWS, timestamp: storageKeys.META_TS_TVSHOWS},
  'asian-series': {data: storageKeys.METADATA_ASIAN_SERIES, timestamp: storageKeys.META_TS_ASIAN_SERIES},
  trending: {data: storageKeys.METADATA_TRENDING, timestamp: storageKeys.META_TS_TRENDING},
  featured: {data: storageKeys.METADATA_FEATURED, timestamp: storageKeys.META_TS_FEATURED},
  'dubbed-movies': {data: storageKeys.METADATA_DUBBED_MOVIES, timestamp: storageKeys.META_TS_DUBBED_MOVIES},
  hindi: {data: storageKeys.METADATA_HINDI, timestamp: storageKeys.META_TS_HINDI},
  'asian-movies': {data: storageKeys.METADATA_ASIAN_MOVIES, timestamp: storageKeys.META_TS_ASIAN_MOVIES},
  'anime-movies': {data: storageKeys.METADATA_ANIME_MOVIES, timestamp: storageKeys.META_TS_ANIME_MOVIES},
};

// ─── User Settings ──────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  language: 'ar',
  defaultQuality: '1080p',
  mobileDataWarning: true,
  autoPlay: false,
  showArabicTitles: true,
  darkMode: true,
  qualityPreference: 'auto',
  subtitleEnabled: false,
};

export const getSettings = (): any => {
  const raw = storage.getString(storageKeys.SETTINGS);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return {...DEFAULT_SETTINGS, ...parsed};
    } catch {
      return DEFAULT_SETTINGS;
    }
  }
  return DEFAULT_SETTINGS;
};

export const saveSettings = (settings: any) => {
  storage.set(storageKeys.SETTINGS, JSON.stringify(settings));
};
