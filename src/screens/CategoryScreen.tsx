/**
 * CategoryScreen (Browse)
 *
 * Full-screen category browser with a 3-column poster grid.
 *
 * Layout:
 *   ┌──────────────────────────────────┐
 *   │  ←  Category Title          🔍  │  ← Header (surface bg)
 *   ├──────────────────────────────────┤
 *   │  🔍 Search by title, genre...   │  ← Collapsible SearchBar
 *   ├──────────────────────────────────┤
 *   │  ┌────┐  ┌────┐  ┌────┐        │
 *   │  │    │  │    │  │    │        │  ← 3-column grid
 *   │  │    │  │    │  │    │        │     (FlatList numColumns)
 *   │  └────┘  └────┘  └────┘        │
 *   │  ┌────┐  ┌────┐  ┌────┐        │
 *   │  │    │  │    │  │    │        │
 *   │  └────┘  └────┘  └────┘        │
 *   └──────────────────────────────────┘
 *
 * Features:
 *   - Back navigation with local PNG icon
 *   - Collapsible SearchBar (toggles with header icon)
 *   - Local filtering by Title, Genres, Country
 *   - Pull-to-refresh via RefreshControl
 *   - useFocusEffect for fresh data on every screen focus
 *   - All optional chaining on item properties
 *   - No Ionicons — only local PNG icons
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Text,
  TouchableOpacity,
  Image,
  RefreshControl,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContentItem } from '../types';
import { loadCategory } from '../services/metadataService';
import { MovieCard } from '../components/MovieCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorView } from '../components/ErrorView';
import { SearchBar } from '../components/SearchBar';
import { SPACING } from '../theme/colors';
import { useTheme } from '../hooks/useTheme';
import { FONTS } from '../theme/typography';
import { CATEGORIES } from '../constants/categories';
import { useTranslation } from 'react-i18next';

// ---------------------------------------------------------------------------
// Layout Constants
// ---------------------------------------------------------------------------
const NUM_COLUMNS = 3;
const CARD_GAP = 10;
const HORIZONTAL_PADDING = 12;

/**
 * Compute card width so 3 columns + gaps fill the screen perfectly.
 * MovieCard exports CARD_WIDTH = 130 as its default — we adapt it here
 * so the grid fits any screen width with proper gaps.
 */
const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_CARD_WIDTH = Math.floor(
  (SCREEN_WIDTH - 2 * HORIZONTAL_PADDING - (NUM_COLUMNS - 1) * CARD_GAP) / NUM_COLUMNS,
);

