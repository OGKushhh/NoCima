import React from 'react';
import {NavigationContainer, DarkTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import {Colors} from '../theme/colors';
import {HomeScreen} from '../screens/HomeScreen';
import {CategoryScreen} from '../screens/CategoryScreen';
import {SearchScreen} from '../screens/SearchScreen';
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
        tabBarIcon: ({color, size, focused}) => {
          let iconName: string;
          switch (route.name) {
            case 'HomeTab':
              iconName = focused ? 'home' : 'home-outline';
              break;
            case 'BrowseTab':
              iconName = focused ? 'grid' : 'grid-outline';
              break;
            case 'DownloadsTab':
              iconName = focused ? 'download' : 'download-outline';
              break;
            case 'SettingsTab':
              iconName = focused ? 'settings' : 'settings-outline';
              break;
            default:
              iconName = 'ellipse-outline';
          }
          return <Icon name={iconName} size={24} color={color} />;
        },
        tabBarActiveTintColor: Colors.dark.primary,
        tabBarInactiveTintColor: Colors.dark.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.dark.tabBar,
          borderTopColor: Colors.dark.border,
          height: 68,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: '600',
          fontFamily: 'Rubik',
        },
        headerShown: false,
        // Force LTR direction so tabs appear in defined order
        direction: 'ltr',
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{tabBarLabel: t('home')}}
      />
      <Tab.Screen
        name="BrowseTab"
        component={CategoryScreen}
        initialParams={{category: 'movies'}}
        options={{tabBarLabel: t('browse')}}
      />
      <Tab.Screen
        name="DownloadsTab"
        component={DownloadsScreen}
        options={{tabBarLabel: t('downloads')}}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{tabBarLabel: t('settings')}}
      />
    </Tab.Navigator>
  );
};

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer theme={DarkTheme}>
      <Stack.Navigator
        screenOptions={{headerShown: false, animation: 'slide_from_right'}}
      >
        <Stack.Screen name="Home" component={HomeTabs} />
        <Stack.Screen
          name="Category"
          component={CategoryScreen}
          options={{animation: 'slide_from_bottom'}}
        />
        <Stack.Screen name="Details" component={DetailsScreen} />
        <Stack.Screen
          name="Player"
          component={PlayerScreen}
          options={{animation: 'fade', orientation: 'all'}}
        />
        <Stack.Screen
          name="SearchResults"
          component={SearchScreen}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
