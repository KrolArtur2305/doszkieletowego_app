import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';

const quickStats = [
  { id: 'area', icon: 'maximize', label: 'Pow. użytkowa', value: '186 m²' },
  { id: 'floors', icon: 'layers', label: 'Kondygnacje', value: '2' },
  { id: 'rooms', icon: 'grid', label: 'Pomieszczenia', value: '9' },
];

const attributes = [
  { id: 'footprint', label: 'Powierzchnia zabudowy', value: '142 m²' },
  { id: 'height', label: 'Wysokość kalenicy', value: '8.9 m' },
  { id: 'roof', label: 'Kąt dachu', value: '32°' },
  { id: 'garage', label: 'Garaż', value: '2 stanowiska' },
  { id: 'hvac', label: 'Wentylacja', value: 'Rekuperacja + GWC' },
  { id: 'smart', label: 'System inteligentny', value: 'KNX + automatyka rolet' },
];

export default function ProjektScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 140 }}>
      <View style={styles.glow} />
      <BlurView intensity={80} tint="dark" style={styles.hero}>
        <Text style={styles.heroLabel}>Mój projekt</Text>
        <Text style={styles.heroTitle}>Rezydencja DOSzkieletowa</Text>
        <Text style={styles.heroSubtitle}>Futurystyczna bryła z przeszkleniami i modułem ogrodu zimowego.</Text>
        <View style={styles.quickStatsRow}>
          {quickStats.map((stat) => (
            <View key={stat.id} style={styles.quickStatCard}>
              <Feather name={stat.icon as any} size={18} color="#5EEAD4" />
              <Text style={styles.quickStatLabel}>{stat.label}</Text>
              <Text style={styles.quickStatValue}>{stat.value}</Text>
            </View>
          ))}
        </View>
      </BlurView>

      <BlurView intensity={80} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitle}>Wizualizacja 3D</Text>
        <Text style={styles.sectionSubtitle}>Placeholder – wpięcie modelu WebGL/Expo-Three w kolejnej wersji.</Text>
        <View style={styles.previewBox}>
          <Feather name="cpu" size={36} color="#5EEAD4" />
          <Text style={styles.previewLabel}>Otwórz model 3D</Text>
          <TouchableOpacity style={styles.previewButton}>
            <Text style={styles.previewButtonText}>Zobacz w AR</Text>
          </TouchableOpacity>
        </View>
      </BlurView>

      <BlurView intensity={80} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitle}>Parametry budynku</Text>
        <Text style={styles.sectionSubtitle}>Wszystkie dane zsynchronizujemy z Supabase → tabela projects.</Text>
        {attributes.map((attribute, index) => (
          <View key={attribute.id} style={[styles.attributeRow, index !== attributes.length - 1 && styles.attributeDivider]}>
            <View>
              <Text style={styles.attributeLabel}>{attribute.label}</Text>
              <Text style={styles.attributeValue}>{attribute.value}</Text>
            </View>
            <Feather name="edit-3" size={18} color="#94A3B8" />
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
    width: 420,
    height: 420,
    borderRadius: 999,
    backgroundColor: '#0EA5E9',
    opacity: 0.15,
    top: 40,
    left: -120,
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
  heroSubtitle: { color: '#CBD5F5', marginTop: 6 },
  quickStatsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
  quickStatCard: {
    width: '30%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  quickStatLabel: { color: '#94A3B8', marginTop: 6, fontSize: 12 },
  quickStatValue: { color: '#F8FAFC', fontSize: 18, fontWeight: '700', marginTop: 4 },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 20,
    marginBottom: 18,
  },
  sectionTitle: { color: '#F8FAFC', fontSize: 22, fontWeight: '800' },
  sectionSubtitle: { color: '#94A3B8', marginTop: 6, marginBottom: 16 },
  previewBox: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.3)',
    padding: 32,
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(94,234,212,0.08)',
  },
  previewLabel: { color: '#F8FAFC', fontSize: 18, fontWeight: '700' },
  previewButton: {
    borderRadius: 16,
    backgroundColor: '#5EEAD4',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  previewButtonText: { color: '#0B1120', fontWeight: '700' },
  attributeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  attributeDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  attributeLabel: { color: '#94A3B8' },
  attributeValue: { color: '#F8FAFC', fontSize: 16, fontWeight: '600', marginTop: 4 },
});
