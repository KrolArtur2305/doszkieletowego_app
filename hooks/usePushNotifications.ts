import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useSupabaseAuth } from './useSupabaseAuth';
import { removePushToken } from '../app/src/services/notifications/pushService';

type NotificationPayload = {
  screen?: string;
  stageCode?: string;
  [key: string]: unknown;
};

function handleNotificationNavigation(data: NotificationPayload) {
  if (data?.type === 'task_reminder') {
    router.push('/(app)/(tabs)/zadania');
    return;
  }

  if (!data?.screen) {
    router.push('/(app)/(tabs)/dashboard');
    return;
  }

  switch (data.screen) {
    case 'stage-detail':
      router.push({
        pathname: '/(app)/(tabs)/postepy',
        params: data.stageCode ? { stageCode: String(data.stageCode) } : undefined,
      });
      break;
    default:
      router.push('/(app)/(tabs)/dashboard');
      break;
  }
}

export function usePushNotifications() {
  const { session } = useSupabaseAuth();
  const userId = session?.user?.id;
  const foregroundSubRef = useRef<Notifications.Subscription | null>(null);
  const responseSubRef = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as NotificationPayload;
      setTimeout(() => handleNotificationNavigation(data), 500);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;

    foregroundSubRef.current = Notifications.addNotificationReceivedListener(() => {});

    responseSubRef.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as NotificationPayload;
        handleNotificationNavigation(data);
      }
    );

    return () => {
      foregroundSubRef.current?.remove();
      responseSubRef.current?.remove();
    };
  }, [userId]);

  async function unregisterDevice() {
    if (!userId) return;
    await removePushToken(userId);
  }

  return { unregisterDevice };
}
