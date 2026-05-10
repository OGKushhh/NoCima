import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Dimensions } from 'react-native';
import { WebView } from 'react-native-webview';

const { width: SW, height: SH } = Dimensions.get('window');

export type AkwamExtractMode = 'watch' | 'download';

interface AkwamExtractorProps {
  /** e.g. http://go.akwam.com.co/watch/130928 or episode URL */
  startUrl: string;
  mode: AkwamExtractMode;
  onExtracted: (streamUrl: string) => void;
  onError: () => void;
  timeoutMs?: number;
}

// ── 1. Resolve shortener → real episode URL ────────────────────────────────
async function resolveShortener(url: string): Promise<string> {
  // If it's already an episode page, don't fetch
  if (url.includes('akwam.com.co/episode/')) return url;
  if (url.includes('akwam.com.co/download/')) return url;

  const resp = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    },
  });
  const html = await resp.text();

  // Find the real episode/download link from the shortener page
  const match = html.match(
    /<a\s[^>]*href="(https?:\/\/akwam\.com\.co\/(episode|download)\/[^"]+)"[^>]*class="[^"]*download-link[^"]*"/i
  );
  if (match) return match[1];

  // Fallback: any /episode/ or /download/ link
  const fallback = html.match(
    /https?:\/\/akwam\.com\.co\/(episode|download)\/[^\s"']+/
  );
  if (fallback) return fallback[0];

  throw new Error('Could not resolve shortener URL');
}

// ── 2. Injected JavaScript (before page load) ───────────────────────────────
const PATCH_JS = `
(function() {
  try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'PATCH: injected on ' + window.location.href.substring(0,80)})); } catch(e) {}

  var _post = function(url) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'m3u8', url: url})); } catch(e) {}
  };

  // Override fetch
  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    try {
      var url = (typeof input === 'string') ? input : (input && input.url ? input.url : String(input));
      if (url && (url.indexOf('.m3u8') !== -1 || url.indexOf('.mp4') !== -1)) _post(url);
    } catch(e) {}
    return origFetch.apply(this, arguments);
  };

  // Override XHR
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    try { if (url && (url.indexOf('.m3u8') !== -1 || url.indexOf('.mp4') !== -1)) _post(url); } catch(e) {}
    return origOpen.apply(this, arguments);
  };

  // Override HTMLMediaElement.src (for direct video src changes)
  try {
    var desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (desc && desc.set) {
      var origSet = desc.set;
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        set: function(val) {
          try { if (val && (val.indexOf('.m3u8') !== -1 || val.indexOf('.mp4') !== -1)) _post(val); } catch(e) {}
          return origSet.call(this, val);
        },
        get: desc.get,
        configurable: true,
      });
    }
  } catch(e) {}

  // Block popups and alerts
  window.open    = function() { return null; };
  window.alert   = function() {};
  window.confirm = function() { return false; };
  window.prompt  = function() { return null; };

  try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'PATCH: all overrides installed'})); } catch(e) {}
})();
true;
`;

// ── 3. Injected JavaScript (after page load) – handles navigation & clicks ───
const CLICK_JS = `
(function() {
  try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'DOC-END: ' + window.location.href.substring(0,100)})); } catch(e) {}

  // ── STEP 1: If on episode/download page, find the player iframe and navigate to it ──
  // Akwam embeds the player in an iframe whose src points to a CDN player (downet.net etc.)
  var playerIframe = document.querySelector('iframe[src*="player"]') ||
                     document.querySelector('iframe[src*="downet.net"]') ||
                     document.querySelector('iframe[src*="akw.cam"]') ||
                     document.querySelector('iframe[src*="cdn"]') ||
                     document.querySelector('iframe');

  if (playerIframe) {
    var playerUrl = playerIframe.getAttribute('src') || playerIframe.getAttribute('data-src');
    if (playerUrl && playerUrl.indexOf('http') !== 0) {
      playerUrl = window.location.origin + (playerUrl.charAt(0) === '/' ? '' : '/') + playerUrl;
    }
    if (playerUrl && playerUrl.indexOf('video_player') === -1 && playerUrl.indexOf('player') !== -1) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'STEP1: navigating to player: ' + playerUrl.substring(0,100)})); } catch(e) {}
      window.location.href = playerUrl;
      return;
    }
  }

  // Fallback: look for any link that contains 'player_token' or 'video_player'
  var candidates = document.querySelectorAll('[href*="player_token"], [data-src*="player_token"], [href*="video_player"], [data-src*="video_player"]');
  if (candidates.length > 0) {
    var u = candidates[0].getAttribute('href') || candidates[0].getAttribute('data-src');
    if (u) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'STEP1 (fallback): ' + u.substring(0,100)})); } catch(e) {}
      window.location.href = u;
      return;
    }
  }

  // ── STEP 2: On the player page, remove ads and click play ────────────────
  var isPlayerPage = window.location.href.indexOf('player') !== -1 ||
                     window.location.href.indexOf('downet.net') !== -1 ||
                     window.location.href.indexOf('embed') !== -1;

  // Ad cleanup (same as Fasel)
  var AD_SEL = [
    '[class*="popup"]', '[id*="popup"]', '[id*="ad-"]',
    '[class*="ad-"]:not([class*="jw"])', '.blockadblock', 'ins',
    'div[class*="banner"]:not([class*="jw"])', 'div[class*="sponsor"]',
  ];
  function killAds() {
    AD_SEL.forEach(function(sel) {
      try {
        document.querySelectorAll(sel).forEach(function(el) {
          var cls = (el.className && typeof el.className === 'string') ? el.className : '';
          if (cls.indexOf('jw') !== -1 || (el.id && el.id.indexOf('jw') !== -1)) return;
          el.remove();
        });
      } catch(e) {}
    });
  }
  killAds();
  setInterval(killAds, 1500);

  // Block clicks that would navigate away from safe domains
  var ALLOWED_NAV = [
    'akwam.com.co', 'akw.cam', 'downet.net', 's204d1.downet.net',
    'cdn.jwplayer.com', 'content.jwplatform.com', 'jwpcdn.com', 'jwplayer.com',
    'scdns.io'
  ];
  document.addEventListener('click', function(e) {
    try {
      var t = e.target;
      while (t && t !== document) {
        if (t.tagName === 'A' && t.href && t.href.indexOf('javascript:') !== 0) {
          var ok = ALLOWED_NAV.some(function(d) { return t.href.indexOf(d) !== -1; });
          if (!ok) { e.preventDefault(); e.stopPropagation(); return; }
          break;
        }
        t = t.parentElement;
      }
    } catch(ex) {}
  }, true);

  if (!isPlayerPage) return;

  // Scroll to trigger lazy-load
  setTimeout(function() { try { window.scrollTo(0, document.body.scrollHeight / 2); } catch(e) {} }, 800);

  // Click play button repeatedly
  var attempts = 0;
  var PLAY_SEL = [
    '.jw-icon-display',
    '.jw-icon.jw-icon-display',
    '.jw-display-icon-container',
    '[class*="jw-icon"][class*="play"]',
    '.jw-media video',
    'video',
    '[class*="play"][class*="btn"]',
    '[class*="play"][class*="button"]',
    '[class*="video-play"]',
    '[id*="player"] [class*="play"]',
  ];

  var iv = setInterval(function() {
    attempts++;
    killAds();

    var clicked = false;
    for (var i = 0; i < PLAY_SEL.length; i++) {
      var el = document.querySelector(PLAY_SEL[i]);
      if (el) {
        try { el.click(); } catch(e) {}
        clicked = true;
        try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'CLICK #' + attempts + ' on: ' + PLAY_SEL[i]})); } catch(e) {}
        break;
      }
    }

    if (!clicked) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'ATTEMPT ' + attempts + ': no play btn, jw=' + document.querySelectorAll('[class*="jw"]').length + ', video=' + document.querySelectorAll('video').length})); } catch(e) {}
    }

    if (attempts >= 10) {
      clearInterval(iv);
      try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'DONE: 10 attempts exhausted'})); } catch(e) {}
    }
  }, 2000);
})();
true;
`;

