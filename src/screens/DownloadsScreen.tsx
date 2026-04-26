import React, {useState, useEffect} from 'react';
import {View, StyleSheet, FlatList, Text, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {Colors} from '../theme/colors';
import {Typography} from '../theme/typography';
import {useTranslation} from 'react-i18next';
import {getDownloadState} from '../services/videoService'; // This should point to your download manager

export const DownloadsScreen: React.FC = () => {
  const {t} = useTranslation();
  const [downloads] = useState<any[]>(getDownloadState());

  if (downloads.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="download-outline" size={64} color={Colors.dark.textMuted} />
        <Text style={styles.emptyTitle}>{t('no_downloads')}</Text>
        <Text style={styles.emptySubtext}>{t('no_downloads_sub')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={downloads}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.dark.background,
    padding: 32,
  },
  emptyTitle: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.semibold,
    marginTop: 16,
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
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemTitle: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.medium,
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
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
});