/**
 * hooks/useTaskNotifications.ts
 *
 * Hook który opakowuje logikę powiadomień dla zadań.
 * Użyj go w ekranie zadań przy: tworzeniu, edycji, usuwaniu.
 *
 * Przykład użycia:
 *
 * const { onTaskCreated, onTaskUpdated, onTaskDeleted } = useTaskNotifications()
 *
 * // Po utworzeniu zadania:
 * await onTaskCreated(newTask)
 *
 * // Po edycji zadania:
 * await onTaskUpdated(updatedTask)
 *
 * // Po usunięciu zadania:
 * await onTaskDeleted(taskId)
 */

import * as Notifications from 'expo-notifications'
import {
  scheduleTaskReminders,
  cancelTaskReminders,
} from '../lib/notifications'

type Task = {
  id: string
  nazwa: string
  opis?: string | null
  data: string
  godzina?: string | null
  caly_dzien?: boolean
}

export function useTaskNotifications() {
  /**
   * Wywołaj po pomyślnym INSERT zadania do Supabase
   */
  const onTaskCreated = async (task: Task) => {
    const { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') return
    await scheduleTaskReminders(task)
  }

  /**
   * Wywołaj po pomyślnym UPDATE zadania w Supabase
   * (automatycznie anuluje stare i planuje nowe)
   */
  const onTaskUpdated = async (task: Task) => {
    const { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') return
    await scheduleTaskReminders(task) // scheduleTaskReminders sam wywołuje cancel przed planowaniem
  }

  /**
   * Wywołaj po pomyślnym DELETE zadania z Supabase
   */
  const onTaskDeleted = async (taskId: string) => {
    await cancelTaskReminders(taskId)
  }

  /**
   * Wywołaj gdy zadanie zostanie oznaczone jako zakończone
   */
  const onTaskCompleted = async (taskId: string) => {
    await cancelTaskReminders(taskId)
  }

  return {
    onTaskCreated,
    onTaskUpdated,
    onTaskDeleted,
    onTaskCompleted,
  }
}