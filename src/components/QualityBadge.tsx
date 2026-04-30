import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {Typography} from '../theme/typography';

interface QualityBadgeProps {
  quality: string;
  size?: 'small' | 'normal';
  variant?: 'default' | 'category';
}

export const QualityBadge: React.FC<QualityBadgeProps> = ({quality, size = 'normal', variant = 'default'}) => {
  const isHD = quality.includes('1080');
  const isSD = quality.includes('480') || quality.includes('360');

  const getBadgeColor = () => {
    if (variant === 'category') return '#FFD700';
    if (isHD) return '#FFD700';
    if (isSD) return '#888';
    return '#00E5FF';
  };

  const getTextColor = () => {
    if (variant === 'category') return '#000';
    return '#000';
  };

  return (
    <View style={[styles.badge, {backgroundColor: getBadgeColor()}, size === 'small' && styles.badgeSmall]}>
      <Text style={[styles.text, {color: getTextColor()}, size === 'small' && styles.textSmall]}>{quality.split(' ')[0]}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 6,
  },
  badgeSmall: {
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  text: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold as any,
  },
  textSmall: {
    fontSize: Typography.sizes.xs,
  },
});
