import React, {useState, useCallback, useEffect, useMemo, memo} from 'react';
import {View, StyleSheet, FlatList, Text, TextInput, TouchableOpacity} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {searchContent} from '../services/metadataService';
import {ContentItem} from '../types';
import {MovieCard} from '../components/MovieCard';
import {LoadingSpinner} from '../components/LoadingSpinner';
import {Colors} from '../theme/colors';
import {Typography} from '../theme/typography';
import {useTranslation} from 'react-i18next';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

const MovieCardItem = memo<{item: ContentItem; onPress: (item: ContentItem) => void}>(
  ({item, onPress}) => <MovieCard item={item} onPress={onPress} />,
  (prev, next) => prev.item.id === next.item.id,
);
MovieCardItem.displayName = 'MovieCardItem';

export const SearchScreen: React.FC = () => {
  const {t} = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const debouncedQuery = useDebounce(query, 400);

  const navigateToDetails = useCallback((item: ContentItem) => {
    navigation.navigate('Details', {item});
  }, [navigation]);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    let cancelled = false;
    const performSearch = async () => {
      setLoading(true);
      try {
        const found = await searchContent(debouncedQuery);
        if (!cancelled) {
          setResults(found);
          setHasSearched(true);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    performSearch();
    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const renderItem = useCallback(({item}: {item: ContentItem}) => (
    <MovieCardItem item={item} onPress={navigateToDetails} />
  ), [navigateToDetails]);

  return (
    <View style={styles.container}>
      <View style={[styles.searchRow, {paddingTop: insets.top + 8}]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={Colors.dark.text} />
        </TouchableOpacity>
        <View style={styles.searchInputContainer}>
          <Icon name="search" size={20} color={Colors.dark.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t('search_placeholder')}
            placeholderTextColor={Colors.dark.textMuted}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Icon name="close-circle" size={20} color={Colors.dark.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <LoadingSpinner fullScreen={false} size="small" />
      ) : (
        <FlatList
          data={results}
          numColumns={2}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.grid, {paddingBottom: insets.bottom + 20}]}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews={true}
          ListEmptyComponent={
            hasSearched ? (
              <View style={styles.emptyContainer}>
                <Icon name="search-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyText}>{t('no_results')}</Text>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Icon name="film-outline" size={48} color={Colors.dark.textMuted} />
                <Text style={styles.emptyText}>{t('search_placeholder')}</Text>
              </View>
            )
          }
          renderItem={renderItem}
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
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
    fontSize: Typography.sizes.md,
    marginTop: 12,
  },
});
