import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  Pressable,
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
import { fetchCurrentBuildAccess, type BuildAccess } from '../../../../lib/buildAccess';
import { loadSharedBuddyName } from '../../../../src/services/buddy/name';
import { formatAppCurrency, useCurrency } from '../../../../lib/currency';
import { getAppLocale } from '../../../../lib/i18n';
import { getStageLabel } from '../../../../lib/localizedLabels';
import {
  getLegacyStageLabelFromGroupCode,
  MAIN_STAGE_TIMELINE,
  normalizeWorkflowCode,
  resolveCurrentStageGroupCode,
  summarizeGroupProgress,
  summarizeOverallProgressBySubstages,
  type StageTemplateRow,
  type UserStageRow,
} from '../../../../lib/postepyModel';
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
  date: string;
  label: string;
  icon: string;
  tempMax: number;
  tempMin: number;
  weatherCode: number;
  precipitationProbability: number | null;
  precipitationSum: number | null;
  windSpeed: number | null;
};

const STATUS_DONE = 'zrealizowany';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function isRainyWeatherCode(code: number) {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99);
}

function isSnowyWeatherCode(code: number) {
  return (code >= 71 && code <= 77) || code === 85 || code === 86;
}

function isStormyWeatherCode(code: number) {
  return code >= 95 && code <= 99;
}

