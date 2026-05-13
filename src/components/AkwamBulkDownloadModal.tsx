/**
 * AkwamBulkDownloadModal
 *
 * Download overlay for arabic-series.
 * Shows:
 *  1. Quality selector (1080p / 720p / 480p / available)
 *  2. Scope: All Episodes | Specific Episodes
 *  3. If Specific: scrollable episode checklist
 *  4. Download button → queues each selected episode
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Pressable, ActivityIndicator, ToastAndroid, Platform,
} from 'react-native';
import { ArabicEpisode, ArabicEpisodeSource, ContentItem } from '../types';
import { Colors } from '../theme/colors';
import { startDownload } from '../services/downloadService';
import { resolveAkwamDownloadLink } from '../services/akwamDownload';

interface Props {
  visible: boolean;
  item: ContentItem;
  episodes: ArabicEpisode[];
  onClose: () => void;
}

type Scope = 'all' | 'specific';

/** Collect all unique qualities across all episodes */
function allQualities(episodes: ArabicEpisode[]): string[] {
  const set = new Set<string>();
  episodes.forEach(ep => ep.sources.forEach(s => set.add(s.quality)));
  return Array.from(set).sort((a, b) => {
    const num = (q: string) => parseInt(q) || 0;
    return num(b) - num(a); // highest first
  });
}

/** Pick best matching source for a quality label, fallback to highest available */
function pickSource(ep: ArabicEpisode, quality: string): ArabicEpisodeSource | null {
  if (!ep.sources.length) return null;
  const exact = ep.sources.find(s => s.quality === quality);
  if (exact) return exact;
  return ep.sources.reduce((best, src) => {
    const bestNum = parseInt(best.quality) || 0;
    const srcNum  = parseInt(src.quality)  || 0;
    return srcNum > bestNum ? src : best;
  });
}

