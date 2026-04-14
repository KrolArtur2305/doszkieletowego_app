import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useTranslation } from 'react-i18next';
import {
  FREE_PLAN_KEY,
  SUBSCRIPTION_PLAN_LIST,
  SUBSCRIPTION_PLAN_ORDER,
  type SubscriptionPlanDefinition,
  type SubscriptionPlanKey,
} from '../../src/config/subscriptionPlans';

const { width: W, height: H } = Dimensions.get('window');

type Star = { left: number; top: number; size: number; opacity: number };

function buildStars(count: number): Star[] {
  const stars: Star[] = [];
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < count; i++) {
    const size = 1 + Math.floor(rnd() * 2);
    stars.push({
      left: Math.floor(rnd() * W),
      top: Math.floor(rnd() * H),
      size,
      opacity: 0.2 + rnd() * 0.8,
    });
  }
  return stars;
}

type PlanLimits = {
  plan: SubscriptionPlanKey;
  max_photos: number | null;
  max_docs: number | null;
  max_expenses: number | null;
  can_edit_3d: boolean | null;
  can_tasks: boolean | null;
};

function uiLocaleFromLang(lang?: string) {
  const base = (lang || 'en').split('-')[0];
  const map: Record<string, string> = { pl: 'pl-PL', en: 'en-US', de: 'de-DE' };
  return map[base] || 'en-US';
}

export default function PlanScreen() {
  const router = useRouter();
  const stars = useMemo(() => buildStars(90), []);

  const { t, i18n } = useTranslation('plan');
  const { t: ts } = useTranslation('subscription');
  const locale = useMemo(
    () => uiLocaleFromLang(i18n.resolvedLanguage || i18n.language),
    [i18n.language, i18n.resolvedLanguage]
  );

  const fmtMoney = (amount: number, currency: string) => {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  };

  const currency = 'PLN';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SubscriptionPlanKey | null>(null);
  const [limits, setLimits] = useState<Record<SubscriptionPlanKey, PlanLimits | null>>({
    free: null,
    standard: null,
    pro: null,
  });

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data, error } = await supabase
          .from('plan_limits')
          .select('plan,max_photos,max_docs,max_expenses,can_edit_3d,can_tasks')
          .in('plan', SUBSCRIPTION_PLAN_ORDER);

        if (error) throw error;

        const map: Record<SubscriptionPlanKey, PlanLimits | null> = {
          free: null,
          standard: null,
          pro: null,
        };
        (data as PlanLimits[]).forEach((row) => {
          map[row.plan] = row;
        });

        if (alive) setLimits(map);
      } catch {
        // nawet jak się nie pobierze, ekrany i tak działają
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const pick = async (plan: SubscriptionPlanKey) => {
    setSaving(plan);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess.session?.user;
      if (!user) {
        Alert.alert(t('alerts.errorTitle'), t('alerts.noSession'));
        return;
      }

      if (plan !== FREE_PLAN_KEY) {
        Alert.alert(
          t('alerts.errorTitle'),
          t('alerts.paidPlanRequiresActivation', {
            defaultValue: 'Plan płatny wymaga osobnej aktywacji po potwierdzonym zakupie. Na tym etapie konto pozostaje w planie darmowym.',
          }),
          [{ text: 'OK', onPress: () => router.replace('/(app)/(tabs)/dashboard') }]
        );
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          plan: FREE_PLAN_KEY,
          billing_cycle: null,
          plan_expires_at: null,
          subscription_source: null,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      router.replace('/(app)/(tabs)/dashboard');
    } catch {
      Alert.alert(t('alerts.errorTitle'), t('alerts.saveFailed'));
    } finally {
      setSaving(null);
    }
  };

  const yesNo = (v: boolean) => (v ? t('labels.yes') : t('labels.no'));

  const unlimitedLabel = t('labels.unlimited');

  const renderCard = (planDef: SubscriptionPlanDefinition) => {
    const l = limits[planDef.key];

    const photos = l?.max_photos ?? planDef.features.photos;
    const docs = l?.max_docs ?? planDef.features.docs;
    const expenses = l?.max_expenses ?? planDef.features.expenses;
    const canEdit3d = l?.can_edit_3d ?? planDef.features.model3d;
    const canTasks = l?.can_tasks ?? (planDef.features.tasks !== 0);

    const title = ts(planDef.nameKey, { defaultValue: planDef.key.toUpperCase() });
    const tagline = ts(planDef.descKey);
    const price = fmtMoney(planDef.monthlyPrice ?? 0, currency);

    return (
      <View style={styles.card} key={planDef.key}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardPrice}>{price}</Text>
        </View>

        <Text style={styles.cardTagline}>{tagline}</Text>

        <View style={styles.bullets}>
          <Text style={styles.bullet}>• {t('bullets.photos')}: {photos}</Text>
          <Text style={styles.bullet}>• {t('bullets.documents')}: {docs}</Text>
          <Text style={styles.bullet}>• {t('bullets.expenses')}: {expenses ?? unlimitedLabel}</Text>
          <Text style={styles.bullet}>• {t('bullets.edit3d')}: {yesNo(canEdit3d)}</Text>
          <Text style={styles.bullet}>• {t('bullets.tasks')}: {yesNo(canTasks)}</Text>
        </View>

        <TouchableOpacity
          onPress={() => pick(planDef.key)}
          disabled={saving !== null}
          activeOpacity={0.9}
          style={[styles.cta, planDef.key !== FREE_PLAN_KEY && styles.ctaStrong, saving && { opacity: 0.7 }]}
        >
          {saving === planDef.key ? (
            <ActivityIndicator />
          ) : (
            <Text style={[styles.ctaText, planDef.key !== FREE_PLAN_KEY && styles.ctaTextStrong]}>
              {t('actions.choose')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {stars.map((s, idx) => (
          <View
            key={idx}
            style={[
              styles.star,
              { left: s.left, top: s.top, width: s.size, height: s.size, opacity: s.opacity },
            ]}
          />
        ))}
      </View>

      <View style={styles.header}>
        <Text style={styles.hTitle}>{t('header.title')}</Text>
        <Text style={styles.hSub}>{t('header.subtitle')}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator />
        </View>
      ) : (
        <View style={styles.list}>
          {SUBSCRIPTION_PLAN_LIST.map(renderCard)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingHorizontal: 18, paddingTop: 18 },
  star: { position: 'absolute', borderRadius: 99, backgroundColor: '#FFF' },

  header: { marginTop: 12, marginBottom: 14, alignItems: 'center' },
  hTitle: { color: '#25F0C8', fontSize: 22, fontWeight: '900' },
  hSub: { color: 'rgba(255,255,255,0.65)', textAlign: 'center', marginTop: 6, lineHeight: 18 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: { gap: 12 },

  card: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cardTitle: { color: 'rgba(255,255,255,0.92)', fontSize: 18, fontWeight: '900' },
  cardPrice: { color: 'rgba(255,255,255,0.7)', fontWeight: '800' },
  cardTagline: { color: 'rgba(255,255,255,0.65)', marginTop: 6 },

  bullets: { marginTop: 10, gap: 6 },
  bullet: { color: 'rgba(255,255,255,0.78)' },

  cta: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
  },
  ctaStrong: {
    borderColor: 'rgba(16,185,129,0.95)',
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  ctaText: { color: 'rgba(255,255,255,0.9)', fontWeight: '900' },
  ctaTextStrong: { color: '#25F0C8' },
});
