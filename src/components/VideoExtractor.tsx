/**
 * VideoExtractor.tsx  v7
 *
 * Fixes vs v6 (original):
 *  1. domStorageEnabled={true}        — JWPlayer requires localStorage to init.
 *                                        Without it JWPlayer silently fails before
 *                                        ever requesting the m3u8.
 *  2. thirdPartyCookiesEnabled={true} — player_token page sets session cookies
 *                                        needed for CDN token validation.
 *  3. cacheEnabled left as default (true) — lets JWPlayer's JS bundle cache so
 *                                        it loads fast and doesn't time out.
 *  4. muted removed (defaults false)  — some JWPlayer builds won't fire the
 *                                        stream request if the element is muted.
 *  5. Broader CDN allowlist           — cloudfront.net, akamaized.net, fastly.net
 *                                        etc. added for HLS segment domains.
 *  6. PATCH_JS intercepts video.src   — JWPlayer sometimes sets src directly
 *                                        on HTMLVideoElement instead of fetch/XHR.
 *  7. Removed cacheMode="LOAD_NO_CACHE" — was preventing JWPlayer JS bundle
 *                                        from caching, causing frequent timeouts.
 */

import React, {useRef, useEffect, useCallback} from 'react';
import {View, Dimensions} from 'react-native';
import {WebView} from 'react-native-webview';

const {width: SW, height: SH} = Dimensions.get('window');

