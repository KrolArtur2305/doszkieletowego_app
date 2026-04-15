import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  Keyboard,
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
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabase';
import { syncAllTaskReminders } from '../../../lib/notifications';
import { useSupabaseAuth } from '../../../hooks/useSupabaseAuth';
import { FloatingAddButton } from '../../../components/FloatingAddButton';
import { AppHeader } from '../../../src/ui/components';

const ACCENT = '#19705C';
const NEON = '#25F0C8';

type Task = {
  id: string;
  user_id: string;
  data: string;
  godzina: string | null;
  nazwa: string;
  opis: string | null;
  utworzone_at?: string;
  wykonane?: boolean | null;
  zakonczone_at?: string | null;
  caly_dzien?: boolean | null;
};

type TaskForm = {
  nazwa: string;
  opis: string;
  data: string;
  godzina: string;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const toYMD = (date: Date) => {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
};

const prettyDate = (ymd: string) => {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
};

const prettyDateLong = (ymd: string, locale: string) => {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const prettyTime = (hhmmss?: string | null) => {
  if (!hhmmss) return 'Bez godziny';
  return hhmmss.slice(0, 5);
};

const toHHMM = (date: Date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

const emptyForm = (): TaskForm => ({
  nazwa: '',
  opis: '',
  data: toYMD(new Date()),
  godzina: '',
});

const localeFromLng = (lng?: string) => {
  const base = (lng || 'en').split('-')[0];
  if (base === 'pl') return 'pl-PL';
  if (base === 'de') return 'de-DE';
  return 'en-US';
};

function getMonthMatrix(baseDate: Date) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const jsDay = firstDay.getDay();
  const mondayFirst = jsDay === 0 ? 6 : jsDay - 1;

  const startDate = new Date(year, month, 1 - mondayFirst);
  const totalCells = 42;

  return Array.from({ length: totalCells }, (_, i) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);

    const ymd = toYMD(date);

    return {
      date,
      ymd,
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === month,
    };
  });
}

