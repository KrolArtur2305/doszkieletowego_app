import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  RefreshControl,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';

import { supabase } from '../../../../lib/supabase';
import { getFriendlyErrorMessage } from '../../../../lib/errorMessages';
import { fetchCurrentBuildAccess, type BuildAccess } from '../../../../lib/buildAccess';
import { formatAppCurrency, useCurrency } from '../../../../lib/currency';
import { getAppLocale } from '../../../../lib/i18n';
import {
  getBudgetCategoryLabel} from '../../../../lib/localizedLabels';
import {
  expenseCategoryCodeFromLegacyLabel,
  expenseCategoryCodeToLegacyLabel,
  buildStageGroupPickerOptions,
  buildStagePickerOptions,
  getStageDisplayName,
  getStageGroupDisplayName,
  normalizeExpenseType as normalizeExpenseTypeCode,
  stageCodeFromLegacyStage,
  stageGroupCodeFromLegacyStage,
  stageGroupCodeFromStageCode,
  type ExpenseCategoryCode,
  type ExpenseType,
  type StagePickerOption,
  type StageTemplateLike,
  type UserStageLike} from '../../../../lib/stageModel';
import { useSupabaseAuth } from '../../../../hooks/useSupabaseAuth';
import {
  workflowBuildType} from '../../../../lib/buildWorkflow';
import {
  currentSuggestionStage,
  getStageSuggestionItems,
  loadExpenseSuggestionPrefs,
  mergeSuggestionPrefs,
  saveExpenseSuggestionPrefs,
  type ExpenseSuggestionItem,
  type StoredExpenseSuggestionPrefs} from '../../../../lib/budgetExpenseSuggestions';
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
const TYPE_OTHER = 'other';

const CATEGORY_OPTIONS = [
  { value: 'stan_zero' },
  { value: 'sso' },
  { value: 'ssz' },
  { value: 'instalacje' },
  { value: 'wykonczenie' },
  { value: 'other' }] as const;

type CategoryValue = ExpenseCategoryCode;

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

