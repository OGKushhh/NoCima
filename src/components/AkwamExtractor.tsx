/**
 * AkwamExtractor
 *
 * WATCH mode:
 *   1. Native fetch resolves go.akwam.com.co/watch → parses HTML for the real
 *      akwam.com.co/watch/... link (no 302 redirect – static page).
 *   2. Hidden WebView loads that real watch URL. The static HTML contains
 *      <source src="...mp4"> inside #player.
 *   3. Injected JS scans for the source and posts the mp4 URL back.
 *   4. A native fetch fallback runs after 10s to catch slow pages.
 *
 * DOWNLOAD mode: same resolution logic, but then pure HTTP extraction (no WebView).
 */

import React, {useRef, useEffect, useCallback, useState} from 'react';
import {View} from 'react-native';
import {WebView} from 'react-native-webview';

export type AkwamExtractMode = 'watch' | 'download';

interface Props {
  startUrl: string;
  mode: AkwamExtractMode;
  onExtracted: (mp4Url: string) => void;
  onError: () => void;
  timeoutMs?: number;
}

const UA =
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// ── Extract an mp4 URL from HTML ──────────────────────────────────────────────
function extractMp4(html: string): string | null {
  // <source src="...mp4">
  const m1 = html.match(/<source[^>]*src="([^"]+\.mp4[^"]*)"/i);
  if (m1) return m1[1];
  // <a class="link btn" href="...mp4">
  const m2 = html.match(/class="[^"]*\blink\b[^"]*\bbtn\b[^"]*"[^>]*href="([^"]+\.mp4[^"]*)"/i);
  if (m2) return m2[1];
  // <a href="...mp4" download>
  const m3 = html.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"[^>]*download/i);
  if (m3) return m3[1];
  // any href/src with .mp4
  const m4 = html.match(/(?:href|src)="(https?:\/\/[^"]+\.mp4[^"]*)"/i);
  if (m4) return m4[1];
  // bare mp4 url
  const m5 = html.match(/https?:\/\/[^\s"'<>]+\.mp4/i);
  if (m5) return m5[0];
  return null;
}

// ── Resolve a go.akwam.com.co shortener → final watch/download page URL ────────
async function resolveShortener(shortUrl: string, type: 'watch' | 'download'): Promise<string> {
  console.log(`[Akwam] resolving ${type} shortener:`, shortUrl);
  const resp = await fetch(shortUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {'User-Agent': UA},
  });
  const html = await resp.text();

  // If the final URL is already the target page (rare), return it directly
  if (resp.url.includes(`/${type}/`)) {
    return resp.url;
  }

  // The shortener shows a static "Click here" page – parse the download-link
  const match = html.match(/<a\s[^>]*class="download-link"[^>]*href="([^"]+)"/) ||
                html.match(/<a\s[^>]*href="([^"]+)"[^>]*class="download-link"/);
  if (match) {
    const href = match[1];
    const finalUrl = href.startsWith('http') ? href : `https://akwam.com.co${href}`;
    console.log(`[Akwam] resolved ${type} to:`, finalUrl.substring(0, 80));
    return finalUrl;
  }

  throw new Error(`download-link not found (page length: ${html.length})`);
}

// ── Injected JS for the final watch page ──────────────────────────────────────
const WATCH_JS = `
(function() {
  if (window.__akwamDone) return false;
  window.__akwamDone = false;

  function post(url) {
    if (window.__akwamDone) return;
    window.__akwamDone = true;
    window.ReactNativeWebView.postMessage(url);
  }

  function log(msg) {
    try { window.ReactNativeWebView.postMessage('[AKWAM_LOG] ' + msg); } catch(e) {}
  }

  function scan() {
    // 1. #player source
    var s = document.querySelector('#player source[src]');
    if (s && s.src && s.src.includes('.mp4')) { post(s.src); return true; }
    // 2. any source or video
    var tags = document.querySelectorAll('source[src], video[src]');
    for (var i = 0; i < tags.length; i++) {
      if (tags[i].src && tags[i].src.includes('.mp4')) { post(tags[i].src); return true; }
    }
    // 3. regex fallback
    var m = document.documentElement.innerHTML.match(/https?:\\/\\/[^"\\'\\s<>]+\\.mp4/);
    if (m) { post(m[0]); return true; }
    return false;
  }

  // Scan immediately and every 50ms (up to 5 seconds)
  if (scan()) return;
  var attempts = 0;
  var timer = setInterval(function() {
    if (scan() || ++attempts > 100) clearInterval(timer);
  }, 50);
  // Also react to DOM changes
  new MutationObserver(scan).observe(document.documentElement, {childList: true, subtree: true});
})();
true;
`;

