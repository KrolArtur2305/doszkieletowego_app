import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  type LayoutChangeEvent} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { forceLoggedOutAuthSnapshot } from '../../../hooks/useSupabaseAuth';
import { supabase } from '../../../lib/supabase';
import { getFriendlyErrorMessage } from '../../../lib/errorMessages';
import { useSupabaseAuth } from '../../../hooks/useSupabaseAuth';
import { isAppleAuthUser } from '../../../src/services/auth/appleAuth';
import { AppButton, AppInput } from '../../../src/ui/components';
import { useOnlineActionGuard } from '../../../src/services/network/NetworkStatusProvider';
import { FuturisticDonutSvg } from '../../../components/FuturisticDonutSvg';
import { resolveOnboardingCurrentStageCode } from '../../../lib/buildWorkflow';
import {
  CURRENCY_OPTIONS,
  defaultCurrencyForLanguage,
  getStoredCurrency,
  setAppCurrency,
  type AppCurrency} from '../../../lib/currency';
import {
  defaultUnitsForLanguage,
  getStoredUnits,
  setAppUnits,
  type UnitSystem} from '../../../lib/units';
import {
  BUDDY_AVATAR_OPTIONS,
  DEFAULT_BUDDY_AVATAR_ID,
  type BuddyAvatarId} from '../../../src/services/buddy/avatar';
import { GUIDED_SETUP_ENABLED } from '../../../src/services/guidedSetup/launchMode';

const BG = '#000000';
const NEON = '#25F0C8';
const APP_LOGO = require('../../assets/logo.png');
const BUDDY_NAME_MAX_LENGTH = 10;

type OnboardingStep = 'build_type' | 'build_stage' | 'budget' | 'buddy';
type OnboardingField = 'plannedBudget' | 'spentBudget' | 'buddyName' | 'avatar';

const BUILD_TYPES = [
  { value: 'szkieletowy', key: 'buildTypes.szkieletowy' },
  { value: 'murowany', key: 'buildTypes.murowany' },
  { value: 'inny', key: 'buildTypes.inny' }] as const;

const BUILD_STAGES = [
  { value: 'stan_zero', key: 'buildStages.stan_zero', infoKey: 'buildStageInfo.stan_zero' },
  { value: 'stan_surowy_otwarty', key: 'buildStages.stan_surowy_otwarty', infoKey: 'buildStageInfo.stan_surowy_otwarty' },
  { value: 'stan_surowy_zamkniety', key: 'buildStages.stan_surowy_zamkniety', infoKey: 'buildStageInfo.stan_surowy_zamkniety' },
  { value: 'instalacje', key: 'buildStages.instalacje', infoKey: 'buildStageInfo.instalacje' },
  { value: 'wykonczenie', key: 'buildStages.wykonczenie', infoKey: 'buildStageInfo.wykonczenie' }] as const;

