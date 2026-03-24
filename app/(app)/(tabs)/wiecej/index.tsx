import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
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
import { useSupabaseAuth } from '../../../../hooks/useSupabaseAuth';

const ACCENT = '#19705C';
const NEON = '#25F0C8';
const { width: W } = Dimensions.get('window');
const TILE_GAP = 14;
const TILE_W = (W - 18 * 2 - TILE_GAP) / 2;

// ─── Types ────────────────────────────────────────────────────────────────────

type Contact = {
  id: string;
  user_id: string;
  imie_nazwisko: string;
  telefon: string | null;
  email: string | null;
  firma: string | null;
  rola: string | null;
  notatki: string | null;
};

type Tile = {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  onPress: () => void;
};

// ─── Empty contact ────────────────────────────────────────────────────────────

const emptyContact = (): Omit<Contact, 'id' | 'user_id'> => ({
  imie_nazwisko: '',
  telefon: '',
  email: '',
  firma: '',
  rola: '',
  notatki: '',
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function WiecejScreen() {
  const router = useRouter();
  const { t } = useTranslation('navigation');
  const { session } = useSupabaseAuth();
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8;

  // ── Contacts state ──
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [form, setForm] = useState(emptyContact());
  const [saving, setSaving] = useState(false);

  // ── Staggered entrance ──
  const anims = useRef(Array.from({ length: 6 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.stagger(
      60,
      anims.map((a) =>
        Animated.spring(a, { toValue: 1, useNativeDriver: true, tension: 70, friction: 10 })
      )
    ).start();
  }, []);

  // ── Load contacts ──
  const loadContacts = async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    setContactsLoading(true);
    try {
      const { data } = await supabase
        .from('kontakty')
        .select('*')
        .eq('user_id', userId)
        .order('imie_nazwisko', { ascending: true });
      setContacts((data ?? []) as Contact[]);
    } catch {
      setContacts([]);
    } finally {
      setContactsLoading(false);
    }
  };

  useEffect(() => {
    if (contactsOpen) loadContacts();
  }, [contactsOpen]);

  // ── Save contact ──
  const openNew = () => {
    setEditingContact(null);
    setForm(emptyContact());
    setEditOpen(true);
  };

  const openEdit = (c: Contact) => {
    setEditingContact(c);
    setForm({
      imie_nazwisko: c.imie_nazwisko,
      telefon: c.telefon ?? '',
      email: c.email ?? '',
      firma: c.firma ?? '',
      rola: c.rola ?? '',
      notatki: c.notatki ?? '',
    });
    setEditOpen(true);
  };

  const saveContact = async () => {
    if (!form.imie_nazwisko.trim()) {
      Alert.alert('Błąd', 'Podaj imię i nazwisko.');
      return;
    }
    const userId = session?.user?.id;
    if (!userId) return;
    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        imie_nazwisko: form.imie_nazwisko.trim(),
        telefon: form.telefon?.trim() || null,
        email: form.email?.trim() || null,
        firma: form.firma?.trim() || null,
        rola: form.rola?.trim() || null,
        notatki: form.notatki?.trim() || null,
      };
      if (editingContact) {
        await supabase.from('kontakty').update(payload).eq('id', editingContact.id);
      } else {
        await supabase.from('kontakty').insert(payload);
      }
      setEditOpen(false);
      await loadContacts();
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? 'Nie udało się zapisać kontaktu.');
    } finally {
      setSaving(false);
    }
  };

  const deleteContact = (c: Contact) => {
    Alert.alert('Usuń kontakt', `Usunąć ${c.imie_nazwisko}?`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń', style: 'destructive',
        onPress: async () => {
          await supabase.from('kontakty').delete().eq('id', c.id);
          await loadContacts();
        },
      },
    ]);
  };

  // ── Tiles definition ──
  const tiles: Tile[] = [
    {
      key: 'zdjecia',
      label: t('tabs.photos', { defaultValue: 'Zdjęcia' }),
      icon: 'camera',
      color: '#F59E0B',
      onPress: () => router.push('/(app)/(tabs)/zdjecia'),
    },
    {
      key: 'dokumenty',
      label: t('tabs.documents', { defaultValue: 'Dokumenty' }),
      icon: 'file-text',
      color: '#3B82F6',
      onPress: () => router.push('/(app)/(tabs)/dokumenty'),
    },
    {
      key: 'kontakty',
      label: 'Kontakty',
      icon: 'users',
      color: NEON,
      onPress: () => setContactsOpen(true),
    },
    {
      key: 'postepy',
      label: 'Postępy',
      icon: 'trending-up',
      color: '#A78BFA',
      onPress: () => router.push('/(app)/(tabs)/postepy'),
    },
    {
      key: 'ustawienia',
      label: 'Ustawienia',
      icon: 'settings',
      color: 'rgba(148,163,184,0.90)',
      onPress: () => router.push('/(app)/(tabs)/ustawienia'),
    },
    {
      key: 'dziennik',
      label: 'Dziennik budowy',
      icon: 'book-open',
      color: '#F472B6',
      onPress: () => router.push('/(app)/(tabs)/wiecej/dziennik'),
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
        {/* Header */}
        <Text style={styles.heading}>Więcej</Text>

        {/* 2x3 grid */}
        <View style={styles.grid}>
          {tiles.map((tile, i) => {
            const anim = anims[i];
            const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
            const opacity = anim;

            return (
              <Animated.View
                key={tile.key}
                style={[styles.tileWrap, { opacity, transform: [{ scale }] }]}
              >
                <Pressable
                  onPress={tile.onPress}
                  style={({ pressed }) => [styles.tile, pressed && { opacity: 0.78, transform: [{ scale: 0.97 }] }]}
                >
                  <BlurView intensity={14} tint="dark" style={styles.tileBlur}>
                    <View style={[styles.tileIconWrap, { backgroundColor: `${tile.color}18`, borderColor: `${tile.color}30` }]}>
                      <Feather name={tile.icon} size={26} color={tile.color} />
                    </View>
                    <Text style={styles.tileLabel}>{tile.label}</Text>
                  </BlurView>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>

      {/* ── CONTACTS MODAL ── */}
      <Modal
        visible={contactsOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setContactsOpen(false)}
      >
        <View style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Kontakty</Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={openNew} style={styles.modalAddBtn} activeOpacity={0.88}>
                <Feather name="plus" size={18} color={NEON} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setContactsOpen(false)} activeOpacity={0.88}>
                <Feather name="x" size={22} color="rgba(255,255,255,0.55)" />
              </TouchableOpacity>
            </View>
          </View>

          {contactsLoading ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>Ładowanie...</Text>
            </View>
          ) : contacts.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="users" size={40} color="rgba(255,255,255,0.15)" />
              <Text style={styles.emptyText}>Brak kontaktów</Text>
              <TouchableOpacity onPress={openNew} style={styles.emptyAddBtn} activeOpacity={0.88}>
                <Text style={styles.emptyAddBtnText}>+ Dodaj pierwszy kontakt</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={contacts}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ padding: 16, gap: 10 }}
              renderItem={({ item: c }) => (
                <ContactCard
                  contact={c}
                  onEdit={() => openEdit(c)}
                  onDelete={() => deleteContact(c)}
                />
              )}
            />
          )}
        </View>
      </Modal>

      {/* ── EDIT CONTACT MODAL ── */}
      <Modal
        visible={editOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditOpen(false)}
      >
        <View style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingContact ? 'Edytuj kontakt' : 'Nowy kontakt'}
            </Text>
            <TouchableOpacity onPress={() => setEditOpen(false)} activeOpacity={0.88}>
              <Feather name="x" size={22} color="rgba(255,255,255,0.55)" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
            <FormField label="Imię i nazwisko *" value={form.imie_nazwisko} onChangeText={(v) => setForm({ ...form, imie_nazwisko: v })} placeholder="np. Jan Kowalski" />
            <FormField label="Firma" value={form.firma ?? ''} onChangeText={(v) => setForm({ ...form, firma: v })} placeholder="np. Budmax Sp. z o.o." />
            <FormField label="Rola" value={form.rola ?? ''} onChangeText={(v) => setForm({ ...form, rola: v })} placeholder="np. Kierownik budowy, Elektryk..." />
            <FormField label="Telefon" value={form.telefon ?? ''} onChangeText={(v) => setForm({ ...form, telefon: v })} placeholder="+48 600 000 000" keyboardType="phone-pad" />
            <FormField label="Email" value={form.email ?? ''} onChangeText={(v) => setForm({ ...form, email: v })} placeholder="jan@firma.pl" keyboardType="email-address" />
            <FormField label="Notatki" value={form.notatki ?? ''} onChangeText={(v) => setForm({ ...form, notatki: v })} placeholder="Dodatkowe informacje..." multiline />

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={saveContact}
              disabled={saving}
              activeOpacity={0.9}
            >
              <Text style={styles.saveBtnText}>{saving ? 'Zapisywanie...' : 'Zapisz kontakt'}</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Contact Card ─────────────────────────────────────────────────────────────

