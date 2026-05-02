/**
 * VideoExtractor.tsx
 *
 * On-device video extraction using a hidden WebView.
 *
 * v5 — Critical fixes based on adb logcat:
 *   - Added faselhdx.bid to ALLOWED_DOMAINS (site redirects to this domain!)
 *   - Added all ad domains from live logs to BLOCKED_DOMAINS
 *   - Block intent:// URLs (Android Chrome deep links from ads)
 *   - Full navigation debug logging in handleShouldStartLoad
 *   - JS redirect blocking in PATCH_JS (location.assign/replace/href setter)
 *   - Ad element removal in MutationObserver
 *   - Click event interception for ALL non-allowed links
 *   - Increased timeout to 35s
 *
 * Key design decisions:
 *   - fetch/XHR overrides in injectedJavaScriptBeforeContentLoaded (document-start)
 *   - Scroll + click logic in injectedJavaScript (document-end)
 *   - WebView is full-screen but invisible (opacity:0, pointerEvents:none)
 *   - postMessage bridge sends intercepted m3u8 + debug info to RN
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
const PATCH_JS = `
(function() {
  // Allowed domains — must match RN side ALLOWED_DOMAINS
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

  // Signal injection
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'PATCH: injected at document-start'}));
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

  // ── Block ad redirects via location ────────────────────────────
  try {
    var _assign = window.location.assign.bind(window.location);
    var _replace = window.location.replace.bind(window.location);

    window.location.assign = function(url) {
      if (isAllowed(url)) {
        try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'REDIRECT assign: ' + url.substring(0,80)})); } catch(e) {}
        return _assign(url);
      }
      try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'BLOCKED assign: ' + url.substring(0,80)})); } catch(e) {}
    };

    window.location.replace = function(url) {
      if (isAllowed(url)) {
        try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'REDIRECT replace: ' + url.substring(0,80)})); } catch(e) {}
        return _replace(url);
      }
      try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'BLOCKED replace: ' + url.substring(0,80)})); } catch(e) {}
    };
  } catch(e) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'PATCH: location override error: ' + e.message})); } catch(e2) {}
  }

  // ── Kill popups ─────────────────────────────────────────────────
  window.open = function() { return null; };
  window.alert = function() {};
  window.confirm = function() { return false; };
  window.prompt = function() { return null; };

  // ── Block clicks on non-allowed links (capture phase) ─────────
  document.addEventListener('click', function(e) {
    try {
      var t = e.target;
      // Walk up to find <a> tag
      while (t && t !== document) {
        if (t.tagName === 'A' && t.href) {
          if (!isAllowed(t.href) && t.href.indexOf('javascript:') !== 0) {
            e.preventDefault();
            e.stopPropagation();
            try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'BLOCKED link click: ' + t.href.substring(0,60)})); } catch(ex) {}
            return;
          }
          break;
        }
        t = t.parentElement;
      }
    } catch(ex) {}
  }, true);

  // ── Watch for dynamically added iframes + remove ad elements ───
  var obs = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(node) {
        // Patch iframes
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

        // Remove ad/popup/overlay elements
        if (node.nodeType === 1) {
          try {
            var cls = (node.className || '').toString();
            var id = (node.id || '').toString();
            var tag = node.tagName;
            if (
              cls.indexOf('popup') !== -1 || cls.indexOf('overlay') !== -1 ||
              cls.indexOf('ad-') !== -1 || cls.indexOf('blockadblock') !== -1 ||
              cls.indexOf('modal') !== -1 ||
              id.indexOf('popup') !== -1 || id.indexOf('ad') !== -1 ||
              id.indexOf('overlay') !== -1 ||
              tag === 'INS' // ad injection tag
            ) {
              node.remove();
              try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'REMOVED ad element: ' + tag + '#' + id + '.' + cls.substring(0,30)})); } catch(e) {}
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

  // Final confirmation
  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'PATCH: all overrides installed OK'}));
  } catch(e) {}
})();
true;
`;

// ── JS injected at document-end (AFTER DOM ready) ────────────────────
const CLICK_JS = `
(function() {
  // Allowed domains — must match PATCH_JS
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

  try {
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'DOC-END: JS running on: ' + window.location.href.substring(0,60)}));
  } catch(e) {}

  // ── Continuously remove ad overlays ────────────────────────────
  var adSelectors = [
    '.popup', '.ad-overlay', '.close-btn', '.modal-overlay',
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
          // Don't remove the JWPlayer!
          if (el.className && typeof el.className === 'string' && el.className.indexOf('jw') !== -1) return;
          if (el.id && typeof el.id === 'string' && el.id.indexOf('jw') !== -1) return;
          el.remove();
          count++;
        });
      } catch(e) {}
    });
    return count;
  }

  // Kill ads immediately
  var removed = killAds();
  if (removed > 0) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'DOC-END: removed ' + removed + ' ad elements'})); } catch(e) {}
  }

  // Keep killing ads every 2 seconds
  setInterval(function() { killAds(); }, 2000);

  // ── Block all clicks on non-allowed links (capture phase) ─────
  document.addEventListener('click', function(e) {
    try {
      var t = e.target;
      while (t && t !== document) {
        if (t.tagName === 'A' && t.href) {
          if (!isAllowed(t.href) && t.href.indexOf('javascript:') !== 0) {
            e.preventDefault();
            e.stopPropagation();
            try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'CLICK-BLOCKED: ' + t.href.substring(0,60)})); } catch(ex) {}
            return;
          }
          break;
        }
        t = t.parentElement;
      }
    } catch(ex) {}
  }, true);

  // ── Scroll to trigger lazy iframe injection ─────────────────────
  setTimeout(function() {
    window.scrollTo(0, document.body.scrollHeight / 2);
    try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'SCROLL: 50%'})); } catch(e) {}
  }, 1500);

  setTimeout(function() {
    window.scrollTo(0, document.body.scrollHeight * 0.7);
    try { window.ReactNativeWebView.postMessage(JSON.stringify({type:'debug', msg:'SCROLL: 70%'})); } catch(e) {}
  }, 4000);

  // ── Click play button up to 10 times, 2s apart ─────────────────
  var attempts = 0;
  var interval = setInterval(function() {
    attempts++;

    // Kill ads before each click attempt
    killAds();

    // Play button selectors (order: most specific first)
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
      // Log page state for debugging
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
  'fasel-hd.cam',   // original domain
  'faselhd.com',    // alternative domain
  'faselhdx.bid',   // ⚠️ CRITICAL — site redirects to web520x.faselhdx.bid!
  'scdns.io',       // CDN
  'jwpcdn.com',     // JWPlayer CDN
  'jwplayer.com',   // JWPlayer
];

// ── Props ────────────────────────────────────────────────────────────
interface VideoExtractorProps {
  pageUrl: string;
  onExtracted: (m3u8Url: string) => void;
  onError: () => void;
  onDebug?: (msg: string) => void;
  timeoutMs?: number;
}

// ── Component ────────────────────────────────────────────────────────
export const VideoExtractor: React.FC<VideoExtractorProps> = ({
  pageUrl,
  onExtracted,
  onError,
  onDebug,
  timeoutMs = 25000,
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
        onError();
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
      onError();
    }
  };

  const handleHttpError = () => {
    if (!captured.current) {
      captured.current = true;
      clearTimeout(timer.current);
      dbg('HTTP_ERROR: bad status code');
      onError();
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
