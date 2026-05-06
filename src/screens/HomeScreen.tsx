/**
 * HomeScreen
 *
 * Hero banner changes:
 *  - No full-card opacity layer. The poster fills the card edge-to-edge, clean.
 *  - Title, meta, genres and play button each live in their own floating badge /
 *    pill — same visual language as the quality badge.
 *  - Rotates through 5 items, one picked from each of 5 randomly-chosen
 *    categories, switching every 5 seconds with a crossfade + dot indicator.
 *  - Adding more categories in the future is automatic — the random sampler
 *    draws from ALL_HERO_CATEGORIES and caps at 5.
 */

import React, {
  useState, useCallback, useMemo, useRef, memo,
  useEffect,
} from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, StatusBar,
  TouchableOpacity, Image, TextInput, ActivityIndicator,
  Dimensions, Animated,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import FastImage from 'react-native-fast-image';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';
import {loadCategory, getMoviesArray, searchContent} from '../services/metadataService';
import {getViewCount} from '../services/api';
import {trySyncViews} from '../services/viewService';
import {ContentItem} from '../types';
import {MovieCard, CARD_WIDTH} from '../components/MovieCard';
import {SectionHeader} from '../components/SectionHeader';
import {LoadingSpinner} from '../components/LoadingSpinner';
import {ErrorView} from '../components/ErrorView';
import {Colors} from '../theme/colors';
import AdsterraBanner from '../ads/AdsterraBanner';

const {width: SW} = Dimensions.get('window');
const H_CARD      = 148;
const HERO_H      = SW * 0.62;
const ROTATE_MS   = 5000;

