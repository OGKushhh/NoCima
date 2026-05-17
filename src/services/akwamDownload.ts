import {AKWAM_BASE_URL, AKWAM_REFERER, normalizeAkwamUrl} from '../constants/endpoints';

const UA = 'Mozilla/5.0 …';

function extractMp4(html: string): string | null {
  let m = html.match(/class="[^"]*\blink\b[^"]*\bbtn\b[^"]*"[^>]*href="([^"]+\.mp4[^"]*)"/);
  if (m) return m[1];
  m = html.match(/(?:href|src)="(https?:\/\/[^"]+\.mp4[^"]*)"/);
  if (m) return m[1];
  m = html.match(/https?:\/\/[^\s"'<>]+\.mp4/);
  return m ? m[0] : null;
}

export async function resolveAkwamDownloadLink(shortUrl: string): Promise<string> {
  // 1. Fetch the shortener (may be a "Click here" page) – normalize old domains first
  const r = await fetch(normalizeAkwamUrl(shortUrl), {
    headers: { 'User-Agent': UA, 'Referer': AKWAM_REFERER },
  });
  const html = await r.text();

  // If we're already on a download page, extract immediately
  if (r.url.includes('/download/')) {
    const mp4 = extractMp4(html);
    if (mp4) return mp4;
    throw new Error('mp4 not found on direct download page');
  }

  // 2. Parse the "Click here" page for the real download URL
  const m = html.match(/<a[^>]+class="download-link"[^>]+href="([^"]+)"/)
         || html.match(/<a[^>]+href="([^"]+)"[^>]+class="download-link"/);
  if (!m) throw new Error('download-link not found in shortener page');

  const downloadPageUrl = m[1].startsWith('http') ? m[1] : `${AKWAM_BASE_URL}${m[1]}`;

  // 3. Fetch the real download page and extract the .mp4
  const r2 = await fetch(downloadPageUrl, {
    headers: { 'User-Agent': UA, 'Referer': AKWAM_REFERER },
  });
  const html2 = await r2.text();
  const mp4 = extractMp4(html2);
  if (mp4) return mp4;
  throw new Error('mp4 not found on final download page');
}