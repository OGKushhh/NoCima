import React, {useState, useRef, useEffect, useCallback} from 'react';
import {
  View, StyleSheet, TouchableOpacity, Text,
  ActivityIndicator, StatusBar, Animated, Easing,
} from 'react-native';
import Video, {
  VideoRef,
  OnProgressData,
  OnBufferData,
} from 'react-native-video';
import {useRoute, useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {Colors} from '../theme/colors';
import {Typography} from '../theme/typography';
import {useTranslation} from 'react-i18next';
import {getSettings, saveSettings} from '../storage';
import {useWindowDimensions} from 'react-native';

type QualityLevel = 'auto' | '1080' | '720' | '480' | '360';

const QUALITY_OPTIONS: {label: string; value: QualityLevel; resolution?: number; icon: string}[] = [
  {label: 'quality_master', value: 'auto', icon: 'diamond'},
  {label: 'quality_fhd', value: '1080', resolution: 1080, icon: 'logo-youtube'},
  {label: 'quality_hd', value: '720', resolution: 720, icon: 'hd'},
  {label: 'quality_sd', value: '480', resolution: 480, icon: 'phone-portrait'},
  {label: 'quality_low', value: '360', resolution: 360, icon: 'phone-portrait-outline'},
];

export const PlayerScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const {url, title} = route.params || {};
  const {t} = useTranslation();
  const insets = useSafeAreaInsets();

  const {width: windowWidth, height: windowHeight} = useWindowDimensions();

  const videoRef = useRef<VideoRef>(null);
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Load saved quality preference SYNCHRONOUSLY before first render
  const [qualityLevel, setQualityLevel] = useState<QualityLevel>(() => {
    const settings = getSettings();
    return settings.playerQuality || 'auto';
  });
  const [seekBarWidth, setSeekBarWidth] = useState(0);
  const [showQualityPicker, setShowQualityPicker] = useState(false);
  const [seekingBackward, setSeekingBackward] = useState(false);
  const [seekingForward, setSeekingForward] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const triggerHideControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setShowControls(false));
    }, 5000);
  }, [controlsOpacity]);

  const toggleControls = useCallback(() => {
    setShowControls(prev => {
      if (!prev) {
        controlsOpacity.setValue(1);
        triggerHideControls();
      }
      return !prev;
    });
  }, [controlsOpacity, triggerHideControls]);

  const handleProgress = (data: OnProgressData) => {
    setCurrentTime(data.currentTime);
  };

  const handleLoad = (meta: any) => {
    setDuration(meta.duration);
    setBuffering(false);
    triggerHideControls();
  };

  const handleBuffer: (data: OnBufferData) => void = (data) => {
    setBuffering(data.isBuffering);
  };

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
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  const handleSeekBarPress = (e: any) => {
    const {locationX} = e.nativeEvent;
    const barW = seekBarWidth || (windowWidth - 32);
    const seekTime = Math.max(0, Math.min((locationX / barW) * duration, duration));
    videoRef.current?.seek(seekTime);
    setCurrentTime(seekTime);
  };

  // @ts-ignore - seekBarLayoutRef
  const handleSeekBarLayout = (e: any) => {
    setSeekBarWidth(e.nativeEvent.layout.width);
  };

  const seekBy = (seconds: number) => {
    const newTime = Math.max(0, Math.min(currentTime + seconds, duration));
    videoRef.current?.seek(newTime);
    setCurrentTime(newTime);

    // Show seek animation feedback
    if (seconds < 0) {
      setSeekingBackward(true);
      setTimeout(() => setSeekingBackward(false), 400);
    } else {
      setSeekingForward(true);
      setTimeout(() => setSeekingForward(false), 400);
    }
  };

  const handleQualityChange = (quality: QualityLevel) => {
    setQualityLevel(quality);
    setShowQualityPicker(false);
    triggerHideControls();

    // Save preference
    const settings = getSettings();
    settings.playerQuality = quality;
    saveSettings(settings);

    // Brief buffering indication while stream adapts
    setBuffering(true);
    setTimeout(() => setBuffering(false), 1500);
  };

  const getCurrentQualityLabel = (): string => {
    const found = QUALITY_OPTIONS.find(q => q.value === qualityLevel);
    return found ? t(found.label) : t('quality_master');
  };

  const toggleQualityPicker = () => {
    setShowQualityPicker(prev => !prev);
  };

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />
        <Icon name="alert-circle-outline" size={48} color={Colors.dark.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.errorButton} onPress={() => navigation.goBack()}>
          <Text style={styles.errorButtonText}>{t('retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      <TouchableOpacity
        style={styles.videoContainer}
        activeOpacity={1}
        onPress={toggleControls}
      >
        <Video
          ref={videoRef}
          source={{uri: url, type: 'm3u8'}}
          resizeMode="contain"
          onProgress={handleProgress}
          onLoad={handleLoad}
          onBuffer={handleBuffer}
          onEnd={handleEnd}
          onError={handleError}
          playInBackground={false}
          playWhenInactive={false}
          paused={!playing}
          style={styles.video}
          preventsDisplaySleepDuringVideoPlayback={true}
          minLoadRetryCount={3}
          maxBitRate={qualityLevel === 'auto' ? 0 : qualityLevel === '1080' ? 8000000 : qualityLevel === '720' ? 5000000 : qualityLevel === '480' ? 2500000 : 1500000}
        />

        {/* Buffering spinner */}
        {buffering && (
          <View style={styles.bufferingOverlay}>
            <View style={styles.bufferingBox}>
              <ActivityIndicator size="large" color={Colors.dark.primary} />
            </View>
          </View>
        )}

        {/* Center play button */}
        {!playing && !buffering && (
          <TouchableOpacity
            style={styles.centerPlay}
            onPress={() => {
              setPlaying(true);
              triggerHideControls();
            }}
          >
            <Icon name="play" size={64} color="#fff" />
          </TouchableOpacity>
        )}

        {/* Seek feedback animations */}
        {seekingBackward && (
          <View style={styles.seekFeedback}>
            <View style={styles.seekFeedbackBox}>
              <Icon name="replay-10" size={32} color="#fff" />
              <Text style={styles.seekFeedbackText}>-10s</Text>
            </View>
          </View>
        )}
        {seekingForward && (
          <View style={styles.seekFeedback}>
            <View style={styles.seekFeedbackBox}>
              <Icon name="forward-10" size={32} color="#fff" />
              <Text style={styles.seekFeedbackText}>+10s</Text>
            </View>
          </View>
        )}

        {/* Quality change feedback */}
        {buffering && !playing && (
          <View style={styles.seekFeedback}>
            <View style={styles.seekFeedbackBox}>
              <Icon name="settings" size={24} color="#fff" />
              <Text style={styles.seekFeedbackText}>{getCurrentQualityLabel()}</Text>
            </View>
          </View>
        )}
      </TouchableOpacity>

      {/* Controls overlay */}
      {showControls && (
        <Animated.View style={[styles.controlsOverlay, {opacity: controlsOpacity}]}>
          {/* Top bar */}
          <View style={[styles.topControls, {paddingTop: insets.top + 8}]}>
            <TouchableOpacity style={styles.topButton} onPress={() => navigation.goBack()}>
              <Icon name="arrow-back" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
            <View style={{width: 40}} />
          </View>

          {/* Spacer */}
          <View style={{flex: 1}} />

          {/* Bottom controls */}
          <View style={[styles.bottomControls, {paddingBottom: insets.bottom + 12}]}>
            {/* Seek bar */}
            <TouchableOpacity
              style={styles.seekBarContainer}
              onPress={handleSeekBarPress}
              activeOpacity={0.8}
              onLayout={handleSeekBarLayout}
            >
              <View style={styles.seekBarTrack}>
                <View style={[styles.seekBarBuffered]} />
                <View style={[styles.seekBarProgress, {width: `${progress * 100}%`}]}>
                  <View style={styles.seekBarThumb} />
                </View>
              </View>
            </TouchableOpacity>

            {/* Time labels + quality badge */}
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
              <TouchableOpacity
                style={styles.qualityBadge}
                onPress={toggleQualityPicker}
              >
                <Icon name="options" size={12} color={Colors.dark.primary} />
                <Text style={styles.qualityBadgeText}>{getCurrentQualityLabel()}</Text>
              </TouchableOpacity>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>

            {/* Playback buttons */}
            <View style={styles.playbackRow}>
              {/* Rewind 10s */}
              <TouchableOpacity
                style={styles.seekButton}
                onPress={() => seekBy(-10)}
                activeOpacity={0.7}
              >
                <Icon name="replay-10" size={30} color="#fff" />
              </TouchableOpacity>

              {/* Play/Pause */}
              <TouchableOpacity
                style={styles.playPauseButton}
                onPress={() => {
                  setPlaying(!playing);
                  triggerHideControls();
                }}
                activeOpacity={0.8}
              >
                <Icon name={playing ? 'pause' : 'play'} size={36} color="#fff" />
              </TouchableOpacity>

              {/* Forward 10s */}
              <TouchableOpacity
                style={styles.seekButton}
                onPress={() => seekBy(10)}
                activeOpacity={0.7}
              >
                <Icon name="forward-10" size={30} color="#fff" />
              </TouchableOpacity>

              {/* Quality picker button */}
              <TouchableOpacity
                style={styles.qualityButton}
                onPress={toggleQualityPicker}
                activeOpacity={0.7}
              >
                <Icon name="settings-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Quality picker overlay */}
          {showQualityPicker && (
            <TouchableOpacity
              style={styles.qualityPickerOverlay}
              activeOpacity={1}
              onPress={() => setShowQualityPicker(false)}
            >
              <View
                style={[styles.qualityPickerPanel, {bottom: insets.bottom + 100}]}
                onStartShouldSetResponder={() => true}
              >
                <Text style={styles.qualityPickerTitle}>{t('select_quality')}</Text>
                <View style={styles.qualityOptionList}>
                  {QUALITY_OPTIONS.map(option => {
                    const isActive = qualityLevel === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[styles.qualityOption, isActive && styles.qualityOptionActive]}
                        onPress={() => handleQualityChange(option.value)}
                        activeOpacity={0.7}
                      >
                        <Icon
                          name={option.icon}
                          size={18}
                          color={isActive ? Colors.dark.primary : 'rgba(255,255,255,0.7)'}
                        />
                        <Text
                          style={[
                            styles.qualityOptionText,
                            isActive && styles.qualityOptionTextActive,
                          ]}
                        >
                          {t(option.label)}
                        </Text>
                        {option.resolution && (
                          <Text
                            style={[
                              styles.qualityOptionRes,
                              isActive && styles.qualityOptionResActive,
                            ]}
                          >
                            {option.resolution}p
                          </Text>
                        )}
                        {isActive && (
                          <Icon name="checkmark" size={18} color={Colors.dark.primary} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },

  // Buffering
  bufferingOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bufferingBox: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Center play
  centerPlay: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Seek feedback
  seekFeedback: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  seekFeedbackBox: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  seekFeedbackText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as any,
  },

  // Top bar
  topControls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
  },
  topButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  titleText: {
    flex: 1,
    color: '#fff',
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.medium as any,
    marginHorizontal: 8,
  },

  // Bottom controls
  bottomControls: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)',
  },
  seekBarContainer: {
    width: '100%',
    height: 28,
    justifyContent: 'center',
    marginBottom: 2,
    direction: 'ltr',
  },
  seekBarTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  seekBarBuffered: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: '30%',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  seekBarProgress: {
    height: '100%',
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    direction: 'ltr',
  },
  seekBarThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.dark.primary,
    marginLeft: -7,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  timeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: Typography.sizes.sm,
    fontVariant: ['tabular-nums'],
  },

  // Quality badge (between times)
  qualityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(229,9,20,0.3)',
  },
  qualityBadgeText: {
    color: Colors.dark.primary,
    fontSize: 11,
    fontWeight: '700' as any,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Playback row
  playbackRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  seekButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(229,9,20,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  qualityButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },

  // Quality picker
  qualityPickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  qualityPickerPanel: {
    position: 'absolute',
    right: 16,
    backgroundColor: 'rgba(20,20,25,0.97)',
    borderRadius: 16,
    padding: 16,
    width: 240,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  qualityPickerTitle: {
    color: '#fff',
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold as any,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  qualityOptionList: {
    gap: 4,
  },
  qualityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 10,
  },
  qualityOptionActive: {
    backgroundColor: 'rgba(229,9,20,0.15)',
  },
  qualityOptionText: {
    flex: 1,
    color: 'rgba(255,255,255,0.75)',
    fontSize: Typography.sizes.sm + 1,
    fontWeight: Typography.weights.medium as any,
  },
  qualityOptionTextActive: {
    color: '#fff',
  },
  qualityOptionRes: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  qualityOptionResActive: {
    color: Colors.dark.primary,
  },

  // Error
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.dark.background,
    padding: 32,
  },
  errorText: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.lg,
    textAlign: 'center',
    marginTop: 16,
  },
  errorButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: Colors.dark.primary,
    borderRadius: 8,
  },
  errorButtonText: {
    color: '#fff',
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold as any,
  },
});
