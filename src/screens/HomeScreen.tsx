/**
 * HomeScreen
 *
 * Sections (loaded from all available subcategories):
 *   1. "Recommended" - random picks from all categories
 *   2. "Most Viewed"   - sorted by view counts
 *   3. "Latest Movies"  - newest movies
 *   4. "Anime"         - anime category
 *   5. "Series"        - series category
 *
 * Uses random selections from each subcategory until trending logic is ready.
 */

import React, {useState, useCallback, useMemo, useRef, memo} from 'react';
import {
  View, StyleSheet, FlatList, RefreshControl,
  StatusBar, Text, TouchableOpacity, ActivityIndicator, Image,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {loadCategory, getMoviesArray, searchContent} from '../services/metadataService';
import {getViewCount} from '../services/api';
import {trySyncViews} from '../services/viewService';
import {ContentItem} from '../types';
import {MovieCard, CARD_WIDTH} from '../components/MovieCard';
import {SectionHeader} from '../components/SectionHeader';
import {SearchBar} from '../components/SearchBar';
import {LoadingSpinner} from '../components/LoadingSpinner';
import {ErrorView} from '../components/ErrorView';
import {Colors} from '../theme/colors';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';

const H_CARD_W = 142;

// All categories to load random picks from
const ALL_CATEGORIES = [
  'movies', 'dubbed-movies', 'hindi', 'asian-movies',
  'anime', 'anime-movies', 'series', 'tvshows', 'asian-series',
];

// Shuffle helper
const shuffleArray = <T,>(arr: T[]): T[] => {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Pick N random items from array
const pickRandom = <T,>(arr: T[], n: number): T[] => {
  if (arr.length <= n) return shuffleArray(arr);
  return shuffleArray(arr).slice(0, n);
};

// ── Stable horizontal row ──────────────────────────────────────────
interface HRowProps {
  title: string;
  items: ContentItem[];
  onSeeAll?: () => void;
  onPressItem: (item: ContentItem) => void;
}

const HRow = memo<HRowProps>(({title, items, onSeeAll, onPressItem}) => {
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title={title} onSeeAll={onSeeAll} />
      <FlatList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hList}
        keyExtractor={i => i.id}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={7}
        removeClippedSubviews
        renderItem={({item}) => (
          <View style={{marginRight: 10}}>
            <MovieCard item={item} onPress={onPressItem} width={H_CARD_W} />
          </View>
        )}
      />
    </View>
  );
}, (p, n) => p.title === n.title && p.items.length === n.items.length && p.items[0]?.id === n.items[0]?.id);
HRow.displayName = 'HRow';

// ── Enrich items with live view counts ──────────────────────────────
const enrichWithViewCounts = async (
  items: ContentItem[],
  category: string,
  sample = 30,
): Promise<ContentItem[]> => {
  const batch = items.slice(0, sample);
  const withCounts = await Promise.all(
    batch.map(async item => {
      try {
        const v = await getViewCount(category, item.id);
        return {...item, Views: v > 0 ? String(v) : item.Views ?? ''};
      } catch {
        return item;
      }
    })
  );
  return withCounts;
};

const sortByViews = (items: ContentItem[]): ContentItem[] =>
  [...items].sort((a, b) => {
    const va = parseInt((a as any).Views || '0', 10);
    const vb = parseInt((b as any).Views || '0', 10);
    return vb - va;
  });

