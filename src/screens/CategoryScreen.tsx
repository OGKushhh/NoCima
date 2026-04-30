import React, {useState, useEffect, useMemo, useCallback, memo} from 'react';
import {View, StyleSheet, FlatList, Text, TextInput, TouchableOpacity} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import axios from 'axios';
import {loadCategory, getMoviesArray, filterByGenre} from '../services/metadataService';
import {ContentItem} from '../types';
import {MovieCard, CARD_WIDTH} from '../components/MovieCard';
import {LoadingSpinner} from '../components/LoadingSpinner';
import {ErrorView} from '../components/ErrorView';
import {Colors} from '../theme/colors';
import {Typography} from '../theme/typography';
import {GENRE_FILTERS} from '../constants/categories';
import {API_BASE} from '../constants/endpoints';
import {useTranslation} from 'react-i18next';
import Icon from 'react-native-vector-icons/Ionicons';

// Map route category param to API endpoint (for direct fetch fallback)
const CATEGORY_ENDPOINTS: Record<string, string> = {
  movies: '/api/movies',
  anime: '/api/anime',
  series: '/api/series',
  tvshows: '/api/tvshows',
  trending: '/api/trending',
  'asian-series': '/api/asian-series',
  'dubbed-movies': '/api/dubbed-movies',
  hindi: '/api/hindi',
  'asian-movies': '/api/asian-movies',
  'anime-movies': '/api/anime-movies',
};

// ─── Memoized MovieCard row item ───────────────────────────────────
const MovieCardItem = memo<{item: ContentItem; onPress: (item: ContentItem) => void}>(
  ({item, onPress}) => <MovieCard item={item} onPress={onPress} />,
  (prev, next) => prev.item.id === next.item.id,
);
MovieCardItem.displayName = 'MovieCardItem';

