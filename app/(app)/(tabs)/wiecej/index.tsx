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

import { AppHeader } from '../../../../src/ui/components';

const NEON = '#25F0C8';
const { width: W } = Dimensions.get('window');
const H_PAD = 18;
const TILE_GAP = 14;
const TILE_W = (W - H_PAD * 2 - TILE_GAP) / 2;
const TILE_BOX = TILE_W - 28;
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
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8;

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
        contentContainerStyle={[styles.content, { paddingTop: topPad }]}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader title={t('more.title')} style={styles.screenHeader} />

        <View style={styles.grid}>
          {tiles.map((tile, i) => {
            const anim = anims[i];
            const scale = anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.85, 1],
            });

            const isWide = !!tile.wide;

            return (
              <Animated.View
                key={tile.key}
                style={[
                  isWide ? styles.wideTileWrap : styles.tileWrap,
                  {
                    opacity: anim,
                    transform: [{ scale }],
                  },
                ]}
              >
                <Pressable
                  onPress={tile.onPress}
                  style={({ pressed }) => [
                    isWide ? styles.wideTile : styles.tile,
                    pressed && styles.tilePressed,
                  ]}
                >
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
                      <Feather name={tile.icon} size={isWide ? 24 : 26} color={tile.color} />
                    </View>

                    <Text style={[styles.tileLabel, isWide && styles.wideTileLabel]}>
                      {tile.label}
                    </Text>
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
  content: {
    paddingHorizontal: H_PAD,
    paddingBottom: 120,
  },
  screenHeader: {
    marginBottom: 14,
  },
  grid: {
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
  tile: {
    width: TILE_BOX,
    height: TILE_BOX,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#19705c',
    backgroundColor: '#000000',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  wideTile: {
    width: WIDE_TILE_W,
    height: 102,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#19705c',
    backgroundColor: '#000000',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
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
    backgroundColor: '#000000',
  },
  tileIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  wideTileLabel: {
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
});
