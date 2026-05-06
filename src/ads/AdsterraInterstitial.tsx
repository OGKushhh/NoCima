/**
 * AdsterraInterstitial
 *
 * Full-screen modal WebView ad.
 * Uses the Social Bar / Banner format — NOT the popunder script.
 * Popunder opens a new browser tab which does not work inside a WebView.
 *
 * Key Android fixes applied:
 *  - baseUrl set so scripts resolve correctly
 *  - mixedContentMode="always" so HTTP ads load inside HTTPS context
 *  - thirdPartyCookiesEnabled for ad targeting
 *  - allowUniversalAccessFromFileURLs for iframe ads
 *  - userAgent spoofed to a real Chrome UA so ad networks serve content
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Modal, View, TouchableOpacity, Text, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';

const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// Social Bar script — renders inside WebView, does NOT open a new tab
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
      justify-content: center;
      align-items: center;
      width: 100%;
      height: 100%;
    }
    /* 300x250 display banner centered */
    #ad-wrap iframe, #ad-wrap ins { display: block; }
  </style>
</head>
<body>
  <div id="ad-wrap">
    <!-- 300x250 display banner -->
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
  const intervalRef  = useRef<ReturnType<typeof setInterval>>();
  const completeRef  = useRef(false);

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

    // Mark complete after 3s
    setTimeout(() => {
      if (!completeRef.current) {
        completeRef.current = true;
        onAdComplete?.();
      }
    }, 3000);

    // Countdown to auto-close
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

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.adLabel}>إعلان · Ad</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose} disabled={loading}>
            <Text style={styles.closeBtnText}>
              {loading ? '...' : `✕  ${countdown}s`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Ad WebView */}
        <WebView
          source={{ html: AD_HTML, baseUrl: 'https://www.highperformanceformat.com' }}
          style={styles.webview}
          onLoadEnd={handleLoadEnd}
          // ── Critical Android ad-rendering settings ──
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          allowUniversalAccessFromFileURLs
          mixedContentMode="always"
          originWhitelist={['*']}
          userAgent={CHROME_UA}
          onShouldStartLoadWithRequest={() => true}
          // Prevent scroll inside the ad
          scrollEnabled={false}
          // Keep WebView alive in background so ad loads properly
          androidLayerType="hardware"
        />

        {/* Loading overlay */}
        {loading && (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#FF4500" />
            <Text style={styles.loaderText}>جار تحميل الإعلان...</Text>
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
