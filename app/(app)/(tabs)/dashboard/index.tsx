import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../../../lib/supabase';
import { FuturisticDonutSvg } from '../../../../components/FuturisticDonutSvg';
import { useTranslation } from 'react-i18next';
import { AppButton, AppCard, AppInput, AppScreen, SectionHeader } from '../../../../src/ui/components';
import { colors } from '../../../../src/ui/theme';

const { width: W } = Dimensions.get('window');

const ACCENT = colors.accent;
const NEON = colors.accentBright;
const BG = 'transparent';
const PHOTOS_BUCKET = 'zdjecia';

// ─── Types ────────────────────────────────────────────────────────────────────

type PhotoItem = {
  key: string;
  url: string;
  name: string;
  created_at?: string;
};

type DonutItem = {
  key: 'budzet' | 'czas' | 'postep';
  value: number;
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

type ActivityItem = {
  id: string;
  type: 'expense' | 'stage' | 'photo' | 'task';
  label: string;
  meta: string;
  icon: string;
};

type WeatherDay = {
  label: string;
  temp: string;
  icon: string;
};

const STATUS_DONE = 'zrealizowany';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeLocale(lang?: string) {
  if (!lang) return 'pl-PL';
  if (lang.startsWith('pl')) return 'pl-PL';
  if (lang.startsWith('en')) return 'en-US';
  if (lang.startsWith('de')) return 'de-DE';
  return lang;
}

function formatDateLongByLocale(d: Date, locale: string) {
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateDayMonthByLocale(d: Date, locale: string) {
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function safeNumber(v: any) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

const currencyByLocale = (locale: string) => {
  if (locale.startsWith('de')) return 'EUR';
  if (locale.startsWith('en')) return 'USD';
  return 'PLN';
};

const formatCurrency = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyByLocale(locale),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function roundTo5Min(d: Date) {
  const x = new Date(d);
  const m = x.getMinutes();
  x.setMinutes(Math.round(m / 5) * 5);
  x.setSeconds(0);
  x.setMilliseconds(0);
  return x;
}

function toTimeHHMMSS(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
}

function prettyTime(t?: string | null) {
  if (!t) return '';
  return t.slice(0, 5);
}

function formatDateShort(d: Date, locale: string) {
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const TASKS_TABLE = 'zadania';

type TaskRow = {
  id: string;
  user_id: string | null;
  data: string;
  godzina: string | null;
  nazwa: string;
  opis: string | null;
  utworzone_at?: string | null;
};

function sortByDateTime(a: TaskRow, b: TaskRow) {
  const ta = `${a.data ?? '9999-12-31'} ${a.godzina ?? '99:99:99'}`;
  const tb = `${b.data ?? '9999-12-31'} ${b.godzina ?? '99:99:99'}`;
  return ta.localeCompare(tb);
}

// ─── Weather helpers ──────────────────────────────────────────────────────────

function weatherCodeToIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code <= 3) return '☁️';
  if (code <= 57) return '🌧️';
  if (code <= 67) return '🌨️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌧️';
  if (code <= 86) return '❄️';
  return '⛈️';
}

function getWeekdayKey(date: Date) {
  const day = date.getDay();
  if (day === 0) return 'sun';
  if (day === 1) return 'mon';
  if (day === 2) return 'tue';
  if (day === 3) return 'wed';
  if (day === 4) return 'thu';
  if (day === 5) return 'fri';
  return 'sat';
}

// ─── Daily brief generator ────────────────────────────────────────────────────

function buildBrief(
  todayTaskCount: number,
  budgetUtil: number,
  obecnyEtap: string,
  t: (key: string, opts?: any) => string
): string {
  const parts: string[] = [];

  if (todayTaskCount > 0) {
    parts.push(t('brief.tasksToday', { count: todayTaskCount }));
  }

  if (budgetUtil > 0) {
    const pct = Math.round(budgetUtil * 100);
    if (pct >= 90) {
      parts.push(t('brief.budgetCritical', { pct }));
    } else if (pct >= 70) {
      parts.push(t('brief.budgetHigh', { pct }));
    } else {
      parts.push(t('brief.budgetOk', { pct }));
    }
  }

  if (obecnyEtap && obecnyEtap !== '—') {
    parts.push(t('brief.currentStage', { stage: obecnyEtap }));
  }

  if (parts.length === 0) return t('brief.allGood');

  return parts.join(' • ');
}

function pickHeroMessageKey(params: {
  todayTaskCount: number;
  budgetUtil: number;
  progressValue: number;
  timeUtil: number;
}) {
  const { todayTaskCount, budgetUtil, progressValue, timeUtil } = params;

  if (todayTaskCount >= 4) return 'hero.messages.busyDay';
  if (budgetUtil >= 0.9) return 'hero.messages.budgetCritical';
  if (budgetUtil >= 0.7) return 'hero.messages.budgetHigh';
  if (progressValue >= 0.85 || timeUtil >= 0.85) return 'hero.messages.finalStretch';
  if (progressValue >= 0.45 || timeUtil >= 0.45) return 'hero.messages.midBuild';
  if (progressValue > 0.05 || timeUtil > 0.05) return 'hero.messages.earlyBuild';
  if (todayTaskCount > 0) return 'hero.messages.focusDay';
  return 'hero.messages.steadyDay';
}

export default function DashboardScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation('dashboard');
  const appLocale = useMemo(() => normalizeLocale(i18n.resolvedLanguage || i18n.language), [i18n.resolvedLanguage, i18n.language]);

  // ── Hero ──
  const [imie, setImie] = useState<string>('');
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleY = useRef(new Animated.Value(8)).current;
  const heroGlow = useRef(new Animated.Value(0)).current;

  // ── Donut carousel ──
  const CARD_W = Math.min(300, Math.round(W * 0.78));
  const GAP = 14;
  const SNAP = CARD_W + GAP;
  const SIDE = Math.max(0, Math.round((W - CARD_W) / 2));

  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<any> | null>(null);
  const listReadyRef = useRef(false);
  const spinRunningRef = useRef(false);
  const spinRanForFocusRef = useRef(false);

  // ── Status ──
  const [statusLoading, setStatusLoading] = useState(true);
  const [plannedBudget, setPlannedBudget] = useState(0);
  const [spentTotal, setSpentTotal] = useState(0);
  const [dates, setDates] = useState<{ start?: string | null; end?: string | null }>({});

  const budgetUtil = useMemo(
    () => (plannedBudget > 0 ? spentTotal / plannedBudget : 0),
    [plannedBudget, spentTotal]
  );

  const timeUtil = useMemo(() => {
    const start = dates.start ? new Date(dates.start) : null;
    const end = dates.end ? new Date(dates.end) : null;
    if (!start || !end) return 0;
    const now = new Date();
    const total = end.getTime() - start.getTime();
    if (total <= 0) return 0;
    return clamp01((now.getTime() - start.getTime()) / total);
  }, [dates]);

  // ── Progress ──
  const [progressLoading, setProgressLoading] = useState(true);
  const [obecnyEtap, setObecnyEtap] = useState<string>('—');
  const [kolejnyEtap, setKolejnyEtap] = useState<string>('—');
  const [milestonesText, setMilestonesText] = useState<string>('—');
  const [progressValue, setProgressValue] = useState<number>(0);
  const [progressPercent, setProgressPercent] = useState<number>(0);

  const isDone = (status: string | null) =>
    (status ?? '').toLowerCase().trim() === STATUS_DONE;

  const donutData: DonutItem[] = useMemo(
    () => [
      {
        key: 'budzet',
        value: clamp01(budgetUtil),
        label: t('donuts.budgetLabel'),
        onPress: () => router.push('/(app)/(tabs)/budzet'),
      },
      { key: 'czas', value: clamp01(timeUtil), label: t('donuts.timeLabel') },
      {
        key: 'postep',
        value: clamp01(progressValue),
        label: t('donuts.progressLabel'),
        onPress: () => router.push('/(app)/(tabs)/postepy'),
      },
    ],
    [budgetUtil, timeUtil, progressValue, router, t]
  );

  // ── Carousel spin intro ──
  const runSimpleSpin = () => {
    if (!listReadyRef.current || spinRunningRef.current || spinRanForFocusRef.current) return;
    spinRunningRef.current = true;
    spinRanForFocusRef.current = true;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    setActiveIndex(0);
    const t1 = setTimeout(() => listRef.current?.scrollToOffset({ offset: SNAP, animated: true }), 220);
    const t2 = setTimeout(() => listRef.current?.scrollToOffset({ offset: SNAP * 2, animated: true }), 820);
    const t3 = setTimeout(() => { setActiveIndex(2); spinRunningRef.current = false; }, 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); spinRunningRef.current = false; };
  };

  useFocusEffect(
    React.useCallback(() => {
      spinRanForFocusRef.current = false;
      const timer = setTimeout(() => { if (listReadyRef.current) runSimpleSpin(); }, 260);
      return () => { clearTimeout(timer); spinRunningRef.current = false; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [SNAP])
  );

  // ── Photos ──
  const [photosLoading, setPhotosLoading] = useState(true);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  // ── Today tasks ──
  const today = useMemo(() => new Date(), []);
  const [selectedYMD, setSelectedYMD] = useState(() => toYMD(new Date()));

  const [tasksLoading, setTasksLoading] = useState(false);
  const [todayTasks, setTodayTasks] = useState<TaskRow[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<TaskRow[]>([]);

  const todayTaskCount = useMemo(
    () => todayTasks.length,
    [todayTasks]
  );

  const loadTasksOverview = async () => {
    try {
      setTasksLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) { setTodayTasks([]); setUpcomingTasks([]); return; }

      const todayYMD = toYMD(today);
      const { data, error } = await supabase
        .from(TASKS_TABLE)
        .select('id,user_id,data,godzina,nazwa,opis,utworzone_at')
        .eq('user_id', user.id)
        .gte('data', todayYMD)
        .order('data', { ascending: true })
        .order('godzina', { ascending: true, nullsFirst: false })
        .limit(24);

      if (error) throw error;

      const list = [...((data ?? []) as TaskRow[])].sort(sortByDateTime);
      setTodayTasks(list.filter((task) => task.data === todayYMD));
      setUpcomingTasks(list.filter((task) => task.data !== todayYMD).slice(0, 3));
    } catch {
      setTodayTasks([]); setUpcomingTasks([]);
    } finally {
      setTasksLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadTasksOverview();
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Add task modal ──
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [hasTime, setHasTime] = useState(false);
  const [pickDate, setPickDate] = useState<Date>(() => new Date());
  const [pickTime, setPickTime] = useState<Date>(() => roundTo5Min(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const openAddTask = () => {
    setNewTitle(''); setNewDesc(''); setHasTime(false);
    const base = new Date();
    setSelectedYMD(toYMD(base));
    setPickDate(base);
    setPickTime(roundTo5Min(new Date()));
    setShowDatePicker(false); setShowTimePicker(false);
    setTaskModalOpen(true);
  };

  const addTask = async () => {
    const title = newTitle.trim();
    if (!title) return;

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const user = userData?.user;
      if (!user) throw new Error('NO_USER');

      const ins = await supabase.from(TASKS_TABLE).insert({
        user_id: user.id,
        nazwa: title,
        opis: newDesc.trim() || null,
        data: selectedYMD,
        godzina: hasTime ? toTimeHHMMSS(pickTime) : null,
      });

      if (ins.error) throw ins.error;

      setTaskModalOpen(false);
      await loadTasksOverview();
    } catch (e) {
      console.warn('addTask error:', e);
      Alert.alert(t('modal.errorTitle'), t('modal.errorGeneric'));
    }
  };

  // ── Weather (OpenMeteo, no API key needed) ──
  const [weather, setWeather] = useState<WeatherDay[] | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const geoRes = await fetch('https://ipapi.co/json/');
        const geo = await geoRes.json();
        const lat = geo.latitude ?? 52.23;
        const lon = geo.longitude ?? 21.01;

        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`;

        const res = await fetch(url);
        const data = await res.json();
        if (!alive) return;

        const days: WeatherDay[] = data.daily.time.map((dateStr: string, i: number) => {
          const d = new Date(dateStr);
          const weekdayKey = getWeekdayKey(d);

          const label = t(`weather.days.${weekdayKey}`);

          const maxT = Math.round(data.daily.temperature_2m_max[i]);

          return {
            label,
            temp: `${maxT}°`,
            icon: weatherCodeToIcon(data.daily.weathercode[i]),
          };
        });

        setWeather(days);
      } catch {
        if (alive) setWeather(null);
      } finally {
        if (alive) setWeatherLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [appLocale, t]);

  // ── Activity feed ──
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) { setActivity([]); return; }

        const [expRes, stageRes, taskRes] = await Promise.all([
          supabase
            .from('wydatki')
            .select('id,nazwa,kwota,created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(3),
          supabase
            .from('etapy')
            .select('id,nazwa,status,kolejnosc')
            .eq('user_id', user.id)
            .order('kolejnosc', { ascending: false })
            .limit(2),
          supabase
            .from(TASKS_TABLE)
            .select('id,nazwa,data,utworzone_at')
            .eq('user_id', user.id)
            .order('utworzone_at', { ascending: false })
            .limit(2),
        ]);

        if (!alive) return;

        const items: ActivityItem[] = [];

        for (const w of expRes.data ?? []) {
          items.push({
            id: `exp-${w.id}`,
            type: 'expense',
            label: w.nazwa ?? t('activity.expense'),
            meta: formatCurrency(safeNumber(w.kwota), appLocale),
            icon: '💸',
          });
        }

        for (const e of stageRes.data ?? []) {
          if (isDone(e.status)) {
            items.push({
              id: `stage-${e.id}`,
              type: 'stage',
              label: e.nazwa,
              meta: t('activity.stageDone'),
              icon: '✅',
            });
          }
        }

        for (const task of taskRes.data ?? []) {
          items.push({
            id: `task-${task.id}`,
            type: 'task',
            label: task.nazwa,
            meta: task.data ?? '',
            icon: '📌',
          });
        }

        setActivity(items.slice(0, 5));
      } catch {
        setActivity([]);
      } finally {
        if (alive) setActivityLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line

  // ── Load profile + hero anim ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) return;
        const prof = await supabase.from('profiles').select('imie').eq('user_id', user.id).maybeSingle();
        if (!alive) return;
        setImie((prof.data as any)?.imie ?? '');
      } catch { /* ignore */ } finally {
        Animated.parallel([
          Animated.timing(subtitleOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
          Animated.timing(subtitleY, { toValue: 0, duration: 420, useNativeDriver: true }),
        ]).start();
        heroGlow.setValue(0);
        Animated.loop(
          Animated.sequence([
            Animated.timing(heroGlow, { toValue: 1, duration: 1100, useNativeDriver: true }),
            Animated.timing(heroGlow, { toValue: 0, duration: 1100, useNativeDriver: true }),
          ])
        ).start();
      }
    })();
    return () => { alive = false; };
  }, [subtitleOpacity, subtitleY, heroGlow]);

  // ── Load status (budget + time) ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setStatusLoading(true);
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) return;

        const [invRes, expRes] = await Promise.all([
          supabase.from('inwestycje').select('budzet, data_start, data_koniec').eq('user_id', user.id).maybeSingle(),
          supabase.from('wydatki').select('kwota, status').eq('user_id', user.id),
        ]);

        if (!alive) return;

        setPlannedBudget(safeNumber((invRes.data as any)?.budzet));
        setDates({ start: (invRes.data as any)?.data_start, end: (invRes.data as any)?.data_koniec });

        const spent = (expRes.data ?? [])
          .filter((w: any) => String(w.status ?? '').toLowerCase().trim() === 'poniesiony')
          .reduce((a: number, w: any) => a + safeNumber(w.kwota), 0);

        setSpentTotal(spent);
      } catch {
        setPlannedBudget(0); setSpentTotal(0); setDates({});
      } finally {
        if (alive) setStatusLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // ── Load progress ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setProgressLoading(true);
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) return;

        const res = await supabase
          .from('etapy')
          .select('id,user_id,nazwa,kolejnosc,status')
          .eq('user_id', user.id)
          .order('kolejnosc', { ascending: true });

        if (res.error) throw res.error;
        const rows = (res.data ?? []) as EtapRow[];
        const sorted = [...rows].sort((a, b) => (a.kolejnosc ?? 9999) - (b.kolejnosc ?? 9999));

        const total = sorted.length;
        const doneCount = sorted.filter((e) => isDone(e.status)).length;
        const currentIndex = sorted.findIndex((e) => !isDone(e.status));
        const current = currentIndex >= 0 ? sorted[currentIndex] : null;
        const next = currentIndex >= 0 ? sorted[currentIndex + 1] ?? null : null;

        if (!alive) return;

        const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
        setObecnyEtap(current?.nazwa ?? (total > 0 ? t('progress.allDone') : t('progress.noStages')));
        setKolejnyEtap(next?.nazwa ?? t('common:dash'));
        setMilestonesText(total > 0 ? `${doneCount} / ${total}` : t('common:dash'));
        setProgressValue(total > 0 ? clamp01(doneCount / total) : 0);
        setProgressPercent(pct);
      } catch {
        setObecnyEtap(t('common:dash'));
        setKolejnyEtap(t('common:dash'));
        setMilestonesText(t('common:dash'));
        setProgressValue(0);
        setProgressPercent(0);
      } finally {
        if (alive) setProgressLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line

  // ── Load photos ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setPhotosLoading(true);
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) { setPhotos([]); return; }

        const { data: etapList } = await supabase.storage.from(PHOTOS_BUCKET).list(user.id, { limit: 100 });
        const etapFolders = (etapList ?? []).map((x) => x.name).filter((n) => !!n && !n.includes('.'));

        const allFiles: Array<{ path: string; name: string; created_at?: string; id?: string }> = [];
        for (const etap of etapFolders) {
          const prefix = `${user.id}/${etap}`;
          const { data: files } = await supabase.storage.from(PHOTOS_BUCKET).list(prefix, {
            limit: 40,
            sortBy: { column: 'created_at', order: 'desc' },
          });
          for (const f of files ?? []) {
            if (!f?.name || f.name.endsWith('/')) continue;
            allFiles.push({ path: `${prefix}/${f.name}`, name: f.name, created_at: (f as any).created_at, id: (f as any).id });
          }
        }

        allFiles.sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        });

        const out: PhotoItem[] = [];
        for (const f of allFiles.slice(0, 3)) {
          const { data: signed } = await supabase.storage.from(PHOTOS_BUCKET).createSignedUrl(f.path, 60 * 30);
          if (signed?.signedUrl) out.push({ key: f.id ?? f.path, url: signed.signedUrl, name: f.name, created_at: f.created_at });
        }

        if (!alive) return;
        setPhotos(out);
      } catch {
        setPhotos([]);
      } finally {
        if (alive) setPhotosLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // ── Derived ──
  const heroDateLine = useMemo(() => {
    const date = formatDateDayMonthByLocale(new Date(), appLocale);
    const messageKey = pickHeroMessageKey({
      todayTaskCount,
      budgetUtil,
      progressValue,
      timeUtil,
    });

    return `${t('hero.datePrefix', { date })} ${t(messageKey)}`;
  }, [t, appLocale, todayTaskCount, budgetUtil, progressValue, timeUtil]);

  const estimatedCompletionText = useMemo(() => {
    return t('progress.estimatedCompletionPlaceholder');
  }, [t]);

  const dailyBrief = useMemo(() => {
    if (progressLoading || statusLoading) return '';
    return buildBrief(todayTaskCount, budgetUtil, obecnyEtap, t);
  }, [todayTaskCount, budgetUtil, obecnyEtap, progressLoading, statusLoading, t]);

  const glowOpacity = heroGlow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.55] });
  const glowScale = heroGlow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] });

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

  const handleMomentumEnd = (e: any) => {
    const x = e?.nativeEvent?.contentOffset?.x ?? 0;
    const idx = Math.round(x / SNAP);
    setActiveIndex(Math.max(0, Math.min(donutData.length - 1, idx)));
  };

  return (
    <AppScreen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── HERO — ZMIANA: logo po lewej, tytuł, pogoda chipy po prawej, subtitle pełna szerokość ── */}
        <View style={styles.hero}>
          {/* Linia 1: logo | tytuł | pogoda */}
          <View style={styles.heroTopRow}>
            <ExpoImage
              source={require('../../../assets/logo.png')}
              style={styles.heroLogo}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
            <View style={styles.heroTitleWrap}>
              <Animated.View
                pointerEvents="none"
                style={[styles.heroTitleGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
              />
              <Text style={styles.heroTitle} numberOfLines={1}>
                {t('hero.welcome')}{imie ? ` ${imie}` : ''}
              </Text>
            </View>
            <View style={styles.heroWeatherWrap}>
              {!weatherLoading && weather && weather.length > 0 ? (
                weather.slice(0, 3).map((day, i) => (
                  <View key={i} style={styles.heroWeatherChip}>
                    <Text style={styles.heroWeatherLabel}>{day.label}</Text>
                    <Text style={styles.heroWeatherIcon}>{day.icon}</Text>
                    <Text style={styles.heroWeatherTemp}>{day.temp}</Text>
                  </View>
                ))
              ) : (
                [0, 1, 2].map((i) => (
                  <View key={i} style={styles.heroWeatherChip}>
                    <Text style={styles.heroWeatherLabel}>—</Text>
                    <Text style={styles.heroWeatherIcon}>·</Text>
                    <Text style={styles.heroWeatherTemp}>—</Text>
                  </View>
                ))
              )}
            </View>
          </View>
          {/* Linia 2: subtitle pełna szerokość */}
          <Animated.View style={[styles.heroSubtitleWrap, { opacity: subtitleOpacity, transform: [{ translateY: subtitleY }] }]}>
            <Text style={styles.heroSubtitle}>{heroDateLine}</Text>
          </Animated.View>
        </View>

        {/* ── PROGRESS CARD (etapy) ── */}
        <View style={styles.progressCardOuter}>
          <AppCard contentStyle={styles.progressCard} glow>
            <Animated.View pointerEvents="none" style={[styles.progressScan, { transform: [{ translateX: scanX }, { rotate: '-12deg' }] }]} />

            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>{t('progress.currentStageLabel')}</Text>
              {progressLoading
                ? <Text style={styles.progressValue}>{t('common:loading')}</Text>
                : <Text style={styles.progressValue}>{obecnyEtap}</Text>
              }
            </View>

            {!progressLoading && progressPercent > 0 && (
              <View style={styles.miniBarWrap}>
                <View style={styles.miniBarTrack}>
                  <Animated.View style={[styles.miniBarFill, { width: `${progressPercent}%` as any }]} />
                </View>
                <Text style={styles.miniBarLabel}>{progressPercent}%</Text>
              </View>
            )}

            <View style={styles.estimatedWrap}>
              <Text style={styles.progressLabel}>
                {t('progress.estimatedCompletionLabel')}
              </Text>
              <Text style={styles.estimatedValue}>{estimatedCompletionText}</Text>
            </View>

            <View style={styles.sep} />

            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>{t('progress.nextStageLabel')}</Text>
              {progressLoading
                ? <Text style={styles.progressValue}>{t('common:loading')}</Text>
                : <Text style={styles.progressValue}>{kolejnyEtap}</Text>
              }
            </View>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push('/(app)/(tabs)/postepy')}
              style={styles.centerBtnWrap}
            >
              <View style={styles.centerBtn}>
                <Text style={styles.centerBtnText}>{t('common:checkMore')}</Text>
              </View>
            </TouchableOpacity>
          </AppCard>
        </View>

        {/* ── DONUT CAROUSEL ── */}
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
            getItemLayout={(_, index) => ({ length: SNAP, offset: SNAP * index, index })}
            removeClippedSubviews
            windowSize={3}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            onContentSizeChange={() => {
              listReadyRef.current = true;
              setTimeout(() => runSimpleSpin(), 120);
            }}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              { useNativeDriver: false }
            )}
            onMomentumScrollEnd={handleMomentumEnd}
            renderItem={({ item, index }) => {
              const center = index * SNAP;
              const inputRange = [center - SNAP, center, center + SNAP];
              const scale = scrollX.interpolate({ inputRange, outputRange: [0.92, 1.06, 0.92], extrapolate: 'clamp' });
              const opacity = scrollX.interpolate({ inputRange, outputRange: [0.75, 1, 0.75], extrapolate: 'clamp' });
              const glow = scrollX.interpolate({ inputRange, outputRange: [0, 1, 0], extrapolate: 'clamp' });
              const isActiveSlide = index === activeIndex;

              return (
                <Animated.View style={[styles.donutSlide, { width: CARD_W, opacity, transform: [{ scale }] }]}>
                  <Animated.View pointerEvents="none" style={[styles.donutGlowWrap, { opacity: glow }]} />
                  <View style={styles.donutInnerWrap}>
                    <FuturisticDonutSvg
                      value={item.value}
                      label={item.label}
                      onPressLabel={item.onPress}
                      isActive={isActiveSlide}
                      size={210}
                      stroke={16}
                    />
                    {item.key === 'budzet' && (
                      <Text style={styles.donutSubText}>
                        {statusLoading ? t('common:dash') : `${formatCurrency(spentTotal, appLocale)} / ${formatCurrency(plannedBudget, appLocale)}`}
                      </Text>
                    )}
                    {item.key === 'czas' && (
                      <Text style={styles.donutSubText}>
                        {dates.start && dates.end
                          ? `${new Date(dates.start).toLocaleDateString(appLocale)} → ${new Date(dates.end).toLocaleDateString(appLocale)}`
                          : t('donuts.completeInvestmentDates')}
                      </Text>
                    )}
                    {item.key === 'postep' && (
                      <Text style={styles.donutSubText}>
                        {progressLoading
                          ? t('progress.loadingProgress')
                          : milestonesText !== t('common:dash')
                          ? t('progress.completed', { milestones: milestonesText })
                          : t('progress.noStages')}
                      </Text>
                    )}
                  </View>
                  <View style={styles.donutDots}>
                    {donutData.map((_, di) => (
                      <View key={di} style={[styles.donutDot, di === activeIndex && styles.donutDotActive]} />
                    ))}
                  </View>
                </Animated.View>
              );
            }}
          />
        </View>

        {/* ── QUICK ACTIONS ── */}
        <View style={styles.sectionWrap}>
          <View style={styles.qaRow}>
            {([
              { icon: '💸', label: t('quickActions.addExpense'), route: '/(app)/(tabs)/budzet' },
              { icon: '📷', label: t('quickActions.addPhoto'), route: '/(app)/(tabs)/zdjecia' },
              { icon: '📄', label: t('quickActions.addDocument'), route: '/(app)/(tabs)/dokumenty' },
              { icon: '🏗️', label: t('quickActions.stages'), route: '/(app)/(tabs)/postepy' },
            ] as any[]).map((qa, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.85}
                onPress={() => qa.action ? qa.action() : router.push(qa.route)}
                style={styles.qaCard}
              >
                <BlurView intensity={14} tint="dark" style={styles.qaBlur}>
                  <Text style={styles.qaIcon}>{qa.icon}</Text>
                  <Text style={styles.qaLabel}>{qa.label}</Text>
                </BlurView>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── TODAY TASKS ── */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionOuter}>
            <AppCard contentStyle={styles.sectionGlass}>
              <View style={styles.todayTasksHero}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.todayTasksDate}>
                    {formatDateLongByLocale(today, appLocale)}
                  </Text>
                  <Text style={styles.todayTasksLead}>
                    {todayTaskCount > 0
                      ? t('todayTasks.summary', { count: todayTaskCount })
                      : t('todayTasks.emptySummary')}
                  </Text>
                </View>
                <View style={styles.todayTasksBadge}>
                  <Text style={styles.todayTasksBadgeValue}>{todayTaskCount}</Text>
                  <Text style={styles.todayTasksBadgeLabel}>
                    {t('todayTasks.badge')}
                  </Text>
                </View>
              </View>

              <View style={styles.todayTasksActions}>
                <TouchableOpacity
                  onPress={openAddTask}
                  style={[styles.todayTasksActionBtn, styles.todayTasksActionPrimary]}
                  activeOpacity={0.9}
                >
                  <Text style={styles.todayTasksActionPrimaryText}>
                    {t('todayTasks.add')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => router.push('/(app)/zadania')}
                  style={styles.todayTasksActionBtn}
                  activeOpacity={0.9}
                >
                  <Text style={styles.todayTasksActionText}>
                    {t('todayTasks.openAll')}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.todayTasksListWrap}>
                <View style={styles.nearestHeader}>
                  <Text style={styles.nearestTitle}>
                    {t('todayTasks.listTitle')}
                  </Text>
                  <Text style={styles.todayTasksListCount}>
                    {todayTaskCount > 0
                      ? t('todayTasks.countLabel', { count: todayTaskCount })
                      : t('todayTasks.countEmpty')}
                  </Text>
                </View>
                {tasksLoading ? (
                  <ActivityIndicator color={NEON} />
                ) : todayTasks.length === 0 ? (
                  <View style={styles.todayTasksEmpty}>
                    <Text style={styles.todayTasksEmptyTitle}>
                      {t('todayTasks.emptyTitle')}
                    </Text>
                    <Text style={styles.mutedText}>
                      {t('todayTasks.emptyText')}
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    {todayTasks.map((task) => (
                      <View key={task.id} style={styles.taskRow}>
                        <View style={styles.taskDot} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.taskTitle} numberOfLines={2}>{task.nazwa}</Text>
                          <Text style={styles.taskMeta}>
                            {task.godzina ? prettyTime(task.godzina) : t('calendar.allDay')}
                            {task.opis ? ` • ${task.opis}` : ''}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {upcomingTasks.length > 0 ? (
                <View style={styles.upcomingTasksWrap}>
                  <View style={styles.nearestHeader}>
                    <Text style={styles.nearestTitle}>
                      {t('todayTasks.upcomingTitle')}
                    </Text>
                    <Text style={styles.todayTasksListCount}>
                      {t('todayTasks.upcomingHint')}
                    </Text>
                  </View>
                  <View style={{ gap: 8 }}>
                    {upcomingTasks.map((task) => (
                      <View key={task.id} style={styles.taskRow}>
                        <View style={styles.taskDot} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.taskTitle} numberOfLines={1}>{task.nazwa}</Text>
                          <Text style={styles.taskMeta}>
                            {task.data ?? '—'}
                            {task.godzina ? ` • ${prettyTime(task.godzina)}` : ` • ${t('calendar.allDay')}`}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </AppCard>
          </View>
        </View>

        {/* ── LAST ACTIVITY ── */}
        <View style={styles.sectionWrap}>
          <SectionHeader title={t('activity.title')} style={styles.sectionTitleWrap} />
          <View style={styles.sectionOuter}>
            <AppCard contentStyle={styles.sectionGlass}>
              {activityLoading ? (
                <ActivityIndicator color={NEON} />
              ) : activity.length === 0 ? (
                <Text style={styles.mutedText}>{t('activity.empty')}</Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {activity.map((item) => (
                    <View key={item.id} style={styles.activityRow}>
                      <View style={styles.activityIconWrap}>
                        <Text style={styles.activityIcon}>{item.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.activityLabel} numberOfLines={1}>{item.label}</Text>
                        <Text style={styles.activityMeta}>{item.meta}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </AppCard>
          </View>
        </View>

        {/* ── PHOTOS (compact: 3 thumbnails + button) ── */}
        <View style={styles.sectionWrap}>
          <SectionHeader title={t('photos.latestTitle')} style={styles.sectionTitleWrap} />
          <View style={styles.sectionOuter}>
            <AppCard contentStyle={styles.sectionGlass}>
              {photosLoading ? (
                <ActivityIndicator color={NEON} />
              ) : photos.length === 0 ? (
                <Text style={styles.mutedText}>{t('photos.empty')}</Text>
              ) : (
                <View style={styles.photoThumbRow}>
                  {photos.map((p) => (
                    <TouchableOpacity
                      key={p.key}
                      onPress={() => router.push('/(app)/(tabs)/zdjecia')}
                      activeOpacity={0.85}
                      style={styles.photoThumb}
                    >
                      <Image source={{ uri: p.url }} style={styles.photoThumbImg} resizeMode="cover" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => router.push('/(app)/(tabs)/zdjecia')}
                style={styles.centerBtnWrap}
              >
                <View style={styles.centerBtn}>
                  <Text style={styles.centerBtnText}>{t('common:checkMore')}</Text>
                </View>
              </TouchableOpacity>
            </AppCard>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── ADD TASK MODAL ── */}
      <Modal visible={taskModalOpen} transparent animationType="fade" onRequestClose={() => setTaskModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('modal.addTaskTitle')}</Text>
            <Text style={styles.modalSubtitle}>{t('modal.selectedDate', { date: selectedYMD })}</Text>

            <AppInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder={t('modal.titlePlaceholder')}
              style={styles.modalInput}
              maxLength={80}
            />
            <AppInput
              value={newDesc}
              onChangeText={setNewDesc}
              placeholder={t('modal.descriptionPlaceholder')}
              style={styles.modalInput}
              maxLength={120}
            />

            <View style={styles.pickerRow}>
              <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.pickerBtn} activeOpacity={0.9}>
                <Text style={styles.pickerBtnLabel}>{t('modal.date')}</Text>
                <Text style={styles.pickerBtnValue}>{formatDateShort(pickDate, appLocale)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setHasTime(true); setShowTimePicker(true); }}
                style={[styles.pickerBtn, hasTime && styles.pickerBtnActive]}
                activeOpacity={0.9}
              >
                <Text style={styles.pickerBtnLabel}>{t('modal.time')}</Text>
                <Text style={styles.pickerBtnValue}>{hasTime ? prettyTime(toTimeHHMMSS(pickTime)) : t('calendar.allDay')}</Text>
              </TouchableOpacity>
            </View>

            {hasTime && (
              <TouchableOpacity onPress={() => setHasTime(false)} style={styles.removeTimeBtn} activeOpacity={0.9}>
                <Text style={styles.removeTimeTxt}>{t('modal.removeTime')}</Text>
              </TouchableOpacity>
            )}

            {showDatePicker && (
              <DateTimePicker
                value={pickDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                locale={appLocale}
                onChange={(_: any, d?: Date) => {
                  if (Platform.OS !== 'ios') setShowDatePicker(false);
                  if (d) { setPickDate(d); setSelectedYMD(toYMD(d)); }
                }}
              />
            )}
            {showTimePicker && (
              <DateTimePicker
                value={pickTime}
                mode="time"
                is24Hour
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                locale={appLocale}
                onChange={(_: any, d?: Date) => {
                  if (Platform.OS !== 'ios') setShowTimePicker(false);
                  if (d) { setPickTime(d); setHasTime(true); }
                }}
              />
            )}

            <View style={styles.modalActions}>
              <AppButton title={t('common:cancel')} variant="secondary" onPress={() => setTaskModalOpen(false)} style={styles.modalBtnGhost} />
              <AppButton title={t('common:save')} onPress={addTask} style={styles.modalBtnPrimary} />
            </View>

            <Text style={styles.modalHint}>{t('modal.hint')}</Text>
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  content: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 140 },

  // ── HERO — ZMIENIONE (tylko ta sekcja, reszta styles identyczna z doc 13) ──
  hero: { marginTop: 6, marginBottom: 8 },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroLogo: {
    width: 62,
    height: 62,
    flexShrink: 0,
    opacity: 0.98,
  },
  heroTitleWrap: {
    flex: 1,
    position: 'relative',
    minWidth: 0,
  },
  heroTitleGlow: {
    position: 'absolute',
    left: -10, right: -10, top: 9, height: 24,
    borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.14)',
    shadowColor: NEON,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  heroTitle: {
    color: ACCENT,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(25,112,92,0.18)',
    textShadowRadius: 18,
  },
  heroWeatherWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  heroWeatherChip: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 28,
  },
  heroWeatherLabel: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'lowercase',
  },
  heroWeatherIcon: { fontSize: 14, lineHeight: 16 },
  heroWeatherTemp: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  heroSubtitleWrap: { marginTop: 8, width: '100%' },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 15.5,
    fontWeight: '400',
    lineHeight: 22,
    maxWidth: '96%',
  },
  // ── koniec zmian hero ──

  briefOuter: { marginTop: 10, borderRadius: 20, overflow: 'hidden' },
  briefCard: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'rgba(37,240,200,0.04)', borderWidth: 1, borderColor: 'rgba(37,240,200,0.14)' },
  briefRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  briefIcon: { fontSize: 16, marginTop: 1 },
  briefText: { flex: 1, color: 'rgba(255,255,255,0.80)', fontSize: 13.5, fontWeight: '700', lineHeight: 20 },

  progressCardOuter: { marginTop: 14, borderRadius: 28 },
  progressCard: { borderRadius: 28, padding: 18, backgroundColor: 'transparent', borderWidth: 0 },
  progressScan: {
    position: 'absolute', top: -40, width: 120, height: 120, borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.04)', borderWidth: 1, borderColor: 'rgba(37,240,200,0.10)',
    shadowColor: NEON, shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
  },
  progressRow: { paddingVertical: 10 },
  progressLabel: { color: 'rgba(255,255,255,0.42)', fontSize: 12.5, fontWeight: '800', letterSpacing: 0.8 },
  progressValue: { marginTop: 6, color: '#FFFFFF', fontSize: 18, fontWeight: '900', letterSpacing: -0.2 },

  miniBarWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  miniBarTrack: { flex: 1, height: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  miniBarFill: { height: '100%', backgroundColor: NEON, borderRadius: 999, shadowColor: NEON, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  miniBarLabel: { color: NEON, fontSize: 11.5, fontWeight: '900', minWidth: 32, textAlign: 'right' },

  estimatedWrap: { paddingTop: 8, paddingBottom: 12 },
  estimatedValue: { marginTop: 6, color: 'rgba(255,255,255,0.82)', fontSize: 14.5, fontWeight: '800' },

  sep: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },

  centerBtnWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  centerBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: 'rgba(37,240,200,0.10)', borderWidth: 1, borderColor: 'rgba(37,240,200,0.22)' },
  centerBtnText: { color: NEON, fontSize: 12.5, fontWeight: '800', letterSpacing: 0.2 },

  carouselHintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 },
  carouselHintText: { display: 'none' } as any,
  carouselHintArrow: { color: 'rgba(37,240,200,0.40)', fontSize: 18, fontWeight: '900' },

  donutSlide: { borderRadius: 24, overflow: 'visible' },
  donutGlowWrap: { position: 'absolute', left: 12, right: 12, top: 18, bottom: 18, borderRadius: 999, shadowColor: NEON, shadowOpacity: 0.2, shadowRadius: 22, shadowOffset: { width: 0, height: 0 } },
  donutInnerWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  donutSubText: { marginTop: 8, color: 'rgba(255,255,255,0.46)', fontSize: 12.5, fontWeight: '700' },
  donutDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  donutDot: { width: 6, height: 6, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.15)' },
  donutDotActive: { backgroundColor: NEON, shadowColor: NEON, shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },

  sectionWrap: { marginTop: 18 },
  sectionTitleWrap: { justifyContent: 'center', marginBottom: 12 },
  sectionOuter: { borderRadius: 28, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 26, shadowOffset: { width: 0, height: 14 } },
  sectionGlass: { borderRadius: 28, padding: 16, backgroundColor: 'rgba(255,255,255,0.026)' },

  sectionLabelSmall: { color: 'rgba(255,255,255,0.42)', fontSize: 12.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },

  qaRow: { flexDirection: 'row', gap: 10 },
  qaCard: { flex: 1, borderRadius: 20, overflow: 'hidden', aspectRatio: 0.9 },
  qaBlur: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, borderWidth: 1, borderColor: 'rgba(37,240,200,0.12)', backgroundColor: 'rgba(255,255,255,0.026)' },
  qaIcon: { fontSize: 26, marginBottom: 8 },
  qaLabel: { color: 'rgba(255,255,255,0.80)', fontSize: 11, fontWeight: '800', textAlign: 'center', lineHeight: 15 },

  todayTasksHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(37,240,200,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
    shadowColor: NEON,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  todayTasksDate: {
    color: 'rgba(255,255,255,0.46)',
    fontSize: 11.5,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  todayTasksLead: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 22,
  },
  todayTasksBadge: {
    width: 76,
    minHeight: 76,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.26)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.24)',
  },
  todayTasksBadgeValue: {
    color: NEON,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 30,
  },
  todayTasksBadgeLabel: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.52)',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  todayTasksActions: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 14 },
  todayTasksActionBtn: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  todayTasksActionPrimary: {
    backgroundColor: 'rgba(37,240,200,0.12)',
    borderColor: 'rgba(37,240,200,0.30)',
  },
  todayTasksActionText: { color: 'rgba(255,255,255,0.76)', fontSize: 12.5, fontWeight: '900' },
  todayTasksActionPrimaryText: { color: NEON, fontSize: 12.5, fontWeight: '900' },
  todayTasksListWrap: {
    padding: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.10)',
  },
  todayTasksListCount: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11.5,
    fontWeight: '800',
  },
  todayTasksEmpty: {
    paddingVertical: 6,
    gap: 6,
  },
  todayTasksEmptyTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  upcomingTasksWrap: {
    marginTop: 12,
    padding: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  nearestHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  nearestTitle: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900', letterSpacing: 0.2 },

  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  taskDot: { width: 8, height: 8, borderRadius: 99, backgroundColor: NEON, marginTop: 5, shadowColor: NEON, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  taskTitle: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
  taskMeta: { marginTop: 3, color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '700' },

  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  activityIconWrap: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(37,240,200,0.08)', borderWidth: 1, borderColor: 'rgba(37,240,200,0.14)', alignItems: 'center', justifyContent: 'center' },
  activityIcon: { fontSize: 16 },
  activityLabel: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
  activityMeta: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '700', marginTop: 2 },

  photoThumbRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  photoThumb: { flex: 1, aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.04)' },
  photoThumbImg: { width: '100%', height: '100%' },

  mutedText: { color: 'rgba(255,255,255,0.48)', fontSize: 14, lineHeight: 20 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalCard: { width: '100%', borderRadius: 24, padding: 16, backgroundColor: 'rgba(12,12,12,0.92)', borderWidth: 1, borderColor: 'rgba(37,240,200,0.18)', shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 26, shadowOffset: { width: 0, height: 14 } },
  modalTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  modalSubtitle: { marginTop: 4, color: 'rgba(255,255,255,0.55)', fontSize: 12.5, fontWeight: '700' },
  modalInput: { marginTop: 12 } as any,
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalBtnGhost: { flex: 1 },
  modalBtnPrimary: { flex: 1 },
  modalHint: { marginTop: 10, color: 'rgba(255,255,255,0.35)', fontSize: 11.5, fontWeight: '700', lineHeight: 16 },
  pickerRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pickerBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  pickerBtnActive: { backgroundColor: 'rgba(37,240,200,0.10)', borderColor: 'rgba(37,240,200,0.35)' },
  pickerBtnLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11.5, fontWeight: '900' },
  pickerBtnValue: { marginTop: 4, color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
  removeTimeBtn: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
  removeTimeTxt: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '900' },
});
