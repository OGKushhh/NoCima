import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Text,
  ActivityIndicator, StatusBar, Animated, Image,
  I18nManager, Modal, GestureResponderEvent,
} from 'react-native';
import Video, { VideoRef, OnProgressData, OnBufferData } from 'react-native-video';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { getSettings, saveSettings } from '../storage';
import { useWindowDimensions } from 'react-native';
import { useTheme } from '../hooks/useTheme';

// ─── Types ────────────────────────────────────────────────────────────────────
type QualityLevel = 'auto' | string;

interface QualityOption {
  label: string;
  value: QualityLevel;
  resolution?: number;
  uri?: string; // child playlist URL — if present, swap source.uri instead of using selectedVideoTrack
}

// ─── M3U8 parser ─────────────────────────────────────────────────────────────
const QUALITY_TIERS = [2160, 1440, 1080, 720, 480, 360, 240];

const snapToTier = (h: number): number => {
  let closest = QUALITY_TIERS[0];
  let minDiff = Math.abs(h - closest);
  for (const tier of QUALITY_TIERS) {
    const diff = Math.abs(h - tier);
    if (diff < minDiff) { minDiff = diff; closest = tier; }
  }
  return closest;
};

/** Resolve a potentially relative child URL against the master playlist URL. */
const resolveUrl = (base: string, child: string): string => {
  if (child.startsWith('http')) return child;
  const baseDir = base.substring(0, base.lastIndexOf('/') + 1);
  return baseDir + child;
};

const parseM3u8Qualities = async (m3u8Url: string): Promise<QualityOption[]> => {
  try {
    const res = await fetch(m3u8Url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await res.text();

    if (!text.includes('#EXT-X-STREAM-INF')) {
      return [{ label: 'Auto', value: 'auto' }];
    }

    const seen = new Map<number, QualityOption>(); // keyed by snapped height
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith('#EXT-X-STREAM-INF')) continue;

      // The next non-empty line is the child playlist URI
      let childUri = '';
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next && !next.startsWith('#')) { childUri = next; break; }
      }

      let height = 0;
      const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
      if (resMatch) {
        height = snapToTier(parseInt(resMatch[2], 10));
      } else {
        const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
        if (bwMatch) {
          const bw = parseInt(bwMatch[1], 10);
          if      (bw >= 4_000_000) height = 1080;
          else if (bw >= 2_000_000) height = 720;
          else if (bw >= 800_000)   height = 480;
          else                      height = 360;
        }
      }

      if (height && !seen.has(height)) {
        seen.set(height, {
          label: `${height}p`,
          value: String(height),
          resolution: height,
          uri: childUri ? resolveUrl(m3u8Url, childUri) : undefined,
        });
      }
    }

    const sorted = Array.from(seen.values()).sort((a, b) => (b.resolution ?? 0) - (a.resolution ?? 0));
    return [{ label: 'Auto', value: 'auto' }, ...sorted];
  } catch {
    return [{ label: 'Auto', value: 'auto' }];
  }
};

const VOLUME_OPTIONS = [
  { label: '🔇  Mute',  value: 0   },
  { label: '🔉  25%',   value: 25  },
  { label: '🔉  50%',   value: 50  },
  { label: '🔊  75%',   value: 75  },
  { label: '🔊  100%',  value: 100 },
];

