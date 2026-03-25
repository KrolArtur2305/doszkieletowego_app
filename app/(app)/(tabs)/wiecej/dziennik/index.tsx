import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../../../lib/supabase';
import { useSupabaseAuth } from '../../../../../hooks/useSupabaseAuth';

const ACCENT = '#19705C';
const NEON = '#25F0C8';
const { width: W } = Dimensions.get('window');

// ─── Types ────────────────────────────────────────────────────────────────────

type Etap = { id: string; nazwa: string };

type Wpis = {
  id: string;
  user_id: string;
  data: string;
  tresc: string;
  etap_id: string | null;
  etap_nazwa: string | null;
  zdjecie_url: string | null;
  created_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad2(n: number) { return String(n).padStart(2, '0'); }

function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDate(ymd: string) {
  const d = new Date(ymd + 'T00:00:00');
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getDayName(ymd: string) {
  const d = new Date(ymd + 'T00:00:00');
  const days = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
  return days[d.getDay()];
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DziennikScreen() {
  const { session } = useSupabaseAuth();
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8;

  // ── State ──
  const [wpisy, setWpisy] = useState<Wpis[]>([]);
  const [loading, setLoading] = useState(true);
  const [etapy, setEtapy] = useState<Etap[]>([]);

  // ── Add modal ──
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWpis, setEditingWpis] = useState<Wpis | null>(null);
  const [formData, setFormData] = useState(toYMD(new Date()));
  const [formTresc, setFormTresc] = useState('');
  const [formEtapId, setFormEtapId] = useState<string | null>(null);
  const [formZdjecieUri, setFormZdjecieUri] = useState<string | null>(null);
  const [formZdjecieUrl, setFormZdjecieUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Detail modal ──
  const [detailWpis, setDetailWpis] = useState<Wpis | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // ── Animations ──
  const fabAnim = useRef(new Animated.Value(0)).current;
  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(fabAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8, delay: 300 }),
      Animated.timing(headerAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── Load data ──
  const loadWpisy = async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('dziennik')
        .select('*, etapy(nazwa)')
        .eq('user_id', userId)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false });

      const mapped = (data ?? []).map((w: any) => ({
        ...w,
        etap_nazwa: w.etapy?.nazwa ?? null,
      }));
      setWpisy(mapped);
    } catch {
      setWpisy([]);
    } finally {
      setLoading(false);
    }
  };

  const loadEtapy = async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    const { data } = await supabase
      .from('etapy')
      .select('id, nazwa')
      .eq('user_id', userId)
      .order('kolejnosc', { ascending: true });
    setEtapy((data ?? []) as Etap[]);
  };

  useEffect(() => {
    loadWpisy();
    loadEtapy();
  }, [session?.user?.id]);

  // ── Open add ──
  const openAdd = () => {
    setEditingWpis(null);
    setFormData(toYMD(new Date()));
    setFormTresc('');
    setFormEtapId(null);
    setFormZdjecieUri(null);
    setFormZdjecieUrl(null);
    setModalOpen(true);
  };

  const openEdit = (w: Wpis) => {
    setDetailOpen(false);
    setTimeout(() => {
      setEditingWpis(w);
      setFormData(w.data);
      setFormTresc(w.tresc);
      setFormEtapId(w.etap_id);
      setFormZdjecieUri(null);
      setFormZdjecieUrl(w.zdjecie_url);
      setModalOpen(true);
    }, 300);
  };

  // ── Pick image ──
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (!result.canceled && result.assets[0]) {
      setFormZdjecieUri(result.assets[0].uri);
      setFormZdjecieUrl(null);
    }
  };

  const removeImage = () => {
    setFormZdjecieUri(null);
    setFormZdjecieUrl(null);
  };

  // ── Upload image ──
  const uploadImage = async (uri: string, userId: string): Promise<string | null> => {
    try {
      const ext = uri.split('.').pop() ?? 'jpg';
      const path = `${userId}/dziennik/${Date.now()}.${ext}`;
      const response = await fetch(uri);
      const blob = await response.blob();
      const { error } = await supabase.storage.from('zdjecia').upload(path, blob, { contentType: `image/${ext}` });
      if (error) throw error;
      const { data } = supabase.storage.from('zdjecia').getPublicUrl(path);
      return data.publicUrl;
    } catch {
      return null;
    }
  };

  // ── Save ──
  const save = async () => {
    if (!formTresc.trim()) {
      Alert.alert('Błąd', 'Wpisz treść notatki.');
      return;
    }
    const userId = session?.user?.id;
    if (!userId) return;
    setSaving(true);
    try {
      let zdjecieUrl = formZdjecieUrl;
      if (formZdjecieUri) {
        zdjecieUrl = await uploadImage(formZdjecieUri, userId);
      }

      const payload = {
        user_id: userId,
        data: formData,
        tresc: formTresc.trim(),
        etap_id: formEtapId || null,
        zdjecie_url: zdjecieUrl || null,
      };

      if (editingWpis) {
        await supabase.from('dziennik').update(payload).eq('id', editingWpis.id);
      } else {
        await supabase.from('dziennik').insert(payload);
      }

      setModalOpen(false);
      await loadWpisy();
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? 'Nie udało się zapisać wpisu.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──
  const deleteWpis = (w: Wpis) => {
    Alert.alert('Usuń wpis', 'Na pewno usunąć ten wpis z dziennika?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń', style: 'destructive',
        onPress: async () => {
          setDetailOpen(false);
          await supabase.from('dziennik').delete().eq('id', w.id);
          await loadWpisy();
        },
      },
    ]);
  };

  const fabScale = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bg} />
      <View pointerEvents="none" style={styles.glowTop} />
      <View pointerEvents="none" style={styles.glowBottom} />

      {/* Header */}
      <Animated.View style={[styles.header, { paddingTop: topPad, opacity: headerAnim }]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconWrap}>
            <Feather name="book-open" size={18} color={NEON} />
          </View>
          <Text style={styles.headerTitle}>Dziennik budowy</Text>
        </View>
        <Text style={styles.headerCount}>
          {wpisy.length > 0 ? `${wpisy.length} wpisów` : ''}
        </Text>
      </Animated.View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={NEON} size="large" />
        </View>
      ) : wpisy.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Feather name="book-open" size={36} color="rgba(37,240,200,0.25)" />
          </View>
          <Text style={styles.emptyTitle}>Brak wpisów</Text>
          <Text style={styles.emptySubtitle}>
            Zacznij dokumentować swoją budowę.{'\n'}Każdy wpis to historia Twojego domu.
          </Text>
          <TouchableOpacity onPress={openAdd} style={styles.emptyBtn} activeOpacity={0.88}>
            <Text style={styles.emptyBtnText}>+ Dodaj pierwszy wpis</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingTop: 12 }]}
          showsVerticalScrollIndicator={false}
        >
          {wpisy.map((w, i) => (
            <WpisCard
              key={w.id}
              wpis={w}
              index={i}
              onPress={() => { setDetailWpis(w); setDetailOpen(true); }}
            />
          ))}
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* FAB */}
      <Animated.View style={[styles.fabWrap, { transform: [{ scale: fabScale }] }]}>
        <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.88}>
          <Feather name="plus" size={24} color="#0B1120" />
        </TouchableOpacity>
      </Animated.View>

      {/* ── ADD/EDIT MODAL ── */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalScreen}>
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingWpis ? 'Edytuj wpis' : 'Nowy wpis'}
              </Text>
              <TouchableOpacity onPress={() => setModalOpen(false)} activeOpacity={0.88}>
                <Feather name="x" size={22} color="rgba(255,255,255,0.55)" />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Data */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>DATA</Text>
                <View style={styles.dateRow}>
                  <Feather name="calendar" size={16} color="rgba(37,240,200,0.60)" />
                  <TextInput
                    value={formData}
                    onChangeText={setFormData}
                    style={styles.dateInput}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    keyboardType="numeric"
                    maxLength={10}
                  />
                </View>
              </View>

              {/* Etap */}
              {etapy.length > 0 && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>ETAP BUDOWY</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -2 }}>
                    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
                      <TouchableOpacity
                        onPress={() => setFormEtapId(null)}
                        style={[styles.etapChip, !formEtapId && styles.etapChipActive]}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.etapChipText, !formEtapId && styles.etapChipTextActive]}>Brak</Text>
                      </TouchableOpacity>
                      {etapy.map((e) => (
                        <TouchableOpacity
                          key={e.id}
                          onPress={() => setFormEtapId(e.id)}
                          style={[styles.etapChip, formEtapId === e.id && styles.etapChipActive]}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.etapChipText, formEtapId === e.id && styles.etapChipTextActive]}>
                            {e.nazwa}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* Treść */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>NOTATKA</Text>
                <TextInput
                  value={formTresc}
                  onChangeText={setFormTresc}
                  placeholder="Co się dziś działo na budowie? Jakie prace wykonano? Czy były jakieś problemy?"
                  placeholderTextColor="rgba(255,255,255,0.22)"
                  style={styles.trescInput}
                  multiline
                  textAlignVertical="top"
                  maxLength={2000}
                />
                <Text style={styles.charCount}>{formTresc.length}/2000</Text>
              </View>

              {/* Zdjęcie */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>ZDJĘCIE (opcjonalne)</Text>
                {formZdjecieUri || formZdjecieUrl ? (
                  <View style={styles.imagePreviewWrap}>
                    <Image
                      source={{ uri: formZdjecieUri ?? formZdjecieUrl! }}
                      style={styles.imagePreview}
                      resizeMode="cover"
                    />
                    <TouchableOpacity onPress={removeImage} style={styles.imageRemoveBtn} activeOpacity={0.8}>
                      <Feather name="x" size={14} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={pickImage} style={styles.imagePickBtn} activeOpacity={0.8}>
                    <Feather name="camera" size={20} color="rgba(37,240,200,0.60)" />
                    <Text style={styles.imagePickText}>Dodaj zdjęcie z dnia</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Save */}
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={save}
                disabled={saving}
                activeOpacity={0.9}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? 'Zapisywanie...' : editingWpis ? 'Zapisz zmiany' : 'Dodaj wpis'}
                </Text>
              </TouchableOpacity>

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── DETAIL MODAL ── */}
      <Modal
        visible={detailOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailOpen(false)}
      >
        {detailWpis && (
          <View style={styles.modalScreen}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{getDayName(detailWpis.data)}</Text>
                <Text style={styles.modalSubtitle}>{formatDate(detailWpis.data)}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity onPress={() => openEdit(detailWpis)} style={styles.detailActionBtn} activeOpacity={0.8}>
                  <Feather name="edit-2" size={16} color={NEON} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteWpis(detailWpis)} style={[styles.detailActionBtn, { borderColor: 'rgba(239,68,68,0.30)' }]} activeOpacity={0.8}>
                  <Feather name="trash-2" size={16} color="rgba(239,68,68,0.80)" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDetailOpen(false)} activeOpacity={0.88}>
                  <Feather name="x" size={22} color="rgba(255,255,255,0.55)" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
              {/* Etap badge */}
              {detailWpis.etap_nazwa && (
                <View style={styles.detailEtapBadge}>
                  <Feather name="layers" size={12} color={NEON} />
                  <Text style={styles.detailEtapText}>{detailWpis.etap_nazwa}</Text>
                </View>
              )}

              {/* Treść */}
              <Text style={styles.detailTresc}>{detailWpis.tresc}</Text>

              {/* Zdjęcie */}
              {detailWpis.zdjecie_url && (
                <Image
                  source={{ uri: detailWpis.zdjecie_url }}
                  style={styles.detailImage}
                  resizeMode="cover"
                />
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

// ─── Wpis Card ────────────────────────────────────────────────────────────────

function WpisCard({ wpis: w, index, onPress }: { wpis: Wpis; index: number; onPress: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 10,
      delay: Math.min(index * 50, 300),
    }).start();
  }, []);

  const opacity = anim;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] });
  const isToday = w.data === toYMD(new Date());

  return (
    <Animated.View style={[styles.cardWrap, { opacity, transform: [{ translateY }] }]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.82 }]}
      >
        {/* Date column */}
        <View style={styles.cardDateCol}>
          <Text style={styles.cardDay}>
            {new Date(w.data + 'T00:00:00').getDate()}
          </Text>
          <Text style={styles.cardMonth}>
            {new Date(w.data + 'T00:00:00').toLocaleDateString('pl-PL', { month: 'short' })}
          </Text>
          {isToday && <View style={styles.todayDot} />}
        </View>

        {/* Separator */}
        <View style={styles.cardSep} />

        {/* Content */}
        <View style={{ flex: 1, minWidth: 0 }}>
          {w.etap_nazwa && (
            <View style={styles.cardEtapBadge}>
              <Text style={styles.cardEtapText}>{w.etap_nazwa}</Text>
            </View>
          )}
          <Text style={styles.cardTresc} numberOfLines={3}>{w.tresc}</Text>
        </View>

        {/* Thumbnail */}
        {w.zdjecie_url && (
          <Image source={{ uri: w.zdjecie_url }} style={styles.cardThumb} resizeMode="cover" />
        )}

        <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.20)" style={{ marginLeft: 4 }} />
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  glowTop: {
    position: 'absolute', width: 350, height: 350, borderRadius: 999,
    backgroundColor: ACCENT, opacity: 0.07, top: -180, right: -130,
  },
  glowBottom: {
    position: 'absolute', width: 250, height: 250, borderRadius: 999,
    backgroundColor: NEON, opacity: 0.03, bottom: 100, left: -80,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconWrap: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    color: ACCENT,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  headerCount: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: 13,
    fontWeight: '700',
  },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Empty
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 28,
    backgroundColor: 'rgba(37,240,200,0.06)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  emptySubtitle: { color: 'rgba(255,255,255,0.40)', fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    paddingHorizontal: 22, paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.28)',
    marginTop: 8,
  },
  emptyBtnText: { color: NEON, fontSize: 14, fontWeight: '900' },

  // List
  list: { paddingHorizontal: 18 },

  // Card
  cardWrap: { marginBottom: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardDateCol: { alignItems: 'center', width: 36 },
  cardDay: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', lineHeight: 26 },
  cardMonth: { color: 'rgba(255,255,255,0.40)', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  todayDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: NEON,
    marginTop: 4,
    shadowColor: NEON, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
  },
  cardSep: { width: 1, height: 48, backgroundColor: 'rgba(255,255,255,0.08)' },
  cardEtapBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.18)',
    marginBottom: 6,
  },
  cardEtapText: { color: NEON, fontSize: 10, fontWeight: '900' },
  cardTresc: { color: 'rgba(255,255,255,0.75)', fontSize: 13.5, fontWeight: '500', lineHeight: 19 },
  cardThumb: { width: 52, height: 52, borderRadius: 12, flexShrink: 0 },

  // FAB
  fabWrap: { position: 'absolute', bottom: 100, right: 22 },
  fab: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: NEON,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: NEON, shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 0 },
  },

  // Modal shared
  modalScreen: { flex: 1, backgroundColor: '#080E1C' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  modalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  modalSubtitle: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '600', marginTop: 2 },
  modalContent: { padding: 20, gap: 20 },

  // Form
  formGroup: { gap: 10 },
  formLabel: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 11, fontWeight: '900', letterSpacing: 1.2,
  },
  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  dateInput: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', flex: 1 },

  etapChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  etapChipActive: {
    backgroundColor: 'rgba(37,240,200,0.12)',
    borderColor: 'rgba(37,240,200,0.35)',
  },
  etapChipText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '700' },
  etapChipTextActive: { color: NEON },

  trescInput: {
    borderRadius: 16, padding: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    color: '#FFFFFF', fontSize: 15, fontWeight: '500', lineHeight: 22,
    minHeight: 140,
  },
  charCount: { color: 'rgba(255,255,255,0.22)', fontSize: 11, fontWeight: '700', textAlign: 'right' },

  imagePickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, padding: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(37,240,200,0.25)',
  },
  imagePickText: { color: 'rgba(37,240,200,0.60)', fontSize: 14, fontWeight: '700' },
  imagePreviewWrap: { position: 'relative', borderRadius: 16, overflow: 'hidden' },
  imagePreview: { width: '100%', height: 180, borderRadius: 16 },
  imageRemoveBtn: {
    position: 'absolute', top: 10, right: 10,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.60)',
    alignItems: 'center', justifyContent: 'center',
  },

  saveBtn: {
    borderRadius: 18, paddingVertical: 16,
    backgroundColor: NEON, alignItems: 'center',
    shadowColor: NEON, shadowOpacity: 0.30, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
  },
  saveBtnText: { color: '#0B1120', fontSize: 16, fontWeight: '900' },

  // Detail
  detailContent: { padding: 20, gap: 16 },
  detailActionBtn: {
    width: 34, height: 34, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.25)',
    backgroundColor: 'rgba(37,240,200,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  detailEtapBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.20)',
  },
  detailEtapText: { color: NEON, fontSize: 12, fontWeight: '900' },
  detailTresc: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16, fontWeight: '500', lineHeight: 24,
  },
  detailImage: {
    width: '100%', height: 220,
    borderRadius: 18,
    marginTop: 4,
  },
});