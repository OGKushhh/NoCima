import React from 'react';
import {Image, StyleSheet} from 'react-native';
import {NavigationContainer, DarkTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Colors} from '../theme/colors';
import {HomeScreen} from '../screens/HomeScreen';
import {CategoryScreen} from '../screens/CategoryScreen';
import {DetailsScreen} from '../screens/DetailsScreen';
import {PlayerScreen} from '../screens/PlayerScreen';
import {DownloadsScreen} from '../screens/DownloadsScreen';
import {SettingsScreen} from '../screens/SettingsScreen';
import {useTranslation} from 'react-i18next';

// Custom PNG icons
const Icons = {
  home:      require('../../assets/icons/tv.png'),
  browse:    require('../../assets/icons/browsing.png'),
  downloads: require('../../assets/icons/files.png'),
  settings:  require('../../assets/icons/settings.png'),
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TabIcon = ({source, color}: {source: any; color: string}) => (
  <Image
    source={source}
    style={[styles.tabIcon, {tintColor: color}]}
    resizeMode="contain"
  />
);

const HomeTabs: React.FC = () => {
  const {t} = useTranslation();
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: Colors.dark.primary,
        tabBarInactiveTintColor: Colors.dark.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.dark.tabBar,
          borderTopColor: Colors.dark.border,
          borderTopWidth: 0.5,
          height: 72,
          paddingBottom: 12,
          paddingTop: 8,
          elevation: 24,
          shadowColor: '#000',
          shadowOffset: {width: 0, height: -4},
          shadowOpacity: 0.35,
          shadowRadius: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          fontFamily: 'Rubik',
          marginTop: 2,
        },
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="HomeTab" component={HomeScreen}
        options={{
          tabBarLabel: t('home'),
          tabBarIcon: ({color}) => <TabIcon source={Icons.home} color={color} />,
        }}
      />
      <Tab.Screen
        name="BrowseTab" component={CategoryScreen}
        initialParams={{category: 'movies'}}
        options={{
          tabBarLabel: t('browse'),
          tabBarIcon: ({color}) => <TabIcon source={Icons.browse} color={color} />,
        }}
      />
      <Tab.Screen
        name="DownloadsTab" component={DownloadsScreen}
        options={{
          tabBarLabel: t('downloads'),
          tabBarIcon: ({color}) => <TabIcon source={Icons.downloads} color={color} />,
        }}
      />
      <Tab.Screen
        name="SettingsTab" component={SettingsScreen}
        options={{
          tabBarLabel: t('settings'),
          tabBarIcon: ({color}) => <TabIcon source={Icons.settings} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
};

// Custom nav theme matching AbdoBest palette
const AbdoBestTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.dark.background,
    card: Colors.dark.surface,
    border: Colors.dark.border,
    primary: Colors.dark.primary,
  },
};

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer theme={AbdoBestTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          animationDuration: 220,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      >
        <Stack.Screen name="Home" component={HomeTabs} />
        <Stack.Screen
          name="Category" component={CategoryScreen}
          options={{animation: 'slide_from_right', animationDuration: 220}}
        />
        <Stack.Screen
          name="Details" component={DetailsScreen}
          options={{animation: 'fade_from_bottom', animationDuration: 260}}
        />
        <Stack.Screen
          name="Player" component={PlayerScreen}
          options={{animation: 'fade', animationDuration: 180, orientation: 'all'}}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  tabIcon: {
    width: 26,
    height: 26,
  },
});