function dayOfYear(date: Date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

function isWindyForecast(day: Pick<WeatherDay, 'windSpeed'>) {
  return safeNumber(day.windSpeed) >= 35;
}

function isColdForecast(day: Pick<WeatherDay, 'tempMax' | 'tempMin'>) {
  return safeNumber(day.tempMin) <= 0 || safeNumber(day.tempMax) <= 5;
}

function isHotForecast(day: Pick<WeatherDay, 'tempMax'>) {
  return safeNumber(day.tempMax) >= 30;
}

function hasRainForecast(day: Pick<WeatherDay, 'weatherCode' | 'precipitationProbability' | 'precipitationSum'>) {
  const code = Number(day.weatherCode ?? 0);
  const rainProbability = safeNumber(day.precipitationProbability);
  const precipitation = safeNumber(day.precipitationSum);
  return (
    isRainyWeatherCode(code) ||
    isSnowyWeatherCode(code) ||
    isStormyWeatherCode(code) ||
    rainProbability >= 40 ||
    precipitation >= 0.6
  );
}

function pickWeatherVariantIndex(forecast: WeatherDay[], locale: string) {
  const localeSeed = Array.from(locale).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const weatherSeed = forecast.reduce((sum, day, index) => {
    return (
      sum +
      Math.round(safeNumber(day.weatherCode)) +
      Math.round(safeNumber(day.tempMax) * 3) +
      Math.round(safeNumber(day.precipitationProbability) / 10) +
      Math.round(safeNumber(day.precipitationSum) * 10) +
      Math.round(safeNumber(day.windSpeed)) +
      index
    );
  }, 0);
  return Math.abs(localeSeed + weatherSeed + dayOfYear(new Date())) % 3;
}

function getWeatherWorkHint(forecast: WeatherDay[], locale: string) {
  const days = forecast.slice(0, 3);
  if (days.length < 3) return 'weather.workHints.fallback.0';

  const rainFlags = days.map((day) => hasRainForecast(day));
  const windyFlags = days.map((day) => isWindyForecast(day));
  const coldFlags = days.map((day) => isColdForecast(day));
  const hotFlags = days.map((day) => isHotForecast(day));
  const variant = pickWeatherVariantIndex(days, locale);

  if (rainFlags[0] && rainFlags[1] && rainFlags[2]) return `weather.workHints.allRain.${variant}`;
  if (rainFlags[0] && rainFlags[1]) return `weather.workHints.rainTodayTomorrow.${variant}`;
  if (rainFlags[0] && !rainFlags[1] && !rainFlags[2]) return `weather.workHints.rainToday.${variant}`;
  if (!rainFlags[0] && rainFlags[1] && !rainFlags[2]) return `weather.workHints.rainTomorrow.${variant}`;
  if (!rainFlags[0] && !rainFlags[1] && rainFlags[2]) return `weather.workHints.rainAfterTomorrow.${variant}`;
  if (windyFlags.some(Boolean)) return `weather.workHints.windy.${variant}`;
  if (coldFlags.some(Boolean)) return `weather.workHints.cold.${variant}`;
  if (hotFlags.some(Boolean)) return `weather.workHints.hot.${variant}`;
  if (!rainFlags.some(Boolean)) return `weather.workHints.noRain.${variant}`;
  return `weather.workHints.fallback.${variant}`;
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
  const pool = todayTaskCount > 0
    ? [
        'hero.messages.focusDay',
        'hero.messages.oneStep',
        'hero.messages.smallWin',
        'hero.messages.clearPlan',
        'hero.messages.steadyDirection',
        'hero.messages.calmControl',
      ]
    : [
        'hero.messages.dreamCloser',
        'hero.messages.goodHands',
        'hero.messages.lessStress',
        'hero.messages.enjoyIt',
        'hero.messages.buildingHappens',
        'hero.messages.smallStep',
        'hero.messages.proudMoment',
        'hero.messages.calmProgress',
        'hero.messages.homeSoon',
        'hero.messages.orderMatters',
      ];

  const seed = dayOfYear(new Date());
  return pool[seed % pool.length];
}

export default function DashboardScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation('dashboard');
  const { t: tStages } = useTranslation('stages');
  const { currency } = useCurrency();
  const appLocale = useMemo(() => getAppLocale(i18n.resolvedLanguage || i18n.language), [i18n.resolvedLanguage, i18n.language]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [buildAccess, setBuildAccess] = useState<BuildAccess | null>(null);

  // ── Hero ──
  const [imie, setImie] = useState<string>('');
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleY = useRef(new Animated.Value(8)).current;
  const heroGlow = useRef(new Animated.Value(0)).current;

  // ── Donut carousel ──
  const CONTENT_PAD_X = 18;
  const CONTENT_W = W - CONTENT_PAD_X * 2;
  const CARD_W = Math.min(274, Math.round(CONTENT_W * 0.72));
  const GAP = 10;
  const SNAP = CARD_W + GAP;
  const SIDE = Math.max(8, Math.round((CONTENT_W - CARD_W) / 2));

  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<any> | null>(null);
  const listReadyRef = useRef(false);

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
  const [overallMilestonesText, setOverallMilestonesText] = useState<string>('—');
  const [overallProgressValue, setOverallProgressValue] = useState<number>(0);
  const heroDisplayName = useMemo(
    () => imie.trim() || t('hero.fallbackName'),
    [imie, t]
  );
  const heroGreeting = useMemo(
    () => `${t('hero.welcome')} ${heroDisplayName}`,
    [heroDisplayName, t]
  );
  const splitHeroGreeting = heroGreeting.length > 16;

  const isDone = (status: string | null) =>
    (status ?? '').toLowerCase().trim() === STATUS_DONE;

  const resolveDashboardScope = React.useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user ?? null;
    if (!user) return { user: null as any, access: null as BuildAccess | null };

    const access = buildAccess ?? (await fetchCurrentBuildAccess(user.id));
    if (!buildAccess) setBuildAccess(access);
    if (!currentUserId) setCurrentUserId(user.id);
    return { user, access };
  }, [buildAccess, currentUserId]);

  const donutData: DonutItem[] = useMemo(
    () => [
      {
        key: 'budzet',
        value: budgetUtil,
        label: t('donuts.budgetLabel'),
        onPress: () => router.push('/(app)/(tabs)/budzet'),
      },
      { key: 'czas', value: clamp01(timeUtil), label: t('donuts.timeLabel') },
      {
        key: 'postep',
        value: clamp01(overallProgressValue),
        label: t('donuts.progressLabel'),
        onPress: () => router.push('/(app)/(tabs)/postepy'),
      },
    ],
    [budgetUtil, timeUtil, overallProgressValue, router, t]
  );

  useFocusEffect(
    React.useCallback(() => {
      const timer = setTimeout(() => {
        if (!listReadyRef.current) return;
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
        setActiveIndex(0);
      }, 160);
      return () => clearTimeout(timer);
    }, [])
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
      const { user, access } = await resolveDashboardScope();
      if (!user) { setTodayTasks([]); setUpcomingTasks([]); return; }

      const todayYMD = toYMD(today);
      const { data, error } = await supabase
        .from(TASKS_TABLE)
        .select('id,user_id,data,godzina,nazwa,opis,utworzone_at')
        .eq(access?.investmentId ? 'investment_id' : 'user_id', access?.investmentId ?? user.id)
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
      const access = buildAccess ?? (await fetchCurrentBuildAccess(user.id));
      if (!buildAccess) setBuildAccess(access);

      const ins = await supabase.from(TASKS_TABLE).insert({
        user_id: user.id,
        ...(access?.investmentId ? { investment_id: access.investmentId } : {}),
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
        setWeatherLoading(true);
        const { user, access } = await resolveDashboardScope();
        if (!user) {
          if (alive) setWeather(null);
          return;
        }

        const investmentRes = access?.investmentId
          ? await supabase
              .from('inwestycje')
              .select('latitude, longitude')
              .eq('id', access.investmentId)
              .maybeSingle()
          : await supabase
              .from('inwestycje')
              .select('latitude, longitude')
              .eq('user_id', user.id)
              .maybeSingle();

        if (investmentRes.error) throw investmentRes.error;

        const lat = Number((investmentRes.data as any)?.latitude);
        const lon = Number((investmentRes.data as any)?.longitude);

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          if (alive) setWeather(null);
          return;
        }

        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,windspeed_10m_max&timezone=auto&forecast_days=3`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('WEATHER_FETCH_FAILED');
        const data = await res.json();
        if (!alive) return;

        const weatherCodes = data.daily.weather_code ?? data.daily.weathercode ?? [];
        const rainProbabilities = data.daily.precipitation_probability_max ?? [];
        const precipitationSums = data.daily.precipitation_sum ?? [];
        const windSpeeds = data.daily.windspeed_10m_max ?? [];
        const tempMaxValues = data.daily.temperature_2m_max ?? [];
        const tempMinValues = data.daily.temperature_2m_min ?? [];

        const days: WeatherDay[] = data.daily.time.map((dateStr: string, i: number) => {
          const d = new Date(dateStr);
          const weekdayKey = getWeekdayKey(d);
          const label = t(`weather.days.${weekdayKey}`);

          return {
            date: dateStr,
            label,
            icon: weatherCodeToIcon(Number(weatherCodes[i] ?? 0)),
            tempMax: Math.round(Number(tempMaxValues[i] ?? 0)),
            tempMin: Math.round(Number(tempMinValues[i] ?? 0)),
            weatherCode: Number(weatherCodes[i] ?? 0),
            precipitationProbability: Number.isFinite(Number(rainProbabilities[i])) ? Number(rainProbabilities[i]) : null,
            precipitationSum: Number.isFinite(Number(precipitationSums[i])) ? Number(precipitationSums[i]) : null,
            windSpeed: Number.isFinite(Number(windSpeeds[i])) ? Number(windSpeeds[i]) : null,
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
  }, [appLocale, resolveDashboardScope, t]);

  // ── Activity feed ──
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { user, access } = await resolveDashboardScope();
        if (!user) { setActivity([]); return; }

        const [expRes, stageRes, taskRes] = await Promise.all([
          supabase
            .from('wydatki')
            .select('id,nazwa,kwota,created_at')
            .eq(access?.investmentId ? 'investment_id' : 'user_id', access?.investmentId ?? user.id)
            .order('created_at', { ascending: false })
            .limit(3),
          supabase
            .from('etapy')
            .select('id,nazwa,status,kolejnosc')
            .eq('user_id', access?.ownerUserId ?? user.id)
            .order('kolejnosc', { ascending: false })
            .limit(2),
          supabase
            .from(TASKS_TABLE)
            .select('id,nazwa,data,utworzone_at')
            .eq(access?.investmentId ? 'investment_id' : 'user_id', access?.investmentId ?? user.id)
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
            meta: formatAppCurrency(safeNumber(w.kwota), appLocale, currency),
            icon: '💸',
          });
        }

        for (const e of stageRes.data ?? []) {
          if (isDone(e.status)) {
            items.push({
              id: `stage-${e.id}`,
              type: 'stage',
              label: getStageLabel(e.nazwa, tStages),
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

        setActivity(items.slice(0, 3));
      } catch {
        setActivity([]);
      } finally {
        if (alive) setActivityLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [appLocale, currency, resolveDashboardScope, t, tStages]);

  // ── Load profile + hero anim ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;
        if (!user) return;
        const prof = await supabase.from('profiles').select('imie').eq('user_id', user.id).maybeSingle();
        const access = await fetchCurrentBuildAccess(user.id).catch(() => null);
        const buddyName = await loadSharedBuddyName(user.id, access?.ownerUserId ?? user.id);
        if (!alive) return;
        setImie(buddyName || ((prof.data as any)?.imie ?? ''));
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
        const { user, access } = await resolveDashboardScope();
        if (!user) return;

        const [invRes, expRes] = await Promise.all([
          access?.investmentId
            ? supabase.from('inwestycje').select('budzet, data_start, data_koniec').eq('id', access.investmentId).maybeSingle()
            : supabase.from('inwestycje').select('budzet, data_start, data_koniec').eq('user_id', user.id).maybeSingle(),
          supabase.from('wydatki').select('kwota, status').eq(access?.investmentId ? 'investment_id' : 'user_id', access?.investmentId ?? user.id),
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
  }, [resolveDashboardScope]);

  // ── Load progress ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setProgressLoading(true);
        const { user, access } = await resolveDashboardScope();
        if (!user) return;

        const scopeOwnerId = access?.ownerUserId ?? user.id;

        const [profileRes, templatesRes, userStagesRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('build_type, current_stage_code')
            .eq('user_id', scopeOwnerId)
            .maybeSingle(),
          supabase
            .from('stage_templates')
            .select('id, workflow_code, stage_group_code, stage_code, name_key, order_index, is_active')
            .eq('is_active', true)
            .order('order_index', { ascending: true }),
          supabase
            .from('user_stages')
            .select('id, user_id, project_id, template_id, workflow_code, stage_group_code, stage_code, source, status, custom_name, custom_name_key, order_index, updated_at, created_at')
            .eq('user_id', scopeOwnerId)
            .order('order_index', { ascending: true }),
        ]);

        if (profileRes.error) throw profileRes.error;
        if (templatesRes.error) throw templatesRes.error;
        if (userStagesRes.error) throw userStagesRes.error;

        const profileData = profileRes.data as { build_type?: string | null; current_stage_code?: string | null } | null;
        const templates = (templatesRes.data ?? []) as StageTemplateRow[];
        const userStages = (userStagesRes.data ?? []) as UserStageRow[];
        const workflowCode = normalizeWorkflowCode(profileData?.build_type);
        const workflowTemplates = templates.filter((row) => row.workflow_code === workflowCode);
        const effectiveStageCode = String(profileData?.current_stage_code ?? '').trim().toUpperCase();
        const currentGroupCode = resolveCurrentStageGroupCode(workflowTemplates, profileData?.build_type, effectiveStageCode);
        const currentGroupIndex = Math.max(0, MAIN_STAGE_TIMELINE.findIndex((item) => item.stage_group_code === currentGroupCode));
        const currentStageLabel = getStageLabel(getLegacyStageLabelFromGroupCode(currentGroupCode), tStages);
        const nextGroup = MAIN_STAGE_TIMELINE[currentGroupIndex + 1] ?? null;
        const nextGroupLabel = nextGroup
          ? getStageLabel(getLegacyStageLabelFromGroupCode(nextGroup.stage_group_code), tStages)
          : t('common:dash');

        const currentGroupStats = summarizeGroupProgress(userStages, [], currentGroupCode, workflowTemplates);
        const total = currentGroupStats.total;
        const doneCount = currentGroupStats.done;
        const overallProgress = summarizeOverallProgressBySubstages(
          userStages,
          [],
          currentGroupCode,
          workflowTemplates
        );

        if (!alive) return;

        setObecnyEtap(currentStageLabel);
        setKolejnyEtap(nextGroupLabel);
        setMilestonesText(`${doneCount} / ${total}`);
        setProgressValue(total > 0 ? clamp01(doneCount / total) : 0);
        setProgressPercent(total > 0 ? Math.round((doneCount / total) * 100) : 0);
        setOverallMilestonesText(`${overallProgress.done} / ${overallProgress.total}`);
        setOverallProgressValue(overallProgress.value);
      } catch {
        setObecnyEtap(t('common:dash'));
        setKolejnyEtap(t('common:dash'));
        setMilestonesText(t('common:dash'));
        setProgressValue(0);
        setProgressPercent(0);
        setOverallMilestonesText(t('common:dash'));
        setOverallProgressValue(0);
      } finally {
        if (alive) setProgressLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [resolveDashboardScope, t, tStages]);

  // ── Load photos ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setPhotosLoading(true);
        const { user, access } = await resolveDashboardScope();
        if (!user) { setPhotos([]); return; }

        const photoQuery = supabase
          .from('zdjecia')
          .select('id,user_id,investment_id,file_path,created_at')
          .order('created_at', { ascending: false })
          .limit(3);
        const { data: photoRows, error: photoError } = access?.investmentId
          ? await photoQuery.eq('investment_id', access.investmentId)
          : await photoQuery.eq('user_id', user.id);
        if (photoError) throw photoError;

        const out: PhotoItem[] = [];
        for (const row of (photoRows ?? []) as Array<{ id: string; file_path: string; created_at?: string | null }>) {
          const { data: signed } = await supabase.storage.from(PHOTOS_BUCKET).createSignedUrl(row.file_path, 60 * 30);
          if (signed?.signedUrl) {
            out.push({
              key: row.id,
              url: signed.signedUrl,
              name: row.file_path.split('/').pop() ?? row.id,
              created_at: row.created_at ?? undefined,
            });
          }
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
  }, [resolveDashboardScope]);

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

  const weatherHasData = !!(weather && weather.length > 0 && !weatherLoading);

  const dailyBrief = useMemo(() => {
    if (progressLoading || statusLoading) return '';
    return buildBrief(todayTaskCount, budgetUtil, obecnyEtap, t);
  }, [todayTaskCount, budgetUtil, obecnyEtap, progressLoading, statusLoading, t]);

  const glowOpacity = heroGlow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.55] });
  const glowScale = heroGlow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] });

  const handleMomentumEnd = (e: any) => {
    const x = e?.nativeEvent?.contentOffset?.x ?? 0;
    const idx = Math.round(x / SNAP);
    setActiveIndex(Math.max(0, Math.min(donutData.length - 1, idx)));
  };

  return (
    <AppScreen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── HERO ── */}
        <View style={styles.hero}>
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
              <Text style={styles.heroTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                {splitHeroGreeting ? t('hero.welcome') : heroGreeting}
              </Text>
              {splitHeroGreeting && !!heroDisplayName && (
                <Text style={styles.heroName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.58}>
                  {heroDisplayName}
                </Text>
              )}
            </View>
          </View>

          <Animated.View style={[styles.heroSubtitleWrap, { opacity: subtitleOpacity, transform: [{ translateY: subtitleY }] }]}>
            <Text style={styles.heroSubtitle}>{heroDateLine}</Text>
          </Animated.View>
        </View>

        <View style={styles.weatherCardOuter}>
          <AppCard contentStyle={styles.weatherCard} withShadow={false} glow={false}>
            <View style={styles.weatherRow}>
              <View style={styles.weatherLeft}>
                <View style={styles.weatherLeftHeader}>
                  <Text style={styles.weatherLeftIcon}>
                    {!weatherLoading && weather && weather.length > 0 ? weather[0].icon : '📍'}
                  </Text>
                  <View style={styles.weatherLeftTextWrap}>
                    <Text style={styles.weatherLeftHint} numberOfLines={2}>
                      {weatherHasData ? t(getWeatherWorkHint(weather, appLocale)) : t('weather.emptyText')}
                    </Text>
                  </View>
                </View>
                {!weatherHasData && (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.weatherCta}
                    onPress={() => router.push('/(app)/inwestycja')}
                  >
                    <Text style={styles.weatherCtaText}>{t('weather.emptyCta')}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.weatherDaysWrap}>
                {weatherHasData ? (
                  weather.slice(0, 3).map((day, i) => (
                    <View key={`${day.date}-${i}`} style={styles.weatherDay}>
                      <Text style={styles.weatherDayLabel}>{day.label}</Text>
                      <Text style={styles.weatherDayIcon}>{day.icon}</Text>
                      <Text style={styles.weatherDayTemp}>{day.tempMax}°</Text>
                    </View>
                  ))
                ) : (
                  [0, 1, 2].map((i) => (
                    <View key={i} style={styles.weatherDay}>
                      <Text style={styles.weatherDayLabel}>—</Text>
                      <Text style={styles.weatherDayIcon}>·</Text>
                      <Text style={styles.weatherDayTemp}>—</Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          </AppCard>
        </View>

        {/* ── PROGRESS CARD (etapy) ── */}
        <View style={styles.progressCardOuter}>
          <AppCard contentStyle={styles.progressCard} glow>
            <View pointerEvents="none" style={styles.progressTopSheen} />
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>{t('progress.currentStageLabel')}</Text>
              {progressLoading
                ? <Text style={styles.progressValue}>{t('common:loading')}</Text>
                : <Text style={styles.progressValue}>{obecnyEtap}</Text>
              }
            </View>

            <View style={styles.progressColumn}>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>{t('progress.stageRealizationLabel')}</Text>
                {progressLoading
                  ? <Text style={styles.progressValue}>{t('common:loading')}</Text>
                  : <Text style={styles.progressValue}>{`${progressPercent}%`}</Text>
                }
              </View>

              <View style={styles.stageProgressTrack}>
                <Animated.View style={[styles.stageProgressFill, { width: `${progressPercent}%` as any }]} />
              </View>
              <Text style={styles.stageProgressHint}>
                {progressLoading
                  ? t('common:loading')
                  : t('progress.stageRealizationHint', {
                      done: milestonesText.split(' / ')[0] ?? '0',
                      total: milestonesText.split(' / ')[1] ?? '0',
                    })}
              </Text>
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
        <View style={styles.budgetCarouselOuter}>
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
              setTimeout(() => {
                listRef.current?.scrollToOffset({ offset: 0, animated: false });
                setActiveIndex(0);
              }, 80);
            }}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              { useNativeDriver: true }
            )}
            onMomentumScrollEnd={handleMomentumEnd}
            renderItem={({ item, index }) => {
              const center = index * SNAP;
              const inputRange = [center - SNAP, center, center + SNAP];
              const scale = scrollX.interpolate({ inputRange, outputRange: [0.87, 1.06, 0.87], extrapolate: 'clamp' });
              const opacity = scrollX.interpolate({ inputRange, outputRange: [0.68, 1, 0.68], extrapolate: 'clamp' });
              const glow = scrollX.interpolate({ inputRange, outputRange: [0, 1, 0], extrapolate: 'clamp' });
              const translateY = scrollX.interpolate({ inputRange, outputRange: [16, 0, 16], extrapolate: 'clamp' });
              const translateX = scrollX.interpolate({ inputRange, outputRange: [14, 0, -14], extrapolate: 'clamp' });
              const rotateY = scrollX.interpolate({ inputRange, outputRange: ['12deg', '0deg', '-12deg'], extrapolate: 'clamp' });
              const isActiveSlide = index === activeIndex;

              return (
                <Animated.View
                  style={[
                    styles.donutSlide,
                    {
                      width: CARD_W,
                      opacity,
                      transform: [
                        { perspective: 1200 },
                        { translateX },
                        { translateY },
                        { rotateY },
                        { scale },
                      ],
                    },
                  ]}
                >
                  <Animated.View pointerEvents="none" style={[styles.donutGlowWrap, { opacity: glow }]} />
                  <View style={styles.donutInnerWrap}>
                    <FuturisticDonutSvg
                      value={item.value}
                      label={item.label}
                      onPressLabel={item.onPress}
                      isActive={isActiveSlide}
                      size={198}
                      stroke={15}
                    />
                    {item.key === 'budzet' && (
                      <Text style={styles.donutSubText}>
                        {statusLoading ? t('common:dash') : `${formatAppCurrency(spentTotal, appLocale, currency)} / ${formatAppCurrency(plannedBudget, appLocale, currency)}`}
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
                          : overallMilestonesText !== t('common:dash')
                          ? t('progress.completed', { milestones: overallMilestonesText })
                          : t('progress.noStages')}
                      </Text>
                    )}
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
              { icon: '💸', label: t('quickActions.addExpense'), route: '/(app)/(tabs)/budzet?openAdd=1' },
              { icon: '📷', label: t('quickActions.addPhoto'), route: '/(app)/(tabs)/zdjecia?openAdd=1' },
              { icon: '📄', label: t('quickActions.addDocument'), displayLabel: t('quickActions.addDocument').replace(/\s+/, '\n'), route: '/(app)/(tabs)/dokumenty?openAdd=1' },
              { icon: '✍️', label: t('quickActions.addEntry'), route: '/(app)/(tabs)/wiecej/dziennik?openAdd=1' },
            ] as any[]).map((qa, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.85}
                onPress={() => qa.action ? qa.action() : router.push(qa.route)}
                style={styles.qaCard}
              >
                <BlurView intensity={14} tint="dark" style={styles.qaBlur}>
                  <Text style={styles.qaIcon}>{qa.icon}</Text>
                  <Text style={styles.qaLabel}>{qa.displayLabel ?? qa.label}</Text>
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
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            if (showDatePicker) {
              setShowDatePicker(false);
              return;
            }
            if (showTimePicker) {
              setShowTimePicker(false);
              return;
            }
            setTaskModalOpen(false);
          }}
        >
          <Pressable style={styles.modalCard} onPress={Keyboard.dismiss}>
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
          </Pressable>
        </Pressable>
      </Modal>
    </AppScreen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  content: { paddingTop: 6, paddingHorizontal: 18, paddingBottom: 140 },

  // ── HERO — ZMIENIONE (tylko ta sekcja, reszta styles identyczna z doc 13) ──
  hero: { marginTop: 0, marginBottom: 8 },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    marginLeft: -14,
  },
  heroLogo: {
    width: 100,
    height: 100,
    flexShrink: 0,
    opacity: 0.98,
  },
  heroTitleWrap: {
    flex: 1,
    position: 'relative',
    minWidth: 0,
    marginLeft: -10,
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
    width: '100%',
    fontFamily: 'Rubik_800ExtraBold',
    color: '#34f0c8',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(25,112,92,0.18)',
    textShadowRadius: 18,
  },
  heroName: {
    width: '100%',
    marginTop: -4,
    fontFamily: 'Rubik_800ExtraBold',
    color: '#34f0c8',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(25,112,92,0.18)',
    textShadowRadius: 18,
  },
  heroSubtitleWrap: { marginTop: 2, width: '100%' },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 16.5,
    fontWeight: '500',
    lineHeight: 21,
    maxWidth: '96%',
  },
  // ── koniec zmian hero ──

  weatherCardOuter: { marginTop: 10 },
  weatherCard: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(9,11,14,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  weatherLeft: {
    flex: 0.58,
    minWidth: 0,
    justifyContent: 'center',
  },
  weatherLeftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  weatherLeftIcon: {
    fontSize: 21,
    lineHeight: 23,
    marginTop: 0,
  },
  weatherLeftTextWrap: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  weatherLeftHint: {
    color: 'rgba(255,255,255,0.66)',
    fontSize: 10.5,
    lineHeight: 13,
    marginTop: 0,
  },
  weatherCta: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.20)',
  },
  weatherCtaText: {
    color: '#D8FFF6',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0,
  },
  weatherDaysWrap: {
    flex: 0.42,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 3,
    alignItems: 'center',
  },
  weatherDay: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
  },
  weatherDayLabel: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 9,
    lineHeight: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  weatherDayIcon: {
    fontSize: 19,
    lineHeight: 21,
    marginTop: 2,
  },
  weatherDayTemp: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '800',
    marginTop: 1,
  },

  briefOuter: { marginTop: 10, borderRadius: 20, overflow: 'hidden' },
  briefCard: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'rgba(37,240,200,0.04)', borderWidth: 1, borderColor: 'rgba(37,240,200,0.14)' },
  briefRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  briefIcon: { fontSize: 16, marginTop: 1 },
  briefText: { flex: 1, color: 'rgba(255,255,255,0.80)', fontSize: 13.5, fontWeight: '700', lineHeight: 20 },

  progressCardOuter: {
    marginTop: 10,
    borderRadius: 28,
    shadowColor: NEON,
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  progressCard: {
    borderRadius: 28,
    padding: 14,
    backgroundColor: 'rgba(10,12,15,0.52)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.16)',
    overflow: 'hidden',
  },
  progressColumn: { gap: 6, marginTop: 0 },
  progressRow: { paddingVertical: 6 },
  progressLabel: { color: 'rgba(255,255,255,0.44)', fontSize: 12.5, fontWeight: '800', letterSpacing: 0.9 },
  progressValue: { marginTop: 6, color: '#FFFFFF', fontSize: 18, fontWeight: '900', letterSpacing: -0.2, textShadowColor: 'rgba(37,240,200,0.22)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },

  miniBarWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  miniBarTrack: { flex: 1, height: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  miniBarFill: { height: '100%', backgroundColor: NEON, borderRadius: 999, shadowColor: NEON, shadowOpacity: 0.58, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  miniBarLabel: { color: NEON, fontSize: 11.5, fontWeight: '900', minWidth: 32, textAlign: 'right', textShadowColor: 'rgba(37,240,200,0.28)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
  stageProgressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.09)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  stageProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#35F3CE',
    shadowColor: NEON,
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  stageProgressHint: { marginTop: 2, color: 'rgba(255,255,255,0.66)', fontSize: 12, fontWeight: '700' },
  progressTopSheen: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 0,
    height: 42,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },

  estimatedWrap: { paddingTop: 8, paddingBottom: 12 },
  estimatedValue: { marginTop: 6, color: 'rgba(255,255,255,0.82)', fontSize: 14.5, fontWeight: '800' },

  sep: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },

  centerBtnWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  centerBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(37,240,200,0.10)', borderWidth: 1, borderColor: 'rgba(37,240,200,0.22)' },
  centerBtnText: { color: NEON, fontSize: 12.5, fontWeight: '800', letterSpacing: 0.2 },

  carouselHintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 },
  carouselHintText: { display: 'none' } as any,
  carouselHintArrow: { color: 'rgba(37,240,200,0.40)', fontSize: 18, fontWeight: '900' },

  budgetCarouselOuter: {
    marginTop: 12,
    paddingVertical: 8,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.015)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  donutSlide: { borderRadius: 24, overflow: 'visible' },
  donutGlowWrap: { position: 'absolute', left: 16, right: 16, top: 14, bottom: 18, borderRadius: 999, shadowColor: NEON, shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
  donutInnerWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  donutSubText: { marginTop: 8, color: 'rgba(255,255,255,0.46)', fontSize: 12.5, fontWeight: '700' },
  sectionWrap: { marginTop: 18 },
  sectionTitleWrap: { justifyContent: 'center', marginBottom: 12 },
  sectionOuter: { borderRadius: 28, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.34, shadowRadius: 22, shadowOffset: { width: 0, height: 12 } },
  sectionGlass: { borderRadius: 28, padding: 16, backgroundColor: 'rgba(255,255,255,0.024)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },

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
