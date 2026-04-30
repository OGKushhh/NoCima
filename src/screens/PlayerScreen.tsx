import React, {useState, useRef, useEffect} from 'react';
import {
  View, StyleSheet, Dimensions, TouchableOpacity, Text,
  ActivityIndicator, StatusBar,
} from 'react-native';
import Video, {VideoRef, OnProgressData, ResizeMode, OnBufferData} from 'react-native-video';
import {useRoute, useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {Colors} from '../theme/colors';
import {Typography} from '../theme/typography';
import {useTranslation} from 'react-i18next';

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

export const PlayerScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const {url, title} = route.params || {};
  const {t} = useTranslation();
  const insets = useSafeAreaInsets();

  const videoRef = useRef<VideoRef>(null);
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const triggerHideControls = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 5000);
  };

  const toggleControls = () => {
    setShowControls(prev => {
      if (!prev) triggerHideControls();
      return !prev;
    });
  };

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
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  const handleSeekBarPress = (e: any) => {
    const {locationX} = e.nativeEvent;
    const seekTime = (locationX / SCREEN_WIDTH) * duration;
    videoRef.current?.seek(seekTime);
    setCurrentTime(seekTime);
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
          resizeMode={ResizeMode.CONTAIN}
          onProgress={handleProgress}
          onLoad={handleLoad}
          onBuffer={handleBuffer}
          onEnd={handleEnd}
          onError={handleError}
          playInBackground={false}
          playWhenInactive={false}
          paused={!playing}
          style={styles.video}
          // HLS-specific props for better compatibility
          preventsDisplaySleepDuringVideoPlayback={true}
          minLoadRetryCount={3}
          maxBitRate={8000000}
        />

        {buffering && (
          <View style={styles.bufferingOverlay}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
          </View>
        )}

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
      </TouchableOpacity>

      {showControls && (
        <>
          {/* Top bar */}
          <View style={[styles.topControls, {paddingTop: insets.top + 8}]}>
            <TouchableOpacity style={styles.topButton} onPress={() => navigation.goBack()}>
              <Icon name="arrow-back" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
            <View style={{width: 40}} />
          </View>

          {/* Bottom controls */}
          <View style={[styles.bottomControls, {paddingBottom: insets.bottom + 16}]}>
            {/* Seek bar */}
            <TouchableOpacity
              style={styles.seekBarContainer}
              onPress={handleSeekBarPress}
              activeOpacity={0.8}
            >
              <View style={styles.seekBarTrack}>
                <View style={[styles.seekBarProgress, {width: `${progress * 100}%`}]}>
                  <View style={styles.seekBarThumb} />
                </View>
              </View>
            </TouchableOpacity>

            {/* Time labels */}
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>

            {/* Playback buttons */}
            <View style={styles.playbackRow}>
              <TouchableOpacity onPress={() => videoRef.current?.seek(Math.max(currentTime - 10, 0))}>
                <Icon name="replay-10" size={32} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.playPauseButton}
                onPress={() => {
                  setPlaying(!playing);
                  triggerHideControls();
                }}
              >
                <Icon name={playing ? 'pause' : 'play'} size={36} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => videoRef.current?.seek(Math.min(currentTime + 10, duration))}>
                <Icon name="forward-10" size={32} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </>
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
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  bufferingOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerPlay: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  seekBarContainer: {
    width: '100%',
    height: 30,
    justifyContent: 'center',
    marginBottom: 4,
  },
  seekBarTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  seekBarProgress: {
    height: '100%',
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  seekBarThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.dark.primary,
    marginRight: -7,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: Typography.sizes.sm,
  },
  playbackRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(229,9,20,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 32,
  },
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
