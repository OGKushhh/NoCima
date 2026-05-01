/**
 * HomeScreen — Netflix-style dark navy streaming home
 *
 * Layout:
 *   1. Fixed header — "AbdoBest" branding + search icon button
 *   2. Expandable search bar — slides down, local title filtering
 *   3. Scrollable content (FlatList + RefreshControl):
 *      a. Trending          — horizontal carousel
 *      b. Featured           — horizontal carousel
 *      c. Continue Watching  — horizontal carousel (optional)
 *      d. Movies             — horizontal carousel
 *      e. Series             — horizontal carousel
 *      f. Anime              — horizontal carousel
 *      g. TV Shows           — horizontal carousel
 *
 * Key behaviours:
 *   - useFocusEffect reloads only when stale > 24 h
 *   - Pull-to-refresh forces a fresh fetch
 *   - Search filters allItems locally by Title (no API call)
 *   - Skeleton placeholders while loading
 *
 * Safety rules:
 *   - MovieCard.onPress is () => void — always wrap: onPress={() => goToDetails(item)}
 *   - recordPlay is sync void — NEVER call .catch()
 *   - incrementViewCount does NOT exist — NEVER import it
 *   - All arrays filtered for null/undefined; all item properties use optional chaining
 */

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  memo,
} from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  StatusBar,
  Text,
  TouchableOpacity,
  Image,
  Animated,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  loadCategory,
} from '../services/metadataService';
import { trySyncViews } from '../services/viewService';
import { ContentItem, TrendingItem } from '../types';
import { MovieCard } from '../components/MovieCard';
import { SectionHeader } from '../components/SectionHeader';
import { SearchBar } from '../components/SearchBar';
import { ErrorView } from '../components/ErrorView';
import { SPACING } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeColors } from '../hooks/useTheme';

// ===========================================================================
// Constants
// ===========================================================================

/** Card width used in every horizontal carousel */
const CAROUSEL_CARD_W = 130;

/** Don't reload from API if last fetch was within 24 hours */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/** Main content categories loaded in parallel */
const MAIN_CATEGORIES = ['movies', 'series', 'anime', 'tvshows'] as const;

/** Number of skeleton placeholder cards per row */
const SKELETON_COUNT = 5;

// ---------------------------------------------------------------------------
// Local PNG icon assets (no Ionicons)
// ---------------------------------------------------------------------------
const ICON_SEARCH = require('../../assets/icons/search.png');
const ICON_TRENDING = require('../../assets/icons/eyes.png');
const ICON_FEATURED = require('../../assets/icons/clapboard.png');
const ICON_TV = require('../../assets/icons/tv.png');

// ===========================================================================
// Helpers
// ===========================================================================

/** Fisher-Yates shuffle */
const shuffleArray = <T,>(arr: T[]): T[] => {
  const s = [...arr];
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
};

/** Pick up to n random elements */
const pickRandom = <T,>(arr: T[], n: number): T[] =>
  arr.length <= n ? shuffleArray(arr) : shuffleArray(arr).slice(0, n);

/** Remove null / undefined entries (type-safe) */
const safeFilter = <T,>(arr: (T | null | undefined)[]): T[] =>
  arr.filter((item): item is T => item != null);

/** Convert a TrendingItem into a ContentItem so MovieCard can render it */
const mapTrendingToItem = (t: TrendingItem): ContentItem => ({
  id: t.link || t.title,
  Title: t.title,
  Category: t.content_type || 'movies',
  'Image Source': t.image,
  Source: t.link,
  Genres: [],
  GenresAr: [],
  Format: t.quality || '',
  Runtime: null,
  Country: null,
  Rating: t.imdb_rating,
  Views: t.views,
});

// ===========================================================================
// Skeleton placeholders (shown while data is loading)
// ===========================================================================

