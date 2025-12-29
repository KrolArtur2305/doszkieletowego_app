import { Redirect } from 'expo-router';

export default function RootIndex() {
  // Defaultowo kierujemy na ekran logowania.
  // useSupabaseAuth w _layout.tsx i tak przeĹ‚Ä…czy na (app), jeĹ›li uĹĽytkownik jest zalogowany.
  return <Redirect href="/(auth)/login" />;
}




