import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Text,
  ActivityIndicator, StatusBar, Animated, Image,
  I18nManager, Modal, GestureResponderEvent, Platform,
} from 'react-native';
import Video, { VideoRef, OnProgressData, OnBufferData } from 'react-native-video';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { getSettings, saveSettings } from '../storage';
import { useWindowDimensions } from 'react-native';
import { useTheme } from '../hooks/useTheme';

type QualityLevel = 'auto' | '1080' | '720' | '480' | '360';

const QUALITY_OPTIONS: { label: string; value: QualityLevel; resolution?: number }[] = [
  { label: 'quality_auto', value: 'auto' },
  { label: 'quality_1080', value: '1080', resolution: 1080 },
  { label: 'quality_720', value: '720', resolution: 720 },
  { label: 'quality_480', value: '480', resolution: 480 },
  { label: 'quality_360', value: '360', resolution: 360 },
];

export const PlayerScreen: React.FC = () => {
  const { colors } = useTheme();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { url, title } = route.params || {};
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isRTL = I18nManager.isRTL;

  const videoRef = useRef<VideoRef>(null);
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qualityLevel, setQualityLevel] = useState<QualityLevel>(() => {
    const settings = getSettings();
    return settings.playerQuality || settings.qualityPreference || 'auto';
  });
  const [seekBarWidth, setSeekBarWidth] = useState(0);
  const [seekBarX, setSeekBarX] = useState(0);
  const [showQualityPicker, setShowQualityPicker] = useState(false);
  const [seekingBackward, setSeekingBackward] = useState(false);
  const [seekingForward, setSeekingForward] = useState(false);
  const [volume, setVolume] = useState(1.0); // 0.0 – 2.0 (>1.0 = boosted)
  const [volumeBarHeight, setVolumeBarHeight] = useState(0);
  const [volumeBarY, setVolumeBarY] = useState(0);
  const volumeBarRef = useRef<View>(null);

  const seekBarRef = useRef<View>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    controlsOpacity.setValue(1);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowControls(false));
    }, 5000);
  }, [controlsOpacity]);

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
  };
  const handleBuffer = (data: OnBufferData) => setBuffering(data.isBuffering);
  const handleEnd = () => {
    setPlaying(false);
    setShowControls(true);
  };
  const handleError = (err: any) => {
    console.error('[Player] Video error:', err?.error?.errorString || err?.error || err);
    setError(t('video_unavailable'));
    setBuffering(false);
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  const handleSeekBarPress = (e: GestureResponderEvent) => {
    const { pageX } = e.nativeEvent;
    if (seekBarWidth === 0) return;
    const relativeX = Math.max(0, Math.min(pageX - seekBarX, seekBarWidth));
    const seekTime = (relativeX / seekBarWidth) * duration;
    videoRef.current?.seek(Math.min(Math.max(seekTime, 0), duration));
    setCurrentTime(seekTime);
  };

  const handleSeekBarLayout = () => {
    if (seekBarRef.current) {
      seekBarRef.current.measure((x, y, width, height, pageX, pageY) => {
        setSeekBarWidth(width);
        setSeekBarX(pageX);
      });
    }
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

  const handleVolumeBarLayout = () => {
    if (volumeBarRef.current) {
      volumeBarRef.current.measure((x, y, width, height, pageX, pageY) => {
        setVolumeBarHeight(height);
        setVolumeBarY(pageY);
      });
    }
  };

  const handleVolumePress = (e: GestureResponderEvent) => {
    const { pageY } = e.nativeEvent;
    if (volumeBarHeight === 0) return;
    // Top = 200%, bottom = 0%
    const relativeY = Math.max(0, Math.min(pageY - volumeBarY, volumeBarHeight));
    const newVolume = parseFloat((2 - (relativeY / volumeBarHeight) * 2).toFixed(2));
    setVolume(newVolume);
  };

 = (quality: QualityLevel) => {
    setQualityLevel(quality);
    setShowQualityPicker(false);
    showControlsTemporarily();
    const settings = getSettings();
    settings.playerQuality = quality;
    saveSettings(settings);
  };

  const getCurrentQualityLabel = (): string => {
    const found = QUALITY_OPTIONS.find(q => q.value === qualityLevel);
    return found ? t(found.label) : t('quality_auto');
  };

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

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <View style={styles.videoContainer}>
        <Video
          ref={videoRef}
          source={{ uri: url, type: 'm3u8' }}
          resizeMode="contain"
          onProgress={handleProgress}
          onLoad={handleLoad}
          onBuffer={handleBuffer}
          onEnd={handleEnd}
          onError={handleError}
          playInBackground={false}
          playWhenInactive={false}
          paused={!playing}
          volume={Math.min(volume, 2.0)}
          style={styles.video}
          preventsDisplaySleepDuringVideoPlayback
          minLoadRetryCount={3}
          maxBitRate={qualityLevel === 'auto' ? 0 : qualityLevel === '1080' ? 8000000 : qualityLevel === '720' ? 5000000 : qualityLevel === '480' ? 2500000 : 1500000}
        />

        {/* Buffering overlay - non-interactive */}
        {buffering && (
          <View style={styles.bufferingOverlay} pointerEvents="none">
            <View style={[styles.bufferingBox, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          </View>
        )}

        {/* Transparent tap overlay to toggle controls */}
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={handleVideoTap} />

        {/* Center play button */}
        {!playing && !buffering && (
          <TouchableOpacity
            style={styles.centerPlay}
            onPress={(e) => {
              e.stopPropagation();
              setPlaying(true);
              showControlsTemporarily();
            }}
          >
            <Image source={require('../../assets/icons/play.png')} style={{ width: 48, height: 48, tintColor: '#fff' }} />
          </TouchableOpacity>
        )}

        {/* Seek feedback animations */}
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

      {/* Controls overlay */}
      {showControls && (
        <Animated.View style={[styles.controlsOverlay, { opacity: controlsOpacity }]} pointerEvents="box-none">
          {/* Top bar with menu icon for quality */}
          <View style={[styles.topControls, { paddingTop: insets.top + 8 }]}>
            <View style={styles.leftIcons}>
              <TouchableOpacity style={styles.topButton} onPress={() => navigation.goBack()}>
                <Image source={require('../../assets/icons/arrow.png')} style={{ width: 28, height: 28, tintColor: '#fff' }} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.topButton} onPress={() => setShowQualityPicker(true)}>
                <Image source={require('../../assets/icons/menu.png')} style={{ width: 28, height: 28, tintColor: '#fff' }} />
              </TouchableOpacity>
            </View>
            <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={{ flex: 1 }} />

          {/* Bottom controls */}
          <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 12 }]}>
            {/* Seek bar - forced LTR with absolute coordinate measurement */}
            <View
              ref={seekBarRef}
              style={[styles.seekBarContainer, { direction: 'ltr' }]}
              onLayout={handleSeekBarLayout}
            >
              <TouchableOpacity style={styles.seekBarTouchable} onPress={handleSeekBarPress} activeOpacity={0.8}>
                <View style={[styles.seekBarTrack, { direction: 'ltr', backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                  <View style={[styles.seekBarBuffered, { left: 0, width: '30%' }]} />
                  <View style={[styles.seekBarProgress, { width: `${progress * 100}%`, backgroundColor: colors.primary }]}>
                    <View style={[styles.seekBarThumb, { backgroundColor: colors.primary }]} />
                  </View>
                </View>
              </TouchableOpacity>
            </View>

            {/* Time row (no quality badge anymore) */}
            <View style={[styles.timeRow, { direction: 'ltr' }]}>
              <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>

            {/* Playback row with RTL icon swap */}
            <View style={styles.playbackRow}>
              <TouchableOpacity style={styles.seekButton} onPress={() => seekBy(-10)}>
                <Image
                  source={isRTL ? require('../../assets/icons/skip-forward.png') : require('../../assets/icons/skip-back.png')}
                  style={{ width: 30, height: 30, tintColor: '#fff' }}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.playPauseButton, { backgroundColor: `${colors.primary}CC` }]}
                onPress={() => {
                  setPlaying(!playing);
                  showControlsTemporarily();
                }}
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
          {/* Vertical volume slider – right edge */}
          <View style={styles.volumeSliderWrapper} pointerEvents="box-none">
            <View style={styles.volumeSliderInner}>
              <Text style={styles.volumeSliderLabel}>{Math.round(volume * 100)}%</Text>
              <View
                ref={volumeBarRef}
                style={styles.volumeTrackContainer}
                onLayout={handleVolumeBarLayout}
              >
                <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={handleVolumePress} activeOpacity={0.8} />
                {/* Track background */}
                <View style={[styles.volumeTrack, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
                {/* 100% marker line */}
                <View style={styles.volumeMidMarker} />
                {/* Filled portion — grows from bottom */}
                <View style={[styles.volumeFill, {
                  height: `${Math.min(volume / 2, 1) * 100}%`,
                  backgroundColor: volume > 1.0 ? colors.primary : 'rgba(255,255,255,0.9)',
                }]} />
                {/* Thumb */}
                <View style={[styles.volumeThumb, {
                  bottom: `${Math.min(volume / 2, 1) * 100}%`,
                  backgroundColor: volume > 1.0 ? colors.primary : '#fff',
                }]} />
              </View>
              <Image
                source={require('../../assets/icons/medium-volume.png')}
                style={{ width: 20, height: 20, tintColor: volume === 0 ? 'rgba(255,255,255,0.3)' : '#fff' }}
              />
            </View>
          </View>
        </Animated.View>
      )}

      {/* Quality picker modal */}
      <Modal transparent visible={showQualityPicker} animationType="fade" onRequestClose={() => setShowQualityPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowQualityPicker(false)}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('select_quality')}</Text>
            {QUALITY_OPTIONS.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[styles.modalOption, { borderBottomColor: colors.border }]}
                onPress={() => handleQualityChange(option.value)}
              >
                <Text style={[styles.modalOptionText, { color: colors.text }]}>{t(option.label)}</Text>
                {qualityLevel === option.value && (
                  <Image source={require('../../assets/icons/checkmark.png')} style={{ width: 18, height: 18, tintColor: colors.primary }} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  videoContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  video: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  controlsOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  bufferingOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  bufferingBox: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center' },
  centerPlay: { position: 'absolute', top: '50%', left: '50%', marginLeft: -40, marginTop: -40, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  seekFeedback: { position: 'absolute', top: '50%', left: '50%', marginLeft: -60, marginTop: -30, width: 120, alignItems: 'center' },
  seekFeedbackBox: { borderRadius: 24, paddingVertical: 8, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },
  seekFeedbackText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  topControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8, backgroundColor: 'rgba(0,0,0,0.5)' },
  leftIcons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  titleText: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '500', marginHorizontal: 8, textAlign: 'center' },
  bottomControls: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(0,0,0,0.5)' },
  seekBarContainer: { width: '100%', marginBottom: 2 },
  seekBarTouchable: { height: 28, justifyContent: 'center' },
  seekBarTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  seekBarBuffered: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.15)' },
  seekBarProgress: { height: '100%', borderRadius: 2, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  seekBarThumb: { width: 14, height: 14, borderRadius: 7, marginLeft: -7 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  timeText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontVariant: ['tabular-nums'] },
  playbackRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  volumeSliderWrapper: { position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center', pointerEvents: 'box-none' },
  volumeSliderInner: { alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
  volumeSliderLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontVariant: ['tabular-nums'], fontWeight: '600' },
  volumeTrackContainer: { width: 4, height: 160, borderRadius: 2, position: 'relative', overflow: 'visible' },
  volumeTrack: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 2 },
  volumeMidMarker: { position: 'absolute', left: -3, right: -3, top: '50%', height: 1, backgroundColor: 'rgba(255,255,255,0.5)', zIndex: 1 },
  volumeFill: { position: 'absolute', bottom: 0, left: 0, right: 0, borderRadius: 2 },
  volumeThumb: { position: 'absolute', left: -5, width: 14, height: 14, borderRadius: 7, marginBottom: -7 },
  seekButton: { width: 50, height: 50, justifyContent: 'center', alignItems: 'center' },
  playPauseButton: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginHorizontal: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { borderRadius: 16, padding: 20, width: '80%', maxWidth: 300, borderWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  modalOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  modalOptionText: { fontSize: 16 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { fontSize: 16, textAlign: 'center', marginTop: 16 },
  errorButton: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  errorButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});