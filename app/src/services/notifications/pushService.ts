import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../../../../lib/supabase';

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('[Push] Działa tylko na fizycznym urządzeniu.');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Push] Brak zgody na powiadomienia.');
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    'WKLEJ_TUTAJ_EXPO_PROJECT_ID';

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
    console.error('[Push] Nie udało się pobrać użytkownika:', userError.message);
    throw userError;
  }

  if (!user) {
    console.warn('[Push] Pomijam zapis tokenu — brak zalogowanego użytkownika.');
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
    console.error('[Push] Błąd zapisu tokenu:', error.message);
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
    console.error('[Push] Błąd usuwania tokenu:', error.message);
  }
}
