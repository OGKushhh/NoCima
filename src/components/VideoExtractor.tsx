/**
 * VideoExtractor.tsx
 *
 * On-device video extraction using a hidden WebView.
 * Loads the episode/movie page, scrolls to trigger lazy iframe injection,
 * clicks play up to 7 times, and intercepts the .m3u8 URL.
 *
 * Why on-device:
 *   scdns.io CDN bakes the requesting IP into a signed token path.
 *   Extracting on the server produces a URL only valid from the server IP.
 *   Extracting on the phone produces a URL valid for playback on that phone.
 */

import React, {useRef, useEffect} from 'react';
import {View} from 'react-native';
import {WebView} from 'react-native-webview';

// ── Ad/tracker domains to block ──────────────────────────────────────
const BLOCKED_DOMAINS = [
  'googletagmanager.com',
  'doubleclick.net',
  'googleadservices.com',
  'google-analytics.com',
  'popads.net',
  'adsterra.com',
  'exponential.com',
  'outbrain.com',
  'taboola.com',
  'scorecardresearch.com',
  'madurird.com',
  'acscdn.com',
  'crumpetprankerstench.com',
  'propellerads.com',
  'clickadu.com',
  'ampproject.org',
  'adnxs.com',
  'ads.yahoo.com',
];

// ── Domains we must allow ────────────────────────────────────────────
const ALLOWED_DOMAINS = [
  'fasel-hd.cam',
  'scdns.io',
  'about:blank',
  'jwpcdn.com',      // JWPlayer CDN
  'jwplayer.com',
];

// ── JS injected into the page ────────────────────────────────────────
// 1. Kill popups & ad redirects
// 2. Scroll to trigger lazy iframe injection
// 3. Click play button up to 7 times, 1.5s apart
// 4. Remove ad overlay DOM elements before each click
const INJECTED_JS = `
(function() {
  // ── Kill popup attempts ──────────────────────────────────────────
  window.open          = function() { return null; };
  window.alert         = function() {};
  window.confirm       = function() { return false; };
  window.prompt        = function() { return null; };

  // Block ad link clicks
  document.addEventListener('click', function(e) {
    var target = e.target.closest('a');
    if (target && target.href &&
        !target.href.includes('fasel-hd.cam') &&
        !target.href.includes('javascript')) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // ── Scroll to trigger lazy iframe injection ──────────────────────
  window.scrollTo(0, document.body.scrollHeight / 2);

  // ── Click play up to 7 times ─────────────────────────────────────
  var attempts   = 0;
  var maxAttempts = 7;
  var interval   = setInterval(function() {
    attempts++;

    // Remove any popup/overlay elements that appeared
    var overlaySelectors = [
      '.popup', '.ad-overlay', '.close-btn', '.modal-overlay',
      '[class*="popup"]', '[class*="overlay"]', '[id*="popup"]',
      '[id*="ad"]', '[class*="ad-"]', '.blockadblock',
    ];
    overlaySelectors.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(el) {
        el.remove();
      });
    });

    // Try play button selectors in priority order
    var selectors = [
      '.jw-icon.jw-icon-display.jw-button-color.jw-reset',
      '.jw-icon-display',
      '.jw-display-icon-container',
      '[class*="play"][class*="jw"]',
      '[class*="play"]',
      'video',
    ];

    var clicked = false;
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) {
        el.click();
        clicked = true;
        break;
      }
    }

    if (attempts >= maxAttempts) {
      clearInterval(interval);
    }
  }, 1500);
})();
true;
`;

// ── Props ────────────────────────────────────────────────────────────
interface VideoExtractorProps {
  /** The fasel-hd episode/movie page URL to extract from */
  pageUrl: string;
  /** Called with the captured m3u8 URL */
  onExtracted: (m3u8Url: string) => void;
  /** Called if extraction fails or times out */
  onError: () => void;
  /** Timeout in ms before giving up (default 25000) */
  timeoutMs?: number;
}

// ── Component ────────────────────────────────────────────────────────
export const VideoExtractor: React.FC<VideoExtractorProps> = ({
  pageUrl,
  onExtracted,
  onError,
  timeoutMs = 25000,
}) => {
  const captured  = useRef(false);
  const timeout   = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Hard timeout — if no m3u8 captured within timeoutMs, give up
    timeout.current = setTimeout(() => {
      if (!captured.current) {
        captured.current = true;
        onError();
      }
    }, timeoutMs);

    return () => {
      clearTimeout(timeout.current);
    };
  }, []);

  const handleShouldStartLoad = (request: {url: string}) => {
    const url = request.url;

    // ── Capture m3u8 ──────────────────────────────────────────────
    if (url.includes('.m3u8') && !captured.current) {
      // Prefer master.m3u8 (has all quality levels)
      // Accept any .m3u8 as fallback
      if (url.includes('master.m3u8') || !captured.current) {
        captured.current = true;
        clearTimeout(timeout.current);
        onExtracted(url);
      }
      return false; // block WebView from navigating to it
    }

    // ── Block ad domains ─────────────────────────────────────────
    if (BLOCKED_DOMAINS.some(d => url.includes(d))) {
      return false;
    }

    // ── Block navigations away from allowed domains ───────────────
    // about:blank and data: URIs are fine (initial state)
    if (url.startsWith('about:') || url.startsWith('data:')) {
      return true;
    }

    if (!ALLOWED_DOMAINS.some(d => url.includes(d))) {
      return false; // block everything else (ad redirects, popups)
    }

    return true;
  };

  return (
    // Zero-size container — completely invisible, no layout impact
    <View
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        overflow: 'hidden',
        opacity: 0,
        pointerEvents: 'none',
      }}
    >
      <WebView
        source={{uri: pageUrl}}
        style={{width: 1, height: 1}}
        // Must be non-zero dimensions for JS to execute
        javaScriptEnabled
        injectedJavaScript={INJECTED_JS}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        // Stealth user agent matching Playwright config
        userAgent="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"
        // Allow autoplay without user gesture (needed for JWPlayer init)
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        // Don't let WebView scale or zoom
        scalesPageToFit={false}
        // Kill any audio that might start
        muted
        onError={() => {
          if (!captured.current) {
            captured.current = true;
            clearTimeout(timeout.current);
            onError();
          }
        }}
        onHttpError={() => {
          if (!captured.current) {
            captured.current = true;
            clearTimeout(timeout.current);
            onError();
          }
        }}
      />
    </View>
  );
};
