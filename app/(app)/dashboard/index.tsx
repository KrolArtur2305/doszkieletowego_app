import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Image, FlatList } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../../../lib/supabase';

const shortcuts = [
  { label: 'Zdjęcia', icon: 'camera', route: '/(app)/zdjecia' },
  { label: 'Budżet', icon: 'pie-chart', route: '/(app)/budzet' },
  { label: 'Postępy', icon: 'trending-up', route: '/(app)/postepy' },
  { label: 'Projekt', icon: 'layers', route: '/(app)/projekt' },
  { label: 'Ustawienia', icon: 'user', route: '/(app)/ustawienia' },
];

const mockPhotos = [
  {
    id: '1',
    title: 'Strop nad parterem',
    stage: 'SSO',
    date: '12.02.2025',
    image:
      'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: '2',
    title: 'Zalany fundament',
    stage: 'Stan zero',
    date: '04.02.2025',
    image:
      'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: '3',
    title: 'Ściany piętra',
    stage: 'SSZ',
    date: '25.01.2025',
    image:
      'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=900&q=80',
  },
];

const mockTasks = [
  { id: 't1', title: 'Odbiór stali zbrojeniowej', time: '08:30', owner: 'Ekipa konstrukcyjna' },
  { id: 't2', title: 'Spotkanie z architektem', time: '12:00', owner: 'Ty', description: 'Omówienie zmian w elewacji' },
  { id: 't3', title: 'Kontrola jakości betonu', time: '15:30', owner: 'Inspektor nadzoru' },
];