// ---------------------------------------------------------------------------
// Local PNG Assets (no Ionicons)
// ---------------------------------------------------------------------------
const ICON_BACK = require('../../assets/icons/arrow.png');
const ICON_SEARCH = require('../../assets/icons/search.png');

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const CategoryScreen: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // ── Guard: category from route params ──────────────────────────────────
  const category: string = route.params?.category ?? 'movies';
  const lang = i18n.language === 'ar' ? 'ar' : 'en';

  // ── State ─────────────────────────────────────────────────────────────
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // ── Derive screen title from CATEGORIES config ─────────────────────────
  const catConfig = CATEGORIES.find(c => c.key === category);
  const screenTitle = catConfig
    ? lang === 'ar'
      ? catConfig.labelAr
      : catConfig.labelEn
    : category;

  // ── Is the user actively searching? ────────────────────────────────────
  const isSearching = searchQuery.trim().length > 0;

  // ── Load category data ─────────────────────────────────────────────────
  const loadData = useCallback(
    async (forceRefresh = false) => {
      try {
        setLoading(true);
        setError(null);

        const data: any = await loadCategory(category as any, forceRefresh).catch(
          () => null,
        );

        if (!data) {
          setItems([]);
          return;
        }

        // Trending-style response: { movies: [...], episodes: [...] }
        if (data.movies && !data.Title) {
          setItems(
            (data.movies || [])
              .slice(0, 60)
              .map((m: any, i: number) => ({
                id: `trending_${i}`,
                Title: m.title ?? '',
                Category: m.content_type ?? 'movies',
                'Image Source': m.image ?? '',
                Source: m.link ?? '',
                Genres: [],
                GenresAr: [],
                Format: m.quality ?? '',
                Runtime: null,
                Country: null,
                Rating: m.imdb_rating ?? '',
                Views: m.views ?? '',
              })),
          );
          return;
        }

        // Plain array response
        if (Array.isArray(data)) {
          setItems(data);
          return;
        }

        // Dictionary response: { id: ContentItem, ... }
        if (typeof data === 'object') {
          const dict = data as Record<string, ContentItem>;
          Object.keys(dict).forEach(id => {
            if (dict[id]) dict[id].id = id;
          });
          setItems(Object.values(dict));
        }
      } catch (e: any) {
        setError(e.message || t('error_loading') || 'Failed to load content');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [category, t],
  );

  // ── Reload on screen focus ─────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // ── Clear search when search bar closes ────────────────────────────────
  useEffect(() => {
    if (!showSearch) {
      setSearchQuery('');
    }
  }, [showSearch]);

  // ── Pull-to-refresh ────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  // ── Navigate to Details screen ─────────────────────────────────────────
  const navigateToDetails = useCallback(
    (item: ContentItem) => {
      if (!item) return;
      navigation.navigate('Details', { item });
    },
    [navigation],
  );

  // ── Search toggle ──────────────────────────────────────────────────────
  const handleSearchToggle = useCallback(() => {
    setShowSearch(prev => !prev);
  }, []);

  // ── Search text change ─────────────────────────────────────────────────
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
  }, []);

  // ── Filter items by Title, Genres, Country ─────────────────────────────
  const displayItems = useMemo(() => {
    if (!isSearching) return items;

    const q = searchQuery.toLowerCase().trim();
    return items.filter(item => {
      if (!item) return false;
      return (
        item.Title?.toLowerCase().includes(q) ||
        item.Genres?.some((g: string) => g?.toLowerCase().includes(q)) ||
        item.GenresAr?.some((g: string) => g?.toLowerCase().includes(q)) ||
        item.Country?.toLowerCase().includes(q)
      );
    });
  }, [items, isSearching, searchQuery]);

  // ── Render single card ─────────────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: ContentItem }) => {
      if (!item) return null;
      return (
        <MovieCard
          item={item}
          width={GRID_CARD_WIDTH}
          onPress={() => navigateToDetails(item)}
        />
      );
    },
    [navigateToDetails],
  );

  // ── Stable key extractor ───────────────────────────────────────────────
  const keyExtractor = useCallback(
    (item: ContentItem, index: number) => item?.id ?? `item-${index}`,
    [],
  );

  // ── Empty / loading / error state ──────────────────────────────────────
  const ListEmptyComponent = useMemo(() => {
    if (loading) return <LoadingSpinner />;
    if (error) return <ErrorView errorText={error} onRetry={() => loadData(true)} />;

    return (
      <View style={styles.emptyContainer}>
        <Text style={[FONTS.body, styles.emptyText]}>
          {isSearching
            ? t('no_results') || 'No results found'
            : t('no_results') || 'No content available'}
        </Text>
      </View>
    );
  }, [loading, error, isSearching, t, loadData, styles]);

  // ── Results count label (shown when searching) ─────────────────────────
  const ResultsCount = useMemo(() => {
    if (!isSearching) return null;
    return (
      <View style={styles.resultsCountWrap}>
        <Text style={[FONTS.bodySmall, styles.resultsCountText]}>
          {displayItems.length}{' '}
          {displayItems.length === 1
            ? (t('result') || 'result')
            : (t('results') || 'results')}
        </Text>
      </View>
    );
  }, [isSearching, displayItems.length, t, styles]);

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {/* Back button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          accessibilityLabel="Go back"
          accessibilityRole="button">
          <Image
            source={ICON_BACK}
            style={[styles.headerIcon, { tintColor: colors.text }]}
            resizeMode="contain"
          />
        </TouchableOpacity>

        {/* Category title */}
        <Text style={[FONTS.heading1, styles.headerTitle]} numberOfLines={1}>
          {screenTitle}
        </Text>

        {/* Search toggle icon */}
        {!showSearch ? (
          <TouchableOpacity
            style={styles.searchToggleButton}
            onPress={handleSearchToggle}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityLabel="Open search"
            accessibilityRole="button">
            <Image
              source={ICON_SEARCH}
              style={[styles.headerIcon, { tintColor: colors.textSecondary }]}
              resizeMode="contain"
            />
          </TouchableOpacity>
        ) : (
          <>
            {/* Placeholder keeps title centered when search is open */}
            <View style={styles.searchToggleButton} />
          </>
        )}
      </View>

      {/* ── Collapsible Search Bar ─────────────────────────────────────── */}
      {showSearch && (
        <View style={styles.searchBarContainer}>
          <SearchBar
            show={true}
            value={searchQuery}
            onChangeText={handleSearchChange}
            onToggle={handleSearchToggle}
            placeholder={t('search_placeholder') || 'Search by title, genre, or country...'}
          />
        </View>
      )}

      {/* ── Results count ──────────────────────────────────────────────── */}
      {ResultsCount}

      {/* ── Content Grid ───────────────────────────────────────────────── */}
      <FlatList
        data={displayItems}
        numColumns={NUM_COLUMNS}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={ListEmptyComponent}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={[
          styles.gridContent,
          { paddingBottom: insets.bottom + 80 },
        ]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={9}
        maxToRenderPerBatch={9}
        windowSize={5}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surfaceElevated}
          />
        }
      />
    </View>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════════════════
const createStyles = (colors: any) =>
  StyleSheet.create({
    // ── Root ──
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    // ── Header ──
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
      gap: SPACING.md,
      backgroundColor: colors.surface,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerIcon: {
      width: 20,
      height: 20,
    },
    headerTitle: {
      flex: 1,
      color: colors.text,
    },
    searchToggleButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },

    // ── Search bar ──
    searchBarContainer: {
      paddingHorizontal: SPACING.lg,
      paddingBottom: SPACING.md,
      backgroundColor: colors.surface,
    },

    // ── Results count ──
    resultsCountWrap: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.sm,
    },
    resultsCountText: {
      color: colors.textMuted,
    },

    // ── Grid ──
    gridContent: {
      paddingHorizontal: HORIZONTAL_PADDING,
      paddingTop: SPACING.xs,
    },
    columnWrapper: {
      gap: CARD_GAP,
      marginBottom: CARD_GAP,
    },

    // ── Empty state ──
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 140,
    },
    emptyText: {
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
