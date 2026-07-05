import { useCallback, useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSupabaseAuth } from './useSupabaseAuth';
import { removePushToken } from '../src/services/notifications/pushService';

const HANDLED_PUSH_EVENTS_KEY = 'buildiq:handled-push-events';

const LIFECYCLE_PUSH_TYPES = new Set([
  'push_onboarding_24h',
  'push_onboarding_72h',
  'push_onboarding_7d',
  'push_inactivity_14d',
]);

type NotificationPayload = {
  screen?: string;
  stageCode?: string;
  eventId?: string;
  type?: string;
  targetScreen?: string;
  modalTitle?: string;
  modalMessage?: string;
  ctaLabel?: string;
  dismissLabel?: string;
  aiName?: string;
  userName?: string;
  [key: string]: unknown;
};

export type PushLifecycleModalState = {
  visible: boolean;
  title: string;
  message: string;
  ctaLabel: string;
  dismissLabel: string;
  targetScreen: string;
  aiName: string;
  userName: string;
};

function isLifecyclePush(data: NotificationPayload) {
  return LIFECYCLE_PUSH_TYPES.has(String(data?.type ?? ''));
}

function isAdminPush(data: NotificationPayload) {
  return String(data?.type ?? '') === 'admin_push';
}

function shouldShowPayloadModal(data: NotificationPayload) {
  return isLifecyclePush(data) || (isAdminPush(data) && (!!data.modalTitle || !!data.modalMessage));
}

function getTargetRoute(targetScreen?: string, withAddParam = false) {
  switch (targetScreen) {
    case 'photos':
      return withAddParam ? '/(app)/(tabs)/zdjecia?openAdd=1' : '/(app)/(tabs)/zdjecia';
    case 'budget':
      return withAddParam ? '/(app)/(tabs)/budzet?openAdd=1' : '/(app)/(tabs)/budzet';
    case 'documents':
      return withAddParam ? '/(app)/(tabs)/dokumenty?openAdd=1' : '/(app)/(tabs)/dokumenty';
    case 'tasks':
      return '/(app)/(tabs)/zadania';
    case 'journal':
      return withAddParam ? '/(app)/(tabs)/wiecej/dziennik?openAdd=1' : '/(app)/(tabs)/wiecej/dziennik';
    case 'progress':
      return '/(app)/(tabs)/postepy';
    case 'project':
      return '/(app)/(tabs)/projekt';
    case 'settings':
      return '/(app)/(tabs)/ustawienia';
    case 'dashboard':
    default:
      return '/(app)/(tabs)/dashboard';
  }
}

async function wasPushEventHandled(eventId: string) {
  try {
    const raw = await AsyncStorage.getItem(HANDLED_PUSH_EVENTS_KEY);
    const handled = raw ? (JSON.parse(raw) as string[]) : [];
    return handled.includes(eventId);
  } catch {
    return false;
  }
}

async function markPushEventHandled(eventId: string) {
  try {
    const raw = await AsyncStorage.getItem(HANDLED_PUSH_EVENTS_KEY);
    const handled = raw ? (JSON.parse(raw) as string[]) : [];
    const next = [eventId, ...handled.filter((id) => id !== eventId)].slice(0, 40);
    await AsyncStorage.setItem(HANDLED_PUSH_EVENTS_KEY, JSON.stringify(next));
  } catch {
    // Do not block notification handling on storage issues.
  }
}

function handleNotificationNavigation(data: NotificationPayload) {
  if (data?.type === 'task_reminder') {
    router.push('/(app)/(tabs)/zadania');
    return;
  }

  if (isLifecyclePush(data) || isAdminPush(data)) {
    router.push(getTargetRoute(String(data.targetScreen ?? 'dashboard')) as any);
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

function getResponseHandleId(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as NotificationPayload;
  const eventId = String(data.eventId ?? '').trim();
  if (eventId) return eventId;
  return String(response.notification.request.identifier ?? '').trim();
}

export function usePushNotifications() {
  const { session } = useSupabaseAuth();
  const userId = session?.user?.id;
  const foregroundSubRef = useRef<Notifications.Subscription | null>(null);
  const responseSubRef = useRef<Notifications.Subscription | null>(null);
  const [lifecycleModal, setLifecycleModal] = useState<PushLifecycleModalState | null>(null);

  const showPushModalFromPayload = useCallback((data: NotificationPayload) => {
    if (!shouldShowPayloadModal(data)) return;

    const targetScreen = String(data.targetScreen ?? 'dashboard');
    router.push(getTargetRoute(targetScreen) as any);

    setTimeout(() => {
      setLifecycleModal({
        visible: true,
        title: String(data.modalTitle ?? data.aiName ?? 'BuildIQ'),
        message: String(data.modalMessage ?? ''),
        ctaLabel: String(data.ctaLabel ?? 'OK'),
        dismissLabel: String(data.dismissLabel ?? 'OK'),
        targetScreen,
        aiName: String(data.aiName ?? ''),
        userName: String(data.userName ?? ''),
      });
    }, 450);
  }, []);

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(async (response) => {
      if (!response) return;
      const responseId = getResponseHandleId(response);
      if (responseId) {
        if (await wasPushEventHandled(responseId)) return;
        await markPushEventHandled(responseId);
      }
      const data = response.notification.request.content.data as NotificationPayload;
      if (shouldShowPayloadModal(data)) {
        setTimeout(() => showPushModalFromPayload(data), 500);
        return;
      }
      setTimeout(() => handleNotificationNavigation(data), 500);
    });
  }, [showPushModalFromPayload]);

  useEffect(() => {
    if (!userId) return;

    foregroundSubRef.current = Notifications.addNotificationReceivedListener(() => {});

    responseSubRef.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        void (async () => {
          const responseId = getResponseHandleId(response);
          if (responseId) {
            if (await wasPushEventHandled(responseId)) return;
            await markPushEventHandled(responseId);
          }

          const data = response.notification.request.content.data as NotificationPayload;
          if (shouldShowPayloadModal(data)) {
            showPushModalFromPayload(data);
            return;
          }
          handleNotificationNavigation(data);
        })();
      }
    );

    return () => {
      foregroundSubRef.current?.remove();
      responseSubRef.current?.remove();
    };
  }, [showPushModalFromPayload, userId]);

  async function unregisterDevice() {
    if (!userId) return;
    await removePushToken(userId);
  }

  const dismissLifecycleModal = useCallback(() => {
    setLifecycleModal(null);
  }, []);

  const confirmLifecycleModal = useCallback(() => {
    const targetScreen = lifecycleModal?.targetScreen ?? 'dashboard';
    setLifecycleModal(null);
    router.push(getTargetRoute(targetScreen, true) as any);
  }, [lifecycleModal?.targetScreen]);

  return {
    unregisterDevice,
    lifecycleModal,
    dismissLifecycleModal,
    confirmLifecycleModal,
  };
}
