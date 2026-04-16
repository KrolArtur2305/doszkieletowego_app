import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  StatusBar,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { Feather } from '@expo/vector-icons'
import { supabase } from '../../../../lib/supabase'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import * as FileSystem from 'expo-file-system/legacy'
import { useTranslation } from 'react-i18next'

import Model3DView from '../../../../components/Model3DView'
import { AppButton, AppCard, AppHeader, AppInput, AppScreen, SectionHeader } from '../../../../src/ui/components'
import { colors, radius, spacing, typography } from '../../../../src/ui/theme'
const ACCENT = colors.accent
const NEON = colors.accentBright
const DEFAULT_MODEL_URL = 'https://pkgeautweumkupfxfjoo.supabase.co/storage/v1/object/public/models/dom_small.glb'
const BUCKET_RZUTY = 'rzuty_projektu'

type Projekt = {
  id: string
  user_id: string
  nazwa?: string | null
  model_url?: string | null
  powierzchnia_uzytkowa?: number | null
  kondygnacje?: number | null
  pomieszczenia?: number | null
  powierzchnia_zabudowy?: number | null
  wysokosc_budynku?: number | null
  kat_dachu?: number | null
  powierzchnia_dachu?: number | null
  szerokosc_elewacji?: number | null
  dlugosc_elewacji?: number | null
}

type Rzut = {
  id: string
  user_id: string
  projekt_id: string
  url: string
  nazwa?: string | null
  created_at: string
  display_url?: string | null
  storage_path?: string | null
}

function fmtNum(v: any, suffix: string) {
  if (v === null || v === undefined || v === '') return '—'
  const n = typeof v === 'string' ? Number(v) : v
  if (Number.isNaN(n)) return '—'
  const out = Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
  return `${out}${suffix}`
}

function safeNumberOrNull(v: string) {
  const x = v.replace(',', '.').trim()
  if (!x) return null
  const n = Number(x)
  return Number.isFinite(n) ? n : null
}

function keyFromStoredUrl(storedUrl: string) {
  const publicMarker = `/storage/v1/object/public/${BUCKET_RZUTY}/`
  const signedMarker = `/storage/v1/object/sign/${BUCKET_RZUTY}/`

  const publicIdx = storedUrl.indexOf(publicMarker)
  if (publicIdx !== -1) {
    return storedUrl.slice(publicIdx + publicMarker.length).split('?')[0]
  }

  const signedIdx = storedUrl.indexOf(signedMarker)
  if (signedIdx !== -1) {
    return storedUrl.slice(signedIdx + signedMarker.length).split('?')[0]
  }

  return null
}

async function withSignedUrls(rows: Rzut[]): Promise<Rzut[]> {
  return Promise.all(
    rows.map(async (row) => {
      const storagePath = keyFromStoredUrl(row.url)
      if (!storagePath) return row

      const { data, error } = await supabase.storage.from(BUCKET_RZUTY).createSignedUrl(storagePath, 60 * 60)
      if (error || !data?.signedUrl) {
        return { ...row, storage_path: storagePath, display_url: row.url }
      }

      return {
        ...row,
        storage_path: storagePath,
        display_url: data.signedUrl,
      }
    })
  )
}

function base64ToUint8Array(base64: string) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const lookup = new Uint8Array(256)
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i

  let bufferLength = (base64.length * 3) / 4
  if (base64.endsWith('==')) bufferLength -= 2
  else if (base64.endsWith('=')) bufferLength -= 1

  const bytes = new Uint8Array(bufferLength)
  let p = 0

  for (let i = 0; i < base64.length; i += 4) {
    const enc1 = lookup[base64.charCodeAt(i)]
    const enc2 = lookup[base64.charCodeAt(i + 1)]
    const enc3 = lookup[base64.charCodeAt(i + 2)]
    const enc4 = lookup[base64.charCodeAt(i + 3)]

    bytes[p++] = (enc1 << 2) | (enc2 >> 4)
    if (base64[i + 2] !== '=') bytes[p++] = ((enc2 & 15) << 4) | (enc3 >> 2)
    if (base64[i + 3] !== '=') bytes[p++] = ((enc3 & 3) << 6) | enc4
  }

  return bytes
}

