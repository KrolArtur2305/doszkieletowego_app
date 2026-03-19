import { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../../lib/supabase';

const NEON = '#25F0C8'
const ACCENT = '#19705C'

type Category = { key: string; label: string; icon: keyof typeof Feather.glyphMap };

export default function ZglosProblemScreen() {
  const router = useRouter();
  const { t } = useTranslation('settings');

  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8;

  const categories: Category[] = useMemo(
    () => [
      { key: 'crash',     label: t('report.categories.crash',    { defaultValue: 'Błąd aplikacji' }),    icon: 'alert-octagon' },
      { key: 'login',     label: t('report.categories.login',    { defaultValue: 'Problem z logowaniem' }), icon: 'lock' },
      { key: 'photos',    label: t('report.categories.photos',   { defaultValue: 'Zdjęcia / dokumenty' }), icon: 'image' },
      { key: 'budget',    label: t('report.categories.budget',   { defaultValue: 'Budżet / wydatki' }),  icon: 'dollar-sign' },
      { key: 'other',     label: t('report.categories.other',    { defaultValue: 'Inne' }),               icon: 'more-horizontal' },
    ],
    [t]
  );

  const [category, setCategory] = useState<Category>(categories[0]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    const trimmed = (message || '').trim();
    if (trimmed.length < 10) {
      Alert.alert(
        t('report.alerts.warningTitle', { defaultValue: 'Za krótki opis' }),
        t('report.alerts.minLength', { defaultValue: 'Opisz problem w co najmniej 10 znakach.' })
      );
      return;
    }

    setSending(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;

      const { error } = await supabase.from('zgloszenia').insert({
        user_id: userId,
        kategoria: category.key,
        opis: trimmed,
      });

      if (error) throw error;

      Alert.alert(
        t('report.alerts.thanksTitle', { defaultValue: 'Dziękujemy!' }),
        t('report.alerts.sent', { defaultValue: 'Twoje zgłoszenie zostało wysłane. Odpiszemy najszybciej jak to możliwe.' }),
        [{ text: 'OK', onPress: () => router.back() }]
      );
      setMessage('');
    } catch (e: any) {
      Alert.alert(
        t('report.alerts.errorTitle', { defaultValue: 'Błąd' }),
        t('report.alerts.sendFailed', { defaultValue: 'Nie udało się wysłać zgłoszenia. Spróbuj ponownie.' })
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bg} />
      <View pointerEvents="none" style={styles.glowOrb} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPad }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
            <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.70)" />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>
            {t('report.title', { defaultValue: 'Zgłoś problem' })}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Card */}
        <View style={styles.cardOuter}>
          <BlurView intensity={16} tint="dark" style={styles.card}>

            {/* Category */}
            <Text style={styles.sectionLabel}>
              {t('report.categoryTitle', { defaultValue: 'Kategoria' })}
            </Text>
            <View style={styles.chips}>
              {categories.map((c) => {
                const active = c.key === category.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    onPress={() => setCategory(c)}
                    activeOpacity={0.85}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Feather
                      name={c.icon}
                      size={13}
                      color={active ? '#0B1120' : NEON}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.divider} />

            {/* Description */}
            <Text style={styles.sectionLabel}>
              {t('report.descriptionTitle', { defaultValue: 'Opis problemu' })}
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={t('report.descriptionPlaceholder', { defaultValue: 'Opisz dokładnie co się stało, w którym miejscu aplikacji i kiedy problem wystąpił...' })}
              placeholderTextColor="rgba(255,255,255,0.28)"
              style={styles.textarea}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.charCount}>
              {message.length} {t('report.chars', { defaultValue: 'znaków' })}
            </Text>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, sending && { opacity: 0.65 }]}
              onPress={handleSubmit}
              disabled={sending}
              activeOpacity={0.9}
            >
              <Feather name="send" size={15} color={NEON} />
              <Text style={styles.submitBtnText}>
                {sending
                  ? t('report.actions.sending', { defaultValue: 'Wysyłanie...' })
                  : t('report.actions.send', { defaultValue: 'Wyślij zgłoszenie' })
                }
              </Text>
            </TouchableOpacity>

            {/* Hint */}
            <Text style={styles.hint}>
              {t('report.hint', { defaultValue: 'Zgłoszenia są rozpatrywane w ciągu 24–48 godzin.' })}
            </Text>

          </BlurView>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  glowOrb: {
    position: 'absolute', width: 300, height: 300, borderRadius: 999,
    backgroundColor: ACCENT, opacity: 0.07, top: -60, right: -100,
  },

  content: { paddingHorizontal: 18, paddingBottom: 40 },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 20,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  screenTitle: {
    color: NEON, fontSize: 20, fontWeight: '900', letterSpacing: -0.2,
    textShadowColor: 'rgba(37,240,200,0.18)', textShadowRadius: 14,
  },

  cardOuter: {
    borderRadius: 28, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 12 },
  },
  card: {
    borderRadius: 28, padding: 20,
    backgroundColor: 'rgba(255,255,255,0.026)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },

  sectionLabel: {
    color: 'rgba(255,255,255,0.42)', fontSize: 11.5,
    fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 12,
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderRadius: 999, borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.28)',
    backgroundColor: 'rgba(37,240,200,0.06)',
    paddingVertical: 8, paddingHorizontal: 12,
  },
  chipActive: {
    backgroundColor: NEON, borderColor: NEON,
  },
  chipText: { color: NEON, fontWeight: '800', fontSize: 12 },
  chipTextActive: { color: '#0B1120', fontWeight: '900' },

  divider: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.07)',
    marginVertical: 18,
  },

  textarea: {
    minHeight: 140, borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 14, paddingVertical: 12,
    color: '#FFFFFF', fontSize: 14, fontWeight: '600', lineHeight: 22,
  },
  charCount: {
    color: 'rgba(255,255,255,0.25)', fontSize: 11,
    fontWeight: '700', textAlign: 'right', marginTop: 6, marginBottom: 16,
  },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 18, paddingVertical: 14,
    backgroundColor: 'rgba(37,240,200,0.14)',
    borderWidth: 1.5, borderColor: 'rgba(37,240,200,0.38)',
    marginBottom: 12,
  },
  submitBtnText: { color: NEON, fontSize: 15, fontWeight: '900' },

  hint: {
    color: 'rgba(255,255,255,0.28)', fontSize: 12,
    fontWeight: '600', textAlign: 'center', lineHeight: 18,
  },
});