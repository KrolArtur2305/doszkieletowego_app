import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { supabase } from '../../../lib/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

type ViewMode = 'grid' | 'carousel';

type Etap = {
  id: string;
  nazwa: string;
};

type Zdjecie = {
  id: string;
  user_id: string;
  etap_id: string | null;
  url: string;
  created_at: string;
};

const COLORS = {
  bg: '#050915',
  cardBorder: 'rgba(255,255,255,0.08)',
  cardBg: 'rgba(255,255,255,0.03)',
  text: '#F8FAFC',
  muted: '#94A3B8',
  soft: '#CBD5F5',
  accent: '#5EEAD4',
  accent2: '#38BDF8',
  danger: '#FF3B30',
};

const bucketName = 'zdjecia';

function sanitizeFolderName(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function ZdjeciaScreen() {
  const [zdjecia, setZdjecia] = useState<Zdjecie[]>([]);
  const [etapy, setEtapy] = useState<Etap[]>([]);
  const [selectedEtap, setSelectedEtap] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);

  const [selectedZdjecie, setSelectedZdjecie] = useState<Zdjecie | null>(null);

  const [uploading, setUploading] = useState(false);
  const [selectedEtapForUpload, setSelectedEtapForUpload] = useState<string>('');

  const etapNameMap = useMemo(
    () =>
      etapy.reduce<Record<string, string>>((acc, etap) => {
        acc[etap.id] = etap.nazwa;
        return acc;
      }, {}),
    [etapy],
  );

  const getEtapName = useCallback(
    (etapId: string | null) => {
      if (!etapId) return 'Etap';
      return etapNameMap[etapId] ?? 'Etap';
    },
    [etapNameMap],
  );

  const deriveStoragePath = useCallback((url: string) => {
    const marker = `${bucketName}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.slice(idx + marker.length);
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([loadEtapy(), loadZdjecia(true)]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) loadZdjecia(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEtap]);

  const loadEtapy = async () => {
    try {
      const { data, error } = await supabase.from('etapy_szablon').select('id,nazwa').limit(4);

      if (error) throw error;
      setEtapy((data || []) as Etap[]);
    } catch (e) {
      console.error('BĹ‚Ä…d Ĺ‚adowania etapĂłw:', e);
      Alert.alert('BĹ‚Ä…d', 'Nie udaĹ‚o siÄ™ zaĹ‚adowaÄ‡ etapĂłw');
    }
  };

  const loadZdjecia = async (isInitial: boolean) => {
    try {
      if (isInitial) setLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        setZdjecia([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      let query = supabase
        .from('zdjecia')
        .select('id,user_id,etap_id,url,created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (selectedEtap !== 'all') {
        query = query.eq('etap_id', selectedEtap);
      }

      const { data, error } = await query;
      if (error) throw error;

      setZdjecia((data || []) as Zdjecie[]);
    } catch (e) {
      console.error('BĹ‚Ä…d Ĺ‚adowania zdjÄ™Ä‡:', e);
      Alert.alert('BĹ‚Ä…d', 'Nie udaĹ‚o siÄ™ zaĹ‚adowaÄ‡ zdjÄ™Ä‡');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadZdjecia(false);
  }, [selectedEtap]);

  const canPick = useMemo(() => Boolean(selectedEtapForUpload), [selectedEtapForUpload]);

  const handlePickAndUpload = async () => {
    if (!selectedEtapForUpload) {
      Alert.alert('Uwaga', 'Wybierz etap dla zdjÄ™cia');
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Brak uprawnieĹ„', 'Potrzebujemy dostÄ™pu do galerii');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
      aspect: [4, 3],
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    await uploadPhoto(result.assets[0].uri);
  };

  const uploadPhoto = async (uri: string) => {
    try {
      setUploading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        Alert.alert('BĹ‚Ä…d', 'Musisz byÄ‡ zalogowany');
        return;
      }

      const etap = etapy.find((e) => e.id === selectedEtapForUpload);
      if (!etap) {
        Alert.alert('BĹ‚Ä…d', 'Nie znaleziono etapu');
        return;
      }

      const etapFolder = sanitizeFolderName(etap.nazwa);
      const timestamp = Date.now();

      const extGuess = uri.split('.').pop()?.toLowerCase();
      const fileExt = extGuess && extGuess.length <= 5 ? extGuess : 'jpg';
      const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';

      const fileName = `${timestamp}.${fileExt}`;
      const storagePath = `${session.user.id}/${etapFolder}/${fileName}`;
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      const arrayBuffer = decodeBase64(base64);

      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, arrayBuffer, {
          contentType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
      const publicUrl = urlData?.publicUrl;

      if (!publicUrl) throw new Error('Brak publicUrl po uploadzie');

      const { error: insertError } = await supabase.from('zdjecia').insert({
        user_id: session.user.id,
        etap_id: etap.id,
        url: publicUrl,
      });

      if (insertError) throw insertError;

      setAddModalVisible(false);
      setSelectedEtapForUpload('');
      await loadZdjecia(false);
      Alert.alert('Sukces', 'ZdjÄ™cie zostaĹ‚o dodane');
    } catch (e: any) {
      console.error('BĹ‚Ä…d uploadu:', e);
      Alert.alert('BĹ‚Ä…d', e?.message ? String(e.message) : 'Nie udaĹ‚o siÄ™ dodaÄ‡ zdjÄ™cia');
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (z: Zdjecie) => {
    Alert.alert('UsuĹ„ zdjÄ™cie', 'Czy na pewno chcesz usunÄ…Ä‡ to zdjÄ™cie?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'UsuĹ„',
        style: 'destructive',
        onPress: async () => {
          try {
            // 1) usuĹ„ rekord
            const { error: delError } = await supabase.from('zdjecia').delete().eq('id', z.id);
            if (delError) throw delError;

            // 2) usuĹ„ plik (tylko jeĹ›li uda siÄ™ wyliczyÄ‡ Ĺ›cieĹĽkÄ™)
            const storagePath = deriveStoragePath(z.url);
            if (storagePath) {
              const { error: rmError } = await supabase.storage.from(bucketName).remove([storagePath]);
              if (rmError) {
                // nie blokuj usera, ale loguj
                console.warn('Nie udaĹ‚o siÄ™ usunÄ…Ä‡ pliku ze storage:', rmError);
              }
            }

            setPreviewModalVisible(false);
            setSelectedZdjecie(null);
            await loadZdjecia(false);
            Alert.alert('Sukces', 'ZdjÄ™cie zostaĹ‚o usuniÄ™te');
          } catch (e) {
            console.error('BĹ‚Ä…d usuwania:', e);
            Alert.alert('BĹ‚Ä…d', 'Nie udaĹ‚o siÄ™ usunÄ…Ä‡ zdjÄ™cia');
          }
        },
      },
    ]);
  };

  const openPreview = (item: Zdjecie) => {
    setSelectedZdjecie(item);
    setPreviewModalVisible(true);
  };

  const renderGridItem = ({ item }: { item: Zdjecie }) => {
    const etapName = getEtapName(item.etap_id);
    return (
      <TouchableOpacity style={styles.gridCard} onPress={() => openPreview(item)} activeOpacity={0.85}>
        <BlurView intensity={25} tint="dark" style={styles.cardBlur}>
          <Image source={{ uri: item.url }} style={styles.gridImage} contentFit="cover" transition={250} />
          <View style={styles.cardOverlay}>
            <Text style={styles.etapBadge}>{etapName.toUpperCase()}</Text>
            <Text style={styles.dateText}>
              {new Date(item.created_at).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </Text>
          </View>
        </BlurView>
      </TouchableOpacity>
    );
  };

  const renderCarouselItem = ({ item }: { item: Zdjecie }) => {
    const etapName = getEtapName(item.etap_id);
    return (
      <TouchableOpacity style={styles.carouselCard} onPress={() => openPreview(item)} activeOpacity={0.85}>
        <BlurView intensity={25} tint="dark" style={styles.carouselBlur}>
          <Image source={{ uri: item.url }} style={styles.carouselImage} contentFit="cover" transition={250} />
          <View style={styles.carouselInfo}>
            <Text style={styles.carouselEtap}>{etapName.toUpperCase()}</Text>
            <Text style={styles.carouselDate}>
              {new Date(item.created_at).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' })}
            </Text>
          </View>
        </BlurView>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <BlurView intensity={15} tint="dark" style={styles.emptyCard}>
        <Ionicons name="images-outline" size={64} color="rgba(255,255,255,0.25)" />
        <Text style={styles.emptyTitle}>Brak zdjÄ™Ä‡</Text>
        <Text style={styles.emptySubtitle}>
          {selectedEtap === 'all' ? 'Dodaj swoje pierwsze zdjÄ™cie z budowy.' : 'Brak zdjÄ™Ä‡ dla wybranego etapu.'}
        </Text>
        <TouchableOpacity style={styles.emptyButton} onPress={() => setAddModalVisible(true)} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color={COLORS.bg} />
          <Text style={styles.emptyButtonText}>Dodaj zdjÄ™cie</Text>
        </TouchableOpacity>
      </BlurView>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>Ĺadowanie zdjÄ™Ä‡â€¦</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* glows */}
      <View style={styles.glowOne} />
      <View style={styles.glowTwo} />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerLabel}>Galeria budowy</Text>
          <Text style={styles.title}>ZdjÄ™cia</Text>
        </View>

        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'grid' && styles.toggleButtonActive]}
            onPress={() => setViewMode('grid')}
          >
            <Ionicons name="grid" size={20} color={viewMode === 'grid' ? COLORS.accent : 'rgba(255,255,255,0.45)'} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'carousel' && styles.toggleButtonActive]}
            onPress={() => setViewMode('carousel')}
          >
            <Ionicons name="albums" size={20} color={viewMode === 'carousel' ? COLORS.accent : 'rgba(255,255,255,0.45)'} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer} contentContainerStyle={styles.filterContent}>
        <TouchableOpacity
          style={[styles.filterPill, selectedEtap === 'all' && styles.filterPillActive]}
          onPress={() => setSelectedEtap('all')}
        >
          <Text style={[styles.filterText, selectedEtap === 'all' && styles.filterTextActive]}>WSZYSTKIE</Text>
        </TouchableOpacity>

        {etapy.map((etap) => (
          <TouchableOpacity
            key={etap.id}
            style={[styles.filterPill, selectedEtap === etap.id && styles.filterPillActive]}
            onPress={() => setSelectedEtap(etap.id)}
          >
            <Text style={[styles.filterText, selectedEtap === etap.id && styles.filterTextActive]}>
              {etap.nazwa.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {zdjecia.length === 0 ? (
        renderEmptyState()
      ) : viewMode === 'grid' ? (
        <FlatList
          data={zdjecia}
          renderItem={renderGridItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={styles.gridRow}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
        />
      ) : (
        <FlatList
          data={zdjecia}
          renderItem={renderCarouselItem}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          snapToInterval={SCREEN_WIDTH - 32}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setAddModalVisible(true)} activeOpacity={0.85}>
        <BlurView intensity={80} tint="dark" style={styles.fabBlur}>
          <Ionicons name="add" size={30} color={COLORS.accent} />
        </BlurView>
      </TouchableOpacity>

      {/* ADD MODAL */}
      <Modal visible={addModalVisible} transparent animationType="fade" onRequestClose={() => setAddModalVisible(false)}>
        <BlurView intensity={90} tint="dark" style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Dodaj zdjÄ™cie</Text>

            <Text style={styles.modalLabel}>WYBIERZ ETAP</Text>

            <ScrollView style={styles.etapList} showsVerticalScrollIndicator={false}>
              {etapy.map((etap) => {
                const active = selectedEtapForUpload === etap.id;
                return (
                  <TouchableOpacity
                    key={etap.id}
                    style={[styles.etapOption, active && styles.etapOptionActive]}
                    onPress={() => setSelectedEtapForUpload(etap.id)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.etapOptionText, active && styles.etapOptionTextActive]}>{etap.nazwa}</Text>
                    {active && <Ionicons name="checkmark-circle" size={22} color={COLORS.accent} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => {
                  setAddModalVisible(false);
                  setSelectedEtapForUpload('');
                }}
                disabled={uploading}
                activeOpacity={0.85}
              >
                <Text style={styles.modalButtonTextSecondary}>Anuluj</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary, !canPick && { opacity: 0.55 }]}
                onPress={handlePickAndUpload}
                disabled={uploading || !canPick}
                activeOpacity={0.85}
              >
                {uploading ? <ActivityIndicator color={COLORS.bg} /> : <Text style={styles.modalButtonTextPrimary}>Wybierz zdjÄ™cie</Text>}
              </TouchableOpacity>
            </View>

            <Text style={styles.modalHint}>
              ZdjÄ™cie zostanie zapisane do Storage ({bucketName}) i przypisane do etapu.
            </Text>
          </View>
        </BlurView>
      </Modal>

      {/* PREVIEW MODAL */}
      <Modal visible={previewModalVisible} transparent animationType="fade" onRequestClose={() => setPreviewModalVisible(false)}>
        <BlurView intensity={95} tint="dark" style={styles.previewOverlay}>
          <TouchableOpacity style={styles.closeButton} onPress={() => setPreviewModalVisible(false)} activeOpacity={0.85}>
            <Ionicons name="close" size={28} color={COLORS.text} />
          </TouchableOpacity>

          {selectedZdjecie && (
            <>
              <Image source={{ uri: selectedZdjecie.url }} style={styles.previewImage} contentFit="contain" />

              <View style={styles.previewInfo}>
                <BlurView intensity={80} tint="dark" style={styles.previewInfoBlur}>
                  <Text style={styles.previewEtap}>{getEtapName(selectedZdjecie.etap_id).toUpperCase()}</Text>
                  <Text style={styles.previewDate}>
                    {new Date(selectedZdjecie.created_at).toLocaleString('pl-PL', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>

                  <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeletePhoto(selectedZdjecie)} activeOpacity={0.85}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                    <Text style={styles.deleteButtonText}>UsuĹ„ zdjÄ™cie</Text>
                  </TouchableOpacity>
                </BlurView>
              </View>
            </>
          )}
        </BlurView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  glowOne: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: COLORS.accent,
    opacity: 0.12,
    top: -40,
    right: -120,
  },
  glowTwo: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: COLORS.accent2,
    opacity: 0.10,
    bottom: 120,
    left: -170,
  },

  loadingContainer: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 14, fontSize: 15, color: COLORS.muted, fontWeight: '600' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 58 : 38,
    paddingBottom: 14,
  },
  headerLabel: { color: COLORS.muted, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 12 },
  title: { fontSize: 30, fontWeight: '800', color: COLORS.text, marginTop: 4 },

  viewToggle: { flexDirection: 'row', gap: 8 },
  toggleButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: 'rgba(94,234,212,0.14)',
    borderColor: 'rgba(94,234,212,0.35)',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },

  filterContainer: { maxHeight: 60, marginBottom: 14 },
  filterContent: { paddingHorizontal: 16, gap: 8 },
  filterPill: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  filterPillActive: {
    backgroundColor: 'rgba(94,234,212,0.14)',
    borderColor: 'rgba(94,234,212,0.45)',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 6,
  },
  filterText: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.45)', letterSpacing: 1 },
  filterTextActive: { color: COLORS.accent },

  gridContainer: { paddingHorizontal: 8, paddingBottom: 110 },
  gridRow: { gap: 16, paddingHorizontal: 8, marginBottom: 16 },
  gridCard: { width: CARD_WIDTH, height: CARD_WIDTH * 1.22, borderRadius: 18, overflow: 'hidden' },
  cardBlur: { flex: 1, borderWidth: 1, borderColor: COLORS.cardBorder },
  gridImage: { width: '100%', height: '100%' },
  cardOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, backgroundColor: 'rgba(0,0,0,0.55)' },
  etapBadge: { fontSize: 10, fontWeight: '900', color: COLORS.accent, letterSpacing: 1, marginBottom: 4 },
  dateText: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '600' },

  carouselContainer: { paddingHorizontal: 16, paddingBottom: 110 },
  carouselCard: { width: SCREEN_WIDTH - 32, height: SCREEN_HEIGHT * 0.60, marginRight: 16, borderRadius: 26, overflow: 'hidden' },
  carouselBlur: { flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  carouselImage: { width: '100%', height: '80%' },
  carouselInfo: { padding: 20, backgroundColor: 'rgba(0,0,0,0.65)' },
  carouselEtap: { fontSize: 13, fontWeight: '900', color: COLORS.accent, letterSpacing: 1.4, marginBottom: 6 },
  carouselDate: { fontSize: 13, color: 'rgba(255,255,255,0.72)', fontWeight: '600' },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  emptyCard: {
    width: '100%',
    padding: 34,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 18, marginBottom: 8 },
  emptySubtitle: { fontSize: 15, color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginBottom: 22, lineHeight: 20 },
  emptyButton: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
  },
  emptyButtonText: { fontSize: 14, fontWeight: '900', color: COLORS.bg, letterSpacing: 0.5 },

  fab: {
    position: 'absolute',
    bottom: 28,
    right: 16,
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  fabBlur: { flex: 1, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(94,234,212,0.38)' },

  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22 },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(10,15,30,0.96)',
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  modalTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text, marginBottom: 18, textAlign: 'center' },
  modalLabel: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.6, marginBottom: 10 },
  etapList: { maxHeight: 280, marginBottom: 16 },
  etapOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 8,
  },
  etapOptionActive: { backgroundColor: 'rgba(94,234,212,0.10)', borderColor: 'rgba(94,234,212,0.28)' },
  etapOptionText: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.72)' },
  etapOptionTextActive: { color: COLORS.accent },

  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 4 },
  modalButton: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalButtonSecondary: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  modalButtonPrimary: { backgroundColor: COLORS.accent },
  modalButtonTextSecondary: { fontSize: 15, fontWeight: '900', color: 'rgba(255,255,255,0.72)' },
  modalButtonTextPrimary: { fontSize: 15, fontWeight: '900', color: COLORS.bg },
  modalHint: { marginTop: 12, fontSize: 12, color: COLORS.muted, textAlign: 'center' },

  previewOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    right: 18,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  previewImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.72 },
  previewInfo: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  previewInfoBlur: { padding: 22, paddingBottom: Platform.OS === 'ios' ? 44 : 22 },
  previewEtap: { fontSize: 14, fontWeight: '900', color: COLORS.accent, letterSpacing: 1.6, marginBottom: 8 },
  previewDate: { fontSize: 14, color: 'rgba(255,255,255,0.72)', fontWeight: '600', marginBottom: 16 },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,59,48,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.28)',
  },
  deleteButtonText: { fontSize: 15, fontWeight: '900', color: COLORS.danger },
});




