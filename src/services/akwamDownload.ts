/**
 * akwamDownload.ts
 *
 * Pure HTTP resolver for go.akwam.com.co/link shorteners.
 * Returns the direct .mp4 download URL.
 */

const UA =
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

export async function resolveAkwamDownloadLink(
  shortUrl: string,
): Promise<string> {
  // Step 1 – resolve shortener (redirect or "Click here" page)
  const r1 = await fetch(shortUrl, {
    method: 'GET',
    redirect: 'manual',
    headers: {'User-Agent': UA},
  });

  let downloadPageUrl: string;

  if (r1.status >= 300 && r1.status < 400) {
    const loc = r1.headers.get('location') || r1.headers.get('Location');
    if (!loc) throw new Error('Redirect with no Location header');
    downloadPageUrl = loc.startsWith('http') ? loc : `https://akwam.com.co${loc}`;
  } else {
    const html = await r1.text();
    const match =
      html.match(/class="download-link"[^>]*href="([^"]+)"/) ||
      html.match(/href="([^"]+)"[^>]*class="download-link"/);
    if (!match) throw new Error('download-link not found in shortener page');
    downloadPageUrl = match[1].startsWith('http')
      ? match[1]
      : `https://akwam.com.co${match[1]}`;
  }

  // Step 2 – fetch download page and extract mp4
  const r2 = await fetch(downloadPageUrl, {
    headers: {'User-Agent': UA, 'Referer': 'https://akwam.com.co/'},
  });
  const html = await r2.text();

  // Primary: <a class="link btn btn-light" href="…mp4…">
  let m = html.match(
    /class="[^"]*\blink\b[^"]*\bbtn\b[^"]*"[^>]*href="([^"]+\.mp4[^"]*)"/,
  );
  if (m) return m[1];

  // Fallback: any href or src containing .mp4
  m = html.match(/(?:href|src)="(https?:\/\/[^"]+\.mp4[^"]*)"/);
  if (m) return m[1];

  // Last resort: bare mp4 URL
  m = html.match(/https?:\/\/[^\s"'<>]+\.mp4/);
  if (m) return m[0];

  throw new Error('Could not find mp4 URL in download page');
}