import React, { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { Feather } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  SUBSCRIPTION_PLAN_ORDER,
  SUBSCRIPTION_PLANS,
  type SubscriptionPlanKey,
} from '../../../../../src/config/subscriptionPlans'

const NEON = '#25F0C8'
const ACCENT = '#19705C'
const { width: W } = Dimensions.get('window')

const PEEK = 30
const GAP = 12
const CARD_W = W - PEEK * 2 - GAP * 2
const SNAP = CARD_W + GAP

type BillingCycle = 'monthly' | 'yearly'

export default function CheckoutScreen() {
  const router = useRouter()
  const { t } = useTranslation('subscription')
  const { planKey: initialPlanKey } = useLocalSearchParams<{ planKey: SubscriptionPlanKey }>()

  const initIndex = Math.max(
    0,
    SUBSCRIPTION_PLAN_ORDER.indexOf(
      SUBSCRIPTION_PLAN_ORDER.includes(initialPlanKey as SubscriptionPlanKey)
        ? (initialPlanKey as SubscriptionPlanKey)
        : 'standard'
    )
  )

  const [activeIndex, setActiveIndex] = useState(initIndex)
  const [billingPerCard, setBillingPerCard] = useState<Record<SubscriptionPlanKey, BillingCycle>>({
    free: 'monthly',
    standard: 'monthly',
    pro: 'monthly',
  })

  const scrollX = useRef(new Animated.Value(initIndex * SNAP)).current
  const scrollRef = useRef<ScrollView>(null)

  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8

  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ x: initIndex * SNAP, animated: false })
    }, 80)
  }, [])

  const activeKey = SUBSCRIPTION_PLAN_ORDER[activeIndex]
  const isPro = activeKey === 'pro'
  const isFree = activeKey === 'free'

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SNAP)
    setActiveIndex(Math.max(0, Math.min(SUBSCRIPTION_PLAN_ORDER.length - 1, idx)))
  }

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * SNAP, animated: true })
    setActiveIndex(i)
  }

  const handlePurchase = async (key: SubscriptionPlanKey) => {
    if (key === 'free') {
      router.back()
      return
    }

    Alert.alert(
      t('checkout.unavailableTitle'),
      t('checkout.unavailableMessage')
    )
  }

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bg} />
      <View
        pointerEvents="none"
        style={[styles.glow, { backgroundColor: isPro ? NEON : isFree ? '#FFFFFF' : ACCENT }]}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.outer, { paddingTop: topPad }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
          <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.65)" />
        </TouchableOpacity>

        <Text style={styles.screenTitle}>{t('checkout.title')}</Text>
        <Text style={styles.screenSubtitle}>{t('checkout.subtitle')}</Text>

        <View style={styles.dots}>
          {SUBSCRIPTION_PLAN_ORDER.map((key, i) => (
            <TouchableOpacity key={key} onPress={() => goTo(i)} hitSlop={10} activeOpacity={0.7}>
              <View
                style={[
                  styles.dot,
                  i === activeIndex && styles.dotActive,
                  i === activeIndex && {
                    backgroundColor: isPro ? NEON : isFree ? 'rgba(255,255,255,0.65)' : ACCENT,
                  },
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        <Animated.ScrollView
          ref={scrollRef as any}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={SNAP}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          contentContainerStyle={styles.carouselContent}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: scrollX } } }],
            { useNativeDriver: true }
          )}
          onMomentumScrollEnd={onMomentumEnd}
          scrollEventThrottle={16}
        >
          {SUBSCRIPTION_PLAN_ORDER.map((key, index) => {
            const plan = SUBSCRIPTION_PLANS[key]
            const billing = billingPerCard[key]
            const isThisFree = key === 'free'
            const isThisPro = key === 'pro'
            const isThisStandard = key === 'standard'

            const inputRange = [(index - 1) * SNAP, index * SNAP, (index + 1) * SNAP]
            const scale = scrollX.interpolate({ inputRange, outputRange: [0.93, 1.0, 0.93], extrapolate: 'clamp' })
            const opacity = scrollX.interpolate({ inputRange, outputRange: [0.50, 1.0, 0.50], extrapolate: 'clamp' })

            const borderColor = isThisPro
              ? 'rgba(37,240,200,0.38)'
              : isThisStandard
              ? 'rgba(25,112,92,0.38)'
              : 'rgba(255,255,255,0.10)'

            const topLineColor = isThisPro ? NEON : isThisStandard ? ACCENT : 'rgba(255,255,255,0.30)'
            const nameColor = isThisPro ? NEON : isThisStandard ? '#FFFFFF' : 'rgba(255,255,255,0.55)'
            const checkColor = isThisPro ? NEON : ACCENT

            const monthlyPrice = plan.monthlyPrice
            const yearlyPrice = plan.yearlyPrice
            const yearlyMonthly =
              !isThisFree && monthlyPrice !== null && yearlyPrice !== null
                ? yearlyPrice / 24
                : null
            const displayPrice = billing === 'monthly' ? monthlyPrice : yearlyPrice
            return (
              <Animated.View
                key={key}
                style={[styles.cardWrap, { width: CARD_W, transform: [{ scale }], opacity }]}
              >
                <BlurView intensity={18} tint="dark" style={[styles.card, { borderColor }]}>
                  <View style={[styles.cardLine, { backgroundColor: topLineColor }]} />

                  <View style={styles.badgeRow}>
                    {isThisPro && (
                      <View style={[styles.badge, styles.badgePro]}>
                        <Text style={[styles.badgeText, { color: NEON }]}>
                          {t('plans.pro.badge')}
                        </Text>
                      </View>
                    )}
                    {isThisStandard && (
                      <View style={[styles.badge, styles.badgeStandard]}>
                        <Text style={[styles.badgeText, { color: ACCENT }]}>
                          {t('plans.standard.badge')}
                        </Text>
                      </View>
                    )}
                  </View>

                  <Text style={[styles.cardName, { color: nameColor }]}>
                    {t(plan.nameKey)}
                  </Text>

                  <View style={styles.features}>
                    <View style={styles.featRow}>
                      <Text style={styles.featLabel}>{t('features.photosLabel')}</Text>
                      <Text style={[styles.featValue, isThisFree && styles.featValueMuted]}>
                        {plan.features.photos === 'unlimited'
                          ? t('features.photosUnlimited')
                          : t(`features.photos${plan.features.photos}`)}
                      </Text>
                    </View>

                    <View style={styles.featRow}>
                      <Text style={styles.featLabel}>{t('features.docsLabel')}</Text>
                      <Text style={[styles.featValue, isThisFree && styles.featValueMuted]}>
                        {plan.features.docs === 'unlimited'
                          ? t('features.docsUnlimited')
                          : t(`features.docs${plan.features.docs}`)}
                      </Text>
                    </View>

                    <View style={styles.featRow}>
                      <Text style={styles.featLabel}>{t('features.tasksLabel')}</Text>
                      <Text style={[styles.featValue, isThisFree && styles.featValueMuted]}>
                        {plan.features.tasks === 'unlimited'
                          ? t('features.tasksUnlimited')
                          : t(`features.tasks${plan.features.tasks}`)}
                      </Text>
                    </View>

                    <View style={styles.featRow}>
                      <Text style={styles.featLabel}>{t('features.model3dLabel')}</Text>
                      <View style={styles.featBoolWrap}>
                        <Feather
                          name={plan.features.model3d ? 'check' : 'x'}
                          size={13}
                          color={plan.features.model3d ? checkColor : 'rgba(255,255,255,0.22)'}
                        />
                        <Text style={[styles.featBool, !plan.features.model3d && styles.featBoolOff]}>
                          {plan.features.model3d ? t('yes') : t('no')}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.featRow, { borderBottomWidth: 0 }]}>
                      <Text style={styles.featLabel}>{t('features.aiLabel')}</Text>
                      <View style={styles.featBoolWrap}>
                        <Feather
                          name={plan.features.ai ? 'check' : 'x'}
                          size={13}
                          color={plan.features.ai ? (isThisPro ? NEON : checkColor) : 'rgba(255,255,255,0.22)'}
                        />
                        <Text style={[styles.featBool, !plan.features.ai && styles.featBoolOff]}>
                          {plan.features.ai ? t('yes') : t('no')}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.priceSection}>
                    {isThisFree ? (
                      <>
                        <Text style={styles.priceFree}>{t('free')}</Text>
                        <Text style={styles.priceFreeSub}>{t('plans.free.forever')}</Text>
                      </>
                    ) : (
                      <>
                        <View style={styles.priceRow}>
                          <Text style={[styles.priceAmount, isThisPro && { color: NEON }]}>
                            {billing === 'monthly'
                              ? `${displayPrice?.toFixed(2)} ${t('currency')}`
                              : `${displayPrice} ${t('currency')}`
                            }
                          </Text>
                          <Text style={styles.pricePeriod}>
                            {billing === 'monthly'
                              ? `/ ${t('month')}`
                              : `/ ${t('twoYears')}`
                            }
                          </Text>
                        </View>

                        {billing === 'yearly' && yearlyMonthly !== null && (
                          <Text style={styles.priceEquiv}>
                            {t('priceEquiv', { amount: yearlyMonthly.toFixed(2) })}
                          </Text>
                        )}

                        <View style={styles.billingRow}>
                          <TouchableOpacity
                            onPress={() => setBillingPerCard((p) => ({ ...p, [key]: 'monthly' }))}
                            style={[styles.billingPill, billing === 'monthly' && styles.billingPillActive]}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.billingText, billing === 'monthly' && styles.billingTextActive]}>
                              {t('billingMonthly')}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setBillingPerCard((p) => ({ ...p, [key]: 'yearly' }))}
                            style={[styles.billingPill, billing === 'yearly' && styles.billingPillActive]}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.billingText, billing === 'yearly' && styles.billingTextActive]}>
                              {t('billingYearly')}
                            </Text>
                            <View style={styles.savePill}>
                              <Text style={styles.savePillText}>-40%</Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.selectBtn,
                      isThisPro && styles.selectBtnPro,
                      isThisFree && styles.selectBtnFree,
                    ]}
                    onPress={() => handlePurchase(key)}
                    activeOpacity={0.88}
                  >
                    <Text style={[
                      styles.selectBtnText,
                      isThisPro && styles.selectBtnTextPro,
                      isThisFree && styles.selectBtnTextFree,
                    ]}>
                      {isThisFree
                        ? t('checkout.freeCta')
                        : t('checkout.selectBtn')}
                    </Text>
                  </TouchableOpacity>
                </BlurView>
              </Animated.View>
            )
          })}
        </Animated.ScrollView>

        <View style={styles.securityRow}>
          <Feather name="info" size={12} color="rgba(255,255,255,0.25)" />
          <Text style={styles.securityText}>{t('checkout.notice')}</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  glow: {
    position: 'absolute', width: 280, height: 280,
    borderRadius: 999, opacity: 0.05, top: -60, right: -80,
  },

  outer: { paddingHorizontal: 20 },

  backBtn: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },

  screenTitle: {
    color: NEON,
    fontSize: 26, fontWeight: '900', letterSpacing: -0.2,
    textAlign: 'center', marginBottom: 8,
    textShadowColor: 'rgba(37,240,200,0.18)', textShadowRadius: 16,
  },
  screenSubtitle: {
    color: 'rgba(255,255,255,0.38)', fontSize: 13,
    fontWeight: '600', textAlign: 'center', marginBottom: 16,
  },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  dot: { width: 7, height: 7, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.16)' },
  dotActive: { width: 24, borderRadius: 99 },

  carouselContent: { paddingLeft: PEEK, paddingRight: PEEK, paddingBottom: 8 },

  cardWrap: { marginRight: GAP },
  card: {
    borderRadius: 26, borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.028)',
    overflow: 'hidden', padding: 22, paddingBottom: 26,
  },
  cardLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, opacity: 0.75 },

  badgeRow: { alignItems: 'center', marginBottom: 8, minHeight: 26 },
  badge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1,
  },
  badgePro: { backgroundColor: 'rgba(37,240,200,0.10)', borderColor: 'rgba(37,240,200,0.28)' },
  badgeStandard: { backgroundColor: 'rgba(25,112,92,0.10)', borderColor: 'rgba(25,112,92,0.28)' },
  badgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },

  cardName: {
    fontSize: 22, fontWeight: '900', letterSpacing: -0.2,
    textAlign: 'center', marginBottom: 18,
  },

  features: {
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(255,255,255,0.02)', overflow: 'hidden', marginBottom: 18,
  },
  featRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  featLabel: {
    color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '700', flex: 1,
  },
  featValue: {
    color: '#FFFFFF', fontSize: 12, fontWeight: '800',
    textAlign: 'right', flex: 1,
  },
  featValueMuted: { color: 'rgba(255,255,255,0.45)' },
  featBoolWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  featBool: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  featBoolOff: { color: 'rgba(255,255,255,0.30)' },

  priceSection: { marginBottom: 16 },

  priceFree: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', textAlign: 'center' },
  priceFreeSub: {
    color: 'rgba(255,255,255,0.35)', fontSize: 12,
    fontWeight: '700', textAlign: 'center', marginTop: 2, marginBottom: 12,
  },

  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 2, justifyContent: 'center' },
  priceAmount: { color: '#FFFFFF', fontSize: 36, fontWeight: '900', letterSpacing: -0.8 },
  pricePeriod: { color: 'rgba(255,255,255,0.35)', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  priceEquiv: { color: 'rgba(255,255,255,0.32)', fontSize: 12, fontWeight: '700', marginBottom: 6, textAlign: 'center' },

  savingsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'center',
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, marginBottom: 10,
    backgroundColor: 'rgba(37,240,200,0.08)', borderWidth: 1, borderColor: 'rgba(37,240,200,0.18)',
  },
  savingsText: { color: NEON, fontSize: 11, fontWeight: '800' },

  billingRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  billingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, flex: 1, justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  billingPillActive: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  billingText: { color: 'rgba(255,255,255,0.38)', fontSize: 12, fontWeight: '800' },
  billingTextActive: { color: '#FFFFFF' },
  savePill: {
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6,
    backgroundColor: 'rgba(37,240,200,0.18)',
  },
  savePillText: { color: NEON, fontSize: 9, fontWeight: '900' },

  selectBtn: {
    borderRadius: 18, paddingVertical: 14, alignItems: 'center',
    backgroundColor: 'rgba(37,240,200,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(37,240,200,0.35)',
    marginTop: 4,
  },
  selectBtnPro: { backgroundColor: NEON, borderColor: NEON },
  selectBtnFree: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  selectBtnText: { color: NEON, fontSize: 15, fontWeight: '900' },
  selectBtnTextPro: { color: '#0B1120' },
  selectBtnTextFree: { color: 'rgba(255,255,255,0.45)', fontSize: 14 },

  securityRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, marginTop: 18,
  },
  securityText: { color: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: '700' },
})
