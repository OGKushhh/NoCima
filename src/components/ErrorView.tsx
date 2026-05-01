import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  SafeAreaView,
} from 'react-native';
import { RADIUS, SPACING } from '../theme/colors';
import { FONTS } from '../theme/typography';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ErrorViewProps {
  /** Primary error heading – displayed in heading3 */
  errorText?: string;
  /** Optional subtitle for additional context – displayed in bodySmall */
  subtitle?: string;
  /** Optional retry callback – shows the red Retry button when provided */
  onRetry?: () => void;
  /** Optional "Go Back" callback – shows the secondary Go Back button */
  onGoBack?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const ErrorView: React.FC<ErrorViewProps> = ({
  errorText,
  subtitle,
  onRetry,
  onGoBack,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safeArea: {
          flex: 1,
          backgroundColor: colors.background,
        },
        container: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: SPACING.xl,
        },
        icon: {
          width: 56,
          height: 56,
          resizeMode: 'contain',
          marginBottom: SPACING.lg,
        },
        title: {
          color: colors.text,
          textAlign: 'center',
        },
        subtitle: {
          color: colors.textMuted,
          textAlign: 'center',
          marginTop: SPACING.sm,
        },
        retryButton: {
          marginTop: SPACING.xl,
          backgroundColor: colors.primary,
          borderRadius: RADIUS.md,
          paddingHorizontal: SPACING.xxl,
          paddingVertical: SPACING.md,
          minHeight: 48,
          justifyContent: 'center',
          alignItems: 'center',
          ...colors.shadowSm,
        },
        retryText: {
          color: '#FFFFFF',
          fontWeight: '700',
        },
        goBackButton: {
          marginTop: SPACING.md,
          backgroundColor: colors.surface,
          borderRadius: RADIUS.md,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: SPACING.xxl,
          paddingVertical: SPACING.md,
          minHeight: 48,
          justifyContent: 'center',
          alignItems: 'center',
        },
        goBackText: {
          color: colors.textSecondary,
        },
      }),
    [colors],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Error icon */}
        <Image
          source={require('../../assets/icons/nlp.png')}
          style={[styles.icon, { tintColor: colors.error }]}
        />

        {/* Title */}
        <Text style={[styles.title, FONTS.heading3]}>
          {errorText ?? t('error_loading')}
        </Text>

        {/* Optional subtitle */}
        {subtitle ? (
          <Text style={[styles.subtitle, FONTS.bodySmall]}>{subtitle}</Text>
        ) : null}

        {/* Action buttons */}
        {onRetry ? (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={onRetry}
            activeOpacity={0.8}
            accessibilityLabel={t('retry')}
            accessibilityRole="button">
            <Text style={[styles.retryText, FONTS.bodyLarge]}>
              {t('retry')}
            </Text>
          </TouchableOpacity>
        ) : null}

        {onGoBack ? (
          <TouchableOpacity
            style={styles.goBackButton}
            onPress={onGoBack}
            activeOpacity={0.7}
            accessibilityLabel={t('go_back')}
            accessibilityRole="button">
            <Text style={[styles.goBackText, FONTS.body]}>
              {t('go_back')}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SafeAreaView>
  );
};
