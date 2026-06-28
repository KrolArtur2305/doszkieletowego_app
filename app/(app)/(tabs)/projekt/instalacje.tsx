import { useMemo, useRef } from 'react'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'

import { AppButton, AppCard, AppHeader, AppScreen } from '../../../../src/ui/components'

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
          <Text style={styles.text}>
            W tym miejscu mozna pokazac krotki poradnik i najwazniejsze decyzje dla danej instalacji.
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Co warto sprawdzic</Text>
            <Text style={styles.sectionText}>Dobor mocy, miejsce montazu, dostep serwisowy i wplyw na harmonogram prac.</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Na co uwazac</Text>
            <Text style={styles.sectionText}>Warunki techniczne, kompatybilnosc z reszta instalacji i koszty eksploatacji.</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Kiedy wrocic do AI</Text>
            <Text style={styles.sectionText}>Gdy chcesz porownac rozwiazania albo doprecyzowac kolejne kroki z wykonawca.</Text>
          </View>

          <AppButton
            title="Zapytaj AI"
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
  cta: {
    marginTop: 16,
    alignSelf: 'flex-start',
    minWidth: 146,
  },
})
