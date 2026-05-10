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
  ActivityIndicator, Share, Linking, Dimensions, StatusBar, Image,
  Modal, FlatList, ToastAndroid, Platform, Alert,
} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import FastImage from 'react-native-fast-image';
import axios from 'axios';
import {ContentItem, ArabicEpisode, ArabicEpisodeSource} from '../types';
import {recordPlay} from '../services/viewService';
import {getViewCount, getSeriesTotalViews} from '../services/api';
import {useAds} from '../ads/AdContext';
import {Colors} from '../theme/colors';
import {useTranslation} from 'react-i18next';
import {localizeGenres} from '../i18n/genres';
import {API_BASE} from '../constants/endpoints';
import {VideoExtractor} from '../components/VideoExtractor';
import AkwamExtractor from '../components/AkwamExtractor';
import {startDownload} from '../services/downloadService';
import AkwamQualityModal, {resolveQuality} from '../components/AkwamQualityModal';
import AkwamBulkDownloadModal from '../components/AkwamBulkDownloadModal';
import {getSettings} from '../storage';

const FASEL_BASE = 'https://www.fasel-hd.cam';

const {width: SW} = Dimensions.get('window');
const POSTER_W = Math.min(SW * 0.48, 200);
const POSTER_H = POSTER_W * 1.52;

// Status messages and error messages are now fully i18n via t()
// Keys: extract_status_*, extract_err_*_title, extract_err_*_body

// Map category key → i18n key for poster badge
const CAT_I18N: Record<string, string> = {
  movies:           'movies',
  'dubbed-movies':  'dubbed_movies',
  hindi:            'hindi',
  'asian-movies':   'asian_movies',
  anime:            'anime',
  'anime-movies':   'anime_movies',
  series:           'series',
  tvshows:          'tvshows',
  'asian-series':   'asian_series',
  'arabic-series':  'arabic_series',
};

// Map category key → human-readable Arabic + English label for the info table
const CAT_LABEL: Record<string, { ar: string; en: string }> = {
  movies:           { ar: 'أفلام',              en: 'Movies' },
  'dubbed-movies':  { ar: 'أفلام مدبلجة',       en: 'Dubbed Movies' },
  hindi:            { ar: 'هندي',               en: 'Hindi' },
  'asian-movies':   { ar: 'أفلام آسيوية',       en: 'Asian Movies' },
  anime:            { ar: 'أنمي',               en: 'Anime' },
  'anime-movies':   { ar: 'أفلام أنمي',         en: 'Anime Movies' },
  series:           { ar: 'مسلسلات',            en: 'Series' },
  tvshows:          { ar: 'برامج تلفزيونية',    en: 'TV Shows' },
  'asian-series':   { ar: 'مسلسلات آسيوية',    en: 'Asian Series' },
  'arabic-series':  { ar: 'مسلسلات عربية',     en: 'Arabic Series' },
};

// ── Info table row ───────────────────────────────────────────────────
interface InfoRowProps {
  label: string;
  value: string;
  accent?: boolean;
  onPress?: () => void;
}
const InfoRow: React.FC<InfoRowProps> = ({label, value, accent, onPress}) => (
  <TouchableOpacity
    style={rowS.row}
    onPress={onPress}
    disabled={!onPress}
    activeOpacity={onPress ? 0.6 : 1}>
    <Text style={rowS.label}>{label}</Text>
    <Text style={[rowS.value, accent && rowS.accent, !!onPress && rowS.tappable]}
      numberOfLines={3}>{value}</Text>
  </TouchableOpacity>
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
  accent:   {color: Colors.dark.accentLight},
  tappable:     {textDecorationLine: 'underline', textDecorationColor: Colors.dark.accentLight},
  genreChip:    {backgroundColor: `${Colors.dark.accentLight}20`, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: `${Colors.dark.accentLight}50`},
  genreChipTxt: {color: Colors.dark.accentLight, fontSize: 12, fontWeight: '600', fontFamily: 'Rubik'},
});

