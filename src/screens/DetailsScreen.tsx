/**
 * DetailsScreen — Premium Movie/Series Details Page
 *
 * Layout (top to bottom in ScrollView):
 *   1. Nav bar: Back arrow + Share button
 *   2. Title: centered, heading1, white, max 4 lines
 *   3. Poster: centered, rounded corners, shadowLg, quality badge
 *   4. Meta pills: Rating, Views, Category badge, Format badge
 *   5. Season/Episode count badges (series only) + status badge
 *   6. Action buttons: Play (big red) + Download (outlined)
 *   7. Error banner (if extraction fails)
 *   8. Episodes section (series/anime only): accordion + list
 *   9. Description: surface card
 *  10. Info table: surface card with key-value rows
 *
 * Play flow:
 *   1. User taps Play or episode
 *   2. Show "Connecting..." rotating status in Play button
 *   3. POST /extract with getExtractionUrl()
 *   4. Navigate to Player with extracted URL
 */

import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Dimensions,
  StatusBar,
  Image,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FastImage from 'react-native-fast-image';
import axios from 'axios';

import { ContentItem } from '../types';
import { extractVideoUrl } from '../services/api';
import { recordPlay } from '../services/viewService';
import { SPACING } from '../theme/colors';
import type { ThemeColors } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { API_BASE } from '../constants/endpoints';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';

// ── Constants ────────────────────────────────────────────────────────
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const POSTER_W = Math.min(SCREEN_WIDTH * 0.52, 220);
const POSTER_H = POSTER_W * 1.52;

const EXTRACT_STATUSES = [
  'Connecting to server...',
  'Fetching page...',
  'Extracting stream URL...',
  'Almost there...',
];

// ── Types ────────────────────────────────────────────────────────────
interface EpisodeData {
  episode?: string;
  title?: string;
  source?: string;
  image?: string;
  quality?: string;
  [key: string]: any;
}

interface SeasonData {
  season_number?: string | number;
  season_name?: string;
  episodes?: EpisodeData[];
  [key: string]: any;
}

// ── Surface Card ─────────────────────────────────────────────────────
const createSurfaceCardStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
  });

const SurfaceCard: React.FC<{ children: React.ReactNode; style?: any }> = ({
  children,
  style,
}) => {
  const { colors } = useTheme();
  const surfaceCardStyle = useMemo(
    () => createSurfaceCardStyles(colors),
    [colors],
  );
  return <View style={[surfaceCardStyle.card, style]}>{children}</View>;
};

// ── Info Table Row ───────────────────────────────────────────────────
interface InfoRowProps {
  label: string;
  value: string;
  accent?: boolean;
}

const createInfoRowStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    label: {
      flex: 1.1,
      color: colors.textSecondary,
      ...FONTS.bodySmall,
    },
    valueWrap: {
      flex: 2,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 6,
    },
    value: {
      color: colors.text,
      ...FONTS.bodySmall,
      textAlign: 'right',
    },
    valueAccent: {
      color: colors.accentLight,
    },
  });

