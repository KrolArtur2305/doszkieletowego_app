import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Keyboard,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import type { ScrollView as ScrollViewType } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  clearPendingInviteCode,
  setPendingInviteCode,
  validateInvestmentInviteCode,
} from '../../lib/investmentInvite';
import { setCurrencyForLanguage } from '../../lib/currency';
import { LANGUAGE_OPTIONS, setAppLanguage, type AppLanguage } from '../../lib/i18n';
import { recordCheckpoint } from '../../lib/runtimeDiagnostics';
import { AppButton, AppCard, AppInput, AppScreen } from '../../src/ui/components';
import { colors, radius, spacing, typography } from '../../src/ui/theme';

const { width: W } = Dimensions.get('window');
const APP_LOGO = require('../../assets/logo.png');

export default function WelcomeScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation('auth');

  const sliderRef = useRef<ScrollViewType | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinChecking, setJoinChecking] = useState(false);

  useEffect(() => {
    void recordCheckpoint('auth/welcome');
  }, []);

  const slides = useMemo(
    () => [
      {
        key: 'budget',
        title: t('welcome.slides.budget.title'),
        text: t('welcome.slides.budget.text'),
        icon: require('../../assets/icons/welcome/budget.png'),
      },
      {
        key: 'ai',
        title: t('welcome.slides.ai.title'),
        text: t('welcome.slides.ai.text'),
        icon: require('../../assets/icons/welcome/ai.png'),
      },
      {
        key: 'progress',
        title: t('welcome.slides.progress.title'),
        text: t('welcome.slides.progress.text'),
        icon: require('../../assets/icons/welcome/progress.png'),
      },
      {
        key: 'project',
        title: t('welcome.slides.project.title'),
        text: t('welcome.slides.project.text'),
        icon: require('../../assets/icons/welcome/project.png'),
      },
      {
        key: 'photos',
        title: t('welcome.slides.photos.title'),
        text: t('welcome.slides.photos.text'),
        icon: require('../../assets/icons/welcome/photos.png'),
      },
      {
        key: 'documents',
        title: t('welcome.slides.documents.title'),
        text: t('welcome.slides.documents.text'),
        icon: require('../../assets/icons/welcome/documents.png'),
      },
    ],
    [i18n.language, t]
  );

  const activeLang = (i18n.resolvedLanguage || i18n.language) as AppLanguage;

  const renderLangButton = (lng: AppLanguage, label: string) => {
    const isActive = activeLang === lng;

    return (
      <Pressable
        key={lng}
        onPress={async () => {
          await setAppLanguage(lng);
          await setCurrencyForLanguage(lng);
          sliderRef.current?.scrollTo({ x: 0, animated: false });
          setActiveIndex(0);
        }}
        style={[styles.langBtn, isActive && styles.langBtnActive]}
      >
        <Text style={[styles.langText, isActive && styles.langTextActive]}>{label}</Text>
      </Pressable>
    );
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / W);
    const clampedIndex = Math.max(0, Math.min(slides.length - 1, nextIndex));
    setActiveIndex(clampedIndex);
  };

  const saveInviteCodeAndGo = async (target: '/(auth)/register' | '/(auth)/login') => {
    if (joinChecking) return;

    const cleaned = inviteCode.trim().replace(/\s+/g, '').toUpperCase();
    if (!cleaned) {
      setJoinError(t('welcome.join.error'));
      return;
    }

    setJoinChecking(true);
    setJoinError('');

    try {
      const isValid = await validateInvestmentInviteCode(cleaned);
      if (!isValid) {
        setJoinError(t('welcome.join.invalidCode'));
        return;
      }

      await setPendingInviteCode(cleaned);
      setJoinModalOpen(false);
      setJoinError('');
      router.push(target);
    } catch (error) {
      console.warn('[Invite] preflight validation failed:', error);
      setJoinError(t('welcome.join.validationError'));
    } finally {
      setJoinChecking(false);
    }
  };

  return (
    <AppScreen scroll contentContainerStyle={styles.container}>
        <View style={styles.topBlock}>
          <View style={styles.brandStack}>
            <Image source={APP_LOGO} style={styles.brandLogo} resizeMode="contain" />
            <View style={styles.brandName} accessibilityLabel="BuildIQ">
              <Text style={[styles.brandNameText, styles.brandNameBuild]}>Build</Text>
              <Text style={[styles.brandNameText, styles.brandNameIq]}>IQ</Text>
            </View>
          </View>

          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>{t('welcome.heroTitle')}</Text>
          </View>


          <View style={styles.langRow}>
            {LANGUAGE_OPTIONS.map((lang) => renderLangButton(lang.key, lang.shortLabel))}
          </View>
        </View>

        <View style={styles.sliderWrap} key={`slider-${i18n.language}`}>
          <ScrollView
            ref={sliderRef}
            horizontal
            pagingEnabled
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScroll}
            contentContainerStyle={styles.sliderTrack}
          >
            {slides.map((slide) => (
              <View key={slide.key} style={styles.slide}>
                <Image source={slide.icon} style={styles.slideIcon} resizeMode="contain" />
                <Text style={styles.slideTitle}>{slide.title}</Text>
                <Text style={styles.slideText}>{slide.text}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.pagination}>
            {slides.map((_, index) => (
              <View key={index} style={[styles.dot, activeIndex === index && styles.dotActive]} />
            ))}
          </View>
        </View>

        <AppCard style={styles.actionsCard} contentStyle={styles.actionsCardContent} withShadow={false}>
          <View style={styles.actions}>
            <AppButton
              title={t('welcome.loginCta')}
              onPress={async () => {
                await clearPendingInviteCode();
                router.push('/(auth)/login');
              }}
              style={styles.primaryBtn}
            />

            <AppButton
              title={t('welcome.registerCta')}
              onPress={async () => {
                await clearPendingInviteCode();
                router.push('/(auth)/register');
              }}
              variant="secondary"
              style={styles.secondaryBtn}
            />

            <Pressable
              onPress={() => {
                setJoinError('');
                setJoinModalOpen(true);
              }}
              style={styles.joinLink}
            >
              <Text style={styles.joinLinkText}>{t('welcome.join.cta')}</Text>
            </Pressable>
          </View>
        </AppCard>

        <Modal
          visible={joinModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setJoinModalOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <View style={styles.joinCard}>
                <Text style={styles.joinTitle}>{t('welcome.join.title')}</Text>
                <Text style={styles.joinSubtitle}>{t('welcome.join.subtitle')}</Text>

                <AppInput
                  value={inviteCode}
                  onChangeText={(value) => {
                    setInviteCode(value.toUpperCase());
                    if (joinError) setJoinError('');
                  }}
                  placeholder={t('welcome.join.placeholder')}
                  autoCapitalize="characters"
                  containerStyle={styles.joinInputWrap}
                  style={styles.joinInput}
                />

                {!!joinError && <Text style={styles.joinError}>{joinError}</Text>}

                <AppButton
                  title={joinChecking ? t('welcome.join.checking') : t('welcome.join.registerAction')}
                  loading={joinChecking}
                  onPress={() => saveInviteCodeAndGo('/(auth)/register')}
                  style={styles.joinPrimary}
                />

                <AppButton
                  title={t('welcome.join.loginAction')}
                  onPress={() => saveInviteCodeAndGo('/(auth)/login')}
                  disabled={joinChecking}
                  variant="secondary"
                  style={styles.joinSecondary}
                />

                <Pressable onPress={() => setJoinModalOpen(false)} style={styles.joinCancel}>
                  <Text style={styles.joinCancelText}>{t('common:cancel')}</Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: spacing.xl + 2,
    paddingTop: spacing['2xl'] + 12,
    paddingBottom: spacing.xl,
    backgroundColor: colors.bg,
  },
  topBlock: {
    width: '100%',
    alignItems: 'center',
    gap: spacing['2xl'],
    marginBottom: spacing.md,
  },
  brandStack: {
    alignItems: 'center',
    marginTop: -24,
    marginBottom: -26,
  },
  brandLogo: {
    width: 146,
    height: 146,
  },
  brandName: {
    marginTop: -36,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandNameText: {
    fontSize: 29,
    lineHeight: 34,
    fontFamily: 'Syne_800ExtraBold',
    fontWeight: '800',
    letterSpacing: -0.44,
    includeFontPadding: false,
  },
  brandNameBuild: {
    color: '#FFFFFF',
  },
  brandNameIq: {
    color: '#0E8F84',
  },
  heroCopy: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  heroTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 28,
  },
  langRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm + 2,
    alignSelf: 'center',
  },
  langBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceAlt,
  },
  langBtnActive: {
    borderColor: colors.borderFocus,
    backgroundColor: colors.accentFill,
  },
  langText: {
    ...typography.label,
    color: colors.textSoft,
  },
  langTextActive: {
    color: colors.accentBright,
  },
  sliderWrap: {
    width: W,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  sliderTrack: {
    alignItems: 'stretch',
  },
  slide: {
    width: W,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl + spacing.lg,
  },
  slideIcon: {
    width: 196,
    height: 196,
    marginBottom: spacing.md,
  },
  slideTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm + 2,
  },
  slideText: {
    ...typography.body,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: 'center',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    marginHorizontal: 4,
    borderRadius: 99,
    backgroundColor: colors.textFaint,
  },
  dotActive: {
    backgroundColor: colors.textSoft,
  },
  actionsCard: {
    width: '100%',
    marginTop: 0,
  },
  actionsCardContent: {
    padding: spacing.lg,
  },
  actions: {
    width: '100%',
  },
  primaryBtn: {
    width: '100%',
    marginBottom: spacing.md,
  },
  secondaryBtn: {
    width: '100%',
  },
  joinLink: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  joinLinkText: {
    ...typography.button,
    color: colors.accentBright,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  joinCard: {
    borderRadius: radius.xl + 2,
    padding: spacing.xl,
    backgroundColor: '#050505',
    borderWidth: 1.5,
    borderColor: colors.borderFocus,
    shadowColor: '#000',
    shadowOpacity: 0.7,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
  },
  joinTitle: {
    ...typography.sectionTitle,
    color: colors.text,
    textAlign: 'center',
  },
  joinSubtitle: {
    ...typography.body,
    color: colors.textSoft,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  joinInputWrap: {
    marginBottom: spacing.sm,
  },
  joinInput: {
    textAlign: 'center',
    letterSpacing: 2,
    fontWeight: '900',
  },
  joinError: {
    ...typography.meta,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  joinPrimary: {
    width: '100%',
    marginTop: spacing.sm,
  },
  joinSecondary: {
    width: '100%',
    marginTop: spacing.sm,
  },
  joinCancel: {
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  joinCancelText: {
    ...typography.button,
    color: colors.textSoft,
  },
});
