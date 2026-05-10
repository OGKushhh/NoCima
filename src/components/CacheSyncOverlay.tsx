/**
 * CacheSyncOverlay
 *
 * Full-screen overlay shown during initial cache download on app launch.
 * Also exported as a hook (useCacheSync) for use in SettingsScreen.
 *
 * Shows:
 *  - App name / logo
 *  - Current category being fetched (Arabic + English label)
 *  - Animated progress bar
 *  - "X / Y categories" counter
 *  - Tick ✓ when a category was already cached (skipped)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, Modal,
} from 'react-native';
import { syncAllWithProgress, SyncProgress, SYNC_CATEGORIES } from '../services/metadataService';

// ── Category display names ────────────────────────────────────────────────────
const CAT_LABELS: Record<string, { ar: string; en: string }> = {
  movies:          { ar: 'أفلام',              en: 'Movies' },
  series:          { ar: 'مسلسلات',            en: 'Series' },
  anime:           { ar: 'أنمي',               en: 'Anime' },
  tvshows:         { ar: 'برامج تلفزيونية',    en: 'TV Shows' },
  'asian-series':  { ar: 'مسلسلات آسيوية',    en: 'Asian Series' },
  'arabic-series': { ar: 'مسلسلات عربية',      en: 'Arabic Series' },
  'dubbed-movies': { ar: 'أفلام مدبلجة',       en: 'Dubbed Movies' },
  hindi:           { ar: 'هندي',               en: 'Hindi' },
  'asian-movies':  { ar: 'أفلام آسيوية',       en: 'Asian Movies' },
  'anime-movies':  { ar: 'أفلام أنمي',         en: 'Anime Movies' },
  trending:        { ar: 'الأكثر مشاهدة',      en: 'Trending' },
  featured:        { ar: 'مميز',               en: 'Featured' },
  done:            { ar: 'اكتمل!',             en: 'Done!' },
};

// ── Hook: useCacheSync ────────────────────────────────────────────────────────
export interface CacheSyncState {
  running: boolean;
  progress: SyncProgress | null;
  start: (forceRefresh?: boolean) => Promise<void>;
}

export function useCacheSync(): CacheSyncState {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  const start = useCallback(async (forceRefresh = false) => {
    setRunning(true);
    setProgress({ category: SYNC_CATEGORIES[0], done: 0, total: SYNC_CATEGORIES.length, percent: 0, fromCache: false });
    try {
      await syncAllWithProgress(p => setProgress(p), forceRefresh);
    } finally {
      // Keep final state visible briefly then clear
      setTimeout(() => {
        setRunning(false);
        setProgress(null);
      }, 800);
    }
  }, []);

  return { running, progress, start };
}

// ── Full-screen launch overlay ────────────────────────────────────────────────
interface OverlayProps {
  visible: boolean;
  progress: SyncProgress | null;
}

export const CacheSyncOverlay: React.FC<OverlayProps> = ({ visible, progress }) => {
  const barWidth = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Animate progress bar
  useEffect(() => {
    const pct = progress?.percent ?? 0;
    Animated.timing(barWidth, {
      toValue: pct,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress?.percent]);

  // Fade out when done
  useEffect(() => {
    if (progress?.category === 'done') {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 600,
        delay: 400,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(1);
    }
  }, [progress?.category]);

  if (!visible) return null;

  const label = progress ? CAT_LABELS[progress.category] : null;
  const done  = progress?.done ?? 0;
  const total = progress?.total ?? SYNC_CATEGORIES.length;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>

        {/* App name */}
        <Text style={styles.appName}>AbdoBest</Text>
        <Text style={styles.subtitle}>جار تحميل قاعدة البيانات…{'\n'}Loading database…</Text>

        {/* Progress bar track */}
        <View style={styles.track}>
          <Animated.View
            style={[
              styles.bar,
              {
                width: barWidth.interpolate({
                  inputRange: [0, 100],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>

        {/* Counter + category label */}
        <View style={styles.labelRow}>
          <Text style={styles.counter}>{done} / {total}</Text>
          {label && (
            <Text style={styles.catLabel}>
              {progress?.fromCache ? '✓ ' : ''}{label.ar} · {label.en}
            </Text>
          )}
        </View>

        {/* Percent */}
        <Text style={styles.percent}>{progress?.percent ?? 0}%</Text>

      </Animated.View>
    </Modal>
  );
};

// ── Inline progress bar for SettingsScreen ────────────────────────────────────
interface InlineProps {
  progress: SyncProgress | null;
}

export const CacheSyncInline: React.FC<InlineProps> = ({ progress }) => {
  const barWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barWidth, {
      toValue: progress?.percent ?? 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [progress?.percent]);

  if (!progress) return null;

  const label  = CAT_LABELS[progress.category];
  const isDone = progress.category === 'done';

  return (
    <View style={inlineStyles.container}>
      {/* Progress bar */}
      <View style={inlineStyles.track}>
        <Animated.View
          style={[
            inlineStyles.bar,
            isDone && inlineStyles.barDone,
            {
              width: barWidth.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>

      {/* Label row */}
      <View style={inlineStyles.row}>
        <Text style={inlineStyles.counter}>
          {isDone ? '✓ اكتمل · Done' : `${progress.done} / ${progress.total}`}
        </Text>
        {!isDone && label && (
          <Text style={inlineStyles.cat} numberOfLines={1}>
            {progress.fromCache ? '✓ ' : '⟳ '}{label.ar} · {label.en}
          </Text>
        )}
        <Text style={inlineStyles.pct}>{progress.percent}%</Text>
      </View>
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#0d0d1a',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  appName: {
    color: '#FF4500',
    fontSize: 36,
    fontWeight: '900',
    fontFamily: 'Rubik',
    marginBottom: 8,
    letterSpacing: 1,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontFamily: 'Rubik',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 20,
  },
  track: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    backgroundColor: '#FF4500',
    borderRadius: 3,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginTop: 12,
  },
  counter: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontFamily: 'Rubik',
  },
  catLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontFamily: 'Rubik',
    textAlign: 'right',
    flex: 1,
    paddingLeft: 8,
  },
  percent: {
    color: '#FF4500',
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Rubik',
    marginTop: 20,
  },
});

const inlineStyles = StyleSheet.create({
  container: {
    marginTop: 10,
    marginHorizontal: 16,
  },
  track: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    backgroundColor: '#FF4500',
    borderRadius: 2,
  },
  barDone: {
    backgroundColor: '#4CAF50',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  counter: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontFamily: 'Rubik',
  },
  cat: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontFamily: 'Rubik',
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  pct: {
    color: '#FF4500',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
});
