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
import { supabase } from '../../lib/supabase';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';
import { AppButton, AppInput } from '../../src/ui/components';
import {
  BUDDY_AVATAR_OPTIONS,
  DEFAULT_BUDDY_AVATAR_ID,
  type BuddyAvatarId,
  getBuddyAvatarSource,
  loadBuddyAvatarId,
  saveBuddyAvatarId,
} from '../../src/services/buddy/avatar';

const NEON = '#25F0C8';
const ACCENT = '#19705C';
const BG = '#000000';

export default function BuddySettingsScreen() {
  const router = useRouter();
  const { session } = useSupabaseAuth();
  const { t } = useTranslation('buddy');

  const topPad =
    (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8;

  const [buddyName, setBuddyName] = useState('');
  const [initialName, setInitialName] = useState('');
  const [avatarId, setAvatarId] = useState<BuddyAvatarId>(DEFAULT_BUDDY_AVATAR_ID);
  const [initialAvatarId, setInitialAvatarId] = useState<BuddyAvatarId>(DEFAULT_BUDDY_AVATAR_ID);
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
          .select('ai_buddy_name, ai_buddy_avatar')
          .eq('user_id', userId)
          .single();

        if (dbError) throw dbError;
        const savedAvatarId = await loadBuddyAvatarId(userId);

        const savedName = data?.ai_buddy_name?.trim?.() || '';
        if (!mounted) return;

        setBuddyName(savedName);
        setInitialName(savedName);
        setAvatarId(savedAvatarId);
        setInitialAvatarId(savedAvatarId);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? t('settings.errors.load'));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [session?.user?.id, t]);

  const trimmedName = buddyName.trim();
  const previewName = trimmedName || t('settings.fallbackName');
  const hasChanges = trimmedName !== initialName.trim() || avatarId !== initialAvatarId;
  const avatarSource = getBuddyAvatarSource(avatarId);

  const handleSave = async () => {
    const userId = session?.user?.id;

    if (!userId) {
      setError(t('settings.errors.noSession'));
      return;
    }

    if (trimmedName.length > 30) {
      setError(t('settings.errors.nameTooLong'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (trimmedName) {
        const { error: dbError } = await supabase
          .from('profiles')
          .update({ ai_buddy_name: trimmedName })
          .eq('user_id', userId);

        if (dbError) throw dbError;
      }

      await saveBuddyAvatarId(userId, avatarId);
      setInitialName(trimmedName || initialName);
      setInitialAvatarId(avatarId);

      Alert.alert(t('settings.savedTitle'), t('settings.savedMessage'));
    } catch (e: any) {
      setError(e?.message ?? t('settings.errors.save'));
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
              <Text style={styles.backText}>{t('settings.back')}</Text>
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
                source={avatarSource}
                style={styles.avatarImage}
                resizeMode="cover"
              />

              <View style={styles.aiBadge}>
                <Feather name="cpu" size={10} color="#0B1120" />
                <Text style={styles.aiBadgeText}>AI</Text>
              </View>
            </Animated.View>

            <Text style={styles.title}>{t('settings.title')}</Text>
          </Animated.View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={NEON} />
              <Text style={styles.loadingText}>{t('settings.loading')}</Text>
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
                <Text style={styles.sectionLabel}>{t('settings.sections.name')}</Text>

                <BlurView intensity={16} tint="dark" style={styles.inputWrap}>
                  <Feather name="user" size={18} color="rgba(37,240,200,0.55)" />

                  <AppInput
                    value={buddyName}
                    onChangeText={(v) => {
                      setBuddyName(v);
                      if (error) setError(null);
                    }}
                    placeholder={t('settings.placeholder')}
                    placeholderTextColor="#888888"
                    maxLength={30}
                    autoCapitalize="words"
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                    style={styles.inputField}
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
                <Text style={styles.sectionLabel}>{t('settings.sections.avatar')}</Text>

                <View style={styles.avatarOptionsRow}>
                  {BUDDY_AVATAR_OPTIONS.map((option) => {
                    const active = avatarId === option.id;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        onPress={() => setAvatarId(option.id)}
                        activeOpacity={0.85}
                        style={[styles.avatarOption, active && styles.avatarOptionActive]}
                      >
                        <Image source={option.source} style={styles.avatarOptionImage} resizeMode="cover" />
                        {active ? (
                          <View style={styles.avatarOptionCheck}>
                            <Feather name="check" size={12} color="#0B1120" />
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <BlurView intensity={14} tint="dark" style={styles.singleInfo}>
                  <Feather name="image" size={16} color={NEON} />
                  <Text style={styles.singleInfoText}>{t('settings.avatarInfo')}</Text>
                </BlurView>

                {hasChanges ? (
                  <View style={styles.footerWrap}>
                    <AppButton
                      title="Zapisz i aktywuj"
                      onPress={handleSave}
                      loading={saving}
                      style={styles.saveBtn}
                    />
                  </View>
                ) : null}
              </Animated.View>
            </>
          )}

          <View style={{ height: 36 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      </View>
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
    marginBottom: 18,
  },

  avatarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
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
    width: 172,
    height: 172,
    borderRadius: 86,
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
    color: NEON,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.35,
    textAlign: 'center',
    marginBottom: 0,
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
    backgroundColor: '#0B0F14',
  },

  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  inputField: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
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

  avatarOptionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    justifyContent: 'space-between',
  },

  avatarOption: {
    position: 'relative',
    width: 82,
    height: 82,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.4,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  avatarOptionActive: {
    borderColor: 'rgba(37,240,200,0.52)',
    shadowColor: NEON,
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },

  avatarOptionImage: {
    width: '100%',
    height: '100%',
  },

  avatarOptionCheck: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: NEON,
  },

  singleInfoText: {
    flex: 1,
    color: 'rgba(255,255,255,0.52)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },

  footerWrap: {
    marginTop: 14,
  },

  saveBtn: {
    minHeight: 58,
    borderRadius: 20,
    shadowColor: NEON,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },

  saveBtnDisabled: {
    opacity: 0.5,
  },

});
