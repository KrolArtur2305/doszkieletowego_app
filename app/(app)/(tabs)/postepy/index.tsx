import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
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

const STATUS_DONE = 'zrealizowany';

export default function PostepyScreen() {
  const router = useRouter();
  const { session, initialised } = useSupabaseAuth();
  const userId = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [etapy, setEtapy] = useState<EtapRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!initialised) return;

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

        if (!cancelled) {
          setEtapy((data ?? []) as EtapRow[]);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Nie udaĹ‚o siÄ™ pobraÄ‡ etapĂłw.');
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
  }, [initialised, userId]);

  const {
    progressPercent,
    topStages,
    upcomingStage,
    completedMilestones,
    hasAnyStages,
  } = useMemo(() => {
    if (etapy.length === 0) {
      return {
        progressPercent: 0,
        topStages: [],
        upcomingStage: null,
        completedMilestones: [],
        hasAnyStages: false,
      };
    }

    const sorted = [...etapy].sort(
      (a, b) => (a.kolejnosc ?? 9999) - (b.kolejnosc ?? 9999)
    );

    const isDone = (s: string | null) =>
      (s ?? '').toLowerCase() === STATUS_DONE;

    const total = sorted.length;
    const done = sorted.filter((e) => isDone(e.status)).length;
    const percent = Math.round((done / total) * 100);

    const top4 = sorted.slice(0, 4).map((e) => ({
      id: e.id,
      label: e.nazwa,
      done: isDone(e.status),
    }));

    const next = sorted.find((e) => !isDone(e.status));
    const upcoming = next
      ? {
          title: next.nazwa,
          date: next.data_wykonania
            ? String(next.data_wykonania).slice(0, 10)
            : null,
          description: next.notatka ?? null,
        }
      : null;

    const completed = sorted
      .filter((e) => isDone(e.status))
      .slice()
      .reverse()
      .slice(0, 6)
      .map((e) => ({
        id: e.id,
        title: e.nazwa,
        date: e.data_wykonania
          ? String(e.data_wykonania).slice(0, 10)
          : null,
        notes: e.notatka ?? null,
      }));

    return {
      progressPercent: percent,
      topStages: top4,
      upcomingStage: upcoming,
      completedMilestones: completed,
      hasAnyStages: true,
    };
  }, [etapy]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 140 }}>
      <View style={styles.glow} />

      <BlurView intensity={75} tint="dark" style={styles.card}>
        <Text style={styles.sectionLabel}>PostÄ™p budowy</Text>

        {loading ? (
          <ActivityIndicator color="#5EEAD4" />
        ) : !hasAnyStages ? (
          <Text style={styles.muted}>Brak etapĂłw przypisanych do tej inwestycji.</Text>
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
                  <View
                    style={[
                      styles.stageDot,
                      stage.done && styles.stageDotDone,
                    ]}
                  />
                  <Text
                    style={[
                      styles.stageLabel,
                      stage.done && styles.stageLabelDone,
                    ]}
                  >
                    {stage.label}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </BlurView>

      <BlurView intensity={75} tint="dark" style={styles.card}>
        <Text style={styles.sectionLabel}>NadchodzÄ…cy etap</Text>

        {loading ? (
          <ActivityIndicator color="#5EEAD4" />
        ) : upcomingStage ? (
          <>
            <Text style={styles.sectionTitle}>{upcomingStage.title}</Text>
            {!!upcomingStage.date && (
              <Text style={styles.stageDate}>{upcomingStage.date}</Text>
            )}
            {!!upcomingStage.description && (
              <Text style={styles.stageDescription}>
                {upcomingStage.description}
              </Text>
            )}
          </>
        ) : (
          <Text style={styles.muted}>Brak nadchodzÄ…cych etapĂłw.</Text>
        )}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/(app)/(tabs)/postepy')}
        >
          <Text style={styles.primaryButtonText}>SprawdĹş wszystkie etapy</Text>
          <Feather name="arrow-right" size={18} color="#0B1120" />
        </TouchableOpacity>
      </BlurView>

      <BlurView intensity={75} tint="dark" style={styles.card}>
        <Text style={styles.sectionLabel}>Historia</Text>
        <Text style={styles.sectionTitle}>Zrealizowane etapy</Text>

        {loading ? (
          <ActivityIndicator color="#5EEAD4" />
        ) : completedMilestones.length > 0 ? (
          completedMilestones.map((m) => (
            <View key={m.id} style={styles.milestoneRow}>
              <View style={styles.milestoneIcon}>
                <Feather name="check" size={16} color="#0B1120" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.milestoneTitle}>{m.title}</Text>
                {!!m.date && (
                  <Text style={styles.milestoneMeta}>{m.date}</Text>
                )}
                {!!m.notes && (
                  <Text style={styles.milestoneNotes}>{m.notes}</Text>
                )}
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>Brak wykonanych etapĂłw.</Text>
        )}
      </BlurView>

      {!!error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050915', paddingHorizontal: 16, paddingTop: 40 },
  glow: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: '#9333EA',
    opacity: 0.18,
    top: 80,
    right: -120,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 22,
    marginBottom: 18,
  },
  sectionLabel: { color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1.5, fontSize: 12 },
  sectionTitle: { color: '#F8FAFC', fontSize: 22, fontWeight: '800', marginTop: 6, marginBottom: 12 },
  muted: { color: '#94A3B8', marginTop: 8 },
  batteryWrapper: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
  batteryBody: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  batteryFill: { height: '100%', backgroundColor: '#5EEAD4' },
  batteryCap: { width: 12, height: 24, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.2)' },

  stageRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  stageItem: { alignItems: 'center', flex: 1 },
  stageDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 6,
  },
  stageDotDone: { backgroundColor: '#5EEAD4', borderColor: '#5EEAD4' },
  stageLabel: { color: '#94A3B8', fontSize: 12 },
  stageLabelDone: { color: '#F8FAFC', fontWeight: '700' },

  stageDate: { color: '#5EEAD4', fontWeight: '600' },
  stageDescription: { color: '#CBD5F5', marginVertical: 12, lineHeight: 20 },

  primaryButton: {
    borderRadius: 18,
    backgroundColor: '#5EEAD4',
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  primaryButtonText: { color: '#0B1120', fontWeight: '800', fontSize: 16 },

  milestoneRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  milestoneIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#5EEAD4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '600' },
  milestoneMeta: { color: '#94A3B8', marginTop: 2 },
  milestoneNotes: { color: '#CBD5F5', marginTop: 4 },

  error: { color: '#FCA5A5', marginTop: 8 },
});