function toNumber(value: string) {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatBudgetInput(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function todayYMD() {
  return new Date().toISOString().split('T')[0];
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation(['onboarding', 'buddy', 'common']);
  const { session } = useSupabaseAuth();
  const ensureOnlineAction = useOnlineActionGuard();
  const insets = useSafeAreaInsets();
  const userId = session?.user?.id;
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8;
  const contentTopPad = Math.max(topPad - 18, 2);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<OnboardingStep>('build_type');
  const savingRef = useRef(false);

  const [buildType, setBuildType] = useState<string>('');
  const [buildStage, setBuildStage] = useState<string>('');
  const [plannedBudget, setPlannedBudget] = useState('');
  const [spentBudget, setSpentBudget] = useState('');
  const [plannedBudgetError, setPlannedBudgetError] = useState<string | null>(null);
  const [spentBudgetError, setSpentBudgetError] = useState<string | null>(null);
  const [budgetCurrency, setBudgetCurrency] = useState<AppCurrency>(() =>
    defaultCurrencyForLanguage(i18n.resolvedLanguage || i18n.language)
  );
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(() =>
    defaultUnitsForLanguage(i18n.resolvedLanguage || i18n.language)
  );
  const [activeStageInfo, setActiveStageInfo] = useState<string | null>(null);
  const [currencyDropdownOpen, setCurrencyDropdownOpen] = useState(false);
  const [buddyName, setBuddyName] = useState('');
  const [buddyNameError, setBuddyNameError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarId, setAvatarId] = useState<BuddyAvatarId>(DEFAULT_BUDDY_AVATAR_ID);
  const scrollRef = useRef<ScrollView>(null);
  const fieldPositions = useRef<Partial<Record<OnboardingField, number>>>({});
  const plannedBudgetRef = useRef<TextInput>(null);
  const spentBudgetRef = useRef<TextInput>(null);
  const buddyNameRef = useRef<TextInput>(null);
  const buddyFloat = useRef(new Animated.Value(0)).current;

  const rememberFieldPosition = (field: OnboardingField) => (event: LayoutChangeEvent) => {
    fieldPositions.current[field] = event.nativeEvent.layout.y;
  };

  const moveToField = (field: OnboardingField, focus?: () => void) => {
    const y = fieldPositions.current[field] ?? 0;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
    if (focus) {
      setTimeout(focus, 260);
    }
  };

  const beginSaving = () => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    return true;
  };

  const endSaving = () => {
    savingRef.current = false;
    setSaving(false);
  };
  useEffect(() => {
    if (step !== 'buddy') return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(buddyFloat, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true}),
        Animated.timing(buddyFloat, {
          toValue: 0,
          duration: 1400,
          useNativeDriver: true})])
    );

    loop.start();
    return () => {
      loop.stop();
      buddyFloat.setValue(0);
    };
  }, [buddyFloat, step]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (!userId) {
        if (alive) setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const [profileRes, investmentRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('onboarding_step, build_type, build_stage, ai_buddy_name, ai_buddy_avatar')
            .eq('user_id', userId)
            .maybeSingle(),
          supabase
            .from('inwestycje')
            .select('budzet')
            .eq('user_id', userId)
            .maybeSingle()]);
        const storedCurrency = await getStoredCurrency();
        const storedUnits = await getStoredUnits();

        if (!alive) return;

        const nextStep = profileRes.data?.onboarding_step;
        if (nextStep === 'build_stage' || nextStep === 'budget' || nextStep === 'buddy') {
          setStep(nextStep);
        } else {
          setStep('build_type');
        }

        setBuildType(String(profileRes.data?.build_type ?? '').trim());
        setBuildStage(String(profileRes.data?.build_stage ?? '').trim());
        setBudgetCurrency(storedCurrency);
        setUnitSystem(storedUnits);
        setBuddyName(String(profileRes.data?.ai_buddy_name ?? '').trim());
        setAvatarId(
          profileRes.data?.ai_buddy_avatar === 'avatar2' || profileRes.data?.ai_buddy_avatar === 'avatar3'
            ? profileRes.data.ai_buddy_avatar
            : DEFAULT_BUDDY_AVATAR_ID
        );

        if (investmentRes.data?.budzet !== null && investmentRes.data?.budzet !== undefined) {
          setPlannedBudget(formatBudgetInput(String(investmentRes.data.budzet)));
        }
      } catch (e: any) {
        Alert.alert(t('alerts.errorTitle'), getFriendlyErrorMessage(e, t, 'alerts.prepareError'));
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [userId, t]);

  const saveBuildType = async (value: string) => {
    if (!userId || savingRef.current) return;
    if (!ensureOnlineAction('Zapis typu budowy wymaga internetu. Sprawdź połączenie i spróbuj ponownie.')) return;
    if (!beginSaving()) return;

    try {
      const { error } = await supabase.from('profiles').upsert(
        {
          user_id: userId,
          build_type: value,
          current_stage_code: buildStage ? resolveOnboardingCurrentStageCode(value, buildStage) : null,
          onboarding_step: 'build_stage',
          onboarding_completed: false},
        { onConflict: 'user_id' }
      );

      if (error) throw error;

      setBuildType(value);
      setStep('build_stage');
    } catch (e: any) {
      Alert.alert(t('alerts.errorTitle'), getFriendlyErrorMessage(e, t, 'alerts.saveBuildTypeError'));
    } finally {
      endSaving();
    }
  };

  const confirmLogout = () => {
    Alert.alert(
      t('alerts.logoutTitle'),
      t('alerts.logoutMessage'),
      [
        { text: t('cancel', { ns: 'common' }), style: 'cancel' },
        {
          text: t('alerts.logoutAction'),
          style: 'destructive',
            onPress: async () => {
              try {
                forceLoggedOutAuthSnapshot();
                await supabase.auth.signOut();
                router.replace('/(auth)/welcome');
            } catch (e: any) {
              Alert.alert(t('alerts.errorTitle'), getFriendlyErrorMessage(e, t, 'alerts.logoutError'));
            }
          }}]
    );
  };

  const backToBuildType = async () => {
    if (!userId) {
      setStep('build_type');
      return;
    }
    if (savingRef.current) return;
    if (!ensureOnlineAction('Zmiana kroku onboardingu wymaga internetu. Sprawdź połączenie i spróbuj ponownie.')) return;
    if (!beginSaving()) return;

    try {
      const { error } = await supabase.from('profiles').upsert(
        {
          user_id: userId,
          onboarding_step: 'build_type',
          onboarding_completed: false},
        { onConflict: 'user_id' }
      );

      if (error) throw error;
      setStep('build_type');
    } catch (e: any) {
      Alert.alert(t('alerts.errorTitle'), getFriendlyErrorMessage(e, t, 'alerts.saveBuildTypeError'));
    } finally {
      endSaving();
    }
  };

  const saveBuildStage = async (value: string) => {
    if (!userId || savingRef.current) return;
    if (!ensureOnlineAction('Zapis etapu budowy wymaga internetu. Sprawdź połączenie i spróbuj ponownie.')) return;
    if (!beginSaving()) return;

    try {
      const { error } = await supabase.from('profiles').upsert(
        {
          user_id: userId,
          build_stage: value,
          current_stage_code: resolveOnboardingCurrentStageCode(buildType, value),
          onboarding_step: 'budget',
          onboarding_completed: false},
        { onConflict: 'user_id' }
      );

      if (error) throw error;

      setBuildStage(value);
      setStep('budget');
    } catch (e: any) {
      Alert.alert(t('alerts.errorTitle'), getFriendlyErrorMessage(e, t, 'alerts.saveBuildStageError'));
    } finally {
      endSaving();
    }
  };

  const saveBudget = async () => {
    if (!userId || savingRef.current) return;
    if (!ensureOnlineAction('Zapis budżetu wymaga internetu. Sprawdź połączenie i spróbuj ponownie.')) return;
    savingRef.current = true;

    const budget = toNumber(plannedBudget);
    const spent = toNumber(spentBudget) ?? 0;

    if (budget === null || budget < 0) {
      savingRef.current = false;
      setPlannedBudgetError(t('alerts.invalidBudget'));
      moveToField('plannedBudget', () => plannedBudgetRef.current?.focus());
      return;
    }

    if (spent < 0) {
      savingRef.current = false;
      setSpentBudgetError(t('alerts.negativeSpent'));
      moveToField('spentBudget', () => spentBudgetRef.current?.focus());
      return;
    }

    setSaving(true);
    try {
      const [investmentRes, existingExpenseRes] = await Promise.all([
        supabase.from('inwestycje').upsert(
          {
            user_id: userId,
            budzet: budget},
          { onConflict: 'user_id' }
        ),
        spent > 0
          ? supabase
              .from('wydatki')
              .select('id')
              .eq('user_id', userId)
              .eq('source', 'onboarding')
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any)]);

      if (investmentRes.error) throw investmentRes.error;
      if (existingExpenseRes?.error) throw existingExpenseRes.error;
      await setAppCurrency(budgetCurrency);
      await setAppUnits(unitSystem);

      if (spent > 0) {
        const expensePayload = {
          user_id: userId,
          nazwa: t('budget.initialExpenseName'),
          kwota: spent,
          status: 'poniesiony',
          kategoria: 'Inne',
          data: todayYMD(),
          source: 'onboarding'};

        const { error: expenseError } = existingExpenseRes?.data?.id
          ? await supabase
              .from('wydatki')
              .update(expensePayload)
              .eq('id', existingExpenseRes.data.id)
              .eq('user_id', userId)
          : await supabase.from('wydatki').insert(expensePayload);

        if (expenseError) throw expenseError;
      }

      const appleUser = isAppleAuthUser(session?.user);
      const nextStep = appleUser ? 'investment' : 'profile';
      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          user_id: userId,
          onboarding_step: nextStep,
          onboarding_completed: false,
          ...(appleUser ? { profil_wypelniony: true } : {})},
        { onConflict: 'user_id' }
      );

      if (profileError) throw profileError;

      router.replace(appleUser ? '/(app)/onboarding/inwestycja' : '/(app)/onboarding/profile');
    } catch (e: any) {
      Alert.alert(t('alerts.errorTitle'), getFriendlyErrorMessage(e, t, 'alerts.saveBudgetError'));
    } finally {
      endSaving();
    }
  };

  const backToBuildStage = async () => {
    if (savingRef.current) return;
    if (!ensureOnlineAction('Zmiana kroku onboardingu wymaga internetu. Sprawdź połączenie i spróbuj ponownie.')) return;
    if (!beginSaving()) return;

    try {
      setStep('build_stage');
      if (userId) {
        await supabase.from('profiles').upsert(
          { user_id: userId, onboarding_step: 'build_stage', onboarding_completed: false },
          { onConflict: 'user_id' }
        );
      }
    } finally {
      endSaving();
    }
  };

  const renderBuildType = () => (
    <>
      <Image source={APP_LOGO} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>{t('steps.buildTypeTitle')}</Text>

      <View style={styles.tileGrid}>
        {BUILD_TYPES.map((item) => (
          <TouchableOpacity
            key={item.value}
            onPress={() => saveBuildType(item.value)}
            disabled={saving}
            activeOpacity={0.88}
            style={styles.tileOuter}
          >
            <BlurView intensity={18} tint="dark" style={styles.tile}>
              <Text style={styles.tileTitle}>{t(item.key)}</Text>
            </BlurView>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );

  const renderBuildStage = () => (
    <>
      {renderBackButton(backToBuildType)}
      <Image source={APP_LOGO} style={styles.stageLogo} resizeMode="contain" />
      <Text style={styles.stageTitle}>{t('steps.buildStageTitle')}</Text>

      <View style={styles.stageList}>
        {BUILD_STAGES.map((item) => (
          <View key={item.value} style={styles.stageTileOuter}>
            <TouchableOpacity
              onPress={() => saveBuildStage(item.value)}
              disabled={saving}
              activeOpacity={0.88}
              style={styles.stageSelectButton}
            >
              <BlurView intensity={18} tint="dark" style={styles.stageTile}>
                <View style={styles.stageTileHeader}>
                  <Text style={styles.stageTileTitle}>{t(item.key)}</Text>
                </View>
              </BlurView>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setActiveStageInfo((current) => (current === item.value ? null : item.value))}
              activeOpacity={0.82}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              style={styles.infoBadge}
            >
              <Text style={styles.infoBadgeText}>i</Text>
            </TouchableOpacity>

            {activeStageInfo === item.value ? (
              <View style={styles.stageInfoBubble}>
                <Text style={styles.stageTileInfo}>{t(item.infoKey)}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </>
  );

  const renderBudget = () => (
    <>
      {renderBackButton(backToBuildStage)}
      <Text style={styles.title}>{t('steps.budgetTitle')}</Text>

      <BlurView intensity={20} tint="dark" style={styles.budgetHero}>
        <View pointerEvents="none" style={styles.budgetHeroGlow} />
        <View style={styles.budgetDonutWrap}>
          <FuturisticDonutSvg value={0.5} size={142} stroke={13} label="" isActive={step === 'budget'} hideCenterValue />
        </View>
        <View style={styles.budgetHeroCopy}>
          <Text style={styles.budgetHeroKicker}>
            {t('budget.heroKicker')}
          </Text>
          <Text style={styles.budgetHeroTitle}>
            {t('budget.heroTitle')}
          </Text>
          <Text style={styles.budgetHeroText}>
            {t('budget.heroText')}
          </Text>
        </View>
      </BlurView>

      <BlurView intensity={18} tint="dark" style={styles.formCard}>
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>{t('budget.currencyLabel')}</Text>
          <View style={styles.currencyDropdownWrap}>
            <TouchableOpacity
              onPress={() => setCurrencyDropdownOpen((open) => !open)}
              activeOpacity={0.86}
              style={styles.currencySelect}
            >
              <View>
                <Text style={styles.currencyCodeActive}>{budgetCurrency}</Text>
                <Text style={styles.currencySymbol}>
                  {CURRENCY_OPTIONS.find((option) => option.code === budgetCurrency)?.symbol ?? budgetCurrency}
                </Text>
              </View>
              <Feather
                name={currencyDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={NEON}
              />
            </TouchableOpacity>

            {currencyDropdownOpen ? (
              <View style={styles.currencyDropdown}>
                <ScrollView
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator
                  style={styles.currencyDropdownScroll}
                >
                  {CURRENCY_OPTIONS.map((option) => {
                    const active = budgetCurrency === option.code;
                    return (
                      <TouchableOpacity
                        key={option.code}
                        onPress={async () => {
                          setBudgetCurrency(option.code);
                          setCurrencyDropdownOpen(false);
                          await setAppCurrency(option.code);
                        }}
                        activeOpacity={0.86}
                        style={[styles.currencyOption, active && styles.currencyOptionActive]}
                      >
                        <Text style={[styles.currencyOptionCode, active && styles.currencyCodeActive]}>
                          {option.code}
                        </Text>
                        <Text style={[styles.currencyOptionSymbol, active && styles.currencyCodeActive]}>
                          {option.symbol}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>{t('budget.unitsLabel')}</Text>
          <View style={styles.unitOptionsRow}>
            {(['metric', 'imperial'] as UnitSystem[]).map((option) => {
              const active = unitSystem === option;
              return (
                <TouchableOpacity
                  key={option}
                  onPress={async () => {
                    setUnitSystem(option);
                    await setAppUnits(option);
                  }}
                  activeOpacity={0.86}
                  style={[styles.unitOption, active && styles.unitOptionActive]}
                >
                  <Text style={[styles.unitOptionTitle, active && styles.unitOptionTitleActive]}>
                    {t(`budget.units.${option}.title`)}
                  </Text>
                  <Text style={styles.unitOptionSubtitle}>
                    {t(`budget.units.${option}.subtitle`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.fieldWrap} onLayout={rememberFieldPosition('plannedBudget')}>
          <Text style={styles.fieldLabel}>{t('budget.plannedLabel')}</Text>
          <AppInput
            ref={plannedBudgetRef}
            value={plannedBudget}
            onChangeText={(value) => {
              const nextValue = formatBudgetInput(value);
              setPlannedBudget(nextValue);
              const nextBudget = toNumber(nextValue);
              if (plannedBudgetError && nextBudget !== null && nextBudget >= 0) setPlannedBudgetError(null);
            }}
            onFocus={() => setTimeout(() => moveToField('plannedBudget'), 120)}
            placeholder={t('budget.plannedPlaceholder')}
            keyboardType="numeric"
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
            error={plannedBudgetError || undefined}
            style={styles.input}
          />
        </View>

        <View style={styles.fieldWrapLast} onLayout={rememberFieldPosition('spentBudget')}>
          <Text style={styles.fieldLabel}>{t('budget.spentLabel')}</Text>
          <AppInput
            ref={spentBudgetRef}
            value={spentBudget}
            onChangeText={(value) => {
              const nextValue = formatBudgetInput(value);
              setSpentBudget(nextValue);
              const nextSpent = toNumber(nextValue) ?? 0;
              if (spentBudgetError && nextSpent >= 0) setSpentBudgetError(null);
            }}
            onFocus={() => setTimeout(() => moveToField('spentBudget'), 120)}
            placeholder={t('budget.spentPlaceholder')}
            keyboardType="numeric"
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
            error={spentBudgetError || undefined}
            style={styles.input}
          />
        </View>
      </BlurView>

      <AppButton
        title={t('actions.next')}
        onPress={saveBudget}
        disabled={saving}
        loading={saving}
        style={styles.primaryBtn}
      />
    </>
  );

  const saveBuddySetup = async () => {
    if (!userId || savingRef.current) return;
    if (!ensureOnlineAction('Zapis ustawień Kierownika AI wymaga internetu. Sprawdź połączenie i spróbuj ponownie.')) return;
    savingRef.current = true;

    const trimmedName = buddyName.trim();

    if (!trimmedName) {
      savingRef.current = false;
      setBuddyNameError(t('buddy:onboarding.nameRequired'));
      moveToField('buddyName', () => buddyNameRef.current?.focus());
      return;
    }

    if (!avatarId) {
      savingRef.current = false;
      setAvatarError(t('buddy:onboarding.avatarRequired'));
      moveToField('avatar');
      return;
    }

    if (trimmedName.length > BUDDY_NAME_MAX_LENGTH) {
      savingRef.current = false;
      setBuddyNameError(t('buddy:onboarding.nameTooLong'));
      moveToField('buddyName', () => buddyNameRef.current?.focus());
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').upsert(
        {
          user_id: userId,
          ai_buddy_name: trimmedName,
          ai_buddy_avatar: avatarId,
          onboarding_step: 'done',
          onboarding_completed: true},
        { onConflict: 'user_id' }
      );

      if (error) throw error;

      router.replace(GUIDED_SETUP_ENABLED ? '/(app)/guided-setup' : '/(app)/(tabs)/dashboard');
    } catch (e: any) {
      Alert.alert(
        t('onboarding:alerts.errorTitle'),
        getFriendlyErrorMessage(e, t, 'buddy:settings.errors.save')
      );
    } finally {
      endSaving();
    }
  };

  const backToInvestment = async () => {
    if (savingRef.current) return;
    if (!ensureOnlineAction('Zmiana kroku onboardingu wymaga internetu. Sprawdź połączenie i spróbuj ponownie.')) return;
    if (!beginSaving()) return;

    try {
      if (userId) {
        await supabase.from('profiles').upsert(
          { user_id: userId, onboarding_step: 'investment', onboarding_completed: false },
          { onConflict: 'user_id' }
        );
      }
      router.replace('/(app)/onboarding/inwestycja');
    } finally {
      endSaving();
    }
  };

  const renderBuddyStep = () => (
    <>
      {renderBackButton(backToInvestment)}
      <Image source={APP_LOGO} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>{t('buddy:onboarding.title')}</Text>
      <Text style={styles.subtitle}>{t('buddy:onboarding.subtitle')}</Text>

      <BlurView intensity={18} tint="dark" style={styles.formCard}>
        <Animated.View
          style={[
            styles.buddyHeroWrap,
            {
              transform: [
                {
                  translateY: buddyFloat.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -8]})},
                {
                  scale: buddyFloat.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.03]})}]}]}
        >
          <Image
            source={BUDDY_AVATAR_OPTIONS.find((option) => option.id === avatarId)?.source ?? BUDDY_AVATAR_OPTIONS[0].source}
            style={styles.buddyHeroAvatar}
            resizeMode="cover"
          />
          <View style={styles.buddyHeroGlow} />
        </Animated.View>

        <View style={styles.fieldWrap} onLayout={rememberFieldPosition('buddyName')}>
          <Text style={styles.fieldLabel}>{t('buddy:onboarding.nameLabel')}</Text>
          <AppInput
            ref={buddyNameRef}
            value={buddyName}
            onChangeText={(value) => {
              setBuddyName(value);
              const trimmed = value.trim();
              if (buddyNameError && trimmed && trimmed.length <= BUDDY_NAME_MAX_LENGTH) setBuddyNameError(null);
            }}
            placeholder={t('buddy:onboarding.namePlaceholder')}
            maxLength={BUDDY_NAME_MAX_LENGTH}
            error={buddyNameError || undefined}
            style={styles.input}
          />
        </View>

        <View onLayout={rememberFieldPosition('avatar')}>
          <Text style={styles.fieldLabel}>{t('buddy:settings.sections.avatar')}</Text>
          <View style={[styles.avatarGrid, avatarError && styles.avatarGridError]}>
            {BUDDY_AVATAR_OPTIONS.map((option) => {
              const active = avatarId === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  onPress={() => {
                    setAvatarId(option.id);
                    if (avatarError) setAvatarError(null);
                  }}
                  activeOpacity={0.88}
                  style={[styles.avatarTile, active && styles.avatarTileActive]}
                >
                  <Image source={option.source} style={styles.avatarTileImage} resizeMode="cover" />
                  {active ? <View style={styles.avatarTileBadge} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
          {avatarError ? <Text style={styles.formError}>{avatarError}</Text> : null}
        </View>
      </BlurView>

      <AppButton
        title={saving ? t('buddy:onboarding.saving') : t('buddy:onboarding.cta')}
        onPress={saveBuddySetup}
        disabled={saving}
        loading={saving}
        style={styles.primaryBtn}
      />
    </>
  );

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View pointerEvents="none" style={styles.bg} />
        {!loading && step === 'build_type' ? (
          <TouchableOpacity
            onPress={confirmLogout}
            activeOpacity={0.84}
            style={[styles.logoutBadge, { top: topPad }]}
          >
            <Feather name="log-out" size={15} color="#FFFFFF" />
          </TouchableOpacity>
        ) : null}

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingTop: contentTopPad, paddingBottom: Math.max(44, insets.bottom + 40) },
          ]}
          keyboardShouldPersistTaps="handled"
          scrollIndicatorInsets={{ bottom: insets.bottom + 12 }}
          alwaysBounceVertical
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={NEON} />
              <Text style={styles.loadingText}>{t('loading.prepare')}</Text>
            </View>
          ) : step === 'build_type' ? (
            renderBuildType()
          ) : step === 'build_stage' ? (
            renderBuildStage()
          ) : step === 'buddy' ? (
            renderBuddyStep()
          ) : (
            renderBudget()
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

function renderBackButton(onPress: () => void | Promise<void>) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.backButton}>
      <Feather name="chevron-left" size={20} color="#FFFFFF" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG},
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG},
  content: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
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
    marginBottom: 4},
  logoutBadge: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(220,38,38,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#DC2626',
    shadowOpacity: 0.26,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }},
  logo: {
    width: 172,
    height: 172,
    alignSelf: 'center',
    marginBottom: 0},
  stageLogo: {
    width: 112,
    height: 112,
    alignSelf: 'center',
    marginTop: -6,
    marginBottom: -4},
  loadingWrap: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12},
  loadingText: {
    color: 'rgba(255,255,255,0.56)',
    fontSize: 13,
    fontWeight: '600'},
  title: {
    color: NEON,
    fontFamily: 'Rubik_800ExtraBold',
    fontSize: 33,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginBottom: 14,
    textAlign: 'center'},
  stageTitle: {
    color: NEON,
    fontFamily: 'Rubik_800ExtraBold',
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -0.25,
    marginBottom: 10,
    textAlign: 'center'},
  subtitle: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18},
  tileGrid: {
    gap: 12,
    marginTop: 8},
  stageList: {
    gap: 12},
  tileOuter: {
    borderRadius: 24,
    overflow: 'hidden'},
  stageTileOuter: {
    width: '100%',
    borderRadius: 20,
    overflow: 'visible',
    position: 'relative'},
  stageSelectButton: {
    borderRadius: 20,
    overflow: 'hidden'},
  stageTile: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderWidth: 1.3,
    borderColor: 'rgba(37,240,200,0.34)',
    minHeight: 58},
  stageTileHeader: {
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center'},
  infoBadge: {
    position: 'absolute',
    right: 12,
    top: 13,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,240,200,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.72)',
    zIndex: 2},
  infoBadgeText: {
    color: NEON,
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '900'},
  stageTileTitle: {
    width: '100%',
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: 34},
  stageInfoBubble: {
    alignSelf: 'stretch',
    marginTop: 8,
    marginHorizontal: 8,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(4,18,16,0.98)',
    borderWidth: 1.2,
    borderColor: 'rgba(37,240,200,0.50)',
    shadowColor: '#000000',
    shadowOpacity: 0.44,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8},
  stageTileInfo: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'},
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 22,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderWidth: 1.6,
    borderColor: 'rgba(37,240,200,0.34)',
    minHeight: 88},
  tileTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center'},
  formCard: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden'},
  budgetHero: {
    minHeight: 178,
    borderRadius: 28,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14},
  budgetHeroGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: NEON,
    opacity: 0.08,
    left: -64,
    top: -32},
  budgetDonutWrap: {
    width: 142,
    height: 142,
    alignItems: 'center',
    justifyContent: 'center'},
  budgetHeroCopy: {
    flex: 1,
    minWidth: 0},
  budgetHeroKicker: {
    color: NEON,
    fontSize: 10.5,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 6},
  budgetHeroTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
    marginBottom: 7},
  budgetHeroText: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '700'},
  fieldWrap: {
    marginBottom: 14},
  fieldWrapLast: {
    marginBottom: 0},
  fieldLabel: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8},
  input: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)'},
  currencyDropdownWrap: {
    position: 'relative'},
  currencySelect: {
    minHeight: 56,
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.30)'},
  currencyDropdown: {
    marginTop: 8,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.26)'},
  currencyDropdownScroll: {
    maxHeight: 188},
  currencyOption: {
    minHeight: 48,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)'},
  currencyOptionActive: {
    backgroundColor: 'rgba(37,240,200,0.11)'},
  currencyOptionCode: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    fontWeight: '900'},
  currencyCodeActive: {
    color: NEON},
  currencySymbol: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11,
    fontWeight: '800'},
  currencyOptionSymbol: {
    color: 'rgba(255,255,255,0.46)',
    fontSize: 13,
    fontWeight: '800'},
  unitOptionsRow: {
    flexDirection: 'row',
    gap: 10},
  unitOption: {
    flex: 1,
    minHeight: 66,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 11,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)'},
  unitOptionActive: {
    backgroundColor: 'rgba(37,240,200,0.11)',
    borderColor: 'rgba(37,240,200,0.34)'},
  unitOptionTitle: {
    color: 'rgba(255,255,255,0.80)',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 3},
  unitOptionTitleActive: {
    color: NEON},
  unitOptionSubtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10.5,
    fontWeight: '800',
    lineHeight: 14},
  primaryBtn: {
    marginTop: 18},
  avatarGrid: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'},
  avatarGridError: {
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 24,
    padding: 8},
  formError: {
    marginTop: 8,
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700'},
  buddyHeroWrap: {
    alignSelf: 'center',
    width: 124,
    height: 124,
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'center'},
  buddyHeroAvatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    borderColor: 'rgba(37,240,200,0.35)'},
  buddyHeroGlow: {
    position: 'absolute',
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: 'rgba(37,240,200,0.08)'},
  avatarTile: {
    position: 'relative',
    width: '31%',
    aspectRatio: 1,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)'},
  avatarTileActive: {
    borderColor: 'rgba(37,240,200,0.55)',
    shadowColor: NEON,
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 }},
  avatarTileImage: {
    width: '100%',
    height: '100%'},
  avatarTileBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 14,
    height: 14,
    borderRadius: 99,
    backgroundColor: NEON,
    borderWidth: 2,
    borderColor: '#000000'}});
