/**
 * AkwamExtractor
 *
 * Invisible WebView that extracts direct mp4 URLs from akwam.com.co.
 * Strategy:
 *   1. Override window.location to block ad redirects without breaking iframes
 *   2. DOM scan — check <video src>, <source src>, JSON blobs
 *   3. XHR/fetch hook — intercept network requests for .mp4
 *   4. onShouldStartLoadWithRequest only blocks explicit user-click navigations
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

  // ---------- Override window.location to block ad redirects ----------
  const ALLOWED_LOCATION_HOSTS = [
    'akwam.com.co',
    'akw.cam',
    'go.akwam.com.co',
    'two.akw.cam',
    'downet.net',
  ];

  function isAllowedLocation(url) {
    if (!url || url.startsWith('about:') || url.startsWith('javascript:')) return true;
    return ALLOWED_LOCATION_HOSTS.some(h => url.includes(h));
  }

  // Save original functions
  const origAssign = window.location.assign;
  const origReplace = window.location.replace;

  window.location.assign = function(url) {
    if (!isAllowedLocation(url)) {
      console.log('[akwam] blocked assign to', url);
      return;
    }
    return origAssign.call(location, url);
  };

  window.location.replace = function(url) {
    if (!isAllowedLocation(url)) {
      console.log('[akwam] blocked replace to', url);
      return;
    }
    return origReplace.call(location, url);
  };

  // Override the href setter (the most common redirect method)
  let _href = window.location.href;
  Object.defineProperty(window.location, 'href', {
    get: function() { return _href; },
    set: function(url) {
      if (!isAllowedLocation(url)) {
        console.log('[akwam] blocked href set to', url);
        return;
      }
      _href = url;
      // Actually perform the navigation only if allowed
      origAssign.call(location, url);
    },
    configurable: true,
  });
  // ---------- end location override ----------

  // ── 1. DOM scan ──────────────────────────────────────────────
  function scanDOM() {
    var tags = document.querySelectorAll('video[src], source[src]');
    for (var i = 0; i < tags.length; i++) {
      if (isMP4(tags[i].src)) { post(tags[i].src); return; }
    }
    var match = document.documentElement.innerHTML.match(/https?:\\/\\/[^"'<>\\s]+\\.mp4/);
    if (match) { post(match[0]); return; }
  }

  scanDOM();
  document.addEventListener('DOMContentLoaded', scanDOM);

  if (window.MutationObserver) {
    var obs = new MutationObserver(function() { scanDOM(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ── 2. HTMLMediaElement.src setter ───────────────────────────
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

  // ── 3. XHR hook ──────────────────────────────────────────────
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (isMP4(url)) post(url);
    return origOpen.apply(this, arguments);
  };

  // ── 4. fetch hook ────────────────────────────────────────────
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

  const handleNavRequest = useCallback((request: { url: string; navigationType?: string }) => {
    const url = request.url;
    if (!url) return true;

    // Allow internal browser operations
    if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('javascript:')) return true;

    // Capture direct mp4 navigations (server redirects)
    if (url.includes('.mp4')) {
      done(url);
      return false;
    }

    // Handle vlc:// and intent://
    if (url.startsWith('vlc://')) { done(url.replace('vlc://', '')); return false; }
    if (url.startsWith('intent://')) {
      const m = url.match(/intent:\/\/(https?:\/\/[^#;]+)/);
      if (m) done(m[1]);
      return false;
    }

    // Block explicit user navigations to ad domains (clicks, form submits)
    // We rely on JS injection to handle window.location redirects,
    // so only block explicit navigation actions that would leave the page.
    const navType = request.navigationType;
    if (navType === 'click' || navType === 'formsubmit' || navType === 'formresubmit') {
      const ALLOWED_HOSTS = [
        'akwam.com.co', 'go.akwam.com.co', 'akw.cam', 'two.akw.cam', 'downet.net',
      ];
      const isAllowed = ALLOWED_HOSTS.some(h => url.includes(h));
      if (!isAllowed) {
        console.log('[AkwamExtractor] blocked navigation (click) to:', url.substring(0, 80));
        return false;
      }
    }

    // For everything else (iframe loads, ajax, etc.) allow it.
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