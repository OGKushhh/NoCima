import React, { useState, useCallback, useEffect, useRef, memo, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Text,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchContent } from '../services/metadataService';
import { ContentItem } from '../types';
import { MovieCard } from '../components/MovieCard';
import { SearchBar } from '../components/SearchBar';
import { ErrorView } from '../components/ErrorView';
import { SPACING, RADIUS } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../hooks/useTheme';

// =============================================================================
// Constants
// =============================================================================
const SCREEN_WIDTH = Dimensions.get('window').width;
const NUM_COLUMNS = 3;
const GRID_PADDING = SPACING.lg; // 16
const GRID_GAP = SPACING.sm; // 8
const CARD_WIDTH_CALC =
  (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) /
  NUM_COLUMNS;
const DEBOUNCE_MS = 500;
const SKELETON_COUNT = 9;

// Local PNG icon assets
const ICON_ARROW = require('../../assets/icons/arrow.png');
const ICON_SEARCH = require('../../assets/icons/search.png');

// =============================================================================
// useDebounce hook
// =============================================================================
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// =============================================================================
// SkeletonCard — shimmer placeholder for loading state
// =============================================================================
interface SkeletonCardProps {
  width: number;
}

const SkeletonCard: React.FC<SkeletonCardProps> = ({ width }) => {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  const skeletonStyles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          borderRadius: RADIUS.lg,
          backgroundColor: colors.surfaceElevated,
          overflow: 'hidden',
        },
        poster: {
          width: '100%',
          backgroundColor: colors.surfaceElevated,
          borderRadius: RADIUS.lg,
          overflow: 'hidden',
          justifyContent: 'center',
          alignItems: 'center',
        },
        shimmerOverlay: {
          height: '100%',
          borderRadius: RADIUS.sm,
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
        },
        titleRow: {
          paddingHorizontal: 4,
          paddingTop: 8,
        },
        subtitleRow: {
          paddingHorizontal: 4,
          paddingTop: 6,
        },
        textLine: {
          height: 12,
          borderRadius: 4,
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
        },
      }),
    [colors],
  );

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  const posterHeight = width * 1.5; // 2:3 poster ratio
  const shimmerOverlayWidth = width * 0.6;

  return (
    <View style={[skeletonStyles.container, { width }]}>
      {/* Poster skeleton */}
      <View style={[skeletonStyles.poster, { height: posterHeight }]}>
        <Animated.View
          style={[
            skeletonStyles.shimmerOverlay,
            {
              width: shimmerOverlayWidth,
              opacity,
            },
          ]}
        />
      </View>

      {/* Title skeleton line */}
      <View style={skeletonStyles.titleRow}>
        <Animated.View
          style={[skeletonStyles.textLine, { width: '80%', opacity }]}
        />
      </View>

      {/* Subtitle skeleton line */}
      <View style={skeletonStyles.subtitleRow}>
        <Animated.View
          style={[skeletonStyles.textLine, { width: '55%', opacity }]}
        />
      </View>
    </View>
  );
};

// =============================================================================
// Memoized MovieCard wrapper
// =============================================================================
const MovieCardItem = memo<{ item: ContentItem; onPress: () => void }>(
  ({ item, onPress }) => (
    <MovieCard item={item} onPress={onPress} width={CARD_WIDTH_CALC} />
  ),
  (prev, next) =>
    prev.item?.id === next.item?.id && prev.onPress === next.onPress,
);
MovieCardItem.displayName = 'MovieCardItem';

// =============================================================================
// Skeleton list data for loading state
// =============================================================================
const SKELETON_DATA = Array.from({ length: SKELETON_COUNT }, (_, i) => ({
  key: `skeleton-${i}`,
}));

