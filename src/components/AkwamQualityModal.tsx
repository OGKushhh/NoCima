/**
 * AkwamQualityModal
 *
 * Simple popup to pick a quality before watching an arabic-series episode.
 * Auto-picks if user's preferred quality exists in the available sources.
 */

import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Pressable,
} from 'react-native';
import { ArabicEpisode, ArabicEpisodeSource } from '../types';
import { Colors } from '../theme/colors';

interface Props {
  visible: boolean;
  episode: ArabicEpisode | null;
  preferredQuality: string; // from settings: 'auto' | '1080' | '720' | '480' | '360'
  onSelect: (source: ArabicEpisodeSource, episode: ArabicEpisode) => void;
  onClose: () => void;
}

/** Map settings quality key → label that appears in source.quality strings */
const QUALITY_MAP: Record<string, string[]> = {
  '1080': ['1080p', '1080'],
  '720':  ['720p',  '720'],
  '480':  ['480p',  '480'],
  '360':  ['360p',  '360'],
};

export function resolveQuality(
  sources: ArabicEpisodeSource[],
  preferredQuality: string,
): ArabicEpisodeSource | null {
  if (!sources.length) return null;
  if (preferredQuality === 'auto') return sources[0]; // highest available

  const labels = QUALITY_MAP[preferredQuality];
  if (labels) {
    const match = sources.find(s => labels.some(l => s.quality.includes(l)));
    if (match) return match;
  }
  return null; // preferred not found → show picker
}

const AkwamQualityModal: React.FC<Props> = ({
  visible, episode, preferredQuality, onSelect, onClose,
}) => {
  if (!episode) return null;

  const qualityColor = (q: string) => {
    if (q.includes('1080')) return '#FF4500';
    if (q.includes('720'))  return '#4CAF50';
    if (q.includes('480'))  return '#2196F3';
    return Colors.dark.textMuted;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>

          {/* Title */}
          <Text style={styles.title} numberOfLines={2}>{episode.title}</Text>
          <Text style={styles.subtitle}>اختر الجودة / Select Quality</Text>

          {/* Quality options */}
          {episode.sources.map((src, i) => (
            <TouchableOpacity
              key={i}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => onSelect(src, episode)}
            >
              <View style={[styles.qualityBadge, { borderColor: qualityColor(src.quality) }]}>
                <Text style={[styles.qualityText, { color: qualityColor(src.quality) }]}>
                  {src.quality}
                </Text>
              </View>
              <View style={styles.rowInfo}>
                {src.size_mb ? (
                  <Text style={styles.sizeText}>
                    {src.size_mb >= 1024
                      ? `${(src.size_mb / 1024).toFixed(1)} GB`
                      : `${src.size_mb.toFixed(0)} MB`}
                  </Text>
                ) : null}
              </View>
              <View style={styles.playIcon}>
                <Text style={styles.playText}>▶</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Cancel */}
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>إلغاء / Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Rubik',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontFamily: 'Rubik',
    textAlign: 'center',
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  qualityBadge: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 64,
    alignItems: 'center',
  },
  qualityText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  rowInfo: {
    flex: 1,
    paddingHorizontal: 12,
  },
  sizeText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontFamily: 'Rubik',
  },
  playIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF4500',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playText: {
    color: '#fff',
    fontSize: 12,
  },
  cancelBtn: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
  },
  cancelText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontFamily: 'Rubik',
  },
});

export default AkwamQualityModal;
