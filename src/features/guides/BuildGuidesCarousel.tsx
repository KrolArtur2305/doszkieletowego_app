import React from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { colors } from '../../ui/theme';
import type { BuildGuide } from './buildGuides';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 10;
const CARD_WIDTH = Math.max(96, Math.min(124, Math.floor((SCREEN_WIDTH - 58) / 3.2)));

type BuildGuidesCarouselProps = {
  guides: BuildGuide[];
  onOpenAll: () => void;
  onOpenGuide: (guide: BuildGuide) => void;
};

export function BuildGuidesCarousel({ guides, onOpenAll, onOpenGuide }: BuildGuidesCarouselProps) {
  const { t } = useTranslation('stages');

  if (!guides.length) return null;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('guides.title')}</Text>
        <TouchableOpacity onPress={onOpenAll} activeOpacity={0.82} hitSlop={8}>
          <Text style={styles.allLink}>{t('guides.all')}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        contentContainerStyle={styles.carouselContent}
      >
        {guides.map((guide) => (
          <TouchableOpacity
            key={`${guide.stage}-${guide.buildOrder}-${guide.id}`}
            style={styles.cardButton}
            activeOpacity={0.88}
            onPress={() => onOpenGuide(guide)}
          >
            <BlurView intensity={18} tint="dark" style={styles.card}>
              <Image source={{ uri: guide.image }} style={styles.image} contentFit="cover" />
              <View style={styles.body}>
                <Text style={styles.guideTitle} numberOfLines={2}>
                  {t(`guides.items.${guide.id}.title`)}
                </Text>
                <View style={styles.metaRow}>
                  <Feather name="clock" size={11} color={colors.accentBright} />
                  <Text style={styles.readingTime}>
                    {t('guides.readingTimeMinutes', { minutes: guide.readingTimeMinutes })}
                  </Text>
                </View>
              </View>
            </BlurView>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 14,
  },
  headerRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 2,
    marginBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  allLink: {
    color: colors.accentBright,
    fontSize: 13,
    fontWeight: '900',
  },
  carouselContent: {
    gap: CARD_GAP,
    paddingRight: 18,
    paddingBottom: 2,
  },
  cardButton: {
    width: CARD_WIDTH,
  },
  card: {
    width: CARD_WIDTH,
    minHeight: 154,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.028)',
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  body: {
    paddingHorizontal: 9,
    paddingTop: 8,
    paddingBottom: 9,
    gap: 7,
  },
  guideTitle: {
    minHeight: 34,
    color: 'rgba(255,255,255,0.94)',
    fontSize: 11.8,
    lineHeight: 16,
    fontWeight: '900',
  },
  metaRow: {
    height: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  readingTime: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 10.5,
    fontWeight: '800',
  },
});
