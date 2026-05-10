/**
 * AkwamExtractor
 *
 * Invisible WebView that extracts direct mp4 URLs from akwam.com.co.
 *
 * ── Extraction chain ─────────────────────────────────────────────────────────
 *
 * WATCH:
 *   go.akwam.com.co/watch/{id}          ← shortener (auto-redirects)
 *     → "Click here" page               ← find <a class="download-link"> and navigate
 *       → akwam.com.co/watch/{id}/...   ← final page
 *         → <source src="...mp4">       ← FOUND
 *         or <a href="vlc://...mp4">    ← FOUND (fallback)
 *
 * DOWNLOAD:
 *   go.akwam.com.co/link/{id}           ← shortener (auto-redirects)
 *     → "Click here" page               ← find <a class="download-link"> and navigate
 *       → akwam.com.co/download/{id}/.. ← final page
 *         → <a class="link btn btn-light" download href="...mp4"> ← FOUND
 *
 * Key insight: The mp4 URL is static in the HTML — no JS execution needed.
 * We just navigate to each page and read the DOM.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { View, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';

const { width: SW, height: SH } = Dimensions.get('window');

export type AkwamExtractMode = 'watch' | 'download';

interface AkwamExtractorProps {
  /** The shortener URL: go.akwam.com.co/watch/{id} or go.akwam.com.co/link/{id} */
  startUrl: string;
  mode: AkwamExtractMode;
  onExtracted: (mp4Url: string) => void;
  onError: () => void;
  timeoutMs?: number;
}

// ── Injection script ──────────────────────────────────────────────────────────
// Runs after every page load. Checks what page we're on and either:
// 1. Clicks the "download-link" on the intermediate page
// 2. Extracts the mp4 from the final page and posts it
const AKWAM_JS = `
(function() {
  var url = window.location.href;

  function post(type, data) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({type: type, data: data})); } catch(e) {}
  }

  post('debug', 'AKWAM: page loaded: ' + url.substring(0, 100));

  // ── Stage 1: Shortener "Click here" intermediate page ──────────────────────
  // This page has class="download-link" with the real akwam URL in href.
  // Navigate to it automatically — no user click needed.
  var clickLink = document.querySelector('a.download-link');
  if (clickLink && clickLink.href) {
    var target = clickLink.href;
    post('debug', 'AKWAM: found download-link, navigating to: ' + target.substring(0, 100));
    window.location.href = target;
    return;
  }

  // ── Stage 2: Final WATCH page ──────────────────────────────────────────────
  // akwam.com.co/watch/... has <source src="...mp4" type="video/mp4">
  if (url.indexOf('/watch/') !== -1 && url.indexOf('akwam') !== -1) {
    // Try <source> tag first
    var source = document.querySelector('source[type="video/mp4"][src]');
    if (source && source.src && source.src.indexOf('.mp4') !== -1) {
      post('mp4', source.src);
      return;
    }
    // Fallback: vlc:// link contains the mp4 URL
    var vlcLink = document.querySelector('a[href^="vlc://"]');
    if (vlcLink && vlcLink.href) {
      var mp4 = vlcLink.href.replace('vlc://', '');
      if (mp4.indexOf('.mp4') !== -1) {
        post('mp4', mp4);
        return;
      }
    }
    // Fallback: look for downet.net URLs anywhere in page
    var bodyText = document.body ? document.body.innerHTML : '';
    var match = bodyText.match(/https?:\\/\\/[^"'<>\\s]+\\.mp4/);
    if (match) {
      post('mp4', match[0]);
      return;
    }
    post('debug', 'AKWAM: on watch page but no mp4 found yet');
    return;
  }

  // ── Stage 2: Final DOWNLOAD page ──────────────────────────────────────────
  // akwam.com.co/download/... has <a class="link btn btn-light" download href="...mp4">
  if (url.indexOf('/download/') !== -1 && url.indexOf('akwam') !== -1) {
    // Primary: the download button
    var dlBtn = document.querySelector('a.link.btn[download]');
    if (dlBtn && dlBtn.href && dlBtn.href.indexOf('.mp4') !== -1) {
      post('mp4', dlBtn.href);
      return;
    }
    // Fallback: any link with .mp4 in href from downet.net
    var links = document.querySelectorAll('a[href*=".mp4"]');
    for (var i = 0; i < links.length; i++) {
      var h = links[i].href;
      if (h && h.indexOf('downet.net') !== -1) {
        post('mp4', h);
        return;
      }
    }
    // Fallback: regex in page body
    var bodyHtml = document.body ? document.body.innerHTML : '';
    var m = bodyHtml.match(/https?:\\/\\/[^"'<>\\s]+\\.mp4/);
    if (m) {
      post('mp4', m[0]);
      return;
    }
    post('debug', 'AKWAM: on download page but no mp4 found yet');
    return;
  }

  post('debug', 'AKWAM: unrecognized page, waiting...');
})();
true;
`;

