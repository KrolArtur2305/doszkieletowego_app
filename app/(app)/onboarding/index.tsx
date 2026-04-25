import { useEffect, useRef, useState } from 'react';
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
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabase';
import { useSupabaseAuth } from '../../../hooks/useSupabaseAuth';
import { AppButton, AppInput } from '../../../src/ui/components';
import {
  BUDDY_AVATAR_OPTIONS,
  DEFAULT_BUDDY_AVATAR_ID,
  type BuddyAvatarId,
} from '../../../src/services/buddy/avatar';
import { GUIDED_SETUP_ENABLED } from '../../../src/services/guidedSetup/launchMode';

const BG = '#000000';
const ACCENT = '#19705C';
const NEON = '#25F0C8';
const APP_LOGO = require('../../assets/logo.png');

type OnboardingStep = 'build_type' | 'build_stage' | 'budget' | 'buddy';

const BUILD_TYPES = [
  { value: 'szkieletowy', key: 'buildTypes.szkieletowy' },
  { value: 'murowany', key: 'buildTypes.murowany' },
  { value: 'inny', key: 'buildTypes.inny' },
] as const;

const BUILD_STAGES = [
  { value: 'planowanie', key: 'buildStages.planowanie' },
  { value: 'stan_zero', key: 'buildStages.stan_zero' },
  { value: 'stan_surowy_otwarty', key: 'buildStages.stan_surowy_otwarty' },
  { value: 'stan_surowy_zamkniety', key: 'buildStages.stan_surowy_zamkniety' },
  { value: 'wykonczenie', key: 'buildStages.wykonczenie' },
] as const;

