import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../../../../lib/supabase';

type EtapRow = {
  id: string;
  user_id: string;
  nazwa: string;
  kolejnosc: number | null;
  status: string | null;
  notatka: string | null;
  utworzono?: string | null;
};

const ACCENT = '#19705C';
const NEON = '#25F0C8';

const STATUS_DONE = 'wykonany';
const STATUS_DEFAULT = 'planowany';

function normStatus(s: string | null | undefined) {
  return String(s ?? '').toLowerCase().trim();
}
function isDoneStatus(s: string | null | undefined) {
  return normStatus(s) === STATUS_DONE;
}
function safeOrder(n: number | null | undefined) {
  return typeof n === 'number' && Number.isFinite(n) ? n : 9999;
}

export default function WszystkieEtapyScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [etapy, setEtapy] = useState<EtapRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // local drafts for notes (so typing is smooth)
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  // debounce timers per row
  const noteTimers = useRef<Record<string, any>>({});

  const sorted = useMemo(() => {
    const s = [...etapy].sort((a, b) => safeOrder(a.kolejnosc) - safeOrder(b.kolejnosc));
    return s;
  }, [etapy]);

  const progress = useMemo(() => {
    const total = sorted.length;
    if (!total) return { percent: 0, done: 0, total: 0 };
    const done = sorted.filter((e) => isDoneStatus(e.status)).length;
    const percent = Math.round((done / total) * 100);
    return { percent, done, total };
  }, [sorted]);

  const currentNext = useMemo(() => {
    const obecny = sorted.find((e) => !isDoneStatus(e.status)) ?? null;
    const idx = obecny ? sorted.findIndex((x) => x.id === obecny.id) : -1;
    const nastepny = idx >= 0 ? sorted[idx + 1] ?? null : null;
    return { obecny, nastepny };
  }, [sorted]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const user = userData.user;
        if (!user) {
          if (!alive) return;
          setEtapy([]);
          return;
        }

        const { data, error } = await supabase
          .from('etapy')
          .select('id,user_id,nazwa,kolejnosc,status,notatka,utworzono')
          .eq('user_id', user.id)
          .order('kolejnosc', { ascending: true });

        if (error) throw error;

        if (!alive) return;
        const rows = (data ?? []) as EtapRow[];
        setEtapy(rows);

        // init note drafts
        const draft: Record<string, string> = {};
        for (const r of rows) draft[r.id] = r.notatka ?? '';
        setNoteDraft(draft);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? 'Nie udało się pobrać etapów.');
        setEtapy([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
      // cleanup timers
      Object.values(noteTimers.current).forEach((t) => clearTimeout(t));
      noteTimers.current = {};
    };
  }, []);

  const setSaving = (id: string, v: boolean) => {
    setSavingIds((prev) => ({ ...prev, [id]: v }));
  };

  const updateStatus = async (row: EtapRow) => {
    const newStatus = isDoneStatus(row.status) ? STATUS_DEFAULT : STATUS_DONE;

    // optimistic UI
    setEtapy((prev) => prev.map((e) => (e.id === row.id ? { ...e, status: newStatus } : e)));

    try {
      setSaving(row.id, true);

      const { error } = await supabase
        .from('etapy')
        .update({
          status: newStatus,
          // jak ustawiasz na wykonany, możesz opcjonalnie dopisać timestamp w notatce / osobnej kolumnie w przyszłości
        })
        .eq('id', row.id);

      if (error) throw error;
    } catch (e: any) {
      // rollback
      setEtapy((prev) => prev.map((e) => (e.id === row.id ? { ...e, status: row.status } : e)));
      setError(e?.message ?? 'Nie udało się zaktualizować statusu.');
    } finally {
      setSaving(row.id, false);
    }
  };

  const scheduleSaveNote = (rowId: string, value: string) => {
    // cancel previous debounce
    if (noteTimers.current[rowId]) clearTimeout(noteTimers.current[rowId]);

    noteTimers.current[rowId] = setTimeout(async () => {
      try {
        setSaving(rowId, true);
        const { error } = await supabase.from('etapy').update({ notatka: value }).eq('id', rowId);
        if (error) throw error;
      } catch (e: any) {
        setError(e?.message ?? 'Nie udało się zapisać notatki.');
      } finally {
        setSaving(rowId, false);
      }
    }, 700);
  };

  const onChangeNote = (rowId: string, text: string) => {
    setNoteDraft((prev) => ({ ...prev, [rowId]: text }));
    scheduleSaveNote(rowId, text);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* TOP BAR */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
            <Feather name="arrow-left" size={18} color="#EAFBF6" />
            <Text style={styles.backText}>Wróć</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Wszystkie etapy</Text>

          <View style={{ width: 62 }} />
        </View>

        {/* SUMMARY */}
        <BlurView intensity={16} tint="dark" style={styles.card}>
          <Text style={styles.cardLabel}>Podsumowanie</Text>

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={NEON} />
              <Text style={styles.loadingText}>Ładowanie etapów…</Text>
            </View>
          ) : (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Postęp</Text>
                <Text style={styles.summaryVal}>{progress.percent}%</Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Kroki</Text>
                <Text style={styles.summaryVal}>
                  {progress.done} / {progress.total}
                </Text>
              </View>

              <View style={styles.sep} />

              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Obecny etap</Text>
                <Text style={styles.summaryValSmall}>{currentNext.obecny?.nazwa ?? 'Brak'}</Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryKey}>Nadchodzący</Text>
                <Text style={styles.summaryValSmall}>{currentNext.nastepny?.nazwa ?? 'Brak'}</Text>
              </View>
            </>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}
        </BlurView>

        {/* LIST */}
        <BlurView intensity={16} tint="dark" style={styles.card}>
          <Text style={styles.cardLabel}>Lista etapów</Text>

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={NEON} />
              <Text style={styles.loadingText}>Ładowanie…</Text>
            </View>
          ) : sorted.length === 0 ? (
            <Text style={styles.muted}>Brak etapów. (Sprawdź seed w Supabase.)</Text>
          ) : (
            <View style={{ marginTop: 10 }}>
              {sorted.map((row) => {
                const done = isDoneStatus(row.status);
                const saving = !!savingIds[row.id];

                return (
                  <View key={row.id} style={styles.row}>
                    <TouchableOpacity
                      style={[styles.checkbox, done && styles.checkboxDone]}
                      onPress={() => updateStatus(row)}
                      activeOpacity={0.85}
                    >
                      {done ? <Feather name="check" size={16} color="#022C22" /> : null}
                    </TouchableOpacity>

                    <View style={{ flex: 1 }}>
                      <View style={styles.rowTop}>
                        <Text style={styles.rowTitle}>
                          {row.kolejnosc ? `${row.kolejnosc}. ` : ''}
                          {row.nazwa}
                        </Text>

                        {saving ? (
                          <ActivityIndicator size="small" color={NEON} />
                        ) : (
                          <Text style={[styles.badge, done ? styles.badgeDone : styles.badgePlanned]}>
                            {done ? 'Wykonany' : 'Planowany'}
                          </Text>
                        )}
                      </View>

                      <TextInput
                        value={noteDraft[row.id] ?? ''}
                        onChangeText={(t) => onChangeNote(row.id, t)}
                        placeholder="Dodaj notatkę do etapu…"
                        placeholderTextColor="rgba(255,255,255,0.35)"
                        style={styles.note}
                        multiline
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </BlurView>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 140 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  backText: { color: '#EAFBF6', fontWeight: '900', fontSize: 13.5 },

  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.2,
  },

  card: {
    borderRadius: 28,
    padding: 16,
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.026)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },

  cardLabel: {
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontSize: 12,
    fontWeight: '800',
  },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  loadingText: { color: 'rgba(255,255,255,0.55)', fontWeight: '800' },

  muted: { color: 'rgba(255,255,255,0.50)', marginTop: 10, lineHeight: 20 },

  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12 },
  summaryKey: { color: 'rgba(255,255,255,0.48)', fontWeight: '900', letterSpacing: 0.6, fontSize: 12.5 },
  summaryVal: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 20,
    textShadowColor: 'rgba(37,240,200,0.16)',
    textShadowRadius: 14,
  },
  summaryValSmall: { color: '#FFFFFF', fontWeight: '900', fontSize: 13.5 },

  sep: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 12 },

  error: { marginTop: 10, color: '#FCA5A5', fontWeight: '800' },

  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },

  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxDone: {
    backgroundColor: NEON,
    borderColor: NEON,
    shadowColor: NEON,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },

  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 15.5, flex: 1 },

  badge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    fontWeight: '900',
    fontSize: 11.5,
    overflow: 'hidden',
  },
  badgePlanned: { color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.14)' },
  badgeDone: { color: '#022C22', borderColor: 'rgba(37,240,200,0.35)', backgroundColor: 'rgba(37,240,200,0.85)' },

  note: {
    marginTop: 10,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '700',
    lineHeight: 20,
  },
});
