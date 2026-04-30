import axios from 'axios';
import {API_BASE} from '../constants/endpoints';
import {getVideoUrlCache, setVideoUrlCache} from '../storage/cache';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000, // 120s — Playwright extraction + HF Spaces cold start
});

export const extractVideoUrl = async (pageUrl: string): Promise<{video_url: string; quality_options: string[]}> => {
  // 1. Check local 6h cache first
  const cached = getVideoUrlCache(pageUrl);
  if (cached) {
    console.log('[API] Cache hit for:', pageUrl);
    return {video_url: cached.url, quality_options: cached.qualities};
  }

  try {
    // 2. Call backend /extract
    const response = await api.post('/extract', {url: pageUrl});
    const data = response.data;

    // Backend returns stream_url (not video_url)
    const streamUrl = data.stream_url || data.video_url;
    if (!streamUrl) {
      throw new Error(data.error || 'No video stream returned from server');
    }

    // Determine available qualities from m3u8 URL
    const qualities: string[] = streamUrl.includes('master')
      ? ['1080p', '720p', '480p', '360p']
      : ['Auto'];

    // 3. Cache with 6h TTL
    setVideoUrlCache(pageUrl, streamUrl, qualities);
    console.log('[API] Extracted & cached:', streamUrl.substring(0, 60) + '...');

    return {video_url: streamUrl, quality_options: qualities};
  } catch (error: any) {
    const msg = error.response?.data?.error || error.message || 'Failed to extract video';
    console.error('[API] Extract error:', msg);
    throw new Error(msg);
  }
};

export const refreshVideoUrl = async (pageUrl: string) => {
  // Bypass server cache by adding cache-bust query param
  const bustUrl = `${pageUrl}${pageUrl.includes('?') ? '&' : '?'}_r=${Date.now()}`;
  return extractVideoUrl(bustUrl);
};

export const checkApiHealth = async (): Promise<boolean> => {
  try {
    const response = await api.get('/health', {timeout: 10000});
    return response.data?.status === 'healthy';
  } catch {
    return false;
  }
};
