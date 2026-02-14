import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Image,
  Dimensions,
  Pressable,
  ScrollView,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTranslation } from 'react-i18next';
import { setAppLanguage, type AppLanguage } from '../../lib/i18n';

const { width: W, height: H } = Dimensions.get('window');

type Star = { left: number; top: number; size: number; opacity: number };

function buildStars(count: number): Star[] {
  const stars: Star[] = [];
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let i = 0; i < count; i++) {
    const size = 1 + Math.floor(rnd() * 2);
    stars.push({
      left: Math.floor(rnd() * W),
      top: Math.floor(rnd() * H),
      size,
      opacity: 0.2 + rnd() * 0.8,
    });
  }
  return stars;
}

export default function WelcomeScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation('auth');

  const floatY = useRef(new Animated.Value(0)).current;
  const stars = useMemo(() => buildStars(90), []);
  const [activeIndex, setActiveIndex] = useState(0);

  // ✅ WAŻNE: zależne od języka (wymusza przeliczenie t())
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
    [i18n.language] // <- najpewniejsza zależność
  );

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) router.replace('/(app)/(tabs)/dashboard');
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) router.replace('/(app)/(tabs)/dashboard');
    });

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -5, duration: 1600, useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ])
    ).start();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router, floatY]);

  const activeLang = (i18n.resolvedLanguage || i18n.language) as AppLanguage;

  const renderLangButton = (lng: AppLanguage, label: string) => {
    const isActive = activeLang === lng;
    return (
      <Pressable
        onPress={async () => {
          await setAppLanguage(lng);

          // ✅ UX: po zmianie języka wróć na pierwszy slajd, żeby było widać efekt
          setActiveIndex(0);
        }}
        style={[styles.langBtn, isActive && styles.langBtnActive]}
      >
        <Text style={[styles.langText, isActive && styles.langTextActive]}>{label}</Text>
      </Pressable>
    );
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / W);
    setActiveIndex(index);
  };

  return (
    <View style={styles.container}>
      <View style={styles.bgBase} />

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {stars.map((s, idx) => (
          <View
            key={idx}
            style={[
              styles.star,
              { left: s.left, top: s.top, width: s.size, height: s.size, opacity: s.opacity },
            ]}
          />
        ))}
      </View>

      <Animated.View style={[styles.logoWrap, { transform: [{ translateY: floatY }] }]}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logoImg}
          resizeMode="contain"
        />
      </Animated.View>

      <Text style={styles.brand}>doszkieletowego app</Text>

      <View style={styles.langRow}>
        {renderLangButton('pl', 'PL')}
        {renderLangButton('en', 'EN')}
      </View>

      {/* ✅ klucz na języku: ScrollView przebuduje się po zmianie języka */}
      <View style={styles.sliderWrap} key={`slider-${i18n.language}`}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
        >
          {slides.map((slide, index) => (
            <View key={slide.key} style={styles.slide}>
              <Image source={slide.icon} style={styles.slideIcon} resizeMode="contain" />
              <Text style={styles.slideTitle}>{slide.title}</Text>
              <Text style={styles.slideText}>{slide.text}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.pagination}>
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, activeIndex === i && styles.dotActive]} />
          ))}
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => router.push('/(auth)/login')}
        style={styles.primaryBtn}
      >
        <Text style={styles.primaryText}>{t('welcome.loginCta')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => router.push('/(auth)/register')}
        style={styles.secondaryBtn}
      >
        <Text style={styles.secondaryText}>{t('welcome.registerCta')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  bgBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  star: {
    position: 'absolute',
    borderRadius: 99,
    backgroundColor: '#FFFFFF',
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 10,
    marginTop: -100,
  },
  logoImg: {
    width: 120,
    height: 120,
  },
  brand: {
    fontSize: 34,
    fontWeight: '900',
    color: '#10B981',
    marginBottom: 18,
  },
  langRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  langBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  langBtnActive: {
    borderColor: '#25F0C8',
  },
  langText: {
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '800',
  },
  langTextActive: {
    color: '#25F0C8',
  },
  sliderWrap: {
    height: 320,
    marginBottom: 30,
  },
  slide: {
    width: W - 44,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  slideIcon: {
    width: 160,
    height: 160,
    marginBottom: 20,
  },
  slideTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#25F0C8',
    textAlign: 'center',
    marginBottom: 10,
  },
  slideText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 22,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: '#25F0C8',
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryText: {
    color: '#25F0C8',
    fontWeight: '900',
    fontSize: 18,
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
  },
  secondaryText: {
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '900',
    fontSize: 18,
  },
});
