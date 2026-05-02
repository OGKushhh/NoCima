import React, { useState, useMemo } from 'react';
import {
  View, StyleSheet, Text, TouchableOpacity, Switch,
  Linking, Alert, ActivityIndicator, Image, ScrollView, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { getSettings, saveSettings } from '../storage';
import { syncIfNeeded, getLastSyncTime } from '../services/metadataService';
import { checkForUpdate, openUpdateUrl } from '../services/updateService';
import { APP_VERSION } from '../constants/endpoints';
import { useTheme } from '../context/ThemeContext';

export const SettingsScreen: React.FC = () => {
  const { colors, mode, setDarkMode } = useTheme();
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState(getSettings());
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [qualityModalVisible, setQualityModalVisible] = useState(false);

  const qualityOptions = ['auto', '1080', '720', '480', '360'];

  const updateSetting = (key: string, value: any) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveSettings(updated);
    // Special handling for dark mode is done via setDarkMode separately
    if (key === 'dark_mode') {
      setDarkMode(value);
    }
  };

  const toggleLanguage = () => {
    const newLang = settings.language === 'ar' ? 'en' : 'ar';
    updateSetting('language', newLang);
    i18n.changeLanguage(newLang);
  };

  const handleSync = async () => {
    try {
      await syncIfNeeded();
      Alert.alert(t('success'), t('metadata_updated'));
    } catch (err: any) {
      Alert.alert(t('error'), err?.message || t('sync_failed'));
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      t('clear_cache'),
      t('clear_cache_confirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('ok'),
          style: 'destructive',
          onPress: () => Alert.alert(t('success'), t('cache_cleared')), // Replace with real cache clearing
        },
      ]
    );
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const update = await checkForUpdate();
      if (update) {
        openUpdateUrl(update.downloadUrl);
      } else {
        Alert.alert(t('up_to_date'), `v${APP_VERSION}`);
      }
    } catch (err: any) {
      Alert.alert(t('error'), err?.message || t('update_check_failed'));
    } finally {
      setCheckingUpdate(false);
    }
  };

  const lastSync = getLastSyncTime();
  const lastSyncDate = lastSync ? new Date(lastSync).toLocaleDateString() : t('never');

  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16 },
    headerLeft: { flex: 1 },
    headerTitle: { color: colors.text, fontSize: 28, fontWeight: 'bold', fontFamily: 'Rubik' },
    version: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
    headerIconContainer: { width: 48, height: 48, borderRadius: 24, backgroundColor: `${colors.primary}20`, justifyContent: 'center', alignItems: 'center' },
    sectionTitle: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, marginTop: 24, marginBottom: 10 },
    section: { backgroundColor: colors.surface, borderRadius: 14, marginHorizontal: 16, overflow: 'hidden', marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    rowIconContainer: { width: 38, height: 38, borderRadius: 10, backgroundColor: `${colors.primary}15`, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    rowLabel: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '500' },
    rowValue: { color: colors.textSecondary, fontSize: 14, marginRight: 4 },
    rowRight: { flexDirection: 'row', alignItems: 'center' },
    syncInfo: { flex: 1 },
    syncDate: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    kofiButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#29ABE2', margin: 16, paddingVertical: 16, borderRadius: 14 },
    kofiText: { color: '#fff', fontSize: 18, fontWeight: '600', marginLeft: 10, fontFamily: 'Rubik' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, width: '80%', maxWidth: 300, borderWidth: 1, borderColor: colors.border },
    modalTitle: { color: colors.text, fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
    modalOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    modalOptionText: { color: colors.text, fontSize: 16 },
  }), [colors]);

  const SettingRow = ({ icon, label, value, onPress, toggle, settingKey }: any) => {
    const handlePress = () => {
      if (toggle && settingKey) {
        updateSetting(settingKey, !settings[settingKey]);
      } else if (onPress) {
        onPress();
      }
    };
    return (
      <TouchableOpacity style={styles.row} onPress={handlePress} activeOpacity={0.7}>
        <View style={styles.rowIconContainer}>
          <Image source={icon} style={{ width: 22, height: 22, tintColor: colors.primary }} />
        </View>
        <Text style={styles.rowLabel}>{label}</Text>
        {toggle ? (
          <Switch
            value={!!settings[settingKey]}
            onValueChange={(v) => {
              updateSetting(settingKey, v);
              if (settingKey === 'dark_mode') setDarkMode(v);
            }}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        ) : (
          <View style={styles.rowRight}>
            <Text style={styles.rowValue}>{value}</Text>
            <Image source={require('../../assets/icons/chevron-down.png')} style={{ width: 20, height: 20, tintColor: colors.textMuted, transform: [{ rotate: '-90deg' }] }} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.content}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>{t('settings')}</Text>
              <Text style={styles.version}>v{APP_VERSION}</Text>
            </View>
            <View style={styles.headerIconContainer}>
              <Image source={require('../../assets/icons/settings.png')} style={{ width: 28, height: 28, tintColor: colors.primary }} />
            </View>
          </View>

          {/* Appearance */}
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
            />
          </View>

          {/* Playback */}
          <Text style={styles.sectionTitle}>{t('playback')}</Text>
          <View style={styles.section}>
            <SettingRow
              icon={require('../../assets/icons/browsing.png')}
              label={t('mobile_data_warning')}
              settingKey="mobile_data_warning"
              toggle
            />
            <SettingRow
              icon={require('../../assets/icons/play.png')}
              label={t('auto_play')}
              settingKey="auto_play"
              toggle
            />
            <TouchableOpacity style={styles.row} onPress={() => setQualityModalVisible(true)}>
              <View style={styles.rowIconContainer}>
                <Image source={require('../../assets/icons/settings.png')} style={{ width: 22, height: 22, tintColor: colors.primary }} />
              </View>
              <Text style={styles.rowLabel}>{t('quality_preference')}</Text>
              <View style={styles.rowRight}>
                <Text style={styles.rowValue}>{t(`quality_${settings.qualityPreference || 'auto'}`)}</Text>
                <Image source={require('../../assets/icons/chevron-down.png')} style={{ width: 20, height: 20, tintColor: colors.textMuted, transform: [{ rotate: '-90deg' }] }} />
              </View>
            </TouchableOpacity>
            <SettingRow
              icon={require('../../assets/icons/menu.png')}
              label={t('subtitles_enabled')}
              settingKey="subtitles_enabled"
              toggle
            />
          </View>

          {/* Data */}
          <Text style={styles.sectionTitle}>{t('data')}</Text>
          <View style={styles.section}>
            <TouchableOpacity style={styles.row} onPress={handleSync}>
              <View style={styles.rowIconContainer}>
                <Image source={require('../../assets/icons/sync.png')} style={{ width: 22, height: 22, tintColor: colors.primary }} />
              </View>
              <View style={styles.syncInfo}>
                <Text style={styles.rowLabel}>{t('sync_database')}</Text>
                <Text style={styles.syncDate}>{t('last_sync')}: {lastSyncDate}</Text>
              </View>
              <Image source={require('../../assets/icons/chevron-down.png')} style={{ width: 20, height: 20, tintColor: colors.textMuted, transform: [{ rotate: '-90deg' }] }} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.row} onPress={handleClearCache}>
              <View style={styles.rowIconContainer}>
                <Image source={require('../../assets/icons/files.png')} style={{ width: 22, height: 22, tintColor: colors.primary }} />
              </View>
              <Text style={styles.rowLabel}>{t('clear_cache')}</Text>
              <Image source={require('../../assets/icons/chevron-down.png')} style={{ width: 20, height: 20, tintColor: colors.textMuted, transform: [{ rotate: '-90deg' }] }} />
            </TouchableOpacity>
          </View>

          {/* About */}
          <Text style={styles.sectionTitle}>{t('about')}</Text>
          <View style={styles.section}>
            <TouchableOpacity style={styles.row} onPress={handleCheckUpdate}>
              <View style={styles.rowIconContainer}>
                <Image source={require('../../assets/icons/download-to-storage-drive.png')} style={{ width: 22, height: 22, tintColor: colors.primary }} />
              </View>
              <View style={styles.syncInfo}>
                <Text style={styles.rowLabel}>{t('check_for_updates')}</Text>
                <Text style={styles.syncDate}>{t('current_version')}: v{APP_VERSION}</Text>
              </View>
              {checkingUpdate ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Image source={require('../../assets/icons/chevron-down.png')} style={{ width: 20, height: 20, tintColor: colors.textMuted, transform: [{ rotate: '-90deg' }] }} />
              )}
            </TouchableOpacity>
          </View>

          {/* Support */}
          <Text style={styles.sectionTitle}>{t('support_us')}</Text>
          <View style={styles.section}>
            <TouchableOpacity style={styles.kofiButton} onPress={() => Linking.openURL('https://ko-fi.com/abdobest')}>
              <Image source={require('../../assets/icons/heart.png')} style={{ width: 22, height: 22, tintColor: '#fff' }} />
              <Text style={styles.kofiText}>Ko-fi</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Quality Preference Modal */}
      <Modal transparent visible={qualityModalVisible} animationType="fade" onRequestClose={() => setQualityModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setQualityModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('select_quality')}</Text>
            {qualityOptions.map((q) => (
              <TouchableOpacity
                key={q}
                style={styles.modalOption}
                onPress={() => {
                  updateSetting('qualityPreference', q);
                  setQualityModalVisible(false);
                }}
              >
                <Text style={styles.modalOptionText}>{t(`quality_${q}`)}</Text>
                {settings.qualityPreference === q && (
                  <Image source={require('../../assets/icons/checkmark.png')} style={{ width: 18, height: 18, tintColor: colors.primary }} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};