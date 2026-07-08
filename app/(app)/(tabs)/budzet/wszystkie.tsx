import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image as ExpoImage } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../../../lib/supabase';
import { getFriendlyErrorMessage } from '../../../../lib/errorMessages';
import { fetchCurrentBuildAccess, type BuildAccess } from '../../../../lib/buildAccess';
import { formatAppCurrency, useCurrency } from '../../../../lib/currency';
import { getAppLocale } from '../../../../lib/i18n';
import {
  resolveRuntimeCurrentStageCode,
  workflowBuildType} from '../../../../lib/buildWorkflow';
import {
  EXPENSE_SUGGESTION_STAGES,
  createCustomExpenseSuggestion,
  currentSuggestionStage,
  getAllSystemExpenseSuggestions,
  loadExpenseSuggestionPrefs,
  mergeSuggestionPrefs,
  saveExpenseSuggestionPrefs,
  suggestionStageToGroupCode,
  type ExpenseSuggestionItem,
  type ExpenseSuggestionStage,
  type StoredExpenseSuggestionPrefs} from '../../../../lib/budgetExpenseSuggestions';
import { getSuggestionDisplayName } from '../../../../lib/suggestionLabels';
import {
  getBudgetCategoryLabel} from '../../../../lib/localizedLabels';
import {
  expenseCategoryCodeFromLegacyLabel,
  expenseCategoryCodeToLegacyLabel,
  buildStageGroupPickerOptions,
  buildStagePickerOptions,
  getStageDisplayName,
  getStageGroupDisplayName,
  normalizeStageGroupCode,
  normalizeExpenseType as normalizeExpenseTypeCode,
  stageCodeFromLegacyStage,
  stageGroupCodeFromLegacyStage,
  stageGroupCodeFromStageCode,
  type ExpenseCategoryCode,
  type ExpenseType,
  type StageGroupCode,
  type StagePickerOption,
  type StageTemplateLike,
  type UserStageLike} from '../../../../lib/stageModel';
import { useSupabaseAuth } from '../../../../hooks/useSupabaseAuth';
import { FloatingAddButton } from '../../../../components/FloatingAddButton';
import { AppButton, AppCard, AppInput, AppScreen } from '../../../../src/ui/components';
import { colors, spacing, typography } from '../../../../src/ui/theme';
import { RADIUS } from '../../../../theme';

const NEON = colors.accentBright;
const STATUS_PAID = 'poniesiony';
const STATUS_PLANNED = 'zaplanowany';
const TYPE_MATERIAL = 'material';
const TYPE_SERVICE = 'service';
const TYPE_MIXED = 'mixed';
const TYPE_OTHER = 'other';
const logo = require('../../../assets/logo.png');
const STAGE_GROUP_ORDER: StageGroupCode[] = ['stan_zero', 'sso', 'ssz', 'instalacje', 'wykonczenie'];
const SUGGESTION_STAGE_ORDER: ExpenseSuggestionStage[] = ['stan_zero', 'stan_sso', 'stan_ssz', 'instalacje', 'wykonczenie'];

const CATEGORY_OPTIONS = [
  { value: 'stan_zero' },
  { value: 'sso' },
  { value: 'ssz' },
  { value: 'instalacje' },
  { value: 'wykonczenie' },
  { value: 'other' }] as const;

type FilterType = 'all' | 'spent' | 'planned';
type SortType = 'date' | 'amount' | 'stage';
type TypeFilter = 'all' | ExpenseType;
type StageFilter = 'all' | StageGroupCode;
type TabType = 'mine' | 'suggested';
type CategoryValue = ExpenseCategoryCode;
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
  plik: string | null;
  suggestion_key?: string | null;
  opis?: string | null;
  sklep?: string | null;
};

type EtapRow = {
  id: string;
  nazwa: string | null;
  nazwa_code?: string | null;
  status?: string | null;
  kolejnosc: number | null;
};

type BudgetStageSuggestion = ExpenseSuggestionItem & {
  id: string;
  build_type: string | null;
  stage_code: string | null;
  stage_group_code?: string | null;
  stage_key?: ExpenseSuggestionStage;
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

const safeNumber = (v: any) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const normalize = (s: any) => String(s ?? '').trim().toLowerCase();

const capitalizeFirst = (value: string) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1);
};

const normalizeExpenseStatus = (status: any): typeof STATUS_PAID | typeof STATUS_PLANNED => {
  const value = normalize(status);
  if (value === STATUS_PLANNED || value === 'planned' || value === 'upcoming') return STATUS_PLANNED;
  return STATUS_PAID;
};

const normalizeExpenseType = (type: any): typeof TYPE_MATERIAL | typeof TYPE_SERVICE | typeof TYPE_MIXED | typeof TYPE_OTHER => {
  const value = normalize(type);
  if (value === TYPE_SERVICE || value === 'usluga' || value === 'usługa') return TYPE_SERVICE;
  if (value === TYPE_MIXED || value === 'mixed' || value === 'material + usluga' || value === 'material+usluga') return TYPE_MIXED;
  if (value === TYPE_OTHER || value === 'other' || value === 'inne') return TYPE_OTHER;
  return TYPE_MATERIAL;
};

const expenseDateForMonth = (expense: WydatkiRow) => {
  const status = normalizeExpenseStatus(expense.status);
  if (status === STATUS_PLANNED) return expense.planowana_data || expense.data || expense.created_at;
  return expense.data;
};

const formatDateByLocale = (dateRaw: any, locale: string) => {
  if (!dateRaw) return '-';
  const d = new Date(dateRaw);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(locale);
};