// ─────────────────────────────────────────────────────────────────────────────
export const PlayerScreen: React.FC = () => {
  const { colors } = useTheme();
  const route      = useRoute<any>();
  const navigation = useNavigation<any>();
  const { url, title } = route.params || {};
  const { t }      = useTranslation();
  const insets     = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isRTL      = I18nManager.isRTL;

  const videoRef = useRef<VideoRef>(null);

  // ── Playback state ────────────────────────────────────────────────────────
  const [playing, setPlaying]         = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]       = useState(0);
  const [buffering, setBuffering]     = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // ── Quality ───────────────────────────────────────────────────────────────
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([
    { label: 'Auto', value: 'auto' },
  ]);
  const [qualityLevel, setQualityLevel] = useState<QualityLevel>(() => {
    const s = getSettings();
    return s.playerQuality || s.qualityPreference || 'auto';
  });
  // The URI actually fed to <Video>. Starts as the master URL; switches to a
  // child playlist URL when the user picks a specific quality tier.
  const [activeUri, setActiveUri] = useState<string>(url);

  // Parse the master m3u8 to discover real quality variants.
  // MP4 links are single-quality — skip parsing and stay on Auto.
  useEffect(() => {
    if (!url) return;
    setActiveUri(url); // reset on new content
    if (!url.includes('.m3u8')) {
      setQualityOptions([{ label: 'Auto', value: 'auto' }]);
      setQualityLevel('auto');
      return;
    }
    parseM3u8Qualities(url).then(opts => {
      setQualityOptions(opts);
      const s = getSettings();
      const saved = s.playerQuality || s.qualityPreference || 'auto';
      const exists = opts.some(o => o.value === saved);
      setQualityLevel(exists ? saved : 'auto');
    });
  }, [url]);

  // selectedVideoTrack is only a fallback for manifests without child URIs.
  // When a child URI is available we swap source.uri instead (more reliable).
  const selectedVideoTrack = (() => {
    if (qualityLevel === 'auto') return { type: 'auto' as const };
    const opt = qualityOptions.find(o => o.value === qualityLevel);
    if (opt?.uri) return { type: 'auto' as const }; // uri swap handles it
    const res = opt?.resolution ?? parseInt(qualityLevel, 10);
    return { type: 'resolution' as const, value: res };
  })();

  // ── Volume ────────────────────────────────────────────────────────────────
  // volumePct = 0–200 (percentage shown in UI)
  // For 0–100%: set video volume prop (0.0–1.0), keep system volume at max.
  // For 101–200%: keep video volume at 1.0, raise system volume above its
  //   current max using SystemSetting (requires react-native-system-setting).
  const [volumePct, setVolumePct] = useState(100);
  const [showQualityPicker, setShowQualityPicker] = useState(false);
  const [showVolumePicker, setShowVolumePicker]   = useState(false);

  const applyVolume = useCallback((pct: number) => {
    setVolumePct(pct);
  }, []);

  // The actual prop fed to <Video> — 0.0–1.0
  const videoPropVolume = volumePct / 100;

  // ── Seek-after-load ref ───────────────────────────────────────────────────
  // Snapshot position before a quality switch so handleLoad can restore it.
  const seekAfterLoadRef = useRef<number | null>(null);

  // ── Seek bar ──────────────────────────────────────────────────────────────
  const [seekBarWidth, setSeekBarWidth] = useState(0);
  const [seekBarX, setSeekBarX]         = useState(0);
  const seekBarRef = useRef<View>(null);

  // ── Seek feedback ─────────────────────────────────────────────────────────
  const [seekingBackward, setSeekingBackward] = useState(false);
  const [seekingForward, setSeekingForward]   = useState(false);

  // ── Controls visibility ───────────────────────────────────────────────────
  const hideTimer       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    controlsOpacity.setValue(1);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(controlsOpacity, { toValue: 0, duration: 300, useNativeDriver: true })
        .start(() => setShowControls(false));
    }, 5000);
  }, [controlsOpacity]);

  // ── Video callbacks ───────────────────────────────────────────────────────
  const handleVideoTap = () => {
    if (showControls) {
      setShowControls(false);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    } else {
      showControlsTemporarily();
    }
  };

  const handleProgress = (data: OnProgressData) => setCurrentTime(data.currentTime);
  const handleLoad = (meta: any) => {
    setDuration(meta.duration);
    setBuffering(false);
    showControlsTemporarily();
    // If this load was triggered by a quality switch, restore the saved position.
    if (seekAfterLoadRef.current !== null) {
      const target = seekAfterLoadRef.current;
      seekAfterLoadRef.current = null;
      // Small delay lets the decoder initialise before the seek lands cleanly.
      setTimeout(() => {
        videoRef.current?.seek(target);
        setCurrentTime(target);
      }, 100);
    }
  };
  const handleBuffer  = (data: OnBufferData) => setBuffering(data.isBuffering);
  const handleEnd     = () => { setPlaying(false); setShowControls(true); };
  const handleError   = (err: any) => {
    console.error('[Player] Video error:', err?.error?.errorString || err?.error || err);
    setError(t('video_unavailable'));
    setBuffering(false);
  };

  // ── Seek helpers ──────────────────────────────────────────────────────────
  const formatTime = (seconds: number) => {
    const hrs  = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  const handleSeekBarPress = (e: GestureResponderEvent) => {
    const { pageX } = e.nativeEvent;
    if (seekBarWidth === 0) return;
    const relativeX = Math.max(0, Math.min(pageX - seekBarX, seekBarWidth));
    const seekTime  = (relativeX / seekBarWidth) * duration;
    videoRef.current?.seek(Math.min(Math.max(seekTime, 0), duration));
    setCurrentTime(seekTime);
  };

  const handleSeekBarLayout = () => {
    seekBarRef.current?.measure((x, y, w, h, pageX) => {
      setSeekBarWidth(w);
      setSeekBarX(pageX);
    });
  };

  const seekBy = (seconds: number) => {
    const newTime = Math.max(0, Math.min(currentTime + seconds, duration));
    videoRef.current?.seek(newTime);
    setCurrentTime(newTime);
    if (seconds < 0) {
      setSeekingBackward(true);
      setTimeout(() => setSeekingBackward(false), 400);
    } else {
      setSeekingForward(true);
      setTimeout(() => setSeekingForward(false), 400);
    }
  };

  // ── Quality ───────────────────────────────────────────────────────────────
  const handleQualityChange = (quality: QualityLevel) => {
    seekAfterLoadRef.current = currentTime;
    setQualityLevel(quality);
    setShowQualityPicker(false);
    showControlsTemporarily();
    // If this quality option has a dedicated child playlist URI, swap the
    // source directly — this is guaranteed to work vs selectedVideoTrack.
    const opt = qualityOptions.find(o => o.value === quality);
    if (quality === 'auto') {
      setActiveUri(url); // back to master playlist
    } else if (opt?.uri) {
      setActiveUri(opt.uri);
    }
    // No uri → selectedVideoTrack fallback handles it (already updated above)
    const s = getSettings();
    s.playerQuality = quality;
    saveSettings(s);
  };

  const getCurrentQualityLabel = () => {
    const found = qualityOptions.find(q => q.value === qualityLevel);
    return found ? found.label : 'Auto';
  };

  // ── Error screen ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <Image source={require('../../assets/icons/alert.png')} style={{ width: 48, height: 48, tintColor: colors.error }} />
        <Text style={[styles.errorText, { color: colors.text }]}>{error}</Text>
        <TouchableOpacity style={[styles.errorButton, { backgroundColor: colors.primary }]} onPress={() => navigation.goBack()}>
          <Text style={styles.errorButtonText}>{t('retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* ── Video ── */}
      <View style={styles.videoContainer}>
        <Video
          ref={videoRef}
          source={{ uri: activeUri, type: activeUri?.includes('.m3u8') ? 'm3u8' : undefined }}
          resizeMode="contain"
          style={styles.video}
          paused={!playing}
          // volume prop is clamped 0.0–1.0 by react-native-video on Android.
          // For >100% we rely on system volume being at max (see applyVolume).
          volume={videoPropVolume}
          // selectedVideoTrack is the correct way to switch HLS quality tracks.
          // 'auto' lets the ABR algorithm decide; 'resolution' pins to that height.
          selectedVideoTrack={selectedVideoTrack}
          onProgress={handleProgress}
          onLoad={handleLoad}
          onBuffer={handleBuffer}
          onEnd={handleEnd}
          onError={handleError}
          playInBackground={false}
          playWhenInactive={false}
          preventsDisplaySleepDuringVideoPlayback
          minLoadRetryCount={3}
        />

        {/* Buffering */}
        {buffering && (
          <View style={styles.bufferingOverlay} pointerEvents="none">
            <View style={[styles.bufferingBox, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          </View>
        )}

        {/* Tap overlay */}
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleVideoTap} />

        {/* Center play button */}
        {!playing && !buffering && (
          <TouchableOpacity
            style={styles.centerPlay}
            onPress={e => { e.stopPropagation(); setPlaying(true); showControlsTemporarily(); }}
          >
            <Image source={require('../../assets/icons/play.png')} style={{ width: 48, height: 48, tintColor: '#fff' }} />
          </TouchableOpacity>
        )}

        {/* Seek feedback */}
        {(seekingBackward || seekingForward) && (
          <View style={styles.seekFeedback} pointerEvents="none">
            <View style={[styles.seekFeedbackBox, { backgroundColor: 'rgba(0,0,0,0.75)' }]}>
              <Image
                source={seekingBackward ? require('../../assets/icons/skip-back.png') : require('../../assets/icons/skip-forward.png')}
                style={{ width: 28, height: 28, tintColor: '#fff' }}
              />
              <Text style={styles.seekFeedbackText}>{seekingBackward ? '-10s' : '+10s'}</Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Controls overlay ── */}
      {showControls && (
        <Animated.View style={[styles.controlsOverlay, { opacity: controlsOpacity }]} pointerEvents="box-none">

          {/* Top bar */}
          <View style={[styles.topControls, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity style={styles.topButton} onPress={() => navigation.goBack()}>
              <Image source={require('../../assets/icons/arrow.png')} style={{ width: 26, height: 26, tintColor: '#fff' }} />
            </TouchableOpacity>
            <Text style={styles.titleText} numberOfLines={1}>{title}</Text>

            {/* Volume */}
            <TouchableOpacity
              style={styles.topBadgeBtn}
              onPress={() => { setShowVolumePicker(true); showControlsTemporarily(); }}
            >
              <Image source={require('../../assets/icons/medium-volume.png')} style={{ width: 18, height: 18, tintColor: '#fff' }} />
              <Text style={styles.topBadgeTxt}>{volumePct}%</Text>
            </TouchableOpacity>

            {/* Quality */}
            <TouchableOpacity
              style={styles.topBadgeBtn}
              onPress={() => { setShowQualityPicker(true); showControlsTemporarily(); }}
            >
              <Text style={styles.topBadgeTxt}>{getCurrentQualityLabel()}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }} />

          {/* Bottom controls */}
          <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 12 }]}>
            {/* Seek bar */}
            <View
              ref={seekBarRef}
              style={[styles.seekBarContainer, { direction: 'ltr' }]}
              onLayout={handleSeekBarLayout}
            >
              <TouchableOpacity style={styles.seekBarTouchable} onPress={handleSeekBarPress} activeOpacity={0.8}>
                <View style={[styles.seekBarTrack, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <View style={[styles.seekBarBuffered, { left: 0, width: '30%' }]} />
                  <View style={[styles.seekBarProgress, { width: `${progress * 100}%`, backgroundColor: colors.primary }]}>
                    <View style={[styles.seekBarThumb, { backgroundColor: colors.primary }]} />
                  </View>
                </View>
              </TouchableOpacity>
            </View>

            {/* Time row */}
            <View style={[styles.timeRow, { direction: 'ltr' }]}>
              <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>

            {/* Playback row */}
            <View style={styles.playbackRow}>
              <TouchableOpacity style={styles.seekButton} onPress={() => seekBy(-10)}>
                <Image
                  source={isRTL ? require('../../assets/icons/skip-forward.png') : require('../../assets/icons/skip-back.png')}
                  style={{ width: 30, height: 30, tintColor: '#fff' }}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.playPauseButton, { backgroundColor: `${colors.primary}CC` }]}
                onPress={() => { setPlaying(!playing); showControlsTemporarily(); }}
              >
                <Image
                  source={playing ? require('../../assets/icons/pause.png') : require('../../assets/icons/play.png')}
                  style={{ width: 36, height: 36, tintColor: '#fff' }}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.seekButton} onPress={() => seekBy(10)}>
                <Image
                  source={isRTL ? require('../../assets/icons/skip-back.png') : require('../../assets/icons/skip-forward.png')}
                  style={{ width: 30, height: 30, tintColor: '#fff' }}
                />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}

      {/* ── Quality picker modal ── */}
      {/* NOTE: Both modals must be inside the root <View> — placing them outside
          causes them to render in a detached tree and never appear. */}
      <Modal
        transparent
        visible={showQualityPicker}
        animationType="fade"
        onRequestClose={() => setShowQualityPicker(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowQualityPicker(false)}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('select_quality')}</Text>
            {qualityOptions.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[styles.modalOption, { borderBottomColor: colors.border }]}
                onPress={() => handleQualityChange(option.value)}
              >
                <Text style={[styles.modalOptionText, { color: colors.text }]}>{option.label}</Text>
                {qualityLevel === option.value && (
                  <Image source={require('../../assets/icons/checkmark.png')} style={{ width: 18, height: 18, tintColor: colors.primary }} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Volume picker modal ── */}
      <Modal
        transparent
        visible={showVolumePicker}
        animationType="fade"
        onRequestClose={() => setShowVolumePicker(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowVolumePicker(false)}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('volume')}</Text>
            {VOLUME_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.modalOption, { borderBottomColor: colors.border }]}
                  onPress={() => { applyVolume(opt.value); setShowVolumePicker(false); showControlsTemporarily(); }}
                >
                  <Text style={[styles.modalOptionText, { color: colors.text }]}>{opt.label}</Text>
                  {volumePct === opt.value && (
                    <Image source={require('../../assets/icons/checkmark.png')} style={{ width: 18, height: 18, tintColor: colors.primary }} />
                  )}
                </TouchableOpacity>
              ))}
          </View>
        </TouchableOpacity>
      </Modal>

    </View>  // ← root container closes here — both modals are inside it
  );
};

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#000' },
  videoContainer:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  video:            { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  controlsOverlay:  { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  bufferingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  bufferingBox:     { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center' },
  centerPlay:       { position: 'absolute', top: '50%', left: '50%', marginLeft: -40, marginTop: -40, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  seekFeedback:     { position: 'absolute', top: '50%', left: '50%', marginLeft: -60, marginTop: -30, width: 120, alignItems: 'center' },
  seekFeedbackBox:  { borderRadius: 24, paddingVertical: 8, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },
  seekFeedbackText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  topControls:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8, backgroundColor: 'rgba(0,0,0,0.5)', gap: 8 },
  topBadgeBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  topBadgeTxt:      { color: '#fff', fontSize: 12, fontWeight: '700' },
  topButton:        { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  titleText:        { flex: 1, color: '#fff', fontSize: 18, fontWeight: '500', marginHorizontal: 8, textAlign: 'center' },
  bottomControls:   { paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(0,0,0,0.5)' },
  seekBarContainer: { width: '100%', marginBottom: 2 },
  seekBarTouchable: { height: 28, justifyContent: 'center' },
  seekBarTrack:     { height: 4, borderRadius: 2, overflow: 'hidden' },
  seekBarBuffered:  { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.15)' },
  seekBarProgress:  { height: '100%', borderRadius: 2, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  seekBarThumb:     { width: 14, height: 14, borderRadius: 7, marginLeft: -7 },
  timeRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  timeText:         { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontVariant: ['tabular-nums'] },
  playbackRow:      { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  seekButton:       { width: 50, height: 50, justifyContent: 'center', alignItems: 'center' },
  playPauseButton:  { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginHorizontal: 12 },
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent:     { borderRadius: 16, padding: 20, width: '80%', maxWidth: 300, borderWidth: 1 },
  modalTitle:       { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  modalOption:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  modalOptionText:  { fontSize: 16 },
  errorContainer:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText:        { fontSize: 16, textAlign: 'center', marginTop: 16 },
  errorButton:      { marginTop: 20, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  errorButtonText:  { color: '#fff', fontSize: 16, fontWeight: '600' },
});