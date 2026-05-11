/**
 * akwamDownload.ts
 *
 * Pure HTTP resolver for go.akwam.com.co/link shorteners.
 * RN fetch auto-follows the redirect, so we land directly on the download page.
 */

const UA =
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

export async function resolveAkwamDownloadLink(shortUrl: string): Promise<string> {
  // RN fetch automatically follows the 302 redirect; we land on the download page
  const r = await fetch(shortUrl, {
    headers: {
      'User-Agent': UA,
      'Referer': 'https://akwam.com.co/',
    },
  });
  const html = await r.text();

  // Primary: <a class="link btn btn-light" href="…mp4…">
  let m = html.match(/class="[^"]*\blink\b[^"]*\bbtn\b[^"]*"[^>]*href="([^"]+\.mp4[^"]*)"/);
  if (m) return m[1];

  // Fallback: any href or src with .mp4
  m = html.match(/(?:href|src)="(https?:\/\/[^"]+\.mp4[^"]*)"/);
  if (m) return m[1];

  // Last resort: bare mp4 URL in the page
  m = html.match(/https?:\/\/[^\s"'<>]+\.mp4/);
  if (m) return m[0];

  throw new Error('Could not find mp4 URL in download page');
}