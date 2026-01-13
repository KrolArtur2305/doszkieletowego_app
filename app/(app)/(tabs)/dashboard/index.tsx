import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { supabase } from '../../../../lib/supabase';

const { width: W } = Dimensions.get('window');

const ACCENT = '#19705C';
const BG = '#050505';

// Zmień jeśli masz inną nazwę bucketa
const PHOTOS_BUCKET = 'zdjecia';

type DonutItem = { key: string; title: string };

type PhotoItem = {
  key: string;
  url: string;
  name: string;
  created_at?: string;
};

export default function DashboardScreen() {
  // tylko żeby TS wiedział, że import jest używany
  useMemo(() => supabase, []);

  // ====== DONUT CAROUSEL ======
  const donutData: DonutItem[] = useMemo(
    () => [
      { key: 'budzet', title: 'Budżet' },
      { key: 'postep', title: 'Postęp' },
      { key: 'wydatki', title: 'Kategorie' },
    ],
    []
  );

  const CARD_W = Math.min(320, Math.round(W * 0.80));
  const GAP = 14;
  const SNAP = CARD_W + GAP;
  const SIDE = Math.max(0, Math.round((W - CARD_W) / 2));

  const scrollX = useRef(new Animated.Value(0)).current;

  // ====== PHOTOS ======
  const [photosLoading, setPhotosLoading] = useState(true);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photosError, setPhotosError] = useState<string>('');

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setPhotosError('');
        setPhotosLoading(true);

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const user = userData.user;
        if (!user) {
          if (!alive) return;
          setPhotos([]);
          return;
        }

        // Strategia: pobieramy listę z root bucketa.
        // Jeśli masz folderowanie po user_id/projekcie, potem doprecyzujemy prefix.
        const { data: list, error: listErr } = await supabase.storage
          .from(PHOTOS_BUCKET)
          .list('', { limit: 12, sortBy: { column: 'created_at', order: 'desc' } });

        if (listErr) throw listErr;

        const files = (list || [])
          .filter((f) => !!f.name && !f.name.endsWith('/'))
          .slice(0, 6);

        // Tworzymy signed URL (działa także na private bucket)
        const urls: PhotoItem[] = [];
        for (const f of files) {
          const { data: signed, error: signErr } = await supabase.storage
            .from(PHOTOS_BUCKET)
            .createSignedUrl(f.name, 60 * 30); // 30 min
          if (signErr) continue;
          if (signed?.signedUrl) {
            urls.push({
              key: f.id ?? f.name,
              url: signed.signedUrl,
              name: f.name,
              created_at: (f as any).created_at,
            });
          }
        }

        if (!alive) return;
        setPhotos(urls);
      } catch (e: any) {
        if (!alive) return;
        setPhotosError(e?.message ?? 'Nie udało się pobrać zdjęć.');
        setPhotos([]);
      } finally {
        if (alive) setPhotosLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={styles.screen}>
      {/* ultra subtelne tło */}
      <View pointerEvents="none" style={styles.bg}>
        <View style={styles.orbA} />
        <View style={styles.orbB} />
        <View style={styles.noise} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* LOGO */}
        <View style={styles.logoRow}>
          <Image
            source={require('../../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        {/* HERO */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Witaj</Text>
          <Text style={styles.heroSubtitle}>
            Jesteś już w połowie budowy — przeprowadzka coraz bliżej.
          </Text>
        </View>

        {/* DONUT CAROUSEL (BIG / GLAM / NO BORDERS) */}
        <View style={{ marginTop: 10 }}>
          <Animated.FlatList
            data={donutData}
            keyExtractor={(i) => i.key}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: SIDE, paddingBottom: 8 }}
            ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
            decelerationRate="fast"
            snapToInterval={SNAP}
            snapToAlignment="start"
            disableIntervalMomentum
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              { useNativeDriver: true }
            )}
            renderItem={({ item, index }) => {
              const center = index * SNAP;
              const inputRange = [center - SNAP, center, center + SNAP];

              const scale = scrollX.interpolate({
                inputRange,
                outputRange: [0.94, 1.08, 0.94],
                extrapolate: 'clamp',
              });

              const glow = scrollX.interpolate({
                inputRange,
                outputRange: [0.0, 1.0, 0.0],
                extrapolate: 'clamp',
              });

              const opacity = scrollX.interpolate({
                inputRange,
                outputRange: [0.72, 1.0, 0.72],
                extrapolate: 'clamp',
              });

              return (
                <Animated.View
                  style={[
                    styles.donutCardWrap,
                    { width: CARD_W, opacity, transform: [{ scale }] },
                  ]}
                >
                  <View style={styles.donutBase} />
                  <Animated.View style={[styles.donutGlow, { opacity: glow }]} />

                  <BlurView intensity={22} tint="dark" style={styles.donutGlass}>
                    <Text style={styles.donutTitle}>{item.title}</Text>

                    <View style={styles.donutWrap}>
                      {/* ring base */}
                      <View style={styles.ringBase} />

                      {/* glamour arc (2 warstwy dla „premium”) */}
                      <View style={styles.arcMain} />
                      <View style={styles.arcSoft} />

                      <View style={styles.donutHole}>
                        <Text style={styles.donutCenterText}>—</Text>
                      </View>
                    </View>

                    <Text style={styles.donutHint}>Wkrótce podłączymy dane</Text>
                  </BlurView>
                </Animated.View>
              );
            }}
          />
        </View>

        {/* ZADANIA (pusto) */}
        <Section title="Zadania">
          <EmptyState text="Brak zadań do wyświetlenia." />
        </Section>

        {/* OSTATNIO DODANE ZDJĘCIA (prawdziwe) */}
        <Section title="Ostatnio dodane zdjęcia">
          {photosLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator />
              <Text style={styles.loadingText}>Ładowanie zdjęć…</Text>
            </View>
          ) : photosError ? (
            <EmptyState text={photosError} />
          ) : photos.length === 0 ? (
            <EmptyState text="Brak zdjęć — dodaj pierwsze w module Zdjęcia." />
          ) : (
            <View style={styles.photosRow}>
              {photos.map((p) => (
                <View key={p.key} style={styles.photoThumb}>
                  <Image source={{ uri: p.url }} style={styles.photoImg} resizeMode="cover" />
                </View>
              ))}
            </View>
          )}
        </Section>

        {/* KALENDARZ (mniejszy, estetyczny, pusty) */}
        <Section title="Kalendarz">
          <View style={styles.miniCalendar}>
            <View style={styles.miniCalendarTop}>
              <Text style={styles.miniMonth}>Kalendarz</Text>
              <Text style={styles.miniMuted}>Wkrótce</Text>
            </View>
            <View style={styles.miniGrid}>
              {Array.from({ length: 14 }).map((_, i) => (
                <View key={i} style={styles.miniDot} />
              ))}
            </View>
            <View style={{ height: 10 }} />
            <EmptyState text="Brak zaplanowanych wydarzeń." compact />
          </View>
        </Section>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