function ContactCard({ contact: c, onEdit, onDelete }: { contact: Contact; onEdit: () => void; onDelete: () => void }) {
  const initials = c.imie_nazwisko
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const call = () => c.telefon && Linking.openURL(`tel:${c.telefon}`);
  const sms = () => c.telefon && Linking.openURL(`sms:${c.telefon}`);
  const mail = () => c.email && Linking.openURL(`mailto:${c.email}`);

  return (
    <View style={cardStyles.card}>
      {/* Avatar */}
      <View style={cardStyles.avatar}>
        <Text style={cardStyles.avatarText}>{initials}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={cardStyles.name} numberOfLines={1}>{c.imie_nazwisko}</Text>
        {!!(c.firma || c.rola) && (
          <Text style={cardStyles.sub} numberOfLines={1}>
            {[c.rola, c.firma].filter(Boolean).join(' · ')}
          </Text>
        )}

        {/* Action buttons */}
        <View style={cardStyles.actions}>
          {!!c.telefon && (
            <>
              <TouchableOpacity onPress={call} style={cardStyles.actionBtn} activeOpacity={0.8}>
                <Feather name="phone" size={14} color={NEON} />
              </TouchableOpacity>
              <TouchableOpacity onPress={sms} style={cardStyles.actionBtn} activeOpacity={0.8}>
                <Feather name="message-circle" size={14} color={NEON} />
              </TouchableOpacity>
            </>
          )}
          {!!c.email && (
            <TouchableOpacity onPress={mail} style={cardStyles.actionBtn} activeOpacity={0.8}>
              <Feather name="mail" size={14} color={NEON} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Edit/Delete */}
      <View style={cardStyles.cardActions}>
        <TouchableOpacity onPress={onEdit} style={cardStyles.iconBtn} activeOpacity={0.8}>
          <Feather name="edit-2" size={15} color="rgba(255,255,255,0.45)" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={cardStyles.iconBtn} activeOpacity={0.8}>
          <Feather name="trash-2" size={15} color="rgba(239,68,68,0.70)" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Form Field ───────────────────────────────────────────────────────────────

function FormField({ label, value, onChangeText, placeholder, keyboardType, multiline }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  multiline?: boolean;
}) {
  return (
    <View>
      <Text style={fieldStyles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.25)"
        style={[fieldStyles.input, multiline && { height: 80, textAlignVertical: 'top' }]}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize="none"
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000' },
  glowTop: {
    position: 'absolute', width: 380, height: 380, borderRadius: 999,
    backgroundColor: ACCENT, opacity: 0.07, top: -200, right: -150,
  },

  content: { paddingHorizontal: 18, paddingBottom: 120 },

  heading: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginBottom: 22,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tileWrap: {
    width: TILE_W,
  },
  tilePlaceholder: {
    width: TILE_W,
  },
  tile: {
    width: TILE_W,
    height: TILE_W * 0.9,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
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
  },
  tileLabel: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13.5,
    fontWeight: '800',
    textAlign: 'center',
  },

  // Modals
  modalScreen: {
    flex: 1,
    backgroundColor: '#080E1C',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  modalAddBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.30)',
    backgroundColor: 'rgba(37,240,200,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyAddBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.25)',
    marginTop: 8,
  },
  emptyAddBtnText: {
    color: NEON,
    fontSize: 14,
    fontWeight: '800',
  },
  saveBtn: {
    marginTop: 8,
    borderRadius: 18,
    paddingVertical: 16,
    backgroundColor: NEON,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#0B1120',
    fontSize: 16,
    fontWeight: '900',
  },
});

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(37,240,200,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: NEON,
    fontSize: 14,
    fontWeight: '900',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  sub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActions: {
    flexDirection: 'column',
    gap: 6,
    flexShrink: 0,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const fieldStyles = StyleSheet.create({
  label: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});