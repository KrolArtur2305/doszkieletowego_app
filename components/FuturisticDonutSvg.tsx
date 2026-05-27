import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const ACCENT = '#19705C';
const NEON = '#25F0C8';
const DANGER = '#EF4444';
const DANGER_ACCENT = '#7F1D1D';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  onPressLabel?: () => void;
  isActive?: boolean;
  hideCenterValue?: boolean;
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
  hideCenterValue = false,
}: Props) {
  const v = clamp01(value);
  const displayValue = Math.max(0, Number.isFinite(value) ? value : 0);
  const isOverLimit = displayValue > 1;
  const ringGradientId = isOverLimit ? 'gradDanger' : 'grad';

  const r = useMemo(() => (size - stroke) / 2, [size, stroke]);
  const cx = size / 2;
  const cy = size / 2;
  const circumference = useMemo(() => 2 * Math.PI * r, [r]);

  const prog = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const ringDrift = useRef(new Animated.Value(0)).current;

  const shimmerLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const ringDriftLoopRef = useRef<Animated.CompositeAnimation | null>(null);

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

  const startRingDrift = () => {
    ringDrift.stopAnimation();
    ringDrift.setValue(0);
    ringDriftLoopRef.current?.stop();

    ringDriftLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(ringDrift, { toValue: 1, duration: 2600, useNativeDriver: true }),
        Animated.timing(ringDrift, { toValue: 0, duration: 2600, useNativeDriver: true }),
      ])
    );
    ringDriftLoopRef.current.start();
  };

  const stopRingDrift = () => {
    ringDriftLoopRef.current?.stop();
    ringDriftLoopRef.current = null;
    ringDrift.stopAnimation();
    ringDrift.setValue(0);
  };

  useEffect(() => {
    if (!isActive) return;

    setDidFinish(false);
    stopShimmer();
    stopRingDrift();

    prog.stopAnimation();
    spin.stopAnimation();

    prog.setValue(0);
    spin.setValue(0);

    Animated.parallel([
      Animated.sequence([
        Animated.timing(prog, { toValue: Math.min(v, 0.92), duration: 620, useNativeDriver: false }),
        Animated.timing(prog, { toValue: v, duration: 380, useNativeDriver: false }),
      ]),
      Animated.timing(spin, { toValue: 1, duration: 900, useNativeDriver: false }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setDidFinish(true);
      startShimmer();
      startRingDrift();
    });

    return () => undefined;
  }, [isActive, prog, ringDrift, shimmer, spin, v]);

  useEffect(() => {
    return () => {
      stopShimmer();
      stopRingDrift();
    };
  }, []);

  const dashoffset = prog.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
    extrapolate: 'clamp',
  });

  const rot = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['-90deg', '190deg'],
  });

  const percent = Math.round(displayValue * 100);
  const percentFontSize = Math.max(22, Math.round(size * 0.21));
  const showLabel = !!label || !!onPressLabel;

  const glowOpacity = didFinish
    ? shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.22] })
    : shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.0, 0.0] });

  const ringDriftRotate = ringDrift.interpolate({
    inputRange: [0, 1],
    outputRange: ['-5deg', '5deg'],
  });

  return (
    <View style={[styles.wrap, { width: size, height: size + (showLabel ? 54 : 0) }]}>
      <View style={{ width: size, height: size }}>
        <Animated.View style={{ transform: [{ rotate: ringDriftRotate }] }}>
          <Svg width={size} height={size}>
            <Defs>
              <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={NEON} stopOpacity="1" />
                <Stop offset="0.55" stopColor={ACCENT} stopOpacity="1" />
                <Stop offset="1" stopColor={NEON} stopOpacity="0.90" />
              </LinearGradient>
              <LinearGradient id="gradDanger" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={DANGER} stopOpacity="1" />
                <Stop offset="0.55" stopColor={DANGER_ACCENT} stopOpacity="1" />
                <Stop offset="1" stopColor={DANGER} stopOpacity="0.92" />
              </LinearGradient>
            </Defs>

            <AnimatedCircle
              cx={cx}
              cy={cy}
              r={r}
              stroke="rgba(0,0,0,0.28)"
              strokeWidth={stroke + 14}
              strokeLinecap="round"
              fill="transparent"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={dashoffset}
              rotation={rot}
              originX={cx}
              originY={cy}
              opacity={0.35}
            />

            <Circle
              cx={cx}
              cy={cy}
              r={r}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={stroke}
              fill="transparent"
            />

            <AnimatedCircle
              cx={cx}
              cy={cy}
              r={r}
              stroke="rgba(255,255,255,0.16)"
              strokeWidth={Math.max(10, stroke - 2)}
              strokeLinecap="round"
              fill="transparent"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={dashoffset}
              rotation={rot}
              originX={cx}
              originY={cy}
              opacity={0.42}
            />

            <AnimatedCircle
              cx={cx}
              cy={cy}
              r={r}
              stroke={`url(#${ringGradientId})`}
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

            <AnimatedCircle
              cx={cx}
              cy={cy}
              r={r}
              stroke={`url(#${ringGradientId})`}
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
        </Animated.View>

        {!hideCenterValue ? (
          <View pointerEvents="none" style={styles.center}>
            <Text
              style={[
                styles.percent,
                { fontSize: percentFontSize },
                Platform.OS === 'android' ? styles.percentAndroid : null,
              ]}
              allowFontScaling={false}
            >
              {percent}%
            </Text>
          </View>
        ) : null}
      </View>

      {showLabel && (
        <Pressable onPress={onPressLabel} disabled={!onPressLabel} style={styles.labelWrap}>
          <Text style={[styles.label, !!onPressLabel && styles.labelLink]} allowFontScaling={false}>
            {label}
          </Text>
        </Pressable>
      )}
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
    textShadowColor: 'rgba(37,240,200,0.18)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 0 },
  },
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