const InfoRow: React.FC<InfoRowProps> = ({ label, value, accent }) => {
  const { colors } = useTheme();
  const { i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';
  const infoRowStyle = useMemo(
    () => createInfoRowStyles(colors),
    [colors],
  );
  return (
    <View style={[infoRowStyle.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <Text style={[infoRowStyle.label, { textAlign: isRTL ? 'right' : 'left' }]}>{label}</Text>
      <View style={[infoRowStyle.valueWrap, { justifyContent: isRTL ? 'flex-start' : 'flex-end' }]}>
        <Text
          style={[infoRowStyle.value, accent && infoRowStyle.valueAccent]}
          numberOfLines={2}
        >
          {value}
        </Text>
      </View>
    </View>
  );
};

// =============================================================================
// DetailsScreen
// =============================================================================
export const DetailsScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // ── Item (may be undefined) ─────────────────────────────────────────
  const item: ContentItem | undefined = route.params?.item;

  // ── ALL hooks declared BEFORE any conditional return ────────────────
  const [extracting, setExtracting] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [seasons, setSeasons] = useState<SeasonData[]>([]);
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<string | null>(null);

  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const rotateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Dynamic styles ──────────────────────────────────────────────────
  const S = useMemo(() => createStyles(colors), [colors]);

  // ── Derived: series / anime check ───────────────────────────────────
  const isSeries = useMemo(() => {
    const cat = item?.Category || '';
    return ['series', 'tvshows', 'asian-series'].includes(cat);
  }, [item?.Category]);

  const isAnime = useMemo(
    () => item?.Category === 'anime',
    [item?.Category],
  );

  // ── Extraction URL resolver ─────────────────────────────────────────
  const getExtractionUrl = useCallback((): string => {
    if (!item) return '';
    if ((item as any).SeasonsUrl) {
      return (item as any).SeasonsUrl;
    }
    const s = (item as any).Source || (item as any).source || '';
    if (s && typeof s === 'string' && s.startsWith('http')) return s;
    return `https://www.fasel-hd.cam/?p=${item?.id}`;
  }, [item]);

  // ── Derived metadata ────────────────────────────────────────────────
  const genresDisplay = useMemo(() => {
    const list =
      lang === 'ar'
        ? item?.GenresAr?.length
          ? item?.GenresAr
          : item?.Genres
        : item?.Genres?.length
          ? item?.Genres
          : item?.GenresAr;
    return (list || []).join(' / ');
  }, [item?.Genres, item?.GenresAr, lang]);

  const directors = useMemo(() => {
    const d = (item as any)?.Directors || (item as any)?.directors || [];
    return (Array.isArray(d) ? d : [d]).filter(Boolean).join('  ');
  }, [item]);

  const description =
    lang === 'ar'
      ? item?.DescriptionAr || item?.Description || ''
      : item?.Description || item?.DescriptionAr || '';

  const formatRuntime = useCallback((min: number | null): string => {
    if (!min) return '';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`;
  }, []);

  const rating = (item as any)?.Rating || '';
  const views = (item as any)?.Views || '';
  const year =
    (item as any)?.Year ||
    (item as any)?.ReleaseDate?.substring(0, 4) ||
    '';
  const country = item?.Country || '';
  const language = (item as any)?.Language || '';
  const format = item?.Format || '';
  const numEps =
    (item as any)?.['Number Of Episodes Text'] ??
    (item as any)?.['Number Of Episodes'] ??
    null;
  const itemStatus = (item as any)?.Status || '';
  const episodeDuration = (item as any)?.EpisodeDuration || '';
  const runtime = formatRuntime(item?.Runtime ?? null);

  const totalEpisodes = useMemo(() => {
    if (numEps && numEps > 0) return numEps;
    return seasons.reduce((sum, s) => sum + (s.episodes?.length || 0), 0);
  }, [seasons, numEps]);

  const totalSeasons = seasons.length;

  // ── Episode fetching ───────────────────────────────────────────────
  const fetchEpisodes = useCallback(
    async (contentId: string, category: string) => {
      setEpisodesLoading(true);
      try {
        let endpoint = '';
        if (category === 'anime') {
          endpoint = `/api/anime-episodes/${contentId}`;
        } else {
          endpoint = `/api/episodes/${category}/${contentId}`;
        }

        const response = await axios.get(`${API_BASE}${endpoint}`, {
          timeout: 15000,
        });
        const data = response.data;

        if (data && !data.error) {
          if (Array.isArray(data)) {
            setSeasons([
              {
                season_number: 1,
                season_name: `${t('season')} 1`,
                episodes: data,
              },
            ]);
            setExpandedSeason(0);
          } else if (data.seasons && Array.isArray(data.seasons)) {
            setSeasons(data.seasons);
            setExpandedSeason(0);
          } else if (typeof data === 'object') {
            const keys = Object.keys(data);
            const seasonKeys = keys.filter(
              (k) =>
                k.toLowerCase().includes('season') || /^\d+$/.test(k),
            );
            if (seasonKeys.length > 0) {
              const parsed = seasonKeys.map((key, idx) => ({
                season_number: idx + 1,
                season_name: key.includes('season')
                  ? key
                  : `${t('season')} ${idx + 1}`,
                episodes: Array.isArray(data[key]) ? data[key] : [],
              }));
              setSeasons(parsed);
              setExpandedSeason(0);
            } else {
              const eps = Object.values(data).filter(
                (v) => typeof v === 'object' && (v as any).source,
              );
              if (eps.length > 0) {
                setSeasons([
                  {
                    season_number: 1,
                    season_name: `${t('season')} 1`,
                    episodes: eps as EpisodeData[],
                  },
                ]);
                setExpandedSeason(0);
              }
            }
          }
        }
      } catch (err) {
        console.log('[Details] Failed to fetch episodes:', err);
      } finally {
        setEpisodesLoading(false);
      }
    },
    [t],
  );

  // Fetch episodes on mount for series/anime
  useEffect(() => {
    if (!item?.id) return;
    if (isSeries) {
      fetchEpisodes(item.id, item?.Category || 'series');
    } else if (isAnime) {
      fetchEpisodes(item.id, 'anime');
    }
  }, [item?.id, item?.Category, isSeries, isAnime, fetchEpisodes]);

  // ── Play handler ────────────────────────────────────────────────────
  const handlePlay = useCallback(
    async (episodeUrl?: string) => {
      setExtracting(true);
      setExtractError(null);
      setSelectedEpisode(episodeUrl || null);
      setStatusIdx(0);

      rotateTimerRef.current = setInterval(() => {
        setStatusIdx((prev) => (prev + 1) % EXTRACT_STATUSES.length);
      }, 3500);

      try {
        const pageUrl = episodeUrl || getExtractionUrl();

        if (!pageUrl || pageUrl.startsWith('__id__')) {
          throw new Error(t('video_unavailable') || 'Video unavailable');
        }

        // Record the play event — void sync function, no .catch()
        recordPlay(item?.id || '', item?.Category || 'movies');

        const result = await extractVideoUrl(pageUrl);

        if (rotateTimerRef.current) {
          clearInterval(rotateTimerRef.current);
          rotateTimerRef.current = null;
        }

        // ── Validate extracted URL is actually a playable stream ──
        const streamUrl = result.video_url || '';
        const badPatterns = ['ping.gif', 'pixel.gif', 'tracking', 'doubleclick', '/ad/', '/ads/'];
        const hasBadPattern = badPatterns.some(p => streamUrl.toLowerCase().includes(p));
        const hasMediaExtension = /\.(m3u8|mp4|mkv|m4a|ts|mpd)(\?|$)/i.test(streamUrl);
        const hasMediaHost = streamUrl.includes('.m3u8') || streamUrl.includes('scdns.io') || streamUrl.includes('master');
        if (!streamUrl || hasBadPattern || (!hasMediaExtension && !hasMediaHost)) {
          console.warn('[Details] Extracted URL looks invalid:', streamUrl.substring(0, 150));
          setExtractError(
            t('video_unavailable') || 'Could not extract a valid stream URL. The source may have changed.',
          );
          setExtracting(false);
          return;
        }

        setExtracting(false);

        const episodeTitle = episodeUrl
          ? `${item?.Title || ''} - ${t('episode')}`
          : item?.Title || '';

        navigation.navigate('Player', {
          url: streamUrl,
          qualities: result.quality_options,
          title: episodeTitle,
          contentId: item?.id,
          category: item?.Category || 'movies',
        });
      } catch (err: any) {
        if (rotateTimerRef.current) {
          clearInterval(rotateTimerRef.current);
          rotateTimerRef.current = null;
        }
        setExtractError(err.message || t('server_error') || 'Server error');
        setExtracting(false);
      }
    },
    [item, getExtractionUrl, navigation, t],
  );

  // ── Share handler ──────────────────────────────────────────────────
  const handleShare = useCallback(() => {
    Share.share({ message: `${item?.Title || ''} - AbdoBest` });
  }, [item?.Title]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (rotateTimerRef.current) {
        clearInterval(rotateTimerRef.current);
      }
    };
  }, []);

  // ── Episode render ──────────────────────────────────────────────────
  const renderEpisode = useCallback(
    ({ ep, index }: { item: EpisodeData; index: number }) => {
      const epTitle =
        ep?.title || ep?.episode || `${t('episode')} ${index + 1}`;
      const epQuality = ep?.quality || '';
      const isSelected = selectedEpisode === ep?.source;
      const canPlay = !!ep?.source;

      return (
        <TouchableOpacity
          key={`ep-${index}`}
          style={[S.episodeCard, isSelected && S.episodeCardActive]}
          onPress={() => (canPlay ? handlePlay(ep?.source) : null)}
          activeOpacity={canPlay ? 0.7 : 1}
          disabled={!canPlay}
        >
          {/* Episode number */}
          <View style={S.episodeNumWrap}>
            <Text style={S.episodeNum}>{index + 1}</Text>
            {epQuality ? (
              <View style={S.epQualityBadge}>
                <Text style={S.epQualityText}>
                  {epQuality.split(' ')[0]}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Episode title */}
          <View style={S.episodeInfo}>
            <Text style={S.episodeTitle} numberOfLines={2}>
              {epTitle}
            </Text>
          </View>

          {/* Play icon or coming soon */}
          {canPlay ? (
            <Image
              source={require('../../assets/icons/clapboard.png')}
              style={[
                S.epPlayIcon,
                { tintColor: colors.primaryLight },
              ]}
            />
          ) : (
            <Text style={S.epComingSoon}>{t('coming_soon')}</Text>
          )}
        </TouchableOpacity>
      );
    },
    [selectedEpisode, handlePlay, t, S, colors],
  );

  // ── Season header render ────────────────────────────────────────────
  const renderSeasonHeader = useCallback(
    ({ season, index }: { item: SeasonData; index: number }) => {
      const isExpanded = expandedSeason === index;
      const epCount = season?.episodes?.length || 0;

      return (
        <TouchableOpacity
          key={`season-${index}`}
          style={[S.seasonHeader, isExpanded && S.seasonHeaderActive]}
          onPress={() => setExpandedSeason(isExpanded ? null : index)}
          activeOpacity={0.7}
        >
          <Image
            source={require('../../assets/icons/tv.png')}
            style={[
              S.seasonIcon,
              {
                tintColor: isExpanded
                  ? colors.primary
                  : colors.textSecondary,
              },
            ]}
          />
          <Text style={[S.seasonTitle, isExpanded && S.seasonTitleActive]}>
            {season?.season_name ||
              `${t('season')} ${season?.season_number || index + 1}`}
          </Text>
          <View style={S.seasonMeta}>
            <Text style={S.seasonEpCount}>
              {epCount} {t('episodes')}
            </Text>
            <Image
              source={require('../../assets/icons/arrow.png')}
              style={[
                S.chevron,
                {
                  tintColor: colors.textMuted,
                  transform: [{ rotate: isExpanded ? '90deg' : '0deg' }],
                },
              ]}
            />
          </View>
        </TouchableOpacity>
      );
    },
    [expandedSeason, t, S, colors],
  );

  // ════════════════════════════════════════════════════════════════════
  // CONDITIONAL RENDER — error state when item is missing
  // ════════════════════════════════════════════════════════════════════
  if (!item) {
    return (
      <View style={S.container}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={colors.background}
          translucent
        />
        <TouchableOpacity
          style={[S.navBtn, { marginTop: insets.top + 16, marginLeft: SPACING.lg }]}
          onPress={() => navigation.goBack()}
        >
          <Image
            source={require('../../assets/icons/arrow.png')}
            style={S.iconNav}
          />
        </TouchableOpacity>
        <View style={S.errorStateWrap}>
          <Image
            source={require('../../assets/icons/clapboard.png')}
            style={S.errorStateIcon}
          />
          <Text style={S.errorStateText}>
            {t('error_loading') || 'Content not found'}
          </Text>
          <TouchableOpacity style={S.errorStateBtn} onPress={() => navigation.goBack()}>
            <Text style={S.errorStateBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ════════════════════════════════════════════════════════════════════
  return (
    <View style={S.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={colors.background}
        translucent
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          S.scrollContent,
          { paddingBottom: insets.bottom + SPACING.xxxl },
        ]}
      >
        {/* ─── 1. Nav bar ─────────────────────────────────────────── */}
        <View style={[S.navBar, { paddingTop: insets.top + SPACING.xs }]}>
          <TouchableOpacity
            style={S.navBtn}
            onPress={() => navigation.goBack()}
          >
            <Image
              source={require('../../assets/icons/arrow.png')}
              style={S.iconNav}
            />
          </TouchableOpacity>
          <TouchableOpacity style={S.navBtn} onPress={handleShare}>
            <Image
              source={require('../../assets/icons/share.png')}
              style={S.iconNav}
            />
          </TouchableOpacity>
        </View>

        {/* ─── 2. Title (name + year only, no badges) ──────── */}
        <Text style={S.title} numberOfLines={4}>
          {item?.Title}{year ? ` (${year})` : ''}
        </Text>

        {/* ─── 3. Poster ─────────────────────────────────────────── */}
        <View style={S.posterWrap}>
          {item?.['Image Source'] ? (
            <FastImage
              source={{ uri: item['Image Source'] }}
              style={S.poster}
              resizeMode={FastImage.resizeMode.cover}
              fallback
            />
          ) : (
            <View style={[S.poster, S.posterPlaceholder]}>
              <Image
                source={require('../../assets/icons/clapboard.png')}
                style={{
                  width: 52,
                  height: 52,
                  tintColor: colors.textMuted,
                }}
              />
            </View>
          )}
        </View>

        {/* ─── 4. Badges row under poster ───────────────────────── */}
        {(() => {
          const badges: React.ReactNode[] = [];
          if (rating) {
            badges.push(
              <View key="rating" style={S.posterBadge}>
                <Image
                  source={require('../../assets/icons/star.png')}
                  style={S.posterBadgeIcon}
                />
                <Text style={[S.posterBadgeText, { color: '#FFD700' }]}>
                  {rating}
                </Text>
              </View>,
            );
          }
          if (views) {
            badges.push(
              <View key="views" style={S.posterBadge}>
                <Image
                  source={require('../../assets/icons/eyes.png')}
                  style={[S.posterBadgeIcon, { tintColor: colors.textSecondary }]}
                />
                <Text style={[S.posterBadgeText, { color: colors.textSecondary }]}>
                  {views}
                </Text>
              </View>,
            );
          }
          if (format) {
            badges.push(
              <View key="format" style={S.posterBadge}>
                <Text style={[S.posterBadgeText, { color: colors.text }]}>
                  {format}
                </Text>
              </View>,
            );
          }
          if (item?.Category) {
            badges.push(
              <View key="cat" style={S.posterBadge}>
                <Text style={[S.posterBadgeText, { color: '#FFD700' }]}>
                  {t(item?.Category) || item?.Category}
                </Text>
              </View>,
            );
          }
          return badges.length > 0 ? (
            <View style={S.badgesRowUnderPoster}>{badges}</View>
          ) : null;
        })()}

        {/* ─── 5. Season/Episode count badges (series only) ──────── */}
        {isSeries && (totalEpisodes > 0 || numEps) && (
          <View style={S.countBadgeRow}>
            {totalSeasons > 1 ? (
              <View style={S.countBadge}>
                <Text style={S.countBadgeText}>
                  {totalSeasons} {t('seasons')}
                </Text>
              </View>
            ) : null}
            <View style={S.countBadge}>
              <Text style={S.countBadgeText}>
                {totalEpisodes} {t('episodes')}
              </Text>
            </View>
            {itemStatus ? (
              <View
                style={[
                  S.countBadge,
                  itemStatus === 'مستمر'
                    ? S.badgeOngoing
                    : S.badgeComplete,
                ]}
              >
                <Text style={[S.countBadgeText, { color: '#fff' }]}>
                  {itemStatus}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {/* ─── 6. Action buttons row ──────────────────────────────── */}
        <View style={S.actionsRow}>
          {/* Play button — big red with glow */}
          <TouchableOpacity
            style={[S.playBtn, extracting && S.playBtnDisabled]}
            onPress={() => handlePlay()}
            disabled={extracting}
            activeOpacity={0.82}
          >
            {extracting ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={S.playBtnText} numberOfLines={1}>
                  {EXTRACT_STATUSES[statusIdx]}
                </Text>
              </>
            ) : (
              <>
                <Image
                  source={require('../../assets/icons/clapboard.png')}
                  style={S.playBtnIcon}
                />
                <Text style={S.playBtnText}>{t('play')}</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Download button — outlined */}
          <TouchableOpacity
            style={S.downloadBtn}
            disabled={extracting}
            onPress={() => {
              /* TODO: download flow */
            }}
            activeOpacity={0.82}
          >
            <Image
              source={require('../../assets/icons/files.png')}
              style={[
                S.downloadBtnIcon,
                { tintColor: colors.accentLight },
              ]}
            />
            <Text style={S.downloadBtnText}>{t('download')}</Text>
          </TouchableOpacity>
        </View>

        {/* ─── 7. Error banner ───────────────────────────────────── */}
        {extractError ? (
          <View style={S.errorBanner}>
            <Text style={S.errorBannerText} numberOfLines={3}>
              {extractError}
            </Text>
            <TouchableOpacity
              style={S.retryBtn}
              onPress={() => handlePlay()}
            >
              <Image
                source={require('../../assets/icons/undoreturn.png')}
                style={S.retryIcon}
              />
              <Text style={S.retryText}>{t('retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ─── 8. Episodes section (series/anime only) ───────────── */}
        {(isSeries || isAnime) && (
          <View style={S.episodesSection}>
            {/* Section header */}
            <View style={S.sectionHeader}>
              <Image
                source={require('../../assets/icons/tv.png')}
                style={[S.sectionIcon, { tintColor: colors.primary }]}
              />
              <Text style={S.sectionTitle}>{t('episodes')}</Text>
              {episodesLoading && (
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  style={{ marginLeft: SPACING.sm }}
                />
              )}
            </View>

            {/* Empty state */}
            {seasons.length === 0 && !episodesLoading ? (
              <View style={S.emptyEpisodes}>
                <Image
                  source={require('../../assets/icons/files.png')}
                  style={{
                    width: 32,
                    height: 32,
                    tintColor: colors.textMuted,
                  }}
                />
                <Text style={S.emptyEpisodesText}>
                  {t('not_available')}
                </Text>
              </View>
            ) : (
              seasons.map((season, sIdx) => (
                <View key={`sblock-${sIdx}`} style={S.seasonBlock}>
                  {renderSeasonHeader({ item: season, index: sIdx } as any)}

                  {expandedSeason === sIdx &&
                    season.episodes &&
                    season.episodes.length > 0 && (
                      <View style={S.episodeList}>
                        {season.episodes.map(
                          (ep: EpisodeData, eIdx: number) =>
                            renderEpisode({ item: ep, index: eIdx } as any),
                        )}
                      </View>
                    )}
                </View>
              ))
            )}
          </View>
        )}

        {/* ─── 9. Description ─────────────────────────────────────── */}
        {description ? (
          <SurfaceCard style={S.descCard}>
            <Text style={S.descText}>{description}</Text>
          </SurfaceCard>
        ) : null}

        {/* ─── 10. Info table (no duplicates from poster badges) ─── */}
        {(() => {
          // Collect non-empty rows — skip rating, quality, category (already on poster)
          const rows: React.ReactNode[] = [];
          if (year) rows.push(<InfoRow key="year" label={t('year')} value={year} accent />);
          if (genresDisplay) rows.push(<InfoRow key="genres" label={t('genres')} value={genresDisplay} accent />);
          if (language) rows.push(<InfoRow key="language" label={t('language')} value={language} />);
          if (country) rows.push(<InfoRow key="country" label={t('country')} value={country} accent />);
          if (directors) rows.push(<InfoRow key="directors" label={t('directors')} value={directors} accent />);
          if (episodeDuration) rows.push(<InfoRow key="epdur" label={t('duration')} value={episodeDuration} />);
          else if (runtime) rows.push(<InfoRow key="runtime" label={t('duration')} value={runtime} />);
          return rows.length > 0 ? (
            <SurfaceCard style={S.infoTable}>{rows}</SurfaceCard>
          ) : null;
        })()}
      </ScrollView>
    </View>
  );
};

// =============================================================================
// Styles — factory function for dynamic theming
// =============================================================================

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    // ── Container & scroll ───────────────────────────────────────────────
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingTop: 0,
    },

    // ── Error state ─────────────────────────────────────────────────────
    errorStateWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: SPACING.xl,
      gap: SPACING.lg,
    },
    errorStateIcon: {
      width: 64,
      height: 64,
      tintColor: colors.textMuted,
    },
    errorStateText: {
      color: colors.textSecondary,
      ...FONTS.body,
      textAlign: 'center',
    },
    errorStateBtn: {
      marginTop: SPACING.sm,
      paddingHorizontal: SPACING.xl,
      paddingVertical: SPACING.md,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    errorStateBtnText: {
      color: '#fff',
      ...FONTS.body,
      fontWeight: '700',
    },

    // ── 1. Nav bar ──────────────────────────────────────────────────────
    navBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
    },
    navBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    iconNav: {
      width: 20,
      height: 20,
      tintColor: colors.text,
    },

    // ── 2. Title ────────────────────────────────────────────────────────
    title: {
      color: colors.text,
      ...FONTS.heading1,
      textAlign: 'center',
      paddingHorizontal: SPACING.xl,
      marginBottom: SPACING.xl,
    },

    // ── 3. Poster ───────────────────────────────────────────────────────
    posterWrap: {
      alignSelf: 'center',
      marginBottom: SPACING.sm,
    },
    poster: {
      width: POSTER_W,
      height: POSTER_H,
      borderRadius: 12,
      backgroundColor: colors.surfaceLight,
      ...colors.shadowLg,
      overflow: 'hidden',
    },
    posterPlaceholder: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    // ── Badges row under poster ─────────────────────────────────────
    badgesRowUnderPoster: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: SPACING.sm,
      marginBottom: SPACING.lg,
    },
    posterBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    posterBadgeIcon: {
      width: 14,
      height: 14,
    },
    posterBadgeText: {
      ...FONTS.caption,
      fontWeight: '700',
      color: colors.text,
    },


    // ── 5. Season/Episode count badges ──────────────────────────────────
    countBadgeRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: SPACING.sm,
      marginBottom: SPACING.lg,
      paddingHorizontal: SPACING.xl,
    },
    countBadge: {
      backgroundColor: colors.surface,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    badgeOngoing: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    badgeComplete: {
      backgroundColor: colors.success,
      borderColor: colors.success,
    },
    countBadgeText: {
      color: colors.textSecondary,
      ...FONTS.caption,
      fontWeight: '600',
    },

    // ── 6. Action buttons ───────────────────────────────────────────────
    actionsRow: {
      flexDirection: 'row',
      paddingHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
      gap: SPACING.md,
    },
    playBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 56,
      borderRadius: 16,
      gap: SPACING.sm,
      backgroundColor: colors.primary,
      ...colors.shadowGlow,
    },
    playBtnDisabled: {
      opacity: 0.7,
    },
    playBtnIcon: {
      width: 18,
      height: 18,
      tintColor: '#fff',
    },
    playBtnText: {
      color: '#fff',
      ...FONTS.bodyLarge,
      fontWeight: '700',
      flexShrink: 1,
    },
    downloadBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 56,
      borderRadius: 16,
      gap: SPACING.sm,
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.accentLight,
    },
    downloadBtnIcon: {
      width: 20,
      height: 20,
    },
    downloadBtnText: {
      color: colors.accentLight,
      ...FONTS.bodyLarge,
      fontWeight: '700',
    },

    // ── 7. Error banner ─────────────────────────────────────────────────
    errorBanner: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
      backgroundColor: `${colors.error}16`,
      borderRadius: 12,
      padding: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: `${colors.error}30`,
      gap: SPACING.sm,
    },
    errorBannerText: {
      flex: 1,
      color: colors.error,
      ...FONTS.bodySmall,
    },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: 9,
      backgroundColor: `${colors.primary}22`,
    },
    retryIcon: {
      width: 14,
      height: 14,
      tintColor: colors.primary,
    },
    retryText: {
      color: colors.primary,
      ...FONTS.bodySmall,
      fontWeight: '700',
    },

    // ── 8. Episodes section ─────────────────────────────────────────────
    episodesSection: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.md,
      gap: SPACING.sm,
    },
    sectionIcon: {
      width: 20,
      height: 20,
    },
    sectionTitle: {
      color: colors.text,
      ...FONTS.heading3,
    },
    emptyEpisodes: {
      alignItems: 'center',
      paddingVertical: SPACING.xxl,
      gap: SPACING.sm,
    },
    emptyEpisodesText: {
      color: colors.textMuted,
      ...FONTS.body,
    },
    seasonBlock: {
      marginBottom: SPACING.xs,
    },
    seasonHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: SPACING.sm,
    },
    seasonHeaderActive: {
      backgroundColor: `${colors.primary}15`,
      borderColor: `${colors.primary}40`,
    },
    seasonIcon: {
      width: 18,
      height: 18,
    },
    seasonTitle: {
      flex: 1,
      color: colors.textSecondary,
      ...FONTS.body,
      fontWeight: '600',
    },
    seasonTitleActive: {
      color: colors.text,
    },
    seasonMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
    },
    seasonEpCount: {
      color: colors.textMuted,
      ...FONTS.caption,
    },
    chevron: {
      width: 14,
      height: 14,
    },
    episodeList: {
      paddingTop: SPACING.sm,
    },
    episodeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      borderRadius: 10,
      marginBottom: SPACING.xs,
      borderWidth: 1,
      borderColor: colors.border,
      gap: SPACING.md,
    },
    episodeCardActive: {
      borderColor: `${colors.primary}40`,
      backgroundColor: `${colors.primary}10`,
    },
    episodeNumWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      width: 50,
    },
    episodeNum: {
      color: colors.textMuted,
      ...FONTS.bodySmall,
      fontWeight: '700',
      width: 24,
      textAlign: 'center',
    },
    epQualityBadge: {
      backgroundColor: colors.badge.quality.backgroundColor,
      paddingHorizontal: 3,
      paddingVertical: 1,
      borderRadius: 3,
    },
    epQualityText: {
      color: colors.badge.quality.color,
      ...FONTS.micro,
    },
    episodeInfo: {
      flex: 1,
    },
    episodeTitle: {
      color: colors.text,
      ...FONTS.body,
      lineHeight: 19,
    },
    epPlayIcon: {
      width: 18,
      height: 18,
    },
    epComingSoon: {
      color: colors.textMuted,
      ...FONTS.micro,
    },

    // ── 9. Description ──────────────────────────────────────────────────
    descCard: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.md,
      padding: SPACING.lg,
    },
    descText: {
      color: colors.textSecondary,
      ...FONTS.body,
      lineHeight: 22,
    },

    // ── 10. Info table ──────────────────────────────────────────────────
    infoTable: {
      marginHorizontal: SPACING.lg,
      marginBottom: SPACING.xxl,
      overflow: 'hidden',
    },
  });
