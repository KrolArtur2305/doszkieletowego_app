import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../supabase';

const STORAGE_BUCKET = 'zdjecia'; // <<< JEŚLI masz inny bucket, zmień TĘ nazwę

type PhotoRecord = {
  id: string;
  file_path: string;
  created_at: string | null;
  nazwa?: string | null;
  komentarz?: string | null;
  etap_id?: string | null;
  public_url?: string; // dodajemy pole z gotowym URL-em do wyświetlania
};

export default function PhotosScreen() {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildPublicUrl = (filePath: string) => {
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    return data.publicUrl;
  };

  const loadPhotos = async () => {
    setError(null);
    setLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) {
        router.replace('/(auth)/login');
        return;
      }

      const { data, error } = await supabase
        .from('zdjecia')
        .select('id, file_path, created_at, nazwa, komentarz, etap_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (data || []) as PhotoRecord[];

      const enhanced = rows.map((p) => ({
        ...p,
        public_url: p.file_path ? buildPublicUrl(p.file_path) : undefined,
      }));

      console.log('FOTO z Supabase:', enhanced);
      setPhotos(enhanced);
    } catch (e: any) {
      console.error('Błąd ładowania zdjęć', e);
      setError('Nie udało się załadować zdjęć. Spróbuj ponownie.');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPhotos();
    setRefreshing(false);
  };

  useEffect(() => {
    loadPhotos();
  }, []);

  const handleAddPhoto = async () => {
    try {
      setUploading(true);
      setError(null);

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Brak uprawnień', 'Nadaj uprawnienia do galerii, aby dodać zdjęcie.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset.uri) {
        Alert.alert('Błąd', 'Nie udało się odczytać pliku.');
        return;
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) {
        router.replace('/(auth)/login');
        return;
      }

      // Przygotowanie ścieżki w bucketcie
      const extMatch = asset.uri.split('.').pop();
      const fileExt = extMatch ? extMatch.split('?')[0] : 'jpg';
      const fileName = `photo_${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Konwersja uri -> blob
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      // Upload do Storage
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, blob, {
          contentType: blob.type || 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Wpis do tabeli zdjecia (zachowujemy pattern: w file_path trzymamy samą ścieżkę)
      const { error: insertError } = await supabase.from('zdjecia').insert({
        user_id: user.id,
        projekt_id: null,
        etap_id: null,
        nazwa: fileName,
        komentarz: null,
        file_path: filePath,
      });

      if (insertError) throw insertError;

      await loadPhotos();
      Alert.alert('Sukces', 'Zdjęcie zostało dodane.');
    } catch (e: any) {
      console.error('Błąd dodawania zdjęcia', e);
      Alert.alert('Błąd', 'Nie udało się dodać zdjęcia. Spróbuj ponownie.');
    } finally {
      setUploading(false);
    }
  };

  const renderPhoto = ({ item }: { item: PhotoRecord }) => {
    const title = item.nazwa || 'Zdjęcie z budowy';
    const desc = item.komentarz || 'Brak komentarza';
    const dateLabel = item.created_at
      ? new Date(item.created_at).toLocaleString('pl-PL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Brak daty';

    return (
      <BlurView intensity={40} tint="dark" style={styles.photoCard}>
        <View style={styles.photoImageWrapper}>
          {item.public_url ? (
            <Image
              source={{ uri: item.public_url }}
              style={styles.photoImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>Brak podglądu</Text>
            </View>
          )}
          <View style={styles.photoStageBadge}>
            <Text style={styles.photoStageText}>Etap budowy</Text>
          </View>
        </View>

        <View style={styles.photoBody}>
          <Text style={styles.photoTitle}>{title}</Text>
          <Text numberOfLines={2} style={styles.photoDesc}>
            {desc}
          </Text>
          <View style={styles.photoFooter}>
            <Text style={styles.photoDate}>{dateLabel}</Text>
            <Text style={styles.photoMeta}>ID: {item.id}</Text>
          </View>
        </View>
      </BlurView>
    );
  };

  if (loading && photos.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10B981" />
        <Text style={styles.centerText}>Ładuję zdjęcia z budowy…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.halo} />

      <Text style={styles.title}>Zdjęcia z budowy</Text>
      <Text style={styles.subtitle}>
        Twoja historia budowy w jednym futurystycznym podglądzie.
      </Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={photos}
        keyExtractor={(item) => item.id}
        renderItem={renderPhoto}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#10B981"
          />
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.emptyText}>
              Nie dodano jeszcze żadnych zdjęć. Zrób pierwsze ujęcie z budowy!
            </Text>
          ) : null
        }
      />

      <TouchableOpacity
        style={[styles.fab, uploading && { opacity: 0.6 }]}
        disabled={uploading}
        onPress={handleAddPhoto}
      >
        {uploading ? (
          <ActivityIndicator color="#022c22" />
        ) : (
          <Text style={styles.fabText}>+</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  halo: {
    position: 'absolute',
    width: 650,
    height: 650,
    borderRadius: 9999,
    backgroundColor: '#22c55e',
    opacity: 0.14,
    top: -260,
    right: -200,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ECFDF5',
    marginTop: 40,
    marginHorizontal: 20,
  },
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  photoCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.38)',
    overflow: 'hidden',
    marginBottom: 18,
    backgroundColor: 'rgba(15,23,42,0.9)',
  },
  photoImageWrapper: {
    position: 'relative',
    height: 210,
    backgroundColor: '#020617',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderText: {
    color: '#6B7280',
  },
  photoStageBadge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.95)',
  },
  photoStageText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
  },
  photoBody: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  photoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 4,
  },
  photoDesc: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  photoFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  photoDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  photoMeta: {
    fontSize: 11,
    color: '#6B7280',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6B7280',
    marginTop: 40,
    paddingHorizontal: 24,
  },
  errorText: {
    color: '#FCA5A5',
    textAlign: 'center',
    marginHorizontal: 20,
    marginBottom: 8,
  },
  center: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    marginTop: 8,
    color: '#9CA3AF',
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 32,
    width: 60,
    height: 60,
    borderRadius: 999,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22c55e',
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 22,
    elevation: 12,
  },
  fabText: {
    color: '#022c22',
    fontSize: 30,
    fontWeight: '800',
    marginTop: -3,
  },
});
