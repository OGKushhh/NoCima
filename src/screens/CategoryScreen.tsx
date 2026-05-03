/**
 * CategoryScreen (Browse) – using all-content.json (lightweight index)
 *
 * Features:
 *   - Single API call to all-content.json, cached in memory
 *   - Client‑side pagination (load 30, then load more on scroll end)
 *   - Filter by category (from route), genre, year, and search (title)
 *   - Sort by year (newest/oldest) or title (A‑Z / Z‑A)
 *   - Debounced search
 *   - Centered filter modal (not bottom sheet)
 *   - FlatList with optimised rendering for large datasets
 */

import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import {
  View, StyleSheet, FlatList, Text, TouchableOpacity,
  TextInput, StatusBar, Modal, ScrollView, Dimensions, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAllContentIndex } from '../services/metadataService';
import { ContentItem } from '../types';
import { MovieCard, CARD_WIDTH } from '../components/MovieCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorView } from '../components/ErrorView';
import { Colors } from '../theme/colors';
import { CATEGORIES } from '../constants/categories';
import { useTranslation } from 'react-i18next';
import { Image } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Pagination config
const PAGE_SIZE = 30;

// Sort options
const SORT_OPTIONS = [
  { key: 'year_desc', labelKey: 'sort_newest' },
  { key: 'year_asc', labelKey: 'sort_oldest' },
  { key: 'az', labelKey: 'sort_az' },
  { key: 'za', labelKey: 'sort_za' },
];

// Memoised card – maps index item to ContentItem
const MovieCardItem = memo<{ item: any; onPress: (item: any) => void }>(
  ({ item, onPress }) => {
    // Convert index item (with Title, Genres, Year, Category, Image Source) to ContentItem
    const cardItem: ContentItem = {
      id: item.id,
      Title: item.title,
      Category: item.category,
      'Image Source': item.image,
      Genres: item.genres || [],
      GenresAr: [],
      Format: '',
      Runtime: null,
      Country: '',
      Rating: '',
      Views: '',
      Source: '',
      Year: item.year,
    };
    return <MovieCard item={cardItem} onPress={onPress} />;
  },
  (prev, next) => prev.item.id === next.item.id,
);
MovieCardItem.displayName = 'MovieCardItem';

// Sorting helpers – using correct field names (Year, Title)
const sortByYearDesc = (items: any[]) =>
  [...items].sort((a, b) => (b.Year || '0').localeCompare(a.Year || '0'));
const sortByYearAsc = (items: any[]) =>
  [...items].sort((a, b) => (a.Year || '0').localeCompare(b.Year || '0'));
const sortByAZ = (items: any[]) =>
  [...items].sort((a, b) => (a.Title || '').localeCompare(b.Title || ''));
const sortByZA = (items: any[]) =>
  [...items].sort((a, b) => (b.Title || '').localeCompare(a.Title || ''));

