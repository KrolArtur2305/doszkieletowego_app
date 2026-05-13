import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';

import { supabase } from '../../../../lib/supabase';
import { formatAppCurrency, useCurrency } from '../../../../lib/currency';
import {
  getBudgetCategoryKey,
  getBudgetCategoryLabel,
  type BudgetCategoryValue,
} from '../../../../lib/localizedLabels';
import { useSupabaseAuth } from '../../../../hooks/useSupabaseAuth';
import {
  filterWorkflowStages,
  getSuggestionStageCodesFromCurrentStageCode,
  preferredStartStageCode,
  resolveRuntimeCurrentStageCode,
  workflowBuildType,
} from '../../../../lib/buildWorkflow';
import { getSuggestionDisplayName } from '../../../../lib/suggestionLabels';
import { FuturisticDonutSvg } from '../../../../components/FuturisticDonutSvg';
import { FloatingAddButton } from '../../../../components/FloatingAddButton';
import { AppButton, AppCard, AppInput, AppScreen } from '../../../../src/ui/components';
import { colors, spacing, typography } from '../../../../src/ui/theme';
import { RADIUS } from '../../../../theme';

const ACCENT = colors.accent;
const NEON = colors.accentBright;
const logo = require('../../../assets/logo.png');
const STATUS_PAID = 'poniesiony';
const STATUS_PLANNED = 'zaplanowany';
const TYPE_MATERIAL = 'material';
const TYPE_SERVICE = 'service';
const TYPE_MIXED = 'mixed';

const CATEGORY_OPTIONS = [
  { value: 'Stan zero' },
  { value: 'Stan surowy otwarty' },
  { value: 'Stan surowy zamknięty' },
  { value: 'Instalacje' },
  { value: 'Stan deweloperski' },
  { value: 'Inne' },
] as const;

type CategoryValue = BudgetCategoryValue;

const safeNumber = (v: any) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const normalize = (s: any) => String(s ?? '').trim().toLowerCase();

const normalizeExpenseStatus = (status: any): typeof STATUS_PAID | typeof STATUS_PLANNED => {
  const value = normalize(status);
  if (value === STATUS_PLANNED || value === 'planned' || value === 'upcoming') return STATUS_PLANNED;
  return STATUS_PAID;
};

const normalizeExpenseType = (type: any): typeof TYPE_MATERIAL | typeof TYPE_SERVICE => {
  const value = normalize(type);
  if (value === TYPE_SERVICE || value === 'usluga' || value === 'usługa' || value === 'service') return TYPE_SERVICE;
  return TYPE_MATERIAL;
};

const expenseDateForMonth = (expense: WydatkiRow) => {
  const status = normalizeExpenseStatus(expense.status);
  if (status === STATUS_PLANNED) return expense.planowana_data || expense.data || expense.created_at;
  return expense.data;
};

const monthKeyFromDate = (dateRaw: any) => {
  if (!dateRaw) return null;
  const d = new Date(dateRaw);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const formatMonthLabel = (monthKey: string, locale: string) => {
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(year, (month || 1) - 1, 1);
  if (Number.isNaN(d.getTime())) return monthKey;
  return d.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
};

const formatDateByLocale = (dateRaw: any, locale: string) => {
  if (!dateRaw) return '—';
  const d = new Date(dateRaw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale);
};

const toYYYYMMDD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function inferCategoryFromStage(stageName: string | null | undefined): CategoryValue {
  return getBudgetCategoryKey(stageName);
}

type WydatkiRow = {
  id: string;
  nazwa: string | null;
  kategoria: string | null;
  kwota: number | string | null;
  data: string | null;
  status: string | null;
  typ?: string | null;
  etap_id?: string | null;
  planowana_data?: string | null;
  created_at: string | null;
  opis: string | null;
  sklep: string | null;
  plik: string | null;
  suggestion_key?: string | null;
};

type EtapRow = {
  id: string;
  nazwa: string | null;
  nazwa_code?: string | null;
  status: string | null;
  kolejnosc: number | null;
};

type BudgetStageSuggestion = {
  id: string;
  build_type: string | null;
  stage_code: string | null;
  expense_key: string | null;
  expense_name_key: string | null;
  default_type: string | null;
  priority: number | null;
  is_active: boolean | null;
};

type SuggestionView = BudgetStageSuggestion & {
  stage_id?: string | null;
  stage_name?: string | null;
};

type PickedFile = {
  name: string;
  mimeType: string;
  uri: string;
  size?: number;
};
const MAX_RECEIPT_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_RECEIPT_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic']);

type FilterType = 'all' | 'spent' | 'planned';
type SortType = 'date' | 'amount' | 'stage';

function guessMime(name: string, fallback?: string) {
  if (fallback) return fallback;
  const lower = (name || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  return 'application/octet-stream';
}

function isAllowedReceiptFile(file?: PickedFile | null) {
  const mime = String(file?.mimeType || '').toLowerCase();
  if (mime === 'application/pdf' || mime.startsWith('image/')) return true;
  const ext = String(file?.name || '').split('.').pop()?.toLowerCase() || '';
  return ALLOWED_RECEIPT_EXTENSIONS.has(ext);
}

async function uriToArrayBuffer(uri: string, readFileFailedText: string): Promise<ArrayBuffer> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`${readFileFailedText}: ${res.status} ${res.statusText}`);
  return await res.arrayBuffer();
}

