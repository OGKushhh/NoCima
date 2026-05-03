/**
 * DetailsScreen — Full metadata + episode indexer + season selector
 *
 * Uses on-device WebView extraction (VideoExtractor) instead of
 * server-side extraction. This is required because the CDN (scdns.io)
 * bakes the IP into a signed token – server extraction gives a URL that 403s on phone.
 *
 * Play flow:
 *   Movies:   page URL → VideoExtractor (WebView) → intercept m3u8 → Player
 *   Episodes: episode URL → VideoExtractor (WebView) → intercept m3u8 → Player
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
import {recordPlay} from '../services/viewService';
import {Colors} from '../theme/colors';
import {useTranslation} from 'react-i18next';
import {localizeGenres} from '../i18n/genres';
import {API_BASE} from '../constants/endpoints';
import {VideoExtractor} from '../components/VideoExtractor';

const FASEL_BASE = 'https://www.fasel-hd.cam';

const {width: SW} = Dimensions.get('window');
const POSTER_W = Math.min(SW * 0.48, 200);
const POSTER_H = POSTER_W * 1.52;

const STATUS_MSGS = [
  'Connecting to server…',
  'Loading page…',
  'Extracting stream…',
  'Almost there…',
];

// Map category key → i18n key for poster badge
const CAT_I18N: Record<string, string> = {
  movies:          'movies',
  'dubbed-movies': 'dubbed_movies',
  hindi:           'hindi',
  'asian-movies':  'asian_movies',
  anime:           'anime',
  'anime-movies':  'anime_movies',
  series:          'series',
  tvshows:         'tvshows',
  'asian-series':  'asian_series',
};

// ── Info table row ───────────────────────────────────────────────────
interface InfoRowProps {
  label: string;
  value: string;
  accent?: boolean;
}
const InfoRow: React.FC<InfoRowProps> = ({label, value, accent}) => (
  <View style={rowS.row}>
    <Text style={rowS.label}>{label}</Text>
    <Text style={[rowS.value, accent && rowS.accent]} numberOfLines={3}>{value}</Text>
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
  const [extractingEpUrl, setExtractingEpUrl] = useState<string | null>(null);

  // WebView extractor state
  const [extractorUrl, setExtractorUrl] = useState<string | null>(null);
  const extractorTitleRef = useRef<string>('');
  // Tracks the last play request so the error-banner retry button works for both movies and episodes
  const lastPlayRef = useRef<{url: string; title: string} | null>(null);

  // Episode state
  const [epData, setEpData] = useState<any>(null);
  const [loadingEps, setLoadingEps] = useState(false);
  const [selSeason, setSelSeason] = useState<string>('1');
  const [showSeasonDlg, setShowSeasonDlg] = useState(false);

  // Rating fetch state
  const [rating, setRating] = useState<string>('');
  const [ratingLoading, setRatingLoading] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);

  const statusTimer = useRef<ReturnType<typeof setInterval>>();

  const lang = i18n.language === 'ar' ? 'ar' : 'en';
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

  // ── Empty state ───────────────────────────────────────────────────
  if (!item) {
    return (
      <View style={S.container}>
        <TouchableOpacity
          style={[S.navBtn, {margin: 20, marginTop: insets.top + 20}]}
          onPress={() => nav.goBack()}
        >
          <Image source={require('../../assets/icons/arrow.png')} style={S.iconNav} />
        </TouchableOpacity>
        <Text style={S.fallback}>{t('error_loading')}</Text>
      </View>
    );
  }

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

  // ─── TOTAL EPISODES (accurate from episode file) ─────────────────
  const totalEps = useMemo(() => {
    // 1. If we have the detailed episode data, sum over all seasons
    if (epData?.seasons) {
      let sum = 0;
      Object.values(epData.seasons).forEach((season: any) => {
        sum += season.episodes?.length || 0;
      });
      return sum;
    }
    // 2. Fallback to static fields (while still loading)
    if (numEps && numEps > 0) return numEps;
    if (numEpsText && parseInt(String(numEpsText), 10) > 0) return parseInt(String(numEpsText), 10);
    // 3. Last resort – current season's episodes count (in case no episode file at all)
    return currentEps.length;
  }, [epData, numEps, numEpsText, currentEps.length]);

  // ── Status timer helpers ──────────────────────────────────────────
  const startStatusTimer = () => {
    setStatusIdx(0);
    statusTimer.current = setInterval(
      () => setStatusIdx(p => (p + 1) % STATUS_MSGS.length), 4000,
    );
  };
  const stopStatusTimer = () => clearInterval(statusTimer.current);

  // ── WebView extraction callbacks ──────────────────────────────────
  const handleExtracted = useCallback((m3u8Url: string) => {
    stopStatusTimer();
    setExtractorUrl(null);
    setExtracting(false);
    setExtractingEpUrl(null);
    recordPlay(item.id, category);
    nav.navigate('Player', {
      url: m3u8Url,
      title: extractorTitleRef.current,
      contentId: item.id,
      category,
    });
  }, [item.id, category, nav]);

  const handleExtractError = useCallback(() => {
    stopStatusTimer();
    setExtractorUrl(null);
    setExtracting(false);
    setExtractingEpUrl(null);
    setExtractError(t('video_unavailable'));
  }, [t]);

  // ── Shared extraction launcher ────────────────────────────────────
  const startExtraction = useCallback((url: string, title: string, epUrl?: string) => {
    setShowLightbox(false);
    setExtracting(true);
    setExtractError(null);
    startStatusTimer();
    extractorTitleRef.current = title;
    lastPlayRef.current = {url, title};
    if (epUrl !== undefined) setExtractingEpUrl(epUrl);
    setExtractorUrl(url);
  }, []);

  // ── Play movie (on-device extraction) ────────────────────────────
  const handlePlay = useCallback(() => {
    startExtraction(`${FASEL_BASE}/?p=${item.id}`, item.Title);
  }, [item.id, item.Title, startExtraction]);

  // ── Play first episode of current season ─────────────────────────
  const handlePlayFirst = useCallback(() => {
    if (!currentEps.length) return;
    const epUrl = currentEps[0];
    const title = `${item.Title} - ${t('season')} ${selSeason} ${t('episode')} 1`;
    startExtraction(epUrl, title, epUrl);
  }, [currentEps, item.Title, selSeason, t, startExtraction]);

  // ── Play episode (on-device extraction) ──────────────────────────
  const handlePlayEpisode = useCallback((epUrl: string, epNum: number) => {
    const title = `${item.Title} - ${t('season')} ${selSeason} ${t('episode')} ${epNum}`;
    startExtraction(epUrl, title, epUrl);
  }, [item.Title, selSeason, t, startExtraction]);

  // ── Retry last extraction ─────────────────────────────────────────
  const handleRetry = useCallback(() => {
    if (!lastPlayRef.current) return;
    const {url, title} = lastPlayRef.current;
    const isEp = !url.includes('/?p=');
    startExtraction(url, title, isEp ? url : undefined);
  }, [startExtraction]);

  const handleShare = () =>
    Share.share({message: `${item.Title} - AbdoBest`});

  // ── Render ─────────────────────────────────────────────────────────
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

        {/* ── Title box ── */}
        <View style={S.titleBox}>
          <Text style={S.title} numberOfLines={4}>{item.Title}{year ? ` (${year})` : ''}</Text>
        </View>

        {/* ── Poster (no lightbox by default, but you can add one) ── */}
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
              <Image source={require('../../assets/icons/clapboard.png')} style={{width: 52, height: 52, tintColor: Colors.dark.textMuted}} />
            </View>
          )}
        </View>

        {/* ── Badges row (category, quality, viewing level, rating, views, status) ── */}
        <View style={S.pillsRow}>
          {CAT_I18N[category] ? (
            <View style={S.catPill}><Text style={S.catPillTxt}>{t(CAT_I18N[category])}</Text></View>
          ) : null}
          {format ? (
            <View style={S.fmtPill}><Text style={S.fmtPillTxt}>{format}</Text></View>
          ) : null}
          {viewingLvl && viewingLvl !== 'Documentary , History' ? (
            <View style={S.vlPill}><Text style={S.vlPillTxt}>{viewingLvl}</Text></View>
          ) : null}
          {rating ? (
            <View style={S.pill}>
              <Image source={require('../../assets/icons/star.png')} style={[S.pillIcon, {tintColor: '#FFD700'}]} />
              <Text style={[S.pillTxt, {color: '#FFD700'}]}>{rating}</Text>
              <Text style={S.pillSub}>{lang === 'ar' ? '\u0645\u0646 10' : '/ 10'}</Text>
            </View>
          ) : ratingLoading ? (
            <View style={S.pill}><ActivityIndicator size="small" color={Colors.dark.textMuted} /></View>
          ) : null}
          {views ? (
            <View style={S.pill}>
              <Image source={require('../../assets/icons/eyes.png')} style={S.pillIcon} />
              <Text style={S.pillTxt}>{views}</Text>
            </View>
          ) : null}
          {isEpisodic && displayStatus ? (
            <View style={[S.pill, isOngoing ? S.statusOngoing : S.statusComplete]}>
              <Text style={[S.statusTxt, {color: '#fff'}]}>{displayStatus}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Season / Episode count badges (with loading indicator) ── */}
        {isEpisodic && (totalSeasons > 0 || totalEps > 0) && (
          <View style={S.countRow}>
            {totalSeasons >= 1 ? (
              <View style={S.countBadge}>
                <Text style={S.countBadgeText}>{totalSeasons} {t('seasons')}</Text>
              </View>
            ) : null}
            {totalEps > 0 ? (
              <View style={S.countBadge}>
                <Text style={S.countBadgeText}>{totalEps} {t('episodes')}</Text>
                {loadingEps && !epData && (
                  <ActivityIndicator size="small" color={Colors.dark.primary} style={{marginLeft: 6}} />
                )}
              </View>
            ) : null}
          </View>
        )}

        {/* ── Action buttons ── */}
        <View style={S.actions}>
          <TouchableOpacity
            style={[S.playBtn, (extracting || (isEpisodic && loadingEps)) && S.playBtnBusy]}
            onPress={isEpisodic ? handlePlayFirst : handlePlay}
            disabled={extracting || (isEpisodic && loadingEps)}
            activeOpacity={0.84}
          >
            {extracting && !isEpisodic ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={S.playBtnTxt} numberOfLines={1}>{STATUS_MSGS[statusIdx]}</Text>
              </>
            ) : (
              <>
                <Image source={require('../../assets/icons/clapboard.png')} style={{width: 18, height: 18, tintColor: '#fff'}} />
                <Text style={S.playBtnTxt}>
                  {isEpisodic ? t('play_first_episode') : t('play')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={S.dlBtn} activeOpacity={0.84}>
            <Image source={require('../../assets/icons/files.png')} style={[S.iconMed, {tintColor: Colors.dark.accentLight}]} />
            <Text style={S.dlBtnTxt}>{t('download')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Extract error ── */}
        {extractError ? (
          <View style={S.errBanner}>
            <Text style={S.errTxt} numberOfLines={3}>{extractError}</Text>
            <TouchableOpacity style={S.retryBtn} onPress={handleRetry}>
              <Image source={require('../../assets/icons/undoreturn.png')} style={{width: 14, height: 14, tintColor: Colors.dark.primary}} />
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

        {/* ── Info table ── */}
        <View style={S.infoTable}>
          {releaseDate ? <InfoRow label={t('release_date')} value={String(releaseDate).slice(0, 10)} accent /> : null}
          {!releaseDate && year ? <InfoRow label={t('year')} value={String(year)} accent /> : null}
          {item.Category ? <InfoRow label={t('category')} value={t(item.Category) || item.Category} accent /> : null}
          {genresDisplay ? <InfoRow label={t('genres')} value={genresDisplay} accent /> : null}
          {language ? <InfoRow label={t('language')} value={language} /> : null}
          {format ? <InfoRow label={t('quality')} value={format} /> : null}
          {country ? <InfoRow label={t('country')} value={country} accent /> : null}
          {directors ? <InfoRow label={t('directors')} value={directors} accent /> : null}
          {viewType ? <InfoRow label={t('type')} value={viewType} /> : null}
          {viewingLvl ? <InfoRow label={t('viewing_level')} value={viewingLvl} /> : null}
          {displayStatus ? <InfoRow label={t('status_label')} value={displayStatus} accent={isOngoing} /> : null}
          {isEpisodic && totalEps > 0 ? (
            <View style={rowS.row}>
              <Text style={rowS.label}>{t('episodes')}</Text>
              <View style={{flex: 2, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8}}>
                <Text style={rowS.value}>{String(totalEps)}</Text>
                {loadingEps && !epData && <ActivityIndicator size="small" color={Colors.dark.primary} />}
              </View>
            </View>
          ) : null}
          {epDuration && epDuration !== 'min\u062F' ? <InfoRow label={t('episode_duration')} value={epDuration} /> : null}
          {!isEpisodic && runtime ? <InfoRow label={t('duration')} value={runtime} /> : null}
          {rating ? (
            <View style={rowS.row}>
              <Text style={rowS.label}>{t('rating')}</Text>
              <View style={{flex: 2, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6}}>
                <Text style={rowS.value}>{rating} {lang === 'ar' ? '\u0645\u0646 10' : '/ 10'}</Text>
                <Image source={require('../../assets/icons/star.png')} style={{width: 16, height: 16, tintColor: '#FFD700'}} />
              </View>
            </View>
          ) : null}
        </View>

        {/* ── Episodes section (series/anime) ── */}
        {isEpisodic && (
          <View style={S.epsSection}>
            <View style={S.epsHeader}>
              <Image source={require('../../assets/icons/tv.png')} style={[S.sectionIcon, {tintColor: Colors.dark.primary}]} />
              <Text style={S.epsTitle}>{t('episodes')}</Text>
              {loadingEps && <ActivityIndicator size="small" color={Colors.dark.primary} style={{marginLeft: 8}} />}

              {seasonKeys.length >= 1 && (
                <TouchableOpacity
                  style={S.seasonBtn}
                  onPress={() => setShowSeasonDlg(true)}
                >
                  <Image source={require('../../assets/icons/tv.png')} style={[S.seasonBtnIcon, {tintColor: Colors.dark.primary}]} />
                  <Text style={S.seasonBtnTxt}>{t('season')} {selSeason}</Text>
                  <Text style={S.seasonBtnArrow}>&#9662;</Text>
                </TouchableOpacity>
              )}
            </View>

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
                const isExtractingThis = extractingEpUrl === epUrl;
                return (
                  <TouchableOpacity
                    key={`ep-${selSeason}-${idx}`}
                    style={[S.epRow, isExtractingThis && S.epRowDisabled]}
                    onPress={() => handlePlayEpisode(epUrl, idx + 1)}
                    disabled={extracting}
                    activeOpacity={0.75}
                  >
                    <View style={[S.epNumCircle, isExtractingThis && S.epNumActive]}>
                      <Text style={[S.epNum, isExtractingThis && S.epNumActiveTxt]}>{idx + 1}</Text>
                    </View>
                    <View style={S.epInfo}>
                      <Text style={S.epTitle}>{t('episode')} {idx + 1}</Text>
                      {epDuration && epDuration !== 'min\u062F' ? (
                        <Text style={S.epDur}>{epDuration}</Text>
                      ) : null}
                    </View>
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
                <Image source={require('../../assets/icons/files.png')} style={{width: 32, height: 32, tintColor: Colors.dark.textMuted}} />
                <Text style={S.noEpsTxt}>{t('not_available')}</Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* ── On-device WebView extractor (hidden) ── */}
      {extractorUrl && (
        <VideoExtractor
          pageUrl={extractorUrl}
          onExtracted={handleExtracted}
          onError={handleExtractError}
        />
      )}

      {/* ── Full-screen extracting overlay ── */}
      {extracting && (
        <View style={S.extractOverlay}>
          <View style={S.extractCard}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
            <Text style={S.extractStatus} numberOfLines={2}>
              {STATUS_MSGS[statusIdx]}
            </Text>
            <TouchableOpacity
              style={S.extractCancel}
              onPress={() => {
                stopStatusTimer();
                setExtracting(false);
                setExtractingEpUrl(null);
                setExtractorUrl(null);
                setExtractError(t('video_unavailable'));
              }}
            >
              <Text style={S.extractCancelTxt}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Season picker modal (centered popup) ── */}
      <Modal
        visible={showSeasonDlg}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSeasonDlg(false)}
      >
        <TouchableOpacity
          style={S.seasonModalOverlay}
          activeOpacity={1}
          onPress={() => setShowSeasonDlg(false)}
        >
          <View style={S.seasonModalContent}>
            <View style={S.seasonModalHeader}>
              <Text style={S.seasonModalTitle}>{t('select_season')}</Text>
              <TouchableOpacity onPress={() => setShowSeasonDlg(false)}>
                <Text style={{color: Colors.dark.textMuted, fontSize: 20}}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={seasonKeys}
              keyExtractor={s => s}
              renderItem={({item: sk}) => (
                <TouchableOpacity
                  style={[S.seasonModalOption, selSeason === sk && S.seasonModalOptionActive]}
                  onPress={() => { setSelSeason(sk); setShowSeasonDlg(false); }}
                >
                  <Text style={[S.seasonModalOptionText, selSeason === sk && S.seasonModalOptionTextActive]}>
                    {t('season')} {sk}
                  </Text>
                  {selSeason === sk && (
                    <Text style={{color: Colors.dark.primary, fontSize: 16}}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const S = StyleSheet.create({
  container:  {flex: 1, backgroundColor: Colors.dark.background},
  scroll:     {paddingTop: 0},
  fallback:   {color: Colors.dark.textMuted, textAlign: 'center', fontFamily: 'Rubik', marginTop: 40},

  topNav:     {flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12},
  navBtn:     {width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.dark.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.dark.border},
  iconNav:    {width: 20, height: 20, tintColor: Colors.dark.text},
  iconMed:    {width: 20, height: 20},

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

  posterWrap:        {alignSelf: 'center', marginBottom: 16},
  poster:            {width: POSTER_W, height: POSTER_H, borderRadius: 16, backgroundColor: Colors.dark.surfaceLight, elevation: 14, shadowColor: '#000', shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.55, shadowRadius: 16},
  posterPlaceholder: {justifyContent: 'center', alignItems: 'center'},

  catPill:    {backgroundColor: Colors.dark.primaryLight, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16},
  catPillTxt: {color: '#000', fontSize: 12, fontWeight: '700', fontFamily: 'Rubik'},
  fmtPill:    {backgroundColor: Colors.dark.surface, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: Colors.dark.border},
  fmtPillTxt: {color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: 'Rubik'},
  vlPill:     {backgroundColor: `${Colors.dark.warning}22`, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: `${Colors.dark.warning}44`},
  vlPillTxt:  {color: Colors.dark.warning, fontSize: 12, fontWeight: '700', fontFamily: 'Rubik'},
  pillsRow:   {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 14, paddingHorizontal: 16},
  pill:       {flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.dark.surface, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 22, gap: 5, borderWidth: 1, borderColor: Colors.dark.border},
  pillIcon:   {width: 13, height: 13},
  pillTxt:    {color: Colors.dark.text, fontSize: 13, fontWeight: '700', fontFamily: 'Rubik'},
  pillSub:    {color: Colors.dark.textMuted, fontSize: 11, fontFamily: 'Rubik'},
  statusOngoing: {backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary},
  statusComplete:{backgroundColor: Colors.dark.success, borderColor: Colors.dark.success},
  statusTxt:     {fontSize: 12, fontWeight: '600', fontFamily: 'Rubik'},

  countRow:      {flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 14, paddingHorizontal: 16},
  countBadge:    {flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.dark.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: Colors.dark.border, gap: 6},
  countBadgeText:{color: Colors.dark.textSecondary, fontSize: 12, fontWeight: '600', fontFamily: 'Rubik'},

  actions:       {flexDirection: 'row', paddingHorizontal: 18, marginBottom: 12, gap: 12},
  playBtn:       {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 54, borderRadius: 16, backgroundColor: Colors.dark.primary, gap: 8, elevation: 8, shadowColor: Colors.dark.primary, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.5, shadowRadius: 10},
  playBtnBusy:   {backgroundColor: `${Colors.dark.primary}CC`},
  playBtnTxt:    {color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'Rubik', flexShrink: 1},
  dlBtn:         {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 54, borderRadius: 16, backgroundColor: Colors.dark.surface, gap: 8, borderWidth: 1.5, borderColor: Colors.dark.accentLight},
  dlBtnTxt:      {color: Colors.dark.accentLight, fontSize: 15, fontWeight: '700', fontFamily: 'Rubik'},

  errBanner: {marginHorizontal: 18, marginBottom: 12, backgroundColor: `${Colors.dark.error}16`, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: `${Colors.dark.error}30`, gap: 10},
  errTxt:    {flex: 1, color: Colors.dark.error, fontSize: 13, fontFamily: 'Rubik'},
  retryBtn:  {flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: `${Colors.dark.primary}22`},
  retryTxt:  {color: Colors.dark.primary, fontSize: 13, fontWeight: '700', fontFamily: 'Rubik'},

  descBox:   {marginHorizontal: 16, marginBottom: 14, backgroundColor: Colors.dark.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.dark.border},
  descLabel: {color: Colors.dark.text, fontSize: 14, fontWeight: '700', fontFamily: 'Rubik', marginBottom: 8},
  descTxt:   {color: Colors.dark.textSecondary, fontSize: 14, lineHeight: 22, fontFamily: 'Rubik'},

  infoTable: {marginHorizontal: 16, backgroundColor: Colors.dark.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.dark.border, marginBottom: 20},

  epsSection:      {marginHorizontal: 16, marginBottom: 20, backgroundColor: Colors.dark.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.dark.border},
  epsHeader:       {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.dark.border, gap: 8},
  sectionIcon:     {width: 20, height: 20},
  epsTitle:        {flex: 1, color: Colors.dark.text, fontSize: 16, fontWeight: '700', fontFamily: 'Rubik'},
  seasonBtn:       {flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: `${Colors.dark.primary}20`, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: `${Colors.dark.primary}40`},
  seasonBtnIcon:   {width: 14, height: 14},
  seasonBtnTxt:    {color: Colors.dark.primary, fontSize: 13, fontWeight: '700', fontFamily: 'Rubik'},
  seasonBtnArrow:  {color: Colors.dark.primary, fontSize: 10},
  seasonPosterWrap: {paddingVertical: 10, alignItems: 'center'},
  seasonPoster:     {width: 120, height: 180, borderRadius: 10, backgroundColor: Colors.dark.surfaceLight},
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

  // Season selector – centered popup
  seasonModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  seasonModalContent: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 24,
    padding: 20,
    width: '80%',
    maxWidth: 320,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  seasonModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  seasonModalTitle: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  seasonModalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  seasonModalOptionActive: {
    backgroundColor: `${Colors.dark.primary}15`,
    borderRadius: 8,
  },
  seasonModalOptionText: {
    color: Colors.dark.textSecondary,
    fontSize: 16,
    fontFamily: 'Rubik',
  },
  seasonModalOptionTextActive: {
    color: Colors.dark.primary,
    fontWeight: '700',
  },
});

export default DetailsScreen;