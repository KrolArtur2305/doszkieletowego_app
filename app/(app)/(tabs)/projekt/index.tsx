import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import Model3DView from '../../../../components/Model3DView'
const logo = require('../../../assets/logo.png');


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
}

const DEFAULT_MODEL_URL =
  'https://pkgeautweumkupfxfjoo.supabase.co/storage/v1/object/public/models/dom_small.glb'

const BUCKET_RZUTY = 'rzuty_projektu'

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

function keyFromPublicUrl(publicUrl: string) {
  const idx = publicUrl.indexOf(`/storage/v1/object/public/${BUCKET_RZUTY}/`)
  if (idx === -1) return null
  return publicUrl.slice(idx + `/storage/v1/object/public/${BUCKET_RZUTY}/`.length)
}

// bez zależności (base-64), działa w Hermes/JSC
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

    const chr1 = (enc1 << 2) | (enc2 >> 4)
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2)
    const chr3 = ((enc3 & 3) << 6) | enc4

    bytes[p++] = chr1
    if (base64[i + 2] !== '=') bytes[p++] = chr2
    if (base64[i + 3] !== '=') bytes[p++] = chr3
  }

  return bytes
}

export default function ProjektScreen() {
  const [loading, setLoading] = useState(true)
  const [projekt, setProjekt] = useState<Projekt | null>(null)
  const [rzuty, setRzuty] = useState<Rzut[]>([])
  const [userId, setUserId] = useState<string | null>(null)

  // modal parametrów
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

  // modal podglądu rzutu
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
          setLoading(false)
          return
        }
        if (!alive) return
        setUserId(user.id)

        const { data: projData, error: projErr } = await supabase
          .from('projekty')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle()

        if (projErr) throw projErr
        if (!alive) return
        setProjekt(projData ?? null)

        if (projData?.id) {
          const { data: rzutyData, error: rzutyErr } = await supabase
            .from('rzuty_projektu')
            .select('id,user_id,projekt_id,url,nazwa,created_at')
            .eq('user_id', user.id)
            .eq('projekt_id', projData.id)
            .order('created_at', { ascending: false })

          if (rzutyErr) throw rzutyErr
          if (!alive) return
          setRzuty((rzutyData as any) ?? [])
        } else {
          setRzuty([])
        }

        if (!alive) return
        setLoading(false)
      } catch (e: any) {
        console.log('[Projekt] load error:', e?.message || e)
        if (!alive) return
        setLoading(false)
        Alert.alert('Błąd', 'Nie udało się pobrać danych projektu z Supabase.')
      }
    }

    load()
    return () => {
      alive = false
    }
  }, [])

  const modelUrl = useMemo(() => projekt?.model_url || DEFAULT_MODEL_URL, [projekt?.model_url])

  const tiles = useMemo(() => {
    return [
      { id: 'pow_u', label: 'Pow. użytkowa', value: fmtNum(projekt?.powierzchnia_uzytkowa, ' m²') },
      { id: 'kond', label: 'Kondygnacje', value: projekt?.kondygnacje ?? '—' },
      { id: 'pom', label: 'Pomieszczenia', value: projekt?.pomieszczenia ?? '—' },

      { id: 'pow_z', label: 'Pow. zabudowy', value: fmtNum(projekt?.powierzchnia_zabudowy, ' m²') },
      { id: 'wys', label: 'Wysokość budynku', value: fmtNum(projekt?.wysokosc_budynku, ' m') },
      { id: 'kat', label: 'Kąt dachu', value: fmtNum(projekt?.kat_dachu, '°') },

      { id: 'pow_d', label: 'Pow. dachu', value: fmtNum(projekt?.powierzchnia_dachu, ' m²') },
      { id: 'szer', label: 'Szer. elewacji', value: fmtNum(projekt?.szerokosc_elewacji, ' m') },
      { id: 'dl', label: 'Dł. elewacji', value: fmtNum(projekt?.dlugosc_elewacji, ' m') },
    ]
  }, [projekt])

  const ensureProjektExists = async (): Promise<Projekt | null> => {
    if (!userId) return null
    if (projekt?.id) return projekt

    const { data: inserted, error } = await supabase
      .from('projekty')
      .insert({
        user_id: userId,
        nazwa: 'Mój projekt',
        model_url: DEFAULT_MODEL_URL,
      })
      .select('*')
      .single()

    if (error) {
      console.log('[Projekt] ensureProjektExists error:', error.message)
      Alert.alert('Błąd', 'Nie udało się utworzyć projektu w Supabase.')
      return null
    }
    setProjekt(inserted as any)
    return inserted as any
  }

  const handleChangeModel = () => {
    Alert.alert('Model 3D', 'Zrobimy w następnym kroku: upload .glb/.gltf + update projekty.model_url.')
  }

  const uploadRzutAndSave = async () => {
    try {
      if (!userId) {
        Alert.alert('Brak logowania', 'Zaloguj się ponownie.')
        return
      }

      const proj = await ensureProjektExists()
      if (!proj?.id) return

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) {
        Alert.alert('Brak dostępu', 'Nadaj dostęp do galerii, aby dodać rzut.')
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

      const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
        encoding: 'base64' as any,
      })
      const bytes = base64ToUint8Array(base64)

      const { error: upErr } = await supabase.storage
        .from(BUCKET_RZUTY)
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: false })

      if (upErr) {
        Alert.alert('Upload nieudany', upErr.message)
        return
      }

      const { data: pub } = supabase.storage.from(BUCKET_RZUTY).getPublicUrl(path)
      const publicUrl = pub?.publicUrl
      if (!publicUrl) {
        Alert.alert('Błąd', 'Nie udało się uzyskać URL pliku.')
        return
      }

      const defaultName = `Rzut ${new Date().toLocaleDateString('pl-PL')}`
      const { data: row, error: insErr } = await supabase
        .from('rzuty_projektu')
        .insert({
          user_id: userId,
          projekt_id: proj.id,
          url: publicUrl,
          nazwa: defaultName,
        })
        .select('id,user_id,projekt_id,url,nazwa,created_at')
        .single()

      if (insErr) {
        Alert.alert('Błąd zapisu', insErr.message)
        return
      }

      setRzuty((prev) => [row as any, ...prev])
    } catch (e: any) {
      console.log('[Projekt] uploadRzutAndSave error:', e?.message || e)
      Alert.alert('Błąd', 'Nie udało się dodać rzutu.')
    }
  }

  const openPreview = (r: Rzut) => {
    setPreviewRzut(r)
    setPreviewOpen(true)
  }

  const deleteRzut = async (r: Rzut) => {
    Alert.alert('Usunąć rzut?', 'To usunie zdjęcie ze Storage i rekord z bazy.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
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
              Alert.alert('Błąd', delDbErr.message)
              return
            }

            const path = r.url ? keyFromPublicUrl(r.url) : null
            if (path) {
              await supabase.storage.from(BUCKET_RZUTY).remove([path])
            }

            setRzuty((prev) => prev.filter((x) => x.id !== r.id))
            if (previewRzut?.id === r.id) {
              setPreviewOpen(false)
              setPreviewRzut(null)
            }
          } catch {
            Alert.alert('Błąd', 'Nie udało się usunąć rzutu.')
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
        Alert.alert('Brak logowania', 'Zaloguj się ponownie.')
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
        Alert.alert('Błąd zapisu', error.message)
        return
      }

      setProjekt(updated as any)
      setEditOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 140 }}>
      <View style={[styles.safeTop, { height: topPad }]} />

      {/* TOP BAR: tylko logo */}
      <View style={styles.topBar}>
        <View style={styles.logoWrap}>
          <Image source={logo} style={styles.logoImg} resizeMode="contain" />
        </View>
        <View style={{ width: 30, height: 30 }} />{/* balans bez pogody */}
      </View>

      {/* Nagłówek: nazwa projektu */}
      <View style={styles.headerBlock}>
        <Text style={styles.projectTitle} numberOfLines={2}>
          {projekt?.nazwa || '—'}
        </Text>
        <Text style={styles.projectLocation} numberOfLines={1}>
          {/* lokalizacja podepniemy później z inwestycji */}
          —
        </Text>
      </View>

      {/* HERO MODEL 3D */}
      <View style={styles.modelHeroWrap}>
        <View style={styles.modelGlowA} />
        <View style={styles.modelGlowB} />

        <View style={styles.modelHero}>
          <View style={styles.modelHeroTop}>
            <Text style={styles.modelHeroTitle}>Model 3D</Text>
            <Text style={styles.modelHeroSub} numberOfLines={1}>
              {modelUrl}
            </Text>
          </View>

          <View style={styles.modelStage}>
            <Model3DView url={modelUrl} />
          </View>

          <TouchableOpacity style={styles.modelCta} onPress={handleChangeModel} activeOpacity={0.9}>
            <Feather name="refresh-cw" size={16} color="#0B1120" />
            <Text style={styles.modelCtaText}>Dodaj / zamień model 3D</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* PARAMETRY */}
      <BlurView intensity={80} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitleCenter}>Parametry budynku</Text>

        <TouchableOpacity onPress={openEditParams} style={styles.secondaryBtn}>
          <Feather name="edit-3" size={16} color="#0B1120" />
          <Text style={styles.secondaryBtnText}>Edytuj</Text>
        </TouchableOpacity>

        <View style={styles.tilesGrid}>
          {tiles.map((t) => (
            <View key={t.id} style={styles.tile}>
              <Text style={styles.tileLabel}>{t.label}</Text>
              <Text style={styles.tileValue}>{String(t.value)}</Text>
            </View>
          ))}
        </View>
      </BlurView>

      {/* RZUTY */}
      <BlurView intensity={80} tint="dark" style={styles.card}>
        <Text style={styles.sectionTitleCenter}>Rzuty projektu</Text>

        <TouchableOpacity onPress={uploadRzutAndSave} style={styles.secondaryBtn}>
          <Feather name="plus" size={16} color="#0B1120" />
          <Text style={styles.secondaryBtnText}>Dodaj rzut</Text>
        </TouchableOpacity>

        {loading ? (
          <View style={{ paddingVertical: 18 }}>
            <ActivityIndicator color="#5EEAD4" />
          </View>
        ) : rzuty.length === 0 ? (
          <View style={styles.emptyBox}>
            <Feather name="image" size={22} color="#5EEAD4" />
            <Text style={styles.emptyTitle}>Brak rzutów</Text>
            <Text style={styles.emptySubtitle}>Dodaj pierwszy rzut (jpg/png/webp).</Text>
          </View>
        ) : (
          <View style={{ marginTop: 12 }}>
            {rzuty.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => openPreview(r)}
                onLongPress={() => deleteRzut(r)}
                style={styles.rzutCard}
              >
                <Image source={{ uri: r.url }} style={styles.rzutImg} resizeMode="cover" />
                <View style={styles.rzutFooter}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.rzutName} numberOfLines={1}>
                      {r.nazwa || 'Rzut'}
                    </Text>
                    <Text style={styles.rzutHint}>Kliknij: podgląd • Przytrzymaj: usuń</Text>
                  </View>

                  <TouchableOpacity onPress={() => deleteRzut(r)} style={styles.trashBtn} hitSlop={10}>
                    <Feather name="trash-2" size={16} color="#F8FAFC" />
                  </TouchableOpacity>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </BlurView>

      {/* MODAL PODGLĄDU RZUTU */}
      <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
        <View style={styles.previewBackdrop}>
          <View style={styles.previewTopBar}>
            <TouchableOpacity onPress={() => setPreviewOpen(false)} style={styles.previewIconBtn}>
              <Feather name="x" size={22} color="#F8FAFC" />
            </TouchableOpacity>

            <Text style={styles.previewTitle} numberOfLines={1}>
              {previewRzut?.nazwa || 'Rzut'}
            </Text>

            <TouchableOpacity
              onPress={() => previewRzut && deleteRzut(previewRzut)}
              style={[
                styles.previewIconBtn,
                { backgroundColor: 'rgba(239,68,68,0.25)', borderColor: 'rgba(239,68,68,0.45)' },
              ]}
            >
              <Feather name="trash-2" size={18} color="#F8FAFC" />
            </TouchableOpacity>
          </View>

          <View style={styles.previewImgWrap}>
            {previewRzut?.url ? (
              <Image source={{ uri: previewRzut.url }} style={styles.previewImg} resizeMode="contain" />
            ) : null}
          </View>
        </View>
      </Modal>

      {/* MODAL EDYCJI PARAMETRÓW */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <BlurView intensity={90} tint="dark" style={styles.modalCard}>
              <Text style={styles.modalTitle}>Edytuj parametry</Text>

              <FieldText label="Nazwa projektu" value={form.nazwa} onChange={(t) => setForm((p) => ({ ...p, nazwa: t }))} />

              <View style={styles.row2}>
                <FieldNum
                  label="Pow. użytkowa (m²)"
                  value={form.powierzchnia_uzytkowa}
                  onChange={(t) => setForm((p) => ({ ...p, powierzchnia_uzytkowa: t }))}
                />
                <FieldNum
                  label="Kondygnacje"
                  value={form.kondygnacje}
                  onChange={(t) => setForm((p) => ({ ...p, kondygnacje: t }))}
                />
              </View>

              <View style={styles.row2}>
                <FieldNum
                  label="Pomieszczenia"
                  value={form.pomieszczenia}
                  onChange={(t) => setForm((p) => ({ ...p, pomieszczenia: t }))}
                />
                <FieldNum
                  label="Pow. zabudowy (m²)"
                  value={form.powierzchnia_zabudowy}
                  onChange={(t) => setForm((p) => ({ ...p, powierzchnia_zabudowy: t }))}
                />
              </View>

              <View style={styles.row2}>
                <FieldNum
                  label="Wysokość (m)"
                  value={form.wysokosc_budynku}
                  onChange={(t) => setForm((p) => ({ ...p, wysokosc_budynku: t }))}
                />
                <FieldNum
                  label="Kąt dachu (°)"
                  value={form.kat_dachu}
                  onChange={(t) => setForm((p) => ({ ...p, kat_dachu: t }))}
                />
              </View>

              <View style={styles.row2}>
                <FieldNum
                  label="Pow. dachu (m²)"
                  value={form.powierzchnia_dachu}
                  onChange={(t) => setForm((p) => ({ ...p, powierzchnia_dachu: t }))}
                />
                <FieldNum
                  label="Szer. elewacji (m)"
                  value={form.szerokosc_elewacji}
                  onChange={(t) => setForm((p) => ({ ...p, szerokosc_elewacji: t }))}
                />
              </View>

              <FieldNum
                label="Dł. elewacji (m)"
                value={form.dlugosc_elewacji}
                onChange={(t) => setForm((p) => ({ ...p, dlugosc_elewacji: t }))}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setEditOpen(false)} style={[styles.modalBtn, styles.modalBtnGhost]} disabled={saving}>
                  <Text style={styles.modalBtnGhostText}>Anuluj</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={saveParams} style={[styles.modalBtn, styles.modalBtnPrimary]} disabled={saving}>
                  {saving ? <ActivityIndicator /> : <Text style={styles.modalBtnPrimaryText}>Zapisz</Text>}
                </TouchableOpacity>
              </View>
            </BlurView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </ScrollView>
  )
}

