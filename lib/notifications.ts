/**
 * lib/notifications.ts
 *
 * Centralny hub powiadomień BuildIQ.
 *
 * Jak dodać nowy typ powiadomień:
 * 1. Dodaj nową funkcję schedule*() na dole pliku
 * 2. Wywołaj ją z odpowiedniego ekranu lub Edge Function
 *
 * Obecne typy:
 * - Zadania: scheduleTaskReminders() / cancelTaskReminders()
 *
 * Planowane:
 * - AI alerty: sendAiAlert() — przez Supabase Edge Function → Expo Push API
 * - Budżet: scheduleBudgetAlert()
 * - Etapy: scheduleStageReminder()
 */

import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from './supabase'
import {
  registerForPushNotificationsAsync,
  savePushToken,
} from '../app/src/services/notifications/pushService'

// ─── Konfiguracja globalnego handlera ────────────────────────────────────────
// Wywołaj raz na starcie apki (w _layout.tsx)

export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })
}

// ─── Rejestracja tokenu push ──────────────────────────────────────────────────
// Wywołaj raz po zalogowaniu użytkownika (w _layout.tsx)
// Token zapisujemy wyłącznie w push_devices.

export async function registerPushToken(userId: string): Promise<string | null> {
  try {
    // Android wymaga kanału
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'BuildIQ',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#25F0C8',
      })

      await Notifications.setNotificationChannelAsync('tasks', {
        name: 'Zadania',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#25F0C8',
      })

      await Notifications.setNotificationChannelAsync('ai', {
        name: 'Asystent AI',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#19705C',
      })
    }

    const token = await registerForPushNotificationsAsync()
    if (!token) return null

    await savePushToken(token)

    return token
  } catch (e) {
    console.warn('[notifications] registerPushToken error:', e)
    return null
  }
}

// ─── ZADANIA ─────────────────────────────────────────────────────────────────

type Task = {
  id: string
  nazwa: string
  opis?: string | null
  data: string        // 'YYYY-MM-DD'
  godzina?: string | null  // 'HH:MM' lub null
  caly_dzien?: boolean
  wykonane?: boolean | null
}

/**
 * Planuje przypomnienia dla jednego zadania:
 * - dzień wcześniej o 20:00 ("Jutro: [nazwa]")
 * - w dniu zadania o godzinie zadania lub 8:00 ("Dziś: [nazwa]")
 */
export async function scheduleTaskReminders(task: Task): Promise<void> {
  // Najpierw anuluj stare (przy edycji)
  await cancelTaskReminders(task.id)

  const taskDate = new Date(task.data)
  const now = new Date()

  // Parsuj godzinę zadania
  let taskHour = 8
  let taskMinute = 0
  if (task.godzina && !task.caly_dzien) {
    const parts = task.godzina.split(':')
    taskHour = parseInt(parts[0], 10) || 8
    taskMinute = parseInt(parts[1], 10) || 0
  }

  // ── Przypomnienie dzień wcześniej o 20:00 ──
  const dayBefore = new Date(taskDate)
  dayBefore.setDate(dayBefore.getDate() - 1)
  dayBefore.setHours(20, 0, 0, 0)

  if (dayBefore > now) {
    await Notifications.scheduleNotificationAsync({
      identifier: `task-${task.id}-before`,
      content: {
        title: '📌 Jutro masz zadanie',
        body: task.nazwa,
        data: { taskId: task.id, type: 'task_reminder' },
        sound: true,
        ...(Platform.OS === 'android' && { channelId: 'tasks' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: dayBefore,
      },
    })
  }

  // ── Przypomnienie w dniu zadania ──
  const onDay = new Date(taskDate)
  onDay.setHours(taskHour, taskMinute, 0, 0)

  if (onDay > now) {
    await Notifications.scheduleNotificationAsync({
      identifier: `task-${task.id}-day`,
      content: {
        title: '🏗️ Zadanie na dziś',
        body: task.nazwa,
        data: { taskId: task.id, type: 'task_reminder' },
        sound: true,
        ...(Platform.OS === 'android' && { channelId: 'tasks' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: onDay,
      },
    })
  }
}

/**
 * Anuluje wszystkie przypomnienia dla danego zadania.
 * Wywołaj przy edycji lub usunięciu zadania.
 */
export async function cancelTaskReminders(taskId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`task-${taskId}-before`).catch(() => {})
  await Notifications.cancelScheduledNotificationAsync(`task-${taskId}-day`).catch(() => {})
}

async function cancelAllTaskReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => [])
  for (const notification of scheduled) {
    const identifier = notification.identifier ?? ''
    if (identifier.startsWith('task-')) {
      await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {})
    }
  }
}

/**
 * Synchronizuje powiadomienia dla WSZYSTKICH zadań użytkownika.
 * Wywołaj po zalogowaniu lub gdy użytkownik włączy powiadomienia.
 * Anuluje stare, planuje nowe dla zadań w przyszłości.
 */
export async function syncAllTaskReminders(userId: string): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0]

    await cancelAllTaskReminders()

    const { data: tasks, error } = await supabase
      .from('zadania')
      .select('id, nazwa, opis, data, godzina, caly_dzien, wykonane')
      .eq('user_id', userId)
      .gte('data', today)          // tylko przyszłe i dzisiejsze
      .eq('wykonane', false)       // tylko niewykonane

    if (error || !tasks) return

    for (const task of tasks) {
      await scheduleTaskReminders(task as Task)
    }
  } catch (e) {
    console.warn('[notifications] syncAllTaskReminders error:', e)
  }
}

/**
 * Anuluje WSZYSTKIE zaplanowane powiadomienia.
 * Wywołaj przy wylogowaniu.
 */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync()
}

// ─── PRZYSZŁE TYPY (TODO) ────────────────────────────────────────────────────

/**
 * TODO: AI Alerty — zdalne powiadomienia przez Supabase Edge Function
 *
 * Schemat:
 * 1. Supabase Cron (codziennie 9:00) → Edge Function
 * 2. Edge Function pobiera dane usera → wysyła do Claude API
 * 3. Claude zwraca alert lub null
 * 4. Edge Function → Expo Push API (używa tokenów z push_devices)
 *
 * export async function sendAiAlert(userId: string, message: string) { ... }
 */

/**
 * TODO: Alerty budżetowe
 *
 * Gdy wydatki przekroczą X% budżetu → lokalne powiadomienie
 *
 * export async function checkBudgetAndAlert(userId: string) { ... }
 */

/**
 * TODO: Przypomnienia o etapach
 *
 * Gdy etap jest w toku dłużej niż typowo → alert
 *
 * export async function scheduleStageReminder(stageId: string, expectedDays: number) { ... }
 */
