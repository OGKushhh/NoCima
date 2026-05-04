import React, { useState, useMemo, useCallback } from 'react';
import {
  View, StyleSheet, Text, TouchableOpacity, Switch,
  Linking, ActivityIndicator, Image, ScrollView, Modal,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { useTranslation } from 'react-i18next';
import { getSettings, saveSettings } from '../storage';
import { clearAllMetadataCache } from '../storage/cache';
import { syncIfNeeded, getLastSyncTime } from '../services/metadataService';
import { checkForUpdate, openUpdateUrl, skipVersion } from '../services/updateService';
import { APP_VERSION } from '../constants/endpoints';
import { useTheme } from '../hooks/useTheme';

// ─── Custom Modal ──────────────────────────────────────────────────────────────
interface AppModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  colors: any;
}

const AppModal: React.FC<AppModalProps> = ({ visible, onClose, children, colors }) => (
  <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
    <TouchableOpacity
      style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}
      activeOpacity={1}
      onPress={onClose}
    >
      <TouchableOpacity activeOpacity={1} onPress={() => {}}>
        <View style={{
          backgroundColor: colors.surface,
          borderRadius: 20,
          padding: 24,
          width: 300,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 20,
          elevation: 10,
        }}>
          {children}
        </View>
      </TouchableOpacity>
    </TouchableOpacity>
  </Modal>
);