const toYYYYMMDD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function WszystkieWydatkiScreen() {
  const { t, i18n } = useTranslation('budget');
  const { currency } = useCurrency();
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const { session, loading: authLoading } = useSupabaseAuth();
  const userId = session?.user?.id;

  const datePickerLocale = useMemo(
    () => getAppLocale(i18n.resolvedLanguage || i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [buildAccess, setBuildAccess] = useState<BuildAccess | null>(null);
  const [wydatki, setWydatki] = useState<WydatkiRow[]>([]);
  const [etapy, setEtapy] = useState<EtapRow[]>([]);
  const [stageTemplates, setStageTemplates] = useState<StageTemplateLike[]>([]);
  const [userStages, setUserStages] = useState<UserStageLike[]>([]);
  const [currentWorkflowType, setCurrentWorkflowType] = useState<string>('murowany');
  const [currentStageCode, setCurrentStageCode] = useState<string>('');
  const [stageSuggestions, setStageSuggestions] = useState<SuggestionView[]>([]);
  const [suggestionPrefs, setSuggestionPrefs] = useState<StoredExpenseSuggestionPrefs>({
    hidden: [],
    notApplicable: [],
    custom: []});
  const [expandedSuggestionStages, setExpandedSuggestionStages] = useState<Set<ExpenseSuggestionStage>>(
    () => new Set(['stan_zero'])
  );
  const [expandedExpenseGroups, setExpandedExpenseGroups] = useState<Set<StageGroupCode>>(
    () => new Set(['stan_zero'])
  );
  const [customSuggestionOpen, setCustomSuggestionOpen] = useState(false);
  const [customSuggestionName, setCustomSuggestionName] = useState('');
  const [customSuggestionStage, setCustomSuggestionStage] = useState<ExpenseSuggestionStage>('stan_zero');
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('mine');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('date');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingExpense, setEditingExpense] = useState<WydatkiRow | null>(null);
  const [fNazwa, setFNazwa] = useState('');
  const [fKategoria, setFKategoria] = useState<CategoryValue>('other');
  const [fKwota, setFKwota] = useState('');
  const [fStatus, setFStatus] = useState<typeof STATUS_PAID | typeof STATUS_PLANNED>(STATUS_PAID);
  const [fTyp, setFTyp] = useState<ExpenseType>(TYPE_MATERIAL);
  const [fData, setFData] = useState('');
  const [fPlanowanaData, setFPlanowanaData] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState(new Date());
  const [datePickerTarget, setDatePickerTarget] = useState<'data' | 'planned'>('data');
  const [fEtapId, setFEtapId] = useState<string | null>(null);
  const [fStageKey, setFStageKey] = useState<string | null>(null);
  const [fSuggestionKey, setFSuggestionKey] = useState<string | null>(null);
  const [fOpis, setFOpis] = useState('');
  const [fSklep, setFSklep] = useState('');

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

  const visibleStageGroups = useMemo(() => STAGE_GROUP_ORDER, []);

  const stageFilterOptions = useMemo(
    () => visibleStageGroups.map((groupCode) => ({
      key: groupCode,
      label: getStageGroupDisplayName(t, groupCode)})),
    [t, visibleStageGroups]
  );

  const resolveExpenseStageGroup = useCallback((expense: WydatkiRow): StageGroupCode => {
    const byStoredGroup = normalizeStageGroupCode(expense.stage_group_code);
    if (byStoredGroup !== 'other') return byStoredGroup;

    const byStageCode = stageGroupCodeFromStageCode(expense.stage_code, stageTemplates);
    if (byStageCode !== 'other') return byStageCode;

    const legacyStage = expense.etap_id ? etapy.find((stage) => stage.id === expense.etap_id) ?? null : null;
    const byLegacy = stageGroupCodeFromLegacyStage(legacyStage);
    if (byLegacy !== 'other') return byLegacy;

    return normalizeStageGroupCode(expense.expense_category_code ?? expense.kategoria);
  }, [etapy, stageTemplates]);

  useEffect(() => {
    if (stageFilter === 'all') return;
    setExpandedExpenseGroups((prev) => new Set([...prev, stageFilter]));
  }, [stageFilter]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: authUserData } = await supabase.auth.getUser();
        const authUser = authUserData.user;
        if (!authUser) {
          if (alive) setBuildAccess(null);
          return;
        }

        const access = await fetchCurrentBuildAccess(authUser.id);
        if (!alive) return;
        setBuildAccess(access);
      } catch {
        if (alive) setBuildAccess(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  const visibleSuggestionStages = useMemo(() => {
    return SUGGESTION_STAGE_ORDER;
  }, []);

  const loadExpenses = useCallback(async () => {
    if (authLoading) return;
    if (!userId) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const authUserRes = await supabase.auth.getUser();
      const authUser = authUserRes.data.user;
      if (!authUser) {
        setWydatki([]);
        setEtapy([]);
        setStageSuggestions([]);
        setActiveStageId(null);
        return;
      }

      const access = buildAccess ?? (await fetchCurrentBuildAccess(authUser.id));
      const scopeInvestmentId = access?.investmentId ?? null;
      const ownerUserId = access?.ownerUserId ?? authUser.id;

      const expQuery = supabase
        .from('wydatki')
        .select('id, user_id, investment_id, nazwa, kategoria, expense_category_code, kwota, data, status, typ, expense_type, etap_id, stage_group_code, stage_code, planowana_data, created_at, plik, suggestion_key, opis, sklep');
      const expRes = scopeInvestmentId
        ? await expQuery.eq('investment_id', scopeInvestmentId).order('created_at', { ascending: false })
        : await expQuery.eq('user_id', userId).order('created_at', { ascending: false });

      if (expRes.error) throw expRes.error;
      const expenseRows = (expRes.data ?? []) as WydatkiRow[];
      setWydatki(expenseRows);

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
      const activeStage = stageRows.find((row) => !completedStatuses.has(normalize(row.status)));
      const currentStage = activeStage ?? stageRows[0] ?? null;
      setActiveStageId(currentStage?.id ?? null);

      const profileRes = await supabase
        .from('profiles')
        .select('build_type, current_stage_code')
        .eq('user_id', ownerUserId)
        .maybeSingle();

      if (profileRes.error) throw profileRes.error;

      const buildTypeRaw = String((profileRes.data as any)?.build_type ?? '').trim();
      const normalizedBuildType = workflowBuildType(buildTypeRaw);
      const currentStageCode = String((profileRes.data as any)?.current_stage_code ?? '').trim().toUpperCase();
      setCurrentWorkflowType(normalizedBuildType);
      setCurrentStageCode(currentStageCode);
      const currentSuggestionStageKey = currentSuggestionStage(currentStageCode);
      setExpandedSuggestionStages(new Set([currentSuggestionStageKey]));

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
          .eq('user_id', authUser.id)
          .order('order_index', { ascending: true })]);

      if (templateRes.error) throw templateRes.error;
      if (userStageRes.error) throw userStageRes.error;
      setStageTemplates((templateRes.data ?? []) as StageTemplateLike[]);
      setUserStages((userStageRes.data ?? []) as UserStageLike[]);

      const prefs = await loadExpenseSuggestionPrefs(ownerUserId);
      setSuggestionPrefs(prefs);
      setStageSuggestions(
        mergeSuggestionPrefs(getAllSystemExpenseSuggestions(normalizedBuildType), prefs, normalizedBuildType)
      );

      const storedStageCode = currentStageCode;
      const runtimeStageCode = resolveRuntimeCurrentStageCode(stageRows, normalizedBuildType, storedStageCode);
      if (runtimeStageCode !== storedStageCode) {
        await supabase.from('profiles').upsert(
          { user_id: ownerUserId, current_stage_code: runtimeStageCode },
          { onConflict: 'user_id' }
        );
      }
    } catch (e: any) {
      setErrorMsg(getFriendlyErrorMessage(e, t, 'errors.fetchFailed'));
    } finally {
      setLoading(false);
    }
  }, [authLoading, buildAccess, t, userId]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    if (tab === 'suggested') setActiveTab('suggested');
    if (tab === 'mine') setActiveTab('mine');
  }, [tab]);

  const suggestionSections = useMemo(() => {
    return visibleSuggestionStages.map((stage) => ({
      stage,
      groupCode: suggestionStageToGroupCode(stage),
      title: getStageGroupDisplayName(t, suggestionStageToGroupCode(stage)),
      items: stageSuggestions.filter((suggestion) => suggestion.stage_key === stage)}));
  }, [stageSuggestions, t, visibleSuggestionStages]);

  const toggleSuggestionStage = useCallback((stage: ExpenseSuggestionStage) => {
    setExpandedSuggestionStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  }, []);

  const toggleExpenseGroup = useCallback((group: StageGroupCode) => {
    setExpandedExpenseGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const persistSuggestionPrefs = useCallback(async (nextPrefs: StoredExpenseSuggestionPrefs) => {
    if (!userId) return;
    const prefsUserId = buildAccess?.ownerUserId ?? userId;
    setSuggestionPrefs(nextPrefs);
    await saveExpenseSuggestionPrefs(prefsUserId, nextPrefs);
    const hidden = new Set(nextPrefs.hidden ?? []);
    const notApplicable = new Set(nextPrefs.notApplicable ?? []);
    setStageSuggestions(
      mergeSuggestionPrefs(getAllSystemExpenseSuggestions(currentWorkflowType as any), nextPrefs, currentWorkflowType as any)
        .map((item) => ({
          ...item,
          hidden: hidden.has(item.id),
          notApplicable: notApplicable.has(item.id)}))
    );
  }, [buildAccess?.ownerUserId, currentWorkflowType, userId]);

  const hideSuggestion = useCallback((suggestion: SuggestionView) => {
    const id = suggestion.id || suggestion.expense_key;
    if (!id) return;
    persistSuggestionPrefs({
      ...suggestionPrefs,
      hidden: Array.from(new Set([...(suggestionPrefs.hidden ?? []), id]))});
  }, [persistSuggestionPrefs, suggestionPrefs]);

  const markSuggestionNotApplicable = useCallback((suggestion: SuggestionView) => {
    const id = suggestion.id || suggestion.expense_key;
    if (!id) return;
    persistSuggestionPrefs({
      ...suggestionPrefs,
      notApplicable: Array.from(new Set([...(suggestionPrefs.notApplicable ?? []), id]))});
  }, [persistSuggestionPrefs, suggestionPrefs]);

  const restoreSuggestion = useCallback((suggestion: SuggestionView) => {
    const id = suggestion.id || suggestion.expense_key;
    if (!id) return;
    persistSuggestionPrefs({
      ...suggestionPrefs,
      hidden: (suggestionPrefs.hidden ?? []).filter((item) => item !== id),
      notApplicable: (suggestionPrefs.notApplicable ?? []).filter((item) => item !== id)});
  }, [persistSuggestionPrefs, suggestionPrefs]);

  const saveCustomSuggestion = useCallback(async () => {
    const name = customSuggestionName.trim();
    if (!name) {
      Alert.alert(t('errorTitle'), t('suggestions.customNameRequired'));
      return;
    }
    const nextPrefs = {
      ...suggestionPrefs,
      custom: [
        ...(suggestionPrefs.custom ?? []),
        createCustomExpenseSuggestion(currentWorkflowType as any, customSuggestionStage, name)]};
    await persistSuggestionPrefs(nextPrefs);
    setExpandedSuggestionStages((prev) => new Set([...prev, customSuggestionStage]));
    setCustomSuggestionName('');
    setCustomSuggestionOpen(false);
  }, [currentWorkflowType, customSuggestionName, customSuggestionStage, persistSuggestionPrefs, suggestionPrefs, t]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadExpenses();
    setRefreshing(false);
  };

  const sortedExpenses = useMemo(() => {
    const rows = wydatki.filter((w) => {
      if (filter === 'spent') return normalizeExpenseStatus(w.status) === STATUS_PAID;
      if (filter === 'planned') return normalizeExpenseStatus(w.status) === STATUS_PLANNED;
      return true;
    }).filter((w) => {
      if (typeFilter !== 'all' && normalizeExpenseTypeCode(w.expense_type ?? w.typ) !== typeFilter) return false;
      if (stageFilter !== 'all' && resolveExpenseStageGroup(w) !== stageFilter) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      if (sortBy === 'amount') return safeNumber(b.kwota) - safeNumber(a.kwota);

      const aDate = new Date(expenseDateForMonth(a) || a.created_at || 0).getTime() || 0;
      const bDate = new Date(expenseDateForMonth(b) || b.created_at || 0).getTime() || 0;

      if (sortBy === 'stage') {
        const aStage = getStageGroupDisplayName(
          t,
          resolveExpenseStageGroup(a),
          t('fallback.stage')
        );
        const bStage = getStageGroupDisplayName(
          t,
          resolveExpenseStageGroup(b),
          t('fallback.stage')
        );
        const byStage = (aStage || '').localeCompare(bStage || '', datePickerLocale);
        if (byStage !== 0) return byStage;
      }

      return bDate - aDate;
    });
  }, [datePickerLocale, filter, resolveExpenseStageGroup, sortBy, stageFilter, typeFilter, wydatki, t]);

  const expenseSections = useMemo(() => {
    return visibleStageGroups.map((groupCode) => ({
      groupCode,
      title: getStageGroupDisplayName(t, groupCode),
      items: sortedExpenses.filter((expense) => resolveExpenseStageGroup(expense) === groupCode)}));
  }, [resolveExpenseStageGroup, sortedExpenses, t, visibleStageGroups]);

  async function getReceiptSignedUrl(storageKey: string) {
    for (const bucket of ['dokumenty', 'paragony'] as const) {
      const signed = await supabase.storage.from(bucket).createSignedUrl(storageKey, 60 * 60);
      if (signed.error || !signed.data?.signedUrl) continue;
      return signed.data.signedUrl;
    }
    return null;
  }

  const openReceipt = async (storageKey: string) => {
    const signedUrl = await getReceiptSignedUrl(storageKey);
    if (!signedUrl) {
      Alert.alert(t('errorTitle'), t('errors.openReceiptFailed'));
      return;
    }
    Linking.openURL(signedUrl);
  };

  const deleteExpense = async (row: WydatkiRow) => {
    if (!userId) return;
    try {
      const { data, error } = await supabase.functions.invoke('delete-expense', {
        method: 'POST',
        body: { id: row.id },
      });
      if (error) throw error;

      const storageWarning = String((data as { storageWarning?: unknown } | null)?.storageWarning ?? '').trim();
      if (storageWarning) {
        console.warn('[Budzet] nie udalo sie usunac wszystkich plikow wydatku:', storageWarning);
        Alert.alert(
          t('errorTitle'),
          t('errors.deleteFileWarning')
        );
      }
      setWydatki((prev) => prev.filter((w) => w.id !== row.id));
    } catch (e: any) {
      Alert.alert(t('errorTitle'), getFriendlyErrorMessage(e, t, 'errors.deleteFailed'));
    }
  };

  const confirmDeleteExpense = (row: WydatkiRow) => {
    Alert.alert(t('delete.confirmTitle'), `${row.nazwa ?? t('expense.defaultName')}\n${formatAppCurrency(safeNumber(row.kwota), datePickerLocale, currency)}`, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteExpense(row) }]);
  };

  const openAddExpense = () => {
    setEditingExpense(null);
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
    setAddOpen(true);
  };

  const openEditExpense = (expense: WydatkiRow) => {
    setEditingExpense(expense);
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
    setAddOpen(true);
  };

  const openDatePicker = (target: 'data' | 'planned') => {
    setDatePickerTarget(target);
    const current = target === 'planned' ? fPlanowanaData : fData;
    const base = current?.trim() ? new Date(current.trim()) : new Date();
    if (!Number.isNaN(base.getTime())) setDatePickerValue(base);
    setDatePickerOpen(true);
  };

  const onDatePicked = (event: any, selected?: Date) => {
    if (Platform.OS === 'android') setDatePickerOpen(false);
    if (event?.type === 'dismissed') return;
    const d = selected ?? datePickerValue;
    setDatePickerValue(d);
    if (datePickerTarget === 'planned') {
      setFPlanowanaData(toYYYYMMDD(d));
    } else {
      setFData(toYYYYMMDD(d));
    }
  };

  const saveExpense = async () => {
    if (!userId) return;
    const nazwa = fNazwa.trim();
    const kw = safeNumber(fKwota);
    if (!nazwa) {
      Alert.alert(t('errorTitle'), t('alerts.enterName'));
      return;
    }
    if (kw <= 0) {
      Alert.alert(t('errorTitle'), t('alerts.amountGreaterThanZero'));
      return;
    }

    setSaving(true);
    try {
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
      const investmentId = buildAccess?.investmentId ?? null;
      const payload = {
        user_id: userId,
        ...(investmentId ? { investment_id: investmentId } : {}),
        nazwa,
        kategoria: expenseCategoryLegacy,
        expense_category_code: expenseCategoryCode,
        kwota: kw,
        status: fStatus,
        typ: expenseType,
        expense_type: expenseType,
        data: fStatus === STATUS_PLANNED ? null : (fData.trim() || null),
        planowana_data: plannedDate,
        etap_id: fEtapId || null,
        stage_group_code: stageGroupCode,
        stage_code: stageCode,
        suggestion_key: fSuggestionKey || null,
        opis: fOpis.trim() || null,
        sklep: fSklep.trim() || null,
        ...(editingExpense ? {} : { plik: null })};
      const result = editingExpense
        ? await supabase.from('wydatki').update(payload).eq('id', editingExpense.id)
        : await supabase.from('wydatki').insert(payload);
      const { error } = result;
      if (error) throw error;

      setEditingExpense(null);
      setAddOpen(false);
      setFStageKey(null);
      await loadExpenses();
    } catch (e: any) {
      Alert.alert(t('errorTitle'), getFriendlyErrorMessage(e, t, 'errors.addFailed'));
    } finally {
      setSaving(false);
    }
  };

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
    setAddOpen(true);
  }, [activeStageId, stageGroupOptions, suggestionName]);

  const selectedStageLabel = useMemo(() => {
    if (stageFilter === 'all') return t('filter.all');
    return stageFilterOptions.find((option) => option.key === stageFilter)?.label ?? getStageGroupDisplayName(t, stageFilter);
  }, [stageFilter, stageFilterOptions, t]);

  const recentTitle = useMemo(() => {
    return 'Wydatki';
  }, []);

  const canManageExpense = useCallback((row: WydatkiRow) => {
    if (buildAccess?.role === 'owner') return true;
    return String(row.user_id ?? '') === String(userId ?? '');
  }, [buildAccess?.role, userId]);

  const renderRightActions = (row: WydatkiRow) => (
    <TouchableOpacity style={styles.trashAction} onPress={() => confirmDeleteExpense(row)} activeOpacity={0.85}>
      <Feather name="trash-2" size={18} color="#FCA5A5" />
      <Text style={styles.trashText}>{t('common.delete')}</Text>
    </TouchableOpacity>
  );

  const renderExpense = ({ item }: { item: WydatkiRow }) => {
    const status = normalizeExpenseStatus(item.status);
    const type = normalizeExpenseTypeCode(item.expense_type ?? item.typ);
    const expenseCategoryLabel = getBudgetCategoryLabel(item.expense_category_code ?? item.kategoria, t);
    const stageLabel = getStageGroupDisplayName(
      t,
      resolveExpenseStageGroup(item),
      t('fallback.stage')
    );
    const canEdit = canManageExpense(item);
    return (
      <Swipeable renderRightActions={canEdit ? () => renderRightActions(item) : undefined} overshootRight={false} rightThreshold={40}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={canEdit ? () => openEditExpense(item) : undefined}
          onLongPress={canEdit ? () => confirmDeleteExpense(item) : undefined}
          delayLongPress={350}
          style={[styles.itemRow, status === STATUS_PLANNED && styles.itemRowPlanned]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.itemName, status === STATUS_PLANNED && styles.itemNamePlanned]} numberOfLines={1}>
              {capitalizeFirst(item.nazwa ?? t('expense.defaultName'))}
            </Text>
            <View style={styles.itemMetaRow}>
              <Text style={styles.itemMetaCompact} numberOfLines={1}>
              {formatDateByLocale(expenseDateForMonth(item), datePickerLocale)}
              {'  •  '}
              {expenseCategoryLabel}
              {!!stageLabel ? `  •  ${stageLabel}` : ''}
              {'  •  '}
              </Text>
              <View style={styles.badgeRow}>
                <View style={[styles.miniBadge, status === STATUS_PLANNED && styles.miniBadgePlanned]}>
                  <Text style={styles.miniBadgeText}>{status === STATUS_PAID ? t('status.paid') : t('status.planned')}</Text>
                </View>
                <View style={styles.miniBadge}>
                  <Text style={styles.miniBadgeText}>
                    {type === TYPE_SERVICE
                      ? t('type.service')
                      : type === TYPE_MIXED
                        ? t('type.mixed')
                        : type === TYPE_OTHER
                          ? t('type.other')
                          : t('type.material')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.amountWrap}>
            <Text style={[styles.itemAmount, status === STATUS_PLANNED && styles.itemAmountPlanned]}>
              {formatAppCurrency(safeNumber(item.kwota), datePickerLocale, currency)}
            </Text>
            {!!item.plik && (
              <TouchableOpacity onPress={() => openReceipt(item.plik!)} style={{ marginTop: 6 }}>
                <Text style={styles.fileLink}>{t('expense.receiptLink')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <AppScreen>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <View style={styles.headerSide}>
            <ExpoImage source={logo} style={{ width: 92, height: 92 }} contentFit="contain" cachePolicy="memory-disk" />
          </View>
          <View style={styles.headerTitleWrap}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.9} style={styles.headerTitleLarge}>
              {recentTitle}
            </Text>
          </View>
          <View style={styles.headerSide} />
        </View>

        {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

        <View style={styles.segmentRow}>
          {(['mine', 'suggested'] as TabType[]).map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[styles.segmentBtn, activeTab === tab && styles.segmentBtnActive]} activeOpacity={0.86}>
              <Text style={[styles.segmentText, activeTab === tab && styles.segmentTextActive]}>
                {tab === 'mine' ? t('tabs.myExpenses') : t('tabs.suggestedExpenses')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'mine' && (
          <View style={styles.filterBar}>
            <TouchableOpacity style={styles.filterButton} onPress={() => setFiltersOpen(true)} activeOpacity={0.86}>
              <Feather name="sliders" size={14} color={NEON} />
              <Text style={styles.filterButtonText}>{t('filter.button')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sortButton} onPress={() => setSortOpen(true)} activeOpacity={0.86}>
              <Feather name="bar-chart-2" size={14} color={NEON} />
              <Text style={styles.sortButtonText}>{t(`sort.${sortBy}`)}</Text>
            </TouchableOpacity>
            <View style={styles.filterSummaryPill}>
              <Text style={styles.filterSummary} numberOfLines={1}>
                {filter === 'all' ? t('filter.all') : filter === 'spent' ? t('filter.spent') : t('filter.planned')}
                {typeFilter !== 'all' ? ` • ${typeFilter === TYPE_MATERIAL ? t('type.material') : typeFilter === TYPE_SERVICE ? t('type.service') : typeFilter === TYPE_MIXED ? t('type.mixed') : t('type.other')}` : ''}
                {stageFilter !== 'all' ? ` • ${selectedStageLabel}` : ''}
              </Text>
            </View>
          </View>
        )}

        {activeTab === 'mine' && false && (
          <View style={styles.controlsWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipLine}>
              {(['all', 'spent', 'planned'] as FilterType[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFilter(f)}
                  style={[styles.filterPill, filter === f && styles.filterPillActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>
                    {f === 'all' ? t('filter.all') : f === 'spent' ? t('filter.spent') : t('filter.planned')}
                  </Text>
                </TouchableOpacity>
              ))}
              {(['material', 'service'] as TypeFilter[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setTypeFilter(typeFilter === type ? 'all' : type)}
                  style={[styles.filterPill, typeFilter === type && styles.filterPillActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.filterPillText, typeFilter === type && styles.filterPillTextActive]}>
                    {type === 'material' ? t('type.material') : t('type.service')}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setStageFilter(stageFilter === 'all' ? stageFilterOptions[0]?.key ?? 'all' : 'all')}
                style={[styles.filterPill, stageFilter !== 'all' && styles.filterPillActive]}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterPillText, stageFilter !== 'all' && styles.filterPillTextActive]}>
                  {selectedStageLabel}
                </Text>
              </TouchableOpacity>
              {stageFilterOptions.map((stage) => (
                <TouchableOpacity
                  key={stage.key}
                  onPress={() => setStageFilter(stage.key)}
                  style={[styles.stageDot, stageFilter === stage.key && styles.stageDotActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.stageDotText, stageFilter === stage.key && styles.stageDotTextActive]}>
                    {stage.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortLine}>
              {(['date', 'amount', 'stage'] as SortType[]).map((option) => (
                <TouchableOpacity
                  key={option}
                  onPress={() => setSortBy(option)}
                  style={[styles.sortPill, sortBy === option && styles.sortPillActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.sortPillText, sortBy === option && styles.sortPillTextActive]}>
                    {t(`sort.${option}`)}
                    {sortBy === option ? ' ↓' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={NEON} />
          </View>
        ) : activeTab === 'mine' ? (
          <ScrollView
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NEON} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {sortedExpenses.length === 0 ? (
              <Text style={styles.empty}>{t('list.empty')}</Text>
            ) : expenseSections.map((section) => {
              const expanded = expandedExpenseGroups.has(section.groupCode);
              return (
                <View key={section.groupCode} style={styles.suggestionSection}>
                  <TouchableOpacity
                    style={styles.suggestionSectionHeader}
                    onPress={() => toggleExpenseGroup(section.groupCode)}
                    activeOpacity={0.86}
                  >
                    <Text style={styles.suggestionSectionTitle}>{section.title}</Text>
                    <View style={styles.suggestionSectionMeta}>
                      <Text style={styles.suggestionSectionCount}>{section.items.length}</Text>
                      <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={NEON} />
                    </View>
                  </TouchableOpacity>

                  {expanded ? (
                    section.items.length === 0 ? (
                      <Text style={styles.stageEmptyText}>{t('empty.noExpenses')}</Text>
                    ) : section.items.map((item) => (
                      <View key={item.id}>
                        {renderExpense({ item })}
                      </View>
                    ))
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <ScrollView
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NEON} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity
              style={[styles.addCustomSuggestionBtn, { display: 'none' }]}
              onPress={() => {
                setCustomSuggestionStage(currentSuggestionStage(currentStageCode));
                setCustomSuggestionOpen(true);
              }}
              activeOpacity={0.86}
            >
              <Feather name="plus" size={15} color={NEON} />
              <Text style={styles.addCustomSuggestionText}>
                {t('suggestions.addCustom')}
              </Text>
            </TouchableOpacity>

            {suggestionSections.every((section) => section.items.length === 0) ? (
              <Text style={styles.empty}>{t('empty.noSuggestions')}</Text>
            ) : suggestionSections.map((section) => {
              const expanded = expandedSuggestionStages.has(section.stage);
              return (
                <View key={section.stage} style={styles.suggestionSection}>
                  <TouchableOpacity
                    style={styles.suggestionSectionHeader}
                    onPress={() => toggleSuggestionStage(section.stage)}
                    activeOpacity={0.86}
                  >
                    <Text style={styles.suggestionSectionTitle}>{section.title}</Text>
                    <View style={styles.suggestionSectionMeta}>
                      <Text style={styles.suggestionSectionCount}>{section.items.length}</Text>
                      <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={NEON} />
                    </View>
                  </TouchableOpacity>

                  {expanded ? section.items.map((item) => {
                    const muted = item.hidden || item.notApplicable;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.suggestionCard, muted && styles.suggestionCardMuted]}
                        onPress={() => openSuggestionExpense(item)}
                        activeOpacity={0.9}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.suggestionTitle, muted && styles.suggestionTitleMuted]} numberOfLines={1}>
                            {capitalizeFirst(suggestionName(item))}
                          </Text>
                          <Text style={styles.suggestionHint}>
                            {item.source === 'custom'
                              ? t('suggestions.custom')
                              : item.notApplicable
                              ? t('suggestions.notApplicable')
                              : item.hidden
                              ? t('suggestions.hidden')
                              : section.title}
                          </Text>
                        </View>
                        <View style={styles.suggestionActions}>
                          <TouchableOpacity
                            onPress={(event) => {
                              event.stopPropagation();
                              if (!muted) hideSuggestion(item);
                            }}
                            style={styles.suggestionIconBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            activeOpacity={muted ? 1 : 0.82}
                          >
                            <Text style={styles.suggestionActionText}>
                              {muted ? t('suggestions.hidden') : t('suggestions.hide')}
                            </Text>
                          </TouchableOpacity>
                          <View style={styles.suggestionMiniCta}>
                            <Text style={styles.suggestionMiniCtaText}>{t('suggestions.add')}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  }) : null}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      <Modal visible={customSuggestionOpen} animationType="fade" transparent onRequestClose={() => setCustomSuggestionOpen(false)}>
        <View style={styles.filterModalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setCustomSuggestionOpen(false)} />
          <AppCard contentStyle={styles.filterModalCard} withShadow={false}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>{t('suggestions.addCustom')}</Text>
              <TouchableOpacity onPress={() => setCustomSuggestionOpen(false)} style={styles.filterCloseBtn} activeOpacity={0.85}>
                <Feather name="x" size={16} color="#EAFBF6" />
              </TouchableOpacity>
            </View>

            <Text style={styles.filterGroupLabel}>{t('modal.stageLabel')}</Text>
            <View style={styles.modalChipRow}>
              {EXPENSE_SUGGESTION_STAGES.map((stage) => {
                const active = customSuggestionStage === stage;
                return (
                  <TouchableOpacity
                    key={stage}
                    onPress={() => setCustomSuggestionStage(stage)}
                    style={[styles.filterPill, active && styles.filterPillActive]}
                    activeOpacity={0.86}
                  >
                    <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                      {getStageGroupDisplayName(t, suggestionStageToGroupCode(stage))}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.filterGroupLabel}>{t('modal.nameLabel')}</Text>
            <AppInput
              value={customSuggestionName}
              onChangeText={setCustomSuggestionName}
              placeholder={t('suggestions.customPlaceholder')}
              style={styles.input}
            />

            <View style={styles.filterModalActions}>
              <TouchableOpacity style={styles.resetFiltersBtn} onPress={() => setCustomSuggestionOpen(false)} activeOpacity={0.85}>
                <Text style={styles.resetFiltersText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyFiltersBtn} onPress={saveCustomSuggestion} activeOpacity={0.85}>
                <Text style={styles.applyFiltersText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </AppCard>
        </View>
      </Modal>

      <Modal visible={filtersOpen} animationType="fade" transparent onRequestClose={() => setFiltersOpen(false)}>
        <View style={styles.filterModalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setFiltersOpen(false)} />
          <AppCard contentStyle={styles.filterModalCard} withShadow={false}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>{t('filter.button')}</Text>
              <TouchableOpacity onPress={() => setFiltersOpen(false)} style={styles.filterCloseBtn} activeOpacity={0.85}>
                <Feather name="x" size={16} color="#EAFBF6" />
              </TouchableOpacity>
            </View>

            <Text style={styles.filterGroupLabel}>{t('modal.statusLabel')}</Text>
            <View style={styles.modalChipRow}>
              {(['all', 'spent', 'planned'] as FilterType[]).map((f) => (
                <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[styles.filterPill, filter === f && styles.filterPillActive]} activeOpacity={0.85}>
                  <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>
                    {f === 'all' ? t('filter.all') : f === 'spent' ? t('filter.spent') : t('filter.planned')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterGroupLabel}>{t('modal.typeLabel')}</Text>
            <View style={styles.modalChipRow}>
              {(['all', TYPE_MATERIAL, TYPE_SERVICE, TYPE_MIXED, TYPE_OTHER] as TypeFilter[]).map((type) => (
                <TouchableOpacity key={type} onPress={() => setTypeFilter(type)} style={[styles.filterPill, typeFilter === type && styles.filterPillActive]} activeOpacity={0.85}>
                  <Text style={[styles.filterPillText, typeFilter === type && styles.filterPillTextActive]}>
                    {type === 'all' ? t('filter.all') : type === TYPE_MATERIAL ? t('type.material') : type === TYPE_SERVICE ? t('type.service') : type === TYPE_MIXED ? t('type.mixed') : t('type.other')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterGroupLabel}>{t('modal.stageLabel')}</Text>
            <View style={styles.stageFilterGrid}>
              <TouchableOpacity onPress={() => setStageFilter('all')} style={[styles.stageFilterCard, stageFilter === 'all' && styles.stageFilterCardActive]} activeOpacity={0.85}>
                <Feather name="layers" size={15} color={stageFilter === 'all' ? NEON : 'rgba(255,255,255,0.48)'} />
                <Text style={[styles.stageFilterCardText, stageFilter === 'all' && styles.stageFilterCardTextActive]}>{t('filter.all')}</Text>
              </TouchableOpacity>
              {stageFilterOptions.map((stage) => (
                <TouchableOpacity key={stage.key} onPress={() => setStageFilter(stage.key)} style={[styles.stageFilterCard, stageFilter === stage.key && styles.stageFilterCardActive]} activeOpacity={0.85}>
                  <Feather name="check-circle" size={15} color={stageFilter === stage.key ? NEON : 'rgba(255,255,255,0.38)'} />
                  <Text style={[styles.stageFilterCardText, stageFilter === stage.key && styles.stageFilterCardTextActive]}>{stage.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.filterModalActions}>
              <TouchableOpacity
                style={styles.resetFiltersBtn}
                onPress={() => {
                  setFilter('all');
                  setTypeFilter('all');
                  setStageFilter('all');
                  setSortBy('date');
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.resetFiltersText}>{t('filter.reset')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyFiltersBtn} onPress={() => setFiltersOpen(false)} activeOpacity={0.85}>
                <Text style={styles.applyFiltersText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </AppCard>
        </View>
      </Modal>

      <Modal visible={sortOpen} animationType="fade" transparent onRequestClose={() => setSortOpen(false)}>
        <View style={styles.filterModalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setSortOpen(false)} />
          <AppCard contentStyle={styles.filterModalCard} withShadow={false}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>{t('sort.label')}</Text>
              <TouchableOpacity onPress={() => setSortOpen(false)} style={styles.filterCloseBtn} activeOpacity={0.85}>
                <Feather name="x" size={16} color="#EAFBF6" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalChipRow}>
              {(['date', 'amount', 'stage'] as SortType[]).map((option) => (
                <TouchableOpacity
                  key={option}
                  onPress={() => {
                    setSortBy(option);
                    setSortOpen(false);
                  }}
                  style={[styles.sortPill, sortBy === option && styles.sortPillActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.sortPillText, sortBy === option && styles.sortPillTextActive]}>{t(`sort.${option}`)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </AppCard>
        </View>
      </Modal>

      <FloatingAddButton onPress={openAddExpense} style={styles.fab} />

      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalBackdrop}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalScrollContent}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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
                <TouchableOpacity style={[styles.pill, fTyp === TYPE_OTHER && styles.pillOn]} onPress={() => setFTyp(TYPE_OTHER)}>
                  <Text style={[styles.pillText, fTyp === TYPE_OTHER && styles.pillTextOn]}>{t('type.other')}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.compactDateGroup}>
                <View style={styles.compactDateField}>
                  <Text style={styles.compactDateLabel}>{t('modal.dateLabel')}</Text>
                  <View style={styles.dateRow}>
                    <AppInput value={fData} onChangeText={setFData} style={[styles.input, { flex: 1 }]} placeholder={t('modal.datePlaceholder')} />
                    <TouchableOpacity style={styles.calBtn} onPress={() => openDatePicker('data')} activeOpacity={0.85}>
                      <Feather name="calendar" size={18} color={NEON} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {datePickerOpen && (
                Platform.OS === 'ios' ? (
                  <View style={styles.iosDateWrap}>
                    <DateTimePicker value={datePickerValue} mode="date" display="spinner" locale={datePickerLocale} onChange={onDatePicked} />
                    <TouchableOpacity style={styles.iosDateOk} onPress={() => {
                      setDatePickerOpen(false);
                      const next = toYYYYMMDD(datePickerValue);
                      if (datePickerTarget === 'planned') setFPlanowanaData(next);
                      else setFData(next);
                    }} activeOpacity={0.85}>
                      <Text style={styles.iosDateOkText}>{t('modal.setDate')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <DateTimePicker value={datePickerValue} mode="date" display="default" locale={datePickerLocale} onChange={onDatePicked} />
                )
              )}

              {(stageGroupOptions.length > 0 || etapy.length > 0) && (
                <>
                  <Text style={styles.lbl}>{t('modal.stageLabel')}</Text>
                  <View style={styles.compactStageGrid}>
                    <TouchableOpacity
                      onPress={() => {
                        setFEtapId(null);
                        setFStageKey(null);
                      }}
                      style={[styles.compactStageChip, !fStageKey && !fEtapId && styles.compactStageChipOn]}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.compactStageChipText, !fStageKey && !fEtapId && styles.compactStageChipTextOn]}>{t('modal.noStage')}</Text>
                    </TouchableOpacity>
                    {(stageGroupOptions.length > 0 ? stageGroupOptions : etapy.map((etap, index) => ({
                      key: `legacy:${etap.id}`,
                      label: getStageGroupDisplayName(t, stageGroupCodeFromLegacyStage(etap)),
                      legacyId: etap.id,
                      stageCode: stageCodeFromLegacyStage(etap, index),
                      stageGroupCode: stageGroupCodeFromLegacyStage(etap),
                      source: 'legacy',
                      orderIndex: index} as StagePickerOption))).map((etap) => {
                      const on = stageGroupOptions.length > 0 ? fStageKey === etap.key : fEtapId === etap.legacyId;
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
                          }}
                          style={[styles.compactStageChip, on && styles.compactStageChipOn]}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.compactStageChipText, on && styles.compactStageChipTextOn]} numberOfLines={1}>
                            {etap.label}
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

              <View style={styles.modalActions}>
                <AppButton title={t('common.cancel')} variant="secondary" onPress={() => { setAddOpen(false); setEditingExpense(null); }} disabled={saving} style={styles.modalBtn} />
                <AppButton title={saving ? t('common.saving') : t('common.save')} onPress={saveExpense} disabled={saving} style={styles.modalBtn} />
              </View>
            </AppCard>
            </TouchableWithoutFeedback>
          </ScrollView>
        </View>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: 6},
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2},
  headerSide: {
    width: 96,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center'},
  headerLogoLarge: { width: 92, height: 92 },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    minHeight: 96},
  headerTitleLarge: {
    ...typography.screenTitle,
    color: colors.accent,
    alignSelf: 'stretch',
    fontSize: 36,
    lineHeight: 40,
    textAlign: 'center',
    textAlignVertical: 'center',
    flexShrink: 1,
    includeFontPadding: false},
  errorText: { color: '#FCA5A5', marginBottom: 10, textAlign: 'center', fontWeight: '800' },
  segmentRow: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 999,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.065)'},
  segmentBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 9,
    minHeight: 38,
    alignItems: 'center'},
  segmentBtnActive: { backgroundColor: 'rgba(37,240,200,0.11)' },
  segmentText: { color: 'rgba(255,255,255,0.50)', fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: NEON },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8},
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)'},
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)'},
  filterButtonText: { color: NEON, fontSize: 12, fontWeight: '900' },
  sortButtonText: { color: NEON, fontSize: 12, fontWeight: '900' },
  filterSummaryPill: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 150,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.065)'},
  filterSummary: { color: 'rgba(235,255,250,0.66)', fontSize: 11, fontWeight: '800' },
  filterModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: spacing.lg},
  filterModalCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: '#050807',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)'},
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10},
  filterModalTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: '900' },
  filterCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)'},
  filterGroupLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '900', marginTop: 10, marginBottom: 7 },
  modalChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingRight: 12 },
  stageFilterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8},
  stageFilterCard: {
    width: '48%',
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 11,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)'},
  stageFilterCardActive: {
    backgroundColor: 'rgba(37,240,200,0.11)',
    borderColor: 'rgba(37,240,200,0.30)'},
  stageFilterCardText: {
    flex: 1,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '900'},
  stageFilterCardTextActive: { color: 'rgba(220,255,245,0.98)' },
  filterModalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  resetFiltersBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)'},
  resetFiltersText: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '900' },
  applyFiltersBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: NEON},
  applyFiltersText: { color: '#05110E', fontSize: 12, fontWeight: '900' },
  controlsWrap: { marginBottom: 8, gap: 6 },
  chipLine: { gap: 6, paddingRight: 12 },
  filterPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.045)'},
  filterPillActive: { backgroundColor: 'rgba(37,240,200,0.12)' },
  filterPillText: { color: 'rgba(255,255,255,0.50)', fontSize: 10.5, fontWeight: '800' },
  filterPillTextActive: { color: NEON },
  stageDot: {
    minWidth: 31,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)'},
  stageDotActive: { backgroundColor: 'rgba(37,240,200,0.12)' },
  stageDotText: { color: 'rgba(255,255,255,0.46)', fontSize: 10.5, fontWeight: '900' },
  stageDotTextActive: { color: NEON },
  sortLine: { gap: 6, paddingRight: 12 },
  sortPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.03)'},
  sortPillActive: { backgroundColor: 'rgba(37,240,200,0.10)' },
  sortPillText: { color: 'rgba(255,255,255,0.46)', fontSize: 10.5, fontWeight: '800' },
  sortPillTextActive: { color: 'rgba(220,255,245,0.98)' },
  loadingRow: { paddingVertical: 28, alignItems: 'center' },
  listContent: { paddingTop: 8, paddingBottom: 82 },
  empty: { color: '#94A3B8', paddingVertical: 18, textAlign: 'center' },
  addCustomSuggestionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 11,
    marginBottom: 10,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.16)'},
  addCustomSuggestionText: { color: NEON, fontSize: 12, fontWeight: '900' },
  itemRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(25,112,92,0.065)'},
  itemRowPlanned: { opacity: 0.72 },
  itemName: { color: '#F8FAFC', fontWeight: '900', fontSize: 13.5 },
  itemNamePlanned: { color: 'rgba(255,255,255,0.72)' },
  itemMeta: { color: '#94A3B8', fontSize: 11, marginTop: 4, lineHeight: 15 },
  itemMetaRow: { marginTop: 5, gap: 5 },
  itemMetaCompact: { color: '#94A3B8', fontSize: 10.5, lineHeight: 14 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  miniBadge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    backgroundColor: 'rgba(255,255,255,0.055)'},
  miniBadgePlanned: { backgroundColor: 'rgba(37,240,200,0.10)' },
  miniBadgeText: { color: 'rgba(226,232,240,0.78)', fontSize: 9.5, fontWeight: '900' },
  amountWrap: { alignItems: 'flex-end', maxWidth: 118, paddingTop: 1 },
  itemAmount: { color: 'rgba(220,255,245,0.95)', fontWeight: '900', textAlign: 'right', fontSize: 13 },
  itemAmountPlanned: { color: 'rgba(255,255,255,0.48)' },
  fileLink: { color: 'rgba(120,255,220,0.9)', fontWeight: '800', fontSize: 10.5 },
  suggestionCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginHorizontal: 8,
    marginBottom: 7,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.10)',
    backgroundColor: 'rgba(25,112,92,0.06)'},
  suggestionSection: {
    marginBottom: 9,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'},
  suggestionSectionHeader: {
    minHeight: 40,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(25,112,92,0.07)'},
  suggestionSectionTitle: { color: '#F8FAFC', fontSize: 14.8, fontWeight: '900' },
  suggestionSectionMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  suggestionSectionCount: { color: 'rgba(148,163,184,0.85)', fontSize: 11.6, fontWeight: '900' },
  suggestionCardMuted: { opacity: 0.42, backgroundColor: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.06)' },
  suggestionTitle: { color: '#F8FAFC', fontSize: 14.5, fontWeight: '850' as any },
  suggestionTitleMuted: { textDecorationLine: 'line-through' },
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
    paddingVertical: 6,
    paddingHorizontal: 11,
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)'},
  suggestionMiniCtaText: { color: NEON, fontSize: 10.5, fontWeight: '900' },
  suggestionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6},
  suggestionIconBtn: {
    minWidth: 50,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.045)'},
  suggestionActionText: { color: 'rgba(255,255,255,0.62)', fontSize: 10.5, fontWeight: '900' },
  stageEmptyText: { color: 'rgba(148,163,184,0.62)', fontSize: 12, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 12 },
  trashAction: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)'},
  trashText: { color: '#FCA5A5', fontWeight: '900', fontSize: 12, marginTop: 4 },
  fab: {
    bottom: 66,
    right: 18,
    width: 46,
    height: 46,
    borderRadius: 23,
    shadowOpacity: 0.22,
    shadowRadius: 12},
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#000000',
    paddingTop: 28,
    paddingBottom: 28},
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 18},
  modalCardOuter: {
    marginBottom: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden'},
  modalCard: {
    padding: 16,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
    backgroundColor: '#050B0A',
    shadowColor: '#25F0C8',
    shadowOpacity: 0.16,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12},
  modalTitle: { color: NEON, fontWeight: '900', fontSize: 18, marginBottom: 12, textAlign: 'center' },
  lbl: { color: '#94A3B8', fontSize: 12, marginTop: 10, marginBottom: 6 },
  input: {},
  dateRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  calBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.24)',
    shadowColor: '#25F0C8',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2},
  iosDateWrap: {
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
    backgroundColor: 'rgba(255,255,255,0.03)'},
  iosDateOk: {
    margin: 12,
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.28)'},
  iosDateOkText: { color: NEON, fontWeight: '900', fontSize: 12 },
  row2: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pill: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    shadowColor: '#25F0C8',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1},
  pillOn: { borderColor: 'rgba(37,240,200,0.42)', backgroundColor: 'rgba(37,240,200,0.14)' },
  pillText: { color: '#94A3B8', fontWeight: '800' },
  pillTextOn: { color: 'rgba(220,255,245,0.98)' },
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
    borderColor: 'rgba(37,240,200,0.18)',
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
    borderColor: 'rgba(37,240,200,0.22)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    shadowColor: '#25F0C8',
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2},
  compactStageChipOn: { borderColor: 'rgba(37,240,200,0.50)', backgroundColor: 'rgba(37,240,200,0.14)' },
  compactStageChipText: { color: '#94A3B8', fontWeight: '800', fontSize: 12, letterSpacing: 0 },
  compactStageChipTextOn: { color: 'rgba(220,255,245,0.98)' },
  compactDateGroup: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  compactDateField: { flex: 1, gap: 6 },
  compactDateLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '800' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn: { flex: 1 }});
