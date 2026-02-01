import { Redirect } from 'expo-router';

export default function RootIndex() {
  // Start dla niezalogowanych: ekran WELCOME (premium landing).
  return <Redirect href="/(auth)/welcome" />;
}
