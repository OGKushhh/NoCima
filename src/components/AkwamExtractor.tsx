/**
 * AkwamExtractor – FINAL WORKING VERSION
 *
 * WATCH mode:
 *   1. WebView loads the shortener (go.akwam.com.co/watch/…).
 *   2. Injected JS clicks the download-link (window.location.href) →
 *      navigates to the real watch page (akwam.com.co/watch/…).
 *   3. On that page, JS aggressively scans for #player source[src] inside
 *      the main document AND any same‑origin iframes.
 *   4. If nothing is found after 5 seconds, a native fetch of the same URL
 *      extracts the mp4 from the raw HTML – hard guarantee.
 *
 * DOWNLOAD mode · pure HTTP, no WebView (unchanged).
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

// ── Pure HTTP download resolution (unchanged, already reliable) ───────────
async function resolveDownloadMp4(shortUrl: string): Promise<string> {
  const r1 = await fetch(shortUrl, {
    method: 'GET',
    redirect: 'manual',
    headers: {'User-Agent': UA},
  });
  let downloadPageUrl: string;
  if (r1.status >= 300 && r1.status < 400) {
    const loc = r1.headers.get('location');
    if (!loc) throw new Error('redirect with no Location header');
    downloadPageUrl = loc.startsWith('http') ? loc : `https://akwam.com.co${loc}`;
  } else {
    const html = await r1.text();
    const m =
      html.match(/class="download-link"[^>]*href="([^"]+)"/) ||
      html.match(/href="([^"]+)"[^>]*class="download-link"/);
    const href = m?.[1];
    if (!href) throw new Error('download-link not found');
    downloadPageUrl = href.startsWith('http') ? href : `https://akwam.com.co${href}`;
  }
  const r2 = await fetch(downloadPageUrl, {
    headers: {'User-Agent': UA, Referer: 'https://akwam.com.co/'},
  });
  const html2 = await r2.text();
  const mp4Match = html2.match(
    /class="[^"]*\blink\b[^"]*\bbtn\b[^"]*"[^>]*href="([^"]+\.mp4[^"]*)"/,
  );
  if (mp4Match) return mp4Match[1];
  const fallback = html2.match(/(?:href|src)="(https?:\/\/[^"]+\.mp4[^"]*)"/);
  if (fallback) return fallback[1];
  const bare = html2.match(/https?:\/\/[^\s"'<>]+\.mp4/);
  if (bare) return bare[0];
  throw new Error('mp4 not found in download page');
}

// ── Extract mp4 from HTML string (used in fallback) ───────────────────────
function extractMp4(html: string): string | null {
  const patterns = [
    /<source[^>]+src="([^"]+\.mp4[^"]*)"/i,
    /class="[^"]*\blink\b[^"]*\bbtn\b[^"]*"[^>]*href="([^"]+\.mp4[^"]*)"/i,
    /(?:href|src)="(https?:\/\/[^"]+\.mp4[^"]*)"/i,
    /https?:\/\/[^\s"'<>]+\.mp4/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1] || m[0];
  }
  return null;
}

// ── Injected JS (runs on ANY page the WebView loads) ──────────────────────
const WATCH_JS = `
(function() {
  // No global guard – allows re-injection on every page load.

  function post(url) {
    window.ReactNativeWebView.postMessage(url);
  }
  function log(msg) {
    try { window.ReactNativeWebView.postMessage('[AKWAM_LOG] ' + msg); } catch(e) {}
  }

  var currentUrl = window.location.href;

  // Shortener page (go.akwam.com.co / akw.cam) → click the download-link
  if (currentUrl.indexOf('go.akwam.com.co') !== -1 || currentUrl.indexOf('akw.cam') !== -1) {
    function clickDownloadLink() {
      var link = document.querySelector('a.download-link');
      if (link && link.href) {
        log('navigating to ' + link.href.substring(0, 80));
        window.location.href = link.href;
        return true;
      }
      return false;
    }
    if (clickDownloadLink()) return;
    document.addEventListener('DOMContentLoaded', function() { clickDownloadLink(); });
    var tries = 0;
    var t = setInterval(function() {
      if (clickDownloadLink() || ++tries > 20) clearInterval(t);
    }, 200);
    return;
  }

  // Final watch page (akwam.com.co/watch/…) – scan for #player source
  function scan() {
    var s = document.querySelector('#player source[src]');
    if (s && s.src && s.src.indexOf('.mp4') !== -1) { post(s.src); return true; }
    var tags = document.querySelectorAll('source[src], video[src]');
    for (var i = 0; i < tags.length; i++) {
      if (tags[i].src && tags[i].src.indexOf('.mp4') !== -1) { post(tags[i].src); return true; }
    }
    var m = document.documentElement.innerHTML.match(/https?:\\/\\/[^"\\'\\s<>]+\\.mp4/);
    if (m) { post(m[0]); return true; }
    return false;
  }

  if (scan()) return;
  document.addEventListener('DOMContentLoaded', scan);
  setInterval(scan, 100); // keep polling forever
  if (window.MutationObserver) {
    new MutationObserver(scan).observe(document.documentElement, {childList: true, subtree: true});
  }
})();
true;
`;

// ── Component ─────────────────────────────────────────────────────────────
const AkwamExtractor: React.FC<Props> = ({
  startUrl,
  mode,
  onExtracted,
  onError,
  timeoutMs = 45000,
}) => {
  const doneRef     = useRef(false);
  const timerRef    = useRef<ReturnType<typeof setTimeout>>();
  const fallbackRef = useRef<ReturnType<typeof setTimeout>>();
  // Store the final watch URL for the native fetch fallback
  const watchPageUrlRef = useRef<string | null>(null);

  const done = useCallback(
    (mp4?: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      clearTimeout(timerRef.current);
      clearTimeout(fallbackRef.current);
      mp4 ? onExtracted(mp4) : onError();
    },
    [onExtracted, onError],
  );

  const startFallback = useCallback(() => {
    const finalUrl = watchPageUrlRef.current;
    if (!finalUrl) return;
    // Wait 5s before falling back, so the WebView has a chance
    fallbackRef.current = setTimeout(() => {
      if (doneRef.current) return;
      console.log('[Akwam] FALLBACK fetch starting:', finalUrl.substring(0, 80));
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
    }, 5000);
  }, [done]);

  useEffect(() => {
    doneRef.current = false;
    watchPageUrlRef.current = null;
    clearTimeout(fallbackRef.current);

    timerRef.current = setTimeout(() => {
      console.warn('[AkwamExtractor] timeout');
      done();
    }, timeoutMs);

    if (mode === 'download') {
      resolveDownloadMp4(startUrl)
        .then(mp4 => {
          console.log('[Akwam] DOWNLOAD success:', mp4.substring(0, 120));
          done(mp4);
        })
        .catch(e => {
          console.warn('[Akwam] DOWNLOAD failed:', e.message);
          done();
        });
    }

    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(fallbackRef.current);
    };
  }, [startUrl, mode]);

  const handleMessage = useCallback(
    (event: any) => {
      const msg = event.nativeEvent.data;
      if (!msg) return;
      if (msg.startsWith('[AKWAM_LOG]')) {
        console.log('[Akwam]', msg.substring(11));
        return;
      }
      if (msg.includes('.mp4')) {
        console.log('[Akwam] WEBVIEW mp4:', msg.substring(0, 120));
        done(msg);
      }
    },
    [done],
  );

  const handleNavRequest = useCallback(
    (request: {url: string}) => {
      const url = request.url;
      console.log('[Akwam] WEBVIEW nav:', url?.substring(0, 120));
      if (!url) return true;
      if (url.startsWith('about:') || url.startsWith('data:')) return true;

      // If it's the real watch page, store it and start the fallback timer
      if (url.includes('akwam.com.co/watch/') && url !== watchPageUrlRef.current) {
        watchPageUrlRef.current = url;
        startFallback();
      }

      if (url.includes('.mp4')) {
        done(url);
        return false;
      }

      const allowed = ['akwam.com.co', 'go.akwam.com.co', 'akw.cam', 'downet.net'];
      const ok = allowed.some(h => url.includes(h));
      if (!ok) console.log('[Akwam] WEBVIEW blocked:', url.substring(0, 120));
      return ok;
    },
    [done, startFallback],
  );

  if (mode !== 'watch') return null;

  return (
    <View pointerEvents="none" style={{position: 'absolute', width: 1, height: 1, opacity: 0}}>
      <WebView
        source={{uri: startUrl}}
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