// All categories eligible for the hero rotation.
// Add new category keys here as the app grows — the sampler caps at 5 automatically.
const ALL_HERO_CATEGORIES = [
  'movies',
  'anime',
  'series',
  'tvshows',
  'asian-series',
  'dubbed-movies',
  'hindi',
  'asian-movies',
  'anime-movies',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Shuffle an array (Fisher-Yates) and return first `n` items. */
function sampleN<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

const byYearDesc = (arr: ContentItem[]) =>
  [...arr].sort((a, b) => {
    const ya = parseInt((a as any).ReleaseDate || (a as any).Year || '0', 10);
    const yb = parseInt((b as any).ReleaseDate || (b as any).Year || '0', 10);
    return yb - ya;
  });

const byViewsDesc = (arr: ContentItem[]) =>
  [...arr].sort((a, b) => {
    const va = parseInt((a as any).Views || '0', 10);
    const vb = parseInt((b as any).Views || '0', 10);
    return vb - va;
  });

// ─────────────────────────────────────────────────────────────────────────────
// HRow – memoised horizontal content row
// ─────────────────────────────────────────────────────────────────────────────
interface HRowProps {
  title: string;
  items: ContentItem[];
  onSeeAll?: () => void;
  onPress: (item: ContentItem) => void;
  cardWidth?: number;
}

const HRow = memo<HRowProps>(
  ({title, items, onSeeAll, onPress, cardWidth = H_CARD}) => {
    if (!items.length) return null;
    return (
      <View style={S.section}>
        <SectionHeader title={title} onSeeAll={onSeeAll} />
        <FlatList
          data={items}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={S.hList}
          keyExtractor={i => i.id}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={7}
          removeClippedSubviews
          getItemLayout={(_, idx) => ({
            length: cardWidth + 10,
            offset: (cardWidth + 10) * idx,
            index: idx,
          })}
          renderItem={({item}) => (
            <View style={{marginRight: 10}}>
              <MovieCard item={item} onPress={onPress} width={cardWidth} />
            </View>
          )}
        />
      </View>
    );
  },
  (p, n) =>
    p.title === n.title &&
    p.items.length === n.items.length &&
    p.items[0]?.id === n.items[0]?.id,
);
HRow.displayName = 'HRow';

// ─────────────────────────────────────────────────────────────────────────────
// HeroBanner — rotating, no opacity overlay, floating badges
// ─────────────────────────────────────────────────────────────────────────────
interface HeroBannerProps {
  items: ContentItem[];   // exactly 5 (or fewer if data is thin)
  onPress: (item: ContentItem) => void;
}

const HeroBanner = memo<HeroBannerProps>(({items, onPress}) => {
  const {t, i18n} = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';

  const [activeIdx, setActiveIdx] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-rotate every 5 s with a quick crossfade
  useEffect(() => {
    if (items.length <= 1) return;

    const advance = () => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }).start(() => {
        setActiveIdx(prev => (prev + 1) % items.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
        }).start();
      });
    };

    timerRef.current = setInterval(advance, ROTATE_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [items.length]);

  if (!items.length) return null;

  const item  = items[activeIdx];
  const raw   = item as any;

  // Year
  const rawYear = String(raw.ReleaseDate || raw.Year || '');
  const year = /^\d{8}$/.test(rawYear)
    ? rawYear.slice(0, 4)
    : rawYear.slice(0, 4) || rawYear;

  // Badges
  const quality = item.Format ? item.Format.split(' ')[0] : '';
  const rating  = raw.Rating || '';
  const runtime = item.Runtime
    ? (Math.floor(item.Runtime / 60) > 0
        ? `${Math.floor(item.Runtime / 60)}h ${item.Runtime % 60}m`
        : `${item.Runtime}m`)
    : null;

  // Genre chips — max 3
  const genres = (lang === 'ar' ? item.GenresAr : item.Genres)?.slice(0, 3) ?? [];

  // Clean title
  const cleanTitle = item.Title
    .replace(/\s*(فيلم|مسلسل|مترجم|اون لاين|أنمي|انمي|برنامج)\s*/gi, ' ')
    .trim();

  // Tap on the banner advances manually and resets the timer
  const handleTap = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    onPress(item);
  };

  return (
    <TouchableOpacity style={S.hero} onPress={handleTap} activeOpacity={0.92}>
      {/* ── Full-bleed poster — no overlay ── */}
      <Animated.View style={[StyleSheet.absoluteFill, {opacity: fadeAnim}]}>
        <FastImage
          source={{uri: item['Image Source']}}
          style={StyleSheet.absoluteFill}
          resizeMode={FastImage.resizeMode.cover}
        />
      </Animated.View>

      {/* ── TOP ROW: rating (left) + quality (right) ── */}
      {rating ? (
        <View style={S.heroBadgeTopLeft}>
          <Image
            source={require('../../assets/icons/star.png')}
            style={{width: 11, height: 11, tintColor: '#FFD700'}}
          />
          <Text style={S.heroBadgeTextGold}>{rating}</Text>
        </View>
      ) : null}

      {quality ? (
        <View style={S.heroBadgeTopRight}>
          <Text style={S.heroBadgeText}>{quality}</Text>
        </View>
      ) : null}

      {/* ── BOTTOM CLUSTER ── */}
      <View style={S.heroBottom}>

        {/* Genre pills */}
        {genres.length > 0 && (
          <View style={S.heroGenreRow}>
            {genres.map((g, i) => (
              <View key={i} style={S.heroGenrePill}>
                <Text style={S.heroGenreTxt}>{g}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Title badge */}
        <View style={S.heroTitleBadge}>
          <Text style={S.heroTitleTxt} numberOfLines={2}>{cleanTitle}</Text>
        </View>

        {/* Meta row: year · runtime — each its own small pill */}
        {(year || runtime) && (
          <View style={S.heroMetaRow}>
            {year ? (
              <View style={S.heroMetaPill}>
                <Text style={S.heroMetaTxt}>{year}</Text>
              </View>
            ) : null}
            {runtime ? (
              <View style={S.heroMetaPill}>
                <Text style={S.heroMetaTxt}>{runtime}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Play button + dot indicators on the same row */}
        <View style={S.heroActionRow}>
          <TouchableOpacity style={S.heroPlayBtn} onPress={handleTap} activeOpacity={0.85}>
            <Text style={S.heroPlayIcon}>▶</Text>
            <Text style={S.heroPlayTxt}>{t('play')}</Text>
          </TouchableOpacity>

          {/* Dot indicators */}
          {items.length > 1 && (
            <View style={S.dotsRow}>
              {items.map((_, i) => (
                <View
                  key={i}
                  style={[S.dot, i === activeIdx && S.dotActive]}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});
HeroBanner.displayName = 'HeroBanner';

// ─────────────────────────────────────────────────────────────────────────────
// HomeScreen
// ─────────────────────────────────────────────────────────────────────────────
export const HomeScreen: React.FC = () => {
  const {t} = useTranslation();
  const nav  = useNavigation<any>();
  const insets = useSafeAreaInsets();

  // Per-category data
  const [categoryData, setCategoryData] = useState<
    Record<string, ContentItem[]>
  >({});
  const [mostViewed, setMostViewed] = useState<ContentItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // The 5 randomly-chosen categories for the hero rotation (decided once per load)
  const heroCatsRef = useRef<string[]>([]);

  // Search
  const [searchOpen,    setSearchOpen]    = useState(false);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<ContentItem[]>([]);
  const [searching,     setSearching]     = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── Load ──────────────────────────────────────────────────────────
  const loadData = useCallback(async (force = false) => {
    try {
      setError(null);

      // Pick 5 random categories for the hero (stable per load, not per render)
      const heroKeys = sampleN(ALL_HERO_CATEGORIES, 5);
      heroCatsRef.current = heroKeys;

      // Load all categories we need for rows + potential hero items
      const allNeeded = Array.from(new Set([
        ...heroKeys,
        'movies', 'anime', 'series', 'asian-series', 'tvshows',
      ]));

      const results = await Promise.all(
        allNeeded.map(cat =>
          loadCategory(cat as any, force)
            .then(d => ({cat, items: d ? getMoviesArray(d as any) : []}))
            .catch(() => ({cat, items: [] as ContentItem[]})),
        ),
      );

      const map: Record<string, ContentItem[]> = {};
      results.forEach(({cat, items}) => {
        map[cat] = byYearDesc(items);
      });

      setCategoryData(map);

      // Most-viewed
      const allItems = Object.values(map).flat();
      const withViews = allItems.filter(i => parseInt((i as any).Views || '0', 10) > 0);
      setMostViewed(
        withViews.length >= 4
          ? byViewsDesc(withViews).slice(0, 20)
          : (map['movies'] ?? []).slice(0, 20),
      );

      // Async view enrichment for movies
      const movArr = map['movies'] ?? [];
      enrichViews(movArr.slice(0, 30), 'movies').then(enriched => {
        const live = enriched.filter(i => parseInt((i as any).Views || '0', 10) > 0);
        if (live.length >= 4) setMostViewed(byViewsDesc(live).slice(0, 20));
      }).catch(() => {});

      trySyncViews().catch(() => {});
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(true); }, [loadData]);

  // ── View enrichment ───────────────────────────────────────────────
  const enrichViews = async (items: ContentItem[], category: string): Promise<ContentItem[]> =>
    Promise.all(
      items.map(async item => {
        try {
          const v = await getViewCount(category, item.id);
          if (v > 0) return {...item, Views: String(v)};
          return item;
        } catch { return item; }
      }),
    );

  // ── Navigation ────────────────────────────────────────────────────
  const goDetails = useCallback((item: ContentItem) => nav.navigate('Details', {item}), [nav]);
  const goCat     = useCallback((cat: string) => nav.navigate('Category', {category: cat}), [nav]);

  // ── Search ────────────────────────────────────────────────────────
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); setSearching(false); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const r = await searchContent(q).catch(() => []);
      setSearchResults(r);
      setSearching(false);
    }, 380);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  // ── Hero items: newest item with a poster from each of the 5 chosen cats ──
  const heroItems = useMemo(() => {
    return heroCatsRef.current
      .map(cat => {
        const items = categoryData[cat] ?? [];
        return items.find(m => !!m['Image Source']) ?? null;
      })
      .filter((x): x is ContentItem => x !== null);
  }, [categoryData]);

  // ── Row slices ────────────────────────────────────────────────────
  const latestMovies = useMemo(() => (categoryData['movies'] ?? []).slice(0, 20), [categoryData]);
  const anime        = useMemo(() => (categoryData['anime']  ?? []).slice(0, 20), [categoryData]);
  const series       = useMemo(() => (categoryData['series'] ?? []).slice(0, 20), [categoryData]);
  const kdrama       = useMemo(() => (categoryData['asian-series'] ?? []).slice(0, 20), [categoryData]);
  const tvshows      = useMemo(() => (categoryData['tvshows'] ?? []).slice(0, 20), [categoryData]);

  if (loading) return <LoadingSpinner />;
  if (error && !Object.keys(categoryData).length)
    return <ErrorView message={error} onRetry={() => loadData(true)} />;

  // ── Search overlay ────────────────────────────────────────────────
  if (searchOpen) {
    return (
      <View style={S.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />
        <View style={[S.searchHeader, {paddingTop: insets.top + 8}]}>
          <View style={S.searchBox}>
            <Image
              source={require('../../assets/icons/search.png')}
              style={[S.searchIcon, {tintColor: Colors.dark.textMuted}]}
            />
            <TextInput
              style={S.searchInput}
              placeholder={t('search_placeholder')}
              placeholderTextColor={Colors.dark.textMuted}
              value={searchQuery}
              onChangeText={handleSearch}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
                <Text style={S.clearX}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={closeSearch}>
            <Text style={S.cancelTxt}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>

        {searching ? (
          <View style={S.center}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
          </View>
        ) : searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            numColumns={2}
            keyExtractor={i => i.id}
            contentContainerStyle={S.searchGrid}
            columnWrapperStyle={S.row}
            showsVerticalScrollIndicator={false}
            renderItem={({item}) => <MovieCard item={item} onPress={goDetails} />}
          />
        ) : searchQuery.length > 0 ? (
          <View style={S.center}>
            <Text style={S.noResultsTxt}>{t('no_results')}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  // ── Main home ─────────────────────────────────────────────────────
  return (
    <View style={S.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />

      <FlatList
        data={[]}
        ListHeaderComponent={
          <View>
            {/* Top bar */}
            <View style={[S.topBar, {paddingTop: insets.top + 8}]}>
              <Text style={S.appName}>
                <Text style={{color: '#FF4500'}}>Abdo</Text>
                <Text style={{color: '#1565C0'}}>Best</Text>
              </Text>
              <TouchableOpacity style={S.searchBtn} onPress={() => setSearchOpen(true)}>
                <Image
                  source={require('../../assets/icons/search.png')}
                  style={[S.searchBtnIcon, {tintColor: Colors.dark.text}]}
                />
              </TouchableOpacity>
            </View>

            {/* Hero banner */}
            {heroItems.length > 0 && (
              <HeroBanner items={heroItems} onPress={goDetails} />
            )}

            {/* Adsterra native banner — shown after hero */}
            <AdsterraBanner visible type="native" height={90} />

            {/* Content rows */}
            <HRow
              title={t('most_viewed')}
              items={mostViewed}
              onSeeAll={() => goCat('movies')}
              onPress={goDetails}
            />
            <HRow
              title={t('latest_movies')}
              items={latestMovies}
              onSeeAll={() => goCat('movies')}
              onPress={goDetails}
            />
            <HRow
              title={t('anime')}
              items={anime}
              onSeeAll={() => goCat('anime')}
              onPress={goDetails}
            />
            <HRow
              title={t('series')}
              items={series}
              onSeeAll={() => goCat('series')}
              onPress={goDetails}
            />
            {kdrama.length > 0 && (
              <HRow
                title={t('asian_series')}
                items={kdrama}
                onSeeAll={() => goCat('asian-series')}
                onPress={goDetails}
              />
            )}
            {tvshows.length > 0 && (
              <HRow
                title={t('tvshows')}
                items={tvshows}
                onSeeAll={() => goCat('tvshows')}
                onPress={goDetails}
              />
            )}
          </View>
        }
        renderItem={() => null}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.dark.primary}
            colors={[Colors.dark.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{paddingBottom: insets.bottom + 90}}
      />
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const BADGE_BG = 'rgba(0,0,0,0.62)';

const S = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.dark.background},

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18, paddingBottom: 10,
  },
  appName: {
    fontSize: 26,
    fontWeight: '900', fontFamily: 'Rubik', letterSpacing: 0.3,
  },
  searchBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  searchBtnIcon: {width: 22, height: 22},

  // ── Hero ──────────────────────────────────────────────────────────
  hero: {
    marginHorizontal: 16, marginBottom: 10,
    borderRadius: 20, overflow: 'hidden',
    height: HERO_H,
    elevation: 12, shadowColor: '#000',
    shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.5, shadowRadius: 14,
  },

  // Shared badge base
  heroBadge: {
    borderRadius: 8,
    paddingHorizontal: 9, paddingVertical: 5,
    backgroundColor: BADGE_BG,
    // Frosted-glass feel via border
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)',
  },
  heroBadgeText: {
    color: '#fff', fontSize: 11,
    fontWeight: '700', fontFamily: 'Rubik',
  },
  heroBadgeTextGold: {
    color: '#FFD700', fontSize: 11,
    fontWeight: '700', fontFamily: 'Rubik',
  },

  // Top-left: rating
  heroBadgeTopLeft: {
    position: 'absolute', top: 12, left: 12,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5,
    backgroundColor: BADGE_BG,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)',
  },
  // Top-right: quality
  heroBadgeTopRight: {
    position: 'absolute', top: 12, right: 12,
    borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5,
    backgroundColor: BADGE_BG,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)',
  },

  // Bottom cluster
  heroBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 14, paddingBottom: 16, gap: 8,
  },

  // Genre pills
  heroGenreRow: {flexDirection: 'row', gap: 6, flexWrap: 'wrap'},
  heroGenrePill: {
    borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4,
    backgroundColor: `${Colors.dark.primary}CC`,
    borderWidth: 0.5, borderColor: `${Colors.dark.primary}80`,
  },
  heroGenreTxt: {color: '#fff', fontSize: 11, fontWeight: '600', fontFamily: 'Rubik'},

  // Title badge — slightly larger, slightly more opaque
  heroTitleBadge: {
    alignSelf: 'flex-start',
    borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7,
    backgroundColor: 'rgba(0,0,0,0.70)',
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)',
    maxWidth: '90%',
  },
  heroTitleTxt: {
    color: '#fff', fontSize: 17, fontWeight: '800',
    fontFamily: 'Rubik', lineHeight: 23,
  },

  // Meta pills row
  heroMetaRow: {flexDirection: 'row', gap: 6},
  heroMetaPill: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: BADGE_BG,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)',
  },
  heroMetaTxt: {
    color: 'rgba(255,255,255,0.85)', fontSize: 11,
    fontFamily: 'Rubik', fontWeight: '500',
  },

  // Play + dots on same row
  heroActionRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroPlayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 12,
    elevation: 4, shadowColor: Colors.dark.primary,
    shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.55, shadowRadius: 6,
  },
  heroPlayIcon: {color: '#fff', fontSize: 12},
  heroPlayTxt:  {color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'Rubik'},

  // Rotation dots
  dotsRow: {flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: 4},
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    width: 18, borderRadius: 3,
    backgroundColor: Colors.dark.primary,
  },

  // Content rows
  section: {marginBottom: 4},
  hList:   {paddingLeft: 14, paddingRight: 14},

  // Search overlay
  searchHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingBottom: 8, gap: 10,
  },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    borderRadius: 12, paddingHorizontal: 10,
    borderWidth: 1, borderColor: Colors.dark.border, gap: 6,
  },
  searchIcon:  {width: 16, height: 16},
  searchInput: {
    flex: 1, color: Colors.dark.text, fontSize: 14,
    paddingVertical: 10, fontFamily: 'Rubik',
  },
  clearX:     {color: Colors.dark.textMuted, fontSize: 16, padding: 4},
  cancelTxt:  {color: Colors.dark.primary, fontSize: 14, fontFamily: 'Rubik', fontWeight: '600'},
  searchGrid: {paddingHorizontal: 14, paddingBottom: 80, paddingTop: 8},
  row:        {justifyContent: 'space-between', gap: 12},
  center:     {flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60},
  noResultsTxt: {color: Colors.dark.textMuted, fontSize: 15, fontFamily: 'Rubik'},
});
