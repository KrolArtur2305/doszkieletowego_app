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
  Modal,
  TextInput,
  Platform,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useFocusEffect, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../../../lib/supabase';
import { FuturisticDonutSvg } from '../../../../components/FuturisticDonutSvg';

const { width: W } = Dimensions.get('window');

const ACCENT = '#19705C';
const NEON = '#25F0C8';
const BG = 'transparent';

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

type EtapRow = {
  id: string;
  user_id: string;
  nazwa: string;
  kolejnosc: number | null;
  status: string | null;
};

const STATUS_DONE = 'zrealizowany';

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
  while (cells.length < 42) cells.push({});
  return cells;
}

// ===== TASKS (CALENDAR) =====
// U CIEBIE ISTNIEJE public.zadania: id, user_id, data(date), nazwa(text), opis(text), utworzone_at(timestamptz), godzina(time|null)
const TASKS_TABLE = 'zadania';

type TaskRow = {
  id: string;
  user_id: string | null;
  data: string; // YYYY-MM-DD
  godzina: string | null; // HH:MM:SS (time)
  nazwa: string; // title
  opis: string | null;
  utworzone_at?: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function prettyTime(t?: string | null) {
  if (!t) return '';
  // t może być "HH:MM:SS" albo "HH:MM"
  return t.slice(0, 5);
}

function sortByDateTime(a: TaskRow, b: TaskRow) {
  const ta = `${a.data ?? '9999-12-31'} ${a.godzina ?? '99:99:99'}`;
  const tb = `${b.data ?? '9999-12-31'} ${b.godzina ?? '99:99:99'}`;
  return ta.localeCompare(tb);
}

function roundTo5Min(d: Date) {
  const x = new Date(d);
  const m = x.getMinutes();
  const rounded = Math.round(m / 5) * 5;
  x.setMinutes(rounded);
  x.setSeconds(0);
  x.setMilliseconds(0);
  return x;
}

function toTimeHHMMSS(d: Date) {
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${hh}:${mm}:00`;
}

function formatPLDateShort(d: Date) {
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function DashboardScreen() {
  useMemo(() => supabase, []);
  const router = useRouter();

  // ===== HERO =====
  const [imie, setImie] = useState<string>('');
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleY = useRef(new Animated.Value(8)).current;

  // animacja blasku na "Witaj"
  const heroGlow = useRef(new Animated.Value(0)).current;

  // ===== DONUT CAROUSEL =====
  const CARD_W = Math.min(320, Math.round(W * 0.82));
  const GAP = 14;
  const SNAP = CARD_W + GAP;
  const SIDE = Math.max(0, Math.round((W - CARD_W) / 2));

  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);

  const listRef = useRef<FlatList<any> | null>(null);

  // ===== STATUS =====
  const onPressPostepy = () => router.push('/(app)/(tabs)/postepy');
  const onPressZdjecia = () => router.push('/(app)/(tabs)/zdjecia');

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

  // ===== POSTĘPY (NOWE) =====
  const [progressLoading, setProgressLoading] = useState(true);
  const [obecnyEtap, setObecnyEtap] = useState<string>('—');
  const [kolejnyEtap, setKolejnyEtap] = useState<string>('—');
  const [milestonesText, setMilestonesText] = useState<string>('—');
  const [progressValue, setProgressValue] = useState<number>(0); // 0..1

  const isDone = (status: string | null) => (status ?? '').toLowerCase().trim() === STATUS_DONE;

  // Donuty – postęp podpinamy dynamicznie
  const donutData: DonutItem[] = useMemo(
    () => [
      {
        key: 'budzet',
        value: clamp01(budgetUtil),
        label: 'Budżet',
        onPress: () => router.push('/(app)/(tabs)/budzet'),
      },
      { key: 'czas', value: clamp01(timeUtil), label: 'Czas' },
      { key: 'postep', value: clamp01(progressValue), label: 'Postęp', onPress: onPressPostepy },
    ],
    [budgetUtil, timeUtil, progressValue, router]
  );

  // ===== PROSTA ANIMACJA WEJŚCIA (bez pętli) =====
  const listReadyRef = useRef(false);
  const spinRunningRef = useRef(false);
  const spinRanForFocusRef = useRef(false);

  const runSimpleSpin = () => {
    if (!listReadyRef.current) return;
    if (spinRunningRef.current) return;
    if (spinRanForFocusRef.current) return;

    spinRunningRef.current = true;
    spinRanForFocusRef.current = true;

    // start na 0
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    setActiveIndex(0);

    // 3 kroki w prawo: 0->1->2 (i zostaje)
    const step1 = SNAP * 1;
    const step2 = SNAP * 2;

    const t1 = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: step1, animated: true });
    }, 220);

    const t2 = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: step2, animated: true });
    }, 820);

    const t3 = setTimeout(() => {
      setActiveIndex(2);
      spinRunningRef.current = false;
    }, 1400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      spinRunningRef.current = false;
    };
  };

  useFocusEffect(
    React.useCallback(() => {
      spinRanForFocusRef.current = false;

      const t = setTimeout(() => {
        if (listReadyRef.current) runSimpleSpin();
      }, 260);

      return () => {
        clearTimeout(t);
        spinRunningRef.current = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [SNAP])
  );

  // ===== PHOTOS =====
  const [photosLoading, setPhotosLoading] = useState(true);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photosError, setPhotosError] = useState<string>('');

  // ===== CALENDAR + TASKS =====
  const [calBase, setCalBase] = useState(() => new Date());
  const [selectedYMD, setSelectedYMD] = useState(() => toYMD(new Date()));

  const calCells = useMemo(() => buildMonthGrid(calBase), [calBase]);
  const monthLabel = useMemo(() => calBase.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' }), [calBase]);

  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string>('');
  const [monthTasks, setMonthTasks] = useState<TaskRow[]>([]);
  const [nearestTasks, setNearestTasks] = useState<TaskRow[]>([]);

  const tasksByYMD = useMemo(() => {
    const m = new Map<string, TaskRow[]>();
    for (const t of monthTasks) {
      const ymd = t.data;
      if (!ymd) continue;
      const arr = m.get(ymd) ?? [];
      arr.push(t);
      m.set(ymd, arr);
    }
    for (const [k, arr] of m.entries()) {
      arr.sort(sortByDateTime);
      m.set(k, arr);
    }
    return m;
  }, [monthTasks]);

  const daysWithTasks = useMemo(() => {
    const s = new Set<number>();
    for (const t of monthTasks) {
      const d = new Date(t.data);
      if (d.getFullYear() === calBase.getFullYear() && d.getMonth() === calBase.getMonth()) {
        s.add(d.getDate());
      }
    }
    return s;
  }, [monthTasks, calBase]);

  const selectedTasks = useMemo(() => {
    return tasksByYMD.get(selectedYMD) ?? [];
  }, [tasksByYMD, selectedYMD]);

  const loadTasksForMonth = async () => {
    try {
      setTasksError('');
      setTasksLoading(true);

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData.user;
      if (!user) {
        setMonthTasks([]);
        setNearestTasks([]);
        return;
      }

      const from = toYMD(startOfMonth(calBase));
      const to = toYMD(endOfMonth(calBase));

      const monthRes = await supabase
        .from(TASKS_TABLE)
        .select('id,user_id,data,godzina,nazwa,opis,utworzone_at')
        .eq('user_id', user.id)
        .gte('data', from)
        .lte('data', to);

      if (monthRes.error) throw monthRes.error;

      // Najbliższe 3: od dziś w górę (sortujemy po stronie klienta, bo godzina może być null)
      const nowYMD = toYMD(new Date());
      const nearestRes = await supabase
        .from(TASKS_TABLE)
        .select('id,user_id,data,godzina,nazwa,opis,utworzone_at')
        .eq('user_id', user.id)
        .gte('data', nowYMD)
        .limit(25);

      if (nearestRes.error) throw nearestRes.error;

      const monthList = (monthRes.data ?? []) as any as TaskRow[];
      const nearestList = (nearestRes.data ?? []) as any as TaskRow[];

      monthList.sort(sortByDateTime);
      nearestList.sort(sortByDateTime);

      setMonthTasks(monthList);
      setNearestTasks(nearestList.slice(0, 3));
    } catch (e: any) {
      setMonthTasks([]);
      setNearestTasks([]);
      setTasksError(e?.message ?? 'Nie udało się pobrać zadań.');
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    loadTasksForMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calBase]);

  // gdy zmieniasz miesiąc, ustaw selectedYMD na 1 dzień miesiąca (żeby nie “uciekł”)
  useEffect(() => {
    const ymd = toYMD(new Date(calBase.getFullYear(), calBase.getMonth(), 1));
    setSelectedYMD(ymd);
  }, [calBase]);

  const goPrevMonth = () => setCalBase((d) => addMonths(d, -1));
  const goNextMonth = () => setCalBase((d) => addMonths(d, +1));

  const onPressDay = (day: number) => {
    const ymd = toYMD(new Date(calBase.getFullYear(), calBase.getMonth(), day));
    setSelectedYMD(ymd);
  };

  // ===== ADD TASK MODAL (PICKERS) =====
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [hasTime, setHasTime] = useState(false);
  const [pickDate, setPickDate] = useState<Date>(() => new Date());
  const [pickTime, setPickTime] = useState<Date>(() => roundTo5Min(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const openAddTask = () => {
    setNewTitle('');
    setNewDesc('');
    setHasTime(false);

    const base = new Date(selectedYMD + 'T00:00:00');
    // jeśli selectedYMD jest pusty/niepoprawny, fallback
    const d = isNaN(base.getTime()) ? new Date() : base;
    setPickDate(d);

    setPickTime(roundTo5Min(new Date()));
    setShowDatePicker(false);
    setShowTimePicker(false);
    setTaskModalOpen(true);
  };

  const onChangeDate = (_: any, d?: Date) => {
    if (Platform.OS !== 'ios') setShowDatePicker(false);
    if (!d) return;
    setPickDate(d);

    // Synchronizuj selectedYMD od razu (premium UX)
    const ymd = toYMD(d);
    setSelectedYMD(ymd);
  };

  const onChangeTime = (_: any, d?: Date) => {
    if (Platform.OS !== 'ios') setShowTimePicker(false);
    if (!d) return;
    setPickTime(d);
    setHasTime(true);
  };

  const addTask = async () => {
    const title = newTitle.trim();
    if (!title) return;

    try {
      // ważne: user_id ustawiany triggerem set_user_id_default()
      const payload: any = {
        nazwa: title,
        opis: newDesc.trim() ? newDesc.trim() : null,
        data: selectedYMD,
        godzina: hasTime ? toTimeHHMMSS(pickTime) : null,
      };

      const ins = await supabase.from(TASKS_TABLE).insert(payload);
      if (ins.error) throw ins.error;

      setTaskModalOpen(false);
      await loadTasksForMonth();
    } catch (e) {
      // MVP: bez dodatkowych Alertów
      setTaskModalOpen(false);
    }
  };

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
        Animated.parallel([
          Animated.timing(subtitleOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
          Animated.timing(subtitleY, { toValue: 0, duration: 420, useNativeDriver: true }),
        ]).start();

        // glow loop na "Witaj"
        heroGlow.setValue(0);
        Animated.loop(
          Animated.sequence([
            Animated.timing(heroGlow, { toValue: 1, duration: 1100, useNativeDriver: true }),
            Animated.timing(heroGlow, { toValue: 0, duration: 1100, useNativeDriver: true }),
          ])
        ).start();
      }
    })();

    return () => {
      alive = false;
    };
  }, [subtitleOpacity, subtitleY, heroGlow]);

  // ===== LOAD: STATUS (budżet+czas) =====
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

        const expRes = await supabase.from('wydatki').select('kwota, status').eq('user_id', user.id).order('created_at', { ascending: false });

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

  // ===== LOAD: POSTĘPY (NOWE) =====
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setProgressLoading(true);

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const user = userData.user;
        if (!user) {
          if (!alive) return;
          setObecnyEtap('—');
          setKolejnyEtap('—');
          setMilestonesText('—');
          setProgressValue(0);
          return;
        }

        const res = await supabase.from('etapy').select('id,user_id,nazwa,kolejnosc,status').eq('user_id', user.id).order('kolejnosc', { ascending: true });

        if (res.error) throw res.error;

        const rows = (res.data ?? []) as EtapRow[];
        const sorted = [...rows].sort((a, b) => (a.kolejnosc ?? 9999) - (b.kolejnosc ?? 9999));

        const total = sorted.length;
        const doneCount = sorted.filter((e) => isDone(e.status)).length;

        const currentIndex = sorted.findIndex((e) => !isDone(e.status));
        const current = currentIndex >= 0 ? sorted[currentIndex] : null;
        const next = currentIndex >= 0 ? sorted[currentIndex + 1] ?? null : null;

        if (!alive) return;

        setObecnyEtap(current?.nazwa ?? (total > 0 ? 'Wszystkie etapy zrealizowane' : 'Brak etapów'));
        setKolejnyEtap(next?.nazwa ?? '—');
        setMilestonesText(total > 0 ? `${doneCount} / ${total}` : '—');
        setProgressValue(total > 0 ? clamp01(doneCount / total) : 0);
      } catch {
        if (!alive) return;
        setObecnyEtap('—');
        setKolejnyEtap('—');
        setMilestonesText('—');
        setProgressValue(0);
      } finally {
        if (alive) setProgressLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // ===== LOAD: PHOTOS =====
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

        const { data: etapList, error: etapErr } = await supabase.storage.from(PHOTOS_BUCKET).list(user.id, { limit: 100 });
        if (etapErr) throw etapErr;

        const etapFolders = (etapList ?? []).map((x) => x.name).filter((name) => !!name && !name.includes('.'));

        const allFiles: Array<{ path: string; name: string; created_at?: string; id?: string }> = [];

        for (const etap of etapFolders) {
          const prefix = `${user.id}/${etap}`;
          const { data: files } = await supabase.storage.from(PHOTOS_BUCKET).list(prefix, { limit: 40, sortBy: { column: 'created_at', order: 'desc' } });

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
          const { data: signed } = await supabase.storage.from(PHOTOS_BUCKET).createSignedUrl(f.path, 60 * 30);
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
    return `Dziś jest ${formatPLDateLong(d)}, jesteś już w połowie budowy — przeprowadzka coraz bliżej.`;
  }, []);

  const handleMomentumEnd = (e: any) => {
    const x = e?.nativeEvent?.contentOffset?.x ?? 0;
    const idx = Math.round(x / SNAP);
    setActiveIndex(Math.max(0, Math.min(donutData.length - 1, idx)));
  };

  const getItemLayout = (_: any, index: number) => ({
    length: SNAP,
    offset: SNAP * index,
    index,
  });

  // animacja scan/glow na module etapów
  const scanX = useRef(new Animated.Value(-60)).current;
  useEffect(() => {
    scanX.setValue(-60);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanX, { toValue: W + 60, duration: 2400, useNativeDriver: true }),
        Animated.timing(scanX, { toValue: -60, duration: 10, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scanX]);

  const glowOpacity = heroGlow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.55] });
  const glowScale = heroGlow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] });

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.logoRow}>
          <Image source={require('../../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTitleWrap}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.heroTitleGlow,
                {
                  opacity: glowOpacity,
                  transform: [{ scale: glowScale }],
                },
              ]}
            />
            <Text style={styles.heroTitle}>Witaj {imie ? imie : ''}</Text>
          </View>

          <Animated.View style={{ opacity: subtitleOpacity, transform: [{ translateY: subtitleY }] }}>
            <Text style={styles.heroSubtitle}>{heroDateLine}</Text>
          </Animated.View>
        </View>

        {/* ZMIANA: moduł etapów bez nagłówka i bez "kroki milowe" */}
        <View style={styles.progressCardOuter}>
          <BlurView intensity={18} tint="dark" style={styles.progressCard}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.progressScan,
                {
                  transform: [{ translateX: scanX }, { rotate: '-12deg' }],
                },
              ]}
            />

            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>OBECNY ETAP</Text>
              {progressLoading ? <Text style={styles.progressValue}>Ładowanie…</Text> : <Text style={styles.progressValue}>{obecnyEtap}</Text>}
            </View>

            <View style={styles.sep} />

            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>KOLEJNY ETAP</Text>
              {progressLoading ? <Text style={styles.progressValue}>Ładowanie…</Text> : <Text style={styles.progressValue}>{kolejnyEtap}</Text>}
            </View>

            <TouchableOpacity activeOpacity={0.88} onPress={onPressPostepy} style={styles.centerBtnWrap}>
              <View style={styles.centerBtn}>
                <Text style={styles.centerBtnText}>Sprawdź więcej</Text>
              </View>
            </TouchableOpacity>
          </BlurView>
        </View>

        <View style={{ marginTop: 16 }}>
          <Animated.FlatList
            ref={(r) => (listRef.current = r as any)}
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
            scrollEventThrottle={16}
            getItemLayout={getItemLayout}
            removeClippedSubviews
            windowSize={3}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            updateCellsBatchingPeriod={50}
            onContentSizeChange={() => {
              listReadyRef.current = true;
              setTimeout(() => runSimpleSpin(), 120);
            }}
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

              const isActiveSlide = index === activeIndex;

              return (
                <Animated.View style={[styles.donutSlide, { width: CARD_W, opacity, transform: [{ scale }] }]}>
                  <Animated.View pointerEvents="none" style={[styles.donutGlowWrap, { opacity: glow }]} />

                  <View style={styles.donutInnerWrap}>
                    <FuturisticDonutSvg value={item.value} label={item.label} onPressLabel={item.onPress} isActive={isActiveSlide} size={210} stroke={16} />

                    {item.key === 'budzet' && <Text style={styles.donutSubText}>{statusLoading ? '—' : `${formatPLN(spentTotal)} / ${formatPLN(plannedBudget)}`}</Text>}

                    {item.key === 'czas' && (
                      <Text style={styles.donutSubText}>
                        {dates.start && dates.end ? `${new Date(dates.start).toLocaleDateString('pl-PL')} → ${new Date(dates.end).toLocaleDateString('pl-PL')}` : 'Uzupełnij daty inwestycji'}
                      </Text>
                    )}

                    {item.key === 'postep' && (
                      <Text style={styles.donutSubText}>
                        {progressLoading ? 'Ładowanie postępu…' : milestonesText !== '—' ? `Zrealizowane: ${milestonesText}` : 'Brak etapów'}
                      </Text>
                    )}
                  </View>
                </Animated.View>
              );
            }}
          />
        </View>

        <View style={styles.sectionWrap}>
          {/* ZMIANA: wyśrodkowany + zielony */}
          <Text style={styles.sectionTitleCenterNeon}>Ostatnio dodane zdjęcia</Text>

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

              {/* ZMIANA: button pod zdjęciami */}
              <TouchableOpacity activeOpacity={0.88} onPress={onPressZdjecia} style={styles.centerBtnWrap}>
                <View style={styles.centerBtn}>
                  <Text style={styles.centerBtnText}>Sprawdź więcej</Text>
                </View>
              </TouchableOpacity>
            </BlurView>
          </View>
        </View>

        {/* ===================== KALENDARZ (POPRAWIONY) ===================== */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionTitleCenterNeon}>Kalendarz</Text>

          <View style={styles.sectionOuter}>
            <BlurView intensity={16} tint="dark" style={styles.sectionGlass}>
              {/* top bar: miesiąc + nawigacja */}
              <View style={styles.calendarTop}>
                <TouchableOpacity activeOpacity={0.85} onPress={goPrevMonth} style={styles.calNavBtn}>
                  <Text style={styles.calNavTxt}>‹</Text>
                </TouchableOpacity>

                <View style={{ alignItems: 'center', gap: 2 }}>
                  <Text style={styles.calendarMonth}>{monthLabel}</Text>
                  <Text style={styles.calendarHint}>
                    {tasksLoading ? 'Ładowanie zadań…' : tasksError ? 'Błąd pobierania zadań' : 'Kliknij dzień, aby zobaczyć zadania'}
                  </Text>
                </View>

                <TouchableOpacity activeOpacity={0.85} onPress={goNextMonth} style={styles.calNavBtn}>
                  <Text style={styles.calNavTxt}>›</Text>
                </TouchableOpacity>
              </View>

              {/* nearest 3 */}
              <View style={styles.nearestWrap}>
                <View style={styles.nearestHeader}>
                  <Text style={styles.nearestTitle}>Najbliższe zadania</Text>
                  <TouchableOpacity activeOpacity={0.9} onPress={openAddTask} style={styles.addTaskBtn}>
                    <Text style={styles.addTaskBtnText}>+ Dodaj</Text>
                  </TouchableOpacity>
                </View>

                {tasksLoading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator />
                    <Text style={styles.loadingText}>Ładowanie…</Text>
                  </View>
                ) : nearestTasks.length === 0 ? (
                  <Text style={styles.emptyText}>Brak zadań — dodaj pierwsze.</Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    {nearestTasks.slice(0, 3).map((t) => (
                      <View key={t.id} style={styles.taskRow}>
                        <View style={styles.taskDot} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.taskTitle} numberOfLines={1}>
                            {t.nazwa}
                          </Text>
                          <Text style={styles.taskMeta}>
                            {t.data ?? '—'}
                            {t.godzina ? ` • ${prettyTime(t.godzina)}` : ' • całodniowe'}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.weekRow}>
                {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map((d) => (
                  <Text key={d} style={styles.weekDay}>
                    {d}
                  </Text>
                ))}
              </View>

              <View style={styles.grid}>
                {calCells.map((c, idx) => {
                  const hasDay = !!c.day;
                  const hasTasks = hasDay ? daysWithTasks.has(c.day as number) : false;
                  const isSelected = hasDay && selectedYMD === toYMD(new Date(calBase.getFullYear(), calBase.getMonth(), c.day as number));

                  return (
                    <TouchableOpacity
                      key={idx}
                      activeOpacity={hasDay ? 0.85 : 1}
                      disabled={!hasDay}
                      onPress={() => hasDay && onPressDay(c.day as number)}
                      style={[
                        styles.cell,
                        c.isToday && styles.cellToday,
                        hasTasks && styles.cellHasTask,
                        isSelected && styles.cellSelected,
                      ]}
                    >
                      <Text style={[styles.cellText, c.isToday && styles.cellTextToday, isSelected && styles.cellTextSelected]}>{c.day ? String(c.day) : ''}</Text>
                      {hasTasks ? <View pointerEvents="none" style={styles.cellDot} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* lista zadań wybranego dnia */}
              <View style={styles.dayTasksWrap}>
                <View style={styles.dayTasksHeader}>
                  <Text style={styles.dayTasksTitle}>Zadania: {selectedYMD}</Text>
                  <TouchableOpacity activeOpacity={0.9} onPress={openAddTask} style={styles.addTaskMiniBtn}>
                    <Text style={styles.addTaskMiniBtnText}>Dodaj</Text>
                  </TouchableOpacity>
                </View>

                {selectedTasks.length === 0 ? (
                  <Text style={styles.emptyText}>Brak zadań na ten dzień.</Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    {selectedTasks.map((t) => (
                      <View key={t.id} style={styles.taskRow}>
                        <View style={styles.taskDot} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.taskTitle} numberOfLines={2}>
                            {t.nazwa}
                          </Text>
                          <Text style={styles.taskMeta}>
                            {t.godzina ? `${prettyTime(t.godzina)} • ` : 'całodniowe • '}
                            {t.opis ? t.opis : '—'}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </BlurView>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* MODAL: DODAJ ZADANIE (PICKERS) */}
      <Modal visible={taskModalOpen} transparent animationType="fade" onRequestClose={() => setTaskModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Dodaj zadanie</Text>
            <Text style={styles.modalSubtitle}>Wybrana data: {selectedYMD}</Text>

            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Tytuł (np. Montaż okien)"
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={styles.modalInput}
              maxLength={80}
            />

            <TextInput
              value={newDesc}
              onChangeText={setNewDesc}
              placeholder="Opis (opcjonalnie)"
              placeholderTextColor="rgba(255,255,255,0.35)"
              style={styles.modalInput}
              maxLength={120}
            />

            {/* Pickers row */}
            <View style={styles.pickerRow}>
              <TouchableOpacity activeOpacity={0.9} onPress={() => setShowDatePicker(true)} style={styles.pickerBtn}>
                <Text style={styles.pickerBtnLabel}>Data</Text>
                <Text style={styles.pickerBtnValue}>{formatPLDateShort(pickDate)}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  setHasTime(true);
                  setShowTimePicker(true);
                }}
                style={[styles.pickerBtn, hasTime ? styles.pickerBtnActive : null]}
              >
                <Text style={styles.pickerBtnLabel}>Godzina</Text>
                <Text style={styles.pickerBtnValue}>{hasTime ? prettyTime(toTimeHHMMSS(pickTime)) : 'całodniowe'}</Text>
              </TouchableOpacity>
            </View>

            {hasTime ? (
              <TouchableOpacity activeOpacity={0.9} onPress={() => setHasTime(false)} style={styles.removeTimeBtn}>
                <Text style={styles.removeTimeTxt}>Usuń godzinę (ustaw całodniowe)</Text>
              </TouchableOpacity>
            ) : null}

            {/* DateTimePicker mounts */}
            {showDatePicker ? (
              <DateTimePicker
                value={pickDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={onChangeDate}
              />
            ) : null}

            {showTimePicker ? (
              <DateTimePicker
                value={pickTime}
                mode="time"
                is24Hour
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onChangeTime}
              />
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity activeOpacity={0.9} onPress={() => setTaskModalOpen(false)} style={styles.modalBtnGhost}>
                <Text style={styles.modalBtnGhostTxt}>Anuluj</Text>
              </TouchableOpacity>

              <TouchableOpacity activeOpacity={0.9} onPress={addTask} style={styles.modalBtnPrimary}>
                <Text style={styles.modalBtnPrimaryTxt}>Zapisz</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalHint}>Wybierz datę i opcjonalnie godzinę z pickerów. Jeśli nie ustawisz godziny — zadanie jest całodniowe.</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

type Styles = {
  screen: ViewStyle;

  content: ViewStyle;

  logoRow: ViewStyle;
  logo: ImageStyle;

  hero: ViewStyle;
  heroTitleWrap: ViewStyle;
  heroTitleGlow: ViewStyle;
  heroTitle: TextStyle;
  heroSubtitle: TextStyle;

  progressCardOuter: ViewStyle;
  progressCard: ViewStyle;
  progressScan: ViewStyle;
  progressRow: ViewStyle;
  progressLabel: TextStyle;
  progressValue: TextStyle;
  sep: ViewStyle;

  centerBtnWrap: ViewStyle;
  centerBtn: ViewStyle;
  centerBtnText: TextStyle;

  donutSlide: ViewStyle;
  donutGlowWrap: ViewStyle;
  donutInnerWrap: ViewStyle;
  donutSubText: TextStyle;

  sectionWrap: ViewStyle;
  sectionTitle: TextStyle;
  sectionTitleCenterNeon: TextStyle;
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
  calNavBtn: ViewStyle;
  calNavTxt: TextStyle;

  weekRow: ViewStyle;
  weekDay: TextStyle;
  grid: ViewStyle;
  cell: ViewStyle;
  cellToday: ViewStyle;
  cellHasTask: ViewStyle;
  cellSelected: ViewStyle;
  cellDot: ViewStyle;
  cellText: TextStyle;
  cellTextToday: TextStyle;
  cellTextSelected: TextStyle;

  nearestWrap: ViewStyle;
  nearestHeader: ViewStyle;
  nearestTitle: TextStyle;
  addTaskBtn: ViewStyle;
  addTaskBtnText: TextStyle;

  taskRow: ViewStyle;
  taskDot: ViewStyle;
  taskTitle: TextStyle;
  taskMeta: TextStyle;

  dayTasksWrap: ViewStyle;
  dayTasksHeader: ViewStyle;
  dayTasksTitle: TextStyle;
  addTaskMiniBtn: ViewStyle;
  addTaskMiniBtnText: TextStyle;

  modalBackdrop: ViewStyle;
  modalCard: ViewStyle;
  modalTitle: TextStyle;
  modalSubtitle: TextStyle;
  modalInput: ViewStyle;
  modalActions: ViewStyle;
  modalBtnGhost: ViewStyle;
  modalBtnGhostTxt: TextStyle;
  modalBtnPrimary: ViewStyle;
  modalBtnPrimaryTxt: TextStyle;
  modalHint: TextStyle;

  pickerRow: ViewStyle;
  pickerBtn: ViewStyle;
  pickerBtnActive: ViewStyle;
  pickerBtnLabel: TextStyle;
  pickerBtnValue: TextStyle;
  removeTimeBtn: ViewStyle;
  removeTimeTxt: TextStyle;
};

const styles = StyleSheet.create<Styles>({
  screen: { flex: 1, backgroundColor: BG },

  content: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 140 },

  // ZMIANA: większe logo
  logoRow: { alignItems: 'center', marginTop: 6, marginBottom: 10 },
  logo: { width: 176, height: 54, opacity: 0.98 },

  hero: { marginTop: 8, marginBottom: 8 },

  // ZMIANA: glow pod "Witaj"
  heroTitleWrap: { position: 'relative', alignSelf: 'flex-start' },
  heroTitleGlow: {
    position: 'absolute',
    left: -12,
    right: -12,
    top: 10,
    height: 26,
    borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.22)',
    shadowColor: NEON,
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },

  heroTitle: {
    color: ACCENT,
    fontSize: 34,
    fontWeight: '900',
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
    borderColor: 'rgba(37,240,200,0.12)',
  },

  // ZMIANA: animowany scan/glow
  progressScan: {
    position: 'absolute',
    top: -40,
    width: 120,
    height: 120,
    borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)',
    shadowColor: NEON,
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
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
  sep: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },

  // ZMIANA: button center
  centerBtnWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  centerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.32)',
    shadowColor: NEON,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  centerBtnText: {
    color: NEON,
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(37,240,200,0.22)',
    textShadowRadius: 10,
  },

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
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  donutInnerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
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

  // ZMIANA: wyśrodkowany + zielony tytuł sekcji
  sectionTitleCenterNeon: {
    textAlign: 'center',
    color: NEON,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.2,
    marginBottom: 12,
    paddingHorizontal: 2,
    textShadowColor: 'rgba(37,240,200,0.18)',
    textShadowRadius: 16,
  },

  sectionOuter: {
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
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
    width: Math.min(280, Math.round(W * 0.7)),
    height: 170,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  photoImg: { width: '100%', height: '100%' },

  // ===== Calendar styles (premium light) =====
  calendarTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  calendarMonth: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', textTransform: 'capitalize' },
  calendarHint: { color: 'rgba(255,255,255,0.45)', fontSize: 12.5, fontWeight: '700' },

  calNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  calNavTxt: { color: NEON, fontSize: 20, fontWeight: '900', marginTop: -2 },

  nearestWrap: {
    marginTop: 6,
    marginBottom: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.10)',
  },
  nearestHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  nearestTitle: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900', letterSpacing: 0.2 },
  addTaskBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.30)',
  },
  addTaskBtnText: { color: NEON, fontSize: 12, fontWeight: '900' },

  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
  weekDay: {
    width: (W - 18 * 2 - 16 * 2) / 7,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '800',
    fontSize: 12,
  },

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
    position: 'relative',
  },
  cellToday: {
    backgroundColor: 'rgba(25,112,92,0.12)',
    borderColor: 'rgba(37,240,200,0.22)',
    shadowColor: NEON,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  cellHasTask: {
    borderColor: 'rgba(37,240,200,0.28)',
    shadowColor: NEON,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  cellSelected: {
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderColor: 'rgba(37,240,200,0.45)',
    shadowColor: NEON,
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  cellDot: {
    position: 'absolute',
    bottom: 5,
    width: 6,
    height: 6,
    borderRadius: 99,
    backgroundColor: NEON,
    opacity: 0.95,
  },

  cellText: { color: 'rgba(255,255,255,0.70)', fontWeight: '800', fontSize: 12.5 },
  cellTextToday: { color: '#E9FFF7' },
  cellTextSelected: { color: '#E9FFF7' },

  dayTasksWrap: {
    marginTop: 14,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  dayTasksHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  dayTasksTitle: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
  addTaskMiniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.25)',
  },
  addTaskMiniBtnText: { color: NEON, fontSize: 11.5, fontWeight: '900' },

  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  taskDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: NEON,
    marginTop: 5,
    shadowColor: NEON,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  taskTitle: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
  taskMeta: { marginTop: 3, color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '700' },

  // ===== Modal =====
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    borderRadius: 24,
    padding: 16,
    backgroundColor: 'rgba(12,12,12,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
  },
  modalTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  modalSubtitle: { marginTop: 4, color: 'rgba(255,255,255,0.55)', fontSize: 12.5, fontWeight: '700' },
  modalInput: {
    marginTop: 12,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#FFFFFF',
    fontWeight: '800',
  } as any,

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalBtnGhost: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 18,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalBtnGhostTxt: { color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontWeight: '900' },
  modalBtnPrimary: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 18,
    alignItems: 'center',
    backgroundColor: 'rgba(37,240,200,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.38)',
  },
  modalBtnPrimaryTxt: { color: NEON, fontSize: 12.5, fontWeight: '900' },
  modalHint: { marginTop: 10, color: 'rgba(255,255,255,0.35)', fontSize: 11.5, fontWeight: '700', lineHeight: 16 },

  // ===== Picker UI in modal =====
  pickerRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pickerBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pickerBtnActive: {
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderColor: 'rgba(37,240,200,0.35)',
  },
  pickerBtnLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11.5, fontWeight: '900' },
  pickerBtnValue: { marginTop: 4, color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },

  removeTimeBtn: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  removeTimeTxt: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '900' },
});
