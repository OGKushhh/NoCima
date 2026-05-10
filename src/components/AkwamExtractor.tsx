import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';

const { width: SW, height: SH } = Dimensions.get('window');

export type AkwamExtractMode = 'watch' | 'download';

interface Props {
  startUrl: string;               // e.g. http://go.akwam.com.co/watch/130928
  mode: AkwamExtractMode;
  onExtracted: (mp4Url: string) => void;
  onError: () => void;
  timeoutMs?: number;
}

/** Fetch the shortener page and return the final episode URL (akwam.com.co/episode/...) */
async function resolveShortener(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    },
  });
  const html = await resp.text();

  // The page contains a link like:
  // <a href="https://akwam.com.co/episode/71523/..." class="download-link">
  const match = html.match(
    /<a\s[^>]*href="(https?:\/\/akwam\.com\.co\/episode\/[^"]+)"[^>]*class="[^"]*download-link[^"]*"/i
  );
  if (match) return match[1];

  // Alternative: any link to /episode/ in the page
  const generalMatch = html.match(/https?:\/\/akwam\.com\.co\/episode\/[^\s"']+/);
  if (generalMatch) return generalMatch[0];

  throw new Error('Could not resolve watch shortener URL');
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

  // DOM scan
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

  // Override video.src
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

  // XHR / fetch hooks
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (isMP4(url)) post(url);
    return origOpen.apply(this, arguments);
  };
  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url);
    if (isMP4(url)) post(url);
    return origFetch.apply(this, arguments);
  };
})();
true;
`;

const AkwamExtractor: React.FC<Props> = ({
  startUrl,
  mode,
  onExtracted,
  onError,
  timeoutMs = 30000,
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const doneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Resolve the shortener URL before showing the WebView
  useEffect(() => {
    resolveShortener(startUrl)
      .then(setResolvedUrl)
      .catch(() => onError());
  }, [startUrl]);

  const done = useCallback(
    (mp4?: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      clearTimeout(timerRef.current);
      mp4 ? onExtracted(mp4) : onError();
    },
    [onExtracted, onError]
  );

  useEffect(() => {
    if (!resolvedUrl) return;
    doneRef.current = false;
    timerRef.current = setTimeout(() => {
      console.warn('[AkwamExtractor] timeout waiting for mp4');
      done();
    }, timeoutMs);
    return () => clearTimeout(timerRef.current);
  }, [resolvedUrl]);

  const handleMessage = useCallback(
    (event: any) => {
      const url = event.nativeEvent.data;
      if (url && url.startsWith('http') && url.includes('.mp4')) {
        console.log('[AkwamExtractor] captured mp4:', url.substring(0, 80));
        done(url);
      }
    },
    [done]
  );

  const handleNavRequest = useCallback(
    (request: { url: string; navigationType?: string }) => {
      const url = request.url;
      if (!url) return true;

      if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('javascript:'))
        return true;

      if (url.includes('.mp4')) {
        done(url);
        return false;
      }

      if (url.startsWith('vlc://')) {
        done(url.replace('vlc://', ''));
        return false;
      }
      if (url.startsWith('intent://')) {
        const m = url.match(/intent:\/\/(https?:\/\/[^#;]+)/);
        if (m) done(m[1]);
        return false;
      }

      // Block ad clicks but let real player iframes through
      const navType = request.navigationType;
      if (navType === 'click' || navType === 'formsubmit' || navType === 'formresubmit') {
        const ALLOWED = [
          'akwam.com.co', 'go.akwam.com.co', 'akw.cam', 'two.akw.cam', 'downet.net',
        ];
        if (!ALLOWED.some(h => url.includes(h))) {
          console.log('[AkwamExtractor] blocked click nav:', url.substring(0, 80));
          return false;
        }
      }
      return true;
    },
    [done]
  );

  if (!resolvedUrl) {
    // Still resolving – show nothing (or a tiny loader if you want)
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        opacity: 0,
        overflow: 'hidden',
      }}
    >
      <WebView
        source={{ uri: resolvedUrl }}
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