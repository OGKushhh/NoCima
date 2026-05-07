/**
 * AdsterraBanner — redirect-safe
 * Same onShouldStartLoadWithRequest guard as AdsterraInterstitial.
 * Ad clicks open in system browser, WebView stays on the banner HTML.
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Linking } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';

type BannerType = 'native' | 'display' | 'propeller';

interface Props {
  visible: boolean;
  type?: BannerType;
  onClose?: () => void;
  height?: number;
}

const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const ALLOWED_DOMAINS = [
  'highperformanceformat.com',
  'profitablecpmratenetwork.com',
  'nap5k.com',
  'al5sm.com',
  'adsterra.com',
  'propellerads.com',
];

const handleNavRequest = (request: WebViewNavigation): boolean => {
  const url = request.url;
  if (!url || url === 'about:blank' || url === 'about:srcdoc') return true;
  if (url.startsWith('data:')) return true;
  if (ALLOWED_DOMAINS.some(d => url.includes(d))) return true;
  Linking.openURL(url).catch(() => {});
  return false;
};

const NATIVE_BANNER_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: transparent; }
    #container-4959ff237f69f543e36da1a8df02d6e5 { text-align: center; width: 100%; }
  </style>
</head>
<body>
  <script async="async" data-cfasync="false"
    src="https://pl29354810.profitablecpmratenetwork.com/4959ff237f69f543e36da1a8df02d6e5/invoke.js">
  </script>
  <div id="container-4959ff237f69f543e36da1a8df02d6e5"></div>
</body>
</html>
`;

const DISPLAY_BANNER_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: transparent; display: flex; justify-content: center; }
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

const PROPELLER_BANNER_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: transparent; }
  </style>
</head>
<body>
  <script>(function(s){s.dataset.zone='10971750',s.src='https://nap5k.com/tag.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))</script>
</body>
</html>
`;

const configs: Record<BannerType, { html: string; baseUrl: string; defaultHeight: number }> = {
  native:    { html: NATIVE_BANNER_HTML,   baseUrl: 'https://pl29354810.profitablecpmratenetwork.com', defaultHeight: 90 },
  display:   { html: DISPLAY_BANNER_HTML,  baseUrl: 'https://www.highperformanceformat.com',           defaultHeight: 270 },
  propeller: { html: PROPELLER_BANNER_HTML, baseUrl: 'https://nap5k.com',                              defaultHeight: 90 },
};

const AdsterraBanner: React.FC<Props> = ({ visible, type = 'native', onClose, height }) => {
  if (!visible) return null;
  const { html, baseUrl, defaultHeight } = configs[type];

  return (
    <View style={[styles.container, { height: height ?? defaultHeight }]}>
      <WebView
        source={{ html, baseUrl }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        originWhitelist={['*']}
        userAgent={CHROME_UA}
        scrollEnabled={false}
        androidLayerType="hardware"
        onShouldStartLoadWithRequest={handleNavRequest}
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
  container: { width: '100%', backgroundColor: 'transparent', position: 'relative' },
  webview:   { flex: 1, backgroundColor: 'transparent' },
  closeBtn:  { position: 'absolute', top: 4, right: 4, width: 26, height: 26, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 13 },
  closeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
});

export default AdsterraBanner;