function FieldText({ label, value, onChange }: { label: string; value: string; onChange: (t: string) => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder="—" placeholderTextColor="#64748B" style={styles.input} />
    </View>
  )
}

function FieldNum({ label, value, onChange }: { label: string; value: string; onChange: (t: string) => void }) {
  return (
    <View style={[styles.field, { flex: 1 }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="—"
        placeholderTextColor="#64748B"
        keyboardType="decimal-pad"
        style={styles.input}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050915', paddingHorizontal: 16 },

  safeTop: { width: '100%' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  logoWrap: { alignItems: 'flex-start', justifyContent: 'center' },
  logoImg: { width: 30, height: 30 },

  headerBlock: { alignItems: 'center', paddingVertical: 6 },
  projectTitle: { color: '#F8FAFC', fontSize: 26, fontWeight: '900', textAlign: 'center' },
  projectLocation: { marginTop: 6, color: 'rgba(148,163,184,0.9)', fontSize: 13, fontWeight: '700' },

  modelHeroWrap: { marginTop: 10, marginBottom: 18 },
  modelGlowA: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: '#10B981',
    opacity: 0.12,
    top: -90,
    left: -80,
  },
  modelGlowB: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: '#0EA5E9',
    opacity: 0.10,
    bottom: -120,
    right: -90,
  },

  modelHero: {
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.15)',
    padding: 16,
  },
  modelHeroTop: { alignItems: 'center' },
  modelHeroTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '900' },
  modelHeroSub: { marginTop: 6, color: 'rgba(148,163,184,0.85)', fontSize: 11, textAlign: 'center' },

  modelStage: {
    height: 260,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modelCta: {
    marginTop: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: '#5EEAD4',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modelCtaText: { color: '#0B1120', fontWeight: '900' },

  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 20,
    marginBottom: 18,
    overflow: 'hidden',
  },

  sectionTitleCenter: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
  },

  secondaryBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    backgroundColor: '#5EEAD4',
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  secondaryBtnText: { color: '#0B1120', fontWeight: '900' },

  tilesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  tile: {
    width: '48%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 14,
  },
  tileLabel: { color: '#94A3B8', fontSize: 12, textAlign: 'center' },
  tileValue: { color: '#F8FAFC', fontSize: 16, fontWeight: '900', marginTop: 6, textAlign: 'center' },

  emptyBox: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 18,
    marginTop: 10,
    alignItems: 'center',
  },
  emptyTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '900', marginTop: 10 },
  emptySubtitle: { color: '#94A3B8', marginTop: 6, textAlign: 'center' },

  rzutCard: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
    backgroundColor: '#020617',
    marginBottom: 14,
    shadowColor: '#10B981',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  rzutImg: { width: '100%', height: 200, backgroundColor: '#0b1220' },
  rzutFooter: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rzutName: { color: '#F8FAFC', fontWeight: '900', fontSize: 16 },
  rzutHint: { color: '#94A3B8', marginTop: 4, fontSize: 12 },

  trashBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(239,68,68,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // preview modal
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
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
  previewTitle: { color: '#F8FAFC', fontWeight: '900', fontSize: 16, flex: 1, textAlign: 'center' },
  previewImgWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
  previewImg: { width: '100%', height: '100%' },

  // modal parametry
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 18,
    marginHorizontal: 8,
  },
  modalTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 12 },

  field: { marginBottom: 10 },
  fieldLabel: { color: '#94A3B8', marginBottom: 6, fontSize: 12 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#F8FAFC',
  },
  row2: { flexDirection: 'row', gap: 10 },

  modalActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center' },
  modalBtnGhost: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  modalBtnGhostText: { color: '#F8FAFC', fontWeight: '800' },
  modalBtnPrimary: { backgroundColor: '#5EEAD4' },
  modalBtnPrimaryText: { color: '#0B1120', fontWeight: '900' },
})
