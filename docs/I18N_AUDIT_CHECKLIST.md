# i18n audit checklist (PL/EN/DE) — report-only

## Scope & method
- Full-text scan of `app/**`, `components/**`, `lib/**`, `locales/**` for: hardcoded UI strings, locale-dependent formatting, language branching, and language-dependent DB writes.
- Commands used: `rg -n "[ąćęłńóśżź…]"`, `rg -n "Alert.alert\(|placeholder=|toLocaleDateString\(|toLocaleString\(|pl-PL|en-US|PLN|zł|€|USD"`, and targeted file inspections.
- No logic refactor implemented in this task.

---

## A) High priority breakages (user sees wrong language now)

### A1) `app/(app)/inwestycja/index.tsx` — entire screen hardcoded in Polish
**Snippet**
```tsx
Alert.alert('Uzupełnij dane', 'Nazwa inwestycji jest wymagana, aby kontynuować.');
...
<Text style={styles.header}>Inwestycja</Text>
...
<Text style={styles.fieldLabel}>Planowany budżet (PLN)</Text>
...
<Text style={styles.ctaText}>{saving ? 'Zapisywanie…' : 'Zapisz i przejdź dalej'}</Text>
```
**Why wrong**: no `t(...)` usage; PL-only UI regardless of selected language.
**Minimal fix**: add `useTranslation(['investment','common'])` and replace literals with keys.
**Proposed namespace + keys**: `investment:alerts.completeDataTitle`, `investment:alerts.nameRequired`, `investment:screen.title`, `investment:form.plannedBudget`, `investment:actions.saveAndContinue`, etc.
**Locale files to update**: add new `locales/pl|en|de/investment.json`.

### A2) `app/(app)/plan.tsx` — plan picker screen hardcoded + currency literal
**Snippet**
```tsx
Alert.alert('Błąd', 'Brak sesji. Zaloguj się ponownie.');
...
<Text style={styles.hTitle}>Wybierz plan</Text>
...
{renderCard('free', 'Free', '0 zł', 'Na start i test projektu')}
```
**Why wrong**: PL literals and hardcoded `zł`; no DE support.
**Minimal fix**: create `plan` namespace and translate all labels/alerts; currency via `Intl.NumberFormat(locale, { style: 'currency', currency })`.
**Proposed keys**: `plan:alerts.errorTitle`, `plan:header.title`, `plan:cards.free.price` (numeric+currency separate).
**Locale files to update**: add `locales/pl|en|de/plan.json`.

### A3) `app/(app)/(tabs)/ustawienia/zglos_problem.tsx` — hardcoded form copy
**Snippet**
```tsx
{ key: 'logowanie', label: 'Logowanie / sesja', icon: 'key' },
...
Alert.alert('Uwaga', 'Opisz problem przynajmniej w 10 znakach.');
...
<Text style={styles.title}>Zgłoś problem</Text>
```
**Why wrong**: PL-only labels, alerts, placeholder, CTA.
**Minimal fix**: `useTranslation('settings')` + move strings into `settings.report.*` keys.
**Proposed keys**: `settings:report.title`, `settings:report.categories.loginSession`, `settings:report.alerts.minLength`.
**Locale files to update**: `locales/pl|en|de/settings.json`.

### A4) `components/Model3DView.tsx` — component-level error text hardcoded
**Snippet**
```tsx
setErr(String(data.payload || 'Nie udało się załadować modelu.'));
...
<Text style={styles.errTitle}>Błąd modelu 3D</Text>
```
**Why wrong**: shared component renders PL-only fallback/errors.
**Minimal fix**: pass translated strings as props OR use `useTranslation('project')` in component.
**Proposed keys**: `project:model.errorTitle`, `project:model.loadFailed`.
**Locale files to update**: `locales/pl|en|de/project.json`.

### A5) `app/(app)/(tabs)/dokumenty/index.tsx` — manual PL/EN branching, DE ignored
**Snippet**
```tsx
if (lngBase === 'pl') return 'Dokumenty';
return 'Documents';
...
{lngBase === 'pl' ? 'Brak dokumentów' : 'No documents'}
```
**Why wrong**: explicit two-language branching (`pl` vs `else`) means DE users receive EN strings.
**Minimal fix**: replace ternaries with `t('documents:...')` keys.
**Proposed keys**: `documents:screen.title`, `documents:empty.title`, `documents:sort.newest`.
**Locale files to update**: `locales/pl|en|de/documents.json`.

