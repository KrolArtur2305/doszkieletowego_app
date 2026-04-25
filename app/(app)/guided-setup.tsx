import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { Feather } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { supabase } from '../../lib/supabase'
import { AppButton, AppScreen } from '../../src/ui/components'
import {
  DEFAULT_BUDDY_AVATAR_ID,
  getBuddyAvatarSource,
  type BuddyAvatarId,
} from '../../src/services/buddy/avatar'
import { GUIDED_SETUP_VERSION } from '../../src/services/guidedSetup/launchMode'

const APP_LOGO = require('../assets/logo.png')
const BG = '#000000'
const NEON = '#25F0C8'
const ACCENT = '#19705C'

type ProfileData = {
  imie: string | null
  ai_buddy_name: string | null
  ai_buddy_avatar?: string | null
}

export default function GuidedSetupScreen() {
  const router = useRouter()
  const { step: stepParam } = useLocalSearchParams<{ step?: string | string[] }>()
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0) + 10

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [step, setStep] = useState(() => {
    const raw = Array.isArray(stepParam) ? stepParam[0] : stepParam
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 4) : 0
  })
  const [profile, setProfile] = useState<ProfileData>({ imie: null, ai_buddy_name: null })

  useEffect(() => {
    const raw = Array.isArray(stepParam) ? stepParam[0] : stepParam
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) {
      setStep(Math.min(Math.max(parsed, 0), 4))
    }
  }, [stepParam])

  useEffect(() => {
    let alive = true

    const load = async () => {
      setLoading(true)
      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser()
        if (authErr) throw authErr

        const user = authData?.user
        if (!user?.id) {
          if (alive) setLoading(false)
          return
        }

        let profileRes = await supabase
          .from('profiles')
          .select('imie, ai_buddy_name, ai_buddy_avatar')
          .eq('user_id', user.id)
          .maybeSingle()

        if (profileRes.error && String(profileRes.error.message || '').includes('ai_buddy_avatar')) {
          profileRes = await supabase
            .from('profiles')
            .select('imie, ai_buddy_name')
            .eq('user_id', user.id)
            .maybeSingle()
        }

        if (!alive) return

        setUserId(user.id)
        setProfile({
          imie: (profileRes.data as any)?.imie ?? null,
          ai_buddy_name: (profileRes.data as any)?.ai_buddy_name ?? null,
          ai_buddy_avatar: (profileRes.data as any)?.ai_buddy_avatar ?? null,
        })
      } catch (e: any) {
        if (!alive) return
        Alert.alert('Błąd', e?.message ?? 'Nie udało się przygotować przewodnika startowego.')
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()
    return () => {
      alive = false
    }
  }, [])

  const firstName = useMemo(() => String(profile.imie ?? '').trim() || 'Budowniczy', [profile.imie])
  const avatarId: BuddyAvatarId =
    profile.ai_buddy_avatar === 'avatar2' || profile.ai_buddy_avatar === 'avatar3'
      ? profile.ai_buddy_avatar
      : DEFAULT_BUDDY_AVATAR_ID

  const next = () => setStep((current) => Math.min(current + 1, 4))
  const back = () => setStep((current) => Math.max(current - 1, 0))

  const finish = async () => {
    if (saving) return
    setSaving(true)
    try {
      if (userId) {
        const { error } = await supabase.from('profiles').upsert(
          {
            user_id: userId,
            guided_setup_completed: true,
            guided_setup_version: GUIDED_SETUP_VERSION,
          },
          { onConflict: 'user_id' }
        )

        if (error && !String(error.message || '').includes('guided_setup_')) {
          throw error
        }
      }

      router.replace('/(app)/(tabs)/dashboard')
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? 'Nie udało się zakończyć przewodnika.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppScreen style={styles.screen}>
      <View style={styles.bg} pointerEvents="none" />
      <View style={styles.glowTop} pointerEvents="none" />
      <View style={styles.glowBottom} pointerEvents="none" />

      <View style={[styles.content, { paddingTop: topPad }]}>
        <Image source={APP_LOGO} style={styles.logo} resizeMode="contain" />

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={NEON} />
            <Text style={styles.loadingText}>Przygotowuję przewodnik startowy...</Text>
          </View>
        ) : (
          <BlurView intensity={18} tint="dark" style={styles.card}>
            {step > 0 ? (
              <TouchableOpacity onPress={back} activeOpacity={0.8} style={styles.backButton}>
                <Feather name="chevron-left" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}

            <View style={styles.progressRow}>
              {[0, 1, 2, 3, 4].map((idx) => (
                <View key={idx} style={[styles.progressDot, idx <= step && styles.progressDotActive]} />
              ))}
            </View>

            <Image source={getBuddyAvatarSource(avatarId)} style={styles.avatar} resizeMode="cover" />

            {step === 0 ? (
              <>
                <Text style={styles.title}>Witaj {firstName}</Text>
                <Text style={styles.subtitle}>Jestem Twoim kierownikiem budowy.</Text>
                <Text style={styles.body}>
                  Pokażę Ci teraz najważniejsze funkcje aplikacji, abyś jak najszybciej przejął kontrolę nad swoją budową.
                </Text>
                <AppButton title="Zaczynamy" onPress={next} style={styles.primaryBtn} />
              </>
            ) : null}

            {step === 1 ? (
              <>
                <Text style={styles.title}>Zacznijmy od projektu.</Text>
                <Text style={styles.body}>
                  Uzupełnij podstawowe dane domu, żebym mógł lepiej prowadzić Cię przez kolejne etapy.
                </Text>
                <AppButton
                  title="Uzupełnij dane projektu"
                  onPress={() => router.push('/(app)/(tabs)/projekt?setup=1&guidedStep=1')}
                  style={styles.primaryBtn}
                />
                <AppButton title="Pomiń na razie" variant="secondary" onPress={next} style={styles.secondaryBtn} />
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Text style={styles.title}>Budżet</Text>
                <Text style={styles.body}>BuildIQ pilnuje budżetu za Ciebie.</Text>
                <View style={styles.bulletList}>
                  <Text style={styles.bulletItem}>• Kontrola Twoich wydatków</Text>
                  <Text style={styles.bulletItem}>• analiza AI Twoich wydatków</Text>
                  <Text style={styles.bulletItem}>• Podgląd kosztów</Text>
                </View>
                <AppButton title="Dalej" onPress={next} style={styles.primaryBtn} />
              </>
            ) : null}

            {step === 3 ? (
              <>
                <Text style={styles.title}>Najważniejsze moduły</Text>
                <View style={styles.infoList}>
                  <Text style={styles.infoItem}>Zadania pomogą Ci planować kolejne prace i pilnować terminów.</Text>
                  <Text style={styles.infoItem}>Postępy pokażą, na jakim etapie budowy jesteś i co zostało do zrobienia.</Text>
                  <Text style={styles.infoItem}>Dokumenty i kontakty zbiorą wszystko ważne w jednym miejscu.</Text>
                </View>
                <AppButton title="Dalej" onPress={next} style={styles.primaryBtn} />
              </>
            ) : null}

            {step === 4 ? (
              <>
                <Text style={styles.title}>To wszystko.</Text>
                <Text style={styles.body}>
                  Resztę ustawisz już w aplikacji. W razie czego wróć do mnie i pytaj o kolejne kroki.
                </Text>
                <AppButton title="Przejdź do aplikacji" onPress={finish} loading={saving} disabled={saving} style={styles.primaryBtn} />
              </>
            ) : null}
          </BlurView>
        )}
      </View>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG,
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
  },
  glowTop: {
    position: 'absolute',
    width: 380,
    height: 380,
    borderRadius: 999,
    backgroundColor: ACCENT,
    opacity: 0.12,
    top: -180,
    right: -120,
  },
  glowBottom: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 999,
    backgroundColor: NEON,
    opacity: 0.06,
    bottom: -120,
    left: -120,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 40,
    justifyContent: 'flex-start',
  },
  logo: {
    width: 156,
    height: 156,
    alignSelf: 'center',
    marginBottom: 8,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.56)',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    borderRadius: 28,
    padding: 22,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  backButton: {
    alignSelf: 'flex-start',
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.22)',
    marginBottom: 2,
    marginTop: -8,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'center',
    marginBottom: 18,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  progressDotActive: {
    backgroundColor: NEON,
  },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignSelf: 'center',
    marginBottom: 18,
    borderWidth: 2,
    borderColor: 'rgba(37,240,200,0.35)',
  },
  title: {
    color: NEON,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 18,
  },
  infoList: {
    gap: 12,
    marginBottom: 18,
  },
  infoItem: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    textAlign: 'center',
  },
  bulletList: {
    gap: 10,
    marginBottom: 18,
    alignSelf: 'stretch',
  },
  bulletItem: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'left',
  },
  primaryBtn: {
    marginTop: 4,
  },
  secondaryBtn: {
    marginTop: 10,
  },
})
