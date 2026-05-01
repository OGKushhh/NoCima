import React, { useMemo } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { SPACING } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTheme } from '../hooks/useTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface LoadingSpinnerProps {
  size?: 'small' | 'large' | number;
  text?: string;
  fullScreen?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size,
  text,
  fullScreen = true,
}) => {
  const { colors } = useTheme();
  const safeSize: 'small' | 'large' | number = size ?? 'large';

  const styles = useMemo(() => createStyles(colors), [colors]);

  const spinner = (
    <ActivityIndicator
      size={safeSize}
      color={colors.primary}
      accessibilityLabel="Loading"
    />
  );

  const label = text ? (
    <Text style={[styles.text, FONTS.bodySmall]}>{text}</Text>
  ) : null;

  if (!fullScreen) {
    return (
      <View style={styles.inlineContainer}>
        {spinner}
        {label}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {spinner}
      {label}
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  inlineContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  text: {
    color: colors.textMuted,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
});
