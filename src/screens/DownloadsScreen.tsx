import React, {useState, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Image,
  Alert,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import {SPACING, RADIUS} from '../theme/colors';
import {FONTS} from '../theme/typography';
import {useTheme} from '../hooks/useTheme';
import {getDownloadState, saveDownloadState} from '../services/videoService';
import {useTranslation} from 'react-i18next';

// ---------------------------------------------------------------------------
// Types (local — videoService returns any[], we guard downstream)
// ---------------------------------------------------------------------------
interface DownloadEntry {
  id?: string;
  title?: string;
  imageUrl?: string;
  quality?: string;
  progress?: number;
  status?: 'pending' | 'downloading' | 'paused' | 'completed' | 'failed';
  localPath?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const STATUS_LABELS: Record<string, string> = {
  completed: 'downloaded',
  downloading: 'downloading',
  paused: 'paused',
  failed: 'failed',
  pending: 'pending',
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const DownloadsScreen: React.FC = () => {
  const {t} = useTranslation();
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const [downloads, setDownloads] = useState<DownloadEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Load downloads every time the screen gains focus ─────────────────
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);

      try {
        const raw: any[] = getDownloadState() ?? [];
        // Guard: ensure every item is a non-null object
        const safe: DownloadEntry[] = raw.filter(
          (item): item is DownloadEntry => item != null && typeof item === 'object',
        );
        if (!cancelled) {
          setDownloads(safe);
          setLoading(false);
        }
      } catch {
        // getDownloadState has try-catch internally, but we still wrap
        if (!cancelled) {
          setDownloads([]);
          setLoading(false);
        }
      }

      return () => {
        cancelled = true;
      };
    }, []),
  );

  // ── Delete a download ─────────────────────────────────────────────────
  const handleDelete = useCallback(
    (index: number) => {
      const item = downloads[index];
      if (!item) return;

      Alert.alert(
        t('delete') ?? 'Delete',
        t('delete_download_confirm') ?? `Delete "${item.title ?? 'this download'}"?`,
        [
          {text: t('cancel') ?? 'Cancel', style: 'cancel'},
          {
            text: t('delete') ?? 'Delete',
            style: 'destructive',
            onPress: () => {
              setDownloads(prev => {
                const next = prev.filter((_, i) => i !== index);
                // Persist the updated list back to storage
                try {
                  saveDownloadState(next);
                } catch {
                  /* silent — storage write failure is non-critical here */
                }
                return next;
              });
            },
          },
        ],
      );
    },
    [downloads, t],
  );

  // ── Render helpers ────────────────────────────────────────────────────
  // ── Dynamic status color map ─────────────────────────────────────────
  const STATUS_COLORS = useMemo<Record<string, string>>(
    () => ({
      completed: colors.success,
      downloading: colors.accent,
      paused: colors.warning,
      failed: colors.error,
      pending: colors.textMuted,
    }),
    [colors],
  );

  // ── Dynamic styles ──────────────────────────────────────────────────
  const styles = useMemo(
    () =>
      StyleSheet.create({
        // ── Container & background ──────────────────────────────────────
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },

        // ── Header ──────────────────────────────────────────────────────
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: SPACING.xxl,
          paddingBottom: SPACING.lg,
          gap: SPACING.md,
        },
        headerTitle: {
          color: colors.text,
          flex: 1,
        },
        countBadge: {
          backgroundColor: colors.primary,
          paddingHorizontal: SPACING.sm + 2,
          paddingVertical: SPACING.xs - 1,
          borderRadius: RADIUS.full,
        },
        countText: {
          color: '#FFFFFF',
        },

        // ── List ────────────────────────────────────────────────────────
        listContent: {
          paddingHorizontal: SPACING.lg,
          paddingTop: SPACING.xs,
        },

        // ── Download card ───────────────────────────────────────────────
        card: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: RADIUS.lg,
          padding: SPACING.md,
          marginBottom: SPACING.md,
          ...colors.shadowMd,
        },

        // Poster
        poster: {
          width: 64,
          height: 96,
          borderRadius: RADIUS.sm,
          backgroundColor: colors.surfaceElevated,
        },
        posterPlaceholder: {
          justifyContent: 'center',
          alignItems: 'center',
        },
        posterPlaceholderIcon: {
          width: 24,
          height: 24,
          tintColor: colors.textMuted,
        },

        // Info column
        cardInfo: {
          flex: 1,
          marginLeft: SPACING.md,
          marginRight: SPACING.sm,
          justifyContent: 'center',
        },
        cardTitle: {
          color: colors.text,
          marginBottom: SPACING.sm - 2,
        },

        // Status
        statusRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACING.xs,
        },
        statusDot: {
          width: 8,
          height: 8,
          borderRadius: 4,
        },
        qualityBadge: {
          backgroundColor: `${colors.accent}20`,
          paddingHorizontal: SPACING.xs,
          paddingVertical: 1,
          borderRadius: RADIUS.sm,
          marginLeft: SPACING.xs,
        },
        qualityText: {
          color: colors.accent,
        },

        // Progress bar
        progressTrack: {
          marginTop: SPACING.sm,
          height: 4,
          backgroundColor: colors.border,
          borderRadius: 2,
          overflow: 'hidden',
        },
        progressFill: {
          height: '100%',
          backgroundColor: colors.accent,
          borderRadius: 2,
        },

        // Delete button (× icon in a subtle circle)
        deleteButton: {
          justifyContent: 'center',
          alignItems: 'center',
        },
        deleteIconBg: {
          width: 30,
          height: 30,
          borderRadius: RADIUS.full,
          backgroundColor: `${colors.error}18`,
          justifyContent: 'center',
          alignItems: 'center',
        },
        deleteIconText: {
          color: colors.error,
          fontSize: 18,
          fontWeight: '700',
          lineHeight: 20,
        },

        // ── Empty state ────────────────────────────────────────────────
        emptyContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: SPACING.xxxl + SPACING.lg,
        },
        emptyIconRing: {
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: SPACING.xxl,
        },
        emptyIcon: {
          width: 52,
          height: 52,
          tintColor: colors.textMuted,
        },
        emptyTitle: {
          color: colors.text,
          textAlign: 'center',
          marginBottom: SPACING.sm,
        },
        emptySubtitle: {
          color: colors.textMuted,
          textAlign: 'center',
        },
      }),
    [colors],
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      {/* Background circle */}
      <View style={styles.emptyIconRing}>
        <Image
          source={require('../../assets/icons/files.png')}
          style={styles.emptyIcon}
          resizeMode="contain"
        />
      </View>
      <Text style={[FONTS.heading3, styles.emptyTitle]}>
        {t('no_downloads') ?? 'No downloads yet'}
      </Text>
      <Text style={[FONTS.body, styles.emptySubtitle]}>
        {t('no_downloads_sub') ?? 'Your downloaded movies and series will appear here'}
      </Text>
    </View>
  );

  const renderCard = ({item, index}: {item: DownloadEntry; index: number}) => {
    const status = item.status ?? 'pending';
    const statusColor = STATUS_COLORS[status] ?? colors.textMuted;
    const statusLabel = t(STATUS_LABELS[status] ?? 'pending') ?? status;
    const progressPct = clamp(item.progress ?? 0, 0, 1);
    const isDownloading = status === 'downloading';

    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onLongPress={() => handleDelete(index)}
        delayLongPress={400}
        style={styles.card}
      >
        {/* Poster thumbnail */}
        {item.imageUrl ? (
          <Image
            source={{uri: item.imageUrl}}
            style={styles.poster}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.poster, styles.posterPlaceholder]}>
            <Image
              source={require('../../assets/icons/clapboard.png')}
              style={styles.posterPlaceholderIcon}
              resizeMode="contain"
            />
          </View>
        )}

        {/* Info column */}
        <View style={styles.cardInfo}>
          <Text style={[FONTS.heading3, styles.cardTitle]} numberOfLines={2}>
            {item.title ?? 'Untitled'}
          </Text>

          {/* Status row */}
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, {backgroundColor: statusColor}]} />
            <Text style={[FONTS.caption, {color: statusColor}]}>{statusLabel}</Text>
            {item.quality ? (
              <View style={styles.qualityBadge}>
                <Text style={[FONTS.micro, styles.qualityText]}>{item.quality}</Text>
              </View>
            ) : null}
          </View>

          {/* Progress bar (visible while downloading) */}
          {isDownloading && (
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, {width: `${Math.round(progressPct * 100)}%`}]}
              />
            </View>
          )}
        </View>

        {/* Delete hint icon */}
        <TouchableOpacity
          onPress={() => handleDelete(index)}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          style={styles.deleteButton}
        >
          <View style={styles.deleteIconBg}>
            <Text style={styles.deleteIconText}>×</Text>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const keyExtractor = (item: DownloadEntry, index: number) =>
    item.id ?? `dl-${index}`;

  // ── Main render ───────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <View style={[styles.header, {paddingTop: insets.top + SPACING.md}]}>
        <Text style={[FONTS.heading1, styles.headerTitle]}>
          {t('downloads') ?? 'Downloads'}
        </Text>
        {downloads.length > 0 && (
          <View style={styles.countBadge}>
            <Text style={[FONTS.caption, styles.countText]}>{downloads.length}</Text>
          </View>
        )}
      </View>

      {/* ── Content ────────────────────────────────────────────────── */}
      {!loading && downloads.length === 0 ? (
        renderEmpty()
      ) : (
        <FlatList
          data={downloads}
          keyExtractor={keyExtractor}
          renderItem={renderCard}
          contentContainerStyle={[
            styles.listContent,
            {paddingBottom: insets.bottom + SPACING.xxxl + 60},
          ]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={loading ? null : renderEmpty}
        />
      )}
    </View>
  );
};


