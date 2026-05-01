/**
 * DetailsScreen
 *
 * Play flow:
 *   1. User taps Play (or an episode)
 *   2. Show "Connecting..." status
 *   3. POST /extract { url: pageUrl }
 *      - For movies: constructed from category + id via API
 *      - For series: uses SeasonsUrl or episode source URL
 *   4. On success → navigate to Player with m3u8 URL
 *   5. On error → show dismissable error banner with Retry
 *
 * Episode flow (series/anime/tvshows):
 *   1. On mount, fetch episodes from /api/episodes/<category>/<id>
 *   2. Display season/episode grid
 *   3. Each episode is playable via its source URL
 */

import React, {useState, useCallback, useMemo, useEffect} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Share, Dimensions, StatusBar, Image,
  FlatList,
} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import FastImage from 'react-native-fast-image';
import axios from 'axios';
import {ContentItem} from '../types';
import {extractVideoUrl} from '../services/api';
import {recordPlay} from '../services/viewService';
import {Colors} from '../theme/colors';
import {API_BASE} from '../constants/endpoints';
import {useTranslation} from 'react-i18next';

const {width: SW} = Dimensions.get('window');
const POSTER_W = Math.min(SW * 0.50, 210);
const POSTER_H = POSTER_W * 1.52;

// ── Types ──────────────────────────────────────────────────────────
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

// ── Reusable info table row ─────────────────────────────────────────
interface InfoRowProps {
  label: string;
  value: string;
  accent?: boolean;
}
const InfoRow: React.FC<InfoRowProps> = ({label, value, accent}) => (
  <View style={rowS.row}>
    <Text style={rowS.label}>{label}</Text>
    <Text style={[rowS.value, accent && rowS.valueAccent]} numberOfLines={2}>{value}</Text>
  </View>
);

const rowS = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  label: {
    flex: 1.1,
    color: Colors.dark.textSecondary,
    fontSize: 13.5,
    fontFamily: 'Rubik',
  },
  value: {
    flex: 2,
    color: Colors.dark.text,
    fontSize: 13.5,
    fontFamily: 'Rubik',
    textAlign: 'right',
  },
  valueAccent: {
    color: Colors.dark.accentLight,
  },
});

// ── Status messages during extraction ──────────────────────────────
const EXTRACT_STATUSES = [
  'Connecting to server...',
  'Fetching page...',
  'Extracting stream URL...',
  'Almost there...',
];

