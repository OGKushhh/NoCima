import axios from 'axios';
import * as cheerio from 'cheerio-without-native';

const BASE_URL = 'https://www.fasel-hd.cam';
let globalCookies = '';

export const setCookies = (cookieString) => {
  globalCookies = cookieString;
  console.log('✅ Cookies set:', cookieString.substring(0, 100));
};

const getHeaders = () => ({
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
  'Cookie': globalCookies,
  'Referer': BASE_URL,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
});

const fetchHTML = async (path) => {
  try {
    const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
    console.log('Fetching:', url);
    const response = await axios.get(url, { headers: getHeaders(), timeout: 15000 });
    return response.data;
  } catch (e) {
    console.error('Fetch error:', e.message);
    return null;
  }
};

export const scrapeHome = async () => {
  const html = await fetchHTML('/main');
  if (!html) return { movies: [], episodes: [] };
  const $ = cheerio.load(html);
  const movies = [], episodes = [];

  // Movies (latest movies grid)
  $('.blockMovie').each((i, el) => {
    const link = $(el).find('a').first().attr('href');
    const title = $(el).find('.h5').text().trim();
    const img = $(el).find('img').first().attr('data-src') || $(el).find('img').first().attr('src');
    if (link && title) {
      movies.push({
        id: link,
        title,
        poster: img?.startsWith('http') ? img : `${BASE_URL}${img}`,
        type: 'movie'
      });
    }
  });

  // Episodes (latest episodes)
  $('.epDivHome').each((i, el) => {
    const link = $(el).find('a').first().attr('href');
    const title = $(el).find('.h4').text().trim();
    const img = $(el).find('.epHomeImg img').first().attr('data-src') || $(el).find('.epHomeImg img').first().attr('src');
    if (link && title) {
      episodes.push({
        id: link,
        title,
        poster: img?.startsWith('http') ? img : `${BASE_URL}${img}`,
        type: 'series'
      });
    }
  });

  return { movies, episodes };
};

export const search = async (query) => {
  // Correct search endpoint
  const html = await fetchHTML(`/?s=${encodeURIComponent(query)}`);
  if (!html) return [];
  const $ = cheerio.load(html);
  const results = [];
  $('.blockMovie').each((i, el) => {
    const link = $(el).find('a').first().attr('href');
    const title = $(el).find('.h5').text().trim();
    const img = $(el).find('img').first().attr('data-src') || $(el).find('img').first().attr('src');
    if (link && title) {
      results.push({
        id: link,
        title,
        poster: img?.startsWith('http') ? img : `${BASE_URL}${img}`,
        type: 'movie'
      });
    }
  });
  return results;
};

export const getDetails = async (url) => {
  const html = await fetchHTML(url);
  if (!html) return null;
  const $ = cheerio.load(html);

  const title = $('h1').text().trim() || $('.h1').text().trim();
  const poster = $('.poster-img img').attr('src') || $('img[itemprop="image"]').attr('src') || '';
  const desc = $('.story, .overview, .description').text().trim();

  const sources = [];

  // Direct video links (MP4, M3U8)
  $('a').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && (href.includes('.mp4') || href.includes('.m3u8') || href.includes('download') || href.includes('dl='))) {
      let quality = '';
      if (text.includes('1080')) quality = '1080p';
      else if (text.includes('720')) quality = '720p';
      else if (text.includes('480')) quality = '480p';
      else quality = 'Direct';
      sources.push({
        url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
        label: quality,
        type: 'direct'
      });
    }
  });

  // Iframe servers (fallback)
  $('.server-list a, iframe, .download-links a').each((i, el) => {
    const src = $(el).attr('data-link') || $(el).attr('src') || $(el).attr('href');
    if (src && !src.includes('.mp4') && !src.includes('.m3u8') && src.startsWith('http')) {
      sources.push({
        url: src,
        label: `Server ${i + 1}`,
        type: 'iframe'
      });
    }
  });

  // Remove duplicates by URL
  const unique = {};
  const finalSources = [];
  for (const src of sources) {
    if (!unique[src.url]) {
      unique[src.url] = true;
      finalSources.push(src);
    }
  }

  return { title, poster, desc, sources: finalSources };
};