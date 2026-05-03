/**
 * VideoExtractor.tsx
 *
 * On-device video extraction using a hidden WebView.
 *
 * v6 — CRITICAL FIX based on HTML analysis:
 *   The video player is NOT on the movie page! It's inside an iframe:
 *     <iframe name="player_iframe" data-src="https://www.fasel-hd.cam/video_player?player_token=...">
 *   The iframe loads lazily on scroll (src="" initially, data-src has the URL).
 *   JWPlayer is INSIDE the iframe — our selectors on the parent page find nothing!
 *
 *   NEW APPROACH:
 *   1. Load the movie page
 *   2. Extract player_token from iframe's data-src attribute
 *   3. Navigate WebView DIRECTLY to /video_player?player_token=TOKEN
 *   4. On the video player page, JWPlayer loads directly (no nested iframe)
 *   5. Our fetch/XHR overrides capture the m3u8
 *
 *   This bypasses the iframe entirely — the video player page becomes
 *   the WebView's main page, so our overrides apply directly.
 *
 * Why on-device:
 *   scdns.io CDN bakes the requesting IP into a signed token path.
 *   Server extraction -> URL only works from server IP -> phone gets 403.
 */

import React, {useRef, useEffect, useCallback} from 'react';
import {View, Dimensions} from 'react-native';
import {WebView} from 'react-native-webview';

const {width: SW, height: SH} = Dimensions.get('window');

// ── JS injected at document-start (BEFORE any page scripts) ─────────
// This runs on EVERY page load (movie page AND video player page)
const PATCH_JS = `
(function() {
  // Signal injection
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'PATCH: injected on ' + window.location.href.substring(0,60)}));
  } catch(e) {}

  // ── Override fetch() ────────────────────────────────────────────
  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    try {
      var url = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
      if (url && url.indexOf('.m3u8') !== -1) {
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'m3u8', url: url}));
      }
    } catch(e) {}
    return origFetch.apply(this, arguments);
  };

  // ── Override XMLHttpRequest.open() ──────────────────────────────
  var origXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    try {
      if (url && url.indexOf('.m3u8') !== -1) {
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'m3u8', url: url}));
      }
    } catch(e) {}
    return origXHROpen.apply(this, arguments);
  };

  // ── Watch for dynamically added iframes and patch them too ──────
  var obs = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(node) {
        if (node.tagName === 'IFRAME') {
          try {
            var win = node.contentWindow;
            if (!win) return;
            if (win.fetch) {
              var iFetch = win.fetch;
              win.fetch = function(input, init) {
                try {
                  var fUrl = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
                  if (fUrl && fUrl.indexOf('.m3u8') !== -1) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({type:'m3u8', url: fUrl}));
                  }
                } catch(e) {}
                return iFetch.apply(this, arguments);
              };
            }
            if (win.XMLHttpRequest) {
              var iXHROpen = win.XMLHttpRequest.prototype.open;
              win.XMLHttpRequest.prototype.open = function(method, url) {
                try {
                  if (url && url.indexOf('.m3u8') !== -1) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({type:'m3u8', url: url}));
                  }
                } catch(e) {}
                return iXHROpen.apply(this, arguments);
              };
            }
          } catch(e) {}
        }
      });
    });
  });
  try {
    var target = document.documentElement || document.body;
    if (target) obs.observe(target, {childList: true, subtree: true});
  } catch(e) {}

  // ── Kill popups ─────────────────────────────────────────────────
  window.open = function() { return null; };
  window.alert = function() {};
  window.confirm = function() { return false; };
  window.prompt = function() { return null; };

  // Final confirmation
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'PATCH: overrides installed OK'}));
  } catch(e) {}
})();
true;
`;

