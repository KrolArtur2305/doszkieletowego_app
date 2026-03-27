import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
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
import { supabase } from '../../../lib/supabase';
import { useSupabaseAuth } from '../../../hooks/useSupabaseAuth';

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

const MONTHS_PL = [
  'Styczeń',
  'Luty',
  'Marzec',
  'Kwiecień',
  'Maj',
  'Czerwiec',
  'Lipiec',
  'Sierpień',
  'Wrzesień',
  'Październik',
  'Listopad',
  'Grudzień',
];

const WEEKDAYS_SHORT = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];

function getMonthMatrix(baseDate: Date) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

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
  const topPad = (Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 16) + 8;

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
    () => tasks.filter((task) => task.data >= todayYMD),
    [tasks, todayYMD]
  );

  const overdueTasks = useMemo(
    () => tasks.filter((task) => task.data < todayYMD),
    [tasks, todayYMD]
  );

  const nextThreeTasks = useMemo(() => upcomingTasks.slice(0, 3), [upcomingTasks]);

  const selectedDateTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.data === selectedDate)
        .sort((a, b) => {
          if (!a.godzina && !b.godzina) return 0;
          if (!a.godzina) return 1;
          if (!b.godzina) return -1;
          return a.godzina.localeCompare(b.godzina);
        }),
    [tasks, selectedDate]
  );

  const monthCells = useMemo(() => getMonthMatrix(calendarMonth), [calendarMonth]);

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
    setEditOpen(true);
  };

  const closeModal = () => {
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
        const { error } = await supabase.from('zadania').insert(payload);
        if (error) throw error;
      }

      setSelectedDate(form.data);
      closeModal();
      await loadTasks();
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? 'Nie udało się zapisać zadania.');
    } finally {
      setSaving(false);
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
            const { error } = await supabase.from('zadania').delete().eq('id', task.id);
            if (error) throw error;
            await loadTasks();
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
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.bg} />
      <View pointerEvents="none" style={styles.glowTop} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPad }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: headerAnim,
            transform: [{ scale: headerScale }],
          }}
        >
          <View style={styles.headerRow}>
            <Image
              source={require('../../../assets/logo.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />

            <View style={styles.headerTitleWrap}>
              <Text style={styles.heading}>Zadania</Text>
            </View>

            <View style={styles.headerRightSpacer} />
          </View>

          <View style={styles.statsRow}>
            <BlurView intensity={14} tint="dark" style={styles.statCard}>
              <Text style={styles.statValue}>{upcomingTasks.length}</Text>
              <Text style={styles.statLabel}>Nadchodzące</Text>
            </BlurView>

            <BlurView intensity={14} tint="dark" style={styles.statCard}>
              <Text style={styles.statValue}>{overdueTasks.length}</Text>
              <Text style={styles.statLabel}>Zaległe</Text>
            </BlurView>
          </View>
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
                    new Date(
                      calendarMonth.getFullYear(),
                      calendarMonth.getMonth() - 1,
                      1
                    )
                  )
                }
                style={styles.calendarNavBtn}
                activeOpacity={0.85}
              >
                <Feather name="chevron-left" size={18} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>

              <Text style={styles.calendarTitle}>
                {MONTHS_PL[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
              </Text>

              <TouchableOpacity
                onPress={() =>
                  setCalendarMonth(
                    new Date(
                      calendarMonth.getFullYear(),
                      calendarMonth.getMonth() + 1,
                      1
                    )
                  )
                }
                style={styles.calendarNavBtn}
                activeOpacity={0.85}
              >
                <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            </View>

            <View style={styles.weekdaysRow}>
              {WEEKDAYS_SHORT.map((day) => (
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
                    style={[
                      styles.dayCell,
                      isSelected && styles.dayCellSelected,
                    ]}
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
                      <View
                        style={[
                          styles.dayDot,
                          isSelected && styles.dayDotSelected,
                        ]}
                      />
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
                />
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openNew} activeOpacity={0.9}>
        <Feather name="plus" size={24} color="#07110E" />
      </TouchableOpacity>

      <Modal
        visible={editOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <View style={styles.modalScreen}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {editingTask ? 'Edytuj zadanie' : 'Nowe zadanie'}
            </Text>
            <TouchableOpacity onPress={closeModal} activeOpacity={0.88}>
              <Feather name="x" size={22} color="rgba(255,255,255,0.55)" />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 16, gap: 12 }}
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

            <TouchableOpacity
              style={fieldStyles.pickerButton}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.88}
            >
              <Text style={fieldStyles.label}>Data</Text>
              <Text style={fieldStyles.pickerText}>{prettyDate(form.data)}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={fieldStyles.pickerButton}
              onPress={() => setShowTimePicker(true)}
              activeOpacity={0.88}
            >
              <Text style={fieldStyles.label}>Godzina</Text>
              <Text style={fieldStyles.pickerText}>
                {form.godzina ? form.godzina : 'Bez godziny'}
              </Text>
            </TouchableOpacity>

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

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={(() => {
              const [year, month, day] = form.data.split('-').map(Number);
              return new Date(year, month - 1, day);
            })()}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(event, selected) => {
              if (Platform.OS !== 'ios') setShowDatePicker(false);
              if (selected) setForm({ ...form, data: toYMD(selected) });
            }}
          />
        )}

        {showTimePicker && (
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
            is24Hour
            onChange={(event, selected) => {
              if (Platform.OS !== 'ios') setShowTimePicker(false);
              if (selected) setForm({ ...form, godzina: toHHMM(selected) });
            }}
          />
        )}
      </Modal>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function TaskCard({
  task,
  onEdit,
  onDelete,
}: {
  task: Task;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <BlurView intensity={14} tint="dark" style={cardStyles.card}>
      <View style={cardStyles.badge}>
        <Feather name="calendar" size={15} color={NEON} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={cardStyles.name} numberOfLines={1}>
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
          <Feather name="edit-2" size={15} color="rgba(255,255,255,0.45)" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={cardStyles.iconBtn} activeOpacity={0.8}>
          <Feather name="trash-2" size={15} color="rgba(239,68,68,0.70)" />
        </TouchableOpacity>
      </View>
    </BlurView>
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
        style={[fieldStyles.input, multiline && { height: 88, textAlignVertical: 'top' }]}
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
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  headerLogo: {
    width: 46,
    height: 46,
    opacity: 0.98,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -46,
  },
  heading: {
    color: ACCENT,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  headerRightSpacer: {
    width: 46,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
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

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 999,
    backgroundColor: NEON,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: NEON,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },

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
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
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
  pickerButton: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  pickerText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});