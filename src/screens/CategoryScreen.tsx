import React, {useState, useEffect, useMemo, useCallback, memo} from 'react';
import {
  View, StyleSheet, FlatList, Text, TouchableOpacity,
  TextInput, StatusBar,
} from 'react-native';
import {useRoute, useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import axios from 'axios';
import {loadCategory, getMoviesArray, filterByGenre} from '../services/metadataService';
import {ContentItem} from '../types';
import {MovieCard, CARD_WIDTH} from '../components/MovieCard';
import {LoadingSpinner} from '../components/LoadingSpinner';
import {ErrorView} from '../components/ErrorView';
import {Colors} from '../theme/colors';
import {CATEGORIES} from '../constants/categories';
import {API_BASE} from '../constants/endpoints';
import {useTranslation} from 'react-i18next';
import Icon from 'react-native-vector-icons/Ionicons';

const CATEGORY_ENDPOINTS: Record<string, string> = {
  movies: '/api/movies',
  anime: '/api/anime',
  series: '/api/series',
  tvshows: '/api/tvshows',
  'asian-series': '/api/asian-series',
  'dubbed-movies': '/api/dubbed-movies',
  hindi: '/api/hindi',
  'asian-movies': '/api/asian-movies',
  'anime-movies': '/api/anime-movies',
};

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
  const [selectedCategory, setSelectedCategory] = useState(category);
  const [searchQuery, setSearchQuery] = useState('');

  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as 'ar' | 'en';

  useEffect(() => { loadCategoryData(selectedCategory); }, [selectedCategory]);

  const loadCategoryData = async (cat: string) => {
    try {
      setLoading(true);
      setError(null);
      let data: any = await loadCategory(cat as any).catch(() => null);
      if (!data) {
        const ep = CATEGORY_ENDPOINTS[cat];
        if (ep) {
          const r = await axios.get(`${API_BASE}${ep}`, {timeout: 30000});
          data = r.data;
        }
      }
      if (!data) { setItems([]); return; }
      if (data.movies && !data.Title) {
        setItems((data.movies || []).slice(0, 60).map((m: any, i: number) => ({
          id: `trending_${i}`, Title: m.title,
          Category: m.content_type || 'movies',
          'Image Source': m.image, Source: m.link,
          Genres: [], GenresAr: [],
          Format: m.quality || '', Runtime: null, Country: null,
          Rating: m.imdb_rating || '', Views: m.views || '',
        })));
      } else if (Array.isArray(data)) {
        setItems(data);
      } else if (typeof data === 'object') {
        const dict = data as Record<string, ContentItem>;
        Object.keys(dict).forEach(id => { if (dict[id]) dict[id].id = id; });
        setItems(Object.values(dict));
      }
    } catch (e: any) {
      setError(e.message || t('error_loading'));
    } finally {
      setLoading(false);
    }
  };

  const navigateToDetails = useCallback((item: ContentItem) => {
    navigation.navigate('Details', {item});
  }, [navigation]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(item =>
      item.Title?.toLowerCase().includes(q) ||
      item.Genres?.some(g => g.toLowerCase().includes(q))
    );
  }, [items, searchQuery]);

  const catConfig = CATEGORIES.find(c => c.key === selectedCategory);
  const screenTitle = catConfig
    ? (lang === 'ar' ? catConfig.labelAr : catConfig.labelEn)
    : t(selectedCategory);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />

      {/* Header */}
      <View style={[styles.header, {paddingTop: insets.top + 6}]}>
        {navigation.canGoBack() && route.name !== 'BrowseTab' && (
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Icon name="arrow-back" size={24} color={Colors.dark.text} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>{screenTitle}</Text>
        <Text style={styles.countBadge}>{filteredItems.length}</Text>
      </View>

      {/* Category horizontal scroll */}
      <FlatList
        data={CATEGORIES}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={c => c.key}
        contentContainerStyle={styles.categoryList}
        renderItem={({item: cat}) => (
          <TouchableOpacity
            style={[
              styles.categoryChip,
              selectedCategory === cat.key && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(cat.key)}
          >
            <Icon
              name={`${cat.icon}-outline` as any}
              size={15}
              color={selectedCategory === cat.key ? '#fff' : Colors.dark.textSecondary}
            />
            <Text
              style={[
                styles.categoryChipText,
                selectedCategory === cat.key && styles.categoryChipTextActive,
              ]}
            >
              {lang === 'ar' ? cat.labelAr : cat.labelEn}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Search */}
      <View style={styles.searchRow}>
        <Icon name="search-outline" size={18} color={Colors.dark.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('search_placeholder')}
          placeholderTextColor={Colors.dark.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close-circle" size={18} color={Colors.dark.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorView message={error} onRetry={() => loadCategoryData(selectedCategory)} />
      ) : filteredItems.length === 0 ? (
        <ErrorView message={t('no_results')} />
      ) : (
        <FlatList
          data={filteredItems}
          numColumns={2}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.grid, {paddingBottom: insets.bottom + 100}]}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={true}
          renderItem={({item}) => (
            <MovieCardItem item={item} onPress={navigateToDetails} />
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'Rubik',
  },
  countBadge: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    fontFamily: 'Rubik',
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryList: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  categoryChipText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Rubik',
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  searchIcon: {marginRight: 8},
  searchInput: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 14,
    paddingVertical: 10,
    fontFamily: 'Rubik',
  },
  grid: {
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  row: {
    justifyContent: 'space-between',
    gap: 12,
  },
});