// =============================================================================
// SearchScreen
// =============================================================================
export const SearchScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // ── Dynamic styles ──────────────────────────────────────────────────────
  const styles = useMemo(
    () =>
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
          gap: SPACING.sm,
        },
        backButton: {
          width: 40,
          height: 40,
          justifyContent: 'center',
          alignItems: 'center',
        },
        backIcon: {
          width: 24,
          height: 24,
          tintColor: colors.text,
        },
        headerTitle: {
          ...FONTS.heading3,
          color: colors.text,
          fontSize: 20,
        },
        searchBarWrap: {
          flex: 1,
        },

        // ── Body ──
        body: {
          flex: 1,
        },

        // ── Results count ──
        resultCount: {
          ...FONTS.captionSmall,
          color: colors.textMuted,
          paddingHorizontal: SPACING.lg,
          paddingTop: SPACING.xs,
          paddingBottom: SPACING.sm,
        },

        // ── Grid ──
        grid: {
          paddingHorizontal: GRID_PADDING,
        },
        row: {
          gap: GRID_GAP,
        },

        // ── Loading skeleton grid ──
        loadingGridWrap: {
          flex: 1,
          paddingTop: SPACING.xs,
        },

        // ── Empty state ──
        emptyContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingVertical: 80,
          paddingHorizontal: SPACING.xxl,
        },
        emptyIcon: {
          width: 56,
          height: 56,
          tintColor: colors.textMuted,
          opacity: 0.6,
          marginBottom: SPACING.lg,
        },
        emptyTitle: {
          ...FONTS.heading3,
          color: colors.textSecondary,
          marginBottom: SPACING.sm,
        },
        emptySubtitle: {
          ...FONTS.body,
          color: colors.textMuted,
          textAlign: 'center',
        },
      }),
    [colors],
  );

  // ── State ──────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const debouncedQuery = useDebounce(query, DEBOUNCE_MS);

  // Keep the last good query so retry can re-fire the effect
  const lastQueryRef = useRef('');

  // ── Navigation helper ──────────────────────────────────────────────────
  const goToDetails = useCallback(
    (item: ContentItem) => {
      if (!item) return;
      navigation.navigate('Details', { item });
    },
    [navigation],
  );

  // ── Retry — re-trigger the last search ─────────────────────────────────
  const handleRetry = useCallback(() => {
    setError(null);
    setHasSearched(false);
    // Restore the last query if it was cleared, then bump retry counter
    if (lastQueryRef.current) {
      setQuery(lastQueryRef.current);
    }
    setRetryTrigger(prev => prev + 1);
  }, []);

  // ── Search effect (debounced) ──────────────────────────────────────────
  useEffect(() => {
    // Guard: skip empty / whitespace-only queries
    if (!debouncedQuery?.trim()) {
      setResults([]);
      setHasSearched(false);
      setError(null);
      return;
    }

    // Remember for retry
    lastQueryRef.current = debouncedQuery;

    let cancelled = false;

    const performSearch = async () => {
      setLoading(true);
      setError(null);

      try {
        const found = await searchContent(debouncedQuery.trim());

        if (cancelled) return;

        // Filter out null / undefined items — defensive guard
        const validResults: ContentItem[] =
          found?.filter(
            (item): item is ContentItem =>
              !!item && typeof item === 'object' && !!item?.id,
          ) ?? [];

        setResults(validResults);
        setHasSearched(true);
      } catch (err: any) {
        if (cancelled) return;
        console.warn('[SearchScreen] Search failed:', err?.message);
        setError(
          err?.message ?? 'Something went wrong. Please try again.',
        );
        setResults([]);
        setHasSearched(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    performSearch();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, retryTrigger]);

  // ── Render: skeleton item ──────────────────────────────────────────────
  const renderSkeletonItem = useCallback(() => {
    return <SkeletonCard width={CARD_WIDTH_CALC} />;
  }, []);

  // ── Render: result card ────────────────────────────────────────────────
  const renderResultItem = useCallback(
    ({ item }: { item: ContentItem }) => {
      if (!item) return null;
      return (
        <MovieCardItem
          item={item}
          onPress={() => goToDetails(item)}
        />
      );
    },
    [goToDetails],
  );

  // ── Render: empty state ────────────────────────────────────────────────
  const renderEmptyState = useCallback(() => {
    if (loading || error) return null;

    return (
      <View style={styles.emptyContainer}>
        <Image
          source={ICON_SEARCH}
          style={styles.emptyIcon}
          resizeMode="contain"
        />
        <Text style={styles.emptyTitle}>No results found</Text>
        <Text style={styles.emptySubtitle}>
          Try different keywords or check your spelling
        </Text>
      </View>
    );
  }, [loading, error, styles]);

  // ── Render: loading skeleton grid ──────────────────────────────────────
  const renderLoadingGrid = useCallback(
    () => (
      <View style={styles.loadingGridWrap}>
        <FlatList
          data={SKELETON_DATA}
          keyExtractor={item => item.key}
          numColumns={NUM_COLUMNS}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          scrollEnabled={false}
          renderItem={renderSkeletonItem}
        />
      </View>
    ),
    [renderSkeletonItem, styles],
  );

  // ── Main render ────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ── Header: Back + Title + SearchBar ── */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityLabel="Go back"
          accessibilityRole="button">
          <Image
            source={ICON_ARROW}
            style={styles.backIcon}
            resizeMode="contain"
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Search</Text>

        <View style={styles.searchBarWrap}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search movies, series, anime..."
          />
        </View>
      </View>

      {/* ── Body ── */}
      <View style={styles.body}>
        {error && !loading ? (
          /* ── Error state ── */
          <ErrorView
            errorText="Search failed"
            subtitle={error}
            onRetry={handleRetry}
            onGoBack={() => navigation.goBack()}
          />
        ) : loading ? (
          /* ── Loading skeleton grid ── */
          renderLoadingGrid()
        ) : (
          /* ── Results / Empty ── */
          <>
            {/* Results count label */}
            {hasSearched && !error && results.length > 0 && (
              <Text style={styles.resultCount}>
                {results.length} result{results.length !== 1 ? 's' : ''} found
              </Text>
            )}

            <FlatList
              data={results}
              keyExtractor={(item) =>
                item?.id ?? `fallback-${Math.random().toString(36).slice(2)}`
              }
              numColumns={NUM_COLUMNS}
              columnWrapperStyle={styles.row}
              contentContainerStyle={[
                styles.grid,
                { paddingBottom: insets.bottom + SPACING.xxxl },
              ]}
              showsVerticalScrollIndicator={false}
              initialNumToRender={12}
              maxToRenderPerBatch={6}
              windowSize={5}
              removeClippedSubviews
              ListEmptyComponent={hasSearched ? renderEmptyState : null}
              renderItem={renderResultItem}
            />
          </>
        )}
      </View>
    </View>
  );
};
