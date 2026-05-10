import React, {useRef, useEffect, useState, useCallback} from 'react';
import {View} from 'react-native';
import {WebView} from 'react-native-webview';

interface Props {
  watchUrl: string;   // "go.akwam.com.co/watch/130928" from JSON
  onExtracted: (mp4Url: string) => void;
  onError: () => void;
  timeoutMs?: number;
}

/** Resolve shortener by following redirects → final /watch/... page */
async function resolveFinalWatchUrl(watchUrl: string): Promise<string> {
  const resp = await fetch(watchUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
    },
  });
  return resp.url; // now the final /watch/130928/71523/... URL
}

const JS = `
(function() {
  if (window.__done) return;
  window.__done = false;

  function send(url) {
    if (url && url.startsWith('http') && (url.includes('.mp4') || url.includes('.m3u8'))) {
      window.ReactNativeWebView.postMessage(url);
      window.__done = true;
    }
  }

  function grab() {
    var el = document.querySelector('#player source[src]');
    if (el) send(el.getAttribute('src'));
  }

  // Grab as soon as the DOM is ready, then poll quickly
  document.addEventListener('DOMContentLoaded', function() {
    grab();
    setInterval(grab, 200);
  });

  // Also react to any late‑appearing elements
  new MutationObserver(grab).observe(document.body, {childList: true, subtree: true});
})();
true;
`;

const AkwamExtractor: React.FC<Props> = ({
  watchUrl,
  onExtracted,
  onError,
  timeoutMs = 20000,
}) => {
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const doneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    resolveFinalWatchUrl(watchUrl)
      .then(setFinalUrl)
      .catch(() => onError());
  }, [watchUrl]);

  const done = useCallback((mp4?: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimeout(timerRef.current);
    mp4 ? onExtracted(mp4) : onError();
  }, [onExtracted, onError]);

  useEffect(() => {
    if (!finalUrl) return;
    doneRef.current = false;
    timerRef.current = setTimeout(() => done(), timeoutMs);
    return () => clearTimeout(timerRef.current);
  }, [finalUrl]);

  const handleMessage = useCallback((e: any) => {
    const url = e.nativeEvent.data;
    if (url && url.startsWith('http')) done(url);
  }, [done]);

  if (!finalUrl) return null;

  return (
    <View pointerEvents="none" style={{position:'absolute',width:1,height:1,opacity:0,overflow:'hidden'}}>
      <WebView
        source={{uri: finalUrl}}
        javaScriptEnabled domStorageEnabled thirdPartyCookiesEnabled
        injectedJavaScriptBeforeContentLoaded={JS}
        onMessage={handleMessage}
        onError={() => done()}
        onHttpError={() => done()}
        userAgent="Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"
        setSupportMultipleWindows={false}
        originWhitelist={['*']}
        mixedContentMode="compatibility"
      />
    </View>
  );
};

export default AkwamExtractor;