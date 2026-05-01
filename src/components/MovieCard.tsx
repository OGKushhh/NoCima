/**
 * MovieCard — outside thumbnail view
 *
 * Badges top-right:
 *   1. Quality  (full Format string, white text, dark bg)
 *   2. Category label  (Movie / Anime / Series / Dubbed / etc, orange bg)
 *   3. Seasons count   (episodic content only)
 *   4. Episodes count  (anime only)
 *
 * Bottom info:
 *   - Title (center, auto-shrinks to fit, NO extra category/status words)
 *   - Year  (small, muted, center)
 *
 * Rating + views are shown top-LEFT with star/eye icons.
 */

import React, {memo} from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions, Image,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import {ContentItem} from '../types';
import {Colors} from '../theme/colors';
import {useTranslation} from 'react-i18next';

interface MovieCardProps {
  item: ContentItem;
  onPress: (item: ContentItem) => void;
  width?: number;
}

const SW = Dimensions.get('window').width;
export const CARD_WIDTH  = (SW - 42) / 2;   // 14px padding each side, 14px between
export const CARD_HEIGHT = CARD_WIDTH * 1.52;

// Map category key → i18n translation key
const CATEGORY_I18N: Record<string, string> = {
  movies:          'movies',
  'dubbed-movies': 'dubbed_movies',
  hindi:           'hindi',
  'asian-movies':  'asian_movies',
  anime:           'anime',
  'anime-movies':  'anime_movies',
  series:          'series',
  tvshows:         'tvshows',
  'asian-series':  'asian_series',
};

const MovieCardComponent: React.FC<MovieCardProps> = ({item, onPress, width = CARD_WIDTH}) => {
  const {t} = useTranslation();
  const imageUri = item['Image Source'];
  const rating   = (item as any).Rating   || (item as any).imdb_rating || '';
  const views    = (item as any).Views    || (item as any).views       || '';
  const year     = (item as any).Year     || '';

  // Full quality string from Format field (e.g. "1080p WEB-DL")
  const quality  = item.Format || '';

  const catKey = (item.Category || '').toLowerCase();
  const categoryLabel = CATEGORY_I18N[catKey] ? t(CATEGORY_I18N[catKey]) : (item.Category || '');

  // Seasons / Episodes badges (episodic content)
  const seasons  = (item as any)['Seasons']
    ? Object.keys((item as any)['Seasons']).length
    : null;
  const episodes = (item as any)['Number Of Episodes'] ?? null;

  // Determine if anime (to show episodes badge)
  const isAnime  = (item.Category || '').toLowerCase().includes('anime');

  // Clean title — strip trailing status words like "مترجم اون لاين فيلم مسلسل"
  const cleanTitle = (item.Title || '')
    .replace(/\s*(مترجم|اون لاين|مسلسل|فيلم|online|مدبلج)\s*/gi, '')
    .trim();

  const h = width * 1.52;

  return (
    <TouchableOpacity
      style={[styles.card, {width}]}
      onPress={() => onPress(item)}
      activeOpacity={0.78}
    >
      <View style={styles.imageWrap}>
        <FastImage
          source={imageUri ? {uri: imageUri, priority: FastImage.priority.normal} : require('../../assets/placeholder.png')}
          style={{width, height: h, borderRadius: 11}}
          resizeMode={FastImage.resizeMode.cover}
          fallback
        />

        {/* ── TOP-LEFT: Rating + Views ── */}
        {(rating || views) ? (
          <View style={styles.topLeft}>
            {rating ? (
              <View style={styles.pill}>
                <Image source={require('../../assets/icons/star.png')} style={styles.badgeIcon} />
                <Text style={styles.pillText}>{rating}</Text>
              </View>
            ) : null}
            {views ? (
              <View style={styles.pill}>
                <Image source={require('../../assets/icons/eyes.png')} style={styles.badgeIcon} />
                <Text style={styles.pillText}>{views}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── TOP-RIGHT: Quality → Category → Seasons → Episodes ── */}
        <View style={styles.topRight}>
          {quality ? (
            <View style={styles.qualityBadge}>
              <Text style={styles.qualityText} numberOfLines={1}>{quality}</Text>
            </View>
          ) : null}
          {categoryLabel ? (
            <View style={styles.catBadge}>
              <Text style={styles.catText} numberOfLines={1}>{categoryLabel}</Text>
            </View>
          ) : null}
          {seasons && seasons > 0 ? (
            <View style={styles.seasonsBadge}>
              <Text style={styles.seasonsText}>{seasons}S</Text>
            </View>
          ) : null}
          {isAnime && episodes && episodes > 0 ? (
            <View style={styles.epsBadge}>
              <Text style={styles.epsText}>{episodes}EP</Text>
            </View>
          ) : null}
        </View>

        {/* Gradient scrim at bottom for readability */}
        <View style={[styles.scrim, {width, height: h * 0.35, top: h * 0.65, borderBottomLeftRadius: 11, borderBottomRightRadius: 11}]} />
      </View>

      {/* ── Title + Year ── */}
      <View style={styles.info}>
        <Text
          style={styles.title}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.68}
        >
          {cleanTitle}{year ? ` (${year})` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    borderRadius: 12,
    backgroundColor: Colors.dark.card,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.4,
    shadowRadius: 6,
    overflow: 'hidden',
  },
  imageWrap: {
    position: 'relative',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    // dark-to-transparent gradient via a semi-transparent black
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  // ── Top-left pills
  topLeft: {
    position: 'absolute',
    top: 6,
    left: 6,
    gap: 3,
    alignItems: 'flex-start',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    gap: 2,
  },
  badgeIcon:  {width: 10, height: 10, tintColor: '#FFD700'},
  pillText:  {color: '#FFF', fontSize: 10, fontWeight: '600', fontFamily: 'Rubik'},

  // ── Top-right badges
  topRight: {
    position: 'absolute',
    top: 6,
    right: 6,
    alignItems: 'flex-end',
    gap: 3,
  },
  qualityBadge: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    maxWidth: 90,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  qualityText: {
    color: '#FFFFFF',          // white as requested
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  catBadge: {
    backgroundColor: Colors.dark.primaryLight,  // orange
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    maxWidth: 80,
  },
  catText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  seasonsBadge: {
    backgroundColor: Colors.dark.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  seasonsText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  epsBadge: {
    backgroundColor: Colors.dark.accentLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  epsText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },

  // ── Info below image
  info: {
    paddingHorizontal: 7,
    paddingTop: 7,
    paddingBottom: 8,
    alignItems: 'center',
    minHeight: 42,
    justifyContent: 'center',
    gap: 2,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17,
    textAlign: 'center',
    fontFamily: 'Rubik',
  },
  year: {
    color: Colors.dark.textMuted,
    fontSize: 10,
    fontFamily: 'Rubik',
    textAlign: 'center',
  },
});

export const MovieCard = memo(MovieCardComponent);
export default MovieCard;
