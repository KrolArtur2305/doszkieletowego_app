import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../../../../lib/supabase';

type CategoryKey = 'UMOWY' | 'FAKTURY_PARAGONY' | 'INNE';

const CATEGORIES: { key: CategoryKey; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'UMOWY', label: 'Umowy', icon: 'file-text' },
  { key: 'FAKTURY_PARAGONY', label: 'Faktury/Paragony', icon: 'credit-card' },
  { key: 'INNE', label: 'Inne', icon: 'archive' },
];

type DbDoc = {
  id: string;
  user_id: string | null;
  tytul: string; // ✅ POPRAWIONE
  notatki?: string | null;
  kategoria?: string | null;
  created_at?: string | null;
  plik_url: string;
};

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeCategory(cat?: string | null): CategoryKey {
  const c = (cat || '').toUpperCase();
  if (c === 'UMOWY') return 'UMOWY';
  if (c === 'FAKTURY_PARAGONY') return 'FAKTURY_PARAGONY';
  return 'INNE';
}

export default function DokumentyScreen() {
  const [activeCat, setActiveCat] = useState<CategoryKey>('UMOWY');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [docs, setDocs] = useState<DbDoc[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [file, setFile] = useState<{
    uri: string;
    name: string;
    mimeType?: string;
    size?: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchDocs = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData?.user;
      if (!user?.id) {
        setDocs([]);
        return;
      }

      const { data, error } = await supabase
        .from('dokumenty')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocs((data || []) as DbDoc[]);
    } catch (e: any) {
      console.error('[Dokumenty] fetch error:', e?.message || e);
      Alert.alert('Błąd', 'Nie udało się pobrać dokumentów.');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const filteredDocs = useMemo(
    () => docs.filter((d) => normalizeCategory(d.kategoria) === activeCat),
    [docs, activeCat]
  );

  const counts = useMemo(() => {
    const c: Record<CategoryKey, number> = { UMOWY: 0, FAKTURY_PARAGONY: 0, INNE: 0 };
    for (const d of docs) c[normalizeCategory(d.kategoria)] += 1;
    return c;
  }, [docs]);

  const resetForm = () => {
    setTitle('');
    setDesc('');
    setFile(null);
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: false });
    if (!res.canceled) {
      const a = res.assets?.[0];
      if (a?.uri) {
        setFile({
          uri: a.uri,
          name: a.name,
          mimeType: a.mimeType,
          size: a.size,
        });
      }
    }
  };

  const openDoc = async (doc: DbDoc) => {
    const path = doc.plik_url;
    if (path.startsWith('http')) {
      Linking.openURL(path);
      return;
    }
    const { data, error } = await supabase.storage.from('dokumenty').createSignedUrl(path, 120);
    if (error) throw error;
    if (data?.signedUrl) Linking.openURL(data.signedUrl);

    if (data?.signedUrl) Linking.openURL(data.signedUrl);
  };

  const addDoc = async () => {
    if (saving) return;

    const t = title.trim();
    if (!t || !file?.uri) {
      Alert.alert('Błąd', 'Tytuł i załącznik są wymagane.');
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user?.id) throw new Error('Brak użytkownika');

      const ext = (() => {
        const parts = (file.name || '').split('.');
        return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
      })();
      const filePath = `dokumenty/${user.id}/${Date.now()}${ext ? '.' + ext : ''}`;


      const blob = await (await fetch(file.uri)).blob();
      const { error: upErr } = await supabase.storage.from('dokumenty').upload(filePath, blob, {
        contentType: file.mimeType || (ext === 'pdf' ? 'application/pdf' : undefined),
              upsert: false,
      });
      if (upErr) throw upErr;
      const { error } = await supabase.from('dokumenty').insert({
        user_id: user.id,
        tytul: t, // ✅ KLUCZOWE
        notatki: desc || null,
        kategoria: activeCat,
        plik_url: filePath,
      });

      if (error) throw error;

      setModalOpen(false);
      resetForm();
      fetchDocs();
    } catch (e: any) {
      console.error('[Dokumenty] addDoc error:', e?.message || e);
      Alert.alert('Błąd', 'Nie udało się dodać dokumentu.');
    } finally {
      setSaving(false);
    }
  };

  const deleteDoc = async (doc: DbDoc) => {
    Alert.alert('Usuń dokument', `Na pewno usunąć: "${doc.tytul}"?`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('dokumenty').delete().eq('id', doc.id);
          await supabase.storage.from('dokumenty').remove([doc.plik_url]);
          fetchDocs();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator />
        <Text style={{ color: 'rgba(148,163,184,0.9)', marginTop: 10, fontWeight: '700' }}>
          Ładowanie dokumentów…
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Dokumenty</Text>
        <Text style={styles.subtitle}>Tylko Twoje pliki (PRIVATE) — otwierane przez signed URL.</Text>

        <View style={styles.tabsRow}>
          {CATEGORIES.map((c) => {
            const active = c.key === activeCat;
            return (
              <TouchableOpacity
                key={c.key}
                activeOpacity={0.9}
                onPress={() => setActiveCat(c.key)}
                style={[styles.tabPill, active && styles.tabPillActive]}
              >
                <Feather name={c.icon} size={14} color={active ? '#061015' : 'rgba(94,234,212,0.9)'} />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {c.label} ({counts[c.key]})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setModalOpen(true)}
            style={styles.addBtn}
          >
            <Feather name="plus" size={18} color="#061015" />
            <Text style={styles.addBtnText}>Dodaj</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={fetchDocs}
            style={styles.refreshBtn}
          >
            <Feather name="refresh-cw" size={16} color="rgba(148,163,184,0.95)" />
            <Text style={styles.refreshText}>{refreshing ? 'Odświeżam…' : 'Odśwież'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        {filteredDocs.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Brak dokumentów w tej kategorii.</Text>
          </View>
        ) : (
          filteredDocs.map((d) => (
            <Pressable
              key={d.id}
              onPress={() => openDoc(d)}
              onLongPress={() => deleteDoc(d)}
              style={{ marginBottom: 12 }}
            >
              <BlurView intensity={16} tint="dark" style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.iconBadge}>
                    <Feather name="file" size={18} color="#5EEAD4" />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {d.tytul}
                    </Text>
                    <Text style={styles.cardMeta}>
                      {formatDate(d.created_at)} • {CATEGORIES.find((x) => x.key === normalizeCategory(d.kategoria))?.label ?? 'Inne'}
                    </Text>
                  </View>

                  <Feather name="chevron-right" size={18} color="rgba(148,163,184,0.85)" />
                </View>

                {!!d.notatki && (
                  <Text style={styles.cardDesc} numberOfLines={3}>
                    {d.notatki}
                  </Text>
                )}

                <View style={styles.cardHintRow}>
                  <Text style={styles.cardHint}>Tap: otwórz • Hold: usuń</Text>
                  <View style={styles.privatePill}>
                    <Feather name="lock" size={12} color="rgba(94,234,212,0.95)" />
                    <Text style={styles.privateText}>PRIVATE</Text>
                  </View>
                </View>
              </BlurView>
            </Pressable>
          ))
        )}
      </ScrollView>

      {/* MODAL: Dodaj dokument */}
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <BlurView intensity={18} tint="dark" style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nowy dokument</Text>
              <TouchableOpacity onPress={() => { setModalOpen(false); }} style={styles.modalClose}>
                <Feather name="x" size={18} color="rgba(148,163,184,0.95)" />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 10 }}>
              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Tytuł (wymagany)</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Np. Umowa z wykonawcą"
                  placeholderTextColor="rgba(148,163,184,0.55)"
                  style={styles.input}
                />
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Opis</Text>
                <TextInput
                  value={desc}
                  onChangeText={setDesc}
                  placeholder="Dodatkowe informacje…"
                  placeholderTextColor="rgba(148,163,184,0.55)"
                  style={[styles.input, styles.textarea]}
                  multiline
                />
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Kategoria</Text>
                <View style={styles.catRow}>
                  {CATEGORIES.map((c) => {
                    const on = c.key === activeCat;
                    return (
                      <TouchableOpacity
                        key={c.key}
                        activeOpacity={0.9}
                        onPress={() => setActiveCat(c.key)}
                        style={[styles.catBtn, on && styles.catBtnOn]}
                      >
                        <Text style={[styles.catBtnText, on && styles.catBtnTextOn]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Załącznik (wymagany)</Text>
                <TouchableOpacity activeOpacity={0.9} onPress={pickFile} style={styles.fileBtn}>
                  <Feather name="paperclip" size={16} color="#061015" />
                  <Text style={styles.fileBtnText}>{file ? file.name : 'Wybierz plik (PDF / zdjęcie)'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => { setModalOpen(false); resetForm(); }}
                  style={styles.cancelBtn}
                  disabled={saving}
                >
                  <Text style={styles.cancelText}>Anuluj</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={addDoc}
                  style={styles.saveBtn}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#061015" />
                  ) : (
                    <>
                      <Feather name="check" size={16} color="#061015" />
                      <Text style={styles.saveText}>Zapisz</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </BlurView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050915' },
  center: { alignItems: 'center', justifyContent: 'center' },

  header: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 10 },
  title: {
    color: '#E8F3FF',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(94,234,212,0.25)',
    textShadowOffset: { width: 0, height: 8 },
    textShadowRadius: 16,
  },
  subtitle: { marginTop: 8, color: 'rgba(148,163,184,0.85)', textAlign: 'center', fontSize: 12 },

  tabsRow: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  tabPill: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.16)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  tabPillActive: {
    backgroundColor: '#5EEAD4',
    borderColor: 'rgba(94,234,212,0.35)',
  },
  tabText: { color: 'rgba(94,234,212,0.95)', fontSize: 12, fontWeight: '900' },
  tabTextActive: { color: '#061015' },

  actionsRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#5EEAD4',
    shadowColor: '#5EEAD4',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  addBtnText: { color: '#061015', fontWeight: '900' },
  refreshBtn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  refreshText: { color: 'rgba(148,163,184,0.95)', fontWeight: '800', fontSize: 12 },

  empty: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  emptyText: { color: 'rgba(148,163,184,0.85)', textAlign: 'center', fontWeight: '800' },

  card: {
    borderRadius: 18,
    overflow: 'hidden',
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(94,234,212,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.18)',
  },
  cardTitle: { color: '#E8F3FF', fontSize: 15, fontWeight: '900' },
  cardMeta: { marginTop: 4, color: 'rgba(148,163,184,0.82)', fontSize: 12, fontWeight: '800' },
  cardDesc: { marginTop: 10, color: 'rgba(226,232,240,0.88)', fontSize: 12, lineHeight: 16, fontWeight: '700' },
  cardHintRow: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardHint: { color: 'rgba(148,163,184,0.7)', fontSize: 11, fontWeight: '800' },
  privatePill: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.18)',
    backgroundColor: 'rgba(94,234,212,0.08)',
  },
  privateText: { color: 'rgba(94,234,212,0.95)', fontSize: 11, fontWeight: '900' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    padding: 16,
    justifyContent: 'center',
  },
  modalCard: {
    borderRadius: 22,
    overflow: 'hidden',
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.22)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle: { color: '#E8F3FF', fontWeight: '900', fontSize: 16 },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  inputWrap: { gap: 8 },
  inputLabel: { color: 'rgba(148,163,184,0.92)', fontWeight: '900', fontSize: 12 },
  input: {
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    color: '#E8F3FF',
    fontWeight: '800',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  textarea: { height: 88, paddingTop: Platform.OS === 'ios' ? 12 : 10, textAlignVertical: 'top' },

  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  catBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  catBtnOn: { backgroundColor: 'rgba(94,234,212,0.18)', borderColor: 'rgba(94,234,212,0.26)' },
  catBtnText: { color: 'rgba(148,163,184,0.95)', fontWeight: '900', fontSize: 12 },
  catBtnTextOn: { color: '#5EEAD4' },

  fileBtn: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: '#5EEAD4',
  },
  fileBtnText: { color: '#061015', fontWeight: '900', flex: 1 },

  modalActions: { marginTop: 4, flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cancelText: { color: 'rgba(226,232,240,0.9)', fontWeight: '900' },
  saveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#5EEAD4',
  },
  saveText: { color: '#061015', fontWeight: '900' },
});
