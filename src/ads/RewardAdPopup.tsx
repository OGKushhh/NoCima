/**
 * RewardAdPopup
 *
 * A friendly modal that offers the user 3 hours ad-free in exchange for
 * watching one interstitial ad.
 *
 * Used in two places:
 *   1. App launch  — shown automatically every 3rd launch (via App.tsx)
 *   2. SettingsScreen — user can tap "Disable Ads" any time to trigger it
 *
 * Flow:
 *   Show popup → user taps "Watch" → popup closes → interstitial plays
 *   → interstitial closes → activateAdFree() → 3h timer starts
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Animated, Image,
} from 'react-native';
import { activateAdFree, adFreeRemainingMs } from './adManager';
import AdsterraInterstitial from './AdsterraInterstitial';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const RewardAdPopup: React.FC<Props> = ({ visible, onClose }) => {
  const [showInterstitial, setShowInterstitial] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          damping: 15,
          stiffness: 200,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const handleWatch = () => {
    // Close popup first, then show interstitial
    onClose();
    setTimeout(() => setShowInterstitial(true), 200);
  };

  const handleInterstitialClose = () => {
    setShowInterstitial(false);
    // Grant 3h ad-free after the ad is watched
    activateAdFree();
  };

  return (
    <>
      {/* ── Reward offer popup ── */}
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={onClose}
      >
        <View style={styles.backdrop}>
          <Animated.View style={[
            styles.card,
            { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
          ]}>

            {/* Icon */}
            <View style={styles.iconWrap}>
              <Text style={styles.iconEmoji}>🎬</Text>
            </View>

            {/* Title */}
            <Text style={styles.title}>شاهد إعلاناً واحداً</Text>
            <Text style={styles.titleEn}>Watch 1 Ad</Text>

            {/* Body */}
            <Text style={styles.body}>
              استمتع بتجربة بدون إعلانات لمدة{' '}
              <Text style={styles.highlight}>3 ساعات</Text>
              {'\n'}مقابل مشاهدة إعلان واحد قصير.
            </Text>
            <Text style={styles.bodyEn}>
              Enjoy <Text style={styles.highlight}>3 hours</Text> ad-free{'\n'}
              by watching one short ad.
            </Text>

            {/* Buttons */}
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.btnLater} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.btnLaterText}>لاحقاً / Later</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.btnWatch} onPress={handleWatch} activeOpacity={0.85}>
                <Text style={styles.btnWatchText}>▶ شاهد / Watch</Text>
              </TouchableOpacity>
            </View>

            {/* Hint */}
            <Text style={styles.hint}>
              يمكنك تفعيل هذا لاحقاً من الإعدادات{'\n'}
              You can activate this later from Settings
            </Text>
          </Animated.View>
        </View>
      </Modal>

      {/* ── The actual interstitial ad ── */}
      <AdsterraInterstitial
        visible={showInterstitial}
        onClose={handleInterstitialClose}
        autoCloseSeconds={8}
      />
    </>
  );
};

// ─── Standalone trigger for SettingsScreen ────────────────────────────────────
/**
 * Hook that exposes the reward popup for use anywhere (e.g. SettingsScreen).
 * Returns { element, trigger, isAdFree, remainingMs }
 *
 * Usage:
 *   const { rewardElement, triggerReward, adFreeActive, remainingMs } = useRewardAd();
 *   // render rewardElement somewhere in your JSX
 *   // call triggerReward() on button press
 */
export function useRewardAd() {
  const [visible, setVisible] = useState(false);
  const [remainingMs, setRemainingMs] = useState(adFreeRemainingMs());

  // Refresh remaining time every second while screen is mounted
  useEffect(() => {
    const id = setInterval(() => setRemainingMs(adFreeRemainingMs()), 1000);
    return () => clearInterval(id);
  }, []);

  const triggerReward = () => setVisible(true);
  const adFreeActive  = remainingMs > 0;

  const rewardElement = (
    <RewardAdPopup
      visible={visible}
      onClose={() => {
        setVisible(false);
        setRemainingMs(adFreeRemainingMs());
      }}
    />
  );

  return { rewardElement, triggerReward, adFreeActive, remainingMs };
}

// ─── Countdown formatter ─────────────────────────────────────────────────────
export function formatAdFreeRemaining(ms: number): string {
  if (ms <= 0) return '';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,69,0,0.3)',
    shadowColor: '#FF4500',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 16,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,69,0,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,69,0,0.4)',
  },
  iconEmoji: {
    fontSize: 36,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'Rubik',
    textAlign: 'center',
  },
  titleEn: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontFamily: 'Rubik',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 16,
  },
  body: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: 'Rubik',
  },
  bodyEn: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: 'Rubik',
    marginTop: 6,
    marginBottom: 24,
  },
  highlight: {
    color: '#FF4500',
    fontWeight: '700',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: 16,
  },
  btnLater: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  btnLaterText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Rubik',
  },
  btnWatch: {
    flex: 1.4,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: '#FF4500',
    shadowColor: '#FF4500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  btnWatchText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Rubik',
  },
  hint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 17,
    fontFamily: 'Rubik',
  },
});

export default RewardAdPopup;
