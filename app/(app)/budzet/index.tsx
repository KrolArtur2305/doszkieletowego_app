import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';

const expenseHighlights = [
  {
    id: 'plan',
    label: 'Planowany budżet',
    value: '420 000 zł',
    description: 'Kwota z umowy generalnej',
    cta: 'Przeglądaj plan',
  },
  {
    id: 'spent',
    label: 'Ponie­sione wydatki',
    value: '260 000 zł',
    description: 'Wydane 62% limitu',
    cta: 'Historia wydatków',
  },
  {
    id: 'upcoming',
    label: 'Nadchodzące koszty',
    value: '48 000 zł',
    description: '3 faktury oczekujące',
    cta: 'Zobacz listę',
  },
];

const upcomingPayments = [
  { id: 'p1', title: 'Faktura - stolarka aluminiowa', amount: '24 500 zł', date: '22.02.2025', status: 'Do akceptacji' },
  { id: 'p2', title: 'System rekuperacji', amount: '18 000 zł', date: '03.03.2025', status: 'Planowane' },
  { id: 'p3', title: 'Okablowanie inteligentne', amount: '5 500 zł', date: '05.03.2025', status: 'Draft' },
];

const Donut = ({ percentage }: { percentage: number }) => {
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
            borderBottomColor: percentage > 0.5 ? highlight : 'rgba(255,255,255,0.12)',
            borderLeftColor: percentage > 0.75 ? saturated : 'rgba(255,255,255,0.12)',
          },
        ]}
      />
      <View style={styles.donutInner}>
        <Text style={styles.donutValue}>{Math.round(percentage * 100)}%</Text>
        <Text style={styles.donutLabel}>wykorzystano</Text>
      </View>
    </View>
  );
};

export default function BudzetScreen() {
  const utilization = 0.62;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 140 }}>
      <View style={styles.glowOne} />
      <View style={styles.glowTwo} />
      <BlurView intensity={80} tint="dark" style={styles.hero}>
        <Text style={styles.heroLabel}>Kontrola finansów</Text>
        <Text style={styles.heroTitle}>Budżet inwestycji</Text>
        <Text style={styles.heroSubtitle}>Śledzimy każdy rachunek i powiadomimy Cię, gdy wydatki przekroczą limity.</Text>
        <View style={styles.heroContent}>
          <Donut percentage={utilization} />
          <View style={{ flex: 1 }}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Plan</Text>
              <Text style={styles.heroStatValue}>420 000 zł</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Wydano</Text>
              <Text style={[styles.heroStatValue, { color: '#5EEAD4' }]}>260 000 zł</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>Pozostało</Text>
              <Text style={styles.heroStatValue}>160 000 zł</Text>
            </View>
          </View>
        </View>
      </BlurView>

      <BlurView intensity={70} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitle}>Kafle finansowe</Text>
        <Text style={styles.sectionSubtitle}>Wersja mock – dane zaciągniemy z Supabase w kolejnej iteracji</Text>
        <View style={styles.highlightGrid}>
          {expenseHighlights.map((highlight) => (
            <View key={highlight.id} style={styles.highlightCard}>
              <Text style={styles.highlightLabel}>{highlight.label}</Text>
              <Text style={styles.highlightValue}>{highlight.value}</Text>
              <Text style={styles.highlightDescription}>{highlight.description}</Text>
              <TouchableOpacity style={styles.highlightButton}>
                <Text style={styles.highlightButtonText}>{highlight.cta}</Text>
                <Feather name="arrow-up-right" color="#5EEAD4" size={16} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </BlurView>

      <BlurView intensity={70} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitle}>AI Forecast</Text>
        <Text style={styles.sectionSubtitle}>Wersja pilota – przygotowujemy integrację modelu predykcyjnego.</Text>
        <View style={styles.aiRow}>
          <View style={styles.aiProgressTrack}>
            <View style={[styles.aiProgressFill, { width: '78%' }]} />
          </View>
          <View>
            <Text style={styles.aiValue}>78% stabilności</Text>
            <Text style={styles.aiMeta}>Prognoza kosztów w ryzach</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.aiButton}>
          <Feather name="cpu" size={18} color="#0B1120" />
          <Text style={styles.aiButtonText}>Zapytaj asystenta kosztów</Text>
        </TouchableOpacity>
      </BlurView>

      <BlurView intensity={70} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitle}>Nadchodzące płatności</Text>
        {upcomingPayments.map((payment) => (
          <View key={payment.id} style={styles.paymentRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.paymentTitle}>{payment.title}</Text>
              <Text style={styles.paymentMeta}>{payment.date}</Text>
              <Text style={styles.paymentStatus}>{payment.status}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.paymentAmount}>{payment.amount}</Text>
              <TouchableOpacity>
                <Text style={styles.link}>Otwórz zlecenie →</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
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
});
