import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../../../../lib/supabase';
import { useSupabaseAuth } from '../../../../../hooks/useSupabaseAuth';
import { FloatingAddButton } from '../../../../../components/FloatingAddButton';
import { AppHeader } from '../../../../../src/ui/components';

const ACCENT = '#19705C';
const NEON = '#25F0C8';
const { width: W } = Dimensions.get('window');

type Contact = {
  id: string;
  user_id: string;
  imie_nazwisko: string;
  telefon: string | null;
  email: string | null;
  firma: string | null;
  rola: string | null;
  notatki: string | null;
  created_at?: string;
};

const emptyContact = (): Omit<Contact, 'id' | 'user_id' | 'created_at'> => ({
  imie_nazwisko: '',
  telefon: '',
  email: '',
  firma: '',
  rola: '',
  notatki: '',
});

const isValidEmail = (email: string) => {
  const value = email.trim();
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const normalizePhone = (phone: string) => phone.replace(/[^\d+]/g, '');

const isValidPhone = (phone: string) => {
  const value = phone.trim();
  if (!value) return true;

  const cleaned = normalizePhone(value);

  if (!/^\+?\d{7,15}$/.test(cleaned)) return false;

  const plusCount = (cleaned.match(/\+/g) || []).length;
  if (plusCount > 1) return false;
  if (plusCount === 1 && !cleaned.startsWith('+')) return false;

  return true;
};

export default function KontaktyScreen() {
  const { session } = useSupabaseAuth();
  const topPad = 0;

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [form, setForm] = useState(emptyContact());
  const [saving, setSaving] = useState(false);

  const headerAnim = useRef(new Animated.Value(0)).current;
  const listAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(90, [
      Animated.spring(headerAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 70,
        friction: 10,
      }),
      Animated.spring(listAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 70,
        friction: 10,
      }),
    ]).start();
  }, [headerAnim, listAnim]);

  const loadContacts = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setContacts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('kontakty')
        .select('*')
        .eq('user_id', userId)
        .order('imie_nazwisko', { ascending: true });

      if (error) throw error;
      setContacts((data ?? []) as Contact[]);
    } catch (e: any) {
      setContacts([]);
      Alert.alert('Błąd', e?.message ?? 'Nie udało się pobrać kontaktów.');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadContacts();
    }, [loadContacts])
  );

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

  const openDetails = (c: Contact) => {
    setSelectedContact(c);
    setDetailsOpen(true);
  };

  const saveContact = async () => {
    if (!form.imie_nazwisko.trim()) {
      Alert.alert('Błąd', 'Podaj imię i nazwisko.');
      return;
    }

    if (!isValidEmail(form.email ?? '')) {
      Alert.alert('Błąd', 'Podaj poprawny adres e-mail.');
      return;
    }

    if (!isValidPhone(form.telefon ?? '')) {
      Alert.alert('Błąd', 'Podaj poprawny numer telefonu.');
      return;
    }

    const userId = session?.user?.id;
    if (!userId) {
      Alert.alert('Błąd', 'Brak aktywnej sesji użytkownika.');
      return;
    }

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
        const { error } = await supabase
          .from('kontakty')
          .update(payload)
          .eq('id', editingContact.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('kontakty').insert(payload);
        if (error) throw error;
      }

      setEditOpen(false);
      setEditingContact(null);
      setForm(emptyContact());
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
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('kontakty').delete().eq('id', c.id);
            if (error) throw error;

            if (selectedContact?.id === c.id) {
              setDetailsOpen(false);
              setSelectedContact(null);
            }

            await loadContacts();
          } catch (e: any) {
            Alert.alert('Błąd', e?.message ?? 'Nie udało się usunąć kontaktu.');
          }
        },
      },
    ]);
  };

  const headerScale = headerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  });

  const listScale = listAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.97, 1],
  });

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.screen}>
        <View pointerEvents="none" style={styles.bg} />
        <View pointerEvents="none" style={styles.glowTop} />

        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: topPad }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={{
              opacity: headerAnim,
              transform: [{ scale: headerScale }],
            }}
          >
            <View style={styles.headerRow}>
              <AppHeader title="Kontakty" />
            </View>
          </Animated.View>

          <Animated.View
            style={{
              opacity: listAnim,
              transform: [{ scale: listScale }],
            }}
          >
            {loading ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>Ładowanie...</Text>
              </View>
            ) : contacts.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Feather name="users" size={44} color="rgba(255,255,255,0.15)" />
                <Text style={styles.emptyText}>Brak kontaktów</Text>
                <TouchableOpacity
                  onPress={openNew}
                  style={styles.emptyAddBtn}
                  activeOpacity={0.88}
                >
                  <Text style={styles.emptyAddBtnText}>+ Dodaj pierwszy kontakt</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={contacts}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                contentContainerStyle={styles.listContent}
                ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                renderItem={({ item }) => (
                  <ContactCard
                    contact={item}
                    onPress={() => openDetails(item)}
                    onEdit={() => openEdit(item)}
                    onDelete={() => deleteContact(item)}
                  />
                )}
              />
            )}
          </Animated.View>
        </ScrollView>

        <FloatingAddButton onPress={openNew} />

        <Modal
          visible={editOpen}
          animationType="fade"
          transparent
          onRequestClose={() => setEditOpen(false)}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.modalCard}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalHeaderSide} />
                    <Text style={styles.modalTitle}>
                      {editingContact ? 'Edytuj kontakt' : 'Nowy kontakt'}
                    </Text>
                    <TouchableOpacity onPress={() => setEditOpen(false)} activeOpacity={0.88}>
                      <Feather name="x" size={22} color="rgba(255,255,255,0.55)" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    contentContainerStyle={{ padding: 16, gap: 12 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    <FormField
                      label="Imię i nazwisko *"
                      value={form.imie_nazwisko}
                      onChangeText={(v) => setForm({ ...form, imie_nazwisko: v })}
                      placeholder="np. Jan Kowalski"
                    />

                    <FormField
                      label="Firma"
                      value={form.firma ?? ''}
                      onChangeText={(v) => setForm({ ...form, firma: v })}
                      placeholder="np. doszkieletowego"
                    />

                    <FormField
                      label="Rola"
                      value={form.rola ?? ''}
                      onChangeText={(v) => setForm({ ...form, rola: v })}
                      placeholder="np. Kierownik budowy, Elektryk..."
                    />

                    <FormField
                      label="Telefon"
                      value={form.telefon ?? ''}
                      onChangeText={(v) => setForm({ ...form, telefon: v })}
                      placeholder="+48 600 000 000"
                      keyboardType="phone-pad"
                    />

                    <FormField
                      label="Email"
                      value={form.email ?? ''}
                      onChangeText={(v) => setForm({ ...form, email: v })}
                      placeholder="jan@firma.pl"
                      keyboardType="email-address"
                    />

                    <FormField
                      label="Notatki"
                      value={form.notatki ?? ''}
                      onChangeText={(v) => setForm({ ...form, notatki: v })}
                      placeholder="Dodatkowe informacje..."
                      multiline
                    />

                    <TouchableOpacity
                      style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                      onPress={saveContact}
                      disabled={saving}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.saveBtnText}>
                        {saving ? 'Zapisywanie...' : 'Zapisz kontakt'}
                      </Text>
                    </TouchableOpacity>

                    <View style={{ height: 8 }} />
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        <Modal
          visible={detailsOpen}
          animationType="fade"
          transparent
          onRequestClose={() => {
            setDetailsOpen(false);
            setSelectedContact(null);
          }}
        >
          <TouchableWithoutFeedback
            onPress={() => {
              setDetailsOpen(false);
              setSelectedContact(null);
            }}
          >
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.detailsCard}>
                  {selectedContact && (
                    <>
                      <View style={styles.detailsHeader}>
                        <TouchableOpacity
                          onPress={() => {
                            setDetailsOpen(false);
                            setSelectedContact(null);
                          }}
                          activeOpacity={0.88}
                        >
                          <Feather name="x" size={22} color="rgba(255,255,255,0.55)" />
                        </TouchableOpacity>
                      </View>

                      <ScrollView
                        contentContainerStyle={styles.detailsScroll}
                        showsVerticalScrollIndicator={false}
                      >
                        <View style={styles.detailsAvatar}>
                          <Text style={styles.detailsAvatarText}>
                            {selectedContact.imie_nazwisko
                              .split(' ')
                              .map((w) => w[0])
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()}
                          </Text>
                        </View>

                        <Text style={styles.detailsName}>{selectedContact.imie_nazwisko}</Text>

                        {!!selectedContact.rola && (
                          <Text style={styles.detailsRole}>{selectedContact.rola}</Text>
                        )}

                        {!!selectedContact.firma && (
                          <View style={styles.detailsInfoBox}>
                            <Text style={styles.detailsInfoLabel}>Firma</Text>
                            <Text style={styles.detailsInfoValue}>{selectedContact.firma}</Text>
                          </View>
                        )}

                        {!!selectedContact.telefon && (
                          <View style={styles.detailsInfoBox}>
                            <Text style={styles.detailsInfoLabel}>Telefon</Text>
                            <Text style={styles.detailsInfoValue}>{selectedContact.telefon}</Text>
                          </View>
                        )}

                        {!!selectedContact.email && (
                          <View style={styles.detailsInfoBox}>
                            <Text style={styles.detailsInfoLabel}>Email</Text>
                            <Text style={styles.detailsInfoValue}>{selectedContact.email}</Text>
                          </View>
                        )}

                        {!!selectedContact.notatki && (
                          <View style={styles.detailsInfoBox}>
                            <Text style={styles.detailsInfoLabel}>Opis / notatki</Text>
                            <Text style={styles.detailsInfoValueMultiline}>{selectedContact.notatki}</Text>
                          </View>
                        )}

                        <View style={styles.detailsActions}>
                          {!!selectedContact.telefon && (
                            <>
                              <TouchableOpacity
                                onPress={() => Linking.openURL(`tel:${selectedContact.telefon}`)}
                                style={styles.detailsActionBtn}
                                activeOpacity={0.88}
                              >
                                <Feather name="phone" size={22} color={NEON} />
                                <Text style={styles.detailsActionText}>Zadzwoń</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                onPress={() => Linking.openURL(`sms:${selectedContact.telefon}`)}
                                style={styles.detailsActionBtn}
                                activeOpacity={0.88}
                              >
                                <Feather name="message-circle" size={22} color={NEON} />
                                <Text style={styles.detailsActionText}>SMS</Text>
                              </TouchableOpacity>
                            </>
                          )}

                          {!!selectedContact.email && (
                            <TouchableOpacity
                              onPress={() => Linking.openURL(`mailto:${selectedContact.email}`)}
                              style={styles.detailsActionBtn}
                              activeOpacity={0.88}
                            >
                              <Feather name="mail" size={22} color={NEON} />
                              <Text style={styles.detailsActionText}>Email</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </ScrollView>
                    </>
                  )}
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    </TouchableWithoutFeedback>
  );
}

