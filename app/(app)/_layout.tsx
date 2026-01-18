import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, StyleSheet, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';

import { supabase } from '../../lib/supabase';
import { useSupabaseAuth } from '../../hooks/useSupabaseAuth';

const BG = '#000000';
const NEON = '#25F0C8';
const BRAND = '#19705C';

type Particle = {
  id: number;
  size: number;
  color: string;
  glow: boolean;

  x: Animated.Value;
  y: Animated.Value;
  o: Animated.Value; // opacity
  s: Animated.Value; // scale
};

export default function AppLayout() {
  const { session, loading: authLoading } = useSupabaseAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [checking, setChecking] = useState(false);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [investmentComplete, setInvestmentComplete] = useState<boolean | null>(null);

  const lastCheckKeyRef = useRef<string>('');

  // 1) Pobierz status profilu/inwestycji
  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (authLoading) return;

      const userId = session?.user?.id;
      if (!userId) {
        if (!alive) return;
        setChecking(false);
        setProfileComplete(null);
        setInvestmentComplete(null);
        return;
      }

      const checkKey = `${userId}::${pathname}`;
      if (lastCheckKeyRef.current === checkKey) return;
      lastCheckKeyRef.current = checkKey;

      if (!alive) return;
      setChecking(true);

      try {
        const [profileRes, invRes] = await Promise.all([
          supabase.from('profiles').select('profil_wypelniony').eq('user_id', userId).maybeSingle(),
          supabase.from('inwestycje').select('inwestycja_wypelniona').eq('user_id', userId).maybeSingle(),
        ]);

        if (!alive) return;

        setProfileComplete(Boolean(profileRes.data?.profil_wypelniony));
        setInvestmentComplete(Boolean(invRes.data?.inwestycja_wypelniona));
      } catch {
        if (!alive) return;
        setProfileComplete(false);
        setInvestmentComplete(false);
      } finally {
        if (alive) setChecking(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [authLoading, session?.user?.id, pathname]);

  // 2) Gate
  const gateTarget = useMemo(() => {
    if (!session) return null;
    if (profileComplete === false) return '/(app)/profil';
    if (profileComplete === true && investmentComplete === false) return '/(app)/inwestycja';
    return null;
  }, [session, profileComplete, investmentComplete]);

  // 3) Routing
  useEffect(() => {
    if (gateTarget) {
      if (pathname !== gateTarget) router.replace(gateTarget);
      return;
    }

    if (session && profileComplete === true && investmentComplete === true && pathname === '/(app)') {
      router.replace('/(app)/(tabs)/dashboard');
    }
  }, [gateTarget, pathname, router, session, profileComplete, investmentComplete]);

  const showOverlay =
    authLoading || checking || (session && (profileComplete === null || investmentComplete === null));

  return (
    <View style={styles.root}>
      {/* GLOBALNE TŁO — premium starfield (multi-kierunek, fade, respawn) */}
      <StarsBackground count={26} />

      <Stack
        screenOptions={{
          headerShown: false,
          // kluczowe: nie nadpisuj tła
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />

      {showOverlay ? (
        <View pointerEvents="auto" style={styles.overlay}>
          <ActivityIndicator />
        </View>
      ) : null}
    </View>
  );
}

/* =====================  STARFIELD (RN Animated, native driver) ===================== */

function StarsBackground({ count = 26 }: { count?: number }) {
  const { width, height } = Dimensions.get('window');

  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  const particles = useRef<Particle[]>([]);
  const running = useRef(true);

  if (particles.current.length === 0) {
    particles.current = Array.from({ length: count }).map((_, i) => {
      const size = 1 + Math.random() * 2.2; // 1..3.2
      return {
        id: i,
        size,
        color: Math.random() > 0.55 ? NEON : BRAND,
        glow: Math.random() > 0.72,

        x: new Animated.Value(0),
        y: new Animated.Value(0),
        o: new Animated.Value(0.08),
        s: new Animated.Value(1),
      };
    });
  }

  const startOne = (p: Particle) => {
    if (!running.current) return;

    // multi-kierunkowo, ale delikatnie
    const angle = rand(-Math.PI, Math.PI);
    const maxDrift = 0.55;

    const dxUnit = Math.cos(angle) * maxDrift;
    const dyUnit = Math.sin(angle) * maxDrift;

    // lekki bias “w dół”, ale nadal różne kierunki
    const dyBiased = dyUnit + 0.35;
    const dyFinal = clamp(dyBiased, -0.35, 1.0);

    const dist = rand(120, 220); // dystans na jeden “przelot” (im mniejszy tym subtelniej)
    const dx = dxUnit * dist;
    const dy = dyFinal * dist;

    const duration = Math.floor(rand(5200, 9800));
    const delay = Math.floor(rand(0, 1400));

    const startX = rand(-20, width + 20);
    const startY = rand(-30, height + 30);

    p.x.setValue(startX);
    p.y.setValue(startY);

    const baseO = rand(0.06, 0.20);
    p.o.setValue(baseO * 0.55);
    p.s.setValue(1);

    Animated.sequence([
      Animated.delay(delay),

      Animated.parallel([
        // ruch
        Animated.timing(p.x, { toValue: startX + dx, duration, useNativeDriver: true }),
        Animated.timing(p.y, { toValue: startY + dy, duration, useNativeDriver: true }),

        // “oddech” opacity + mikroskalowanie
        Animated.sequence([
          Animated.parallel([
            Animated.timing(p.o, { toValue: baseO, duration: Math.floor(duration * 0.35), useNativeDriver: true }),
            Animated.timing(p.s, { toValue: rand(1.03, 1.14), duration: Math.floor(duration * 0.35), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(p.o, { toValue: rand(0.04, 0.12), duration: Math.floor(duration * 0.55), useNativeDriver: true }),
            Animated.timing(p.s, { toValue: 1, duration: Math.floor(duration * 0.55), useNativeDriver: true }),
          ]),
        ]),
      ]),
    ]).start(({ finished }) => {
      if (!finished) return;
      startOne(p); // respawn
    });
  };

  useEffect(() => {
    running.current = true;
    particles.current.forEach((p) => startOne(p));
    return () => {
      running.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3 “premium” pulsujące punkty
  const pulseStars = useMemo(() => {
    return Array.from({ length: 3 }).map((_, i) => ({
      id: `pulse-${i}`,
      x: rand(width * 0.12, width * 0.88),
      y: rand(height * 0.18, height * 0.80),
      size: rand(2.0, 3.2),
      color: Math.random() > 0.5 ? NEON : BRAND,
      delay: rand(0, 900),
      duration: rand(4200, 7200),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.bg} />

      {particles.current.map((p) => (
        <Animated.View
          key={p.id}
          style={[
            styles.star,
            p.glow && {
              shadowColor: p.color,
              shadowOpacity: 0.55,
              shadowRadius: p.size * 6,
              shadowOffset: { width: 0, height: 0 },
            },
            {
              width: p.size,
              height: p.size,
              borderRadius: p.size,
              backgroundColor: p.color,
              opacity: p.o,
              transform: [{ translateX: p.x }, { translateY: p.y }, { scale: p.s }],
            },
          ]}
        />
      ))}

      {pulseStars.map((s) => (
        <PulseStar
          key={s.id}
          x={s.x}
          y={s.y}
          size={s.size}
          color={s.color}
          delay={s.delay}
          duration={s.duration}
        />
      ))}
    </View>
  );
}

function PulseStar({
  x,
  y,
  size,
  color,
  delay,
  duration,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
}) {
  const o = useRef(new Animated.Value(0.12)).current;
  const s = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(Math.floor(delay)),
        Animated.parallel([
          Animated.timing(o, { toValue: 0.28, duration: Math.floor(duration * 0.45), useNativeDriver: true }),
          Animated.timing(s, { toValue: 1.22, duration: Math.floor(duration * 0.45), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(o, { toValue: 0.10, duration: Math.floor(duration * 0.55), useNativeDriver: true }),
          Animated.timing(s, { toValue: 1.0, duration: Math.floor(duration * 0.55), useNativeDriver: true }),
        ]),
      ])
    );

    loop.start();
    return () => {
      try {
        // @ts-ignore
        loop.stop?.();
      } catch {}
    };
  }, [delay, duration, o, s]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pulse,
        {
          left: x - size * 0.5,
          top: y - size * 0.5,
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: color,
          opacity: o,
          transform: [{ scale: s }],
          shadowColor: color,
          shadowOpacity: 0.55,
          shadowRadius: size * 10,
          shadowOffset: { width: 0, height: 0 },
        },
      ]}
    />
  );
}

/* =====================  STYLES ===================== */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: BG },

  star: { position: 'absolute' },
  pulse: { position: 'absolute' },

  overlay: {
    position: 'absolute',
    inset: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
});