function toNumber(value: string) {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function todayYMD() {
  return new Date().toISOString().split('T')[0];
}

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation(['onboarding', 'buddy']);
  const { session } = useSupabaseAuth();
  const userId = session?.user?.id;
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8;
  const contentTopPad = Math.max(topPad - 18, 2);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<OnboardingStep>('build_type');

  const [buildType, setBuildType] = useState<string>('');
  const [buildStage, setBuildStage] = useState<string>('');
  const [plannedBudget, setPlannedBudget] = useState('');
  const [spentBudget, setSpentBudget] = useState('');
  const [buddyName, setBuddyName] = useState('');
  const [avatarId, setAvatarId] = useState<BuddyAvatarId>(DEFAULT_BUDDY_AVATAR_ID);
  const buddyFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (step !== 'buddy') return;

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(buddyFloat, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(buddyFloat, {
          toValue: 0,
          duration: 1400,
          useNativeDriver: true,
        }),
      ])
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
            .maybeSingle(),
        ]);

        if (!alive) return;

        const nextStep = profileRes.data?.onboarding_step;
        if (nextStep === 'build_stage' || nextStep === 'budget' || nextStep === 'buddy') {
          setStep(nextStep);
        } else {
          setStep('build_type');
        }

        setBuildType(String(profileRes.data?.build_type ?? '').trim());
        setBuildStage(String(profileRes.data?.build_stage ?? '').trim());
        setBuddyName(String(profileRes.data?.ai_buddy_name ?? '').trim());
        setAvatarId(
          profileRes.data?.ai_buddy_avatar === 'avatar2' || profileRes.data?.ai_buddy_avatar === 'avatar3'
            ? profileRes.data.ai_buddy_avatar
            : DEFAULT_BUDDY_AVATAR_ID
        );

        if (investmentRes.data?.budzet !== null && investmentRes.data?.budzet !== undefined) {
          setPlannedBudget(String(investmentRes.data.budzet));
        }
      } catch (e: any) {
        Alert.alert(t('alerts.errorTitle'), e?.message ?? t('alerts.prepareError'));
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
    if (!userId || saving) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').upsert(
        {
          user_id: userId,
          build_type: value,
          onboarding_step: 'build_stage',
          onboarding_completed: false,
        },
        { onConflict: 'user_id' }
      );

      if (error) throw error;

      setBuildType(value);
      setStep('build_stage');
    } catch (e: any) {
      Alert.alert(t('alerts.errorTitle'), e?.message ?? t('alerts.saveBuildTypeError'));
    } finally {
      setSaving(false);
    }
  };

  const saveBuildStage = async (value: string) => {
    if (!userId || saving) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').upsert(
        {
          user_id: userId,
          build_stage: value,
          onboarding_step: 'budget',
          onboarding_completed: false,
        },
        { onConflict: 'user_id' }
      );

      if (error) throw error;

      setBuildStage(value);
      setStep('budget');
    } catch (e: any) {
      Alert.alert(t('alerts.errorTitle'), e?.message ?? t('alerts.saveBuildStageError'));
    } finally {
      setSaving(false);
    }
  };

  const saveBudget = async () => {
    if (!userId || saving) return;

    const budget = toNumber(plannedBudget);
    const spent = toNumber(spentBudget) ?? 0;

    if (budget === null || budget < 0) {
      Alert.alert(t('alerts.errorTitle'), t('alerts.invalidBudget'));
      return;
    }

    if (spent < 0) {
      Alert.alert(t('alerts.errorTitle'), t('alerts.negativeSpent'));
      return;
    }

    setSaving(true);
    try {
      const [investmentRes, existingExpenseRes] = await Promise.all([
        supabase.from('inwestycje').upsert(
          {
            user_id: userId,
            budzet: budget,
          },
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
          : Promise.resolve({ data: null, error: null } as any),
      ]);

      if (investmentRes.error) throw investmentRes.error;
      if (existingExpenseRes?.error) throw existingExpenseRes.error;

      if (spent > 0 && !existingExpenseRes?.data?.id) {
        const { error: expenseError } = await supabase.from('wydatki').insert({
          user_id: userId,
          nazwa: 'Koszty poniesione przed rozpoczęciem korzystania z aplikacji',
          kwota: spent,
          status: 'poniesiony',
          kategoria: 'Inne',
          data: todayYMD(),
          source: 'onboarding',
        });

        if (expenseError) throw expenseError;
      }

      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          user_id: userId,
          onboarding_step: 'profile',
          onboarding_completed: false,
        },
        { onConflict: 'user_id' }
      );

      if (profileError) throw profileError;

      router.replace('/(app)/onboarding/profile');
    } catch (e: any) {
      Alert.alert(t('alerts.errorTitle'), e?.message ?? t('alerts.saveBudgetError'));
    } finally {
      setSaving(false);
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
      {renderBackButton(() => setStep('build_type'))}
      <Image source={APP_LOGO} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>{t('steps.buildStageTitle')}</Text>

      <View style={styles.tileGrid}>
        {BUILD_STAGES.map((item) => (
          <TouchableOpacity
            key={item.value}
            onPress={() => saveBuildStage(item.value)}
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

  const renderBudget = () => (
    <>
      {renderBackButton(async () => {
        setStep('build_stage');
        if (userId) {
          await supabase.from('profiles').upsert(
            { user_id: userId, onboarding_step: 'build_stage', onboarding_completed: false },
            { onConflict: 'user_id' }
          );
        }
      })}
      <Image source={APP_LOGO} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>{t('steps.budgetTitle')}</Text>

      <BlurView intensity={18} tint="dark" style={styles.formCard}>
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>{t('budget.plannedLabel')}</Text>
          <AppInput
            value={plannedBudget}
            onChangeText={setPlannedBudget}
            placeholder={t('budget.plannedPlaceholder')}
            keyboardType="numeric"
            style={styles.input}
          />
        </View>

        <View style={styles.fieldWrapLast}>
          <Text style={styles.fieldLabel}>{t('budget.spentLabel')}</Text>
          <AppInput
            value={spentBudget}
            onChangeText={setSpentBudget}
            placeholder={t('budget.spentPlaceholder')}
            keyboardType="numeric"
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
    if (!userId || saving) return;

    const trimmedName = buddyName.trim();

    if (!trimmedName) {
      Alert.alert(
        t('onboarding:alerts.errorTitle'),
        t('buddy:onboarding.nameRequired', { defaultValue: 'Podaj imię dla Kierownika AI.' })
      );
      return;
    }

    if (!avatarId) {
      Alert.alert(
        t('onboarding:alerts.errorTitle'),
        t('buddy:onboarding.avatarRequired', { defaultValue: 'Wybierz avatar Kierownika AI.' })
      );
      return;
    }

    if (trimmedName.length > 30) {
      Alert.alert(
        t('onboarding:alerts.errorTitle'),
        t('buddy:settings.errors.nameTooLong')
      );
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
          onboarding_completed: true,
        },
        { onConflict: 'user_id' }
      );

      if (error) throw error;

      router.replace(GUIDED_SETUP_ENABLED ? '/(app)/guided-setup' : '/(app)/(tabs)/dashboard');
    } catch (e: any) {
      Alert.alert(
        t('onboarding:alerts.errorTitle'),
        e?.message ?? t('buddy:settings.errors.save')
      );
    } finally {
      setSaving(false);
    }
  };

  const renderBuddyStep = () => (
    <>
      {renderBackButton(async () => {
        if (userId) {
          await supabase.from('profiles').upsert(
            { user_id: userId, onboarding_step: 'investment', onboarding_completed: false },
            { onConflict: 'user_id' }
          );
        }
        router.replace('/(app)/onboarding/inwestycja');
      })}
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
                    outputRange: [0, -8],
                  }),
                },
                {
                  scale: buddyFloat.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.03],
                  }),
                },
              ],
            },
          ]}
        >
          <Image
            source={BUDDY_AVATAR_OPTIONS.find((option) => option.id === avatarId)?.source ?? BUDDY_AVATAR_OPTIONS[0].source}
            style={styles.buddyHeroAvatar}
            resizeMode="cover"
          />
          <View style={styles.buddyHeroGlow} />
        </Animated.View>

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>{t('buddy:onboarding.nameLabel')}</Text>
          <AppInput
            value={buddyName}
            onChangeText={setBuddyName}
            placeholder={t('buddy:onboarding.namePlaceholder')}
            maxLength={30}
            style={styles.input}
          />
        </View>

        <Text style={styles.fieldLabel}>{t('buddy:settings.sections.avatar')}</Text>
        <View style={styles.avatarGrid}>
          {BUDDY_AVATAR_OPTIONS.map((option) => {
            const active = avatarId === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                onPress={() => setAvatarId(option.id)}
                activeOpacity={0.88}
                style={[styles.avatarTile, active && styles.avatarTileActive]}
              >
                <Image source={option.source} style={styles.avatarTileImage} resizeMode="cover" />
                {active ? <View style={styles.avatarTileBadge} /> : null}
              </TouchableOpacity>
            );
          })}
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View pointerEvents="none" style={styles.bg} />
        <View pointerEvents="none" style={styles.glowTop} />
        <View pointerEvents="none" style={styles.glowBottom} />

        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: contentTopPad }]}
          keyboardShouldPersistTaps="handled"
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
    opacity: 0.05,
    bottom: -120,
    left: -120,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 44,
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
    marginBottom: 4,
  },
  logo: {
    width: 172,
    height: 172,
    alignSelf: 'center',
    marginBottom: 0,
  },
  loadingWrap: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.56)',
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    color: NEON,
    fontSize: 33,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginBottom: 14,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  tileGrid: {
    gap: 12,
  },
  tileOuter: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 22,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderWidth: 1.6,
    borderColor: 'rgba(37,240,200,0.34)',
    minHeight: 88,
  },
  tileTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  formCard: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  fieldWrap: {
    marginBottom: 14,
  },
  fieldWrapLast: {
    marginBottom: 0,
  },
  fieldLabel: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  primaryBtn: {
    marginTop: 18,
  },
  avatarGrid: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  buddyHeroWrap: {
    alignSelf: 'center',
    width: 124,
    height: 124,
    marginBottom: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buddyHeroAvatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    borderColor: 'rgba(37,240,200,0.35)',
  },
  buddyHeroGlow: {
    position: 'absolute',
    width: 124,
    height: 124,
    borderRadius: 62,
    backgroundColor: 'rgba(37,240,200,0.08)',
  },
  avatarTile: {
    position: 'relative',
    width: '31%',
    aspectRatio: 1,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  avatarTileActive: {
    borderColor: 'rgba(37,240,200,0.55)',
    shadowColor: NEON,
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  avatarTileImage: {
    width: '100%',
    height: '100%',
  },
  avatarTileBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 14,
    height: 14,
    borderRadius: 99,
    backgroundColor: NEON,
    borderWidth: 2,
    borderColor: '#000000',
  },
});