function ContactCard({
  contact: c,
  onPress,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
    <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
      <BlurView intensity={14} tint="dark" style={cardStyles.card}>
        <View style={cardStyles.avatar}>
          <Text style={cardStyles.avatarText}>{initials}</Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={cardStyles.name} numberOfLines={1}>
            {c.imie_nazwisko}
          </Text>

          {!!(c.firma || c.rola) && (
            <Text style={cardStyles.sub} numberOfLines={1}>
              {[c.rola, c.firma].filter(Boolean).join(' · ')}
            </Text>
          )}

          {!!(c.telefon || c.email) && (
            <Text style={cardStyles.meta} numberOfLines={1}>
              {[c.telefon, c.email].filter(Boolean).join(' • ')}
            </Text>
          )}

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

        <View style={cardStyles.cardActions}>
          <TouchableOpacity onPress={onEdit} style={cardStyles.iconBtn} activeOpacity={0.8}>
            <Feather name="edit-2" size={15} color="rgba(255,255,255,0.45)" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={cardStyles.iconBtn} activeOpacity={0.8}>
            <Feather name="trash-2" size={15} color="rgba(239,68,68,0.70)" />
          </TouchableOpacity>
        </View>
      </BlurView>
    </TouchableOpacity>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
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
        style={[fieldStyles.input, multiline && { height: 88, textAlignVertical: 'top' }]}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize="none"
      />
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
    opacity: 0.07,
    top: -200,
    right: -150,
  },

  content: {
    paddingHorizontal: 18,
    paddingBottom: 120,
    backgroundColor: '#000000',
  },

  headerRow: {
    minHeight: 120,
    marginBottom: 18,
  },

  listContent: {
    paddingBottom: 10,
  },

  emptyWrap: {
    minHeight: W * 0.9,
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

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.76)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    maxHeight: '86%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.16)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  modalHeaderSide: {
    width: 22,
    height: 22,
  },
  modalTitle: {
    flex: 1,
    textAlign: 'center',
    color: ACCENT,
    fontSize: 20,
    fontWeight: '900',
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

  detailsCard: {
    maxHeight: '88%',
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.18)',
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 4,
  },
  detailsScroll: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    alignItems: 'center',
  },
  detailsAvatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: 'rgba(37,240,200,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(37,240,200,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  detailsAvatarText: {
    color: NEON,
    fontSize: 28,
    fontWeight: '900',
  },
  detailsName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 4,
  },
  detailsRole: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 18,
  },
  detailsInfoBox: {
    width: '100%',
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },
  detailsInfoLabel: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  detailsInfoValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  detailsInfoValueMultiline: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  detailsActions: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginTop: 16,
  },
  detailsActionBtn: {
    minWidth: 110,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(37,240,200,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  detailsActionText: {
    color: NEON,
    fontSize: 14,
    fontWeight: '800',
  },
});

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  meta: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 9,
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
