/**
 * AdsterraInterstitial
 *
 * Redirect-safe ad WebView.
 *
 * Problem: Adsterra/PropellerAds scripts redirect the WebView to an ad URL
 * which navigates away from our HTML and breaks the UI.
 *
 * Fix: onShouldStartLoadWithRequest intercepts every navigation:
 *  - Allow: initial about:blank and the baseUrl domain (script loading)
 *  - Block + open in browser: anything else (ad redirect URLs)
 *
 * This way the ad opens in Chrome/system browser (user sees it),
 * the WebView stays on our HTML (UI stays intact), and we get the impression.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Modal, View, TouchableOpacity, Text, StyleSheet,
  ActivityIndicator, Linking,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';

const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// Domains we allow to load inside the WebView (ad script hosts)
const ALLOWED_DOMAINS = [
  'highperformanceformat.com',
  'profitablecpmratenetwork.com',
  'nap5k.com',
  'al5sm.com',
  'adsterra.com',
  'propellerads.com',
];

const AD_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
    #ad-wrap {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      width: 100%;
      height: 100%;
      gap: 12px;
    }
  </style>
</head>
<body>
  <div id="ad-wrap">

    <!-- Adsterra 300x250 -->
    <div>
      <script>
        atOptions = {
          'key'    : '253e281cf6be0795775d2a8300a1ab64',
          'format' : 'iframe',
          'height' : 250,
          'width'  : 300,
          'params' : {}
        };
      </script>
      <script src="https://www.highperformanceformat.com/253e281cf6be0795775d2a8300a1ab64/invoke.js"></script>
    </div>

    <!-- PropellerAds banner -->
    <div>
      <script>(function(s){s.dataset.zone='10971750',s.src='https://nap5k.com/tag.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))</script>
    </div>

  </div>

  <!-- PropellerAds popunder — fires in background, may redirect -->
  <script>(function(s){s.dataset.zone='10971729',s.src='https://al5sm.com/tag.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))</script>

</body>
</html>
`;

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdComplete?: () => void;
  autoCloseSeconds?: number;
}

const AdsterraInterstitial: React.FC<Props> = ({
  visible,
  onClose,
  onAdComplete,
  autoCloseSeconds = 8,
}) => {
  const [loading,   setLoading]   = useState(true);
  const [countdown, setCountdown] = useState(autoCloseSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const completeRef = useRef(false);

  const cleanup = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  useEffect(() => {
    if (!visible) {
      cleanup();
      setLoading(true);
      setCountdown(autoCloseSeconds);
      completeRef.current = false;
    }
  }, [visible, autoCloseSeconds]);

  const handleLoadEnd = () => {
    setLoading(false);
    setTimeout(() => {
      if (!completeRef.current) {
        completeRef.current = true;
        onAdComplete?.();
      }
    }, 3000);
    setCountdown(autoCloseSeconds);
    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleClose = () => {
    cleanup();
    if (!completeRef.current) {
      completeRef.current = true;
      onAdComplete?.();
    }
    onClose();
  };

  /**
   * Redirect guard — the core fix.
   * Returns true  = allow WebView to load it normally (scripts, iframes)
   * Returns false = block it in WebView, open in system browser instead
   */
  const handleNavRequest = (request: WebViewNavigation): boolean => {
    const url = request.url;

    // Always allow blank/initial load
    if (!url || url === 'about:blank' || url === 'about:srcdoc') return true;

    // Allow data: URIs (inline content)
    if (url.startsWith('data:')) return true;

    // Allow our allowed ad script domains
    const isAllowed = ALLOWED_DOMAINS.some(domain => url.includes(domain));
    if (isAllowed) return true;

    // Everything else (ad redirect landing pages) → open in system browser
    Linking.openURL(url).catch(() => {});
    return false;
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.adLabel}>إعلان · Ad</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose} disabled={loading}>
            <Text style={styles.closeBtnText}>{loading ? '...' : `✕  ${countdown}s`}</Text>
          </TouchableOpacity>
        </View>

        <WebView
          source={{ html: AD_HTML, baseUrl: 'https://www.highperformanceformat.com' }}
          style={styles.webview}
          onLoadEnd={handleLoadEnd}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          allowUniversalAccessFromFileURLs
          mixedContentMode="always"
          originWhitelist={['*']}
          userAgent={CHROME_UA}
          scrollEnabled={false}
          androidLayerType="hardware"
          // ── Redirect guard ──
          onShouldStartLoadWithRequest={handleNavRequest}
        />

        {loading && (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#FF4500" />
            <Text style={styles.loaderText}>جار التحميل...</Text>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#000' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#111' },
  adLabel:      { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: 'Rubik' },
  closeBtn:     { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  closeBtnText: { color: '#fff', fontSize: 13, fontWeight: '700', fontFamily: 'Rubik' },
  webview:      { flex: 1, backgroundColor: '#000' },
  loader:       { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  loaderText:   { color: 'rgba(255,255,255,0.4)', marginTop: 12, fontSize: 13, fontFamily: 'Rubik' },
});

export default AdsterraInterstitial;
