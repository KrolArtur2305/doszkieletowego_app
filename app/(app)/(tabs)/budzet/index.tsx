import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Swipeable } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';

import { supabase } from '../../../../lib/supabase';
import { useSupabaseAuth } from '../../../../hooks/useSupabaseAuth';
import { FuturisticDonutSvg } from '../../../../components/FuturisticDonutSvg';
import { FloatingAddButton } from '../../../../components/FloatingAddButton';
import { AppButton, AppCard, AppInput, AppScreen, SectionHeader } from '../../../../src/ui/components';
import { colors, radius, spacing, typography } from '../../../../src/ui/theme';
import { COLORS as THEME_COLORS, RADIUS } from '../../../../theme';

const ACCENT = colors.accent;
const NEON = colors.accentBright;
const logo = require('../../../assets/logo.png');
const STATUS_SPENT = 'poniesiony';
const STATUS_UPCOMING = 'zaplanowany';

const CATEGORY_OPTIONS = [
  { value: 'Stan zero', label: 'Zero' },
  { value: 'Stan surowy otwarty', label: 'SSO' },
  { value: 'Stan surowy zamknięty', label: 'SSZ' },
  { value: 'Instalacje', label: 'Inst.' },
  { value: 'Stan deweloperski', label: 'Dewel.' },
  { value: 'Inne', label: 'Inne' },
] as const;

const CATEGORIES = CATEGORY_OPTIONS.map((option) => option.value);
type CategoryValue = (typeof CATEGORY_OPTIONS)[number]['value'];

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

const safeNumber = (v: any) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const normalize = (s: any) => String(s ?? '').trim().toLowerCase();

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
  const stage = normalize(stageName);
  if (!stage) return 'Inne';
  if (stage.includes('zero')) return 'Stan zero';
  if (stage.includes('otwart')) return 'Stan surowy otwarty';
  if (stage.includes('zamkni')) return 'Stan surowy zamknięty';
  if (stage.includes('instal')) return 'Instalacje';
  if (stage.includes('dewel')) return 'Stan deweloperski';
  return 'Inne';
}

type WydatkiRow = {
  id: string;
  nazwa: string | null;
  kategoria: string | null;
  kwota: number | string | null;
  data: string | null;
  status: string | null;
  created_at: string | null;
  opis: string | null;
  sklep: string | null;
  plik: string | null;
};

type PickedFile = {
  name: string;
  mimeType: string;
  uri: string;
  size?: number;
};

type FilterType = 'all' | 'spent' | 'planned';

function guessMime(name: string, fallback?: string) {
  if (fallback) return fallback;
  const lower = (name || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

async function uriToArrayBuffer(uri: string, readFileFailedText: string): Promise<ArrayBuffer> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`${readFileFailedText}: ${res.status} ${res.statusText}`);
  return await res.arrayBuffer();
}

