import { useMemo, useRef } from 'react'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { AppButton, AppCard, AppHeader, AppScreen } from '../../../../src/ui/components'

const DETAIL_SECTIONS = [
  {
    key: 'decisions',
    icon: 'check-square' as keyof typeof Feather.glyphMap,
    titleKey: 'installationDetails.sections.decisions.title',
    textKey: 'installationDetails.sections.decisions.text',
  },
  {
    key: 'contractor',
    icon: 'tool' as keyof typeof Feather.glyphMap,
    titleKey: 'installationDetails.sections.contractor.title',
    textKey: 'installationDetails.sections.contractor.text',
  },
  {
    key: 'costs',
    icon: 'trending-up' as keyof typeof Feather.glyphMap,
    titleKey: 'installationDetails.sections.costs.title',
    textKey: 'installationDetails.sections.costs.text',
  },
]

export default function InstallationDetailsScreen() {
  const { t } = useTranslation('project')
  const router = useRouter()
  const params = useLocalSearchParams<{ title?: string | string[]; icon?: string | string[] }>()

  const title = useMemo(() => {
    const raw = Array.isArray(params.title) ? params.title[0] : params.title
    return raw?.trim() || t('installationsSection.allTitle')
  }, [params.title, t])

  const iconName = useMemo(() => {
    const raw = Array.isArray(params.icon) ? params.icon[0] : params.icon
    return raw?.trim() || 'information-outline'
  }, [params.icon])

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gestureState) => {
        return Math.abs(gestureState.dx) > 24 && Math.abs(gestureState.dy) < 20 && gestureState.dx > 0
      },
      onPanResponderRelease: (_event, gestureState) => {
        if (gestureState.dx > 70 || gestureState.vx > 0.45) {
          router.back()
        }
      },
    })
  ).current

  return (
    <AppScreen style={styles.screen}>
      <View style={styles.container} {...panResponder.panHandlers}>
        <AppHeader
          title={title}
          rightSlot={
            <Pressable onPress={() => router.back()} hitSlop={10} style={styles.closeBtn}>
              <Feather name="x" size={18} color="rgba(255,255,255,0.74)" />
            </Pressable>
          }
        />

        <AppCard contentStyle={styles.card}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons
              name={iconName as keyof typeof MaterialCommunityIcons.glyphMap}
              size={26}
              color="rgba(248,250,252,0.90)"
            />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.text}>{t('installationDetails.lead')}</Text>

          <View style={styles.recommendationSlot}>
            <View style={styles.recommendationIcon}>
              <Feather name="bookmark" size={16} color="#25F0C8" />
            </View>
            <View style={styles.recommendationTextWrap}>
              <Text style={styles.recommendationEyebrow}>{t('installationDetails.recommendation.eyebrow')}</Text>
              <Text style={styles.recommendationTitle}>{t('installationDetails.recommendation.title')}</Text>
              <Text style={styles.recommendationText}>{t('installationDetails.recommendation.text')}</Text>
            </View>
          </View>

          {DETAIL_SECTIONS.map((section) => (
            <View key={section.key} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Feather name={section.icon} size={15} color="#25F0C8" />
                <Text style={styles.sectionTitle}>{t(section.titleKey)}</Text>
              </View>
              <Text style={styles.sectionText}>{t(section.textKey)}</Text>
            </View>
          ))}

          <AppButton
            title={t('installationDetails.askAi')}
            onPress={() => router.push('/(app)/(tabs)/buddy')}
            style={styles.cta}
          />
        </AppCard>
      </View>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#05070B',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  card: {
    borderRadius: 24,
    padding: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  heroIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  text: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.74)',
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '600',
  },
  section: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: -0.1,
  },
  sectionText: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.68)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  recommendationSlot: {
    marginTop: 16,
    padding: 14,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
  },
  recommendationIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,240,200,0.10)',
  },
  recommendationTextWrap: {
    flex: 1,
  },
  recommendationEyebrow: {
    color: '#25F0C8',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  recommendationTitle: {
    marginTop: 3,
    color: '#F8FAFC',
    fontSize: 13.5,
    fontWeight: '900',
  },
  recommendationText: {
    marginTop: 5,
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '600',
  },
  cta: {
    marginTop: 16,
    alignSelf: 'flex-start',
    minWidth: 146,
  },
})
