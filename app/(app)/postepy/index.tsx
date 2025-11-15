import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';

const progressStages = [
  { id: 's0', label: 'Stan zero', done: true },
  { id: 'sso', label: 'SSO', done: true },
  { id: 'ssz', label: 'SSZ', done: false },
  { id: 'dev', label: 'Deweloperski', done: false },
];

const completedMilestones = [
  { id: 'm1', title: 'Fundamenty i izolacja', date: '28.01.2025', notes: 'Laboratorium zatwierdziło próbki betonu.' },
  { id: 'm2', title: 'Ściany parteru', date: '05.02.2025', notes: 'Wyrównano powierzchnię pod montaż stolarki.' },
  { id: 'm3', title: 'Strop parteru', date: '12.02.2025', notes: 'Zbrojenie i betonowanie zakończone bez uwag.' },
];

const upcomingStage = {
  title: 'SSZ – stolarka i dach',
  date: '18.02.2025',
  description: 'Montaż stolarki aluminiowej i prefabrykowanych wiązarów dachowych.',
};

export default function PostepyScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 140 }}>
      <View style={styles.glow} />
      <BlurView intensity={75} tint="dark" style={styles.card}>
        <Text style={styles.sectionLabel}>Pasek postępu</Text>
        <Text style={styles.sectionTitle}>Budowa w 68%</Text>
        <View style={styles.batteryWrapper}>
          <View style={styles.batteryBody}>
            <View style={[styles.batteryFill, { width: '68%' }]} />
          </View>
          <View style={styles.batteryCap} />
        </View>
        <View style={styles.stageRow}>
          {progressStages.map((stage) => (
            <View key={stage.id} style={styles.stageItem}>
              <View style={[styles.stageDot, stage.done && styles.stageDotDone]} />
              <Text style={[styles.stageLabel, stage.done && styles.stageLabelDone]}>{stage.label}</Text>
            </View>
          ))}
        </View>
      </BlurView>

      <BlurView intensity={75} tint="dark" style={styles.card}>
        <Text style={styles.sectionLabel}>Nadchodzący etap</Text>
        <Text style={styles.sectionTitle}>{upcomingStage.title}</Text>
        <Text style={styles.stageDate}>{upcomingStage.date}</Text>
        <Text style={styles.stageDescription}>{upcomingStage.description}</Text>
        <TouchableOpacity style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Sprawdź wszystkie etapy</Text>
          <Feather name="arrow-right" size={18} color="#0B1120" />
        </TouchableOpacity>
      </BlurView>

      <BlurView intensity={75} tint="dark" style={styles.card}>
        <Text style={styles.sectionLabel}>Historia</Text>
        <Text style={styles.sectionTitle}>Wykonane zadania</Text>
        {completedMilestones.map((milestone) => (
          <View key={milestone.id} style={styles.milestoneRow}>
            <View style={styles.milestoneIcon}>
              <Feather name="check" size={16} color="#0B1120" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.milestoneTitle}>{milestone.title}</Text>
              <Text style={styles.milestoneMeta}>{milestone.date}</Text>
              <Text style={styles.milestoneNotes}>{milestone.notes}</Text>
            </View>
          </View>
        ))}
      </BlurView>
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
  batteryWrapper: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
  batteryBody: {
    flex: 1,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  batteryFill: {
    height: '100%',
    backgroundColor: '#5EEAD4',
  },
  batteryCap: {
    width: 12,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
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
});