/** Dynamic skeleton styles — takes theme colors so it works outside the component */
const createSkStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    skeletonCard: {
      marginRight: 10,
    },
    skeletonPoster: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
    },
    skeletonLine: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 4,
      height: 12,
      marginTop: 8,
    },
    skeletonHeader: {
      height: 24,
      width: 150,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 6,
      marginBottom: SPACING.md,
      marginLeft: SPACING.lg,
    },
    skeletonList: {
      flexDirection: 'row',
      paddingLeft: SPACING.lg,
    },
    skeletonSection: {
      marginBottom: 24,
    },
  });

/** A single skeleton card — gray rectangle with surfaceElevated bg */
const SkeletonCard: React.FC<{ width?: number; colors: ThemeColors }> = memo(
  ({ width = CAROUSEL_CARD_W, colors }) => {
    const skStyles = useMemo(() => createSkStyles(colors), [colors]);
    return (
      <View style={[skStyles.skeletonCard, { width }]}>
        <View style={[skStyles.skeletonPoster, { height: width * 1.5 }]} />
        <View style={[skStyles.skeletonLine, { width: width * 0.8 }]} />
        <View style={[skStyles.skeletonLine, { width: width * 0.5, height: 10 }]} />
      </View>
    );
  },
);
SkeletonCard.displayName = 'SkeletonCard';

/** A full skeleton section: header bar + 5 skeleton cards */
const SkeletonRow: React.FC<{ colors: ThemeColors }> = memo(({ colors }) => {
  const skStyles = useMemo(() => createSkStyles(colors), [colors]);
  return (
    <View style={skStyles.skeletonSection}>
      <View style={skStyles.skeletonHeader} />
      <View style={skStyles.skeletonList}>
        {Array.from({ length: SKELETON_COUNT }, (_, i) => (
          <SkeletonCard key={i} colors={colors} />
        ))}
      </View>
    </View>
  );
});
SkeletonRow.displayName = 'SkeletonRow';

// ===========================================================================
// HRow — memoised horizontal carousel
// ===========================================================================

/** Static layout styles for HRow (no color references — safe at module level) */
const hRowStyles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  hList: {
    paddingLeft: SPACING.lg,
    paddingRight: SPACING.lg,
  },
  cardWrap: {
    marginRight: 10,
  },
});

interface HRowProps {
  title: string;
  items: ContentItem[];
  icon?: any;
  onSeeAll?: () => void;
  onPressItem: (item: ContentItem) => void;
}

const HRow: React.FC<HRowProps> = memo(
  ({ title, items, icon, onSeeAll, onPressItem }) => {
    if (!items?.length) return null;

    return (
      <View style={hRowStyles.section}>
        <SectionHeader title={title} icon={icon} onSeeAll={onSeeAll} />
        <FlatList
          data={items}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={hRowStyles.hList}
          keyExtractor={(i) => i?.id ?? Math.random().toString(36)}
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) =>
            item ? (
              <View style={hRowStyles.cardWrap}>
                <MovieCard
                  item={item}
                  width={CAROUSEL_CARD_W}
                  onPress={() => onPressItem(item)}
                />
              </View>
            ) : null
          }
        />
      </View>
    );
  },
  (prev, next) =>
    prev.title === next.title &&
    prev.items.length === next.items.length &&
    prev.items[0]?.id === next.items[0]?.id,
);
HRow.displayName = 'HRow';

// ===========================================================================
// HomeScreen
// ===========================================================================

