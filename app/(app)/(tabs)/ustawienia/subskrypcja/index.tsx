import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../../../../lib/supabase'

const NEON = '#25F0C8'
const ACCENT = '#19705C'

// ─── Plan definitions ──────────────────────────────────────────────────────────
// Prices and limits are defined here — easy to update

type PlanKey = 'free' | 'standard' | 'pro'

type Plan = {
  key: PlanKey
  nameKey: string
  descKey: string
  monthlyPrice: number | null   // null = free
  yearlyPrice: number | null    // null = free / not applicable
  color: string
  glowColor: string
  popular: boolean
  features: {
    key: string
    labelKey: string
    value: string | boolean
    highlight?: boolean
  }[]
}

const PLANS: Plan[] = [
  {
    key: 'free',
    nameKey: 'plans.free.name',
    descKey: 'plans.free.desc',
    monthlyPrice: null,
    yearlyPrice: null,
    color: 'rgba(255,255,255,0.06)',
    glowColor: 'rgba(255,255,255,0.10)',
    popular: false,
    features: [
      { key: 'photos',    labelKey: 'features.photos',    value: '20' },
      { key: 'docs',      labelKey: 'features.docs',      value: '5' },
      { key: 'tasks',     labelKey: 'features.tasks',     value: '15' },
      { key: 'model3d',   labelKey: 'features.model3d',   value: false },
      { key: 'ai',        labelKey: 'features.ai',        value: false },
    ],
  },
  {
    key: 'standard',
    nameKey: 'plans.standard.name',
    descKey: 'plans.standard.desc',
    monthlyPrice: 19.99,
    yearlyPrice: 399,
    color: 'rgba(25,112,92,0.14)',
    glowColor: 'rgba(25,112,92,0.35)',
    popular: true,
    features: [
      { key: 'photos',    labelKey: 'features.photos',    value: '50' },
      { key: 'docs',      labelKey: 'features.docs',      value: '15' },
      { key: 'tasks',     labelKey: 'features.tasks',     value: '50' },
      { key: 'model3d',   labelKey: 'features.model3d',   value: true },
      { key: 'ai',        labelKey: 'features.ai',        value: false },
    ],
  },
  {
    key: 'pro',
    nameKey: 'plans.pro.name',
    descKey: 'plans.pro.desc',
    monthlyPrice: 34.99,
    yearlyPrice: 699,
    color: 'rgba(37,240,200,0.08)',
    glowColor: 'rgba(37,240,200,0.40)',
    popular: false,
    features: [
      { key: 'photos',    labelKey: 'features.photos',    value: '∞', highlight: true },
      { key: 'docs',      labelKey: 'features.docs',      value: '∞', highlight: true },
      { key: 'tasks',     labelKey: 'features.tasks',     value: '∞', highlight: true },
      { key: 'model3d',   labelKey: 'features.model3d',   value: true },
      { key: 'ai',        labelKey: 'features.ai',        value: true, highlight: true },
    ],
  },
]

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function SubskrypcjaScreen() {
  const router = useRouter()
  const { t } = useTranslation('subscription')

  const [currentPlan, setCurrentPlan] = useState<PlanKey>('free')
  const [loading, setLoading] = useState(true)

  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8

  // Fetch current user plan from profiles
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        const user = userData?.user
        if (!user) return
        const { data: profile } = await supabase
          .from('profiles')
          .select('plan')
          .eq('user_id', user.id)
          .maybeSingle()
        if (!alive) return
        const p = profile?.plan as PlanKey | null
        if (p && ['free', 'standard', 'pro'].includes(p)) setCurrentPlan(p)
      } catch { /* ignore */ } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // Entrance animations
  const headerAnim = useRef(new Animated.Value(0)).current
  const cardsAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.stagger(120, [
      Animated.timing(headerAnim, { toValue: 1, duration: 480, useNativeDriver: true }),
      Animated.timing(cardsAnim, { toValue: 1, duration: 520, useNativeDriver: true }),
    ]).start()
  }, [])

  const onSelectPlan = (plan: Plan) => {
    if (plan.key === 'free') return // already free or downgrade — handle separately
    router.push({
      pathname: '/(app)/(tabs)/ustawienia/subskrypcja/checkout',
      params: { planKey: plan.key },
    })
  }

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.blackBase} />

      {/* Ambient glows */}
      <View pointerEvents="none" style={styles.glowTop} />
      <View pointerEvents="none" style={styles.glowBottom} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPad }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
          <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        {/* Header */}
        <Animated.View style={[styles.header, { opacity: headerAnim, transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <Text style={styles.eyebrow}>{t('eyebrow', { defaultValue: 'Twój plan' })}</Text>
          <Text style={styles.title}>{t('title', { defaultValue: 'Wybierz abonament' })}</Text>
          <Text style={styles.subtitle}>{t('subtitle', { defaultValue: 'Zarządzaj budową bez ograniczeń' })}</Text>
        </Animated.View>

        {/* Current plan badge */}
        {!loading && (
          <View style={styles.currentBadgeWrap}>
            <BlurView intensity={14} tint="dark" style={styles.currentBadge}>
              <View style={styles.currentBadgeDot} />
              <Text style={styles.currentBadgeText}>
                {t('currentPlan', { defaultValue: 'Aktywny plan' })}: <Text style={styles.currentBadgePlan}>{t(`plans.${currentPlan}.name`, { defaultValue: currentPlan.toUpperCase() })}</Text>
              </Text>
            </BlurView>
          </View>
        )}

        {/* Plans — 3 columns */}
        <Animated.View style={[styles.plansRow, { opacity: cardsAnim, transform: [{ translateY: cardsAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }] }]}>
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.key}
              plan={plan}
              isCurrent={currentPlan === plan.key}
              t={t}
              onSelect={() => onSelectPlan(plan)}
            />
          ))}
        </Animated.View>

        {/* Yearly savings note */}
        <BlurView intensity={12} tint="dark" style={styles.savingsNote}>
          <Feather name="tag" size={14} color={NEON} />
          <Text style={styles.savingsText}>{t('savingsNote', { defaultValue: 'Płacąc jednorazowo oszczędzasz ponad 40% rocznie' })}</Text>
        </BlurView>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({ plan, isCurrent, t, onSelect }: {
  plan: Plan
  isCurrent: boolean
  t: (key: string, opts?: any) => string
  onSelect: () => void
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current
  const onPressIn = () => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 30 }).start()
  const onPressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 20 }).start()

  const isFree = plan.monthlyPrice === null
  const isPro = plan.key === 'pro'

  return (
    <Animated.View style={[styles.planCardWrap, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onSelect}
        disabled={isCurrent}
      >
        <BlurView intensity={isPro ? 22 : 14} tint="dark" style={[
          styles.planCard,
          { backgroundColor: plan.color, borderColor: isCurrent ? NEON : plan.glowColor },
          isCurrent && styles.planCardCurrent,
          isPro && styles.planCardPro,
        ]}>
          {/* Popular badge */}
          {plan.popular && (
            <View style={styles.popularBadge}>
              <Text style={styles.popularBadgeText}>{t('popular', { defaultValue: 'Popularny' })}</Text>
            </View>
          )}

          {/* Plan name */}
          <Text style={[styles.planName, isPro && styles.planNamePro]}>
            {t(plan.nameKey, { defaultValue: plan.key })}
          </Text>

          {/* Price */}
          {isFree ? (
            <View style={styles.priceWrap}>
              <Text style={styles.priceFree}>{t('free', { defaultValue: 'Bezpłatny' })}</Text>
            </View>
          ) : (
            <View style={styles.priceWrap}>
              <Text style={[styles.priceAmount, isPro && styles.priceAmountPro]}>
                {plan.monthlyPrice?.toFixed(2)}
              </Text>
              <Text style={styles.priceCurrency}>zł</Text>
              <Text style={styles.pricePeriod}>/{t('month', { defaultValue: 'msc' })}</Text>
            </View>
          )}

          {/* Yearly note */}
          {plan.yearlyPrice && (
            <Text style={styles.yearlyNote}>
              {t('orYearly', { defaultValue: 'lub' })} {plan.yearlyPrice} zł / {t('twoYears', { defaultValue: '2 lata' })}
            </Text>
          )}

          {/* Divider */}
          <View style={[styles.cardDivider, isPro && { backgroundColor: 'rgba(37,240,200,0.18)' }]} />

          {/* Features */}
          <View style={styles.featuresWrap}>
            {plan.features.map((feat) => (
              <View key={feat.key} style={styles.featureRow}>
                {typeof feat.value === 'boolean' ? (
                  <View style={[styles.featIcon, feat.value && styles.featIconOn]}>
                    <Feather name={feat.value ? 'check' : 'x'} size={10} color={feat.value ? '#0B1120' : 'rgba(255,255,255,0.25)'} />
                  </View>
                ) : (
                  <View style={[styles.featIcon, styles.featIconOn]}>
                    <Feather name="check" size={10} color="#0B1120" />
                  </View>
                )}
                <Text style={[styles.featureText, feat.highlight && styles.featureTextHighlight]} numberOfLines={2}>
                  {typeof feat.value === 'boolean'
                    ? t(feat.labelKey, { defaultValue: feat.key })
                    : `${feat.value} ${t(feat.labelKey, { defaultValue: feat.key })}`
                  }
                </Text>
              </View>
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={[styles.ctaBtn, isCurrent && styles.ctaBtnCurrent, isPro && !isCurrent && styles.ctaBtnPro]}
            onPress={onSelect}
            disabled={isCurrent}
            activeOpacity={0.88}
          >
            <Text style={[styles.ctaBtnText, isCurrent && styles.ctaBtnTextCurrent, isPro && !isCurrent && styles.ctaBtnTextPro]}>
              {isCurrent
                ? t('currentPlanBtn', { defaultValue: 'Aktywny' })
                : isFree
                ? t('downgradBtn', { defaultValue: 'Wybierz' })
                : t('selectBtn', { defaultValue: 'Wybierz' })
              }
            </Text>
          </TouchableOpacity>
        </BlurView>
      </TouchableOpacity>
    </Animated.View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  blackBase: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  glowTop: { position: 'absolute', width: 320, height: 320, borderRadius: 999, backgroundColor: ACCENT, opacity: 0.08, top: -120, right: -100 },
  glowBottom: { position: 'absolute', width: 280, height: 280, borderRadius: 999, backgroundColor: NEON, opacity: 0.04, bottom: 80, left: -120 },

  content: { paddingHorizontal: 14, paddingBottom: 20 },

  backBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },

  header: { alignItems: 'center', marginBottom: 20 },
  eyebrow: { color: NEON, fontSize: 11, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase', opacity: 0.8, marginBottom: 8 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', letterSpacing: -0.3, textAlign: 'center' },
  subtitle: { marginTop: 8, color: 'rgba(255,255,255,0.45)', fontSize: 14, fontWeight: '600', textAlign: 'center' },

  currentBadgeWrap: { alignItems: 'center', marginBottom: 18 },
  currentBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(37,240,200,0.18)', backgroundColor: 'rgba(37,240,200,0.06)', overflow: 'hidden' },
  currentBadgeDot: { width: 7, height: 7, borderRadius: 99, backgroundColor: NEON, shadowColor: NEON, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  currentBadgeText: { color: 'rgba(255,255,255,0.60)', fontSize: 13, fontWeight: '700' },
  currentBadgePlan: { color: NEON, fontWeight: '900' },

  // Plans row
  plansRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  planCardWrap: { flex: 1 },
  planCard: { borderRadius: 22, borderWidth: 1.5, padding: 12, overflow: 'hidden', minHeight: 320 },
  planCardCurrent: { borderColor: NEON, shadowColor: NEON, shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  planCardPro: { shadowColor: NEON, shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 0 } },

  popularBadge: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: 'rgba(25,112,92,0.35)', borderWidth: 1, borderColor: 'rgba(25,112,92,0.6)', marginBottom: 8 },
  popularBadgeText: { color: '#AFFFEE', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },

  planName: { color: 'rgba(255,255,255,0.70)', fontSize: 11, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  planNamePro: { color: NEON },

  priceWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginBottom: 2 },
  priceFree: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  priceAmount: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  priceAmountPro: { color: NEON },
  priceCurrency: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '800', marginBottom: 3 },
  pricePeriod: { color: 'rgba(255,255,255,0.40)', fontSize: 11, fontWeight: '700', marginBottom: 3 },
  yearlyNote: { color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '700', marginTop: 2, marginBottom: 6 },

  cardDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 10 },

  featuresWrap: { gap: 7, marginBottom: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  featIcon: { width: 16, height: 16, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  featIconOn: { backgroundColor: NEON },
  featureText: { color: 'rgba(255,255,255,0.55)', fontSize: 10.5, fontWeight: '700', flex: 1, lineHeight: 14 },
  featureTextHighlight: { color: 'rgba(255,255,255,0.85)', fontWeight: '900' },

  ctaBtn: { borderRadius: 14, paddingVertical: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  ctaBtnCurrent: { backgroundColor: 'rgba(37,240,200,0.08)', borderColor: 'rgba(37,240,200,0.25)' },
  ctaBtnPro: { backgroundColor: 'rgba(37,240,200,0.14)', borderColor: 'rgba(37,240,200,0.40)' },
  ctaBtnText: { color: 'rgba(255,255,255,0.55)', fontSize: 11.5, fontWeight: '900' },
  ctaBtnTextCurrent: { color: NEON },
  ctaBtnTextPro: { color: NEON },

  // Savings note
  savingsNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(37,240,200,0.14)', backgroundColor: 'rgba(37,240,200,0.05)', overflow: 'hidden' },
  savingsText: { color: 'rgba(255,255,255,0.60)', fontSize: 12.5, fontWeight: '700', flex: 1 },
})