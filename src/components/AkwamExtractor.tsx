/**
 * AkwamExtractor
 *
 * WATCH mode  — loads the go.akwam.com.co shortener inside a hidden WebView,
 *               then automatically clicks the download-link to navigate to the
 *               final akwam.com.co/watch/… page, which contains
 *               <source src="…mp4"> inside #player. The mp4 is captured and
 *               sent back instantly. No native shortener resolution needed.
 *
 * DOWNLOAD mode — pure HTTP, no WebView (unchanged).
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

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

// ── Injected JS – runs on every page the WebView loads ───────────────────────
const WATCH_JS = `
(function() {
  if (window.__akwamHooked) return;
  window.__akwamHooked = true;

  function post(url) {
    window.ReactNativeWebView.postMessage(url);
  }

  function log(msg) {
    try { window.ReactNativeWebView.postMessage('[AKWAM_LOG] ' + msg); } catch(e) {}
  }

  var currentUrl = window.location.href;
  log('page: ' + currentUrl.substring(0, 80));

  // ── Shortener page (go.akwam.com.co or akw.cam) ────────────────────────
  // Contains <a class="download-link" href="https://akwam.com.co/watch/…">
  // We force navigation by setting window.location.href – no popup blocker.
  if (currentUrl.indexOf('go.akwam.com.co') !== -1 || currentUrl.indexOf('akw.cam') !== -1) {
    function clickDownloadLink() {
      var link = document.querySelector('a.download-link');
      if (link && link.href) {
        var href = link.href;
        log('navigating to: ' + href.substring(0, 80));
        window.location.href = href;
        return true;
      }
      return false;
    }

    // Try immediately (link may already be in DOM)
    if (clickDownloadLink()) return;

    // Wait for DOM
    document.addEventListener('DOMContentLoaded', function() { clickDownloadLink(); });

    // Poll as fallback
    var tries = 0;
    var t = setInterval(function() {
      if (clickDownloadLink() || ++tries > 20) clearInterval(t);
    }, 200);
    return;
  }

  // ── Final watch page (akwam.com.co/watch/…) ──────────────────────────────
  // Static HTML already has <source src="…mp4"> inside #player.
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
  document.addEventListener('DOMContentLoaded', function() { scan(); });
  // Poll every 100ms indefinitely
  setInterval(scan, 100);
  if (window.MutationObserver) {
    new MutationObserver(scan).observe(document.documentElement, {childList: true, subtree: true});
  }
})();
true;
`;

// ── Pure HTTP download resolution (unchanged, already works) ────────────────
async function resolveDownloadMp4(shortUrl: string): Promise<string> {
  const r1 = await fetch(shortUrl, {
    method: 'GET',
    redirect: 'manual',
    headers: { 'User-Agent': UA },
  });

  let downloadPageUrl: string;

  if (r1.status >= 300 && r1.status < 400) {
    const loc = r1.headers.get('location');
    if (!loc) throw new Error('redirect with no Location header');
    downloadPageUrl = loc.startsWith('http') ? loc : `https://akwam.com.co${loc}`;
  } else {
    const html = await r1.text();
    const m = html.match(/class="download-link"[^>]*href="([^"]+)"/);
    const m2 = !m && html.match(/href="([^"]+)"[^>]*class="download-link"/);
    const href = (m || m2)?.[1];
    if (!href) throw new Error('download-link not found');
    downloadPageUrl = href.startsWith('http') ? href : `https://akwam.com.co${href}`;
  }

  const r2 = await fetch(downloadPageUrl, {
    headers: { 'User-Agent': UA, 'Referer': 'https://akwam.com.co/' },
  });
  const html2 = await r2.text();

  const mp4Match = html2.match(/class="[^"]*\blink\b[^"]*\bbtn\b[^"]*"[^>]*href="([^"]+\.mp4[^"]*)"/);
  if (mp4Match) return mp4Match[1];

  const fallback = html2.match(/(?:href|src)="(https?:\/\/[^"]+\.mp4[^"]*)"/);
  if (fallback) return fallback[1];

  const bare = html2.match(/https?:\/\/[^\s"'<>]+\.mp4/);
  if (bare) return bare[0];

  throw new Error('mp4 URL not found in download page');
}

// ── Component ─────────────────────────────────────────────────────────────────
const AkwamExtractor: React.FC<Props> = ({
  startUrl,
  mode,
  onExtracted,
  onError,
  timeoutMs = 45000,
}) => {
  const doneRef  = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const done = useCallback((mp4?: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimeout(timerRef.current);
    mp4 ? onExtracted(mp4) : onError();
  }, [onExtracted, onError]);

  useEffect(() => {
    doneRef.current = false;

    timerRef.current = setTimeout(() => {
      console.warn('[AkwamExtractor] timeout');
      done();
    }, timeoutMs);

    if (mode === 'download') {
      console.log('[Akwam] DOWNLOAD start:', startUrl);
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
    // Watch mode: WebView handles everything, no extra resolution needed.
    // The injected JS will auto‑click the download-link.

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
      console.log('[Akwam] WEBVIEW mp4:', msg.substring(0, 120));
      done(msg);
    }
  }, [done]);

  const handleNavRequest = useCallback((request: { url: string }) => {
    const url = request.url;
    console.log('[Akwam] WEBVIEW nav:', url?.substring(0, 120));
    if (!url) return true;
    if (url.startsWith('about:') || url.startsWith('data:')) return true;
    if (url.includes('.mp4')) {
      console.log('[Akwam] WEBVIEW intercepted mp4 nav');
      done(url);
      return false;
    }
    const allowed = ['akwam.com.co', 'go.akwam.com.co', 'akw.cam', 'downet.net'];
    const ok = allowed.some(h => url.includes(h));
    if (!ok) console.log('[Akwam] WEBVIEW blocked:', url.substring(0, 120));
    return ok;
  }, [done]);

  if (mode !== 'watch') return null;

  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>
      <WebView
        source={{ uri: startUrl }}
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