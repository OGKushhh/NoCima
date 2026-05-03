/**
 * HomeScreen — Rework
 *
 * Sections (all from local loaded data — no trending/featured JSON):
 *   1. Hero banner   — featured item (first movie with a poster)
 *   2. Most Viewed   — sorted by Views field desc, async-enriched from API
 *   3. Latest Movies — newest ReleaseDate first
 *   4. Latest Anime  — newest from anime category
 *   5. Latest Series — newest from series category
 *   6. K-Drama       — newest from asian-series
 *   7. TV Shows      — newest from tvshows
 *
 * Search: icon top-right → full-screen overlay, searches all cached categories.
 * Pull-to-refresh: reloads all categories fresh.
 * Performance: each HRow is memoized and compares by first item ID + length.
 */

import React, {useState, useCallback, useMemo, useRef, memo, useEffect} from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, StatusBar,
  TouchableOpacity, Image, TextInput, ActivityIndicator,
  Dimensions,
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

const {width: SW} = Dimensions.get('window');
const H_CARD = 148;

// ─────────────────────────────────────────────────────────────────────────────
// Memoised horizontal row — only re-renders when data actually changes
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
// Hero Banner — first item with a poster
// ─────────────────────────────────────────────────────────────────────────────
interface HeroBannerProps {
  item: ContentItem;
  onPress: () => void;
}