// ── Component ─────────────────────────────────────────────────────────────────
const AkwamExtractor: React.FC<Props> = ({
  startUrl,
  mode,
  onExtracted,
  onError,
  timeoutMs = 45000,
}) => {
  const doneRef    = useRef(false);
  const timerRef   = useRef<ReturnType<typeof setTimeout>>();
  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const done = useCallback((mp4?: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimeout(timerRef.current);
    clearTimeout(fallbackTimerRef.current);
    mp4 ? onExtracted(mp4) : onError();
  }, [onExtracted, onError]);

  // Native fetch fallback: if WebView doesn't find the mp4 quickly, try a direct fetch
  const startFallback = useCallback((finalUrl: string) => {
    fallbackTimerRef.current = setTimeout(() => {
      if (doneRef.current) return;
      console.log('[Akwam] WATCH fallback fetch starting');
      fetch(finalUrl, { headers: { 'User-Agent': UA } })
        .then(r => r.text())
        .then(html => {
          const mp4 = extractMp4(html);
          if (mp4) {
            console.log('[Akwam] WATCH fallback got mp4:', mp4.substring(0, 120));
            done(mp4);
          }
        })
        .catch(() => {});
    }, 10000);
  }, [done]);

  useEffect(() => {
    doneRef.current = false;
    setWatchUrl(null);

    timerRef.current = setTimeout(() => {
      console.warn('[AkwamExtractor] timeout');
      done();
    }, timeoutMs);

    if (mode === 'download') {
      // Download – pure HTTP, no WebView
      resolveShortener(startUrl, 'download')
        .then(downloadPageUrl => fetch(downloadPageUrl, { headers: { 'User-Agent': UA, 'Referer': startUrl } }))
        .then(r => r.text())
        .then(html => {
          const mp4 = extractMp4(html);
          if (mp4) { console.log('[Akwam] DOWNLOAD got mp4:', mp4.substring(0, 120)); done(mp4); }
          else throw new Error('mp4 not found');
        })
        .catch(e => { console.warn('[Akwam] DOWNLOAD failed:', e.message); done(); });
    } else {
      // Watch – resolve shortener to real watch page, then load WebView
      resolveShortener(startUrl, 'watch')
        .then(finalUrl => {
          setWatchUrl(finalUrl);
          startFallback(finalUrl);
        })
        .catch(e => { console.warn('[Akwam] WATCH resolution failed:', e.message); done(); });
    }

    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(fallbackTimerRef.current);
    };
  }, [startUrl, mode]);

  const handleMessage = useCallback((event: any) => {
    const msg = event.nativeEvent.data;
    if (!msg) return;
    if (msg.startsWith('[AKWAM_LOG]')) {
      console.log('[Akwam]', msg.substring(11));
      return;
    }
    if (msg.includes('.mp4')) {
      console.log('[Akwam] got mp4:', msg.substring(0, 120));
      done(msg);
    }
  }, [done]);

  const handleNavRequest = useCallback((request: {url: string}) => {
    const url = request.url;
    console.log('[Akwam] nav:', url?.substring(0, 120));
    if (!url) return true;
    if (url.startsWith('about:') || url.startsWith('data:')) return true;
    if (url.includes('.mp4')) { done(url); return false; }
    const allowed = ['akwam.com.co', 'go.akwam.com.co', 'akw.cam', 'downet.net'];
    const ok = allowed.some(h => url.includes(h));
    if (!ok) console.log('[Akwam] blocked:', url.substring(0, 80));
    return ok;
  }, [done]);

  if (mode !== 'watch' || !watchUrl) return null;

  return (
    <View pointerEvents="none" style={{position: 'absolute', width: 1, height: 1, opacity: 0}}>
      <WebView
        source={{uri: watchUrl}}
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

export { resolveShortener as resolveDownloadMp4 }; // kept for backward compatibility
export default AkwamExtractor;