export const DetailsScreen: React.FC = () => {
  const route      = useRoute<any>();
  const navigation = useNavigation<any>();
  const {t, i18n} = useTranslation();
  const insets     = useSafeAreaInsets();

  const item: ContentItem = route.params?.item;

  const [extracting,    setExtracting]    = useState(false);
  const [statusIdx,     setStatusIdx]     = useState(0);
  const [extractError,  setExtractError]  = useState<string | null>(null);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [seasons, setSeasons] = useState<SeasonData[]>([]);
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<string | null>(null);

  const lang = i18n.language === 'ar' ? 'ar' : 'en';

  // ── Determine if this is a series type ───────────────────────────
  const isSeries = useMemo(() => {
    const cat = item.Category || '';
    return ['series', 'tvshows', 'asian-series'].includes(cat);
  }, [item.Category]);

  const isAnime = useMemo(() => item.Category === 'anime', [item.Category]);

  // ── Fetch episodes for series/anime ──────────────────────────────
  useEffect(() => {
    if (!item?.id) return;

    if (isSeries) {
      fetchEpisodes(item.id, item.Category || 'series');
    } else if (isAnime) {
      fetchEpisodes(item.id, 'anime');
    }
  }, [item?.id, item?.Category]);

  const fetchEpisodes = async (contentId: string, category: string) => {
    setEpisodesLoading(true);
    try {
      let endpoint = '';
      if (category === 'anime') {
        endpoint = `/api/anime-episodes/${contentId}`;
      } else {
        endpoint = `/api/episodes/${category}/${contentId}`;
      }

      const response = await axios.get(`${API_BASE}${endpoint}`, {timeout: 15000});
      const data = response.data;

      if (data && !data.error) {
        if (Array.isArray(data)) {
          // Flat list of episodes - treat as single season
          setSeasons([{season_number: 1, season_name: t('season') + ' 1', episodes: data}]);
          setExpandedSeason(0);
        } else if (data.seasons && Array.isArray(data.seasons)) {
          setSeasons(data.seasons);
          setExpandedSeason(0);
        } else if (typeof data === 'object') {
          // Try to detect season keys
          const keys = Object.keys(data);
          const seasonKeys = keys.filter(k => k.toLowerCase().includes('season') || /^\d+$/.test(k));
          if (seasonKeys.length > 0) {
            const parsed = seasonKeys.map((key, idx) => ({
              season_number: idx + 1,
              season_name: key.includes('season') ? key : `${t('season')} ${idx + 1}`,
              episodes: Array.isArray(data[key]) ? data[key] : [],
            }));
            setSeasons(parsed);
            setExpandedSeason(0);
          } else {
            // Single object - might be a direct episode list
            const eps = Object.values(data).filter(v => typeof v === 'object' && v.source);
            if (eps.length > 0) {
              setSeasons([{season_number: 1, season_name: t('season') + ' 1', episodes: eps as EpisodeData[]}]);
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
  };

  if (!item) {
    return (
      <View style={S.container}>
        <TouchableOpacity style={[S.navBtn, {margin: 20, marginTop: insets.top + 20}]} onPress={() => navigation.goBack()}>
          <Image source={require('../../assets/icons/arrow.png')} style={S.iconNav} />
        </TouchableOpacity>
        <Text style={{color: Colors.dark.textMuted, textAlign: 'center', fontFamily: 'Rubik'}}>{t('error_loading')}</Text>
      </View>
    );
  }

  // ── Resolve source URL for extraction ────────────────────────────
  // For series: use SeasonsUrl if available
  // For movies/anime: construct from category slug + id (the backend handles it)
  const getExtractionUrl = useCallback((): string => {
    // Series may have SeasonsUrl pointing to the fasel-hd seasons page
    if ((item as any).SeasonsUrl) {
      return (item as any).SeasonsUrl;
    }
    // Try Source field (may be empty for scraped content)
    const s = (item as any).Source || (item as any).source || '';
    if (s && s.startsWith('http')) return s;

    // Fallback: construct a URL from the item id + category
    // The /extract endpoint will need the actual page URL
    // For movies without Source, we pass the id and let the backend resolve
    return `__id__:${item.id}:${item.Category || 'movies'}`;
  }, [item]);

  // ── Helpers ─────────────────────────────────────────────────────
  const genresDisplay = useMemo(() => {
    const list = lang === 'ar'
      ? (item.GenresAr?.length ? item.GenresAr : item.Genres)
      : (item.Genres?.length   ? item.Genres   : item.GenresAr);
    return (list || []).join(' / ');
  }, [item.Genres, item.GenresAr, lang]);

  const directors = useMemo(() => {
    const d = (item as any).Directors || (item as any).directors || [];
    return (Array.isArray(d) ? d : [d]).filter(Boolean).join('  ');
  }, [item]);

  const description = lang === 'ar'
    ? (item.DescriptionAr || item.Description || '')
    : (item.Description   || item.DescriptionAr   || '');

  const formatRuntime = (min: number | null) => {
    if (!min) return '';
    const h = Math.floor(min / 60), m = min % 60;
    return h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`;
  };

  const rating     = (item as any).Rating     || '';
  const views      = (item as any).Views      || '';
  const year       = (item as any).Year       || (item as any).ReleaseDate?.substring(0, 4) || '';
  const country    = item.Country             || '';
  const language   = (item as any).Language   || '';
  const format     = item.Format              || '';
  const numEps     = (item as any)['Number Of Episodes Text'] ?? (item as any)['Number Of Episodes'] ?? null;
  const status     = (item as any).Status     || '';
  const episodeDuration = (item as any).EpisodeDuration || '';
  const runtime    = formatRuntime(item.Runtime);

  // ── Play handler ─────────────────────────────────────────────────
  const handlePlay = useCallback(async (episodeUrl?: string) => {
    setExtracting(true);
    setExtractError(null);
    setSelectedEpisode(episodeUrl || null);
    setStatusIdx(0);

    const rotateTimer = setInterval(() => {
      setStatusIdx(prev => (prev + 1) % EXTRACT_STATUSES.length);
    }, 4000);

    try {
      // For episodes, use the episode's source URL directly
      const pageUrl = episodeUrl || getExtractionUrl();

      if (!pageUrl || pageUrl.startsWith('__id__')) {
        throw new Error(t('video_unavailable'));
      }

      const result = await extractVideoUrl(pageUrl);

      clearInterval(rotateTimer);
      setExtracting(false);

      recordPlay(item.id, item.Category || 'movies').catch(() => {});

      const episodeTitle = episodeUrl
        ? `${item.Title} - ${t('episode')}`
        : item.Title;

      navigation.navigate('Player', {
        url:       result.video_url,
        qualities: result.quality_options,
        title:     episodeTitle,
        contentId: item.id,
        category:  item.Category || 'movies',
      });
    } catch (err: any) {
      clearInterval(rotateTimer);
      setExtractError(err.message || t('server_error'));
      setExtracting(false);
    }
  }, [item, getExtractionUrl, navigation, t]);

  const handleShare = () =>
    Share.share({message: `${item.Title} - AbdoBest`});

  // ── Count total episodes ─────────────────────────────────────────
  const totalEpisodes = useMemo(() => {
    if (numEps && numEps > 0) return numEps;
    return seasons.reduce((sum, s) => sum + (s.episodes?.length || 0), 0);
  }, [seasons, numEps]);

  const totalSeasons = seasons.length;

  // ── Render episode item ──────────────────────────────────────────
  const renderEpisode = useCallback(({item: ep, index}: {item: EpisodeData; index: number}) => {
    const epTitle = ep.title || ep.episode || `${t('episode')} ${index + 1}`;
    const epQuality = ep.quality || '';
    const isSelected = selectedEpisode === ep.source;

    return (
      <TouchableOpacity
        style={[styles.episodeCard, isSelected && styles.episodeCardActive]}
        onPress={() => ep.source ? handlePlay(ep.source) : null}
        activeOpacity={0.7}
      >
        <View style={styles.episodeLeft}>
          <Text style={styles.episodeNumber}>{index + 1}</Text>
          {epQuality ? (
            <View style={styles.epQualityBadge}>
              <Text style={styles.epQualityText}>{epQuality.split(' ')[0]}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.episodeInfo}>
          <Text style={styles.episodeTitle} numberOfLines={2}>{epTitle}</Text>
        </View>
        {ep.source ? (
          <Image source={require('../../assets/icons/clapboard.png')} style={[styles.epPlayIcon, {tintColor: Colors.dark.primaryLight}]} />
        ) : (
          <Text style={styles.epSoon}>{t('coming_soon')}</Text>
        )}
      </TouchableOpacity>
    );
  }, [selectedEpisode, handlePlay, t]);

  // ── Render season header ────────────────────────────────────────
  const renderSeasonHeader = useCallback(({item: season, index}: {item: SeasonData; index: number}) => {
    const isExpanded = expandedSeason === index;
    const epCount = season.episodes?.length || 0;

    return (
      <TouchableOpacity
        style={[styles.seasonHeader, isExpanded && styles.seasonHeaderActive]}
        onPress={() => setExpandedSeason(isExpanded ? null : index)}
        activeOpacity={0.7}
      >
        <Image
          source={require('../../assets/icons/tv.png')}
          style={[styles.seasonIcon, {tintColor: isExpanded ? Colors.dark.primary : Colors.dark.textSecondary}]}
        />
        <Text style={[styles.seasonTitle, isExpanded && styles.seasonTitleActive]}>
          {season.season_name || `${t('season')} ${season.season_number || index + 1}`}
        </Text>
        <View style={styles.seasonMeta}>
          <Text style={styles.seasonEpCount}>{epCount} {t('episodes')}</Text>
          <Image
            source={require('../../assets/icons/arrow.png')}
            style={[styles.chevron, {tintColor: Colors.dark.textMuted, transform: [{rotate: isExpanded ? '90deg' : '0deg'}]}]}
          />
        </View>
      </TouchableOpacity>
    );
  }, [expandedSeason, t]);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <View style={S.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[S.scroll, {paddingBottom: insets.bottom + 60}]}
      >
        {/* Nav row */}
        <View style={[S.topNav, {paddingTop: insets.top + 10}]}>
          <TouchableOpacity style={S.navBtn} onPress={() => navigation.goBack()}>
            <Image source={require('../../assets/icons/arrow.png')} style={S.iconNav} />
          </TouchableOpacity>
          <TouchableOpacity style={S.navBtn} onPress={handleShare}>
            <Image source={require('../../assets/icons/share.png')} style={S.iconNav} />
          </TouchableOpacity>
        </View>

        {/* Full title */}
        <Text style={S.title} numberOfLines={4}>{item.Title}</Text>

        {/* Poster */}
        <View style={S.posterWrap}>
          {item['Image Source'] ? (
            <FastImage
              source={{uri: item['Image Source']}}
              style={S.poster}
              resizeMode={FastImage.resizeMode.cover}
              fallback
            />
          ) : (
            <View style={[S.poster, S.posterPlaceholder]}>
              <Image source={require('../../assets/icons/clapboard.png')} style={{width: 52, height: 52, tintColor: Colors.dark.textMuted}} />
            </View>
          )}
          {format ? (
            <View style={S.formatChip}>
              <Text style={S.formatChipText}>{format}</Text>
            </View>
          ) : null}
        </View>

        {/* Rating + Views + Category pills */}
        <View style={S.metaRow}>
          {rating ? (
            <View style={S.pill}>
              <Image source={require('../../assets/icons/star.png')} style={S.iconPill} />
              <Text style={S.pillRating}>{rating}</Text>
              <Text style={S.pillSub}>/ 10</Text>
            </View>
          ) : null}
          {views ? (
            <View style={S.pill}>
              <Image source={require('../../assets/icons/eyes.png')} style={S.iconPill} />
              <Text style={S.pillViews}>{views}</Text>
            </View>
          ) : null}
          {item.Category ? (
            <View style={[S.pill, {borderColor: Colors.dark.accentLight}]}>
              <Text style={S.pillCategory}>{t(item.Category) || item.Category}</Text>
            </View>
          ) : null}
        </View>

        {/* Episode/Season count badges for series */}
        {isSeries && (totalEpisodes > 0 || numEps) && (
          <View style={S.badgeRow}>
            {totalSeasons > 1 ? (
              <View style={S.countBadge}>
                <Text style={S.countBadgeText}>{totalSeasons} {t('seasons')}</Text>
              </View>
            ) : null}
            <View style={S.countBadge}>
              <Text style={S.countBadgeText}>{totalEpisodes} {t('episodes')}</Text>
            </View>
            {status ? (
              <View style={[S.countBadge, status === 'مستمر' ? S.badgeOngoing : S.badgeComplete]}>
                <Text style={[S.countBadgeText, {color: '#fff'}]}>{status}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Action buttons */}
        <View style={S.actions}>
          <TouchableOpacity
            style={S.playBtn}
            onPress={() => handlePlay()}
            disabled={extracting}
            activeOpacity={0.82}
          >
            {extracting ? (
              <>
                <ActivityIndicator color="#fff" size="small" style={{marginRight: 8}} />
                <Text style={S.playBtnText} numberOfLines={1}>
                  {EXTRACT_STATUSES[statusIdx]}
                </Text>
              </>
            ) : (
              <>
                <Image source={require('../../assets/icons/clapboard.png')} style={{width: 18, height: 18, tintColor: '#fff'}} />
                <Text style={S.playBtnText}>{t('play')}</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={S.dlBtn}
            disabled={extracting}
            onPress={() => {/* TODO */}}
            activeOpacity={0.82}
          >
            <Image
              source={require('../../assets/icons/files.png')}
              style={[S.iconMed, {tintColor: Colors.dark.accentLight}]}
            />
            <Text style={S.dlBtnText}>{t('download')}</Text>
          </TouchableOpacity>
        </View>

        {/* Extraction error */}
        {extractError ? (
          <View style={S.errorBanner}>
            <Text style={S.errorText} numberOfLines={3}>{extractError}</Text>
            <TouchableOpacity style={S.retryBtn} onPress={() => handlePlay()}>
              <Image source={require('../../assets/icons/undoreturn.png')} style={{width: 14, height: 14, tintColor: Colors.dark.primary}} />
              <Text style={S.retryText}>{t('retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Episodes / Seasons section */}
        {(isSeries || isAnime) && (
          <View style={S.episodesSection}>
            <View style={S.episodesHeader}>
              <Image source={require('../../assets/icons/tv.png')} style={[S.sectionIcon, {tintColor: Colors.dark.primary}]} />
              <Text style={S.episodesTitle}>{t('episodes')}</Text>
              {episodesLoading && <ActivityIndicator size="small" color={Colors.dark.primary} style={{marginLeft: 8}} />}
            </View>

            {seasons.length === 0 && !episodesLoading ? (
              <View style={S.noEpisodes}>
                <Image source={require('../../assets/icons/files.png')} style={{width: 32, height: 32, tintColor: Colors.dark.textMuted}} />
                <Text style={S.noEpisodesText}>{t('not_available')}</Text>
              </View>
            ) : (
              seasons.map((season, sIdx) => (
                <View key={sIdx} style={S.seasonBlock}>
                  {renderSeasonHeader({item: season, index: sIdx} as any)}

                  {expandedSeason === sIdx && season.episodes && season.episodes.length > 0 && (
                    <View style={S.episodeList}>
                      {season.episodes.map((ep: EpisodeData, eIdx: number) =>
                        renderEpisode({item: ep, index: eIdx} as any)
                      )}
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* Description */}
        {description ? (
          <View style={S.descBox}>
            <Text style={S.descText}>{description}</Text>
          </View>
        ) : null}

        {/* ── Info table ── */}
        <View style={S.infoTable}>
          {year ? <InfoRow label={t('year')} value={year} accent /> : null}
          {item.Category ? <InfoRow label={t('category')} value={t(item.Category) || item.Category} accent /> : null}
          {genresDisplay ? <InfoRow label={t('genres')} value={genresDisplay} accent /> : null}
          {language ? <InfoRow label={t('language')} value={language} /> : null}
          {format ? <InfoRow label={t('quality')} value={format} /> : null}
          {country ? <InfoRow label={t('country')} value={country} accent /> : null}
          {directors ? <InfoRow label={t('directors')} value={directors} accent /> : null}
          {totalEpisodes > 0 && !isSeries ? <InfoRow label={t('episodes')} value={String(totalEpisodes)} /> : null}
          {episodeDuration ? <InfoRow label={t('duration')} value={episodeDuration} /> : null}
          {runtime ? <InfoRow label={t('duration')} value={runtime} /> : null}
          {rating ? (
            <View style={rowS.row}>
              <Text style={rowS.label}>{t('rating')}</Text>
              <View style={{flex: 2, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6}}>
                <Text style={rowS.value}>{rating} / 10</Text>
                <Image source={require('../../assets/icons/star.png')} style={{width: 16, height: 16, tintColor: '#FFD700'}} />
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
};

// ── Styles ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Episodes
  episodesSection: {
    marginHorizontal: 16,
    marginBottom: 14,
  },
  episodesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  sectionIcon: {
    width: 20,
    height: 20,
  },
  episodesTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  seasonBlock: {
    marginBottom: 4,
  },
  seasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 10,
  },
  seasonHeaderActive: {
    backgroundColor: `${Colors.dark.primary}15`,
    borderColor: `${Colors.dark.primary}40`,
  },
  seasonIcon: {
    width: 18,
    height: 18,
  },
  seasonTitle: {
    flex: 1,
    color: Colors.dark.textSecondary,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Rubik',
  },
  seasonTitleActive: {
    color: Colors.dark.text,
  },
  seasonMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seasonEpCount: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    fontFamily: 'Rubik',
  },
  chevron: {
    width: 14,
    height: 14,
  },
  episodeList: {
    paddingTop: 6,
  },
  episodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 12,
  },
  episodeCardActive: {
    borderColor: `${Colors.dark.primary}40`,
    backgroundColor: `${Colors.dark.primary}10`,
  },
  episodeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 48,
  },
  episodeNumber: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Rubik',
    width: 24,
    textAlign: 'center',
  },
  epQualityBadge: {
    backgroundColor: Colors.dark.badge.quality,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  epQualityText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  episodeInfo: {
    flex: 1,
  },
  episodeTitle: {
    color: Colors.dark.text,
    fontSize: 14,
    fontFamily: 'Rubik',
    lineHeight: 19,
  },
  epPlayIcon: {
    width: 18,
    height: 18,
  },
  epSoon: {
    color: Colors.dark.textMuted,
    fontSize: 10,
    fontFamily: 'Rubik',
  },
  noEpisodes: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  noEpisodesText: {
    color: Colors.dark.textMuted,
    fontSize: 14,
    fontFamily: 'Rubik',
  },
});

const S = StyleSheet.create({
  container:  {flex: 1, backgroundColor: Colors.dark.background},
  scroll:     {paddingTop: 0},
  topNav:     {flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12},
  navBtn:     {width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.dark.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.dark.border},
  iconNav:    {width: 20, height: 20, tintColor: Colors.dark.text},
  iconPill:   {width: 13, height: 13, tintColor: Colors.dark.text},
  iconMed:    {width: 20, height: 20},
  title: {
    color: Colors.dark.text,
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
    fontFamily: 'Rubik',
    lineHeight: 29,
  },
  posterWrap: {alignSelf: 'center', marginBottom: 16, position: 'relative'},
  poster: {
    width: POSTER_W,
    height: POSTER_H,
    borderRadius: 16,
    backgroundColor: Colors.dark.surfaceLight,
    elevation: 14,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.55,
    shadowRadius: 16,
  },
  posterPlaceholder: {justifyContent: 'center', alignItems: 'center'},
  formatChip: {
    position: 'absolute',
    bottom: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.87)',
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  formatChipText: {color: '#FFFFFF', fontSize: 11, fontWeight: '700', fontFamily: 'Rubik'},
  metaRow: {
    flexDirection: 'row', justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8, marginBottom: 14, paddingHorizontal: 20,
  },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, gap: 4,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  pillRating: {color: '#FFD700', fontSize: 13, fontWeight: '700', fontFamily: 'Rubik'},
  pillSub:    {color: Colors.dark.textMuted, fontSize: 11, fontFamily: 'Rubik'},
  pillViews:  {color: Colors.dark.textSecondary, fontSize: 13, fontWeight: '600', fontFamily: 'Rubik'},
  pillCategory: {color: Colors.dark.accentLight, fontSize: 12, fontWeight: '600', fontFamily: 'Rubik'},
  badgeRow: {
    flexDirection: 'row', justifyContent: 'center',
    gap: 8, marginBottom: 14, paddingHorizontal: 20,
  },
  countBadge: {
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1, borderColor: Colors.dark.border,
  },
  badgeOngoing: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  badgeComplete: {
    backgroundColor: Colors.dark.success,
    borderColor: Colors.dark.success,
  },
  countBadgeText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Rubik',
  },
  actions:    {flexDirection: 'row', paddingHorizontal: 18, marginBottom: 12, gap: 12},
  playBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 54, borderRadius: 16,
    backgroundColor: Colors.dark.primary,
    gap: 8, elevation: 8,
    shadowColor: Colors.dark.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.5, shadowRadius: 10,
  },
  playBtnText: {color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'Rubik', flexShrink: 1},
  dlBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 54, borderRadius: 16,
    backgroundColor: Colors.dark.surface,
    gap: 8, borderWidth: 1.5,
    borderColor: Colors.dark.accentLight,
  },
  dlBtnText: {color: Colors.dark.accentLight, fontSize: 15, fontWeight: '700', fontFamily: 'Rubik'},
  errorBanner: {
    marginHorizontal: 18, marginBottom: 12,
    backgroundColor: `${Colors.dark.error}16`,
    borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: `${Colors.dark.error}30`,
    gap: 10,
  },
  errorText:  {flex: 1, color: Colors.dark.error, fontSize: 13, fontFamily: 'Rubik'},
  retryBtn:   {flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: `${Colors.dark.primary}22`},
  retryText:  {color: Colors.dark.primary, fontSize: 13, fontWeight: '700', fontFamily: 'Rubik'},
  descBox:    {marginHorizontal: 16, marginBottom: 14, backgroundColor: Colors.dark.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.dark.border},
  descText:   {color: Colors.dark.textSecondary, fontSize: 14, lineHeight: 22, fontFamily: 'Rubik'},
  infoTable:  {marginHorizontal: 16, backgroundColor: Colors.dark.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.dark.border, marginBottom: 24},
});
