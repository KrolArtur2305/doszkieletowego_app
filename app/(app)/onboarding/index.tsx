import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useSupabaseAuth } from '../../../hooks/useSupabaseAuth';

const BG = '#000000';
const ACCENT = '#19705C';
const NEON = '#25F0C8';

type OnboardingStep = 'build_type' | 'build_stage' | 'budget';

const BUILD_TYPES = [
  { value: 'szkieletowy', title: 'Szkieletową' },
  { value: 'murowany', title: 'Murowaną' },
  { value: 'inny', title: 'Inną' },
] as const;

const BUILD_STAGES = [
  { value: 'planowanie', title: 'Planowanie' },
  { value: 'stan_zero', title: 'Stan zero' },
  { value: 'stan_surowy_otwarty', title: 'SSO' },
  { value: 'stan_surowy_zamkniety', title: 'SSZ' },
  { value: 'wykonczenie', title: 'Wykończenie' },
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
  const { session } = useSupabaseAuth();
  const userId = session?.user?.id;
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<OnboardingStep>('build_type');

  const [buildType, setBuildType] = useState<string>('');
  const [buildStage, setBuildStage] = useState<string>('');
  const [plannedBudget, setPlannedBudget] = useState('');
  const [spentBudget, setSpentBudget] = useState('');

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
            .select('onboarding_step, build_type, build_stage')
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
        if (nextStep === 'build_stage' || nextStep === 'budget') {
          setStep(nextStep);
        } else {
          setStep('build_type');
        }

        setBuildType(String(profileRes.data?.build_type ?? '').trim());
        setBuildStage(String(profileRes.data?.build_stage ?? '').trim());

        if (investmentRes.data?.budzet !== null && investmentRes.data?.budzet !== undefined) {
          setPlannedBudget(String(investmentRes.data.budzet));
        }
      } catch (e: any) {
        Alert.alert('Błąd', e?.message ?? 'Nie udało się przygotować onboardingu.');
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [userId]);

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
      Alert.alert('Błąd', e?.message ?? 'Nie udało się zapisać wyboru.');
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
      Alert.alert('Błąd', e?.message ?? 'Nie udało się zapisać etapu.');
    } finally {
      setSaving(false);
    }
  };

  const saveBudget = async () => {
    if (!userId || saving) return;

    const budget = toNumber(plannedBudget);
    const spent = toNumber(spentBudget) ?? 0;

    if (budget === null || budget < 0) {
      Alert.alert('Błąd', 'Podaj poprawny planowany budżet.');
      return;
    }

    if (spent < 0) {
      Alert.alert('Błąd', 'Kwota poniesionych wydatków nie może być ujemna.');
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
      Alert.alert('Błąd', e?.message ?? 'Nie udało się zapisać budżetu.');
    } finally {
      setSaving(false);
    }
  };

  const renderBuildType = () => (
    <>
      <Text style={styles.title}>Jaką budowę prowadzisz?</Text>

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
              <Text style={styles.tileTitle}>{item.title}</Text>
            </BlurView>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );

  const renderBuildStage = () => (
    <>
      <Text style={styles.title}>Na jakim etapie budowy jesteś?</Text>

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
              <Text style={styles.tileTitle}>{item.title}</Text>
            </BlurView>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );

  const renderBudget = () => (
    <>
      <Text style={styles.title}>Budżet</Text>

      <BlurView intensity={18} tint="dark" style={styles.formCard}>
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Planowany budżet</Text>
          <View style={styles.inputWrap}>
            <Text style={styles.inputPrefix}>PLN</Text>
            <TextInput
              value={plannedBudget}
              onChangeText={setPlannedBudget}
              placeholder="np. 450000"
              placeholderTextColor="rgba(255,255,255,0.26)"
              keyboardType="numeric"
              style={styles.input}
            />
          </View>
        </View>

        <View style={styles.fieldWrapLast}>
          <Text style={styles.fieldLabel}>Już poniesione wydatki</Text>
          <View style={styles.inputWrap}>
            <Text style={styles.inputPrefix}>PLN</Text>
            <TextInput
              value={spentBudget}
              onChangeText={setSpentBudget}
              placeholder="np. 25000"
              placeholderTextColor="rgba(255,255,255,0.26)"
              keyboardType="numeric"
              style={styles.input}
            />
          </View>
        </View>
      </BlurView>

      <TouchableOpacity
        onPress={saveBudget}
        disabled={saving}
        activeOpacity={0.9}
        style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
      >
        {saving ? <ActivityIndicator color="#0B1120" /> : <Text style={styles.primaryBtnText}>Dalej</Text>}
      </TouchableOpacity>
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
          contentContainerStyle={[styles.content, { paddingTop: topPad }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={NEON} />
              <Text style={styles.loadingText}>Przygotowuję onboarding...</Text>
            </View>
          ) : step === 'build_type' ? (
            renderBuildType()
          ) : step === 'build_stage' ? (
            renderBuildStage()
          ) : (
            renderBudget()
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
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
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 44,
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
    color: '#FFFFFF',
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginBottom: 22,
    textAlign: 'center',
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
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
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
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  inputPrefix: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  primaryBtn: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NEON,
    marginTop: 18,
  },
  primaryBtnDisabled: {
    opacity: 0.68,
  },
  primaryBtnText: {
    color: '#0B1120',
    fontSize: 15,
    fontWeight: '900',
  },
});
