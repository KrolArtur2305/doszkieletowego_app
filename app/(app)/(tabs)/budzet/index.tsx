import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../../../../lib/supabase';
import { useSupabaseAuth } from '../../../../hooks/useSupabaseAuth';

const STATUS_SPENT = 'poniesiony';
const STATUS_UPCOMING = 'zaplanowany';

const formatPLN = (value: number) =>
  new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    maximumFractionDigits: 0,
  }).format(value);

const safeNumber = (v: any) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const translateStatus = (statusRaw: string) => {
  const s = (statusRaw || '').trim().toLowerCase();
  if (s === STATUS_SPENT) return 'Poniesione';
  if (s === STATUS_UPCOMING) return 'Planowane';
  return 'â€”';
};

const Donut = ({ percentage }: { percentage: number }) => {
  const clamped = Math.max(0, Math.min(1, percentage));
  const accent = '#5EEAD4';
  const highlight = '#38BDF8';
  const saturated = '#22D3EE';

  return (
    <View style={styles.donutWrapper}>
      <View
        style={[
          styles.donutRing,
          {
            borderTopColor: accent,
            borderRightColor: accent,
            borderBottomColor: clamped > 0.5 ? highlight : 'rgba(255,255,255,0.12)',
            borderLeftColor: clamped > 0.75 ? saturated : 'rgba(255,255,255,0.12)',
          },
        ]}
      />
      <View style={styles.donutInner}>
        <Text style={styles.donutValue}>{Math.round(clamped * 100)}%</Text>
        <Text style={styles.donutLabel}>wykorzystano</Text>
      </View>
    </View>
  );
};

type PaymentUI = {
  id: string;
  title: string;
  amount: number;
  date: string;
  status: string;
};

export default function BudzetScreen() {
  const router = useRouter();
  const { session, initialised } = useSupabaseAuth();
  const userId = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [plannedBudget, setPlannedBudget] = useState(0);
  const [spentTotal, setSpentTotal] = useState(0);
  const [upcomingTotal, setUpcomingTotal] = useState(0);
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [upcomingPayments, setUpcomingPayments] = useState<PaymentUI[]>([]);

  const remaining = useMemo(
    () => Math.max(0, plannedBudget - spentTotal),
    [plannedBudget, spentTotal]
  );

  const utilization = useMemo(
    () => (plannedBudget > 0 ? spentTotal / plannedBudget : 0),
    [plannedBudget, spentTotal]
  );

  const loadBudget = useCallback(async () => {
    if (!initialised || !userId) return;

    setErrorMsg(null);
    setLoading(true);

    try {
      const invRes = await supabase
        .from('inwestycje')
        .select('budzet')
        .eq('user_id', userId)
        .maybeSingle();

      if (invRes.error) throw invRes.error;

      const plan = safeNumber(invRes.data?.budzet);
      setPlannedBudget(plan);

      const expRes = await supabase
        .from('wydatki')
        .select('id, nazwa, kwota, data, status')
        .eq('user_id', userId)
        .order('data', { ascending: true });

      if (expRes.error) throw expRes.error;

      const rows = expRes.data ?? [];

      const spent = rows
        .filter((r) => String(r.status).toLowerCase() === STATUS_SPENT)
        .reduce((a, r) => a + safeNumber(r.kwota), 0);

      const upcoming = rows.filter(
        (r) => String(r.status).toLowerCase() === STATUS_UPCOMING
      );

      setSpentTotal(spent);
      setUpcomingTotal(upcoming.reduce((a, r) => a + safeNumber(r.kwota), 0));
      setUpcomingCount(upcoming.length);

      setUpcomingPayments(
        upcoming.slice(0, 6).map((r) => ({
          id: r.id,
          title: r.nazwa ?? 'Wydatek',
          amount: safeNumber(r.kwota),
          date: r.data ? new Date(r.data).toLocaleDateString('pl-PL') : 'â€”',
          status: translateStatus(r.status),
        }))
      );
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Nie udaĹ‚o siÄ™ pobraÄ‡ danych.');
    } finally {
      setLoading(false);
    }
  }, [initialised, userId]);

  useEffect(() => {
    loadBudget();
  }, [loadBudget]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBudget();
    setRefreshing(false);
  };

  const tiles = [
    {
      id: 'plan',
      label: 'Planowany budĹĽet',
      value: formatPLN(plannedBudget),
      cta: 'Edytuj',
      onPress: () => router.push('/(app)/inwestycja'),
    },
    {
      id: 'spent',
      label: 'Wydano',
      value: formatPLN(spentTotal),
      cta: 'Historia',
      onPress: () => router.push('/(app)/budzet/poniesione'),
    },
    {
      id: 'upcoming',
      label: 'Planowane',
      value: formatPLN(upcomingTotal),
      cta: 'Lista',
      onPress: () => router.push('/(app)/budzet/wszystkie?filter=upcoming'),
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5EEAD4" />
      }
    >
      <BlurView intensity={80} tint="dark" style={styles.hero}>
        {loading ? (
          <ActivityIndicator color="#5EEAD4" />
        ) : (
          <>
            {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

            <View style={styles.heroContent}>
              <Donut percentage={utilization} />
              <View>
                <Text style={styles.heroStatValue}>{formatPLN(remaining)}</Text>
                <Text style={styles.heroStatLabel}>pozostaĹ‚o</Text>
              </View>
            </View>
          </>
        )}
      </BlurView>

      <BlurView intensity={70} tint="dark" style={styles.card}>
        <View style={styles.highlightGrid}>
          {tiles.map((t) => (
            <View key={t.id} style={styles.highlightCard}>
              <Text style={styles.highlightLabel}>{t.label}</Text>
              <Text style={styles.highlightValue}>{t.value}</Text>
              <TouchableOpacity onPress={t.onPress}>
                <Text style={styles.link}>{t.cta} â†’</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </BlurView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050915', padding: 16 },
  hero: { borderRadius: 24, padding: 20, marginBottom: 16 },
  heroContent: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  heroStatLabel: { color: '#94A3B8' },
  heroStatValue: { color: '#F8FAFC', fontSize: 22, fontWeight: '800' },

  donutWrapper: { alignItems: 'center', justifyContent: 'center' },
  donutRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 16,
    transform: [{ rotate: '-45deg' }],
  },
  donutInner: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutValue: { color: '#F8FAFC', fontSize: 22, fontWeight: '800' },
  donutLabel: { color: '#94A3B8' },

  card: { borderRadius: 24, padding: 16 },
  highlightGrid: { flexDirection: 'row', gap: 12 },
  highlightCard: { flex: 1, padding: 16, borderRadius: 18 },
  highlightLabel: { color: '#94A3B8', fontSize: 12 },
  highlightValue: { color: '#F8FAFC', fontSize: 20, fontWeight: '700' },
  link: { color: '#5EEAD4', marginTop: 6 },

  errorText: { color: '#FCA5A5', marginBottom: 10 },
});





