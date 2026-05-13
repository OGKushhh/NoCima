import React, {
  useState, useCallback, useMemo, useRef, useEffect,
} from 'react';
import {
  View, Text, StyleSheet, FlatList, RefreshControl, StatusBar,
  TouchableOpacity, Image, TextInput, ActivityIndicator,
  Dimensions, useWindowDimensions,
} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import FastImage from 'react-native-fast-image';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';
import {
  loadCategory, getMoviesArray, searchContent,
  BackgroundUpdateCallback,
} from '../services/metadataService';
import {ContentItem} from '../types';
import {MovieCard, CARD_WIDTH} from '../components/MovieCard';
import {Colors} from '../theme/colors';
import AdsterraBanner from '../ads/AdsterraBanner';
import {getViewCount} from '../services/api';
import {retrySyncViews} from '../services/viewService';

const {width: SW} = Dimensions.get('window');
const HERO_H = SW * 0.6;

// ── Categories we always load and display as chips ──────────────────────────
const CATEGORIES = [
  'movies',
  'dubbed-movies',
  'hindi',
  'anime',
  'asian-movies',
  'anime-movies',
  'series',
  'tvshows',
  'asian-series',
  'arabic-series',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// HeroBanner – horizontal swipe, no timer
// ─────────────────────────────────────────────────────────────────────────────
const HeroBanner: React.FC<{
  items: ContentItem[];
  onPress: (item: ContentItem) => void;
}> = ({items, onPress}) => {
  const {t} = useTranslation();

  if (!items.length) return null;

  return (
    <View style={heroStyles.container}>
      <FlatList
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={i => i.id}
        getItemLayout={(_, idx) => ({
          length: SW - 32,
          offset: (SW - 32) * idx,
          index: idx,
        })}
        renderItem={({item}) => {
          const raw = item as any;
          const year = String(raw.ReleaseDate || raw.Year || '').slice(0, 4);
          const genres =
            (item.GenresAr?.length ? item.GenresAr : item.Genres)?.slice(0, 2) ?? [];
          const rating = raw.Rating || '';
          const quality = item.Format || raw.quality || '';
          const imageSource = item['Image Source'] || (raw as any).Image;

          return (
            <TouchableOpacity
              style={heroStyles.card}
              activeOpacity={0.92}
              onPress={() => onPress(item)}
            >
              <FastImage
                source={{uri: imageSource}}
                style={StyleSheet.absoluteFillObject}
                resizeMode={FastImage.resizeMode.cover}
              />
              <View style={heroStyles.overlay}>
                {genres.length > 0 && (
                  <View style={heroStyles.genreRow}>
                    {genres.map((g, i) => (
                      <View key={i} style={heroStyles.genrePill}>
                        <Text style={heroStyles.genreTxt}>{g}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={heroStyles.title} numberOfLines={2}>
                  {item.Title}
                </Text>
                <View style={heroStyles.metaRow}>
                  {year ? <Text style={heroStyles.metaText}>{year}</Text> : null}
                  {rating ? (
                    <View style={heroStyles.ratingBadge}>
                      <Image
                        source={require('../../assets/icons/star.png')}
                        style={{width: 10, height: 10, tintColor: '#FFD700'}}
                      />
                      <Text style={heroStyles.metaGold}>{rating}</Text>
                    </View>
                  ) : null}
                  {quality ? (
                    <View style={heroStyles.qualityBadge}>
                      <Text style={heroStyles.metaText}>{quality}</Text>
                    </View>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={heroStyles.playBtn}
                  onPress={() => onPress(item)}
                  activeOpacity={0.8}
                >
                  <Text style={heroStyles.playIcon}>▶</Text>
                  <Text style={heroStyles.playText}>{t('play')}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// HomeScreen
// ─────────────────────────────────────────────────────────────────────────────
export const HomeScreen: React.FC = () => {
  const {t, i18n} = useTranslation();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';

  const [categoryData, setCategoryData] = useState<Record<string, ContentItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ContentItem[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const hasMountedRef = useRef(false);

  // ── Background update handler (stale-while-revalidate) ────────────────────
  // Called by loadCategory when a stale category finishes re-fetching.
  // It only updates the one category – no flicker, no spinner.
  const onBackgroundUpdate = useCallback<BackgroundUpdateCallback>(
    (category, freshData) => {
      const freshItems = getMoviesArray(freshData as any);
      setCategoryData(prev => ({...prev, [category]: freshItems}));
    },
    [],
  );

  // ── Core loader ───────────────────────────────────────────────────────────
  const loadData = useCallback(
    async (force = false) => {
      try {
        setError(null);

        const results = await Promise.all(
          CATEGORIES.map(cat =>
            loadCategory(
              cat as any,
              force,
              force ? undefined : onBackgroundUpdate, // background refresh when not forced
            )
              .then(d => ({cat, items: d ? getMoviesArray(d as any) : []}))
              .catch(() => ({cat, items: [] as ContentItem[]})),
          ),
        );

        const map: Record<string, ContentItem[]> = {};
        for (const r of results) map[r.cat] = r.items;
        setCategoryData(map);

        // Background view enrichment for movies (optional)
        const movArr = map['movies'] ?? [];
        if (movArr.length) {
          Promise.all(
            movArr.slice(0, 30).map(async item => {
              try {
                const v = await getViewCount('movies', item.id);
                return v > 0 ? {...item, Views: String(v)} : item;
              } catch {
                return item;
              }
            }),
          )
            .then(enriched => {
              const live = enriched.filter(
                i => parseInt((i as any).Views || '0', 10) > 0,
              );
              if (live.length >= 4) {
                setCategoryData(prev => ({...prev, movies: live}));
              }
            })
            .catch(() => {});
        }

        retrySyncViews().catch(() => {});
      } catch (err: any) {
        setError(err.message || 'Failed to load');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [onBackgroundUpdate],
  );

  useFocusEffect(
    useCallback(() => {
      if (!hasMountedRef.current) {
        hasMountedRef.current = true;
        loadData(false);
      } else {
        loadData(false); // silent stale refresh on refocus
      }
    }, [loadData]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, [loadData]);

  // ── Hero items: pick up to 5 movies with poster ──────────────────────────
  const heroItems = useMemo(() => {
    const movies = categoryData['movies'] ?? [];
    return movies.filter(i => !!(i['Image Source'] || (i as any).Image)).slice(0, 5);
  }, [categoryData]);

  // ── Trending row (most viewed from all categories) ────────────────────────
  const trending = useMemo(() => {
    const all = Object.values(categoryData).flat();
    const withViews = all.filter(
      i => parseInt((i as any).Views || '0', 10) > 0,
    );
    if (withViews.length >= 4) {
      return withViews
        .sort((a, b) => parseInt((b as any).Views || '0', 10) - parseInt((a as any).Views || '0', 10))
        .slice(0, 20);
    }
    // Fallback: just show some movies
    return (categoryData['movies'] ?? []).slice(0, 20);
  }, [categoryData]);

  // ── Navigation helpers ────────────────────────────────────────────────────
  const goDetails = useCallback(
    (item: ContentItem) => nav.navigate('Details', {item}),
    [nav],
  );
  const goCategory = useCallback(
    (cat: string) => nav.navigate('Category', {category: cat}),
    [nav],
  );

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);
    clearTimeout(searchTimer.current);
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await searchContent(text);
        setSearchResults(res);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 380);
  }, []);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  // ── Search overlay ────────────────────────────────────────────────────────
  if (searchOpen) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />
        <View style={[styles.searchHeader, {paddingTop: insets.top + 8}]}>
          <View style={styles.searchBox}>
            <Image
              source={require('../../assets/icons/search.png')}
              style={[styles.searchIcon, {tintColor: Colors.dark.textMuted}]}
            />
            <TextInput
              style={styles.searchInput}
              placeholder={t('search_placeholder')}
              placeholderTextColor={Colors.dark.textMuted}
              value={searchQuery}
              onChangeText={handleSearch}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
                <Text style={styles.clearX}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={closeSearch}>
            <Text style={styles.cancelTxt}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>

        {searching ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
          </View>
        ) : searchResults.length > 0 ? (
          <FlatList
            data={searchResults}
            numColumns={2}
            keyExtractor={i => i.id}
            contentContainerStyle={styles.searchGrid}
            columnWrapperStyle={styles.row}
            showsVerticalScrollIndicator={false}
            renderItem={({item}) => <MovieCard item={item} onPress={goDetails} />}
          />
        ) : searchQuery.length > 0 ? (
          <View style={styles.center}>
            <Text style={styles.noResults}>{t('no_results')}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  // ── Main home ─────────────────────────────────────────────────────────────
  if (loading && !Object.keys(categoryData).length) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />

      <FlatList
        data={[{key: 'hero'}, {key: 'ads'}, {key: 'trending'}, {key: 'explore'}] as any}
        renderItem={({item}: any) => {
          if (item.key === 'hero') {
            return heroItems.length > 0 ? (
              <View style={{marginTop: 12}}>
                <HeroBanner items={heroItems} onPress={goDetails} />
              </View>
            ) : null;
          }
          if (item.key === 'ads') {
            return (
              <View style={{marginTop: 16}}>
                <AdsterraBanner visible type="native" height={90} />
                <AdsterraBanner visible type="propeller" height={90} />
              </View>
            );
          }
          if (item.key === 'trending') {
            return (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{t('trending_now')}</Text>
                  <TouchableOpacity onPress={() => goCategory('movies')}>
                    <Text style={styles.seeAll}>{t('all')}</Text>
                  </TouchableOpacity>
                </View>
                <FlatList
                  data={trending}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.hList}
                  keyExtractor={i => i.id}
                  renderItem={({item}) => (
                    <View style={{marginRight: 10}}>
                      <MovieCard item={item} onPress={goDetails} width={CARD_WIDTH} />
                    </View>
                  )}
                />
              </View>
            );
          }
          if (item.key === 'explore') {
            return (
              <View style={styles.exploreSection}>
                <Text style={styles.sectionTitle}>{t('browse')}</Text>
                <View style={styles.chipRow}>
                  {CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={styles.chip}
                      onPress={() => goCategory(cat)}
                    >
                      <Text style={styles.chipText}>
                        {t(
                          cat === 'dubbed-movies'
                            ? 'dubbed_movies'
                            : cat === 'asian-movies'
                            ? 'asian_movies'
                            : cat === 'anime-movies'
                            ? 'anime_movies'
                            : cat === 'asian-series'
                            ? 'asian_series'
                            : cat === 'arabic-series'
                            ? 'arabic_series'
                            : cat
                        )}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          }
          return null;
        }}
        ListHeaderComponent={
          <View style={[styles.topBar, {paddingTop: insets.top + 8}]}>
            <Text style={styles.appName}>
              <Text style={{color: '#FF4500'}}>Abdo</Text>
              <Text style={{color: '#1565C0'}}>Best</Text>
            </Text>
            <TouchableOpacity style={styles.searchBtn} onPress={() => setSearchOpen(true)}>
              <Image
                source={require('../../assets/icons/search.png')}
                style={[styles.searchBtnIcon, {tintColor: Colors.dark.text}]}
              />
            </TouchableOpacity>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.dark.primary}
            colors={[Colors.dark.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{paddingBottom: insets.bottom + 90}}
      />
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.dark.background},
  center: {flex: 1, justifyContent: 'center', alignItems: 'center'},

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  appName: {fontSize: 26, fontWeight: '900', fontFamily: 'Rubik'},
  searchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnIcon: {width: 22, height: 22},

  section: {marginTop: 20},
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  sectionTitle: {color: Colors.dark.text, fontSize: 18, fontWeight: '700', fontFamily: 'Rubik'},
  seeAll: {color: Colors.dark.primary, fontSize: 14, fontWeight: '600', fontFamily: 'Rubik'},
  hList: {paddingLeft: 18, paddingRight: 18},
  row: {justifyContent: 'space-between', gap: 12},

  exploreSection: {marginTop: 20, paddingHorizontal: 18},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10},
  chip: {
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  chipText: {color: Colors.dark.text, fontSize: 14, fontFamily: 'Rubik', fontWeight: '600'},

  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 6,
  },
  searchIcon: {width: 16, height: 16},
  searchInput: {flex: 1, color: Colors.dark.text, fontSize: 14, paddingVertical: 10, fontFamily: 'Rubik'},
  clearX: {color: Colors.dark.textMuted, fontSize: 16, padding: 4},
  cancelTxt: {color: Colors.dark.primary, fontSize: 14, fontWeight: '600', fontFamily: 'Rubik'},
  searchGrid: {paddingHorizontal: 14, paddingBottom: 80, paddingTop: 8},
  noResults: {color: Colors.dark.textMuted, fontSize: 15, fontFamily: 'Rubik'},
});

// ── Hero specific styles ────────────────────────────────────────────────────
const heroStyles = StyleSheet.create({
  container: {height: HERO_H, marginHorizontal: 16, borderRadius: 20, overflow: 'hidden'},
  card: {width: SW - 32, height: HERO_H, borderRadius: 20, overflow: 'hidden'},
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  genreRow: {flexDirection: 'row', gap: 6, marginBottom: 8},
  genrePill: {
    backgroundColor: 'rgba(255,69,0,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  genreTxt: {color: '#fff', fontSize: 11, fontWeight: '600', fontFamily: 'Rubik'},
  title: {color: '#fff', fontSize: 22, fontWeight: '800', fontFamily: 'Rubik', marginBottom: 6},
  metaRow: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12},
  metaText: {color: 'rgba(255,255,255,0.8)', fontSize: 13, fontFamily: 'Rubik'},
  ratingBadge: {flexDirection: 'row', alignItems: 'center', gap: 4},
  metaGold: {color: '#FFD700', fontSize: 13, fontWeight: '600', fontFamily: 'Rubik'},
  qualityBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.primary,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  playIcon: {color: '#fff', fontSize: 14},
  playText: {color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'Rubik'},
});