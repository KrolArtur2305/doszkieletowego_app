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

const NEON = '#25F0C8'
const ACCENT = '#19705C'
const { width: W } = Dimensions.get('window')

const PEEK = 30
const GAP = 12
const CARD_W = W - PEEK * 2 - GAP * 2
const SNAP = CARD_W + GAP

type BillingCycle = 'monthly' | 'yearly'
type PlanKey = 'free' | 'standard' | 'pro'
const PLAN_KEYS: PlanKey[] = ['free', 'standard', 'pro']

// ─── All user-visible strings go through t() ──────────────────────────────────
// defaultValue is the Polish fallback so the app works even without translation files

export default function CheckoutScreen() {
  const router = useRouter()
  const { t } = useTranslation('subscription')
  const { planKey: initialPlanKey } = useLocalSearchParams<{ planKey: PlanKey }>()

  const initIndex = Math.max(
    0,
    PLAN_KEYS.indexOf(PLAN_KEYS.includes(initialPlanKey as PlanKey) ? (initialPlanKey as PlanKey) : 'standard')
  )

  const [activeIndex, setActiveIndex] = useState(initIndex)
  // Each card has its own billing cycle state
  const [billingPerCard, setBillingPerCard] = useState<Record<PlanKey, BillingCycle>>({
    free: 'monthly',
    standard: 'monthly',
    pro: 'monthly',
  })
  const [processing, setProcessing] = useState(false)

  const scrollX = useRef(new Animated.Value(initIndex * SNAP)).current
  const scrollRef = useRef<ScrollView>(null)

  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8

  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ x: initIndex * SNAP, animated: false })
    }, 80)
  }, [])

  const activeKey = PLAN_KEYS[activeIndex]
  const isPro = activeKey === 'pro'
  const isFree = activeKey === 'free'

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SNAP)
    setActiveIndex(Math.max(0, Math.min(PLAN_KEYS.length - 1, idx)))
  }

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * SNAP, animated: true })
    setActiveIndex(i)
  }

  const handlePurchase = async (key: PlanKey) => {
    if (key === 'free') { router.back(); return }
    // TODO: Stripe / Przelewy24
    // 1. POST backend → create payment session
    // 2. Linking.openURL(session.paymentUrl)
    // 3. Webhook → activate plan in profiles.plan
    setProcessing(true)
    try {
      await new Promise((r) => setTimeout(r, 1200))
      Alert.alert(
        t('checkout.successTitle', { defaultValue: 'Dziękujemy!' }),
        t('checkout.successMessage', { defaultValue: 'Plan zostanie aktywowany po potwierdzeniu płatności.' }),
        [{ text: 'OK', onPress: () => router.back() }]
      )
    } finally {
      setProcessing(false)
    }
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
        {/* Back */}
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
          <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.65)" />
        </TouchableOpacity>

        {/* Title — green like other screens */}
        <Text style={styles.screenTitle}>
          {t('checkout.title', { defaultValue: 'Twój plan subskrypcyjny' })}
        </Text>
        <Text style={styles.screenSubtitle}>
          {t('checkout.subtitle', { defaultValue: 'Przesuń aby porównać plany' })}
        </Text>

        {/* Dot indicators */}
        <View style={styles.dots}>
          {PLAN_KEYS.map((k, i) => (
            <TouchableOpacity key={k} onPress={() => goTo(i)} hitSlop={10} activeOpacity={0.7}>
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

        {/* ── CAROUSEL ── */}
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
          {PLAN_KEYS.map((key, index) => {
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

            // Prices — Standard: 19,99 zł/msc → 399 zł/2 lata (≈ 16,63 zł/msc, oszczędność ~81 zł)
            //          Pro:      34,99 zł/msc → 699 zł/2 lata (≈ 29,13 zł/msc, oszczędność ~141 zł)
            const monthlyPrice = isThisFree ? null : isThisStandard ? 19.99 : 34.99
            const yearlyPrice  = isThisFree ? null : isThisStandard ? 399   : 699
            const yearlyMonthly = isThisFree ? null : isThisStandard ? 16.63 : 29.13
            const displayPrice = billing === 'monthly' ? monthlyPrice : yearlyPrice
            const savings = !isThisFree && billing === 'yearly'
              ? Math.round((monthlyPrice! * 24) - yearlyPrice!)
              : null

            return (
              <Animated.View
                key={key}
                style={[styles.cardWrap, { width: CARD_W, transform: [{ scale }], opacity }]}
              >
                <BlurView intensity={18} tint="dark" style={[styles.card, { borderColor }]}>
                  {/* Top accent line */}
                  <View style={[styles.cardLine, { backgroundColor: topLineColor }]} />

                  {/* Badge row */}
                  <View style={styles.badgeRow}>
                    {isThisPro && (
                      <View style={[styles.badge, styles.badgePro]}>
                        <Text style={[styles.badgeText, { color: NEON }]}>
                          {t('plans.pro.badge', { defaultValue: 'PRO' })}
                        </Text>
                      </View>
                    )}
                    {isThisStandard && (
                      <View style={[styles.badge, styles.badgeStandard]}>
                        <Text style={[styles.badgeText, { color: ACCENT }]}>
                          {t('plans.standard.badge', { defaultValue: 'POPULARNY' })}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Plan name — centered, same size for all */}
                  <Text style={[styles.cardName, { color: nameColor }]}>
                    {t(`plans.${key}.name`, { defaultValue: key.toUpperCase() })}
                  </Text>

                  {/* ── FEATURES — exact schema ── */}
                  <View style={styles.features}>

                    {/* Zdjęcia */}
                    <View style={styles.featRow}>
                      <Text style={styles.featLabel}>{t('features.photosLabel', { defaultValue: 'Zdjęcia' })}</Text>
                      <Text style={[styles.featValue, isThisFree && styles.featValueMuted]}>
                        {isThisFree
                          ? t('features.photos20', { defaultValue: 'do 20 zdjęć' })
                          : isThisStandard
                          ? t('features.photos50', { defaultValue: 'do 50 zdjęć' })
                          : t('features.photosUnlimited', { defaultValue: 'bez limitu' })
                        }
                      </Text>
                    </View>

                    {/* Dokumenty */}
                    <View style={styles.featRow}>
                      <Text style={styles.featLabel}>{t('features.docsLabel', { defaultValue: 'Dokumenty' })}</Text>
                      <Text style={[styles.featValue, isThisFree && styles.featValueMuted]}>
                        {isThisFree
                          ? t('features.docs5', { defaultValue: 'do 5 dokumentów' })
                          : isThisStandard
                          ? t('features.docs15', { defaultValue: 'do 15 dokumentów' })
                          : t('features.docsUnlimited', { defaultValue: 'bez limitu' })
                        }
                      </Text>
                    </View>

                    {/* Zadania */}
                    <View style={styles.featRow}>
                      <Text style={styles.featLabel}>{t('features.tasksLabel', { defaultValue: 'Zadania' })}</Text>
                      <Text style={[styles.featValue, isThisFree && styles.featValueMuted]}>
                        {isThisFree
                          ? t('features.tasks15', { defaultValue: 'do 15 zadań' })
                          : isThisStandard
                          ? t('features.tasks50', { defaultValue: 'do 50 zadań' })
                          : t('features.tasksUnlimited', { defaultValue: 'bez limitu' })
                        }
                      </Text>
                    </View>

                    {/* Model 3D */}
                    <View style={styles.featRow}>
                      <Text style={styles.featLabel}>{t('features.model3dLabel', { defaultValue: 'Model 3D' })}</Text>
                      <View style={styles.featBoolWrap}>
                        <Feather
                          name={isThisFree ? 'x' : 'check'}
                          size={13}
                          color={isThisFree ? 'rgba(255,255,255,0.22)' : checkColor}
                        />
                        <Text style={[styles.featBool, isThisFree && styles.featBoolOff]}>
                          {isThisFree
                            ? t('no', { defaultValue: 'Nie' })
                            : t('yes', { defaultValue: 'Tak' })
                          }
                        </Text>
                      </View>
                    </View>

                    {/* Asystent AI */}
                    <View style={[styles.featRow, { borderBottomWidth: 0 }]}>
                      <Text style={styles.featLabel}>{t('features.aiLabel', { defaultValue: 'Asystent AI' })}</Text>
                      <View style={styles.featBoolWrap}>
                        <Feather
                          name={isThisPro ? 'check' : 'x'}
                          size={13}
                          color={isThisPro ? NEON : 'rgba(255,255,255,0.22)'}
                        />
                        <Text style={[styles.featBool, !isThisPro && styles.featBoolOff]}>
                          {isThisPro
                            ? t('yes', { defaultValue: 'Tak' })
                            : t('no', { defaultValue: 'Nie' })
                          }
                        </Text>
                      </View>
                    </View>

                  </View>

                  {/* ── PRICE ── */}
                  <View style={styles.priceSection}>
                    {isThisFree ? (
                      <>
                        <Text style={styles.priceFree}>{t('free', { defaultValue: 'Bezpłatny' })}</Text>
                        <Text style={styles.priceFreeSub}>{t('plans.free.forever', { defaultValue: 'na zawsze' })}</Text>
                      </>
                    ) : (
                      <>
                        {/* Price display */}
                        <View style={styles.priceRow}>
                          <Text style={[styles.priceAmount, isThisPro && { color: NEON }]}>
                            {billing === 'monthly'
                              ? `${displayPrice?.toFixed(2)} zł`
                              : `${displayPrice} zł`
                            }
                          </Text>
                          <Text style={styles.pricePeriod}>
                            {billing === 'monthly'
                              ? `/ ${t('month', { defaultValue: 'msc' })}`
                              : `/ ${t('twoYears', { defaultValue: '2 lata' })}`
                            }
                          </Text>
                        </View>

                        {billing === 'yearly' && (
                          <Text style={styles.priceEquiv}>
                            {t('priceEquiv', {
                              defaultValue: `≈ ${yearlyMonthly?.toFixed(2)} zł/msc`,
                              amount: yearlyMonthly?.toFixed(2),
                            })}
                          </Text>
                        )}

                        {savings != null && (
                          <View style={styles.savingsBadge}>
                            <Feather name="tag" size={11} color={NEON} />
                            <Text style={styles.savingsText}>
                              {t('checkout.savingsNote', {
                                defaultValue: `Oszczędzasz ${savings} zł`,
                                amount: savings,
                              })}
                            </Text>
                          </View>
                        )}

                        {/* ── BILLING TOGGLE ── */}
                        <View style={styles.billingRow}>
                          <TouchableOpacity
                            onPress={() => setBillingPerCard((p) => ({ ...p, [key]: 'monthly' }))}
                            style={[styles.billingPill, billing === 'monthly' && styles.billingPillActive]}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.billingText, billing === 'monthly' && styles.billingTextActive]}>
                              {t('billingMonthly', { defaultValue: 'Miesięcznie' })}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setBillingPerCard((p) => ({ ...p, [key]: 'yearly' }))}
                            style={[styles.billingPill, billing === 'yearly' && styles.billingPillActive]}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.billingText, billing === 'yearly' && styles.billingTextActive]}>
                              {t('billingYearly', { defaultValue: '2 lata' })}
                            </Text>
                            <View style={styles.savePill}>
                              <Text style={styles.savePillText}>-40%</Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>

                  {/* ── SELECT BUTTON ── */}
                  <TouchableOpacity
                    style={[
                      styles.selectBtn,
                      isThisPro && styles.selectBtnPro,
                      isThisFree && styles.selectBtnFree,
                      processing && { opacity: 0.65 },
                    ]}
                    onPress={() => handlePurchase(key)}
                    disabled={processing}
                    activeOpacity={0.88}
                  >
                    <Text style={[
                      styles.selectBtnText,
                      isThisPro && styles.selectBtnTextPro,
                      isThisFree && styles.selectBtnTextFree,
                    ]}>
                      {isThisFree
                        ? t('checkout.freeCta', { defaultValue: 'Wybierz darmowy' })
                        : processing
                        ? t('checkout.processing', { defaultValue: 'Przetwarzanie...' })
                        : t('checkout.selectBtn', { defaultValue: 'Wybierz plan' })
                      }
                    </Text>
                  </TouchableOpacity>

                </BlurView>
              </Animated.View>
            )
          })}
        </Animated.ScrollView>

        {/* Security note */}
        <View style={styles.securityRow}>
          <Feather name="shield" size={12} color="rgba(255,255,255,0.25)" />
          <Text style={styles.securityText}>
            {t('checkout.security', { defaultValue: 'Bezpieczna płatność • Anuluj w dowolnym momencie' })}
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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

  // Title — same green as other screens, bigger
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

  // ── Carousel ──
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

  // Name — centered, same fontSize for all 3
  cardName: {
    fontSize: 22, fontWeight: '900', letterSpacing: -0.2,
    textAlign: 'center', marginBottom: 18,
  },

  // ── Features table ──
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

  // ── Price section ──
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

  // Billing toggle
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

  // Select button
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

  // Bottom
  securityRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, marginTop: 18,
  },
  securityText: { color: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: '700' },
})