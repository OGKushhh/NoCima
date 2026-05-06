/**
 * TopBannerAd.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Closable, non-sticky InMobi banner rendered at the top of the screen.
 *
 * Usage:
 *   <TopBannerAd />
 *
 * • Hides itself automatically when the ad-free window is active.
 * • Has an ✕ close button so the user can dismiss it.
 * • Uses the native InMobi BannerView when available; falls back to a
 *   styled placeholder in dev/stub mode so layout stays visible.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  NativeModules,
  requireNativeComponent,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AD_IDS, shouldShowBanner } from '../services/adManager';

// ─── Native InMobi Banner View ────────────────────────────────────────────────
// This is the native component exposed by the InMobi Android/iOS SDK bridge.
// If you are using a third-party RN wrapper, replace 'InMobiBannerView' with
// whatever component name that library exports.
let InMobiBannerView: React.ComponentType<{
  placementId: number;
  style: ViewStyle;
}> | null = null;

try {
  InMobiBannerView = requireNativeComponent('InMobiBannerView') as any;
} catch {
  // SDK bridge not linked yet – will use placeholder
}

// ─── Banner dimensions (standard 320 × 50) ───────────────────────────────────
const BANNER_H = 50;

// ─── Component ────────────────────────────────────────────────────────────────
const TopBannerAd: React.FC = () => {
  const insets          = useSafeAreaInsets();
  const [visible, setVisible] = useState(shouldShowBanner());

  // Re-check ad-free status whenever it might change (e.g. after reward)
  useEffect(() => {
    const id = setInterval(() => {
      setVisible(shouldShowBanner());
    }, 10_000); // poll every 10 s — lightweight enough
    return () => clearInterval(id);
  }, []);

  if (!visible) return null;

  return (
    <View style={[styles.wrapper, { top: insets.top }]}>
      {/* ── Ad slot ── */}
      {InMobiBannerView ? (
        <InMobiBannerView
          placementId={AD_IDS.BANNER_PLACEMENT}
          style={styles.banner}
        />
      ) : (
        /* Dev placeholder so layout is visible without the native SDK */
        <View style={[styles.banner, styles.placeholder]}>
          <Text style={styles.placeholderText}>InMobi Banner Ad</Text>
        </View>
      )}

      {/* ── Close button ── */}
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={() => setVisible(false)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Close ad"
      >
        <Text style={styles.closeTxt}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: BANNER_H,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 999,
    elevation: 999,
  },
  banner: {
    flex: 1,
    height: BANNER_H,
  },
  placeholder: {
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  placeholderText: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'Rubik',
  },
  closeBtn: {
    width: 28,
    height: BANNER_H,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  closeTxt: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default TopBannerAd;