export const HomeScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // ── Data state ──────────────────────────────────────────────────────
  const [trending, setTrending] = useState<ContentItem[]>([]);
  const [featured, setFeatured] = useState<ContentItem[]>([]);
  const [continueWatching, setContinueWatching] = useState<ContentItem[]>([]);
  const [movies, setMovies] = useState<ContentItem[]>([]);
  const [series, setSeries] = useState<ContentItem[]>([]);
  const [anime, setAnime] = useState<ContentItem[]>([]);
  const [tvshows, setTvshows] = useState<ContentItem[]>([]);
  const [allItems, setAllItems] = useState<ContentItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Search state ────────────────────────────────────────────────────
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ContentItem[]>([]);

  // ── Refs ────────────────────────────────────────────────────────────
  const lastLoadTime = useRef(0);

  // ── Search bar slide-down animation ─────────────────────────────────
  const searchProgress = useRef(new Animated.Value(0)).current;
  const animatedSearchHeight = useMemo(
    () =>
      searchProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 56],
      }),
    [searchProgress],
  );

  const openSearch = useCallback(() => {
    setSearchExpanded(true);
    Animated.spring(searchProgress, {
      toValue: 1,
      useNativeDriver: false,
      speed: 14,
      bounciness: 0,
    }).start();
  }, [searchProgress]);

  const closeSearch = useCallback(() => {
    Animated.spring(searchProgress, {
      toValue: 0,
      useNativeDriver: false,
      speed: 14,
      bounciness: 0,
    }).start(() => {
      setSearchExpanded(false);
      setSearchQuery('');
      setSearchResults([]);
    });
  }, [searchProgress]);

  // ── Load all data ───────────────────────────────────────────────────
  const loadData = useCallback(async (force = false) => {
    try {
      setError(null);

      // Fire all category fetches in parallel
      const [trendingData, featuredData, ...categoryResults] = await Promise.all([
        loadCategory('trending' as any, force).catch(() => null),
        loadCategory('featured' as any, force).catch(() => null),
        ...MAIN_CATEGORIES.map((cat) =>
          loadCategory(cat as any, force).catch(() => null),
        ),
      ]);

      // ── Trending ──────────────────────────────────────────────────
      if (
        trendingData &&
        typeof trendingData === 'object' &&
        !Array.isArray(trendingData) &&
        (trendingData as any).movies
      ) {
        const tMovies = safeFilter(
          (trendingData as any).movies as (TrendingItem | null | undefined)[],
        );
        setTrending(tMovies.map(mapTrendingToItem).slice(0, 20));

        // Episodes → "Continue Watching" (optional)
        const tEpisodes = safeFilter(
          (trendingData as any).episodes as (TrendingItem | null | undefined)[],
        );
        if (tEpisodes.length > 0) {
          setContinueWatching(tEpisodes.map(mapTrendingToItem).slice(0, 15));
        }
      }

      // ── Featured ──────────────────────────────────────────────────
      if (
        featuredData &&
        typeof featuredData === 'object' &&
        !Array.isArray(featuredData) &&
        (featuredData as any).movies
      ) {
        const fItems = safeFilter(
          (featuredData as any).movies as (TrendingItem | null | undefined)[],
        );
        setFeatured(fItems.map(mapTrendingToItem).slice(0, 20));
      }

      // ── Main categories ───────────────────────────────────────────
      const categoryMap: Record<string, ContentItem[]> = {};
      const merged: ContentItem[] = [];

      MAIN_CATEGORIES.forEach((cat, idx) => {
        const data = categoryResults[idx];
        if (!data || typeof data !== 'object' || Array.isArray(data)) return;
        // Skip TrendingContent shape (has .movies but no .Title)
        if ((data as any).movies && !(data as any).Title) return;
        const items = safeFilter(
          Object.values(data) as (ContentItem | null | undefined)[],
        );
        categoryMap[cat] = items;
        merged.push(...items);
      });

      setMovies(categoryMap['movies']?.slice(0, 20) ?? []);
      setSeries(categoryMap['series']?.slice(0, 20) ?? []);
      setAnime(categoryMap['anime']?.slice(0, 20) ?? []);
      setTvshows(categoryMap['tvshows']?.slice(0, 20) ?? []);
      setAllItems(merged);

      lastLoadTime.current = Date.now();

      // Background: sync any pending view counts (fire-and-forget)
      trySyncViews().catch(() => {});
    } catch (err: any) {
      setError(err?.message || String(err) || 'Something went wrong');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ── Focus effect: reload only if data is stale (>24 h) ──────────────
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (lastLoadTime.current === 0 || now - lastLoadTime.current > STALE_THRESHOLD_MS) {
        loadData();
      }
    }, [loadData]),
  );

  // ── Pull-to-refresh ────────────────────────────────────────────────
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  // ── Navigation helpers ──────────────────────────────────────────────
  const goToDetails = useCallback(
    (item: ContentItem) => navigation.navigate('Details', { item }),
    [navigation],
  );

  const goToCategory = useCallback(
    (cat: string) => navigation.navigate('Category', { category: cat }),
    [navigation],
  );

  // ── Local search — filter allItems by title (no API) ───────────────
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);

      if (!query.trim()) {
        setSearchResults([]);
        return;
      }

      const lower = query.toLowerCase().trim();
      const filtered = allItems.filter((item) =>
        item?.Title?.toLowerCase().includes(lower),
      );
      setSearchResults(safeFilter(filtered));
    },
    [allItems],
  );

  // ── Derived flags ──────────────────────────────────────────────────
  const isSearchActive = searchExpanded && searchQuery.trim().length > 0;

  // ── Dynamic styles (re-created when theme colors change) ────────────
  const styles = useMemo(
    () =>
      StyleSheet.create({
        // ── Root ──
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },

        // ── Header (fixed top) ──
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: SPACING.lg,
          paddingBottom: SPACING.sm,
        },
        appTitle: {
          color: colors.primary,
        },
        searchIconBtn: {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.surface,
          justifyContent: 'center',
          alignItems: 'center',
        },
        headerIcon: {
          width: 20,
          height: 20,
        },

        // ── Search bar animation wrapper ──
        animatedSearchWrap: {
          backgroundColor: colors.background,
        },
        searchBarInner: {
          paddingHorizontal: SPACING.lg,
          paddingBottom: SPACING.sm,
        },

        // ── Skeleton loading area ──
        skeletonArea: {
          paddingTop: SPACING.sm,
        },

        // ── Search results grid ──
        searchGrid: {
          paddingHorizontal: SPACING.sm,
          paddingBottom: 80,
          paddingTop: SPACING.sm,
        },
        searchRow: {
          justifyContent: 'space-between',
          paddingHorizontal: SPACING.xs,
        },

        // ── Empty search state ──
        emptySearch: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          marginTop: 80,
        },
        emptySearchIcon: {
          width: 52,
          height: 52,
          marginBottom: SPACING.md,
          opacity: 0.4,
        },
        emptySearchText: {
          color: colors.textMuted,
        },
      }),
    [colors],
  );

  // =====================================================================
  // RENDER
  // =====================================================================

  // ── 1. Loading state — skeleton placeholders ───────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
          <Text style={[styles.appTitle, FONTS.heading1]}>AbdoBest</Text>
          <TouchableOpacity
            style={styles.searchIconBtn}
            onPress={openSearch}
            activeOpacity={0.7}
          >
            <Image
              source={ICON_SEARCH}
              style={[styles.headerIcon, { tintColor: colors.text }]}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>

        {/* Animated search bar (collapsed while loading) */}
        <Animated.View
          style={[
            styles.animatedSearchWrap,
            {
              height: animatedSearchHeight,
              overflow: 'hidden' as any,
            },
          ]}
        >
          <View style={styles.searchBarInner}>
            <SearchBar
              value={searchQuery}
              onChangeText={handleSearch}
              placeholder={t('search_placeholder')}
              show={searchExpanded}
              onToggle={closeSearch}
            />
          </View>
        </Animated.View>

        {/* Skeleton rows */}
        <View style={styles.skeletonArea}>
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonRow key={i} colors={colors} />
          ))}
        </View>
      </View>
    );
  }

  // ── 2. Error state — nothing loaded ─────────────────────────────────
  if (error && allItems.length === 0) {
    return <ErrorView errorText={error} onRetry={() => loadData(true)} />;
  }

  // ── 3. Search active — search results grid ─────────────────────────
  if (isSearchActive) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
          <Text style={[styles.appTitle, FONTS.heading1]}>AbdoBest</Text>
          <TouchableOpacity
            style={styles.searchIconBtn}
            onPress={closeSearch}
            activeOpacity={0.7}
          >
            <Image
              source={ICON_SEARCH}
              style={[styles.headerIcon, { tintColor: colors.text }]}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>

        {/* Search bar (visible, no animation needed since we're in full search mode) */}
        <View style={styles.searchBarInner}>
          <SearchBar
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder={t('search_placeholder')}
            show={true}
            onToggle={closeSearch}
          />
        </View>

        {/* Search results */}
        {searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            numColumns={3}
            keyExtractor={(i) => i?.id ?? Math.random().toString(36)}
            contentContainerStyle={styles.searchGrid}
            columnWrapperStyle={styles.searchRow}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) =>
              item ? (
                <MovieCard
                  item={item}
                  onPress={() => goToDetails(item)}
                />
              ) : null
            }
          />
        ) : (
          <View style={styles.emptySearch}>
            <Image
              source={ICON_SEARCH}
              style={[styles.emptySearchIcon, { tintColor: colors.textMuted }]}
              resizeMode="contain"
            />
            <Text style={[styles.emptySearchText, FONTS.body]}>
              {t('no_results')}
            </Text>
          </View>
        )}
      </View>
    );
  }

  // ── 4. Main home layout ────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.background} />

      {/* ── Fixed header ──────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <Text style={[styles.appTitle, FONTS.heading1]}>AbdoBest</Text>
        <TouchableOpacity
          style={styles.searchIconBtn}
          onPress={openSearch}
          activeOpacity={0.7}
        >
          <Image
            source={ICON_SEARCH}
            style={[styles.headerIcon, { tintColor: colors.text }]}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>

      {/* ── Animated search bar (slides down) ────────────────────── */}
      <Animated.View
        style={[
          styles.animatedSearchWrap,
          {
            height: animatedSearchHeight,
            overflow: 'hidden' as any,
          },
        ]}
      >
        <View style={styles.searchBarInner}>
          <SearchBar
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder={t('search_placeholder')}
            show={searchExpanded}
            onToggle={closeSearch}
          />
        </View>
      </Animated.View>

      {/* ── Scrollable content with carousels ────────────────────── */}
      <FlatList
        data={[]}
        renderItem={() => null}
        showsVerticalScrollIndicator={false}
        keyExtractor={() => '__home_list__'}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <>
            {/* Trending */}
            <HRow
              title={t('trending') || 'Trending'}
              items={trending}
              icon={ICON_TRENDING}
              onPressItem={goToDetails}
            />

            {/* Featured */}
            <HRow
              title={t('featured') || 'Featured'}
              items={featured}
              icon={ICON_FEATURED}
              onPressItem={goToDetails}
            />

            {/* Continue Watching (optional — only if data available) */}
            {continueWatching.length > 0 && (
              <HRow
                title={t('continue_watching') || 'Continue Watching'}
                items={continueWatching}
                icon={ICON_TV}
                onPressItem={goToDetails}
              />
            )}

            {/* Movies */}
            <HRow
              title={t('movies') || 'Movies'}
              items={movies}
              icon={ICON_FEATURED}
              onSeeAll={() => goToCategory('movies')}
              onPressItem={goToDetails}
            />

            {/* Series */}
            <HRow
              title={t('series') || 'Series'}
              items={series}
              icon={ICON_TV}
              onSeeAll={() => goToCategory('series')}
              onPressItem={goToDetails}
            />

            {/* Anime */}
            <HRow
              title={t('anime') || 'Anime'}
              items={anime}
              icon={ICON_TV}
              onSeeAll={() => goToCategory('anime')}
              onPressItem={goToDetails}
            />

            {/* TV Shows */}
            <HRow
              title={t('tvshows') || 'TV Shows'}
              items={tvshows}
              icon={ICON_TV}
              onSeeAll={() => goToCategory('tvshows')}
              onPressItem={goToDetails}
            />
          </>
        }
      />
    </View>
  );
};
