import React, {memo} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Dimensions} from 'react-native';
import FastImage from 'react-native-fast-image';
import {ContentItem} from '../types';
import {Colors} from '../theme/colors';
import {Typography} from '../theme/typography';

interface MovieCardProps {
  item: ContentItem;
  onPress: (item: ContentItem) => void;
  width?: number;
  showTitle?: boolean;
}

const CARD_WIDTH = (Dimensions.get('window').width - 36) / 2;
const CARD_HEIGHT = CARD_WIDTH * 1.5;

export const MovieCard: React.FC<MovieCardProps> = ({item, onPress, width = CARD_WIDTH, showTitle = true}) => {
  const imageUri = item['Image Source'];
  const firstGenre = item.Genres?.[0] || '';
  const rating = item.Rating || item['imdb_rating'] || '';
  const views = item.Views || item['views'] || '';
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

        {/* Top left: Rating + Views */}
        {(rating || views) && (
          <View style={styles.topLeftBadges}>
            {rating ? (
              <View style={styles.ratingBadge}>
                <Text style={styles.ratingIcon}>★</Text>
                <Text style={styles.ratingText}>{rating}</Text>
              </View>
            ) : null}
            {views ? (
              <View style={styles.viewsBadge}>
                <Text style={styles.viewsIcon}>👁</Text>
                <Text style={styles.viewsText}>{views}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Top right: Quality + Category */}
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
          <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
            {item.Title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: Colors.dark.card,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  imageContainer: {
    position: 'relative',
  },
  image: {
    borderRadius: 10,
    backgroundColor: Colors.dark.surfaceLight,
  },
  // Top left badges
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
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ratingIcon: {
    color: '#FFD700',
    fontSize: 10,
    marginRight: 2,
  },
  ratingText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold as any,
  },
  viewsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  viewsIcon: {
    fontSize: 9,
    marginRight: 2,
  },
  viewsText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium as any,
  },
  // Top right badges
  topRightBadges: {
    position: 'absolute',
    top: 6,
    right: 6,
    alignItems: 'flex-end',
    gap: 3,
  },
  qualityBadge: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  qualityText: {
    color: '#00E5FF',
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold as any,
  },
  categoryBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: 80,
  },
  categoryText: {
    color: '#000000',
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold as any,
  },
  info: {
    padding: 6,
    alignItems: 'center',
  },
  title: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.medium as any,
    lineHeight: 18,
    textAlign: 'center',
  },
});

export {CARD_WIDTH, CARD_HEIGHT};

export default memo(MovieCard);
