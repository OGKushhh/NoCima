import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getDetails } from '../services/faselhdScraper';

export default function DetailsScreen({ route }) {
  const { url } = route.params;
  const [details, setDetails] = useState(null);
  const navigation = useNavigation();

  useEffect(() => {
    getDetails(url).then(setDetails);
  }, [url]);

  if (!details) return <ActivityIndicator style={styles.load} size="large" color="#ff434c" />;

  const directLinks = details.sources.filter(s => s.type === 'direct');
  const iframeLinks = details.sources.filter(s => s.type === 'iframe');

  return (
    <ScrollView style={styles.container}>
      <Image source={{ uri: details.poster }} style={styles.poster} />
      <Text style={styles.title}>{details.title}</Text>
      <Text style={styles.desc}>{details.desc}</Text>

      {directLinks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Play (Native Player)</Text>
          <FlatList
            horizontal
            data={directLinks}
            keyExtractor={(item, i) => i.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.btn} onPress={() => navigation.navigate('Player', { source: item })}>
                <Text style={styles.btnText}>{item.label}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {iframeLinks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Servers (Web Player)</Text>
          <FlatList
            horizontal
            data={iframeLinks}
            keyExtractor={(item, i) => i.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => navigation.navigate('Player', { source: item })}>
                <Text style={styles.btnText}>{item.label}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414' },
  load: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  poster: { width: '100%', height: 300, resizeMode: 'contain' },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', padding: 15 },
  desc: { color: '#ccc', paddingHorizontal: 15, marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionHeader: { color: '#fff', marginLeft: 15, marginBottom: 10, fontWeight: 'bold' },
  btn: { backgroundColor: '#E50914', padding: 15, marginHorizontal: 10, borderRadius: 8, alignItems: 'center', minWidth: 100 },
  btnSecondary: { backgroundColor: '#333' },
  btnText: { color: '#fff', fontWeight: 'bold' }
});