// ── JS injected at document-end (AFTER DOM ready) ────────────────────
// This runs on EVERY page load — behavior depends on which page we're on
const CLICK_JS = `
(function() {
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'DOC-END: ' + window.location.href.substring(0,80)}));
  } catch(e) {}

  // ── STEP 1: On movie page — extract iframe player_token ────────
  var iframe = document.querySelector('iframe[name="player_iframe"]');
  if (iframe) {
    var dataSrc = iframe.getAttribute('data-src');
    var src = iframe.getAttribute('src');
    var playerUrl = dataSrc || src;

    if (playerUrl && playerUrl.indexOf('video_player') !== -1 && playerUrl.indexOf('player_token') !== -1) {
      // Found the player token! Navigate directly to video player page
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'FOUND player_token, navigating to video_player page...'}));
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'Player URL: ' + playerUrl.substring(0,100)}));
      } catch(e) {}
      window.location.href = playerUrl;
      return; // Stop here — will re-enter on video player page
    }

    // If iframe has no src/data-src yet, try the tab buttons
    if (!playerUrl) {
      var tabs = document.querySelectorAll('.tabs-ul li');
      if (tabs.length > 0) {
        var onclick = tabs[0].getAttribute('onclick');
        if (onclick && onclick.indexOf('player_token') !== -1) {
          var match = onclick.match(/href\\s*=\\s*'(https?:\\/\\/[^']+)'/);
          if (match) {
            try {
              window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'FOUND token in tab onclick, navigating...'}));
            } catch(e) {}
            window.location.href = match[1];
            return;
          }
        }
      }
    }
  }

  // ── STEP 2: On video player page — find and click play ────────
  // Check if we're on the video player page
  var isVideoPlayer = window.location.href.indexOf('video_player') !== -1;
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'isVideoPlayer: ' + isVideoPlayer + ' | url: ' + window.location.href.substring(0,60)}));
  } catch(e) {}

  // ── Remove ad overlays continuously ────────────────────────────
  var adSelectors = [
    '[class*="popup"]', '[class*="overlay"]', '[id*="popup"]',
    '[id*="ad"]', '[class*="ad-"]', '.blockadblock',
    '[class*="modal"]', 'ins', 'iframe[src*="ad"]',
    'div[id^="ad-"]', 'div[class*="banner"]', 'div[class*="sponsor"]'
  ];

  function killAds() {
    var count = 0;
    adSelectors.forEach(function(sel) {
      try {
        document.querySelectorAll(sel).forEach(function(el) {
          if (el.className && typeof el.className === 'string' && el.className.indexOf('jw') !== -1) return;
          if (el.id && typeof el.id === 'string' && el.id.indexOf('jw') !== -1) return;
          el.remove();
          count++;
        });
      } catch(e) {}
    });
    return count;
  }

  var removed = killAds();
  if (removed > 0) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'DOC-END: removed ' + removed + ' ad elements'})); } catch(e) {}
  }
  setInterval(function() { killAds(); }, 2000);

  // ── Block clicks on non-allowed links (capture phase) ─────────
  var ALLOWED = [
    'fasel-hd.cam', 'faselhd.com', 'faselhdx.bid',
    'scdns.io', 'jwpcdn.com', 'jwplayer.com'
  ];
  function isAllowed(url) {
    if (!url) return false;
    if (url.indexOf('about:') === 0 || url.indexOf('data:') === 0 || url.indexOf('javascript:') === 0) return true;
    for (var i = 0; i < ALLOWED.length; i++) {
      if (url.indexOf(ALLOWED[i]) !== -1) return true;
    }
    return false;
  }
  document.addEventListener('click', function(e) {
    try {
      var t = e.target;
      while (t && t !== document) {
        if (t.tagName === 'A' && t.href) {
          if (!isAllowed(t.href) && t.href.indexOf('javascript:') !== 0) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          break;
        }
        t = t.parentElement;
      }
    } catch(ex) {}
  }, true);

  // ── On video player page: click play button ───────────────────
  if (isVideoPlayer) {
    // Scroll to make sure lazy elements load
    setTimeout(function() {
      window.scrollTo(0, document.body.scrollHeight / 2);
    }, 1000);

    // Click play button up to 10 times, 2s apart
    var attempts = 0;
    var interval = setInterval(function() {
      attempts++;
      killAds();

      var sels = [
        '.jw-icon.jw-icon-display.jw-button-color.jw-reset',
        '.jw-icon-display',
        '.jw-display-icon-container',
        '.jw-media',
        '[class*="jw-icon"][class*="play"]',
        '[class*="play"][class*="btn"]',
        '[class*="play"][class*="button"]',
        '[class*="video-play"]',
        'video',
        '[id*="player"] [class*="play"]',
        '[id*="video"] [class*="play"]',
      ];

      var clicked = false;
      for (var i = 0; i < sels.length; i++) {
        var el = document.querySelector(sels[i]);
        if (el) {
          el.click();
          clicked = true;
          try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'CLICK #' + attempts + ': ' + sels[i]})); } catch(e) {}
          break;
        }
      }

      if (!clicked) {
        var title = document.title ? document.title.substring(0, 50) : 'no title';
        var bodyLen = document.body ? document.body.innerText.length : 0;
        var jwCount = document.querySelectorAll('[class*="jw"]').length;
        var ifCount = document.querySelectorAll('iframe').length;
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type:'debug',
            msg:'ATTEMPT ' + attempts + ': no btn | title=' + title + ' | body=' + bodyLen + ' | jw=' + jwCount + ' | iframes=' + ifCount
          }));
        } catch(e) {}
      }

      if (attempts >= 10) {
        clearInterval(interval);
        try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'DONE: all 10 attempts finished'})); } catch(e) {}
      }
    }, 2000);
  }
})();
true;
`;

// ── Domain lists ────────────────────────────────────────────────────
const BLOCKED_DOMAINS = [
  // Ad networks from live adb logs
  's8ey.com', 'wplmtckt.com', 'reffpa.com', '1xlite-11151.pro', 'pyppo.com',
  // Common ad/analytics networks
  'googletagmanager.com', 'doubleclick.net', 'googleadservices.com',
  'google-analytics.com', 'popads.net', 'adsterra.com', 'exponential.com',
  'outbrain.com', 'taboola.com', 'scorecardresearch.com', 'madurird.com',
  'acscdn.com', 'crumpetprankerstench.com', 'propellerads.com',
  'clickadu.com', 'ampproject.org', 'adnxs.com', 'ads.yahoo.com',
  'pushnotifications.com', 'push.js', 'notix.io', 'pushwoosh.com',
];

