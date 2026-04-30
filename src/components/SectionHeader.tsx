import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {Colors} from '../theme/colors';
import {useTranslation} from 'react-i18next';

interface SectionHeaderProps {
  title: string;
  onSeeAll?: () => void;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({title, onSeeAll}) => {
  const {t} = useTranslation();
  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <View style={styles.accent} />
        <Text style={styles.title}>{title}</Text>
      </View>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} style={styles.seeAllBtn}>
          <Text style={styles.seeAll}>{t('all')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accent: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: Colors.dark.primary,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  seeAllBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: `${Colors.dark.primary}18`,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${Colors.dark.primary}30`,
  },
  seeAll: {
    color: Colors.dark.primary,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Rubik',
  },
});
