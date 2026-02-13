# Analiza i18n (i18next + react-i18next) dla Expo Router

## 1) Pliki z użyciem i18n / useTranslation

### `lib/i18n.ts`
- **Rola:** główna inicjalizacja `i18next`, rejestracja `initReactI18next`, zasoby `pl/en`, odczyt języka z `AsyncStorage`.
- **Ocena:** częściowo poprawne (jest `resources`, `defaultNS`, `ns`, `interpolation`), ale są krytyczne problemy inicjalizacji.
- **Problemy:**
  1. `fallbackLng` ustawiony na `pl`, a wymaganie projektowe mówi o fallback do `en`.
  2. `AsyncStorage.getItem(...)` wykonuje się **po** `init`, bez blokowania renderu -> potencjalne migotanie języka (start np. po polsku, potem szybka zmiana na en).
  3. Brak `supportedLngs` i brak `nonExplicitSupportedLngs`.
  4. Domyślny `lng: 'pl'` jest „na sztywno”, zamiast opartego o saved/system locale z fallback `en`.
  5. Mieszanie odpowiedzialności: konfiguracja + storage + zasoby w jednym pliku.
- **Co poprawić:**
  - Ustawić `fallbackLng: 'en'`.
  - Dodać `supportedLngs: ['en', 'pl']`.
  - Rozdzielić na: `lib/i18n/index.ts` (init), `lib/i18n/languages.ts` (stałe), `lib/i18n/storage.ts` (persist/get).
  - Zrobić jawny etap `initI18n()` (promise) i odczekać na niego w root layout przed renderem routingu.

### `app/(auth)/welcome.tsx`
- **Rola:** ekran powitalny, wybór języka, zapis `app_language` i `i18n.changeLanguage(...)`.
- **Ocena:** logika zmiany języka jest poprawna funkcjonalnie, ale nie jest scentralizowana.
- **Problemy:**
  1. Bezpośredni `AsyncStorage.setItem('app_language', ...)` zamiast wspólnego helpera.
  2. Porównanie `i18n.language === 'en'/'pl'` może nie działać idealnie, jeśli pojawi się wariant typu `en-US`.
- **Co poprawić:**
  - Zastąpić zapis helperem `setStoredLanguage(...)`.
  - Przełączać język przez `setAppLanguage(lng)` (jedna funkcja: persist + `changeLanguage`).
  - Dla UI aktywnego języka używać `i18n.resolvedLanguage`.

### `app/(auth)/login.tsx`, `app/(auth)/register.tsx`, `app/(auth)/welcome.tsx`, `app/(app)/(tabs)/_layout.tsx`, `app/(app)/(tabs)/dashboard/index.tsx`
- **Rola:** importują `lib/i18n` efektowo (side-effect), aby wymusić init.
- **Ocena:** działa „przypadkiem”, ale architektonicznie to antywzorzec.
- **Problemy:**
  1. Init i18n rozproszony po ekranach (trudna kontrola kolejności).
  2. Brak gwarancji, że pierwszy render całej aplikacji czeka na gotowe i18n.
- **Co poprawić:**
  - Usunąć wszystkie per-screen `import '../../lib/i18n'` / `import '../../../lib/i18n'`.
  - Dodać jeden import + await init wyłącznie w `app/_layout.tsx`.

### `app/(app)/(tabs)/budzet/index.tsx`, `app/(app)/(tabs)/dokumenty/index.tsx`, `app/(app)/(tabs)/postepy/index.tsx`, `app/(app)/(tabs)/postepy/wszystkie.tsx`, `app/(app)/profil/index.tsx`
- **Rola:** używają `useTranslation(...)` dla namespace.
- **Ocena:** poprawne użycie hooka z namespace.
- **Ryzyko:** jeżeli init nie będzie gotowy na starcie, pierwszy render może pokazać fallback/key lub chwilowo zły język.
- **Co poprawić:** po centralnym `initI18n()` w root ryzyko znika.

### `lib/supabase.ts`
- **Rola:** konfiguracja Supabase auth session storage na `AsyncStorage`.
- **Ocena:** poprawne i niezależne od i18n.
- **Uwaga:** brak konfliktu technicznego z i18n, ale warto nie dublować kluczy storage i trzymać i18n key osobno (`LANG_KEY`).

### `locales/en/*.json`, `locales/pl/*.json`
- **Rola:** statyczne zasoby tłumaczeń JSON per namespace.
- **Ocena:** dobra organizacja per język i namespace.
- **Co poprawić:**
  - Pilnować spójności kluczy między `pl` i `en`.
  - Dodać opcjonalną walidację spójności kluczy w CI.

## 2) Czy i18n jest poprawnie zainicjalizowane i ładowane przed UI?

- **Stan obecny:** częściowo.
  - Inicjalizacja istnieje (`lib/i18n.ts`), ale jest uruchamiana przez importy w różnych ekranach.
  - Odczyt języka z `AsyncStorage` jest asynchroniczny i wykonywany po `init`, bez bramki renderu.
- **Wniosek:** kolejność nie jest deterministyczna dla pierwszego renderu; możliwe jest migotanie języka.

## 3) Wzorcowa struktura plików i18n