export default function ProjektScreen() {
  const { t, i18n } = useTranslation('project')

  const [loading, setLoading] = useState(true)
  const [projekt, setProjekt] = useState<Projekt | null>(null)
  const [rzuty, setRzuty] = useState<Rzut[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [lokalizacja, setLokalizacja] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nazwa: '',
    powierzchnia_uzytkowa: '',
    kondygnacje: '',
    pomieszczenia: '',
    powierzchnia_zabudowy: '',
    wysokosc_budynku: '',
    kat_dachu: '',
    powierzchnia_dachu: '',
    szerokosc_elewacji: '',
    dlugosc_elewacji: '',
  })
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewRzut, setPreviewRzut] = useState<Rzut | null>(null)

  useEffect(() => {
    let alive = true

    const load = async () => {
      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser()
        if (authErr) throw authErr

        const user = authData?.user
        if (!user?.id) {
          if (!alive) return
          setUserId(null)
          setProjekt(null)
          setRzuty([])
          setLokalizacja(null)
          setLoading(false)
          return
        }

        if (!alive) return
        setUserId(user.id)

        const [{ data: projData, error: projErr }, { data: invData, error: invErr }] = await Promise.all([
          supabase.from('projekty').select('*').eq('user_id', user.id).maybeSingle(),
          supabase.from('inwestycje').select('lokalizacja').eq('user_id', user.id).maybeSingle(),
        ])

        if (projErr) throw projErr
        if (invErr) throw invErr
        if (!alive) return

        setProjekt((projData as any) ?? null)
        setLokalizacja((invData as any)?.lokalizacja ?? null)

        if ((projData as any)?.id) {
          const { data: rzutyData, error: rzutyErr } = await supabase
            .from('rzuty_projektu')
            .select('id,user_id,projekt_id,url,nazwa,created_at')
            .eq('user_id', user.id)
            .eq('projekt_id', (projData as any).id)
            .order('created_at', { ascending: false })

          if (rzutyErr) throw rzutyErr
          if (!alive) return
          setRzuty(await withSignedUrls(((rzutyData as any) ?? []) as Rzut[]))
        } else {
          setRzuty([])
        }

        if (!alive) return
        setLoading(false)
      } catch (e: any) {
        console.error('[Projekt] load error:', e?.message || e)
        if (!alive) return
        setLoading(false)
        Alert.alert(t('errorTitle', { defaultValue: 'Błąd' }), t('loadError'))
      }
    }

    load()
    return () => {
      alive = false
    }
  }, [t])

  const modelUrl = useMemo(() => projekt?.model_url || DEFAULT_MODEL_URL, [projekt?.model_url])

  const tiles = useMemo(
    () => [
      { id: 'pow_u', label: t('tilePowU', { defaultValue: 'Pow. użytkowa' }), value: fmtNum(projekt?.powierzchnia_uzytkowa, ' m²') },
      { id: 'kond', label: t('tileFloors', { defaultValue: 'Kondygnacje' }), value: String(projekt?.kondygnacje ?? '—') },
      { id: 'pom', label: t('tileRooms', { defaultValue: 'Pomieszczenia' }), value: String(projekt?.pomieszczenia ?? '—') },
      { id: 'pow_z', label: t('tilePowZ', { defaultValue: 'Pow. zabudowy' }), value: fmtNum(projekt?.powierzchnia_zabudowy, ' m²') },
      { id: 'wys', label: t('tileHeight', { defaultValue: 'Wysokość' }), value: fmtNum(projekt?.wysokosc_budynku, ' m') },
      { id: 'kat', label: t('tileRoofAngle', { defaultValue: 'Kąt dachu' }), value: fmtNum(projekt?.kat_dachu, '°') },
      { id: 'pow_d', label: t('tileRoofArea', { defaultValue: 'Pow. dachu' }), value: fmtNum(projekt?.powierzchnia_dachu, ' m²') },
      { id: 'szer', label: t('tileFacadeWidth', { defaultValue: 'Szer. elewacji' }), value: fmtNum(projekt?.szerokosc_elewacji, ' m') },
      { id: 'dl', label: t('tileFacadeLength', { defaultValue: 'Dł. elewacji' }), value: fmtNum(projekt?.dlugosc_elewacji, ' m') },
    ],
    [projekt, t]
  )

  const ensureProjektExists = async (): Promise<Projekt | null> => {
    if (!userId) return null
    if (projekt?.id) return projekt

    const { data: inserted, error } = await supabase
      .from('projekty')
      .insert({ user_id: userId, nazwa: t('myProject'), model_url: DEFAULT_MODEL_URL })
      .select('*')
      .single()

    if (error) {
      Alert.alert(t('errorTitle', { defaultValue: 'Błąd' }), t('createProjectError'))
      return null
    }

    setProjekt(inserted as any)
    return inserted as any
  }

  const handleChangeModel = () => {
    Alert.alert(
      t('model3dTitle', { defaultValue: 'Model 3D' }),
      t('model3dNextStep', { defaultValue: 'Upload .glb/.gltf w następnym kroku.' })
    )
  }

  const uploadRzutAndSave = async () => {
    try {
      if (!userId) {
        Alert.alert(
          t('notLoggedTitle', { defaultValue: 'Brak logowania' }),
          t('notLoggedDesc', { defaultValue: 'Zaloguj się ponownie.' })
        )
        return
      }

      const proj = await ensureProjektExists()
      if (!proj?.id) return

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert(
          t('noAccessTitle', { defaultValue: 'Brak dostępu' }),
          t('noAccessPhotosDesc', { defaultValue: 'Nadaj dostęp do galerii.' })
        )
        return
      }

      const mediaTypes =
        (ImagePicker as any).MediaType?.Images ??
        (ImagePicker as any).MediaType?.Image ??
        ImagePicker.MediaTypeOptions.Images

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes,
        allowsEditing: false,
        quality: 1,
      })

      if (picked.canceled) return

      const asset = picked.assets?.[0]
      if (!asset?.uri) return

      const manipulated = await ImageManipulator.manipulateAsync(asset.uri, [], {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      })

      const key = `${Date.now()}_${Math.random().toString(16).slice(2)}.jpg`
      const path = `rzuty/${userId}/${proj.id}/${key}`

      const base64 = await FileSystem.readAsStringAsync(manipulated.uri, { encoding: 'base64' as any })
      const bytes = base64ToUint8Array(base64)

      const { error: upErr } = await supabase.storage
        .from(BUCKET_RZUTY)
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: false })

      if (upErr) {
        Alert.alert(t('uploadFailedTitle', { defaultValue: 'Upload nieudany' }), upErr.message)
        return
      }

      const { data: pub } = supabase.storage.from(BUCKET_RZUTY).getPublicUrl(path)
      if (!pub?.publicUrl) {
        Alert.alert(t('errorTitle', { defaultValue: 'Błąd' }), t('urlError', { defaultValue: 'Nie udało się uzyskać URL.' }))
        return
      }

      const locale = i18n.language?.startsWith('pl') ? 'pl-PL' : 'en-US'
      const defaultName = `${t('planDefaultName', { defaultValue: 'Rzut' })} ${new Date().toLocaleDateString(locale)}`

      const { data: row, error: insErr } = await supabase
        .from('rzuty_projektu')
        .insert({
          user_id: userId,
          projekt_id: proj.id,
          url: pub.publicUrl,
          nazwa: defaultName,
        })
        .select('id,user_id,projekt_id,url,nazwa,created_at')
        .single()

      if (insErr) {
        Alert.alert(t('saveErrorTitle', { defaultValue: 'Błąd zapisu' }), insErr.message)
        return
      }

      const { data: signedData } = await supabase.storage.from(BUCKET_RZUTY).createSignedUrl(path, 60 * 60)
      setRzuty((prev) => [
        {
          ...(row as any),
          storage_path: path,
          display_url: signedData?.signedUrl ?? pub.publicUrl,
        },
        ...prev,
      ])
    } catch (e: any) {
      console.error('[Projekt] uploadRzutAndSave error:', e?.message || e)
      Alert.alert(t('errorTitle', { defaultValue: 'Błąd' }), t('addPlanError'))
    }
  }

  const openPreview = (r: Rzut) => {
    setPreviewRzut(r)
    setPreviewOpen(true)
  }

  const deleteRzut = async (r: Rzut) => {
    Alert.alert(t('deletePlanTitle'), t('deletePlanDesc'), [
      { text: t('cancel', { defaultValue: 'Anuluj' }), style: 'cancel' },
      {
        text: t('delete', { defaultValue: 'Usuń' }),
        style: 'destructive',
        onPress: async () => {
          try {
            if (!userId) return

            const { error: delDbErr } = await supabase
              .from('rzuty_projektu')
              .delete()
              .eq('id', r.id)
              .eq('user_id', userId)

            if (delDbErr) {
              Alert.alert(t('errorTitle', { defaultValue: 'Błąd' }), delDbErr.message)
              return
            }

            const path = r.storage_path || (r.url ? keyFromStoredUrl(r.url) : null)
            if (path) await supabase.storage.from(BUCKET_RZUTY).remove([path])

            setRzuty((prev) => prev.filter((x) => x.id !== r.id))

            if (previewRzut?.id === r.id) {
              setPreviewOpen(false)
              setPreviewRzut(null)
            }
          } catch {
            Alert.alert(t('errorTitle', { defaultValue: 'Błąd' }), t('deletePlanError', { defaultValue: 'Nie udało się usunąć rzutu.' }))
          }
        },
      },
    ])
  }

  const openEditParams = () => {
    setForm({
      nazwa: projekt?.nazwa ?? '',
      powierzchnia_uzytkowa: projekt?.powierzchnia_uzytkowa?.toString() ?? '',
      kondygnacje: projekt?.kondygnacje?.toString() ?? '',
      pomieszczenia: projekt?.pomieszczenia?.toString() ?? '',
      powierzchnia_zabudowy: projekt?.powierzchnia_zabudowy?.toString() ?? '',
      wysokosc_budynku: projekt?.wysokosc_budynku?.toString() ?? '',
      kat_dachu: projekt?.kat_dachu?.toString() ?? '',
      powierzchnia_dachu: projekt?.powierzchnia_dachu?.toString() ?? '',
      szerokosc_elewacji: projekt?.szerokosc_elewacji?.toString() ?? '',
      dlugosc_elewacji: projekt?.dlugosc_elewacji?.toString() ?? '',
    })
    setEditOpen(true)
  }

  const saveParams = async () => {
    try {
      setSaving(true)

      if (!userId) {
        Alert.alert(
          t('notLoggedTitle', { defaultValue: 'Brak logowania' }),
          t('notLoggedDesc', { defaultValue: 'Zaloguj się ponownie.' })
        )
        return
      }

      const proj = await ensureProjektExists()
      if (!proj?.id) return

      const payload: any = {
        nazwa: form.nazwa?.trim() || null,
        powierzchnia_uzytkowa: safeNumberOrNull(form.powierzchnia_uzytkowa),
        kondygnacje: safeNumberOrNull(form.kondygnacje),
        pomieszczenia: safeNumberOrNull(form.pomieszczenia),
        powierzchnia_zabudowy: safeNumberOrNull(form.powierzchnia_zabudowy),
        wysokosc_budynku: safeNumberOrNull(form.wysokosc_budynku),
        kat_dachu: safeNumberOrNull(form.kat_dachu),
        powierzchnia_dachu: safeNumberOrNull(form.powierzchnia_dachu),
        szerokosc_elewacji: safeNumberOrNull(form.szerokosc_elewacji),
        dlugosc_elewacji: safeNumberOrNull(form.dlugosc_elewacji),
      }

      const { data: updated, error } = await supabase
        .from('projekty')
        .update(payload)
        .eq('user_id', userId)
        .select('*')
        .single()

      if (error) {
        Alert.alert(t('saveErrorTitle', { defaultValue: 'Błąd zapisu' }), error.message)
        return
      }

      setProjekt(updated as any)
      setEditOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const topPad = 0

  return (
    <AppScreen style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={[styles.safeTop, { height: topPad }]} />

        <View style={styles.headerBlock}>
          <AppHeader title={t('screenTitle')} />

          <View style={styles.headerTitleWrap}>
            <Text style={styles.projectTitle} numberOfLines={2}>
              {projekt?.nazwa || '—'}
            </Text>

            {!!lokalizacja && (
              <View style={styles.locationRow}>
                <Feather name="map-pin" size={16} color="rgba(148,163,184,0.95)" />
                <Text style={styles.projectLocation} numberOfLines={1}>
                  {lokalizacja}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.modelHeroWrap}>
          <View style={styles.modelHero}>
            <View style={styles.modelStage}>
              <Model3DView url={modelUrl} />
            </View>

            <AppButton title={t('change3dModel')} onPress={handleChangeModel} style={styles.modelCta} />

            <Text style={styles.modelHint}>
              {t('modelHint', {
                defaultValue: i18n.language?.startsWith('pl')
                  ? 'Dotknij i przeciągnij aby obrócić model'
                  : 'Touch and drag to rotate',
              })}
            </Text>
          </View>
        </View>

        <View style={styles.sectionOuter}>
          <AppCard contentStyle={styles.sectionGlass}>
            <SectionHeader
              title={t('buildingParams')}
              right={
                <TouchableOpacity onPress={openEditParams} style={styles.editBtn} hitSlop={12} activeOpacity={0.85}>
                  <Feather name="sliders" size={13} color={NEON} />
                  <Text style={styles.editBtnText}>{t('edit', { defaultValue: 'Edytuj' })}</Text>
                </TouchableOpacity>
              }
              style={styles.sectionHeaderRow}
            />

            {loading ? (
              <ActivityIndicator color={NEON} style={{ marginVertical: 16 }} />
            ) : (
              <View style={styles.dataGrid}>
                {tiles.map((tile, index) => (
                  <AnimatedDataCell key={tile.id} tile={tile} index={index} />
                ))}
              </View>
            )}
          </AppCard>
        </View>

        <View style={styles.sectionOuter}>
          <AppCard contentStyle={styles.sectionGlass}>
            <SectionHeader
              title={t('projectPlans')}
              right={
                <TouchableOpacity onPress={uploadRzutAndSave} style={styles.editBtn} activeOpacity={0.9}>
                  <Feather name="plus" size={14} color={NEON} />
                  <Text style={styles.editBtnText}>{t('addPlan', { defaultValue: 'Dodaj' })}</Text>
                </TouchableOpacity>
              }
              style={styles.sectionHeaderRow}
            />

            {loading ? (
              <ActivityIndicator color={NEON} style={{ marginVertical: 16 }} />
            ) : rzuty.length === 0 ? (
              <View style={styles.emptyBox}>
                <Feather name="image" size={28} color="rgba(37,240,200,0.35)" />
                <Text style={styles.emptyTitle}>{t('noPlansTitle')}</Text>
                <Text style={styles.emptySubtitle}>{t('noPlansSubtitle')}</Text>
              </View>
            ) : (
              <View style={{ marginTop: 8, gap: 12 }}>
                {rzuty.map((r) => (
                  <Pressable key={r.id} onPress={() => openPreview(r)} onLongPress={() => deleteRzut(r)} style={styles.rzutCard}>
                    <Image source={{ uri: r.display_url || r.url }} style={styles.rzutImg} resizeMode="cover" />
                    <View style={styles.rzutFooter}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={styles.rzutName} numberOfLines={1}>
                          {r.nazwa || t('planDefaultName', { defaultValue: 'Rzut' })}
                        </Text>
                        <Text style={styles.rzutHint}>
                          {t('planHint', { defaultValue: 'Kliknij: podgląd  •  Przytrzymaj: usuń' })}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => deleteRzut(r)} style={styles.trashBtn} hitSlop={10} activeOpacity={0.85}>
                        <Feather name="trash-2" size={16} color="#F8FAFC" />
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </AppCard>
        </View>

        <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
          <View style={styles.previewBackdrop}>
            <View style={styles.previewTopBar}>
              <TouchableOpacity onPress={() => setPreviewOpen(false)} style={styles.previewIconBtn} activeOpacity={0.85}>
                <Feather name="x" size={22} color="#F8FAFC" />
              </TouchableOpacity>

              <Text style={styles.previewTitle} numberOfLines={1}>
                {previewRzut?.nazwa || t('planDefaultName', { defaultValue: 'Rzut' })}
              </Text>

              <TouchableOpacity
                onPress={() => previewRzut && deleteRzut(previewRzut)}
                style={[styles.previewIconBtn, { backgroundColor: 'rgba(239,68,68,0.25)', borderColor: 'rgba(239,68,68,0.45)' }]}
                activeOpacity={0.85}
              >
                <Feather name="trash-2" size={18} color="#F8FAFC" />
              </TouchableOpacity>
            </View>

            <View style={styles.previewImgWrap}>
              {previewRzut?.url ? <Image source={{ uri: previewRzut.display_url || previewRzut.url }} style={styles.previewImg} resizeMode="contain" /> : null}
            </View>
          </View>
        </Modal>

        <Modal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalSheet}>
                <View style={styles.modalHandle} />

                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t('editParamsTitle', { defaultValue: 'Edytuj parametry' })}</Text>

                  <TouchableOpacity onPress={() => setEditOpen(false)} style={styles.modalCloseBtn} activeOpacity={0.85}>
                    <Feather name="x" size={18} color="rgba(255,255,255,0.6)" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                  <Text style={styles.fieldGroupLabel}>{t('fieldGroupGeneral')}</Text>
                  <FieldText
                    label={t('fieldProjectName', { defaultValue: 'Nazwa projektu' })}
                    value={form.nazwa}
                    onChange={(txt) => setForm((p) => ({ ...p, nazwa: txt }))}
                  />

                  <Text style={styles.fieldGroupLabel}>{t('fieldGroupSurfaces')}</Text>
                  <View style={styles.row2}>
                    <FieldNum
                      label={t('fieldPowU', { defaultValue: 'Użytkowa (m²)' })}
                      value={form.powierzchnia_uzytkowa}
                      onChange={(txt) => setForm((p) => ({ ...p, powierzchnia_uzytkowa: txt }))}
                    />
                    <FieldNum
                      label={t('fieldPowZ', { defaultValue: 'Zabudowy (m²)' })}
                      value={form.powierzchnia_zabudowy}
                      onChange={(txt) => setForm((p) => ({ ...p, powierzchnia_zabudowy: txt }))}
                    />
                  </View>

                  <FieldNum
                    label={t('fieldRoofArea', { defaultValue: 'Pow. dachu (m²)' })}
                    value={form.powierzchnia_dachu}
                    onChange={(txt) => setForm((p) => ({ ...p, powierzchnia_dachu: txt }))}
                  />

                  <Text style={styles.fieldGroupLabel}>{t('fieldGroupStructure')}</Text>
                  <View style={styles.row2}>
                    <FieldNum
                      label={t('fieldFloors', { defaultValue: 'Kondygnacje' })}
                      value={form.kondygnacje}
                      onChange={(txt) => setForm((p) => ({ ...p, kondygnacje: txt }))}
                    />
                    <FieldNum
                      label={t('fieldRooms', { defaultValue: 'Pomieszczenia' })}
                      value={form.pomieszczenia}
                      onChange={(txt) => setForm((p) => ({ ...p, pomieszczenia: txt }))}
                    />
                  </View>

                  <View style={styles.row2}>
                    <FieldNum
                      label={t('fieldHeight', { defaultValue: 'Wysokość (m)' })}
                      value={form.wysokosc_budynku}
                      onChange={(txt) => setForm((p) => ({ ...p, wysokosc_budynku: txt }))}
                    />
                    <FieldNum
                      label={t('fieldRoofAngle', { defaultValue: 'Kąt dachu (°)' })}
                      value={form.kat_dachu}
                      onChange={(txt) => setForm((p) => ({ ...p, kat_dachu: txt }))}
                    />
                  </View>

                  <Text style={styles.fieldGroupLabel}>{t('fieldGroupFacade')}</Text>
                  <View style={styles.row2}>
                    <FieldNum
                      label={t('fieldFacadeWidth', { defaultValue: 'Szerokość (m)' })}
                      value={form.szerokosc_elewacji}
                      onChange={(txt) => setForm((p) => ({ ...p, szerokosc_elewacji: txt }))}
                    />
                    <FieldNum
                      label={t('fieldFacadeLength', { defaultValue: 'Długość (m)' })}
                      value={form.dlugosc_elewacji}
                      onChange={(txt) => setForm((p) => ({ ...p, dlugosc_elewacji: txt }))}
                    />
                  </View>
                </ScrollView>

                <View style={styles.modalActions}>
                  <AppButton title={t('cancel', { defaultValue: 'Anuluj' })} variant="secondary" onPress={() => setEditOpen(false)} disabled={saving} style={styles.modalBtnGhost} />

                  <AppButton title={t('save', { defaultValue: 'Zapisz zmiany' })} loading={saving} onPress={saveParams} style={styles.modalBtnPrimary} />
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </ScrollView>
    </AppScreen>
  )
}

function AnimatedDataCell({ tile, index }: { tile: { id: string; label: string; value: string }; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(16)).current
  const glowAnim = useRef(new Animated.Value(0)).current
  const pressScale = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, delay: index * 60, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 380, delay: index * 60, useNativeDriver: true }),
    ]).start()

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1800 + index * 200, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 1800 + index * 200, useNativeDriver: true }),
      ])
    )

    const timeout = setTimeout(() => loop.start(), index * 120)
    return () => {
      clearTimeout(timeout)
      loop.stop()
    }
  }, [glowAnim, index, opacity, translateY])

  const onPressIn = () => Animated.spring(pressScale, { toValue: 0.96, useNativeDriver: true, speed: 30 }).start()
  const onPressOut = () => Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, speed: 20 }).start()

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.9],
  })

  return (
    <Pressable onPressIn={onPressIn} onPressOut={onPressOut} style={{ width: '48%' }}>
      <Animated.View
        style={[
          styles.dataCell,
          { opacity, transform: [{ translateY }, { scale: pressScale }] },
        ]}
      >
        <Animated.View style={[styles.dataCellTopBar, { opacity: glowOpacity }]} />
        <Text style={styles.dataCellValue}>{tile.value}</Text>
        <Text style={styles.dataCellLabel}>{tile.label}</Text>
      </Animated.View>
    </Pressable>
  )
}

