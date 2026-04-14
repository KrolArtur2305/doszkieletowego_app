import { useEffect, useRef, useState } from 'react';
import {
  Animated,
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
  Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';

const NEON = '#25F0C8';
const ACCENT = '#19705C';

const BUDDY_AVATAR = require('../../assets/buddy_avatar.png');

const FEATURES = [
  {
    icon: 'trending-up' as const,
    titleKey: 'buddy.feature1.title',
    titleDefault: 'Analiza budżetu',
    descKey: 'buddy.feature1.desc',
    descDefault: 'Ocenia Twoje wydatki i ostrzega gdy coś jest nie tak',
  },
  {
    icon: 'bell' as const,
    titleKey: 'buddy.feature2.title',
    titleDefault: 'Inteligentne alerty',
    descKey: 'buddy.feature2.desc',
    descDefault: 'Sam wychodzi z informacją gdy dzieje się coś ważnego',
  },
  {
    icon: 'calendar' as const,
    titleKey: 'buddy.feature3.title',
    titleDefault: 'Pilnuje harmonogramu',
    descKey: 'buddy.feature3.desc',
    descDefault: 'Przypomina o zadaniach i śledzi postęp etapów',
  },
  {
    icon: 'message-circle' as const,
    titleKey: 'buddy.feature4.title',
    titleDefault: 'Zawsze do dyspozycji',
    descKey: 'buddy.feature4.desc',
    descDefault: 'Pytaj o wszystko związane z budową, odpowie od razu',
  },
];

export default function BuddyOnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation('settings');
  const { session } = useSupabaseAuth();
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8;

  const [buddyName, setBuddyName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avatarAnim = useRef(new Animated.Value(0)).current;
  const contentAnim = useRef(new Animated.Value(0)).current;
  const avatarScale = useRef(new Animated.Value(0.8)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(avatarAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(avatarScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
      ]),
      Animated.timing(contentAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -8, duration: 2200, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ])
    );
    float.start();
    return () => float.stop();
  }, []);

  const handleSave = async () => {
    const name = buddyName.trim();
    if (!name) {
      setError(t('buddy.nameRequired', { defaultValue: 'Podaj imię kierownika' }));
      return;
    }
    if (name.length > 30) {
      setError(t('buddy.nameTooLong', { defaultValue: 'Imię może mieć max 30 znaków' }));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const userId = session?.user?.id;
      if (!userId) throw new Error('Brak sesji');

      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ ai_buddy_name: name })
        .eq('user_id', userId);

      if (dbErr) throw dbErr;

      router.replace('/(app)/(tabs)/dashboard');
    } catch (e: any) {
      setError(e?.message ?? t('buddy.saveError', { defaultValue: 'Nie udało się zapisać' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.screen}>
        <View pointerEvents="none" style={styles.bg} />

        <View pointerEvents="none" style={styles.glowTop} />
        <View pointerEvents="none" style={styles.glowBottom} />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[styles.content, { paddingTop: topPad }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View style={{ opacity: avatarAnim, alignItems: 'center' }}>
              <View style={styles.eyebrowWrap}>
                <View style={styles.eyebrowDot} />
                <Text style={styles.eyebrow}>
                  {t('buddy.eyebrow', { defaultValue: 'Kierownik AI' })}
                </Text>
              </View>
            </Animated.View>

            <Animated.View
              style={[
                styles.avatarWrap,
                {
                  opacity: avatarAnim,
                  transform: [{ scale: avatarScale }, { translateY: floatAnim }],
                },
              ]}
            >
              <View style={styles.avatarGlowRing} />
              <View style={styles.avatarGlowRing2} />

              <Image
                source={BUDDY_AVATAR}
                style={styles.avatarImage}
                resizeMode="cover"
              />

              <View style={styles.aiBadge}>
                <Feather name="cpu" size={10} color="#0B1120" />
                <Text style={styles.aiBadgeText}>AI</Text>
              </View>
            </Animated.View>

            <Animated.View
              style={[
                styles.titleWrap,
                {
                  opacity: contentAnim,
                  transform: [{
                    translateY: contentAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
                  }],
                },
              ]}
            >
              <Text style={styles.title}>
                {t('buddy.onboarding.title', { defaultValue: 'Poznaj swojego\nkierownika budowy' })}
              </Text>
              <Text style={styles.subtitle}>
                {t('buddy.onboarding.subtitle', { defaultValue: 'Nadaj mu imię, będzie Twoim partnerem przez całą budowę' })}
              </Text>
            </Animated.View>

            <Animated.View style={[styles.inputSection, { opacity: contentAnim }]}>
              <Text style={styles.inputLabel}>
                {t('buddy.onboarding.nameLabel', { defaultValue: 'Imię kierownika' })}
              </Text>
              <BlurView intensity={14} tint="dark" style={styles.inputWrap}>
                <Feather name="user" size={18} color="rgba(37,240,200,0.50)" />
                <TextInput
                  value={buddyName}
                  onChangeText={(v) => {
                    setBuddyName(v);
                    setError(null);
                  }}
                  placeholder={t('buddy.onboarding.namePlaceholder', { defaultValue: 'np. Andrzej, Max, Tomek...' })}
                  placeholderTextColor="#888888"
                  style={styles.input}
                  maxLength={30}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
                {buddyName.length > 0 && (
                  <Text style={styles.inputCount}>{buddyName.length}/30</Text>
                )}
              </BlurView>
              {error && (
                <Text style={styles.errorText}>{error}</Text>
              )}
            </Animated.View>

            <Animated.View style={[styles.featuresWrap, { opacity: contentAnim }]}>
              <Text style={styles.featuresTitle}>
                {t('buddy.onboarding.featuresTitle', { defaultValue: 'Co potrafi Twój kierownik?' })}
              </Text>
              {FEATURES.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <View style={styles.featureIconWrap}>
                    <Feather name={f.icon} size={16} color={NEON} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>
                      {t(f.titleKey, { defaultValue: f.titleDefault })}
                    </Text>
                    <Text style={styles.featureDesc}>
                      {t(f.descKey, { defaultValue: f.descDefault })}
                    </Text>
                  </View>
                </View>
              ))}
            </Animated.View>

            <Animated.View style={[styles.proNote, { opacity: contentAnim }]}>
              <Feather name="star" size={13} color={NEON} />
              <Text style={styles.proNoteText}>
                {t('buddy.onboarding.proNote', {
                  defaultValue:
                    'Na premierę kierownik AI jest dostępny dla wszystkich użytkowników. Płatne plany pojawią się w kolejnej aktualizacji.',
                })}
              </Text>
            </Animated.View>

            <Animated.View style={[{ opacity: contentAnim }, styles.ctaWrap]}>
              <TouchableOpacity
                style={[styles.ctaBtn, saving && { opacity: 0.65 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.9}
              >
                <Text style={styles.ctaBtnText}>
                  {saving
                    ? t('buddy.onboarding.saving', { defaultValue: 'Zapisywanie...' })
                    : t('buddy.onboarding.cta', { defaultValue: 'Poznaj kierownika' })
                  }
                </Text>
                {!saving && <Feather name="arrow-right" size={18} color="#0B1120" />}
              </TouchableOpacity>
            </Animated.View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  glowTop: {
    position: 'absolute', width: 400, height: 400, borderRadius: 999,
    backgroundColor: ACCENT, opacity: 0.08, top: -200, right: -150,
  },
  glowBottom: {
    position: 'absolute', width: 300, height: 300, borderRadius: 999,
    backgroundColor: NEON, opacity: 0.04, bottom: 0, left: -100,
  },

  content: { paddingHorizontal: 24, alignItems: 'center' },

  eyebrowWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.20)',
    marginBottom: 24,
  },
  eyebrowDot: {
    width: 6, height: 6, borderRadius: 99, backgroundColor: NEON,
    shadowColor: NEON, shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  eyebrow: { color: NEON, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },

  avatarWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 28, position: 'relative' },
  avatarGlowRing: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    borderWidth: 1.5, borderColor: 'rgba(37,240,200,0.20)',
  },
  avatarGlowRing2: {
    position: 'absolute', width: 230, height: 230, borderRadius: 115,
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.08)',
  },
  avatarImage: {
    width: 180, height: 180, borderRadius: 90,
    borderWidth: 2.5, borderColor: 'rgba(37,240,200,0.35)',
  },
  aiBadge: {
    position: 'absolute', bottom: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
    backgroundColor: NEON,
  },
  aiBadgeText: { color: '#0B1120', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  titleWrap: { alignItems: 'center', marginBottom: 28 },
  title: {
    color: '#FFFFFF', fontSize: 28, fontWeight: '900',
    letterSpacing: -0.3, textAlign: 'center', lineHeight: 34, marginBottom: 10,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.45)', fontSize: 14, fontWeight: '600',
    textAlign: 'center', lineHeight: 20,
  },

  inputSection: { width: '100%', marginBottom: 28 },
  inputLabel: {
    color: 'rgba(255,255,255,0.40)', fontSize: 11, fontWeight: '900',
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(37,240,200,0.25)',
    paddingHorizontal: 16, paddingVertical: 14, overflow: 'hidden',
    backgroundColor: '#0B0F14',
  },
  input: {
    flex: 1, color: '#FFFFFF', fontSize: 18, fontWeight: '700',
  },
  inputCount: { color: 'rgba(255,255,255,0.25)', fontSize: 11, fontWeight: '700' },
  errorText: { color: '#FCA5A5', fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'center' },

  featuresWrap: { width: '100%', marginBottom: 16 },
  featuresTitle: {
    color: 'rgba(255,255,255,0.38)', fontSize: 11, fontWeight: '900',
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14,
  },
  featureRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    marginBottom: 14,
  },
  featureIconWrap: {
    width: 36, height: 36, borderRadius: 12, flexShrink: 0,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  featureTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', marginBottom: 3 },
  featureDesc: { color: 'rgba(255,255,255,0.45)', fontSize: 12.5, fontWeight: '600', lineHeight: 18 },

  proNote: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
    backgroundColor: 'rgba(37,240,200,0.06)',
    borderWidth: 1, borderColor: 'rgba(37,240,200,0.12)',
    marginBottom: 24, alignSelf: 'stretch',
  },
  proNoteText: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '600', flex: 1 },

  ctaWrap: { width: '100%' },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: 20, paddingVertical: 17,
    backgroundColor: NEON,
    shadowColor: NEON, shadowOpacity: 0.30, shadowRadius: 20, shadowOffset: { width: 0, height: 0 },
  },
  ctaBtnText: { color: '#0B1120', fontSize: 17, fontWeight: '900' },
});
