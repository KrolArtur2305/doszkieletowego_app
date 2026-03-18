import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Dimensions,
  ScrollView,
  Platform,
  TextInput,
  Pressable,
  StatusBar,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../../lib/supabase';
import { COLORS as THEME_COLORS, RADIUS } from '../../../../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

type ViewMode = 'grid' | 'list';
type SortOrder = 'newest' | 'oldest';

type DocTypeKey = 'all' | 'umowa' | 'faktura' | 'paragon' | 'oferta' | 'projekt' | 'pozwolenia' | 'inne';

type DbDoc = {
  id: string;
  user_id: string | null;
  tytul: string;
  notatki?: string | null;
  kategoria?: string | null;
  created_at?: string | null;
  plik_url: string;
};

const COLORS = {
  bg: '#000000',
  cardBorder: 'rgba(255,255,255,0.08)',
  cardBg: 'rgba(255,255,255,0.03)',
  text: '#F8FAFC',
  muted: '#94A3B8',
  soft: '#CBD5F5',
  accent: '#5EEAD4',
  accent2: '#38BDF8',
  danger: '#FF3B30',
  brand: '#19705C',
};

const bucketName = 'dokumenty';
const logo = require('../../../assets/logo.png');

function localeFromLng(lng?: string) {
  const base = (lng || 'en').split('-')[0];
  const map: Record<string, string> = { pl: 'pl-PL', en: 'en-US', de: 'de-DE' };
  return map[base] || 'en-US';
}

function formatDateLocale(iso: string | null | undefined, locale: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function normalizeType(cat?: string | null): DocTypeKey {
  const c = (cat || '').trim().toLowerCase();

  // wsteczna kompatybilność (stare wartości)
  if (c === 'umowy') return 'umowa';
  if (c === 'faktury_paragony') return 'faktura';
  if (c === 'inne') return 'inne';

  // nowe
  if (c === 'umowa') return 'umowa';
  if (c === 'faktura') return 'faktura';
  if (c === 'paragon') return 'paragon';
  if (c === 'oferta') return 'oferta';
  if (c === 'projekt') return 'projekt';
  if (c === 'pozwolenia') return 'pozwolenia';
  return 'inne';
}

const DOC_TYPES: { key: DocTypeKey; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'all', icon: 'filter' },
  { key: 'umowa', icon: 'document-text-outline' },
  { key: 'faktura', icon: 'card-outline' },
  { key: 'paragon', icon: 'receipt-outline' },
  { key: 'oferta', icon: 'clipboard-outline' },
  { key: 'projekt', icon: 'layers-outline' },
  { key: 'pozwolenia', icon: 'shield-checkmark-outline' },
  { key: 'inne', icon: 'archive-outline' },
];

