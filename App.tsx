import React, {useEffect, useState} from 'react';
import {StatusBar, LogBox, View, ActivityIndicator} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {AppNavigator} from './src/navigation/AppNavigator';
import {UpdateModal} from './src/components/UpdateModal';
import {checkForUpdate, skipVersion, openUpdateUrl, ReleaseInfo} from './src/services/updateService';
import {APP_VERSION} from './src/constants/endpoints';
import {storage} from './src/storage/Storage';
import {Colors} from './src/theme/colors';
import './src/i18n';

LogBox.ignoreLogs([
  'ViewPropTypes will be removed',
  'NativeWind',
  'Non-serializable values were found in the navigation state',
]);

const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<ReleaseInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  useEffect(() => {
    // Initialize storage (load from AsyncStorage into memory) before rendering
    storage.init().then(() => {
      setReady(true);

      // Check for updates after 3 seconds (don't block app launch)
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

  const handleDownloadUpdate = (url: string) => {
    setShowUpdateModal(false);
    openUpdateUrl(url);
  };

  const handleSkipVersion = (version: string) => {
    skipVersion(version);
    setShowUpdateModal(false);
  };

  if (!ready) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.dark.background}}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <AppNavigator />
      <UpdateModal
        visible={showUpdateModal}
        release={updateInfo}
        currentVersion={APP_VERSION}
        onDownload={handleDownloadUpdate}
        onSkip={handleSkipVersion}
        onDismiss={() => setShowUpdateModal(false)}
      />
    </SafeAreaProvider>
  );
};

export default App;
