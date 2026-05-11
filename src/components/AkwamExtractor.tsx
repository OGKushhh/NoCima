/**
 * AkwamExtractor
 *
 * WATCH mode  — three steps:
 *   1. Native fetch resolves the go.akwam.com.co/watch shortener by following
 *      the 302 redirect (fetch with redirect:'follow'). Gets the final
 *      akwam.com.co/watch/... URL. No HTML parsing.
 *   2. Hidden WebView loads that final URL – static HTML already contains
 *      <source src="...mp4"> inside #player.
 *   3. Injected JS aggressively scans for the source and posts the mp4 URL back.
 *      If the WebView fails or times out, a final native fetch is used as a last
 *      resort to extract the mp4 link.
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

// ── Pure HTTP download resolution (unchanged) ────────────────────────────────
async function resolveDownloadMp4(shortUrl: string): Promise<string> {
  console.log('[Akwam] DOWNLOAD fetching shortener:', shortUrl);
  const r1 = await fetch(shortUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {'User-Agent': UA},
  });
  const html1 = await r1.text();
  console.log('[Akwam] DOWNLOAD shortener status:', r1.status, 'finalUrl:', r1.url?.substring(0, 80));

  if (r1.url && r1.url.includes('/download/')) {
    const mp4 = extractMp4(html1);
    if (mp4) return mp4;
  }

  const m1 = html1.match(/class="download-link"[^>]*href="([^"]+)"/);
  const m2 = !m1 && html1.match(/href="([^"]+)"[^>]*class="download-link"/);
  const href = (m1 || m2)?.[1];
  if (!href) throw new Error('download-link not found. Page length: ' + html1.length);

  const downloadPageUrl = href.startsWith('http') ? href : `https://akwam.com.co${href}`;
  console.log('[Akwam] DOWNLOAD page url:', downloadPageUrl.substring(0, 80));

  const r2 = await fetch(downloadPageUrl, {
    headers: {'User-Agent': UA, 'Referer': shortUrl},
  });
  const html2 = await r2.text();
  console.log('[Akwam] DOWNLOAD page status:', r2.status);

  const mp4 = extractMp4(html2);
  if (mp4) return mp4;

  throw new Error('mp4 not found in download page. Length: ' + html2.length);
}

function extractMp4(html: string): string | null {
  // <source src="...mp4">
  const sourceMatch = html.match(/<source[^>]*src="([^"]+\.mp4[^"]*)"/i);
  if (sourceMatch) return sourceMatch[1];
  // <a class="link btn ..." href="...mp4">
  const linkMatch = html.match(/class="[^"]*\blink\b[^"]*\bbtn\b[^"]*"[^>]*href="([^"]+\.mp4[^"]*)"/i);
  if (linkMatch) return linkMatch[1];
  // <a href="...mp4" download>
  const downloadMatch = html.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"[^>]*download/i);
  if (downloadMatch) return downloadMatch[1];
  // any href/src with .mp4
  const genericMatch = html.match(/(?:href|src)="(https?:\/\/[^"]+\.mp4[^"]*)"/i);
  if (genericMatch) return genericMatch[1];
  // bare mp4 url
  const bareMatch = html.match(/https?:\/\/[^\s"'<>]+\.mp4/i);
  if (bareMatch) return bareMatch[0];
  return null;
}

// ── Resolve watch shortener using fetch (unchanged) ──────────────────────────
async function resolveWatchUrl(shortUrl: string): Promise<string> {
  console.log('[Akwam] WATCH resolving shortener:', shortUrl);
  const resp = await fetch(shortUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {'User-Agent': UA},
  });
  const finalUrl = resp.url;
  console.log('[Akwam] WATCH resolved to:', finalUrl?.substring(0, 80));
  return finalUrl;
}

// ── Aggressive injected JS for the final watch page ──────────────────────────
const WATCH_JS = `
(function() {
  if (window.__akwamDone) return;

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
    // 3. download link
    var dl = document.querySelector('a[download][href*=".mp4"]');
    if (dl && dl.href) { post(dl.href); return true; }
    // 4. regex on entire document
    var m = document.documentElement.innerHTML.match(/https?:\\/\\/[^"\\'\\s<>]+\\.mp4/);
    if (m) { post(m[0]); return true; }
    return false;
  }

  // Scan immediately and every 50ms
  if (scan()) return;
  var attempts = 0;
  var timer = setInterval(function() {
    if (scan() || ++attempts > 100) clearInterval(timer);
  }, 50);

  // Also scan on DOM changes
  if (window.MutationObserver) {
    new MutationObserver(scan).observe(document.documentElement, {childList: true, subtree: true});
  }
})();
true;
`;

// ── Component ─────────────────────────────────────────────────────────────────
const AkwamExtractor: React.FC<Props> = ({
  startUrl,
  mode,
  onExtracted,
  onError,
  timeoutMs = 45000, // increased for slower connections
}) => {
  const doneRef    = useRef(false);
  const timerRef   = useRef<ReturnType<typeof setTimeout>>();
  const webviewRef = useRef<WebView>(null);
  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const done = useCallback((mp4?: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimeout(timerRef.current);
    clearTimeout(fallbackTimerRef.current);
    mp4 ? onExtracted(mp4) : onError();
  }, [onExtracted, onError]);

  // Fallback: if the WebView hasn't found the mp4 in time, try a direct fetch
  const startFallback = useCallback((finalUrl: string) => {
    // Wait 10 seconds, then try fetch
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
      console.log('[Akwam] DOWNLOAD start:', startUrl);
      resolveDownloadMp4(startUrl)
        .then(mp4 => { console.log('[Akwam] DOWNLOAD success:', mp4.substring(0, 120)); done(mp4); })
        .catch(e  => { console.warn('[Akwam] DOWNLOAD failed:', e.message); done(); });
    } else {
      resolveWatchUrl(startUrl)
        .then(finalUrl => {
          setWatchUrl(finalUrl);
          startFallback(finalUrl);
        })
        .catch(e => {
          console.warn('[Akwam] WATCH resolution failed:', e.message);
          done();
        });
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
        ref={webviewRef}
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

export { resolveDownloadMp4 };
export default AkwamExtractor;