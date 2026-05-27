import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
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
import type { PurchasesPackage } from 'react-native-purchases'
import { useSubscription } from '../../../../../hooks/useSubscription'
import type { SubscriptionPlanKey } from '../../../../../src/config/subscriptionPlans'
import { isSubscriptionUiReadOnly } from '../../../../../src/services/subscription/launchMode'
import { purchasePackageSafe, restorePurchasesSafe } from '../../../../../src/services/subscription/revenuecat'

const NEON = '#25F0C8'
const ACCENT = '#19705C'
const INK = '#07120F'
const TERMS_URL = 'https://www.mybuildiq.com/terms'
const PRIVACY_URL = 'https://www.mybuildiq.com/privacy'

type BillingCycle = 'monthly' | 'yearly'
type PaywallPlanKey = 'pro' | 'expert'
type RevenueCatPlanKey = PaywallPlanKey

const PAYWALL_PLAN_KEYS: PaywallPlanKey[] = ['pro', 'expert']
function expectedProductId(planKey: RevenueCatPlanKey, billing: BillingCycle): string {
  return `buildiq_${planKey}_${billing}`
}

function packageMatchesPlan(pkg: PurchasesPackage, planKey: RevenueCatPlanKey): boolean {
  const productId = pkg.product.identifier.toLowerCase()
  const packageId = pkg.identifier.toLowerCase()
  return productId.includes(planKey) || packageId.includes(planKey)
}

function packageMatchesBilling(pkg: PurchasesPackage, billing: BillingCycle): boolean {
  const packageType = String(pkg.packageType ?? '').toLowerCase()
  const productId = pkg.product.identifier.toLowerCase()
  const packageId = pkg.identifier.toLowerCase()

  if (billing === 'monthly') {
    return packageType.includes('month') || productId.includes('month') || packageId.includes('month')
  }

  return (
    packageType.includes('annual') ||
    packageType.includes('year') ||
    productId.includes('annual') ||
    productId.includes('year') ||
    packageId.includes('annual') ||
    packageId.includes('year')
  )
}

function findPackage(
  packages: PurchasesPackage[],
  planKey: RevenueCatPlanKey,
  billing: BillingCycle,
): PurchasesPackage | null {
  return (
    packages.find((pkg) => pkg.product.identifier.toLowerCase() === expectedProductId(planKey, billing)) ??
    packages.find((pkg) => packageMatchesPlan(pkg, planKey) && packageMatchesBilling(pkg, billing)) ??
    packages.find((pkg) => packageMatchesPlan(pkg, planKey)) ??
    null
  )
}

function getTrialDaysRemaining(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null
  const end = new Date(trialEndsAt).getTime()
  if (!Number.isFinite(end)) return null
  return Math.max(0, Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24)))
}