export default function BudzetScreen() {
  const { t, i18n } = useTranslation('budget');
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

  // filter + show more
  const [filter, setFilter] = useState<FilterType>('all');
  const [showAll, setShowAll] = useState(false);

  // modal
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fNazwa, setFNazwa] = useState('');
  const [fKategoria, setFKategoria] = useState<CategoryValue>(CATEGORIES.includes('Inne') ? 'Inne' : CATEGORIES[0] as CategoryValue);
  const [fKwota, setFKwota] = useState('');
  const [fStatus, setFStatus] = useState<typeof STATUS_SPENT | typeof STATUS_UPCOMING>(STATUS_SPENT);
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
    () => wydatki.filter((w) => normalize(w.status) === STATUS_SPENT).reduce((a, w) => a + safeNumber(w.kwota), 0),
    [wydatki]
  );
  const upcomingTotal = useMemo(
    () => wydatki.filter((w) => normalize(w.status) === STATUS_UPCOMING).reduce((a, w) => a + safeNumber(w.kwota), 0),
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

  // ── Filtered list ──
  const filteredWydatki = useMemo(() => {
    if (filter === 'spent') return wydatki.filter((w) => normalize(w.status) === STATUS_SPENT);
    if (filter === 'planned') return wydatki.filter((w) => normalize(w.status) === STATUS_UPCOMING);
    return wydatki;
  }, [wydatki, filter]);

  const visibleWydatki = useMemo(
    () => (showAll ? filteredWydatki : filteredWydatki.slice(0, 8)),
    [filteredWydatki, showAll]
  );

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
        .select('id, nazwa, kategoria, kwota, data, status, created_at, opis, sklep, plik')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (expRes.error) throw expRes.error;
      setWydatki((expRes.data ?? []) as any);

      const stageRes = await supabase
        .from('etapy')
        .select('nazwa, status, kolejnosc')
        .eq('user_id', userId)
        .order('kolejnosc', { ascending: true });

      if (stageRes.error) throw stageRes.error;

      const completedStatuses = new Set(['zrealizowany', 'wykonany', 'done', 'completed', 'ukończony']);
      const activeStage = (stageRes.data ?? []).find((row: any) => !completedStatuses.has(normalize(row?.status)));
      const fallbackStage = (stageRes.data ?? [])[0];
      setCurrentStageCategory(inferCategoryFromStage(activeStage?.nazwa ?? fallbackStage?.nazwa ?? null));
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
    setPicked({ name: f.name ?? 'plik', uri: f.uri, mimeType: guessMime(f.name ?? '', f.mimeType ?? undefined), size: f.size });
  };

  const uploadOptionalFile = async (): Promise<string | null> => {
    if (!picked || !userId) return null;
    const safeName = (picked.name || 'plik').replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${userId}/wydatki/${Date.now()}_${safeName}`;
    const ab = await uriToArrayBuffer(picked.uri, t('errors.readFileFailed'));
    const up = await supabase.storage.from('paragony').upload(key, ab, { contentType: picked.mimeType, upsert: false });
    if (up.error) throw up.error;
    return key;
  };

  const addExpense = async () => {
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
        opis: fOpis.trim() || null,
        sklep: fSklep.trim() || null,
        plik: storageKey,
      };
      const ins = await supabase.from('wydatki').insert(payload).select('id').maybeSingle();
      if (ins.error) throw ins.error;

      setFNazwa(''); setFKategoria('Inne'); setFKwota('');
      setFStatus(STATUS_SPENT); setFData(''); setFOpis('');
      setFSklep(''); setPicked(null);
      setAddOpen(false);
      await loadBudget();
    } catch (e: any) {
      alert(e?.message ?? t('errors.addFailed'));
    } finally {
      setSaving(false);
    }
  };

  const openReceipt = async (storageKey: string) => {
    const signed = await supabase.storage.from('paragony').createSignedUrl(storageKey, 60 * 60);
    if (signed.error) { alert(signed.error.message); return; }
    if (signed.data?.signedUrl) Linking.openURL(signed.data.signedUrl);
  };

  const confirmDeleteExpense = (row: WydatkiRow) => {
    Alert.alert(t('delete.confirmTitle'), `${row.nazwa ?? t('expense.defaultName')}\n${formatCurrency(safeNumber(row.kwota), datePickerLocale)}`, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteExpense(row) },
    ]);
  };

  const deleteExpense = async (row: WydatkiRow) => {
    if (!userId) return;
    try {
      const del = await supabase.from('wydatki').delete().eq('id', row.id).eq('user_id', userId);
      if (del.error) throw del.error;
      if (row.plik) await supabase.storage.from('paragony').remove([row.plik]);
      setWydatki((prev) => prev.filter((w) => w.id !== row.id));
    } catch (e: any) {
      alert(e?.message ?? t('errors.deleteFailed'));
    }
  };

  const renderRightActions = (_progress: any, _dragX: any, row: WydatkiRow) => (
    <TouchableOpacity style={styles.trashAction} onPress={() => confirmDeleteExpense(row)} activeOpacity={0.85}>
      <Text style={styles.trashIcon}>🗑️</Text>
      <Text style={styles.trashText}>{t('common.delete')}</Text>
    </TouchableOpacity>
  );

  const openDatePicker = () => {
    const base = fData?.trim() ? new Date(fData.trim()) : new Date();
    if (!Number.isNaN(base.getTime())) setDatePickerValue(base);
    setDatePickerOpen(true);
  };

  const openAddExpense = () => {
    setFNazwa('');
    setFKwota('');
    setFKategoria(currentStageCategory || 'Inne');
    setFStatus(STATUS_SPENT);
    setFData('');
    setFOpis('');
    setFSklep('');
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

  const categoryTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const w of wydatki) {
      if (normalize(w.status) !== STATUS_SPENT) continue;
      const k = (w.kategoria ?? 'Inne').trim() || 'Inne';
      out[k] = (out[k] ?? 0) + safeNumber(w.kwota);
    }
    return out;
  }, [wydatki]);

  const topCats = useMemo(() => {
    const entries = Object.entries(categoryTotals).map(([k, v]) => ({ k, v }));
    entries.sort((a, b) => b.v - a.v);
    const sliced = entries.slice(0, 6);
    if (sliced.length === 0) {
      return [
        { k: 'Inne', v: 0 }, { k: 'SSO', v: 0 }, { k: 'SSZ', v: 0 },
        { k: 'Instal.', v: 0 }, { k: 'Dewel.', v: 0 }, { k: 'Zero', v: 0 },
      ];
    }
    return sliced;
  }, [categoryTotals]);

  const maxCat = useMemo(() => Math.max(1, ...topCats.map((x) => x.v)), [topCats]);

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

        {/* DONUT */}
        <View style={styles.donutOnlyWrap}>
          {loading ? (
            <View style={{ paddingVertical: 26 }}>
              <ActivityIndicator color={ACCENT} />
            </View>
          ) : (
            <>
              <FuturisticDonutSvg
                value={clamp01(budgetUtil)}
                label=""
                onPressLabel={() => scrollRef.current?.scrollTo({ y: 740, animated: true })}
                isActive={true}
                size={210}
                stroke={16}
              />
              <Text style={styles.donutSubText}>
                {`${formatCurrency(spentTotal, datePickerLocale)} / ${formatCurrency(plannedBudget || 0, datePickerLocale)}`}
              </Text>
            </>
          )}
        </View>

        {/* STATS */}
        {!loading && (
          <View style={styles.heroStats}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>{t('stats.remaining')}</Text>
              <Text style={styles.statValue}>{formatCurrency(remaining, datePickerLocale)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>{t('stats.planned')}</Text>
              <Text style={styles.statValue}>{formatCurrency(upcomingTotal, datePickerLocale)}</Text>
            </View>
          </View>
        )}

        {/* BUDDY WIDGET — placeholder, logika AI wkrótce */}
        {!loading && (
          <View style={styles.buddyWrap}>
            <View style={styles.buddyAvatar}>
              <Feather name="cpu" size={16} color={NEON} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.buddyName}>
                {t('buddy.analyzing')}
              </Text>
              <Text style={styles.buddyText}>
                {t('buddy.placeholder')}
              </Text>
            </View>
          </View>
        )}

        {/* WYKRES KATEGORII */}
        <View style={styles.chartOuter}>
          <AppCard contentStyle={styles.chartCard} glow>
            <SectionHeader
              title={t('chart.categoriesTitle')}
              subtitle={t('chart.spentSubtitle')}
              style={styles.chartHeaderRow}
            />
            <View style={styles.vChartWrap}>
              {topCats.map(({ k, v }) => {
                const h = Math.max(6, Math.round((v / maxCat) * 120));
                return (
                  <View key={k} style={styles.vCol}>
                    <View style={styles.vBarTrack}>
                      <View style={[styles.vBarFill, { height: h }]} />
                    </View>
                    <Text style={styles.vLabel} numberOfLines={1}>{k}</Text>
                    <Text style={styles.vValue} numberOfLines={1}>{formatCurrency(v, datePickerLocale)}</Text>
                  </View>
                );
              })}
            </View>
          </AppCard>
        </View>

        {/* LISTA WYDATKÓW */}
        <AppCard contentStyle={styles.card}>
          {/* Header + filtry */}
          <View style={styles.listHeaderRow}>
            <Text style={styles.listTitle}>{t('list.recentTitle')}</Text>
          </View>

          {/* Filter pills */}
          <View style={styles.filterRow}>
            {(['all', 'spent', 'planned'] as FilterType[]).map((f) => (
              <TouchableOpacity
                key={f}
                onPress={() => { setFilter(f); setShowAll(false); }}
                style={[styles.filterPill, filter === f && styles.filterPillActive]}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterPillText, filter === f && styles.filterPillTextActive]}>
                  {f === 'all'
                    ? t('filter.all')
                    : f === 'spent'
                    ? t('filter.spent')
                    : t('filter.planned')
                  }
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? (
            <View style={{ paddingVertical: 14 }}>
              <ActivityIndicator color={ACCENT} />
            </View>
          ) : filteredWydatki.length === 0 ? (
            <Text style={styles.empty}>{t('list.empty')}</Text>
          ) : (
            <>
              {visibleWydatki.map((w) => (
                <Swipeable
                  key={w.id}
                  renderRightActions={(p, d) => renderRightActions(p, d, w)}
                  overshootRight={false}
                  rightThreshold={40}
                >
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onLongPress={() => confirmDeleteExpense(w)}
                    delayLongPress={350}
                    style={[
                      styles.itemRow,
                      normalize(w.status) === STATUS_UPCOMING && styles.itemRowPlanned,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[
                        styles.itemName,
                        normalize(w.status) === STATUS_UPCOMING && styles.itemNamePlanned,
                      ]} numberOfLines={1}>
                        {w.nazwa ?? t('expense.defaultName')}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {w.data ? formatDateByLocale(w.data, datePickerLocale) : w.created_at ? t('expense.addedOn', { date: formatDateByLocale(w.created_at, datePickerLocale) }) : '—'}
                        {'  •  '}
                        {w.kategoria ?? 'Inne'}
                        {'  •  '}
                        {normalize(w.status) === STATUS_SPENT ? t('status.spent') : t('status.planned')}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[
                        styles.itemAmount,
                        normalize(w.status) === STATUS_UPCOMING && styles.itemAmountPlanned,
                      ]}>
                        {formatCurrency(safeNumber(w.kwota), datePickerLocale)}
                      </Text>
                      {!!w.plik && (
                        <TouchableOpacity onPress={() => openReceipt(w.plik!)} style={{ marginTop: 6 }}>
                          <Text style={styles.fileLink}>{t('expense.receiptLink')}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>
                </Swipeable>
              ))}

              {/* Pokaż więcej / mniej */}
              {filteredWydatki.length > 8 && (
                <TouchableOpacity
                  onPress={() => setShowAll((v) => !v)}
                  style={styles.showMoreBtn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.showMoreText}>
                    {showAll
                      ? t('list.showLess')
                      : t('list.showMore', { count: filteredWydatki.length })
                    }
                  </Text>
                  <Feather name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={NEON} style={{ opacity: 0.7 }} />
                </TouchableOpacity>
              )}
            </>
          )}
        </AppCard>

        {/* MODAL */}
        <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => setAddOpen(false)}>
          <View style={styles.modalBackdrop}>
            <AppCard contentStyle={styles.modalCard} style={styles.modalCardOuter} withShadow={false}>
              <Text style={styles.modalTitle}>{t('modal.title')}</Text>

              <Text style={styles.lbl}>{t('modal.nameLabel')}</Text>
              <AppInput value={fNazwa} onChangeText={setFNazwa} style={styles.input} placeholder={t('modal.namePlaceholder')} />

              <Text style={styles.lbl}>{t('modal.amountLabel')}</Text>
              <AppInput value={fKwota} onChangeText={setFKwota} style={styles.input} keyboardType="numeric" placeholder={t('modal.amountPlaceholder')} />

              <View style={styles.row2}>
                <TouchableOpacity style={[styles.pill, fStatus === STATUS_SPENT && styles.pillOn]} onPress={() => setFStatus(STATUS_SPENT)}>
                  <Text style={[styles.pillText, fStatus === STATUS_SPENT && styles.pillTextOn]}>{t('status.spent')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pill, fStatus === STATUS_UPCOMING && styles.pillOn]} onPress={() => setFStatus(STATUS_UPCOMING)}>
                  <Text style={[styles.pillText, fStatus === STATUS_UPCOMING && styles.pillTextOn]}>{t('status.planned')}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.lbl}>{t('modal.categoryLabel')}</Text>
              <View style={styles.catGrid}>
                {CATEGORY_OPTIONS.map((option) => {
                  const c = option.value;
                  const on = normalize(fKategoria) === normalize(c);
                  return (
                    <TouchableOpacity key={c} onPress={() => setFKategoria(c)} style={[styles.catTile, on && styles.catTileOn]} activeOpacity={0.85}>
                      <Text style={[styles.catTileText, on && styles.catTileTextOn]}>{option.label}</Text>
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

              <Text style={styles.lbl}>{t('modal.descriptionOptional')}</Text>
              <AppInput value={fOpis} onChangeText={setFOpis} style={styles.input} placeholder={t('modal.descriptionPlaceholder')} />

              <Text style={styles.lbl}>{t('modal.storeOptional')}</Text>
              <AppInput value={fSklep} onChangeText={setFSklep} style={styles.input} placeholder={t('modal.storePlaceholder')} />

              <TouchableOpacity style={styles.fileBtn} onPress={pickFile}>
                <Text style={styles.fileBtnText}>{picked ? t('modal.fileSelected', { name: picked.name }) : t('modal.fileOptional')}</Text>
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <AppButton title={t('common.cancel')} variant="secondary" onPress={() => setAddOpen(false)} disabled={saving} style={styles.modalBtn} />
                <AppButton title={saving ? t('common.saving') : t('common.save')} onPress={addExpense} disabled={saving} style={styles.modalBtn} />
              </View>
            </AppCard>
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

  // ── Donut ──
  donutOnlyWrap: { alignItems: 'center', marginTop: 6, marginBottom: 10 },
  donutSubText: { marginTop: 10, color: 'rgba(255,255,255,0.46)', fontSize: 12.5, fontWeight: '700' },

  // ── Stats ──
  heroStats: { flexDirection: 'row', marginTop: 10, gap: 12 },
  statBox: {
    flex: 1, padding: 12, borderRadius: 16,
    backgroundColor: 'rgba(25,112,92,0.10)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.28)',
    shadowColor: NEON,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  statLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  statValue: { color: '#F8FAFC', fontSize: 16, fontWeight: '900', marginTop: 4 },

  // ── Buddy widget ──
  buddyWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 10, padding: 12, borderRadius: 14,
    backgroundColor: 'rgba(37,240,200,0.05)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.14)',
  },
  buddyAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(37,240,200,0.12)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  buddyName: { color: NEON, fontSize: 11, fontWeight: '900', marginBottom: 2, opacity: 0.80 },
  buddyText: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '600' },

  // ── Chart ──
  chartOuter: {
    marginTop: 14, borderRadius: RADIUS.card, overflow: 'hidden',
    shadowColor: NEON, shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 0 },
  },
  chartCard: {
    borderRadius: RADIUS.card, padding: 16,
    backgroundColor: 'rgba(25,112,92,0.08)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.24)',
  },
  chartHeaderRow: { marginBottom: 0 },
  vChartWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 },
  vCol: { width: 62, alignItems: 'center' },
  vBarTrack: {
    width: 18, height: 120, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'flex-end', overflow: 'hidden',
  },
  vBarFill: { width: '100%', borderRadius: 999, backgroundColor: 'rgba(25,112,92,0.42)', borderWidth: 1, borderColor: 'rgba(37,240,200,0.18)' },
  vLabel: { marginTop: 8, color: 'rgba(255,255,255,0.78)', fontWeight: '900', fontSize: 11, textAlign: 'center' },
  vValue: { marginTop: 2, color: 'rgba(220,255,245,0.95)', fontWeight: '900', fontSize: 10, textAlign: 'center' },

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

  // Filter pills
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterPill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  filterPillActive: { borderColor: 'rgba(25,112,92,0.50)', backgroundColor: 'rgba(25,112,92,0.12)' },
  filterPillText: { color: 'rgba(255,255,255,0.40)', fontSize: 12, fontWeight: '800' },
  filterPillTextActive: { color: NEON },

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