const AkwamBulkDownloadModal: React.FC<Props> = ({
  visible, item, episodes, onClose,
}) => {
  const qualities = useMemo(() => allQualities(episodes), [episodes]);

  // FIX: useState initial value only runs once on mount, when episodes is still [].
  // Use useEffect to set selQuality whenever qualities becomes available.
  const [selQuality, setSelQuality] = useState<string>('');
  useEffect(() => {
    if (qualities.length > 0 && !selQuality) {
      setSelQuality(qualities[0]);
    }
  }, [qualities]);

  const [scope,    setScope]    = useState<Scope>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);

  const toggleEp = (num: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === episodes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(episodes.map(e => e.number)));
    }
  };

  const handleDownload = async () => {
    const toDownload = scope === 'all'
      ? episodes
      : episodes.filter(ep => selected.has(ep.number));

    if (!toDownload.length) return;

    setLoading(true);
    try {
      // FIX: await all promises so startDownload fully completes (writes to
      // storage + fires notify()) before the modal closes and the downloads
      // screen tries to read the list. The old fire-and-forget meant the modal
      // closed before anything was ever saved.
      await Promise.all(
        toDownload.map(async ep => {
          const src = pickSource(ep, selQuality);
          if (!src) return;
          const epItem: ContentItem = { ...item, Title: ep.title };
          try {
            const mp4 = await resolveAkwamDownloadLink(src.download_url);
            await startDownload(epItem, mp4, selQuality, item.id, item.Title);
          } catch (e) {
            console.warn('[BulkDownload] ep error:', ep.number, e);
          }
        })
      );
      if (Platform.OS === 'android') {
        ToastAndroid.show(`✓ تمت إضافة ${toDownload.length} حلقة للتحميل`, ToastAndroid.SHORT);
      }
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setLoading(false);
        onClose();
      }, 1200);
    } catch {
      setLoading(false);
    }
  };

  const qualityColor = (q: string) => {
    if (q.includes('1080')) return '#FF4500';
    if (q.includes('720'))  return '#4CAF50';
    if (q.includes('480'))  return '#2196F3';
    return Colors.dark.textMuted;
  };

  const downloadCount = scope === 'all' ? episodes.length : selected.size;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>

          {/* Handle */}
          <View style={styles.handle} />

          <Text style={styles.title}>تحميل الحلقات / Download Episodes</Text>
          <Text style={styles.seriesName} numberOfLines={1}>{item.Title}</Text>

          {/* ── Quality selector ── */}
          <Text style={styles.sectionLabel}>الجودة / Quality</Text>
          <View style={styles.qualityRow}>
            {qualities.map(q => (
              <TouchableOpacity
                key={q}
                style={[styles.qualityBtn, selQuality === q && { borderColor: qualityColor(q), backgroundColor: `${qualityColor(q)}20` }]}
                onPress={() => setSelQuality(q)}
                activeOpacity={0.7}
              >
                <Text style={[styles.qualityBtnText, selQuality === q && { color: qualityColor(q) }]}>
                  {q}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Scope selector ── */}
          <Text style={styles.sectionLabel}>النطاق / Scope</Text>
          <View style={styles.scopeRow}>
            <TouchableOpacity
              style={[styles.scopeBtn, scope === 'all' && styles.scopeBtnActive]}
              onPress={() => setScope('all')}
            >
              <Text style={[styles.scopeBtnText, scope === 'all' && styles.scopeBtnTextActive]}>
                كل الحلقات / All ({episodes.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.scopeBtn, scope === 'specific' && styles.scopeBtnActive]}
              onPress={() => setScope('specific')}
            >
              <Text style={[styles.scopeBtnText, scope === 'specific' && styles.scopeBtnTextActive]}>
                اختر / Specific
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Episode list (when specific) ── */}
          {scope === 'specific' && (
            <>
              <TouchableOpacity style={styles.selectAllBtn} onPress={toggleAll}>
                <Text style={styles.selectAllText}>
                  {selected.size === episodes.length ? '✓ إلغاء الكل' : 'تحديد الكل / Select All'}
                </Text>
              </TouchableOpacity>
              <ScrollView style={styles.epList} showsVerticalScrollIndicator={false}>
                {episodes.map(ep => {
                  const isSelected = selected.has(ep.number);
                  const src = pickSource(ep, selQuality);
                  const actualQuality = src?.quality ?? '';
                  const isFallback = !!src && actualQuality !== selQuality;
                  return (
                    <TouchableOpacity
                      key={ep.number}
                      style={[styles.epRow, isSelected && styles.epRowSelected]}
                      onPress={() => toggleEp(ep.number)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                        {isSelected && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                      <View style={styles.epInfo}>
                        <Text style={styles.epTitle} numberOfLines={1}>{ep.title}</Text>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2}}>
                          {src?.size_mb ? (
                            <Text style={styles.epSize}>
                              {src.size_mb >= 1024
                                ? `${(src.size_mb / 1024).toFixed(1)} GB`
                                : `${src.size_mb.toFixed(0)} MB`}
                            </Text>
                          ) : null}
                          {isFallback && (
                            <Text style={{color: '#FF9800', fontSize: 10, fontFamily: 'Rubik'}}>
                              ↑ {actualQuality}
                            </Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}

          {/* ── Download button ── */}
          <TouchableOpacity
            style={[
              styles.downloadBtn,
              (!downloadCount || loading) && { opacity: 0.5 },
              done && { backgroundColor: '#4CAF50' },
            ]}
            onPress={handleDownload}
            disabled={!downloadCount || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.downloadBtnText}>
                {done
                  ? '✓ تمت الإضافة / Added!'
                  : `⬇ تحميل ${downloadCount} حلقة / Download ${downloadCount} Episode${downloadCount !== 1 ? 's' : ''}`}
              </Text>
            )}
          </TouchableOpacity>

        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#12121f',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    fontFamily: 'Rubik',
    textAlign: 'center',
  },
  seriesName: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontFamily: 'Rubik',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontFamily: 'Rubik',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  qualityRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  qualityBtn: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  qualityBtnText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Rubik',
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  scopeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  scopeBtnActive: {
    backgroundColor: 'rgba(255,69,0,0.15)',
    borderColor: '#FF4500',
  },
  scopeBtnText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontFamily: 'Rubik',
    fontWeight: '600',
    textAlign: 'center',
  },
  scopeBtnTextActive: {
    color: '#FF4500',
  },
  selectAllBtn: {
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  selectAllText: {
    color: Colors.dark.primary,
    fontSize: 12,
    fontFamily: 'Rubik',
  },
  epList: {
    maxHeight: 240,
    marginBottom: 16,
  },
  epRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  epRowSelected: {
    backgroundColor: 'rgba(255,69,0,0.1)',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#FF4500',
    borderColor: '#FF4500',
  },
  checkmark: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  epInfo: {
    flex: 1,
  },
  epTitle: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'Rubik',
  },
  epSize: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontFamily: 'Rubik',
    marginTop: 2,
  },
  downloadBtn: {
    backgroundColor: '#FF4500',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#FF4500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  downloadBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Rubik',
  },
});

export default AkwamBulkDownloadModal;
