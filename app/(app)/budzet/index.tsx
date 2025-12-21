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

import { supabase } from '../../../supabase';
import { useSupabaseAuth } from '../../../hooks/useSupabaseAuth';

// Supabase statusy (twardo wg bazy)
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
  return statusRaw || '—';
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

type PaymentUI = { id: string; title: string; amount: number; date: string; status: string };

export default function BudzetScreen() {
  const router = useRouter();
  const { session, initialised } = useSupabaseAuth();
  const userId = session?.user?.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [plannedBudget, setPlannedBudget] = useState<number>(0);
  const [spentTotal, setSpentTotal] = useState<number>(0);
  const [upcomingTotal, setUpcomingTotal] = useState<number>(0);
  const [upcomingCount, setUpcomingCount] = useState<number>(0);
  const [upcomingPayments, setUpcomingPayments] = useState<PaymentUI[]>([]);

  const remaining = useMemo(() => Math.max(0, plannedBudget - spentTotal), [plannedBudget, spentTotal]);
  const utilization = useMemo(() => (plannedBudget > 0 ? spentTotal / plannedBudget : 0), [plannedBudget, spentTotal]);

  const loadBudget = useCallback(async () => {
    if (!initialised) return;

    if (!userId) {
      setLoading(false);
      setErrorMsg('Brak sesji użytkownika. Zaloguj się ponownie.');
      return;
    }

    setErrorMsg(null);
    setLoading(true);

    try {
      // 1) 1 user = 1 inwestycja -> bierzemy po user_id, limit 1
      const invRes = await supabase
        .from('inwestycje')
        .select('id, user_id, budzet')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

      if (invRes.error) throw invRes.error;

      if (!invRes.data) {
        // nie ma inwestycji dla usera
        setPlannedBudget(0);
        setSpentTotal(0);
        setUpcomingTotal(0);
        setUpcomingCount(0);
        setUpcomingPayments([]);
        setErrorMsg('Nie znaleziono inwestycji. Uzupełnij dane inwestycji, aby zobaczyć budżet.');
        return;
      }

      const plan = safeNumber(invRes.data.budzet);
      setPlannedBudget(plan);

      // 2) Wydatki usera
      const expRes = await supabase
        .from('wydatki')
        .select('id, user_id, nazwa, kwota, data, status')
        .eq('user_id', userId)
        .order('data', { ascending: true });

      if (expRes.error) throw expRes.error;

      const rows = expRes.data ?? [];

      // 3) Sumy
      const spent = rows
        .filter((r: any) => String(r.status ?? '').trim().toLowerCase() === STATUS_SPENT)
        .reduce((acc: number, r: any) => acc + safeNumber(r.kwota), 0);

      const upcomingRows = rows.filter(
        (r: any) => String(r.status ?? '').trim().toLowerCase() === STATUS_UPCOMING
      );

      const upcomingSum = upcomingRows.reduce((acc: number, r: any) => acc + safeNumber(r.kwota), 0);

      setSpentTotal(spent);
      setUpcomingTotal(upcomingSum);
      setUpcomingCount(upcomingRows.length);

      // 4) Lista (top 6)
      const list: PaymentUI[] = upcomingRows.slice(0, 6).map((r: any) => {
        const dateStr = r.data ? new Date(r.data).toLocaleDateString('pl-PL') : '—';
        return {
          id: r.id,
          title: r.nazwa ?? 'Wydatek',
          amount: safeNumber(r.kwota),
          date: dateStr,
          status: translateStatus(String(r.status ?? '')),
        };
      });

      setUpcomingPayments(list);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Nie udało się pobrać danych budżetu.');
    } finally {
      setLoading(false);
    }
  }, [initialised, userId]);

  useEffect(() => {
    loadBudget();
  }, [loadBudget]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBudget();
    setRefreshing(false);
  }, [loadBudget]);

  const expenseHighlights = useMemo(
    () => [
      {
        id: 'plan',
        label: 'Planowany budżet',
        value: formatPLN(plannedBudget),
        description: plannedBudget > 0 ? 'Kwota z inwestycji' : 'Uzupełnij budżet w inwestycji',
        cta: 'Edytuj inwestycję',
        onPress: () => router.push('/(app)/inwestycja'),
      },
      {
        id: 'spent',
        label: 'Poniesione wydatki',
        value: formatPLN(spentTotal),
        description: plannedBudget > 0 ? `Wydane ${Math.round(utilization * 100)}% limitu` : 'Brak planu budżetu',
        cta: 'Historia wydatków',
        onPress: () => router.push('/(app)/budzet/poniesione'),
      },
      {
        id: 'upcoming',
        label: 'Nadchodzące koszty',
        value: formatPLN(upcomingTotal),
        description: `${upcomingCount} płatności planowanych`,
        cta: 'Zobacz listę',
        onPress: () => router.push('/(app)/budzet/wszystkie?filter=upcoming'),
      },
    ],
    [plannedBudget, spentTotal, upcomingTotal, upcomingCount, utilization, router]
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 140 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5EEAD4" />}
    >
      <View style={styles.glowOne} />
      <View style={styles.glowTwo} />

      <BlurView intensity={80} tint="dark" style={styles.hero}>
        <Text style={styles.heroLabel}>Kontrola finansów</Text>
        <Text style={styles.heroTitle}>Budżet inwestycji</Text>
        <Text style={styles.heroSubtitle}>
          Śledzimy każdy rachunek i powiadomimy Cię, gdy wydatki przekroczą limity.
        </Text>

        {loading ? (
          <View style={{ paddingVertical: 26, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#5EEAD4" />
            <Text style={{ color: '#94A3B8', marginTop: 10 }}>Ładowanie budżetu…</Text>
          </View>
        ) : (
          <>
            {!!errorMsg && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg}</Text>
                <TouchableOpacity onPress={loadBudget} style={styles.retryBtn}>
                  <Text style={styles.retryBtnText}>Spróbuj ponownie</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.heroContent}>
              <Donut percentage={utilization} />
              <View style={{ flex: 1 }}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatLabel}>Plan</Text>
                  <Text style={styles.heroStatValue}>{formatPLN(plannedBudget)}</Text>
                </View>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatLabel}>Wydano</Text>
                  <Text style={[styles.heroStatValue, { color: '#5EEAD4' }]}>{formatPLN(spentTotal)}</Text>
                </View>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatLabel}>Pozostało</Text>
                  <Text style={styles.heroStatValue}>{formatPLN(remaining)}</Text>
                </View>
              </View>
            </View>
          </>
        )}
      </BlurView>

      <BlurView intensity={70} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitle}>Kafle finansowe</Text>
        <Text style={styles.sectionSubtitle}>Dane pobierane z Twojej inwestycji i listy wydatków.</Text>

        <View style={styles.highlightGrid}>
          {expenseHighlights.map((highlight) => (
            <View key={highlight.id} style={styles.highlightCard}>
              <Text style={styles.highlightLabel}>{highlight.label}</Text>
              <Text style={styles.highlightValue}>{highlight.value}</Text>
              <Text style={styles.highlightDescription}>{highlight.description}</Text>
              <TouchableOpacity style={styles.highlightButton} onPress={highlight.onPress}>
                <Text style={styles.highlightButtonText}>{highlight.cta}</Text>
                <Feather name="arrow-up-right" color="#5EEAD4" size={16} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </BlurView>

      <BlurView intensity={70} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitle}>AI Forecast</Text>
        <Text style={styles.sectionSubtitle}>
          Na razie to wskaźnik informacyjny. Docelowo podepniemy model predykcyjny.
        </Text>

        {(() => {
          // Prosty wskaźnik: % pozostałego budżetu
          const stability = plannedBudget > 0 ? Math.max(0, Math.min(0.98, remaining / plannedBudget)) : 0;
          const pct = Math.round(stability * 100);

          return (
            <>
              <View style={styles.aiRow}>
                <View style={styles.aiProgressTrack}>
                  <View style={[styles.aiProgressFill, { width: `${pct}%` }]} />
                </View>
                <View>
                  <Text style={styles.aiValue}>{pct}% stabilności</Text>
                  <Text style={styles.aiMeta}>Prognoza kosztów w ryzach</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.aiButton} onPress={() => router.push('/(app)/budzet/asystent')}>
                <Feather name="cpu" size={18} color="#0B1120" />
                <Text style={styles.aiButtonText}>Zapytaj asystenta kosztów</Text>
              </TouchableOpacity>
            </>
          );
        })()}
      </BlurView>

      <BlurView intensity={70} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitle}>Nadchodzące płatności</Text>

        {loading ? (
          <View style={{ paddingVertical: 18 }}>
            <ActivityIndicator color="#5EEAD4" />
          </View>
        ) : upcomingPayments.length === 0 ? (
          <Text style={{ color: '#94A3B8', marginTop: 10 }}>Brak płatności planowanych.</Text>
        ) : (
          upcomingPayments.map((payment) => (
            <View key={payment.id} style={styles.paymentRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentTitle}>{payment.title}</Text>
                <Text style={styles.paymentMeta}>{payment.date}</Text>
                <Text style={styles.paymentStatus}>{payment.status}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.paymentAmount}>{formatPLN(payment.amount)}</Text>
                <TouchableOpacity onPress={() => router.push(`/(app)/budzet/wydatek/${payment.id}`)}>
                  <Text style={styles.link}>Otwórz zlecenie →</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <TouchableOpacity style={{ marginTop: 10 }} onPress={() => router.push('/(app)/budzet/wszystkie?filter=upcoming')}>
          <Text style={styles.link}>Zobacz wszystkie →</Text>
        </TouchableOpacity>
      </BlurView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050915', paddingHorizontal: 16, paddingTop: 40 },
  glowOne: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: '#14B8A6',
    opacity: 0.15,
    top: 0,
    right: -100,
  },
  glowTwo: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: '#2563EB',
    opacity: 0.12,
    bottom: 160,
    left: -160,
  },
  hero: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 22,
    marginBottom: 18,
  },
  heroLabel: { color: '#94A3B8', letterSpacing: 1.2, textTransform: 'uppercase' },
  heroTitle: { color: '#F8FAFC', fontSize: 26, fontWeight: '800', marginTop: 6 },
  heroSubtitle: { color: '#CBD5F5', marginTop: 8, lineHeight: 20 },
  heroContent: { flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 20 },
  heroStat: { marginBottom: 14 },
  heroStatLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 2 },
  heroStatValue: { color: '#F8FAFC', fontSize: 20, fontWeight: '700' },

  donutWrapper: { alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  donutRing: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 18,
    borderColor: 'rgba(255,255,255,0.12)',
    transform: [{ rotate: '-45deg' }],
  },
  donutInner: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,9,21,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  donutValue: { color: '#F8FAFC', fontSize: 24, fontWeight: '800' },
  donutLabel: { color: '#94A3B8', fontSize: 12 },

  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 20,
    marginBottom: 18,
  },
  sectionTitle: { color: '#F8FAFC', fontSize: 20, fontWeight: '700' },
  sectionSubtitle: { color: '#94A3B8', marginTop: 4, marginBottom: 16 },

  highlightGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  highlightCard: {
    width: '48%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  highlightLabel: { color: '#94A3B8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  highlightValue: { color: '#F8FAFC', fontSize: 22, fontWeight: '800', marginTop: 8 },
  highlightDescription: { color: '#CBD5F5', marginVertical: 6 },
  highlightButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  highlightButtonText: { color: '#5EEAD4', fontWeight: '600' },

  aiRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 16 },
  aiProgressTrack: {
    flex: 1,
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  aiProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#22D3EE',
  },
  aiValue: { color: '#F8FAFC', fontSize: 18, fontWeight: '700' },
  aiMeta: { color: '#94A3B8' },
  aiButton: {
    borderRadius: 18,
    backgroundColor: '#5EEAD4',
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  aiButtonText: { color: '#0B1120', fontWeight: '800' },

  paymentRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  paymentTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '600' },
  paymentMeta: { color: '#94A3B8', marginTop: 4 },
  paymentStatus: { color: '#5EEAD4', marginTop: 2 },
  paymentAmount: { color: '#F8FAFC', fontSize: 18, fontWeight: '700' },
  link: { color: '#5EEAD4', marginTop: 6, fontWeight: '600' },

  errorBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  errorText: { color: '#FCA5A5', lineHeight: 18 },
  retryBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  retryBtnText: { color: '#F8FAFC', fontWeight: '700' },
});