export default function DokumentyScreen() {
  const { t, i18n } = useTranslation(['documents', 'common']);

  // ✅ zawsze string do <Text/>
  const tt = useCallback((key: string, options?: any) => String(t(key as any, options)), [t]);

  const dateLocale = useMemo(
    () => localeFromLng(i18n.resolvedLanguage || i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );

  const [docs, setDocs] = useState<DbDoc[]>([]);
  const [selectedType, setSelectedType] = useState<DocTypeKey>('all');

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // dropdown states (jak w Zdjęcia)
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  // add modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);

  const [selectedTypeForUpload, setSelectedTypeForUpload] = useState<DocTypeKey>('umowa');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [file, setFile] = useState<{ uri: string; name: string; mimeType?: string; size?: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8;

  const getUserId = useCallback(async (): Promise<string | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  }, []);

  const getTypeLabel = useCallback(
    (key: DocTypeKey) => {
      return tt(`documents:types.${key}`);
    },
    [tt],
  );

  const sortLabel = useMemo(() => {
    return sortOrder === 'newest' ? tt('documents:sort.newest') : tt('documents:sort.oldest');
  }, [sortOrder, tt]);

  const selectedFilterLabel = useMemo(() => getTypeLabel(selectedType), [selectedType, getTypeLabel]);

  const selectedUploadTypeLabel = useMemo(
    () => getTypeLabel(selectedTypeForUpload),
    [selectedTypeForUpload, getTypeLabel],
  );

  const loadDocs = useCallback(
    async (isInitial: boolean) => {
      try {
        if (isInitial) setLoading(true);

        const userId = await getUserId();
        if (!userId) {
          setDocs([]);
          setLoading(false);
          setRefreshing(false);
          return;
        }

        const { data, error } = await supabase
          .from('dokumenty')
          .select('id,user_id,tytul,notatki,kategoria,created_at,plik_url')
          .eq('user_id', userId)
          .order('created_at', { ascending: sortOrder === 'oldest' });

        if (error) throw error;
        setDocs((data || []) as DbDoc[]);
      } catch (e: any) {
        console.error('Błąd ładowania dokumentów:', e);
        Alert.alert(
          tt('common:errorTitle', { defaultValue: 'Error' }),
          tt('documents:alerts.loadDocsError'),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getUserId, sortOrder, tt],
  );

  useEffect(() => {
    loadDocs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) loadDocs(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOrder]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDocs(false);
  }, [loadDocs]);

  const filteredDocs = useMemo(() => {
    if (selectedType === 'all') return docs;
    return docs.filter((d) => normalizeType(d.kategoria) === selectedType);
  }, [docs, selectedType]);

  const counts = useMemo(() => {
    const c: Record<DocTypeKey, number> = {
      all: 0,
      umowa: 0,
      faktura: 0,
      paragon: 0,
      oferta: 0,
      projekt: 0,
      pozwolenia: 0,
      inne: 0,
    };
    for (const d of docs) {
      c.all += 1;
      c[normalizeType(d.kategoria)] += 1;
    }
    return c;
  }, [docs]);

  const closeAllDropdowns = () => {
    setFilterDropdownOpen(false);
    setSortDropdownOpen(false);
    setAddDropdownOpen(false);
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: false });
    if (!res.canceled) {
      const a = res.assets?.[0];
      if (a?.uri) {
        setFile({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size });
      }
    }
  };

  const openDoc = async (doc: DbDoc) => {
    try {
      const path = doc.plik_url;
      if (path.startsWith('http')) {
        Linking.openURL(path);
        return;
      }
      const { data, error } = await supabase.storage.from(bucketName).createSignedUrl(path, 120);
      if (error) throw error;
      if (data?.signedUrl) Linking.openURL(data.signedUrl);
    } catch (e: any) {
      console.error('Błąd otwierania dokumentu:', e);
      Alert.alert(
        tt('common:errorTitle', { defaultValue: 'Error' }),
        tt('documents:alerts.openError'),
      );
    }
  };

  const deleteDoc = async (doc: DbDoc) => {
    Alert.alert(
      tt('documents:alerts.deleteTitle'),
      tt('documents:alerts.deleteDesc'),
      [
        { text: tt('common:cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
        {
          text: tt('common:delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('dokumenty').delete().eq('id', doc.id);
              await supabase.storage.from(bucketName).remove([doc.plik_url]);
              onRefresh();
            } catch (e: any) {
              console.error('Błąd usuwania dokumentu:', e);
              Alert.alert(
                tt('common:errorTitle', { defaultValue: 'Error' }),
                tt('documents:alerts.deleteError'),
              );
            }
          },
        },
      ],
    );
  };

  const resetAddForm = () => {
    setSelectedTypeForUpload('umowa');
    setTitle('');
    setDesc('');
    setFile(null);
    setAddDropdownOpen(false);
  };

  const addDoc = async () => {
    if (saving) return;

    if (!file?.uri) {
      Alert.alert(
        tt('common:errorTitle', { defaultValue: 'Error' }),
        tt('documents:alerts.fileRequired'),
      );
      return;
    }

    setSaving(true);
    try {
      const userId = await getUserId();
      if (!userId) throw new Error('No user');

      const ext = (() => {
        const parts = (file.name || '').split('.');
        return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
      })();

      const filePath = `dokumenty/${userId}/${Date.now()}${ext ? '.' + ext : ''}`;

      const blob = await (await fetch(file.uri)).blob();

      const { error: upErr } = await supabase.storage.from(bucketName).upload(filePath, blob, {
        contentType: file.mimeType || (ext === 'pdf' ? 'application/pdf' : undefined),
        upsert: false,
      });
      if (upErr) throw upErr;

      const finalTitle =
        title.trim() ||
        (file.name ? file.name.replace(/\.[^/.]+$/, '') : `${getTypeLabel(selectedTypeForUpload)} • ${Date.now()}`);

      const { error } = await supabase.from('dokumenty').insert({
        user_id: userId,
        tytul: finalTitle,
        notatki: desc.trim() ? desc.trim() : null,
        kategoria: selectedTypeForUpload,
        plik_url: filePath,
      });

      if (error) throw error;

      setAddModalVisible(false);
      resetAddForm();
      onRefresh();
      Alert.alert(
        tt('documents:alerts.successTitle'),
        tt('documents:alerts.docAdded'),
      );
    } catch (e: any) {
      console.error('Błąd dodawania dokumentu:', e);
      Alert.alert(
        tt('common:errorTitle', { defaultValue: 'Error' }),
        tt('documents:alerts.addError'),
      );
    } finally {
      setSaving(false);
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <BlurView intensity={15} tint="dark" style={styles.emptyCard}>
        <Ionicons name="document-text-outline" size={64} color="rgba(255,255,255,0.25)" />
        <Text style={styles.emptyTitle}>{tt('documents:empty.title')}</Text>
        <Text style={styles.emptySubtitle}>{tt('documents:empty.subtitle')}</Text>
        <TouchableOpacity style={styles.emptyButton} onPress={() => setAddModalVisible(true)} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color={COLORS.bg} />
          <Text style={styles.emptyButtonText}>{tt('documents:empty.cta')}</Text>
        </TouchableOpacity>
      </BlurView>
    </View>
  );

  const renderGridItem = ({ item }: { item: DbDoc }) => {
    const type = normalizeType(item.kategoria);
    const dateTxt = formatDateLocale(item.created_at || null, dateLocale);

    return (
      <TouchableOpacity
        style={styles.gridCard}
        onPress={() => openDoc(item)}
        onLongPress={() => deleteDoc(item)}
        activeOpacity={0.85}
      >
        <BlurView intensity={25} tint="dark" style={styles.cardBlur}>
          <View style={styles.docCardInner}>
            <View style={styles.docIconWrap}>
              <Ionicons name="document-text-outline" size={22} color={COLORS.brand} />
            </View>

            <Text style={styles.docTitle} numberOfLines={2}>
              {item.tytul}
            </Text>

            {!!item.notatki && (
              <Text style={styles.docDesc} numberOfLines={2}>
                {item.notatki}
              </Text>
            )}

            <View style={styles.docMetaRow}>
              <Text style={styles.docType} numberOfLines={1}>
                {getTypeLabel(type).toUpperCase()}
              </Text>
              <Text style={styles.docDate}>{dateTxt}</Text>
            </View>
          </View>
        </BlurView>
      </TouchableOpacity>
    );
  };

  const renderListItem = ({ item }: { item: DbDoc }) => {
    const type = normalizeType(item.kategoria);
    const dateTxt = formatDateLocale(item.created_at || null, dateLocale);

    return (
      <TouchableOpacity
        style={styles.listRow}
        onPress={() => openDoc(item)}
        onLongPress={() => deleteDoc(item)}
        activeOpacity={0.85}
      >
        <BlurView intensity={22} tint="dark" style={styles.listBlur}>
          <View style={styles.listLeftIcon}>
            <Ionicons name="document-text-outline" size={22} color={COLORS.brand} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.listTitle} numberOfLines={1}>
              {item.tytul}
            </Text>
            <Text style={styles.listMeta} numberOfLines={1}>
              {getTypeLabel(type)} • {dateTxt}
            </Text>
            {!!item.notatki && (
              <Text style={styles.listDesc} numberOfLines={2}>
                {item.notatki}
              </Text>
            )}
          </View>

          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.35)" />
        </BlurView>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.loadingText}>{tt('documents:loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {(filterDropdownOpen || sortDropdownOpen || addDropdownOpen) && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            closeAllDropdowns();
            Keyboard.dismiss();
          }}
        />
      )}

      <View pointerEvents="none" style={styles.glowOne} />
      <View pointerEvents="none" style={styles.glowTwo} />

      {/* TOP BAR (jak Zdjęcia) */}
      <View style={[styles.topBar, { paddingTop: topPad }]}>
        <View style={styles.logoWrap}>
          <Image source={logo} style={styles.logoImg} contentFit="contain" />
        </View>

        <View style={styles.topTitleWrap}>
          <Text style={styles.title}>{tt('documents:screen.title')}</Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'grid' && styles.toggleButtonActive]}
            onPress={() => setViewMode('grid')}
            activeOpacity={0.85}
          >
            <Ionicons name="grid" size={20} color={viewMode === 'grid' ? COLORS.brand : 'rgba(255,255,255,0.45)'} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'list' && styles.toggleButtonActive]}
            onPress={() => setViewMode('list')}
            activeOpacity={0.85}
          >
            <Ionicons
              name="list"
              size={20}
              color={viewMode === 'list' ? COLORS.brand : 'rgba(255,255,255,0.45)'}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* FILTER + SORT */}
      <View style={styles.filterBar}>
        <View style={styles.filtersRow}>
          <View style={[styles.dropdownWrap, { flex: 1 }]}>
            <TouchableOpacity
              style={styles.dropdownButton}
              activeOpacity={0.85}
              onPress={() => {
                setSortDropdownOpen(false);
                setFilterDropdownOpen((v) => !v);
              }}
            >
              <Ionicons name="filter" size={16} color={COLORS.brand} />
              <Text style={styles.dropdownButtonText} numberOfLines={1}>
                {selectedFilterLabel} ({counts[selectedType] ?? 0})
              </Text>
              <Ionicons
                name={filterDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="rgba(255,255,255,0.65)"
              />
            </TouchableOpacity>

            {filterDropdownOpen && (
              <View style={styles.dropdownPanel}>
                <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                  {DOC_TYPES.map((opt) => {
                    const active = selectedType === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                        onPress={() => {
                          setSelectedType(opt.key);
                          setFilterDropdownOpen(false);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>
                          {getTypeLabel(opt.key)}
                        </Text>
                        {active && <Ionicons name="checkmark" size={18} color={COLORS.brand} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={[styles.dropdownWrap, { flex: 1 }]}>
            <TouchableOpacity
              style={styles.dropdownButton}
              activeOpacity={0.85}
              onPress={() => {
                setFilterDropdownOpen(false);
                setSortDropdownOpen((v) => !v);
              }}
            >
              <Ionicons name="swap-vertical" size={16} color={COLORS.brand} />
              <Text style={styles.dropdownButtonText} numberOfLines={1}>
                {sortLabel}
              </Text>
              <Ionicons
                name={sortDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="rgba(255,255,255,0.65)"
              />
            </TouchableOpacity>

            {sortDropdownOpen && (
              <View style={styles.dropdownPanel}>
                <TouchableOpacity
                  style={[styles.dropdownItem, sortOrder === 'newest' && styles.dropdownItemActive]}
                  onPress={() => {
                    setSortOrder('newest');
                    setSortDropdownOpen(false);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.dropdownItemText, sortOrder === 'newest' && styles.dropdownItemTextActive]}>
                    {tt('documents:sort.newest')}
                  </Text>
                  {sortOrder === 'newest' && <Ionicons name="checkmark" size={18} color={COLORS.brand} />}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.dropdownItem, sortOrder === 'oldest' && styles.dropdownItemActive]}
                  onPress={() => {
                    setSortOrder('oldest');
                    setSortDropdownOpen(false);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.dropdownItemText, sortOrder === 'oldest' && styles.dropdownItemTextActive]}>
                    {tt('documents:sort.oldest')}
                  </Text>
                  {sortOrder === 'oldest' && <Ionicons name="checkmark" size={18} color={COLORS.brand} />}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>

      {filteredDocs.length === 0 ? (
        renderEmptyState()
      ) : viewMode === 'grid' ? (
        <FlatList
          key={`docs-${viewMode}`}
          data={filteredDocs}
          renderItem={renderGridItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={styles.gridRow}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
        />
      ) : (
        <FlatList
          key={`docs-${viewMode}`}
          data={filteredDocs}
          renderItem={renderListItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setAddModalVisible(true)} activeOpacity={0.9}>
        <BlurView intensity={90} tint="dark" style={styles.fabBlur}>
          <View style={styles.fabRing} />
          <Ionicons name="add" size={30} color={COLORS.brand} />
        </BlurView>
      </TouchableOpacity>

      {/* ADD MODAL */}
      <Modal visible={addModalVisible} transparent animationType="fade" onRequestClose={() => setAddModalVisible(false)}>
        <Pressable
          style={styles.modalBlackOverlay}
          onPress={() => {
            Keyboard.dismiss();
            closeAllDropdowns();
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <Pressable
              style={styles.modalContent}
              onPress={() => {
                // blokuje zamykanie po kliknięciu w kartę
              }}
            >
              <Text style={styles.modalTitle}>{tt('documents:addModal.title')}</Text>

              <Text style={styles.modalLabel}>{tt('documents:addModal.labels.type')}</Text>

              <TouchableOpacity
                style={styles.dropdownButton}
                activeOpacity={0.85}
                onPress={() => {
                  setFilterDropdownOpen(false);
                  setSortDropdownOpen(false);
                  setAddDropdownOpen((v) => !v);
                }}
              >
                <Ionicons name="layers-outline" size={16} color={COLORS.brand} />
                <Text style={styles.dropdownButtonText} numberOfLines={1}>
                  {selectedUploadTypeLabel}
                </Text>
                <Ionicons
                  name={addDropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="rgba(255,255,255,0.65)"
                />
              </TouchableOpacity>

              {addDropdownOpen && (
                <View style={styles.dropdownPanel}>
                  <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                    {DOC_TYPES.filter((d) => d.key !== 'all').map((opt) => {
                      const active = selectedTypeForUpload === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                          onPress={() => {
                            setSelectedTypeForUpload(opt.key);
                            setAddDropdownOpen(false);
                          }}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>
                            {getTypeLabel(opt.key)}
                          </Text>
                          {active && <Ionicons name="checkmark" size={18} color={COLORS.brand} />}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <Text style={styles.modalLabel}>{tt('documents:addModal.labels.titleOptional')}</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={tt('documents:addModal.placeholders.title')}
                placeholderTextColor="rgba(255,255,255,0.4)"
                style={styles.input}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <Text style={styles.modalLabel}>{tt('documents:addModal.labels.descriptionOptional')}</Text>
              <TextInput
                value={desc}
                onChangeText={setDesc}
                placeholder={tt('documents:addModal.placeholders.description')}
                placeholderTextColor="rgba(255,255,255,0.4)"
                style={styles.textArea}
                multiline
              />

              <Text style={styles.modalLabel}>{tt('documents:addModal.labels.file')}</Text>
              <TouchableOpacity style={styles.filePickButton} activeOpacity={0.85} onPress={pickFile}>
                <Ionicons name="attach-outline" size={18} color={COLORS.brand} />
                <Text style={styles.filePickText} numberOfLines={1}>
                  {file?.name ? file.name : tt('documents:addModal.placeholders.file')}
                </Text>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.45)" />
              </TouchableOpacity>

              {saving && (
                <View style={styles.uploadProgressRow}>
                  <ActivityIndicator color={COLORS.brand} />
                  <Text style={styles.uploadProgressText}>{tt('documents:addModal.saving')}</Text>
                </View>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => {
                    setAddModalVisible(false);
                    resetAddForm();
                    Keyboard.dismiss();
                    closeAllDropdowns();
                  }}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  <Text style={styles.modalButtonTextSecondary}>{tt('common:cancel', { defaultValue: 'Cancel' })}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary, !file?.uri && { opacity: 0.55 }]}
                  onPress={addDoc}
                  disabled={saving || !file?.uri}
                  activeOpacity={0.85}
                >
                  {saving ? (
                    <ActivityIndicator color={COLORS.bg} />
                  ) : (
                    <Text style={styles.modalButtonTextPrimary}>{tt('common:save', { defaultValue: 'Save' })}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  glowOne: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: COLORS.brand,
    opacity: 0.04,
    top: -40,
    right: -120,
  },
  glowTwo: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: COLORS.brand,
    opacity: 0.025,
    bottom: 120,
    left: -170,
  },

  loadingContainer: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 14, fontSize: 15, color: COLORS.muted, fontWeight: '600' },

  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },

  logoWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  logoImg: { width: 30, height: 30 },

  topTitleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerRight: { flexDirection: 'row', gap: 8 },

  title: {
    fontSize: 34,
    fontWeight: '900',
    color: '#19705C',
    textAlign: 'center',
    textShadowColor: 'rgba(25,112,92,0.18)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
    letterSpacing: -0.2,
  },

  toggleButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: 'rgba(25,112,92,0.14)',
    borderColor: 'rgba(25,112,92,0.55)',
    shadowColor: COLORS.brand,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 6,
  },

  filterBar: { paddingHorizontal: 16, paddingBottom: 10 },
  filtersRow: { flexDirection: 'row', gap: 12 },

  dropdownWrap: { position: 'relative' },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(25,112,92,0.35)',
  },
  dropdownButtonText: { flex: 1, color: COLORS.text, fontWeight: '800' },
  dropdownPanel: {
    marginTop: 10,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(25,112,92,0.30)',
    backgroundColor: 'rgba(10,15,30,0.96)',
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  dropdownItemActive: { backgroundColor: 'rgba(25,112,92,0.14)' },
  dropdownItemText: { color: 'rgba(255,255,255,0.75)', fontWeight: '800' },
  dropdownItemTextActive: { color: COLORS.brand },

  // GRID
  gridContainer: { paddingHorizontal: 8, paddingBottom: 110 },
  gridRow: { gap: 16, paddingHorizontal: 8, marginBottom: 16 },
  gridCard: { width: CARD_WIDTH, height: CARD_WIDTH * 1.22, borderRadius: 18, overflow: 'hidden' },
  cardBlur: { flex: 1, borderWidth: 1, borderColor: COLORS.cardBorder },
  docCardInner: { flex: 1, padding: 14, backgroundColor: 'rgba(0,0,0,0.12)' },
  docIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(25,112,92,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(25,112,92,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  docTitle: { color: COLORS.text, fontWeight: '900', fontSize: 14, lineHeight: 18 },
  docDesc: { marginTop: 6, color: 'rgba(255,255,255,0.62)', fontWeight: '700', fontSize: 12, lineHeight: 16 },
  docMetaRow: {
    marginTop: 'auto',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  docType: { fontSize: 10, fontWeight: '900', color: COLORS.brand, letterSpacing: 1.2, marginBottom: 6 },
  docDate: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '700' },

  // LIST
  listContainer: { paddingHorizontal: 16, paddingBottom: 110 },
  listRow: { marginBottom: 12, borderRadius: 18, overflow: 'hidden' },
  listBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  listLeftIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(25,112,92,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(25,112,92,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listTitle: { color: COLORS.text, fontWeight: '900', fontSize: 14 },
  listMeta: { marginTop: 4, color: 'rgba(255,255,255,0.60)', fontWeight: '800', fontSize: 12 },
  listDesc: { marginTop: 6, color: 'rgba(255,255,255,0.58)', fontWeight: '700', fontSize: 12, lineHeight: 16 },

  // EMPTY
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  emptyCard: {
    width: '100%',
    padding: 34,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginTop: 18, marginBottom: 8 },
  emptySubtitle: { fontSize: 15, color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginBottom: 22, lineHeight: 20 },
  emptyButton: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, borderRadius: RADIUS.button, backgroundColor: 'rgba(37,240,200,0.14)', borderWidth: 1, borderColor: 'rgba(37,240,200,0.38)' },
  emptyButtonText: { fontSize: 14, fontWeight: '900', color: THEME_COLORS.neon, letterSpacing: 0.5 },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 16,
    width: 68,
    height: 68,
    borderRadius: 34,
    overflow: 'hidden',
    shadowColor: COLORS.brand,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 14,
  },
  fabBlur: { flex: 1, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(25,112,92,0.55)' },
  fabRing: { position: 'absolute', width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: 'rgba(25,112,92,0.35)', backgroundColor: 'rgba(25,112,92,0.06)' },

  // MODAL
  modalBlackOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 22 },

  modalContent: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(10,15,30,0.96)',
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  modalTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text, marginBottom: 18, textAlign: 'center' },
  modalLabel: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.6, marginTop: 12, marginBottom: 10 },

  input: {
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  textArea: {
    minHeight: 78,
    borderRadius: RADIUS.input,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontWeight: '800',
  },

  filePickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(25,112,92,0.35)',
  },
  filePickText: { flex: 1, color: COLORS.text, fontWeight: '800' },

  uploadProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  uploadProgressText: { color: COLORS.muted, fontWeight: '800' },

  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalButton: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalButtonSecondary: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  modalButtonPrimary: { backgroundColor: 'rgba(37,240,200,0.14)', borderWidth: 1, borderColor: 'rgba(37,240,200,0.38)', borderRadius: RADIUS.button, paddingVertical: 13 },
  modalButtonTextSecondary: { fontSize: 15, fontWeight: '900', color: 'rgba(255,255,255,0.72)' },
  modalButtonTextPrimary: { fontSize: 15, fontWeight: '900', color: THEME_COLORS.neon },
});
