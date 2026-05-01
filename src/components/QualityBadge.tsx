import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FONTS } from '../theme/typography';
import { useTheme } from '../hooks/useTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface QualityBadgeProps {
  label: string;
  variant?: 'quality' | 'genre' | 'rating';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const QualityBadge: React.FC<QualityBadgeProps> = ({
  label,
  variant = 'quality',
}) => {
  const { colors } = useTheme();
  const badgeStyle = colors.badge[variant] ?? colors.badge.quality;

  return (
    <View style={[styles.badge, { backgroundColor: badgeStyle.backgroundColor }]}>
      <Text
        style={[
          styles.text,
          FONTS.caption,
          { color: badgeStyle.color },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
