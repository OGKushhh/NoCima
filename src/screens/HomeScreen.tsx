import React, {useState, useCallback, useMemo, memo, useRef} from 'react';
import {
  View, StyleSheet, FlatList, RefreshControl,
  StatusBar, Text, TouchableOpacity,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {loadCategory, getMoviesArray, searchContent} from '../services/metadataService';
import {ContentItem} from '../types';
import {MovieCard, CARD_WIDTH} from '../components/MovieCard';
import {SectionHeader} from '../components/SectionHeader';
import {SearchBar} from '../components/SearchBar';
import {LoadingSpinner} from '../components/LoadingSpinner';
import {ErrorView} from '../components/ErrorView';
import {Colors} from '../theme/colors';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';
import Icon from 'react-native-vector-icons/Ionicons';

// ─── Stable section (prevents flickering) ─────────────────────────
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
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={7}
          removeClippedSubviews={true}
          getItemLayout={(_, index) => ({
            length: (cardWidth || CARD_WIDTH) + 10,
            offset: ((cardWidth || CARD_WIDTH) + 10) * index,
            index,
          })}
          renderItem={({item}) => (
            <View style={styles.horizontalCardWrapper}>
              <MovieCard item={item} onPress={onPressItem} width={cardWidth || CARD_WIDTH} />
            </View>
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

// ─── Build sections from local data (no trending/featured API) ────
const buildLocalSections = (allMovies: ContentItem[]) => {
  if (!allMovies.length) return {trending: [], mostViewed: [], latestMovies: [], recentAdded: []};

  // "Trending" = first 20 items (newest additions assumed first in list)
  const trending = allMovies.slice(0, 20);

  // "Most Viewed" = pick items that have a views field, or last 20
  const withViews = allMovies.filter(m => m.Views && m.Views !== '0');
  const mostViewed = withViews.length >= 10
    ? withViews.slice(0, 20)
    : allMovies.slice(-20).reverse();

  // Latest = next 20 after trending
  const latestMovies = allMovies.slice(20, 40);

  // Recently added = reversed slice
  const recentAdded = allMovies.slice(40, 60);

  return {trending, mostViewed, latestMovies, recentAdded};
};

export const HomeScreen: React.FC = () => {
  const {t} = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const [movies, setMovies] = useState<ContentItem[]>([]);
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
      const moviesDict = await loadCategory('movies', forceRefresh);
      setMovies(getMoviesArray(moviesDict as Record<string, any>));
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

  const sections = useMemo(() => buildLocalSections(movies), [movies]);

  if (loading) return <LoadingSpinner />;
  if (error && movies.length === 0) return <ErrorView message={error} onRetry={() => loadData(true)} />;

  // Search overlay
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
            onToggle={() => {
              setSearchVisible(false);
              setSearchQuery('');
              setSearchResults([]);
            }}
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

      {/* Top bar */}
      <View style={[styles.topBar, {paddingTop: insets.top + 6}]}>
        <Text style={styles.appTitle}>{t('app_name')}</Text>
        <TouchableOpacity
          style={styles.searchButton}
          onPress={() => setSearchVisible(true)}
        >
          <Icon name="search-outline" size={24} color={Colors.dark.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={[]}
        ListHeaderComponent={
          <View>
            <HorizontalSection
              title={t('trending_now')}
              items={sections.trending}
              onSeeAll={() => navigateToCategory('movies')}
              cardWidth={148}
              onPressItem={navigateToDetails}
            />
            <HorizontalSection
              title={t('most_viewed')}
              items={sections.mostViewed}
              onSeeAll={() => navigateToCategory('movies')}
              cardWidth={148}
              onPressItem={navigateToDetails}
            />
            <HorizontalSection
              title={t('latest_movies')}
              items={sections.latestMovies}
              onSeeAll={() => navigateToCategory('movies')}
              cardWidth={148}
              onPressItem={navigateToDetails}
            />
            <HorizontalSection
              title={t('featured_now')}
              items={sections.recentAdded}
              onSeeAll={() => navigateToCategory('movies')}
              cardWidth={148}
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
        contentContainerStyle={[styles.content, {paddingBottom: insets.bottom + 90}]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  appTitle: {
    color: Colors.dark.primary,
    fontSize: 26,
    fontWeight: '900',
    fontFamily: 'Rubik',
    letterSpacing: 0.3,
  },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBarRow: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  content: {
    paddingTop: 8,
  },
  section: {
    marginBottom: 6,
  },
  horizontalList: {
    paddingLeft: 14,
    paddingRight: 14,
  },
  horizontalCardWrapper: {
    marginRight: 10,
  },
  searchGrid: {
    paddingHorizontal: 14,
    paddingBottom: 80,
    paddingTop: 8,
  },
  row: {
    justifyContent: 'space-between',
  },
});