### A6) `app/(app)/(tabs)/zdjecia/index.tsx` — mixed i18n + manual PL/EN fallback
**Snippet**
```tsx
if (lngBase === 'pl') return 'Zdjęcia';
return 'Photos';
...
{lngBase === 'pl' ? 'Dodaj zdjęcia' : tt('photos:addModal.title', { defaultValue: 'Add photos' })}
```
**Why wrong**: PL/EN branching bypasses DE and duplicates existing `photos` namespace.
**Minimal fix**: always use `tt('photos:...')` without language ternaries.
**Proposed keys**: reuse `photos:header.title`, `photos:addModal.title`, `photos:addModal.pickPhoto`.
**Locale files to update**: `locales/pl|en|de/photos.json`.

---

## B) Missing translations (keys/namespaces)

### B1) Missing entire namespaces for existing screens
**Files impacted**: `app/(app)/inwestycja/index.tsx`, `app/(app)/plan.tsx`.
**Issue**: no dedicated locale files, so screens are untranslated.
**Minimal fix**: add `investment.json` and `plan.json` in all locales.
**Locale files to add**:
- `locales/pl/investment.json`, `locales/en/investment.json`, `locales/de/investment.json`
- `locales/pl/plan.json`, `locales/en/plan.json`, `locales/de/plan.json`

### B2) Namespace config inconsistency in i18n bootstrap
**Snippet (`lib/i18n/languages.ts`)**
```ts
export const NAMESPACES = [
  'common', 'auth', 'navigation', 'dashboard', 'stages', 'budget',
  'documents', 'profile', 'settings', 'photos',
] as const;
```
**Why wrong**: `project` exists in resources and is used in UI, but not listed in `NAMESPACES`.
**Minimal fix**: append `'project'` (and later `'investment'`, `'plan'` once created).
**Proposed keys**: n/a (config issue).
**Locale files to update**: none for this specific step.

### B3) `defaultValue` patterns are source-language dependent
**Examples**: `app/(app)/(tabs)/projekt/index.tsx`, `.../dokumenty/index.tsx`, `.../zdjecia/index.tsx`.
**Snippet**
```tsx
t('screenTitle', { defaultValue: i18n.language?.startsWith('pl') ? 'Projekt' : 'Project' })
```
**Why wrong**: fallback copy is language-branching and incomplete for DE.
**Minimal fix**: avoid runtime language ternary in `defaultValue`; ensure key exists in all locales.
**Proposed keys**: existing per file (`project:screenTitle`, etc.).
**Locale files to update**: matching namespace JSON in `pl/en/de`.

---

## C) Hardcoded locale/date/currency issues

### C1) `app/(app)/(tabs)/dashboard/index.tsx` hardcodes PL locale & PLN
**Snippet**
```ts
return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
...
new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })
```
**Why wrong**: forces Polish month/date/currency formatting for all users.
**Minimal fix**: derive locale from `i18n.resolvedLanguage`; currency from project/user setting with fallback.
**Proposed keys**: `dashboard:format.currencyCode` (or app config), UI labels unaffected.
**Locale files to update**: optional if currency code is key-driven.

### C2) `app/(app)/(tabs)/budzet/index.tsx` hardcodes `pl-PL`, `PLN`, and date placeholder format
**Snippet**
```ts
new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })
...
return d.toLocaleDateString('pl-PL');
...
placeholder="YYYY-MM-DD"
```
**Why wrong**: locale and expected input format fixed to one convention.
**Minimal fix**: locale map via i18n; date input hint from translation key.
**Proposed keys**: `budget:modal.datePlaceholder`, `budget:format.currencyCode`.
**Locale files to update**: `locales/pl|en|de/budget.json`.

### C3) `app/(app)/(tabs)/dokumenty/index.tsx` and `.../zdjecia/index.tsx` locale map only PL/EN
**Snippet**
```ts
return base === 'pl' ? 'pl-PL' : 'en-US';
```
**Why wrong**: DE (and any non-PL language) is coerced to `en-US`.
**Minimal fix**: map `{ pl:'pl-PL', en:'en-US', de:'de-DE' }` with fallback.
**Proposed keys**: none (utility logic).
**Locale files to update**: none.

### C4) `app/(app)/inwestycja/index.tsx` date picker pinned to Polish locale
**Snippet**
```tsx
<DateTimePicker ... locale="pl-PL" />
```
**Why wrong**: month/day names remain Polish in EN/DE UI.
**Minimal fix**: pass locale from i18n-derived map.
**Proposed keys**: none.
**Locale files to update**: none.

---

## D) Supabase language-dependent writes