// ─── Main Screen ───────────────────────────────────────────────────────────────
export const SettingsScreen: React.FC = () => {
  const { colors, isDark, setDarkMode } = useTheme();
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState(getSettings());

  // Modal states
  const [qualityModalVisible, setQualityModalVisible] = useState(false);
  const [cacheModalVisible, setCacheModalVisible] = useState(false);
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);

  // Loading states
  const [syncing, setSyncing] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const qualityOptions = ['auto', '1080', '720', '480', '360'];

  // ─── Unified settings updater ────────────────────────────────────────────────
  const updateSetting = useCallback((key: string, value: any) => {
    // Normalize: SettingsScreen uses camelCase to match storage defaults
    const storageKey = key === 'dark_mode' ? 'darkMode' : key;
    const updated = { ...settings, [storageKey]: value };
    setSettings(updated);
    saveSettings(updated);
    if (storageKey === 'darkMode') {
      setDarkMode(value);
    }
  }, [settings, setDarkMode]);

  const toggleLanguage = useCallback(() => {
    const newLang = settings.language === 'ar' ? 'en' : 'ar';
    updateSetting('language', newLang);
    i18n.changeLanguage(newLang);
  }, [settings.language, updateSetting, i18n]);

  // ─── Sync ────────────────────────────────────────────────────────────────────
  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await syncIfNeeded();
    } finally {
      setSyncing(false);
    }
  }, []);

  // ─── Clear cache ─────────────────────────────────────────────────────────────
  const handleClearCacheConfirm = useCallback(async () => {
    setClearingCache(true);
    try {
      await clearAllMetadataCache();
    } finally {
      setClearingCache(false);
      setCacheModalVisible(false);
    }
  }, []);

  // ─── Check update ────────────────────────────────────────────────────────────
  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const update = await checkForUpdate();
      setUpdateInfo(update);
      setUpdateModalVisible(true);
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  const lastSync = getLastSyncTime();
  const lastSyncText = lastSync
    ? new Date(lastSync).toLocaleDateString()
    : t('never');

  // ─── Styles ──────────────────────────────────────────────────────────────────
  const styles = useMemo(() => StyleSheet.create({
    container:          { flex: 1, backgroundColor: colors.background },
    content:            { flex: 1 },

    // Header
    header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },
    headerLeft:         { flex: 1 },
    headerTitle:        { fontSize: 30, fontWeight: '800', fontFamily: 'Rubik', letterSpacing: -0.5 },
    version:            { color: colors.textMuted, fontSize: 13, marginTop: 3 },
    headerIcon:         { width: 44, height: 44, borderRadius: 22, backgroundColor: `${colors.primary}18`, justifyContent: 'center', alignItems: 'center' },

    // Sections
    sectionTitle:       { color: colors.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, paddingHorizontal: 20, marginTop: 28, marginBottom: 8 },
    section:            { backgroundColor: colors.surface, borderRadius: 16, marginHorizontal: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },

    // Rows
    row:                { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    rowLast:            { borderBottomWidth: 0 },
    rowIcon:            { width: 36, height: 36, borderRadius: 10, backgroundColor: `${colors.primary}15`, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    rowLabel:           { flex: 1, color: colors.text, fontSize: 15, fontWeight: '500' },
    rowSub:             { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    rowValue:           { color: colors.textSecondary, fontSize: 14, marginRight: 6 },
    rowRight:           { flexDirection: 'row', alignItems: 'center' },

    // Donate button
    donateBtn:          { margin: 16, marginTop: 12, borderRadius: 16, overflow: 'hidden' },
    donateBtnInner:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, paddingHorizontal: 24 },
    donateBtnText:      { color: '#fff', fontSize: 17, fontWeight: '700', marginLeft: 10, fontFamily: 'Rubik', letterSpacing: 0.3 },

    // Modal
    modalTitle:         { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 6, fontFamily: 'Rubik' },
    modalBody:          { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 20 },
    modalActions:       { flexDirection: 'row', gap: 10 },
    modalBtnPrimary:    { flex: 1, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    modalBtnSecondary:  { flex: 1, backgroundColor: colors.surfaceLight, borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    modalBtnTextPrimary:    { color: '#fff', fontWeight: '700', fontSize: 15 },
    modalBtnTextSecondary:  { color: colors.text, fontWeight: '600', fontSize: 15 },
    modalOption:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    modalOptionText:    { color: colors.text, fontSize: 15 },
    modalDivider:       { height: 1, backgroundColor: colors.border, marginVertical: 16 },

    // Update modal extras
    updateBadge:        { alignSelf: 'flex-start', backgroundColor: `${colors.primary}20`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12 },
    updateBadgeText:    { color: colors.primary, fontSize: 12, fontWeight: '700' },
    changelogBox:       { backgroundColor: colors.background, borderRadius: 10, padding: 12, marginBottom: 20, maxHeight: 120 },
    changelogText:      { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  }), [colors]);

  // ─── Reusable row ─────────────────────────────────────────────────────────────
  const SettingRow = useCallback(({ icon, label, sub, value, onPress, toggle, settingKey, last }: any) => {
    const isOn = settingKey === 'dark_mode' ? isDark : !!settings[settingKey];
    return (
      <TouchableOpacity
        style={[styles.row, last && styles.rowLast]}
        onPress={() => {
          if (toggle && settingKey) updateSetting(settingKey, settingKey === 'dark_mode' ? !isDark : !settings[settingKey]);
          else if (onPress) onPress();
        }}
        activeOpacity={0.65}
      >
        <View style={styles.rowIcon}>
          <Image source={icon} style={{ width: 20, height: 20, tintColor: colors.primary }} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>{label}</Text>
          {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
        </View>
        {toggle ? (
          <Switch
            value={isOn}
            onValueChange={(v) => updateSetting(settingKey, v)}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        ) : (
          <View style={styles.rowRight}>
            {value ? <Text style={styles.rowValue}>{value}</Text> : null}
            <Image
              source={require('../../assets/icons/chevron-down.png')}
              style={{ width: 18, height: 18, tintColor: colors.textMuted, transform: [{ rotate: '-90deg' }] }}
            />
          </View>
        )}
      </TouchableOpacity>
    );
  }, [settings, isDark, colors, styles, updateSetting]);

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.content}>
        <ScrollView showsVerticalScrollIndicator={false}>

          {/* ── Header ── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {/* Brand-matched gradient title */}
              <LinearGradient
                colors={['#E53935', '#FF6D00']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ borderRadius: 4, alignSelf: 'flex-start' }}
              >
                <Text style={[styles.headerTitle, { color: 'transparent' }]}
                  // Gradient text trick via backgroundClip isn't supported in RN,
                  // so we layer: gradient behind transparent text won't work —
                  // instead use direct brand color:
                />
              </LinearGradient>
              {/* RN doesn't support gradient text natively — use brand primary */}
              <Text style={[styles.headerTitle, { color: colors.primary }]}>
                {t('settings')}
              </Text>
              <Text style={styles.version}>v{APP_VERSION}</Text>
            </View>
            <View style={styles.headerIcon}>
              <Image source={require('../../assets/icons/settings.png')} style={{ width: 24, height: 24, tintColor: colors.primary }} />
            </View>
          </View>

          {/* ── Appearance ── */}
          <Text style={styles.sectionTitle}>{t('appearance')}</Text>
          <View style={styles.section}>
            <SettingRow
              icon={require('../../assets/icons/planet-earth.png')}
              label={t('language')}
              value={settings.language === 'ar' ? t('arabic') : t('english')}
              onPress={toggleLanguage}
            />
            <SettingRow
              icon={require('../../assets/icons/night-mode.png')}
              label={t('dark_mode')}
              settingKey="dark_mode"
              toggle
              last
            />
          </View>

          {/* ── Playback ── */}
          <Text style={styles.sectionTitle}>{t('playback')}</Text>
          <View style={styles.section}>
            <SettingRow
              icon={require('../../assets/icons/browsing.png')}
              label={t('mobile_data_warning')}
              settingKey="mobileDataWarning"
              toggle
            />
            <SettingRow
              icon={require('../../assets/icons/play.png')}
              label={t('auto_play')}
              settingKey="autoPlay"
              toggle
            />
            <TouchableOpacity style={styles.row} onPress={() => setQualityModalVisible(true)} activeOpacity={0.65}>
              <View style={styles.rowIcon}>
                <Image source={require('../../assets/icons/setting.png')} style={{ width: 20, height: 20, tintColor: colors.primary }} />
              </View>
              <Text style={styles.rowLabel}>{t('quality_preference')}</Text>
              <View style={styles.rowRight}>
                <Text style={styles.rowValue}>{t(`quality_${settings.qualityPreference || 'auto'}`)}</Text>
                <Image source={require('../../assets/icons/chevron-down.png')} style={{ width: 18, height: 18, tintColor: colors.textMuted, transform: [{ rotate: '-90deg' }] }} />
              </View>
            </TouchableOpacity>
            <SettingRow
              icon={require('../../assets/icons/menu.png')}
              label={t('subtitles_enabled')}
              settingKey="subtitleEnabled"
              toggle
              last
            />
          </View>

          {/* ── Data ── */}
          <Text style={styles.sectionTitle}>{t('data')}</Text>
          <View style={styles.section}>
            <TouchableOpacity style={styles.row} onPress={handleSync} activeOpacity={0.65} disabled={syncing}>
              <View style={styles.rowIcon}>
                <Image source={require('../../assets/icons/sync.png')} style={{ width: 20, height: 20, tintColor: colors.primary }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{t('sync_database')}</Text>
                <Text style={styles.rowSub}>{t('last_sync')}: {lastSyncText}</Text>
              </View>
              {syncing
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Image source={require('../../assets/icons/chevron-down.png')} style={{ width: 18, height: 18, tintColor: colors.textMuted, transform: [{ rotate: '-90deg' }] }} />
              }
            </TouchableOpacity>
            <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={() => setCacheModalVisible(true)} activeOpacity={0.65}>
              <View style={styles.rowIcon}>
                <Image source={require('../../assets/icons/files.png')} style={{ width: 20, height: 20, tintColor: colors.error }} />
              </View>
              <Text style={[styles.rowLabel, { color: colors.error }]}>{t('clear_cache')}</Text>
              <Image source={require('../../assets/icons/chevron-down.png')} style={{ width: 18, height: 18, tintColor: colors.textMuted, transform: [{ rotate: '-90deg' }] }} />
            </TouchableOpacity>
          </View>

          {/* ── About ── */}
          <Text style={styles.sectionTitle}>{t('about')}</Text>
          <View style={styles.section}>
            <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={handleCheckUpdate} activeOpacity={0.65} disabled={checkingUpdate}>
              <View style={styles.rowIcon}>
                <Image source={require('../../assets/icons/download-to-storage-drive.png')} style={{ width: 20, height: 20, tintColor: colors.primary }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{t('check_for_updates')}</Text>
                <Text style={styles.rowSub}>{t('current_version')}: v{APP_VERSION}</Text>
              </View>
              {checkingUpdate
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Image source={require('../../assets/icons/chevron-down.png')} style={{ width: 18, height: 18, tintColor: colors.textMuted, transform: [{ rotate: '-90deg' }] }} />
              }
            </TouchableOpacity>
          </View>

          {/* ── Support — Donate button ── */}
          <Text style={styles.sectionTitle}>{t('support_us')}</Text>
          <TouchableOpacity
            style={styles.donateBtn}
            onPress={() => Linking.openURL('https://ko-fi.com/abdobest')}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#E53935', '#FF6D00']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.donateBtnInner}
            >
              <Image source={require('../../assets/icons/heart.png')} style={{ width: 22, height: 22, tintColor: '#fff' }} />
              <Text style={styles.donateBtnText}>Support on Ko-fi ☕</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>

      {/* ── Quality Modal ── */}
      <AppModal visible={qualityModalVisible} onClose={() => setQualityModalVisible(false)} colors={colors}>
        <Text style={styles.modalTitle}>{t('select_quality')}</Text>
        <View style={styles.modalDivider} />
        {qualityOptions.map((q, i) => (
          <TouchableOpacity
            key={q}
            style={[styles.modalOption, i === qualityOptions.length - 1 && { borderBottomWidth: 0 }]}
            onPress={() => { updateSetting('qualityPreference', q); setQualityModalVisible(false); }}
          >
            <Text style={[styles.modalOptionText, settings.qualityPreference === q && { color: colors.primary, fontWeight: '700' }]}>
              {t(`quality_${q}`)}
            </Text>
            {settings.qualityPreference === q && (
              <Image source={require('../../assets/icons/checkmark.png')} style={{ width: 18, height: 18, tintColor: colors.primary }} />
            )}
          </TouchableOpacity>
        ))}
      </AppModal>

      {/* ── Clear Cache Modal ── */}
      <AppModal visible={cacheModalVisible} onClose={() => setCacheModalVisible(false)} colors={colors}>
        <Text style={styles.modalTitle}>{t('clear_cache')}</Text>
        <Text style={styles.modalBody}>{t('clear_cache_confirm')}</Text>
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setCacheModalVisible(false)}>
            <Text style={styles.modalBtnTextSecondary}>{t('cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalBtnPrimary, { backgroundColor: colors.error }]}
            onPress={handleClearCacheConfirm}
            disabled={clearingCache}
          >
            {clearingCache
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.modalBtnTextPrimary}>{t('clear_cache')}</Text>
            }
          </TouchableOpacity>
        </View>
      </AppModal>

      {/* ── Update Modal ── */}
      <AppModal visible={updateModalVisible} onClose={() => setUpdateModalVisible(false)} colors={colors}>
        {updateInfo ? (
          <>
            <View style={styles.updateBadge}>
              <Text style={styles.updateBadgeText}>v{updateInfo.version} {t('latest_version')}</Text>
            </View>
            <Text style={styles.modalTitle}>{t('update_available')}</Text>
            <Text style={styles.modalBody}>{t('update_description')}</Text>
            {updateInfo.changelog ? (
              <ScrollView style={styles.changelogBox} showsVerticalScrollIndicator={false}>
                <Text style={styles.changelogText}>{updateInfo.changelog}</Text>
              </ScrollView>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnSecondary}
                onPress={() => { skipVersion(updateInfo.version); setUpdateModalVisible(false); }}
              >
                <Text style={styles.modalBtnTextSecondary}>{t('skip_version')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnPrimary}
                onPress={() => { openUpdateUrl(updateInfo.downloadUrl); setUpdateModalVisible(false); }}
              >
                <Text style={styles.modalBtnTextPrimary}>{t('download_update')}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.modalTitle}>{t('up_to_date')}</Text>
            <Text style={styles.modalBody}>v{APP_VERSION}</Text>
            <TouchableOpacity style={styles.modalBtnPrimary} onPress={() => setUpdateModalVisible(false)}>
              <Text style={styles.modalBtnTextPrimary}>{t('ok')}</Text>
            </TouchableOpacity>
          </>
        )}
      </AppModal>
    </View>
  );
};