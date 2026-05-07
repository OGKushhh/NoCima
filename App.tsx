import React, {useEffect, useRef, useState} from 'react';
import {AppState, AppStateStatus, StatusBar, LogBox, View, ActivityIndicator, Text} from 'react-native';
import {SafeAreaProvider, initialWindowMetrics} from 'react-native-safe-area-context';
import {AppNavigator} from './src/navigation/AppNavigator';
import {UpdateModal} from './src/components/UpdateModal';
import {checkForUpdate, skipVersion, openUpdateUrl, ReleaseInfo} from './src/services/updateService';
import {restoreDownloads} from './src/services/downloadService';
import {retrySyncViews} from './src/services/viewService';
import {APP_VERSION} from './src/constants/endpoints';
import {storage} from './src/storage/Storage';
import {Colors} from './src/theme/colors';
import {ThemeProvider} from './src/hooks/useTheme';
import {AdProvider} from './src/ads/AdContext';
import {initCounters, recordLaunchAndCheckReward} from './src/ads/adManager';
import RewardAdPopup from './src/ads/RewardAdPopup';
import {CacheSyncOverlay, useCacheSync} from './src/components/CacheSyncOverlay';
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
  const [showRewardPopup, setShowRewardPopup] = useState(false);
  const { running: syncRunning, progress: syncProgress, start: startSync } = useCacheSync();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // Retry any queued view counts when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        retrySyncViews().catch(() => {});
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    storage.init().then(() => {
      initCounters();
      const shouldShowReward = recordLaunchAndCheckReward();
      setReady(true);
      restoreDownloads().catch(() => {});
      retrySyncViews().catch(() => {});
      // Start cache sync immediately — overlay shows automatically
      startSync(false);
      if (shouldShowReward) {
        // Small delay so the app finishes rendering before showing the popup
        setTimeout(() => setShowRewardPopup(true), 1500);
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
        <AdProvider>
          <StatusBar
            barStyle="light-content"
            backgroundColor={Colors.dark.background}
            translucent={false}
          />
          <AppNavigator />
          <UpdateModal
            visible={showUpdateModal}
            release={updateInfo}
            currentVersion={APP_VERSION}
            onDownload={(url: string) => { setShowUpdateModal(false); openUpdateUrl(url); }}
            onSkip={(version: string) => { skipVersion(version); setShowUpdateModal(false); }}
            onDismiss={() => setShowUpdateModal(false)}
          />
          <RewardAdPopup
            visible={showRewardPopup}
            onClose={() => setShowRewardPopup(false)}
          />
          {/* Cache sync overlay — shown on launch while downloading database */}
          <CacheSyncOverlay visible={syncRunning} progress={syncProgress} />
        </AdProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
};

export default App;
