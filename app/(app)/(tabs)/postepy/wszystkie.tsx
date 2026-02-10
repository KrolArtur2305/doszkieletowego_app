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
import { useTranslation } from 'react-i18next';

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

const NEON = '#25F0C8';

// MUSI pasować do constraint w Supabase
const STATUS_DONE = 'zrealizowany';
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
  const { t } = useTranslation('stages');
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [etapy, setEtapy] = useState<EtapRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // notatki – lokalny draft
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const noteTimers = useRef<Record<string, any>>({});

  // „pokaż poprzednie”
  const [showPrevCount, setShowPrevCount] = useState(0);
  const PREV_STEP = 10;

  const sorted = useMemo(() => {
    return [...etapy].sort((a, b) => safeOrder(a.kolejnosc) - safeOrder(b.kolejnosc));
  }, [etapy]);

  // logika: domyślnie ukryj zrealizowane, a „pokaż poprzednie” dokłada po 10
  const listView = useMemo(() => {
    if (sorted.length === 0) {
      return { visible: [] as EtapRow[], hiddenPrevDone: [] as EtapRow[] };
    }

    const firstNotDoneIdx = sorted.findIndex((e) => !isDoneStatus(e.status));

    // jeśli wszystkie zrealizowane -> pokaż wszystko, żeby nie było pustki
    if (firstNotDoneIdx === -1) {
      return { visible: sorted, hiddenPrevDone: [] as EtapRow[] };
    }

    const prevDone = sorted.slice(0, firstNotDoneIdx).filter((e) => isDoneStatus(e.status));
    const rest = sorted.slice(firstNotDoneIdx);

    const sliceCount = Math.min(showPrevCount, prevDone.length);
    const prevToShow = sliceCount > 0 ? prevDone.slice(prevDone.length - sliceCount) : [];
    const hiddenPrev = prevDone.slice(0, Math.max(0, prevDone.length - sliceCount));

    return { visible: [...prevToShow, ...rest], hiddenPrevDone: hiddenPrev };
  }, [sorted, showPrevCount]);

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

        const draft: Record<string, string> = {};
        for (const r of rows) draft[r.id] = r.notatka ?? '';
        setNoteDraft(draft);

        setShowPrevCount(0);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? t('errors.fetchFailed'));
        setEtapy([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    load();

    return () => {
      alive = false;
      Object.values(noteTimers.current).forEach((t) => clearTimeout(t));
      noteTimers.current = {};
    };
  }, []);

  const setSaving = (id: string, v: boolean) => {
    setSavingIds((prev) => ({ ...prev, [id]: v }));
  };

  const updateStatus = async (row: EtapRow) => {
    const newStatus = isDoneStatus(row.status) ? STATUS_DEFAULT : STATUS_DONE;

    // optimistic
    setEtapy((prev) => prev.map((e) => (e.id === row.id ? { ...e, status: newStatus } : e)));

    try {
      setSaving(row.id, true);

      const { error } = await supabase
        .from('etapy')
        .update({ status: newStatus })
        .eq('id', row.id);

      if (error) throw error;
    } catch (e: any) {
      // rollback
      setEtapy((prev) => prev.map((e) => (e.id === row.id ? { ...e, status: row.status } : e)));
      setError(e?.message ?? t('errors.updateFailed'));
    } finally {
      setSaving(row.id, false);
    }
  };

  const scheduleSaveNote = (rowId: string, value: string) => {
    if (noteTimers.current[rowId]) clearTimeout(noteTimers.current[rowId]);

    noteTimers.current[rowId] = setTimeout(async () => {
      try {
        setSaving(rowId, true);
        const { error } = await supabase.from('etapy').update({ notatka: value }).eq('id', rowId);
        if (error) throw error;
      } catch (e: any) {
        setError(e?.message ?? t('errors.noteSaveFailed'));
      } finally {
        setSaving(rowId, false);
      }
    }, 650);
  };

  const onChangeNote = (rowId: string, text: string) => {
    setNoteDraft((prev) => ({ ...prev, [rowId]: text }));
    scheduleSaveNote(rowId, text);
  };

  const canShowPrev = !loading && listView.hiddenPrevDone.length > 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
            <Feather name="arrow-left" size={18} color="#EAFBF6" />
            <Text style={styles.backText}>{t('all.back')}</Text>
          </TouchableOpacity>

          <Text style={styles.title}>{t('all.title')}</Text>

          <View style={{ width: 62 }} />
        </View>

        {/* LISTA */}
        <BlurView intensity={16} tint="dark" style={styles.card}>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={NEON} />
              <Text style={styles.loadingText}>{t('common.loading')}</Text>
            </View>
          ) : sorted.length === 0 ? (
            <Text style={styles.muted}>{t('all.noStagesHint')}</Text>
          ) : (
            <View>
              {!!error && <Text style={styles.error}>{error}</Text>}

              {canShowPrev && (
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={() => setShowPrevCount((v) => v + PREV_STEP)}
                  style={styles.showPrevBtn}
                >
                  <Feather name="chevron-up" size={16} color="#EAFBF6" />
                  <Text style={styles.showPrevText}>
                    {t('all.showPrevious', { count: Math.min(PREV_STEP, listView.hiddenPrevDone.length) })}
                  </Text>
                </TouchableOpacity>
              )}

              {listView.visible.map((row) => {
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

                        {saving ? <ActivityIndicator size="small" color={NEON} /> : null}
                      </View>

                      <TextInput
                        value={noteDraft[row.id] ?? ''}
                        onChangeText={(text) => onChangeNote(row.id, text)}
                        placeholder={t('all.notePlaceholder')}
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

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  loadingText: { color: 'rgba(255,255,255,0.55)', fontWeight: '800' },

  muted: { color: 'rgba(255,255,255,0.50)', marginTop: 4, lineHeight: 20 },

  error: { marginBottom: 10, color: '#FCA5A5', fontWeight: '800' },

  showPrevBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)',
    marginBottom: 10,
  },
  showPrevText: { color: '#EAFBF6', fontWeight: '900' },

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
