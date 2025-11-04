import { useEffect, useState } from 'react';
import { View, Text, FlatList, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from '../../supabase';
import { BlurView } from 'expo-blur';

type FileItem = { name: string; id: string };

export default function Zdjecia() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setErr('Brak sesji.'); setLoading(false); return; }

      const { data, error } = await supabase.storage.from('photos').list(user.id, {
        limit: 100, offset: 0, sortBy: { column: 'created_at', order: 'desc' }
      });
      if (error) { setErr('Nie mogę pobrać plików.'); setLoading(false); return; }

      setFiles((data ?? []).map(f => ({ name: f.name, id: `${user.id}/${f.name}` })));
      setLoading(false);
    })();
  }, []);

  if (loading) return <View style={styles.center}><ActivityIndicator /><Text style={styles.loading}>Ładowanie…</Text></View>;
  if (err) return <View style={styles.center}><Text style={styles.error}>{err}</Text></View>;

  return (
    <View style={styles.container}>
      <View style={styles.halo} />
      <BlurView intensity={60} tint="dark" style={styles.header}>
        <Text style={styles.title}>Zdjęcia z budowy</Text>
        <Text style={styles.subtitle}>Supabase Storage → photos/&lt;user.id&gt;</Text>
      </BlurView>

      <FlatList
        data={files}
        keyExtractor={(i) => i.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        renderItem={({ item }) => {
          const publicUrl = supabase.storage.from('photos').getPublicUrl(item.id).data.publicUrl;
          return (
            <View style={styles.card}>
              <Image source={{ uri: publicUrl }} style={styles.img} />
              <Text style={styles.caption}>{item.name}</Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1120' },
  halo: { position: 'absolute', width: 700, height: 700, borderRadius: 9999, backgroundColor: '#10B981', opacity: 0.18, top: -220, right: -120 },
  header: { marginTop: 50, marginHorizontal: 16, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  title: { color: '#ECFDF5', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#93C5FD', marginTop: 4 },
  card: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  img: { width: '100%', aspectRatio: 1 },
  caption: { color: '#E5E7EB', padding: 8, fontSize: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B1120' },
  loading: { color: '#E5E7EB', marginTop: 8 },
  error: { color: '#FCA5A5' },
});
