import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

import { supabase } from '../../../../lib/supabase';
import { useSupabaseAuth } from '../../../../hooks/useSupabaseAuth';

const STATUS_SPENT = 'poniesiony';
const STATUS_UPCOMING = 'zaplanowany';

const formatPLN = (value: number) =>
  new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const safeNumber = (v: any) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const normalize = (s: any) => String(s ?? '').trim().toLowerCase();

const formatPLDate = (dateRaw: any) => {
  if (!dateRaw) return '—';
  const d = new Date(dateRaw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pl-PL');
};

const Donut = ({ percentage, title, subtitle, onPress }: { percentage: number; title: string; subtitle: string; onPress?: () => void }) => {
  const clamped = Math.max(0, Math.min(1, percentage));
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.85 : 1} onPress={onPress} disabled={!onPress} style={styles.donutTap}>
      <View style={styles.donutWrapper}>
        <View
          style={[
            styles.donutRing,
            {
              borderTopColor: '#5EEAD4',
              borderRightColor: '#5EEAD4',
              borderBottomColor: clamped > 0.5 ? '#38BDF8' : 'rgba(255,255,255,0.12)',
              borderLeftColor: clamped > 0.75 ? '#22D3EE' : 'rgba(255,255,255,0.12)',
            },
          ]}
        />
        <View style={styles.donutInner}>
          <Text style={styles.donutValue}>{Math.round(clamped * 100)}%</Text>
          <Text style={styles.donutLabel}>{title}</Text>
          <Text style={styles.donutSub}>{subtitle}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

type WydatkiRow = {
  id: string;
  nazwa: string | null;
  kategoria: string | null;
  kwota: number | string | null;
  data: string | null;
  status: string | null;
  created_at: string | null;
  opis: string | null;
  sklep: string | null;
  plik: string | null; // ścieżka w storage (name)
};

type PickedFile = {
  name: string;
  mimeType: string;
  uri: string;
  size?: number;
};

function guessMime(name: string, fallback?: string) {
  if (fallback) return fallback;
  const lower = (name || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}


async function uriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}



export default function BudzetScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useSupabaseAuth();
  const userId = session?.user?.id;

  const scrollRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [plannedBudget, setPlannedBudget] = useState(0);
  const [dates, setDates] = useState<{ start?: string | null; end?: string | null }>({ start: null, end: null });

  const [wydatki, setWydatki] = useState<WydatkiRow[]>([]);

  // modal
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fNazwa, setFNazwa] = useState('');
  const [fKategoria, setFKategoria] = useState('Inne');
  const [fKwota, setFKwota] = useState('');
  const [fStatus, setFStatus] = useState<typeof STATUS_SPENT | typeof STATUS_UPCOMING>(STATUS_UPCOMING);
  const [fData, setFData] = useState(''); // YYYY-MM-DD lub puste
  const [fOpis, setFOpis] = useState('');
  const [fSklep, setFSklep] = useState('');
  const [picked, setPicked] = useState<PickedFile | null>(null);

  const spentTotal = useMemo(
    () => wydatki.filter(w => normalize(w.status) === STATUS_SPENT).reduce((a, w) => a + safeNumber(w.kwota), 0),
    [wydatki]
  );
  const upcomingTotal = useMemo(
    () => wydatki.filter(w => normalize(w.status) === STATUS_UPCOMING).reduce((a, w) => a + safeNumber(w.kwota), 0),
    [wydatki]
  );

  const remaining = useMemo(() => Math.max(0, plannedBudget - spentTotal), [plannedBudget, spentTotal]);
  const budgetUtil = useMemo(() => (plannedBudget > 0 ? spentTotal / plannedBudget : 0), [plannedBudget, spentTotal]);

  const timeUtil = useMemo(() => {
    const start = dates.start ? new Date(dates.start) : null;
    const end = dates.end ? new Date(dates.end) : null;
    if (!start || !end) return 0;
    const now = new Date();
    const total = end.getTime() - start.getTime();
    if (total <= 0) return 0;
    const elapsed = now.getTime() - start.getTime();
    return Math.max(0, Math.min(1, elapsed / total));
  }, [dates]);

  const scrollToList = () => {
    scrollRef.current?.scrollTo({ y: 760, animated: true });
  };

  const loadBudget = useCallback(async () => {
    if (authLoading) return;
    if (!userId) return;

    setErrorMsg(null);
    setLoading(true);

    try {
      // inwestycje: budzet + daty
      const invRes = await supabase
        .from('inwestycje')
        .select('budzet, data_start, data_koniec')
        .eq('user_id', userId)
        .maybeSingle();

      if (invRes.error) throw invRes.error;

      setPlannedBudget(safeNumber((invRes.data as any)?.budzet));
      setDates({ start: (invRes.data as any)?.data_start ?? null, end: (invRes.data as any)?.data_koniec ?? null });

      // wydatki
      const expRes = await supabase
        .from('wydatki')
        .select('id, nazwa, kategoria, kwota, data, status, created_at, opis, sklep, plik')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (expRes.error) throw expRes.error;

      setWydatki((expRes.data ?? []) as any);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Nie udało się pobrać danych.');
      console.log('[Budzet] loadBudget error:', e);
    } finally {
      setLoading(false);
    }
  }, [authLoading, userId]);

  useEffect(() => {
    loadBudget();
  }, [loadBudget]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBudget();
    setRefreshing(false);
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
      type: ['application/pdf', 'image/*'],
    });

    if (res.canceled) return;
    const f = res.assets?.[0];
    if (!f?.uri) return;

    setPicked({
      name: f.name ?? 'plik',
      uri: f.uri,
      mimeType: guessMime(f.name ?? '', f.mimeType ?? undefined),
      size: f.size,
    });
  };

  const uploadOptionalFile = async (): Promise<string | null> => {
    if (!picked) return null;
    if (!userId) return null;

    // ścieżka w bucket: {uid}/wydatki/{timestamp}_{name}
    const safeName = (picked.name || 'plik').replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${userId}/wydatki/${Date.now()}_${safeName}`;

    const ab = await uriToArrayBuffer(picked.uri);

    const up = await supabase.storage
      .from('paragony')
      .upload(key, ab, { contentType: picked.mimeType, upsert: false });

    if (up.error) throw up.error;

    return key; // zapisujemy do wydatki.plik
  };

  const addExpense = async () => {
    if (!userId) return;

    const nazwa = fNazwa.trim();
    const kategoria = fKategoria.trim() || 'Inne';

    const kw = safeNumber(fKwota);
    if (!nazwa) return alert('Podaj nazwę wydatku.');
    if (kw <= 0) return alert('Kwota musi być większa od 0.');

    setSaving(true);
    try {
      // 1) upload (opcjonalny)
      const storageKey = await uploadOptionalFile();

      // 2) insert do tabeli
      const payload = {
        user_id: userId,
        nazwa,
        kategoria,
        kwota: kw,
        status: fStatus,
        data: fData?.trim() ? fData.trim() : null, // może być null
        opis: fOpis.trim() || null,
        sklep: fSklep.trim() || null,
        plik: storageKey, // może być null
      };

      const ins = await supabase.from('wydatki').insert(payload).select('id').maybeSingle();
      if (ins.error) throw ins.error;

      // reset formularza
      setFNazwa('');
      setFKategoria('Inne');
      setFKwota('');
      setFStatus(STATUS_UPCOMING);
      setFData('');
      setFOpis('');
      setFSklep('');
      setPicked(null);

      setAddOpen(false);
      await loadBudget();
    } catch (e: any) {
      console.log('[Budzet] addExpense error:', e);
      alert(e?.message ?? 'Nie udało się dodać wydatku.');
    } finally {
      setSaving(false);
    }
  };

  const openReceipt = async (storageKey: string) => {
    // prywatny bucket → signed url
    const signed = await supabase.storage.from('paragony').createSignedUrl(storageKey, 60 * 60);
    if (signed.error) {
      alert(signed.error.message);
      return;
    }
    if (signed.data?.signedUrl) Linking.openURL(signed.data.signedUrl);
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5EEAD4" />}
    >
      <BlurView intensity={80} tint="dark" style={styles.hero}>
        {loading ? (
          <ActivityIndicator color="#5EEAD4" />
        ) : (
          <>
            {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

            <View style={styles.donutsRow}>
              <Donut
                percentage={budgetUtil}
                title="Budżet"
                subtitle={`${formatPLN(spentTotal)} / ${formatPLN(plannedBudget || 0)}`}
                onPress={scrollToList}
              />
              <Donut
                percentage={timeUtil}
                title="Czas"
                subtitle={dates.start && dates.end ? `${formatPLDate(dates.start)} → ${formatPLDate(dates.end)}` : 'Uzupełnij daty inwestycji'}
              />
              <Donut
                percentage={spentTotal > 0 ? 1 : 0}
                title="Kategorie"
                subtitle="(na razie placeholder)"
                onPress={scrollToList}
              />
            </View>

            <View style={styles.heroStats}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Pozostało</Text>
                <Text style={styles.statValue}>{formatPLN(remaining)}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Planowane</Text>
                <Text style={styles.statValue}>{formatPLN(upcomingTotal)}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.addBtn} onPress={() => setAddOpen(true)}>
              <Text style={styles.addBtnText}>+ Dodaj wydatek</Text>
            </TouchableOpacity>
          </>
        )}
      </BlurView>

      <BlurView intensity={70} tint="dark" style={styles.card}>
        <View style={styles.listHeaderRow}>
          <Text style={styles.listTitle}>Ostatnie wydatki</Text>
          <Text style={styles.listSub}>sortowanie: najnowsze</Text>
        </View>

        {wydatki.length === 0 ? (
          <Text style={styles.empty}>Brak wydatków. Dodaj pierwszy wydatek powyżej.</Text>
        ) : (
          wydatki.slice(0, 8).map((w) => (
            <View key={w.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{w.nazwa ?? 'Wydatek'}</Text>
                <Text style={styles.itemMeta}>
                  {(w.data ? formatPLDate(w.data) : (w.created_at ? `Dodano: ${formatPLDate(w.created_at)}` : '—'))}
                  {'  •  '}
                  {w.kategoria ?? 'Inne'}
                  {'  •  '}
                  {normalize(w.status) === STATUS_SPENT ? 'poniesiony' : 'zaplanowany'}
                </Text>
              </View>

              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={styles.itemAmount}>{formatPLN(safeNumber(w.kwota))}</Text>
                {!!w.plik && (
                  <TouchableOpacity onPress={() => openReceipt(w.plik!)}>
                    <Text style={styles.fileLink}>paragon →</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </BlurView>

      {/* MODAL DODAWANIA */}
      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalBackdrop}>
          <BlurView intensity={90} tint="dark" style={styles.modalCard}>
            <Text style={styles.modalTitle}>Dodaj wydatek</Text>

            <Text style={styles.lbl}>Nazwa *</Text>
            <TextInput value={fNazwa} onChangeText={setFNazwa} style={styles.input} placeholder="np. Okna" placeholderTextColor="rgba(148,163,184,0.7)" />

            <Text style={styles.lbl}>Kategoria</Text>
            <TextInput value={fKategoria} onChangeText={setFKategoria} style={styles.input} placeholder="np. Stan surowy" placeholderTextColor="rgba(148,163,184,0.7)" />

            <Text style={styles.lbl}>Kwota (PLN) *</Text>
            <TextInput value={fKwota} onChangeText={setFKwota} style={styles.input} keyboardType="numeric" placeholder="np. 12500" placeholderTextColor="rgba(148,163,184,0.7)" />

            <View style={styles.row2}>
              <TouchableOpacity style={[styles.pill, fStatus === STATUS_UPCOMING && styles.pillOn]} onPress={() => setFStatus(STATUS_UPCOMING)}>
                <Text style={[styles.pillText, fStatus === STATUS_UPCOMING && styles.pillTextOn]}>zaplanowany</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pill, fStatus === STATUS_SPENT && styles.pillOn]} onPress={() => setFStatus(STATUS_SPENT)}>
                <Text style={[styles.pillText, fStatus === STATUS_SPENT && styles.pillTextOn]}>poniesiony</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.lbl}>Data (YYYY-MM-DD) — opcjonalnie</Text>
            <TextInput value={fData} onChangeText={setFData} style={styles.input} placeholder="np. 2026-01-03" placeholderTextColor="rgba(148,163,184,0.7)" />

            <Text style={styles.lbl}>Opis (opcjonalnie)</Text>
            <TextInput value={fOpis} onChangeText={setFOpis} style={styles.input} placeholder="np. zaliczka" placeholderTextColor="rgba(148,163,184,0.7)" />

            <Text style={styles.lbl}>Sklep (opcjonalnie)</Text>
            <TextInput value={fSklep} onChangeText={setFSklep} style={styles.input} placeholder="np. Castorama" placeholderTextColor="rgba(148,163,184,0.7)" />

            <TouchableOpacity style={styles.fileBtn} onPress={pickFile}>
              <Text style={styles.fileBtnText}>{picked ? `Wybrano: ${picked.name}` : 'Dodaj paragon (PDF/JPG/PNG) — opcjonalnie'}</Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setAddOpen(false)} disabled={saving}>
                <Text style={styles.btnGhostText}>Anuluj</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.btn, styles.btnMain, saving && { opacity: 0.7 }]} onPress={addExpense} disabled={saving}>
                <Text style={styles.btnMainText}>{saving ? 'Zapisywanie…' : 'Zapisz'}</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </Modal>

      <View style={{ height: 26 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050915', padding: 16 },

  hero: { borderRadius: 24, padding: 16, marginBottom: 16, overflow: 'hidden' },
  errorText: { color: '#FCA5A5', marginBottom: 10 },

  donutsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  donutTap: { flex: 1 },
  donutWrapper: { alignItems: 'center', justifyContent: 'center' },
  donutRing: { width: 110, height: 110, borderRadius: 55, borderWidth: 14, transform: [{ rotate: '-45deg' }] },
  donutInner: { position: 'absolute', width: 82, height: 82, borderRadius: 41, alignItems: 'center', justifyContent: 'center' },
  donutValue: { color: '#F8FAFC', fontSize: 18, fontWeight: '900' },
  donutLabel: { color: '#E2E8F0', marginTop: 2, fontSize: 12, fontWeight: '800' },
  donutSub: { color: '#94A3B8', marginTop: 2, fontSize: 10, textAlign: 'center' },

  heroStats: { flexDirection: 'row', gap: 12, marginTop: 14 },
  statBox: { flex: 1, padding: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  statLabel: { color: '#94A3B8', fontSize: 12 },
  statValue: { color: '#F8FAFC', fontSize: 16, fontWeight: '900', marginTop: 4 },

  addBtn: { marginTop: 14, borderRadius: 16, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(94,234,212,0.12)', borderWidth: 1, borderColor: 'rgba(94,234,212,0.45)' },
  addBtnText: { color: '#5EEAD4', fontWeight: '900' },

  card: { borderRadius: 24, padding: 16, overflow: 'hidden' },
  listHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  listTitle: { color: '#F8FAFC', fontWeight: '900', fontSize: 16 },
  listSub: { color: '#94A3B8', fontSize: 12 },

  empty: { color: '#94A3B8', paddingVertical: 10 },

  itemRow: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)' },
  itemName: { color: '#F8FAFC', fontWeight: '800' },
  itemMeta: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
  itemAmount: { color: '#5EEAD4', fontWeight: '900' },
  fileLink: { color: '#38BDF8', fontWeight: '800', fontSize: 12 },

  // modal
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  modalCard: { padding: 16, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  modalTitle: { color: '#F8FAFC', fontWeight: '900', fontSize: 18, marginBottom: 12 },
  lbl: { color: '#94A3B8', fontSize: 12, marginTop: 10, marginBottom: 6 },
  input: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 12, paddingVertical: 10, color: '#F8FAFC' },

  row2: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pill: { flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.03)' },
  pillOn: { borderColor: 'rgba(94,234,212,0.55)', backgroundColor: 'rgba(94,234,212,0.10)' },
  pillText: { color: '#94A3B8', fontWeight: '800' },
  pillTextOn: { color: '#5EEAD4' },

  fileBtn: { marginTop: 12, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(56,189,248,0.35)', backgroundColor: 'rgba(56,189,248,0.08)' },
  fileBtnText: { color: '#E2E8F0', fontWeight: '800', fontSize: 12 },

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  btnGhost: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.03)' },
  btnGhostText: { color: '#E2E8F0', fontWeight: '900' },
  btnMain: { borderWidth: 1, borderColor: 'rgba(94,234,212,0.55)', backgroundColor: 'rgba(94,234,212,0.14)' },
  btnMainText: { color: '#5EEAD4', fontWeight: '900' },
});
