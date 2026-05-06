/**
 * AdsterraBanner
 *
 * Renders either:
 *   type="native"  → Adsterra native banner (invoke.js)
 *   type="display" → Adsterra 300×250 display banner (atOptions iframe)
 *
 * Both are injected into a WebView so the ad scripts run in a real browser
 * context (required for Adsterra scripts to work on React Native).
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { WebView } from 'react-native-webview';

type BannerType = 'native' | 'display';

interface Props {
  visible: boolean;
  type?: BannerType;
  onClose?: () => void;
  height?: number;
}

// ── Native banner (invoke.js) ────────────────────────────────────────────────
const NATIVE_BANNER_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: transparent; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    #container-4959ff237f69f543e36da1a8df02d6e5 { text-align: center; width: 100%; }
  </style>
</head>
<body>
  <script async="async" data-cfasync="false" src="https://pl29354810.profitablecpmratenetwork.com/4959ff237f69f543e36da1a8df02d6e5/invoke.js"></script>
  <div id="container-4959ff237f69f543e36da1a8df02d6e5"></div>
</body>
</html>
`;

// ── Display banner 300×250 ───────────────────────────────────────────────────
const DISPLAY_BANNER_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: transparent; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  </style>
</head>
<body>
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
</body>
</html>
`;

const AdsterraBanner: React.FC<Props> = ({
  visible,
  type = 'native',
  onClose,
  height = 90,
}) => {
  if (!visible) return null;

  const html = type === 'display' ? DISPLAY_BANNER_HTML : NATIVE_BANNER_HTML;
  const containerHeight = type === 'display' ? 270 : height;

  return (
    <View style={[styles.container, { height: containerHeight }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        onShouldStartLoadWithRequest={() => true}
        // Transparent background
        androidLayerType="hardware"
      />
      {onClose && (
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  closeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 13,
  },
  closeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default AdsterraBanner;
