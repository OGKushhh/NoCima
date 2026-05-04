import React, {useState, useCallback, useEffect} from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, StatusBar, Image, Alert,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import FastImage from 'react-native-fast-image';
import {Colors} from '../theme/colors';
import {useTranslation} from 'react-i18next';
import {DownloadItem} from '../types';
import {
  getDownloadState,
  subscribeDownloads,
  pauseDownload,
  resumeDownload,
  deleteDownload,
  retryDownload,
} from '../services/downloadService';

const formatBytes = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const DownloadsScreen: React.FC = () => {
  const {t} = useTranslation();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const refresh = useCallback(() => setDownloads(getDownloadState()), []);

  // Load on focus
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // Subscribe to live progress updates from downloadService
  useEffect(() => {
    const unsub = subscribeDownloads(refresh);
    return unsub;
  }, [refresh]);

  const filtered = downloads.filter(d =>
    !searchQuery.trim() ||
    d.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ── Helpers ────────────────────────────────────────────────────────
  const getStatusColor = (status: DownloadItem['status']) => {
    switch (status) {
      case 'completed':   return Colors.dark.success;
      case 'downloading': return Colors.dark.accentLight;
      case 'paused':      return Colors.dark.warning;
      case 'failed':      return Colors.dark.error;
      default:            return Colors.dark.textMuted;
    }
  };

  const handleDelete = (item: DownloadItem) => {
    Alert.alert(
      t('delete_download'),
      t('delete_download_confirm'),
      [
        {text: t('cancel'), style: 'cancel'},
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => deleteDownload(item.id),
        },
      ],
    );
  };

  const handleAction = (item: DownloadItem) => {
    switch (item.status) {
      case 'completed':
        if (item.localPath) {
          navigation.navigate('Player', {url: item.localPath, title: item.title});
        }
        break;
      case 'downloading':
        pauseDownload(item.id);
        break;
      case 'paused':
        resumeDownload(item.id);
        break;
      case 'failed':
        retryDownload(item.id);
        break;
    }
  };

  // ── Row ────────────────────────────────────────────────────────────
  const renderItem = ({item}: {item: DownloadItem}) => {
    const statusColor = getStatusColor(item.status);
    const pct = Math.round((item.progress || 0) * 100);
    const sizeStr = item.totalBytes
      ? `${formatBytes(item.downloadedBytes)} / ${formatBytes(item.totalBytes)}`
      : '';

    return (
      <View style={styles.card}>
        <FastImage
          source={item.imageUrl ? {uri: item.imageUrl} : require('../../assets/placeholder.png')}
          style={styles.thumb}
          resizeMode={FastImage.resizeMode.cover}
        />

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>

          {/* Status row */}
          <View style={styles.statusRow}>
            <StatusDot status={item.status} color={statusColor} />
            <Text style={[styles.statusText, {color: statusColor}]}>
              {t(item.status)}
            </Text>
            {item.quality ? <Text style={styles.quality}>{item.quality}</Text> : null}
          </View>

          {/* Progress bar */}
          {(item.status === 'downloading' || item.status === 'paused') && (
            <>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${pct}%`,
                      backgroundColor:
                        item.status === 'paused'
                          ? Colors.dark.warning
                          : Colors.dark.accentLight,
                    },
                  ]}
                />
              </View>
              <View style={styles.progressMeta}>
                <Text style={styles.pctText}>{pct}%</Text>
                {sizeStr ? <Text style={styles.sizeText}>{sizeStr}</Text> : null}
              </View>
            </>
          )}

          {/* Completed size */}
          {item.status === 'completed' && item.totalBytes ? (
            <Text style={styles.sizeText}>{formatBytes(item.totalBytes)}</Text>
          ) : null}

          {/* Error message */}
          {item.status === 'failed' && item.errorMessage ? (
            <Text style={styles.errorMsg} numberOfLines={2}>{item.errorMessage}</Text>
          ) : null}
        </View>

        {/* Right-side action buttons */}
        <View style={styles.actions}>
          <ActionButton item={item} onAction={handleAction} />
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(item)}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          >
            <Image
              source={require('../../assets/icons/close.png')}
              style={{width: 14, height: 14, tintColor: Colors.dark.textMuted}}
            />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.dark.background} />

      {/* Header */}
      <View style={[styles.header, {paddingTop: insets.top + 6}]}>
        <Text style={styles.headerTitle}>{t('downloads')}</Text>
        {downloads.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{downloads.length}</Text>
          </View>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Image
          source={require('../../assets/icons/search.png')}
          style={{width: 18, height: 18, tintColor: Colors.dark.textMuted, marginRight: 8}}
        />
        <TextInput
          style={styles.searchInput}
          placeholder={t('search_downloads')}
          placeholderTextColor={Colors.dark.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Text style={{fontSize: 18, color: Colors.dark.textMuted, fontWeight: '700'}}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Image
              source={require('../../assets/icons/download-to-storage-drive.png')}
              style={{width: 48, height: 48, tintColor: Colors.dark.textMuted}}
            />
          </View>
          <Text style={styles.emptyTitle}>{t('no_downloads')}</Text>
          <Text style={styles.emptySub}>{t('no_downloads_sub')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={d => d.id}
          contentContainerStyle={[styles.list, {paddingBottom: insets.bottom + 100}]}
          showsVerticalScrollIndicator={false}
          renderItem={renderItem}
        />
      )}
    </View>
  );
};

// ── Small sub-components ───────────────────────────────────────────────────

const StatusDot = ({status, color}: {status: DownloadItem['status']; color: string}) => {
  switch (status) {
    case 'completed':
      return <Image source={require('../../assets/icons/checkmark.png')} style={{width: 13, height: 13, tintColor: color}} />;
    case 'downloading':
      return <Image source={require('../../assets/icons/download-to-storage-drive.png')} style={{width: 13, height: 13, tintColor: color}} />;
    case 'paused':
      return <Image source={require('../../assets/icons/pause.png')} style={{width: 13, height: 13, tintColor: color}} />;
    case 'failed':
      return <Image source={require('../../assets/icons/alert.png')} style={{width: 13, height: 13, tintColor: color}} />;
    default:
      return <View style={{width: 13, height: 13, borderRadius: 7, backgroundColor: color, opacity: 0.4}} />;
  }
};

const ActionButton = ({
  item,
  onAction,
}: {
  item: DownloadItem;
  onAction: (item: DownloadItem) => void;
}) => {
  switch (item.status) {
    case 'completed':
      return (
        <TouchableOpacity style={styles.actionBtn} onPress={() => onAction(item)}>
          <Image source={require('../../assets/icons/play.png')} style={{width: 22, height: 22, tintColor: Colors.dark.accentLight}} />
        </TouchableOpacity>
      );
    case 'downloading':
      return (
        <TouchableOpacity style={styles.actionBtn} onPress={() => onAction(item)}>
          <Image source={require('../../assets/icons/pause.png')} style={{width: 22, height: 22, tintColor: Colors.dark.accentLight}} />
        </TouchableOpacity>
      );
    case 'paused':
      return (
        <TouchableOpacity style={styles.actionBtn} onPress={() => onAction(item)}>
          <Image source={require('../../assets/icons/play.png')} style={{width: 22, height: 22, tintColor: Colors.dark.warning}} />
        </TouchableOpacity>
      );
    case 'failed':
      return (
        <TouchableOpacity style={styles.actionBtn} onPress={() => onAction(item)}>
          <Image source={require('../../assets/icons/sync.png')} style={{width: 22, height: 22, tintColor: Colors.dark.error}} />
        </TouchableOpacity>
      );
    default:
      return <View style={{width: 38}} />;
  }
};

const styles = StyleSheet.create({
  container:    {flex: 1, backgroundColor: Colors.dark.background},
  header:       {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, gap: 10},
  headerTitle:  {color: Colors.dark.text, fontSize: 26, fontWeight: '800', fontFamily: 'Rubik', flex: 1},
  countBadge:   {backgroundColor: Colors.dark.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12},
  countText:    {color: '#fff', fontSize: 13, fontWeight: '700', fontFamily: 'Rubik'},
  searchRow:    {flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, backgroundColor: Colors.dark.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 2, borderWidth: 1, borderColor: Colors.dark.border},
  searchInput:  {flex: 1, color: Colors.dark.text, fontSize: 14, paddingVertical: 10, fontFamily: 'Rubik'},
  list:         {paddingHorizontal: 16, paddingTop: 4},
  card:         {flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.dark.surface, borderRadius: 14, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: Colors.dark.border, gap: 12},
  thumb:        {width: 58, height: 86, borderRadius: 8, backgroundColor: Colors.dark.surfaceLight},
  info:         {flex: 1},
  title:        {color: Colors.dark.text, fontSize: 14, fontWeight: '600', fontFamily: 'Rubik', marginBottom: 5, lineHeight: 20},
  statusRow:    {flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6},
  statusText:   {fontSize: 12, fontWeight: '600', fontFamily: 'Rubik'},
  quality:      {color: Colors.dark.accentLight, fontSize: 11, fontWeight: '700', fontFamily: 'Rubik', backgroundColor: `${Colors.dark.accent}20`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, marginLeft: 4},
  progressTrack:{height: 3, backgroundColor: Colors.dark.border, borderRadius: 2, overflow: 'hidden', marginBottom: 3},
  progressFill: {height: '100%', borderRadius: 2},
  progressMeta: {flexDirection: 'row', justifyContent: 'space-between'},
  pctText:      {color: Colors.dark.textMuted, fontSize: 11, fontFamily: 'Rubik'},
  sizeText:     {color: Colors.dark.textMuted, fontSize: 11, fontFamily: 'Rubik'},
  errorMsg:     {color: Colors.dark.error, fontSize: 11, fontFamily: 'Rubik', marginTop: 3, lineHeight: 16},
  actions:      {alignItems: 'center', gap: 10},
  actionBtn:    {width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.dark.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.dark.border},
  deleteBtn:    {width: 28, height: 28, justifyContent: 'center', alignItems: 'center'},
  emptyState:   {flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40},
  emptyIcon:    {width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.dark.surface, justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: Colors.dark.border},
  emptyTitle:   {color: Colors.dark.text, fontSize: 18, fontWeight: '700', fontFamily: 'Rubik', textAlign: 'center', marginBottom: 8},
  emptySub:     {color: Colors.dark.textMuted, fontSize: 14, textAlign: 'center', fontFamily: 'Rubik', lineHeight: 20},
});
