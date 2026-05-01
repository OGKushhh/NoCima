/**
 * MovieCard — Netflix/Disney+ inspired poster card
 *
 * Layout:
 *   ┌─────────────────────┐
 *   │                     │
 *   │     Poster Image    │
 *   │   (2:3 ratio)       │
 *   │                     │
 *   │ ┌─────┐      ┌────┐│
 *   │ │ 4K  │      │★7.8││
 *   └─┴─────┴──────┴────┴┘
 *   │ Movie Title        │
 *   │ 2024 · Series      │
 *   └────────────────────┘
 *
 * Badges:
 *   - Bottom-left:  Quality pill (semi-transparent dark bg)
 *   - Bottom-right: Rating with star icon
 */

import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import { ContentItem } from '../types';
import { useTheme } from '../hooks/useTheme';
import { heading3, caption } from '../theme/typography';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface MovieCardProps {
  item: ContentItem;
  /** Card width in px — height is derived as width × 1.5 (2:3 poster ratio) */
  width?: number;
  /** Card press handler */
  onPress?: () => void;
  /** Show the rating badge (star + number) */
  showRating?: boolean;
  /** Show the format/year subtitle line */
  showFormat?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_WIDTH = 130;
const POSTER_RATIO = 1.5; // height = width × 1.5  →  2:3 poster aspect

/** Backward-compatible export used by HomeScreen / CategoryScreen FlatList layouts */
export const CARD_WIDTH = DEFAULT_WIDTH;

// Local PNG icon assets
const ICON_STAR = require('../../assets/icons/star.png');
const ICON_CLAPBOARD = require('../../assets/icons/clapboard.png');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a short quality label (e.g. "1080p WEB-DL" → "1080p") */
const getQualityLabel = (format?: string): string => {
  if (!format) return '';
  return format.split(' ')[0] || format;
};

/** Build subtitle text: "2024 · Series" or "1080p · Movie · 2023" */
const getSubtitle = (
  item: ContentItem,
  showFormat: boolean,
): string | null => {
  const parts: string[] = [];

  if (showFormat) {
    const format = item?.Format;
    if (format) {
      parts.push(format);
    }
  }

  const year = item?.Year;
  if (year) {
    parts.push(year);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const MovieCardComponent: React.FC<MovieCardProps> = ({
  item,
  width = DEFAULT_WIDTH,
  onPress,
  showRating = true,
  showFormat = true,
}) => {
  const { colors } = useTheme();

  // ── Guard: no item → render empty spacer ──
  if (!item) {
    return (
      <View
        style={[{ width, borderRadius: 12, backgroundColor: colors.surfaceElevated, ...colors.shadowMd, overflow: 'hidden' }]}
      />
    );
  }

  const posterHeight = width * POSTER_RATIO;

  const imageUri = item?.['Image Source'];
  const title = item?.Title || 'Untitled';
  const rating = item?.Rating;
  const qualityLabel = getQualityLabel(item?.Format);
  const subtitle = getSubtitle(item, showFormat);

  const hasImage = !!imageUri;
  const hasRating = showRating && !!rating;
  const hasQuality = !!qualityLabel;

  const styles = useMemo(() => StyleSheet.create({
    // ── Card container ──
    container: {
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      ...colors.shadowMd,
      overflow: 'hidden',
    },

    // ── Poster wrapper (holds image + badges) ──
    posterWrap: {
      position: 'relative',
      width: '100%',
      overflow: 'hidden',
    },

    posterImage: {
      width: '100%',
      height: '100%',
      borderRadius: 12,
    },

    // ── Shimmer / skeleton placeholder ──
    placeholder: {
      width: '100%',
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    placeholderIcon: {
      width: 36,
      height: 36,
      tintColor: colors.textMuted,
      opacity: 0.5,
    },

    // ── Quality badge — bottom-left ──
    qualityBadgeWrap: {
      position: 'absolute',
      bottom: 6,
      left: 6,
    },
    qualityBadge: {
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 999,
      maxWidth: 60,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qualityBadgeText: {
      ...caption,
      color: colors.text,
      fontWeight: '700',
      fontSize: 10,
    },

    // ── Rating badge — bottom-right ──
    ratingBadgeWrap: {
      position: 'absolute',
      bottom: 6,
      right: 6,
    },
    ratingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 999,
      gap: 2,
    },
    starIcon: {
      width: 10,
      height: 10,
      tintColor: colors.rating,
    },
    ratingText: {
      ...caption,
      color: colors.rating,
      fontWeight: '700',
      fontSize: 10,
    },

    // ── Info section below poster ──
    infoSection: {
      paddingTop: 8,
      paddingHorizontal: 4,
      paddingBottom: 10,
    },
    title: {
      ...heading3,
      color: colors.text,
      fontSize: 13,
      lineHeight: 17,
      letterSpacing: -0.1,
    },
    subtitle: {
      ...caption,
      color: colors.textMuted,
      marginTop: 2,
    },
  }), [colors]);

  return (
    <TouchableOpacity
      style={[styles.container, { width }]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={!onPress}
    >
      {/* ── Poster ── */}
      <View style={[styles.posterWrap, { height: posterHeight }]}>
        {hasImage ? (
          <FastImage
            source={{
              uri: imageUri,
              priority: FastImage.priority.normal,
              cache: FastImage.cacheControl.immutable,
            }}
            style={styles.posterImage}
            resizeMode={FastImage.resizeMode.cover}
            fallback
          />
        ) : (
          <View style={[styles.placeholder, { height: posterHeight }]}>
            <Image
              source={ICON_CLAPBOARD}
              style={styles.placeholderIcon}
              resizeMode="contain"
            />
          </View>
        )}

        {/* ── Quality Badge — bottom-left ── */}
        {hasQuality && (
          <View style={styles.qualityBadgeWrap}>
            <View style={styles.qualityBadge}>
              <Text style={styles.qualityBadgeText} numberOfLines={1}>
                {qualityLabel}
              </Text>
            </View>
          </View>
        )}

        {/* ── Rating Badge — bottom-right ── */}
        {hasRating && (
          <View style={styles.ratingBadgeWrap}>
            <View style={styles.ratingBadge}>
              <Image
                source={ICON_STAR}
                style={styles.starIcon}
                resizeMode="contain"
              />
              <Text style={styles.ratingText}>{rating}</Text>
            </View>
          </View>
        )}
      </View>

      {/* ── Title ── */}
      <View style={styles.infoSection}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        {/* ── Subtitle (format · year) ── */}
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

// ---------------------------------------------------------------------------
// Memoized export with custom comparison
// ---------------------------------------------------------------------------
const arePropsEqual = (
  prevProps: MovieCardProps,
  nextProps: MovieCardProps,
): boolean => {
  // Only re-render if the item identity (by id) or interactive props change
  return (
    prevProps.item?.id === nextProps.item?.id &&
    prevProps.width === nextProps.width &&
    prevProps.showRating === nextProps.showRating &&
    prevProps.showFormat === nextProps.showFormat &&
    prevProps.onPress === nextProps.onPress
  );
};

export const MovieCard = memo(MovieCardComponent, arePropsEqual);
export default MovieCard;
