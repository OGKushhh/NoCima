import React, {useState} from 'react';
import {
  View, StyleSheet, Text, TouchableOpacity, Switch,
  Linking, Alert, ScrollView, ActivityIndicator, Image,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Colors} from '../theme/colors';
import {useTranslation} from 'react-i18next';
import {getSettings, saveSettings} from '../storage';
import {syncIfNeeded, getLastSyncTime} from '../services/metadataService';
import {checkForUpdate, openUpdateUrl} from '../services/updateService';
import {APP_VERSION} from '../constants/endpoints';

export const SettingsScreen: React.FC = () => {
  const {t, i18n} = useTranslation();
  const [settings, setSettings] = useState(getSettings());
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showQualityModal, setShowQualityModal] = useState(false);

  const updateSetting = (key: string, value: any) => {
    const updated = {...settings, [key]: value};
    setSettings(updated);
    saveSettings(updated);
  };

  const toggleLanguage = () => {
    const newLang = settings.language === 'ar' ? 'en' : 'ar';
    updateSetting('language', newLang);
    i18n.changeLanguage(newLang);
  };

  const handleSync = async () => {
    setSyncing(true);
    await syncIfNeeded();
    setSyncing(false);
    Alert.alert(t('metadata_updated'));
  };

  const handleClearCache = () => {
    Alert.alert(
      t('clear_cache'),
      t('cache_cleared'),
      [{text: 'OK', onPress: () => {}}]
    );
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    const update = await checkForUpdate();
    setCheckingUpdate(false);
    if (update) {
      openUpdateUrl(update.downloadUrl);
    } else {
      Alert.alert(t('up_to_date'), `v${APP_VERSION}`);
    }
  };

  const lastSync = getLastSyncTime();
  const lastSyncDate = lastSync ? new Date(lastSync).toLocaleDateString() : t('never');

  const qualityOptions = [
    {key: 'auto', label: t('quality_auto')},
    {key: 'high', label: t('quality_high')},
    {key: 'medium', label: t('quality_medium')},
    {key: 'low', label: t('quality_low')},
  ];

  const currentQualityLabel = qualityOptions.find(q => q.key === (settings.qualityPreference || 'auto'))?.label || t('quality_auto');

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image source={require('../../assets/icons/settings.png')} style={styles.headerIcon} />
            <Text style={styles.headerTitle}>{t('settings')}</Text>
          </View>
          <Text style={styles.version}>v{APP_VERSION}</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* ── APPEARANCE ── */}
          <SectionTitle label={t('appearance')} />
          <View style={styles.section}>
            <Row
              icon={require('../../assets/icons/planet-earth.png')}
              label={t('language')}
              value={settings.language === 'ar' ? t('arabic') : t('english')}
              onPress={toggleLanguage}
              accent
            />
            <Row
              icon={require('../../assets/icons/tv.png')}
              label={t('dark_mode')}
              rightElement={
                <Switch
                  value={settings.darkMode !== false}
                  onValueChange={v => updateSetting('darkMode', v)}
                  trackColor={{false: Colors.dark.border, true: Colors.dark.primary}}
                  thumbColor="#fff"
                />
              }
            />
          </View>

          {/* ── PLAYBACK ── */}
          <SectionTitle label={t('playback')} />
          <View style={styles.section}>
            <Row
              icon={require('../../assets/icons/star.png')}
              label={t('quality_preference')}
              value={currentQualityLabel}
              onPress={() => setShowQualityModal(true)}
              accent
            />
            <Row
              icon={require('../../assets/icons/clapboard.png')}
              label={t('auto_play')}
              rightElement={
                <Switch
                  value={!!settings.autoPlay}
                  onValueChange={v => updateSetting('autoPlay', v)}
                  trackColor={{false: Colors.dark.border, true: Colors.dark.primary}}
                  thumbColor="#fff"
                />
              }
            />
            <Row
              icon={require('../../assets/icons/search.png')}
              label={t('mobile_data_warning')}
              rightElement={
                <Switch
                  value={settings.mobileDataWarning !== false}
                  onValueChange={v => updateSetting('mobileDataWarning', v)}
                  trackColor={{false: Colors.dark.border, true: Colors.dark.primary}}
                  thumbColor="#fff"
                />
              }
            />
            <Row
              icon={require('../../assets/icons/files.png')}
              label={t('subtitles_enabled')}
              rightElement={
                <Switch
                  value={!!settings.subtitleEnabled}
                  onValueChange={v => updateSetting('subtitleEnabled', v)}
                  trackColor={{false: Colors.dark.border, true: Colors.dark.primary}}
                  thumbColor="#fff"
                />
              }
            />
          </View>

          {/* ── DATA ── */}
          <SectionTitle label={t('data')} />
          <View style={styles.section}>
            <TouchableOpacity style={styles.row} onPress={handleSync} activeOpacity={0.7}>
              <View style={styles.rowIcon}>
                <Image source={require('../../assets/icons/undoreturn.png')} style={styles.icon} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>{t('sync_database')}</Text>
                <Text style={styles.rowSub}>{t('last_sync')}: {lastSyncDate}</Text>
              </View>
              {syncing
                ? <ActivityIndicator size="small" color={Colors.dark.primary} />
                : <ChevronIcon />
              }
            </TouchableOpacity>
            <Row
              icon={require('../../assets/icons/files.png')}
              label={t('clear_cache')}
              onPress={handleClearCache}
            />
          </View>

          {/* ── ABOUT ── */}
          <SectionTitle label={t('about')} />
          <View style={styles.section}>
            <TouchableOpacity style={styles.row} onPress={handleCheckUpdate} activeOpacity={0.7}>
              <View style={styles.rowIcon}>
                <Image source={require('../../assets/icons/browsing.png')} style={styles.icon} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>{t('check_for_updates')}</Text>
                <Text style={styles.rowSub}>{t('current_version')}: v{APP_VERSION}</Text>
              </View>
              {checkingUpdate
                ? <ActivityIndicator size="small" color={Colors.dark.primary} />
                : <ChevronIcon />
              }
            </TouchableOpacity>
          </View>

          {/* ── SUPPORT ── */}
          <SectionTitle label={t('support_us')} />
          <TouchableOpacity
            style={styles.kofiButton}
            activeOpacity={0.85}
            onPress={() => Linking.openURL('https://ko-fi.com/abdobest')}
          >
            <Image source={require('../../assets/icons/heart.png')} style={{width: 20, height: 20, tintColor: '#fff'}} />
            <Text style={styles.kofiText}>Support on Ko-fi</Text>
          </TouchableOpacity>

          <View style={{height: 30}} />
        </ScrollView>
      </SafeAreaView>

      {/* ── Quality Picker Modal ── */}
      <TouchableOpacity
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={() => setShowQualityModal(false)}
        disabled={!showQualityModal}
      >
        <View style={[styles.modalContent, {opacity: showQualityModal ? 1 : 0, pointerEvents: showQualityModal ? 'auto' : 'none'}]}>
          <Text style={styles.modalTitle}>{t('select_quality')}</Text>
          {qualityOptions.map(q => (
            <TouchableOpacity
              key={q.key}
              style={[
                styles.modalOption,
                settings.qualityPreference === q.key && styles.modalOptionActive,
              ]}
              onPress={() => { updateSetting('qualityPreference', q.key); setShowQualityModal(false); }}
            >
              <Text style={[
                styles.modalOptionText,
                settings.qualityPreference === q.key && styles.modalOptionTextActive,
              ]}>
                {q.label}
              </Text>
              {settings.qualityPreference === q.key && (
                <View style={styles.checkmark}>
                  <Image source={require('../../assets/icons/arrow.png')} style={[styles.icon, {tintColor: Colors.dark.primary}]} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </View>
  );
};

// ── Sub-components ──────────────────────────────────────────────────

const ChevronIcon = () => (
  <Image source={require('../../assets/icons/arrow.png')} style={[styles.icon, {tintColor: Colors.dark.textMuted}]} />
);

const SectionTitle = ({label}: {label: string}) => (
  <Text style={styles.sectionTitle}>{label}</Text>
);

interface RowProps {
  icon: any;
  label: string;
  value?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  accent?: boolean;
}

const Row = ({icon, label, value, onPress, rightElement, accent}: RowProps) => (
  <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
    <View style={styles.rowIcon}>
      <Image source={icon} style={[styles.icon, {tintColor: accent ? Colors.dark.primaryLight : Colors.dark.textSecondary}]} />
    </View>
    <Text style={styles.rowLabel}>{label}</Text>
    {rightElement || (
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {onPress ? <ChevronIcon /> : null}
      </View>
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  safe: {flex: 1},
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 28,
    height: 28,
    tintColor: Colors.dark.primary,
  },
  headerTitle: {
    color: Colors.dark.text,
    fontSize: 28,
    fontWeight: '800',
    fontFamily: 'Rubik',
  },
  version: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    fontFamily: 'Rubik',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  sectionTitle: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 8,
    fontFamily: 'Rubik',
  },
  section: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    marginHorizontal: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: `${Colors.dark.primary}18`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  icon: {
    width: 20,
    height: 20,
  },
  rowContent: {flex: 1},
  rowLabel: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 15,
    fontWeight: '500',
    fontFamily: 'Rubik',
  },
  rowSub: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'Rubik',
  },
  rowValue: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    marginRight: 4,
    fontFamily: 'Rubik',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkmark: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kofiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5E5B',
    marginHorizontal: 16,
    paddingVertical: 18,
    borderRadius: 16,
    gap: 10,
    shadowColor: '#FF5E5B',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  kofiText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  // Quality Modal
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 20,
    width: 260,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.5,
    shadowRadius: 24,
  },
  modalTitle: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Rubik',
    marginBottom: 14,
    textAlign: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 4,
  },
  modalOptionActive: {
    backgroundColor: `${Colors.dark.primary}20`,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}60`,
  },
  modalOptionText: {
    color: Colors.dark.textSecondary,
    fontSize: 15,
    fontFamily: 'Rubik',
  },
  modalOptionTextActive: {
    color: Colors.dark.primary,
    fontWeight: '700',
  },
});
