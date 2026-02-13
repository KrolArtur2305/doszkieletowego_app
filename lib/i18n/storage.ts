import AsyncStorage from '@react-native-async-storage/async-storage';

export const LANG_KEY = 'app_language';

export async function getStoredLanguage(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

export async function setStoredLanguage(lng: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LANG_KEY, lng);
  } catch {
    // ignore
  }
}
