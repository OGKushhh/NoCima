/**
 * AdContext
 *
 * Global ad state — wraps the entire app so any screen can trigger an ad
 * without prop-drilling.
 *
 * Usage from any screen:
 *   const { showInterstitial } = useAds();
 *   showInterstitial(() => startExtraction(...), 'play');
 *
 * ─── No WebView conflict ─────────────────────────────────────────────────────
 * The ad fires BEFORE extraction starts. The interstitial WebView is fully
 * closed before the invisible VideoExtractor WebView ever mounts.
 * The two WebViews are never alive at the same time.
 */

import React, {
  createContext, useContext, useState, useRef, useCallback,
} from 'react';
import AdsterraInterstitial from './AdsterraInterstitial';
import { shouldShowPlayAd, shouldShowInteractionAd } from './adManager';

interface AdContextValue {
  /**
   * Show an interstitial before running `afterAd`.
   * Pass trigger='play' for play-button events, 'interaction' for nav events.
   */
  showInterstitial: (afterAd: () => void, trigger?: 'play' | 'interaction') => void;
}

const AdContext = createContext<AdContextValue>({
  showInterstitial: (cb) => cb(),
});

export const useAds = () => useContext(AdContext);

export const AdProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [interstitialVisible, setInterstitialVisible] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);

  const showInterstitial = useCallback((
    afterAd: () => void,
    trigger: 'play' | 'interaction' = 'play',
  ) => {
    const shouldShow = trigger === 'play'
      ? shouldShowPlayAd()
      : shouldShowInteractionAd();

    if (shouldShow) {
      pendingAction.current = afterAd;
      setInterstitialVisible(true);
    } else {
      afterAd();
    }
  }, []);

  const handleAdClose = useCallback(() => {
    setInterstitialVisible(false);
    const action = pendingAction.current;
    pendingAction.current = null;
    // Small delay so the modal slide-out animation finishes before navigation
    if (action) setTimeout(action, 150);
  }, []);

  return (
    <AdContext.Provider value={{ showInterstitial }}>
      {children}
      <AdsterraInterstitial
        visible={interstitialVisible}
        onClose={handleAdClose}
        autoCloseSeconds={5}
      />
    </AdContext.Provider>
  );
};
