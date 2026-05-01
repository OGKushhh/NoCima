import React, { useCallback, useMemo } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
  Platform,
} from 'react-native';
import { RADIUS, SPACING } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTranslation } from 'react-i18next';
import { ReleaseInfo } from '../services/updateService';
import { useTheme } from '../hooks/useTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface UpdateModalProps {
  visible: boolean;
  release: ReleaseInfo | null;
  currentVersion: string;
  onDownload: (url: string) => void;
  onSkip: (version: string) => void;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const formatDate = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
};

/**
 * Safely read fields from a potentially‑incomplete release object.
 */
const safe = (release: ReleaseInfo | null, field: keyof ReleaseInfo, fallback = ''): string => {
  if (!release) return fallback;
  const value = release[field];
  return typeof value === 'string' ? value : fallback;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const UpdateModal: React.FC<UpdateModalProps> = ({
  visible,
  release,
  currentVersion,
  onDownload,
  onSkip,
  onDismiss,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        // ── Backdrop ─────────────────────────────────────────────────────────
        backdrop: {
          ...StyleSheet.absoluteFillObject,
          justifyContent: 'center',
          zIndex: 0,
        },
        backdropOverlay: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: colors.overlay,
        },

        // ── Bottom sheet ─────────────────────────────────────────────────────
        sheet: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: colors.surface,
          borderTopLeftRadius: RADIUS.xl,
          borderTopRightRadius: RADIUS.xl,
          maxHeight: SCREEN_HEIGHT * 0.75,
          overflow: 'hidden',
          ...Platform.select({
            ios: colors.shadowLg,
            android: colors.shadowMd,
          }),
        },
        handleBar: {
          alignSelf: 'center',
          width: 40,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.border,
          marginTop: SPACING.sm,
          marginBottom: SPACING.lg,
        },
        scrollContent: {
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.xl,
        },

        // ── Header ───────────────────────────────────────────────────────────
        iconContainer: {
          alignSelf: 'center',
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: `${colors.primary}18`,
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: SPACING.lg,
        },
        appIcon: {
          width: 40,
          height: 40,
        },
        title: {
          color: colors.text,
          textAlign: 'center',
          marginBottom: SPACING.lg,
        },

        // ── Version row ──────────────────────────────────────────────────────
        versionRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: SPACING.lg,
        },
        versionBox: {
          flex: 1,
          backgroundColor: colors.background,
          borderRadius: RADIUS.md,
          padding: SPACING.md,
          alignItems: 'center',
        },
        versionBoxNew: {
          borderColor: colors.primary,
          borderWidth: 1,
        },
        versionLabel: {
          color: colors.textMuted,
          marginBottom: SPACING.xs,
        },
        versionValue: {
          color: colors.text,
        },
        arrowIcon: {
          width: 20,
          height: 20,
          tintColor: colors.textMuted,
          marginHorizontal: SPACING.md,
        },

        // ── Changelog ────────────────────────────────────────────────────────
        changelogSection: {
          backgroundColor: colors.background,
          borderRadius: RADIUS.md,
          padding: SPACING.lg,
          marginBottom: SPACING.md,
        },
        changelogTitle: {
          color: colors.textSecondary,
          marginBottom: SPACING.sm,
        },
        changelogText: {
          color: colors.textSecondary,
          lineHeight: 20,
        },

        // ── Date ─────────────────────────────────────────────────────────────
        dateText: {
          color: colors.textMuted,
          textAlign: 'center',
          marginBottom: SPACING.md,
        },

        // ── Action buttons ───────────────────────────────────────────────────
        actions: {
          paddingHorizontal: SPACING.xl,
          paddingBottom: SPACING.xxxl,
          paddingTop: SPACING.sm,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        },
        updateButton: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primary,
          borderRadius: RADIUS.full,
          paddingVertical: SPACING.md,
          minHeight: 50,
          marginBottom: SPACING.md,
          ...colors.shadowGlow,
        },
        updateButtonText: {
          color: '#FFFFFF',
          fontWeight: '700',
          marginLeft: SPACING.sm,
        },
        btnIcon: {
          width: 22,
          height: 22,
          tintColor: '#FFFFFF',
        },
        skipButton: {
          alignSelf: 'center',
          paddingVertical: SPACING.sm,
          paddingHorizontal: SPACING.xl,
        },
        skipText: {
          color: colors.textMuted,
        },
      }),
    [colors],
  );

  // ── Derived values (guarded) ─────────────────────────────────────────────
  const version = safe(release, 'version');
  const downloadUrl = safe(release, 'downloadUrl');
  const changelog = safe(release, 'changelog');
  const publishedAt = safe(release, 'publishedAt');

  const handleDownload = useCallback(() => {
    if (downloadUrl) {
      onDownload(downloadUrl);
    }
  }, [downloadUrl, onDownload]);

  const handleSkip = useCallback(() => {
    if (version) {
      onSkip(version);
    }
  }, [version, onSkip]);

  if (!release) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      hardwareAccelerated
      onRequestClose={onDismiss}>
      {/* ── Backdrop ────────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onDismiss}>
        <View style={styles.backdropOverlay} />
      </TouchableOpacity>

      {/* ── Bottom‑sheet card ──────────────────────────────────────────── */}
      <View style={styles.sheet}>
        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* App icon */}
          <View style={styles.iconContainer}>
            <Image
              source={require('../../assets/icons/tv.png')}
              style={styles.appIcon}
              resizeMode="contain"
            />
          </View>

          {/* Title */}
          <Text style={[styles.title, FONTS.heading2]}>
            {t('update_available')}
          </Text>

          {/* Version comparison */}
          <View style={styles.versionRow}>
            <View style={styles.versionBox}>
              <Text style={[styles.versionLabel, FONTS.captionSmall]}>
                {t('current_version')}
              </Text>
              <Text style={[styles.versionValue, FONTS.heading3]}>
                v{currentVersion ?? '—'}
              </Text>
            </View>

            <Image
              source={require('../../assets/icons/arrow.png')}
              style={styles.arrowIcon}
              resizeMode="contain"
            />

            <View style={[styles.versionBox, styles.versionBoxNew]}>
              <Text style={[styles.versionLabel, FONTS.captionSmall]}>
                {t('latest_version')}
              </Text>
              <Text
                style={[
                  styles.versionValue,
                  FONTS.heading3,
                  { color: colors.primary },
                ]}>
                v{version || '—'}
              </Text>
            </View>
          </View>

          {/* "What's New" changelog section */}
          {changelog ? (
            <View style={styles.changelogSection}>
              <Text style={[styles.changelogTitle, FONTS.captionSmall]}>
                {t('update_changelog')}
              </Text>
              <Text style={[styles.changelogText, FONTS.bodySmall]}>
                {changelog}
              </Text>
            </View>
          ) : null}

          {/* Release date */}
          {publishedAt ? (
            <Text style={[styles.dateText, FONTS.caption]}>
              {formatDate(publishedAt)}
            </Text>
          ) : null}
        </ScrollView>

        {/* ── Action buttons (fixed at bottom of sheet) ─────────────────── */}
        <View style={styles.actions}>
          {/* Update Now */}
          <TouchableOpacity
            style={styles.updateButton}
            onPress={handleDownload}
            activeOpacity={0.85}
            accessibilityLabel={t('download_update')}
            accessibilityRole="button">
            <Image
              source={require('../../assets/icons/files.png')}
              style={styles.btnIcon}
              resizeMode="contain"
            />
            <Text style={[styles.updateButtonText, FONTS.bodyLarge]}>
              {t('download_update')}
            </Text>
          </TouchableOpacity>

          {/* Skip */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            activeOpacity={0.7}
            accessibilityLabel={t('skip_version')}
            accessibilityRole="button">
            <Text style={[styles.skipText, FONTS.body]}>
              {t('skip_version')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
