import React, {useState} from 'react';
import {
  View, StyleSheet, Text, TouchableOpacity, Switch,
  Linking, Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
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

  const cycleQuality = () => {
    const prefs = ['auto', 'high', 'medium', 'low'] as const;
    const current = prefs.indexOf(settings.qualityPreference as any);
    updateSetting('qualityPreference', prefs[(current + 1) % prefs.length]);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('settings')}</Text>
          <Text style={styles.version}>v{APP_VERSION}</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* ── APPEARANCE ── */}
          <SectionTitle label={t('appearance')} />
          <View style={styles.section}>
            <Row
              icon="globe-outline"
              label={t('language')}
              value={settings.language === 'ar' ? t('arabic') : t('english')}
              onPress={toggleLanguage}
              accent
            />
            <Row
              icon="moon-outline"
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
              icon="options-outline"
              label={t('quality_preference')}
              value={t(`quality_${settings.qualityPreference || 'auto'}`)}
              onPress={cycleQuality}
              accent
            />
            <Row
              icon="play-circle-outline"
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
              icon="wifi-outline"
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
              icon="text-outline"
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
                <Icon name="sync-outline" size={22} color={Colors.dark.primaryLight} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>{t('sync_database')}</Text>
                <Text style={styles.rowSub}>{t('last_sync')}: {lastSyncDate}</Text>
              </View>
              {syncing
                ? <ActivityIndicator size="small" color={Colors.dark.primary} />
                : <Icon name="chevron-forward" size={18} color={Colors.dark.textMuted} />
              }
            </TouchableOpacity>
            <Row
              icon="trash-outline"
              label={t('clear_cache')}
              onPress={handleClearCache}
            />
          </View>

          {/* ── ABOUT ── */}
          <SectionTitle label={t('about')} />
          <View style={styles.section}>
            <TouchableOpacity style={styles.row} onPress={handleCheckUpdate} activeOpacity={0.7}>
              <View style={styles.rowIcon}>
                <Icon name="cloud-download-outline" size={22} color={Colors.dark.primaryLight} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>{t('check_for_updates')}</Text>
                <Text style={styles.rowSub}>{t('current_version')}: v{APP_VERSION}</Text>
              </View>
              {checkingUpdate
                ? <ActivityIndicator size="small" color={Colors.dark.primary} />
                : <Icon name="chevron-forward" size={18} color={Colors.dark.textMuted} />
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
            <Icon name="heart" size={20} color="#fff" />
            <Text style={styles.kofiText}>Support on Ko-fi ☕</Text>
          </TouchableOpacity>

          <View style={{height: 30}} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

// ── Sub-components ──────────────────────────────────────────────────

const SectionTitle = ({label}: {label: string}) => (
  <Text style={styles.sectionTitle}>{label}</Text>
);

interface RowProps {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  accent?: boolean;
}

const Row = ({icon, label, value, onPress, rightElement, accent}: RowProps) => (
  <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
    <View style={styles.rowIcon}>
      <Icon name={icon as any} size={22} color={accent ? Colors.dark.accentLight : Colors.dark.primaryLight} />
    </View>
    <Text style={styles.rowLabel}>{label}</Text>
    {rightElement || (
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {onPress ? <Icon name="chevron-forward" size={18} color={Colors.dark.textMuted} /> : null}
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
    alignItems: 'baseline',
    justifyContent: 'space-between',
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
    width: 38, height: 38,
    borderRadius: 10,
    backgroundColor: `${Colors.dark.primary}18`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
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
});
