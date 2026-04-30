import React, {useState, useCallback, useMemo, memo, useRef} from 'react';
import {View, StyleSheet, FlatList, RefreshControl, StatusBar, SafeAreaView} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {loadCategory, loadFeatured, getMoviesArray, searchContent} from '../services/metadataService';
import {ContentItem, TrendingContent, TrendingItem} from '../types';
import {MovieCard, CARD_WIDTH} from '../components/MovieCard';
import {SectionHeader} from '../components/SectionHeader';
import {SearchBar} from '../components/SearchBar';
import {LoadingSpinner} from '../components/LoadingSpinner';
import {ErrorView} from '../components/ErrorView';
import {Colors} from '../theme/colors';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';

// ─── Memoized horizontal row for performance ──────────────────────
interface HorizontalSectionProps {
  title: string;
  items: ContentItem[];
  onSeeAll?: () => void;
  cardWidth?: number;
  onPressItem: (item: ContentItem) => void;
}

const HorizontalSection = memo<HorizontalSectionProps>(
  ({title, items, onSeeAll, cardWidth, onPressItem}) => {
    if (items.length === 0) return null;
    return (
      <View style={styles.section}>
        <SectionHeader title={title} onSeeAll={onSeeAll} />
        <FlatList
          data={items}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
          keyExtractor={(item) => item.id}
          initialNumToRender={4}
          maxToRenderPerBatch={4}
          windowSize={5}
          removeClippedSubviews={true}
          renderItem={({item}) => (
            <MovieCard item={item} onPress={onPressItem} width={cardWidth || CARD_WIDTH} />
          )}
        />
      </View>
    );
  },
  (prev, next) =>
    prev.title === next.title &&
    prev.items.length === next.items.length &&
    prev.items[0]?.id === next.items[0]?.id,
);
HorizontalSection.displayName = 'HorizontalSection';

export const HomeScreen: React.FC = () => {
  const {t} = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [movies, setMovies] = useState<ContentItem[]>([]);
  const [trending, setTrending] = useState<TrendingContent | null>(null);
  const [featured, setFeatured] = useState<TrendingContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ContentItem[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      setError(null);
      const [moviesDict, trendingData, featuredData] = await Promise.all([
        loadCategory('movies', forceRefresh),
        loadCategory('trending', forceRefresh),
        loadFeatured(forceRefresh),
      ]);
      setMovies(getMoviesArray(moviesDict as Record<string, any>));
      setTrending(trendingData as TrendingContent);
      setFeatured(featuredData as TrendingContent);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  const navigateToDetails = useCallback((item: ContentItem) => {
    navigation.navigate('Details', {item});
  }, [navigation]);

  const navigateToCategory = useCallback((category: string) => {
    navigation.navigate('Category', {category});
  }, [navigation]);

  // Search handler with debounce
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!query.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchContent(query);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, []);

  const trendingToItems = useCallback((items: TrendingItem[], prefix: string): ContentItem[] => {
    return items.slice(0, 20).map((tItem, i) => ({
      id: `${prefix}_${i}`,
      Title: tItem.title,
      Category: tItem.content_type || 'movies',
      'Image Source': tItem.image,
      Source: tItem.link,
      Genres: [],
      GenresAr: [],
      Format: tItem.quality || '',
      Runtime: null,
      Country: null,
      Rating: tItem.imdb_rating || '',
      Views: tItem.views || '',
    }));
  }, []);

  // Use useRef-based stable data to prevent flickering
  const stableTrending = useMemo(
    () => (trending?.movies ? trendingToItems(trending.movies, 'trending') : []),
    [trending?.movies, trendingToItems],
  );

  const stableFeatured = useMemo(
    () => (featured?.movies ? trendingToItems(featured.movies, 'featured') : []),
    [featured?.movies, trendingToItems],
  );

  const latestMovies = useMemo(() => movies.slice(0, 20), [movies]);
  const recentAdded = useMemo(() => movies.slice(-20).reverse(), [movies]);

  if (loading) return <LoadingSpinner />;
  if (error && movies.length === 0) return <ErrorView message={error} onRetry={() => loadData(true)} />;

  // If searching, show search results
  if (searchVisible && (searchQuery.length > 0 || searchResults.length > 0)) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />
        <View style={[styles.searchBarRow, {paddingTop: insets.top + 8}]}>
          <SearchBar
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder={t('search_placeholder')}
            show={true}
            onToggle={() => setSearchVisible(false)}
          />
        </View>
        {searching ? (
          <LoadingSpinner fullScreen={false} size="small" />
        ) : searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            numColumns={2}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.searchGrid}
            columnWrapperStyle={styles.row}
            showsVerticalScrollIndicator={false}
            renderItem={({item}) => (
              <MovieCard item={item} onPress={navigateToDetails} />
            )}
          />
        ) : (
          <ErrorView message={t('no_results')} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />
      {/* Top bar with title and search icon */}
      <View style={[styles.topBar, {paddingTop: insets.top + 8}]}>
        <View style={styles.titleContainer}>
          <Text style={styles.appTitle}>{t('app_name')}</Text>
        </View>
        <SearchBar
          value={searchQuery}
          onChangeText={handleSearch}
          placeholder={t('search_placeholder')}
          show={searchVisible}
          onToggle={() => setSearchVisible(!searchVisible)}
        />
      </View>

      <FlatList
        data={[]}
        ListHeaderComponent={
          <View>
            <HorizontalSection
              title={t('trending_now')}
              items={stableTrending}
              onSeeAll={() => navigateToCategory('trending')}
              cardWidth={140}
              onPressItem={navigateToDetails}
            />
            <HorizontalSection
              title={t('featured_now')}
              items={stableFeatured}
              onSeeAll={() => navigateToCategory('trending')}
              cardWidth={140}
              onPressItem={navigateToDetails}
            />
            <HorizontalSection
              title={t('latest_movies')}
              items={latestMovies}
              onSeeAll={() => navigateToCategory('movies')}
              onPressItem={navigateToDetails}
            />
            <HorizontalSection
              title={t('most_viewed')}
              items={recentAdded}
              onSeeAll={() => navigateToCategory('movies')}
              onPressItem={navigateToDetails}
            />
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
        contentContainerStyle={[styles.content, {paddingBottom: insets.bottom + 80}]}
      />
    </View>
  );
};

// Need Text import for the title
import {Text} from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  titleContainer: {
    flexShrink: 1,
  },
  appTitle: {
    color: Colors.dark.primary,
    fontSize: 24,
    fontWeight: '900',
    fontFamily: 'Rubik',
  },
  searchBarRow: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  content: {
    paddingTop: 12,
  },
  section: {
    marginBottom: 8,
  },
  horizontalList: {
    paddingLeft: 16,
    paddingRight: 16,
  },
  searchGrid: {
    paddingHorizontal: 12,
    paddingBottom: 80,
  },
  row: {
    justifyContent: 'space-between',
  },
});