### D1) `app/(app)/(tabs)/dashboard/index.tsx` + `postepy/*` use Polish status values in logic/data
**Snippet**
```ts
const STATUS_DONE = 'zrealizowany';
...
(status ?? '').toLowerCase().trim() === STATUS_DONE;
```
**Why wrong**: status semantics tied to PL string. Translating stored value would break progress logic.
**Minimal fix**: keep DB neutral code (`DONE/PLANNED`) and translate only in UI.
**Proposed keys**: `stages:status.done`, `stages:status.planned` (display only).
**Locale files to update**: `locales/pl|en|de/stages.json` (display labels).

### D2) `app/(app)/(tabs)/budzet/index.tsx` uses PL status/category values persisted to DB
**Snippet**
```ts
const STATUS_SPENT = 'poniesiony';
const STATUS_UPCOMING = 'zaplanowany';
...
const CATEGORIES = ['Stan zero', 'Stan surowy otwarty', ...];
```
**Why wrong**: budget calculations and filters depend on localized labels.
**Minimal fix**: store stable codes (`SPENT/PLANNED`, `FOUNDATION/...`) and translate labels in UI.
**Proposed keys**: `budget:status.spent`, `budget:categories.foundation`, etc.
**Locale files to update**: `locales/pl|en|de/budget.json`.

### D3) `app/(app)/(tabs)/projekt/index.tsx` writes translated default names to DB
**Snippet**
```ts
nazwa: t('myProject'),
...
const defaultName = `${t('planDefaultName', { defaultValue: 'Rzut' })} ${new Date().toLocaleDateString(locale)}`
```
**Why wrong**: database content language depends on active UI language at creation time.
**Minimal fix**: store neutral defaults (`project-untitled`, `plan-untitled`) and localize at render if value equals sentinel.
**Proposed keys**: `project:defaults.projectName`, `project:defaults.planName` (UI only).
**Locale files to update**: `locales/pl|en|de/project.json`.

---

## E) Recommended minimal patch list (per file)

1. **`app/(app)/inwestycja/index.tsx`**
   - Introduce `useTranslation(['investment','common'])`.
   - Replace all hardcoded labels/alerts/placeholders/button texts.
   - Replace `locale="pl-PL"` with locale map from i18n.

2. **`app/(app)/plan.tsx`**
   - Introduce `useTranslation(['plan','common'])`.
   - Move bullets/alerts/taglines/CTA to keys.
   - Replace `'0 zł'` with formatted currency from locale+currency.

3. **`app/(app)/(tabs)/ustawienia/zglos_problem.tsx`**
   - Wire to `settings` namespace (`settings.report.*`).
   - Move category labels + form copy + alerts to locale files.

4. **`components/Model3DView.tsx`**
   - Remove hardcoded PL fallback strings; use `project:model.*` keys or translated props.

5. **`app/(app)/(tabs)/dokumenty/index.tsx`**
   - Replace `lngBase === 'pl' ? ... : ...` branches with `t(...)` keys.
   - Expand locale mapping to include `de-DE`.

6. **`app/(app)/(tabs)/zdjecia/index.tsx`**
   - Remove remaining PL/EN ternaries and rely on `photos` keys.
   - Expand locale map to include `de-DE`.

7. **`app/(app)/(tabs)/dashboard/index.tsx`**
   - Replace `pl-PL` date formatters and `PLN` formatter with i18n-aware locale/currency.
   - Keep DB status comparisons on neutral codes only (future-safe).

8. **`app/(app)/(tabs)/budzet/index.tsx`**
   - Replace hardcoded locale/currency/date placeholders with i18n-driven formatting.
   - Migrate logic from localized status/category strings to stable codes.

9. **`app/(app)/(tabs)/projekt/index.tsx`**
   - Avoid language-derived defaults written to DB; use neutral sentinel values.
   - Remove language ternary from `defaultValue`.

10. **`lib/i18n/languages.ts`**
    - Add missing namespaces to `NAMESPACES` (`project` now, later `investment`, `plan`).

11. **`locales/**` additions/updates**
    - Add: `investment.json`, `plan.json` in `pl/en/de`.
    - Extend: `settings.json`, `project.json`, `budget.json`, `documents.json`, `photos.json`, `dashboard.json` with keys listed above.

---

## Notes on “user data” vs “UI translation” (important)
- **Should stay as user content (not translated automatically):** user-entered fields like investment name/location, document title/notes, photo description/tags.
- **Should NOT be persisted as localized strings:** system statuses, category identifiers, and generated defaults used as data identifiers.