const HeroBanner = memo<HeroBannerProps>(({item, onPress}) => {
  const {t} = useTranslation();
  const year = (item as any).ReleaseDate || (item as any).Year || '';
  const rating = (item as any).Rating || '';

  return (
    <TouchableOpacity style={S.hero} onPress={onPress} activeOpacity={0.9}>
      <FastImage
        source={{uri: item['Image Source']}}
        style={S.heroBg}
        resizeMode={FastImage.resizeMode.cover}
      />
      {/* Dark gradient at bottom */}
      <View style={S.heroGradient} />

      {/* Content */}
      <View style={S.heroContent}>
        {/* Badges */}
        <View style={S.heroBadges}>
          {item.Format ? (
            <View style={S.heroQBadge}>
              <Text style={S.heroQTxt}>{item.Format.split(' ')[0]}</Text>
            </View>
          ) : null}
          {rating ? (
            <View style={S.heroRatingBadge}>
              <Image
                source={require('../../assets/icons/star.png')}
                style={{width: 11, height: 11, tintColor: '#FFD700'}}
              />
              <Text style={S.heroRating}>{rating}</Text>
            </View>
          ) : null}
        </View>

        <Text style={S.heroTitle} numberOfLines={2}>{item.Title}</Text>
        <Text style={S.heroMeta}>
          {[item.Category, year].filter(Boolean).join('  •  ')}
        </Text>

        <TouchableOpacity style={S.heroPlayBtn} onPress={onPress}>
          <Image
            source={require('../../assets/icons/play.png')}
            style={{width: 16, height: 16, tintColor: '#fff', marginRight: 6}}
          />
          <Text style={S.heroPlayTxt}>{t('play')}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});
HeroBanner.displayName = 'HeroBanner';

// ─────────────────────────────────────────────────────────────────────────────
// Sort helpers
// ─────────────────────────────────────────────────────────────────────────────
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
// HomeScreen
// ─────────────────────────────────────────────────────────────────────────────
export const HomeScreen: React.FC = () => {
  const {t} = useTranslation();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();

  // Data
  const [movies,  setMovies]  = useState<ContentItem[]>([]);
  const [anime,   setAnime]   = useState<ContentItem[]>([]);
  const [series,  setSeries]  = useState<ContentItem[]>([]);
  const [kdrama,  setKdrama]  = useState<ContentItem[]>([]);
  const [tvshows, setTvshows] = useState<ContentItem[]>([]);
  const [mostViewed, setMostViewed] = useState<ContentItem[]>([]);

  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

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

      const [mov, ani, ser, kd, tv] = await Promise.all([
        loadCategory('movies',       force).catch(() => null),
        loadCategory('anime',        force).catch(() => null),
        loadCategory('series',       force).catch(() => null),
        loadCategory('asian-series', force).catch(() => null),
        loadCategory('tvshows',      force).catch(() => null),
      ] as Promise<any>[]);

      const movArr = mov  ? getMoviesArray(mov  as any) : [];
      const aniArr = ani  ? getMoviesArray(ani  as any) : [];
      const serArr = ser  ? getMoviesArray(ser  as any) : [];
      const kdArr  = kd   ? getMoviesArray(kd   as any) : [];
      const tvArr  = tv   ? getMoviesArray(tv   as any) : [];

      // Sort newest first for all rows
      const movSorted = byYearDesc(movArr);
      const aniSorted = byYearDesc(aniArr);
      const serSorted = byYearDesc(serArr);
      const kdSorted  = byYearDesc(kdArr);
      const tvSorted  = byYearDesc(tvArr);

      setMovies(movSorted);
      setAnime(aniSorted.slice(0, 20));
      setSeries(serSorted.slice(0, 20));
      setKdrama(kdSorted.slice(0, 20));
      setTvshows(tvSorted.slice(0, 20));

      // Most-viewed: prefer items with embedded Views > 0, else reverse-sorted
      const allItems = [...movArr, ...aniArr, ...serArr, ...kdArr, ...tvArr];
      const withViews = allItems.filter(i => parseInt((i as any).Views || '0', 10) > 0);
      setMostViewed(
        withViews.length >= 4
          ? byViewsDesc(withViews).slice(0, 20)
          : byYearDesc(movArr).slice(0, 20),
      );

      // Async: enrich first 30 movies with live view counts then re-sort
      enrichViews(movArr.slice(0, 30), 'movies').then(enriched => {
        const live = enriched.filter(i => parseInt((i as any).Views || '0', 10) > 0);
        if (live.length >= 4) setMostViewed(byViewsDesc(live).slice(0, 20));
      }).catch(() => {});

      // Sync pending view counts (fire-and-forget)
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
  const enrichViews = async (items: ContentItem[], category: string): Promise<ContentItem[]> => {
    return Promise.all(
      items.map(async item => {
        try {
          const v = await getViewCount(category, item.id);
          if (v > 0) return {...item, Views: String(v)};
          return item;
        } catch {
          return item;
        }
      }),
    );
  };

  // ── Navigation ────────────────────────────────────────────────────
  const goDetails  = useCallback((item: ContentItem) => nav.navigate('Details', {item}), [nav]);
  const goCat      = useCallback((cat: string) => nav.navigate('Category', {category: cat}), [nav]);

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

  // ── Derived ───────────────────────────────────────────────────────
  const latestMovies = useMemo(() => movies.slice(0, 20), [movies]);

  // Hero = first movie with a poster image
  const heroItem = useMemo(() =>
    movies.find(m => !!m['Image Source']) ?? null,
  [movies]);

  if (loading) return <LoadingSpinner />;
  if (error && !movies.length) return <ErrorView message={error} onRetry={() => loadData(true)} />;

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
            {/* ── Top bar ── */}
            <View style={[S.topBar, {paddingTop: insets.top + 8}]}>
              <Text style={S.appName}>AbdoBest</Text>
              <TouchableOpacity style={S.searchBtn} onPress={() => setSearchOpen(true)}>
                <Image
                  source={require('../../assets/icons/search.png')}
                  style={[S.searchBtnIcon, {tintColor: Colors.dark.text}]}
                />
              </TouchableOpacity>
            </View>

            {/* ── Hero banner ── */}
            {heroItem && (
              <HeroBanner item={heroItem} onPress={() => goDetails(heroItem)} />
            )}

            {/* ── Content rows ── */}
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
const S = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.dark.background},

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18, paddingBottom: 10,
  },
  appName: {
    color: Colors.dark.primary, fontSize: 26,
    fontWeight: '900', fontFamily: 'Rubik', letterSpacing: 0.3,
  },
  searchBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    justifyContent: 'center', alignItems: 'center',
  },
  searchBtnIcon: {width: 22, height: 22},

  // Hero
  hero: {
    marginHorizontal: 16, marginBottom: 6,
    borderRadius: 18, overflow: 'hidden',
    height: SW * 0.56,
    elevation: 10, shadowColor: '#000',
    shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.45, shadowRadius: 12,
  },
  heroBg: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  },
  heroGradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: '65%',
    backgroundColor: 'rgba(0,0,0,0.0)',
    // Simulated gradient via multiple overlays (no LinearGradient needed)
  },
  heroContent: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  heroBadges: {flexDirection: 'row', gap: 6, marginBottom: 6},
  heroQBadge: {
    backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 7,
    paddingVertical: 3, borderRadius: 5,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)',
  },
  heroQTxt: {color: '#fff', fontSize: 10, fontWeight: '700', fontFamily: 'Rubik'},
  heroRatingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5,
  },
  heroRating: {color: '#FFD700', fontSize: 10, fontWeight: '700', fontFamily: 'Rubik'},
  heroTitle: {
    color: '#fff', fontSize: 18, fontWeight: '800',
    fontFamily: 'Rubik', marginBottom: 4,
  },
  heroMeta: {
    color: 'rgba(255,255,255,0.65)', fontSize: 12,
    fontFamily: 'Rubik', marginBottom: 10,
  },
  heroPlayBtn: {
    flexDirection: 'row', alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 10,
  },
  heroPlayTxt: {color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'Rubik'},

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
  noResultsTxt:{color: Colors.dark.textMuted, fontSize: 15, fontFamily: 'Rubik'},
});