/* ===================== SMALL UI ===================== */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionOuter}>
        <BlurView intensity={16} tint="dark" style={styles.sectionGlass}>
          {children}
        </BlurView>
      </View>
    </View>
  );
}

function EmptyState({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <View style={[styles.emptyWrap, compact && { paddingVertical: 10 }]}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

/* ===================== STYLES ===================== */

type Styles = {
  screen: ViewStyle;
  bg: ViewStyle;
  orbA: ViewStyle;
  orbB: ViewStyle;
  noise: ViewStyle;

  content: ViewStyle;

  logoRow: ViewStyle;
  logo: ImageStyle;

  hero: ViewStyle;
  heroTitle: TextStyle;
  heroSubtitle: TextStyle;

  donutCardWrap: ViewStyle;
  donutBase: ViewStyle;
  donutGlow: ViewStyle;
  donutGlass: ViewStyle;
  donutTitle: TextStyle;
  donutWrap: ViewStyle;
  ringBase: ViewStyle;
  arcMain: ViewStyle;
  arcSoft: ViewStyle;
  donutHole: ViewStyle;
  donutCenterText: TextStyle;
  donutHint: TextStyle;

  sectionWrap: ViewStyle;
  sectionTitle: TextStyle;
  sectionOuter: ViewStyle;
  sectionGlass: ViewStyle;

  emptyWrap: ViewStyle;
  emptyText: TextStyle;

  loadingRow: ViewStyle;
  loadingText: TextStyle;

  photosRow: ViewStyle;
  photoThumb: ViewStyle;
  photoImg: ImageStyle;

  miniCalendar: ViewStyle;
  miniCalendarTop: ViewStyle;
  miniMonth: TextStyle;
  miniMuted: TextStyle;
  miniGrid: ViewStyle;
  miniDot: ViewStyle;
};

const styles = StyleSheet.create<Styles>({
  screen: { flex: 1, backgroundColor: BG },

  bg: { ...StyleSheet.absoluteFillObject },
  orbA: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 9999,
    backgroundColor: ACCENT,
    opacity: 0.10,
    top: -240,
    right: -260,
  },
  orbB: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 9999,
    backgroundColor: ACCENT,
    opacity: 0.06,
    bottom: -340,
    left: -280,
  },
  noise: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.035,
    backgroundColor: 'rgba(255,255,255,1)',
  },

  content: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 140 },

  logoRow: { alignItems: 'center', marginTop: 6, marginBottom: 10 },
  logo: { width: 150, height: 44, opacity: 0.95 },

  hero: { marginTop: 10, marginBottom: 10 },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.2,
    textShadowColor: 'rgba(25,112,92,0.18)',
    textShadowRadius: 18,
  },
  heroSubtitle: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.60)',
    fontSize: 15.5,
    fontWeight: '400',
    lineHeight: 22,
  },

  /* DONUTS */
  donutCardWrap: { borderRadius: 30, overflow: 'hidden' },
  donutBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  donutGlow: {
    ...StyleSheet.absoluteFillObject,
    shadowColor: ACCENT,
    shadowOpacity: 0.40,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 14 },
  },
  donutGlass: {
    borderRadius: 30,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.028)',
  },
  donutTitle: {
    color: '#FFFFFF',
    fontSize: 16.5,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  donutWrap: {
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: 150,
  },
  ringBase: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 14,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  arcMain: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 14,
    borderColor: ACCENT,
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '-35deg' }],
    shadowColor: ACCENT,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  arcSoft: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 14,
    borderColor: 'rgba(25,112,92,0.38)',
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
    transform: [{ rotate: '-28deg' }],
  },
  donutHole: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(0,0,0,0.40)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenterText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.1,
    opacity: 0.9,
  },
  donutHint: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.38)',
    fontSize: 12.5,
    fontWeight: '500',
  },

  /* SECTIONS */
  sectionWrap: { marginTop: 18 },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionOuter: {
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.40,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
  },
  sectionGlass: {
    borderRadius: 28,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.026)',
  },

  emptyWrap: { paddingVertical: 16 },
  emptyText: { color: 'rgba(255,255,255,0.48)', fontSize: 14.5, lineHeight: 20 },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  loadingText: { color: 'rgba(255,255,255,0.55)', fontSize: 13.5, fontWeight: '500' },

  /* PHOTOS */
  photosRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  photoThumb: {
    width: (W - 18 * 2 - 16 - 12) / 3,
    aspectRatio: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  photoImg: { width: '100%', height: '100%' },

  /* MINI CALENDAR */
  miniCalendar: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  miniCalendarTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  miniMonth: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '600' },
  miniMuted: { color: 'rgba(255,255,255,0.40)', fontSize: 12.5, fontWeight: '500' },
  miniGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  miniDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
