import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '../../../../src/ui/components';

const NEON = '#25F0C8';

type Tile = {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  onPress: () => void;
  wide?: boolean;
};

const hasGreenGlow = (color: string) => color === NEON || color.toUpperCase() === '#22C55E';

export default function WiecejScreen() {
  const router = useRouter();
  const { t } = useTranslation('navigation');
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const topPad = Platform.OS === 'android' ? Math.max((StatusBar.currentHeight ?? 0) - 4, 0) : 8;
  const compact = width < 390;
  const layout = useMemo(() => {
    const pad = compact ? 14 : 18;
    const gap = compact ? 10 : 14;
    const tileRadius = compact ? 22 : 26;
    const wideRadius = compact ? 24 : 28;
    const tilePad = compact ? 14 : 16;
    const tileIcon = compact ? 24 : 26;
    const tileLabel = compact ? 14.2 : 15.2;
    const wideLabel = compact ? 15 : 16;
    const wideHeight = compact ? 82 : 92;
    const tileAspect = compact ? 1.24 : 1.29;
    return {
      pad,
      gap,
      tileRadius,
      wideRadius,
      tilePad,
      tileIcon,
      tileLabel,
      wideLabel,
      wideHeight,
      tileAspect,
      tileWidth: (width - pad * 2 - gap) / 2,
      wideWidth: width - pad * 2,
    };
  }, [compact, width]);

  const anims = useRef(Array.from({ length: 7 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.stagger(
      60,
      anims.map((a) =>
        Animated.spring(a, {
          toValue: 1,
          useNativeDriver: true,
          tension: 70,
          friction: 10,
        })
      )
    ).start();
  }, [anims]);

  const tiles: Tile[] = [
    {
      key: 'zdjecia',
      label: t('tabs.photos'),
      icon: 'camera',
      color: '#F59E0B',
      onPress: () => router.push('/zdjecia'),
    },
    {
      key: 'dokumenty',
      label: t('tabs.documents'),
      icon: 'file-text',
      color: '#3B82F6',
      onPress: () => router.push('/dokumenty'),
    },
    {
      key: 'kontakty',
      label: t('more.contacts'),
      icon: 'users',
      color: NEON,
      onPress: () => router.push('/wiecej/kontakty'),
    },
    {
      key: 'postepy',
      label: t('more.progress'),
      icon: 'trending-up',
      color: '#A78BFA',
      onPress: () => router.push('/postepy'),
    },
    {
      key: 'zadania',
      label: t('more.tasks'),
      icon: 'check-square',
      color: '#22C55E',
      onPress: () => router.push('/zadania'),
    },
    {
      key: 'dziennik',
      label: t('more.journal'),
      icon: 'book-open',
      color: '#F472B6',
      onPress: () => router.push('/wiecej/dziennik'),
    },
    {
      key: 'ustawienia',
      label: t('more.settings'),
      icon: 'sliders',
      color: NEON,
      onPress: () => router.push('/ustawienia'),
      wide: true,
    },
  ];

  const regularTiles = tiles.filter((tile) => !tile.wide);
  const rowTiles = [
    regularTiles.slice(0, 2),
    regularTiles.slice(2, 4),
    regularTiles.slice(4, 6),
  ];
  const wideTile = tiles.find((tile) => tile.wide) ?? null;

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bg} />

      <View
        style={[
          styles.content,
          {
            paddingTop: topPad,
            paddingBottom: Math.max(14, insets.bottom + (compact ? 14 : 20)),
            paddingHorizontal: layout.pad,
          },
        ]}
      >
        <AppHeader title={t('more.title')} style={styles.screenHeader} />

        <View style={styles.grid}>
          {rowTiles.map((row, rowIndex) => (
            <View key={`row-${rowIndex}`} style={[styles.row, { gap: layout.gap }]}>
              {row.map((tile, colIndex) => {
                const anim = anims[rowIndex * 2 + colIndex];
                const scale = anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.88, 1],
                });

                return (
                  <Animated.View
                    key={tile.key}
                    style={[
                      styles.tileWrap,
                      {
                        flex: 1,
                        opacity: anim,
                        transform: [{ scale }],
                      },
                    ]}
                  >
                    <Pressable
                      onPress={tile.onPress}
                      style={({ pressed }) => [
                        styles.tile,
                        {
                          borderRadius: layout.tileRadius,
                          aspectRatio: layout.tileAspect,
                        },
                        pressed && styles.tilePressed,
                      ]}
                    >
                      {!hasGreenGlow(tile.color) && (
                        <View pointerEvents="none" style={[styles.tileGlow, { backgroundColor: tile.color }]} />
                      )}
                      <View style={[styles.tileInner, { padding: layout.tilePad }]}>
                        <View
                          style={[
                            styles.tileIconWrap,
                            {
                              width: compact ? 48 : 52,
                              height: compact ? 48 : 52,
                              borderRadius: compact ? 16 : 18,
                              backgroundColor: `${tile.color}18`,
                              borderColor: `${tile.color}35`,
                            },
                          ]}
                        >
                          <Feather name={tile.icon} size={layout.tileIcon} color={tile.color} />
                        </View>

                        <Text style={[styles.tileLabel, { fontSize: layout.tileLabel }]}>{tile.label}</Text>
                      </View>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          ))}
        </View>

        {wideTile ? (
          <Animated.View
            style={[
              styles.wideTileWrap,
              {
                width: layout.wideWidth,
                marginTop: layout.gap,
                opacity: anims[6],
                transform: [
                  {
                    translateY: anims[6].interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable
              onPress={wideTile.onPress}
              style={({ pressed }) => [
                styles.wideTile,
                {
                  height: layout.wideHeight,
                  borderRadius: layout.wideRadius,
                },
                pressed && styles.tilePressed,
              ]}
            >
              {!hasGreenGlow(wideTile.color) && (
                <View pointerEvents="none" style={[styles.wideTileGlow, { backgroundColor: wideTile.color }]} />
              )}
              <View style={styles.wideTileContent}>
                <View
                  style={[
                    styles.tileIconWrap,
                    {
                      width: compact ? 46 : 52,
                      height: compact ? 46 : 52,
                      borderRadius: compact ? 16 : 18,
                      backgroundColor: `${wideTile.color}18`,
                      borderColor: `${wideTile.color}35`,
                    },
                  ]}
                >
                  <Feather name={wideTile.icon} size={compact ? 22 : 24} color={wideTile.color} />
                </View>
                <Text style={[styles.wideTileLabel, { fontSize: layout.wideLabel }]}>{wideTile.label}</Text>
              </View>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  scroll: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  screenHeader: {
    marginBottom: 12,
  },
  grid: {
    flex: 1,
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
  },
  wideTileWrap: {
    alignItems: 'center',
  },
  tileWrap: {
    alignItems: 'stretch',
  },
  tile: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.15)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    shadowColor: NEON,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  wideTile: {
    width: '100%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.22)',
    backgroundColor: 'rgba(37,240,200,0.045)',
    shadowColor: NEON,
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  tilePressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  tileInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  tileGlow: {
    position: 'absolute',
    right: -36,
    top: -36,
    width: 106,
    height: 106,
    borderRadius: 53,
    opacity: 0.12,
  },
  wideTileGlow: {
    position: 'absolute',
    right: -60,
    top: -76,
    width: 190,
    height: 190,
    borderRadius: 95,
    opacity: 0.14,
  },
  tileIconWrap: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 18.5,
    fontWeight: '900',
    textAlign: 'center',
  },
  wideTileContent: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  wideTileLabel: {
    color: '#FFFFFF',
    fontWeight: '900',
    textAlign: 'center',
  },
});
