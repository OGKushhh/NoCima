import React, {useState} from 'react';
import {View, StyleSheet, Text, TouchableOpacity, Switch, Linking, Alert} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import {Colors} from '../theme/colors';
import {Typography} from '../theme/typography';
import {useTranslation} from 'react-i18next';
import {getSettings, saveSettings} from '../storage';
import {syncIfNeeded, getLastSyncTime} from '../services/metadataService';
import {checkForUpdate, openUpdateUrl} from '../services/updateService';
import {APP_VERSION} from '../constants/endpoints';

export const SettingsScreen: React.FC = () => {
  const {t, i18n} = useTranslation();
  const [settings, setSettings] = useState(getSettings());
  const [checkingUpdate, setCheckingUpdate] = useState(false);

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
    const updated = await syncIfNeeded();
    Alert.alert(t('metadata_updated'));
  };

  const handleClearCache = () => {
    Alert.alert(
      t('clear_cache'),
      t('cache_cleared'),
      [{text: 'OK'}]
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

  const SettingRow = ({
    icon, label, value, onPress, toggle,
  }: {
    icon: string;
    label: string;
    value?: string;
    onPress?: () => void;
    toggle?: boolean;
  }) => (
    <TouchableOpacity style={styles.row} onPress={toggle ? () => updateSetting(label, !settings[label]) : onPress} activeOpacity={0.7}>
      <View style={styles.rowIconContainer}>
        <Icon name={icon as any} size={22} color={Colors.dark.primary} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      {toggle ? (
        <Switch
          value={settings[label]}
          onValueChange={(v) => updateSetting(label, v)}
          trackColor={{false: Colors.dark.border, true: Colors.dark.primary}}
          thumbColor="#fff"
        />
      ) : (
        <View style={styles.rowRight}>
          <Text style={styles.rowValue}>{value}</Text>
          <Icon name="chevron-forward" size={20} color={Colors.dark.textMuted} />
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerIconContainer}>
            <Icon name="settings" size={28} color={Colors.dark.primary} />
          </View>
          <Text style={styles.headerTitle}>{t('settings')}</Text>
          <Text style={styles.version}>v{APP_VERSION}</Text>
        </View>

        {/* Appearance */}
        <Text style={styles.sectionTitle}>{t('appearance')}</Text>
        <View style={styles.section}>
          <SettingRow
            icon="globe-outline"
            label={t('language')}
            value={settings.language === 'ar' ? t('arabic') : t('english')}
            onPress={toggleLanguage}
          />
          <SettingRow
            icon="moon-outline"
            label={t('dark_mode')}
            toggle
          />
        </View>

        {/* Playback */}
        <Text style={styles.sectionTitle}>{t('playback')}</Text>
        <View style={styles.section}>
          <SettingRow icon="wifi-outline" label={t('mobile_data_warning')} toggle />
          <SettingRow icon="play-circle-outline" label={t('auto_play')} toggle />
          <TouchableOpacity style={styles.row} onPress={() => {
            const prefs = ['auto', 'high', 'medium', 'low'] as const;
            const current = prefs.indexOf(settings.qualityPreference as any);
            const next = prefs[(current + 1) % prefs.length];
            updateSetting('qualityPreference', next);
          }}>
            <View style={styles.rowIconContainer}>
              <Icon name="options-outline" size={22} color={Colors.dark.primary} />
            </View>
            <Text style={styles.rowLabel}>{t('quality_preference')}</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{t(`quality_${settings.qualityPreference || 'auto'}`)}</Text>
              <Icon name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            </View>
          </TouchableOpacity>
          <SettingRow icon="subtitles-outline" label={t('subtitles_enabled')} toggle />
        </View>

        {/* Data */}
        <Text style={styles.sectionTitle}>{t('data')}</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.row} onPress={handleSync}>
            <View style={styles.rowIconContainer}>
              <Icon name="sync-outline" size={22} color={Colors.dark.primary} />
            </View>
            <View style={styles.syncInfo}>
              <Text style={styles.rowLabel}>{t('sync_database')}</Text>
              <Text style={styles.syncDate}>{t('last_sync')}: {lastSyncDate}</Text>
            </View>
            <Icon name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={handleClearCache}>
            <View style={styles.rowIconContainer}>
              <Icon name="trash-outline" size={22} color={Colors.dark.primary} />
            </View>
            <Text style={styles.rowLabel}>{t('clear_cache')}</Text>
            <Icon name="chevron-forward" size={20} color={Colors.dark.textMuted} />
          </TouchableOpacity>
        </View>

        {/* About */}
        <Text style={styles.sectionTitle}>{t('about')}</Text>
        <View style={styles.section}>
          <TouchableOpacity style={styles.row} onPress={handleCheckUpdate}>
            <View style={styles.rowIconContainer}>
              <Icon name="cloud-download-outline" size={22} color={Colors.dark.primary} />
            </View>
            <View style={styles.syncInfo}>
              <Text style={styles.rowLabel}>{t('check_for_updates')}</Text>
              <Text style={styles.syncDate}>{t('current_version')}: v{APP_VERSION}</Text>
            </View>
            {checkingUpdate ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            ) : (
              <Icon name="chevron-forward" size={20} color={Colors.dark.textMuted} />
            )}
          </TouchableOpacity>
        </View>

        {/* Support */}
        <Text style={styles.sectionTitle}>{t('support_us')}</Text>
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.kofiButton}
            onPress={() => Linking.openURL('https://ko-fi.com/abdobest')}
          >
            <Icon name="heart" size={22} color="#fff" />
            <Text style={styles.kofiText}>Ko-fi</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

// Need ActivityIndicator
import {ActivityIndicator} from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    alignItems: 'center',
  },
  headerIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${Colors.dark.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.heading,
    fontWeight: Typography.weights.bold as any,
    fontFamily: 'Rubik',
  },
  version: {
    color: Colors.dark.textMuted,
    fontSize: Typography.sizes.md,
    marginTop: 4,
  },
  sectionTitle: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.semibold as any,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 10,
  },
  section: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.border,
  },
  rowIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: `${Colors.dark.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  rowLabel: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.medium as any,
  },
  rowValue: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.sm,
    marginRight: 4,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncInfo: {
    flex: 1,
  },
  syncDate: {
    color: Colors.dark.textMuted,
    fontSize: Typography.sizes.xs,
    marginTop: 2,
  },
  kofiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#29ABE2',
    margin: 16,
    paddingVertical: 16,
    borderRadius: 14,
  },
  kofiText: {
    color: '#fff',
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.semibold as any,
    marginLeft: 10,
    fontFamily: 'Rubik',
  },
});
