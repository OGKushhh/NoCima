import React from 'react';
import {View, ActivityIndicator, StyleSheet} from 'react-native';
import {Colors} from '../theme/colors';

export const LoadingSpinner: React.FC<{size?: 'small' | 'large'; fullScreen?: boolean}> = ({size = 'large', fullScreen = true}) => {
  if (!fullScreen) {
    return <ActivityIndicator size={size} color={Colors.dark.primary} />;
  }
  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={Colors.dark.primary} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.dark.background,
  },
});
