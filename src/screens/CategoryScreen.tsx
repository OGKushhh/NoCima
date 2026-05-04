/**
 * CategoryScreen (Browse) – using per‑category JSON (full metadata)
 * Uses loadCategory (no indexer)
 */

import React, {
  useState, useEffect, useMemo, useCallback, memo, useRef,
} from 'react';
import {
  View, StyleSheet, FlatList, Text, TouchableOpacity,
  TextInput, StatusBar, Modal, ScrollView, Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadCategory, getMoviesArray } from '../services/metadataService';
import { ContentItem } from '../types';
import { MovieCard, CARD_WIDTH } from '../components/MovieCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorView } from '../components/ErrorView';
import { Colors } from '../theme/colors';
import { CATEGORIES } from '../constants/categories';
import { useTranslation } from 'react-i18next';
import { Image } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PAGE_SIZE = 30;

const SORT_OPTIONS = [
  { key: 'year_desc', labelKey: 'sort_newest' },
  { key: 'year_asc',  labelKey: 'sort_oldest' },
  { key: 'az',        labelKey: 'sort_az' },
  { key: 'za',        labelKey: 'sort_za' },
] as const;

// Hoisted sort helpers (work with ContentItem, using capitalized fields)
const sortByYearDesc = (items: ContentItem[]) =>
  [...items].sort((a, b) => {
    const ya = (a as any).ReleaseDate || (a as any).Year || '';
    const yb = (b as any).ReleaseDate || (b as any).Year || '';
    if (!ya && !yb) return 0;
    if (!ya) return 1;
    if (!yb) return -1;
    return parseInt(yb, 10) - parseInt(ya, 10);
  });
const sortByYearAsc = (items: ContentItem[]) =>
  [...items].sort((a, b) => {
    const ya = (a as any).ReleaseDate || (a as any).Year || '';
    const yb = (b as any).ReleaseDate || (b as any).Year || '';
    if (!ya && !yb) return 0;
    if (!ya) return 1;
    if (!yb) return -1;
    return parseInt(ya, 10) - parseInt(yb, 10);
  });
const sortByAZ = (items: ContentItem[]) =>
  [...items].sort((a, b) => (a.Title || '').localeCompare(b.Title || ''));
const sortByZA = (items: ContentItem[]) =>
  [...items].sort((a, b) => (b.Title || '').localeCompare(a.Title || ''));
const sortByRatingDesc = (items: ContentItem[]) =>
  [...items].sort((a, b) => {
    const ra = parseFloat((a as any).Rating || '0');
    const rb = parseFloat((b as any).Rating || '0');
    return rb - ra;
  });

const keyExtractor = (item: ContentItem) => item.id;

const MovieCardItem = memo<{ item: ContentItem; onPress: (item: ContentItem) => void }>(
  ({ item, onPress }) => <MovieCard item={item} onPress={onPress} />,
  (prev, next) => prev.item.id === next.item.id,
);
MovieCardItem.displayName = 'MovieCardItem';

