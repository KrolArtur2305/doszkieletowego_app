import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

const ACCENT = '#19705C';
const NEON = '#25F0C8';
const { width: W } = Dimensions.get('window');
const H_PAD = 18;
const TILE_GAP = 14;
const TILE_W = (W - H_PAD * 2 - TILE_GAP) / 2;
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
      label: t('tabs.photos', { defaultValue: 'Zdjęcia' }),
      icon: 'camera',
      color: '#F59E0B',
      onPress: () => router.push('/zdjecia'),
    },
    {
      key: 'dokumenty',
      label: t('tabs.documents', { defaultValue: 'Dokumenty' }),
      icon: 'file-text',
      color: '#3B82F6',
      onPress: () => router.push('/dokumenty'),
    },
    {
      key: 'kontakty',
      label: 'Kontakty',
      icon: 'users',
      color: NEON,
      onPress: () => router.push('/wiecej/kontakty'),
    },
    {
      key: 'postepy',
      label: 'Postępy',
      icon: 'trending-up',
      color: '#A78BFA',
      onPress: () => router.push('/postepy'),
    },
    {
      key: 'zadania',
      label: 'Zadania',
      icon: 'check-square',
      color: '#22C55E',
      onPress: () => router.push('/plan'),
    },
    {
      key: 'dziennik',
      label: 'Dziennik budowy',
      icon: 'book-open',
      color: '#F472B6',
      onPress: () => router.push('/wiecej/dziennik'),
    },
    {
      key: 'ustawienia',
      label: 'Ustawienia',
      icon: 'settings',
      color: 'rgba(148,163,184,0.95)',
      onPress: () => router.push('/ustawienia'),
      wide: true,
    },
  ];

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bg} />
      <View pointerEvents="none" style={styles.glowTop} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Image
            source={require('../../../assets/logo.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />

          <View style={styles.headerTitleWrap}>
            <Text style={styles.heading}>Więcej</Text>
          </View>

          <View style={styles.headerRightSpacer} />
        </View>

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
                    pressed && { opacity: 0.82, transform: [{ scale: 0.985 }] },
                  ]}
                >
                  <View
                    pointerEvents="none"
                    style={[
                      styles.tileGlow,
                      isWide ? styles.tileGlowWide : styles.tileGlowNormal,
                      { shadowColor: tile.color },
                    ]}
                  />

                  <BlurView intensity={16} tint="dark" style={styles.tileBlur}>
                    <View
                      style={[
                        styles.tileIconWrap,
                        {
                          backgroundColor: `${tile.color}18`,
                          borderColor: `${tile.color}35`,
                          shadowColor: tile.color,
                        },
                      ]}
                    >
                      <Feather name={tile.icon} size={isWide ? 24 : 26} color={tile.color} />
                    </View>

                    <Text style={[styles.tileLabel, isWide && styles.wideTileLabel]}>
                      {tile.label}
                    </Text>
                  </BlurView>
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
  glowTop: {
    position: 'absolute',
    width: 380,
    height: 380,
    borderRadius: 999,
    backgroundColor: ACCENT,
    opacity: 0.06,
    top: -200,
    right: -150,
  },

  content: {
    paddingHorizontal: H_PAD,
    paddingBottom: 120,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerLogo: {
    width: 46,
    height: 46,
    opacity: 0.98,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -46,
  },
  heading: {
    color: ACCENT,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  headerRightSpacer: {
    width: 46,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },

  tileWrap: {
    width: TILE_W,
  },
  wideTileWrap: {
    width: WIDE_TILE_W,
  },

  tile: {
    width: TILE_W,
    height: TILE_W * 0.9,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  wideTile: {
    width: WIDE_TILE_W,
    height: 88,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },

  tileGlow: {
    position: 'absolute',
    inset: 0,
    borderRadius: 24,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  tileGlowNormal: {
    borderRadius: 24,
  },
  tileGlowWide: {
    borderRadius: 24,
  },

  tileBlur: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },

  tileIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },

  tileLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  wideTileLabel: {
    fontSize: 15,
  },
});