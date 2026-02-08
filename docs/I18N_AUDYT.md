# Audyt i18n (i18next readiness) – doszkieletowego_app

## Zakres i metoda
- Skan plików aplikacji Expo/React Native (`app/**`, `components/**`, `hooks/**`, `lib/**`, `supabase/**`) pod kątem hardcoded user-facing stringów.
- Skan miejsc, gdzie stringi są używane jako identyfikatory biznesowe (porównania, filtry, statusy, kategorie).
- Skan odwołań do Supabase (`.from(...).select(...).insert(...).update(...)`) pod kątem pól zależnych od języka.

---

## A) Znaleziska (teksty + ryzyka)

### A1. UI/Auth i nawigacja – hardcoded copy

1. **Auth (welcome/login/register) ma hardcoded copy i walidacje**:
   - `welcome`: slogan, CTA "Zaloguj się", "Zarejestruj konto".
   - `login`: alerty resetu hasła, błędy, placeholdery i etykiety CTA.
   - `register`: walidacje formularza i alerty sukces/błąd.
   - Pliki: `app/(auth)/welcome.tsx`, `app/(auth)/login.tsx`, `app/(auth)/register.tsx`.

2. **Nawigacja Tabów ma hardcoded tytuły zakładek**:
   - `Start`, `Budżet`, `Dokumenty`, `Zdjęcia`, `Projekt`, `Profil`.
   - Plik: `app/(app)/(tabs)/_layout.tsx`.

3. **Ustawienia i formularze onboardingu**:
   - Etykiety/sekcje/alerty w `ustawienia`, `profil`, `inwestycja`, `plan` są hardcoded.
   - Pliki: `app/(app)/(tabs)/ustawienia/index.tsx`, `app/(app)/(tabs)/ustawienia/zglos_problem.tsx`, `app/(app)/profil/index.tsx`, `app/(app)/inwestycja/index.tsx`, `app/(app)/plan.tsx`.

### A2. Moduły domenowe – hardcoded copy

1. **Dashboard** (`app/(app)/(tabs)/dashboard/index.tsx`):
   - Wiele tekstów UI: "Ładowanie…", "Brak etapów", "Brak zadań", "Sprawdź więcej", "Najbliższe zadania", placeholdery zadania itd.
   - Twarde locale formatowania (`pl-PL`) dla dat/kwot.

2. **Budżet** (`app/(app)/(tabs)/budzet/index.tsx`):
   - Hardcoded etykiety, modal "Dodaj wydatek", puste stany, placeholdery.
   - Teksty statusów i kategorii używane biznesowo: `poniesiony`, `zaplanowany`, `Stan zero`, `Inne` itd.

3. **Postępy** (`app/(app)/(tabs)/postepy/index.tsx`, `.../wszystkie.tsx`):
   - Hardcoded tytuły/etykiety i statusy `zrealizowany`, `planowany`.

4. **Zdjęcia** (`app/(app)/(tabs)/zdjecia/index.tsx`):
   - Hardcoded alerty i UI copy (filtry, modal dodawania).
   - `etap.nazwa` renderowany i używany do tworzenia folderu storage (po sanitizacji).

5. **Projekt** (`app/(app)/(tabs)/projekt/index.tsx`) i **Dokumenty** (`app/(app)/(tabs)/dokumenty/index.tsx`):
   - Hardcoded alerty, etykiety formularzy, puste stany, potwierdzenia usunięcia.

### A3. Miejsca szczególnie ryzykowne (string jako identyfikator)

1. **Status wydatku oparty o polskie stringi**:
   - `poniesiony` i `zaplanowany` są używane do filtrowania/sumowania i renderu.
   - Ryzyko: zmiana języka bez migracji danych popsuje logikę.

2. **Status etapu oparty o polskie stringi**:
   - `zrealizowany` / `planowany` używane do logiki progresu i toggle statusu.
   - Ryzyko: tłumaczenie statusu = zmiana semantyki danych.

3. **Kategorie wydatków jako polskie wartości domenowe**:
   - Kategorie z UI wyglądają na potencjalnie zapisywane do DB (`kategoria`).
   - Ryzyko: brak stabilnego kodu domenowego niezależnego od języka.

