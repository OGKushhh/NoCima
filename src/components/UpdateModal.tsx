import React from 'react';
import {
  View, Modal, TouchableOpacity, Text, StyleSheet,
  ScrollView, Linking, Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {Colors} from '../theme/colors';
import {Typography} from '../theme/typography';
import {useTranslation} from 'react-i18next';
import {ReleaseInfo} from '../services/updateService';

interface UpdateModalProps {
  visible: boolean;
  release: ReleaseInfo | null;
  currentVersion: string;
  onDownload: (url: string) => void;
  onSkip: (version: string) => void;
  onDismiss: () => void;
}

const {width: SCREEN_WIDTH} = Dimensions.get('window');

export const UpdateModal: React.FC<UpdateModalProps> = ({
  visible, release, currentVersion, onDownload, onSkip, onDismiss,
}) => {
  const {t} = useTranslation();

  if (!release) return null;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Icon name="rocket-outline" size={32} color={Colors.dark.primary} />
            </View>
            <Text style={styles.title}>{t('update_available')}</Text>
            <Text style={styles.subtitle}>{t('update_description')}</Text>
          </View>

          {/* Version info */}
          <View style={styles.versionRow}>
            <View style={styles.versionBox}>
              <Text style={styles.versionLabel}>{t('current_version')}</Text>
              <Text style={styles.versionValue}>v{currentVersion}</Text>
            </View>
            <Icon name="arrow-forward" size={20} color={Colors.dark.textMuted} />
            <View style={[styles.versionBox, styles.versionBoxNew]}>
              <Text style={styles.versionLabel}>{t('latest_version')}</Text>
              <Text style={[styles.versionValue, {color: Colors.dark.primary}]}>v{release.version}</Text>
            </View>
          </View>

          {/* Changelog */}
          {release.changelog && (
            <View style={styles.changelogContainer}>
              <Text style={styles.changelogTitle}>{t('update_changelog')}</Text>
              <ScrollView style={styles.changelogScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.changelogText}>{release.changelog}</Text>
              </ScrollView>
            </View>
          )}

          {/* Date */}
          <Text style={styles.dateText}>
            📅 {formatDate(release.publishedAt)}
          </Text>

          {/* Actions */}
          <TouchableOpacity
            style={styles.downloadButton}
            onPress={() => onDownload(release.downloadUrl)}
          >
            <Icon name="download" size={22} color="#fff" />
            <Text style={styles.downloadButtonText}>{t('download_update')}</Text>
          </TouchableOpacity>

          <View style={styles.bottomRow}>
            <TouchableOpacity style={styles.skipButton} onPress={() => onSkip(release.version)}>
              <Text style={styles.skipText}>{t('skip_version')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.laterButton} onPress={onDismiss}>
              <Text style={styles.laterText}>{t('later')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    width: SCREEN_WIDTH - 48,
    backgroundColor: Colors.dark.surface,
    borderRadius: 20,
    padding: 24,
    maxHeight: SCREEN_WIDTH - 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${Colors.dark.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
  },
  subtitle: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.sm,
    marginTop: 4,
    textAlign: 'center',
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  versionBox: {
    backgroundColor: Colors.dark.background,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    flex: 1,
  },
  versionBoxNew: {
    borderColor: Colors.dark.primary,
    borderWidth: 1,
  },
  versionLabel: {
    color: Colors.dark.textMuted,
    fontSize: Typography.sizes.xs,
    marginBottom: 4,
  },
  versionValue: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
  },
  changelogContainer: {
    backgroundColor: Colors.dark.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  changelogTitle: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold,
    marginBottom: 8,
  },
  changelogScroll: {
    maxHeight: 120,
  },
  changelogText: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.sm,
    lineHeight: 20,
  },
  dateText: {
    color: Colors.dark.textMuted,
    fontSize: Typography.sizes.xs,
    textAlign: 'center',
    marginBottom: 16,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.primary,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  downloadButtonText: {
    color: '#fff',
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    marginLeft: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  skipButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  skipText: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.md,
  },
  laterButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  laterText: {
    color: Colors.dark.primary,
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.semibold,
  },
});
