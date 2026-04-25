import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../../../lib/supabase';
import { useSupabaseAuth } from '../../../../../hooks/useSupabaseAuth';
import { AppButton, AppInput } from '../../../../../src/ui/components';
import { colors as uiColors, typography } from '../../../../../src/ui/theme';

const ACCENT = '#19705C';
const NEON = '#25F0C8';
const { width: W } = Dimensions.get('window');
const APP_LOGO = require('../../../../assets/logo.png');
const MAX_JOURNAL_IMAGE_BYTES = 15 * 1024 * 1024;
const ALLOWED_JOURNAL_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic']);
const JOURNAL_IMAGES_BUCKET = 'zdjecia';
// ─── Types ────────────────────────────────────────────────────────────────────

type Etap = {
  id: string;
  nazwa: string;
  status?: string | null;
  kolejnosc?: number | null;
};

type Wpis = {
  id: string;
  user_id: string;
  data: string;
  tresc: string;
  etap_id: string | null;
  etap_nazwa: string | null;
  zdjecie_url: string | null;
  zdjecie_display_url?: string | null;
  created_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fromYMD(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function localeFromLng(lng?: string) {
  const base = (lng || 'en').split('-')[0];
  if (base === 'pl') return 'pl-PL';
  if (base === 'de') return 'de-DE';
  return 'en-US';
}

function formatDate(ymd: string, locale: string) {
  const d = new Date(ymd + 'T00:00:00');
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function getDayName(ymd: string, locale: string) {
  const d = new Date(ymd + 'T00:00:00');
  return d.toLocaleDateString(locale, { weekday: 'long' });
}

function getCurrentEtapId(etapy: Etap[]) {
  if (!etapy.length) return null;

  const firstCurrent = etapy.find((e) => {
    const status = (e.status ?? '').toLowerCase();
    return status !== 'zrealizowany' && status !== 'done' && status !== 'completed';
  });

  return firstCurrent?.id ?? etapy[0]?.id ?? null;
}

function getJournalImageExt(uri?: string | null) {
  const cleaned = String(uri || '').split('?')[0].split('#')[0];
  const ext = cleaned.split('.').pop()?.toLowerCase() || '';
  return ALLOWED_JOURNAL_IMAGE_EXTENSIONS.has(ext) ? ext : '';
}

function getJournalStoragePathFromUrl(url?: string | null) {
  const rawUrl = String(url || '').trim();
  if (!rawUrl) return null;
  if (!/^https?:\/\//i.test(rawUrl)) return rawUrl.replace(/^\/+/, '') || null;

  const publicMarker = `/storage/v1/object/public/${JOURNAL_IMAGES_BUCKET}/`;
  const signedMarker = `/storage/v1/object/sign/${JOURNAL_IMAGES_BUCKET}/`;

  const publicIndex = rawUrl.indexOf(publicMarker);
  if (publicIndex !== -1) {
    return rawUrl.slice(publicIndex + publicMarker.length).split('?')[0];
  }

  const signedIndex = rawUrl.indexOf(signedMarker);
  if (signedIndex !== -1) {
    return rawUrl.slice(signedIndex + signedMarker.length).split('?')[0];
  }

  return null;
}

async function getJournalImageDisplayUrl(value?: string | null) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return null;

  const storagePath = getJournalStoragePathFromUrl(rawValue);
  if (!storagePath) {
    return /^https?:\/\//i.test(rawValue) ? rawValue : null;
  }

  const { data, error } = await supabase.storage
    .from(JOURNAL_IMAGES_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  if (error || !data?.signedUrl) {
    console.warn('[Dziennik] createSignedUrl failed:', error?.message || storagePath);
    return /^https?:\/\//i.test(rawValue) ? rawValue : null;
  }

  return data.signedUrl;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DziennikScreen() {
  const { session } = useSupabaseAuth();
  const { t, i18n } = useTranslation('journal');
  const topPad = 0;
  const dateLocale = useMemo(
    () => localeFromLng(i18n.resolvedLanguage || i18n.language),
    [i18n.language, i18n.resolvedLanguage]
  );

  // ── State ──
  const [wpisy, setWpisy] = useState<Wpis[]>([]);
  const [loading, setLoading] = useState(true);
  const [etapy, setEtapy] = useState<Etap[]>([]);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // ── Add modal ──
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWpis, setEditingWpis] = useState<Wpis | null>(null);
  const [formData, setFormData] = useState(toYMD(new Date()));
  const [formTresc, setFormTresc] = useState('');
  const [formEtapId, setFormEtapId] = useState<string | null>(null);
  const [formZdjecieUri, setFormZdjecieUri] = useState<string | null>(null);
  const [formZdjecieUrl, setFormZdjecieUrl] = useState<string | null>(null);
  const [formZdjecieStoredValue, setFormZdjecieStoredValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAllEtapy, setShowAllEtapy] = useState(false);

  // ── Detail modal ──
  const [detailWpis, setDetailWpis] = useState<Wpis | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // ── Animations ──
  const fabAnim = useRef(new Animated.Value(0)).current;
  const headerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(fabAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 60,
        friction: 8,
        delay: 300,
      }),
      Animated.timing(headerAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fabAnim, headerAnim]);

  // ── Load data ──
  const loadWpisy = async () => {
    const userId = session?.user?.id;
    if (!userId) return;

    setLoading(true);
    try {
      const { data } = await supabase
        .from('dziennik')
        .select('*, etapy(nazwa)')
        .eq('user_id', userId);

      const mapped = await Promise.all(
        (data ?? []).map(async (w: any) => ({
          ...w,
          etap_nazwa: w.etapy?.nazwa ?? null,
          zdjecie_display_url: await getJournalImageDisplayUrl(w.zdjecie_url),
        }))
      );

      setWpisy(mapped);
    } catch {
      setWpisy([]);
    } finally {
      setLoading(false);
    }
  };

  const loadEtapy = async () => {
    const userId = session?.user?.id;
    if (!userId) return;

    const { data } = await supabase
      .from('etapy')
      .select('id, nazwa, status, kolejnosc')
      .eq('user_id', userId)
      .order('kolejnosc', { ascending: true });

    setEtapy((data ?? []) as Etap[]);
  };

  useEffect(() => {
    loadWpisy();
    loadEtapy();
  }, [session?.user?.id]);

  const sortedWpisy = useMemo(() => {
    const copy = [...wpisy];
    copy.sort((a, b) => {
      const dateCompare = a.data.localeCompare(b.data);
      if (dateCompare !== 0) {
        return sortOrder === 'desc' ? -dateCompare : dateCompare;
      }

      const createdCompare = (a.created_at ?? '').localeCompare(b.created_at ?? '');
      return sortOrder === 'desc' ? -createdCompare : createdCompare;
    });
    return copy;
  }, [wpisy, sortOrder]);

  const currentEtapId = useMemo(() => getCurrentEtapId(etapy), [etapy]);

  const selectedEtap = useMemo(
    () => etapy.find((e) => e.id === formEtapId) ?? null,
    [etapy, formEtapId]
  );

  // ── Open add ──
  const openAdd = () => {
    setEditingWpis(null);
    setFormData(toYMD(new Date()));
    setFormTresc('');
    setFormEtapId(currentEtapId);
    setFormZdjecieUri(null);
    setFormZdjecieUrl(null);
    setFormZdjecieStoredValue(null);
    setShowAllEtapy(false);
    setShowDatePicker(false);
    setModalOpen(true);
  };

  const openEdit = (w: Wpis) => {
    setDetailOpen(false);
    setTimeout(() => {
      setEditingWpis(w);
      setFormData(w.data);
      setFormTresc(w.tresc);
      setFormEtapId(w.etap_id);
      setFormZdjecieUri(null);
      setFormZdjecieUrl(w.zdjecie_display_url ?? w.zdjecie_url);
      setFormZdjecieStoredValue(w.zdjecie_url);
      setShowAllEtapy(false);
      setShowDatePicker(false);
      setModalOpen(true);
    }, 300);
  };

  // ── Pick image ──
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
      allowsEditing: true,
      aspect: [16, 9],
    });

    const pickedAsset = result.assets?.[0];
    if (!result.canceled && pickedAsset?.uri) {
      const fileSize = Number((pickedAsset as any).fileSize ?? 0);
      const mimeType = String((pickedAsset as any).mimeType ?? '').toLowerCase();
      const isImageMime = mimeType.startsWith('image/');
      const hasAllowedExt = !!getJournalImageExt((pickedAsset as any).fileName ?? pickedAsset.uri);

      if (fileSize === 0) {
        Alert.alert(t('alerts.errorTitle'), t('alerts.emptyFile', { defaultValue: 'Wybrany plik jest pusty.' }));
        return;
      }

      if (fileSize > 0 && fileSize > MAX_JOURNAL_IMAGE_BYTES) {
        Alert.alert(t('alerts.errorTitle'), t('alerts.fileTooLarge', { defaultValue: 'Zdjęcie jest zbyt duże. Maksymalny rozmiar to 15 MB.' }));
        return;
      }

      if (!isImageMime && !hasAllowedExt) {
        Alert.alert(t('alerts.errorTitle'), t('alerts.invalidFileType', { defaultValue: 'Możesz dodać tylko plik obrazu.' }));
        return;
      }

      setFormZdjecieUri(pickedAsset.uri);
      setFormZdjecieUrl(null);
    }
  };

  const removeImage = () => {
    setFormZdjecieUri(null);
    setFormZdjecieUrl(null);
    setFormZdjecieStoredValue(null);
  };

  // ── Upload image ──
  const uploadImage = async (uri: string, userId: string): Promise<string | null> => {
    try {
      if (!uri) {
        throw new Error(t('alerts.emptyFile', { defaultValue: 'Wybrany plik jest pusty.' }));
      }

      const ext = getJournalImageExt(uri) || 'jpg';
      if (!ALLOWED_JOURNAL_IMAGE_EXTENSIONS.has(ext.toLowerCase())) {
        throw new Error(t('alerts.invalidFileType', { defaultValue: 'Możesz dodać tylko plik obrazu.' }));
      }
      const path = `${userId}/dziennik/${Date.now()}.${ext}`;
      const response = await fetch(uri);
      const blob = await response.blob();
      if (!blob || blob.size <= 0) {
        throw new Error(t('alerts.emptyFile', { defaultValue: 'Wybrany plik jest pusty.' }));
      }
      if (blob.size > MAX_JOURNAL_IMAGE_BYTES) {
        throw new Error(t('alerts.fileTooLarge', { defaultValue: 'Zdjęcie jest zbyt duże. Maksymalny rozmiar to 15 MB.' }));
      }

      const { error } = await supabase.storage.from(JOURNAL_IMAGES_BUCKET).upload(path, blob, {
        contentType: `image/${ext}`,
      });

      if (error) throw error;

      return path;
    } catch {
      return null;
    }
  };

  // ── Save ──
  const save = async () => {
    if (!formTresc.trim()) {
      Alert.alert(t('alerts.errorTitle'), t('alerts.noteRequired'));
      return;
    }

    const userId = session?.user?.id;
    if (!userId) return;

    setSaving(true);

    try {
      let zdjecieUrl = formZdjecieStoredValue;

      if (formZdjecieUri) {
        zdjecieUrl = await uploadImage(formZdjecieUri, userId);
        if (!zdjecieUrl) {
          throw new Error(
            t('alerts.photoUploadError', {
              defaultValue: 'Nie udało się przesłać zdjęcia. Spróbuj ponownie.',
            })
          );
        }
      }

      const payload = {
        user_id: userId,
        data: formData,
        tresc: formTresc.trim(),
        etap_id: formEtapId || null,
        zdjecie_url: zdjecieUrl || null,
      };

      if (editingWpis) {
        const { error } = await supabase.from('dziennik').update(payload).eq('id', editingWpis.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('dziennik').insert(payload);
        if (error) throw error;
      }

      setModalOpen(false);
      await loadWpisy();
    } catch (e: any) {
      Alert.alert(t('alerts.errorTitle'), e?.message ?? t('alerts.saveError'));
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──
  const deleteWpis = (w: Wpis) => {
    Alert.alert(t('detail.deleteTitle'), t('detail.deleteConfirm'), [
      { text: t('common:cancel'), style: 'cancel' },
      {
        text: t('common:delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('dziennik').delete().eq('id', w.id);
            if (error) throw error;

            const storagePath = getJournalStoragePathFromUrl(w.zdjecie_url);
            if (storagePath) {
              const { error: storageError } = await supabase
                .storage
                .from(JOURNAL_IMAGES_BUCKET)
                .remove([storagePath]);

              if (storageError) {
                console.warn('[Dziennik] remove storage image failed:', storageError.message);
                Alert.alert(
                  t('alerts.errorTitle'),
                  t('detail.deleteStorageWarning', {
                    defaultValue: 'Wpis usunięto, ale nie udało się usunąć zdjęcia z pamięci.',
                  })
                );
              }
            }

            setDetailOpen(false);
            await loadWpisy();
          } catch (e: any) {
            Alert.alert(t('alerts.errorTitle'), e?.message ?? t('alerts.saveError'));
          }
        },
      },
    ]);
  };

  const fabScale = fabAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bg} />
      <View pointerEvents="none" style={styles.glowTop} />
      <View pointerEvents="none" style={styles.glowBottom} />

      {/* Header */}
      <Animated.View style={[styles.header, { paddingTop: topPad, opacity: headerAnim }]}>
        <View style={styles.topBar}>
          <View style={styles.headerSideCompact}>
            <ExpoImage source={APP_LOGO} style={styles.headerLogoCompact} contentFit="contain" cachePolicy="memory-disk" />
          </View>
          <View style={styles.headerTitleWrap}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.9}
              style={styles.headerTitleLarge}
            >
              {t('screenTitle')}
            </Text>
          </View>
          <View style={styles.headerSideCompact} />
        </View>

        <View style={styles.headerMetaRow}>
          <TouchableOpacity
            onPress={() => setSortOrder((p) => (p === 'desc' ? 'asc' : 'desc'))}
            style={styles.sortBtn}
            activeOpacity={0.85}
          >
            <Feather
              name={sortOrder === 'desc' ? 'arrow-down' : 'arrow-up'}
              size={13}
              color={NEON}
            />
            <Text style={styles.sortBtnText}>
              {sortOrder === 'desc' ? t('sort.newest') : t('sort.oldest')}
            </Text>
          </TouchableOpacity>

          <Text style={styles.headerCount}>
            {t('sort.count', { count: wpisy.length })}
          </Text>
        </View>
      </Animated.View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={NEON} size="large" />
        </View>
      ) : sortedWpisy.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Feather name="book-open" size={36} color="rgba(37,240,200,0.25)" />
          </View>
          <Text style={styles.emptyTitle}>{t('empty.title')}</Text>
          <Text style={styles.emptySubtitle}>{t('empty.subtitle')}</Text>
          <TouchableOpacity onPress={openAdd} style={styles.emptyBtn} activeOpacity={0.88}>
            <Text style={styles.emptyBtnText}>{t('empty.cta')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingTop: 12 }]}
          showsVerticalScrollIndicator={false}
        >
          {sortedWpisy.map((w, i) => (
            <WpisCard
              key={w.id}
              wpis={w}
              index={i}
              dateLocale={dateLocale}
              onPress={() => {
                setDetailWpis(w);
                setDetailOpen(true);
              }}
            />
          ))}
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* FAB */}
      <Animated.View style={[styles.fabWrap, { transform: [{ scale: fabScale }] }]}>
        <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.88}>
          <Feather name="plus" size={24} color="#0B1120" />
        </TouchableOpacity>
      </Animated.View>

      {/* ── ADD/EDIT MODAL ── */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalScreen}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderSide} />
              <Text style={[styles.modalTitle, !editingWpis && styles.modalTitleNeon]}>
                {editingWpis ? t('modal.editTitle') : t('modal.newTitle')}
              </Text>
              <TouchableOpacity
                onPress={() => setModalOpen(false)}
                activeOpacity={0.88}
                style={styles.modalCloseBtn}
              >
                <Feather name="x" size={22} color="rgba(255,255,255,0.55)" />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Data */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('modal.date')}</Text>

                <TouchableOpacity
                  style={styles.datePickerBtn}
                  activeOpacity={0.85}
                  onPress={() => setShowDatePicker(true)}
                >
                  <View style={styles.datePickerLeft}>
                    <Feather name="calendar" size={16} color="rgba(37,240,200,0.70)" />
                    <Text style={styles.datePickerText}>{formatDate(formData, dateLocale)}</Text>
                  </View>
                  <Feather name="chevron-down" size={16} color="rgba(255,255,255,0.35)" />
                </TouchableOpacity>

                {showDatePicker && (
                  <DateTimePicker
                    value={fromYMD(formData)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    locale={dateLocale}
                    onChange={(event, selectedDate) => {
                      if (Platform.OS === 'android') {
                        setShowDatePicker(false);
                      }
                      if (selectedDate) {
                        setFormData(toYMD(selectedDate));
                      }
                    }}
                  />
                )}

                {Platform.OS === 'ios' && showDatePicker && (
                  <TouchableOpacity
                    onPress={() => setShowDatePicker(false)}
                    style={styles.dateDoneBtn}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.dateDoneBtnText}>{t('modal.done')}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Etap */}
              {etapy.length > 0 && (
                <View style={styles.formGroup}>
                  <View style={styles.formGroupRow}>
                    <Text style={styles.formLabel}>{t('modal.stage')}</Text>

                    <TouchableOpacity
                      onPress={() => setShowAllEtapy((p) => !p)}
                      style={styles.expandEtapyBtn}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.expandEtapyBtnText}>
                        {showAllEtapy ? t('modal.collapse') : t('modal.expand')}
                      </Text>
                      <Feather
                        name={showAllEtapy ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={NEON}
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.selectedEtapWrap}>
                    <Text style={styles.selectedEtapLabel}>{t('modal.selectedStage')}</Text>
                    <View style={styles.selectedEtapMain}>
                      <Text style={styles.selectedEtapText}>
                        {selectedEtap?.nazwa ?? t('modal.none')}
                      </Text>

                      {formEtapId === currentEtapId && selectedEtap && (
                        <View style={styles.currentBadge}>
                          <Text style={styles.currentBadgeText}>{t('modal.current')}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {showAllEtapy && (
                    <View style={styles.etapyGrid}>
                      <TouchableOpacity
                        onPress={() => setFormEtapId(null)}
                        style={[styles.etapTile, !formEtapId && styles.etapTileActive]}
                        activeOpacity={0.82}
                      >
                        <Text
                          style={[
                            styles.etapTileText,
                            !formEtapId && styles.etapTileTextActive,
                          ]}
                        >
                          {t('modal.none')}
                        </Text>
                      </TouchableOpacity>

                      {etapy.map((e) => {
                        const isActive = formEtapId === e.id;
                        const isCurrent = currentEtapId === e.id;

                        return (
                          <TouchableOpacity
                            key={e.id}
                            onPress={() => setFormEtapId(e.id)}
                            style={[
                              styles.etapTile,
                              isActive && styles.etapTileActive,
                              isCurrent && !isActive && styles.etapTileCurrent,
                            ]}
                            activeOpacity={0.82}
                          >
                            <Text
                              style={[
                                styles.etapTileText,
                                isActive && styles.etapTileTextActive,
                              ]}
                              numberOfLines={2}
                            >
                              {e.nazwa}
                            </Text>

                            {isCurrent && <Text style={styles.etapTileHint}>{t('modal.current')}</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {/* Treść */}
              <View style={styles.formGroup}>
                <AppInput
                  value={formTresc}
                  onChangeText={setFormTresc}
                  label={t('modal.note')}
                  placeholder={t('modal.notePlaceholder')}
                  placeholderTextColor="rgba(255,255,255,0.22)"
                  style={styles.trescInput}
                  multiline
                  textAlignVertical="top"
                  maxLength={2000}
                />
                <Text style={styles.charCount}>{formTresc.length}/2000</Text>
              </View>

              {/* Zdjęcie */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{t('modal.photo')}</Text>
                {formZdjecieUri || formZdjecieUrl ? (
                  <View style={styles.imagePreviewWrap}>
                    <Image
                      source={{ uri: formZdjecieUri ?? formZdjecieUrl! }}
                      style={styles.imagePreview}
                      resizeMode="cover"
                    />
                    <TouchableOpacity
                      onPress={removeImage}
                      style={styles.imageRemoveBtn}
                      activeOpacity={0.8}
                    >
                      <Feather name="x" size={14} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={pickImage}
                    style={styles.imagePickBtn}
                    activeOpacity={0.8}
                  >
                    <Feather name="camera" size={20} color="rgba(37,240,200,0.60)" />
                    <Text style={styles.imagePickText}>{t('modal.pickPhoto')}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Save */}
              <AppButton
                title={saving ? t('modal.saving') : editingWpis ? t('modal.saveChanges') : t('modal.addEntry')}
                onPress={save}
                loading={saving}
                style={styles.saveBtn}
              />

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── DETAIL MODAL ── */}
      <Modal
        visible={detailOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailOpen(false)}
      >
        {detailWpis && (
          <View style={styles.modalScreen}>
            <View style={styles.modalHeaderDetail}>
              <View>
                <Text style={styles.detailHeaderTitle}>{getDayName(detailWpis.data, dateLocale)}</Text>
                <Text style={styles.modalSubtitle}>{formatDate(detailWpis.data, dateLocale)}</Text>
              </View>

              <View style={styles.detailActionsRow}>
                <TouchableOpacity
                  onPress={() => openEdit(detailWpis)}
                  style={styles.detailActionBtn}
                  activeOpacity={0.8}
                >
                  <Feather name="edit-2" size={16} color={NEON} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => deleteWpis(detailWpis)}
                  style={[styles.detailActionBtn, { borderColor: 'rgba(239,68,68,0.30)' }]}
                  activeOpacity={0.8}
                >
                  <Feather name="trash-2" size={16} color="rgba(239,68,68,0.80)" />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setDetailOpen(false)} activeOpacity={0.88}>
                  <Feather name="x" size={22} color="rgba(255,255,255,0.55)" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
              {detailWpis.etap_nazwa && (
                <View style={styles.detailEtapBadge}>
                  <Feather name="layers" size={12} color={NEON} />
                  <Text style={styles.detailEtapText}>{detailWpis.etap_nazwa}</Text>
                </View>
              )}

              <Text style={styles.detailTresc}>{detailWpis.tresc}</Text>

              {(detailWpis.zdjecie_display_url || detailWpis.zdjecie_url) && (
                <Image
                  source={{ uri: detailWpis.zdjecie_display_url ?? detailWpis.zdjecie_url! }}
                  style={styles.detailImage}
                  resizeMode="cover"
                />
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

// ─── Wpis Card ────────────────────────────────────────────────────────────────

function WpisCard({
  wpis: w,
  index,
  dateLocale,
  onPress,
}: {
  wpis: Wpis;
  index: number;
  dateLocale: string;
  onPress: () => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 10,
      delay: Math.min(index * 50, 300),
    }).start();
  }, [anim, index]);

  const opacity = anim;
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });
  const isToday = w.data === toYMD(new Date());

  return (
    <Animated.View style={[styles.cardWrap, { opacity, transform: [{ translateY }] }]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.82 }]}
      >
        <View style={styles.cardDateCol}>
          <Text style={styles.cardDay}>{new Date(w.data + 'T00:00:00').getDate()}</Text>
          <Text style={styles.cardMonth}>
            {new Date(w.data + 'T00:00:00').toLocaleDateString(dateLocale, { month: 'short' })}
          </Text>
          {isToday && <View style={styles.todayDot} />}
        </View>

        <View style={styles.cardSep} />

        <View style={styles.cardContentCol}>
          {w.etap_nazwa && (
            <View style={styles.cardEtapBadge}>
              <Text style={styles.cardEtapText}>{w.etap_nazwa}</Text>
            </View>
          )}
          <Text style={styles.cardTresc} numberOfLines={3}>
            {w.tresc}
          </Text>
        </View>

        {(w.zdjecie_display_url || w.zdjecie_url) && (
          <Image source={{ uri: w.zdjecie_display_url ?? w.zdjecie_url! }} style={styles.cardThumb} resizeMode="cover" />
        )}

        <Feather
          name="chevron-right"
          size={16}
          color="rgba(255,255,255,0.20)"
          style={{ marginLeft: 4 }}
        />
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },

  glowTop: {
    position: 'absolute',
    width: 350,
    height: 350,
    borderRadius: 999,
    backgroundColor: ACCENT,
    opacity: 0.07,
    top: -180,
    right: -130,
  },
  glowBottom: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 999,
    backgroundColor: NEON,
    opacity: 0.03,
    bottom: 100,
    left: -80,
  },

  // Header
  header: {
    paddingHorizontal: 0,
    paddingBottom: 10,
    gap: 8,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSideCompact: {
    width: 96,
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
    fontSize: 38,
    lineHeight: 42,
    color: uiColors.accent,
    textAlign: 'center',
  },
  headerLogoCompact: {
    width: 88,
    height: 88,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
  },
  headerCount: {
    color: 'rgba(255,255,255,0.34)',
    fontSize: 12.5,
    fontWeight: '800',
    textAlign: 'right',
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
  },
  sortBtnText: {
    color: NEON,
    fontSize: 12,
    fontWeight: '800',
  },

  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 28,
    backgroundColor: 'rgba(37,240,200,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.28)',
    marginTop: 8,
  },
  emptyBtnText: {
    color: NEON,
    fontSize: 14,
    fontWeight: '900',
  },

  // List
  list: { paddingHorizontal: 18 },

  // Card
  cardWrap: { marginBottom: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardDateCol: { alignItems: 'center', width: 36 },
  cardDay: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
  },
  cardMonth: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: NEON,
    marginTop: 4,
    shadowColor: NEON,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  cardSep: {
    width: 1,
    height: 48,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardContentCol: {
    flex: 1,
    minWidth: 0,
  },
  cardEtapBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
    marginBottom: 6,
  },
  cardEtapText: {
    color: NEON,
    fontSize: 10,
    fontWeight: '900',
  },
  cardTresc: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13.5,
    fontWeight: '500',
    lineHeight: 19,
  },
  cardThumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    flexShrink: 0,
  },

  // FAB
  fabWrap: {
    position: 'absolute',
    bottom: 100,
    right: 22,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: NEON,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: NEON,
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },

  // Modal shared
  modalScreen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  modalHeaderSide: {
    width: 28,
  },
  modalCloseBtn: {
    width: 28,
    alignItems: 'flex-end',
  },
  modalHeaderDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    flex: 1,
  },
  modalTitleNeon: {
    color: NEON,
    textShadowColor: 'rgba(37,240,200,0.28)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  modalSubtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  modalContent: {
    padding: 20,
    gap: 20,
  },

  // Form
  formGroup: { gap: 10 },
  formGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formLabel: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  // Date
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  datePickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  datePickerText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  dateDoneBtn: {
    alignSelf: 'flex-end',
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(37,240,200,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.24)',
  },
  dateDoneBtnText: {
    color: NEON,
    fontSize: 13,
    fontWeight: '800',
  },

  // Etapy
  expandEtapyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  expandEtapyBtnText: {
    color: NEON,
    fontSize: 12,
    fontWeight: '800',
  },
  selectedEtapWrap: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  selectedEtapLabel: {
    color: 'rgba(255,255,255,0.34)',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 6,
  },
  selectedEtapMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectedEtapText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  currentBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.25)',
  },
  currentBadgeText: {
    color: NEON,
    fontSize: 11,
    fontWeight: '900',
  },
  etapyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  etapTile: {
    minWidth: (W - 60) / 2 - 8,
    maxWidth: (W - 60) / 2 - 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  etapTileActive: {
    backgroundColor: 'rgba(37,240,200,0.12)',
    borderColor: 'rgba(37,240,200,0.34)',
  },
  etapTileCurrent: {
    borderColor: 'rgba(37,240,200,0.18)',
  },
  etapTileText: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  etapTileTextActive: {
    color: NEON,
  },
  etapTileHint: {
    color: 'rgba(37,240,200,0.64)',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 6,
  },

  // Treść
  trescInput: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    minHeight: 140,
  },
  charCount: {
    color: 'rgba(255,255,255,0.22)',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
  },

  // Image
  imagePickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(37,240,200,0.25)',
  },
  imagePickText: {
    color: 'rgba(37,240,200,0.60)',
    fontSize: 14,
    fontWeight: '700',
  },
  imagePreviewWrap: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: 180,
    borderRadius: 16,
  },
  imageRemoveBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.60)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Save
  saveBtn: {
    borderRadius: 18,
    paddingVertical: 16,
    backgroundColor: NEON,
    alignItems: 'center',
    shadowColor: NEON,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  saveBtnText: {
    color: '#0B1120',
    fontSize: 16,
    fontWeight: '900',
  },

  // Detail
  detailHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  detailActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  detailContent: {
    padding: 20,
    gap: 16,
  },
  detailActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.25)',
    backgroundColor: 'rgba(37,240,200,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailEtapBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.20)',
  },
  detailEtapText: {
    color: NEON,
    fontSize: 12,
    fontWeight: '900',
  },
  detailTresc: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
  },
  detailImage: {
    width: '100%',
    height: 220,
    borderRadius: 18,
    marginTop: 4,
  },
});
