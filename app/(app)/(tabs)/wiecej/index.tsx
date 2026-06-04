import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '../../../../src/ui/components';

const NEON = '#25F0C8';
const { width: W, height: SCREEN_H } = Dimensions.get('window');
const H_PAD = 18;
const TILE_GAP = 14;
const TILE_W = (W - H_PAD * 2 - TILE_GAP) / 2;
const TILE_H = Math.min(148, Math.max(124, Math.min(TILE_W * 0.84, (SCREEN_H - 282) / 3)));
const WIDE_TILE_W = W - H_PAD * 2;

type Tile = {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  onPress: () => void;
  wide?: boolean;
};

export default function WiecejScreen() {
  const router = useRouter();
  const { t } = useTranslation('navigation');
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'android' ? Math.max((StatusBar.currentHeight ?? 0) - 4, 0) : 8;

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

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bg} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: topPad,
            paddingBottom: Math.max(16, insets.bottom + 88),
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom + 76 }}
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
      >
        <AppHeader title={t('more.title')} style={styles.screenHeader} />

        <View style={styles.mainTiles}>
          {tiles.filter((tile) => !tile.wide).map((tile, i) => {
            const anim = anims[i];
            const scale = anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.85, 1],
            });

            return (
              <Animated.View
                key={tile.key}
                style={[
                  styles.tileWrap,
                  {
                    opacity: anim,
                    transform: [{ scale }],
                  },
                ]}
              >
                <Pressable
                  onPress={tile.onPress}
                  style={({ pressed }) => [
                    styles.tile,
                    pressed && styles.tilePressed,
                  ]}
                >
                  <View pointerEvents="none" style={[styles.tileGlow, { backgroundColor: tile.color }]} />
                  <View style={styles.tileInner}>
                    <View
                      style={[
                        styles.tileIconWrap,
                        {
                          backgroundColor: `${tile.color}18`,
                          borderColor: `${tile.color}35`,
                        },
                      ]}
                    >
                      <Feather name={tile.icon} size={26} color={tile.color} />
                    </View>

                    <Text style={styles.tileLabel}>{tile.label}</Text>
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        <View style={styles.settingsSlot}>
          {tiles.filter((tile) => tile.wide).map((tile, i) => {
            const anim = anims[i + 6] ?? anims[6];
            const translateY = anim.interpolate({
              inputRange: [0, 1],
              outputRange: [12, 0],
            });

            return (
              <Animated.View
                key={tile.key}
                style={[
                  styles.wideTileWrap,
                  {
                    opacity: anim,
                    transform: [{ translateY }],
                  },
                ]}
              >
                <Pressable
                  onPress={tile.onPress}
                  style={({ pressed }) => [
                    styles.wideTile,
                    pressed && styles.tilePressed,
                  ]}
                >
                  <View pointerEvents="none" style={[styles.wideTileGlow, { backgroundColor: tile.color }]} />
                  <View style={styles.wideTileContent}>
                    <View
                      style={[
                        styles.tileIconWrap,
                        {
                          backgroundColor: `${tile.color}18`,
                          borderColor: `${tile.color}35`,
                        },
                      ]}
                    >
                      <Feather name={tile.icon} size={24} color={tile.color} />
                    </View>
                    <Text style={styles.wideTileLabel}>{tile.label}</Text>
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>
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
    flexGrow: 1,
    paddingHorizontal: H_PAD,
  },
  screenHeader: {
    marginBottom: 16,
  },
  mainTiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tileWrap: {
    width: TILE_W,
    alignItems: 'center',
  },
  wideTileWrap: {
    width: WIDE_TILE_W,
    alignItems: 'center',
  },
  settingsSlot: {
    marginTop: 'auto',
    paddingTop: 0,
    transform: [{ translateY: -16 }],
  },
  tile: {
    width: TILE_W,
    height: TILE_H,
    borderRadius: 26,
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
    width: WIDE_TILE_W,
    height: 92,
    borderRadius: 28,
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
    gap: 12,
    padding: 16,
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
    width: 52,
    height: 52,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 15.2,
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
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  wideTileLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
});