export const CategoryScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const category = route.params?.category || 'movies';
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as 'ar' | 'en';

  // Data & UI states
  const [allItems, setAllItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(category);

  // Sync when arriving with a different category or genre param
  useEffect(() => {
    const incomingCat   = route.params?.category;
    const incomingGenre = route.params?.genre;
    if (incomingCat && incomingCat !== selectedCategory) {
      setSelectedCategory(incomingCat);
    }
    if (incomingGenre !== undefined) {
      setSelectedGenre(incomingGenre || null);
    }
  }, [route.params?.category, route.params?.genre]);

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedSort, setSelectedSort] = useState('year_desc');
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  // Pagination
  const [visibleItems, setVisibleItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [showFilterPopup, setShowFilterPopup] = useState(false);

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery]);

  // Load index on mount or category change
  useEffect(() => {
    loadIndex();
  }, [selectedCategory]);

  const loadIndex = async () => {
    try {
      setLoading(true);
      setError(null);
      const index = await getAllContentIndex();

      // Items have a 'Category' field (capital C) – filter directly
      const filteredByCat = index.filter(item => item.category === selectedCategory);

      setAllItems(filteredByCat);
      // Reset pagination and filters
      setPage(1);
      setHasMore(true);
      setVisibleItems([]);
      setSelectedGenre(null);
      setSelectedYear(null);
      setSelectedSort('year_desc');
      setSearchQuery('');
      setDebouncedQuery('');
    } catch (err: any) {
      setError(err.message || t('error_loading'));
    } finally {
      setLoading(false);
    }
  };

  // Apply all filters & sorting – using correct field names
  const filtered = useMemo(() => {
    let result = [...allItems];

    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      result = result.filter(item => item.title?.toLowerCase().includes(q));
    }

    if (selectedGenre) {
      result = result.filter(item =>
        (item.genres || []).some((g: string) => g === selectedGenre)
      );
    }

    if (selectedYear) {
      result = result.filter(item => item.year === selectedYear);
    }

    switch (selectedSort) {
      case 'az': result = sortByAZ(result); break;
      case 'za': result = sortByZA(result); break;
      case 'year_desc': result = sortByYearDesc(result); break;
      case 'year_asc': result = sortByYearAsc(result); break;
      default: result = sortByYearDesc(result);
    }

    return result;
  }, [allItems, debouncedQuery, selectedGenre, selectedYear, selectedSort]);

  // Pagination: load next batch when page changes
  useEffect(() => {
    const start = 0;
    const end = page * PAGE_SIZE;
    const nextChunk = filtered.slice(start, end);
    setVisibleItems(nextChunk);
    setHasMore(end < filtered.length);
  }, [filtered, page]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    setPage(prev => prev + 1);
    setLoadingMore(false);
  }, [hasMore, loadingMore]);

  const navigateToDetails = useCallback((item: any) => {
    navigation.navigate('Details', { item });
  }, [navigation]);

  const handleCategorySelect = useCallback((cat: string) => {
    setSelectedCategory(cat);
    setSelectedGenre(null);
    setSelectedYear(null);
    setSelectedSort('year_desc');
    setSearchQuery('');
    setDebouncedQuery('');
    setShowFilterPopup(false);
  }, []);

  // Extract available genres and years from current items – using correct field names
  const availableGenres = useMemo(() => {
    const genreSet = new Set<string>();
    allItems.forEach(item => {
      (item.genres || []).forEach((g: string) => genreSet.add(g));
    });
    return Array.from(genreSet).sort();
  }, [allItems]);

  const availableYears = useMemo(() => {
    const yearSet = new Set<string>();
    allItems.forEach(item => {
      if (item.year) yearSet.add(item.year);
    });
    return Array.from(yearSet).sort((a, b) => b.localeCompare(a));
  }, [allItems]);

  const catConfig = CATEGORIES.find(c => c.key === selectedCategory);
  const screenTitle = catConfig
    ? (lang === 'ar' ? catConfig.labelAr : catConfig.labelEn)
    : t(selectedCategory);

  const activeFilterCount = (selectedGenre ? 1 : 0) + (selectedYear ? 1 : 0) + (selectedSort !== 'year_desc' ? 1 : 0);
  const clearFilters = () => {
    setSelectedGenre(null);
    setSelectedYear(null);
    setSelectedSort('year_desc');
  };

  const closeFilterPopup = () => setShowFilterPopup(false);

  if (loading) return <LoadingSpinner />;
  if (error && !allItems.length) return <ErrorView message={error} onRetry={loadIndex} />;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        {navigation.canGoBack() && route.name !== 'BrowseTab' && (
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Image source={require('../../assets/icons/arrow.png')} style={[styles.headerIcon, { tintColor: Colors.dark.text }]} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>{screenTitle}</Text>
      </View>

      {/* Search bar + filter button */}
      <View style={styles.searchRow}>
        <Image source={require('../../assets/icons/search.png')} style={[styles.searchIcon, { tintColor: Colors.dark.textMuted }]} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('search_placeholder')}
          placeholderTextColor={Colors.dark.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchQuery(''); setDebouncedQuery(''); }} style={styles.clearBtn}>
            <Text style={{ fontSize: 18, color: Colors.dark.textMuted, fontWeight: '700' }}>&times;</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
          onPress={() => setShowFilterPopup(true)}
        >
          <Image source={require('../../assets/icons/setting.png')} style={[styles.filterBtnIcon, { tintColor: activeFilterCount > 0 ? Colors.dark.primary : Colors.dark.textSecondary }]} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Active filters chips */}
      {activeFilterCount > 0 && (
        <View style={styles.activeFiltersRow}>
          {selectedGenre && (
            <TouchableOpacity style={styles.activeChip} onPress={() => setSelectedGenre(null)}>
              <Text style={styles.activeChipText}>{selectedGenre}</Text>
              <Text style={styles.activeChipX}>x</Text>
            </TouchableOpacity>
          )}
          {selectedYear && (
            <TouchableOpacity style={styles.activeChip} onPress={() => setSelectedYear(null)}>
              <Text style={styles.activeChipText}>{selectedYear}</Text>
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

      {/* Grid with pagination */}
      {visibleItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t('no_results')}</Text>
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          numColumns={2}
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.grid, { paddingBottom: insets.bottom + 100 }]}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          initialNumToRender={PAGE_SIZE}
          maxToRenderPerBatch={PAGE_SIZE}
          windowSize={10}
          removeClippedSubviews
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={Colors.dark.primary} style={{ margin: 20 }} /> : null}
          renderItem={({ item }) => <MovieCardItem item={item} onPress={navigateToDetails} />}
        />
      )}

      {/* Filter Modal (Centered) */}
      <Modal visible={showFilterPopup} transparent animationType="fade" onRequestClose={closeFilterPopup}>
        <TouchableOpacity style={styles.filterOverlay} activeOpacity={1} onPress={closeFilterPopup}>
          <View style={styles.filterPanel} onStartShouldSetResponder={() => true}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>{t('filter_sort') || 'Filter & Sort'}</Text>
              <TouchableOpacity onPress={closeFilterPopup}>
                <Image source={require('../../assets/icons/close.png')} style={[styles.headerIcon, { tintColor: Colors.dark.text }]} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_HEIGHT * 0.7 }}>
              {/* Category */}
              <Text style={styles.filterSectionTitle}>{t('browse')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterOptionsRow}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[styles.filterOptionChip, selectedCategory === cat.key && styles.categoryChipActive]}
                    onPress={() => handleCategorySelect(cat.key)}
                  >
                    <Text style={[styles.filterOptionText, selectedCategory === cat.key && styles.categoryChipTextActive]}>
                      {lang === 'ar' ? cat.labelAr : cat.labelEn}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

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

              {/* Year */}
              {availableYears.length > 0 && (
                <>
                  <Text style={styles.filterSectionTitle}>{t('year') || 'Year'}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterOptionsRow}>
                    <TouchableOpacity
                      style={[styles.filterOptionChip, !selectedYear && styles.filterOptionChipActive]}
                      onPress={() => setSelectedYear(null)}
                    >
                      <Text style={[styles.filterOptionText, !selectedYear && styles.filterOptionTextActive]}>
                        {t('all')}
                      </Text>
                    </TouchableOpacity>
                    {availableYears.map(year => (
                      <TouchableOpacity
                        key={year}
                        style={[styles.filterOptionChip, selectedYear === year && styles.filterOptionChipActive]}
                        onPress={() => setSelectedYear(selectedYear === year ? null : year)}
                      >
                        <Text style={[styles.filterOptionText, selectedYear === year && styles.filterOptionTextActive]}>
                          {year}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}
            </ScrollView>

            <View style={styles.filterFooter}>
              <Text style={styles.filterResultCount}>
                {filtered.length} {t('results') || 'results'}
              </Text>
              <TouchableOpacity style={styles.filterApplyBtn} onPress={closeFilterPopup}>
                <Text style={styles.filterApplyText}>{t('apply') || 'Apply'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.dark.surface, justifyContent: 'center', alignItems: 'center' },
  headerIcon: { width: 20, height: 20 },
  headerTitle: { flex: 1, color: Colors.dark.text, fontSize: 22, fontWeight: '800', fontFamily: 'Rubik' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8,
    backgroundColor: Colors.dark.surface, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2,
    borderWidth: 1, borderColor: Colors.dark.border, gap: 4,
  },
  searchIcon: { width: 18, height: 18 },
  searchInput: { flex: 1, color: Colors.dark.text, fontSize: 14, paddingVertical: 10, fontFamily: 'Rubik' },
  clearBtn: { paddingHorizontal: 4 },
  filterBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.dark.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.dark.border },
  filterBtnActive: { borderColor: Colors.dark.primary, backgroundColor: `${Colors.dark.primary}20` },
  filterBtnIcon: { width: 18, height: 18 },
  filterBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: Colors.dark.primary, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  filterBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  activeFiltersRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8, gap: 8, flexWrap: 'wrap' },
  activeChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: `${Colors.dark.primary}20`, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: `${Colors.dark.primary}40`, gap: 4 },
  activeChipText: { color: Colors.dark.primary, fontSize: 12, fontFamily: 'Rubik' },
  activeChipX: { color: Colors.dark.textMuted, fontSize: 12, fontFamily: 'Rubik' },
  clearAllText: { color: Colors.dark.textMuted, fontSize: 12, fontFamily: 'Rubik', marginLeft: 4 },
  grid: { paddingHorizontal: 14, paddingTop: 4 },
  row: { justifyContent: 'space-between', gap: 12 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60 },
  emptyText: { color: Colors.dark.textMuted, fontSize: 16, fontFamily: 'Rubik' },

  filterOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  filterPanel: { backgroundColor: Colors.dark.surface, borderRadius: 24, padding: 20, width: '90%', maxWidth: 480, maxHeight: '85%', borderWidth: 1, borderColor: Colors.dark.border },
  filterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.dark.border },
  filterTitle: { color: Colors.dark.text, fontSize: 20, fontWeight: '700', fontFamily: 'Rubik' },
  filterSectionTitle: { color: Colors.dark.textSecondary, fontSize: 12, fontWeight: '600', fontFamily: 'Rubik', marginBottom: 8, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  filterOptionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  filterOptionChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: Colors.dark.background, borderWidth: 1, borderColor: Colors.dark.border },
  filterOptionChipActive: { backgroundColor: `${Colors.dark.primary}20`, borderColor: Colors.dark.primary },
  filterOptionText: { color: Colors.dark.textSecondary, fontSize: 13, fontWeight: '500', fontFamily: 'Rubik' },
  filterOptionTextActive: { color: Colors.dark.primary, fontWeight: '600' },
  categoryChipActive: { backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary },
  categoryChipTextActive: { color: '#fff' },
  filterFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.dark.border },
  filterResultCount: { color: Colors.dark.textMuted, fontSize: 13, fontFamily: 'Rubik' },
  filterApplyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: Colors.dark.primary },
  filterApplyText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'Rubik' },
});