import React, {useState, useRef, useEffect, useCallback, useMemo} from 'react';
import {
  View, StyleSheet, Dimensions, TouchableOpacity, Text,
  ActivityIndicator, StatusBar, Modal, Image, Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import Video from 'react-native-video';
import {useRoute, useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../hooks/useTheme';
import {FONTS} from '../theme/typography';
import {useTranslation} from 'react-i18next';

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

// ─── HLS Quality Presets ─────────────────────────────────────────────────────
const HLS_QUALITIES = [
  {label: 'Auto',  bitrate: 0},
  {label: '1080p', bitrate: 8000000},
  {label: '720p',  bitrate: 3000000},
  {label: '480p',  bitrate: 1500000},
  {label: '360p',  bitrate: 800000},
];

// ─── Icon helpers ────────────────────────────────────────────────────────────
const ICON_BACK = require('../../assets/icons/arrow.png');
const ICON_CLAPBOARD = require('../../assets/icons/clapboard.png');
const ICON_NLP = require('../../assets/icons/nlp.png');

// ═══════════════════════════════════════════════════════════════════════════════
// PlayerScreen
// ═══════════════════════════════════════════════════════════════════════════════
export const PlayerScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const {url, title, contentId, category, qualities: paramQualities} = route.params || {};
  const {t} = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const videoRef: any = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const qualityList = useMemo(() => {
    if (paramQualities && paramQualities.length > 0) {
      return paramQualities.map((label: string) => {
        const match = HLS_QUALITIES.find(q => q.label === label);
        return match || {label, bitrate: 0};
      });
    }
    return HLS_QUALITIES;
  }, [paramQualities]);

  const [selectedQuality, setSelectedQuality] = useState(qualityList[0] || HLS_QUALITIES[0]);
  const [showQualityPicker, setShowQualityPicker] = useState(false);
  const hideTimer = useRef<any>(null);

  // ─── Video Source ────────────────────────────────────────────────────────
  // NO `type` prop — lets react-native-video auto-detect (v5=m3u8, v6=hls).
  // CRITICAL: CDN (scdns.io) requires Referer + Origin + User-Agent headers or rejects.
  const videoSource = useMemo(() => {
    if (!url) return undefined;
    return {
      uri: url,
      headers: {
        'Referer': 'https://www.fasel-hd.cam/',
        'Origin': 'https://www.fasel-hd.cam',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    };
  }, [url]);

  // ─── View tracking handled in DetailsScreen before navigation ─────────
  // (avoids double-counting: DetailsScreen.recordPlay + PlayerScreen.mount)

  // ─── Cleanup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // ─── Controls auto-hide ──────────────────────────────────────────────────
  const triggerHideControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  const toggleControls = useCallback(() => {
    setShowControls(prev => {
      if (!prev) triggerHideControls();
      return !prev;
    });
  }, [triggerHideControls]);

  // ─── Video event handlers ────────────────────────────────────────────────
  const handleProgress = useCallback((data: any) => {
    if (data?.currentTime !== undefined) setCurrentTime(data.currentTime);
  }, []);

  const handleLoadStart = useCallback(() => {
    console.log('[Player] Load started for:', url?.substring(0, 100));
    setLoading(true);
    setBuffering(true);
  }, [url]);

  const handleLoad = useCallback((meta: any) => {
    console.log('[Player] Video loaded, duration:', meta?.duration);
    if (meta?.duration !== undefined) setDuration(meta.duration);
    setLoading(false);
    setBuffering(false);
    triggerHideControls();
  }, [triggerHideControls]);

  // onReadyForDisplay: v6-only callback (silently ignored in v5.2.1).
  // Only applied on iOS to avoid potential Android quirks.
  const handleReadyForDisplay = useCallback(() => {
    console.log('[Player] Video surface ready for display');
  }, []);

  const handleBuffer = useCallback((data: any) => {
    const isBuf = data?.isBuffering ?? data?.buffering ?? false;
    setBuffering(isBuf);
  }, []);

  const handleEnd = useCallback(() => {
    setPlaying(false);
    setShowControls(true);
  }, []);

  // ─── Error handler — check multiple paths, never show [object Object] ──
  const handleError = useCallback((err: any) => {
    let errStr = '';
    let errCode = '';
    const e = err?.error ?? err;
    if (typeof e === 'string') {
      errStr = e;
    } else if (e?.errorString) {
      errStr = e.errorString;
    } else if (e?.message) {
      errStr = e.message;
    } else if (e?.localizedFailureReason) {
      errStr = e.localizedFailureReason;
    } else if (e?.code) {
      errCode = String(e.code);
    }
    // Also check for nested error properties (ExoPlayer / AVPlayer)
    if (!errStr) {
      const nested = e?.error?.errorString || e?.error?.message || e?.error?.localizedFailureReason;
      if (nested) errStr = nested;
    }
    if (!errStr) {
      try { errStr = JSON.stringify(e); } catch { errStr = 'Unknown playback error'; }
    }
    // Build detailed error with URL context for debugging
    const urlHint = url ? `URL: ${url.substring(0, 120)}${url.length > 120 ? '...' : ''}` : 'No URL';
    const detailMsg = errCode ? `${errStr} (code: ${errCode})` : errStr;
    const fullMsg = `${detailMsg}\n${urlHint}`;
    console.error('[Player] Video error:', fullMsg, '| raw:', JSON.stringify(err)?.substring(0, 500));
    setErrorMsg(fullMsg);
    setError(t('video_unavailable'));
    setBuffering(false);
    setLoading(false);
  }, [t, url]);

  const handleRetry = useCallback(() => {
    setError(null);
    setErrorMsg('');
    setBuffering(true);
    setLoading(true);
    setPlaying(false);
    setTimeout(() => setPlaying(true), 100);
  }, []);

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  const handleSeekBarPress = (e: any) => {
    const {locationX} = e.nativeEvent;
    const seekWidth = SCREEN_WIDTH - 32;
    const seekTime = (locationX / seekWidth) * duration;
    const clamped = Math.max(0, Math.min(seekTime, duration));
    videoRef.current?.seek(clamped);
    setCurrentTime(clamped);
  };

  const handleQualitySelect = (q: any) => {
    setSelectedQuality(q);
    setShowQualityPicker(false);
    triggerHideControls();
  };

  // ════════════════════════════════════════════════════════════════════════
  // ─── ERROR / NO-URL STATES ──────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════
  if (!url) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar hidden />
        <View style={styles.errorCard}>
          <Image source={ICON_NLP} style={styles.errorIcon} />
          <Text style={[styles.errorTitle, FONTS.heading3]}>{t('video_unavailable')}</Text>
          <Text style={[styles.errorSub, FONTS.bodySmall]}>No URL provided</Text>
          <TouchableOpacity style={styles.errorButtonPrimary} onPress={() => navigation.goBack()}>
            <Text style={[styles.errorButtonLabel, FONTS.bodyLarge]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar hidden />
        <View style={styles.errorCard}>
          <Image source={ICON_NLP} style={styles.errorIcon} />
          <Text style={[styles.errorTitle, FONTS.heading3]}>
            {error === 'timeout' ? 'Playback Timeout' : error}
          </Text>
          {errorMsg ? (
            <Text style={[styles.errorSub, FONTS.bodySmall]} numberOfLines={5}>
              {errorMsg}
            </Text>
          ) : null}
          <View style={styles.errorActions}>
            <TouchableOpacity style={styles.errorButtonPrimary} onPress={handleRetry}>
              <Text style={[styles.errorButtonLabel, FONTS.bodyLarge]}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.errorButtonSecondary} onPress={() => navigation.goBack()}>
              <Text style={[styles.errorButtonLabelSecondary, FONTS.bodyLarge]}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ─── MAIN PLAYER ────────────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════
  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* ── Video — TouchableWithoutFeedback (NOT TouchableOpacity) ───── */}
      <TouchableWithoutFeedback onPress={toggleControls} style={StyleSheet.absoluteFill}>
        <View style={styles.videoContainer}>
          <Video
            ref={videoRef}
            source={videoSource}
            resizeMode="contain"
            onProgress={handleProgress}
            onLoadStart={handleLoadStart}
            onLoad={handleLoad}
            // onReadyForDisplay: v6-only, safely ignored in v5.2.1 — iOS only
            {...(Platform.OS === 'ios' ? {onReadyForDisplay: handleReadyForDisplay} : {})}
            onBuffer={handleBuffer}
            onEnd={handleEnd}
            onError={handleError}
            playInBackground={false}
            playWhenInactive={false}
            paused={!playing}
            style={styles.video}
            repeat={false}
            controls={false}
            // bufferConfig: Android only (crashes / ignored on iOS)
            bufferConfig={
              Platform.OS === 'android'
                ? {
                    minBufferMs: 15000,
                    maxBufferMs: 50000,
                    bufferForPlaybackMs: 2500,
                    bufferForPlaybackAfterRebufferMs: 5000,
                  }
                : undefined
            }
          />
        </View>
      </TouchableWithoutFeedback>

      {/* ── Buffering overlay — blurred dark scrim ────────────────────── */}
      {(buffering || loading) && (
        <View style={styles.bufferingOverlay} pointerEvents="none">
          <View style={styles.bufferingSpinnerRing}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
          <Text style={[styles.bufferingLabel, FONTS.caption]}>
            {loading ? 'Connecting...' : 'Buffering...'}
          </Text>
        </View>
      )}

      {/* ── Controls overlay — pointerEvents="box-none" for pass-through ─ */}
      {showControls && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

          {/* ──── Top Bar ──────────────────────────────────────────────── */}
          <View style={[styles.topGradient, {paddingTop: insets.top + 4}]}>
            <View style={styles.topRow}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => navigation.goBack()}
                activeOpacity={0.7}
              >
                <Image source={ICON_BACK} style={styles.iconBack} />
              </TouchableOpacity>

              <View style={styles.titleContainer}>
                <Image source={ICON_CLAPBOARD} style={styles.iconClapboard} />
                <Text style={[styles.titleText, FONTS.bodySmall]} numberOfLines={1}>
                  {title || 'Now Playing'}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.qualityChip}
                onPress={() => {
                  setShowQualityPicker(true);
                  if (hideTimer.current) clearTimeout(hideTimer.current);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.qualityChipLabel}>{selectedQuality.label}</Text>
                <Text style={styles.qualityChipArrow}>{'\u25BC'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ──── Bottom Controls (glassmorphism) ─────────────────────── */}
          <View style={[styles.bottomGlass, {paddingBottom: insets.bottom + 16}]}>
            {/* Seek bar */}
            <TouchableOpacity
              style={styles.seekBarTouchArea}
              onPress={handleSeekBarPress}
              activeOpacity={1}
            >
              <View style={styles.seekBarTrack}>
                <View style={[styles.seekBarFilled, {width: `${Math.min(progress, 1) * 100}%`}]}>
                  <View style={styles.seekBarThumb} />
                </View>
              </View>
            </TouchableOpacity>

            {/* Time row */}
            <View style={styles.timeRow}>
              <Text style={[styles.timeText, FONTS.mono]}>{formatTime(currentTime)}</Text>
              <Text style={[styles.timeText, FONTS.mono]}>{formatTime(duration)}</Text>
            </View>

            {/* Playback row */}
            <View style={styles.playbackRow}>
              {/* Rewind 10s */}
              <TouchableOpacity
                style={styles.skipButton}
                onPress={() => videoRef.current?.seek(Math.max(currentTime - 10, 0))}
                activeOpacity={0.7}
              >
                <Image source={ICON_BACK} style={styles.iconRewind} />
                <Text style={[styles.skipLabel, FONTS.micro]}>10</Text>
              </TouchableOpacity>

              {/* Play / Pause */}
              <TouchableOpacity
                style={styles.playPauseButton}
                onPress={() => { setPlaying(!playing); triggerHideControls(); }}
                activeOpacity={0.8}
              >
                <Text style={styles.playPauseGlyph}>
                  {playing ? '\u275A\u275A' : '\u25B6'}
                </Text>
              </TouchableOpacity>

              {/* Forward 10s */}
              <TouchableOpacity
                style={styles.skipButton}
                onPress={() => videoRef.current?.seek(Math.min(currentTime + 10, duration))}
                activeOpacity={0.7}
              >
                <Image source={ICON_BACK} style={styles.iconForward} />
                <Text style={[styles.skipLabel, FONTS.micro]}>10</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ──── Tap-away deadzone (prevents immediate hide on control tap) ── */}
          <TouchableWithoutFeedback onPress={toggleControls}>
            <View style={styles.tapDeadzone} />
          </TouchableWithoutFeedback>
        </View>
      )}

      {/* ─── Quality Picker Modal (glassmorphism) ─────────────────────────── */}
      <Modal
        visible={showQualityPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQualityPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowQualityPicker(false)}
        >
          <View style={styles.qualityGlassCard}>
            <Text style={[styles.qualityModalTitle, FONTS.heading3]}>
              {t('select_quality')}
            </Text>
            {qualityList.map((q: any) => {
              const isActive = selectedQuality.label === q.label;
              return (
                <TouchableOpacity
                  key={q.label}
                  style={[styles.qualityOption, isActive && styles.qualityOptionActive]}
                  onPress={() => handleQualitySelect(q)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.qualityOptionText,
                      isActive && styles.qualityOptionTextActive,
                      FONTS.bodyLarge,
                    ]}
                  >
                    {q.label}
                  </Text>
                  {isActive && (
                    <Text style={styles.qualityCheckmark}>{'\u2713'}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════════
const createStyles = (colors: any) => StyleSheet.create({
  // ─── Container ────────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // ─── Video ────────────────────────────────────────────────────────────
  videoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: '#000',
  },

  // ─── Buffering overlay ────────────────────────────────────────────────
  bufferingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  bufferingSpinnerRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bufferingLabel: {
    color: 'rgba(255,255,255,0.8)',
    marginTop: 14,
  },

  // ─── Top controls (semi-transparent gradient) ────────────────────────
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingBottom: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  iconButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  iconBack: {
    width: 22,
    height: 22,
    tintColor: '#FFFFFF',
    resizeMode: 'contain',
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    overflow: 'hidden',
  },
  iconClapboard: {
    width: 16,
    height: 16,
    tintColor: 'rgba(255,255,255,0.6)',
    resizeMode: 'contain',
    marginRight: 6,
  },
  titleText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  qualityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(229,57,53,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(229,57,53,0.5)',
    gap: 5,
  },
  qualityChipLabel: {
    color: '#FF5252',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  qualityChipArrow: {
    color: '#FF5252',
    fontSize: 8,
  },

  // ─── Bottom controls (glassmorphism) ─────────────────────────────────
  bottomGlass: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },

  // ─── Seek bar ────────────────────────────────────────────────────────
  seekBarTouchArea: {
    width: '100%',
    height: 32,
    justifyContent: 'center',
    marginBottom: 4,
  },
  seekBarTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  seekBarFilled: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  seekBarThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    marginRight: -8,
    shadowColor: '#E53935',
    shadowOffset: {width: 0, height: 0},
    shadowRadius: 6,
    shadowOpacity: 0.8,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#E53935',
  },

  // ─── Time row ────────────────────────────────────────────────────────
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  timeText: {
    color: 'rgba(255,255,255,0.7)',
  },

  // ─── Playback row ────────────────────────────────────────────────────
  playbackRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 36,
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
  },
  iconRewind: {
    width: 22,
    height: 22,
    tintColor: '#FFFFFF',
    resizeMode: 'contain',
    transform: [{scaleX: -1}],
  },
  iconForward: {
    width: 22,
    height: 22,
    tintColor: '#FFFFFF',
    resizeMode: 'contain',
  },
  skipLabel: {
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  playPauseButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...colors.shadowGlow,
  },
  playPauseGlyph: {
    color: '#FFFFFF',
    fontSize: 28,
    textAlign: 'center',
    lineHeight: 34,
  },

  // ─── Tap deadzone ────────────────────────────────────────────────────
  tapDeadzone: {
    position: 'absolute',
    top: 90,
    left: 0,
    right: 0,
    bottom: 140,
  },

  // ─── Quality picker modal (glassmorphism) ────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qualityGlassCard: {
    width: 260,
    borderRadius: 20,
    padding: 6,
    backgroundColor: 'rgba(20,24,32,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  qualityModalTitle: {
    color: '#FFFFFF',
    textAlign: 'center',
    paddingVertical: 16,
  },
  qualityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    marginHorizontal: 4,
    marginVertical: 2,
  },
  qualityOptionActive: {
    backgroundColor: 'rgba(229,57,53,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(229,57,53,0.4)',
  },
  qualityOptionText: {
    color: 'rgba(255,255,255,0.6)',
  },
  qualityOptionTextActive: {
    color: '#FF5252',
    fontWeight: '700',
  },
  qualityCheckmark: {
    color: '#FF5252',
    fontSize: 16,
    fontWeight: '700',
  },

  // ─── Error / No-URL screen ───────────────────────────────────────────
  errorContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorCard: {
    backgroundColor: 'rgba(20,24,32,0.95)',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  errorIcon: {
    width: 56,
    height: 56,
    tintColor: colors.error,
    resizeMode: 'contain',
    marginBottom: 8,
  },
  errorTitle: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  errorSub: {
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    marginTop: 6,
    marginHorizontal: 12,
  },
  errorActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  errorButtonPrimary: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: colors.primary,
    borderRadius: 14,
    alignItems: 'center',
    ...colors.shadowGlow,
  },
  errorButtonLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  errorButtonSecondary: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  errorButtonLabelSecondary: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '700',
  },
});
