import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
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
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Swipeable } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';

import { supabase } from '../../../../lib/supabase';
import { useSupabaseAuth } from '../../../../hooks/useSupabaseAuth';
import { FuturisticDonutSvg } from '../../../../components/FuturisticDonutSvg';
import { COLORS as THEME_COLORS, RADIUS } from '../../../../theme';

const ACCENT = '#19705C';
const NEON = '#25F0C8';
const logo = require('../../../assets/logo.png');

const STATUS_SPENT = 'poniesiony';
const STATUS_UPCOMING = 'zaplanowany';

const CATEGORIES = [
  'Stan zero',
  'Stan surowy otwarty',
  'Stan surowy zamknięty',
  'Instalacje',
  'Stan deweloperski',
  'Inne',
];

const formatPLN = (value: number) =>
  new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const safeNumber = (v: any) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const normalize = (s: any) => String(s ?? '').trim().toLowerCase();

const formatPLDate = (dateRaw: any) => {
  if (!dateRaw) return '—';
  const d = new Date(dateRaw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pl-PL');
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
  const { t } = useTranslation('budget');
  const router = useRouter();
  const { session, loading: authLoading } = useSupabaseAuth();
  const userId = session?.user?.id;

  const scrollRef = useRef<ScrollView>(null);
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8;

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
  const [fKategoria, setFKategoria] = useState(CATEGORIES.includes('Inne') ? 'Inne' : CATEGORIES[0]);
  const [fKwota, setFKwota] = useState('');
  const [fStatus, setFStatus] = useState<typeof STATUS_SPENT | typeof STATUS_UPCOMING>(STATUS_UPCOMING);
  const [fData, setFData] = useState('');
  const [fOpis, setFOpis] = useState('');
  const [fSklep, setFSklep] = useState('');
  const [picked, setPicked] = useState<PickedFile | null>(null);

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
      setFStatus(STATUS_UPCOMING); setFData(''); setFOpis('');
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
    Alert.alert(t('delete.confirmTitle'), `${row.nazwa ?? t('expense.defaultName')}\n${formatPLN(safeNumber(row.kwota))}`, [
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
    // Wrapper View żeby FAB mógł być position:absolute
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* HEADER — logo po lewej */}
        <View style={[styles.topBar, { paddingTop: topPad }]}>
          <Image source={logo} style={styles.logoImg} resizeMode="contain" />
          <Text style={styles.headerTitle}>{t('header.title')}</Text>
          <View style={{ width: 44 }} />
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
              <Text style={styles.timeBarText}>{t('time.progress', { defaultValue: 'Czas budowy' })}</Text>
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
                {`${formatPLN(spentTotal)} / ${formatPLN(plannedBudget || 0)}`}
              </Text>
            </>
          )}
        </View>

        {/* STATS */}
        {!loading && (
          <View style={styles.heroStats}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>{t('stats.remaining')}</Text>
              <Text style={styles.statValue}>{formatPLN(remaining)}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>{t('stats.planned')}</Text>
              <Text style={styles.statValue}>{formatPLN(upcomingTotal)}</Text>
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
                {t('buddy.analyzing', { defaultValue: 'Kierownik budowy AI' })}
              </Text>
              <Text style={styles.buddyText}>
                {t('buddy.placeholder', { defaultValue: 'Analiza budżetu będzie dostępna wkrótce...' })}
              </Text>
            </View>
          </View>
        )}

        {/* WYKRES KATEGORII */}
        <View style={styles.chartOuter}>
          <BlurView intensity={60} tint="dark" style={styles.chartCard}>
            <View style={styles.chartHeaderRow}>
              <Text style={styles.chartTitle}>{t('chart.categoriesTitle')}</Text>
              <Text style={styles.chartSub}>{t('chart.spentSubtitle')}</Text>
            </View>
            <View style={styles.vChartWrap}>
              {topCats.map(({ k, v }) => {
                const h = Math.max(6, Math.round((v / maxCat) * 120));
                return (
                  <View key={k} style={styles.vCol}>
                    <View style={styles.vBarTrack}>
                      <View style={[styles.vBarFill, { height: h }]} />
                    </View>
                    <Text style={styles.vLabel} numberOfLines={1}>{k}</Text>
                    <Text style={styles.vValue} numberOfLines={1}>{formatPLN(v)}</Text>
                  </View>
                );
              })}
            </View>
          </BlurView>
        </View>

        {/* LISTA WYDATKÓW */}
        <BlurView intensity={70} tint="dark" style={styles.card}>
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
                    ? t('filter.all', { defaultValue: 'Wszystkie' })
                    : f === 'spent'
                    ? t('filter.spent', { defaultValue: 'Poniesione' })
                    : t('filter.planned', { defaultValue: 'Zaplanowane' })
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
                        {w.data ? formatPLDate(w.data) : w.created_at ? t('expense.addedOn', { date: formatPLDate(w.created_at) }) : '—'}
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
                        {formatPLN(safeNumber(w.kwota))}
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
                      ? t('list.showLess', { defaultValue: 'Pokaż mniej' })
                      : t('list.showMore', { defaultValue: `Pokaż wszystkie ${filteredWydatki.length} wydatki`, count: filteredWydatki.length })
                    }
                  </Text>
                  <Feather name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={NEON} style={{ opacity: 0.7 }} />
                </TouchableOpacity>
              )}
            </>
          )}
        </BlurView>

        {/* MODAL */}
        <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => setAddOpen(false)}>
          <View style={styles.modalBackdrop}>
            <BlurView intensity={90} tint="dark" style={styles.modalCard}>
              <Text style={styles.modalTitle}>{t('modal.title')}</Text>

              <Text style={styles.lbl}>{t('modal.nameLabel')}</Text>
              <TextInput value={fNazwa} onChangeText={setFNazwa} style={styles.input} placeholder={t('modal.namePlaceholder')} placeholderTextColor="rgba(148,163,184,0.7)" />

              <Text style={styles.lbl}>{t('modal.categoryLabel')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
                {CATEGORIES.map((c) => {
                  const on = normalize(fKategoria) === normalize(c);
                  return (
                    <TouchableOpacity key={c} onPress={() => setFKategoria(c)} style={[styles.catPill, on && styles.catPillOn]} activeOpacity={0.85}>
                      <Text style={[styles.catText, on && styles.catTextOn]}>{c}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.lbl}>{t('modal.amountLabel')}</Text>
              <TextInput value={fKwota} onChangeText={setFKwota} style={styles.input} keyboardType="numeric" placeholder={t('modal.amountPlaceholder')} placeholderTextColor="rgba(148,163,184,0.7)" />

              <View style={styles.row2}>
                <TouchableOpacity style={[styles.pill, fStatus === STATUS_UPCOMING && styles.pillOn]} onPress={() => setFStatus(STATUS_UPCOMING)}>
                  <Text style={[styles.pillText, fStatus === STATUS_UPCOMING && styles.pillTextOn]}>{t('status.planned')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.pill, fStatus === STATUS_SPENT && styles.pillOn]} onPress={() => setFStatus(STATUS_SPENT)}>
                  <Text style={[styles.pillText, fStatus === STATUS_SPENT && styles.pillTextOn]}>{t('status.spent')}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.lbl}>{t('modal.dateOptional')}</Text>
              <View style={styles.dateRow}>
                <TextInput value={fData} onChangeText={setFData} style={[styles.input, { flex: 1 }]} placeholder="YYYY-MM-DD" placeholderTextColor="rgba(148,163,184,0.7)" />
                <TouchableOpacity style={styles.calBtn} onPress={openDatePicker} activeOpacity={0.85}>
                  <Text style={styles.calIcon}>📅</Text>
                </TouchableOpacity>
              </View>

              {datePickerOpen && (
                Platform.OS === 'ios' ? (
                  <View style={styles.iosDateWrap}>
                    <DateTimePicker value={datePickerValue} mode="date" display="spinner" onChange={onDatePicked} />
                    <TouchableOpacity style={styles.iosDateOk} onPress={() => { setDatePickerOpen(false); setFData(toYYYYMMDD(datePickerValue)); }} activeOpacity={0.85}>
                      <Text style={styles.iosDateOkText}>{t('modal.setDate')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <DateTimePicker value={datePickerValue} mode="date" display="default" onChange={onDatePicked} />
                )
              )}

              <Text style={styles.lbl}>{t('modal.descriptionOptional')}</Text>
              <TextInput value={fOpis} onChangeText={setFOpis} style={styles.input} placeholder={t('modal.descriptionPlaceholder')} placeholderTextColor="rgba(148,163,184,0.7)" />

              <Text style={styles.lbl}>{t('modal.storeOptional')}</Text>
              <TextInput value={fSklep} onChangeText={setFSklep} style={styles.input} placeholder={t('modal.storePlaceholder')} placeholderTextColor="rgba(148,163,184,0.7)" />

              <TouchableOpacity style={styles.fileBtn} onPress={pickFile}>
                <Text style={styles.fileBtnText}>{picked ? t('modal.fileSelected', { name: picked.name }) : t('modal.fileOptional')}</Text>
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setAddOpen(false)} disabled={saving}>
                  <Text style={styles.btnGhostText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnMain, saving && { opacity: 0.7 }]} onPress={addExpense} disabled={saving}>
                  <Text style={styles.btnMainText}>{saving ? t('common.saving') : t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </Modal>

        <View style={{ height: 26 }} />
      </ScrollView>

      {/* FAB — przyklejony na dole po prawej, zawsze widoczny */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setAddOpen(true)}
        activeOpacity={0.9}
      >
        <Feather name="plus" size={24} color={NEON} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', padding: 16 },

  topBar: {
    paddingHorizontal: 2,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoImg: { width: 36, height: 36 },
  headerTitle: {
    color: '#19705C',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.2,
    textShadowColor: 'rgba(25,112,92,0.18)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
    textAlign: 'center',
    flex: 1,
  },

  errorText: { color: '#FCA5A5', marginBottom: 10, textAlign: 'center', fontWeight: '800' },

  // ── Pasek czasu ──
  timeBarWrap: { marginBottom: 14 },
  timeBarLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  timeBarText: { color: 'rgba(255,255,255,0.30)', fontSize: 11, fontWeight: '700' },
  timeBarPct: { color: 'rgba(255,255,255,0.30)', fontSize: 11, fontWeight: '700' },
  timeBarTrack: {
    height: 4, borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  timeBarFill: { height: 4, borderRadius: 99, backgroundColor: 'rgba(25,112,92,0.50)' },

  // ── Donut ──
  donutOnlyWrap: { alignItems: 'center', marginTop: 6, marginBottom: 10 },
  donutSubText: { marginTop: 10, color: 'rgba(255,255,255,0.46)', fontSize: 12.5, fontWeight: '700' },

  // ── Stats ──
  heroStats: { flexDirection: 'row', marginTop: 10, gap: 12 },
  statBox: {
    flex: 1, padding: 12, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
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
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 22, shadowOffset: { width: 0, height: 12 },
  },
  chartCard: {
    borderRadius: RADIUS.card, padding: 16,
    backgroundColor: 'rgba(255,255,255,0.026)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  chartHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  chartTitle: { color: '#F8FAFC', fontWeight: '900', fontSize: 16, letterSpacing: -0.2 },
  chartSub: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
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
    backgroundColor: 'rgba(255,255,255,0.026)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
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

  // ── FAB ──
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(37,240,200,0.14)',
    borderWidth: 1.5, borderColor: 'rgba(37,240,200,0.40)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: NEON, shadowOpacity: 0.30, shadowRadius: 16, shadowOffset: { width: 0, height: 0 },
  },

  // ── Modal ──
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  modalCard: { padding: 16, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  modalTitle: { color: '#F8FAFC', fontWeight: '900', fontSize: 18, marginBottom: 12 },
  lbl: { color: '#94A3B8', fontSize: 12, marginTop: 10, marginBottom: 6 },
  input: {
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12, paddingVertical: 10, color: '#FFFFFF',
  },
  catRow: { gap: 10, paddingVertical: 2, paddingRight: 10 },
  catPill: {
    borderRadius: 999, paddingVertical: 9, paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.03)',
  },
  catPillOn: { borderColor: 'rgba(25,112,92,0.65)', backgroundColor: 'rgba(25,112,92,0.14)' },
  catText: { color: '#94A3B8', fontWeight: '800', fontSize: 12 },
  catTextOn: { color: 'rgba(220,255,245,0.98)' },
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
  btn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  btnGhost: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.03)' },
  btnGhostText: { color: '#E2E8F0', fontWeight: '900' },
  btnMain: { borderWidth: 1, borderColor: 'rgba(37,240,200,0.38)', backgroundColor: 'rgba(37,240,200,0.14)', borderRadius: RADIUS.button, paddingVertical: 13 },
  btnMainText: { color: THEME_COLORS.neon, fontWeight: '900' },
});