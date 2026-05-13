import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../../../lib/supabase';
import { formatAppCurrency, useCurrency } from '../../../../lib/currency';
import {
  filterWorkflowStages,
  getSuggestionStageCodesFromCurrentStageCode,
  preferredStartStageCode,
  resolveRuntimeCurrentStageCode,
  workflowBuildType,
} from '../../../../lib/buildWorkflow';
import { getSuggestionDisplayName } from '../../../../lib/suggestionLabels';
import {
  getBudgetCategoryLabel,
  type BudgetCategoryValue,
} from '../../../../lib/localizedLabels';
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
const logo = require('../../../assets/logo.png');

const CATEGORY_OPTIONS = [
  { value: 'Stan zero' },
  { value: 'Stan surowy otwarty' },
  { value: 'Stan surowy zamknięty' },
  { value: 'Instalacje' },
  { value: 'Stan deweloperski' },
  { value: 'Inne' },
] as const;

type FilterType = 'all' | 'spent' | 'planned';
type SortType = 'date' | 'amount' | 'stage';
type TypeFilter = 'all' | 'material' | 'service';
type TabType = 'mine' | 'suggested';
type CategoryValue = BudgetCategoryValue;

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
  if (value === TYPE_SERVICE || value === 'usluga' || value === 'usługa') return TYPE_SERVICE;
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

