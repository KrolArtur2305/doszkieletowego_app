import { Redirect } from 'expo-router';

export default function RootIndex() {
  // Defaultowo kierujemy na ekran logowania.
  // useSupabaseAuth w _layout.tsx i tak przełączy na (app), jeśli użytkownik jest zalogowany.
  return <Redirect href="/(auth)/login" />;
}