export const CategoryScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const isRTL = i18n.language === 'ar';
  const lang = isRTL ? 'ar' : 'en';

  const [allItems, setAllItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(route.params?.category || 'movies');

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedSort, setSelectedSort] = useState<string>('year_desc');
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  const [visibleItems, setVisibleItems] = useState<ContentItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const loadingMoreRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [showFilterPopup, setShowFilterPopup] = useState(false);

  // Sync when arriving with different params
  useEffect(() => {
    const incomingCat = route.params?.category;
    const incomingGenre = route.params?.genre;
    if (incomingCat && incomingCat !== selectedCategory) setSelectedCategory(incomingCat);
    if (incomingGenre !== undefined) setSelectedGenre(incomingGenre || null);
  }, [route.params?.category, route.params?.genre]);

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(searchTimer.current!);
  }, [searchQuery]);

  // Load data using loadCategory (full metadata)
  const loadCategoryData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await loadCategory(selectedCategory as any);
      const itemsArray = getMoviesArray(data as any);
      // Default sort by newest year
      const sorted = sortByYearDesc(itemsArray);
      setAllItems(sorted);
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
  }, [selectedCategory, t]);

  useEffect(() => { loadCategoryData(); }, [loadCategoryData]);

  // Filtered + sorted result
  const filtered = useMemo(() => {
    let result = allItems;
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase();
      result = result.filter(item =>
        item.Title?.toLowerCase().includes(q) ||
        item.Genres?.some(g => g.toLowerCase().includes(q)) ||
        item.GenresAr?.some(g => g.toLowerCase().includes(q)) ||
        item.Country?.toLowerCase().includes(q)
      );
    }
    if (selectedGenre) {
      const cleanGenre = selectedGenre.replace(/^[\p{Emoji}\s]+/u, '').trim();
      result = result.filter(item =>
        item.Genres?.some(g => g.toLowerCase().includes(cleanGenre)) ||
        item.GenresAr?.some(g => g.toLowerCase().includes(cleanGenre))
      );
    }
    if (selectedYear) {
      result = result.filter(item => (item as any).Year === selectedYear);
    }
    switch (selectedSort) {
      case 'az': return sortByAZ(result);
      case 'za': return sortByZA(result);
      case 'year_asc': return sortByYearAsc(result);
      case 'rating_desc': return sortByRatingDesc(result);
      default: return sortByYearDesc(result);
    }
  }, [allItems, debouncedQuery, selectedGenre, selectedYear, selectedSort]);

  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;

  useEffect(() => { setPage(1); }, [debouncedQuery, selectedGenre, selectedYear, selectedSort]);

  useEffect(() => {
    const end = page * PAGE_SIZE;
    const nextChunk = filteredRef.current.slice(0, end);
    setVisibleItems(nextChunk);
    setHasMore(end < filteredRef.current.length);
  }, [filtered, page]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setPage(p => p + 1);
    requestAnimationFrame(() => {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    });
  }, [hasMore]);

  const navigateToDetails = useCallback((item: ContentItem) => navigation.navigate('Details', { item }), [navigation]);
  const renderItem = useCallback(({ item }: { item: ContentItem }) => <MovieCardItem item={item} onPress={navigateToDetails} />, [navigateToDetails]);

  const handleCategorySelect = useCallback((cat: string) => {
    setSelectedCategory(cat);
    setSelectedGenre(null);
    setSelectedYear(null);
    setSelectedSort('year_desc');
    setSearchQuery('');
    setDebouncedQuery('');
    setShowFilterPopup(false);
  }, []);

  // Available genres and years from current items
  const availableGenres = useMemo(() => {
    const s = new Set<string>();
    allItems.forEach(item => (item.Genres || []).forEach(g => s.add(g)));
    return Array.from(s).sort();
  }, [allItems]);

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const s = new Set<string>();
    allItems.forEach(item => {
      const y = (item as any).Year;
      if (!y) return;
      const n = parseInt(y, 10);
      if (!isNaN(n) && n >= 1900 && n <= currentYear + 1) s.add(y);
    });
    return Array.from(s).sort((a, b) => b.localeCompare(a));
  }, [allItems]);

  const catConfig = CATEGORIES.find(c => c.key === selectedCategory);
  const screenTitle = catConfig ? (lang === 'ar' ? catConfig.labelAr : catConfig.labelEn) : t(selectedCategory);
  const activeFilterCount = (selectedGenre ? 1 : 0) + (selectedYear ? 1 : 0) + (selectedSort !== 'year_desc' ? 1 : 0);
  const clearFilters = useCallback(() => { setSelectedGenre(null); setSelectedYear(null); setSelectedSort('year_desc'); }, []);
  const closeFilterPopup = useCallback(() => setShowFilterPopup(false), []);

  if (loading) return <LoadingSpinner />;
  if (error && !allItems.length) return <ErrorView message={error} onRetry={loadCategoryData} />;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }, isRTL && styles.rowRTL]}>
        {navigation.canGoBack() && route.name !== 'BrowseTab' && (
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Image source={require('../../assets/icons/arrow.png')} style={[styles.headerIcon, { tintColor: Colors.dark.text, transform: [{ scaleX: isRTL ? -1 : 1 }] }]} />
          </TouchableOpacity>
        )}
        <Text style={[styles.headerTitle, isRTL && styles.textRTL]}>{screenTitle}</Text>
      </View>

      {/* Search + filter button */}
      <View style={[styles.searchRow, isRTL && styles.rowRTL]}>
        <Image source={require('../../assets/icons/search.png')} style={[styles.searchIcon, { tintColor: Colors.dark.textMuted }]} />
        <TextInput style={[styles.searchInput, isRTL && styles.textRTL]} placeholder={t('search_placeholder')} placeholderTextColor={Colors.dark.textMuted} value={searchQuery} onChangeText={setSearchQuery} textAlign={isRTL ? 'right' : 'left'} />
        {searchQuery.length > 0 && <TouchableOpacity onPress={() => { setSearchQuery(''); setDebouncedQuery(''); }} style={styles.clearBtn}><Text style={{ fontSize: 18, color: Colors.dark.textMuted, fontWeight: '700' }}>×</Text></TouchableOpacity>}
        <TouchableOpacity style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]} onPress={() => setShowFilterPopup(true)}>
          <Image source={require('../../assets/icons/setting.png')} style={[styles.filterBtnIcon, { tintColor: activeFilterCount > 0 ? Colors.dark.primary : Colors.dark.textSecondary }]} />
          {activeFilterCount > 0 && <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{activeFilterCount}</Text></View>}
        </TouchableOpacity>
      </View>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <View style={[styles.activeFiltersRow, isRTL && styles.rowRTL]}>
          {selectedGenre && <TouchableOpacity style={styles.activeChip} onPress={() => setSelectedGenre(null)}><Text style={styles.activeChipText}>{selectedGenre}</Text><Text style={styles.activeChipX}>×</Text></TouchableOpacity>}
          {selectedYear && <TouchableOpacity style={styles.activeChip} onPress={() => setSelectedYear(null)}><Text style={styles.activeChipText}>{selectedYear}</Text><Text style={styles.activeChipX}>×</Text></TouchableOpacity>}
          {selectedSort !== 'year_desc' && <TouchableOpacity style={styles.activeChip} onPress={() => setSelectedSort('year_desc')}><Text style={styles.activeChipText}>{t(selectedSort)}</Text><Text style={styles.activeChipX}>×</Text></TouchableOpacity>}
          <TouchableOpacity onPress={clearFilters}><Text style={styles.clearAllText}>{t('cancel')}</Text></TouchableOpacity>
        </View>
      )}

      {/* Grid */}
      {visibleItems.length === 0 ? (
        <View style={styles.emptyContainer}><Text style={[styles.emptyText, isRTL && styles.textRTL]}>{t('no_results')}</Text></View>
      ) : (
        <FlatList
          data={visibleItems}
          numColumns={2}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
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
        />
      )}

      {/* Filter Modal */}
      <Modal visible={showFilterPopup} transparent animationType="fade" onRequestClose={closeFilterPopup}>
        <TouchableOpacity style={styles.filterOverlay} activeOpacity={1} onPress={closeFilterPopup}>
          <View style={styles.filterPanel}>
            <View style={[styles.filterHeader, isRTL && styles.rowRTL]}>
              <Text style={[styles.filterTitle, isRTL && styles.textRTL]}>{t('filter')}</Text>
              <TouchableOpacity onPress={closeFilterPopup}><Image source={require('../../assets/icons/close.png')} style={[styles.headerIcon, { tintColor: Colors.dark.text }]} /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_HEIGHT * 0.7 }}>
              <Text style={[styles.filterSectionTitle, isRTL && styles.textRTL]}>{t('browse')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterOptionsRow}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity key={cat.key} style={[styles.filterOptionChip, selectedCategory === cat.key && styles.categoryChipActive]} onPress={() => handleCategorySelect(cat.key)}>
                    <Text style={[styles.filterOptionText, selectedCategory === cat.key && styles.categoryChipTextActive]}>{lang === 'ar' ? cat.labelAr : cat.labelEn}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.filterSectionTitle, isRTL && styles.textRTL]}>{t('sort_by')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterOptionsRow}>
                {SORT_OPTIONS.map(opt => (
                  <TouchableOpacity key={opt.key} style={[styles.filterOptionChip, selectedSort === opt.key && styles.filterOptionChipActive]} onPress={() => setSelectedSort(opt.key)}>
                    <Text style={[styles.filterOptionText, selectedSort === opt.key && styles.filterOptionTextActive]}>{t(opt.labelKey)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {availableGenres.length > 0 && (
                <>
                  <Text style={[styles.filterSectionTitle, isRTL && styles.textRTL]}>{t('genres')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterOptionsRow}>
                    <TouchableOpacity style={[styles.filterOptionChip, !selectedGenre && styles.filterOptionChipActive]} onPress={() => setSelectedGenre(null)}>
                      <Text style={[styles.filterOptionText, !selectedGenre && styles.filterOptionTextActive]}>{t('all')}</Text>
                    </TouchableOpacity>
                    {availableGenres.map(genre => (
                      <TouchableOpacity key={genre} style={[styles.filterOptionChip, selectedGenre === genre && styles.filterOptionChipActive]} onPress={() => setSelectedGenre(selectedGenre === genre ? null : genre)}>
                        <Text style={[styles.filterOptionText, selectedGenre === genre && styles.filterOptionTextActive]}>{genre}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {availableYears.length > 0 && (
                <>
                  <Text style={[styles.filterSectionTitle, isRTL && styles.textRTL]}>{t('year')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterOptionsRow}>
                    <TouchableOpacity style={[styles.filterOptionChip, !selectedYear && styles.filterOptionChipActive]} onPress={() => setSelectedYear(null)}>
                      <Text style={[styles.filterOptionText, !selectedYear && styles.filterOptionTextActive]}>{t('all')}</Text>
                    </TouchableOpacity>
                    {availableYears.map(year => (
                      <TouchableOpacity key={year} style={[styles.filterOptionChip, selectedYear === year && styles.filterOptionChipActive]} onPress={() => setSelectedYear(selectedYear === year ? null : year)}>
                        <Text style={[styles.filterOptionText, selectedYear === year && styles.filterOptionTextActive]}>{year}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}
            </ScrollView>
            <View style={[styles.filterFooter, isRTL && styles.rowRTL]}>
              <Text style={[styles.filterResultCount, isRTL && styles.textRTL]}>{filtered.length} {t('results')}</Text>
              <TouchableOpacity style={styles.filterApplyBtn} onPress={closeFilterPopup}><Text style={styles.filterApplyText}>{t('apply')}</Text></TouchableOpacity>
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
  searchRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, backgroundColor: Colors.dark.surface, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2, borderWidth: 1, borderColor: Colors.dark.border, gap: 4 },
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
  rowRTL: { flexDirection: 'row-reverse' },
  textRTL: { textAlign: 'right', writingDirection: 'rtl' },
});