import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';

const BG = '#000000';
const NEON = '#25F0C8';
const BRAND = '#19705C';

type Props = {
  transparentBg?: boolean;
  variant?: 'subtle' | 'wow';
};

type StarCfg = {
  id: string;
  size: number; // core dot size
  glowSize: number; // glow dot size (bigger)
  color: string;

  x: Animated.Value;
  y: Animated.Value;
  o: Animated.Value; // opacity
  s: Animated.Value; // scale
};

export default function StarsBackground({
  transparentBg = true,
  variant = 'wow',
}: Props) {
  const { width, height } = useWindowDimensions();
  const mountedRef = useRef(false);

  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

  const params = useMemo(() => {
    const isWow = variant === 'wow';

    // gęstość bazowa zależna od ekranu
    const area = width * height;
    const baseArea = 390 * 844;
    const scale = clamp(area / baseArea, 0.9, 1.7);

    const total = Math.round((isWow ? 170 : 110) * scale);
    const premium = Math.round((isWow ? 16 : 10) * scale);

    return {
      total,
      premium,

      minDur: isWow ? 3600 : 5200,
      maxDur: isWow ? 8800 : 11000,

      minOpacity: isWow ? 0.10 : 0.06,
      maxOpacity: isWow ? 0.40 : 0.26,

      maxSpeedPx: isWow ? 520 : 320,
      maxDrift: isWow ? 0.85 : 0.55,

      // parallax
      backSpeed: isWow ? 0.55 : 0.40,
      midSpeed: isWow ? 1.00 : 0.75,
      frontSpeed: isWow ? 1.45 : 1.10,

      // glow mocniejszy na Androidzie -> robimy go View'ami
      glowOpacity: isWow ? 0.22 : 0.14,
    };
  }, [variant, width, height]);

  const counts = useMemo(() => {
    const back = Math.round(params.total * 0.42);
    const mid = Math.round(params.total * 0.38);
    const front = Math.max(0, params.total - back - mid);
    return { back, mid, front };
  }, [params.total]);

  const starsKey = `${width}x${height}-${variant}-${counts.back}-${counts.mid}-${counts.front}`;

  const backStars = useRef<StarCfg[]>([]);
  const midStars = useRef<StarCfg[]>([]);
  const frontStars = useRef<StarCfg[]>([]);

  const makeStars = (n: number, layer: 'back' | 'mid' | 'front') => {
    return Array.from({ length: n }).map((_, i) => {
      const color = Math.random() > 0.60 ? NEON : BRAND;

      // core size i glow size per warstwa
      let core = 1;
      if (layer === 'back') core = rand(0.9, 1.8);
      if (layer === 'mid') core = rand(1.1, 2.4);
      if (layer === 'front') core = rand(1.4, 3.4);

      const glowSize =
        layer === 'back' ? core * rand(4.0, 6.0) :
        layer === 'mid' ? core * rand(4.8, 7.2) :
        core * rand(5.5, 8.5);

      return {
        id: `${layer}-${i}`,
        size: core,
        glowSize,
        color,
        x: new Animated.Value(0),
        y: new Animated.Value(0),
        o: new Animated.Value(params.minOpacity),
        s: new Animated.Value(1),
      };
    });
  };

  // init / reinit
  if ((backStars.current as any).__key !== starsKey) {
    const b = makeStars(counts.back, 'back');
    const m = makeStars(counts.mid, 'mid');
    const f = makeStars(counts.front, 'front');

    (b as any).__key = starsKey;
    (m as any).__key = starsKey;
    (f as any).__key = starsKey;

    backStars.current = b as any;
    midStars.current = m as any;
    frontStars.current = f as any;
  }

  const startOne = (st: StarCfg, speedMul: number, opacityMul: number) => {
    if (!mountedRef.current) return;

    const angle = rand(-Math.PI, Math.PI);

    const dxUnit = Math.cos(angle) * params.maxDrift;
    const dyUnit = Math.sin(angle) * params.maxDrift;

    // lekki bias w dół
    const dyFinal = clamp(dyUnit + 0.35, -0.35, 1.0);

    const dist = rand(params.maxSpeedPx * 0.55, params.maxSpeedPx) * speedMul;
    const dx = dxUnit * dist;
    const dy = dyFinal * dist;

    const duration = Math.floor(rand(params.minDur, params.maxDur));
    const delay = Math.floor(rand(0, 900));

    const startX = rand(-60, width + 60);
    const startY = rand(-70, height + 70);

    st.x.setValue(startX);
    st.y.setValue(startY);

    const baseO = rand(params.minOpacity, params.maxOpacity) * opacityMul;
    st.o.setValue(baseO * 0.65);
    st.s.setValue(1);

    Animated.parallel([
      Animated.timing(st.x, { toValue: startX + dx, duration, delay, useNativeDriver: true }),
      Animated.timing(st.y, { toValue: startY + dy, duration, delay, useNativeDriver: true }),

      // delikatny “żywy” oddech w trakcie lotu
      Animated.sequence([
        Animated.delay(delay + Math.floor(duration * 0.10)),
        Animated.parallel([
          Animated.timing(st.o, { toValue: baseO, duration: Math.floor(duration * 0.35), useNativeDriver: true }),
          Animated.timing(st.s, { toValue: rand(1.03, 1.16), duration: Math.floor(duration * 0.35), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(st.o, { toValue: rand(params.minOpacity * 0.85, params.minOpacity * 1.2) * opacityMul, duration: Math.floor(duration * 0.55), useNativeDriver: true }),
          Animated.timing(st.s, { toValue: 1, duration: Math.floor(duration * 0.55), useNativeDriver: true }),
        ]),
      ]),
    ]).start(({ finished }) => {
      if (!finished) return;
      if (!mountedRef.current) return;
      startOne(st, speedMul, opacityMul);
    });
  };

  // Ambient glows — mocniejsze i widoczne
  const glowA = useRef(new Animated.Value(variant === 'wow' ? 0.10 : 0.07)).current;
  const glowB = useRef(new Animated.Value(variant === 'wow' ? 0.09 : 0.06)).current;
  const glowAS = useRef(new Animated.Value(1)).current;
  const glowBS = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    mountedRef.current = true;

    backStars.current.forEach((st) => startOne(st, params.backSpeed, 0.75));
    midStars.current.forEach((st) => startOne(st, params.midSpeed, 1.0));
    frontStars.current.forEach((st) => startOne(st, params.frontSpeed, 1.10));

    const loopA = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowA, { toValue: variant === 'wow' ? 0.15 : 0.10, duration: 5200, useNativeDriver: true }),
          Animated.timing(glowAS, { toValue: 1.12, duration: 5200, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(glowA, { toValue: variant === 'wow' ? 0.09 : 0.06, duration: 6400, useNativeDriver: true }),
          Animated.timing(glowAS, { toValue: 1.0, duration: 6400, useNativeDriver: true }),
        ]),
      ])
    );

    const loopB = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowB, { toValue: variant === 'wow' ? 0.14 : 0.095, duration: 6400, useNativeDriver: true }),
          Animated.timing(glowBS, { toValue: 1.14, duration: 6400, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(glowB, { toValue: variant === 'wow' ? 0.085 : 0.055, duration: 7000, useNativeDriver: true }),
          Animated.timing(glowBS, { toValue: 1.0, duration: 7000, useNativeDriver: true }),
        ]),
      ])
    );

    loopA.start();
    loopB.start();

    return () => {
      mountedRef.current = false;
      try {
        // @ts-ignore
        loopA.stop?.();
        // @ts-ignore
        loopB.stop?.();
      } catch {}

      [...backStars.current, ...midStars.current, ...frontStars.current].forEach((st) => {
        try {
          st.x.stopAnimation();
          st.y.stopAnimation();
          st.o.stopAnimation();
          st.s.stopAnimation();
        } catch {}
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starsKey]);

  const premiumStars = useMemo(() => {
    return Array.from({ length: params.premium }).map((_, i) => {
      const x = rand(width * 0.06, width * 0.94);
      const y = rand(height * 0.10, height * 0.88);
      const size = rand(3.2, 5.2);
      const color = Math.random() > 0.52 ? NEON : BRAND;
      const phase = rand(0, 1200);
      const dur = rand(4200, 7600);
      return { id: `premium-${i}`, x, y, size, color, phase, dur };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, params.premium, variant]);

  const renderStar = (st: StarCfg) => {
    // glow jako osobny “soft dot” (działa na Androidzie)
    return (
      <Animated.View
        key={st.id}
        pointerEvents="none"
        style={[
          styles.starWrap,
          {
            transform: [{ translateX: st.x }, { translateY: st.y }, { scale: st.s }],
            opacity: st.o,
          },
        ]}
      >
        {/* glow */}
        <View
          style={{
            position: 'absolute',
            left: -(st.glowSize - st.size) / 2,
            top: -(st.glowSize - st.size) / 2,
            width: st.glowSize,
            height: st.glowSize,
            borderRadius: st.glowSize,
            backgroundColor: st.color,
            opacity: params.glowOpacity,
          }}
        />
        {/* core */}
        <View
          style={{
            width: st.size,
            height: st.size,
            borderRadius: st.size,
            backgroundColor: st.color,
            opacity: 0.95,
          }}
        />
      </Animated.View>
    );
  };

  return (
    <View pointerEvents="none" style={styles.wrap}>
      {!transparentBg && <View style={styles.bg} />}

      {/* ambient glows */}
      <Animated.View
        style={[
          styles.glow,
          {
            left: -width * 0.42,
            top: -height * 0.22,
            width: width * 1.15,
            height: width * 1.15,
            borderRadius: 9999,
            backgroundColor: BRAND,
            opacity: glowA,
            transform: [{ scale: glowAS }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.glow,
          {
            right: -width * 0.46,
            bottom: -height * 0.28,
            width: width * 1.25,
            height: width * 1.25,
            borderRadius: 9999,
            backgroundColor: NEON,
            opacity: glowB,
            transform: [{ scale: glowBS }],
          },
        ]}
      />

      {/* warstwy */}
      {backStars.current.map(renderStar)}
      {midStars.current.map(renderStar)}
      {frontStars.current.map(renderStar)}

      {/* premium pulsujące */}
      {premiumStars.map((p) => (
        <PulseStar key={p.id} x={p.x} y={p.y} size={p.size} color={p.color} delay={p.phase} duration={p.dur} />
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
  const o = useRef(new Animated.Value(0.22)).current;
  const s = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(o, { toValue: 0.55, duration: duration * 0.40, useNativeDriver: true }),
          Animated.timing(s, { toValue: 1.35, duration: duration * 0.40, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(o, { toValue: 0.18, duration: duration * 0.60, useNativeDriver: true }),
          Animated.timing(s, { toValue: 1.0, duration: duration * 0.60, useNativeDriver: true }),
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
        styles.premium,
        {
          left: x - size * 0.5,
          top: y - size * 0.5,
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: color,
          opacity: o,
          transform: [{ scale: s }],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: BG },
  glow: { position: 'absolute' },

  starWrap: {
    position: 'absolute',
    width: 1,
    height: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  premium: { position: 'absolute' },
});
