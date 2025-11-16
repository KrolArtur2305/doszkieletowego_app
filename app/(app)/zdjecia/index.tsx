import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../supabase';

type PhotoRow = {
  id: string;
  user_id: string;
  projekt_id: string | null;
  etap_id: string | null;
  nazwa: string | null;
  komentarz: string | null;
  file_path: string;
  created_at: string;
};

type StageRow = {
  id: string;
  nazwa: string;
};

type ViewMode = 'carousel' | 'grid';

export default function PhotosScreen() {
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [activeStageId, setActiveStageId] = useState<'all' | string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('carousel');
  const [loading, setLoading] = useState(false);

  // modal dodawania
  const [addVisible, setAddVisible] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pickedImage, setPickedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);

  // modal podglądu
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const loadStages = useCallback(async () => {
    const { data, error } = await supabase
      .from('etapy_szablon')
      .select('id, nazwa')
      .order('kolejnosc', { ascending: true });

    if (!error && data) {
      setStages(data as StageRow[]);
    }
  }, []);

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('zdjecia')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPhotos(data as PhotoRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStages();
    loadPhotos();
  }, [loadStages, loadPhotos]);

  const filteredPhotos =
    activeStageId === 'all'
      ? photos
      : photos.filter((p) => p.etap_id === activeStageId);

  const stageLabelById = (id: string | null) => {
    if (!id) return 'Etap budowy';
    const s = stages.find((st) => st.id === id);
    return s?.nazwa ?? 'Etap budowy';
  };

  // ---- dodawanie zdjęcia ----
  const pickImage = async () => {
    setFormError(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setFormError('Potrzebuję dostępu do galerii, aby dodać zdjęcie.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 0.85,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });

    if (!result.canceled) {
      setPickedImage(result.assets[0]);
    }
  };

  const resetAddForm = () => {
    setSelectedStageId(null);
    setComment('');
    setPickedImage(null);
    setFormError(null);
  };

  const handleOpenAdd = () => {
    resetAddForm();
    setAddVisible(true);
  };

  const handleAddPhoto = async () => {
    if (!pickedImage) {
      setFormError('Wybierz zdjęcie z galerii.');
      return;
    }
    if (!selectedStageId) {
      setFormError('Wybierz etap budowy.');
      return;
    }

    setUploading(true);
    setFormError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setFormError('Brak zalogowanego użytkownika.');
        setUploading(false);
        return;
      }

      // 1. upload do Storage
      const fileExt = pickedImage.uri.split('.').pop() ?? 'jpg';
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `user-${user.id}/${fileName}`;

      const fileRes = await fetch(pickedImage.uri);
      const fileBlob = await fileRes.blob();

      const { error: uploadError } = await supabase.storage
        .from('zdjecia-budowy')
        .upload(filePath, fileBlob, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.log(uploadError);
        setFormError('Nie udało się wysłać pliku.');
        setUploading(false);
        return;
      }

      // 2. zapis rekordu w tabeli zdjecia
      const { error: insertError, data: inserted } = await supabase
        .from('zdjecia')
        .insert({
          user_id: user.id,
          projekt_id: null, // na później
          etap_id: selectedStageId,
          nazwa: pickedImage.fileName ?? pickedImage.uri.split('/').pop(),
          komentarz: comment || null,
          file_path: filePath,
        })
        .select('*')
        .single();

      if (insertError || !inserted) {
        console.log(insertError);
        setFormError('Nie udało się zapisać zdjęcia w bazie.');
        setUploading(false);
        return;
      }

      setPhotos((prev) => [inserted as PhotoRow, ...prev]);
      setAddVisible(false);
      resetAddForm();
    } catch (err) {
      console.log(err);
      setFormError('Wystąpił nieoczekiwany błąd.');
    } finally {
      setUploading(false);
    }
  };

  // ---- podgląd pełnoekranowy ----
  const openPreview = (index: number) => {
    setPreviewIndex(index);
    setPreviewVisible(true);
  };

  const closePreview = () => setPreviewVisible(false);

  const showPrev = () => {
    setPreviewIndex((prev) =>
      prev <= 0 ? filteredPhotos.length - 1 : prev - 1,
    );
  };

  const showNext = () => {
    setPreviewIndex((prev) =>
      prev >= filteredPhotos.length - 1 ? 0 : prev + 1,
    );
  };

  // ---- render ----
  const renderPhotoCard = ({ item, index }: { item: PhotoRow; index: number }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => openPreview(index)}
      style={styles.photoCard}
    >
      <Image
        source={{
          uri: supabase.storage.from('zdjecia-budowy').getPublicUrl(item.file_path)
            .data.publicUrl,
        }}
        style={styles.photoImage}
        resizeMode="cover"
      />
      <View style={styles.photoOverlay}>
        <Text style={styles.stageBadge}>{stageLabelById(item.etap_id)}</Text>
        <Text style={styles.photoName}>{item.nazwa ?? 'Zdjęcie z budowy'}</Text>
        <Text style={styles.photoComment}>
          {item.komentarz ? item.komentarz : 'Brak komentarza'}
        </Text>
        <Text style={styles.photoMeta}>
          {new Date(item.created_at).toLocaleString('pl-PL')}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderGridItem = ({ item, index }: { item: PhotoRow; index: number }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => openPreview(index)}
      style={styles.gridItem}
    >
      <Image
        source={{
          uri: supabase.storage.from('zdjecia-budowy').getPublicUrl(item.file_path)
            .data.publicUrl,
        }}
        style={styles.gridImage}
        resizeMode="cover"
      />
      <View style={styles.gridLabel}>
        <Text style={styles.gridStageText}>{stageLabelById(item.etap_id)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.screen}>
      {/* GÓRNY HEADER */}
      <View style={styles.header}>
        <Text style={styles.logoText}>
          doszkieletowego
          <Text style={styles.logoDot}>.pl</Text>
        </Text>
      </View>

      {/* FILTRY ETAPÓW */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stageFilterRow}
      >
        <TouchableOpacity
          onPress={() => setActiveStageId('all')}
          style={[
            styles.stageChip,
            activeStageId === 'all' && styles.stageChipActive,
          ]}
        >
          <Text
            style={[
              styles.stageChipText,
              activeStageId === 'all' && styles.stageChipTextActive,
            ]}
          >
            Wszystkie
          </Text>
        </TouchableOpacity>

        {stages.map((stage) => (
          <TouchableOpacity
            key={stage.id}
            onPress={() => setActiveStageId(stage.id)}
            style={[
              styles.stageChip,
              activeStageId === stage.id && styles.stageChipActive,
            ]}
          >
            <Text
              style={[
                styles.stageChipText,
                activeStageId === stage.id && styles.stageChipTextActive,
              ]}
            >
              {stage.nazwa}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* PRZEŁĄCZNIK WIDOKU */}
      <View style={styles.viewSwitchRow}>
        <TouchableOpacity
          onPress={() => setViewMode('carousel')}
          style={[
            styles.viewSwitchButton,
            viewMode === 'carousel' && styles.viewSwitchButtonActive,
          ]}
        >
          <Text
            style={[
              styles.viewSwitchText,
              viewMode === 'carousel' && styles.viewSwitchTextActive,
            ]}
          >
            Karuzela
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setViewMode('grid')}
          style={[
            styles.viewSwitchButton,
            viewMode === 'grid' && styles.viewSwitchButtonActive,
          ]}
        >
          <Text
            style={[
              styles.viewSwitchText,
              viewMode === 'grid' && styles.viewSwitchTextActive,
            ]}
          >
            Siatka
          </Text>
        </TouchableOpacity>
      </View>

      {/* LISTA ZDJĘĆ */}
      {loading ? (
        <View style={styles.loaderBox}>
          <ActivityIndicator size="large" color="#4ADE80" />
        </View>
      ) : filteredPhotos.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Brak zdjęć</Text>
          <Text style={styles.emptyText}>
            Dodaj pierwsze zdjęcie z budowy, aby stworzyć futurystyczny dziennik
            postępu.
          </Text>
        </View>
      ) : viewMode === 'carousel' ? (
        <FlatList
          key="carousel"
          data={filteredPhotos}
          renderItem={renderPhotoCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          key="grid"
          data={filteredPhotos}
          renderItem={renderGridItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 14 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 140,
            gap: 14,
          }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB + */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handleOpenAdd}
        style={styles.fab}
      >
        <Text style={styles.fabPlus}>+</Text>
      </TouchableOpacity>

      {/* MODAL DODAWANIA */}
      <Modal visible={addVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Dodaj zdjęcie</Text>

            {/* wybór zdjęcia */}
            <TouchableOpacity
              style={styles.modalPickButton}
              onPress={pickImage}
            >
              <Text style={styles.modalPickText}>
                {pickedImage ? 'Zmień zdjęcie' : 'Wybierz zdjęcie z galerii'}
              </Text>
            </TouchableOpacity>

            {pickedImage && (
              <Image
                source={{ uri: pickedImage.uri }}
                style={styles.modalPreview}
                resizeMode="cover"
              />
            )}

            {/* wybór etapu */}
            <Text style={styles.modalLabel}>Etap budowy*</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: 6 }}
            >
              {stages.map((stage) => (
                <TouchableOpacity
                  key={stage.id}
                  onPress={() => setSelectedStageId(stage.id)}
                  style={[
                    styles.stageChip,
                    selectedStageId === stage.id && styles.stageChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.stageChipText,
                      selectedStageId === stage.id &&
                        styles.stageChipTextActive,
                    ]}
                  >
                    {stage.nazwa}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* komentarz */}
            <Text style={styles.modalLabel}>Komentarz (opcjonalnie)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="np. Montaż ścian zewnętrznych"
              placeholderTextColor="#6B7280"
              value={comment}
              onChangeText={setComment}
              multiline
            />

            {formError ? (
              <Text style={styles.modalError}>{formError}</Text>
            ) : null}

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setAddVisible(false);
                  resetAddForm();
                }}
                disabled={uploading}
              >
                <Text style={styles.modalCancelText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSave}
                onPress={handleAddPhoto}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="#022C22" />
                ) : (
                  <Text style={styles.modalSaveText}>Zapisz</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL PODGLĄDU */}
      <Modal visible={previewVisible} transparent animationType="fade">
        <View style={styles.previewOverlay}>
          <Pressable style={styles.previewBackdrop} onPress={closePreview} />
          {filteredPhotos[previewIndex] && (
            <View style={styles.previewCard}>
              <Image
                source={{
                  uri: supabase.storage
                    .from('zdjecia-budowy')
                    .getPublicUrl(filteredPhotos[previewIndex].file_path).data
                    .publicUrl,
                }}
                style={styles.previewImage}
                resizeMode="contain"
              />
              <Text style={styles.previewCaption}>
                {filteredPhotos[previewIndex].nazwa ??
                  'Zdjęcie z budowy'}{' '}
                · {stageLabelById(filteredPhotos[previewIndex].etap_id)}
              </Text>
              <View style={styles.previewButtonsRow}>
                <TouchableOpacity
                  style={styles.previewNavButton}
                  onPress={showPrev}
                >
                  <Text style={styles.previewNavText}>Poprzednie</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.previewNavButton}
                  onPress={showNext}
                >
                  <Text style={styles.previewNavText}>Następne</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F9FAFB',
  },
  logoDot: {
    color: '#4ADE80',
  },
  stageFilterRow: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 8,
  },
  stageChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.45)',
    marginRight: 8,
  },
  stageChipActive: {
    backgroundColor: '#22C55E',
    borderColor: '#22C55E',
  },
  stageChipText: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '500',
  },
  stageChipTextActive: {
    color: '#022C22',
  },
  viewSwitchRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
    gap: 10,
  },
  viewSwitchButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.45)',
    backgroundColor: '#020617',
  },
  viewSwitchButtonActive: {
    backgroundColor: '#0F172A',
    borderColor: '#22C55E',
  },
  viewSwitchText: {
    color: '#CBD5F5',
    fontSize: 14,
    fontWeight: '500',
  },
  viewSwitchTextActive: {
    color: '#BBF7D0',
  },
  loaderBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyBox: {
    marginTop: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#E5E7EB',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
  },
  photoCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#020617',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.9)',
  },
  photoImage: {
    width: '100%',
    height: 260,
  },
  photoOverlay: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  stageBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#020617',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    color: '#E5E7EB',
    fontSize: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.5)',
    marginBottom: 6,
  },
  photoName: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  photoComment: {
    color: '#CBD5F5',
    fontSize: 14,
    marginBottom: 4,
  },
  photoMeta: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  gridItem: {
    flex: 1,
    height: 170,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#020617',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridLabel: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.85)',
  },
  gridStageText: {
    color: '#E5E7EB',
    fontSize: 11,
  },
  fab: {
    position: 'absolute',
    right: 26,
    bottom: 32,
    width: 68,
    height: 68,
    borderRadius: 999,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#22C55E',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  fabPlus: {
    fontSize: 30,
    color: '#022C22',
    fontWeight: '800',
    marginTop: -2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.9)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.4)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F9FAFB',
    marginBottom: 12,
  },
  modalPickButton: {
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.5)',
    marginBottom: 10,
  },
  modalPickText: {
    color: '#E5E7EB',
    fontSize: 14,
  },
  modalPreview: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    marginBottom: 10,
  },
  modalLabel: {
    color: '#E5E7EB',
    fontSize: 13,
    marginTop: 6,
    marginBottom: 4,
  },
  modalInput: {
    minHeight: 60,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#F9FAFB',
    textAlignVertical: 'top',
  },
  modalError: {
    color: '#FCA5A5',
    marginTop: 6,
    fontSize: 13,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  modalCancel: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.5)',
  },
  modalCancelText: {
    color: '#E5E7EB',
    fontSize: 14,
  },
  modalSave: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#22C55E',
  },
  modalSaveText: {
    color: '#022C22',
    fontWeight: '700',
    fontSize: 14,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  previewCard: {
    width: '90%',
    borderRadius: 24,
    backgroundColor: '#020617',
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.6)',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: 320,
    marginBottom: 12,
  },
  previewCaption: {
    color: '#E5E7EB',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  previewButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  previewNavButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#0F172A',
  },
  previewNavText: {
    color: '#E5E7EB',
    fontSize: 13,
  },
});