// ── JS injected BEFORE any page scripts ─────────────────────────────────────
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
      if (url && url.indexOf('.m3u8') !== -1) _post(url);
    } catch(e) {}
    return origFetch.apply(this, arguments);
  };

  // Override XHR
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    try { if (url && url.indexOf('.m3u8') !== -1) _post(url); } catch(e) {}
    return origOpen.apply(this, arguments);
  };

  // Override HTMLMediaElement.src (JWPlayer sometimes sets it directly)
  try {
    var desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (desc && desc.set) {
      var origSet = desc.set;
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        set: function(val) {
          try { if (val && val.indexOf('.m3u8') !== -1) _post(val); } catch(e) {}
          return origSet.call(this, val);
        },
        get: desc.get,
        configurable: true,
      });
    }
  } catch(e) {}

  // Patch iframes as they are added
  var obs = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(node) {
        if (node.tagName !== 'IFRAME') return;
        try {
          var win = node.contentWindow;
          if (!win) return;
          if (win.fetch) {
            var iF = win.fetch;
            win.fetch = function(input, init) {
              try { var u = typeof input === 'string' ? input : (input && input.url ? input.url : ''); if (u && u.indexOf('.m3u8') !== -1) _post(u); } catch(e) {}
              return iF.apply(this, arguments);
            };
          }
          if (win.XMLHttpRequest) {
            var iX = win.XMLHttpRequest.prototype.open;
            win.XMLHttpRequest.prototype.open = function(method, url) {
              try { if (url && url.indexOf('.m3u8') !== -1) _post(url); } catch(e) {}
              return iX.apply(this, arguments);
            };
          }
        } catch(e) {}
      });
    });
  });
  try { obs.observe(document.documentElement || document.body, {childList: true, subtree: true}); } catch(e) {}

  // Suppress new tabs / popups
  window.open    = function() { return null; };
  window.alert   = function() {};
  window.confirm = function() { return false; };
  window.prompt  = function() { return null; };

  try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'PATCH: all overrides installed'})); } catch(e) {}
})();
true;
`;

// ── JS injected AFTER DOM ready ──────────────────────────────────────────────
const CLICK_JS = `
(function() {
  try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'DOC-END: ' + window.location.href.substring(0,100)})); } catch(e) {}

  // STEP 1 — Movie page: navigate to video_player page
  var iframe = document.querySelector('iframe[name="player_iframe"]');
  if (iframe) {
    var playerUrl = iframe.getAttribute('data-src') || iframe.getAttribute('src');
    if (playerUrl && playerUrl.indexOf('video_player') !== -1) {
      if (playerUrl.indexOf('http') !== 0) {
        playerUrl = window.location.origin + (playerUrl.charAt(0) === '/' ? '' : '/') + playerUrl;
      }
      try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'STEP1: navigating to video_player: ' + playerUrl.substring(0,100)})); } catch(e) {}
      window.location.href = playerUrl;
      return;
    }
  }

  // Fallback: any element with player_token in href/data-src
  var candidates = document.querySelectorAll('[href*="player_token"], [data-src*="player_token"]');
  if (candidates.length > 0) {
    var u = candidates[0].getAttribute('href') || candidates[0].getAttribute('data-src');
    if (u) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'STEP1 (fallback): ' + u.substring(0,100)})); } catch(e) {}
      window.location.href = u;
      return;
    }
  }

  // STEP 2 — Video player page: remove ads, click play
  var isVideoPlayer = window.location.href.indexOf('video_player') !== -1;

  var AD_SEL = [
    '[class*="popup"]',
    '[id*="popup"]', '[id*="ad-"]',
    '[class*="ad-"]:not([class*="jw"])',
    '.blockadblock', 'ins',
    'div[class*="banner"]:not([class*="jw"])',
    'div[class*="sponsor"]',
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

  // Block clicks navigating away from allowed domains
  var ALLOWED_NAV = ['fasel-hd.cam','faselhd.com','faselhd.tv','faselhdx.bid','scdns.io','jwpcdn.com','jwplayer.com'];
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

  if (!isVideoPlayer) return;

  // Scroll to trigger lazy load
  setTimeout(function() { try { window.scrollTo(0, document.body.scrollHeight / 2); } catch(e) {} }, 800);

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
      try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'ATTEMPT ' + attempts + ': no play btn | jw=' + document.querySelectorAll('[class*="jw"]').length + ' | video=' + document.querySelectorAll('video').length})); } catch(e) {}
    }

    if (attempts >= 10) {
      clearInterval(iv);
      try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'DONE: 10 attempts exhausted'})); } catch(e) {}
    }
  }, 2000);
})();
true;
`;

// ── Blocked ad/tracker domains ───────────────────────────────────────────────
const BLOCKED_DOMAINS = [
  's8ey.com', 'wplmtckt.com', 'reffpa.com', '1xlite-11151.pro', 'pyppo.com',
  'googletagmanager.com', 'doubleclick.net', 'googleadservices.com',
  'google-analytics.com', 'popads.net', 'adsterra.com', 'exponential.com',
  'outbrain.com', 'taboola.com', 'scorecardresearch.com', 'madurird.com',
  'acscdn.com', 'crumpetprankerstench.com', 'propellerads.com',
  'clickadu.com', 'adnxs.com', 'ads.yahoo.com',
  'notix.io', 'pushwoosh.com', 'onesignal.com',
];

// ── Allowed domains ──────────────────────────────────────────────────────────
const ALLOWED_DOMAINS = [
  'fasel-hd.cam',
  'faselhd.com',
  'faselhd.tv',
  'faselhdx.bid',
  'faselhdx.com',
  'scdns.io',
  'jwpcdn.com',
  'jwplayer.com',
  'cdn.jwplayer.com',
  'content.jwplatform.com',
  'ssl.p.jwpcdn.com',
  'cloudfront.net',
  'akamaized.net',
  'akamai.net',
  'fastly.net',
  'llnwd.net',
  'edgesuite.net',
];

interface VideoExtractorProps {
  pageUrl: string;
  onExtracted: (m3u8Url: string) => void;
  onError: (reason?: 'timeout' | 'load' | 'http') => void;
  onDebug?: (msg: string) => void;
  timeoutMs?: number;
}

export const VideoExtractor: React.FC<VideoExtractorProps> = ({
  pageUrl,
  onExtracted,
  onError,
  onDebug,
  timeoutMs = 45000,
}) => {
  const captured = useRef(false);
  const timer    = useRef<ReturnType<typeof setTimeout>>();

  const dbg = useCallback((msg: string) => {
    console.log('[VE]', msg);
    onDebug?.(msg);
  }, [onDebug]);

  useEffect(() => {
    captured.current = false;
    dbg('START: ' + pageUrl);
    timer.current = setTimeout(() => {
      if (!captured.current) {
        captured.current = true;
        dbg('TIMEOUT after ' + timeoutMs + 'ms');
        onError('timeout');
      }
    }, timeoutMs);
    return () => clearTimeout(timer.current);
  }, [pageUrl]);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'm3u8' && data.url && !captured.current) {
        captured.current = true;
        clearTimeout(timer.current);
        dbg('CAPTURED: ' + data.url);
        onExtracted(data.url);
        return;
      }
      if (data.type === 'debug') dbg(data.msg);
    } catch (e) {}
  }, [onExtracted, dbg]);

  const handleShouldStartLoad = useCallback((request: {url: string}) => {
    const url = request.url;

    if (url.includes('.m3u8') && !captured.current) {
      captured.current = true;
      clearTimeout(timer.current);
      dbg('CAPTURED (nav): ' + url);
      onExtracted(url);
      return false;
    }

    if (url.startsWith('about:') || url.startsWith('data:') ||
        url.startsWith('javascript:') || url.startsWith('blob:')) return true;

    if (url.startsWith('intent://')) {
      dbg('BLOCKED intent://');
      return false;
    }

    if (BLOCKED_DOMAINS.some(d => url.includes(d))) {
      dbg('BLOCKED: ' + url.substring(0, 80));
      return false;
    }

    if (ALLOWED_DOMAINS.some(d => url.includes(d))) return true;

    dbg('BLOCKED unknown: ' + url.substring(0, 80));
    return false;
  }, [onExtracted, dbg]);

  const handleLoadError = useCallback(() => {
    if (!captured.current) {
      captured.current = true;
      clearTimeout(timer.current);
      dbg('WebView load error');
      onError('load');
    }
  }, [onError, dbg]);

  const handleHttpError = useCallback((e: any) => {
    const code = e?.nativeEvent?.statusCode || 0;
    if (code >= 500 || code === 404) {
      if (!captured.current) {
        captured.current = true;
        clearTimeout(timer.current);
        dbg('HTTP error: ' + code);
        onError('http');
      }
    } else {
      dbg('HTTP warn (ignored): ' + code);
    }
  }, [onError, dbg]);

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
        style={{width: SW, height: SH}}
        javaScriptEnabled
        injectedJavaScriptBeforeContentLoaded={PATCH_JS}
        injectedJavaScript={CLICK_JS}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onLoad={() => dbg('LOADED')}
        onError={handleLoadError}
        onHttpError={handleHttpError}
        userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        scalesPageToFit={false}
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
