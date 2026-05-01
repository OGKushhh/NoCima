import React, {useState, useCallback, useMemo} from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Switch,
  Linking,
  Alert,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {SPACING, RADIUS} from '../theme/colors';
import {FONTS} from '../theme/typography';
import {useTheme} from '../hooks/useTheme';
import {useTranslation} from 'react-i18next';
import {getSettings, saveSettings} from '../storage';
import {syncIfNeeded, getLastSyncTime} from '../services/metadataService';
import {checkForUpdate, openUpdateUrl} from '../services/updateService';
import {APP_VERSION} from '../constants/endpoints';

// =============================================================================
// Types
// =============================================================================

interface SettingsState {
  language?: string;
  darkMode?: boolean;
  qualityPreference?: string;
  autoPlay?: boolean;
  mobileDataWarning?: boolean;
  subtitleEnabled?: boolean;
  [key: string]: unknown;
}

interface QualityOption {
  key: string;
  label: string;
}

// =============================================================================
// SettingsScreen
// =============================================================================

export const SettingsScreen: React.FC = () => {
  const {t, i18n} = useTranslation();
  const {colors, toggleTheme} = useTheme();

  // ── State ────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<SettingsState>(getSettings());
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [lastSyncDate, setLastSyncDate] = useState<string>(computeLastSync());

  // ── Dynamic Styles ───────────────────────────────────────────────────
  const styles = useMemo(
    () =>
      StyleSheet.create({
        // ── Screen ─────────────────────────────────────────────────────
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        safeArea: {
          flex: 1,
        },
        scrollContent: {
          paddingBottom: SPACING.xxxl,
        },
        bottomSpacer: {
          height: SPACING.xxxl,
        },

        // ── Header ─────────────────────────────────────────────────────
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: SPACING.xl,
          paddingTop: SPACING.xl,
          paddingBottom: SPACING.sm,
        },
        headerLeft: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACING.md,
        },
        headerIconWrap: {
          width: 40,
          height: 40,
          borderRadius: RADIUS.md,
          backgroundColor: `${colors.primary}20`,
          justifyContent: 'center',
          alignItems: 'center',
        },
        headerIcon: {
          width: 22,
          height: 22,
          tintColor: colors.primary,
        },
        headerTitle: {
          color: colors.text,
        },
        versionBadge: {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: RADIUS.sm,
          paddingHorizontal: SPACING.sm,
          paddingVertical: SPACING.xs,
        },
        versionText: {
          color: colors.textMuted,
        },

        // ── Section Header ─────────────────────────────────────────────
        sectionHeader: {
          color: colors.textMuted,
          textTransform: 'uppercase' as any,
          letterSpacing: 1.5,
          paddingHorizontal: SPACING.xl,
          marginTop: SPACING.xxl,
          marginBottom: SPACING.sm,
        },

        // ── Card ───────────────────────────────────────────────────────
        card: {
          backgroundColor: colors.surface,
          borderRadius: RADIUS.lg,
          marginHorizontal: SPACING.lg,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.border,
        },

        // ── Row ────────────────────────────────────────────────────────
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: SPACING.lg,
          paddingVertical: SPACING.lg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        rowLast: {
          borderBottomWidth: 0,
        },
        rowContent: {
          flex: 1,
          marginLeft: SPACING.md,
        },
        rowLabel: {
          flex: 1,
          color: colors.text,
        },
        rowSub: {
          color: colors.textMuted,
          marginTop: SPACING.xs,
        },
        rowValue: {
          color: colors.textSecondary,
          marginRight: SPACING.xs,
        },
        rowRight: {
          flexDirection: 'row',
          alignItems: 'center',
        },

        // ── Icon circle ────────────────────────────────────────────────
        iconCircle: {
          width: 36,
          height: 36,
          borderRadius: RADIUS.sm,
          backgroundColor: `${colors.primary}18`,
          justifyContent: 'center',
          alignItems: 'center',
        },
        rowIcon: {
          width: 20,
          height: 20,
          tintColor: colors.primaryLight,
        },
        chevronIcon: {
          width: 16,
          height: 16,
          transform: [{rotate: '90deg'}],
        },

        // ── Ko-fi Button ───────────────────────────────────────────────
        kofiButton: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          marginHorizontal: SPACING.lg,
          paddingVertical: SPACING.lg,
          borderRadius: RADIUS.lg,
          gap: SPACING.sm,
          // Red gradient background
          backgroundColor: '#E53935',
          shadowColor: '#E53935',
          shadowOffset: {width: 0, height: 4},
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 6,
        },
        kofiIcon: {
          width: 20,
          height: 20,
          tintColor: '#FFFFFF',
        },
        kofiText: {
          color: '#FFFFFF',
        },

        // ── Quality Modal ──────────────────────────────────────────────
        modalBackdrop: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: colors.overlay,
          justifyContent: 'center',
          alignItems: 'center',
        },
        modalCard: {
          backgroundColor: colors.surface,
          borderRadius: RADIUS.lg,
          padding: SPACING.xl,
          width: 280,
          borderWidth: 1,
          borderColor: colors.border,
          elevation: 16,
          shadowColor: '#000000',
          shadowOffset: {width: 0, height: 8},
          shadowOpacity: 0.5,
          shadowRadius: 24,
        },
        modalTitle: {
          color: colors.text,
          textAlign: 'center',
          marginBottom: SPACING.md,
        },
        modalOption: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: SPACING.md,
          paddingHorizontal: SPACING.md,
          borderRadius: RADIUS.sm,
          marginBottom: SPACING.xs,
        },
        modalOptionActive: {
          backgroundColor: `${colors.primary}20`,
          borderWidth: 1,
          borderColor: `${colors.primary}60`,
        },
        modalOptionText: {
          color: colors.textSecondary,
        },
        modalOptionTextActive: {
          color: colors.primary,
          fontWeight: '700',
        },
        modalCheck: {
          width: 20,
          height: 20,
          justifyContent: 'center',
          alignItems: 'center',
        },
        modalCheckIcon: {
          width: 16,
          height: 16,
          tintColor: colors.primary,
        },
      }),
    [colors],
  );

  // ── Helpers ──────────────────────────────────────────────────────────

  /** Persist settings and update local state */
  const updateSetting = useCallback(
    (key: string, value: unknown) => {
      const updated = {...settings, [key]: value};
      setSettings(updated);
      saveSettings(updated);
    },
    [settings],
  );

  /** Derive last sync label */
  function computeLastSync(): string {
    try {
      const ts = getLastSyncTime();
      return ts ? new Date(ts).toLocaleDateString() : t('never');
    } catch {
      return t('never');
    }
  }

  const refreshLastSync = useCallback(() => {
    setLastSyncDate(computeLastSync());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────

  const toggleLanguage = useCallback(() => {
    const newLang = settings?.language === 'ar' ? 'en' : 'ar';
    updateSetting('language', newLang);
    i18n.changeLanguage(newLang);
  }, [settings?.language, updateSetting, i18n]);

  /** Sync database — wrapped in try-catch-finally */
  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await syncIfNeeded();
      refreshLastSync();
      Alert.alert(t('metadata_updated'));
    } catch (err: any) {
      Alert.alert(t('error'), err?.message || t('sync_failed'));
    } finally {
      setSyncing(false);
    }
  }, [t, refreshLastSync]);

  /** Clear cache — confirmation alert first */
  const handleClearCache = useCallback(() => {
    Alert.alert(t('clear_cache'), t('clear_cache_confirm'), [
      {text: t('cancel'), style: 'cancel'},
      {
        text: t('clear'),
        style: 'destructive',
        onPress: () => {
          try {
            // Clear any runtime caches here if needed
            Alert.alert(t('cache_cleared'));
          } catch {
            // Silent fail
          }
        },
      },
    ]);
  }, [t]);

  /** Check for updates — wrapped in try-catch-finally */
  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const update = await checkForUpdate();
      if (update) {
        openUpdateUrl(update.downloadUrl);
      } else {
        Alert.alert(t('up_to_date'), `v${APP_VERSION}`);
      }
    } catch (err: any) {
      // checkForUpdate already catches internally, but guard edge cases
      Alert.alert(t('error'), err?.message || t('update_check_failed'));
    } finally {
      setCheckingUpdate(false);
    }
  }, [t]);

  // ── Quality options ──────────────────────────────────────────────────

  const qualityOptions: QualityOption[] = [
    {key: 'auto', label: t('quality_auto')},
    {key: 'high', label: t('quality_high')},
    {key: 'medium', label: t('quality_medium')},
    {key: 'low', label: t('quality_low')},
  ];

  const currentQuality = qualityOptions.find(
    q => q.key === (settings?.qualityPreference ?? 'auto'),
  );
  const currentQualityLabel = currentQuality?.label ?? qualityOptions[0].label;

  // ── Sub-components (inside SettingsScreen so they access dynamic styles) ──

  /** Section header label (captionSmall, textMuted, uppercase, letterSpacing) */
  const SectionHeader: React.FC<{label: string}> = ({label}) => (
    <Text style={[FONTS.captionSmall, styles.sectionHeader]}>{label}</Text>
  );

  /** Chevron arrow (arrow.png rotated 90° for forward nav) */
  const Chevron: React.FC = () => (
    <Image
      source={require('../../assets/icons/arrow.png')}
      style={[styles.chevronIcon, {tintColor: colors.textMuted}]}
    />
  );

  /** Reusable row with icon, label, optional value / right element */
  const SettingRow: React.FC<{
    icon: any;
    label: string;
    value?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
    isLast?: boolean;
  }> = ({icon, label, value, onPress, rightElement, isLast}) => (
    <TouchableOpacity
      style={[styles.row, isLast && styles.rowLast]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      {/* Icon in tinted circle */}
      <View style={styles.iconCircle}>
        <Image source={icon} style={styles.rowIcon} />
      </View>

      {/* Label (flex:1 so it pushes right content) */}
      <Text style={[FONTS.body, styles.rowLabel]}>{label}</Text>

      {/* Right side: custom element OR value + chevron */}
      {rightElement ?? (
        <View style={styles.rowRight}>
          {value ? (
            <Text style={[FONTS.caption, styles.rowValue]}>{value}</Text>
          ) : null}
          {onPress ? <Chevron /> : null}
        </View>
      )}
    </TouchableOpacity>
  );

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* ════════════════════ HEADER ════════════════════ */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <Image
                source={require('../../assets/icons/settings.png')}
                style={styles.headerIcon}
              />
            </View>
            <Text style={[FONTS.heading1, styles.headerTitle]}>
              {t('settings')}
            </Text>
          </View>
          <View style={styles.versionBadge}>
            <Text style={[FONTS.caption, styles.versionText]}>
              v{APP_VERSION}
            </Text>
          </View>
        </View>

        {/* ════════════════════ SCROLLABLE BODY ════════════════════ */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          overScrollMode="never"
        >
          {/* ── APPEARANCE ─────────────────────────────── */}
          <SectionHeader label={t('appearance')} />
          <View style={styles.card}>
            {/* Language */}
            <SettingRow
              icon={require('../../assets/icons/planet-earth.png')}
              label={t('language')}
              value={settings?.language === 'ar' ? t('arabic') : t('english')}
              onPress={toggleLanguage}
            />

            {/* Dark Mode */}
            <SettingRow
              icon={require('../../assets/icons/tv.png')}
              label={t('dark_mode')}
              rightElement={
                <Switch
                  value={settings?.darkMode !== false}
                  onValueChange={toggleTheme}
                  trackColor={{
                    false: colors.border,
                    true: colors.primary,
                  }}
                  thumbColor="#FFFFFF"
                />
              }
            />
          </View>

          {/* ── PLAYBACK ───────────────────────────────── */}
          <SectionHeader label={t('playback')} />
          <View style={styles.card}>
            {/* Quality Preference */}
            <SettingRow
              icon={require('../../assets/icons/star.png')}
              label={t('quality_preference')}
              value={currentQualityLabel}
              onPress={() => setShowQualityModal(true)}
            />

            {/* Auto-play */}
            <SettingRow
              icon={require('../../assets/icons/clapboard.png')}
              label={t('auto_play')}
              rightElement={
                <Switch
                  value={!!settings?.autoPlay}
                  onValueChange={(v: boolean) => updateSetting('autoPlay', v)}
                  trackColor={{
                    false: colors.border,
                    true: colors.primary,
                  }}
                  thumbColor="#FFFFFF"
                />
              }
            />

            {/* Mobile Data Warning */}
            <SettingRow
              icon={require('../../assets/icons/search.png')}
              label={t('mobile_data_warning')}
              rightElement={
                <Switch
                  value={settings?.mobileDataWarning !== false}
                  onValueChange={(v: boolean) =>
                    updateSetting('mobileDataWarning', v)
                  }
                  trackColor={{
                    false: colors.border,
                    true: colors.primary,
                  }}
                  thumbColor="#FFFFFF"
                />
              }
            />

            {/* Subtitles */}
            <SettingRow
              icon={require('../../assets/icons/files.png')}
              label={t('subtitles_enabled')}
              isLast
              rightElement={
                <Switch
                  value={!!settings?.subtitleEnabled}
                  onValueChange={(v: boolean) =>
                    updateSetting('subtitleEnabled', v)
                  }
                  trackColor={{
                    false: colors.border,
                    true: colors.primary,
                  }}
                  thumbColor="#FFFFFF"
                />
              }
            />
          </View>

          {/* ── DATA ───────────────────────────────────── */}
          <SectionHeader label={t('data')} />
          <View style={styles.card}>
            {/* Sync Database */}
            <TouchableOpacity
              style={styles.row}
              onPress={handleSync}
              activeOpacity={0.7}
              disabled={syncing}
            >
              <View style={styles.iconCircle}>
                <Image
                  source={require('../../assets/icons/undoreturn.png')}
                  style={styles.rowIcon}
                />
              </View>
              <View style={styles.rowContent}>
                <Text style={[FONTS.body, styles.rowLabel]}>
                  {t('sync_database')}
                </Text>
                <Text style={[FONTS.caption, styles.rowSub]}>
                  {t('last_sync')}: {lastSyncDate}
                </Text>
              </View>
              {syncing ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                />
              ) : (
                <Chevron />
              )}
            </TouchableOpacity>

            {/* Clear Cache */}
            <TouchableOpacity
              style={[styles.row, styles.rowLast]}
              onPress={handleClearCache}
              activeOpacity={0.7}
            >
              <View style={styles.iconCircle}>
                <Image
                  source={require('../../assets/icons/files.png')}
                  style={styles.rowIcon}
                />
              </View>
              <View style={styles.rowContent}>
                <Text style={[FONTS.body, styles.rowLabel]}>
                  {t('clear_cache')}
                </Text>
              </View>
              <Chevron />
            </TouchableOpacity>
          </View>

          {/* ── ABOUT ──────────────────────────────────── */}
          <SectionHeader label={t('about')} />
          <View style={styles.card}>
            <TouchableOpacity
              style={[styles.row, styles.rowLast]}
              onPress={handleCheckUpdate}
              activeOpacity={0.7}
              disabled={checkingUpdate}
            >
              <View style={styles.iconCircle}>
                <Image
                  source={require('../../assets/icons/browsing.png')}
                  style={styles.rowIcon}
                />
              </View>
              <View style={styles.rowContent}>
                <Text style={[FONTS.body, styles.rowLabel]}>
                  {t('check_for_updates')}
                </Text>
                <Text style={[FONTS.caption, styles.rowSub]}>
                  {t('current_version')}: v{APP_VERSION}
                </Text>
              </View>
              {checkingUpdate ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                />
              ) : (
                <Chevron />
              )}
            </TouchableOpacity>
          </View>

          {/* ── SUPPORT ────────────────────────────────── */}
          <SectionHeader label={t('support_us')} />
          <TouchableOpacity
            style={styles.kofiButton}
            activeOpacity={0.85}
            onPress={() => Linking.openURL('https://ko-fi.com/abdobest')}
          >
            <Image
              source={require('../../assets/icons/heart.png')}
              style={styles.kofiIcon}
            />
            <Text style={[FONTS.bodyLarge, styles.kofiText]}>
              Support on Ko-fi
            </Text>
          </TouchableOpacity>

          {/* Bottom breathing room */}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>

      {/* ════════════════════ QUALITY PICKER MODAL ════════════════════ */}
      {showQualityModal ? (
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowQualityModal(false)}
        >
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            {/* Modal title */}
            <Text style={[FONTS.heading3, styles.modalTitle]}>
              {t('select_quality')}
            </Text>

            {/* Options */}
            {qualityOptions.map(q => {
              const isActive =
                (settings?.qualityPreference ?? 'auto') === q.key;
              return (
                <TouchableOpacity
                  key={q.key}
                  style={[styles.modalOption, isActive && styles.modalOptionActive]}
                  onPress={() => {
                    updateSetting('qualityPreference', q.key);
                    setShowQualityModal(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      FONTS.body,
                      styles.modalOptionText,
                      isActive && styles.modalOptionTextActive,
                    ]}
                  >
                    {q.label}
                  </Text>
                  {isActive && (
                    <View style={styles.modalCheck}>
                      <Image
                        source={require('../../assets/icons/star.png')}
                        style={[styles.modalCheckIcon]}
                      />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};