export default function DashboardScreen() {
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      setEmail(user.email ?? null);

      const { data, error } = await supabase
        .from('profiles')
        .select('imie')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data?.imie) {
        setName(data.imie);
      }
    })();
  }, []);

  const greeting = useMemo(() => name ?? (email ? email.split('@')[0] : 'Użytkowniku'), [name, email]);
  const budgetUsage = 0.62;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={styles.glowOne} />
      <View style={styles.glowTwo} />

      <BlurView intensity={75} tint="dark" style={styles.heroCard}>
        <Text style={styles.heroLabel}>Panel zarządzania budową</Text>
        <Text style={styles.heroTitle}>Witaj, {greeting} 👋</Text>
        <Text style={styles.heroSubtitle}>
          Twój dom jest ukończony w <Text style={{ color: '#5EEAD4' }}>62%</Text>. Sprawdź, co dzieje się na
          budowie dzisiaj.
        </Text>

        <View style={styles.heroStatsRow}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatLabel}>Najbliższy milestone</Text>
            <Text style={styles.heroStatValue}>Strop piętra</Text>
            <Text style={styles.heroStatMeta}>18 lutego</Text>
          </View>
          <View style={[styles.heroStat, { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.08)' }]}>
            <Text style={styles.heroStatLabel}>Brygada</Text>
            <Text style={styles.heroStatValue}>Konstrukcje Pro</Text>
            <Text style={styles.heroStatMeta}>na miejscu</Text>
          </View>
        </View>
      </BlurView>

      <BlurView intensity={70} tint="dark" style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Skróty</Text>
          <Text style={styles.sectionSubtitle}>Twoje najczęstsze akcje</Text>
        </View>
        <View style={styles.shortcutGrid}>
          {shortcuts.map((shortcut) => (
            <TouchableOpacity
              key={shortcut.label}
              style={styles.shortcut}
              activeOpacity={0.85}
              onPress={() => router.push(shortcut.route as never)}
            >
              <View style={styles.shortcutIconWrapper}>
                <Feather name={shortcut.icon as any} color="#5EEAD4" size={20} />
              </View>
              <Text style={styles.shortcutLabel}>{shortcut.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </BlurView>

      <BlurView intensity={70} tint="dark" style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Najbliższy krok milowy</Text>
          <Text style={styles.sectionSubtitle}>Zaplanowany na 18.02.2025</Text>
        </View>
        <View style={styles.milestoneRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.milestoneTitle}>Zbrojenie stropu piętra</Text>
            <Text style={styles.milestoneMeta}>Koordynuje: Konstrukcje Pro</Text>
            <Text style={styles.milestoneMeta}>Czas: 7:30 - 16:00</Text>
          </View>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/(app)/postepy' as never)}>
            <Text style={styles.primaryButtonText}>Zobacz etapy</Text>
          </TouchableOpacity>
        </View>
      </BlurView>

      <BlurView intensity={70} tint="dark" style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Budżet</Text>
          <Text style={styles.sectionSubtitle}>Wykorzystano 62% limitu</Text>
        </View>
        <View style={styles.budgetRow}>
          <View style={styles.budgetBarTrack}>
            <View style={[styles.budgetBarFill, { width: `${budgetUsage * 100}%` }]} />
          </View>
          <View>
            <Text style={styles.budgetValue}>260 000 zł</Text>
            <Text style={styles.budgetMeta}>z 420 000 zł</Text>
            <TouchableOpacity onPress={() => router.push('/(app)/budzet' as never)}>
              <Text style={styles.link}>Sprawdź szczegóły →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>

      <BlurView intensity={70} tint="dark" style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Ostatnie zdjęcia</Text>
          <Text style={styles.sectionSubtitle}>4 nowe materiały od nadzoru</Text>
        </View>
        <FlatList
          data={mockPhotos}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
          renderItem={({ item }) => (
            <View style={styles.photoCard}>
              <Image source={{ uri: item.image }} style={styles.photo} />
              <View style={styles.photoMetaRow}>
                <Text style={styles.photoTitle}>{item.title}</Text>
                <Text style={styles.photoStage}>{item.stage}</Text>
              </View>
              <Text style={styles.photoDate}>{item.date}</Text>
            </View>
          )}
        />
      </BlurView>

      <BlurView intensity={70} tint="dark" style={[styles.card, { paddingBottom: 8 }]}> 
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Zadania na dziś</Text>
          <Text style={styles.sectionSubtitle}>Synchronizacja z kalendarzem budowy</Text>
        </View>
        {mockTasks.map((task) => (
          <View key={task.id} style={styles.taskRow}>
            <View style={styles.taskIcon}>
              <Feather name="check-circle" size={18} color="#5EEAD4" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.taskTitle}>{task.title}</Text>
              <Text style={styles.taskMeta}>
                {task.time} · {task.owner}
              </Text>
              {task.description ? <Text style={styles.taskDescription}>{task.description}</Text> : null}
            </View>
            <TouchableOpacity style={styles.pillButton}>
              <Text style={styles.pillButtonText}>Szczegóły</Text>
            </TouchableOpacity>
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
    width: 340,
    height: 340,
    borderRadius: 999,
    backgroundColor: '#0EA5E9',
    opacity: 0.25,
    top: -50,
    right: -120,
  },
  glowTwo: {
    position: 'absolute',
    width: 380,
    height: 380,
    borderRadius: 999,
    backgroundColor: '#14B8A6',
    opacity: 0.2,
    bottom: 120,
    left: -160,
  },
  heroCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 22,
    marginBottom: 20,
  },
  heroLabel: { color: '#94A3B8', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.6, marginBottom: 6 },
  heroTitle: { color: '#ECFDF5', fontSize: 26, fontWeight: '800' },
  heroSubtitle: { color: '#CBD5F5', marginTop: 10, lineHeight: 20 },
  heroStatsRow: { flexDirection: 'row', marginTop: 24 },
  heroStat: { flex: 1, paddingRight: 16 },
  heroStatLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 6 },
  heroStatValue: { color: '#F8FAFC', fontSize: 18, fontWeight: '700' },
  heroStatMeta: { color: '#5EEAD4', fontSize: 13, marginTop: 2 },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 20,
    marginBottom: 18,
  },
  sectionHeader: { marginBottom: 16 },
  sectionTitle: { color: '#F8FAFC', fontSize: 20, fontWeight: '700' },
  sectionSubtitle: { color: '#94A3B8', marginTop: 4 },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  shortcut: {
    width: '30%',
    minWidth: 90,
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  shortcutIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    backgroundColor: 'rgba(94,234,212,0.08)',
  },
  shortcutLabel: { color: '#E2E8F0', fontWeight: '600', textAlign: 'center' },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  milestoneTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  milestoneMeta: { color: '#94A3B8' },
  primaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(20,184,166,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.6)',
  },
  primaryButtonText: { color: '#5EEAD4', fontWeight: '700' },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  budgetBarTrack: {
    flex: 1,
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  budgetBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#22D3EE',
  },
  budgetValue: { color: '#F8FAFC', fontSize: 22, fontWeight: '700' },
  budgetMeta: { color: '#94A3B8', marginBottom: 4 },
  link: { color: '#5EEAD4', fontWeight: '600' },
  photoCard: {
    width: 180,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  photo: { width: '100%', height: 120 },
  photoMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    alignItems: 'center',
  },
  photoTitle: { color: '#F8FAFC', fontWeight: '600', flex: 1, marginRight: 8 },
  photoStage: {
    color: '#5EEAD4',
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.4)',
  },
  photoDate: { color: '#94A3B8', fontSize: 12, padding: 14 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  taskIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(94,234,212,0.1)',
  },
  taskTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '600' },
  taskMeta: { color: '#94A3B8', marginTop: 2 },
  taskDescription: { color: '#CBD5F5', marginTop: 4 },
  pillButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(148,163,184,0.1)',
  },
  pillButtonText: { color: '#E2E8F0', fontWeight: '600' },
});
