import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../../../lib/supabase';

type RegisterForPushNotificationsOptions = {
  requestPermission?: boolean;
};

function getExpoProjectId(): string | null {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

export async function registerForPushNotificationsAsync(
  options: RegisterForPushNotificationsOptions = {}
): Promise<string | null> {
  const { requestPermission = true } = options;

  if (!Device.isDevice) {
    console.warn('[Push] Dziala tylko na fizycznym urzadzeniu.');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted' && requestPermission) {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    if (!requestPermission) return null;
    console.warn('[Push] Brak zgody na powiadomienia.');
    return null;
  }

  const projectId = getExpoProjectId();
  if (!projectId) {
    console.warn('[Push] Brak Expo projectId w konfiguracji. Pomijam rejestracje tokenu.');
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
}

async function getInstallationIdAsync(): Promise<string> {
  if (Platform.OS === 'android') {
    return Application.getAndroidId() ?? 'unknown-android';
  }
  const id = await Application.getIosIdForVendorAsync();
  return id ?? 'unknown-ios';
}

export async function savePushToken(token: string): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error('[Push] Nie udalo sie pobrac uzytkownika:', userError.message);
    throw userError;
  }

  if (!user) {
    console.warn('[Push] Pomijam zapis tokenu - brak zalogowanego uzytkownika.');
    return;
  }

  const installationId = await getInstallationIdAsync();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';

  const { error } = await supabase.from('push_devices').upsert(
    {
      user_id: user.id,
      expo_push_token: token,
      installation_id: installationId,
      platform,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'user_id,installation_id',
    }
  );

  if (error) {
    console.error('[Push] Blad zapisu tokenu:', error.message);
    throw error;
  }
}

export async function removePushToken(userId: string): Promise<void> {
  const installationId = await getInstallationIdAsync();

  const { error } = await supabase
    .from('push_devices')
    .delete()
    .eq('user_id', userId)
    .eq('installation_id', installationId);

  if (error) {
    console.error('[Push] Blad usuwania tokenu:', error.message);
  }
}
