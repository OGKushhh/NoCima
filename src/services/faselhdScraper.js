import axios from 'axios';
import cheerio from 'cheerio';

const BASE_URL = 'https://www.fasel-hd.cam';
let globalCookies = '';

export const setCookies = (cookieString) => {
  globalCookies = cookieString;
  console.log('✅ Cookies set');
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

// Scrape homepage (latest movies)
export const scrapeHome = async () => {
  const html = await fetchHTML('/main');
  if (!html) return { movies: [], episodes: [] };
  const $ = cheerio.load(html);
  const movies = [];
  const episodes = [];

  $('.blockMovie').each((i, el) => {
    const link = $(el).find('a').first().attr('href');
    const title = $(el).find('.h5').text().trim();
    const img = $(el).find('img').first();
    const poster = img.attr('data-src') || img.attr('src');
    const category = $(el).find('.bCat').text().trim();
    const quality = $(el).find('.quality').text().trim();
    const viewsText = $(el).find('.bviews').text().trim();
    const views = viewsText.replace(/[^0-9]/g, '');

    if (link && title) {
      movies.push({
        id: link,
        title,
        poster: poster?.startsWith('http') ? poster : `${BASE_URL}${poster}`,
        category,
        quality,
        views,
        type: 'movie'
      });
    }
  });

  // Latest episodes (if any – you can keep your existing .epDivHome logic later)
  // For now, we return only movies
  return { movies, episodes };
};

// Search
export const search = async (query) => {
  const html = await fetchHTML(`/?s=${encodeURIComponent(query)}`);
  if (!html) return [];
  const $ = cheerio.load(html);
  const results = [];
  $('.blockMovie').each((i, el) => {
    const link = $(el).find('a').first().attr('href');
    const title = $(el).find('.h5').text().trim();
    const img = $(el).find('img').first();
    const poster = img.attr('data-src') || img.attr('src');
    if (link && title) {
      results.push({
        id: link,
        title,
        poster: poster?.startsWith('http') ? poster : `${BASE_URL}${poster}`,
        type: 'movie'
      });
    }
  });
  return results;
};

// Get details from a movie/series page (including video sources)
export const getDetails = async (url) => {
  const html = await fetchHTML(url);
  if (!html) return null;
  const $ = cheerio.load(html);

  const title = $('h1').text().trim() || $('.h1').text().trim();
  const poster = $('.posterImg img').attr('src') || '';
  const desc = $('.story, .overview, .description').text().trim();

  const sources = [];

  // 1. Look for direct download links (usually inside .download-links or similar)
  $('.download-links a, a[href*=".mp4"], a[href*=".m3u8"]').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && (href.includes('.mp4') || href.includes('.m3u8') || href.includes('download'))) {
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

  // 2. Fallback: iframes (embedded players)
  if (sources.length === 0) {
    $('iframe').each((i, el) => {
      const src = $(el).attr('src');
      if (src && src.startsWith('http')) {
        sources.push({
          url: src,
          label: `Server ${i + 1}`,
          type: 'iframe'
        });
      }
    });
  }

  return { title, poster, desc, sources };
};