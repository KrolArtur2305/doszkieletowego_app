import { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Image,
  Dimensions,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTranslation } from 'react-i18next';
import { setAppLanguage } from '../../lib/i18n';


const { width: W, height: H } = Dimensions.get('window');

// Domyślny tekst (możesz podmienić na jeden z 5 wariantów, jak wybierzesz)
const SALES_TEXT = 'welcome.salesText';

type Star = { left: number; top: number; size: number; opacity: number };

function buildStars(count: number): Star[] {
  // deterministyczne pozycje (żeby nie „skakały”)
  const stars: Star[] = [];
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let i = 0; i < count; i++) {
    const size = 1 + Math.floor(rnd() * 2); // 1–2px
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

  useEffect(() => {
    // jeśli user ma sesję -> dashboard
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

  return (
    <View style={styles.container}>
      {/* czarne tło */}
      <View style={styles.bgBase} />

      {/* gwiazdki */}
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

      {/* logo WYŻEJ i WIĘKSZE */}
      <Animated.View style={[styles.logoWrap, { transform: [{ translateY: floatY }] }]}>
        <Image source={require('../../assets/logo.png')} style={styles.logoImg} resizeMode="contain" />
      </Animated.View>

      {/* nazwa app */}
      <Text style={styles.brand}>doszkieletowego app</Text>

      {/* wybór języka */}
      <View style={styles.langRow}>
        <Pressable
          onPress={async () => {
            await setAppLanguage('pl');
          }}

          style={[styles.langBtn, i18n.language === 'pl' && styles.langBtnActive]}
        >
          <Text style={[styles.langText, i18n.language === 'pl' && styles.langTextActive]}>PL</Text>
        </Pressable>

        <Pressable
          onPress={async () => {
            await setAppLanguage('en');
         }}

          style={[styles.langBtn, i18n.language === 'en' && styles.langBtnActive]}
        >
          <Text style={[styles.langText, i18n.language === 'en' && styles.langTextActive]}>EN</Text>
        </Pressable>
      </View>

      {/* tekst bez tła, wyżej */}
      <Text style={styles.copy}>{t(SALES_TEXT)}</Text>

      {/* CTA */}
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
    marginTop: -120, // WYŻEJ (jak na screenie)
  },

  logoImg: {
    width: 120, // WIĘKSZE
    height: 120,
  },

  brand: {
    fontSize: 34,
    fontWeight: '900',
    color: '#10B981', // zielony
    textAlign: 'center',
    marginBottom: 18,
    letterSpacing: 0.2,
  },

  langRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },

  langBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },

  langBtnActive: {
    borderColor: 'rgba(16,185,129,0.95)',
    backgroundColor: 'rgba(16,185,129,0.16)',
  },

  langText: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.4,
  },

  langTextActive: {
    color: '#25F0C8',
  },

  copy: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 20,
    lineHeight: 28,
    textAlign: 'center',
    marginBottom: 56,
    paddingHorizontal: 8,
  },

  primaryBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.95)',
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
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
  },

  secondaryText: {
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '900',
    fontSize: 18,
  },
});
