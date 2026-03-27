import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';

const NEON = '#25F0C8';
const ACCENT = '#19705C';
const BG = '#000000';

const BUDDY_AVATAR = require('../../assets/buddy_avatar.png');

export default function BuddySettingsScreen() {
  const router = useRouter();
  const { session } = useSupabaseAuth();

  const topPad =
    (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8;

  const [buddyName, setBuddyName] = useState('');
  const [initialName, setInitialName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 550,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 550,
        useNativeDriver: true,
      }),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -6,
          duration: 2200,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2200,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [fadeAnim, slideAnim, floatAnim]);

  useEffect(() => {
    let mounted = true;

    const loadProfile = async () => {
      try {
        const userId = session?.user?.id;
        if (!userId) {
          setLoading(false);
          return;
        }

        const { data, error: dbError } = await supabase
          .from('profiles')
          .select('ai_buddy_name')
          .eq('user_id', userId)
          .single();

        if (dbError) throw dbError;

        const savedName = data?.ai_buddy_name?.trim?.() || '';
        if (!mounted) return;

        setBuddyName(savedName);
        setInitialName(savedName);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? 'Nie udało się pobrać ustawień kierownika AI');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [session?.user?.id]);

  const trimmedName = buddyName.trim();
  const previewName = trimmedName || 'Kierownik AI';
  const hasChanges = trimmedName !== initialName.trim();

  const handleSave = async () => {
    const userId = session?.user?.id;

    if (!userId) {
      setError('Brak aktywnej sesji użytkownika');
      return;
    }

    if (!trimmedName) {
      setError('Podaj imię kierownika');
      return;
    }

    if (trimmedName.length > 30) {
      setError('Imię może mieć maksymalnie 30 znaków');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ ai_buddy_name: trimmedName })
        .eq('user_id', userId);

      if (dbError) throw dbError;

      setInitialName(trimmedName);

      Alert.alert('Zapisano', 'Ustawienia kierownika AI zostały zapisane.');
    } catch (e: any) {
      setError(e?.message ?? 'Nie udało się zapisać zmian');
    } finally {
      setSaving(false);
    }
  };

  return (
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
          <Animated.View
            style={{
              width: '100%',
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }}
          >
            <TouchableOpacity
              onPress={() => router.back()}
              activeOpacity={0.85}
              style={styles.backBtn}
            >
              <Feather name="chevron-left" size={18} color="#FFFFFF" />
              <Text style={styles.backText}>Wróć</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View
            style={[
              styles.heroWrap,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.eyebrowWrap}>
              <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrow}>USTAWIENIA · KIEROWNIK AI</Text>
            </View>

            <Animated.View
              style={[
                styles.avatarWrap,
                {
                  transform: [{ translateY: floatAnim }],
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

            <Text style={styles.title}>Kierownik AI</Text>
            <Text style={styles.subtitle}>
              Ustaw imię swojego cyfrowego kierownika budowy. To tylko warstwa
              personalizacji — bez zbędnych opcji.
            </Text>
          </Animated.View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={NEON} />
              <Text style={styles.loadingText}>Ładowanie ustawień...</Text>
            </View>
          ) : (
            <>
              <Animated.View
                style={[
                  styles.section,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                  },
                ]}
              >
                <Text style={styles.sectionLabel}>Imię kierownika</Text>

                <BlurView intensity={16} tint="dark" style={styles.inputWrap}>
                  <Feather name="user" size={18} color="rgba(37,240,200,0.55)" />

                  <TextInput
                    value={buddyName}
                    onChangeText={(v) => {
                      setBuddyName(v);
                      if (error) setError(null);
                    }}
                    placeholder="np. Andrzej, Max, Adam..."
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    style={styles.input}
                    maxLength={30}
                    autoCapitalize="words"
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                  />

                  <Text style={styles.inputCount}>{buddyName.length}/30</Text>
                </BlurView>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}
              </Animated.View>

              <Animated.View
                style={[
                  styles.section,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                  },
                ]}
              >
                <Text style={styles.sectionLabel}>Podgląd</Text>

                <BlurView intensity={14} tint="dark" style={styles.previewCard}>
                  <View style={styles.previewHeader}>
                    <View style={styles.previewAvatarMini}>
                      <Image
                        source={BUDDY_AVATAR}
                        style={styles.previewAvatarMiniImg}
                        resizeMode="cover"
                      />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.previewName}>{previewName}</Text>
                      <Text style={styles.previewRole}>
                        Twój cyfrowy kierownik budowy
                      </Text>
                    </View>
                  </View>

                  <View style={styles.previewBubble}>
                    <Text style={styles.previewBubbleText}>
                      Cześć, jestem {previewName}. Pomogę Ci pilnować budżetu,
                      etapów i najważniejszych rzeczy na budowie.
                    </Text>
                  </View>
                </BlurView>
              </Animated.View>

              <Animated.View
                style={[
                  styles.section,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                  },
                ]}
              >
                <Text style={styles.sectionLabel}>Avatar</Text>

                <BlurView intensity={14} tint="dark" style={styles.singleInfo}>
                  <Feather name="image" size={16} color={NEON} />
                  <Text style={styles.singleInfoText}>
                    Obecnie dostępny jest 1 avatar. W przyszłości możesz dodać
                    kolejne warianty.
                  </Text>
                </BlurView>
              </Animated.View>

              <Animated.View
                style={[
                  styles.footerWrap,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                  },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    (!hasChanges || saving) && styles.saveBtnDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={!hasChanges || saving}
                  activeOpacity={0.9}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#0B1120" />
                  ) : (
                    <>
                      <Text style={styles.saveBtnText}>Zapisz ustawienia</Text>
                      <Feather name="check" size={18} color="#0B1120" />
                    </>
                  )}
                </TouchableOpacity>
              </Animated.View>
            </>
          )}

          <View style={{ height: 36 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
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
    opacity: 0.1,
    top: -180,
    right: -120,
  },

  glowBottom: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 999,
    backgroundColor: NEON,
    opacity: 0.05,
    bottom: -40,
    left: -110,
  },

  content: {
    paddingHorizontal: 20,
  },

  backBtn: {
    alignSelf: 'flex-start',
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },

  backText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  heroWrap: {
    alignItems: 'center',
    marginBottom: 28,
  },

  eyebrowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.20)',
    marginBottom: 24,
  },

  eyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    backgroundColor: NEON,
    shadowColor: NEON,
    shadowOpacity: 0.85,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },

  eyebrow: {
    color: NEON,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  avatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    position: 'relative',
  },

  avatarGlowRing: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 1.5,
    borderColor: 'rgba(37,240,200,0.22)',
  },

  avatarGlowRing2: {
    position: 'absolute',
    width: 194,
    height: 194,
    borderRadius: 97,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.08)',
  },

  avatarImage: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 2.2,
    borderColor: 'rgba(37,240,200,0.35)',
  },

  aiBadge: {
    position: 'absolute',
    bottom: 8,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: NEON,
  },

  aiBadgeText: {
    color: '#0B1120',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.35,
    textAlign: 'center',
    marginBottom: 10,
  },

  subtitle: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 520,
  },

  loadingWrap: {
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },

  loadingText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
  },

  section: {
    marginBottom: 20,
  },

  sectionLabel: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1.4,
    borderColor: 'rgba(37,240,200,0.22)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },

  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },

  inputCount: {
    color: 'rgba(255,255,255,0.24)',
    fontSize: 11,
    fontWeight: '700',
  },

  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },

  previewCard: {
    borderRadius: 22,
    borderWidth: 1.2,
    borderColor: 'rgba(37,240,200,0.18)',
    padding: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },

  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },

  previewAvatarMini: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    borderWidth: 1.4,
    borderColor: 'rgba(37,240,200,0.22)',
  },

  previewAvatarMiniImg: {
    width: '100%',
    height: '100%',
  },

  previewName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },

  previewRole: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 12,
    fontWeight: '600',
  },

  previewBubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(37,240,200,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.12)',
  },

  previewBubbleText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 20,
  },

  singleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: 'rgba(37,240,200,0.14)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },

  singleInfoText: {
    flex: 1,
    color: 'rgba(255,255,255,0.52)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },

  footerWrap: {
    marginTop: 4,
  },

  saveBtn: {
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: NEON,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: NEON,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },

  saveBtnDisabled: {
    opacity: 0.5,
  },

  saveBtnText: {
    color: '#0B1120',
    fontSize: 16,
    fontWeight: '900',
  },
});