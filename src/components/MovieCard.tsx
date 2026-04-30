import React, {memo} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Dimensions} from 'react-native';
import FastImage from 'react-native-fast-image';
import {ContentItem} from '../types';
import {Colors} from '../theme/colors';

interface MovieCardProps {
  item: ContentItem;
  onPress: (item: ContentItem) => void;
  width?: number;
  showTitle?: boolean;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
// Slightly tighter gap between columns
const CARD_WIDTH = (SCREEN_WIDTH - 40) / 2;
const CARD_HEIGHT = CARD_WIDTH * 1.5;

export const MovieCard: React.FC<MovieCardProps> = ({item, onPress, width = CARD_WIDTH, showTitle = true}) => {
  const imageUri = item['Image Source'];
  const firstGenre = item.Genres?.[0] || '';
  const rating = item.Rating || (item as any)['imdb_rating'] || '';
  const views = item.Views || (item as any)['views'] || '';
  const formatText = item.Format ? item.Format.split(' ')[0] : '';

  return (
    <TouchableOpacity style={[styles.card, {width}]} onPress={() => onPress(item)} activeOpacity={0.8}>
      <View style={styles.imageContainer}>
        <FastImage
          source={imageUri ? {uri: imageUri} : require('../../assets/placeholder.png')}
          style={[styles.image, {width, height: width * 1.5}]}
          resizeMode={FastImage.resizeMode.cover}
          fallback
        />

        {/* Top LEFT: Rating + Views (with icons) */}
        {(rating || views) && (
          <View style={styles.topLeftBadges}>
            {rating ? (
              <View style={styles.ratingBadge}>
                <Text style={styles.starIcon}>★</Text>
                <Text style={styles.ratingText}>{rating}</Text>
              </View>
            ) : null}
            {views ? (
              <View style={styles.viewsBadge}>
                <Text style={styles.eyeIcon}>👁</Text>
                <Text style={styles.viewsText}>{views}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Top RIGHT: Quality badge (cyan) + Category badge (yellow/black) */}
        <View style={styles.topRightBadges}>
          {formatText ? (
            <View style={styles.qualityBadge}>
              <Text style={styles.qualityText}>{formatText}</Text>
            </View>
          ) : null}
          {firstGenre ? (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText} numberOfLines={1}>{firstGenre}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {showTitle && (
        <View style={styles.info}>
          <Text
            style={styles.title}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {item.Title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 14,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.dark.card,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  imageContainer: {
    position: 'relative',
  },
  image: {
    borderRadius: 12,
    backgroundColor: Colors.dark.surfaceLight,
  },
  // Top LEFT: rating + views
  topLeftBadges: {
    position: 'absolute',
    top: 6,
    left: 6,
    alignItems: 'flex-start',
    gap: 3,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.78)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  starIcon: {
    color: '#FFD700',
    fontSize: 10,
    marginRight: 2,
  },
  ratingText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  viewsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.78)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  eyeIcon: {
    fontSize: 9,
    marginRight: 2,
  },
  viewsText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '500',
    fontFamily: 'Rubik',
  },
  // Top RIGHT: quality + category
  topRightBadges: {
    position: 'absolute',
    top: 6,
    right: 6,
    alignItems: 'flex-end',
    gap: 3,
  },
  qualityBadge: {
    backgroundColor: 'rgba(0,0,0,0.82)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#00E5FF40',
  },
  qualityText: {
    color: Colors.dark.badge.quality,
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  categoryBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    maxWidth: 80,
  },
  categoryText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  info: {
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 7,
    alignItems: 'center',
    minHeight: 38,
    justifyContent: 'center',
  },
  title: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    textAlign: 'center',
    fontFamily: 'Rubik',
  },
});

export {CARD_WIDTH, CARD_HEIGHT};

export default memo(MovieCard);
