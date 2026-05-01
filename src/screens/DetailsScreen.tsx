/**
 * DetailsScreen — Full metadata + episode indexer + season selector
 *
 * Merge of Claude's episode UI with our bug fixes:
 *   - recordPlay() called WITHOUT .catch() (it's sync)
 *   - Title in visible styled box (surface bg, rounded, bordered)
 *   - Poster corner badges (category + quality + viewing level) using PNG icons
 *   - Season picker modal (bottom sheet) with FlatList + season poster
 *   - Episode indexer with numbered circles + play buttons
 *   - All metadata fields in info table with RTL support
 *   - localizeGenres() for genre translation
 *   - Full-screen extracting overlay with rotating status messages
 *   - Extracted URL validation (reject ads/tracking pixels)
 *   - Better error state with icon + Go Back button
 *   - Rating fetched from /api/ratings endpoint
 *
 * Play flow:
 *   Movies:   buildFaselUrl(id) -> POST /extract -> validate URL -> Player
 *   Episodes: episode URL directly -> POST /extract -> validate URL -> Player
 */

import React, {useState, useCallback, useMemo, useEffect, useRef} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Share, Dimensions, StatusBar, Image,
  Modal, FlatList,
} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import FastImage from 'react-native-fast-image';
import axios from 'axios';
import {ContentItem} from '../types';
import {extractVideoUrl} from '../services/api';
import {recordPlay} from '../services/viewService';
import {Colors} from '../theme/colors';
import {useTranslation} from 'react-i18next';
import {localizeGenres} from '../i18n/genres';
import {API_BASE} from '../constants/endpoints';

// ── Constants ────────────────────────────────────────────────────────
const FASEL_BASE = 'https://www.fasel-hd.cam';

const {width: SW} = Dimensions.get('window');
const POSTER_W = Math.min(SW * 0.48, 200);
const POSTER_H = POSTER_W * 1.52;

const EXTRACT_STATUSES = [
  'Connecting to server...',
  'Fetching page...',
  'Extracting stream URL...',
  'Almost there...',
];

// ── Category -> short badge label (i18n key) ─────────────────────────
const CAT_BADGE_KEY: Record<string, string> = {
  movies: 'badge_movie',
  'dubbed-movies': 'badge_dubbed',
  hindi: 'badge_hindi',
  'asian-movies': 'badge_asian',
  anime: 'badge_anime',
  'anime-movies': 'badge_anime_film',
  series: 'badge_series',
  tvshows: 'badge_tvshow',
  'asian-series': 'badge_kdrama',
};

// ── Info table row with RTL support ──────────────────────────────────
interface InfoRowProps {
  label: string;
  value: string;
  accent?: boolean;
  isRTL?: boolean;
}

const InfoRow: React.FC<InfoRowProps> = ({label, value, accent, isRTL}) => (
  <View style={[rowS.row, {flexDirection: isRTL ? 'row-reverse' : 'row'}]}>
    <Text style={[rowS.label, {textAlign: isRTL ? 'right' : 'left'}]}>{label}</Text>
    <Text
      style={[rowS.value, accent && rowS.accent, {textAlign: isRTL ? 'left' : 'right'}]}
      numberOfLines={3}
    >
      {value}
    </Text>
  </View>
);

const rowS = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    paddingTop: 1,
  },
  value: {
    flex: 2,
    color: Colors.dark.text,
    fontSize: 13.5,
    fontFamily: 'Rubik',
    textAlign: 'right',
    lineHeight: 20,
  },
  accent: {color: Colors.dark.accentLight},
});

// ── Episode fetcher ──────────────────────────────────────────────────
const fetchEpisodes = async (category: string, id: string) => {
  const episodic = ['series', 'tvshows', 'asian-series'];
  const isAnime = category === 'anime';
  if (!episodic.includes(category) && !isAnime) return null;
  const url = isAnime
    ? `${API_BASE}/api/anime-episodes/${id}`
    : `${API_BASE}/api/episodes/${category}/${id}`;
  const r = await axios.get(url, {timeout: 20000});
  return r.data;
};

// ── Extracted URL validator ──────────────────────────────────────────
const isValidStreamUrl = (url: string): boolean => {
  if (!url) return false;
  const lower = url.toLowerCase();
  // Reject known ad/tracking patterns
  const badPatterns = ['ping.gif', 'pixel.gif', 'tracking', 'doubleclick', '/ad/', '/ads/'];
  if (badPatterns.some(p => lower.includes(p))) return false;
  // Must have media extension or known CDN host
  const hasExtension = /\.(m3u8|mp4|mkv|m4a|ts|mpd)(\?|$)/i.test(url);
  const hasMediaHost = lower.includes('scdns.io') || lower.includes('/master') || lower.includes('.m3u8');
  return hasExtension || hasMediaHost;
};