export default function WszystkieWydatkiScreen() {
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

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [wydatki, setWydatki] = useState<WydatkiRow[]>([]);
  const [etapy, setEtapy] = useState<EtapRow[]>([]);
  const [stageSuggestions, setStageSuggestions] = useState<SuggestionView[]>([]);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('mine');
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('date');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingExpense, setEditingExpense] = useState<WydatkiRow | null>(null);
  const [fNazwa, setFNazwa] = useState('');
  const [fKategoria, setFKategoria] = useState<CategoryValue>('Inne');
  const [fKwota, setFKwota] = useState('');
  const [fStatus, setFStatus] = useState<typeof STATUS_PAID | typeof STATUS_PLANNED>(STATUS_PAID);
  const [fTyp, setFTyp] = useState<typeof TYPE_MATERIAL | typeof TYPE_SERVICE>(TYPE_MATERIAL);
  const [fData, setFData] = useState('');
  const [fPlanowanaData, setFPlanowanaData] = useState('');
  const [fEtapId, setFEtapId] = useState<string | null>(null);
  const [fSuggestionKey, setFSuggestionKey] = useState<string | null>(null);
  const [fOpis, setFOpis] = useState('');
  const [fSklep, setFSklep] = useState('');

  const stageNameById = useMemo(() => {
    const out: Record<string, string> = {};
    etapy.forEach((e) => {
      if (e.id && e.nazwa) out[e.id] = e.nazwa;
    });
    return out;
  }, [etapy]);

  const loadExpenses = useCallback(async () => {
    if (authLoading) return;
    if (!userId) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const expRes = await supabase
        .from('wydatki')
        .select('id, nazwa, kategoria, kwota, data, status, typ, etap_id, planowana_data, created_at, plik, suggestion_key, opis, sklep')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (expRes.error) throw expRes.error;
      const expenseRows = (expRes.data ?? []) as WydatkiRow[];
      setWydatki(expenseRows);

      const stageRes = await supabase
        .from('etapy')
        .select('id, nazwa, nazwa_code, status, kolejnosc')
        .eq('user_id', userId)
        .order('kolejnosc', { ascending: true });

      if (stageRes.error) throw stageRes.error;
      const stageRows = (stageRes.data ?? []) as EtapRow[];
      setEtapy(stageRows);

      const completedStatuses = new Set(['zrealizowany', 'wykonany', 'done', 'completed', 'ukończony']);
      const activeStage = stageRows.find((row) => !completedStatuses.has(normalize(row.status)));
      const currentStage = activeStage ?? stageRows[0] ?? null;
      setActiveStageId(currentStage?.id ?? null);

      const authUserRes = await supabase.auth.getUser();
      const authUser = authUserRes.data.user;
      if (!authUser) {
        setStageSuggestions([]);
        return;
      }

      const profileRes = await supabase
        .from('profiles')
        .select('build_type, current_stage_code, build_stage')
        .eq('user_id', authUser.id)
        .single();

      if (profileRes.error) {
        setStageSuggestions([]);
        return;
      }

      const buildTypeRaw = String((profileRes.data as any)?.build_type ?? '').trim();
      const normalizedBuildType = workflowBuildType(buildTypeRaw);
      const currentStageCodeRaw = String((profileRes.data as any)?.current_stage_code ?? '').trim();
      const currentStageCode = currentStageCodeRaw.toUpperCase();

      console.log('[Budget/List] build_type', buildTypeRaw);
      console.log('[Budget/List] normalized_build_type', normalizedBuildType);
      console.log('[Budget/List] current_stage_code', currentStageCodeRaw);
      const stageCodes = getSuggestionStageCodesFromCurrentStageCode(normalizedBuildType, currentStageCode);
      const usedSuggestionKeys = new Set(expenseRows.map((expense) => expense.suggestion_key).filter(Boolean));

      const suggestionRes = await supabase
        .from('budget_stage_suggestions')
        .select('*')
        .eq('build_type', normalizedBuildType)
        .in('stage_code', stageCodes)
        .eq('is_active', true)
        .eq('include_in_budget', true)
        .order('stage_code', { ascending: true })
        .order('priority', { ascending: true });

      if (suggestionRes.error) {
        setStageSuggestions([]);
        return;
      }

      const rawSuggestions = (suggestionRes.data ?? []) as BudgetStageSuggestion[];
      const visibleSuggestions = rawSuggestions.filter(
        (suggestion) => !!suggestion.expense_key && !usedSuggestionKeys.has(suggestion.expense_key)
      );

      console.log('[BudgetSuggestionsDebug]', {
        userId,
        normalizedBuildType,
        currentStageCode,
        stageCodes,
        rawSuggestionsCount: rawSuggestions.length,
        usedSuggestionKeys: Array.from(usedSuggestionKeys),
        visibleSuggestionsCount: visibleSuggestions.length,
      });

      console.log('[Budget/List] suggestions found', visibleSuggestions.length);
      setStageSuggestions(visibleSuggestions);
      return;

      const buildType = String((profileRes.data as any)?.build_type ?? '').trim();
      const currentIndex = currentStage ? stageRows.findIndex((row) => row.id === currentStage.id) : -1;
      const nextStage = currentIndex >= 0 ? stageRows[currentIndex + 1] : null;
      const stageCandidates = [currentStage, nextStage].filter(Boolean) as EtapRow[];
      const legacyStageCodes = stageCandidates.map((stage) => stage.nazwa_code).filter(Boolean) as string[];

      if (!buildType || legacyStageCodes.length === 0) {
        setStageSuggestions([]);
      } else {
        const suggestionRes = await supabase
          .from('budget_stage_suggestions')
          .select('id, build_type, stage_code, expense_key, expense_name_key, default_type, priority, is_active, include_in_budget')
          .eq('build_type', buildType)
          .eq('is_active', true)
          .eq('include_in_budget', true)
          .in('stage_code', legacyStageCodes)
          .order('priority', { ascending: true });

        if (suggestionRes.error) {
          setStageSuggestions([]);
          return;
        }

        const usedSuggestionKeys = new Set(expenseRows.map((expense) => expense.suggestion_key).filter(Boolean));
        const byStageCode = new Map(stageCandidates.map((stage) => [stage.nazwa_code, stage]));
        const visibleSuggestions = ((suggestionRes.data ?? []) as BudgetStageSuggestion[])
          .filter((suggestion) => !!suggestion.expense_key && !usedSuggestionKeys.has(suggestion.expense_key))
          .filter((suggestion) => normalize(suggestion.default_type) !== TYPE_SERVICE)
          .map((suggestion) => {
            const stage = byStageCode.get(suggestion.stage_code);
            return { ...suggestion, stage_id: stage?.id ?? null, stage_name: stage?.nazwa ?? null };
          })
          .sort((a, b) => safeNumber(a.priority) - safeNumber(b.priority));

        setStageSuggestions(visibleSuggestions);
      }

      const workflowStageRows = filterWorkflowStages(stageRows, buildType);
      const workflowCompletedStatuses = new Set(['zrealizowany', 'wykonany', 'done', 'completed', 'ukończony']);
      const workflowActiveStage = workflowStageRows.find((row) => !workflowCompletedStatuses.has(normalize(row.status)));
      const workflowFallbackStage = workflowStageRows[0] ?? null;
      const workflowCurrentStage = workflowActiveStage ?? workflowFallbackStage ?? null;
      setEtapy(workflowStageRows);
      setActiveStageId(workflowCurrentStage?.id ?? null);

      const workflowPreferredStageCode = preferredStartStageCode(buildType, (profileRes.data as any)?.current_stage_code);
      const workflowPreferredStage =
        workflowStageRows.find((row) => String(row.nazwa_code ?? '').trim().toUpperCase() === workflowPreferredStageCode) ?? null;
      const workflowCurrentIndex = workflowCurrentStage ? workflowStageRows.findIndex((row) => row.id === workflowCurrentStage.id) : -1;
      const workflowNextStage = workflowCurrentIndex >= 0 ? workflowStageRows[workflowCurrentIndex + 1] : null;
      const workflowStageCandidates = [workflowCurrentStage ?? workflowPreferredStage, workflowNextStage].filter(Boolean) as EtapRow[];
      const workflowStageCodes = workflowStageCandidates.map((stage) => stage.nazwa_code).filter(Boolean) as string[];

      if (!buildType || workflowStageCodes.length === 0) {
        setStageSuggestions([]);
      } else {
        const workflowSuggestionRes = await supabase
          .from('budget_stage_suggestions')
          .select('id, build_type, stage_code, expense_key, expense_name_key, default_type, priority, is_active, include_in_budget')
          .eq('build_type', workflowBuildType(buildType))
          .eq('is_active', true)
          .eq('include_in_budget', true)
          .in('stage_code', workflowStageCodes)
          .order('priority', { ascending: true });

        if (workflowSuggestionRes.error) {
          setStageSuggestions([]);
          return;
        }

        const workflowUsedSuggestionKeys = new Set(expenseRows.map((expense) => expense.suggestion_key).filter(Boolean));
        const workflowByStageCode = new Map(workflowStageCandidates.map((stage) => [stage.nazwa_code, stage]));
        const workflowVisibleSuggestions = ((workflowSuggestionRes.data ?? []) as BudgetStageSuggestion[])
          .filter((suggestion) => !!suggestion.expense_key && !workflowUsedSuggestionKeys.has(suggestion.expense_key))
          .filter((suggestion) => normalize(suggestion.default_type) !== TYPE_SERVICE)
          .map((suggestion) => {
            const stage = workflowByStageCode.get(suggestion.stage_code);
            return { ...suggestion, stage_id: stage?.id ?? null, stage_name: stage?.nazwa ?? null };
          })
          .sort((a, b) => safeNumber(a.priority) - safeNumber(b.priority));

        setStageSuggestions(workflowVisibleSuggestions);
      }

      const storedStageCode = String((profileRes.data as any)?.current_stage_code ?? '').trim().toUpperCase();
      const runtimeStageCode = resolveRuntimeCurrentStageCode(stageRows, buildType, storedStageCode);
      if (runtimeStageCode !== storedStageCode) {
        await supabase
          .from('profiles')
          .upsert(
            { user_id: authUser!.id, current_stage_code: runtimeStageCode },
            { onConflict: 'user_id' }
          );
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? t('errors.fetchFailed'));
    } finally {
      setLoading(false);
    }
  }, [authLoading, userId, t]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

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
      if (typeFilter !== 'all' && normalizeExpenseType(w.typ) !== typeFilter) return false;
      if (stageFilter !== 'all' && w.etap_id !== stageFilter) return false;
      return true;
    });

    return [...rows].sort((a, b) => {
      if (sortBy === 'amount') return safeNumber(b.kwota) - safeNumber(a.kwota);

      const aDate = new Date(expenseDateForMonth(a) || a.created_at || 0).getTime() || 0;
      const bDate = new Date(expenseDateForMonth(b) || b.created_at || 0).getTime() || 0;

      if (sortBy === 'stage') {
        const aStage = a.etap_id ? stageNameById[a.etap_id] : '';
        const bStage = b.etap_id ? stageNameById[b.etap_id] : '';
        const byStage = (aStage || '').localeCompare(bStage || '', datePickerLocale);
        if (byStage !== 0) return byStage;
      }

      return bDate - aDate;
    });
  }, [wydatki, filter, typeFilter, stageFilter, sortBy, stageNameById, datePickerLocale]);

  const openReceipt = async (storageKey: string) => {
    const signed = await supabase.storage.from('paragony').createSignedUrl(storageKey, 60 * 60);
    if (signed.error) {
      Alert.alert(t('errorTitle', { defaultValue: 'Błąd' }), signed.error.message);
      return;
    }
    if (signed.data?.signedUrl) Linking.openURL(signed.data.signedUrl);
  };

  const deleteExpense = async (row: WydatkiRow) => {
    if (!userId) return;
    try {
      const del = await supabase.from('wydatki').delete().eq('id', row.id).eq('user_id', userId);
      if (del.error) throw del.error;
      if (row.plik) {
        const removeResult = await supabase.storage.from('paragony').remove([row.plik]);
        if (removeResult.error) {
          Alert.alert(
            t('errorTitle', { defaultValue: 'Błąd' }),
            t('errors.deleteFileWarning', {
              defaultValue: 'Wydatek został usunięty, ale nie udało się usunąć załącznika z pamięci.',
            })
          );
        }
      }
      setWydatki((prev) => prev.filter((w) => w.id !== row.id));
    } catch (e: any) {
      Alert.alert(t('errorTitle', { defaultValue: 'Błąd' }), e?.message ?? t('errors.deleteFailed'));
    }
  };

  const confirmDeleteExpense = (row: WydatkiRow) => {
    Alert.alert(t('delete.confirmTitle'), `${row.nazwa ?? t('expense.defaultName')}\n${formatAppCurrency(safeNumber(row.kwota), datePickerLocale, currency)}`, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteExpense(row) },
    ]);
  };

  const openAddExpense = () => {
    setEditingExpense(null);
    setFNazwa('');
    setFKwota('');
    setFKategoria('Inne');
    setFStatus(STATUS_PAID);
    setFTyp(TYPE_MATERIAL);
    setFData('');
    setFPlanowanaData('');
    setFEtapId(null);
    setFSuggestionKey(null);
    setFOpis('');
    setFSklep('');
    setAddOpen(true);
  };

  const openEditExpense = (expense: WydatkiRow) => {
    setEditingExpense(expense);
    setFNazwa(expense.nazwa || '');
    setFKwota(expense.kwota !== null && expense.kwota !== undefined ? String(expense.kwota) : '');
    setFKategoria((expense.kategoria as CategoryValue) || 'Inne');
    setFStatus(normalizeExpenseStatus(expense.status));
    setFTyp(normalizeExpenseType(expense.typ));
    setFData(expense.data || '');
    setFPlanowanaData(expense.planowana_data || '');
    setFEtapId(expense.etap_id || null);
    setFSuggestionKey(expense.suggestion_key || null);
    setFOpis(expense.opis || '');
    setFSklep(expense.sklep || '');
    setAddOpen(true);
  };

  const saveExpense = async () => {
    if (!userId) return;
    const nazwa = fNazwa.trim();
    const kw = safeNumber(fKwota);
    if (!nazwa) {
      Alert.alert(t('errorTitle', { defaultValue: 'Błąd' }), t('alerts.enterName'));
      return;
    }
    if (kw <= 0) {
      Alert.alert(t('errorTitle', { defaultValue: 'Błąd' }), t('alerts.amountGreaterThanZero'));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        nazwa,
        kategoria: fKategoria,
        kwota: kw,
        status: fStatus,
        typ: fTyp,
        data: fData.trim() || null,
        planowana_data: fStatus === STATUS_PLANNED && fPlanowanaData.trim() ? fPlanowanaData.trim() : null,
        etap_id: fEtapId || null,
        suggestion_key: fSuggestionKey || null,
        opis: fOpis.trim() || null,
        sklep: fSklep.trim() || null,
        ...(editingExpense ? {} : { plik: null }),
      };
      const result = editingExpense
        ? await supabase.from('wydatki').update(payload).eq('id', editingExpense.id).eq('user_id', userId)
        : await supabase.from('wydatki').insert(payload);
      const { error } = result;
      if (error) throw error;

      setEditingExpense(null);
      setAddOpen(false);
      await loadExpenses();
    } catch (e: any) {
      Alert.alert(t('errorTitle', { defaultValue: 'Błąd' }), e?.message ?? t('errors.addFailed'));
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
    setFKategoria('Inne');
    setFStatus(STATUS_PLANNED);
    setFTyp(normalize(suggestion.default_type) === TYPE_SERVICE ? TYPE_SERVICE : TYPE_MATERIAL);
    setFData('');
    setFPlanowanaData('');
    setFEtapId(suggestion.stage_id || activeStageId);
    setFSuggestionKey(suggestion.expense_key || null);
    setFOpis('');
    setFSklep('');
    setAddOpen(true);
  }, [activeStageId, suggestionName]);

  const stageShortLabel = useCallback((stage: EtapRow, index: number) => {
    const code = String(stage.nazwa_code || '').trim();
    if (code) return code.replace(/^stage[_-]?/i, '').toUpperCase();
    return `A${index + 1}`;
  }, []);

  const selectedStageLabel = useMemo(() => {
    if (stageFilter === 'all') return t('modal.stageFallback');
    const index = etapy.findIndex((stage) => stage.id === stageFilter);
    if (index < 0) return t('modal.stageFallback');
    return stageShortLabel(etapy[index], index);
  }, [etapy, stageFilter, stageShortLabel, t]);

  const recentTitle = useMemo(() => {
    return 'Wydatki';
  }, []);

  const renderRightActions = (row: WydatkiRow) => (
    <TouchableOpacity style={styles.trashAction} onPress={() => confirmDeleteExpense(row)} activeOpacity={0.85}>
      <Feather name="trash-2" size={18} color="#FCA5A5" />
      <Text style={styles.trashText}>{t('common.delete')}</Text>
    </TouchableOpacity>
  );

  const renderExpense = ({ item }: { item: WydatkiRow }) => {
    const status = normalizeExpenseStatus(item.status);
    const type = normalizeExpenseType(item.typ);
    return (
      <Swipeable renderRightActions={() => renderRightActions(item)} overshootRight={false} rightThreshold={40}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => openEditExpense(item)}
          onLongPress={() => confirmDeleteExpense(item)}
          delayLongPress={350}
          style={[styles.itemRow, status === STATUS_PLANNED && styles.itemRowPlanned]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.itemName, status === STATUS_PLANNED && styles.itemNamePlanned]} numberOfLines={1}>
              {item.nazwa ?? t('expense.defaultName')}
            </Text>
            <View style={styles.itemMetaRow}>
              <Text style={styles.itemMetaCompact} numberOfLines={1}>
              {formatDateByLocale(expenseDateForMonth(item), datePickerLocale)}
              {'  •  '}
              {getBudgetCategoryLabel(item.kategoria, t)}
              {!!item.etap_id && stageNameById[item.etap_id] ? `  •  ${stageNameById[item.etap_id]}` : ''}
              {'  •  '}
              </Text>
              <View style={styles.badgeRow}>
                <View style={[styles.miniBadge, status === STATUS_PLANNED && styles.miniBadgePlanned]}>
                  <Text style={styles.miniBadgeText}>{status === STATUS_PAID ? t('status.paid') : t('status.planned')}</Text>
                </View>
                <View style={styles.miniBadge}>
                  <Text style={styles.miniBadgeText}>{type === TYPE_MATERIAL ? t('type.material') : t('type.service')}</Text>
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
            <ExpoImage source={logo} style={styles.headerLogoLarge} contentFit="contain" cachePolicy="memory-disk" />
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
            <Text style={styles.filterSummary} numberOfLines={1}>
              {filter === 'all' ? t('filter.all') : filter === 'spent' ? t('filter.spent') : t('filter.planned')}
              {typeFilter !== 'all' ? ` • ${typeFilter === 'material' ? t('type.material') : t('type.service')}` : ''}
              {stageFilter !== 'all' ? ` • ${selectedStageLabel}` : ''}
            </Text>
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
                onPress={() => setStageFilter(stageFilter === 'all' ? etapy[0]?.id ?? 'all' : 'all')}
                style={[styles.filterPill, stageFilter !== 'all' && styles.filterPillActive]}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterPillText, stageFilter !== 'all' && styles.filterPillTextActive]}>
                  {selectedStageLabel}
                </Text>
              </TouchableOpacity>
              {etapy.map((stage, index) => (
                <TouchableOpacity
                  key={stage.id}
                  onPress={() => setStageFilter(stage.id)}
                  style={[styles.stageDot, stageFilter === stage.id && styles.stageDotActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.stageDotText, stageFilter === stage.id && styles.stageDotTextActive]}>
                    {stageShortLabel(stage, index)}
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
          <FlatList
            data={sortedExpenses}
            keyExtractor={(item) => item.id}
            renderItem={renderExpense}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NEON} />}
            ListEmptyComponent={<Text style={styles.empty}>{t('list.empty')}</Text>}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={16}
            maxToRenderPerBatch={24}
            windowSize={8}
          />
        ) : (
          <FlatList
            data={stageSuggestions}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={NEON} />}
            ListEmptyComponent={<Text style={styles.empty}>{t('empty.noSuggestions')}</Text>}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.suggestionCard} onPress={() => openSuggestionExpense(item)} activeOpacity={0.9}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionTitle} numberOfLines={1}>{suggestionName(item)}</Text>
                  <View style={styles.suggestionMetaRow}>
                    <View style={styles.suggestionPill}>
                      <Text style={styles.suggestionPillText}>
                        {String(item.stage_code || item.stage_name || '').trim().toUpperCase() || '-'}
                      </Text>
                    </View>
                    <View style={styles.suggestionPill}>
                      <Text style={styles.suggestionPillText}>{suggestionTypeLabel(item.default_type)}</Text>
                    </View>
                  </View>
                  <Text style={styles.suggestionHint}>{t('suggestions.mayBeNeededAtThisStage')}</Text>
                </View>
                <View style={styles.suggestionMiniCta}>
                  <Text style={styles.suggestionMiniCtaText}>{t('suggestions.add')}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

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
              {(['all', 'material', 'service'] as TypeFilter[]).map((type) => (
                <TouchableOpacity key={type} onPress={() => setTypeFilter(type)} style={[styles.filterPill, typeFilter === type && styles.filterPillActive]} activeOpacity={0.85}>
                  <Text style={[styles.filterPillText, typeFilter === type && styles.filterPillTextActive]}>
                    {type === 'all' ? t('filter.all') : type === 'material' ? t('type.material') : t('type.service')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.filterGroupLabel}>{t('modal.stageLabel')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modalChipRow}>
              <TouchableOpacity onPress={() => setStageFilter('all')} style={[styles.filterPill, stageFilter === 'all' && styles.filterPillActive]} activeOpacity={0.85}>
                <Text style={[styles.filterPillText, stageFilter === 'all' && styles.filterPillTextActive]}>{t('filter.all')}</Text>
              </TouchableOpacity>
              {etapy.map((stage, index) => (
                <TouchableOpacity key={stage.id} onPress={() => setStageFilter(stage.id)} style={[styles.stageDot, stageFilter === stage.id && styles.stageDotActive]} activeOpacity={0.85}>
                  <Text style={[styles.stageDotText, stageFilter === stage.id && styles.stageDotTextActive]}>{stageShortLabel(stage, index)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

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
                  const on = normalize(fKategoria) === normalize(option.value);
                  return (
                    <TouchableOpacity key={option.value} onPress={() => setFKategoria(option.value)} style={[styles.catTile, on && styles.catTileOn]} activeOpacity={0.85}>
                      <Text style={[styles.catTileText, on && styles.catTileTextOn]}>
                        {getBudgetCategoryLabel(option.value, t, true)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.lbl}>{t('modal.dateOptional')}</Text>
              <AppInput value={fData} onChangeText={setFData} style={styles.input} placeholder="YYYY-MM-DD" />

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

              <View style={styles.modalActions}>
                <AppButton title={t('common.cancel')} variant="secondary" onPress={() => { setAddOpen(false); setEditingExpense(null); }} disabled={saving} style={styles.modalBtn} />
                <AppButton title={saving ? t('common.saving') : t('common.save')} onPress={saveExpense} disabled={saving} style={styles.modalBtn} />
              </View>
            </AppCard>
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
    paddingTop: 6,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  headerSide: {
    width: 96,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogoLarge: { width: 92, height: 92 },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    minHeight: 96,
  },
  headerTitleLarge: {
    ...typography.screenTitle,
    color: colors.accent,
    alignSelf: 'stretch',
    fontSize: 36,
    lineHeight: 40,
    textAlign: 'center',
    textAlignVertical: 'center',
    flexShrink: 1,
    includeFontPadding: false,
  },
  errorText: { color: '#FCA5A5', marginBottom: 10, textAlign: 'center', fontWeight: '800' },
  segmentRow: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 999,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.065)',
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 9,
    minHeight: 38,
    alignItems: 'center',
  },
  segmentBtnActive: { backgroundColor: 'rgba(37,240,200,0.11)' },
  segmentText: { color: 'rgba(255,255,255,0.50)', fontSize: 12, fontWeight: '900' },
  segmentTextActive: { color: NEON },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)',
  },
  filterButtonText: { color: NEON, fontSize: 12, fontWeight: '900' },
  sortButtonText: { color: NEON, fontSize: 12, fontWeight: '900' },
  filterSummary: { flex: 1, color: 'rgba(255,255,255,0.46)', fontSize: 11, fontWeight: '800' },
  filterModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: spacing.lg,
  },
  filterModalCard: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: '#050807',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.14)',
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  filterModalTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: '900' },
  filterCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  filterGroupLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '900', marginTop: 10, marginBottom: 7 },
  modalChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingRight: 12 },
  filterModalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  resetFiltersBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  resetFiltersText: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '900' },
  applyFiltersBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: NEON,
  },
  applyFiltersText: { color: '#05110E', fontSize: 12, fontWeight: '900' },
  controlsWrap: { marginBottom: 8, gap: 6 },
  chipLine: { gap: 6, paddingRight: 12 },
  filterPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  filterPillActive: { backgroundColor: 'rgba(37,240,200,0.12)' },
  filterPillText: { color: 'rgba(255,255,255,0.50)', fontSize: 10.5, fontWeight: '800' },
  filterPillTextActive: { color: NEON },
  stageDot: {
    minWidth: 31,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  stageDotActive: { backgroundColor: 'rgba(37,240,200,0.12)' },
  stageDotText: { color: 'rgba(255,255,255,0.46)', fontSize: 10.5, fontWeight: '900' },
  stageDotTextActive: { color: NEON },
  sortLine: { gap: 6, paddingRight: 12 },
  sortPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  sortPillActive: { backgroundColor: 'rgba(37,240,200,0.10)' },
  sortPillText: { color: 'rgba(255,255,255,0.46)', fontSize: 10.5, fontWeight: '800' },
  sortPillTextActive: { color: 'rgba(220,255,245,0.98)' },
  loadingRow: { paddingVertical: 28, alignItems: 'center' },
  listContent: { paddingTop: 8, paddingBottom: 82 },
  empty: { color: '#94A3B8', paddingVertical: 18, textAlign: 'center' },
  itemRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(25,112,92,0.065)',
  },
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
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
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
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.10)',
    backgroundColor: 'rgba(25,112,92,0.06)',
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
  trashAction: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
  },
  trashText: { color: '#FCA5A5', fontWeight: '900', fontSize: 12, marginTop: 4 },
  fab: {
    bottom: 66,
    right: 18,
    width: 46,
    height: 46,
    borderRadius: 23,
    shadowOpacity: 0.22,
    shadowRadius: 12,
  },
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
  row2: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pill: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  pillOn: { borderColor: 'rgba(25,112,92,0.65)', backgroundColor: 'rgba(25,112,92,0.14)' },
  pillText: { color: '#94A3B8', fontWeight: '800' },
  pillTextOn: { color: 'rgba(220,255,245,0.98)' },
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
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn: { flex: 1 },
});
