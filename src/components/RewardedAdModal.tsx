/**
 * RewardedAdModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Modal that offers the user a rewarded video to disable all ads for 3 hours.
 *
 * Shown:
 *   1. Every 3rd app launch (triggered from App.tsx).
 *   2. From the Settings screen via a dedicated button.
 *
 * On reward granted → activateAdFree() is called automatically.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Image,
} from 'react-native';
import {
  showRewardedAd,
  onRewardGranted,
  activateAdFree,
  preloadRewarded,
} from '../services/adManager';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from 'react-i18next';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const RewardedAdModal: React.FC<Props> = ({ visible, onClose }) => {
  const { colors }  = useTheme();
  const { t }       = useTranslation();
  const scaleAnim   = useRef(new Animated.Value(0.85)).current;
  const [loading, setLoading]   = useState(false);
  const [rewarded, setRewarded] = useState(false);

  // Animate in
  useEffect(() => {
    if (visible) {
      setRewarded(false);
      setLoading(false);
      preloadRewarded();
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 80,
        friction: 8,
      }).start();
    } else {
      scaleAnim.setValue(0.85);
    }
  }, [visible]);

  // Listen for the reward event
  useEffect(() => {
    const unsub = onRewardGranted(() => {
      activateAdFree();
      setRewarded(true);
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleWatch = async () => {
    setLoading(true);
    const shown = await showRewardedAd();
    if (!shown) {
      // Ad not ready yet — inform user
      setLoading(false);
    }
    // Reward granted is handled by the listener above
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
            { transform: [{ scale: scaleAnim }] },
          ]}
        >
          {/* Icon */}
          <View style={[styles.iconWrap, { backgroundColor: colors.primary + '22' }]}>
            <Image
              source={require('../../assets/icons/flash.png')}
              style={[styles.icon, { tintColor: colors.primary }]}
            />
          </View>

          {rewarded ? (
            /* ── Success state ── */
            <>
              <Text style={[styles.title, { color: colors.text }]}>
                {t('ads_removed_title', 'Ads Removed!')}
              </Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {t('ads_removed_body', 'You have 3 hours of ad-free streaming. Enjoy!')}
              </Text>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.primary }]}
                onPress={onClose}
              >
                <Text style={styles.btnTxt}>{t('great', 'Great!')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* ── Offer state ── */
            <>
              <Text style={[styles.title, { color: colors.text }]}>
                {t('remove_ads_title', 'Remove Ads')}
              </Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {t(
                  'remove_ads_body',
                  'Watch a short video and enjoy 3 hours of completely ad-free streaming.',
                )}
              </Text>

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
                onPress={handleWatch}
                disabled={loading}
              >
                <Text style={styles.btnTxt}>
                  {loading
                    ? t('loading_ad', 'Loading…')
                    : t('watch_video', 'Watch Video')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.skipBtn} onPress={onClose}>
                <Text style={[styles.skipTxt, { color: colors.textMuted }]}>
                  {t('no_thanks', 'No thanks')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: 300,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    width: 32,
    height: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'Rubik',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    fontFamily: 'Rubik',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  btn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnTxt: {
    color: '#fff',
    fontWeight: '700',
    fontFamily: 'Rubik',
    fontSize: 15,
  },
  skipBtn: {
    paddingVertical: 6,
  },
  skipTxt: {
    fontSize: 13,
    fontFamily: 'Rubik',
  },
});

export default RewardedAdModal;
