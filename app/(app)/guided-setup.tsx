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
import { useTranslation } from 'react-i18next'

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
const FINAL_FEATURES = [
  { icon: 'trending-up', titleKey: 'onboarding:guided.control.progress' },
  { icon: 'camera', titleKey: 'onboarding:guided.control.photos' },
  { icon: 'folder', titleKey: 'onboarding:guided.control.documents' },
]

type ProfileData = {
  imie: string | null
  ai_buddy_name: string | null
  ai_buddy_avatar?: string | null
}

export default function GuidedSetupScreen() {
  const router = useRouter()
  const { t } = useTranslation(['onboarding', 'common'])
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
        Alert.alert(t('onboarding:alerts.errorTitle'), e?.message ?? t('onboarding:guided.alerts.prepareError'))
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()
    return () => {
      alive = false
    }
  }, [t])

  const buddyName = useMemo(() => String(profile.ai_buddy_name ?? '').trim() || t('onboarding:guided.defaultBuddyName'), [profile.ai_buddy_name, t])
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
      Alert.alert(t('onboarding:alerts.errorTitle'), e?.message ?? t('onboarding:guided.alerts.finishError'))
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
            <Text style={styles.loadingText}>{t('onboarding:guided.loading')}</Text>
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
                <Text style={styles.title}>{t('onboarding:guided.welcome.title', { buddy: buddyName })}</Text>
                <Text style={styles.subtitle}>
                  {t('onboarding:guided.welcome.subtitle')}
                </Text>
                <Text style={styles.body}>
                  {t('onboarding:guided.welcome.body')}
                </Text>
                <AppButton title={t('onboarding:guided.actions.start')} onPress={next} style={styles.primaryBtn} />
              </>
            ) : null}

            {step === 1 ? (
              <>
                <Text style={styles.title}>{t('onboarding:guided.project.title')}</Text>
                <Text style={styles.body}>
                  {t('onboarding:guided.project.body')}
                </Text>
                <AppButton
                  title={t('onboarding:guided.project.cta')}
                  onPress={() => router.push('/(app)/(tabs)/projekt?setup=1&guidedStep=2')}
                  style={styles.primaryBtn}
                />
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Text style={styles.title}>{t('onboarding:guided.budget.title')}</Text>
                <Text style={styles.body}>
                  {t('onboarding:guided.budget.body')}
                </Text>
                <AppButton title={t('onboarding:actions.next')} onPress={next} style={styles.primaryBtn} />
              </>
            ) : null}

            {step === 3 ? (
              <>
                <Text style={styles.title}>{t('onboarding:guided.progress.title')}</Text>
                <Text style={styles.body}>
                  {t('onboarding:guided.progress.body')}
                </Text>
                <AppButton title={t('onboarding:actions.next')} onPress={next} style={styles.primaryBtn} />
              </>
            ) : null}

            {step === 4 ? (
              <>
                <View style={styles.finalKicker}>
                  <Feather name="check" size={14} color="#02110e" />
                  <Text style={styles.finalKickerText}>{t('onboarding:guided.control.kicker', { defaultValue: 'Gotowe' })}</Text>
                </View>

                <Text style={styles.title}>{t('onboarding:guided.control.title')}</Text>
                <Text style={styles.body}>
                  {t('onboarding:guided.control.body', {
                    defaultValue: 'Kierownik AI będzie prowadził Cię przez budowę i przypominał o ważnych rzeczach.',
                  })}
                </Text>

                <View style={styles.featureList}>
                  {FINAL_FEATURES.map((item) => (
                    <View key={item.titleKey} style={styles.featureRow}>
                      <View style={styles.featureIcon}>
                        <Feather name={item.icon as any} size={15} color={NEON} />
                      </View>
                      <Text style={styles.featureText}>{t(item.titleKey)}</Text>
                    </View>
                  ))}
                </View>

                <AppButton
                  title={t('onboarding:guided.actions.start')}
                  onPress={finish}
                  loading={saving}
                  disabled={saving}
                  style={styles.primaryBtn}
                />
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
  finalKicker: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: NEON,
    marginBottom: 14,
  },
  finalKickerText: {
    color: '#02110e',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
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
  featureList: {
    gap: 10,
    marginBottom: 18,
    alignSelf: 'stretch',
  },
  featureRow: {
    minHeight: 52,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
  },
  featureText: {
    flex: 1,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  primaryBtn: {
    marginTop: 4,
  },
  secondaryBtn: {
    marginTop: 10,
  },
})
