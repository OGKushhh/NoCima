import React, {useEffect, useState} from 'react';
import {StatusBar, LogBox, View, ActivityIndicator, Text} from 'react-native';
import {SafeAreaProvider, initialWindowMetrics} from 'react-native-safe-area-context';
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
  'VirtualizedLists should never be nested',
]);

const App: React.FC = () => {
  const [ready, setReady] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<ReleaseInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  useEffect(() => {
    storage.init().then(() => {
      setReady(true);
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
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      {/* NOT translucent — prevents clipping with notification bar */}
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
    </SafeAreaProvider>
  );
};

export default App;
