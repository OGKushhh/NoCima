import React, {useEffect, useState} from 'react';
import {StatusBar, LogBox, View, ActivityIndicator, Text} from 'react-native';
import {SafeAreaProvider, initialWindowMetrics} from 'react-native-safe-area-context';
import {AppNavigator} from './src/navigation/AppNavigator';
import {UpdateModal} from './src/components/UpdateModal';
import RewardedAdModal from './src/components/RewardedAdModal';
import {checkForUpdate, skipVersion, openUpdateUrl, ReleaseInfo} from './src/services/updateService';
import {restoreDownloads} from './src/services/downloadService';
import {APP_VERSION} from './src/constants/endpoints';
import {storage} from './src/storage/Storage';
import {Colors} from './src/theme/colors';
import {ThemeProvider} from './src/hooks/useTheme';
import {initAds, shouldShowRewardedPopup} from './src/services/adManager';
import './src/i18n';

LogBox.ignoreLogs([
  'ViewPropTypes will be removed',
  'NativeWind',
  'Non-serializable values were found in the navigation state',
  'VirtualizedLists should never be nested',
]);

const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<ReleaseInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showRewardedModal, setShowRewardedModal] = useState(false);

  useEffect(() => {
    storage.init().then(() => {
      // Initialise InMobi ads (also increments launch counter)
      initAds(/* gdprConsent= */ true);

      setReady(true);
      restoreDownloads().catch(() => {});

      // Show rewarded popup on every 3rd launch
      if (shouldShowRewardedPopup()) {
        setTimeout(() => setShowRewardedModal(true), 1500);
      }
      const timer = setTimeout(async () => {
        const update = await checkForUpdate();
        if (update) {
          setUpdateInfo(update);
          setTimeout(() => setShowUpdateModal(true), 500);
        }
      }, 3000);
      return () => clearTimeout(timer);
    });
  }, []);

  if (!ready) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.dark.background}}>
        <Text style={{color: Colors.dark.primary, fontSize: 28, fontWeight: '900', fontFamily: 'Rubik'}}>
          AbdoBest
        </Text>
        <ActivityIndicator size="small" color={Colors.dark.primary} style={{marginTop: 16}} />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <StatusBar
          barStyle="light-content"
          backgroundColor={Colors.dark.background}
          translucent={false}
        />
        <AppNavigator />
        <RewardedAdModal
          visible={showRewardedModal}
          onClose={() => setShowRewardedModal(false)}
        />
        <UpdateModal
          visible={showUpdateModal}
          release={updateInfo}
          currentVersion={APP_VERSION}
          onDownload={(url: string) => { setShowUpdateModal(false); openUpdateUrl(url); }}
          onSkip={(version: string) => { skipVersion(version); setShowUpdateModal(false); }}
          onDismiss={() => setShowUpdateModal(false)}
        />
      </SafeAreaProvider>
    </ThemeProvider>
  );
};

export default App;
