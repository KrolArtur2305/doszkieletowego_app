import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ScrollView as ScrollViewType } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { supabase } from '../../lib/supabase';
import { setAppLanguage, type AppLanguage } from '../../lib/i18n';
import { AppButton, AppScreen } from '../../src/ui/components';
import { colors, radius, spacing, typography } from '../../src/ui/theme';

const { width: W } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation('auth');

  const floatY = useRef(new Animated.Value(0)).current;
  const sliderRef = useRef<ScrollViewType | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const slides = useMemo(
    () => [
      {
        key: 'budget',
        title: t('welcome.slides.budget.title'),
        text: t('welcome.slides.budget.text'),
        icon: require('../../assets/icons/welcome/budget.png'),
      },
      {
        key: 'documents',
        title: t('welcome.slides.documents.title'),
        text: t('welcome.slides.documents.text'),
        icon: require('../../assets/icons/welcome/documents.png'),
      },
      {
        key: 'project',
        title: t('welcome.slides.project.title'),
        text: t('welcome.slides.project.text'),
        icon: require('../../assets/icons/welcome/project.png'),
      },
      {
        key: 'progress',
        title: t('welcome.slides.progress.title'),
        text: t('welcome.slides.progress.text'),
        icon: require('../../assets/icons/welcome/progress.png'),
      },
      {
        key: 'photos',
        title: t('welcome.slides.photos.title'),
        text: t('welcome.slides.photos.text'),
        icon: require('../../assets/icons/welcome/photos.png'),
      },
    ],
    [i18n.language, t]
  );

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) router.replace('/(app)');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace('/(app)');
    });

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -5, duration: 1600, useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ])
    );

    loop.start();

    return () => {
      mounted = false;
      loop.stop();
      sub.subscription.unsubscribe();
    };
  }, [floatY, router]);

  const activeLang = (i18n.resolvedLanguage || i18n.language) as AppLanguage;

  const renderLangButton = (lng: AppLanguage, label: string) => {
    const isActive = activeLang === lng;

    return (
      <Pressable
        onPress={async () => {
          await setAppLanguage(lng);
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

  return (
    <AppScreen>
      <View style={styles.container}>
        <View style={styles.topBlock}>
          <Animated.View style={[styles.logoWrap, { transform: [{ translateY: floatY }] }]}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.logoImg}
              resizeMode="contain"
            />
          </Animated.View>

          <Text style={styles.brand}>BuildIQ</Text>

          <View style={styles.langRow}>
            {renderLangButton('pl', 'PL')}
            {renderLangButton('en', 'EN')}
            {renderLangButton('de', 'DE')}
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

        <View style={styles.actions}>
          <AppButton
            title={t('welcome.loginCta')}
            onPress={() => router.push('/(auth)/login')}
            style={styles.primaryBtn}
          />

          <AppButton
            title={t('welcome.registerCta')}
            onPress={() => router.push('/(auth)/register')}
            variant="secondary"
            style={styles.secondaryBtn}
          />
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  logoImg: {
    width: 140,
    height: 140,
  },
  brand: {
    ...typography.screenTitle,
    color: colors.accentBright,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  langRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm + 2,
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
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  sliderTrack: {
    alignItems: 'stretch',
  },
  slide: {
    width: W,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl + 6,
  },
  slideIcon: {
    width: 210,
    height: 210,
    marginBottom: spacing.md,
  },
  slideTitle: {
    ...typography.sectionTitle,
    color: colors.accentBright,
    textAlign: 'center',
    marginBottom: spacing.sm + 2,
  },
  slideText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSoft,
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
    backgroundColor: colors.accentBright,
  },
  actions: {
    width: '100%',
    marginTop: spacing.sm,
  },
  primaryBtn: {
    width: '100%',
    marginBottom: spacing.md,
  },
  secondaryBtn: {
    width: '100%',
  },
});
