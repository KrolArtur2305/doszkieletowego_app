import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import { FuturisticDonutSvg } from '../../../../components/FuturisticDonutSvg';

const { width: W } = Dimensions.get('window');

const ACCENT = '#19705C';
const NEON = '#25F0C8';
const BG = '#050505';

const PHOTOS_BUCKET = 'zdjecia';

type PhotoItem = {
  key: string;
  url: string;
  name: string;
  created_at?: string;
};

type DonutItem = {
  key: 'budzet' | 'czas' | 'postep';
  value: number; // 0..1
  label: string;
  onPress?: () => void;
};

function formatPLDateLong(d: Date) {
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function safeNumber(v: any) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

const formatPLN = (value: number) =>
  new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

function buildMonthGrid(base: Date) {
  const year = base.getFullYear();
  const month = base.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  // monday-first
  const firstDay = (first.getDay() + 6) % 7; // 0..6 where 0=Mon
  const daysInMonth = last.getDate();

  const cells: Array<{ day?: number; isToday?: boolean }> = [];
  for (let i = 0; i < firstDay; i++) cells.push({});
  const today = new Date();
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    cells.push({ day: d, isToday });
  }
  while (cells.length % 7 !== 0) cells.push({});
  // 6 rows look best in UI
  while (cells.length < 42) cells.push({});
  return cells;
}

