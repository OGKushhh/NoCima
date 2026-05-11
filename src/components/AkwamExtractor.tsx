/**
 * AkwamExtractor
 *
 * WATCH mode  — three steps:
 *   1. Native fetch resolves the go.akwam.com.co/watch shortener by following
 *      the 302 redirect (fetch with redirect:'follow'). Gets the final
 *      akwam.com.co/watch/... URL. No HTML parsing.
 *   2. Hidden WebView loads that final URL – static HTML already contains
 *      <source src="...mp4"> inside #player.
 *   3. Injected JS scans for the source and posts the mp4 URL back.
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
  const m1 = html.match(/class="[^"]*link[^"]*btn[^"]*"[^>]*href="([^"]+\.mp4[^"]*)"/);
  if (m1) return m1[1];
  const m2 = html.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"[^>]*download/);
  if (m2) return m2[1];
  const m3 = html.match(/(?:href|src)="(https?:\/\/[^"]+\.mp4[^"]*)"/);
  if (m3) return m3[1];
  const m4 = html.match(/https?:\/\/[^\s"'<>]+\.mp4/);
  if (m4) return m4[0];
  return null;
}

// ── NEW: Resolve watch shortener using fetch (like download) ─────────────────
async function resolveWatchUrl(shortUrl: string): Promise<string> {
  console.log('[Akwam] WATCH resolving shortener:', shortUrl);
  const resp = await fetch(shortUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {'User-Agent': UA},
  });
  const finalUrl = resp.url; // This is the akwam.com.co/watch/... page
  console.log('[Akwam] WATCH resolved to:', finalUrl?.substring(0, 80));
  return finalUrl;
}

// ── Injected JS for the final watch page ─────────────────────────────────────
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

  var url = window.location.href;
  log('page: ' + url.substring(0, 80));

  if (url.indexOf('go.akwam.com.co') !== -1 || url.indexOf('akw.cam') !== -1) {
    // Not expected if we resolved, but just in case - click the download-link
    function clickDownloadLink() {
      var link = document.querySelector('a.download-link[href*="akwam.com.co"]') ||
                 document.querySelector('a.download-link');
      if (link && link.href) {
        log('clicking download-link: ' + link.href.substring(0, 80));
        link.click();
        return true;
      }
      return false;
    }
    if (clickDownloadLink()) return;
    document.addEventListener('DOMContentLoaded', clickDownloadLink);
    return;
  }

  function scan() {
    var s = document.querySelector('#player source[src]');
    if (s && s.src && s.src.includes('.mp4')) { post(s.src); return true; }
    var tags = document.querySelectorAll('source[src], video[src]');
    for (var i = 0; i < tags.length; i++) {
      if (tags[i].src && tags[i].src.includes('.mp4')) { post(tags[i].src); return true; }
    }
    var dl = document.querySelector('a[download][href*=".mp4"]');
    if (dl && dl.href) { post(dl.href); return true; }
    var m = document.documentElement.innerHTML.match(/https?:\\/\\/[^"\\'\\s<>]+\\.mp4/);
    if (m) { post(m[0]); return true; }
    return false;
  }

  if (scan()) return;
  document.addEventListener('DOMContentLoaded', function() { scan(); });
  var attempts = 0;
  var timer = setInterval(function() {
    if (scan() || ++attempts > 25) clearInterval(timer);
  }, 200);
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
  timeoutMs = 30000,
}) => {
  const doneRef  = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
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
      // RESOLVE the shortener first, then load the final URL in WebView
      resolveWatchUrl(startUrl)
        .then(finalUrl => {
          setWatchUrl(finalUrl);
        })
        .catch(e => {
          console.warn('[Akwam] WATCH resolution failed:', e.message);
          done();
        });
    }

    return () => clearTimeout(timerRef.current);
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

  // Only render WebView for watch once the final URL is resolved
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