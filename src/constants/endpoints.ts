// HF Spaces API
export const API_BASE = 'https://ogkushhh-abdobest.hf.space';

// ── Akwam domains ─────────────────────────────────────────────────────────
// Update these when akwam changes their domain – everything else auto-follows.
export const AKWAM_BASE_DOMAIN   = 'akwam.it';           // main site
export const AKWAM_BASE_URL      = `https://${AKWAM_BASE_DOMAIN}`;
export const AKWAM_GO_DOMAIN     = 'go.akwam.it';        // shortener / watch links
export const AKWAM_GO_URL        = `https://${AKWAM_GO_DOMAIN}`;
export const AKWAM_REFERER       = `${AKWAM_BASE_URL}/`;
// Legacy domains kept for URL-rewriting (links already saved in DB use these)
export const AKWAM_LEGACY_DOMAINS = [
  'akwam.com.co',
  'go.akwam.com.co',
  'akw.cam',
] as const;
// ──────────────────────────────────────────────────────────────────────────

/**
 * Rewrites any stored akwam URL (old domains) to the current live domain.
 * Safe to call even if the URL is already on the new domain or is empty.
 *
 * Examples:
 *   go.akwam.com.co/watch/12345  →  go.akwam.it/watch/12345
 *   akwam.com.co/watch/12345     →  akwam.it/watch/12345
 *   akw.cam/watch/12345          →  akwam.it/watch/12345   (akw.cam = shortener alias)
 */
export function normalizeAkwamUrl(url: string): string {
  if (!url) return url;
  let normalized = url;
  for (const legacy of AKWAM_LEGACY_DOMAINS) {
    if (normalized.includes(legacy)) {
      const replacement = legacy.startsWith('go.') ? AKWAM_GO_DOMAIN : AKWAM_BASE_DOMAIN;
      normalized = normalized.replace(legacy, replacement);
      break;
    }
  }
  return normalized;
}

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
  'arabic-series': '/api/arabic-series',
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
export const APP_VERSION = '1.1.1';

// Cache durations
export const METADATA_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const VIDEO_URL_TTL_MS = 6 * 60 * 60 * 1000;  // 6 hours