export default function DashboardScreen() {
  useMemo(() => supabase, []);

  const router = useRouter();

  // ===== HERO (name + animated subtitle) =====
  const [imie, setImie] = useState<string>('');
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleY = useRef(new Animated.Value(8)).current;

  // ===== DONUT CAROUSEL =====
  const CARD_W = Math.min(320, Math.round(W * 0.82));
  const GAP = 14;
  const SNAP = CARD_W + GAP;
  const SIDE = Math.max(0, Math.round((W - CARD_W) / 2));

  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);

  // ===== STATUS (placeholder now) =====
  const onPressPostepy = () => router.push('/(app)/(tabs)/postepy');

  // ===== BUDGET/TIME DATA (reuse same logic as Budzet) =====
  const [statusLoading, setStatusLoading] = useState(true);
  const [plannedBudget, setPlannedBudget] = useState(0);
  const [spentTotal, setSpentTotal] = useState(0);
  const [dates, setDates] = useState<{ start?: string | null; end?: string | null }>({ start: null, end: null });

  const budgetUtil = useMemo(() => (plannedBudget > 0 ? spentTotal / plannedBudget : 0), [plannedBudget, spentTotal]);

  const timeUtil = useMemo(() => {
    const start = dates.start ? new Date(dates.start) : null;
    const end = dates.end ? new Date(dates.end) : null;
    if (!start || !end) return 0;
    const now = new Date();
    const total = end.getTime() - start.getTime();
    if (total <= 0) return 0;
    const elapsed = now.getTime() - start.getTime();
    return clamp01(elapsed / total);
  }, [dates]);

  // ===== DONUT DATA =====
  const donutData: DonutItem[] = useMemo(
    () => [
      {
        key: 'budzet',
        value: clamp01(budgetUtil),
        label: 'Budżet',
        onPress: () => router.push('/(app)/(tabs)/budzet'),
      },
      {
        key: 'czas',
        value: clamp01(timeUtil),
        label: 'Czas',
      },
      {
        key: 'postep',
        value: 0.5,
        label: 'Postęp',
      },
    ],
    [budgetUtil, timeUtil, router]
  );

  // ===== PHOTOS (ostatnie 3 w karuzeli poziomej) =====
  const [photosLoading, setPhotosLoading] = useState(true);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photosError, setPhotosError] = useState<string>('');

  // ===== CALENDAR =====
  const [calBase] = useState(() => new Date());
  const calCells = useMemo(() => buildMonthGrid(calBase), [calBase]);
  const monthLabel = useMemo(
    () => calBase.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }),
    [calBase]
  );

  // ===== LOAD: PROFILE NAME + HERO ANIM =====
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const user = userData.user;
        if (!user) return;

        const prof = await supabase.from('profiles').select('imie').eq('user_id', user.id).maybeSingle();
        if (!alive) return;
        setImie((prof.data as any)?.imie ?? '');
      } catch {
        // ignore
      } finally {
        // animate subtitle always
        Animated.parallel([
          Animated.timing(subtitleOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
          Animated.timing(subtitleY, { toValue: 0, duration: 420, useNativeDriver: true }),
        ]).start();
      }
    })();

    return () => {
      alive = false;
    };
  }, [subtitleOpacity, subtitleY]);

  // ===== LOAD: STATUS (budget + time like Budzet) =====
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setStatusLoading(true);

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const user = userData.user;
        if (!user) return;

        const invRes = await supabase
          .from('inwestycje')
          .select('budzet, data_start, data_koniec')
          .eq('user_id', user.id)
          .maybeSingle();

        if (invRes.error) throw invRes.error;

        if (!alive) return;

        setPlannedBudget(safeNumber((invRes.data as any)?.budzet));
        setDates({
          start: (invRes.data as any)?.data_start ?? null,
          end: (invRes.data as any)?.data_koniec ?? null,
        });

        const expRes = await supabase
          .from('wydatki')
          .select('kwota, status')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (expRes.error) throw expRes.error;

        const spent = (expRes.data ?? [])
          .filter((w: any) => String(w.status ?? '').toLowerCase().trim() === 'poniesiony')
          .reduce((a: number, w: any) => a + safeNumber(w.kwota), 0);

        if (!alive) return;
        setSpentTotal(spent);
      } catch {
        if (!alive) return;
        setPlannedBudget(0);
        setSpentTotal(0);
        setDates({ start: null, end: null });
      } finally {
        if (alive) setStatusLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // ===== LOAD: PHOTOS (userId/{etap}/{plik} → 3 najnowsze) =====
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

        // 1) list etap folders under userId
        const { data: etapList, error: etapErr } = await supabase.storage
          .from(PHOTOS_BUCKET)
          .list(user.id, { limit: 100 });

        if (etapErr) throw etapErr;

        const etapFolders = (etapList ?? [])
          .map((x) => x.name)
          .filter((name) => !!name && !name.includes('.')); // folder heuristic

        // 2) list files inside each etap folder, take newest, merge sort by created_at
        const allFiles: Array<{ path: string; name: string; created_at?: string; id?: string }> = [];

        for (const etap of etapFolders) {
          const prefix = `${user.id}/${etap}`;
          const { data: files, error: filesErr } = await supabase.storage
            .from(PHOTOS_BUCKET)
            .list(prefix, { limit: 40, sortBy: { column: 'created_at', order: 'desc' } });

          if (filesErr) continue;

          for (const f of files ?? []) {
            if (!f?.name || f.name.endsWith('/')) continue;
            allFiles.push({
              path: `${prefix}/${f.name}`,
              name: f.name,
              created_at: (f as any).created_at,
              id: (f as any).id,
            });
          }
        }

        allFiles.sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        });

        const newest = allFiles.slice(0, 3);

        const out: PhotoItem[] = [];
        for (const f of newest) {
          const { data: signed, error: signErr } = await supabase.storage
            .from(PHOTOS_BUCKET)
            .createSignedUrl(f.path, 60 * 30);
          if (signErr) continue;
          if (signed?.signedUrl) {
            out.push({
              key: f.id ?? f.path,
              url: signed.signedUrl,
              name: f.name,
              created_at: f.created_at,
            });
          }
        }

        if (!alive) return;
        setPhotos(out);
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

  const heroDateLine = useMemo(() => {
    const d = new Date();
    return `Dziś ${formatPLDateLong(d)}, jesteś już w połowie budowy — przeprowadzka coraz bliżej.`;
  }, []);

  const handleMomentumEnd = (e: any) => {
    const x = e?.nativeEvent?.contentOffset?.x ?? 0;
    const idx = Math.round(x / SNAP);
    setActiveIndex(idx);
  };

  return (
    <View style={styles.screen}>
      {/* background */}
      <View pointerEvents="none" style={styles.bg}>
        <View style={styles.orbA} />
        <View style={styles.orbB} />
        <View style={styles.noise} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* LOGO */}
        <View style={styles.logoRow}>
          <Image source={require('../../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        </View>

        {/* HERO */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>
            Witaj {imie ? imie : ''}
          </Text>

          <Animated.View style={{ opacity: subtitleOpacity, transform: [{ translateY: subtitleY }] }}>
            <Text style={styles.heroSubtitle}>{heroDateLine}</Text>
          </Animated.View>
        </View>

        {/* POSTĘP BUDOWY (klik) */}
        <TouchableOpacity activeOpacity={0.88} onPress={onPressPostepy} style={styles.progressCardOuter}>
          <BlurView intensity={18} tint="dark" style={styles.progressCard}>
            <Text style={styles.progressTitle}>Postęp budowy</Text>

            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>OBECNY ETAP</Text>
              <Text style={styles.progressValue}>Paroizolacja • Stolarka okienna</Text>
            </View>

            <View style={styles.sep} />

            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>KOLEJNY ETAP</Text>
              <Text style={styles.progressValue}>Stan deweloperski</Text>
            </View>

            <View style={styles.sep} />

            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>KROKI MILOWE</Text>
              <Text style={styles.progressBig}>8 / 16</Text>
            </View>
          </BlurView>
        </TouchableOpacity>

        {/* DONUT CAROUSEL – CZARNE TŁO, SVG, 3D POP */}
        <View style={{ marginTop: 16 }}>
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
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
            onMomentumScrollEnd={handleMomentumEnd}
            renderItem={({ item, index }) => {
              const center = index * SNAP;
              const inputRange = [center - SNAP, center, center + SNAP];

              const scale = scrollX.interpolate({
                inputRange,
                outputRange: [0.92, 1.06, 0.92],
                extrapolate: 'clamp',
              });

              const opacity = scrollX.interpolate({
                inputRange,
                outputRange: [0.75, 1, 0.75],
                extrapolate: 'clamp',
              });

              const glow = scrollX.interpolate({
                inputRange,
                outputRange: [0.0, 1.0, 0.0],
                extrapolate: 'clamp',
              });

              return (
                <Animated.View
                  style={[
                    styles.donutSlide,
                    {
                      width: CARD_W,
                      opacity,
                      transform: [{ scale }],
                    },
                  ]}
                >
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.donutGlowWrap,
                      {
                        opacity: glow,
                      },
                    ]}
                  />

                  {/* zero kart / zero tła */}
                  <View style={styles.donutInnerWrap}>
                    <FuturisticDonutSvg
                      value={item.value}
                      label={item.label}
                      onPressLabel={item.onPress}
                      isActive={index === activeIndex}
                      size={240}
                      stroke={18}
                    />

                    {/* mały opis pod donutem (tylko tam gdzie pasuje) */}
                    {item.key === 'budzet' && (
                      <Text style={styles.donutSubText}>
                        {statusLoading ? '—' : `${formatPLN(spentTotal)} / ${formatPLN(plannedBudget)}`}
                      </Text>
                    )}

                    {item.key === 'czas' && (
                      <Text style={styles.donutSubText}>
                        {dates.start && dates.end ? `${new Date(dates.start).toLocaleDateString('pl-PL')} → ${new Date(dates.end).toLocaleDateString('pl-PL')}` : 'Uzupełnij daty inwestycji'}
                      </Text>
                    )}
                  </View>
                </Animated.View>
              );
            }}
          />
        </View>

        {/* OSTATNIO DODANE ZDJĘCIA (duże, pozioma karuzela) */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Ostatnio dodane zdjęcia</Text>

          <View style={styles.sectionOuter}>
            <BlurView intensity={16} tint="dark" style={styles.sectionGlass}>
              {photosLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator />
                  <Text style={styles.loadingText}>Ładowanie zdjęć…</Text>
                </View>
              ) : photosError ? (
                <Text style={styles.emptyText}>{photosError}</Text>
              ) : photos.length === 0 ? (
                <Text style={styles.emptyText}>Brak zdjęć — dodaj pierwsze w module Zdjęcia.</Text>
              ) : (
                <FlatList
                  data={photos}
                  keyExtractor={(p) => p.key}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  snapToAlignment="start"
                  decelerationRate="fast"
                  contentContainerStyle={{ paddingRight: 4 }}
                  ItemSeparatorComponent={() => <View style={{ width: 14 }} />}
                  renderItem={({ item }) => (
                    <View style={styles.photoCard}>
                      <Image source={{ uri: item.url }} style={styles.photoImg} resizeMode="cover" />
                    </View>
                  )}
                />
              )}
            </BlurView>
          </View>
        </View>

        {/* KALENDARZ – działa bez paczek */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitle}>Kalendarz</Text>

          <View style={styles.sectionOuter}>
            <BlurView intensity={16} tint="dark" style={styles.sectionGlass}>
              <View style={styles.calendarTop}>
                <Text style={styles.calendarMonth}>{monthLabel}</Text>
                <Text style={styles.calendarHint}>Wkrótce zadania i wydarzenia</Text>
              </View>

              <View style={styles.weekRow}>
                {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map((d) => (
                  <Text key={d} style={styles.weekDay}>
                    {d}
                  </Text>
                ))}
              </View>

              <View style={styles.grid}>
                {calCells.map((c, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.cell,
                      c.isToday && styles.cellToday,
                    ]}
                  >
                    <Text style={[styles.cellText, c.isToday && styles.cellTextToday]}>
                      {c.day ? String(c.day) : ''}
                    </Text>
                  </View>
                ))}
              </View>
            </BlurView>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

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

  progressCardOuter: ViewStyle;
  progressCard: ViewStyle;
  progressTitle: TextStyle;
  progressRow: ViewStyle;
  progressLabel: TextStyle;
  progressValue: TextStyle;
  progressBig: TextStyle;
  sep: ViewStyle;

  donutSlide: ViewStyle;
  donutGlowWrap: ViewStyle;
  donutInnerWrap: ViewStyle;
  donutSubText: TextStyle;

  sectionWrap: ViewStyle;
  sectionTitle: TextStyle;
  sectionOuter: ViewStyle;
  sectionGlass: ViewStyle;

  loadingRow: ViewStyle;
  loadingText: TextStyle;
  emptyText: TextStyle;

  photoCard: ViewStyle;
  photoImg: ImageStyle;

  calendarTop: ViewStyle;
  calendarMonth: TextStyle;
  calendarHint: TextStyle;
  weekRow: ViewStyle;
  weekDay: TextStyle;
  grid: ViewStyle;
  cell: ViewStyle;
  cellToday: ViewStyle;
  cellText: TextStyle;
  cellTextToday: TextStyle;
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

  hero: { marginTop: 8, marginBottom: 8 },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
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

  progressCardOuter: {
    marginTop: 14,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
  },
  progressCard: {
    borderRadius: 28,
    padding: 18,
    backgroundColor: 'rgba(255,255,255,0.026)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  progressTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  progressRow: { paddingVertical: 10 },
  progressLabel: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  progressValue: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  progressBig: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    textShadowColor: 'rgba(37,240,200,0.16)',
    textShadowRadius: 14,
  },
  sep: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },

  donutSlide: {
    borderRadius: 24,
    overflow: 'visible',
  },
  donutGlowWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 18,
    bottom: 18,
    borderRadius: 999,
    shadowColor: NEON,
    shadowOpacity: 0.20,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  donutInnerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  donutSubText: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.46)',
    fontSize: 12.5,
    fontWeight: '700',
  },

  sectionWrap: { marginTop: 18 },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
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

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  loadingText: { color: 'rgba(255,255,255,0.55)', fontSize: 13.5, fontWeight: '700' },
  emptyText: { color: 'rgba(255,255,255,0.48)', fontSize: 14.5, lineHeight: 20 },

  photoCard: {
    width: Math.min(280, Math.round(W * 0.70)),
    height: 170,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  photoImg: { width: '100%', height: '100%' },

  calendarTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  calendarMonth: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  calendarHint: { color: 'rgba(255,255,255,0.45)', fontSize: 12.5, fontWeight: '700' },

  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
  weekDay: { width: (W - 18 * 2 - 16 * 2) / 7, textAlign: 'center', color: 'rgba(255,255,255,0.40)', fontWeight: '800', fontSize: 12 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 6 },
  cell: {
    width: (W - 18 * 2 - 16 * 2 - 8 * 6) / 7,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cellToday: {
    backgroundColor: 'rgba(25,112,92,0.12)',
    borderColor: 'rgba(37,240,200,0.22)',
    shadowColor: NEON,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  cellText: { color: 'rgba(255,255,255,0.70)', fontWeight: '800', fontSize: 12.5 },
  cellTextToday: { color: '#E9FFF7' },
});