4. **Nazwy etapów (`nazwa`) i etapy zdjęć (`etapy_zdjecia.nazwa`)**:
   - W części miejsc to czysty content (OK), ale przy zdjęciach nazwa jest używana do budowy ścieżki storage (`sanitizeFolderName(etap.nazwa)`).
   - Ryzyko: zmiana nazwy/locale może zmieniać strukturę ścieżek.

### A4. Przegląd DB/Supabase pod kątem języka

Na podstawie zapytań w kodzie wykryte tabele/pola zależne od języka:

- `wydatki.status` – wartości tekstowe PL (`poniesiony`/`zaplanowany`).
- `wydatki.kategoria` – wartości kategorii po polsku (np. "Stan zero", "Inne").
- `etapy.status` – wartości tekstowe PL (`zrealizowany`/`planowany`).
- `etapy.nazwa` – nazwa etapu (content; może pozostać lokalizowanym contentem, ale nie jako kod).
- `etapy_zdjecia.nazwa` – obecnie używane także pośrednio w ścieżce pliku.
- `zdjecia.etap_zdjecia_id` – akurat poprawny, neutralny językowo identyfikator (FK).

`dokumenty.kategoria` już ma dobre "quasi-kody" (`UMOWY`, `FAKTURY_PARAGONY`, `INNE`) – to kierunek docelowy.

---

## B) Docelowa architektura i18n

### B1. Stack
- **RN/Expo**: `i18next` + `react-i18next` + `expo-localization`.
- Powód: sprawdzony stack w Expo, pluralizacja/interpolacja, lazy load namespace’ów, łatwa rozbudowa.

### B2. Struktura katalogów

```txt
src/
  i18n/
    index.ts              # init i18next
    resources.ts          # ładowanie namespace'ów
    types.ts              # typy kluczy (opcjonalnie)
    useAppTranslation.ts  # wrapper hook
locales/
  pl/
    common.json
    auth.json
    navigation.json
    dashboard.json
    budget.json
    stages.json
    photos.json
    documents.json
    project.json
    profile.json
    settings.json
    investment.json
  en/
    ... (te same pliki)
  de/
    ... (te same pliki)
```

### B3. Zasady kluczy
- Format: `module.section.element`.
- Przykłady:
  - `auth.login.submit`
  - `auth.errors.invalidCredentials`
  - `navigation.tabs.budget`
  - `budget.status.spent`
  - `stages.status.done`
- Nie używać tekstu źródłowego jako klucza.
- Klucze domenowe (status/kategorie) rozdzielić od copy ekranowego.

### B4. API w kodzie

```ts
// src/i18n/useAppTranslation.ts
import { useTranslation } from 'react-i18next';

export function useAppTranslation(ns?: string | string[]) {
  const { t, i18n } = useTranslation(ns);
  return { t, i18n };
}
```

Użycie:

```ts
const { t } = useAppTranslation(['common', 'budget']);
<Text>{t('budget.empty.noExpenses')}</Text>
Alert.alert(t('common.errorTitle'), t('budget.errors.loadFailed'));
```

### B5. Kod domenowy (DB) -> klucz tłumaczenia

#### Statusy etapów
- DB: `etapy.status_code` (`PLANNED`, `IN_PROGRESS`, `DONE`)
- Mapowanie i18n:
  - `PLANNED -> stages.status.planned`
  - `IN_PROGRESS -> stages.status.inProgress`
  - `DONE -> stages.status.done`

#### Statusy wydatków
- DB: `wydatki.status_code` (`PLANNED`, `SPENT`)
- Mapowanie i18n:
  - `PLANNED -> budget.status.planned`
  - `SPENT -> budget.status.spent`

#### Kategorie wydatków
- DB: `wydatki.category_code` (`FOUNDATION`, `OPEN_SHELL`, `CLOSED_SHELL`, `INSTALLATIONS`, `DEVELOPER_STATE`, `OTHER`)
- Mapowanie i18n:
  - `FOUNDATION -> budget.categories.foundation`
  - `OPEN_SHELL -> budget.categories.openShell`
  - `CLOSED_SHELL -> budget.categories.closedShell`
  - `INSTALLATIONS -> budget.categories.installations`
  - `DEVELOPER_STATE -> budget.categories.developerState`
  - `OTHER -> budget.categories.other`

