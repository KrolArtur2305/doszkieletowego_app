import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from './supabase'
import {
  registerForPushNotificationsAsync,
  savePushToken,
} from '../src/services/notifications/pushService'

// Centralny hub powiadomien BuildIQ.

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

type RegisterPushTokenOptions = {
  requestPermission?: boolean
}

export async function registerPushToken(
  userId: string,
  options: RegisterPushTokenOptions = {}
): Promise<string | null> {
  try {
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

    const token = await registerForPushNotificationsAsync(options)
    if (!token) return null

    await savePushToken(token)
    return token
  } catch (e) {
    console.warn('[notifications] registerPushToken error:', e)
    return null
  }
}

type Task = {
  id: string
  nazwa: string
  opis?: string | null
  data: string
  godzina?: string | null
  caly_dzien?: boolean
  wykonane?: boolean | null
}

export async function scheduleTaskReminders(task: Task): Promise<void> {
  await cancelTaskReminders(task.id)

  const taskDate = new Date(task.data)
  const now = new Date()

  let taskHour = 8
  let taskMinute = 0
  if (task.godzina && !task.caly_dzien) {
    const parts = task.godzina.split(':')
    taskHour = parseInt(parts[0], 10) || 8
    taskMinute = parseInt(parts[1], 10) || 0
  }

  const dayBefore = new Date(taskDate)
  dayBefore.setDate(dayBefore.getDate() - 1)
  dayBefore.setHours(20, 0, 0, 0)

  if (dayBefore > now) {
    await Notifications.scheduleNotificationAsync({
      identifier: `task-${task.id}-before`,
      content: {
        title: 'Jutro masz zadanie',
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

  const onDay = new Date(taskDate)
  onDay.setHours(taskHour, taskMinute, 0, 0)

  if (onDay > now) {
    await Notifications.scheduleNotificationAsync({
      identifier: `task-${task.id}-day`,
      content: {
        title: 'Zadanie na dzis',
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

export async function syncAllTaskReminders(userId: string): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0]

    await cancelAllTaskReminders()

    const { data: tasks, error } = await supabase
      .from('zadania')
      .select('id, nazwa, opis, data, godzina, caly_dzien, wykonane')
      .eq('user_id', userId)
      .gte('data', today)
      .eq('wykonane', false)

    if (error || !tasks) return

    for (const task of tasks) {
      await scheduleTaskReminders(task as Task)
    }
  } catch (e) {
    console.warn('[notifications] syncAllTaskReminders error:', e)
  }
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync()
}
