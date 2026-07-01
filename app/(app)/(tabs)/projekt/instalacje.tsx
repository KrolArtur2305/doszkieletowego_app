import { useMemo, useRef } from 'react'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Image, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { AppButton, AppCard, AppScreen } from '../../../../src/ui/components'
import { colors, header, radius, spacing, typography } from '../../../../src/ui/theme'

const APP_LOGO = require('../../../../assets/logo.png')

const DETAIL_SECTIONS = [
  {
    key: 'benefits',
    icon: 'plus-circle' as const,
    titleKey: 'installationDetails.sections.benefits.title',
    itemsKey: 'installationDetails.sections.benefits.items',
    accent: '#25F0C8',
    tone: 'benefit',
  },
  {
    key: 'drawbacks',
    icon: 'minus-circle' as const,
    titleKey: 'installationDetails.sections.drawbacks.title',
    itemsKey: 'installationDetails.sections.drawbacks.items',
    accent: '#F97373',
    tone: 'drawback',
  },
  {
    key: 'costs',
    icon: 'trending-up' as const,
    titleKey: 'installationDetails.sections.costs.title',
    itemsKey: 'installationDetails.sections.costs.items',
    accent: '#25F0C8',
    tone: 'neutral',
  },
  {
    key: 'questions',
    icon: 'help-circle' as const,
    titleKey: 'installationDetails.sections.questions.title',
    itemsKey: 'installationDetails.sections.questions.items',
    accent: '#25F0C8',
    tone: 'neutral',
  },
] as const

function splitTitle(title: string) {
  const words = title.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return title.trim()
  if (words.length === 2) return `${words[0]}\n${words[1]}`
  return `${words.slice(0, 2).join(' ')}\n${words.slice(2).join(' ')}`
}

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

  const displayTitle = useMemo(() => splitTitle(title), [title])

  const goBackToProject = () => {
    router.replace('/(app)/(tabs)/projekt')
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gestureState) => {
        return Math.abs(gestureState.dx) > 22 && Math.abs(gestureState.dy) < 18 && gestureState.dx > 0
      },
      onPanResponderRelease: (_event, gestureState) => {
        if (gestureState.dx > 60 || gestureState.vx > 0.4) {
          goBackToProject()
        }
      },
    })
  ).current

  return (
    <AppScreen scroll contentContainerStyle={styles.screen}>
      <View style={styles.content} {...panResponder.panHandlers}>
        <View style={styles.topRow}>
          <Image source={APP_LOGO} style={styles.brandLogo} resizeMode="contain" />
          <Pressable onPress={goBackToProject} hitSlop={12} style={styles.closeBtn}>
            <Feather name="x" size={18} color="rgba(255,255,255,0.78)" />
          </Pressable>
        </View>

        <View style={styles.headerBlock}>
          <Text style={styles.pageTitle}>{displayTitle}</Text>
        </View>

        <View style={styles.heroIconWrap}>
          <MaterialCommunityIcons
            name={iconName as keyof typeof MaterialCommunityIcons.glyphMap}
            size={54}
            color="rgba(248,250,252,0.92)"
          />
        </View>

        <Text style={styles.lead}>
          {t('installationDetails.about.text', { name: title })}
        </Text>

        {DETAIL_SECTIONS.map((section) => {
          const hasItems = 'itemsKey' in section
          const hasText = 'textKey' in section
          const items = hasItems ? (t(section.itemsKey, { returnObjects: true }) as string[]) : []
          const text = hasText ? t((section as any).textKey, { name: title }) : null

          return (
            <AppCard key={section.key} style={styles.sectionCard} contentStyle={styles.sectionCardContent} withShadow={false}>
              <View style={styles.sectionHeader}>
                <View
                  style={[
                    styles.sectionIcon,
                    section.tone === 'benefit'
                      ? styles.benefitIcon
                      : section.tone === 'drawback'
                        ? styles.drawbackIcon
                        : styles.neutralIcon,
                  ]}
                >
                  <Feather
                    name={section.icon}
                    size={16}
                    color={section.tone === 'drawback' ? '#F97373' : '#25F0C8'}
                  />
                </View>
                <Text style={styles.sectionTitle}>{t(section.titleKey)}</Text>
              </View>

              {text ? <Text style={styles.sectionText}>{text}</Text> : null}

              {items?.length ? (
                <View style={styles.pointsList}>
                  {items.map((item, index) => (
                    <View
                      key={`${section.key}-${index}`}
                      style={[
                        styles.pointRow,
                        section.tone === 'benefit' ? styles.pointRowBenefit : section.tone === 'drawback' ? styles.pointRowDrawback : styles.pointRowNeutral,
                      ]}
                    >
                      <View
                        style={[
                          styles.pointBadge,
                          section.tone === 'benefit'
                            ? styles.pointBadgeBenefit
                            : section.tone === 'drawback'
                              ? styles.pointBadgeDrawback
                              : styles.pointBadgeNeutral,
                        ]}
                      >
                        <Feather
                          name={section.tone === 'drawback' ? 'minus' : 'check'}
                          size={14}
                          color={section.tone === 'drawback' ? '#F97373' : '#25F0C8'}
                        />
                      </View>
                      <Text style={styles.pointText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </AppCard>
          )
        })}

        <AppButton
          title={t('installationDetails.askAi')}
          onPress={() => router.push('/(app)/(tabs)/buddy')}
          style={styles.cta}
        />
      </View>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: spacing.lg + 2,
    paddingTop: spacing.lg,
    paddingBottom: spacing['2xl'],
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  brandLogo: {
    width: header.sideSlot,
    height: header.logoHeight,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  headerBlock: {
    alignItems: 'center',
    marginTop: -4,
    marginBottom: spacing.sm,
  },
  pageTitle: {
    color: '#F8FAFC',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  heroIconWrap: {
    width: 116,
    height: 116,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  lead: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  sectionCard: {
    marginBottom: spacing.md,
  },
  sectionCardContent: {
    padding: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  benefitIcon: {
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderColor: 'rgba(37,240,200,0.22)',
  },
  drawbackIcon: {
    backgroundColor: 'rgba(249,115,115,0.10)',
    borderColor: 'rgba(249,115,115,0.22)',
  },
  neutralIcon: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(37,240,200,0.18)',
  },
  sectionTitle: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  sectionText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  pointsList: {
    gap: 10,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  pointRowBenefit: {
    backgroundColor: 'rgba(37,240,200,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.10)',
  },
  pointRowDrawback: {
    backgroundColor: 'rgba(249,115,115,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(249,115,115,0.10)',
  },
  pointRowNeutral: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  pointBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  pointBadgeBenefit: {
    backgroundColor: 'rgba(37,240,200,0.12)',
  },
  pointBadgeDrawback: {
    backgroundColor: 'rgba(249,115,115,0.12)',
  },
  pointBadgeNeutral: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pointText: {
    flex: 1,
    color: 'rgba(255,255,255,0.80)',
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '600',
  },
  cta: {
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
})