export const HomeScreen: React.FC = () => {
  const {t} = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [allItems, setAllItems] = useState<ContentItem[]>([]);
  const [movies, setMovies] = useState<ContentItem[]>([]);
  const [anime, setAnime] = useState<ContentItem[]>([]);
  const [series, setSeries] = useState<ContentItem[]>([]);
  const [randomPicks, setRandomPicks] = useState<ContentItem[]>([]);
  const [mostViewed, setMostViewed] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ContentItem[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // ── Load data from ALL categories ─────────────────────────────────
  const loadData = useCallback(async (force = false) => {
    try {
      setError(null);

      // Load all categories in parallel
      const results = await Promise.all(
        ALL_CATEGORIES.map(cat => loadCategory(cat as any, force).catch(() => null))
      );

      // Merge all items with category annotation
      const merged: ContentItem[] = [];
      const categoryMap: Record<string, ContentItem[]> = {};

      results.forEach((data, idx) => {
        const cat = ALL_CATEGORIES[idx];
        if (!data || typeof data !== 'object' || Array.isArray(data)) return;
        const items = Object.values(data) as ContentItem[];
        categoryMap[cat] = items;
        merged.push(...items);
      });

      setAllItems(merged);

      // Individual category slices
      setMovies(categoryMap['movies']?.slice(0, 20) || []);
      setAnime(categoryMap['anime']?.slice(0, 20) || []);
      setSeries(categoryMap['series']?.slice(0, 20) || []);

      // Random picks from ALL categories (20 items)
      const picks = pickRandom(merged, 20);
      setRandomPicks(picks);

      // Most viewed from embedded Views field
      const withViews = merged.filter(i => parseInt((i as any).Views || '0', 10) > 0);
      const initialTop = withViews.length >= 6
        ? sortByViews(withViews).slice(0, 20)
        : pickRandom(merged, 20);
      setMostViewed(initialTop);

      // Async: enrich movies with live view counts for trending
      const moviesForViews = categoryMap['movies'] || [];
      if (moviesForViews.length > 0) {
        enrichWithViewCounts(moviesForViews, 'movies').then(enriched => {
          const liveTop = sortByViews(enriched).filter(i => parseInt((i as any).Views || '0', 10) > 0);
          if (liveTop.length >= 4) setMostViewed(liveTop.slice(0, 20));
        }).catch(() => {});
      }

      trySyncViews().catch(() => {});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  const onRefresh = useCallback(() => { setRefreshing(true); loadData(true); }, [loadData]);

  // ── Navigation ───────────────────────────────────────────────────
  const goToDetails = useCallback((item: ContentItem) => navigation.navigate('Details', {item}), [navigation]);
  const goToCategory = useCallback((cat: string) => navigation.navigate('Category', {category: cat}), [navigation]);

  // ── Search ────────────────────────────────────────────────────────
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); setSearching(false); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchContent(q).catch(() => []);
      setSearchResults(results);
      setSearching(false);
    }, 380);
  }, []);

  const latestMovies = useMemo(() => movies.slice(0, 20), [movies]);

  if (loading) return <LoadingSpinner />;
  if (error && !allItems.length) return <ErrorView message={error} onRetry={() => loadData(true)} />;

  // ── Search overlay ───────────────────────────────────────────────
  if (searchVisible) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />
        <View style={[styles.searchHeader, {paddingTop: insets.top + 6}]}>
          <SearchBar
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder={t('search_placeholder')}
            show
            onToggle={() => { setSearchVisible(false); setSearchQuery(''); setSearchResults([]); }}
          />
        </View>

        {searching ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
          </View>
        ) : searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            numColumns={2}
            keyExtractor={i => i.id}
            contentContainerStyle={styles.searchGrid}
            columnWrapperStyle={styles.row}
            showsVerticalScrollIndicator={false}
            renderItem={({item}) => <MovieCard item={item} onPress={goToDetails} />}
          />
        ) : searchQuery.length > 0 ? (
          <View style={styles.centerBox}>
            <Text style={styles.noResultsText}>{t('no_results')}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  // ── Main home ────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />

      {/* Top bar */}
      <View style={[styles.topBar, {paddingTop: insets.top + 6}]}>
        <Text style={styles.appName}>AbdoBest</Text>
        <TouchableOpacity style={styles.searchBtn} onPress={() => setSearchVisible(true)}>
          <Image source={require('../../assets/icons/search.png')} style={{width: 20, height: 20, tintColor: Colors.dark.text}} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={[]}
        ListHeaderComponent={
          <>
            <HRow
              title={t('random_picks')}
              items={randomPicks}
              onSeeAll={() => goToCategory('movies')}
              onPressItem={goToDetails}
            />
            <HRow
              title={t('most_viewed')}
              items={mostViewed}
              onSeeAll={() => goToCategory('movies')}
              onPressItem={goToDetails}
            />
            <HRow
              title={t('latest_movies')}
              items={latestMovies}
              onSeeAll={() => goToCategory('movies')}
              onPressItem={goToDetails}
            />
            <HRow
              title={t('anime')}
              items={anime}
              onSeeAll={() => goToCategory('anime')}
              onPressItem={goToDetails}
            />
            <HRow
              title={t('series')}
              items={series}
              onSeeAll={() => goToCategory('series')}
              onPressItem={goToDetails}
            />
          </>
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
        contentContainerStyle={{paddingBottom: insets.bottom + 90, paddingTop: 4}}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container:   {flex: 1, backgroundColor: Colors.dark.background},
  topBar:      {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 8},
  appName:     {color: Colors.dark.primary, fontSize: 26, fontWeight: '900', fontFamily: 'Rubik', letterSpacing: 0.3},
  searchBtn:   {width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.dark.surface, justifyContent: 'center', alignItems: 'center'},
  searchHeader:{paddingHorizontal: 14, paddingBottom: 6},
  section:     {marginBottom: 6},
  hList:       {paddingLeft: 14, paddingRight: 14},
  searchGrid:  {paddingHorizontal: 14, paddingBottom: 80, paddingTop: 8},
  row:         {justifyContent: 'space-between'},
  centerBox:   {flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60},
  noResultsText: {color: Colors.dark.textMuted, fontSize: 15, fontFamily: 'Rubik'},
});
