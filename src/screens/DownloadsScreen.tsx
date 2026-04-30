import React, {useState, useMemo} from 'react';
import {View, StyleSheet, FlatList, Text, TextInput, TouchableOpacity} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {Colors} from '../theme/colors';
import {Typography} from '../theme/typography';
import {useTranslation} from 'react-i18next';
import {getDownloadState} from '../services/videoService';

export const DownloadsScreen: React.FC = () => {
  const {t} = useTranslation();
  const insets = useSafeAreaInsets();
  const [downloads] = useState<any[]>(getDownloadState());
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDownloads = useMemo(() => {
    if (!searchQuery.trim()) return downloads;
    const q = searchQuery.toLowerCase();
    return downloads.filter((d: any) =>
      d.title?.toLowerCase().includes(q) ||
      d.format?.toLowerCase().includes(q)
    );
  }, [downloads, searchQuery]);

  if (downloads.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconContainer}>
          <Icon name="download-outline" size={48} color={Colors.dark.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>{t('no_downloads')}</Text>
        <Text style={styles.emptySubtext}>{t('no_downloads_sub')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={[styles.searchContainer, {paddingTop: insets.top + 8}]}>
        <Icon name="search" size={20} color={Colors.dark.textSecondary} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('search_downloads')}
          placeholderTextColor={Colors.dark.textMuted}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close-circle" size={20} color={Colors.dark.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredDownloads}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, {paddingBottom: insets.bottom + 80}]}
        renderItem={({item}) => (
          <View style={styles.downloadItem}>
            <Icon name="film-outline" size={40} color={Colors.dark.textSecondary} />
            <View style={styles.itemInfo}>
              <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.itemMeta}>{item.format} • {t(item.status)}</Text>
              {item.status === 'downloading' && (
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, {width: `${item.progress}%`}]} />
                </View>
              )}
            </View>
          </View>
        )}
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.dark.background,
    padding: 32,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.semibold as any,
  },
  emptySubtext: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.md,
    marginTop: 8,
    textAlign: 'center',
  },
  list: {
    padding: 16,
  },
  downloadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 14,
  },
  itemTitle: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.medium as any,
  },
  itemMeta: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.sm,
    marginTop: 2,
  },
  progressBar: {
    height: 3,
    backgroundColor: Colors.dark.border,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
});
