import React, {useState, useCallback, useMemo} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Share, ActivityIndicator, Dimensions, StatusBar,
} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import FastImage from 'react-native-fast-image';
import {ContentItem} from '../types';
import {getStreamUrl} from '../services/videoService';
import {Colors} from '../theme/colors';
import {useTranslation} from 'react-i18next';
import {localizeGenres} from '../i18n/genres';
import {getSettings} from '../storage';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const POSTER_WIDTH = Math.min(SCREEN_WIDTH * 0.55, 240);
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

  const displayGenres = useMemo(() => localizeGenres(item.Genres || [], lang), [item.Genres, lang]);

  const description = useMemo(() => {
    if (lang === 'ar') return item.DescriptionAr || item.Description || '';
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
    if (!hasSource) { Alert.alert(t('video_unavailable'), t('not_available')); return; }
    setExtracting(true);
    setExtractError(null);
    try {
      const result = await getStreamUrl(item.id, item.Source);
      if (result.video_url) {
        navigation.navigate('Player', {
          url: result.video_url,
          title: item.Title,
          contentId: item.id,
          category: item.Category || 'movies',
        });
      } else {
        setExtractError(t('video_unavailable'));
      }
    } catch (err: any) {
      setExtractError(err.message || t('server_error'));
    } finally {
      setExtracting(false);
    }
  }, [hasSource, item, navigation, t]);

  const handleDownload = useCallback(async () => {
    if (!hasSource) { Alert.alert(t('video_unavailable'), t('not_available')); return; }
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
  }, [hasSource, item, t]);

  const handleShare = useCallback(() => {
    if (item.Source) Share.share({message: item.Title, url: item.Source});
  }, [item.Source, item.Title]);

  const rating = item.Rating || '';
  const views = item.Views || '';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, {paddingBottom: insets.bottom + 50}]}
      >
        {/* Header buttons */}
        <View style={[styles.headerRow, {paddingTop: insets.top + 10}]}>
          <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleShare}>
            <Icon name="share-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={3}>{item.Title}</Text>

        {/* Poster */}
        <View style={styles.posterContainer}>
          {item['Image Source'] ? (
            <FastImage
              source={{uri: item['Image Source']}}
              style={styles.poster}
              resizeMode={FastImage.resizeMode.cover}
              fallback
            />
          ) : (
            <View style={styles.posterPlaceholder}>
              <Icon name="film-outline" size={60} color={Colors.dark.textMuted} />
            </View>
          )}
          {/* Floating quality badge on poster */}
          {item.Format && (
            <View style={styles.posterQualityBadge}>
              <Text style={styles.posterQualityText}>{item.Format.split(' ')[0]}</Text>
            </View>
          )}
        </View>

        {/* Play + Download buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.playButton, !hasSource && styles.disabledButton]}
            onPress={handlePlay}
            disabled={extracting || !hasSource}
          >
            {extracting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Icon name="play" size={22} color="#fff" />
                <Text style={styles.playText}>{t('play')}</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.downloadButton, !hasSource && styles.disabledButton]}
            onPress={handleDownload}
            disabled={extracting || !hasSource}
          >
            <Icon name="download-outline" size={22} color={Colors.dark.accentLight} />
            <Text style={styles.downloadText}>{t('download')}</Text>
          </TouchableOpacity>
        </View>

        {/* Extract error */}
        {extractError && (
          <View style={styles.errorBanner}>
            <Icon name="alert-circle-outline" size={16} color={Colors.dark.error} />
            <Text style={styles.errorBannerText}>{extractError}</Text>
            <TouchableOpacity onPress={handlePlay}>
              <Text style={styles.retryText}>{t('retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!hasSource && (
          <View style={styles.unavailableBanner}>
            <Icon name="information-circle-outline" size={16} color={Colors.dark.warning} />
            <Text style={styles.unavailableText}>{t('not_available')}</Text>
          </View>
        )}

        {/* Info box */}
        <View style={styles.infoBox}>
          {/* Quick meta chips */}
          <View style={styles.metaRow}>
            {rating ? (
              <View style={styles.metaChip}>
                <Text style={styles.starIcon}>★</Text>
                <Text style={styles.metaChipText}>{rating}</Text>
              </View>
            ) : null}
            {views ? (
              <View style={styles.metaChip}>
                <Text style={styles.eyeIcon}>👁</Text>
                <Text style={styles.metaChipText}>{views}</Text>
              </View>
            ) : null}
            {item.Runtime ? (
              <View style={styles.metaChip}>
                <Icon name="time-outline" size={12} color={Colors.dark.textSecondary} />
                <Text style={styles.metaChipText}>{formatRuntime(item.Runtime)}</Text>
              </View>
            ) : null}
            {item.Country ? (
              <View style={styles.metaChip}>
                <Icon name="location-outline" size={12} color={Colors.dark.textSecondary} />
                <Text style={styles.metaChipText}>{item.Country}</Text>
              </View>
            ) : null}
            {item.Year ? (
              <View style={styles.metaChip}>
                <Icon name="calendar-outline" size={12} color={Colors.dark.textSecondary} />
                <Text style={styles.metaChipText}>{item.Year}</Text>
              </View>
            ) : null}
          </View>

          {/* Episodes count */}
          {item['Number Of Episodes'] ? (
            <View style={styles.infoRow}>
              <Icon name="tv-outline" size={15} color={Colors.dark.accentLight} />
              <Text style={styles.infoText}>{item['Number Of Episodes']} {t('episodes')}</Text>
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

          {/* Quality */}
          {item.Format && (
            <View style={styles.infoSection}>
              <Text style={styles.sectionLabel}>{t('quality')}</Text>
              <Text style={styles.infoValue}>{item.Format}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  scrollView: {flex: 1},
  scrollContent: {paddingTop: 0},
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  headerButton: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: Colors.dark.text,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 18,
    fontFamily: 'Rubik',
    lineHeight: 30,
  },
  posterContainer: {
    alignSelf: 'center',
    marginBottom: 22,
    position: 'relative',
  },
  poster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: 18,
    backgroundColor: Colors.dark.surfaceLight,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
  },
  posterPlaceholder: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: 18,
    backgroundColor: Colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterQualityBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: `${Colors.dark.accentLight}50`,
  },
  posterQualityText: {
    color: Colors.dark.accentLight,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 12,
  },
  playButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: 16,
    backgroundColor: Colors.dark.primary,
    gap: 8,
    shadowColor: Colors.dark.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
  },
  playText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  downloadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: 16,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1.5,
    borderColor: Colors.dark.accentLight,
    gap: 8,
  },
  downloadText: {
    color: Colors.dark.accentLight,
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  disabledButton: {opacity: 0.45},
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    padding: 12,
    backgroundColor: `${Colors.dark.error}18`,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
    color: Colors.dark.error,
    fontSize: 13,
  },
  retryText: {
    color: Colors.dark.primary,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  unavailableBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    padding: 12,
    backgroundColor: `${Colors.dark.warning}15`,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
  },
  unavailableText: {
    color: Colors.dark.warning,
    fontSize: 13,
    fontFamily: 'Rubik',
  },
  infoBox: {
    marginHorizontal: 16,
    backgroundColor: Colors.dark.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.background,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  starIcon: {color: '#FFD700', fontSize: 11},
  eyeIcon: {fontSize: 11},
  metaChipText: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Rubik',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  infoText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontFamily: 'Rubik',
  },
  infoSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.dark.border,
  },
  sectionLabel: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
    fontFamily: 'Rubik',
  },
  descriptionText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Rubik',
  },
  genreChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  genreChip: {
    backgroundColor: `${Colors.dark.accent}25`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: `${Colors.dark.accentLight}40`,
  },
  genreChipText: {
    color: Colors.dark.accentLight,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Rubik',
  },
  infoValue: {
    color: Colors.dark.text,
    fontSize: 14,
    fontFamily: 'Rubik',
  },
});
