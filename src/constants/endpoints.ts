// HF Spaces API
export const API_BASE = 'https://ogkushhh-abdobest.hf.space';

// Metadata API endpoints (served by HF Spaces)
export const METADATA_ENDPOINTS: Record<string, string> = {
  movies: '/api/movies',
  'dubbed-movies': '/api/dubbed-movies',
  hindi: '/api/hindi',
  'asian-movies': '/api/asian-movies',
  anime: '/api/anime',
  'anime-movies': '/api/anime-movies',
  series: '/api/series',
  tvshows: '/api/tvshows',
  'asian-series': '/api/asian-series',
  trending: '/api/trending',
  featured: '/api/featured',
};

// Dynamic API endpoints
export const API_ENDPOINTS = {
  /** Episode list for a series/tvshow/asian-series: /api/episodes/{category}/{id} */
  episodes: (category: string, id: string) => `/api/episodes/${category}/${id}`,
  /** Server-side search: /api/search?q=... */
  search: (query: string) => `/api/search?q=${encodeURIComponent(query)}`,
  /** Server health check */
  health: '/health',
  /** Video URL extraction (POST) */
  extract: '/extract',
};

// GitHub OTA Update
export const GITHUB_APP_REPO = 'OGKushhh/AbdoBest';
export const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_APP_REPO}/releases/latest`;

// Current app version
export const APP_VERSION = '1.0.0';

// Cache durations
export const METADATA_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const VIDEO_URL_TTL_MS = 6 * 60 * 60 * 1000;  // 6 hours
