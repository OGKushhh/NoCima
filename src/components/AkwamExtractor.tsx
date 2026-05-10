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
import { WebView, WebViewMessageEvent } from 'react-native-webview';

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

// ── Script injected BEFORE page content loads ─────────────────────────────────
// Freezes location.href setter so the ad scripts can't redirect away from the page.
// Runs in the page's JS context before any page scripts execute.
const AKWAM_PRE_JS = `
(function() {
  // Freeze window.location so ad scripts can't hijack navigation
  try {
    var _origHref = window.location.href;
    Object.defineProperty(window, 'location', {
      configurable: true,
      get: function() { return window._akwamLocation || window._origLocation; },
    });
  } catch(e) {}
  // Block common ad/redirect functions
  window.open = function() { return null; };
})();
true;
`;

// ── Script injected AFTER each page load ──────────────────────────────────────
// Checks what page we're on and either:
// 1. Clicks the "download-link" on the intermediate page
// 2. Extracts the mp4 from the final page and posts it
const AKWAM_JS = `
(function() {
  var url = window.location.href;

  function post(type, data) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({type: type, data: data})); } catch(e) {}
  }

  post('debug', 'AKWAM: page loaded: ' + url.substring(0, 120));

  // ── Stage 1: "Click here" intermediate page ────────────────────────────────
  // The selector is always class="download-link" based on inspecting the live HTML.
  // Try multiple selectors in order as fallback.
  var candidates = [
    document.querySelector('a.download-link[href*="akwam"]'),
    document.querySelector('a.download-link'),
    document.querySelector('a[class*="download-link"]'),
    document.querySelector('a[class*="btn-download"]'),
    document.querySelector('a.btn.btn-success[href*="akwam"]'),
    document.querySelector('a.btn.btn-primary[href*="akwam"]'),
    (function() {
      var links = document.querySelectorAll('a');
      for (var i = 0; i < links.length; i++) {
        var txt = (links[i].textContent || '').toLowerCase().trim();
        var href = links[i].href || '';
        if ((txt.indexOf('click') !== -1 || txt.indexOf('اضغط') !== -1) &&
            href && href.indexOf('akwam') !== -1) {
          return links[i];
        }
      }
      return null;
    })(),
  ];

  for (var ci = 0; ci < candidates.length; ci++) {
    var link = candidates[ci];
    if (link && link.href && link.href.indexOf('akwam') !== -1) {
      var target = link.href;
      post('debug', 'AKWAM: found download-link [sel ' + ci + ']: ' + target.substring(0, 100));
      // Post the target URL directly — let React Native navigate the WebView
      // instead of relying on JS navigation (which ads may block)
      post('navigate', target);
      return;
    }
  }

  // ── Stage 2: Final WATCH page ──────────────────────────────────────────────
  if (url.indexOf('/watch/') !== -1 && url.indexOf('akwam') !== -1) {
    var source = document.querySelector('source[type="video/mp4"][src]');
    if (source && source.src && source.src.indexOf('.mp4') !== -1) {
      post('mp4', source.src); return;
    }
    var vlcLink = document.querySelector('a[href^="vlc://"]');
    if (vlcLink && vlcLink.href) {
      var mp4v = vlcLink.href.replace('vlc://', '');
      if (mp4v.indexOf('.mp4') !== -1) { post('mp4', mp4v); return; }
    }
    var bodyText = document.body ? document.body.innerHTML : '';
    var matchW = bodyText.match(/https?:\/\/[^"'<>\s]+\.mp4/);
    if (matchW) { post('mp4', matchW[0]); return; }
    post('debug', 'AKWAM: on watch page but no mp4 found yet');
    return;
  }

  // ── Stage 2: Final DOWNLOAD page ──────────────────────────────────────────
  if (url.indexOf('/download/') !== -1 && url.indexOf('akwam') !== -1) {
    var dlBtn = document.querySelector('a.link.btn[download]');
    if (dlBtn && dlBtn.href && dlBtn.href.indexOf('.mp4') !== -1) {
      post('mp4', dlBtn.href); return;
    }
    var dlBtns = document.querySelectorAll('a[download]');
    for (var di = 0; di < dlBtns.length; di++) {
      var dh = dlBtns[di].href;
      if (dh && dh.indexOf('.mp4') !== -1) { post('mp4', dh); return; }
    }
    var allLinks = document.querySelectorAll('a[href*=".mp4"]');
    for (var li = 0; li < allLinks.length; li++) {
      var lh = allLinks[li].href;
      if (lh) { post('mp4', lh); return; }
    }
    var bodyHtml = document.body ? document.body.innerHTML : '';
    var matchD = bodyHtml.match(/https?:\/\/[^"'<>\s]+\.mp4/);
    if (matchD) { post('mp4', matchD[0]); return; }
    post('debug', 'AKWAM: on download page but no mp4 found yet');
    return;
  }

  post('debug', 'AKWAM: unrecognized page, waiting for redirect...');
})();
true;
`;

// Allowed domains — anything NOT in this list is blocked (ads, trackers, redirects)
// The allowlist approach is stricter than a blocklist and more reliable.
const ALLOWED = [
  'go.akwam.com.co',
  'akwam.com.co',
  'akw.cam',
  'downet.net',
  // Known CDN subdomains used by downet.net for actual mp4 delivery
  's201d1.downet.net', 's202d1.downet.net', 's203d1.downet.net', 's204d1.downet.net',
  's301d1.downet.net', 's301d2.downet.net', 's301d3.downet.net', 's301d4.downet.net',
  's301d5.downet.net', 's301d6.downet.net', 's302d1.downet.net', 's302d2.downet.net',
  's401d1.downet.net', 's402d1.downet.net',
  // Google/Cloudflare needed for page JS (fonts, analytics stripped by block)
  'fonts.googleapis.com',
  'fonts.gstatic.com',
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
  const webViewRef = useRef<any>(null);

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
      } else if (msg.type === 'navigate' && msg.data) {
        // The JS found the download-link href — navigate the WebView to it
        // imperatively rather than relying on JS window.location (ad scripts may block it)
        console.log('[AkwamExtractor] navigating to:', msg.data.substring(0, 80));
        webViewRef.current?.injectJavaScript(
          `window.location.replace(${JSON.stringify(msg.data)}); true;`
        );
      } else if (msg.type === 'debug') {
        console.log('[AkwamExtractor]', msg.data);
      }
    } catch (e) {}
  }, [done]);

  const handleLoadEnd = useCallback(() => {
    // Re-inject the extraction script after every page load
    // (injectedJavaScript only fires once in some RN versions)
    webViewRef.current?.injectJavaScript(AKWAM_JS);
  }, []);

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
        ref={webViewRef}
        source={{ uri: startUrl }}
        style={{ width: SW, height: SH }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        injectedJavaScriptBeforeContentLoaded={AKWAM_PRE_JS}
        injectedJavaScript={AKWAM_JS}
        onLoadEnd={handleLoadEnd}
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