export default function CheckoutScreen() {
  const router = useRouter()
  const { t } = useTranslation('subscription')
  const { planKey } = useLocalSearchParams<{ planKey?: SubscriptionPlanKey }>()
  const subscriptionUiReadOnly = isSubscriptionUiReadOnly()
  const { access, offerings, refresh, loading, error } = useSubscription()

  const initialPlan: PaywallPlanKey =
    planKey === 'expert' ? 'expert' : 'pro'
  const [selectedPlan, setSelectedPlan] = useState<PaywallPlanKey>(initialPlan)
  const [billing, setBilling] = useState<BillingCycle>('monthly')
  const [purchasing, setPurchasing] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const introAnim = useRef(new Animated.Value(0)).current

  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8
  const bottomPad = Platform.OS === 'ios' ? 18 : 12
  const trialDaysRemaining = getTrialDaysRemaining(access.trialEndsAt)

  const availablePackages = useMemo(
    () => offerings?.current?.availablePackages ?? [],
    [offerings]
  )
  const productsUnavailable = !loading && availablePackages.length === 0

  useEffect(() => {
    Animated.timing(introAnim, {
      toValue: 1,
      duration: 420,
      useNativeDriver: true,
    }).start()
  }, [introAnim])

  const getPlanPrice = (key: PaywallPlanKey) => {
    const pkg = findPackage(availablePackages, key as RevenueCatPlanKey, billing)
    return pkg?.product.priceString ?? t('paywall.priceInStore')
  }

  const getPlanPeriod = () => (billing === 'monthly' ? t('month') : t('billingYearly'))

  const handleContinue = async () => {
    if (purchasing) return

    if (subscriptionUiReadOnly) {
      Alert.alert(t('paywall.devAlertTitle'), t('paywall.devAlertMessage'))
      return
    }

    const selectedPackage = findPackage(availablePackages, selectedPlan, billing)

    if (!selectedPackage) {
      Alert.alert(
        t('paywall.purchaseUnavailableTitle', { defaultValue: 'Plan niedostepny' }),
        t('paywall.purchaseUnavailableMessage', { defaultValue: 'Nie udalo sie pobrac produktu z App Store. Sprobuj ponownie za chwile.' })
      )
      return
    }

    setPurchasing(true)
    try {
      const result = await purchasePackageSafe(selectedPackage)

      if (result.cancelled) return

      await refresh()

      if (result.customerInfo) {
        Alert.alert(
          t('checkout.successTitle'),
          t('checkout.successMessage')
        )
      } else {
        Alert.alert(
          t('paywall.purchaseErrorTitle', { defaultValue: 'Platnosc nieudana' }),
          t('paywall.purchaseErrorMessage', { defaultValue: 'Nie udalo sie dokonczyc zakupu. Sprobuj ponownie.' })
        )
      }
    } finally {
      setPurchasing(false)
    }
  }

  const handleRestore = async () => {
    setRestoring(true)
    try {
      const restored = await restorePurchasesSafe()
      await refresh()
      Alert.alert(
        t('paywall.restoreTitle'),
        restored ? t('paywall.restoreSuccess') : t('paywall.restoreEmpty')
      )
    } catch {
      Alert.alert(t('paywall.restoreTitle'), t('paywall.restoreError'))
    } finally {
      setRestoring(false)
    }
  }

  const openLegalUrl = (url: string) => {
    Linking.openURL(url).catch(() => undefined)
  }

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bg} />
      <View pointerEvents="none" style={styles.lineTop} />
      <View pointerEvents="none" style={styles.lineMid} />
      <View pointerEvents="none" style={styles.glowTop} />
      <View pointerEvents="none" style={styles.glowSide} />

      <View style={[styles.content, { paddingTop: topPad, paddingBottom: bottomPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
          <Feather name="arrow-left" size={19} color="rgba(255,255,255,0.70)" />
        </TouchableOpacity>

        <Animated.View
          style={[
            styles.hero,
            {
              opacity: introAnim,
              transform: [
                {
                  translateY: introAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.logoMark}>
            <Image
              source={require('../../../../../assets/logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brand}>{t('paywall.logo')}</Text>
          <Text style={styles.subtitle}>{t('paywall.manageSubtitle')}</Text>

          {access.isTrialActive && trialDaysRemaining !== null && (
            <BlurView intensity={12} tint="dark" style={styles.trialStatus}>
              <View style={styles.statusDot} />
              <Text style={styles.trialStatusText}>
                {t('paywall.trialDaysRemaining', { count: trialDaysRemaining })}
              </Text>
            </BlurView>
          )}
        </Animated.View>

        <View style={styles.billingSwitch}>
          {(['monthly', 'yearly'] as BillingCycle[]).map((cycle) => {
            const active = billing === cycle
            return (
              <TouchableOpacity
                key={cycle}
                onPress={() => setBilling(cycle)}
                style={[styles.billingOption, active && styles.billingOptionActive]}
                activeOpacity={0.9}
              >
                <Text style={[styles.billingText, active && styles.billingTextActive]}>
                  {cycle === 'monthly' ? t('paywall.monthly') : t('paywall.yearly')}
                </Text>
                {cycle === 'yearly' && (
                  <View style={styles.saveBadge}>
                    <Text style={styles.saveBadgeText}>{t('paywall.saveMore')}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
        </View>

        {productsUnavailable ? (
          <Text style={styles.storeErrorText}>
            {error
              ? t('paywall.productsErrorWithReason', {
                  defaultValue: 'Nie udało się pobrać cen z App Store: {{reason}}',
                  reason: error,
                })
              : t('paywall.productsError', {
                  defaultValue: 'Nie udało się pobrać cen z App Store. Plany nadal są widoczne, spróbuj ponownie za chwilę.',
                })}
          </Text>
        ) : null}

        <View style={styles.cardsRow}>
          {PAYWALL_PLAN_KEYS.map((key) => {
            const isSelected = selectedPlan === key
            const isPro = key === 'pro'
            const isExpert = key === 'expert'
            const details = t(`paywall.plans.${key}.details`, { returnObjects: true }) as string[]
            const isAvailable = !!findPackage(availablePackages, key, billing)

            return (
              <TouchableOpacity
                key={key}
                onPress={() => setSelectedPlan(key)}
                disabled={!isAvailable}
                activeOpacity={0.92}
                style={[styles.cardWrap, !isAvailable && styles.cardWrapDisabled]}
              >
                <BlurView
                  intensity={isSelected ? 24 : 16}
                  tint="dark"
                  style={[
                    styles.planCard,
                    isSelected && styles.planCardActive,
                    isPro && styles.planCardPro,
                    isSelected && isPro && styles.planCardProActive,
                    !isAvailable && styles.planCardDisabled,
                  ]}
                >
                  <View style={styles.cardTop}>
                    <Text
                      style={[
                        styles.planName,
                        isPro && styles.planNamePro,
                        isExpert && styles.planNameExpert,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {t(`paywall.plans.${key}.name`)}
                    </Text>
                    {!!t(`paywall.plans.${key}.badge`) && (
                      <View style={[styles.badge, isPro && styles.badgePro]}>
                        <Text style={styles.badgeText} numberOfLines={1} adjustsFontSizeToFit>
                          {t(`paywall.plans.${key}.badge`)}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.details}>
                    {details.slice(0, 4).map((item) => (
                      <View key={item} style={styles.detailRow}>
                        <Feather name="check" size={11} color={isPro || isExpert ? NEON : ACCENT} />
                        <Text style={styles.detailText} numberOfLines={2}>
                          {item}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.priceBlock}>
                    <View style={styles.priceRow}>
                      <Text style={[styles.price, isPro && styles.pricePro]} numberOfLines={1} adjustsFontSizeToFit>
                        {getPlanPrice(key)}
                      </Text>
                      <Text style={styles.periodText} numberOfLines={1}>
                        / {getPlanPeriod()}
                      </Text>
                    </View>
                  </View>
                </BlurView>
              </TouchableOpacity>
            )
          })}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={handleContinue}
            activeOpacity={0.92}
            disabled={purchasing}
          >
            <View pointerEvents="none" style={styles.continueGlowLeft} />
            <View pointerEvents="none" style={styles.continueGlowRight} />
            <View pointerEvents="none" style={styles.continueSheen} />
            <Text style={styles.continueText}>{t('paywall.continue')}</Text>
            <Feather name="arrow-right" size={18} color={INK} style={styles.continueIcon} />
          </TouchableOpacity>
          <Text style={styles.renewText}>{t('paywall.autoRenew')}</Text>

          <View style={styles.links}>
            <TouchableOpacity onPress={handleRestore} disabled={restoring} activeOpacity={0.78}>
              {restoring ? (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.62)" />
              ) : (
                <Text style={styles.linkText}>{t('paywall.restore')}</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.linkSep}>|</Text>
            <TouchableOpacity onPress={() => openLegalUrl(TERMS_URL)} activeOpacity={0.78}>
              <Text style={styles.linkText}>{t('paywall.terms')}</Text>
            </TouchableOpacity>
            <Text style={styles.linkSep}>|</Text>
            <TouchableOpacity onPress={() => openLegalUrl(PRIVACY_URL)} activeOpacity={0.78}>
              <Text style={styles.linkText}>{t('paywall.privacy')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  lineTop: {
    position: 'absolute',
    left: -20,
    right: -20,
    top: 116,
    height: 1,
    backgroundColor: 'rgba(37,240,200,0.055)',
    transform: [{ rotate: '-6deg' }],
  },
  lineMid: {
    position: 'absolute',
    left: 26,
    right: 26,
    top: 338,
    height: 1,
    backgroundColor: 'rgba(25,112,92,0.13)',
  },
  glowTop: {
    position: 'absolute',
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: NEON,
    opacity: 0.04,
    top: -230,
    alignSelf: 'center',
  },
  glowSide: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: ACCENT,
    opacity: 0.055,
    top: 270,
    right: -200,
  },
  content: { flex: 1, paddingHorizontal: 14 },
  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 8 : 18,
    left: 14,
    zIndex: 2,
    width: 38,
    height: 38,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: { alignItems: 'center', paddingTop: 2, paddingBottom: 14 },
  logoMark: {
    width: 118,
    height: 86,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logoImage: { width: 112, height: 82 },
  brand: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 350,
  },
  trialStatus: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
    backgroundColor: 'rgba(37,240,200,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: NEON },
  trialStatusText: { color: 'rgba(255,255,255,0.74)', fontSize: 11, fontWeight: '900' },
  billingSwitch: {
    flexDirection: 'row',
    alignSelf: 'center',
    width: '86%',
    padding: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1.6,
    borderColor: 'rgba(37,240,200,0.28)',
    marginBottom: 12,
  },
  billingOption: {
    flex: 1,
    minHeight: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  billingOptionActive: {
    backgroundColor: 'rgba(37,240,200,0.14)',
    borderWidth: 1.4,
    borderColor: 'rgba(37,240,200,0.48)',
    shadowColor: NEON,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  billingText: { color: 'rgba(255,255,255,0.48)', fontSize: 12.5, fontWeight: '900' },
  billingTextActive: { color: '#FFFFFF' },
  saveBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.12)',
  },
  saveBadgeText: { color: NEON, fontSize: 8.5, fontWeight: '900' },
  storeErrorText: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: -6,
    marginBottom: 7,
    paddingHorizontal: 12,
  },
  cardsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    flex: 1,
    minHeight: 292,
    maxHeight: 340,
    marginBottom: 10,
  },
  cardWrap: { flex: 1, alignSelf: 'stretch' },
  cardWrapPro: { flex: 1, alignSelf: 'stretch' },
  cardWrapDisabled: { opacity: 0.52 },
  planCard: {
    flex: 1,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.105)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 18,
    overflow: 'hidden',
  },
  planCardActive: {
    borderWidth: 1.4,
    borderColor: 'rgba(37,240,200,0.48)',
    backgroundColor: 'rgba(37,240,200,0.055)',
    shadowColor: NEON,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  planCardPro: {
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  planCardProActive: {
    borderColor: 'rgba(37,240,200,0.56)',
    shadowColor: NEON,
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  planCardDisabled: {
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  cardTop: { minHeight: 70, alignItems: 'center' },
  planName: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
  },
  planNamePro: { color: NEON, fontSize: 22 },
  planNameExpert: { color: '#FFFFFF' },
  badge: {
    marginTop: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    maxWidth: '100%',
  },
  badgePro: {
    borderColor: 'rgba(37,240,200,0.24)',
    backgroundColor: 'rgba(37,240,200,0.08)',
  },
  badgeText: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  details: { gap: 10, marginTop: 12, flex: 1 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  detailText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11.2,
    lineHeight: 15.4,
    fontWeight: '800',
    flex: 1,
  },
  priceBlock: { alignItems: 'center', minHeight: 56, justifyContent: 'flex-end' },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  price: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
    flexShrink: 1,
  },
  pricePro: { color: NEON },
  periodText: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 9.5,
    fontWeight: '800',
    marginLeft: 2,
    marginBottom: 2,
    flexShrink: 1,
  },
  priceSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 9.5,
    fontWeight: '800',
    marginTop: 1,
  },
  selectedPanel: {
    minHeight: 96,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    flexDirection: 'row',
    gap: 12,
    padding: 15,
    marginTop: 12,
    overflow: 'hidden',
  },
  panelIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelCopy: { flex: 1 },
  panelTitle: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '900' },
  panelDesc: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    marginTop: 3,
  },
  footer: { marginTop: 10, paddingBottom: 0 },
  continueBtn: {
    alignSelf: 'center',
    width: '84%',
    height: 56,
    borderRadius: 999,
    backgroundColor: '#27EFC8',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: NEON,
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  continueGlowLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '58%',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  continueGlowRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '42%',
    backgroundColor: 'rgba(25,112,92,0.20)',
  },
  continueSheen: {
    position: 'absolute',
    left: 26,
    right: 26,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  continueText: { color: INK, fontSize: 16, fontWeight: '900' },
  continueIcon: { position: 'absolute', right: 22 },
  renewText: {
    color: 'rgba(255,255,255,0.36)',
    fontSize: 10.5,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 7,
  },
  links: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  linkText: { color: 'rgba(255,255,255,0.50)', fontSize: 10.5, fontWeight: '800' },
  linkSep: { color: 'rgba(255,255,255,0.24)', fontSize: 10, fontWeight: '800' },
})
