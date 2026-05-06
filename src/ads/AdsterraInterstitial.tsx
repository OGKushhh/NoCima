/**
 * AdsterraInterstitial
 *
 * Full-screen modal WebView that fires the Adsterra popunder script.
 * - Auto-closes after `autoCloseSeconds` (default 5)
 * - Shows a countdown so users know when it will close
 * - Calls onAdComplete after first load (so the pending action is unblocked)
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Modal, View, TouchableOpacity, Text, StyleSheet,
  ActivityIndicator, Animated,
} from 'react-native';
import { WebView } from 'react-native-webview';

// Adsterra popunder script URL
const POPUNDER_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; }
    body { background: #000; }
  </style>
</head>
<body>
  <script src="https://pl29354759.profitablecpmratenetwork.com/f5/0a/ed/f50aed4e6faf5a467658edb59635ce30.js"></script>
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
  autoCloseSeconds = 5,
}) => {
  const [loading,    setLoading]    = useState(true);
  const [countdown,  setCountdown]  = useState(autoCloseSeconds);
  const timerRef    = useRef<ReturnType<typeof setTimeout>>();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const completedRef = useRef(false);

  const cleanup = () => {
    if (timerRef.current)    clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  useEffect(() => {
    if (!visible) {
      cleanup();
      setLoading(true);
      setCountdown(autoCloseSeconds);
      completedRef.current = false;
    }
  }, [visible, autoCloseSeconds]);

  const handleLoadEnd = () => {
    setLoading(false);

    // Mark ad as complete after 3 s even if user doesn't close
    if (!completedRef.current) {
      timerRef.current = setTimeout(() => {
        completedRef.current = true;
        onAdComplete?.();
      }, 3000);
    }

    // Start countdown
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
    if (!completedRef.current) {
      completedRef.current = true;
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
        {/* Header bar */}
        <View style={styles.header}>
          <Text style={styles.adLabel}>إعلان</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
            <Text style={styles.closeBtnText}>
              {loading ? '✕' : `✕ ${countdown}s`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Ad WebView */}
        <WebView
          source={{ html: POPUNDER_HTML }}
          style={styles.webview}
          onLoadEnd={handleLoadEnd}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={['*']}
          onShouldStartLoadWithRequest={() => true}
        />

        {/* Loading overlay */}
        {loading && (
          <View style={styles.loaderOverlay}>
            <ActivityIndicator size="large" color="#FF4500" />
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#111',
  },
  adLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontFamily: 'Rubik',
  },
  closeBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  webview: {
    flex: 1,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AdsterraInterstitial;