// Allowed domains — block everything else to avoid ads/redirects hijacking the WebView
const ALLOWED = [
  'go.akwam.com.co',
  'akwam.com.co',
  'akw.cam',
  'downet.net',          // actual mp4 host
  's204d1.downet.net',
  's203d1.downet.net',
  's301d4.downet.net',
  's301d6.downet.net',
  's302d2.downet.net',
];

const AkwamExtractor: React.FC<AkwamExtractorProps> = ({
  startUrl,
  mode,
  onExtracted,
  onError,
  timeoutMs = 30000,
}) => {
  const doneRef    = useRef(false);
  const timerRef   = useRef<ReturnType<typeof setTimeout>>();

  const done = useCallback((mp4?: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimeout(timerRef.current);
    if (mp4) {
      onExtracted(mp4);
    } else {
      onError();
    }
  }, [onExtracted, onError]);

  useEffect(() => {
    doneRef.current = false;
    timerRef.current = setTimeout(() => {
      console.warn('[AkwamExtractor] timeout');
      done();
    }, timeoutMs);
    return () => clearTimeout(timerRef.current);
  }, [startUrl]);

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'mp4' && msg.data) {
        console.log('[AkwamExtractor] got mp4:', msg.data.substring(0, 80));
        done(msg.data);
      } else if (msg.type === 'debug') {
        console.log('[AkwamExtractor]', msg.data);
      }
    } catch (e) {}
  }, [done]);

  const handleNavRequest = useCallback((request: { url: string }) => {
    const url = request.url;
    if (!url) return true;
    if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('javascript:')) return true;

    // Intercept mp4 URLs directly from navigation (redirect to mp4)
    if (url.endsWith('.mp4') || url.includes('.mp4?')) {
      console.log('[AkwamExtractor] intercepted mp4 nav:', url.substring(0, 80));
      done(url);
      return false;
    }

    // Block vlc:// and intent:// — extract the mp4 from them
    if (url.startsWith('vlc://')) {
      const mp4 = url.replace('vlc://', '');
      if (mp4.includes('.mp4')) done(mp4);
      return false;
    }
    if (url.startsWith('intent:')) {
      const m = url.match(/intent:(https?:\/\/[^#]+)/);
      if (m && m[1].includes('.mp4')) done(m[1]);
      return false;
    }

    // Allow akwam domains
    if (ALLOWED.some(d => url.includes(d))) return true;

    // Block everything else (ads, trackers)
    console.log('[AkwamExtractor] blocked:', url.substring(0, 60));
    return false;
  }, [done]);

  const handleError = useCallback(() => done(), [done]);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0, left: 0,
        width: SW, height: SH,
        opacity: 0,
        overflow: 'hidden',
        zIndex: -1,
      }}
    >
      <WebView
        source={{ uri: startUrl }}
        style={{ width: SW, height: SH }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        injectedJavaScript={AKWAM_JS}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleNavRequest}
        onError={handleError}
        onHttpError={handleError}
        userAgent="Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        setSupportMultipleWindows={false}
        originWhitelist={['*']}
        mixedContentMode="always"
      />
    </View>
  );
};

export default AkwamExtractor;
