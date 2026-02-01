import { useEffect, useMemo, useRef, useState } from 'react';
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

type PlanKey = 'free' | 'pro' | 'pro_plus';

type PlanLimits = {
  plan: PlanKey;
  max_photos: number | null;
  max_docs: number | null;
  max_expenses: number | null;
  can_edit_3d: boolean | null;
  can_tasks: boolean | null;
};

export default function PlanScreen() {
  const router = useRouter();
  const stars = useMemo(() => buildStars(90), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<PlanKey | null>(null);
  const [limits, setLimits] = useState<Record<PlanKey, PlanLimits | null>>({
    free: null,
    pro: null,
    pro_plus: null,
  });

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data, error } = await supabase
          .from('plan_limits')
          .select('plan,max_photos,max_docs,max_expenses,can_edit_3d,can_tasks')
          .in('plan', ['free', 'pro', 'pro_plus']);

        if (error) throw error;

        const map: Record<PlanKey, PlanLimits | null> = { free: null, pro: null, pro_plus: null };
        (data as PlanLimits[]).forEach((row) => {
          map[row.plan] = row;
        });

        if (alive) setLimits(map);
      } catch {
        // nawet jak się nie pobierze, ekrany i tak działają (pokażemy teksty)
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const pick = async (plan: PlanKey) => {
    setSaving(plan);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess.session?.user;
      if (!user) {
        Alert.alert('Błąd', 'Brak sesji. Zaloguj się ponownie.');
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          plan,
          plan_selected: true,
          billing_cycle: null,
          subscription_source: 'manual',
          plan_expires_at: null,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      router.replace('/(app)/(tabs)/dashboard');
    } catch (e) {
      Alert.alert('Błąd', 'Nie udało się zapisać planu. Spróbuj ponownie.');
    } finally {
      setSaving(null);
    }
  };

  const renderCard = (plan: PlanKey, title: string, price: string, tagline: string) => {
    const l = limits[plan];

    return (
      <View style={styles.card} key={plan}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardPrice}>{price}</Text>
        </View>
        <Text style={styles.cardTagline}>{tagline}</Text>

        <View style={styles.bullets}>
          <Text style={styles.bullet}>• Zdjęcia: {l?.max_photos ?? (plan === 'free' ? 5 : plan === 'pro' ? 500 : 5000)}</Text>
          <Text style={styles.bullet}>• Dokumenty: {l?.max_docs ?? (plan === 'free' ? 3 : plan === 'pro' ? 200 : 1000)}</Text>
          <Text style={styles.bullet}>• Wydatki: {l?.max_expenses ?? (plan === 'free' ? 5 : 'bez limitu')}</Text>
          <Text style={styles.bullet}>• Edycja 3D: {(l?.can_edit_3d ?? plan !== 'free') ? 'tak' : 'nie'}</Text>
          <Text style={styles.bullet}>• Zadania: {(l?.can_tasks ?? plan !== 'free') ? 'tak' : 'nie'}</Text>
        </View>

        <TouchableOpacity
          onPress={() => pick(plan)}
          disabled={saving !== null}
          activeOpacity={0.9}
          style={[styles.cta, plan !== 'free' && styles.ctaStrong, saving && { opacity: 0.7 }]}
        >
          {saving === plan ? (
            <ActivityIndicator />
          ) : (
            <Text style={[styles.ctaText, plan !== 'free' && styles.ctaTextStrong]}>
              Wybieram
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
        <Text style={styles.hTitle}>Wybierz plan</Text>
        <Text style={styles.hSub}>
          To jednorazowy krok. Zawsze możesz później zmienić plan w ustawieniach.
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator />
        </View>
      ) : (
        <View style={styles.list}>
          {renderCard('free', 'Free', '0 zł', 'Na start i test projektu')}
          {renderCard('pro', 'Pro', '—', 'Dla inwestora, który chce mieć pełną kontrolę')}
          {renderCard('pro_plus', 'Pro+', '—', 'Dla maksymalnego porządku i archiwum budowy')}
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
