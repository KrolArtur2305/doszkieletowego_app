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
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../../lib/supabase';
import { FloatingAddButton } from '../../../../components/FloatingAddButton';
import { AppHeader } from '../../../../src/ui/components';
import { COLORS as THEME_COLORS, RADIUS } from '../../../../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

type ViewMode = 'grid' | 'carousel';
type SortOrder = 'newest' | 'oldest';

type EtapZdjecia = {
  id: string;
  nazwa: string;
  kolejnosc: number;
};

type Zdjecie = {
  id: string;
  user_id: string;
  etap_zdjecia_id: string;
  file_path: string;
  created_at: string;
  taken_at?: string | null;
  komentarz?: string | null;
  tags?: string[] | null;
  url?: string;
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

const bucketName = 'zdjecia';

function sanitizeFolderName(input: string) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function localeFromLng(lng?: string) {
  const base = (lng || 'en').split('-')[0];
  if (base === 'pl') return 'pl-PL';
  if (base === 'de') return 'de-DE';
  return 'en-US';
}

export default function ZdjeciaScreen() {
  const { t, i18n } = useTranslation(['photos', 'common']);

  // ✅ zawsze string do <Text/>
  const tt = useCallback((key: string, options?: any) => String(t(key as any, options)), [t]);

  const dateLocale = useMemo(
    () => localeFromLng(i18n.resolvedLanguage || i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );

  const [zdjecia, setZdjecia] = useState<Zdjecie[]>([]);
  const [etapy, setEtapy] = useState<EtapZdjecia[]>([]);
  const [selectedEtap, setSelectedEtap] = useState<string>('all');

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [selectedZdjecie, setSelectedZdjecie] = useState<Zdjecie | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

  // ADD FORM
  const [selectedEtapForUpload, setSelectedEtapForUpload] = useState<string>('');
  const [takenAt, setTakenAt] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [opis, setOpis] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  // Dropdown states
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [uploadDropdownOpen, setUploadDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  // Set etapów, które realnie istnieją w zdjęciach usera
  const [etapUsageSet, setEtapUsageSet] = useState<Set<string>>(new Set());

  const etapNameMap = useMemo(
    () =>
      etapy.reduce<Record<string, string>>((acc, etap) => {
        acc[etap.id] = etap.nazwa;
        return acc;
      }, {}),
    [etapy],
  );

  const getEtapName = useCallback(
    (etapId: string | null | undefined) => {
      if (!etapId) return tt('photos:misc.stageFallback', { defaultValue: 'Etap' });
      return etapNameMap[etapId] ?? tt('photos:misc.stageFallback', { defaultValue: 'Etap' });
    },
    [etapNameMap, tt],
  );

  const getPublicUrlForPath = useCallback((filePath: string) => {
    const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
    return data?.publicUrl || '';
  }, []);

  const getUserId = useCallback(async (): Promise<string | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([loadEtapy(), loadEtapUsage(true), loadZdjecia(true)]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // zmiana filtra lub sortowania -> reload listy
  useEffect(() => {
    if (!loading) loadZdjecia(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEtap, sortOrder]);

  const loadEtapy = async () => {
    try {
      const { data, error } = await supabase
        .from('etapy_zdjecia')
        .select('id,nazwa,kolejnosc')
        .order('kolejnosc', { ascending: true });

      if (error) throw error;
      setEtapy((data || []) as EtapZdjecia[]);
    } catch (e) {
      console.error('Błąd ładowania etapów zdjęć:', e);
      Alert.alert(
        tt('common:errorTitle', { defaultValue: 'Błąd' }),
        tt('photos:alerts.loadStagesError', { defaultValue: 'Nie udało się wczytać etapów.' }),
      );
    }
  };

  // ✅ pobierz etapy realnie użyte w zdjęciach usera
  const loadEtapUsage = async (isInitial: boolean) => {
    try {
      const userId = await getUserId();
      if (!userId) {
        setEtapUsageSet(new Set());
        return;
      }

      const { data, error } = await supabase.from('zdjecia').select('etap_zdjecia_id').eq('user_id', userId);
      if (error) throw error;

      const s = new Set<string>();
      (data || []).forEach((row: any) => {
        if (row?.etap_zdjecia_id) s.add(String(row.etap_zdjecia_id));
      });

      setEtapUsageSet(s);

      if (!isInitial && selectedEtap !== 'all' && !s.has(selectedEtap)) {
        setSelectedEtap('all');
      }

      // ✅ jeśli wybrany etap do uploadu przestał istnieć w użyciu – wyczyść
      if (!isInitial && selectedEtapForUpload && !s.has(selectedEtapForUpload)) {
        setSelectedEtapForUpload('');
      }
    } catch (e) {
      console.error('Błąd ładowania etapUsage:', e);
    }
  };

  const loadZdjecia = async (isInitial: boolean) => {
    try {
      if (isInitial) setLoading(true);

      const userId = await getUserId();

      if (!userId) {
        setZdjecia([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      let query = supabase
        .from('zdjecia')
        .select('id,user_id,etap_zdjecia_id,file_path,created_at,taken_at,komentarz,tags')
        .eq('user_id', userId)
        .order('created_at', { ascending: sortOrder === 'oldest' });

      if (selectedEtap !== 'all') {
        query = query.eq('etap_zdjecia_id', selectedEtap);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = (data || []) as Zdjecie[];
      const withUrls = rows.map((z) => ({
        ...z,
        url: getPublicUrlForPath(z.file_path),
      }));

      setZdjecia(withUrls);
    } catch (e) {
      console.error('Błąd ładowania zdjęć:', e);
      Alert.alert(
        tt('common:errorTitle', { defaultValue: 'Błąd' }),
        tt('photos:alerts.loadPhotosError', { defaultValue: 'Nie udało się wczytać zdjęć.' }),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([loadEtapUsage(false), loadZdjecia(false)]).finally(() => setRefreshing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortOrder, selectedEtap]);

  const canPick = useMemo(() => Boolean(selectedEtapForUpload), [selectedEtapForUpload]);

  // ✅ etapy w filtrze: tylko te, które realnie mają zdjęcia (plus all)
  const filterEtapy = useMemo(() => {
    if (!etapUsageSet.size) return [];
    return etapy.filter((e) => etapUsageSet.has(e.id));
  }, [etapy, etapUsageSet]);

  // ✅ etapy w MODALU DODAWANIA: tylko te, które realnie mają zdjęcia
  //    (fallback: jeśli user ma 0 zdjęć, pokaż wszystkie żeby dało się dodać pierwsze)
  const uploadEtapy = useMemo(() => {
    if (!etapUsageSet.size) return etapy; // fallback, bo inaczej nie dodasz pierwszych zdjęć
    return etapy.filter((e) => etapUsageSet.has(e.id));
  }, [etapy, etapUsageSet]);

  const handlePickAndUpload = async () => {
    if (!selectedEtapForUpload) {
      Alert.alert(
        tt('photos:alerts.pickStageTitle', { defaultValue: 'Wybierz etap' }),
        tt('photos:alerts.pickStageMessage', { defaultValue: 'Najpierw wybierz etap zdjęcia.' }),
      );
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert(
        tt('photos:alerts.noPermissionsTitle', { defaultValue: 'Brak uprawnień' }),
        tt('photos:alerts.noPermissionsMessage', { defaultValue: 'Nadaj dostęp do galerii.' }),
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
      allowsMultipleSelection: true,
    });

    if (result.canceled) return;

    const assets = result.assets || [];
    const uris = assets.map((a) => a?.uri).filter(Boolean) as string[];
    if (!uris.length) return;

    await uploadPhotosBatch(uris);
  };

  const uploadPhotosBatch = async (uris: string[]) => {
    try {
      setUploading(true);
      setUploadProgress({ done: 0, total: uris.length });

      for (let i = 0; i < uris.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        await uploadPhotoSingle(uris[i]);
        setUploadProgress({ done: i + 1, total: uris.length });
      }

      setAddModalVisible(false);
      setSelectedEtapForUpload('');
      setTakenAt(null);
      setOpis('');
      setTagsInput('');
      setUploadDropdownOpen(false);

      await Promise.all([loadEtapUsage(false), loadZdjecia(false)]);

      Alert.alert(
        tt('photos:alerts.successTitle', { defaultValue: 'Sukces' }),
        tt('photos:alerts.photoAdded', { defaultValue: 'Dodano zdjęcia.' }),
      );
    } catch (e: any) {
      console.error('Błąd batch uploadu:', e);
      Alert.alert(
        tt('common:errorTitle', { defaultValue: 'Błąd' }),
        e?.message ? String(e.message) : tt('photos:alerts.uploadErrorFallback', { defaultValue: 'Nie udało się dodać zdjęć.' }),
      );
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const uploadPhotoSingle = async (uri: string) => {
    const userId = await getUserId();
    if (!userId) {
      throw new Error(tt('photos:alerts.loginRequired', { defaultValue: 'Zaloguj się ponownie.' }));
    }

    const etap = etapy.find((e) => e.id === selectedEtapForUpload);
    if (!etap) {
      throw new Error(tt('photos:alerts.stageNotFound', { defaultValue: 'Nie znaleziono etapu.' }));
    }

    const etapFolder = sanitizeFolderName(etap.nazwa);
    const timestamp = Date.now() + Math.floor(Math.random() * 999);

    const extGuess = uri.split('.').pop()?.toLowerCase();
    const fileExt = extGuess && extGuess.length <= 5 ? extGuess : 'jpg';
    const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';

    const fileName = `${timestamp}.${fileExt}`;
    const file_path = `${userId}/${etapFolder}/${fileName}`;

    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
    const arrayBuffer = decodeBase64(base64);

    const { error: uploadError } = await supabase.storage.from(bucketName).upload(file_path, arrayBuffer, {
      contentType,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const tags = tagsInput
      .split(',')
      .map((ttt) => ttt.trim())
      .filter(Boolean);

    const { error: insertError } = await supabase.from('zdjecia').insert({
      user_id: userId,
      etap_zdjecia_id: etap.id,
      file_path,
      taken_at: takenAt ? takenAt.toISOString() : null,
      komentarz: opis ? opis : null,
      tags: tags.length ? tags : null,
    });

    if (insertError) throw insertError;
  };

  const handleDeletePhoto = async (z: Zdjecie) => {
    Alert.alert(
      tt('photos:alerts.deleteTitle', { defaultValue: 'Usuń zdjęcie?' }),
      tt('photos:alerts.deleteConfirm', { defaultValue: 'Na pewno chcesz usunąć to zdjęcie?' }),
      [
        { text: tt('photos:alerts.deleteCancel', { defaultValue: 'Anuluj' }), style: 'cancel' },
        {
          text: tt('photos:alerts.deleteAction', { defaultValue: 'Usuń' }),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error: delError } = await supabase.from('zdjecia').delete().eq('id', z.id);
              if (delError) throw delError;

              const { error: rmError } = await supabase.storage.from(bucketName).remove([z.file_path]);
              if (rmError) console.warn('Nie udało się usunąć pliku ze storage:', rmError);

              setPreviewModalVisible(false);
              setSelectedZdjecie(null);

              await Promise.all([loadEtapUsage(false), loadZdjecia(false)]);

              Alert.alert(
                tt('photos:alerts.successTitle', { defaultValue: 'Sukces' }),
                tt('photos:alerts.photoDeleted', { defaultValue: 'Usunięto zdjęcie.' }),
              );
            } catch (e) {
              console.error('Błąd usuwania:', e);
              Alert.alert(
                tt('common:errorTitle', { defaultValue: 'Błąd' }),
                tt('photos:alerts.deleteError', { defaultValue: 'Nie udało się usunąć zdjęcia.' }),
              );
            }
          },
        },
      ],
    );
  };

  const openPreview = (item: Zdjecie) => {
    setSelectedZdjecie(item);
    setPreviewModalVisible(true);
  };

  const getDisplayDate = (z: Zdjecie) => {
    const base = z.taken_at ? new Date(z.taken_at) : new Date(z.created_at);
    return base.toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const renderGridItem = ({ item }: { item: Zdjecie }) => {
    const etapName = getEtapName(item.etap_zdjecia_id);
    return (
      <TouchableOpacity style={styles.gridCard} onPress={() => openPreview(item)} activeOpacity={0.85}>
        <BlurView intensity={25} tint="dark" style={styles.cardBlur}>
          <Image source={{ uri: item.url }} style={styles.gridImage} contentFit="cover" transition={250} />
          <View style={styles.cardOverlay}>
            <Text style={styles.etapBadge}>{etapName.toUpperCase()}</Text>
            <Text style={styles.dateText}>{getDisplayDate(item)}</Text>
          </View>
        </BlurView>
      </TouchableOpacity>
    );
  };

  const renderCarouselItem = ({ item }: { item: Zdjecie }) => {
    const etapName = getEtapName(item.etap_zdjecia_id);
    return (
      <TouchableOpacity style={styles.carouselCard} onPress={() => openPreview(item)} activeOpacity={0.85}>
        <BlurView intensity={25} tint="dark" style={styles.carouselBlur}>
          <Image source={{ uri: item.url }} style={styles.carouselImage} contentFit="cover" transition={250} />
          <View style={styles.carouselInfo}>
            <Text style={styles.carouselEtap}>{etapName.toUpperCase()}</Text>
            <Text style={styles.carouselDate}>{getDisplayDate(item)}</Text>
          </View>
        </BlurView>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <BlurView intensity={15} tint="dark" style={styles.emptyCard}>
        <Ionicons name="images-outline" size={64} color="rgba(255,255,255,0.25)" />
        <Text style={styles.emptyTitle}>{tt('photos:empty.title', { defaultValue: 'Brak zdjęć' })}</Text>
        <Text style={styles.emptySubtitle}>
          {selectedEtap === 'all'
            ? tt('photos:empty.subtitleAll', { defaultValue: 'Dodaj pierwsze zdjęcia do projektu.' })
            : tt('photos:empty.subtitleStage', { defaultValue: 'W tym etapie nie ma jeszcze zdjęć.' })}
        </Text>
        <TouchableOpacity style={styles.emptyButton} onPress={() => setAddModalVisible(true)} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color={COLORS.bg} />
          <Text style={styles.emptyButtonText}>{tt('photos:empty.addButton', { defaultValue: 'Dodaj zdjęcia' })}</Text>
        </TouchableOpacity>
      </BlurView>
    </View>
  );

  const selectedFilterLabel = useMemo(() => {
    if (selectedEtap === 'all') return tt('photos:filter.allStages', { defaultValue: 'Wszystkie etapy' });
    return getEtapName(selectedEtap);
  }, [selectedEtap, getEtapName, tt]);

  const selectedUploadEtapLabel = useMemo(() => {
    if (!selectedEtapForUpload) return tt('photos:addModal.pickStage', { defaultValue: 'Wybierz etap' });
    return getEtapName(selectedEtapForUpload);
  }, [selectedEtapForUpload, getEtapName, tt]);

  const sortLabel = useMemo(() => {
    return sortOrder === 'newest'
      ? tt('photos:sort.newest', { defaultValue: 'Najnowsze' })
      : tt('photos:sort.oldest', { defaultValue: 'Najstarsze' });
  }, [sortOrder, tt]);

  const topPad = 0;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.brand} />
        <Text style={styles.loadingText}>{tt('photos:loading', { defaultValue: 'Ładowanie…' })}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {(filterDropdownOpen || uploadDropdownOpen || sortDropdownOpen) && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            setFilterDropdownOpen(false);
            setUploadDropdownOpen(false);
            setSortDropdownOpen(false);
          }}
        />
      )}

      <View pointerEvents="none" style={styles.glowOne} />
      <View pointerEvents="none" style={styles.glowTwo} />

      {/* TOP BAR */}
      <View style={[styles.topBar, { paddingTop: topPad }]}>
        <AppHeader title={tt('photos:title', { defaultValue: 'Zdjęcia' })} />
        <View style={styles.headerControlsRow}>

          <Text style={styles.title}>{tt('photos:title', { defaultValue: 'Zdjęcia' })}</Text>
          <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'grid' && styles.toggleButtonActive]}
            onPress={() => setViewMode('grid')}
            activeOpacity={0.85}
          >
            <Ionicons name="grid" size={20} color={viewMode === 'grid' ? COLORS.brand : 'rgba(255,255,255,0.45)'} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'carousel' && styles.toggleButtonActive]}
            onPress={() => setViewMode('carousel')}
            activeOpacity={0.85}
          >
            <Ionicons
              name="albums"
              size={20}
              color={viewMode === 'carousel' ? COLORS.brand : 'rgba(255,255,255,0.45)'}
            />
          </TouchableOpacity>
          </View>
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
                setUploadDropdownOpen(false);
                setSortDropdownOpen(false);
                setFilterDropdownOpen((v) => !v);
              }}
            >
              <Ionicons name="filter" size={16} color={COLORS.brand} />
              <Text style={styles.dropdownButtonText} numberOfLines={1}>
                {selectedFilterLabel}
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
                  <TouchableOpacity
                    style={[styles.dropdownItem, selectedEtap === 'all' && styles.dropdownItemActive]}
                    onPress={() => {
                      setSelectedEtap('all');
                      setFilterDropdownOpen(false);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.dropdownItemText, selectedEtap === 'all' && styles.dropdownItemTextActive]}>
                      {tt('photos:filter.allStages', { defaultValue: 'Wszystkie etapy' })}
                    </Text>
                    {selectedEtap === 'all' && <Ionicons name="checkmark" size={18} color={COLORS.brand} />}
                  </TouchableOpacity>

                  {filterEtapy.map((etap) => {
                    const active = selectedEtap === etap.id;
                    return (
                      <TouchableOpacity
                        key={etap.id}
                        style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                        onPress={() => {
                          setSelectedEtap(etap.id);
                          setFilterDropdownOpen(false);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>{etap.nazwa}</Text>
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
                setUploadDropdownOpen(false);
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
                    {tt('photos:sort.newest', { defaultValue: 'Najnowsze' })}
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
                    {tt('photos:sort.oldest', { defaultValue: 'Najstarsze' })}
                  </Text>
                  {sortOrder === 'oldest' && <Ionicons name="checkmark" size={18} color={COLORS.brand} />}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </View>

      {zdjecia.length === 0 ? (
        renderEmptyState()
      ) : viewMode === 'grid' ? (
        <FlatList
          key={`photos-${viewMode}`}
          data={zdjecia}
          renderItem={renderGridItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={styles.gridRow}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
        />
      ) : (
        <FlatList
          key={`photos-${viewMode}`}
          data={zdjecia}
          renderItem={renderCarouselItem}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          snapToInterval={SCREEN_WIDTH - 32}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
        />
      )}

      <FloatingAddButton onPress={() => setAddModalVisible(true)} />

      {/* ADD MODAL */}
      <Modal visible={addModalVisible} transparent animationType="fade" onRequestClose={() => setAddModalVisible(false)}>
        <View style={styles.modalBlackOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{tt('photos:addModal.title', { defaultValue: 'Dodaj zdjęcia' })}</Text>

            <Text style={styles.modalLabel}>{tt('photos:addModal.stageLabel', { defaultValue: 'Etap' })}</Text>

            <TouchableOpacity
              style={styles.dropdownButton}
              activeOpacity={0.85}
              onPress={() => {
                setFilterDropdownOpen(false);
                setSortDropdownOpen(false);
                setUploadDropdownOpen((v) => !v);
              }}
            >
              <Ionicons name="layers-outline" size={16} color={COLORS.brand} />
              <Text style={styles.dropdownButtonText} numberOfLines={1}>
                {selectedUploadEtapLabel}
              </Text>
              <Ionicons
                name={uploadDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="rgba(255,255,255,0.65)"
              />
            </TouchableOpacity>

            {uploadDropdownOpen && (
              <View style={styles.dropdownPanel}>
                <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                  {uploadEtapy.map((etap) => {
                    const active = selectedEtapForUpload === etap.id;
                    return (
                      <TouchableOpacity
                        key={etap.id}
                        style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                        onPress={() => {
                          setSelectedEtapForUpload(etap.id);
                          setUploadDropdownOpen(false);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.dropdownItemText, active && styles.dropdownItemTextActive]}>{etap.nazwa}</Text>
                        {active && <Ionicons name="checkmark" size={18} color={COLORS.brand} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <Text style={styles.modalLabel}>{tt('photos:addModal.dateLabel', { defaultValue: 'Data' })}</Text>
            <TouchableOpacity style={styles.dateButton} activeOpacity={0.85} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar-outline" size={18} color={COLORS.brand} />
              <Text style={styles.dateButtonText}>
                {takenAt ? takenAt.toLocaleDateString(dateLocale) : tt('photos:addModal.pickDate', { defaultValue: 'Wybierz datę' })}
              </Text>
              {takenAt && (
                <TouchableOpacity onPress={() => setTakenAt(null)} style={styles.dateClear} activeOpacity={0.85}>
                  <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.55)" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={takenAt ?? new Date()}
                mode="date"
                display="default"
                locale={dateLocale}
                onChange={(_, date) => {
                  setShowDatePicker(false);
                  if (date) setTakenAt(date);
                }}
              />
            )}

            <Text style={styles.modalLabel}>{tt('photos:addModal.descLabel', { defaultValue: 'Opis' })}</Text>
            <TextInput
              value={opis}
              onChangeText={setOpis}
              placeholder={tt('photos:addModal.descPlaceholder', { defaultValue: 'Dodaj opis (opcjonalnie)' })}
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={styles.textArea}
              multiline
            />

            <Text style={styles.modalLabel}>{tt('photos:addModal.tagsLabel', { defaultValue: 'Tagi' })}</Text>
            <TextInput
              value={tagsInput}
              onChangeText={setTagsInput}
              placeholder={tt('photos:addModal.tagsPlaceholder', { defaultValue: 'np. okna, elewacja, dach' })}
              placeholderTextColor="rgba(255,255,255,0.4)"
              style={styles.input}
            />

            {uploading && uploadProgress && (
              <View style={styles.uploadProgressRow}>
                <ActivityIndicator color={COLORS.brand} />
                <Text style={styles.uploadProgressText}>
                  {tt('photos:addModal.uploading', { defaultValue: 'Wysyłanie' })} {uploadProgress.done}/{uploadProgress.total}
                </Text>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => {
                  setAddModalVisible(false);
                  setSelectedEtapForUpload('');
                  setTakenAt(null);
                  setOpis('');
                  setTagsInput('');
                  setUploadDropdownOpen(false);
                }}
                disabled={uploading}
                activeOpacity={0.85}
              >
                <Text style={styles.modalButtonTextSecondary}>{tt('photos:addModal.cancel', { defaultValue: 'Anuluj' })}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary, !canPick && { opacity: 0.55 }]}
                onPress={handlePickAndUpload}
                disabled={uploading || !canPick}
                activeOpacity={0.85}
              >
                {uploading ? (
                  <ActivityIndicator color={COLORS.bg} />
                ) : (
                  <Text style={styles.modalButtonTextPrimary}>
                    {tt('photos:addModal.pickPhoto', { defaultValue: 'Wybierz zdjęcia' })}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PREVIEW MODAL */}
      <Modal visible={previewModalVisible} transparent animationType="fade" onRequestClose={() => setPreviewModalVisible(false)}>
        <BlurView intensity={95} tint="dark" style={styles.previewOverlay}>
          <TouchableOpacity style={styles.closeButton} onPress={() => setPreviewModalVisible(false)} activeOpacity={0.85}>
            <Ionicons name="close" size={28} color={COLORS.text} />
          </TouchableOpacity>

          {selectedZdjecie && (
            <>
              <Image source={{ uri: selectedZdjecie.url }} style={styles.previewImage} contentFit="contain" />

              <View style={styles.previewInfo}>
                <BlurView intensity={80} tint="dark" style={styles.previewInfoBlur}>
                  <Text style={styles.previewEtap}>{getEtapName(selectedZdjecie.etap_zdjecia_id).toUpperCase()}</Text>
                  <Text style={styles.previewDate}>
                    {(() => {
                      const dt = selectedZdjecie.taken_at
                        ? new Date(selectedZdjecie.taken_at)
                        : new Date(selectedZdjecie.created_at);
                      return dt.toLocaleString(dateLocale, {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                    })()}
                  </Text>

                  {selectedZdjecie.komentarz ? (
                    <Text style={styles.previewOpis} numberOfLines={3}>
                      {selectedZdjecie.komentarz}
                    </Text>
                  ) : null}

                  {selectedZdjecie.tags?.length ? (
                    <View style={styles.tagsRow}>
                      {selectedZdjecie.tags.slice(0, 6).map((ttt, idx) => (
                        <View key={`${ttt}-${idx}`} style={styles.tagPill}>
                          <Text style={styles.tagText}>{ttt}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeletePhoto(selectedZdjecie)} activeOpacity={0.85}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                    <Text style={styles.deleteButtonText}>{tt('photos:preview.delete', { defaultValue: 'Usuń' })}</Text>
                  </TouchableOpacity>
                </BlurView>
              </View>
            </>
          )}
        </BlurView>
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
    flexDirection: 'column',
    alignItems: 'stretch',
  },

  logoWrap: { display: 'none' },
  logoImg: { width: 30, height: 30 },

  topTitleWrap: { display: 'none' },
  headerControlsRow: { alignItems: 'flex-end', marginTop: 8 },

  headerRight: { flexDirection: 'row', gap: 8 },

  title: {
    display: 'none',
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

  gridContainer: { paddingHorizontal: 8, paddingBottom: 110 },
  gridRow: { gap: 16, paddingHorizontal: 8, marginBottom: 16 },
  gridCard: { width: CARD_WIDTH, height: CARD_WIDTH * 1.22, borderRadius: 18, overflow: 'hidden' },
  cardBlur: { flex: 1, borderWidth: 1, borderColor: COLORS.cardBorder },
  gridImage: { width: '100%', height: '100%' },
  cardOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, backgroundColor: 'rgba(0,0,0,0.55)' },
  etapBadge: { fontSize: 10, fontWeight: '900', color: COLORS.brand, letterSpacing: 1, marginBottom: 4 },
  dateText: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '700' },

  carouselContainer: { paddingHorizontal: 16, paddingBottom: 110 },
  carouselCard: { width: SCREEN_WIDTH - 32, height: SCREEN_HEIGHT * 0.6, marginRight: 16, borderRadius: 26, overflow: 'hidden' },
  carouselBlur: { flex: 1, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  carouselImage: { width: '100%', height: '80%' },
  carouselInfo: { padding: 20, backgroundColor: 'rgba(0,0,0,0.65)' },
  carouselEtap: { fontSize: 13, fontWeight: '900', color: COLORS.brand, letterSpacing: 1.4, marginBottom: 6 },
  carouselDate: { fontSize: 13, color: 'rgba(255,255,255,0.72)', fontWeight: '700' },

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

  dateButton: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(25,112,92,0.28)', backgroundColor: 'rgba(255,255,255,0.03)' },
  dateButtonText: { color: COLORS.text, fontWeight: '800', flex: 1 },
  dateClear: { paddingHorizontal: 6, paddingVertical: 2 },

  textArea: { minHeight: 78, borderRadius: RADIUS.input, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 12, paddingVertical: 10, color: '#FFFFFF', fontWeight: '800' },
  input: { borderRadius: RADIUS.input, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 12, paddingVertical: 10, color: '#FFFFFF', fontWeight: '800' },

  uploadProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  uploadProgressText: { color: COLORS.muted, fontWeight: '800' },

  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalButton: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalButtonSecondary: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  modalButtonPrimary: { backgroundColor: 'rgba(37,240,200,0.14)', borderWidth: 1, borderColor: 'rgba(37,240,200,0.38)', borderRadius: RADIUS.button, paddingVertical: 13 },
  modalButtonTextSecondary: { fontSize: 15, fontWeight: '900', color: 'rgba(255,255,255,0.72)' },
  modalButtonTextPrimary: { fontSize: 15, fontWeight: '900', color: THEME_COLORS.neon },

  previewOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    right: 18,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  previewImage: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.72 },
  previewInfo: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  previewInfoBlur: { padding: 22, paddingBottom: Platform.OS === 'ios' ? 44 : 22 },
  previewEtap: { fontSize: 14, fontWeight: '900', color: COLORS.brand, letterSpacing: 1.6, marginBottom: 8 },
  previewDate: { fontSize: 14, color: 'rgba(255,255,255,0.72)', fontWeight: '700', marginBottom: 10 },
  previewOpis: { color: 'rgba(255,255,255,0.78)', fontWeight: '700', marginBottom: 12, lineHeight: 18 },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  tagPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(25,112,92,0.14)', borderWidth: 1, borderColor: 'rgba(25,112,92,0.25)' },
  tagText: { color: COLORS.brand, fontWeight: '900', fontSize: 12 },

  deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14, backgroundColor: 'rgba(255,59,48,0.14)', borderWidth: 1, borderColor: 'rgba(255,59,48,0.28)' },
  deleteButtonText: { fontSize: 15, fontWeight: '900', color: COLORS.danger },
});