// ══════════════════════════════════════════════════════════════════════
export const DetailsScreen: React.FC = () => {
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const {t, i18n} = useTranslation();
  const insets = useSafeAreaInsets();

  const item: ContentItem = route.params?.item;

  // Extraction state
  const [extracting, setExtracting] = useState(false);
  const [statusIdx, setStatusIdx] = useState(0);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractingEp, setExtractingEp] = useState<string | null>(null);

  // Episode state
  const [epData, setEpData] = useState<any>(null);
  const [loadingEps, setLoadingEps] = useState(false);
  const [selSeason, setSelSeason] = useState<string>('1');
  const [showSeasonDlg, setShowSeasonDlg] = useState(false);

  // Rating fetch state
  const [rating, setRating] = useState<string>('');
  const [ratingLoading, setRatingLoading] = useState(false);

  const statusTimer = useRef<ReturnType<typeof setInterval>>();

  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const isRTL = lang === 'ar';
  const raw = item as any;

  const category = (item?.Category || 'movies').toLowerCase();
  const isEpisodic = ['series', 'tvshows', 'asian-series', 'anime'].includes(category);

  // ── Fetch rating ──────────────────────────────────────────────────
  useEffect(() => {
    if (!item?.id || !category) return;
    setRatingLoading(true);
    axios
      .get(`${API_BASE}/api/ratings/${category}/${item.id}`, {timeout: 8000})
      .then(r => {
        const data = r.data;
        if (data && !data.error) {
          const val = data.rating || data.imdb_rating || data.score || data.Rating || '';
          if (val) setRating(String(val));
        }
      })
      .catch(() => {})
      .finally(() => setRatingLoading(false));
  }, [item?.id, category]);

  // ── Fetch episodes ────────────────────────────────────────────────
  useEffect(() => {
    if (!item || !isEpisodic) return;
    setLoadingEps(true);
    fetchEpisodes(category, item.id)
      .then(data => {
        setEpData(data);
        if (data?.seasons) setSelSeason(Object.keys(data.seasons)[0] ?? '1');
      })
      .catch(() => {})
      .finally(() => setLoadingEps(false));
  }, [item?.id, category]);

  useEffect(() => () => clearInterval(statusTimer.current), []);

  // ── Field helpers ─────────────────────────────────────────────────
  const genresDisplay = useMemo(() => {
    const list = lang === 'ar'
      ? (item.GenresAr?.length ? item.GenresAr : item.Genres)
      : (item.Genres?.length ? item.Genres : item.GenresAr);
    if (!list || list.length === 0) return '';
    const localized = localizeGenres(list, lang as 'ar' | 'en');
    return localized.join('  \u2022  ');
  }, [item.Genres, item.GenresAr, lang]);

  const directors = useMemo(() => {
    const d = raw.Directors || raw.directors || [];
    return (Array.isArray(d) ? d : [d]).filter(Boolean).join('  \u2022  ');
  }, [raw]);

  const description = lang === 'ar'
    ? (raw.DescriptionAr || raw.Description || '')
    : (raw.Description || raw.DescriptionAr || '');

  const fmtRuntime = (min: number | null) => {
    if (!min) return '';
    const h = Math.floor(min / 60), m = min % 60;
    return h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`;
  };

  const views = raw.Views || '';
  const year = raw.Year || (raw.ReleaseDate ? String(raw.ReleaseDate).slice(0, 4) : '');
  const country = item.Country || '';
  const language = raw.Language || '';
  const format = (item.Format && item.Format !== 'N/A') ? item.Format : '';
  const numEps = raw['Number Of Episodes'] ?? null;
  const numEpsText = raw['Number Of Episodes Text'] || (numEps ? String(numEps) : '');
  const epDuration = raw.EpisodeDuration || '';
  const status = raw.Status || '';
  const releaseDate = raw.ReleaseDate || '';
  const viewingLvl = raw.ViewingLevel || '';
  const runtime = fmtRuntime(item.Runtime);
  const viewType = raw.Type || '';

  // Status display with translation
  const displayStatus = useMemo(() => {
    if (!status) return '';
    if (status === '\u0645\u0633\u062A\u0645\u0631' || status.toLowerCase() === 'ongoing') return t('status_ongoing');
    if (status === '\u0645\u0643\u062A\u0645\u0644' || status.toLowerCase() === 'completed' || status.toLowerCase() === 'ended') return t('status_completed');
    return status;
  }, [status, t]);

  const isOngoing = status === '\u0645\u0633\u062A\u0645\u0631' || status.toLowerCase() === 'ongoing';

  // Episode data
  const seasonKeys: string[] = epData?.seasons ? Object.keys(epData.seasons).sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ''), 10) || 0;
    const nb = parseInt(b.replace(/\D/g, ''), 10) || 0;
    return na - nb;
  }) : [];
  const currentEps: string[] = epData?.seasons?.[selSeason]?.episodes ?? [];
  const seasonPoster: string = epData?.seasons?.[selSeason]?.poster || '';

  const totalSeasons = seasonKeys.length;
  const totalEps = numEps && numEps > 0 ? numEps
    : numEpsText && parseInt(String(numEpsText), 10) > 0 ? parseInt(String(numEpsText), 10)
    : currentEps.length;

  // ── Status timer helpers ──────────────────────────────────────────
  const startStatusTimer = () => {
    setStatusIdx(0);
    statusTimer.current = setInterval(
      () => setStatusIdx(p => (p + 1) % EXTRACT_STATUSES.length), 3500,
    );
  };
  const stopStatusTimer = () => clearInterval(statusTimer.current);

  // ── Play movie ────────────────────────────────────────────────────
  const handlePlay = useCallback(async () => {
    setExtracting(true);
    setExtractError(null);
    startStatusTimer();
    try {
      const url = `${FASEL_BASE}/?p=${item.id}`;
      const result = await extractVideoUrl(url);
      stopStatusTimer();

      // Validate extracted URL is actually a playable stream
      const streamUrl = result.video_url || '';
      if (!isValidStreamUrl(streamUrl)) {
        console.warn('[Details] Extracted URL looks invalid:', streamUrl.substring(0, 150));
        setExtracting(false);
        setExtractError(t('video_unavailable') || 'Could not extract a valid stream URL.');
        return;
      }

      setExtracting(false);
      // recordPlay is sync - do NOT .catch()
      recordPlay(item.id, category);
      nav.navigate('Player', {
        url: streamUrl,
        qualities: result.quality_options,
        title: item.Title,
        contentId: item.id,
        category,
        pageUrl: url, // for cache-bust retry on expired URLs
      });
    } catch (err: any) {
      stopStatusTimer();
      setExtractError(err.message || t('server_error'));
      setExtracting(false);
    }
  }, [item, category, nav, t]);

  // ── Play episode ──────────────────────────────────────────────────
  const handlePlayEpisode = useCallback(async (epUrl: string, epNum: number) => {
    setExtractingEp(epUrl);
    setExtractError(null);
    startStatusTimer();
    try {
      const result = await extractVideoUrl(epUrl);
      stopStatusTimer();

      // Validate extracted URL
      const streamUrl = result.video_url || '';
      if (!isValidStreamUrl(streamUrl)) {
        console.warn('[Details] Episode URL looks invalid:', streamUrl.substring(0, 150));
        setExtractingEp(null);
        setExtractError(t('video_unavailable') || 'Could not extract a valid stream URL.');
        return;
      }

      setExtractingEp(null);
      // recordPlay is sync - do NOT .catch()
      recordPlay(item.id, category);
      nav.navigate('Player', {
        url: streamUrl,
        qualities: result.quality_options,
        title: `${item.Title} - ${t('season')} ${selSeason} ${t('episode')} ${epNum}`,
        contentId: item.id,
        category,
        pageUrl: epUrl,
      });
    } catch (err: any) {
      stopStatusTimer();
      setExtractError(err.message || t('server_error'));
      setExtractingEp(null);
    }
  }, [item, category, selSeason, nav, t]);

  const handleShare = () =>
    Share.share({message: `${item.Title} - AbdoBest`});

  // ══════════════════════════════════════════════════════════════════════
  // ── Empty state (item is missing) ─────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════
  if (!item) {
    return (
      <View style={S.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} translucent />
        <TouchableOpacity
          style={[S.navBtn, {margin: 20, marginTop: insets.top + 20}]}
          onPress={() => nav.goBack()}
        >
          <Image source={require('../../assets/icons/arrow.png')} style={S.iconNav} />
        </TouchableOpacity>
        <View style={S.errorStateWrap}>
          <Image
            source={require('../../assets/icons/clapboard.png')}
            style={S.errorStateIcon}
          />
          <Text style={S.errorStateText}>
            {t('error_loading') || 'Content not found'}
          </Text>
          <TouchableOpacity
            style={S.errorStateBtn}
            onPress={() => nav.goBack()}
          >
            <Text style={S.errorStateBtnText}>
              {lang === 'ar' ? '\u0639\u0648\u062F\u0629' : 'Go Back'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── Main render ────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════
  return (
    <View style={S.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[S.scroll, {paddingBottom: insets.bottom + 60}]}
      >
        {/* ── Nav row ── */}
        <View style={[S.topNav, {paddingTop: insets.top + 10}]}>
          <TouchableOpacity style={S.navBtn} onPress={() => nav.goBack()}>
            <Image source={require('../../assets/icons/arrow.png')} style={S.iconNav} />
          </TouchableOpacity>
          <TouchableOpacity style={S.navBtn} onPress={handleShare}>
            <Image source={require('../../assets/icons/share.png')} style={S.iconNav} />
          </TouchableOpacity>
        </View>

        {/* ── Title box (surface bg, rounded, bordered) ── */}
        <View style={S.titleBox}>
          <Text style={S.title} numberOfLines={4}>{item.Title}</Text>
        </View>

        {/* ── Poster with corner badges ── */}
        <View style={S.posterWrap}>
          {item['Image Source'] ? (
            <FastImage
              source={{uri: seasonPoster || item['Image Source']}}
              style={S.poster}
              resizeMode={FastImage.resizeMode.cover}
              fallback
            />
          ) : (
            <View style={[S.poster, S.posterPlaceholder]}>
              <Image
                source={require('../../assets/icons/clapboard.png')}
                style={{width: 52, height: 52, tintColor: Colors.dark.textMuted}}
              />
            </View>
          )}

          {/* Category badge - top-left (PNG icon, no emoji) */}
          {CAT_BADGE_KEY[category] ? (
            <View style={S.catChip}>
              <Text style={S.catChipText}>{t(CAT_BADGE_KEY[category])}</Text>
            </View>
          ) : null}

          {/* Quality badge - bottom-right */}
          {format ? (
            <View style={S.fmtChip}>
              <Text style={S.fmtChipText}>{format}</Text>
            </View>
          ) : null}

          {/* Viewing level badge - top-right */}
          {viewingLvl && viewingLvl !== 'Documentary , History' ? (
            <View style={S.vlChip}>
              <Text style={S.vlChipText}>{viewingLvl}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Rating + Views + Status pills (PNG icons, no emoji) ── */}
        <View style={S.pillsRow}>
          {rating ? (
            <View style={S.pill}>
              <Image
                source={require('../../assets/icons/star.png')}
                style={[S.pillIcon, {tintColor: '#FFD700'}]}
              />
              <Text style={[S.pillTxt, {color: '#FFD700'}]}>{rating}</Text>
              <Text style={S.pillSub}>
                {lang === 'ar' ? '\u0645\u0646 10' : '/ 10'}
              </Text>
            </View>
          ) : ratingLoading ? (
            <View style={S.pill}>
              <ActivityIndicator size="small" color={Colors.dark.textMuted} />
            </View>
          ) : null}
          {views ? (
            <View style={S.pill}>
              <Image
                source={require('../../assets/icons/eyes.png')}
                style={S.pillIcon}
              />
              <Text style={S.pillTxt}>{views}</Text>
            </View>
          ) : null}
          {isEpisodic && displayStatus ? (
            <View style={[S.pill, isOngoing ? S.statusOngoing : S.statusComplete]}>
              <Text style={[S.statusTxt, {color: '#fff'}]}>{displayStatus}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Episode/Season count badges (series/anime) ── */}
        {isEpisodic && (totalSeasons > 0 || totalEps > 0) && (
          <View style={S.countRow}>
            {totalSeasons > 1 ? (
              <View style={S.countBadge}>
                <Text style={S.countBadgeText}>{totalSeasons} {t('seasons')}</Text>
              </View>
            ) : null}
            {totalEps > 0 ? (
              <View style={S.countBadge}>
                <Text style={S.countBadgeText}>{totalEps} {t('episodes')}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* ── Action buttons ── */}
        <View style={S.actions}>
          <TouchableOpacity
            style={[S.playBtn, extracting && S.playBtnBusy]}
            onPress={isEpisodic ? undefined : handlePlay}
            disabled={extracting && !isEpisodic}
            activeOpacity={0.84}
          >
            {extracting && !isEpisodic ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={S.playBtnTxt} numberOfLines={1}>
                  {EXTRACT_STATUSES[statusIdx]}
                </Text>
              </>
            ) : (
              <>
                <Image
                  source={require('../../assets/icons/clapboard.png')}
                  style={{width: 18, height: 18, tintColor: '#fff'}}
                />
                <Text style={S.playBtnTxt}>
                  {isEpisodic ? t('select_episode') : t('play')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={S.dlBtn} activeOpacity={0.84}>
            <Image
              source={require('../../assets/icons/files.png')}
              style={[S.iconMed, {tintColor: Colors.dark.accentLight}]}
            />
            <Text style={S.dlBtnTxt}>{t('download')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Extract error banner ── */}
        {extractError ? (
          <View style={S.errBanner}>
            <Text style={S.errTxt} numberOfLines={3}>{extractError}</Text>
            <TouchableOpacity
              style={S.retryBtn}
              onPress={() => extractingEp ? null : handlePlay()}
            >
              <Image
                source={require('../../assets/icons/undoreturn.png')}
                style={{width: 14, height: 14, tintColor: Colors.dark.primary}}
              />
              <Text style={S.retryTxt}>{t('retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Description ── */}
        {description ? (
          <View style={S.descBox}>
            <Text style={S.descLabel}>{t('description')}</Text>
            <Text style={S.descTxt}>{description}</Text>
          </View>
        ) : null}

        {/* ── Info table (RTL-aware) ── */}
        <View style={S.infoTable}>
          {releaseDate ? <InfoRow label={t('release_date')} value={String(releaseDate).slice(0, 10)} accent isRTL={isRTL} /> : null}
          {!releaseDate && year ? <InfoRow label={t('year')} value={String(year)} accent isRTL={isRTL} /> : null}
          {item.Category ? <InfoRow label={t('category')} value={t(item.Category) || item.Category} accent isRTL={isRTL} /> : null}
          {genresDisplay ? <InfoRow label={t('genres')} value={genresDisplay} accent isRTL={isRTL} /> : null}
          {language ? <InfoRow label={t('language')} value={language} isRTL={isRTL} /> : null}
          {format ? <InfoRow label={t('quality')} value={format} isRTL={isRTL} /> : null}
          {country ? <InfoRow label={t('country')} value={country} accent isRTL={isRTL} /> : null}
          {directors ? <InfoRow label={t('directors')} value={directors} accent isRTL={isRTL} /> : null}
          {viewType ? <InfoRow label={t('type')} value={viewType} isRTL={isRTL} /> : null}
          {viewingLvl ? <InfoRow label={t('viewing_level')} value={viewingLvl} isRTL={isRTL} /> : null}
          {displayStatus ? <InfoRow label={t('status_label')} value={displayStatus} accent={isOngoing} isRTL={isRTL} /> : null}
          {isEpisodic && totalEps > 0 ? <InfoRow label={t('episodes')} value={String(totalEps)} isRTL={isRTL} /> : null}
          {epDuration && epDuration !== 'min\u062F' ? <InfoRow label={t('episode_duration')} value={epDuration} isRTL={isRTL} /> : null}
          {!isEpisodic && runtime ? <InfoRow label={t('duration')} value={runtime} isRTL={isRTL} /> : null}
          {/* Rating row with star icon */}
          {rating ? (
            <View style={[rowS.row, {flexDirection: isRTL ? 'row-reverse' : 'row'}]}>
              <Text style={[rowS.label, {textAlign: isRTL ? 'right' : 'left'}]}>{t('rating')}</Text>
              <View style={{
                flex: 2,
                flexDirection: 'row',
                justifyContent: isRTL ? 'flex-start' : 'flex-end',
                alignItems: 'center',
                gap: 6,
              }}>
                <Text style={[rowS.value, {textAlign: isRTL ? 'left' : 'right'}]}>
                  {rating} {lang === 'ar' ? '\u0645\u0646 10' : '/ 10'}
                </Text>
                <Image
                  source={require('../../assets/icons/star.png')}
                  style={{width: 16, height: 16, tintColor: '#FFD700'}}
                />
              </View>
            </View>
          ) : null}
        </View>

        {/* ── Episodes section (series/anime) ── */}
        {isEpisodic && (
          <View style={S.epsSection}>
            <View style={S.epsHeader}>
              <Image
                source={require('../../assets/icons/tv.png')}
                style={[S.sectionIcon, {tintColor: Colors.dark.primary}]}
              />
              <Text style={S.epsTitle}>{t('episodes')}</Text>
              {loadingEps && (
                <ActivityIndicator
                  size="small"
                  color={Colors.dark.primary}
                  style={{marginLeft: 8}}
                />
              )}

              {/* Season picker button */}
              {seasonKeys.length > 1 && (
                <TouchableOpacity
                  style={S.seasonBtn}
                  onPress={() => setShowSeasonDlg(true)}
                >
                  <Image
                    source={require('../../assets/icons/tv.png')}
                    style={[S.seasonBtnIcon, {tintColor: Colors.dark.primary}]}
                  />
                  <Text style={S.seasonBtnTxt}>
                    {t('season')} {selSeason}
                  </Text>
                  <Text style={S.seasonBtnArrow}>&#9662;</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Season poster (changes per season) */}
            {seasonPoster ? (
              <View style={S.seasonPosterWrap}>
                <FastImage
                  source={{uri: seasonPoster}}
                  style={S.seasonPoster}
                  resizeMode={FastImage.resizeMode.cover}
                  fallback
                />
              </View>
            ) : null}

            {loadingEps ? (
              <ActivityIndicator color={Colors.dark.primary} style={{margin: 20}} />
            ) : currentEps.length > 0 ? (
              currentEps.map((epUrl, idx) => {
                const isExtractingThis = extractingEp === epUrl;
                return (
                  <TouchableOpacity
                    key={`ep-${selSeason}-${idx}`}
                    style={[S.epRow, isExtractingThis && S.epRowDisabled]}
                    onPress={() => handlePlayEpisode(epUrl, idx + 1)}
                    disabled={!!extractingEp}
                    activeOpacity={0.75}
                  >
                    {/* Episode number circle */}
                    <View style={[S.epNumCircle, isExtractingThis && S.epNumActive]}>
                      <Text style={[S.epNum, isExtractingThis && S.epNumActiveTxt]}>
                        {idx + 1}
                      </Text>
                    </View>

                    {/* Episode info */}
                    <View style={S.epInfo}>
                      <Text style={S.epTitle}>
                        {t('episode')} {idx + 1}
                      </Text>
                      {epDuration && epDuration !== 'min\u062F' ? (
                        <Text style={S.epDur}>{epDuration}</Text>
                      ) : null}
                    </View>

                    {/* Play indicator */}
                    {isExtractingThis ? (
                      <ActivityIndicator size="small" color={Colors.dark.primary} />
                    ) : (
                      <Image
                        source={require('../../assets/icons/clapboard.png')}
                        style={[S.epPlayIcon, {tintColor: Colors.dark.primary}]}
                      />
                    )}
                  </TouchableOpacity>
                );
              })
            ) : !loadingEps ? (
              <View style={S.noEpsWrap}>
                <Image
                  source={require('../../assets/icons/files.png')}
                  style={{width: 32, height: 32, tintColor: Colors.dark.textMuted}}
                />
                <Text style={S.noEpsTxt}>{t('not_available')}</Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* ── Full-screen extracting overlay ── */}
      {extracting && (
        <View style={S.extractOverlay}>
          <View style={S.extractCard}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
            <Text style={S.extractStatus} numberOfLines={2}>
              {EXTRACT_STATUSES[statusIdx]}
            </Text>
            <TouchableOpacity
              style={S.extractCancel}
              onPress={() => {
                stopStatusTimer();
                setExtracting(false);
                setExtractError(t('video_unavailable') || 'Cancelled');
              }}
            >
              <Text style={S.extractCancelTxt}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Season picker modal (bottom sheet) ── */}
      <Modal
        visible={showSeasonDlg}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSeasonDlg(false)}
      >
        <TouchableOpacity
          style={S.modalBg}
          activeOpacity={1}
          onPress={() => setShowSeasonDlg(false)}
        >
          <View style={S.modalSheet}>
            <View style={S.modalHandle} />
            <Text style={S.modalTitle}>{t('select_season')}</Text>

            {/* Season poster preview in modal */}
            {seasonPoster ? (
              <FastImage
                source={{uri: seasonPoster}}
                style={S.modalPoster}
                resizeMode={FastImage.resizeMode.cover}
              />
            ) : null}

            <FlatList
              data={seasonKeys}
              keyExtractor={s => s}
              style={{maxHeight: 280}}
              renderItem={({item: sk}) => {
                const skPoster = epData?.seasons?.[sk]?.poster || '';
                const skEps = epData?.seasons?.[sk]?.episodes || [];
                const isActive = selSeason === sk;
                return (
                  <TouchableOpacity
                    style={[S.modalOpt, isActive && S.modalOptActive]}
                    onPress={() => { setSelSeason(sk); setShowSeasonDlg(false); }}
                  >
                    {/* Season thumbnail in modal */}
                    {skPoster ? (
                      <FastImage
                        source={{uri: skPoster}}
                        style={S.modalThumb}
                        resizeMode={FastImage.resizeMode.cover}
                      />
                    ) : (
                      <View style={S.modalThumbFallback}>
                        <Image
                          source={require('../../assets/icons/tv.png')}
                          style={{width: 18, height: 18, tintColor: Colors.dark.textMuted}}
                        />
                      </View>
                    )}
                    <View style={S.modalOptInfo}>
                      <Text style={[S.modalOptTxt, isActive && S.modalOptTxtActive]}>
                        {t('season')} {sk}
                      </Text>
                      <Text style={S.modalOptSub}>
                        {skEps.length} {t('episodes')}
                      </Text>
                    </View>
                    {isActive && (
                      <Text style={{color: Colors.dark.primary, fontSize: 16}}>&#10003;</Text>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ── Styles ───────────────────────────────────────────────────────────
const S = StyleSheet.create({
  container:  {flex: 1, backgroundColor: Colors.dark.background},
  scroll:     {paddingTop: 0},
  fallback:   {color: Colors.dark.textMuted, textAlign: 'center', fontFamily: 'Rubik', marginTop: 40},

  // ── Top nav ──
  topNav:     {flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12},
  navBtn:     {width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.dark.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.dark.border},
  iconNav:    {width: 20, height: 20, tintColor: Colors.dark.text},
  iconMed:    {width: 20, height: 20},

  // ── Error state ──
  errorStateWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  errorStateIcon: {
    width: 64,
    height: 64,
    tintColor: Colors.dark.textMuted,
  },
  errorStateText: {
    color: Colors.dark.textSecondary,
    fontSize: 15,
    fontFamily: 'Rubik',
    textAlign: 'center',
  },
  errorStateBtn: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.dark.primary,
  },
  errorStateBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },

  // ── Title box ──
  titleBox: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
    fontFamily: 'Rubik',
    lineHeight: 29,
  },

  // ── Poster ──
  posterWrap:        {alignSelf: 'center', marginBottom: 16, position: 'relative'},
  poster:            {width: POSTER_W, height: POSTER_H, borderRadius: 16, backgroundColor: Colors.dark.surfaceLight, elevation: 14, shadowColor: '#000', shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.55, shadowRadius: 16},
  posterPlaceholder: {justifyContent: 'center', alignItems: 'center'},

  // ── Poster corner badges ──
  catChip:     {position: 'absolute', top: 10, left: 10, backgroundColor: Colors.dark.primaryLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7},
  catChipText: {color: '#000', fontSize: 11, fontWeight: '700', fontFamily: 'Rubik'},
  fmtChip:     {position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.88)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)'},
  fmtChipText: {color: '#fff', fontSize: 11, fontWeight: '700', fontFamily: 'Rubik'},
  vlChip:      {position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.88)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)'},
  vlChipText:  {color: '#FFD700', fontSize: 11, fontWeight: '700', fontFamily: 'Rubik'},

  // ── Pills row ──
  pillsRow:      {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 14, paddingHorizontal: 16},
  pill:          {flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.dark.surface, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 22, gap: 5, borderWidth: 1, borderColor: Colors.dark.border},
  pillIcon:      {width: 13, height: 13},
  pillTxt:       {color: Colors.dark.text, fontSize: 13, fontWeight: '700', fontFamily: 'Rubik'},
  pillSub:       {color: Colors.dark.textMuted, fontSize: 11, fontFamily: 'Rubik'},
  statusOngoing: {backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary},
  statusComplete:{backgroundColor: Colors.dark.success, borderColor: Colors.dark.success},
  statusTxt:     {fontSize: 12, fontWeight: '600', fontFamily: 'Rubik'},

  // ── Count badges ──
  countRow:       {flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 14, paddingHorizontal: 16, flexWrap: 'wrap'},
  countBadge:     {backgroundColor: Colors.dark.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: Colors.dark.border},
  countBadgeText: {color: Colors.dark.textSecondary, fontSize: 12, fontWeight: '600', fontFamily: 'Rubik'},

  // ── Action buttons ──
  actions:       {flexDirection: 'row', paddingHorizontal: 18, marginBottom: 12, gap: 12},
  playBtn:       {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 54, borderRadius: 16, backgroundColor: Colors.dark.primary, gap: 8, elevation: 8, shadowColor: Colors.dark.primary, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.5, shadowRadius: 10},
  playBtnBusy:   {backgroundColor: `${Colors.dark.primary}CC`},
  playBtnTxt:    {color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'Rubik', flexShrink: 1},
  dlBtn:         {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 54, borderRadius: 16, backgroundColor: Colors.dark.surface, gap: 8, borderWidth: 1.5, borderColor: Colors.dark.accentLight},
  dlBtnTxt:      {color: Colors.dark.accentLight, fontSize: 15, fontWeight: '700', fontFamily: 'Rubik'},

  // ── Error banner ──
  errBanner: {marginHorizontal: 18, marginBottom: 12, backgroundColor: `${Colors.dark.error}16`, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: `${Colors.dark.error}30`, gap: 10},
  errTxt:    {flex: 1, color: Colors.dark.error, fontSize: 13, fontFamily: 'Rubik'},
  retryBtn:  {flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: `${Colors.dark.primary}22`},
  retryTxt:  {color: Colors.dark.primary, fontSize: 13, fontWeight: '700', fontFamily: 'Rubik'},

  // ── Description ──
  descBox:   {marginHorizontal: 16, marginBottom: 14, backgroundColor: Colors.dark.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.dark.border},
  descLabel: {color: Colors.dark.text, fontSize: 14, fontWeight: '700', fontFamily: 'Rubik', marginBottom: 8},
  descTxt:   {color: Colors.dark.textSecondary, fontSize: 14, lineHeight: 22, fontFamily: 'Rubik'},

  // ── Info table ──
  infoTable: {marginHorizontal: 16, backgroundColor: Colors.dark.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.dark.border, marginBottom: 20},

  // ── Episodes section ──
  epsSection:      {marginHorizontal: 16, marginBottom: 20, backgroundColor: Colors.dark.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.dark.border},
  epsHeader:       {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.dark.border, gap: 8},
  sectionIcon:     {width: 20, height: 20},
  epsTitle:        {flex: 1, color: Colors.dark.text, fontSize: 16, fontWeight: '700', fontFamily: 'Rubik'},
  seasonBtn:       {flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: `${Colors.dark.primary}20`, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: `${Colors.dark.primary}40`},
  seasonBtnIcon:   {width: 14, height: 14},
  seasonBtnTxt:    {color: Colors.dark.primary, fontSize: 13, fontWeight: '700', fontFamily: 'Rubik'},
  seasonBtnArrow:  {color: Colors.dark.primary, fontSize: 10},

  // ── Season poster ──
  seasonPosterWrap: {paddingVertical: 10, alignItems: 'center'},
  seasonPoster:     {width: 120, height: 180, borderRadius: 10, backgroundColor: Colors.dark.surfaceLight},

  // ── Episode row ──
  epRow:           {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.dark.border, gap: 12},
  epRowDisabled:   {opacity: 0.5},
  epNumCircle:     {width: 38, height: 38, borderRadius: 19, backgroundColor: `${Colors.dark.primary}20`, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: `${Colors.dark.primary}40`},
  epNumActive:     {backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary},
  epNum:           {color: Colors.dark.primary, fontSize: 14, fontWeight: '700', fontFamily: 'Rubik'},
  epNumActiveTxt:  {color: '#fff'},
  epInfo:          {flex: 1},
  epTitle:         {color: Colors.dark.text, fontSize: 14, fontWeight: '600', fontFamily: 'Rubik'},
  epDur:           {color: Colors.dark.textMuted, fontSize: 12, fontFamily: 'Rubik', marginTop: 2},
  epPlayIcon:      {width: 20, height: 20},

  noEpsWrap:       {alignItems: 'center', paddingVertical: 24, gap: 8},
  noEpsTxt:        {color: Colors.dark.textMuted, fontSize: 14, fontFamily: 'Rubik'},

  // ── Extracting overlay (full-screen) ──
  extractOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  extractCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 14,
    minWidth: 220,
  },
  extractStatus: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontFamily: 'Rubik',
    textAlign: 'center',
  },
  extractCancel: {
    marginTop: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: `${Colors.dark.error}20`,
    borderWidth: 1,
    borderColor: `${Colors.dark.error}40`,
  },
  extractCancelTxt: {
    color: Colors.dark.error,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Rubik',
  },

  // ── Season modal ──
  modalBg:         {flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end'},
  modalSheet:      {backgroundColor: Colors.dark.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: '70%'},
  modalHandle:     {width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.dark.border, alignSelf: 'center', marginTop: 12, marginBottom: 4},
  modalTitle:      {color: Colors.dark.text, fontSize: 17, fontWeight: '700', fontFamily: 'Rubik', textAlign: 'center', paddingVertical: 14},
  modalPoster:     {width: 100, height: 150, borderRadius: 10, alignSelf: 'center', marginBottom: 12, backgroundColor: Colors.dark.surfaceLight},
  modalOpt:        {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.dark.border, gap: 12},
  modalOptActive:  {backgroundColor: `${Colors.dark.primary}15`},
  modalThumb:      {width: 44, height: 62, borderRadius: 8, backgroundColor: Colors.dark.surfaceLight},
  modalThumbFallback: {width: 44, height: 62, borderRadius: 8, backgroundColor: Colors.dark.surfaceLight, justifyContent: 'center', alignItems: 'center'},
  modalOptInfo:    {flex: 1},
  modalOptTxt:     {color: Colors.dark.textSecondary, fontSize: 15, fontFamily: 'Rubik'},
  modalOptTxtActive:{color: Colors.dark.primary, fontWeight: '700', fontFamily: 'Rubik'},
  modalOptSub:     {color: Colors.dark.textMuted, fontSize: 12, fontFamily: 'Rubik', marginTop: 2},
});