#### Etapy zdjęć
- Rekomendacja: dodać neutralne `etapy_zdjecia.code` (np. `FOUNDATION`, `ROOF`, `INSTALLATIONS`) jeśli to słownik systemowy.
- Jeżeli to treść użytkownika: zostawić `nazwa`, ale **nie używać nazwy jako składnika ścieżki storage**; używać `etap_zdjecia_id`.

---

## C) Plan wdrożenia (kolejność, PR-y, checklista)

### Etap 0 (P0) – fundament bez zmiany UX
1. Dodać i18n core (`i18next`, provider, `useAppTranslation`).
2. Dodać `locales/pl/*` i przenieść tylko najczęstsze klucze `common`, `auth`, `navigation`.
3. Zastąpić hardcoded copy w auth i tab navigation.

**Efekt:** aplikacja dalej działa po polsku, ale ma gotową infrastrukturę.

### Etap 1 (P0) – odseparowanie logiki od języka (DB)
1. Migracje Supabase:
   - `wydatki.status_code` + backfill z `status`.
   - `wydatki.category_code` + backfill z `kategoria`.
   - `etapy.status_code` + backfill z `status`.
2. Kod aplikacji: filtrowanie/if-y przełączyć na `*_code`.
3. Zostawić legacy kolumny tymczasowo (read-only fallback), bez refaktoru UI.

**Efekt:** język przestaje być identyfikatorem biznesowym.

### Etap 2 (P1) – moduły domenowe
1. Przenieść stringi z: dashboard, budżet, postępy, zdjęcia, dokumenty, projekt, profil/inwestycja/ustawienia.
2. Wydzielić namespace’y JSON per moduł.
3. Zastąpić `pl-PL` hardcoded helperami locale-aware (`formatDate(locale)`, `formatCurrency(locale, currency)`).

### Etap 3 (P1) – przygotowanie EN/DE
1. Dodać `en` i `de` pliki z tymi samymi kluczami (na start nawet częściowo).
2. Dodać przełącznik języka w ustawieniach + persist (`AsyncStorage`).
3. Smoke testy: auth, dashboard, budżet, zdjęcia, dokumenty, postępy.

### Etap 4 (P2) – porządki i uszczelnienie
1. Usunąć legacy kolumny tekstowe po stabilizacji (`status`, `kategoria`) lub zostawić tylko jako user content.
2. Dodać lint/check: zakaz nowych hardcoded stringów user-facing poza plikami locales.
3. Dodać test snapshot/RTL dla kluczowych ekranów z `pl` i `en`.

---

## Backlog zadań (priorytety)

### P0 (must-have)
- [ ] i18n init + provider + `useAppTranslation`.
- [ ] `locales/pl/{common,auth,navigation}.json`.
- [ ] Refaktor `welcome/login/register` i tab titles.
- [ ] Migracje DB: `status_code`, `category_code` + backfill + indeksy/check constraints.
- [ ] Przełączenie logiki porównań na kody (dashboard/postępy/budżet).

### P1 (should-have)
- [ ] Przeniesienie copy z modułów domenowych do namespace’ów.
- [ ] Locale-aware formattery daty/kwoty.
- [ ] Przełącznik języka w ustawieniach + persist.
- [ ] Uporządkowanie `etapy_zdjecia` (id/code zamiast nazwy w ścieżce storage).

### P2 (nice-to-have)
- [ ] EN/DE pełne tłumaczenia.
- [ ] Lint rule na hardcoded copy.
- [ ] Testy i18n (snapshot + smoke).

---

## Minimalny zakres zmian "dziś PL, jutro EN/DE"
1. Wdrożyć i18n core + PL locale + refaktor auth/navigation.
2. Wprowadzić kody domenowe w DB (`status_code`, `category_code`) i przełączyć logikę porównań.
3. Zostawić UI po polsku (te same treści), ale już pobierane przez `t(...)`.

To wystarczy, aby kolejne języki dodać przez dopisanie plików `locales/en/*`, `locales/de/*` bez refaktoru logiki i bazy.
