/**
 * AkwamExtractor
 *
 * WATCH mode  — three steps:
 *   1. Native fetch resolves the go.akwam.com.co/watch shortener to the final
 *      akwam.com.co/watch/... URL (parses the "Click here" page if no redirect).
 *   2. Hidden WebView loads that final URL directly – no more manual link clicks.
 *   3. Injected JS relentlessly scans for #player source[src] and responds
 *      immediately. A native fetch fallback kicks in after 5s as a guarantee.
 *
 * DOWNLOAD mode — pure HTTP, no WebView (unchanged).
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

// ── Resolve a go.akwam.com.co shortener → final watch/download page URL ────
async function resolveShortener(shortUrl: string, type: 'watch' | 'download'): Promise<string> {
  const resp = await fetch(shortUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {'User-Agent': UA},
  });
  const html = await resp.text();

  // If the final URL already points to the target page, use it
  if (resp.url.includes(`/${type}/`)) {
    return resp.url;
  }

  // Otherwise parse the "Click here" page for the download-link
  const match =
    html.match(/<a[^>]+class="download-link"[^>]+href="([^"]+)"/) ||
    html.match(/<a[^>]+href="([^"]+)"[^>]+class="download-link"/);
  if (match) {
    const href = match[1];
    return href.startsWith('http') ? href : `https://akwam.com.co${href}`;
  }
  throw new Error('Could not resolve shortener');
}

// ── Extract an mp4 URL from HTML ──────────────────────────────────────────
function extractMp4(html: string): string | null {
  // <source src="...mp4">
  let m = html.match(/<source[^>]+src="([^"]+\.mp4[^"]*)"/i);
  if (m) return m[1];
  // <a class="link btn" href="...mp4">
  m = html.match(/class="[^"]*\blink\b[^"]*\bbtn\b[^"]*"[^>]*href="([^"]+\.mp4[^"]*)"/i);
  if (m) return m[1];
  // any href/src with .mp4
  m = html.match(/(?:href|src)="(https?:\/\/[^"]+\.mp4[^"]*)"/i);
  if (m) return m[1];
  // bare mp4 URL
  m = html.match(/https?:\/\/[^\s"'<>]+\.mp4/i);
  return m ? m[0] : null;
}

// ── Injected JS – never stops scanning while the page is alive ────────────
const WATCH_JS = `
(function() {
  if (window.__akwamHooked) return;
  window.__akwamHooked = true;

  function done(url) {
    window.ReactNativeWebView.postMessage(url);
    window.__akwamHooked = false; // allow cleanup but message already sent
  }

  function scan() {
    // #player source is the primary target
    var s = document.querySelector('#player source[src]');
    if (s && s.src && s.src.indexOf('.mp4') !== -1) { done(s.src); return true; }
    // any source / video
    var tags = document.querySelectorAll('source[src], video[src]');
    for (var i = 0; i < tags.length; i++) {
      if (tags[i].src && tags[i].src.indexOf('.mp4') !== -1) { done(tags[i].src); return true; }
    }
    // fallback – grab any .mp4 in the document
    var m = document.documentElement.innerHTML.match(/https?:\\/\\/[^"\\'\\s<>]+\\.mp4/);
    if (m) { done(m[0]); return true; }
    return false;
  }

  scan(); // first try
  document.addEventListener('DOMContentLoaded', scan);
  // Poll every 50ms indefinitely (until page unloads)
  setInterval(scan, 50);
  // Also react to DOM changes
  if (window.MutationObserver) {
    new MutationObserver(scan).observe(document.documentElement, {childList: true, subtree: true});
  }
})();
true;
`;

// ── Component ──────────────────────────────────────────────────────────────
const AkwamExtractor: React.FC<Props> = ({
  startUrl,
  mode,
  onExtracted,
  onError,
  timeoutMs = 45000,
}) => {
  const doneRef      = useRef(false);
  const timerRef     = useRef<ReturnType<typeof setTimeout>>();
  const fallbackRef  = useRef<ReturnType<typeof setTimeout>>();
  const [watchUrl, setWatchUrl] = useState<string | null>(null);

  const done = useCallback((mp4?: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimeout(timerRef.current);
    clearTimeout(fallbackRef.current);
    mp4 ? onExtracted(mp4) : onError();
  }, [onExtracted, onError]);

  // Native fetch fallback – guarantees extraction even if WebView stalls
  const startFallback = useCallback((finalUrl: string) => {
    fallbackRef.current = setTimeout(() => {
      if (doneRef.current) return;
      console.log('[Akwam] FALLBACK fetch starting');
      fetch(finalUrl, {headers: {'User-Agent': UA}})
        .then(r => r.text())
        .then(html => {
          const mp4 = extractMp4(html);
          if (mp4) {
            console.log('[Akwam] FALLBACK got mp4:', mp4.substring(0, 120));
            done(mp4);
          }
        })
        .catch(() => {});
    }, 8000); // wait 8s before fallback
  }, [done]);

  useEffect(() => {
    doneRef.current = false;
    setWatchUrl(null);

    timerRef.current = setTimeout(() => {
      console.warn('[AkwamExtractor] timeout');
      done();
    }, timeoutMs);

    if (mode === 'download') {
      resolveShortener(startUrl, 'download')
        .then(downloadPageUrl => fetch(downloadPageUrl, {
          headers: {'User-Agent': UA, 'Referer': startUrl},
        }))
        .then(r => r.text())
        .then(html => {
          const mp4 = extractMp4(html);
          if (mp4) {
            console.log('[Akwam] DOWNLOAD got mp4:', mp4.substring(0, 120));
            done(mp4);
          } else throw new Error('mp4 not found');
        })
        .catch(e => { console.warn('[Akwam] DOWNLOAD failed:', e.message); done(); });
    } else {
      // Watch: resolve shortener → load final page in WebView + fallback
      resolveShortener(startUrl, 'watch')
        .then(finalUrl => {
          console.log('[Akwam] WATCH final URL:', finalUrl.substring(0, 120));
          setWatchUrl(finalUrl);
          startFallback(finalUrl);
        })
        .catch(e => {
          console.warn('[Akwam] WATCH shortener resolve failed:', e.message);
          done();
        });
    }

    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(fallbackRef.current);
    };
  }, [startUrl, mode]);

  const handleMessage = useCallback((event: any) => {
    const url = event.nativeEvent.data;
    if (!url) return;
    console.log('[Akwam] WEBVIEW message:', url.substring(0, 120));
    if (url.includes('.mp4')) {
      done(url);
    }
  }, [done]);

  const handleNavRequest = useCallback((request: {url: string}) => {
    const url = request.url;
    console.log('[Akwam] WEBVIEW nav:', url?.substring(0, 120));
    if (!url) return true;
    if (url.startsWith('about:') || url.startsWith('data:')) return true;
    if (url.includes('.mp4')) {
      console.log('[Akwam] WEBVIEW intercepted mp4 nav');
      done(url);
      return false;
    }
    const allowed = ['akwam.com.co', 'akw.cam', 'downet.net'];
    const ok = allowed.some(h => url.includes(h));
    if (!ok) console.log('[Akwam] WEBVIEW blocked:', url.substring(0, 120));
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

export default AkwamExtractor;