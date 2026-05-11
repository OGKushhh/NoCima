const UA = 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function extractMp4FromHtml(html: string): string | null {
  // <a class="link btn btn-light" href="...mp4">
  let m = html.match(/class="[^"]*\blink\b[^"]*\bbtn\b[^"]*"[^>]*href="([^"]+\.mp4[^"]*)"/);
  if (m) return m[1];
  // any href/src with .mp4
  m = html.match(/(?:href|src)="(https?:\/\/[^"]+\.mp4[^"]*)"/);
  if (m) return m[1];
  // bare mp4 URL
  m = html.match(/https?:\/\/[^\s"'<>]+\.mp4/);
  return m ? m[0] : null;
}

export async function resolveAkwamDownloadLink(shortUrl: string): Promise<string> {
  // 1. Follow the shortener (which may redirect to the "Click here" page)
  const r = await fetch(shortUrl, {
    headers: { 'User-Agent': UA, 'Referer': 'https://akwam.com.co/' },
  });
  const html1 = await r.text();

  // If we’re already on the download page (rare), extract immediately
  if (r.url.includes('/download/')) {
    const mp4 = extractMp4FromHtml(html1);
    if (mp4) return mp4;
    throw new Error('mp4 not found on direct download page');
  }

  // 2. Otherwise, parse the “Click here” page for the download-link
  const linkMatch = html1.match(/<a[^>]+class="download-link"[^>]+href="([^"]+)"/)
                 || html1.match(/<a[^>]+href="([^"]+)"[^>]+class="download-link"/);
  if (!linkMatch) throw new Error('download-link not found on shortener page');

  const downloadPageUrl = linkMatch[1].startsWith('http')
    ? linkMatch[1]
    : `https://akwam.com.co${linkMatch[1]}`;

  // 3. Fetch the real download page
  const r2 = await fetch(downloadPageUrl, {
    headers: { 'User-Agent': UA, 'Referer': 'https://akwam.com.co/' },
  });
  const html2 = await r2.text();
  const mp4 = extractMp4FromHtml(html2);
  if (mp4) return mp4;

  throw new Error('mp4 not found on final download page');
}