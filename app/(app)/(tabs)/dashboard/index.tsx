import { useMemo } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';

// ✅ POPRAWNY IMPORT – 3x ../ (NIC WIĘCEJ, NIC MNIEJ)
import { supabase } from '../../../lib/supabase';

const shortcuts = [
  { label: 'Zdjęcia', icon: 'camera', route: '/(app)/(tabs)/zdjecia' },
  { label: 'Budżet', icon: 'pie-chart', route: '/(app)/(tabs)/budzet' },
  { label: 'Postępy', icon: 'trending-up', route: '/(app)/(tabs)/postepy' },
  { label: 'Projekt', icon: 'layers', route: '/(app)/(tabs)/projekt' },
  { label: 'Ustawienia', icon: 'settings', route: '/(app)/(tabs)/ustawienia' },
];

export default function DashboardScreen() {
  // tylko żeby TS wiedział, że import jest używany
  useMemo(() => supabase, []);

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bg}>
        <View style={styles.glowA} />
        <View style={styles.glowB} />
        <View style={styles.glowC} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.logoWrap}>
          {/* assets są w root → tu MUSI być 5x ../ */}
          <Image
            source={require('../../../../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.header}>DASHBOARD</Text>
        <Text style={styles.headerSub}>
          Skróty do najważniejszych modułów.
        </Text>

        <BlurView intensity={85} tint="dark" style={styles.card}>
          <View style={styles.grid}>
            {shortcuts.map((s) => (
              <TouchableOpacity
                key={s.label}
                style={styles.tile}
                activeOpacity={0.85}
                onPress={() => router.push(s.route as never)}
              >
                <Feather name={s.icon as any} size={18} color="#5EEAD4" />
                <Text style={styles.tileText}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </BlurView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#050915' },

  bg: { ...StyleSheet.absoluteFillObject },
  glowA: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 9999,
    backgroundColor: '#0EA5E9',
    opacity: 0.12,
    top: -120,
    right: -220,
  },
  glowB: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 9999,
    backgroundColor: '#5EEAD4',
    opacity: 0.1,
    bottom: -260,
    left: -220,
  },
  glowC: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 9999,
    backgroundColor: '#22C55E',
    opacity: 0.06,
    top: 240,
    left: -160,
  },

  content: { paddingTop: 26, paddingHorizontal: 16, paddingBottom: 140 },

  logoWrap: { alignItems: 'center', marginBottom: 10, marginTop: 18 },
  logo: { width: 140, height: 44, opacity: 0.95 },

  header: {
    textAlign: 'center',
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 4,
  },
  headerSub: {
    textAlign: 'center',
    color: '#94A3B8',
    marginTop: 8,
    marginBottom: 14,
    lineHeight: 20,
  },

  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: 18,
    backgroundColor: 'rgba(8,14,30,0.35)',
    overflow: 'hidden',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    width: '48%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tileText: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
});