export const CategoryScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const category = route.params?.category || 'movies';
  const {t, i18n} = useTranslation();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadCategoryData();
  }, [category]);

  const loadCategoryData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try metadataService first (uses cache)
      let data: any = await loadCategory(category as any).catch(() => null);

      // Fallback: direct API call for categories not in the service
      if (!data) {
        const endpoint = CATEGORY_ENDPOINTS[category];
        if (endpoint) {
          const response = await axios.get(`${API_BASE}${endpoint}`, {timeout: 30000});
          data = response.data;
        }
      }

      if (!data) {
        setItems([]);
        return;
      }

      // Handle trending format (has .movies array)
      if (data.movies && !data.Title) {
        const trendingItems = (data.movies || []).slice(0, 50).map((m: any, i: number) => ({
          id: `trending_${i}`,
          Title: m.title,
          Category: m.content_type || 'movies',
          'Image Source': m.image,
          Source: m.link,
          Genres: [],
          GenresAr: [],
          Format: m.quality || '',
          Runtime: null,
          Country: null,
          Rating: m.imdb_rating || '',
          Views: m.views || '',
        }));
        setItems(trendingItems);
      } else if (Array.isArray(data)) {
        setItems(data);
      } else if (typeof data === 'object') {
        const dict = data as Record<string, ContentItem>;
        Object.keys(dict).forEach(id => {
          if (dict[id]) dict[id].id = id;
        });
        setItems(getMoviesArray(dict));
      }
    } catch (err: any) {
      console.error('[CategoryScreen] Error loading:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredMovies = useMemo(() => {
    let result = items;

    if (selectedGenre) {
      const dict = result.reduce((acc, m) => ({...acc, [m.id]: m}), {} as Record<string, ContentItem>);
      result = filterByGenre(dict, selectedGenre);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.Title?.toLowerCase().includes(q) ||
        m.Genres?.some(g => g.toLowerCase().includes(q))
      );
    }

    return result;
  }, [items, selectedGenre, searchQuery]);

  const navigateToDetails = useCallback((item: ContentItem) => {
    navigation.navigate('Details', {item});
  }, [navigation]);

  const handleGenreSelect = useCallback((genre: string | null) => {
    setSelectedGenre(prev => (prev === genre ? null : genre));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorView message={error} onRetry={loadCategoryData} />;

  const getTitle = () => {
    const lang = i18n.language === 'ar' ? 'ar' : 'en';
    const titles: Record<string, {ar: string; en: string}> = {
      movies: {ar: 'أفلام', en: 'Movies'},
      anime: {ar: 'أنمي', en: 'Anime'},
      series: {ar: 'مسلسلات', en: 'Series'},
      tvshows: {ar: 'برامج تلفزيونية', en: 'TV Shows'},
      trending: {ar: 'الأكثر رواجاً', en: 'Trending'},
      'asian-series': {ar: 'مسلسلات آسيوية', en: 'Asian Series'},
      'dubbed-movies': {ar: 'أفلام مدبلجة', en: 'Dubbed Movies'},
      hindi: {ar: 'هندي', en: 'Hindi'},
      'asian-movies': {ar: 'أفلام آسيوية', en: 'Asian Movies'},
      'anime-movies': {ar: 'أفلام أنمي', en: 'Anime Movies'},
    };
    const titleObj = titles[category];
    if (titleObj) return lang === 'ar' ? titleObj.ar : titleObj.en;
    return t('browse');
  };

  const renderItem = useCallback(({item}: {item: ContentItem}) => (
    <MovieCardItem item={item} onPress={navigateToDetails} />
  ), [navigateToDetails]);

  const keyExtractor = useCallback((item: ContentItem) => item.id, []);
  const genreKeyExtractor = useCallback((item: string | null) => item || 'all', []);

  const renderGenreChip = useCallback(({item: genre}: {item: string | null}) => (
    <TouchableOpacity
      style={[styles.genreChip, selectedGenre === genre && styles.genreChipActive]}
      onPress={() => handleGenreSelect(genre)}
    >
      <Text style={[styles.genreText, selectedGenre === genre && styles.genreTextActive]}>
        {genre ? genre : t('all')}
      </Text>
    </TouchableOpacity>
  ), [selectedGenre, handleGenreSelect, t]);

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={[styles.searchContainer, {paddingTop: insets.top + 8}]}>
        <Icon name="search" size={20} color={Colors.dark.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('search_placeholder')}
          placeholderTextColor={Colors.dark.textMuted}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close-circle" size={20} color={Colors.dark.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Category title + count */}
      <View style={styles.categoryTitleRow}>
        <Text style={styles.categoryTitle}>{getTitle()}</Text>
        <Text style={styles.itemCount}>{filteredMovies.length} items</Text>
      </View>

      {/* Genre filter chips */}
      <FlatList
        data={[null, ...GENRE_FILTERS]}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={genreKeyExtractor}
        contentContainerStyle={styles.genreList}
        renderItem={renderGenreChip}
      />

      {/* Content grid */}
      <FlatList
        data={filteredMovies}
        numColumns={2}
        keyExtractor={keyExtractor}
        contentContainerStyle={[styles.grid, {paddingBottom: insets.bottom + 80}]}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews={true}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="film-outline" size={48} color={Colors.dark.textMuted} />
            <Text style={styles.emptyText}>{t('no_results')}</Text>
          </View>
        }
        renderItem={renderItem}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  searchInput: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: Typography.sizes.md,
    marginLeft: 8,
    padding: 0,
  },
  categoryTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  categoryTitle: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold as any,
    fontFamily: 'Rubik',
  },
  itemCount: {
    color: Colors.dark.textMuted,
    fontSize: Typography.sizes.sm,
  },
  genreList: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  genreChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    marginRight: 8,
  },
  genreChipActive: {
    backgroundColor: Colors.dark.primary,
  },
  genreText: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.sm,
    fontWeight: '500',
  },
  genreTextActive: {
    color: '#fff',
  },
  grid: {
    paddingHorizontal: 12,
  },
  row: {
    justifyContent: 'space-between',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.lg,
    marginTop: 12,
  },
});
