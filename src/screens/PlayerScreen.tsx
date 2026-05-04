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
type QualityLevel = 'auto' | string; // 'auto' or a resolution height string e.g. '1080'

interface QualityOption {
  label: string;   // display string e.g. 'Auto', '1080p', '720p'
  value: QualityLevel;
  resolution?: number; // height in px, undefined for auto
}

// ─── M3U8 parser ─────────────────────────────────────────────────────────────
// Parses EXT-X-STREAM-INF entries from a master playlist and returns a sorted
// list of quality options (highest first) plus an 'Auto' entry at the top.
const parseM3u8Qualities = async (m3u8Url: string): Promise<QualityOption[]> => {
  try {
    const res = await fetch(m3u8Url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await res.text();

    // Not a master playlist (no STREAM-INF) — single quality stream
    if (!text.includes('#EXT-X-STREAM-INF')) {
      return [{ label: 'Auto', value: 'auto' }];
    }

    const seen = new Set<number>();
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
      // Try RESOLUTION=WxH first
      const resMatch = line.match(/RESOLUTION=\d+x(\d+)/i);
      if (resMatch) {
        seen.add(parseInt(resMatch[1], 10));
        continue;
      }
      // Fallback: derive from BANDWIDTH (rough mapping)
      const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
      if (bwMatch) {
        const bw = parseInt(bwMatch[1], 10);
        if (bw >= 4_000_000) seen.add(1080);
        else if (bw >= 2_000_000) seen.add(720);
        else if (bw >= 800_000)  seen.add(480);
        else seen.add(360);
      }
    }

    const heights = Array.from(seen).sort((a, b) => b - a);
    const options: QualityOption[] = [{ label: 'Auto', value: 'auto' }];
    for (const h of heights) {
      options.push({ label: `${h}p`, value: String(h), resolution: h });
    }
    return options;
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

  // Parse the master m3u8 to discover real quality variants
  useEffect(() => {
    if (!url) return;
    parseM3u8Qualities(url).then(opts => {
      setQualityOptions(opts);
      // If saved preference isn't in the manifest, fall back to auto
      const s = getSettings();
      const saved = s.playerQuality || s.qualityPreference || 'auto';
      const exists = opts.some(o => o.value === saved);
      setQualityLevel(exists ? saved : 'auto');
    });
  }, [url]);

  const selectedVideoTrack = qualityLevel === 'auto'
    ? { type: 'auto' as const }
    : { type: 'resolution' as const, value: parseInt(qualityLevel, 10) };

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
    // Snapshot current position — handleLoad will seek back here after the
    // track switch causes react-native-video to reload.
    seekAfterLoadRef.current = currentTime;
    setQualityLevel(quality);
    setShowQualityPicker(false);
    showControlsTemporarily();
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
          source={{ uri: url, type: 'm3u8' }}
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