export default function ZadaniaScreen() {
  const { session } = useSupabaseAuth();
  const { i18n } = useTranslation();
  const topPad = 0;
  const dateLocale = useMemo(
    () => localeFromLng(i18n.resolvedLanguage || i18n.language),
    [i18n.language, i18n.resolvedLanguage]
  );

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(toYMD(new Date()));

  const [showUpcomingList, setShowUpcomingList] = useState(false);
  const [showOverdueList, setShowOverdueList] = useState(false);

  const headerAnim = useRef(new Animated.Value(0)).current;
  const bodyAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(90, [
      Animated.spring(headerAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 70,
        friction: 10,
      }),
      Animated.spring(bodyAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 70,
        friction: 10,
      }),
    ]).start();
  }, [headerAnim, bodyAnim]);

  const loadTasks = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('zadania')
        .select('*')
        .eq('user_id', userId)
        .order('data', { ascending: true })
        .order('godzina', { ascending: true, nullsFirst: false });

      if (error) throw error;
      setTasks((data ?? []) as Task[]);
    } catch (e: any) {
      setTasks([]);
      Alert.alert('Błąd', e?.message ?? 'Nie udało się pobrać zadań.');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadTasks();
    }, [loadTasks])
  );

  const todayYMD = toYMD(new Date());

  const upcomingTasks = useMemo(
    () => tasks.filter((task) => task.data >= todayYMD && !task.wykonane),
    [tasks, todayYMD]
  );

  const overdueTasks = useMemo(
    () => tasks.filter((task) => task.data < todayYMD && !task.wykonane),
    [tasks, todayYMD]
  );

  const nextThreeTasks = useMemo(() => upcomingTasks.slice(0, 3), [upcomingTasks]);

  const selectedDateTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.data === selectedDate)
        .sort((a, b) => {
          if (!!a.wykonane !== !!b.wykonane) return a.wykonane ? 1 : -1;
          if (!a.godzina && !b.godzina) return 0;
          if (!a.godzina) return 1;
          if (!b.godzina) return -1;
          return a.godzina.localeCompare(b.godzina);
        }),
    [tasks, selectedDate]
  );

  const monthCells = useMemo(() => getMonthMatrix(calendarMonth), [calendarMonth]);
  const monthLabel = useMemo(
    () =>
      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).toLocaleDateString(dateLocale, {
        month: 'long',
        year: 'numeric',
      }),
    [calendarMonth, dateLocale]
  );
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(2024, 0, 1 + i).toLocaleDateString(dateLocale, { weekday: 'short' })
      ),
    [dateLocale]
  );

  const tasksCountByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const task of tasks) {
      map[task.data] = (map[task.data] || 0) + 1;
    }
    return map;
  }, [tasks]);

  const openNew = () => {
    setEditingTask(null);
    setForm({
      nazwa: '',
      opis: '',
      data: selectedDate || toYMD(new Date()),
      godzina: '',
    });
    setShowDatePicker(false);
    setShowTimePicker(false);
    setEditOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setForm({
      nazwa: task.nazwa ?? '',
      opis: task.opis ?? '',
      data: task.data ?? toYMD(new Date()),
      godzina: task.godzina ? task.godzina.slice(0, 5) : '',
    });
    setShowDatePicker(false);
    setShowTimePicker(false);
    setEditOpen(true);
  };

  const closeModal = () => {
    Keyboard.dismiss();
    setEditOpen(false);
    setEditingTask(null);
    setForm(emptyForm());
    setShowDatePicker(false);
    setShowTimePicker(false);
  };

  const saveTask = async () => {
    if (!form.nazwa.trim()) {
      Alert.alert('Błąd', 'Podaj nazwę zadania.');
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
        nazwa: form.nazwa.trim(),
        opis: form.opis.trim() || null,
        data: form.data,
        godzina: form.godzina ? `${form.godzina}:00` : null,
      };

      if (editingTask) {
        const { error } = await supabase
          .from('zadania')
          .update(payload)
          .eq('id', editingTask.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('zadania').insert({
          ...payload,
          wykonane: false,
          zakonczone_at: null,
        });
        if (error) throw error;
      }

      setSelectedDate(form.data);
      closeModal();
      await Promise.all([loadTasks(), syncAllTaskReminders(userId)]);
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? 'Nie udało się zapisać zadania.');
    } finally {
      setSaving(false);
    }
  };

  const toggleDone = async (task: Task) => {
    try {
      const nextDone = !task.wykonane;
      const { error } = await supabase
        .from('zadania')
        .update({
          wykonane: nextDone,
          zakonczone_at: nextDone ? new Date().toISOString() : null,
        })
        .eq('id', task.id);

      if (error) throw error;
      if (session?.user?.id) {
        await Promise.all([loadTasks(), syncAllTaskReminders(session.user.id)]);
      } else {
        await loadTasks();
      }
    } catch (e: any) {
      Alert.alert(
        'Błąd',
        e?.message ??
          'Nie udało się zmienić statusu zadania. Sprawdź, czy tabela ma kolumnę "wykonane".'
      );
    }
  };

  const deleteTask = (task: Task) => {
    Alert.alert('Usuń zadanie', `Usunąć "${task.nazwa}"?`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          try {
            const userId = session?.user?.id;
            const { error } = await supabase.from('zadania').delete().eq('id', task.id);
            if (error) throw error;
            if (userId) {
              await Promise.all([loadTasks(), syncAllTaskReminders(userId)]);
            } else {
              await loadTasks();
            }
          } catch (e: any) {
            Alert.alert('Błąd', e?.message ?? 'Nie udało się usunąć zadania.');
          }
        },
      },
    ]);
  };

  const headerScale = headerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  const bodyScale = bodyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.985, 1],
  });

  return (
    <Pressable style={styles.screen} onPress={Keyboard.dismiss}>
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
            <AppHeader title="Zadania" />
          </View>

          <View style={styles.statsRow}>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setShowUpcomingList((prev) => !prev)}
              style={styles.statTouchable}
            >
              <BlurView intensity={14} tint="dark" style={styles.statCard}>
                <View style={styles.statTopRow}>
                  <Text style={styles.statValue}>{upcomingTasks.length}</Text>
                  <Feather
                    name={showUpcomingList ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color="rgba(255,255,255,0.55)"
                  />
                </View>
                <Text style={styles.statLabel}>Nadchodzące</Text>
              </BlurView>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setShowOverdueList((prev) => !prev)}
              style={styles.statTouchable}
            >
              <BlurView intensity={14} tint="dark" style={styles.statCard}>
                <View style={styles.statTopRow}>
                  <Text style={styles.statValue}>{overdueTasks.length}</Text>
                  <Feather
                    name={showOverdueList ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color="rgba(255,255,255,0.55)"
                  />
                </View>
                <Text style={styles.statLabel}>Zaległe</Text>
              </BlurView>
            </TouchableOpacity>
          </View>

          {showUpcomingList && (
            <View style={styles.expandListWrap}>
              {upcomingTasks.length === 0 ? (
                <View style={styles.emptyMiniCard}>
                  <Text style={styles.emptyMiniText}>Brak nadchodzących zadań</Text>
                </View>
              ) : (
                upcomingTasks.map((task) => (
                  <TaskListItem
                    key={`upcoming-${task.id}`}
                    task={task}
                    onToggleDone={() => toggleDone(task)}
                    onEdit={() => openEdit(task)}
                  />
                ))
              )}
            </View>
          )}

          {showOverdueList && (
            <View style={styles.expandListWrap}>
              {overdueTasks.length === 0 ? (
                <View style={styles.emptyMiniCard}>
                  <Text style={styles.emptyMiniText}>Brak zaległych zadań</Text>
                </View>
              ) : (
                overdueTasks.map((task) => (
                  <TaskListItem
                    key={`overdue-${task.id}`}
                    task={task}
                    onToggleDone={() => toggleDone(task)}
                    onEdit={() => openEdit(task)}
                  />
                ))
              )}
            </View>
          )}
        </Animated.View>

        <Animated.View
          style={{
            opacity: bodyAnim,
            transform: [{ scale: bodyScale }],
          }}
        >
          <SectionTitle title="3 najbliższe zadania" />

          {loading ? (
            <View style={styles.loadingWrap}>
              <Text style={styles.loadingText}>Ładowanie...</Text>
            </View>
          ) : nextThreeTasks.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Brak nadchodzących zadań</Text>
            </View>
          ) : (
            <View style={styles.stack}>
              {nextThreeTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onEdit={() => openEdit(task)}
                  onDelete={() => deleteTask(task)}
                  onToggleDone={() => toggleDone(task)}
                />
              ))}
            </View>
          )}

          <SectionTitle title="Kalendarz" />

          <BlurView intensity={14} tint="dark" style={styles.calendarCard}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                onPress={() =>
                  setCalendarMonth(
                    new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                  )
                }
                style={styles.calendarNavBtn}
                activeOpacity={0.85}
              >
                <Feather name="chevron-left" size={18} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>

              <Text style={styles.calendarTitle}>
                {monthLabel}
              </Text>

              <TouchableOpacity
                onPress={() =>
                  setCalendarMonth(
                    new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                  )
                }
                style={styles.calendarNavBtn}
                activeOpacity={0.85}
              >
                <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            </View>

            <View style={styles.weekdaysRow}>
              {weekdayLabels.map((day) => (
                <Text key={day} style={styles.weekdayText}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {monthCells.map((cell) => {
                const isSelected = cell.ymd === selectedDate;
                const isToday = cell.ymd === todayYMD;
                const hasTasks = !!tasksCountByDate[cell.ymd];

                return (
                  <Pressable
                    key={cell.ymd}
                    onPress={() => setSelectedDate(cell.ymd)}
                    style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        !cell.inCurrentMonth && styles.dayTextOutside,
                        isToday && styles.dayTextToday,
                        isSelected && styles.dayTextSelected,
                      ]}
                    >
                      {cell.day}
                    </Text>

                    {hasTasks && (
                      <View style={[styles.dayDot, isSelected && styles.dayDotSelected]} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </BlurView>

          <SectionTitle title={`Zadania na ${prettyDate(selectedDate)}`} />

          {selectedDateTasks.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Brak zadań na ten dzień</Text>
            </View>
          ) : (
            <View style={styles.stack}>
              {selectedDateTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onEdit={() => openEdit(task)}
                  onDelete={() => deleteTask(task)}
                  onToggleDone={() => toggleDone(task)}
                />
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      <FloatingAddButton onPress={openNew} />

      <Modal
        visible={editOpen}
        animationType="fade"
        transparent
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalOverlay} onPress={Keyboard.dismiss}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderSide} />
              <Text style={styles.modalTitle}>
                {editingTask ? 'Edytuj zadanie' : 'Nowe zadanie'}
              </Text>
              <TouchableOpacity onPress={closeModal} activeOpacity={0.88} style={styles.modalCloseBtn}>
                <Feather name="x" size={22} color="rgba(255,255,255,0.55)" />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <FormField
                label="Nazwa zadania *"
                value={form.nazwa}
                onChangeText={(v) => setForm({ ...form, nazwa: v })}
                placeholder="np. Zadzwonić do elektryka"
              />

              <FormField
                label="Opis"
                value={form.opis}
                onChangeText={(v) => setForm({ ...form, opis: v })}
                placeholder="Dodatkowe informacje..."
                multiline
              />

              <View style={styles.dateTimeRow}>
                <TouchableOpacity
                  style={fieldStyles.pickerButtonDark}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowTimePicker(false);
                    setShowDatePicker((prev) => !prev);
                  }}
                  activeOpacity={0.88}
                >
                  <Text style={fieldStyles.label}>Data</Text>
                  <View style={styles.pickerValueRow}>
                    <Feather name="calendar" size={15} color={NEON} />
                    <Text style={fieldStyles.pickerText}>{prettyDateLong(form.data, dateLocale)}</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={fieldStyles.pickerButtonDark}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowDatePicker(false);
                    setShowTimePicker((prev) => !prev);
                  }}
                  activeOpacity={0.88}
                >
                  <Text style={fieldStyles.label}>Godzina</Text>
                  <View style={styles.pickerValueRow}>
                    <Feather name="clock" size={15} color={NEON} />
                    <Text style={fieldStyles.pickerText}>
                      {form.godzina ? form.godzina : 'Bez godziny'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <View style={styles.inlinePickerWrap}>
                  <Text style={styles.inlinePickerTitle}>Wybierz datę</Text>
                  <DateTimePicker
                    value={(() => {
                      const [year, month, day] = form.data.split('-').map(Number);
                      return new Date(year, month - 1, day);
                    })()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    locale={dateLocale}
                    themeVariant="dark"
                    onChange={(event, selected) => {
                      if (Platform.OS !== 'ios') setShowDatePicker(false);
                      if (selected) setForm({ ...form, data: toYMD(selected) });
                    }}
                  />
                  {Platform.OS === 'ios' && (
                    <TouchableOpacity
                      style={styles.inlinePickerDoneBtn}
                      onPress={() => setShowDatePicker(false)}
                      activeOpacity={0.88}
                    >
                      <Text style={styles.inlinePickerDoneText}>Gotowe</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {showTimePicker && (
                <View style={styles.inlinePickerWrap}>
                  <Text style={styles.inlinePickerTitle}>Wybierz godzinę</Text>
                  <DateTimePicker
                    value={
                      form.godzina
                        ? (() => {
                            const [h, m] = form.godzina.split(':').map(Number);
                            const d = new Date();
                            d.setHours(h);
                            d.setMinutes(m);
                            d.setSeconds(0);
                            return d;
                          })()
                        : new Date()
                    }
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    themeVariant="dark"
                    is24Hour
                    onChange={(event, selected) => {
                      if (Platform.OS !== 'ios') setShowTimePicker(false);
                      if (selected) setForm({ ...form, godzina: toHHMM(selected) });
                    }}
                  />
                  {Platform.OS === 'ios' && (
                    <TouchableOpacity
                      style={styles.inlinePickerDoneBtn}
                      onPress={() => setShowTimePicker(false)}
                      activeOpacity={0.88}
                    >
                      <Text style={styles.inlinePickerDoneText}>Gotowe</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {!!form.godzina && (
                <TouchableOpacity
                  onPress={() => setForm({ ...form, godzina: '' })}
                  style={styles.clearTimeBtn}
                  activeOpacity={0.88}
                >
                  <Text style={styles.clearTimeBtnText}>Usuń godzinę</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={saveTask}
                disabled={saving}
                activeOpacity={0.9}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? 'Zapisywanie...' : 'Zapisz zadanie'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Pressable>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function TaskCard({
  task,
  onEdit,
  onDelete,
  onToggleDone,
}: {
  task: Task;
  onEdit: () => void;
  onDelete: () => void;
  onToggleDone: () => void;
}) {
  return (
    <BlurView intensity={14} tint="dark" style={[cardStyles.card, !!task.wykonane && cardStyles.cardDone]}>
      <TouchableOpacity onPress={onToggleDone} style={cardStyles.checkBtn} activeOpacity={0.85}>
        <Feather
          name={task.wykonane ? 'check-circle' : 'circle'}
          size={20}
          color={task.wykonane ? NEON : 'rgba(255,255,255,0.35)'}
        />
      </TouchableOpacity>

      <View style={cardStyles.badge}>
        <Feather name="calendar" size={15} color={NEON} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[cardStyles.name, !!task.wykonane && cardStyles.textDone]} numberOfLines={1}>
          {task.nazwa}
        </Text>

        <Text style={cardStyles.meta} numberOfLines={1}>
          {prettyDate(task.data)} · {prettyTime(task.godzina)}
        </Text>

        {!!task.opis && (
          <Text style={cardStyles.desc} numberOfLines={2}>
            {task.opis}
          </Text>
        )}
      </View>

      <View style={cardStyles.cardActions}>
        <TouchableOpacity onPress={onEdit} style={cardStyles.iconBtn} activeOpacity={0.8}>
          <Feather name="edit-2" size={15} color="rgba(255,255,255,0.55)" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={cardStyles.iconBtn} activeOpacity={0.8}>
          <Feather name="trash-2" size={15} color="rgba(239,68,68,0.70)" />
        </TouchableOpacity>
      </View>
    </BlurView>
  );
}

function TaskListItem({
  task,
  onToggleDone,
  onEdit,
}: {
  task: Task;
  onToggleDone: () => void;
  onEdit: () => void;
}) {
  return (
    <View style={[listStyles.row, !!task.wykonane && listStyles.rowDone]}>
      <TouchableOpacity onPress={onToggleDone} style={listStyles.checkBtn} activeOpacity={0.85}>
        <Feather
          name={task.wykonane ? 'check-circle' : 'circle'}
          size={20}
          color={task.wykonane ? NEON : 'rgba(255,255,255,0.35)'}
        />
      </TouchableOpacity>

      <TouchableOpacity style={listStyles.content} onPress={onEdit} activeOpacity={0.82}>
        <Text style={[listStyles.name, !!task.wykonane && listStyles.textDone]} numberOfLines={1}>
          {task.nazwa}
        </Text>
        <Text style={listStyles.meta} numberOfLines={1}>
          {prettyDate(task.data)} · {prettyTime(task.godzina)}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={onEdit} style={listStyles.editBtn} activeOpacity={0.82}>
        <Feather name="edit-2" size={15} color="rgba(255,255,255,0.55)" />
      </TouchableOpacity>
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
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
        style={[fieldStyles.inputDark, multiline && { height: 88, textAlignVertical: 'top' }]}
        multiline={multiline}
        autoCapitalize="sentences"
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
  },

  headerRow: {
    minHeight: 120,
    marginBottom: 22,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statTouchable: {
    flex: 1,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    paddingVertical: 16,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 4,
  },

  expandListWrap: {
    gap: 8,
    marginBottom: 14,
  },
  emptyMiniCard: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  emptyMiniText: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 13,
    fontWeight: '700',
  },

  sectionTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 10,
    marginTop: 6,
  },

  stack: {
    gap: 10,
    marginBottom: 18,
  },

  loadingWrap: {
    paddingVertical: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 14,
    fontWeight: '700',
  },

  emptyCard: {
    borderRadius: 18,
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 14,
    fontWeight: '700',
  },

  calendarCard: {
    borderRadius: 24,
    overflow: 'hidden',
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 18,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  calendarNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11.5,
    fontWeight: '800',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dayCell: {
    width: '13.3%',
    aspectRatio: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  dayCellSelected: {
    backgroundColor: 'rgba(37,240,200,0.12)',
    borderColor: 'rgba(37,240,200,0.28)',
  },
  dayText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  dayTextOutside: {
    color: 'rgba(255,255,255,0.20)',
  },
  dayTextToday: {
    color: NEON,
  },
  dayTextSelected: {
    color: '#FFFFFF',
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 99,
    backgroundColor: NEON,
    marginTop: 4,
  },
  dayDotSelected: {
    backgroundColor: '#FFFFFF',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
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
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  modalHeaderSide: {
    width: 28,
  },
  modalCloseBtn: {
    width: 28,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  modalTitle: {
    flex: 1,
    textAlign: 'center',
    color: NEON,
    fontSize: 21,
    fontWeight: '900',
    textShadowColor: 'rgba(37,240,200,0.20)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  modalContent: {
    padding: 16,
    gap: 12,
  },

  dateTimeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pickerValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlinePickerWrap: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  inlinePickerTitle: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
  },
  inlinePickerDoneBtn: {
    alignSelf: 'flex-end',
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(37,240,200,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(37,240,200,0.24)',
  },
  inlinePickerDoneText: {
    color: NEON,
    fontSize: 13,
    fontWeight: '800',
  },

  clearTimeBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  clearTimeBtnText: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 13,
    fontWeight: '700',
  },

  saveBtn: {
    marginTop: 4,
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
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardDone: {
    opacity: 0.78,
  },
  checkBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    backgroundColor: 'rgba(37,240,200,0.12)',
    borderColor: 'rgba(37,240,200,0.25)',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  textDone: {
    textDecorationLine: 'line-through',
    color: 'rgba(255,255,255,0.55)',
  },
  meta: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  desc: {
    color: 'rgba(255,255,255,0.56)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    marginTop: 8,
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

const listStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rowDone: {
    opacity: 0.72,
  },
  checkBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  textDone: {
    textDecorationLine: 'line-through',
    color: 'rgba(255,255,255,0.55)',
  },
  meta: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  editBtn: {
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
  inputDark: {
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
  pickerButtonDark: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  pickerText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
});
