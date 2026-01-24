import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const ACCENT = '#19705C';
const NEON = '#25F0C8';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  label: string;
  onPressLabel?: () => void;
  isActive?: boolean;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function FuturisticDonutSvg({
  value,
  size = 210,
  stroke = 16,
  label,
  onPressLabel,
  isActive = false,
}: Props) {
  const v = clamp01(value);

  const r = useMemo(() => (size - stroke) / 2, [size, stroke]);
  const cx = size / 2;
  const cy = size / 2;
  const circumference = useMemo(() => 2 * Math.PI * r, [r]);

  // progress 0..1
  const prog = useRef(new Animated.Value(0)).current;

  // one-time spin on activation / value change
  const spin = useRef(new Animated.Value(0)).current; // 0..1 mapped to deg

  // subtle shimmer after finish (opacity only, no scale)
  const shimmer = useRef(new Animated.Value(0)).current;
  const shimmerLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const [didFinish, setDidFinish] = useState(false);

  const startShimmer = () => {
    shimmer.stopAnimation();
    shimmer.setValue(0);
    shimmerLoopRef.current?.stop();

    shimmerLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 850, useNativeDriver: false }),
        Animated.timing(shimmer, { toValue: 0, duration: 850, useNativeDriver: false }),
      ])
    );
    shimmerLoopRef.current.start();
  };

  const stopShimmer = () => {
    shimmerLoopRef.current?.stop();
    shimmerLoopRef.current = null;
    shimmer.stopAnimation();
    shimmer.setValue(0);
  };

  useEffect(() => {
    // when slide becomes active, replay "spin once" + fill
    if (!isActive) return;

    setDidFinish(false);
    stopShimmer();

    prog.stopAnimation();
    spin.stopAnimation();

    // reset
    prog.setValue(0);
    spin.setValue(0);

    // fill to value + slight overshoot feel (via easing-ish staged timing)
    Animated.parallel([
      Animated.sequence([
        Animated.timing(prog, { toValue: Math.min(v, 0.92), duration: 620, useNativeDriver: false }),
        Animated.timing(prog, { toValue: v, duration: 380, useNativeDriver: false }),
      ]),
      // spin arc once: 0 → 1 corresponds to ~280deg (not full 360, bardziej “sweep”)
      Animated.timing(spin, { toValue: 1, duration: 900, useNativeDriver: false }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setDidFinish(true);
      startShimmer();
    });

    return () => {
      // keep shimmer only for active one
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, v]);

  useEffect(() => {
    // if component unmounts
    return () => {
      stopShimmer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // dash offset
  const dashoffset = prog.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
    extrapolate: 'clamp',
  });

  // rotation: start at top (-90deg) and add animated sweep
  const rot = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['-90deg', '190deg'], // 280deg sweep total (raz)
  });

  const percent = Math.round(v * 100);

  // glow opacity: stronger after finish but shimmer oscillates
  const glowOpacity = didFinish
    ? shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.22] })
    : shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.0, 0.0] });

  return (
    <View style={[styles.wrap, { width: size, height: size + 54 }]}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={NEON} stopOpacity="1" />
              <Stop offset="0.55" stopColor={ACCENT} stopOpacity="1" />
              <Stop offset="1" stopColor={NEON} stopOpacity="0.90" />
            </LinearGradient>
          </Defs>

          {/* base ring — ciemniejszy jak na screenie */}
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={stroke}
            fill="transparent"
          />

          {/* glow layer (behind) */}
          <AnimatedCircle
            cx={cx}
            cy={cy}
            r={r}
            stroke="url(#grad)"
            strokeWidth={stroke + 10}
            strokeLinecap="round"
            fill="transparent"
            opacity={glowOpacity}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashoffset}
            rotation={rot}
            originX={cx}
            originY={cy}
          />

          {/* main progress */}
          <AnimatedCircle
            cx={cx}
            cy={cy}
            r={r}
            stroke="url(#grad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="transparent"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashoffset}
            rotation={rot}
            originX={cx}
            originY={cy}
          />
        </Svg>

        {/* center text – ostre: bez skalowania + minimalny cień */}
        <View pointerEvents="none" style={styles.center}>
          <Text
            style={[
              styles.percent,
              Platform.OS === 'android' ? styles.percentAndroid : null,
            ]}
            allowFontScaling={false}
          >
            {percent}%
          </Text>
        </View>
      </View>

      {/* label – większy, wyraźniejszy */}
      <Pressable onPress={onPressLabel} disabled={!onPressLabel} style={styles.labelWrap}>
        <Text style={[styles.label, !!onPressLabel && styles.labelLink]} allowFontScaling={false}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: 'transparent',
  },
  center: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percent: {
    color: '#F2FFF9',
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -0.6,
    // mały cień = czytelność bez rozmycia
    textShadowColor: 'rgba(37,240,200,0.18)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 0 },
  },
  // Android czasem ostrzej renderuje przy minimalnie większym fontWeight/bez dużego cienia
  percentAndroid: {
    textShadowRadius: 4,
  },
  labelWrap: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  label: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 17.5,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  labelLink: {
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(25,112,92,0.22)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
});
