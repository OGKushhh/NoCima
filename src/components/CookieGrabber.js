import React, { useRef, useEffect } from 'react';
import { WebView } from 'react-native-webview';

export default function CookieGrabber({ onDone }) {
  const webViewRef = useRef(null);

  useEffect(() => {
    // Inject script after page loads
    const interval = setInterval(() => {
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`
          setTimeout(() => {
            window.ReactNativeWebView.postMessage(document.cookie);
          }, 1000);
          true;
        `);
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleMessage = (event) => {
    const cookieString = event.nativeEvent.data;
    if (cookieString && cookieString.length > 0) {
      onDone(cookieString);
    }
  };

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: 'https://www.fasel-hd.cam/main' }}
      onMessage={handleMessage}
      style={{ display: 'none' }}
      incognito={false}
      sharedCookiesEnabled={true}
    />
  );
}