/**
 * AkwamExtractor
 *
 * Invisible WebView that extracts direct mp4 URLs from akwam.com.co.
 * Strategy (in order):
 *   1. DOM scan — check <video src>, <source src>, JSON blobs in page HTML
 *   2. XHR/fetch hook — intercept any network request whose URL contains .mp4
 * Normal navigation is allowed — no location overrides, no redirect hacks.
 * Stops as soon as the first valid mp4 URL is found.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { View, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';

const { width: SW, height: SH } = Dimensions.get('window');

export type AkwamExtractMode = 'watch' | 'download';

interface AkwamExtractorProps {
  startUrl: string;
  mode: AkwamExtractMode;
  onExtracted: (mp4Url: string) => void;
  onError: () => void;
  timeoutMs?: number;
}

const INJECTED_JS = `
(function() {
  if (window.__akwamHooked) return;
  window.__akwamHooked = true;

  function post(url) {
    try { window.ReactNativeWebView.postMessage(url); } catch(e) {}
  }

  function isMP4(url) {
    return typeof url === 'string' && url.startsWith('http') && url.includes('.mp4');
  }

  // ── 1. DOM scan (runs immediately and after DOMContentLoaded) ──────────────
  function scanDOM() {
    // <video src="..."> or <source src="...">
    var tags = document.querySelectorAll('video[src], source[src]');
    for (var i = 0; i < tags.length; i++) {
      if (isMP4(tags[i].src)) { post(tags[i].src); return; }
    }
    // JSON blobs or inline strings anywhere in the page HTML
    var match = document.documentElement.innerHTML.match(/https?:\\/\\/[^"'<>\\s]+\\.mp4/);
    if (match) { post(match[0]); return; }
  }

  scanDOM();
  document.addEventListener('DOMContentLoaded', scanDOM);

  // Also watch for dynamically inserted video/source elements
  if (window.MutationObserver) {
    var obs = new MutationObserver(function() { scanDOM(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ── 2. HTMLMediaElement.src setter ────────────────────────────────────────
  var origSrcDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
  if (origSrcDesc) {
    Object.defineProperty(HTMLMediaElement.prototype, 'src', {
      set: function(val) {
        if (isMP4(val)) post(val);
        if (origSrcDesc.set) origSrcDesc.set.call(this, val);
      },
      get: origSrcDesc.get,
      configurable: true,
    });
  }

  // ── 3. XHR hook ───────────────────────────────────────────────────────────
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (isMP4(url)) post(url);
    return origOpen.apply(this, arguments);
  };

  // ── 4. fetch hook ─────────────────────────────────────────────────────────
  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url);
    if (isMP4(url)) post(url);
    return origFetch.apply(this, arguments);
  };
})();
true;
`;

const AkwamExtractor: React.FC<AkwamExtractorProps> = ({
  startUrl,
  mode,
  onExtracted,
  onError,
  timeoutMs = 30000,
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
      console.warn('[AkwamExtractor] timeout waiting for mp4');
      done();
    }, timeoutMs);
    return () => clearTimeout(timerRef.current);
  }, [startUrl]);

  const handleMessage = useCallback((event: any) => {
    const url = event.nativeEvent.data;
    if (url && url.startsWith('http') && url.includes('.mp4')) {
      console.log('[AkwamExtractor] captured mp4:', url.substring(0, 80));
      done(url);
    }
  }, [done]);

  const handleNavRequest = useCallback((request: { url: string }) => {
    const url = request.url;
    // Intercept direct mp4 navigations (e.g. redirect straight to file)
    if (url && (url.includes('.mp4'))) {
      done(url.split('?')[0].includes('.mp4') ? url : url);
      return false;
    }
    return true;
  }, [done]);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: 1, height: 1,
        opacity: 0,
        overflow: 'hidden',
      }}
    >
      <WebView
        source={{ uri: startUrl }}
        style={{ width: SW, height: SH }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        injectedJavaScriptBeforeContentLoaded={INJECTED_JS}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleNavRequest}
        onError={() => done()}
        onHttpError={() => done()}
        userAgent="Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        setSupportMultipleWindows={false}
        originWhitelist={['*']}
        mixedContentMode="always"
      />
    </View>
  );
};

export default AkwamExtractor;