// ── Episode fetcher ──────────────────────────────────────────────────
const fetchEpisodes = async (category: string, id: string) => {
  const episodic = ['series', 'tvshows', 'asian-series', 'anime', 'arabic-series'];
  if (!episodic.includes(category)) return null;
  // arabic-series has its own dedicated endpoint (different episode structure)
  const url = category === 'arabic-series'
    ? `${API_BASE}/api/arabic-series/episodes/${id}`
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
  const {showInterstitial} = useAds();

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
  // Download mode: when true, handleExtracted starts a download instead of playing
  const downloadModeRef   = useRef(false);
  // All-servers mode: when true, VideoExtractor collects ALL servers before committing
  const allServersModeRef = useRef(false);
  const [downloading, setDownloading] = useState(false);

  // Episode state
  const [epData, setEpData] = useState<any>(null);
  const [loadingEps, setLoadingEps] = useState(false);
  const [selSeason, setSelSeason] = useState<string>('1');
  const [showSeasonDlg, setShowSeasonDlg] = useState(false);

  // Rating fetch state
  const [rating, setRating] = useState<string>(() => {
    // arabic-series has rating float directly on the item — pre-fill immediately
    const preRating = (item as any).rating ?? (item as any).Rating ?? '';
    return preRating ? String(preRating) : '';
  });
  const [ratingLoading, setRatingLoading] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);

  // Live view count (fetched from API, then bumped locally on play)
  const [liveViews, setLiveViews] = useState<number | null>(null);
  // Per-episode view counts: key = epUrl, value = count
  const [episodeViews, setEpisodeViews] = useState<Record<string, number>>({});

  const statusTimer = useRef<ReturnType<typeof setInterval>>();

  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const raw = item as any;

  const category = (item?.Category || 'movies').toLowerCase();
  const isEpisodic = ['series', 'tvshows', 'asian-series', 'anime', 'arabic-series'].includes(category);
  const isArabicSeries = category === 'arabic-series';

  // ── Arabic-series / Akwam specific state ─────────────────────────────────
  const [arabicEpisodes,   setArabicEpisodes]   = useState<ArabicEpisode[]>([]);
  const [qualityModalEp,   setQualityModalEp]   = useState<ArabicEpisode | null>(null);
  const [qualityModalMode, setQualityModalMode] = useState<'play' | 'download'>('play');
  const [showBulkDownload, setShowBulkDownload] = useState(false);
  const preferredQuality: string = isArabicSeries ? (getSettings()?.playerQuality ?? 'auto') : 'auto';

  // ── Akwam extractor state ─────────────────────────────────────────────────
  const [akwamUrl,  setAkwamUrl]  = useState<string | null>(null);
  const [akwamMode, setAkwamMode] = useState<'watch' | 'download'>('watch');
  const akwamCallbackRef = useRef<((mp4: string) => void) | null>(null);

  // ── Fetch rating ──────────────────────────────────────────────────
  const [apiVotes, setApiVotes] = useState<string>(() => {
    // arabic-series has votes directly on item
    const v = (item as any).votes;
    return v ? String(v) : '';
  });

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
          const v = data.votes || data.vote_count || data.numVotes || data.Votes || '';
          if (v) setApiVotes(String(v));
        }
      })
      .catch(() => {})
      .finally(() => setRatingLoading(false));
  }, [item?.id, category]);

  // ── Fetch live view count ─────────────────────────────────────────
  useEffect(() => {
    if (!item?.id || !category) return;
    const fetch = isEpisodic
      ? getSeriesTotalViews(category, item.id)
      : getViewCount(category, item.id);
    fetch
      .then(v => { if (v > 0) setLiveViews(v); })
      .catch(() => {});
  }, [item?.id, category, isEpisodic]);

  // ── Fetch episodes ────────────────────────────────────────────────
  useEffect(() => {
    if (!item || !isEpisodic) return;
    setLoadingEps(true);
    fetchEpisodes(category, item.id)
      .then(data => {
        // ── Arabic-series: flat episode array with sources[] per episode ──────
        if (isArabicSeries && Array.isArray(data?.episodes)) {
          setArabicEpisodes(data.episodes as ArabicEpisode[]);
          setLoadingEps(false);
          return;
        }
        // Normalize into a consistent shape:
        //   { seasons: { "1": { poster, episodes: [url, ...] }, ... } }
        //
        // The server may return any of:
        //   A) { seasons: { "1": { episodes: [...] } } }  ← series/tvshows/asian
        //   B) { seasons: { "1": [url, ...] } }           ← anime (plain array)
        //   C) { episodes: [url, ...] }                   ← flat, no seasons key
        if (data?.seasons) {
          Object.keys(data.seasons).forEach(sk => {
            if (Array.isArray(data.seasons[sk])) {
              // Case B: plain array → wrap
              data.seasons[sk] = {episodes: data.seasons[sk]};
            }
          });
        } else if (Array.isArray(data?.episodes)) {
          // Case C: flat episodes array → synthesise a season 1
          data.seasons = {'1': {episodes: data.episodes}};
          delete data.episodes;
        }
        setEpData(data);
        if (data?.seasons) setSelSeason(Object.keys(data.seasons)[0] ?? '1');
        // Fetch per-episode view counts — collect all episode URLs across all seasons
        const allEpUrls: string[] = [];
        if (data?.seasons) {
          Object.values(data.seasons).forEach((season: any) => {
            if (Array.isArray(season.episodes)) {
              allEpUrls.push(...season.episodes);
            }
          });
        } else if (Array.isArray(data?.episodes)) {
          allEpUrls.push(...data.episodes);
        }
        if (allEpUrls.length > 0) {
          Promise.allSettled(
            allEpUrls.map(epUrl =>
              getViewCount(category, epUrl)
                .then(count => ({epUrl, count}))
            )
          ).then(results => {
            const map: Record<string, number> = {};
            results.forEach(r => {
              if (r.status === 'fulfilled' && r.value.count > 0) {
                map[r.value.epUrl] = r.value.count;
              }
            });
            if (Object.keys(map).length > 0) setEpisodeViews(map);
          }).catch(() => {});
        }
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

  const formatViews = (n: number): string => {
    if (!n || n <= 0) return '';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(n);
  };

  const views = raw.Views || '';
  // Prefer live API count (updated on each play), fall back to static data field
  const displayViews = liveViews !== null
    ? formatViews(liveViews)
    : views ? formatViews(Number(views.toString().replace(/,/g, '')) || 0) || views : '';
  // Format year — handles concatenated series years e.g. "20242025" → "2024-2025"
  const formatYear = (val: string | number | null | undefined): string => {
    if (!val) return '';
    const s = String(val).trim();
    if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 4);
    return s;
  };
  const year        = formatYear(raw.Year || raw.ReleaseDate);
  const releaseDate = formatYear(raw.ReleaseDate || raw.Year);
  const country     = item.Country || '';
  const language    = raw.Language || raw.language || '';
  const format      = (item.Format && item.Format !== 'N/A') ? item.Format
                      : (raw.quality && raw.quality !== 'N/A') ? raw.quality : '';
  const numEps      = raw['Number Of Episodes'] ?? raw.episode_count ?? raw.NumberOfEpisodes ?? null;
  const numEpsText  = raw['Number Of Episodes Text'] || (numEps ? String(numEps) : '');
  const epDuration  = raw.EpisodeDuration || (isArabicSeries ? raw.runtime : '') || '';
  const status      = raw.Status || '';
  const viewingLvl = raw.ViewingLevel || '';
  const runtime = isArabicSeries ? '' : (fmtRuntime(item.Runtime) || '');
  const viewType = raw.Type || '';
  // Arabic-series specific metadata
  const votes       = apiVotes;  // populated from item.votes (arabic-series) or API response
  const dateAdded   = raw.date_added ? String(raw.date_added).slice(0, 10) : '';
  const dateUpdated = raw.date_updated ? String(raw.date_updated).slice(0, 10) : '';

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
      () => setStatusIdx(p => (p + 1) % 5), 4000,
    );
  };
  const stopStatusTimer = () => clearInterval(statusTimer.current);

  // ── WebView extraction callbacks ──────────────────────────────────
  const handleExtracted = useCallback((m3u8Urls: string[]) => {
    stopStatusTimer();
    setExtractorUrl(null);
    setExtracting(false);
    const currentEpUrl = extractingEpUrl;
    setExtractingEpUrl(null);

    const primaryUrl = m3u8Urls[0];

    if (downloadModeRef.current) {
      downloadModeRef.current = false;
      const isMp4 = !primaryUrl.includes('.m3u8') && (primaryUrl.includes('.mp4') || !primaryUrl.includes('.'));
      if (!isMp4) {
        setExtractError(t('download_hls_unsupported') || 'Download is not supported for HLS streams yet.');
        return;
      }
      setDownloading(true);
      startDownload(item, primaryUrl)
        .catch(e => console.warn('[Details] startDownload error:', e))
        .finally(() => setDownloading(false));
    } else {
      if (currentEpUrl) {
        // Episode play — record with episode URL as the ID so each episode is tracked separately
        recordPlay(currentEpUrl, category);
        // Optimistically bump this episode's view count
        setEpisodeViews(prev => ({...prev, [currentEpUrl]: (prev[currentEpUrl] ?? 0) + 1}));
      } else {
        // Movie / non-episodic play
        recordPlay(item.id, category);
      }
      // Optimistically bump the displayed view count
      setLiveViews(prev => (prev ?? 0) + 1);
      nav.navigate('Player', {
        url: primaryUrl,
        servers: m3u8Urls,
        title: extractorTitleRef.current,
        contentId: item.id,
        category,
      });
    }
  }, [item, category, nav, extractingEpUrl]);

  const handleExtractError = useCallback((reason?: 'timeout' | 'load' | 'http') => {
    stopStatusTimer();
    setExtractorUrl(null);
    setExtracting(false);
    setExtractingEpUrl(null);
    const k = reason ?? 'default';
    const title = t(`extract_err_${k}_title` as any) || t('extract_err_default_title');
    const body  = t(`extract_err_${k}_body`  as any) || t('extract_err_default_body');
    setExtractError(title + '\n\n' + body);
  }, []);

  // ── Shared extraction launcher ────────────────────────────────────
  const startExtraction = useCallback((url: string, title: string, epUrl?: string, allServers = false) => {
    setShowLightbox(false);
    setExtracting(true);
    setExtractError(null);
    startStatusTimer();
    extractorTitleRef.current = title;
    lastPlayRef.current = {url, title};
    allServersModeRef.current = allServers;
    if (epUrl !== undefined) setExtractingEpUrl(epUrl);
    setExtractorUrl(url);
  }, []);

  // ── Akwam: start extraction then navigate to Player ──────────────────────
  const startAkwamWatch = useCallback((src: ArabicEpisodeSource, ep: ArabicEpisode) => {
    setExtracting(true);
    akwamCallbackRef.current = (mp4: string) => {
      setAkwamUrl(null);
      recordPlay(ep.url, category);
      setExtracting(false);
      nav.navigate('Player', {
        url: mp4,
        servers: [mp4],
        title: ep.title,
        contentId: ep.url,
        category,
      });
    };
    setAkwamMode('watch');
    setAkwamUrl(src.watch_url);
  }, [category, nav]);

  const handlePlayArabicEpisode = useCallback((ep: ArabicEpisode) => {
    // Always show quality picker — no auto-pick, keeps choice explicit
    setQualityModalMode('play');
    setQualityModalEp(ep);
  }, []);

  const handleArabicQualitySelected = useCallback((src: ArabicEpisodeSource, ep: ArabicEpisode) => {
    setQualityModalEp(null);
    if (qualityModalMode === 'download') {
      // Must resolve the shortener URL → real .mp4 via AkwamExtractor before downloading
      const epItem: ContentItem = {...item, Title: ep.title};
      akwamCallbackRef.current = (mp4: string) => {
        setAkwamUrl(null);
        startDownload(epItem, mp4)
          .then(() => showDownloadStarted(ep.title))
          .catch(e => console.warn('[Details] arabic download error:', e));
      };
      setAkwamMode('download');
      setAkwamUrl(src.download_url);
    } else {
      showInterstitial(() => startAkwamWatch(src, ep), 'play');
    }
  }, [qualityModalMode, item, showInterstitial, startAkwamWatch]);

  const handleAkwamExtracted = useCallback((mp4: string) => {
    akwamCallbackRef.current?.(mp4);
    akwamCallbackRef.current = null;
  }, []);

  const handleAkwamError = useCallback(() => {
    setAkwamUrl(null);
    setExtracting(false);
    setExtractError(t('extract_error') || 'Failed to load video. Please try again.');
    akwamCallbackRef.current = null;
  }, [t]);

  // ── Play movie (on-device extraction) ────────────────────────────
  const handlePlay = useCallback((allServers = false) => {
    // Akwam categories have no Sources[] — play is episode-based only
    // The play button for arabic-series routes through handlePlayFirst
    if (isArabicSeries) return;
    // FaselHD extraction
    const src = item.Sources?.[0];
    const url = src ?? `${FASEL_BASE}/?p=${item.id}`;
    showInterstitial(() => startExtraction(url, item.Title, undefined, allServers), 'play');
  }, [item.id, item.Title, item.Sources, isArabicSeries, startExtraction, showInterstitial]);

  // ── Download movie or first episode ──────────────────────────────
  const handleDownload = useCallback(() => {
    // Akwam downloads go through AkwamBulkDownloadModal — button already routes there
    if (isArabicSeries) return;
    // FaselHD extraction for download
    downloadModeRef.current = true;
    if (isEpisodic && currentEps.length > 0) {
      const epUrl = currentEps[0];
      const title = `${item.Title} - ${t('season')} ${selSeason} ${t('episode')} 1`;
      startExtraction(epUrl, title, epUrl);
    } else {
      startExtraction(`${FASEL_BASE}/?p=${item.id}`, item.Title);
    }
  }, [item, isArabicSeries, isEpisodic, currentEps, selSeason, t, startExtraction]);

  // ── Play first episode of current season ─────────────────────────
  const handlePlayFirst = useCallback((allServers = false) => {
    // Akwam — route to first arabic episode
    if (isArabicSeries) {
      const firstEp = arabicEpisodes[0];
      if (firstEp) handlePlayArabicEpisode(firstEp);
      return;
    }
    // FaselHD
    if (!currentEps.length) return;
    const epUrl = currentEps[0];
    const title = `${item.Title} - ${t('season')} ${selSeason} ${t('episode')} 1`;
    showInterstitial(() => startExtraction(epUrl, title, epUrl, allServers), 'play');
  }, [isArabicSeries, arabicEpisodes, handlePlayArabicEpisode, currentEps, item.Title, selSeason, t, startExtraction, showInterstitial]);

  // ── Play episode (on-device extraction) ──────────────────────────
  const handlePlayEpisode = useCallback((epUrl: string, epNum: number, allServers = false) => {
    const title = `${item.Title} - ${t('season')} ${selSeason} ${t('episode')} ${epNum}`;
    showInterstitial(() => startExtraction(epUrl, title, epUrl, allServers), 'play');
  }, [item.Title, selSeason, t, startExtraction, showInterstitial]);

  // Cache server token URLs on the item as soon as the WebView reports them.
  // Next play tap will use Sources[0] directly — skipping the main page load.
  const handleServerTokens = useCallback((urls: string[]) => {
    if (!item.Sources?.length) {
      item.Sources = urls; // mutate in place — item is a ref to the data object
    }
  }, [item]);

  // ── Retry last extraction ─────────────────────────────────────────
  const handleRetry = useCallback(() => {
    if (!lastPlayRef.current) return;
    const {url, title} = lastPlayRef.current;
    const isEp = !url.includes('/?p=');
    startExtraction(url, title, isEp ? url : undefined);
  }, [startExtraction]);

  const handleShare = () =>
    Share.share({message: `${item.Title} - AbdoBest`});

  const handleReport = () => {
    const msg = encodeURIComponent(`[Report] ${item.Title} (ID: ${item.id}, Category: ${category})\n\nالمشكلة: `);
    Linking.openURL(`https://t.me/Abdobestt?text=${msg}`);
  };

  const showComingSoon = () => {
    const msg = lang === 'ar' ? 'ميزة التحميل قريباً! 🚀' : 'Downloads coming soon! 🚀';
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      Alert.alert('', msg);
    }
  };

  const showDownloadStarted = (title: string) => {
    const msg = lang === 'ar'
      ? `⬇ بدأ التحميل: ${title}`
      : `⬇ Download started: ${title}`;
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.LONG);
    } else {
      Alert.alert('', msg);
    }
  };

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
          <View style={S.navBtnGroup}>
            <TouchableOpacity style={S.navBtn} onPress={handleReport}>
              <Image source={require('../../assets/icons/flag.png')} style={[S.iconNav, {tintColor: '#94A3B8'}]} />
            </TouchableOpacity>
            <TouchableOpacity style={S.navBtn} onPress={handleShare}>
              <Image source={require('../../assets/icons/share.png')} style={S.iconNav} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Title box ── */}
        <View style={S.titleBox}>
          <Text style={S.title} numberOfLines={4}>{item.Title}{year ? ` (${year})` : ''}</Text>
        </View>

        {/* ── Poster (no lightbox by default, but you can add one) ── */}
        <View style={S.posterWrap}>
          {(item['Image Source'] || (raw as any).Image || (raw as any).poster) ? (
            <FastImage
              source={{uri: seasonPoster || item['Image Source'] || (raw as any).Image || (raw as any).poster}}
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
          {displayViews ? (
            <View style={S.pill}>
              <Image source={require('../../assets/icons/eyes.png')} style={[S.pillIcon, {tintColor: '#fff'}]} />
              <Text style={S.pillTxt}>{displayViews}</Text>
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
          {/* Split play button: left = Quick Play, right = All Servers */}
          <View style={[S.splitBtn, (extracting || (isEpisodic && loadingEps)) && {opacity: 0.5}]}>
            {/* Left: main play action */}
            <TouchableOpacity
              style={S.splitBtnMain}
              onPress={() => isEpisodic ? handlePlayFirst(false) : handlePlay(false)}
              disabled={extracting || (isEpisodic && loadingEps)}
              activeOpacity={0.84}
            >
              {extracting && !allServersModeRef.current ? (
                <>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={S.playBtnTxt} numberOfLines={1}>
                    {[t('extract_status_connecting'),t('extract_status_loading'),t('extract_status_searching'),t('extract_status_extracting'),t('extract_status_almost')][statusIdx]}
                  </Text>
                </>
              ) : (
                <>
                  <Image source={require('../../assets/icons/flash.png')} style={{width: 18, height: 18, tintColor: '#fff'}} />
                  <Text style={S.playBtnTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                    {isEpisodic ? t('play_first_episode') : t('play')}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={S.splitDivider} />

            {/* Right: all servers action */}
            <TouchableOpacity
              style={S.splitBtnSide}
              onPress={() => isEpisodic ? handlePlayFirst(true) : handlePlay(true)}
              disabled={extracting || (isEpisodic && loadingEps)}
              activeOpacity={0.84}
            >
              {extracting && allServersModeRef.current ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Image source={require('../../assets/icons/planet-earth.png')} style={{width: 18, height: 18, tintColor: '#fff'}} />
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[S.dlBtn, (extracting || downloading) && {opacity: 0.5}]}
            activeOpacity={0.84}
            disabled={extracting || downloading}
            onPress={isArabicSeries ? () => setShowBulkDownload(true) : handleDownload}
          >
            {downloading ? (
              <ActivityIndicator color={'#fff'} size="small" />
            ) : (
              <Image source={require('../../assets/icons/download-to-storage-drive.png')} style={[S.iconMed, {tintColor: '#fff'}]} />
            )}
          </TouchableOpacity>
        </View>

        {/* ── Extract error ── */}
        {extractError ? (() => {
          const parts = extractError.split('\n\n');
          const errTitle = parts[0] || '';
          const errBody  = parts[1] || '';
          return (
            <View style={S.errBanner}>
              <View style={S.errTop}>
                <Text style={S.errTitle}>⚠️  {errTitle}</Text>
                <TouchableOpacity style={S.retryBtn} onPress={handleRetry}>
                  <Image source={require('../../assets/icons/undoreturn.png')}
                    style={{width: 13, height: 13, tintColor: Colors.dark.primary}} />
                  <Text style={S.retryTxt}>{t('retry')}</Text>
                </TouchableOpacity>
              </View>
              {errBody ? <Text style={S.errBody}>{errBody}</Text> : null}
            </View>
          );
        })() : null}

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
          {item.Category ? (() => {
            const catKey = item.Category?.toLowerCase() || '';
            const catLabel = CAT_LABEL[catKey];
            const displayValue = catLabel
              ? (lang === 'ar' ? catLabel.ar : catLabel.en)
              : (item.Category || '');
            return (
              <InfoRow
                label={t('category')}
                value={displayValue}
                accent
                onPress={() => nav.navigate('Category', {category: catKey})}
              />
            );
          })() : null}
          {/* Genre chips — each navigates to CategoryScreen filtered by that genre */}
          {genresDisplay ? (
            <View style={rowS.row}>
              <Text style={rowS.label}>{t('genres')}</Text>
              <View style={{flex: 2, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6}}>
                {(lang === 'ar'
                  ? (item.GenresAr?.length ? item.GenresAr : item.Genres)
                  : (item.Genres?.length   ? item.Genres   : item.GenresAr)
                )?.map((g: string, i: number) => (
                  <TouchableOpacity
                    key={i}
                    style={rowS.genreChip}
                    activeOpacity={0.7}
                    onPress={() => nav.navigate('Category', {
                      category: item.Category?.toLowerCase() || 'movies',
                      genre: g,
                    })}>
                    <Text style={rowS.genreChipTxt}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
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
          {votes ? <InfoRow label={t('votes')} value={Number(votes).toLocaleString()} /> : null}
          {dateAdded ? <InfoRow label={t('date_added')} value={dateAdded} /> : null}
          {dateUpdated ? <InfoRow label={t('date_updated')} value={dateUpdated} /> : null}
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
              <Text style={S.epsTitle}>{t('episodes')}</Text>
              {loadingEps && <ActivityIndicator size="small" color={Colors.dark.primary} style={{marginLeft: 8}} />}

              {/* Arabic-series: no season selector needed */}
              {!isArabicSeries && seasonKeys.length >= 1 && (
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
                    onPress={() => handlePlayEpisode(epUrl, idx + 1, false)}
                    disabled={extracting}
                    activeOpacity={0.75}
                  >
                    <View style={[S.epNumCircle, isExtractingThis && S.epNumActive]}>
                      <Text style={[S.epNum, isExtractingThis && S.epNumActiveTxt]}>{idx + 1}</Text>
                    </View>
                    <TouchableOpacity style={S.epDownloadBtn} onPress={showComingSoon}>
                      <Image source={require('../../assets/icons/download-to-storage-drive.png')} style={[S.epPlayIcon, {tintColor: Colors.dark.accent}]} />
                    </TouchableOpacity>
                    <View style={S.epInfo}>
                      <Text style={S.epTitle}>{t('episode')} {idx + 1}</Text>
                      {episodeViews[epUrl] ? (
                        <View style={S.epViewsRow}>
                          <Image source={require('../../assets/icons/eyes.png')} style={S.epViewsIcon} />
                          <Text style={S.epDur}>{formatViews(episodeViews[epUrl])}</Text>
                        </View>
                      ) : null}
                    </View>
                    {isExtractingThis ? (
                      <ActivityIndicator size="small" color={Colors.dark.primary} />
                    ) : (
                      <Image
                        source={require('../../assets/icons/flash.png')}
                        style={[S.epPlayIcon, {tintColor: '#FFD700'}]}
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

            {/* ── Arabic-series / Akwam episode list ── */}
            {isArabicSeries && arabicEpisodes.map(ep => (
              <TouchableOpacity
                key={ep.number}
                style={S.epRow}
                activeOpacity={0.75}
                onPress={() => handlePlayArabicEpisode(ep)}
              >
                <View style={S.epNumCircle}>
                  <Text style={{color: Colors.dark.primary, fontSize: 12, fontWeight: '700', fontFamily: 'Rubik'}}>
                    {ep.number}
                  </Text>
                </View>
                <View style={{flex: 1}}>
                  <Text style={S.epTitle} numberOfLines={1}>{t('episode')} {ep.number}</Text>
                </View>
                {/* Download button — opens quality picker for download */}
                <TouchableOpacity
                  style={S.epDownloadBtn}
                  activeOpacity={0.7}
                  onPress={(e) => {
                    e.stopPropagation();
                    setQualityModalMode('download');
                    setQualityModalEp(ep);
                  }}
                >
                  <Image
                    source={require('../../assets/icons/download-to-storage-drive.png')}
                    style={[S.epPlayIcon, {tintColor: Colors.dark.accent}]}
                  />
                </TouchableOpacity>
                <Image
                  source={require('../../assets/icons/flash.png')}
                  style={[S.epPlayIcon, {tintColor: '#FFD700'}]}
                />
              </TouchableOpacity>
            ))}

          </View>
        )}
      </ScrollView>

      {/* ── FaselHD WebView extractor (hidden) ── */}
      {extractorUrl && (
        <VideoExtractor
          pageUrl={extractorUrl}
          onExtracted={handleExtracted}
          onError={handleExtractError}
          onServerTokens={handleServerTokens}
          timeoutMs={40000}
          collectAllServers={allServersModeRef.current}
        />
      )}

      {/* ── Akwam WebView extractor (hidden) ── */}
      {akwamUrl && (
        <AkwamExtractor
          startUrl={akwamUrl}
          mode={akwamMode}
          onExtracted={handleAkwamExtracted}
          onError={handleAkwamError}
          timeoutMs={30000}
        />
      )}

      {/* ── Akwam quality picker ── */}
      <AkwamQualityModal
        visible={!!qualityModalEp}
        episode={qualityModalEp}
        preferredQuality={preferredQuality}
        mode={qualityModalMode}
        onSelect={handleArabicQualitySelected}
        onClose={() => setQualityModalEp(null)}
      />

      {/* ── Akwam bulk download ── */}
      <AkwamBulkDownloadModal
        visible={showBulkDownload}
        item={item}
        episodes={arabicEpisodes}
        onClose={() => setShowBulkDownload(false)}
      />

      {/* ── Full-screen extracting overlay ── */}
      {extracting && (
        <View style={S.extractOverlay}>
          <View style={S.extractCard}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
            <Text style={S.extractStatus} numberOfLines={2}>
              {[t('extract_status_connecting'),t('extract_status_loading'),t('extract_status_searching'),t('extract_status_extracting'),t('extract_status_almost')][statusIdx]}
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
  navBtn:      {width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.dark.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.dark.border},
  navBtnGroup: {flexDirection: 'row', gap: 8},
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
  // Split play button
  splitBtn:      {flex: 1, flexDirection: 'row', height: 54, borderRadius: 16, backgroundColor: Colors.dark.primary, overflow: 'hidden', elevation: 8, shadowColor: Colors.dark.primary, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.5, shadowRadius: 10},
  splitBtnMain:  {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10},
  splitBtnSide:  {width: 54, alignItems: 'center', justifyContent: 'center'},
  splitDivider:  {width: 1, marginVertical: 14, backgroundColor: 'rgba(255,255,255,0.25)'},
  dlBtn:         {width: 54, height: 54, borderRadius: 16, backgroundColor: Colors.dark.accent, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: Colors.dark.accent, shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.4, shadowRadius: 6},
  dlBtnTxt:      {color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'Rubik'},
  epDownloadBtn: {width: 38, height: 38, borderRadius: 19, backgroundColor: `${Colors.dark.accent}20`, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: `${Colors.dark.accent}40`, marginRight: 4},

  errBanner: {marginHorizontal: 18, marginBottom: 12, backgroundColor: `${Colors.dark.error}14`, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: `${Colors.dark.error}40`},
  errTop:    {flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, gap: 8},
  errTitle:  {flex: 1, color: Colors.dark.error, fontSize: 14, fontWeight: '700', fontFamily: 'Rubik'},
  errBody:   {color: Colors.dark.textSecondary, fontSize: 12, fontFamily: 'Rubik', lineHeight: 18},
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
  epViewsRow:      {flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2},
  epViewsIcon:     {width: 12, height: 12, tintColor: 'rgba(255,255,255,0.6)'},
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