import React, {useState, useRef, useEffect, useCallback, useMemo} from 'react';
import {
  View, StyleSheet, Dimensions, TouchableOpacity, Text,
  ActivityIndicator, StatusBar, Modal, FlatList,
} from 'react-native';
import Video, {VideoRef, OnProgressData, ResizeMode, OnBufferData} from 'react-native-video';
import {useRoute, useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {Colors} from '../theme/colors';
import {useTranslation} from 'react-i18next';
import {recordPlay} from '../services/viewService';

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

// HLS quality levels
const HLS_QUALITIES = [
  {label: 'Auto',  bitrate: undefined},
  {label: '1080p', bitrate: 8000000},
  {label: '720p',  bitrate: 3000000},
  {label: '480p',  bitrate: 1500000},
  {label: '360p',  bitrate: 800000},
];

export const PlayerScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const {url, title, contentId, category, qualities: paramQualities} = route.params || {};
  const {t} = useTranslation();
  const insets = useSafeAreaInsets();

  const videoRef = useRef<VideoRef>(null);
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Build quality list: prefer qualities from extraction result, fallback to HLS defaults
  const qualityList = useMemo(() => {
    if (paramQualities && paramQualities.length > 0) {
      return paramQualities.map((label: string) => {
        const match = HLS_QUALITIES.find(q => q.label === label);
        return match ?? {label, bitrate: undefined};
      });
    }
    return HLS_QUALITIES;
  }, [paramQualities]);

  const [selectedQuality, setSelectedQuality] = useState<{label: string; bitrate?: number}>(qualityList[0] ?? HLS_QUALITIES[0]);
  const [showQualityPicker, setShowQualityPicker] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewTracked = useRef(false);

  // Track view on first play (recordPlay is sync — do NOT .catch())
  useEffect(() => {
    if (contentId && category && !viewTracked.current) {
      viewTracked.current = true;
      recordPlay(contentId, category);
    }
  }, [contentId, category]);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

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

  const handleProgress = (data: OnProgressData) => setCurrentTime(data.currentTime);

  const handleLoad = (meta: any) => {
    setDuration(meta.duration);
    setBuffering(false);
    triggerHideControls();
  };

  const handleBuffer: (data: OnBufferData) => void = (data) => setBuffering(data.isBuffering);
  const handleEnd = () => { setPlaying(false); setShowControls(true); };

  const handleError = (err: any) => {
    console.error('[Player] Video error:', err?.error?.errorString || err?.error || err);
    const msg = err?.error?.errorString || '';
    // CDNs sometimes return 403 when headers are wrong
    if (msg.includes('403') || msg.includes('Forbidden')) {
      setError(t('video_unavailable'));
    } else {
      setError(t('video_unavailable'));
    }
    setBuffering(false);
  };

  // Auto-retry on error after 3 seconds
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (error) {
      retryTimer.current = setTimeout(() => {
        setError(null);
        setBuffering(true);
        videoRef.current?.seek(0);
      }, 3000);
    }
    return () => clearTimeout(retryTimer.current);
  }, [error]);

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

  const handleQualitySelect = (q: {label: string; bitrate?: number}) => {
    setSelectedQuality(q);
    setShowQualityPicker(false);
    triggerHideControls();
  };

  if (!url) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar hidden />
        <Icon name="alert-circle-outline" size={56} color={Colors.dark.error} />
        <Text style={styles.errorText}>{t('video_unavailable')}</Text>
        <TouchableOpacity style={styles.errorButton} onPress={() => navigation.goBack()}>
          <Text style={styles.errorButtonText}>{t('retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <StatusBar hidden />
        <Icon name="alert-circle-outline" size={56} color={Colors.dark.error} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.errorButton} onPress={() => navigation.goBack()}>
          <Text style={styles.errorButtonText}>{t('go_back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      <TouchableOpacity style={styles.videoContainer} activeOpacity={1} onPress={toggleControls}>
        <Video
          ref={videoRef}
          key={url}
          source={{
            uri: url,
            headers: {
              'Referer': 'https://www.fasel-hd.cam/',
              'Origin': 'https://www.fasel-hd.cam',
              'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
            },
          }}
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
          minLoadRetryCount={3}
          maxBitRate={selectedQuality.bitrate || 0}
          // FAST buffer — start playing ASAP, don't wait forever
          bufferConfig={{
            minBufferMs: 2000,
            maxBufferMs: 15000,
            bufferForPlaybackMs: 1000,
            bufferForPlaybackAfterRebufferMs: 3000,
          }}
        />

        {buffering && (
          <View style={styles.bufferingOverlay}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
            <Text style={styles.bufferingText}>{t('loading')}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Controls overlay */}
      {showControls && (
        <>
          {/* Top bar */}
          <View style={[styles.topControls, {paddingTop: insets.top + 4}]}>
            <TouchableOpacity style={styles.topButton} onPress={() => navigation.goBack()}>
              <Icon name="arrow-back" size={26} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
            {/* Quality picker button */}
            <TouchableOpacity
              style={styles.qualityButton}
              onPress={() => {
                setShowQualityPicker(true);
                if (hideTimer.current) clearTimeout(hideTimer.current);
              }}
            >
              <Text style={styles.qualityButtonText}>{selectedQuality.label}</Text>
              <Icon name="chevron-down" size={14} color="#00E5FF" />
            </TouchableOpacity>
          </View>

          {/* Bottom controls */}
          <View style={[styles.bottomControls, {paddingBottom: insets.bottom + 16}]}>
            {/* Seek bar */}
            <TouchableOpacity
              style={styles.seekBarContainer}
              onPress={handleSeekBarPress}
              activeOpacity={0.9}
            >
              <View style={styles.seekBarTrack}>
                <View style={[styles.seekBarProgress, {width: `${progress * 100}%`}]}>
                  <View style={styles.seekBarThumb} />
                </View>
              </View>
            </TouchableOpacity>

            {/* Time row */}
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>

            {/* Playback row */}
            <View style={styles.playbackRow}>
              <TouchableOpacity
                style={styles.skipButton}
                onPress={() => videoRef.current?.seek(Math.max(currentTime - 10, 0))}
              >
                <Icon name="play-back" size={28} color="#fff" />
                <Text style={styles.skipLabel}>10</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.playPauseButton}
                onPress={() => { setPlaying(!playing); triggerHideControls(); }}
              >
                <Icon name={playing ? 'pause' : 'play'} size={34} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.skipButton}
                onPress={() => videoRef.current?.seek(Math.min(currentTime + 10, duration))}
              >
                <Icon name="play-forward" size={28} color="#fff" />
                <Text style={styles.skipLabel}>10</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* Quality Picker Modal */}
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
          <View style={styles.qualityModal}>
            <Text style={styles.qualityModalTitle}>{t('select_quality')}</Text>
            {qualityList.map(q => (
              <TouchableOpacity
                key={q.label}
                style={[
                  styles.qualityOption,
                  selectedQuality.label === q.label && styles.qualityOptionActive,
                ]}
                onPress={() => handleQualitySelect(q)}
              >
                <Text
                  style={[
                    styles.qualityOptionText,
                    selectedQuality.label === q.label && styles.qualityOptionTextActive,
                  ]}
                >
                  {q.label}
                </Text>
                {selectedQuality.label === q.label && (
                  <Icon name="checkmark" size={18} color={Colors.dark.primary} />
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
  container: {flex: 1, backgroundColor: '#000'},
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  bufferingOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bufferingText: {
    color: 'rgba(255,255,255,0.7)',
    marginTop: 10,
    fontSize: 13,
    fontFamily: 'Rubik',
  },
  topControls: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  topButton: {
    width: 40, height: 40,
    justifyContent: 'center', alignItems: 'center',
  },
  titleText: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginHorizontal: 8,
    fontFamily: 'Rubik',
  },
  qualityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00E5FF50',
    gap: 4,
  },
  qualityButtonText: {
    color: '#00E5FF',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  seekBarContainer: {
    width: '100%',
    height: 28,
    justifyContent: 'center',
    marginBottom: 2,
  },
  seekBarTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
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
    width: 14, height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    marginRight: -7,
    shadowColor: Colors.dark.primary,
    shadowRadius: 4,
    shadowOpacity: 0.8,
    elevation: 4,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  timeText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontFamily: 'Rubik',
  },
  playbackRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 28,
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipLabel: {
    color: '#fff',
    fontSize: 10,
    marginTop: -2,
    fontFamily: 'Rubik',
  },
  playPauseButton: {
    width: 64, height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(229,9,20,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.dark.primary,
    shadowRadius: 8,
    shadowOpacity: 0.6,
    elevation: 8,
  },
  // Quality Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qualityModal: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 20,
    width: 240,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  qualityModalTitle: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Rubik',
    marginBottom: 14,
    textAlign: 'center',
  },
  qualityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 4,
  },
  qualityOptionActive: {
    backgroundColor: `${Colors.dark.primary}20`,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}60`,
  },
  qualityOptionText: {
    color: Colors.dark.textSecondary,
    fontSize: 15,
    fontFamily: 'Rubik',
  },
  qualityOptionTextActive: {
    color: Colors.dark.primary,
    fontWeight: '700',
  },
  // Error
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 32,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    fontFamily: 'Rubik',
  },
  errorButton: {
    marginTop: 22,
    paddingHorizontal: 28,
    paddingVertical: 12,
    backgroundColor: Colors.dark.primary,
    borderRadius: 10,
  },
  errorButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
});
