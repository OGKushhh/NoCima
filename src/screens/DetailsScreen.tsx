import React, {useState, useCallback, useMemo} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Share, ActivityIndicator, Dimensions,
} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import FastImage from 'react-native-fast-image';
import {ContentItem} from '../types';
import {getStreamUrl} from '../services/videoService';
import {Colors} from '../theme/colors';
import {Typography} from '../theme/typography';
import {useTranslation} from 'react-i18next';
import {localizeGenres} from '../i18n/genres';
import {getSettings} from '../storage';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const POSTER_WIDTH = Math.min(SCREEN_WIDTH * 0.6, 280);
const POSTER_HEIGHT = POSTER_WIDTH * 1.5;

export const DetailsScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const item: ContentItem = route.params?.item;
  const {t, i18n} = useTranslation();
  const insets = useSafeAreaInsets();
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const hasSource = item.Source && item.Source.length > 0;
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as 'ar' | 'en';

  // Localize genres for the current language
  const displayGenres = useMemo(() => {
    return localizeGenres(item.Genres || [], lang);
  }, [item.Genres, lang]);

  // Get the appropriate description based on language
  const description = useMemo(() => {
    if (lang === 'ar') {
      return item.DescriptionAr || item.Description || '';
    }
    return item.Description || item.DescriptionAr || '';
  }, [item.Description, item.DescriptionAr, lang]);

  const hasDescription = description && description.trim().length > 0;

  const formatRuntime = (minutes: number | null) => {
    if (!minutes) return null;
    if (minutes >= 60) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return m > 0 ? `${h}${t('hours')} ${m}${t('minutes')}` : `${h}${t('hours')}`;
    }
    return `${minutes}${t('minutes')}`;
  };

  const handlePlay = useCallback(async () => {
    if (!hasSource) {
      Alert.alert(t('video_unavailable'), t('not_available'));
      return;
    }

    setExtracting(true);
    setExtractError(null);

    try {
      const result = await getStreamUrl(item.id, item.Source);
      if (result.video_url) {
        navigation.navigate('Player', {url: result.video_url, title: item.Title});
      } else {
        setExtractError(t('video_unavailable'));
      }
    } catch (err: any) {
      setExtractError(err.message || t('server_error'));
    } finally {
      setExtracting(false);
    }
  }, [hasSource, item.id, item.Source, item.Title, navigation, t]);

  const handleDownload = useCallback(async () => {
    if (!hasSource) {
      Alert.alert(t('video_unavailable'), t('not_available'));
      return;
    }

    setExtracting(true);
    setExtractError(null);

    try {
      const result = await getStreamUrl(item.id, item.Source);
      if (result.video_url) {
        Alert.alert(t('download'), t('coming_soon'), [{text: 'OK'}]);
      }
    } catch (err: any) {
      setExtractError(err.message || t('server_error'));
    } finally {
      setExtracting(false);
    }
  }, [hasSource, item.id, item.Source, t]);

  const handleShare = useCallback(() => {
    if (item.Source) {
      Share.share({message: item.Title, url: item.Source});
    }
  }, [item.Source, item.Title]);

  return (
    <View style={styles.container}>
      <StatusBarStyle />

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, {paddingBottom: insets.bottom + 40}]}
      >
        {/* Back button */}
        <TouchableOpacity style={[styles.backButton, {top: insets.top + 8}]} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>

        {/* Share button */}
        <TouchableOpacity style={[styles.shareButton, {top: insets.top + 8}]} onPress={handleShare}>
          <Icon name="share-outline" size={22} color="#fff" />
        </TouchableOpacity>

        {/* Title */}
        <Text style={styles.title} numberOfLines={3}>{item.Title}</Text>

        {/* Poster */}
        {item['Image Source'] ? (
          <FastImage
            source={{uri: item['Image Source']}}
            style={[styles.poster, {width: POSTER_WIDTH, height: POSTER_HEIGHT}]}
            resizeMode={FastImage.resizeMode.cover}
            fallback
          />
        ) : (
          <View style={[styles.posterPlaceholder, {width: POSTER_WIDTH, height: POSTER_HEIGHT}]} />
        )}

        {/* Play / Download buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.playButton]}
            onPress={handlePlay}
            disabled={extracting}
          >
            {extracting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Icon name="play" size={22} color="#fff" />
                <Text style={styles.actionText}>{t('play')}</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.downloadButton]}
            onPress={handleDownload}
            disabled={extracting}
          >
            <Icon name="download-outline" size={22} color="#fff" />
            <Text style={styles.actionText}>{t('download')}</Text>
          </TouchableOpacity>
        </View>

        {/* Error state */}
        {extractError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{extractError}</Text>
            <TouchableOpacity onPress={handlePlay}>
              <Text style={styles.retryText}>{t('retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!hasSource && (
          <View style={styles.availabilityNotice}>
            <Icon name="information-circle-outline" size={18} color={Colors.dark.warning} />
            <Text style={styles.availabilityText}>{t('not_available')}</Text>
          </View>
        )}

        {/* Info Box */}
        <View style={styles.infoBox}>
          {/* Meta row: Quality + Runtime + Country */}
          <View style={styles.metaRow}>
            {item.Format && (
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>{item.Format.split(' ')[0]}</Text>
              </View>
            )}
            {item.Rating && (
              <View style={styles.metaBadge}>
                <Text style={styles.starIcon}>★</Text>
                <Text style={styles.metaBadgeText}>{item.Rating}</Text>
              </View>
            )}
            {item.Runtime && (
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>{formatRuntime(item.Runtime)}</Text>
              </View>
            )}
            {item.Country && (
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>{item.Country}</Text>
              </View>
            )}
          </View>

          {/* Episode count */}
          {item['Number Of Episodes'] ? (
            <View style={styles.infoRow}>
              <Icon name="tv-outline" size={16} color={Colors.dark.textSecondary} />
              <Text style={styles.infoText}>
                {item['Number Of Episodes']} {t('episodes')}
              </Text>
            </View>
          ) : null}

          {/* Description */}
          {hasDescription && (
            <View style={styles.infoSection}>
              <Text style={styles.sectionLabel}>{t('description')}</Text>
              <Text style={styles.descriptionText} numberOfLines={6}>{description}</Text>
            </View>
          )}

          {/* Genres */}
          {displayGenres.length > 0 && (
            <View style={styles.infoSection}>
              <Text style={styles.sectionLabel}>{t('genres')}</Text>
              <View style={styles.genreChips}>
                {displayGenres.map((genre, idx) => (
                  <View key={idx} style={styles.genreChip}>
                    <Text style={styles.genreChipText}>{genre}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Quality info */}
          {item.Format && (
            <View style={styles.infoSection}>
              <Text style={styles.sectionLabel}>{t('quality')}</Text>
              <Text style={styles.infoValue}>{item.Format}</Text>
            </View>
          )}

          {/* Duration */}
          {item.Runtime && (
            <View style={styles.infoSection}>
              <Text style={styles.sectionLabel}>{t('duration')}</Text>
              <Text style={styles.infoValue}>{formatRuntime(item.Runtime)}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const StatusBarStyle = () => {
  const {StatusBar} = require('react-native');
  return <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 0,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  shareButton: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  title: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.heading,
    fontWeight: Typography.weights.bold as any,
    textAlign: 'center',
    paddingHorizontal: 60,
    marginTop: 60,
    marginBottom: 16,
    fontFamily: 'Rubik',
  },
  poster: {
    borderRadius: 16,
    alignSelf: 'center',
    backgroundColor: Colors.dark.surfaceLight,
    marginBottom: 20,
  },
  posterPlaceholder: {
    borderRadius: 16,
    alignSelf: 'center',
    backgroundColor: Colors.dark.surface,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 20,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 14,
  },
  playButton: {
    backgroundColor: Colors.dark.primary,
  },
  downloadButton: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1.5,
    borderColor: Colors.dark.primary,
  },
  actionText: {
    color: '#fff',
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold as any,
    marginLeft: 8,
    fontFamily: 'Rubik',
  },
  errorContainer: {
    marginHorizontal: 16,
    padding: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
  },
  retryText: {
    color: Colors.dark.primary,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold as any,
    marginTop: 4,
  },
  availabilityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    padding: 12,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 8,
    marginBottom: 16,
  },
  availabilityText: {
    color: Colors.dark.warning,
    fontSize: Typography.sizes.sm,
    marginLeft: 8,
  },
  infoBox: {
    marginHorizontal: 16,
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 16,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  starIcon: {
    color: '#FFD700',
    fontSize: 12,
    marginRight: 4,
  },
  metaBadgeText: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium as any,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoText: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.md,
    marginLeft: 6,
  },
  infoSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.dark.border,
  },
  sectionLabel: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold as any,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  descriptionText: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.md,
    lineHeight: 22,
  },
  genreChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genreChip: {
    backgroundColor: Colors.dark.background,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  genreChipText: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.sm,
  },
  infoValue: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.md,
  },
});
