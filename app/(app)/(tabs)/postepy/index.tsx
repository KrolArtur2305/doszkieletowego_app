import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../../../../lib/supabase';
import { useSupabaseAuth } from '../../../../hooks/useSupabaseAuth';

type EtapRow = {
  id: string;
  user_id: string;
  nazwa: string;
  kolejnosc: number | null;
  status: string | null;
  data_wykonania: string | null;
  notatka: string | null;
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

export default function PostepyScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useSupabaseAuth();
  const userId = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [etapy, setEtapy] = useState<EtapRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (authLoading) return;

      setLoading(true);
      setError(null);

      if (!userId) {
        setEtapy([]);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('etapy')
          .select('id,user_id,nazwa,kolejnosc,status,data_wykonania,notatka')
          .eq('user_id', userId)
          .order('kolejnosc', { ascending: true });

        if (error) throw error;
        if (!cancelled) setEtapy((data ?? []) as EtapRow[]);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Nie udało się pobrać etapów.');
          setEtapy([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, userId]);

  const { progressPercent, topStages, obecny, nastepny, completedMilestones, hasAnyStages } =
    useMemo(() => {
      if (etapy.length === 0) {
        return {
          progressPercent: 0,
          topStages: [] as Array<{ id: string; label: string; done: boolean }>,
          obecny: null as null | { title: string; date: string | null; description: string | null },
          nastepny: null as null | { title: string; date: string | null; description: string | null },
          completedMilestones: [] as Array<{ id: string; title: string; date: string | null; notes: string | null }>,
          hasAnyStages: false,
        };
      }

      const sorted = [...etapy].sort((a, b) => safeOrder(a.kolejnosc) - safeOrder(b.kolejnosc));

      const total = sorted.length;
      const doneCount = sorted.filter((e) => isDoneStatus(e.status)).length;
      const percent = total ? Math.round((doneCount / total) * 100) : 0;

      // top4 – szybkie “kropki” postępu
      const top4 = sorted.slice(0, 4).map((e) => ({
        id: e.id,
        label: e.nazwa,
        done: isDoneStatus(e.status),
      }));

      // obecny = pierwszy niezrealizowany, nastepny = kolejny po nim
      const current = sorted.find((e) => !isDoneStatus(e.status)) ?? null;
      const idx = current ? sorted.findIndex((x) => x.id === current.id) : -1;
      const next = idx >= 0 ? sorted[idx + 1] ?? null : null;

      const obecnyStage = current
        ? {
            title: current.nazwa,
            date: current.data_wykonania ? String(current.data_wykonania).slice(0, 10) : null,
            description: current.notatka ?? null,
          }
        : null;

      const nastepnyStage = next
        ? {
            title: next.nazwa,
            date: next.data_wykonania ? String(next.data_wykonania).slice(0, 10) : null,
            description: next.notatka ?? null,
          }
        : null;

      // historia – ostatnie 6 zrealizowanych
      const completed = sorted
        .filter((e) => isDoneStatus(e.status))
        .slice()
        .reverse()
        .slice(0, 6)
        .map((e) => ({
          id: e.id,
          title: e.nazwa,
          date: e.data_wykonania ? String(e.data_wykonania).slice(0, 10) : null,
          notes: e.notatka ?? null,
        }));

      return {
        progressPercent: percent,
        topStages: top4,
        obecny: obecnyStage,
        nastepny: nastepnyStage,
        completedMilestones: completed,
        hasAnyStages: true,
      };
    }, [etapy]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 140 }}
      showsVerticalScrollIndicator={false}
    >
      {/* POSTĘP */}
      <BlurView intensity={16} tint="dark" style={styles.card}>
        <Text style={styles.cardLabel}>Postęp budowy</Text>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={NEON} />
            <Text style={styles.loadingText}>Ładowanie…</Text>
          </View>
        ) : !hasAnyStages ? (
          <Text style={styles.muted}>Brak etapów.</Text>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Budowa w {progressPercent}%</Text>

            <View style={styles.batteryWrapper}>
              <View style={styles.batteryBody}>
                <View style={[styles.batteryFill, { width: `${progressPercent}%` }]} />
              </View>
              <View style={styles.batteryCap} />
            </View>

            <View style={styles.stageRow}>
              {topStages.map((stage) => (
                <View key={stage.id} style={styles.stageItem}>
                  <View style={[styles.stageDot, stage.done && styles.stageDotDone]} />
                  <Text style={[styles.stageLabel, stage.done && styles.stageLabelDone]} numberOfLines={2}>
                    {stage.label}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </BlurView>

      {/* OBECNY + KOLEJNY */}
      <BlurView intensity={16} tint="dark" style={styles.card}>
        <Text style={styles.cardLabel}>Etapy</Text>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={NEON} />
            <Text style={styles.loadingText}>Ładowanie…</Text>
          </View>
        ) : obecny ? (
          <>
            <Text style={styles.smallLabel}>OBECNY ETAP</Text>
            <Text style={styles.sectionTitle}>{obecny.title}</Text>

            {!!obecny.date && <Text style={styles.stageDate}>{obecny.date}</Text>}
            {!!obecny.description && <Text style={styles.stageDescription}>{obecny.description}</Text>}

            <View style={styles.sep} />

            <Text style={styles.smallLabel}>KOLEJNY ETAP</Text>
            <Text style={styles.nextTitle}>{nastepny?.title ?? 'Brak'}</Text>
            {!!nastepny?.date && <Text style={styles.stageDate}>{nastepny.date}</Text>}
          </>
        ) : (
          <Text style={styles.muted}>Wszystkie etapy są zrealizowane.</Text>
        )}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/(app)/(tabs)/postepy/wszystkie')}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryButtonText}>Sprawdź wszystkie etapy</Text>
          <Feather name="arrow-right" size={18} color="#022C22" />
        </TouchableOpacity>
      </BlurView>

      {/* HISTORIA */}
      <BlurView intensity={16} tint="dark" style={styles.card}>
        <Text style={styles.cardLabel}>Historia</Text>
        <Text style={styles.sectionTitle}>Zrealizowane etapy</Text>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={NEON} />
            <Text style={styles.loadingText}>Ładowanie…</Text>
          </View>
        ) : completedMilestones.length > 0 ? (
          completedMilestones.map((m) => (
            <View key={m.id} style={styles.milestoneRow}>
              <View style={styles.milestoneIcon}>
                <Feather name="check" size={16} color="#022C22" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.milestoneTitle}>{m.title}</Text>
                {!!m.date && <Text style={styles.milestoneMeta}>{m.date}</Text>}
                {!!m.notes && <Text style={styles.milestoneNotes}>{m.notes}</Text>}
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>Brak zrealizowanych etapów.</Text>
        )}
      </BlurView>

      {!!error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    backgroundColor: 'transparent',
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

  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 8,
    marginBottom: 10,
    letterSpacing: -0.2,
  },

  muted: { color: 'rgba(255,255,255,0.50)', marginTop: 10, lineHeight: 20 },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  loadingText: { color: 'rgba(255,255,255,0.55)', fontWeight: '800' },

  // battery
  batteryWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 14,
    gap: 12,
  },
  batteryBody: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  batteryFill: {
    height: '100%',
    backgroundColor: NEON,
  },
  batteryCap: {
    width: 10,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  // top stages row
  stageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    gap: 10,
  },
  stageItem: { alignItems: 'center', flex: 1 },
  stageDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 6,
    backgroundColor: 'transparent',
  },
  stageDotDone: {
    backgroundColor: NEON,
    borderColor: NEON,
    shadowColor: NEON,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  stageLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 11.5, textAlign: 'center' },
  stageLabelDone: { color: '#FFFFFF', fontWeight: '800' },

  // current / next
  smallLabel: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.42)',
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  nextTitle: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 16.5,
    fontWeight: '900',
    letterSpacing: -0.2,
  },

  stageDate: { color: NEON, fontWeight: '800', marginTop: 2 },
  stageDescription: {
    color: 'rgba(255,255,255,0.70)',
    marginTop: 10,
    lineHeight: 20,
    fontWeight: '600',
  },

  sep: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 14 },

  primaryButton: {
    borderRadius: 18,
    backgroundColor: NEON,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  primaryButtonText: {
    color: '#022C22',
    fontWeight: '900',
    fontSize: 16,
  },

  // history
  milestoneRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  milestoneIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: NEON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneTitle: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '900',
  },
  milestoneMeta: { color: 'rgba(255,255,255,0.50)', marginTop: 2, fontWeight: '700' },
  milestoneNotes: { color: 'rgba(255,255,255,0.70)', marginTop: 4, lineHeight: 19, fontWeight: '600' },

  error: { color: '#FCA5A5', marginTop: 8, fontWeight: '800' },
});
