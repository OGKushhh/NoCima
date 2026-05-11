/**
 * AkwamExtractor
 *
 * WATCH mode  — two steps:
 *   1. Native fetch resolves the go.akwam.com.co/watch shortener (one 302 redirect)
 *      to get the final akwam.com.co/watch/... URL. No HTML parsing needed.
 *   2. Hidden WebView loads that final URL. The static HTML already contains
 *      <source src="...mp4"> inside #player. Injected JS scans for it and posts
 *      the URL back. No ads, no "Click here", no redirects on this page.
 *
 * DOWNLOAD mode — pure HTTP, no WebView:
 *   1. Native fetch with redirect:'manual' on go.akwam.com.co/link shortener.
 *      Either follows the 302 Location header, or parses <a class="download-link">
 *      from the static HTML.
 *   2. Fetch that download page, regex-extract the .mp4 href from
 *      <a class="link btn ..."> or any href containing .mp4.
 *   3. Call onExtracted(mp4Url) — no WebView ever rendered.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

export type AkwamExtractMode = 'watch' | 'download';

interface Props {
  startUrl:    string;
  mode:        AkwamExtractMode;
  onExtracted: (mp4Url: string) => void;
  onError:     () => void;
  timeoutMs?:  number;
}

// ── Injected into the final watch page only ───────────────────────────────────
// The page is clean static HTML — no ads, no redirects.
// Just look for <source src="...mp4"> inside #player and post it back.
const WATCH_JS = `
(function() {
  if (window.__akwamDone) return;

  function post(url) {
    if (window.__akwamDone) return;
    window.__akwamDone = true;
    window.ReactNativeWebView.postMessage(url);
  }

  function scan() {
    // Primary: #player source
    var s = document.querySelector('#player source[src]');
    if (s && s.src && s.src.includes('.mp4')) { post(s.src); return true; }
    // Fallback: any source or video with mp4 src
    var tags = document.querySelectorAll('source[src], video[src]');
    for (var i = 0; i < tags.length; i++) {
      if (tags[i].src && tags[i].src.includes('.mp4')) { post(tags[i].src); return true; }
    }
    // Fallback: mp4 URL anywhere in the HTML
    var m = document.documentElement.innerHTML.match(/https?:\/\/[^"'\s<>]+\.mp4/);
    if (m) { post(m[0]); return true; }
    return false;
  }

  // Run immediately (source may already be in DOM)
  if (scan()) return;

  // Re-run on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function() { scan(); });

  // Poll every 200ms for dynamically inserted sources
  var attempts = 0;
  var timer = setInterval(function() {
    if (scan() || ++attempts > 25) clearInterval(timer);
  }, 200);

  // MutationObserver as extra safety net
  if (window.MutationObserver) {
    new MutationObserver(function() { if (scan()) {} })
      .observe(document.documentElement, { childList: true, subtree: true });
  }
})();
true;
`;

// ── Pure HTTP download resolution (no WebView) ────────────────────────────────
const UA = 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

async function resolveDownloadMp4(shortUrl: string): Promise<string> {
  // Step 1: resolve the shortener — may be a 302 or a "Click here" HTML page
  const r1 = await fetch(shortUrl, {
    method: 'GET',
    redirect: 'manual',
    headers: { 'User-Agent': UA },
  });

  let downloadPageUrl: string;

  if (r1.status === 301 || r1.status === 302 || r1.status === 303 || r1.status === 307 || r1.status === 308) {
    // Direct redirect — grab Location header
    const loc = r1.headers.get('location') || r1.headers.get('Location');
    if (!loc) throw new Error('redirect with no Location header');
    downloadPageUrl = loc.startsWith('http') ? loc : `https://akwam.com.co${loc}`;
  } else {
    // "Click here" static HTML page — parse <a class="download-link">
    const html = await r1.text();
    const m = html.match(/class="download-link"[^>]*href="([^"]+)"/);
    const m2 = !m && html.match(/href="([^"]+)"[^>]*class="download-link"/);
    const href = (m || m2)?.[1];
    if (!href) throw new Error('download-link not found in shortener HTML');
    downloadPageUrl = href.startsWith('http') ? href : `https://akwam.com.co${href}`;
  }

  // Step 2: fetch the download page and extract the mp4 href
  const r2 = await fetch(downloadPageUrl, {
    headers: { 'User-Agent': UA, 'Referer': 'https://akwam.com.co/' },
  });
  const html2 = await r2.text();

  // Primary: <a class="link btn ..." href="...mp4">
  const m3 = html2.match(/class="[^"]*\blink\b[^"]*btn[^"]*"[^>]*href="([^"]+\.mp4[^"]*)"/);
  if (m3) return m3[1];

  // Fallback: any href or src containing .mp4
  const m4 = html2.match(/(?:href|src)="(https?:\/\/[^"]+\.mp4[^"]*)"/);
  if (m4) return m4[1];

  // Last resort: bare mp4 URL anywhere in the page
  const m5 = html2.match(/https?:\/\/[^\s"'<>]+\.mp4/);
  if (m5) return m5[0];

  throw new Error('mp4 URL not found in download page');
}

// ── Watch: resolve shortener then load final page in WebView ─────────────────
async function resolveWatchUrl(shortUrl: string): Promise<string> {
  // go.akwam.com.co/watch/... does a simple 302 to akwam.com.co/watch/...
  // Follow it natively — avoids loading the shortener page (and its ads) in WebView
  const r = await fetch(shortUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': UA },
  });
  // After following redirects, r.url is the final URL
  return r.url;
}

// ── Component ─────────────────────────────────────────────────────────────────
const AkwamExtractor: React.FC<Props> = ({
  startUrl,
  mode,
  onExtracted,
  onError,
  timeoutMs = 30000,
}) => {
  const doneRef    = useRef(false);
  const timerRef   = useRef<ReturnType<typeof setTimeout>>();
  const [watchUrl, setWatchUrl] = useState<string | null>(null);

  const done = useCallback((mp4?: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimeout(timerRef.current);
    mp4 ? onExtracted(mp4) : onError();
  }, [onExtracted, onError]);

  useEffect(() => {
    doneRef.current = false;
    setWatchUrl(null);

    timerRef.current = setTimeout(() => {
      console.warn('[AkwamExtractor] timeout');
      done();
    }, timeoutMs);

    if (mode === 'download') {
      console.log('[Akwam] DOWNLOAD start:', startUrl);
      resolveDownloadMp4(startUrl)
        .then(mp4 => { console.log('[Akwam] DOWNLOAD success:', mp4.substring(0, 120)); done(mp4); })
        .catch(e  => { console.warn('[Akwam] DOWNLOAD failed:', e.message); done(); });

    } else {
      console.log('[Akwam] WATCH start:', startUrl);
      resolveWatchUrl(startUrl)
        .then(finalUrl => {
          console.log('[Akwam] WATCH resolved to:', finalUrl.substring(0, 120));
          if (!doneRef.current) setWatchUrl(finalUrl);
        })
        .catch(e => { console.warn('[Akwam] WATCH resolve failed:', e.message); done(); });
    }

    return () => clearTimeout(timerRef.current);
  }, [startUrl, mode]);

  const handleMessage = useCallback((event: any) => {
    const url = event.nativeEvent.data;
    console.log('[Akwam] WEBVIEW message:', url?.substring(0, 120));
    if (url && url.includes('.mp4')) {
      console.log('[Akwam] WEBVIEW got mp4:', url.substring(0, 120));
      done(url);
    }
  }, [done]);

  const handleNavRequest = useCallback((request: { url: string }) => {
    const url = request.url;
    console.log('[Akwam] WEBVIEW nav:', url?.substring(0, 120));
    if (!url) return true;
    if (url.startsWith('about:') || url.startsWith('data:')) return true;
    if (url.includes('.mp4')) { console.log('[Akwam] WEBVIEW intercepted mp4 nav'); done(url); return false; }
    const allowed = ['akwam.com.co', 'akw.cam', 'downet.net'];
    const ok = allowed.some(h => url.includes(h));
    if (!ok) console.log('[Akwam] WEBVIEW blocked:', url.substring(0, 120));
    return ok;
  }, [done]);

  // Only render WebView for watch mode and only after shortener is resolved
  if (mode !== 'watch' || !watchUrl) return null;

  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>
      <WebView
        source={{ uri: watchUrl }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        injectedJavaScriptBeforeContentLoaded={WATCH_JS}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleNavRequest}
        onError={() => done()}
        setSupportMultipleWindows={false}
        originWhitelist={['*']}
        mixedContentMode="always"
        userAgent={UA}
      />
    </View>
  );
};

export default AkwamExtractor;
