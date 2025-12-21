import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';

const { width } = Dimensions.get('window');
const STORAGE_BUCKET = 'zdjecia';

// Etapy – używane w pasku filtrów i w modalu
const STAGES = [
  { id: 'ALL', label: 'Wszystkie' },
  { id: 'ZERO', label: 'Stan zero' },
  { id: 'SSO', label: 'Stan surowy otwarty' },
  { id: 'SSZ', label: 'Stan surowy zamknięty' },
  { id: 'DEV', label: 'Deweloperski' },
];

type PhotoRow = {
  id: string;
  nazwa: string | null;
  komentarz: string | null;
  created_at: string;
  file_path: string;
};

export default function PhotosScreen() {
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [viewMode, setViewMode] = useState<'carousel' | 'grid'>('carousel');
  const [activeStageFilter, setActiveStageFilter] = useState<string>('ALL');

  const [modalVisible, setModalVisible] = useState(false);
  const [pickedImageUri, setPickedImageUri] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [modalStage, setModalStage] = useState<string | null>(null);

  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  // ------------------------------------
  // Helpers
  // ------------------------------------
  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  };

  const loadPhotos = useCallback(async () => {
    try {
      setLoadingList(true);
      const { data, error } = await supabase
        .from('zdjecia')
        .select('id, nazwa, komentarz, created_at, file_path')
        .order('created_at', { ascending: false });

      if (error) {
        console.log('Błąd pobierania zdjęć:', error.message);
        Alert.alert('Błąd', 'Nie udało się pobrać zdjęć.');
        return;
      }

      setPhotos(data ?? []);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  // Na razie filtr etapu nie zmienia danych – żeby nic nie popsuć w logice.
  // Możemy później podpiąć to do etap_id, jak ustalimy strukturę.
  const displayedPhotos = photos;

  // ------------------------------------
  // Pick + upload
  // ------------------------------------
  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Brak dostępu', 'Zezwól aplikacji na dostęp do zdjęć.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setPickedImageUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!pickedImageUri) {
      Alert.alert('Brak zdjęcia', 'Wybierz zdjęcie z telefonu.');
      return;
    }
    if (!modalStage || modalStage === 'ALL') {
      Alert.alert('Etap budowy', 'Wybierz etap budowy.');
      return;
    }

    try {
      setUploading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        Alert.alert('Błąd', 'Nie udało się pobrać danych użytkownika.');
        return;
      }

      const fileExt = pickedImageUri.split('.').pop() ?? 'jpg';
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // pobieramy blob z URI
      const response = await fetch(pickedImageUri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, blob, {
          cacheControl: '3600',
          upsert: false,
          contentType: blob.type || 'image/jpeg',
        });

      if (uploadError) {
        console.log('Upload error:', uploadError.message);
        throw uploadError;
      }

      // etap na razie NIE jest zapisywany do osobnej kolumny
      const { error: insertError } = await supabase.from('zdjecia').insert({
        user_id: user.id,
        nazwa: fileName,
        komentarz: comment || null,
        file_path: filePath,
      });

      if (insertError) {
        console.log('Insert error:', insertError.message);
        throw insertError;
      }

      setModalVisible(false);
      setPickedImageUri(null);
      setComment('');
      setModalStage(null);
      await loadPhotos();
    } catch (e: any) {
      console.log('Błąd dodawania zdjęcia:', e?.message ?? e);
      Alert.alert('Błąd', 'Nie udało się dodać zdjęcia. Sprawdź połączenie z internetem.');
    } finally {
      setUploading(false);
    }
  };

  // ------------------------------------
  // Render
  // ------------------------------------
  const renderPhotoCard = (item: PhotoRow, index: number, grid?: boolean) => {
    const uri = getPublicUrl(item.file_path);
    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={0.9}
        onPress={() => {
          setPreviewIndex(index);
          setPreviewVisible(true);
        }}
        style={[styles.card, grid && styles.cardGrid, !grid && { marginBottom: 16 }]}
      >
        <Image
          source={{ uri }}
          style={grid ? styles.cardImageGrid : styles.cardImage}
          contentFit="cover"
        />
        <View style={styles.cardContent}>
          <View style={styles.stagePill}>
            <Text style={styles.stagePillText}>Etap budowy</Text>
          </View>
          <Text style={styles.photoTitle} numberOfLines={1}>
            {item.nazwa || 'Zdjęcie z budowy'}
          </Text>
          <Text style={styles.photoComment} numberOfLines={1}>
            {item.komentarz || 'Brak komentarza'}
          </Text>
          <Text style={styles.photoMeta}>
            {new Date(item.created_at).toLocaleString('pl-PL')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* tło / łuk u góry */}
      <View style={styles.headerBg} />

      {/* nagłówek z logo */}
      <View style={styles.header}>
        <Text style={styles.logoText}>
          doszkieletowego
          <Text style={styles.logoDot}>.pl</Text>
        </Text>
      </View>

      {/* filtry etapów */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.stageScroll}
        contentContainerStyle={styles.stageScrollContent}
      >
        {STAGES.map((stage, idx) => (
          <TouchableOpacity
            key={stage.id}
            style={[
              styles.stageChip,
              activeStageFilter === stage.id && styles.stageChipActive,
              idx !== STAGES.length - 1 && { marginRight: 8 },
            ]}
            onPress={() => setActiveStageFilter(stage.id)}
          >
            <Text
              style={[
                styles.stageChipText,
                activeStageFilter === stage.id && styles.stageChipTextActive,
              ]}
            >
              {stage.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* przełącznik Karuzela / Siatka */}
      <View style={styles.switchRow}>
        <TouchableOpacity
          style={[
            styles.switchButton,
            viewMode === 'carousel' && styles.switchButtonActive,
            { marginRight: 10 },
          ]}
          onPress={() => setViewMode('carousel')}
        >
          <Ionicons
            name="albums-outline"
            size={18}
            color={viewMode === 'carousel' ? '#022c22' : '#9CA3AF'}
            style={{ marginRight: 6 }}
          />
          <Text
            style={[
              styles.switchText,
              viewMode === 'carousel' && styles.switchTextActive,
            ]}
          >
            Karuzela
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.switchButton,
            viewMode === 'grid' && styles.switchButtonActive,
          ]}
          onPress={() => setViewMode('grid')}
        >
          <Ionicons
            name="grid-outline"
            size={18}
            color={viewMode === 'grid' ? '#022c22' : '#9CA3AF'}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.switchText, viewMode === 'grid' && styles.switchTextActive]}>
            Siatka
          </Text>
        </TouchableOpacity>
      </View>

      {/* lista zdjęć */}
      {loadingList ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#22c55e" />
        </View>
      ) : displayedPhotos.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Brak zdjęć</Text>
          <Text style={styles.emptySubtitle}>
            Dodaj pierwsze zdjęcia z budowy, aby stworzyć historię Twojego domu.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={viewMode === 'grid' ? styles.listContentGrid : styles.listContent}
        >
          {viewMode === 'carousel'
            ? displayedPhotos.map((p, i) => renderPhotoCard(p, i, false))
            : displayedPhotos.map((p, i) => renderPhotoCard(p, i, true))}
        </ScrollView>
      )}

      {/* przycisk dodania */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.9}
        onPress={() => {
          setModalVisible(true);
          setPickedImageUri(null);
          setComment('');
          setModalStage(null);
        }}
      >
        <BlurView intensity={80} style={styles.fabBlur}>
          <Ionicons name="add" size={32} color="#022c22" />
        </BlurView>
      </TouchableOpacity>

      {/* modal dodawania */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <BlurView intensity={80} tint="dark" style={styles.modalCard}>
            <Text style={styles.modalTitle}>Dodaj zdjęcie</Text>

            <Text style={styles.modalLabel}>Etap budowy</Text>

            {/* wybór etapu W MODALU */}
            <View style={styles.modalStagesRow}>
              {STAGES.filter((s) => s.id !== 'ALL').map((stage) => (
                <TouchableOpacity
                  key={stage.id}
                  style={[
                    styles.modalStageChip,
                    modalStage === stage.id && styles.modalStageChipActive,
                    { marginRight: 8, marginBottom: 8 },
                  ]}
                  onPress={() => setModalStage(stage.id)}
                >
                  <Text
                    style={[
                      styles.modalStageText,
                      modalStage === stage.id && styles.modalStageTextActive,
                    ]}
                  >
                    {stage.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.imagePickerBox} onPress={pickImage} activeOpacity={0.9}>
              {pickedImageUri ? (
                <Image
                  source={{ uri: pickedImageUri }}
                  style={styles.imagePickerPreview}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.imagePickerPlaceholder}>
                  <Ionicons name="image-outline" size={32} color="#9CA3AF" />
                  <Text style={[styles.imagePickerText, { marginTop: 6 }]}>
                    Wybierz zdjęcie z telefonu
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.modalLabel}>Komentarz (opcjonalnie)</Text>
            <TextInput
              style={styles.commentInput}
              placeholder="np. Mikołaj"
              placeholderTextColor="#6B7280"
              value={comment}
              onChangeText={setComment}
              multiline
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={[styles.modalButtonSecondary, { marginRight: 10 }]}
                onPress={() => setModalVisible(false)}
                disabled={uploading}
              >
                <Text style={styles.modalButtonSecondaryText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonPrimary}
                onPress={handleSave}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="#022c22" />
                ) : (
                  <Text style={styles.modalButtonPrimaryText}>Zapisz</Text>
                )}
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </Modal>

      {/* fullscreen preview */}
      <Modal
        visible={previewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewVisible(false)}
      >
        <View style={styles.previewBackdrop}>
          <ScrollView horizontal pagingEnabled contentOffset={{ x: previewIndex * width, y: 0 }}>
            {displayedPhotos.map((p) => (
              <View
                key={p.id}
                style={{ width, justifyContent: 'center', alignItems: 'center' }}
              >
                <Image
                  source={{ uri: getPublicUrl(p.file_path) }}
                  style={styles.previewImage}
                  contentFit="contain"
                />
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewVisible(false)}>
            <Ionicons name="close" size={28} color="#F9FAFB" />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

// ------------------------------------
// STYLES
// ------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  headerBg: {
    position: 'absolute',
    top: -140,
    left: -80,
    width: width * 1.6,
    height: width * 1.6,
    borderBottomLeftRadius: width * 1.6,
    borderBottomRightRadius: width * 1.6,
    backgroundColor: '#064e3b',
  },
  header: {
    paddingTop: Platform.select({ ios: 60, android: 40 }),
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F9FAFB',
  },
  logoDot: {
    color: '#4ade80',
  },
  stageScroll: {
    maxHeight: 60,
  },
  stageScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  stageChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.4)',
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
  },
  stageChipActive: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  stageChipText: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '500',
  },
  stageChipTextActive: {
    color: '#022c22',
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 8,
    marginTop: 4,
  },
  switchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.4)',
    backgroundColor: 'rgba(15,23,42,0.9)',
  },
  switchButtonActive: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  switchText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  switchTextActive: {
    color: '#022c22',
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    paddingTop: 10,
  },
  listContentGrid: {
    paddingHorizontal: 14,
    paddingBottom: 120,
    paddingTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.9)',
  },
  cardGrid: {
    width: (width - 14 * 2 - 12) / 2,
    marginBottom: 12,
  },
  cardImage: {
    width: '100%',
    height: 220,
  },
  cardImageGrid: {
    width: '100%',
    height: 160,
  },
  cardContent: {
    padding: 14,
  },
  stagePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.5)',
    marginBottom: 8,
  },
  stagePillText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '500',
  },
  photoTitle: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  photoComment: {
    color: '#9CA3AF',
    fontSize: 13,
    marginBottom: 4,
  },
  photoMeta: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: '#E5E7EB',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 100,
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: 'rgba(34,197,94,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabBlur: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.85)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    borderRadius: 24,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#E5E7EB',
    marginBottom: 6,
    marginTop: 10,
  },
  modalStagesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  modalStageChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.6)',
    backgroundColor: 'rgba(15,23,42,0.9)',
  },
  modalStageChipActive: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  modalStageText: {
    color: '#E5E7EB',
    fontSize: 12,
  },
  modalStageTextActive: {
    color: '#022c22',
    fontWeight: '700',
  },
  imagePickerBox: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(31,41,55,0.9)',
    backgroundColor: 'rgba(15,23,42,0.9)',
    height: 200,
    overflow: 'hidden',
    marginTop: 4,
  },
  imagePickerPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePickerText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  imagePickerPreview: {
    width: '100%',
    height: '100%',
  },
  commentInput: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(31,41,55,0.9)',
    backgroundColor: 'rgba(15,23,42,0.9)',
    padding: 12,
    color: '#E5E7EB',
    minHeight: 60,
    textAlignVertical: 'top',
    marginTop: 4,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 18,
  },
  modalButtonSecondary: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.6)',
    backgroundColor: 'transparent',
  },
  modalButtonSecondaryText: {
    color: '#E5E7EB',
    fontWeight: '500',
  },
  modalButtonPrimary: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#22c55e',
  },
  modalButtonPrimaryText: {
    color: '#022c22',
    fontWeight: '700',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: width,
    height: '80%',
  },
  previewClose: {
    position: 'absolute',
    top: Platform.select({ ios: 60, android: 40 }),
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