```text
lib/
  i18n/
    index.ts        # initI18n(), i18n instance, setAppLanguage()
    languages.ts    # AppLanguage, supportedLngs, fallbackLng, defaultNS, namespaces
    storage.ts      # getStoredLanguage(), setStoredLanguage(), LANG_KEY
    resources.ts    # import JSON i resources map
locales/
  en/
    common.json
    auth.json
    navigation.json
    dashboard.json
    stages.json
    budget.json
    documents.json
    profile.json
  pl/
    common.json
    auth.json
    navigation.json
    dashboard.json
    stages.json
    budget.json
    documents.json
    profile.json
```

## 4) Wzorcowa konfiguracja i18next (dla tej aplikacji)

```ts
// lib/i18n/languages.ts
export const supportedLngs = ['en', 'pl'] as const;
export type AppLanguage = (typeof supportedLngs)[number];
export const fallbackLng: AppLanguage = 'en';
export const defaultNS = 'common';
export const namespaces = ['common', 'auth', 'navigation', 'dashboard', 'stages', 'budget', 'documents', 'profile'] as const;
```

```ts
// lib/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { resources } from './resources';
import { getStoredLanguage, setStoredLanguage } from './storage';
import { fallbackLng, supportedLngs, defaultNS, namespaces, type AppLanguage } from './languages';

let initPromise: Promise<void> | null = null;

function resolveInitialLanguage(saved: string | null): AppLanguage {
  if (saved && supportedLngs.includes(saved as AppLanguage)) return saved as AppLanguage;
  const systemTag = Localization.getLocales()[0]?.languageCode ?? '';
  if (supportedLngs.includes(systemTag as AppLanguage)) return systemTag as AppLanguage;
  return fallbackLng;
}

export async function initI18n(): Promise<void> {
  if (i18n.isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const saved = await getStoredLanguage();
    const lng = resolveInitialLanguage(saved);

    await i18n.use(initReactI18next).init({
      resources,
      lng,
      fallbackLng,
      supportedLngs,
      nonExplicitSupportedLngs: true,
      ns: [...namespaces],
      defaultNS,
      interpolation: { escapeValue: false },
      compatibilityJSON: 'v4',
      react: { useSuspense: false },
    });
  })();

  return initPromise;
}

export async function setAppLanguage(lng: AppLanguage): Promise<void> {
  await setStoredLanguage(lng);
  await i18n.changeLanguage(lng);
}

export default i18n;
```

### Root layout gate (bez migotania)

```tsx
// app/_layout.tsx
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { initI18n } from '../lib/i18n';

export default function RootLayout() {
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n().finally(() => setI18nReady(true));
  }, []);

  if (!i18nReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <ActualRouterTree />;
}
```

## 5) Konkretne instrukcje migracji dla obecnego kodu

### Usunąć
1. Importy side-effect `lib/i18n` w ekranach:
   - `app/(auth)/welcome.tsx`
   - `app/(auth)/login.tsx`
   - `app/(auth)/register.tsx`
   - `app/(app)/(tabs)/_layout.tsx`
   - `app/(app)/(tabs)/dashboard/index.tsx`
2. Bezpośrednie `AsyncStorage.setItem('app_language', ...)` z UI (przenieść do helpera).

### Przenieść
1. Obecny `lib/i18n.ts` podzielić na 4 pliki: `index.ts`, `languages.ts`, `resources.ts`, `storage.ts`.
2. Stałe namespace i języków trzymać w `languages.ts`.

### Dodać
1. `initI18n()` wywołanie tylko raz w `app/_layout.tsx`.
2. `setAppLanguage(lng)` używane przez ekran welcome/ustawienia.
3. `supportedLngs`, `fallbackLng: 'en'`, `nonExplicitSupportedLngs: true`.
4. (Opcjonalnie) `expo-localization` do wyboru języka systemowego, gdy brak zapisu.

### Opcje i18next, które powinny być ustawione
- `fallbackLng: 'en'` – zgodnie z wymaganiem; bezpieczny fallback przy brakujących kluczach.
- `supportedLngs: ['en', 'pl']` – ogranicza nieprawidłowe locale i wspiera walidację.
- `defaultNS: 'common'` – wspólne krótkie klucze bazowe.
- `ns: [...]` – jawna lista namespace używanych w aplikacji.
- `nonExplicitSupportedLngs: true` – mapuje np. `en-US` -> `en`.
- `react.useSuspense: false` – stabilniej w RN bez dodatkowego Suspense boundary.

## 6) Backup plan (gdy część zależności/kontekstu okaże się nieznana)

Jeżeli podczas wdrożenia pojawią się ograniczenia (np. brak `expo-localization` runtime, custom loader, dynamic import), minimalny plan awaryjny:
1. Zostawić statyczne `resources` importowane z JSON (tak jak teraz).
2. Wprowadzić tylko `initI18n()` + gate w `app/_layout.tsx`.
3. Dodać `setAppLanguage()` i usunąć bezpośredni zapis `AsyncStorage` z UI.
4. Ustawić `fallbackLng: 'en'` i `supportedLngs`.

To już eliminuje migotanie oraz porządkuje inicjalizację bez dużego refaktoru.
