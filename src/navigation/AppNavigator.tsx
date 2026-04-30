import React from 'react';
import {NavigationContainer, DarkTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import {Colors} from '../theme/colors';
import {HomeScreen} from '../screens/HomeScreen';
import {CategoryScreen} from '../screens/CategoryScreen';
import {DetailsScreen} from '../screens/DetailsScreen';
import {PlayerScreen} from '../screens/PlayerScreen';
import {DownloadsScreen} from '../screens/DownloadsScreen';
import {SettingsScreen} from '../screens/SettingsScreen';
import {useTranslation} from 'react-i18next';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const HomeTabs: React.FC = () => {
  const {t} = useTranslation();

  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        tabBarIcon: ({color, focused}) => {
          let iconName: string;
          switch (route.name) {
            case 'HomeTab':   iconName = focused ? 'home' : 'home-outline'; break;
            case 'BrowseTab': iconName = focused ? 'grid' : 'grid-outline'; break;
            case 'DownloadsTab': iconName = focused ? 'download' : 'download-outline'; break;
            case 'SettingsTab':  iconName = focused ? 'settings' : 'settings-outline'; break;
            default: iconName = 'ellipse-outline';
          }
          return <Icon name={iconName} size={26} color={color} />;
        },
        tabBarActiveTintColor: Colors.dark.primary,
        tabBarInactiveTintColor: Colors.dark.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.dark.tabBar,
          borderTopColor: Colors.dark.border,
          borderTopWidth: 0.5,
          height: 72,
          paddingBottom: 12,
          paddingTop: 8,
          elevation: 20,
          shadowColor: '#000',
          shadowOffset: {width: 0, height: -4},
          shadowOpacity: 0.3,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          fontFamily: 'Rubik',
          marginTop: 2,
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{tabBarLabel: t('home')}} />
      <Tab.Screen name="BrowseTab" component={CategoryScreen} initialParams={{category: 'movies'}} options={{tabBarLabel: t('browse')}} />
      <Tab.Screen name="DownloadsTab" component={DownloadsScreen} options={{tabBarLabel: t('downloads')}} />
      <Tab.Screen name="SettingsTab" component={SettingsScreen} options={{tabBarLabel: t('settings')}} />
    </Tab.Navigator>
  );
};

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer theme={DarkTheme}>
      <Stack.Navigator screenOptions={{headerShown: false, animation: 'slide_from_right'}}>
        <Stack.Screen name="Home" component={HomeTabs} />
        <Stack.Screen name="Category" component={CategoryScreen} options={{animation: 'slide_from_bottom'}} />
        <Stack.Screen name="Details" component={DetailsScreen} />
        <Stack.Screen name="Player" component={PlayerScreen} options={{animation: 'fade', orientation: 'all'}} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