export default function BudzetScreen() {
  const { t, i18n } = useTranslation('budget');
  const { currency } = useCurrency();
  const router = useRouter();
  const { session, loading: authLoading } = useSupabaseAuth();
  const userId = session?.user?.id;
  const datePickerLocale = useMemo(() => {
    const lang = i18n.resolvedLanguage || i18n.language;
    if (!lang) return 'pl-PL';
    if (lang.startsWith('pl')) return 'pl-PL';
    if (lang.startsWith('de')) return 'de-DE';
    return 'en-US';
  }, [i18n.language, i18n.resolvedLanguage]);

  const scrollRef = useRef<ScrollView>(null);
  const topPad = 0;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [plannedBudget, setPlannedBudget] = useState(0);
  const [dates, setDates] = useState<{ start?: string | null; end?: string | null }>({ start: null, end: null });
  const [wydatki, setWydatki] = useState<WydatkiRow[]>([]);
  const [etapy, setEtapy] = useState<EtapRow[]>([]);
  const [stageSuggestions, setStageSuggestions] = useState<SuggestionView[]>([]);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);

  // filter + show more

  // modal
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingExpense, setEditingExpense] = useState<WydatkiRow | null>(null);

  const [fNazwa, setFNazwa] = useState('');
  const [fKategoria, setFKategoria] = useState<CategoryValue>('Inne');
  const [fKwota, setFKwota] = useState('');
  const [fStatus, setFStatus] = useState<typeof STATUS_PAID | typeof STATUS_PLANNED>(STATUS_PAID);
  const [fTyp, setFTyp] = useState<typeof TYPE_MATERIAL | typeof TYPE_SERVICE>(TYPE_MATERIAL);
  const [fPlanowanaData, setFPlanowanaData] = useState('');
  const [fEtapId, setFEtapId] = useState<string | null>(null);
  const [fSuggestionKey, setFSuggestionKey] = useState<string | null>(null);
  const [fData, setFData] = useState('');
  const [fOpis, setFOpis] = useState('');
  const [fSklep, setFSklep] = useState('');
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [currentStageCategory, setCurrentStageCategory] = useState<CategoryValue>('Inne');

  // date picker
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState<Date>(() => new Date());

  // ── Computed totals ──
  const spentTotal = useMemo(
    () => wydatki.filter((w) => normalizeExpenseStatus(w.status) === STATUS_PAID).reduce((a, w) => a + safeNumber(w.kwota), 0),
    [wydatki]
  );
  const upcomingTotal = useMemo(
    () => wydatki.filter((w) => normalizeExpenseStatus(w.status) === STATUS_PLANNED).reduce((a, w) => a + safeNumber(w.kwota), 0),
    [wydatki]
  );

  const remaining = useMemo(() => Math.max(0, plannedBudget - spentTotal), [plannedBudget, spentTotal]);
  const budgetUtil = useMemo(() => (plannedBudget > 0 ? spentTotal / plannedBudget : 0), [plannedBudget, spentTotal]);

  const timeUtil = useMemo(() => {
    const start = dates.start ? new Date(dates.start) : null;
    const end = dates.end ? new Date(dates.end) : null;
    if (!start || !end) return 0;
    const now = new Date();
    const total = end.getTime() - start.getTime();
    if (total <= 0) return 0;
    const elapsed = now.getTime() - start.getTime();
    return Math.max(0, Math.min(1, elapsed / total));
  }, [dates]);

  const stageNameById = useMemo(() => {
    const out: Record<string, string> = {};
    etapy.forEach((e) => {
      if (e.id && e.nazwa) out[e.id] = e.nazwa;
    });
    return out;
  }, [etapy]);

  const plannedExpenses = useMemo(
    () => wydatki.filter((w) => normalizeExpenseStatus(w.status) === STATUS_PLANNED),
    [wydatki]
  );

  const paidExpenses = useMemo(
    () => wydatki.filter((w) => normalizeExpenseStatus(w.status) === STATUS_PAID),
    [wydatki]
  );

  const topSuggestedExpenses = useMemo(() => stageSuggestions.slice(0, 3), [stageSuggestions]);

  const topPaidExpenses = useMemo(
    () => [...paidExpenses].sort((a, b) => safeNumber(b.kwota) - safeNumber(a.kwota)).slice(0, 3),
    [paidExpenses]
  );

  const monthlyExpenses = useMemo(() => {
    const map = new Map<string, { month: string; paid: number; planned: number }>();
    for (const expense of wydatki) {
      const key = monthKeyFromDate(expenseDateForMonth(expense));
      if (!key) continue;
      const current = map.get(key) ?? { month: key, paid: 0, planned: 0 };
      const amount = safeNumber(expense.kwota);
      if (normalizeExpenseStatus(expense.status) === STATUS_PLANNED) current.planned += amount;
      else current.paid += amount;
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [wydatki]);

  const maxMonthlyValue = useMemo(
    () => Math.max(1, ...monthlyExpenses.map((m) => m.paid + m.planned)),
    [monthlyExpenses]
  );

  const typeTotals = useMemo(() => {
    const totals = { material: 0, service: 0 };
    for (const expense of wydatki) {
      const type = normalizeExpenseType(expense.typ);
      totals[type] += safeNumber(expense.kwota);
    }
    return totals;
  }, [wydatki]);

  const typeTotal = typeTotals.material + typeTotals.service;
  const materialPct = typeTotal > 0 ? Math.round((typeTotals.material / typeTotal) * 100) : 0;
  const servicePct = typeTotal > 0 ? 100 - materialPct : 0;

  const aiInsight = useMemo(() => {
    if (plannedExpenses.length === 0) return t('insights.empty');
    const biggest = [...plannedExpenses].sort((a, b) => safeNumber(b.kwota) - safeNumber(a.kwota))[0];
    const plannedByMonth = new Map<string, number>();
    for (const expense of plannedExpenses) {
      const key = monthKeyFromDate(expense.planowana_data || expense.data);
      if (!key) continue;
      plannedByMonth.set(key, (plannedByMonth.get(key) ?? 0) + safeNumber(expense.kwota));
    }
    const topMonth = [...plannedByMonth.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topMonth) {
      return t('insights.highestPlannedMonthText', {
        month: formatMonthLabel(topMonth[0], datePickerLocale),
        amount: formatAppCurrency(topMonth[1], datePickerLocale, currency),
      });
    }
    return t('insights.biggestUpcomingText', {
      name: biggest?.nazwa || t('expense.defaultName'),
      amount: formatAppCurrency(safeNumber(biggest?.kwota), datePickerLocale, currency),
    });
  }, [plannedExpenses, datePickerLocale, currency, t]);

  const loadBudget = useCallback(async () => {
    if (authLoading) return;
    if (!userId) return;

    setErrorMsg(null);
    setLoading(true);

    try {
      const invRes = await supabase
        .from('inwestycje')
        .select('budzet, data_start, data_koniec')
        .eq('user_id', userId)
        .maybeSingle();

      if (invRes.error) throw invRes.error;

      setPlannedBudget(safeNumber((invRes.data as any)?.budzet));
      setDates({ start: (invRes.data as any)?.data_start ?? null, end: (invRes.data as any)?.data_koniec ?? null });

      const expRes = await supabase
        .from('wydatki')
        .select('id, nazwa, kategoria, kwota, data, status, typ, etap_id, planowana_data, created_at, opis, sklep, plik, suggestion_key')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (expRes.error) throw expRes.error;
      setWydatki((expRes.data ?? []) as any);

      const authUserRes = await supabase.auth.getUser();
      const authUser = authUserRes.data.user;
      if (!authUser) throw new Error('User not authenticated');

      const profileRes = await supabase
        .from('profiles')
        .select('build_type, current_stage_code, build_stage')
        .eq('user_id', authUser.id)
        .single();
      if (profileRes.error) throw profileRes.error;

      const buildTypeRaw = String((profileRes.data as any)?.build_type ?? '').trim();
      const normalizedBuildType = workflowBuildType(buildTypeRaw);
      const currentStageCodeRaw = String((profileRes.data as any)?.current_stage_code ?? '').trim();
      const currentStageCode = currentStageCodeRaw.toUpperCase();

      console.log('[Budget] build_type', buildTypeRaw);
      console.log('[Budget] normalized_build_type', normalizedBuildType);
      console.log('[Budget] current_stage_code', currentStageCodeRaw);

      const stageRes = await supabase
        .from('etapy')
        .select('id, nazwa, nazwa_code, status, kolejnosc')
        .eq('user_id', userId)
        .order('kolejnosc', { ascending: true });

      if (stageRes.error) throw stageRes.error;
      const stageRows = (stageRes.data ?? []) as EtapRow[];
      setEtapy(stageRows);

      const completedStatuses = new Set(['zrealizowany', 'wykonany', 'done', 'completed', 'ukończony']);
      const activeStage = stageRows.find((row: any) => !completedStatuses.has(normalize(row?.status)));
      const fallbackStage = stageRows[0] ?? null;
      const currentStage = activeStage ?? fallbackStage ?? null;
      setActiveStageId(currentStage?.id ?? null);
      setCurrentStageCategory(inferCategoryFromStage(activeStage?.nazwa ?? fallbackStage?.nazwa ?? null));
      const stageCodes = getSuggestionStageCodesFromCurrentStageCode(normalizedBuildType, currentStageCode);
      const usedSuggestionKeys = new Set(((expRes.data ?? []) as WydatkiRow[]).map((expense) => expense.suggestion_key).filter(Boolean));

      const suggestionRes = await supabase
        .from('budget_stage_suggestions')
        .select('*')
        .eq('build_type', normalizedBuildType)
        .in('stage_code', stageCodes)
        .eq('is_active', true)
        .eq('include_in_budget', true)
        .order('stage_code', { ascending: true })
        .order('priority', { ascending: true });

      const rawSuggestions = (suggestionRes.data ?? []) as BudgetStageSuggestion[];
      const visibleSuggestions = rawSuggestions.filter(
        (suggestion) => !!suggestion.expense_key && !usedSuggestionKeys.has(suggestion.expense_key)
      ).slice(0, 3);

      console.log('[BudgetSuggestionsDebug]', {
        userId,
        normalizedBuildType,
        currentStageCode,
        stageCodes,
        rawSuggestionsCount: rawSuggestions.length,
        usedSuggestionKeys: Array.from(usedSuggestionKeys),
        visibleSuggestionsCount: visibleSuggestions.length,
      });

      if (suggestionRes.error) {
        setStageSuggestions([]);
        return;
      }

      setStageSuggestions(visibleSuggestions);
    } catch (e: any) {
      setErrorMsg(e?.message ?? t('errors.fetchFailed'));
    } finally {
      setLoading(false);
    }
  }, [authLoading, userId]);

  useEffect(() => {
    loadBudget();
  }, [loadBudget]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBudget();
    setRefreshing(false);
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
      type: ['application/pdf', 'image/*'],
    });
    if (res.canceled) return;
    const f = res.assets?.[0];
    if (!f?.uri) return;
    const nextPicked = {
      name: f.name ?? 'plik',
      uri: f.uri,
      mimeType: guessMime(f.name ?? '', f.mimeType ?? undefined),
      size: f.size,
    };

    if (typeof nextPicked.size === 'number' && nextPicked.size <= 0) {
      Alert.alert(t('errorTitle', { defaultValue: 'Błąd' }), t('errors.emptyFile', { defaultValue: 'Wybrany plik jest pusty.' }));
      return;
    }

    if (typeof nextPicked.size === 'number' && nextPicked.size > MAX_RECEIPT_UPLOAD_BYTES) {
      Alert.alert(t('errorTitle', { defaultValue: 'Błąd' }), t('errors.fileTooLarge', { defaultValue: 'Plik jest zbyt duży. Maksymalny rozmiar to 20 MB.' }));
      return;
    }

    if (!isAllowedReceiptFile(nextPicked)) {
      Alert.alert(t('errorTitle', { defaultValue: 'Błąd' }), t('errors.invalidFileType', { defaultValue: 'Dołącz tylko PDF lub obraz paragonu.' }));
      return;
    }

    setPicked(nextPicked);
  };

  const uploadOptionalFile = async (): Promise<string | null> => {
    if (!picked || !userId) return null;
    if (typeof picked.size === 'number' && picked.size <= 0) throw new Error(t('errors.emptyFile', { defaultValue: 'Wybrany plik jest pusty.' }));
    if (typeof picked.size === 'number' && picked.size > MAX_RECEIPT_UPLOAD_BYTES) throw new Error(t('errors.fileTooLarge', { defaultValue: 'Plik jest zbyt duży. Maksymalny rozmiar to 20 MB.' }));
    if (!isAllowedReceiptFile(picked)) throw new Error(t('errors.invalidFileType', { defaultValue: 'Dołącz tylko PDF lub obraz paragonu.' }));
    const safeName = (picked.name || 'plik').replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${userId}/wydatki/${Date.now()}_${safeName}`;
    const ab = await uriToArrayBuffer(picked.uri, t('errors.readFileFailed'));
    if (!ab || ab.byteLength <= 0) throw new Error(t('errors.emptyFile', { defaultValue: 'Wybrany plik jest pusty.' }));
    const up = await supabase.storage.from('paragony').upload(key, ab, { contentType: picked.mimeType, upsert: false });
    if (up.error) throw up.error;
    return key;
  };

  const saveExpense = async () => {
    if (!userId) return;
    const nazwa = fNazwa.trim();
    const kategoria = fKategoria.trim() || 'Inne';
    const kw = safeNumber(fKwota);
    if (!nazwa) return alert(t('alerts.enterName'));
    if (kw <= 0) return alert(t('alerts.amountGreaterThanZero'));

    setSaving(true);
    try {
      const storageKey = await uploadOptionalFile();
      const payload = {
        user_id: userId,
        nazwa,
        kategoria,
        kwota: kw,
        status: fStatus,
        data: fData?.trim() ? fData.trim() : null,
        typ: fTyp,
        etap_id: fEtapId || null,
        suggestion_key: fSuggestionKey || null,
        planowana_data: fStatus === STATUS_PLANNED && fPlanowanaData.trim() ? fPlanowanaData.trim() : null,
        opis: fOpis.trim() || null,
        sklep: fSklep.trim() || null,
        ...(storageKey ? { plik: storageKey } : editingExpense ? {} : { plik: null }),
      };
      const res = editingExpense
        ? await supabase.from('wydatki').update(payload).eq('id', editingExpense.id).eq('user_id', userId).select('id').maybeSingle()
        : await supabase.from('wydatki').insert({ ...payload, user_id: userId }).select('id').maybeSingle();
      if (res.error) {
        if (storageKey) {
          const rollback = await supabase.storage.from('paragony').remove([storageKey]);
          if (rollback.error) {
            console.warn('[Budżet] rollback paragonu nie powiódł się:', rollback.error.message);
          }
        }
        throw res.error;
      }

      setFNazwa(''); setFKategoria('Inne'); setFKwota('');
      setFStatus(STATUS_PAID); setFTyp(TYPE_MATERIAL); setFData(''); setFPlanowanaData(''); setFEtapId(null); setFSuggestionKey(null); setFOpis('');
      setFSklep(''); setPicked(null); setEditingExpense(null);
      setAddOpen(false);
      await loadBudget();
    } catch (e: any) {
      alert(e?.message ?? t('errors.saveFailed', { defaultValue: t('errors.addFailed') }));
    } finally {
      setSaving(false);
    }
  };

  const openDatePicker = () => {
    const base = fData?.trim() ? new Date(fData.trim()) : new Date();
    if (!Number.isNaN(base.getTime())) setDatePickerValue(base);
    setDatePickerOpen(true);
  };

  const openAddExpense = () => {
    setEditingExpense(null);
    setFNazwa('');
    setFKwota('');
    setFKategoria(currentStageCategory || 'Inne');
    setFStatus(STATUS_PAID);
    setFTyp(TYPE_MATERIAL);
    setFData('');
    setFPlanowanaData('');
    setFEtapId(null);
    setFSuggestionKey(null);
    setFOpis('');
    setFSklep('');
    setPicked(null);
    setAddOpen(true);
  };

  const openEditExpense = (expense: WydatkiRow) => {
    setEditingExpense(expense);
    setFNazwa(expense.nazwa || '');
    setFKwota(expense.kwota !== null && expense.kwota !== undefined ? String(expense.kwota) : '');
    setFKategoria(getBudgetCategoryKey(expense.kategoria));
    setFStatus(normalizeExpenseStatus(expense.status));
    setFTyp(normalizeExpenseType(expense.typ));
    setFData(expense.data || '');
    setFPlanowanaData(expense.planowana_data || '');
    setFEtapId(expense.etap_id || null);
    setFSuggestionKey(expense.suggestion_key || null);
    setFOpis(expense.opis || '');
    setFSklep(expense.sklep || '');
    setPicked(null);
    setAddOpen(true);
  };

  const onDatePicked = (event: any, selected?: Date) => {
    if (Platform.OS === 'android') setDatePickerOpen(false);
    if (event?.type === 'dismissed') return;
    const d = selected ?? datePickerValue;
    setDatePickerValue(d);
    setFData(toYYYYMMDD(d));
  };

  const openAllExpenses = useCallback((nextFilter: FilterType, nextSort: SortType = 'date') => {
    router.push({
      pathname: '/budzet/wszystkie',
      params: { filter: nextFilter, sort: nextSort },
    });
  }, [router]);

  const suggestionName = useCallback((suggestion: SuggestionView) => {
    return getSuggestionDisplayName(t, suggestion);
  }, [t]);

  const suggestionTypeLabel = useCallback((type: string | null | undefined) => {
    const normalized = normalize(type);
    if (normalized === TYPE_SERVICE) return t('type.service');
    if (normalized === TYPE_MIXED) return t('type.mixed');
    return t('type.material');
  }, [t]);

  const openSuggestionExpense = useCallback((suggestion: SuggestionView) => {
    setEditingExpense(null);
    setFNazwa(suggestionName(suggestion));
    setFKwota('');
    setFKategoria(inferCategoryFromStage(suggestion.stage_name));
    setFStatus(STATUS_PLANNED);
    setFTyp(normalize(suggestion.default_type) === TYPE_SERVICE ? TYPE_SERVICE : TYPE_MATERIAL);
    setFData('');
    setFPlanowanaData('');
    setFEtapId(suggestion.stage_id || activeStageId);
    setFSuggestionKey(suggestion.expense_key || null);
    setFOpis('');
    setFSklep('');
    setPicked(null);
    setAddOpen(true);
  }, [activeStageId, suggestionName]);

  return (
    <AppScreen>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* HEADER — logo po lewej */}
        <View style={[styles.topBar, { paddingTop: topPad }]}>
          <View style={styles.headerSide}>
            <ExpoImage source={logo} style={styles.headerLogoLarge} contentFit="contain" cachePolicy="memory-disk" />
          </View>
          <View style={styles.headerTitleWrap}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={styles.headerTitleLarge}>
              {t('header.title')}
            </Text>
          </View>
          <View style={styles.headerSide} />
        </View>

        {/* BŁĘDY */}
        {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

        {/* PASEK CZASU — delikatny */}
        {!loading && dates.start && dates.end && (
          <View style={styles.timeBarWrap}>
            <View style={styles.timeBarTrack}>
              <View style={[styles.timeBarFill, { width: `${Math.round(timeUtil * 100)}%` as any }]} />
            </View>
            <View style={styles.timeBarLabels}>
              <Text style={styles.timeBarText}>{t('time.progress')}</Text>
              <Text style={styles.timeBarPct}>{Math.round(timeUtil * 100)}%</Text>
            </View>
          </View>
        )}

        {/* FINANCE OVERVIEW */}
        <View style={styles.financeOverview}>
          {loading ? (
            <View style={{ paddingVertical: 26 }}>
              <ActivityIndicator color={ACCENT} />
            </View>
          ) : (
            <>
              <View style={styles.financeDonutCol}>
                <FuturisticDonutSvg
                  value={clamp01(budgetUtil)}
                  label=""
                  isActive={true}
                  size={152}
                  stroke={13}
                />
                <Text style={styles.donutSubText}>
                  {`${formatAppCurrency(spentTotal, datePickerLocale, currency)} / ${formatAppCurrency(plannedBudget || 0, datePickerLocale, currency)}`}
                </Text>
              </View>
              <View style={styles.financeStatsCol}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('stats.remaining')}</Text>
                  <Text style={styles.statValue}>{formatAppCurrency(remaining, datePickerLocale, currency)}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('stats.planned')}</Text>
                  <Text style={styles.statValue}>{formatAppCurrency(upcomingTotal, datePickerLocale, currency)}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>{t('stats.spent')}</Text>
                  <Text style={styles.statValue}>{formatAppCurrency(spentTotal, datePickerLocale, currency)}</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* AI BUDGET INSIGHTS */}
        {!loading && (
          <View style={styles.buddyWrap}>
            <View style={styles.buddyAvatar}>
              <Feather name="zap" size={16} color={NEON} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.buddyName}>
                {t('insights.title')}
              </Text>
              <Text style={styles.buddyText}>
                {aiInsight}
              </Text>
            </View>
          </View>
        )}

        <AppCard contentStyle={styles.card}>
          <View style={styles.listHeaderStack}>
            <Text style={styles.sectionTitleSoft}>{t('sections.toPlan')}</Text>
            <Text style={styles.sectionSubtitleSoft}>{t('sections.toPlanSubtitle')}</Text>
          </View>
          {loading ? (
            <ActivityIndicator color={ACCENT} />
          ) : topSuggestedExpenses.length === 0 ? (
            <Text style={styles.empty}>{t('empty.noSuggestions')}</Text>
          ) : (
            topSuggestedExpenses.map((suggestion) => (
              <TouchableOpacity
                key={suggestion.id}
                style={styles.suggestionRow}
                onPress={() => openSuggestionExpense(suggestion)}
                activeOpacity={0.9}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionTitle} numberOfLines={1}>{suggestionName(suggestion)}</Text>
                  <Text style={styles.suggestionHint}>{t('suggestions.mayBeNeededAtThisStage')}</Text>
                </View>
                <View style={styles.suggestionMiniCta}>
                  <Text style={styles.suggestionMiniCtaText}>{t('suggestions.add')}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </AppCard>

        <AppCard contentStyle={styles.card}>
          <View style={styles.listHeaderRow}>
            <Text style={styles.listTitle}>{t('sections.monthly')}</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}><View style={[styles.legendDot, styles.legendPaid]} /><Text style={styles.legendText}>{t('status.paid')}</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, styles.legendPlanned]} /><Text style={styles.legendText}>{t('status.planned')}</Text></View>
          </View>
          {monthlyExpenses.length === 0 ? (
            <Text style={styles.empty}>{t('empty.noExpenses')}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthChart}>
              {monthlyExpenses.map((m) => {
                const paidH = Math.max(2, Math.round((m.paid / maxMonthlyValue) * 110));
                const plannedH = Math.max(2, Math.round((m.planned / maxMonthlyValue) * 110));
                return (
                  <View key={m.month} style={styles.monthCol}>
                    <View style={styles.monthBars}>
                      <View style={[styles.monthBar, styles.monthBarPaid, { height: paidH }]} />
                      <View style={[styles.monthBar, styles.monthBarPlanned, { height: plannedH }]} />
                    </View>
                    <Text style={styles.vLabel} numberOfLines={1}>{formatMonthLabel(m.month, datePickerLocale)}</Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </AppCard>

        <AppCard contentStyle={styles.card}>
          {typeTotal <= 0 ? (
            <Text style={styles.empty}>{t('empty.noExpenses')}</Text>
          ) : (
            <View style={styles.typeDonutRow}>
              <View style={styles.typeDonutWrap}>
                <FuturisticDonutSvg
                  value={clamp01(materialPct / 100)}
                  label=""
                  isActive={true}
                  size={132}
                  stroke={12}
                />
              </View>
              <View style={styles.typeLegend}>
                <View style={styles.typeLegendRow}>
                  <View style={[styles.typeSwatch, styles.typeSwatchMaterial]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.typeLegendLabel}>{t('type.material')}</Text>
                    <Text style={styles.typeLegendAmount}>
                      {formatAppCurrency(typeTotals.material, datePickerLocale, currency)}
                    </Text>
                  </View>
                  <Text style={styles.typePercent}>{materialPct}%</Text>
                </View>
                <View style={styles.typeLegendRow}>
                  <View style={[styles.typeSwatch, styles.typeSwatchService]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.typeLegendLabel}>{t('type.service')}</Text>
                    <Text style={styles.typeLegendAmount}>
                      {formatAppCurrency(typeTotals.service, datePickerLocale, currency)}
                    </Text>
                  </View>
                  <Text style={styles.typePercent}>{servicePct}%</Text>
                </View>
              </View>
            </View>
          )}
        </AppCard>

        <AppCard contentStyle={styles.card}>
          <View style={styles.listHeaderRow}>
            <Text style={styles.listTitle}>{t('sections.topExpenses')}</Text>
            <TouchableOpacity onPress={() => openAllExpenses('spent', 'amount')} activeOpacity={0.8}>
              <Text style={styles.seeAllText}>{t('common.seeAll')}</Text>
            </TouchableOpacity>
          </View>
          {topPaidExpenses.length === 0 ? (
            <Text style={styles.empty}>{t('empty.noExpenses')}</Text>
          ) : (
            topPaidExpenses.map((w, index) => (
              <TouchableOpacity key={w.id} style={styles.compactRow} onPress={() => openEditExpense(w)} activeOpacity={0.9}>
                <Text style={styles.rankText}>#{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={1}>{w.nazwa || t('expense.defaultName')}</Text>
                  <Text style={styles.itemMeta} numberOfLines={1}>
                    {w.data ? formatDateByLocale(w.data, datePickerLocale) : '—'}
                  </Text>
                </View>
                <View style={styles.topExpenseRight}>
                  <Text style={styles.itemAmount}>{formatAppCurrency(safeNumber(w.kwota), datePickerLocale, currency)}</Text>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>
                      {normalizeExpenseType(w.typ) === TYPE_MATERIAL ? t('type.material') : t('type.service')}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </AppCard>

        <TouchableOpacity style={styles.allExpensesLink} onPress={() => openAllExpenses('all', 'date')} activeOpacity={0.86}>
          <Text style={styles.allExpensesLinkText}>{t('list.openAll')}</Text>
          <Feather name="arrow-right" size={16} color={NEON} />
        </TouchableOpacity>

        {/* MODAL */}
        <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => setAddOpen(false)}>
          <View style={styles.modalBackdrop}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
            <AppCard contentStyle={styles.modalCard} style={styles.modalCardOuter} withShadow={false}>
              <Text style={styles.modalTitle}>{editingExpense ? t('modal.editTitle') : t('modal.title')}</Text>

              <Text style={styles.lbl}>{t('modal.nameLabel')}</Text>
              <AppInput value={fNazwa} onChangeText={setFNazwa} style={styles.input} placeholder={t('modal.namePlaceholder')} />

              <Text style={styles.lbl}>{t('modal.amountLabel')}</Text>
              <AppInput value={fKwota} onChangeText={setFKwota} style={styles.input} keyboardType="numeric" placeholder={t('modal.amountPlaceholder')} />

              <Text style={styles.lbl}>{t('modal.statusLabel')}</Text>
              <View style={styles.row2}>
                <TouchableOpacity style={[styles.pill, fStatus === STATUS_PAID && styles.pillOn]} onPress={() => setFStatus(STATUS_PAID)}>
                  <Text style={[styles.pillText, fStatus === STATUS_PAID && styles.pillTextOn]}>{t('status.paid')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pill, fStatus === STATUS_PLANNED && styles.pillOn]} onPress={() => setFStatus(STATUS_PLANNED)}>
                  <Text style={[styles.pillText, fStatus === STATUS_PLANNED && styles.pillTextOn]}>{t('status.planned')}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.lbl}>{t('modal.typeLabel')}</Text>
              <View style={styles.row2}>
                <TouchableOpacity style={[styles.pill, fTyp === TYPE_MATERIAL && styles.pillOn]} onPress={() => setFTyp(TYPE_MATERIAL)}>
                  <Text style={[styles.pillText, fTyp === TYPE_MATERIAL && styles.pillTextOn]}>{t('type.material')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pill, fTyp === TYPE_SERVICE && styles.pillOn]} onPress={() => setFTyp(TYPE_SERVICE)}>
                  <Text style={[styles.pillText, fTyp === TYPE_SERVICE && styles.pillTextOn]}>{t('type.service')}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.lbl}>{t('modal.categoryLabel')}</Text>
              <View style={styles.catGrid}>
                {CATEGORY_OPTIONS.map((option) => {
                  const c = option.value;
                  const on = normalize(fKategoria) === normalize(c);
                  return (
                    <TouchableOpacity key={c} onPress={() => setFKategoria(c)} style={[styles.catTile, on && styles.catTileOn]} activeOpacity={0.85}>
                      <Text style={[styles.catTileText, on && styles.catTileTextOn]}>
                        {getBudgetCategoryLabel(option.value, t, true)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.lbl}>{t('modal.dateOptional')}</Text>
              <View style={styles.dateRow}>
                <AppInput value={fData} onChangeText={setFData} style={[styles.input, { flex: 1 }]} placeholder="YYYY-MM-DD" />
                <TouchableOpacity style={styles.calBtn} onPress={openDatePicker} activeOpacity={0.85}>
                  <Text style={styles.calIcon}>📅</Text>
                </TouchableOpacity>
              </View>

              {datePickerOpen && (
                Platform.OS === 'ios' ? (
                  <View style={styles.iosDateWrap}>
                    <DateTimePicker value={datePickerValue} mode="date" display="spinner" locale={datePickerLocale} onChange={onDatePicked} />
                    <TouchableOpacity style={styles.iosDateOk} onPress={() => { setDatePickerOpen(false); setFData(toYYYYMMDD(datePickerValue)); }} activeOpacity={0.85}>
                      <Text style={styles.iosDateOkText}>{t('modal.setDate')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <DateTimePicker value={datePickerValue} mode="date" display="default" locale={datePickerLocale} onChange={onDatePicked} />
                )
              )}

              {fStatus === STATUS_PLANNED && (
                <>
                  <Text style={styles.lbl}>{t('modal.plannedDateLabel')}</Text>
                  <AppInput value={fPlanowanaData} onChangeText={setFPlanowanaData} style={styles.input} placeholder="YYYY-MM-DD" />
                </>
              )}

              {etapy.length > 0 && (
                <>
                  <Text style={styles.lbl}>{t('modal.stageLabel')}</Text>
                  <View style={styles.catGrid}>
                    <TouchableOpacity onPress={() => setFEtapId(null)} style={[styles.catTile, !fEtapId && styles.catTileOn]} activeOpacity={0.85}>
                      <Text style={[styles.catTileText, !fEtapId && styles.catTileTextOn]}>{t('modal.noStage')}</Text>
                    </TouchableOpacity>
                    {etapy.map((etap) => {
                      const on = fEtapId === etap.id;
                      return (
                        <TouchableOpacity key={etap.id} onPress={() => setFEtapId(etap.id)} style={[styles.catTile, on && styles.catTileOn]} activeOpacity={0.85}>
                          <Text style={[styles.catTileText, on && styles.catTileTextOn]} numberOfLines={2}>
                            {etap.nazwa || t('modal.stageFallback')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <Text style={styles.lbl}>{t('modal.descriptionOptional')}</Text>
              <AppInput value={fOpis} onChangeText={setFOpis} style={styles.input} placeholder={t('modal.descriptionPlaceholder')} />

              <Text style={styles.lbl}>{t('modal.storeOptional')}</Text>
              <AppInput value={fSklep} onChangeText={setFSklep} style={styles.input} placeholder={t('modal.storePlaceholder')} />

              <TouchableOpacity style={styles.fileBtn} onPress={pickFile}>
                <Text style={styles.fileBtnText}>{picked ? t('modal.fileSelected', { name: picked.name }) : t('modal.fileOptional')}</Text>
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <AppButton title={t('common.cancel')} variant="secondary" onPress={() => { setAddOpen(false); setEditingExpense(null); }} disabled={saving} style={styles.modalBtn} />
                <AppButton title={saving ? t('common.saving') : t('common.save')} onPress={saveExpense} disabled={saving} style={styles.modalBtn} />
              </View>
            </AppCard>
            </ScrollView>
          </View>
        </Modal>

        <View style={{ height: 26 }} />
      </ScrollView>

      {/* FAB — przyklejony na dole po prawej, zawsze widoczny */}
      <FloatingAddButton onPress={openAddExpense} style={styles.budgetFab} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: 0,
  },

  topBar: {
    paddingHorizontal: 0,
    marginTop: 0,
    paddingBottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSide: {
    width: 116,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  headerTitleLarge: {
    ...typography.screenTitle,
    fontSize: 42,
    lineHeight: 48,
    color: colors.accent,
    textAlign: 'center',
  },
  headerLogoLarge: {
    width: 108,
    height: 108,
  },

  errorText: { color: '#FCA5A5', marginBottom: 10, textAlign: 'center', fontWeight: '800' },

  // ── Pasek czasu ──
  timeBarWrap: { marginBottom: 16 },
  timeBarLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  timeBarText: { color: 'rgba(255,255,255,0.44)', fontSize: 13, fontWeight: '800' },
  timeBarPct: { color: 'rgba(255,255,255,0.44)', fontSize: 13, fontWeight: '800' },
  timeBarTrack: {
    height: 8, borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  timeBarFill: { height: 8, borderRadius: 99, backgroundColor: 'rgba(25,112,92,0.70)' },

  // ── Finance overview ──
  financeOverview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 2,
    marginBottom: 10,
  },
  financeDonutCol: { width: 166, alignItems: 'center' },
  financeStatsCol: { flex: 1, gap: 7 },
  donutSubText: { marginTop: 2, color: 'rgba(255,255,255,0.46)', fontSize: 11, fontWeight: '700', textAlign: 'center' },

  // ── Stats ──
  statBox: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(25,112,92,0.075)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.16)',
    shadowColor: NEON,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  statLabel: { color: '#94A3B8', fontSize: 10.5, fontWeight: '800' },
  statValue: { color: '#F8FAFC', fontSize: 13, fontWeight: '900', marginTop: 3 },

  // ── Buddy widget ──
  buddyWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    marginTop: 8, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 14,
    backgroundColor: 'rgba(37,240,200,0.05)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.11)',
  },
  buddyAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(37,240,200,0.12)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  buddyName: { color: NEON, fontSize: 10, fontWeight: '900', marginBottom: 1, opacity: 0.80 },
  buddyText: { color: 'rgba(255,255,255,0.50)', fontSize: 11.5, lineHeight: 15, fontWeight: '600' },

  allExpensesLink: {
    marginTop: 14,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(25,112,92,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.26)',
  },
  allExpensesLinkText: { color: NEON, fontSize: 13, fontWeight: '900' },

  vLabel: { marginTop: 8, color: 'rgba(255,255,255,0.78)', fontWeight: '900', fontSize: 11, textAlign: 'center' },

  // ── Lista ──
  card: {
    marginTop: 14, borderRadius: RADIUS.card, padding: 16, overflow: 'hidden',
    backgroundColor: 'rgba(25,112,92,0.08)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.24)',
    shadowColor: NEON,
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  listHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  listTitle: { color: '#F8FAFC', fontWeight: '900', fontSize: 16 },
  listHeaderStack: { marginBottom: 10 },
  sectionTitleSoft: { color: '#F8FAFC', fontWeight: '900', fontSize: 15, letterSpacing: 0 },
  sectionSubtitleSoft: { color: 'rgba(148,163,184,0.72)', fontSize: 11, fontWeight: '700', marginTop: 2 },
  seeAllText: { color: NEON, fontSize: 12, fontWeight: '900', opacity: 0.82 },
  compactRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  suggestionRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  suggestionTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  suggestionMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  suggestionPill: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  suggestionPillText: { color: '#C8F7EE', fontSize: 10.5, fontWeight: '800' },
  suggestionHint: { color: 'rgba(148,163,184,0.78)', fontSize: 10.5, fontWeight: '700', marginTop: 5 },
  suggestionMiniCta: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
  },
  suggestionMiniCtaText: { color: NEON, fontSize: 10.5, fontWeight: '900' },
  rankText: { width: 30, color: NEON, fontSize: 14, fontWeight: '900' },
  topExpenseRight: { alignItems: 'flex-end', gap: 6 },
  typeBadge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  typeBadgeText: { color: '#E2E8F0', fontSize: 10, fontWeight: '900' },
  legendRow: { flexDirection: 'row', gap: 14, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendPaid: { backgroundColor: NEON },
  legendPlanned: { backgroundColor: 'rgba(148,163,184,0.82)' },
  legendText: { color: '#94A3B8', fontSize: 12, fontWeight: '800' },
  monthChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 2, paddingRight: 4 },
  monthCol: { alignItems: 'center', minWidth: 46 },
  monthBars: { height: 116, flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  monthBar: { width: 9, borderRadius: 999 },
  monthBarPaid: { backgroundColor: 'rgba(37,240,200,0.82)' },
  monthBarPlanned: { backgroundColor: 'rgba(148,163,184,0.62)' },
  typeDonutRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  typeDonutWrap: { width: 142, alignItems: 'center' },
  typeLegend: { flex: 1, gap: 12 },
  typeLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  typeSwatch: { width: 10, height: 10, borderRadius: 5 },
  typeSwatchMaterial: { backgroundColor: NEON },
  typeSwatchService: { backgroundColor: 'rgba(148,163,184,0.82)' },
  typeLegendLabel: { color: '#F8FAFC', fontSize: 13, fontWeight: '900' },
  typeLegendAmount: { color: '#94A3B8', fontSize: 11, fontWeight: '700', marginTop: 2 },
  typePercent: { color: NEON, fontSize: 16, fontWeight: '900' },

  // Filter pills
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  filterPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  filterPillActive: { borderColor: 'rgba(25,112,92,0.50)', backgroundColor: 'rgba(25,112,92,0.12)' },
  filterPillText: { color: 'rgba(255,255,255,0.40)', fontSize: 12, fontWeight: '800' },
  filterPillTextActive: { color: NEON },
  sortWrap: {
    marginBottom: 12,
    paddingTop: 2,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sortLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '900', marginBottom: 8 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sortPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  sortPillActive: { borderColor: 'rgba(37,240,200,0.42)', backgroundColor: 'rgba(37,240,200,0.10)' },
  sortPillText: { color: 'rgba(255,255,255,0.48)', fontSize: 12, fontWeight: '800' },
  sortPillTextActive: { color: 'rgba(220,255,245,0.98)' },

  empty: { color: '#94A3B8', paddingVertical: 10 },

  itemRow: {
    flexDirection: 'row', gap: 12, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 2,
  },
  itemRowPlanned: { opacity: 0.65 },
  itemName: { color: '#F8FAFC', fontWeight: '800' },
  itemNamePlanned: { color: 'rgba(255,255,255,0.65)' },
  itemMeta: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
  itemAmount: { color: 'rgba(220,255,245,0.95)', fontWeight: '900' },
  itemAmountPlanned: { color: 'rgba(255,255,255,0.40)' },
  fileLink: { color: 'rgba(120,255,220,0.9)', fontWeight: '800', fontSize: 12 },

  // Pokaż więcej
  showMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  showMoreText: { color: NEON, fontSize: 13, fontWeight: '700', opacity: 0.70 },

  trashAction: {
    width: 92, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.16)',
    borderLeftWidth: 1, borderLeftColor: 'rgba(239,68,68,0.35)',
  },
  trashIcon: { fontSize: 18, marginBottom: 4 },
  trashText: { color: '#FCA5A5', fontWeight: '900', fontSize: 12 },

  // ── Modal ──
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#000000',
    paddingTop: 28,
    paddingBottom: 28,
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 18,
  },
  modalCardOuter: { marginBottom: 0, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  modalCard: { padding: 16, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 0, backgroundColor: '#000000' },
  modalTitle: { color: NEON, fontWeight: '900', fontSize: 18, marginBottom: 12, textAlign: 'center' },
  lbl: { color: '#94A3B8', fontSize: 12, marginTop: 10, marginBottom: 6 },
  input: {},
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 2 },
  catTile: {
    width: '30%',
    minWidth: 84,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  catTileOn: { borderColor: 'rgba(25,112,92,0.65)', backgroundColor: 'rgba(25,112,92,0.14)' },
  catTileText: { color: '#94A3B8', fontWeight: '800', fontSize: 12 },
  catTileTextOn: { color: 'rgba(220,255,245,0.98)' },
  row2: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pill: {
    flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.03)',
  },
  pillOn: { borderColor: 'rgba(25,112,92,0.65)', backgroundColor: 'rgba(25,112,92,0.14)' },
  pillText: { color: '#94A3B8', fontWeight: '800' },
  pillTextOn: { color: 'rgba(220,255,245,0.98)' },
  dateRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  calBtn: {
    width: 48, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(25,112,92,0.45)', backgroundColor: 'rgba(25,112,92,0.10)',
  },
  calIcon: { fontSize: 18 },
  iosDateWrap: {
    marginTop: 10, borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.03)',
  },
  iosDateOk: {
    paddingVertical: 10, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(25,112,92,0.10)',
  },
  iosDateOkText: { color: 'rgba(220,255,245,0.98)', fontWeight: '900' },
  fileBtn: {
    marginTop: 12, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'rgba(25,112,92,0.40)', backgroundColor: 'rgba(25,112,92,0.08)',
  },
  fileBtnText: { color: '#E2E8F0', fontWeight: '800', fontSize: 12 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn: { flex: 1 },
  budgetFab: { bottom: 74 },
});
