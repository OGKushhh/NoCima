import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Image, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { scrapeHome } from '../services/faselhdScraper';

export default function HomeScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  useEffect(() => {
    scrapeHome().then(result => {
      setData(result);
      setLoading(false);
    });
  }, []);

  const Card = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('Details', { url: item.id })}>
      <Image source={{ uri: item.poster || 'https://via.placeholder.com/120x180' }} style={styles.img} />
      <Text style={styles.txt} numberOfLines={2}>{item.title}</Text>
    </TouchableOpacity>
  );

  if (loading) return <ActivityIndicator size="large" color="#ff434c" style={styles.loader} />;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Latest Movies</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={data?.movies || []}
        renderItem={({ item }) => <Card item={item} />}
        keyExtractor={(item, idx) => idx.toString()}
      />

      <Text style={styles.header}>Latest Episodes</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={data?.episodes || []}
        renderItem={({ item }) => <Card item={item} />}
        keyExtractor={(item, idx) => idx.toString()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414', paddingTop: 10 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginVertical: 10, marginLeft: 15 },
  card: { width: 130, marginRight: 15, marginBottom: 10 },
  img: { width: 130, height: 190, borderRadius: 8, backgroundColor: '#333' },
  txt: { color: '#ccc', marginTop: 5, fontSize: 12, textAlign: 'center' }
});