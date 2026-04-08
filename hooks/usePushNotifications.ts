import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useSupabaseAuth } from './useSupabaseAuth';
import {
  registerForPushNotificationsAsync,
  savePushToken,
  removePushToken,
} from '../app/src/services/notifications/pushService';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type NotificationPayload = {
  screen?: string;
  stageCode?: string;
  [key: string]: unknown;
};

function handleNotificationNavigation(data: NotificationPayload) {
  if (!data?.screen) return;

  switch (data.screen) {
    case 'stage-detail':
      if (data.stageCode) {
        router.push(`/stages/${data.stageCode}`);
      }
      break;
    default:
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

    let active = true;

    async function setup() {
      try {
        const token = await registerForPushNotificationsAsync();
        if (!token || !active) return;
        await savePushToken(token);
      } catch (e: any) {
        console.error('[Push] setup error:', e?.message ?? e);
      }
    }

    setup();

    foregroundSubRef.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[Push] Foreground:', notification);
      }
    );

    responseSubRef.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as NotificationPayload;
        handleNotificationNavigation(data);
      }
    );

    return () => {
      active = false;
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
