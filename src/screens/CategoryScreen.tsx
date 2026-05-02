/**
 * CategoryScreen (Browse)
 *
 * Features:
 *   - Category tabs at top
 *   - Deep search filter popup (genre, quality, country, sort)
 *   - Grid of movie cards
 *   - Search within category (debounced for performance)
 *   - Items capped at 200 for smooth scrolling
 */

import React, {useState, useEffect, useMemo, useCallback, memo, useRef} from 'react';
import {
  View, StyleSheet, FlatList, Text, TouchableOpacity,
  TextInput, StatusBar, Modal, ScrollView,
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
import {CATEGORIES, GENRE_FILTERS} from '../constants/categories';
import {API_BASE} from '../constants/endpoints';
import {useTranslation} from 'react-i18next';
import {Image} from 'react-native';

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

// Sort options
const SORT_OPTIONS = [
  {key: 'default', labelKey: 'all'},
  {key: 'az', labelKey: 'sort_az'},
  {key: 'za', labelKey: 'sort_za'},
  {key: 'year_desc', labelKey: 'sort_newest'},
  {key: 'year_asc', labelKey: 'sort_oldest'},
  {key: 'rating_desc', labelKey: 'sort_top_rated'},
];

const MAX_ITEMS = 200;

export const CategoryScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const category = route.params?.category || 'movies';
  const {t, i18n} = useTranslation();
  const insets = useSafeAreaInsets();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as 'ar' | 'en';

  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(category);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showFilterPopup, setShowFilterPopup] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter state
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedSort, setSelectedSort] = useState('year_desc');

  // Debounce search input — don't filter 1000+ items on every keystroke
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery]);

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
        setItems(data.slice(0, MAX_ITEMS));
      } else if (typeof data === 'object') {
        const dict = data as Record<string, ContentItem>;
        Object.keys(dict).forEach(id => { if (dict[id]) dict[id].id = id; });
        setItems(Object.values(dict).slice(0, MAX_ITEMS));
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

  // ── Apply all filters (uses debouncedQuery) ──────────────────────
  const filteredItems = useMemo(() => {
    let result = items;

    // Text search (debounced)
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      result = result.filter(item =>
        item.Title?.toLowerCase().includes(q) ||
        item.Genres?.some(g => g.toLowerCase().includes(q)) ||
        item.GenresAr?.some(g => g.toLowerCase().includes(q)) ||
        item.Country?.toLowerCase().includes(q)
      );
    }

    // Genre filter
    if (selectedGenre) {
      const cleanGenre = selectedGenre.replace(/^[\p{Emoji}\s]+/u, '').trim();
      result = result.filter(item =>
        item.Genres?.some(g => g.toLowerCase().includes(cleanGenre.toLowerCase())) ||
        item.GenresAr?.some(g => g.toLowerCase().includes(cleanGenre.toLowerCase()))
      );
    }

    // Sort
    switch (selectedSort) {
      case 'az':
        result = [...result].sort((a, b) => (a.Title || '').localeCompare(b.Title || ''));
        break;
      case 'za':
        result = [...result].sort((a, b) => (b.Title || '').localeCompare(a.Title || ''));
        break;
      case 'year_desc':
        result = [...result].sort((a, b) => {
          const ya = (a as any).ReleaseDate || (a as any).Year || '';
          const yb = (b as any).ReleaseDate || (b as any).Year || '';
          return yb.localeCompare(ya);
        });
        break;
      case 'year_asc':
        result = [...result].sort((a, b) => {
          const ya = (a as any).ReleaseDate || (a as any).Year || '';
          const yb = (b as any).ReleaseDate || (b as any).Year || '';
          return ya.localeCompare(yb);
        });
        break;
      case 'rating_desc':
        result = [...result].sort((a, b) => {
          const ra = parseFloat((a as any).Rating || '0');
          const rb = parseFloat((b as any).Rating || '0');
          return rb - ra;
        });
        break;
    }

    return result;
  }, [items, debouncedQuery, selectedGenre, selectedSort]);

  // ── Collect unique genres from loaded items ──────────────────────
  const availableGenres = useMemo(() => {
    const genreSet = new Set<string>();
    items.forEach(item => {
      (item.Genres || []).forEach(g => { if (g) genreSet.add(g); });
    });
    return GENRE_FILTERS.filter(g => genreSet.has(g));
  }, [items]);

  const catConfig = CATEGORIES.find(c => c.key === selectedCategory);
  const screenTitle = catConfig
    ? (lang === 'ar' ? catConfig.labelAr : catConfig.labelEn)
    : t(selectedCategory);

  const activeFilterCount = (selectedGenre ? 1 : 0) + (selectedSort !== 'year_desc' ? 1 : 0);
  const clearFilters = () => { setSelectedGenre(null); setSelectedSort('year_desc'); setSearchQuery(''); setDebouncedQuery(''); };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />

      {/* Header */}
      <View style={[styles.header, {paddingTop: insets.top + 6}]}>
        {navigation.canGoBack() && route.name !== 'BrowseTab' && (
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Image source={require('../../assets/icons/arrow.png')} style={[styles.headerIcon, {tintColor: Colors.dark.text}]} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>{screenTitle}</Text>
        <TouchableOpacity
          style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
          onPress={() => setShowFilterPopup(true)}
        >
          <Image source={require('../../assets/icons/search.png')} style={[styles.headerIcon, {tintColor: activeFilterCount > 0 ? Colors.dark.primary : Colors.dark.textSecondary}]} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
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
            style={[styles.categoryChip, selectedCategory === cat.key && styles.categoryChipActive]}
            onPress={() => {
              setSelectedCategory(cat.key);
              setSelectedGenre(null);
              setSelectedSort('year_desc');
              setSearchQuery('');
              setDebouncedQuery('');
            }}
          >
            <Text
              style={[styles.categoryChipText, selectedCategory === cat.key && styles.categoryChipTextActive]}
            >
              {lang === 'ar' ? cat.labelAr : cat.labelEn}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Search */}
      <View style={styles.searchRow}>
        <Image source={require('../../assets/icons/search.png')} style={[styles.searchIcon, {tintColor: Colors.dark.textMuted}]} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('search_placeholder')}
          placeholderTextColor={Colors.dark.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchQuery(''); setDebouncedQuery(''); }}>
            <Text style={{fontSize: 18, color: Colors.dark.textMuted, fontWeight: '700'}}>&times;</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Active filters indicator */}
      {activeFilterCount > 0 && (
        <View style={styles.activeFiltersRow}>
          {selectedGenre && (
            <TouchableOpacity style={styles.activeChip} onPress={() => setSelectedGenre(null)}>
              <Text style={styles.activeChipText}>{selectedGenre}</Text>
              <Text style={styles.activeChipX}>x</Text>
            </TouchableOpacity>
          )}
          {selectedSort !== 'year_desc' && (
            <TouchableOpacity style={styles.activeChip} onPress={() => setSelectedSort('year_desc')}>
              <Text style={styles.activeChipText}>{t(selectedSort)}</Text>
              <Text style={styles.activeChipX}>x</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={clearFilters}>
            <Text style={styles.clearAllText}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      )}

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

      {/* ── Deep Filter Popup ── */}
      <Modal
        visible={showFilterPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilterPopup(false)}
      >
        <TouchableOpacity
          style={styles.filterOverlay}
          activeOpacity={1}
          onPress={() => setShowFilterPopup(false)}
        >
          <View style={[styles.filterPanel, {paddingBottom: insets.bottom + 20}]} onStartShouldSetResponder={() => true}>
            {/* Header */}
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>{t('search')}</Text>
              <TouchableOpacity onPress={() => setShowFilterPopup(false)}>
                <Image source={require('../../assets/icons/arrow.png')} style={[styles.headerIcon, {tintColor: Colors.dark.text}]} />
              </TouchableOpacity>
            </View>

            {/* Search input in popup */}
            <View style={styles.popupSearchRow}>
              <Image source={require('../../assets/icons/search.png')} style={[styles.searchIcon, {tintColor: Colors.dark.textMuted}]} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('search_placeholder')}
                placeholderTextColor={Colors.dark.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
            </View>

            {/* Sort */}
            <Text style={styles.filterSectionTitle}>{t('sort_by') || 'Sort'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterOptionsRow}>
              {SORT_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.filterOptionChip, selectedSort === opt.key && styles.filterOptionChipActive]}
                  onPress={() => setSelectedSort(opt.key)}
                >
                  <Text style={[styles.filterOptionText, selectedSort === opt.key && styles.filterOptionTextActive]}>
                    {t(opt.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Genre */}
            {availableGenres.length > 0 && (
              <>
                <Text style={styles.filterSectionTitle}>{t('genres')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterOptionsRow}>
                  <TouchableOpacity
                    style={[styles.filterOptionChip, !selectedGenre && styles.filterOptionChipActive]}
                    onPress={() => setSelectedGenre(null)}
                  >
                    <Text style={[styles.filterOptionText, !selectedGenre && styles.filterOptionTextActive]}>
                      {t('all')}
                    </Text>
                  </TouchableOpacity>
                  {availableGenres.map(genre => (
                    <TouchableOpacity
                      key={genre}
                      style={[styles.filterOptionChip, selectedGenre === genre && styles.filterOptionChipActive]}
                      onPress={() => setSelectedGenre(selectedGenre === genre ? null : genre)}
                    >
                      <Text style={[styles.filterOptionText, selectedGenre === genre && styles.filterOptionTextActive]}>
                        {genre}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {/* Results count */}
            <View style={styles.filterFooter}>
              <Text style={styles.filterResultCount}>
                {filteredItems.length} {t('results') || 'results'}
              </Text>
              <TouchableOpacity
                style={styles.filterApplyBtn}
                onPress={() => setShowFilterPopup(false)}
              >
                <Text style={styles.filterApplyText}>{t('all')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
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
  headerIcon: {
    width: 20, height: 20,
  },
  headerTitle: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'Rubik',
  },
  filterBtn: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterBtnActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: `${Colors.dark.primary}20`,
  },
  filterBadge: {
    position: 'absolute',
    top: -2, right: -2,
    backgroundColor: Colors.dark.primary,
    width: 18, height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  categoryList: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 8,
  },
  categoryChip: {
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
    marginBottom: 8,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  popupSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 16,
  },
  searchIcon: {
    width: 18,
    height: 18,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 14,
    paddingVertical: 10,
    fontFamily: 'Rubik',
  },
  activeFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.dark.primary}20`,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}40`,
    gap: 4,
  },
  activeChipText: {
    color: Colors.dark.primary,
    fontSize: 12,
    fontFamily: 'Rubik',
  },
  activeChipX: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    fontFamily: 'Rubik',
  },
  clearAllText: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    fontFamily: 'Rubik',
    marginLeft: 4,
  },
  grid: {
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  row: {
    justifyContent: 'space-between',
    gap: 12,
  },

  // Filter popup styles
  filterOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  filterPanel: {
    backgroundColor: Colors.dark.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '75%',
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderBottomWidth: 0,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  filterTitle: {
    color: Colors.dark.text,
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  filterSectionTitle: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Rubik',
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    paddingRight: 40,
  },
  filterOptionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterOptionChipActive: {
    backgroundColor: `${Colors.dark.primary}20`,
    borderColor: Colors.dark.primary,
  },
  filterOptionText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Rubik',
  },
  filterOptionTextActive: {
    color: Colors.dark.primary,
    fontWeight: '600',
  },
  filterFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.dark.border,
  },
  filterResultCount: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    fontFamily: 'Rubik',
  },
  filterApplyBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.dark.primary,
  },
  filterApplyText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
});