function FieldText({ label, value, onChange }: { label: string; value: string; onChange: (t: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <AppInput value={value} onChangeText={onChange} placeholder="—" style={styles.input} />
    </View>
  )
}

function FieldNum({ label, value, onChange }: { label: string; value: string; onChange: (t: string) => void }) {
  return (
    <View style={[styles.field, { flex: 1 }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <AppInput value={value} onChangeText={onChange} placeholder="—" keyboardType="decimal-pad" style={styles.input} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.lg,
  },

  safeTop: {
    width: '100%',
  },

  headerBlock: {
    minHeight: 120,
    justifyContent: 'center',
    paddingVertical: 0,
  },

  headerTitleWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
  },

  projectTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },

  locationRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    maxWidth: '100%',
  },

  projectLocation: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },

  modelHeroWrap: {
    marginTop: 10,
    marginBottom: 18,
  },

  modelHero: {
    borderRadius: 28,
    backgroundColor: 'transparent',
    padding: 0,
  },

  modelStage: {
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#000000',
  },

  modelCta: {
    marginTop: 10,
    alignSelf: 'center',
    minWidth: 180,
  },

  modelHint: {
    marginTop: 8,
    color: 'rgba(148,163,184,0.90)',
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
  },

  sectionOuter: {
    marginBottom: 16,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },

  sectionGlass: {
    borderRadius: 28,
    padding: 18,
    backgroundColor: 'transparent',
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },

  sectionTitleNeon: {
    color: NEON,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.2,
    textShadowColor: 'rgba(37,240,200,0.18)',
    textShadowRadius: 14,
  },

  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.28)',
  },

  editBtnText: {
    color: NEON,
    fontSize: 12,
    fontWeight: '900',
  },

  dataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  dataCell: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    overflow: 'hidden',
  },

  dataCellTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: NEON,
    opacity: 0.55,
    shadowColor: NEON,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },

  dataCellValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginTop: 4,
  },

  dataCellLabel: {
    marginTop: 5,
    color: 'rgba(255,255,255,0.38)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  emptyBox: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 24,
    marginTop: 4,
    alignItems: 'center',
  },

  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 10,
  },

  emptySubtitle: {
    color: 'rgba(255,255,255,0.45)',
    marginTop: 6,
    textAlign: 'center',
    fontSize: 13,
  },

  rzutCard: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
    backgroundColor: '#020617',
    shadowColor: NEON,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },

  rzutImg: {
    width: '100%',
    height: 200,
    backgroundColor: '#0b1220',
  },

  rzutFooter: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  rzutName: {
    color: '#F8FAFC',
    fontWeight: '900',
    fontSize: 15,
  },

  rzutHint: {
    color: 'rgba(255,255,255,0.40)',
    marginTop: 3,
    fontSize: 11.5,
  },

  trashBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.40)',
    backgroundColor: 'rgba(239,68,68,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },

  previewTopBar: {
    paddingTop: 54,
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  previewIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  previewTitle: {
    color: '#F8FAFC',
    fontWeight: '900',
    fontSize: 16,
    flex: 1,
    textAlign: 'center',
  },

  previewImgWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },

  previewImg: {
    width: '100%',
    height: '100%',
  },

  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.60)',
    paddingTop: 28,
    paddingBottom: 28,
  },

  modalSheet: {
    backgroundColor: '#000000',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.15)',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    maxHeight: '92%',
    shadowColor: NEON,
    shadowOpacity: 0.12,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: -8 },
  },

  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 16,
  },

  modalHeader: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    minHeight: 34,
  },

  modalTitle: {
    color: NEON,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.2,
    textAlign: 'center',
  },

  modalCloseBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  fieldGroupLabel: {
    color: NEON,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 10,
    opacity: 0.8,
  },

  field: {
    marginBottom: 10,
  },

  fieldLabel: {
    color: 'rgba(255,255,255,0.38)',
    marginBottom: 6,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  input: {
    fontWeight: '700',
    fontSize: 15,
  },

  row2: {
    flexDirection: 'row',
    gap: 10,
  },

  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
  },

  modalBtnGhost: {
    flex: 1,
  },

  modalBtnPrimary: {
    flex: 1,
  },
})