const AkwamExtractor: React.FC<AkwamExtractorProps> = ({
  startUrl,
  mode,
  onExtracted,
  onError,
  timeoutMs = 45000,
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const capturedRef = useRef(false);
  const globalTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Resolve the shortener first
  useEffect(() => {
    resolveShortener(startUrl)
      .then(url => {
        setResolvedUrl(url);
      })
      .catch(() => onError());
  }, [startUrl]);

  const commit = useCallback((streamUrl?: string) => {
    if (capturedRef.current) return;
    capturedRef.current = true;
    clearTimeout(globalTimerRef.current);
    if (streamUrl) onExtracted(streamUrl);
    else onError();
  }, [onExtracted, onError]);

  useEffect(() => {
    if (!resolvedUrl) return;
    capturedRef.current = false;
    globalTimerRef.current = setTimeout(() => {
      commit();
    }, timeoutMs);
    return () => clearTimeout(globalTimerRef.current);
  }, [resolvedUrl, commit, timeoutMs]);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'm3u8' && data.url && !capturedRef.current) {
        commit(data.url);
        return;
      }
      if (data.type === 'debug') {
        console.log('[AkwamExtractor]', data.msg);
      }
    } catch (e) {}
  }, [commit]);

  const handleNavRequest = useCallback((request: { url: string; navigationType?: string }) => {
    const url = request.url;

    // Allow about:blank, data:, etc.
    if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('blob:'))
      return true;

    // Capture direct stream URLs
    if ((url.includes('.m3u8') || url.includes('.mp4')) && !capturedRef.current) {
      commit(url);
      return false;
    }

    // Block ad/tracker domains
    const BLOCKED = [
      's8ey.com', 'wplmtckt.com', 'reffpa.com', '1xlite', 'pyppo.com',
      'googletagmanager.com', 'doubleclick.net', 'googleadservices.com',
      'google-analytics.com', 'popads.net', 'adsterra.com', 'propellerads.com',
      'clickadu.com', 'shounsirgie.net', 'acceptableredheadcaviar.com'
    ];
    if (BLOCKED.some(d => url.includes(d))) return false;

    // Akwam core domains + CDN
    const ALLOWED = [
      'akwam.com.co', 'akw.cam', 'downet.net', 'cdn.jwplayer.com',
      'content.jwplatform.com', 'jwpcdn.com', 'jwplayer.com',
      'cloudfront.net', 'akamaized.net', 'fastly.net'
    ];
    if (ALLOWED.some(d => url.includes(d))) return true;

    // Catch iframe loads that aren't blocked – allow them
    if (request.navigationType === 'other') return true;

    return false;
  }, [commit]);

  if (!resolvedUrl) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', top: 0, left: 0,
        width: 1, height: 1,
        opacity: 0, overflow: 'hidden',
      }}
    >
      <WebView
        source={{ uri: resolvedUrl }}
        style={{ width: SW, height: SH }}
        javaScriptEnabled
        injectedJavaScriptBeforeContentLoaded={PATCH_JS}
        injectedJavaScript={CLICK_JS}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleNavRequest}
        onError={() => commit()}
        onHttpError={() => commit()}
        userAgent="Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        domStorageEnabled
        thirdPartyCookiesEnabled
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        allowFileAccess={false}
        geolocationEnabled={false}
        mixedContentMode="compatibility"
      />
    </View>
  );
};

export default AkwamExtractor;