const ALLOWED_DOMAINS = [
  'fasel-hd.cam',   // original domain + video_player page
  'faselhd.com',    // alternative domain
  'faselhdx.bid',   // site redirects to this domain
  'scdns.io',       // CDN (m3u8 URLs)
  'jwpcdn.com',     // JWPlayer CDN
  'jwplayer.com',   // JWPlayer
];

// ── Props ────────────────────────────────────────────────────────────
interface VideoExtractorProps {
  pageUrl: string;
  onExtracted: (m3u8Url: string) => void;
  onError: (reason?: 'timeout' | 'load' | 'http') => void;
  onDebug?: (msg: string) => void;
  timeoutMs?: number;
}

// ── Component ────────────────────────────────────────────────────────
export const VideoExtractor: React.FC<VideoExtractorProps> = ({
  pageUrl,
  onExtracted,
  onError,
  onDebug,
  timeoutMs = 40000,
}) => {
  const captured = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const dbg = useCallback((msg: string) => {
    console.log('[VE]', msg);
    onDebug?.(msg);
  }, [onDebug]);

  useEffect(() => {
    dbg('START: loading ' + pageUrl);
    timer.current = setTimeout(() => {
      if (!captured.current) {
        captured.current = true;
        dbg('TIMEOUT: ' + timeoutMs + 'ms with no m3u8');
        onError('timeout');
      }
    }, timeoutMs);
    return () => clearTimeout(timer.current);
  }, [dbg, timeoutMs, onError]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'm3u8' && data.url && !captured.current) {
        captured.current = true;
        clearTimeout(timer.current);
        dbg('CAPTURED: ' + data.url);
        onExtracted(data.url);
        return;
      }

      if (data.type === 'debug') {
        dbg(data.msg);
      }
    } catch (e) {}
  };

  const handleShouldStartLoad = (request: {url: string}) => {
    const url = request.url;

    // Capture m3u8 via navigation
    if (url.includes('.m3u8') && !captured.current) {
      captured.current = true;
      clearTimeout(timer.current);
      dbg('CAPTURED (nav): ' + url);
      onExtracted(url);
      return false;
    }

    // Allow internal URLs
    if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('javascript:')) {
      return true;
    }

    // Block intent:// URLs (Android Chrome deep links from ads)
    if (url.startsWith('intent://')) {
      dbg('BLOCKED intent:// URL');
      return false;
    }

    // Block known ad/analytics domains
    if (BLOCKED_DOMAINS.some(d => url.includes(d))) {
      dbg('BLOCKED ad: ' + url.substring(0, 70));
      return false;
    }

    // Only allow whitelisted domains
    if (ALLOWED_DOMAINS.some(d => url.includes(d))) {
      dbg('ALLOW: ' + url.substring(0, 70));
      return true;
    }

    // Block everything else
    dbg('BLOCKED unknown: ' + url.substring(0, 70));
    return false;
  };

  const handleLoad = () => dbg('LOADED: ' + pageUrl);

  const handleLoadError = () => {
    if (!captured.current) {
      captured.current = true;
      clearTimeout(timer.current);
      dbg('ERROR: WebView failed to load');
      onError('load');
    }
  };

  const handleHttpError = (syntheticEvent: any) => {
    const statusCode = syntheticEvent?.nativeEvent?.statusCode || 0;
    // Ignore redirects (3xx) — FaselHD uses them heavily for domain resolution
    // Only hard-fail on server errors (5xx) or explicit 404
    if (statusCode >= 500 || statusCode === 404) {
      if (!captured.current) {
        captured.current = true;
        clearTimeout(timer.current);
        dbg('HTTP_ERROR: status ' + statusCode);
        onError();
      }
    } else {
      dbg('HTTP_WARN (ignored): status ' + statusCode);
    }
  };

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute', top: 0, left: 0,
        width: SW, height: SH,
        opacity: 0, overflow: 'hidden', zIndex: -1,
      }}
    >
      <WebView
        source={{uri: pageUrl}}
        style={{width: SW, height: SH, backgroundColor: '#000'}}
        javaScriptEnabled
        injectedJavaScriptBeforeContentLoaded={PATCH_JS}
        injectedJavaScript={CLICK_JS}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onLoad={handleLoad}
        onError={handleLoadError}
        onHttpError={handleHttpError}
        userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        scalesPageToFit={false}
        muted
        cacheEnabled={false}
        cacheMode="LOAD_NO_CACHE"
        thirdPartyCookiesEnabled={false}
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        allowFileAccess={false}
        domStorageEnabled={false}
        geolocationEnabled={false}
        mixedContentMode="compatibility"
      />
    </View>
  );
};