const normalizeExpenseType = (type: any): typeof TYPE_MATERIAL | typeof TYPE_SERVICE | typeof TYPE_MIXED | typeof TYPE_OTHER => {
  const value = normalize(type);
  if (value === TYPE_SERVICE || value === 'usluga' || value === 'usługa' || value === 'service') return TYPE_SERVICE;
  if (value === TYPE_MIXED || value === 'mixed' || value === 'material + usluga' || value === 'material+usluga') return TYPE_MIXED;
  if (value === TYPE_OTHER || value === 'other' || value === 'inne') return TYPE_OTHER;
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

type WydatkiRow = {
  id: string;
  user_id?: string | null;
  investment_id?: string | null;
  nazwa: string | null;
  kategoria: string | null;
  expense_category_code?: string | null;
  kwota: number | string | null;
  data: string | null;
  status: string | null;
  typ?: string | null;
  expense_type?: string | null;
  etap_id?: string | null;
  stage_group_code?: string | null;
  stage_code?: string | null;
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

type BudgetStageSuggestion = ExpenseSuggestionItem & {
  id: string;
  build_type: string | null;
  stage_code: string | null;
  stage_group_code?: string | null;
  expense_name?: string | null;
  expense_key: string | null;
  expense_name_key: string | null;
  default_type: string | null;
  priority: number | null;
  is_active: boolean | null;
  source?: 'system' | 'custom';
  hidden?: boolean;
  notApplicable?: boolean;
};

type SuggestionView = BudgetStageSuggestion & {
  stage_id?: string | null;
  stage_name?: string | null;
  stage_code?: string | null;
};

type PickedFile = {
  name: string;
  mimeType: string;
  uri: string;
  size?: number;
};
type UploadedReceiptFile = {
  receiptPath: string;
  documentPath: string;
};
type ReceiptDocKind = 'paragon' | 'faktura';
const RECEIPT_BUCKET = 'paragony';
const DOCUMENT_RECEIPT_BUCKET = 'dokumenty';
const RECEIPT_BUCKETS = [RECEIPT_BUCKET, DOCUMENT_RECEIPT_BUCKET] as const;
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

function linkedDocumentPathFromReceiptPath(ownerId: string, receiptPath?: string | null) {
  const path = String(receiptPath ?? '').trim();
  if (!path) return null;
  if (path.startsWith('dokumenty/')) return path;
  if (path.startsWith(`${ownerId}/`)) return `dokumenty/${path}`;
  return path;
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
  const params = useLocalSearchParams<{ openAdd?: string }>();
  const { session, loading: authLoading } = useSupabaseAuth();
  const userId = session?.user?.id;
  const datePickerLocale = useMemo(
    () => getAppLocale(i18n.resolvedLanguage || i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );

  const scrollRef = useRef<ScrollView>(null);
  const openedFromParamRef = useRef(false);
  const topPad = 0;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [buildAccess, setBuildAccess] = useState<BuildAccess | null>(null);

  const [plannedBudget, setPlannedBudget] = useState(0);
  const [dates, setDates] = useState<{ start?: string | null; end?: string | null }>({ start: null, end: null });
  const [wydatki, setWydatki] = useState<WydatkiRow[]>([]);
  const [etapy, setEtapy] = useState<EtapRow[]>([]);
  const [stageTemplates, setStageTemplates] = useState<StageTemplateLike[]>([]);
  const [userStages, setUserStages] = useState<UserStageLike[]>([]);
  const [stageSuggestions, setStageSuggestions] = useState<SuggestionView[]>([]);
  const [suggestionPrefs, setSuggestionPrefs] = useState<StoredExpenseSuggestionPrefs>({
    hidden: [],
    notApplicable: [],
    custom: []});
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [currentWorkflowType, setCurrentWorkflowType] = useState<string>('murowany');
  const [currentStageCode, setCurrentStageCode] = useState<string>('');

  // filter + show more

  // modal
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingExpense, setEditingExpense] = useState<WydatkiRow | null>(null);

  const [fNazwa, setFNazwa] = useState('');
  const [fKategoria, setFKategoria] = useState<ExpenseCategoryCode>('other');
  const [fKwota, setFKwota] = useState('');
  const [fStatus, setFStatus] = useState<typeof STATUS_PAID | typeof STATUS_PLANNED>(STATUS_PAID);
  const [fTyp, setFTyp] = useState<ExpenseType>('material');
  const [fPlanowanaData, setFPlanowanaData] = useState('');
  const [fEtapId, setFEtapId] = useState<string | null>(null);
  const [fStageKey, setFStageKey] = useState<string | null>(null);
  const [fSuggestionKey, setFSuggestionKey] = useState<string | null>(null);
  const [fData, setFData] = useState('');
  const [fOpis, setFOpis] = useState('');
  const [fSklep, setFSklep] = useState('');
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [fAttachmentKind, setFAttachmentKind] = useState<ReceiptDocKind>('paragon');
  const [receiptKindByPath, setReceiptKindByPath] = useState<Record<string, ReceiptDocKind>>({});
  const [stageMenuOpen, setStageMenuOpen] = useState(false);

  // date picker
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState<Date>(() => new Date());

  // ¦¦ Computed totals ¦¦
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
      if (e.id) out[e.id] = getStageDisplayName(t, { stageCode: e.nazwa_code, legacyName: e.nazwa });
    });
    return out;
  }, [etapy, t]);

  const stageOptions = useMemo(
    () => buildStagePickerOptions(t, currentWorkflowType, stageTemplates, userStages, etapy),
    [currentWorkflowType, etapy, stageTemplates, t, userStages]
  );

  const stageGroupOptions = useMemo(
    () => buildStageGroupPickerOptions(t, stageOptions),
    [stageOptions, t]
  );

  const selectedStageOption = useMemo(
    () => stageGroupOptions.find((option) => option.key === fStageKey) ?? null,
    [fStageKey, stageGroupOptions]
  );

  const modalStageOptions = useMemo<StagePickerOption[]>(
    () => stageGroupOptions.length > 0
      ? stageGroupOptions
      : etapy.map((etap, index) => ({
          key: `legacy:${etap.id}`,
          label: getStageGroupDisplayName(t, stageGroupCodeFromLegacyStage(etap)),
          legacyId: etap.id,
          stageCode: stageCodeFromLegacyStage(etap, index),
          stageGroupCode: stageGroupCodeFromLegacyStage(etap),
          source: 'legacy',
          orderIndex: index})),
    [etapy, stageGroupOptions, t]
  );

  const selectedModalStageLabel = useMemo(() => {
    if (!fStageKey && !fEtapId) return t('modal.noStage');
    const selected = modalStageOptions.find((option) =>
      stageGroupOptions.length > 0 ? option.key === fStageKey : option.legacyId === fEtapId
    );
    return selected?.label ?? t('modal.noStage');
  }, [fEtapId, fStageKey, modalStageOptions, stageGroupOptions.length, t]);

  const plannedExpenses = useMemo(
    () => wydatki.filter((w) => normalizeExpenseStatus(w.status) === STATUS_PLANNED),
    [wydatki]
  );

  const paidExpenses = useMemo(
    () => wydatki.filter((w) => normalizeExpenseStatus(w.status) === STATUS_PAID),
    [wydatki]
  );

  const topSuggestedExpenses = useMemo(
    () => stageSuggestions.filter((suggestion) => !suggestion.hidden && !suggestion.notApplicable).slice(0, 3),
    [stageSuggestions]
  );

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
    const totals = { material: 0, service: 0, mixed: 0, other: 0 };
    for (const expense of wydatki) {
      const type = normalizeExpenseTypeCode(expense.expense_type ?? expense.typ);
      totals[type] += safeNumber(expense.kwota);
    }
    return totals;
  }, [wydatki]);

  const typeTotal = typeTotals.material + typeTotals.service + typeTotals.mixed + typeTotals.other;
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
        amount: formatAppCurrency(topMonth[1], datePickerLocale, currency)});
    }
    return t('insights.biggestUpcomingText', {
      name: biggest?.nazwa || t('expense.defaultName'),
      amount: formatAppCurrency(safeNumber(biggest?.kwota), datePickerLocale, currency)});
  }, [plannedExpenses, datePickerLocale, currency, t]);

  const loadBudget = useCallback(async () => {
    if (authLoading) return;
    if (!userId) return;

    setErrorMsg(null);
    setLoading(true);

    try {
      const authUserRes = await supabase.auth.getUser();
      const authUser = authUserRes.data.user;
      if (!authUser) throw new Error(t('errors.authRequired'));

      const access = buildAccess ?? (await fetchCurrentBuildAccess(authUser.id));
      if (access) setBuildAccess(access);

      const scopeInvestmentId = access?.investmentId ?? null;
      const ownerUserId = access?.ownerUserId ?? authUser.id;

      const invRes = scopeInvestmentId
        ? await supabase
            .from('inwestycje')
            .select('budzet, data_start, data_koniec, id, user_id, nazwa')
            .eq('id', scopeInvestmentId)
            .maybeSingle()
        : await supabase
            .from('inwestycje')
            .select('budzet, data_start, data_koniec, id, user_id, nazwa')
            .eq('user_id', userId)
            .maybeSingle();

      if (invRes.error) throw invRes.error;

      setPlannedBudget(safeNumber((invRes.data as any)?.budzet));
      setDates({ start: (invRes.data as any)?.data_start ?? null, end: (invRes.data as any)?.data_koniec ?? null });

      const expRes = scopeInvestmentId
        ? await supabase
            .from('wydatki')
            .select('id, user_id, investment_id, nazwa, kategoria, expense_category_code, kwota, data, status, typ, expense_type, etap_id, stage_group_code, stage_code, planowana_data, created_at, opis, sklep, plik, suggestion_key')
            .eq('investment_id', scopeInvestmentId)
            .order('created_at', { ascending: false })
        : await supabase
            .from('wydatki')
            .select('id, user_id, investment_id, nazwa, kategoria, expense_category_code, kwota, data, status, typ, expense_type, etap_id, stage_group_code, stage_code, planowana_data, created_at, opis, sklep, plik, suggestion_key')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

      if (expRes.error) throw expRes.error;
      setWydatki((expRes.data ?? []) as any);

      const docsRes = scopeInvestmentId
        ? await supabase
            .from('dokumenty')
            .select('plik_url, kategoria, investment_id, user_id')
            .eq('investment_id', scopeInvestmentId)
        : await supabase
            .from('dokumenty')
            .select('plik_url, kategoria, investment_id, user_id')
            .eq('user_id', userId);

      if (docsRes.error) throw docsRes.error;
      const nextReceiptKindByPath: Record<string, ReceiptDocKind> = {};
      for (const doc of (docsRes.data ?? []) as Array<{ plik_url: string; kategoria: string | null }>) {
        const path = String(doc.plik_url || '').trim();
        if (!path) continue;
        const kind = String(doc.kategoria || '').trim().toLowerCase() === 'faktura' ? 'faktura' : 'paragon';
        nextReceiptKindByPath[path] = kind;
      }
      setReceiptKindByPath(nextReceiptKindByPath);

      const profileRes = await supabase
        .from('profiles')
        .select('build_type, current_stage_code, build_stage')
        .eq('user_id', ownerUserId)
        .maybeSingle();
      if (profileRes.error) throw profileRes.error;

      const buildTypeRaw = String((profileRes.data as any)?.build_type ?? '').trim();
      const normalizedBuildType = workflowBuildType(buildTypeRaw);
      const currentStageCodeRaw = String((profileRes.data as any)?.current_stage_code ?? '').trim();
      const currentStageCode = currentStageCodeRaw.toUpperCase();
      setCurrentWorkflowType(normalizedBuildType);
      setCurrentStageCode(currentStageCode);

      const [templateRes, userStageRes] = await Promise.all([
        supabase
          .from('stage_templates')
          .select('id, workflow_code, stage_group_code, stage_code, name_key, order_index, is_active')
          .eq('workflow_code', normalizedBuildType === 'szkieletowy' ? 'timber_frame' : 'masonry')
          .eq('is_active', true)
          .order('order_index', { ascending: true }),
        scopeInvestmentId
          ? supabase
              .from('user_stages')
              .select('id, template_id, workflow_code, stage_group_code, stage_code, source, status, custom_name, custom_name_key, order_index')
              .eq('investment_id', scopeInvestmentId)
              .order('order_index', { ascending: true })
          : supabase
              .from('user_stages')
              .select('id, template_id, workflow_code, stage_group_code, stage_code, source, status, custom_name, custom_name_key, order_index')
              .eq('user_id', userId)
              .order('order_index', { ascending: true })]);

      if (templateRes.error) throw templateRes.error;
      if (userStageRes.error) throw userStageRes.error;
      setStageTemplates((templateRes.data ?? []) as StageTemplateLike[]);
      setUserStages((userStageRes.data ?? []) as UserStageLike[]);

      const stageRes = scopeInvestmentId
        ? await supabase
            .from('etapy')
            .select('id, user_id, investment_id, nazwa, nazwa_code, status, kolejnosc')
            .eq('investment_id', scopeInvestmentId)
            .order('kolejnosc', { ascending: true })
        : await supabase
            .from('etapy')
            .select('id, user_id, investment_id, nazwa, nazwa_code, status, kolejnosc')
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
      const usedSuggestionKeys = new Set(((expRes.data ?? []) as WydatkiRow[]).map((expense) => expense.suggestion_key).filter(Boolean));
      const prefs = await loadExpenseSuggestionPrefs(ownerUserId);
      setSuggestionPrefs(prefs);
      const currentSuggestionStageKey = currentSuggestionStage(currentStageCode);
      const rawSuggestions = mergeSuggestionPrefs(
        getStageSuggestionItems(normalizedBuildType, currentSuggestionStageKey),
        prefs,
        normalizedBuildType
      ).filter((suggestion) => suggestion.stage_key === currentSuggestionStageKey);
      const visibleSuggestions = rawSuggestions.filter(
        (suggestion) =>
          !!suggestion.expense_key &&
          !usedSuggestionKeys.has(suggestion.expense_key) &&
          normalizeExpenseTypeCode(suggestion.default_type) === TYPE_MATERIAL
      );

      setStageSuggestions(visibleSuggestions);
    } catch (e: any) {
      setErrorMsg(getFriendlyErrorMessage(e, t, 'errors.fetchFailed'));
    } finally {
      setLoading(false);
    }
  }, [authLoading, buildAccess, userId]);

  const updateSuggestionPrefs = useCallback(async (updater: (prefs: StoredExpenseSuggestionPrefs) => StoredExpenseSuggestionPrefs) => {
    if (!userId) return;
    const nextPrefs = updater(suggestionPrefs);
    setSuggestionPrefs(nextPrefs);
    await saveExpenseSuggestionPrefs(userId, nextPrefs);
    const hidden = new Set(nextPrefs.hidden ?? []);
    const notApplicable = new Set(nextPrefs.notApplicable ?? []);
    setStageSuggestions((prev) => prev.map((item) => ({
      ...item,
      hidden: hidden.has(item.id),
      notApplicable: notApplicable.has(item.id)})));
  }, [suggestionPrefs, userId]);

  const hideSuggestion = useCallback((suggestion: SuggestionView) => {
    const id = suggestion.id || suggestion.expense_key;
    if (!id) return;
    updateSuggestionPrefs((prefs) => ({
      ...prefs,
      hidden: Array.from(new Set([...(prefs.hidden ?? []), id]))}));
  }, [updateSuggestionPrefs]);

  const markSuggestionNotApplicable = useCallback((suggestion: SuggestionView) => {
    const id = suggestion.id || suggestion.expense_key;
    if (!id) return;
    updateSuggestionPrefs((prefs) => ({
      ...prefs,
      notApplicable: Array.from(new Set([...(prefs.notApplicable ?? []), id]))}));
  }, [updateSuggestionPrefs]);

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
      type: ['application/pdf', 'image/*']});
    if (res.canceled) return;
    const f = res.assets?.[0];
    if (!f?.uri) return;
    const nextPicked = {
      name: f.name ?? 'plik',
      uri: f.uri,
      mimeType: guessMime(f.name ?? '', f.mimeType ?? undefined),
      size: f.size};

    if (typeof nextPicked.size === 'number' && nextPicked.size <= 0) {
      Alert.alert(t('errorTitle'), t('errors.emptyFile'));
      return;
    }

    if (typeof nextPicked.size === 'number' && nextPicked.size > MAX_RECEIPT_UPLOAD_BYTES) {
      Alert.alert(t('errorTitle'), t('errors.fileTooLarge'));
      return;
    }

    if (!isAllowedReceiptFile(nextPicked)) {
      Alert.alert(t('errorTitle'), t('errors.invalidFileType'));
      return;
    }

    setPicked(nextPicked);
  };

  const uploadOptionalFile = async (ownerId: string): Promise<UploadedReceiptFile | null> => {
    if (!picked) return null;
    if (typeof picked.size === 'number' && picked.size <= 0) throw new Error(t('errors.emptyFile'));
    if (typeof picked.size === 'number' && picked.size > MAX_RECEIPT_UPLOAD_BYTES) throw new Error(t('errors.fileTooLarge'));
    if (!isAllowedReceiptFile(picked)) throw new Error(t('errors.invalidFileType'));
    const safeName = (picked.name || 'plik').replace(/[^a-zA-Z0-9._-]/g, '_');
    const stamp = Date.now();
    const receiptPath = `${ownerId}/wydatki/${stamp}_${safeName}`;
    const documentPath = `dokumenty/${ownerId}/wydatki/${stamp}_${safeName}`;
    const ab = await uriToArrayBuffer(picked.uri, t('errors.readFileFailed'));
    if (!ab || ab.byteLength <= 0) throw new Error(t('errors.emptyFile'));
    if (ab.byteLength > MAX_RECEIPT_UPLOAD_BYTES) throw new Error(t('errors.fileTooLarge'));
    const up = await supabase.storage.from(RECEIPT_BUCKET).upload(receiptPath, ab, { contentType: picked.mimeType, upsert: false });
    if (up.error) throw up.error;
    const docCopy = await supabase.storage.from(DOCUMENT_RECEIPT_BUCKET).upload(documentPath, ab, { contentType: picked.mimeType, upsert: false });
    if (docCopy.error) {
      await removeReceiptFileEverywhere(receiptPath, documentPath);
      throw docCopy.error;
    }
    return { receiptPath, documentPath };
  };

  const removeReceiptFileEverywhere = useCallback(async (receiptPath: string, documentPath = receiptPath) => {
    const targets: Array<{ bucket: typeof RECEIPT_BUCKETS[number]; path: string }> = [
      { bucket: RECEIPT_BUCKET, path: receiptPath },
      { bucket: DOCUMENT_RECEIPT_BUCKET, path: documentPath }];
    await Promise.all(targets.map(async ({ bucket, path }) => {
      const { error } = await supabase.storage.from(bucket).remove([path]);
      if (error && !String(error.message || '').includes('not found')) {
        console.warn(`[Budżet] nie udało się usunąć pliku z bucketu ${bucket}:`, error.message);
      }
    }));
  }, []);

  const syncLinkedReceiptDocument = useCallback(async ({
    userIdValue,
    investmentIdValue,
    filePath,
    title,
    note,
    kind,
    previousPath}: {
    userIdValue: string;
    investmentIdValue?: string | null;
    filePath: string | null;
    title: string;
    note: string | null;
    kind: ReceiptDocKind;
    previousPath?: string | null;
  }) => {
    const scopeColumn = investmentIdValue ? 'investment_id' : 'user_id';
    const scopeValue = investmentIdValue ?? userIdValue;

    if (!filePath) {
      if (previousPath && previousPath !== filePath) {
        const { error: deleteError } = await supabase
          .from('dokumenty')
          .delete()
          .eq(scopeColumn, scopeValue)
          .eq('plik_url', previousPath);
        if (deleteError) {
          console.warn('[Budżet] nie udało się usunąć powiązanego dokumentu:', deleteError.message);
        }
      }
      return;
    }

    const payload = {
      user_id: userIdValue,
      ...(investmentIdValue ? { investment_id: investmentIdValue } : {}),
      tytul: title || t('expense.defaultName'),
      notatki: note,
      kategoria: kind,
      plik_url: filePath};

    if (previousPath && previousPath !== filePath) {
      const { error: deleteError } = await supabase
        .from('dokumenty')
        .delete()
        .eq(scopeColumn, scopeValue)
        .eq('plik_url', previousPath);
      if (deleteError) {
        console.warn('[Budżet] nie udało się usunąć starego dokumentu po zmianie pliku:', deleteError.message);
      }
    }

    const { data: existing, error: selectError } = await supabase
      .from('dokumenty')
      .select('id')
      .eq(scopeColumn, scopeValue)
      .eq('plik_url', filePath)
      .maybeSingle();

    if (selectError && !String(selectError.message || '').includes('No rows')) {
      throw selectError;
    }

    if (existing?.id) {
      const { error: updateError } = await supabase.from('dokumenty').update(payload).eq('id', existing.id).eq(scopeColumn, scopeValue);
      if (updateError) throw updateError;
      return;
    }

    const { error: insertError } = await supabase.from('dokumenty').insert(payload);
    if (insertError) throw insertError;
  }, [t]);

  const saveExpense = async () => {
    if (!userId) return;
    const nazwa = fNazwa.trim();
    const kw = safeNumber(fKwota);
    if (!nazwa) return alert(t('alerts.enterName'));
    if (kw <= 0) return alert(t('alerts.amountGreaterThanZero'));

    setSaving(true);
    let uploadedReceipt: UploadedReceiptFile | null = null;
    try {
      const authUserRes = await supabase.auth.getUser();
      const authUser = authUserRes.data.user ?? null;
      const ownerId = authUser?.id ?? null;
      if (authUserRes.error || !ownerId) {
        throw new Error(t('errors.authRequired'));
      }
      const investmentId = buildAccess?.investmentId ?? null;
      uploadedReceipt = await uploadOptionalFile(ownerId);
      const previousFilePath = editingExpense?.plik || null;
      const previousDocumentPath = linkedDocumentPathFromReceiptPath(ownerId, previousFilePath);
      const selectedStage = selectedStageOption;
      const legacyStage = fEtapId ? etapy.find((stage) => stage.id === fEtapId) ?? null : null;
      const stageCode = selectedStage?.stageCode ?? stageCodeFromLegacyStage(legacyStage, legacyStage ? etapy.findIndex((stage) => stage.id === legacyStage.id) : undefined);
      const stageGroupCode = selectedStage?.stageGroupCode ?? stageGroupCodeFromLegacyStage(legacyStage);
      const expenseCategoryCode = expenseCategoryCodeFromLegacyLabel(fKategoria);
      const expenseCategoryLegacy = expenseCategoryCodeToLegacyLabel(expenseCategoryCode);
      const expenseType = normalizeExpenseTypeCode(fTyp);
      const plannedDate = fStatus === STATUS_PLANNED
        ? (fPlanowanaData.trim() || fData.trim() || null)
        : null;
      const payload = {
        user_id: ownerId,
        ...(investmentId ? { investment_id: investmentId } : {}),
        nazwa,
        kategoria: expenseCategoryLegacy,
        expense_category_code: expenseCategoryCode,
        kwota: kw,
        status: fStatus,
        data: fStatus === STATUS_PLANNED ? null : (fData.trim() || null),
        typ: expenseType,
        expense_type: expenseType,
        etap_id: fEtapId || null,
        stage_group_code: stageGroupCode,
        stage_code: stageCode,
        suggestion_key: fSuggestionKey || null,
        planowana_data: plannedDate,
        opis: fOpis.trim() || null,
        sklep: fSklep.trim() || null,
        ...(uploadedReceipt ? { plik: uploadedReceipt.receiptPath } : editingExpense ? {} : { plik: null })};
      const res = editingExpense
        ? await supabase.from('wydatki').update(payload).eq('id', editingExpense.id).select('id').maybeSingle()
        : await supabase.from('wydatki').insert({ ...payload, user_id: ownerId, ...(investmentId ? { investment_id: investmentId } : {}) }).select('id').maybeSingle();
      if (res.error) {
        if (uploadedReceipt) {
          await removeReceiptFileEverywhere(uploadedReceipt.receiptPath, uploadedReceipt.documentPath);
        }
        throw res.error;
      }

      const receiptFilePath = uploadedReceipt?.documentPath || previousDocumentPath;
      if (receiptFilePath) {
        try {
          await syncLinkedReceiptDocument({
            userIdValue: ownerId,
            investmentIdValue: investmentId,
            filePath: receiptFilePath,
            previousPath: previousDocumentPath && previousDocumentPath !== receiptFilePath ? previousDocumentPath : null,
            title: nazwa,
            note: [fSklep.trim(), fOpis.trim()].filter(Boolean).join(' • ') || null,
            kind: fAttachmentKind});
        } catch (docError: any) {
          console.warn('[Budżet] nie udało się zsynchronizować dokumentu wydatku:', docError?.message || docError);
          Alert.alert(
            t('errorTitle'),
            t('errors.documentSyncFailed')
          );
        }
      }

      if (uploadedReceipt && previousFilePath && previousFilePath !== uploadedReceipt.receiptPath) {
        await removeReceiptFileEverywhere(previousFilePath, previousDocumentPath ?? previousFilePath);
      }

      setFNazwa(''); setFKategoria('other'); setFKwota('');
      setFStatus(STATUS_PAID); setFTyp(TYPE_MATERIAL); setFData(''); setFPlanowanaData(''); setFEtapId(null); setFSuggestionKey(null); setFOpis('');
      setFSklep(''); setPicked(null); setEditingExpense(null);
      setFAttachmentKind('paragon');
      setFStageKey(null);
      setStageMenuOpen(false);
      setAddOpen(false);
      await loadBudget();
    } catch (e: any) {
      Alert.alert(t('errorTitle'), t('errors.saveFailed'));
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
    setStageMenuOpen(false);
    setFNazwa('');
    setFKwota('');
    setFKategoria('other');
    setFStatus(STATUS_PAID);
    setFTyp(TYPE_MATERIAL);
    setFData('');
    setFPlanowanaData('');
    setFEtapId(null);
    setFStageKey(stageGroupOptions[0]?.key ?? null);
    setFSuggestionKey(null);
    setFOpis('');
    setFSklep('');
    setPicked(null);
    setFAttachmentKind('paragon');
    setAddOpen(true);
  };

  useEffect(() => {
    if (params.openAdd !== '1' || openedFromParamRef.current || authLoading) return;
    openedFromParamRef.current = true;
    openAddExpense();
  }, [authLoading, params.openAdd, stageGroupOptions.length]);

  const openEditExpense = (expense: WydatkiRow) => {
    setEditingExpense(expense);
    setStageMenuOpen(false);
    setFNazwa(expense.nazwa || '');
    setFKwota(expense.kwota !== null && expense.kwota !== undefined ? String(expense.kwota) : '');
    setFKategoria(expenseCategoryCodeFromLegacyLabel(expense.expense_category_code ?? expense.kategoria));
    setFStatus(normalizeExpenseStatus(expense.status));
    setFTyp(normalizeExpenseTypeCode(expense.expense_type ?? expense.typ));
    const expenseStatus = normalizeExpenseStatus(expense.status);
    setFData((expenseStatus === STATUS_PLANNED ? expense.planowana_data || expense.data : expense.data || expense.planowana_data) || '');
    setFPlanowanaData(expense.planowana_data || '');
    setFEtapId(expense.etap_id || null);
    const stageMatch =
      stageGroupOptions.find((option) => option.stageCode && String(option.stageCode).toUpperCase() === String(expense.stage_code ?? '').trim().toUpperCase()) ??
      stageGroupOptions.find((option) => option.legacyId && option.legacyId === expense.etap_id) ??
      stageGroupOptions[0] ??
      null;
    setFStageKey(stageMatch?.key ?? null);
    setFSuggestionKey(expense.suggestion_key || null);
    setFOpis(expense.opis || '');
    setFSklep(expense.sklep || '');
    setPicked(null);
    setFAttachmentKind(expense.plik ? (receiptKindByPath[expense.plik] ?? 'paragon') : 'paragon');
    setAddOpen(true);
  };

  const onDatePicked = (event: any, selected?: Date) => {
    if (Platform.OS === 'android') setDatePickerOpen(false);
    if (event?.type === 'dismissed') return;
    const d = selected ?? datePickerValue;
    setDatePickerValue(d);
    setFData(toYYYYMMDD(d));
  };

  const openAllExpenses = useCallback((nextFilter: FilterType, nextSort: SortType = 'date', nextTab?: 'mine' | 'suggested') => {
    router.push({
      pathname: '/budzet/wszystkie',
      params: { filter: nextFilter, sort: nextSort, tab: nextTab }});
  }, [router]);

  const suggestionName = useCallback((suggestion: SuggestionView) => {
    return getSuggestionDisplayName(t, suggestion);
  }, [t]);

  const resolveMainStageGroupLabel = useCallback((expense: {
    stage_code?: string | null;
    stage_group_code?: string | null;
    etap_id?: string | null;
  }) => {
    const stageCode = String(expense.stage_code ?? '').trim().toUpperCase();
    const stageGroupCode = String(expense.stage_group_code ?? '').trim().toLowerCase();

    if (stageGroupCode) {
      return getStageGroupDisplayName(t, stageGroupCode, '');
    }

    if (stageCode) {
      const resolvedGroup = stageGroupCodeFromStageCode(stageCode, stageTemplates);
      if (resolvedGroup !== 'other') {
        return getStageGroupDisplayName(t, resolvedGroup, '');
      }
    }

    if (expense.etap_id) {
      const legacyStage = etapy.find((stage) => stage.id === expense.etap_id) ?? null;
      if (legacyStage) {
        const legacyGroup = stageGroupCodeFromLegacyStage(legacyStage);
        if (legacyGroup !== 'other') {
          return getStageGroupDisplayName(t, legacyGroup, '');
        }
      }
    }

    return '';
  }, [etapy, stageTemplates, t]);

  const suggestionTypeLabel = useCallback((type: string | null | undefined) => {
    const normalized = normalize(type);
    if (normalized === TYPE_SERVICE) return t('type.service');
    if (normalized === TYPE_MIXED) return t('type.mixed');
    return t('type.material');
  }, [t]);

  const openSuggestionExpense = useCallback((suggestion: SuggestionView) => {
    setEditingExpense(null);
    setStageMenuOpen(false);
    setFNazwa(suggestionName(suggestion));
    setFKwota('');
    setFKategoria('other');
    setFStatus(STATUS_PLANNED);
    setFTyp(normalizeExpenseTypeCode(suggestion.default_type));
    setFData('');
    setFPlanowanaData('');
    const suggestionStageCode = String(suggestion.stage_code ?? '').trim().toUpperCase();
    const suggestionStageGroupCode = String((suggestion as any).stage_group_code ?? '').trim().toLowerCase();
    const stageMatch =
      stageGroupOptions.find((option) => option.stageCode && option.stageCode === suggestionStageCode) ??
      stageGroupOptions.find((option) => option.stageGroupCode && option.stageGroupCode === suggestionStageGroupCode) ??
      stageGroupOptions.find((option) => option.legacyId && option.legacyId === suggestion.stage_id) ??
      stageGroupOptions[0] ??
      null;
    setFStageKey(stageMatch?.key ?? null);
    setFEtapId(stageMatch?.legacyId ?? suggestion.stage_id ?? activeStageId);
    setFSuggestionKey(suggestion.expense_key || null);
    setFOpis('');
    setFSklep('');
    setPicked(null);
    setAddOpen(true);
  }, [activeStageId, stageGroupOptions, suggestionName]);

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
                  value={budgetUtil}
                  label=""
                  isActive={true}
                  size={170}
                  stroke={14}
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

        <AppCard style={styles.topSuggestionsCard} contentStyle={styles.topSuggestionsCardContent} glow>
          <View style={styles.listHeaderRow}>
            <View style={styles.listHeaderStack}>
              <Text style={styles.sectionTitleSoft}>{t('sections.upcomingExpenses')}</Text>
              <Text style={styles.sectionSubtitleSoft}>{t('sections.upcomingExpensesSubtitle')}</Text>
            </View>
            <TouchableOpacity onPress={() => openAllExpenses('all', 'date', 'suggested')} activeOpacity={0.8} style={styles.topSuggestionLink}>
              <Text style={styles.topSuggestionLinkText}>{t('common.seeAll')}</Text>
            </TouchableOpacity>
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
                  {resolveMainStageGroupLabel(suggestion) ? (
                    <Text style={styles.suggestionStage} numberOfLines={1}>
                      {resolveMainStageGroupLabel(suggestion)}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.suggestionActions}>
                  <TouchableOpacity
                    onPress={(event) => {
                      event.stopPropagation();
                      hideSuggestion(suggestion);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.suggestionIconBtn}
                  >
                    <Text style={styles.suggestionActionText}>{t('suggestions.hide')}</Text>
                  </TouchableOpacity>
                  <View style={styles.suggestionMiniCta}>
                    <Text style={styles.suggestionMiniCtaText}>{t('suggestions.add')}</Text>
                  </View>
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
              <TouchableOpacity
                key={w.id}
                style={styles.compactRow}
                onPress={buildAccess?.role === 'owner' || String(w.user_id ?? '') === String(userId ?? '') ? () => openEditExpense(w) : undefined}
                activeOpacity={0.9}
              >
                <Text style={styles.rankText}>#{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={1}>{w.nazwa || t('expense.defaultName')}</Text>
                  <Text style={styles.itemStage} numberOfLines={1}>
                    {resolveMainStageGroupLabel(w)}
                  </Text>
                  <Text style={styles.itemMeta} numberOfLines={1}>
                    {w.data ? formatDateByLocale(w.data, datePickerLocale) : '—'}
                  </Text>
                </View>
                <View style={styles.topExpenseRight}>
                  <Text style={styles.itemAmount}>{formatAppCurrency(safeNumber(w.kwota), datePickerLocale, currency)}</Text>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>
                      {normalizeExpenseTypeCode(w.expense_type ?? w.typ) === TYPE_SERVICE
                        ? t('type.service')
                        : normalizeExpenseTypeCode(w.expense_type ?? w.typ) === TYPE_MIXED
                          ? t('type.mixed')
                          : normalizeExpenseTypeCode(w.expense_type ?? w.typ) === TYPE_OTHER
                            ? t('type.other')
                            : t('type.material')}
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
        <Modal
          visible={addOpen}
          animationType="slide"
          transparent
          onRequestClose={() => {
            setStageMenuOpen(false);
            setAddOpen(false);
          }}
        >
          <View style={styles.modalBackdrop}>
            <Pressable
            style={styles.modalBackdropPressable}
            onPress={() => {
              if (datePickerOpen) {
                setDatePickerOpen(false);
                return;
              }
              if (stageMenuOpen) {
                setStageMenuOpen(false);
                return;
              }
              setAddOpen(false);
            }}
            />
            <Pressable onPress={Keyboard.dismiss}>
            <AppCard contentStyle={styles.modalCard} style={styles.modalCardOuter} withShadow={false}>
              <Text style={styles.modalTitle}>{editingExpense ? t('modal.editTitle') : t('modal.title')}</Text>

              <Text style={styles.lbl}>{t('modal.nameLabel')}</Text>
              <AppInput value={fNazwa} onChangeText={setFNazwa} style={[styles.input, styles.compactInput]} placeholder={t('modal.namePlaceholder')} />

              <View style={styles.modalInlineRow}>
                <View style={styles.modalInlineField}>
                  <Text style={styles.lbl}>{t('modal.amountLabel')}</Text>
                  <AppInput value={fKwota} onChangeText={setFKwota} style={[styles.input, styles.compactInput]} keyboardType="numeric" placeholder={t('modal.amountPlaceholder')} />
                </View>
                <View style={styles.modalInlineField}>
                  <Text style={styles.lbl}>{t('modal.dateLabel')}</Text>
                  <View style={styles.dateRow}>
                    <AppInput value={fData} onChangeText={setFData} style={[styles.input, styles.compactInput, { flex: 1 }]} placeholder={t('modal.datePlaceholder')} />
                    <TouchableOpacity style={styles.calBtn} onPress={openDatePicker} activeOpacity={0.85}>
                      <Feather name="calendar" size={18} color={NEON} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

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
                <TouchableOpacity style={[styles.pill, fTyp === TYPE_OTHER && styles.pillOn]} onPress={() => setFTyp(TYPE_OTHER)}>
                  <Text style={[styles.pillText, fTyp === TYPE_OTHER && styles.pillTextOn]}>{t('type.other')}</Text>
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

              {(modalStageOptions.length > 0) && (
                <>
                  <Text style={styles.lbl}>{t('modal.stageLabel')}</Text>
                  <View style={styles.stageSelectWrap}>
                    <TouchableOpacity
                      onPress={() => setStageMenuOpen((open) => !open)}
                      style={[styles.stageSelect, stageMenuOpen && styles.stageSelectOpen]}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.stageSelectText} numberOfLines={1}>
                        {selectedModalStageLabel}
                      </Text>
                      <Feather name={stageMenuOpen ? 'chevron-up' : 'chevron-down'} size={16} color="rgba(220,255,245,0.82)" />
                    </TouchableOpacity>
                    {stageMenuOpen ? (
                      <View style={styles.stageDropdown}>
                        <TouchableOpacity
                          onPress={() => {
                            setFEtapId(null);
                            setFStageKey(null);
                            setStageMenuOpen(false);
                          }}
                          style={[styles.stageDropdownItem, !fStageKey && !fEtapId && styles.stageDropdownItemOn]}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.stageDropdownText, !fStageKey && !fEtapId && styles.stageDropdownTextOn]} numberOfLines={1}>
                            {t('modal.noStage')}
                          </Text>
                        </TouchableOpacity>
                        {modalStageOptions.map((etap) => {
                          const on = (stageGroupOptions.length > 0 ? fStageKey === etap.key : fEtapId === etap.legacyId);
                          return (
                            <TouchableOpacity
                              key={etap.key}
                              onPress={() => {
                                if (stageGroupOptions.length > 0) {
                                  setFStageKey(etap.key);
                                  setFEtapId(etap.legacyId ?? null);
                                } else {
                                  setFStageKey(null);
                                  setFEtapId(etap.legacyId ?? null);
                                }
                                setStageMenuOpen(false);
                              }}
                              style={[styles.stageDropdownItem, on && styles.stageDropdownItemOn]}
                              activeOpacity={0.85}
                            >
                              <Text style={[styles.stageDropdownText, on && styles.stageDropdownTextOn]} numberOfLines={1}>
                                {etap.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                </>
              )}

              <Text style={styles.lbl}>{t('modal.descriptionOptional')}</Text>
              <AppInput value={fOpis} onChangeText={setFOpis} style={styles.input} placeholder={t('modal.descriptionPlaceholder')} />

              <Text style={styles.lbl}>{t('modal.storeOptional')}</Text>
              <AppInput value={fSklep} onChangeText={setFSklep} style={styles.input} placeholder={t('modal.storePlaceholder')} />

              <Text style={styles.lbl}>{t('modal.attachmentTypeLabel')}</Text>
              <View style={styles.receiptKindRow}>
                <TouchableOpacity
                  style={[styles.receiptKindChip, fAttachmentKind === 'paragon' && styles.receiptKindChipOn]}
                  onPress={() => setFAttachmentKind('paragon')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.receiptKindChipText, fAttachmentKind === 'paragon' && styles.receiptKindChipTextOn]}>
                    {t('modal.receiptKindReceipt')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.receiptKindChip, fAttachmentKind === 'faktura' && styles.receiptKindChipOn]}
                  onPress={() => setFAttachmentKind('faktura')}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.receiptKindChipText, fAttachmentKind === 'faktura' && styles.receiptKindChipTextOn]}>
                    {t('modal.receiptKindInvoice')}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.fileBtn} onPress={pickFile}>
                <Text style={styles.fileBtnText}>
                  {picked
                    ? t('modal.fileSelected', { name: picked.name })
                    : t('modal.fileOptional')}
                </Text>
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <AppButton title={t('common.cancel')} variant="secondary" onPress={() => { setStageMenuOpen(false); setAddOpen(false); setEditingExpense(null); }} disabled={saving} style={styles.modalBtn} />
                <AppButton title={saving ? t('common.saving') : t('common.save')} onPress={saveExpense} disabled={saving} style={styles.modalBtn} />
              </View>
            </AppCard>
            </Pressable>
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
    paddingTop: 0},

  topBar: {
    paddingHorizontal: 0,
    marginTop: 0,
    paddingBottom: 0,
    flexDirection: 'row',
    alignItems: 'center'},
  headerSide: {
    width: 116,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center'},
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6},
  headerTitleLarge: {
    ...typography.screenTitle,
    fontSize: 42,
    lineHeight: 48,
    color: colors.accent,
    textAlign: 'center'},
  headerLogoLarge: {
    width: 108,
    height: 108},

  errorText: { color: '#FCA5A5', marginBottom: 10, textAlign: 'center', fontWeight: '800' },

  // ¦¦ Pasek czasu ¦¦
  timeBarWrap: { marginBottom: 16 },
  timeBarLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  timeBarText: { color: 'rgba(255,255,255,0.44)', fontSize: 13, fontWeight: '800' },
  timeBarPct: { color: 'rgba(255,255,255,0.44)', fontSize: 13, fontWeight: '800' },
  timeBarTrack: {
    height: 8, borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden'},
  timeBarFill: { height: 8, borderRadius: 99, backgroundColor: 'rgba(25,112,92,0.70)' },

  // ¦¦ Finance overview ¦¦
  financeOverview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
    marginBottom: 18},
  financeDonutCol: { width: 180, alignItems: 'center', marginLeft: 2 },
  financeStatsCol: { width: 152, flexShrink: 0, gap: 6, alignItems: 'stretch', marginLeft: 'auto' },
  donutSubText: { marginTop: 1, color: 'rgba(255,255,255,0.46)', fontSize: 10.5, fontWeight: '700', textAlign: 'center' },

  // ¦¦ Stats ¦¦
  statBox: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(25,112,92,0.075)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.16)',
    shadowColor: NEON,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 }},
  statLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '800' },
  statValue: { color: '#F8FAFC', fontSize: 12.5, fontWeight: '900', marginTop: 2, lineHeight: 14 },

  // ¦¦ Buddy widget ¦¦
  buddyWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    marginTop: 8, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 14,
    backgroundColor: 'rgba(37,240,200,0.05)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.11)'},
  buddyAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(37,240,200,0.12)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.25)',
    alignItems: 'center', justifyContent: 'center'},
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
    borderColor: 'rgba(37,240,200,0.26)'},
  allExpensesLinkText: { color: NEON, fontSize: 13, fontWeight: '900' },

  vLabel: { marginTop: 8, color: 'rgba(255,255,255,0.78)', fontWeight: '900', fontSize: 11, textAlign: 'center' },

  // ¦¦ Lista ¦¦
  card: {
    marginTop: 14, borderRadius: RADIUS.card, padding: 16, overflow: 'hidden',
    backgroundColor: 'rgba(25,112,92,0.08)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.24)',
    shadowColor: NEON,
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 }},
  listHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  listTitle: { color: '#F8FAFC', fontWeight: '900', fontSize: 16 },
  listHeaderStack: { marginBottom: 0, flex: 1, paddingRight: 10 },
  sectionTitleSoft: { color: '#F8FAFC', fontWeight: '900', fontSize: 15, letterSpacing: 0 },
  sectionSubtitleSoft: { color: 'rgba(148,163,184,0.72)', fontSize: 11, fontWeight: '700', marginTop: 2 },
  seeAllText: { color: NEON, fontSize: 12, fontWeight: '900', opacity: 0.82 },
  topSuggestionLink: {
    paddingHorizontal: 0,
    paddingVertical: 2,
    alignSelf: 'flex-start'},
  topSuggestionLinkText: {
    color: NEON,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
    opacity: 0.88},
  topSuggestionsCard: {
    marginTop: 14,
    borderRadius: RADIUS.card,
    shadowColor: NEON,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 }},
  topSuggestionsCardContent: {
    backgroundColor: 'rgba(15, 34, 31, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.20)',
    padding: 16,
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 14},
  compactRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)'},
  suggestionRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)'},
  suggestionTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  suggestionStage: { color: 'rgba(120,255,220,0.84)', fontSize: 10.5, fontWeight: '800', marginTop: 2 },
  suggestionMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  suggestionPill: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'},
  suggestionPillText: { color: '#C8F7EE', fontSize: 10.5, fontWeight: '800' },
  suggestionHint: { color: 'rgba(148,163,184,0.78)', fontSize: 10.5, fontWeight: '700', marginTop: 5 },
  suggestionMiniCta: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)'},
  suggestionMiniCtaText: { color: NEON, fontSize: 10.5, fontWeight: '900' },
  suggestionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6},
  suggestionIconBtn: {
    minWidth: 48,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)'},
  suggestionActionText: { color: 'rgba(255,255,255,0.64)', fontSize: 10.5, fontWeight: '900' },
  rankText: { width: 30, color: NEON, fontSize: 14, fontWeight: '900' },
  topExpenseRight: { alignItems: 'flex-end', gap: 6 },
  typeBadge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)'},
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
    borderBottomColor: 'rgba(255,255,255,0.06)'},
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
    backgroundColor: 'rgba(255,255,255,0.03)'},
  filterPillActive: { borderColor: 'rgba(25,112,92,0.50)', backgroundColor: 'rgba(25,112,92,0.12)' },
  filterPillText: { color: 'rgba(255,255,255,0.40)', fontSize: 12, fontWeight: '800' },
  filterPillTextActive: { color: NEON },
  sortWrap: {
    marginBottom: 12,
    paddingTop: 2,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)'},
  sortLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '900', marginBottom: 8 },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sortPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.025)'},
  sortPillActive: { borderColor: 'rgba(37,240,200,0.42)', backgroundColor: 'rgba(37,240,200,0.10)' },
  sortPillText: { color: 'rgba(255,255,255,0.48)', fontSize: 12, fontWeight: '800' },
  sortPillTextActive: { color: 'rgba(220,255,245,0.98)' },

  empty: { color: '#94A3B8', paddingVertical: 10 },

  itemRow: {
    flexDirection: 'row', gap: 12, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', paddingHorizontal: 2},
  itemRowPlanned: { opacity: 0.65 },
  itemName: { color: '#F8FAFC', fontWeight: '800' },
  itemNamePlanned: { color: 'rgba(255,255,255,0.65)' },
  itemStage: { color: 'rgba(120,255,220,0.84)', fontSize: 10.5, fontWeight: '800', marginTop: 2 },
  itemMeta: { color: '#94A3B8', fontSize: 12, marginTop: 3 },
  itemAmount: { color: 'rgba(220,255,245,0.95)', fontWeight: '900' },
  itemAmountPlanned: { color: 'rgba(255,255,255,0.40)' },
  fileLink: { color: 'rgba(120,255,220,0.9)', fontWeight: '800', fontSize: 12 },

  // Pokaż więcej
  showMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)'},
  showMoreText: { color: NEON, fontSize: 13, fontWeight: '700', opacity: 0.70 },

  trashAction: {
    width: 92, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.16)',
    borderLeftWidth: 1, borderLeftColor: 'rgba(239,68,68,0.35)'},
  trashIcon: { fontSize: 18, marginBottom: 4 },
  trashText: { color: '#FCA5A5', fontWeight: '900', fontSize: 12 },

  // ¦¦ Modal ¦¦
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#000000',
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 12},
  modalBackdropPressable: { ...StyleSheet.absoluteFillObject },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: 18 },
  modalCardOuter: {
    width: '100%',
    marginBottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden'},
  modalCard: {
    padding: 12,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.12)',
    backgroundColor: '#050B0A',
    shadowColor: '#25F0C8',
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -6 },
    elevation: 10},
  modalTitle: { color: NEON, fontWeight: '900', fontSize: 16, marginBottom: 8, textAlign: 'center' },
  lbl: { color: '#94A3B8', fontSize: 11, marginTop: 6, marginBottom: 4, fontWeight: '800' },
  input: {},
  compactInput: {
    minHeight: 42,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 13},
  modalInlineRow: { flexDirection: 'row', gap: 8 },
  modalInlineField: { flex: 1 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 2 },
  catTile: {
    width: '30%',
    minWidth: 84,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    shadowColor: '#25F0C8',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2},
  catTileOn: { borderColor: 'rgba(37,240,200,0.42)', backgroundColor: 'rgba(37,240,200,0.12)' },
  catTileText: { color: '#94A3B8', fontWeight: '800', fontSize: 12 },
  catTileTextOn: { color: 'rgba(220,255,245,0.98)' },
  compactStageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 2 },
  compactStageChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    shadowColor: '#25F0C8',
    shadowOpacity: 0.09,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2},
  compactStageChipOn: { borderColor: 'rgba(37,240,200,0.44)', backgroundColor: 'rgba(37,240,200,0.14)' },
  compactStageChipText: { color: '#94A3B8', fontWeight: '800', fontSize: 12, letterSpacing: 0 },
  compactStageChipTextOn: { color: 'rgba(220,255,245,0.98)' },
  stageSelectWrap: { position: 'relative', zIndex: 20, elevation: 8 },
  stageSelect: {
    minHeight: 40,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.20)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8},
  stageSelectOpen: {
    borderColor: 'rgba(37,240,200,0.42)',
    backgroundColor: 'rgba(37,240,200,0.10)'},
  stageSelectText: { flex: 1, color: 'rgba(220,255,245,0.96)', fontWeight: '900', fontSize: 12 },
  stageDropdown: {
    position: 'absolute',
    top: 45,
    left: 0,
    right: 0,
    zIndex: 30,
    elevation: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
    backgroundColor: '#07120F',
    overflow: 'hidden'},
  stageDropdownItem: {
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.055)'},
  stageDropdownItemOn: { backgroundColor: 'rgba(37,240,200,0.12)' },
  stageDropdownText: { color: '#94A3B8', fontWeight: '800', fontSize: 12 },
  stageDropdownTextOn: { color: 'rgba(220,255,245,0.98)' },
  compactDateGroup: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  compactDateField: { flex: 1, gap: 6 },
  compactDateLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '800' },
  row2: { flexDirection: 'row', gap: 8, marginTop: 6 },
  pill: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 7,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    shadowColor: '#25F0C8',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1},
  pillOn: { borderColor: 'rgba(37,240,200,0.40)', backgroundColor: 'rgba(37,240,200,0.12)' },
  pillText: { color: '#94A3B8', fontWeight: '800', fontSize: 12 },
  pillTextOn: { color: 'rgba(220,255,245,0.98)' },
  dateRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  calBtn: {
    width: 40,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.24)',
    backgroundColor: 'rgba(37,240,200,0.08)',
    shadowColor: '#25F0C8',
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2},
  iosDateWrap: {
    marginTop: 10,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)',
    backgroundColor: 'rgba(255,255,255,0.03)'},
  iosDateOk: {
    paddingVertical: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(37,240,200,0.12)',
    backgroundColor: 'rgba(37,240,200,0.08)'},
  iosDateOkText: { color: 'rgba(220,255,245,0.98)', fontWeight: '900' },
  fileBtn: {
    marginTop: 8,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.22)',
    backgroundColor: 'rgba(37,240,200,0.08)',
    shadowColor: '#25F0C8',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1},
  fileBtnText: { color: '#E2E8F0', fontWeight: '800', fontSize: 12 },
  receiptKindRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 0},
  receiptKindChip: {
    flex: 1,
    minHeight: 36,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10},
  receiptKindChipOn: {
    borderColor: 'rgba(37,240,200,0.42)',
    backgroundColor: 'rgba(37,240,200,0.12)'},
  receiptKindChipText: {
    color: 'rgba(255,255,255,0.70)',
    fontWeight: '900',
    fontSize: 12},
  receiptKindChipTextOn: {
    color: NEON},
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  modalBtn: { flex: 1 },
  budgetFab: { bottom: 28 }});
