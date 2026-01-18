import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const BRAND = '#19705C';
const NEON = '#25F0C8';

type Props = {
  value: number; // 0..1
  size?: number; // "wizualny" rozmiar (pierścień + środek)
  stroke?: number; // grubość głównego łuku
  label: string;
  onPressLabel?: () => void;
  isActive?: boolean;
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function FuturisticDonutSvg({
  value,
  size = 220,
  stroke = 18,
  label,
  onPressLabel,
  isActive = false,
}: Props) {
  const clamped = Math.max(0, Math.min(1, value));

  // mamy 3 warstwy: glow arc (stroke+10), main arc (stroke), highlight (stroke*0.22)
  const glowStroke = stroke + 10;
  const PAD = useMemo(() => Math.ceil(glowStroke / 2) + 8, [glowStroke]); // KLUCZ: zapas na stroke + poświatę

  const svgSize = useMemo(() => size + PAD * 2, [size, PAD]);
  const cx = svgSize / 2;
  const cy = svgSize / 2;

  // promień tak, żeby nawet glowStroke NIE wyszedł poza SVG
  const r = useMemo(() => (svgSize - glowStroke) / 2 - 1, [svgSize, glowStroke]);
  const c = useMemo(() => 2 * Math.PI * r, [r]);

  const progress = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    pulse.setValue(0);

    Animated.parallel([
      Animated.timing(progress, {
        toValue: clamped,
        duration: 1050,
        useNativeDriver: false, // strokeDashoffset
      }),
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 480, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 520, useNativeDriver: true }),
      ]),
    ]).start();
  }, [clamped, progress, pulse]);

  const dashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [c, 0],
  });

  const glowScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  const glowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.42],
  });

  const popScale = isActive ? 1.04 : 0.95;

  const inner = Math.round(size * 0.68);

  return (
    <View style={[styles.wrap, { width: svgSize + 40 }]}>
      <Animated.View
        style={[
          styles.donutOuter,
          {
            width: svgSize,
            height: svgSize,
            transform: [{ scale: popScale }],
            shadowOpacity: isActive ? 0.55 : 0.18,
            shadowRadius: isActive ? 26 : 14,
          },
        ]}
      >
        {/* GLOW (View) — musi mieć svgSize, inaczej będzie ucinane */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            {
              width: svgSize,
              height: svgSize,
              borderRadius: svgSize / 2,
              opacity: glowOpacity,
              transform: [{ scale: glowScale }],
            },
          ]}
        />

        <Svg width={svgSize} height={svgSize}>
          <Defs>
            <LinearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={NEON} stopOpacity="1" />
              <Stop offset="55%" stopColor={BRAND} stopOpacity="1" />
              <Stop offset="100%" stopColor={BRAND} stopOpacity="0.95" />
            </LinearGradient>
          </Defs>

          {/* track (ciemny ring pod spodem dla kontrastu) */}
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke="rgba(255,255,255,0.10)"
            strokeWidth={stroke}
            fill="none"
            rotation={-90}
            originX={cx}
            originY={cy}
          />

          {/* NEON GLOW ARC (pod spodem) */}
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke="url(#grad)"
            strokeWidth={glowStroke}
            strokeLinecap="round"
            strokeOpacity={0.16}
            fill="none"
            rotation={-90}
            originX={cx}
            originY={cy}
            strokeDasharray={`${c} ${c}`}
            // @ts-ignore
            strokeDashoffset={dashoffset}
          />

          {/* MAIN ARC */}
          <AnimatedCircle
            cx={cx}
            cy={cy}
            r={r}
            stroke="url(#grad)"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            rotation={-90}
            originX={cx}
            originY={cy}
            strokeDasharray={`${c} ${c}`}
            // @ts-ignore
            strokeDashoffset={dashoffset}
          />

          {/* „SHINE” highlight (3D) */}
          <AnimatedCircle
            cx={cx}
            cy={cy}
            r={r}
            stroke={NEON}
            strokeWidth={Math.max(2, Math.round(stroke * 0.22))}
            strokeLinecap="round"
            strokeOpacity={0.22}
            fill="none"
            rotation={-90}
            originX={cx}
            originY={cy}
            strokeDasharray={`${c} ${c}`}
            // @ts-ignore
            strokeDashoffset={dashoffset}
          />
        </Svg>

        {/* CENTER */}
        <View
          style={[
            styles.center,
            {
              width: inner,
              height: inner,
              borderRadius: inner / 2,
              left: (svgSize - inner) / 2,
              top: (svgSize - inner) / 2,
            },
          ]}
        >
          <Text style={styles.percent}>{Math.round(clamped * 100)}%</Text>
        </View>
      </Animated.View>

      {/* LABEL under */}
      {onPressLabel ? (
        <TouchableOpacity activeOpacity={0.85} onPress={onPressLabel} style={styles.labelTap}>
          <Text style={styles.label}>{label}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.labelTap}>
          <Text style={styles.label}>{label}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },

  donutOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BRAND,
    shadowOffset: { width: 0, height: 10 },
    backgroundColor: 'transparent',
    overflow: 'visible',
  },

  glow: {
    position: 'absolute',
    shadowColor: NEON,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
    backgroundColor: 'rgba(25,112,92,0.08)',
  },

  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.12)',
  },

  percent: {
    color: '#E9FFF7',
    fontSize: 44,
    fontWeight: '900',
    textShadowColor: 'rgba(37,240,200,0.22)',
    textShadowRadius: 16,
    letterSpacing: -0.5,
  },

  labelTap: { marginTop: 14, paddingVertical: 6, paddingHorizontal: 10 },
  label: { color: 'rgba(255,255,255,0.78)', fontSize: 16, fontWeight: '700' },
});
