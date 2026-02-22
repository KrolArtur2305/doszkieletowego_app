# i18n audit report (PL/EN/DE) — find-only, no refactor

Scan scope: `app/**`, `components/**`, `lib/**`, `locales/**`.

Commands used:
- `rg -n "Alert\.alert\(|placeholder=|toLocaleDateString\(|toLocaleString\(|Intl\.NumberFormat\(|'pl-PL'|'en-US'|PLN|zł|€|USD" app lib components`
- `rg -n "defaultValue:\s*'[^']*[ąćęłńóśżźĄĆĘŁŃÓŚŻŹ]" app`
- `python` checks for unresolved keys used by `t()/tt()` against locale JSON files.

---

## A) High priority breakages (user sees wrong language now)

### A1) Missing common error/delete keys used in multiple screens
**File paths:**
- `app/(app)/(tabs)/ustawienia/index.tsx`
- `app/(app)/(tabs)/dokumenty/index.tsx`
- `app/(app)/(tabs)/zdjecia/index.tsx`

**Snippet**
```tsx
Alert.alert(t('common:errorTitle'), e?.message ?? t('common:errors.generic'));
...
text: tt('common:delete', { defaultValue: 'Delete' }),
```

**What’s wrong**
- `common:errorTitle`, `common:errors.generic`, `common:delete` are used but missing from `locales/*/common.json`.
- UI can display raw keys or fallback strings inconsistently.

**Proposed minimal fix**
- Add these keys to common namespace and remove ad-hoc `defaultValue` where key exists.

**Proposed i18n keys + namespace**
- `common:errorTitle`
- `common:errors.generic`
- `common:delete`

**Locale JSON files to update**
- `locales/pl/common.json`
- `locales/en/common.json`
- `locales/de/common.json`

---

### A2) `projekt` screen uses non-existent key + broken fallback expression
**File path:** `app/(app)/(tabs)/projekt/index.tsx`

**Snippet**
```tsx
<Text style={styles.modelHint}>
  {t('modelHint', {
    defaultValue: i18n.language?.startsWith('pl')
  })}
</Text>
```

**What’s wrong**
- `project:modelHint` does not exist in locale files.
- `defaultValue` expression is effectively empty/invalid as user copy fallback.

**Proposed minimal fix**
- Replace usage with existing nested key `t('model.hintRotateZoom')`.

**Proposed i18n key + namespace**
- Use existing: `project:model.hintRotateZoom`

**Locale JSON files to update**
- none (key already exists in all locales)

---

### A3) `projekt` title key mismatch forces default fallback path
**File path:** `app/(app)/(tabs)/projekt/index.tsx`

**Snippet**
```tsx
{t('screenTitle', { defaultValue: i18n.language?.startsWith('pl') ? 'Projekt' : 'Project' })}
```

**What’s wrong**
- `project:screenTitle` does not exist.
- Runtime fallback only handles PL/EN; DE users get EN.

**Proposed minimal fix**
- Add `screenTitle` key to `project.json` OR switch to an existing key like `project:myProject` if semantically correct.

**Proposed i18n key + namespace**
- `project:screenTitle`

**Locale JSON files to update**
- `locales/pl/project.json`
- `locales/en/project.json`
- `locales/de/project.json`

---

## B) Missing translations (keys missing in locale files)

### B1) Missing keys in `common` namespace
**Missing keys found in code usage**
- `common:errorTitle`
- `common:errors.generic`
- `common:delete`

**Where used**
- `app/(app)/(tabs)/ustawienia/index.tsx`
- `app/(app)/(tabs)/dokumenty/index.tsx`
- `app/(app)/(tabs)/zdjecia/index.tsx`

**Proposed minimal fix**
- Add keys to all three locale files under `common`.

**Locale JSON files to update**
- `locales/pl/common.json`
- `locales/en/common.json`
- `locales/de/common.json`

---

### B2) Missing keys in `project` namespace
**Missing keys found in code usage**
- `project:screenTitle`
- `project:modelHint`

**Where used**
- `app/(app)/(tabs)/projekt/index.tsx`

**Proposed minimal fix**
- Preferred: stop using `project:modelHint` and use existing `project:model.hintRotateZoom`.
- Add `project:screenTitle` across locales.

**Locale JSON files to update**
- `locales/pl/project.json`
- `locales/en/project.json`
- `locales/de/project.json`

---

## C) Hardcoded locale/date/currency issues

### C1) Dashboard forces Polish date/currency
**File path:** `app/(app)/(tabs)/dashboard/index.tsx`

**Snippet**
```ts
return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
...
new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })
```

**What’s wrong**
- Month names and number/currency formatting remain Polish in EN/DE.

**Proposed minimal fix**
- Introduce `localeFromLng(i18n.resolvedLanguage)` and format with dynamic locale.
- Keep currency in config/field (`PLN` fallback only), not hardcoded per formatter.

**Proposed i18n key + namespace**
- `dashboard:format.currencyCode` (optional key) or app config value.

**Locale JSON files to update**
- optionally `locales/pl|en|de/dashboard.json` (if currency code is key-driven)

---

### C2) Budget forces `pl-PL`, `PLN`, and fixed date placeholder
**File path:** `app/(app)/(tabs)/budzet/index.tsx`

**Snippet**
```ts
new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })
...
return d.toLocaleDateString('pl-PL');
...
placeholder="YYYY-MM-DD"
```

**What’s wrong**
- Formatting and input hint are locale-specific but fixed globally.

**Proposed minimal fix**
- Use i18n-derived locale map for number/date formatting.
- Move placeholder to translation key.

**Proposed i18n key + namespace**
- `budget:modal.datePlaceholder`
- `budget:format.currencyCode` (optional)

**Locale JSON files to update**
- `locales/pl/budget.json`
- `locales/en/budget.json`
- `locales/de/budget.json`

---

### C3) Investment screen has locale-invariant date presentation and currency label
**File path:** `app/(app)/inwestycja/index.tsx`

**Snippet**
```ts
function formatPL(d: Date) {
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}
...
<Text style={styles.prefix}>PLN</Text>
```

**What’s wrong**
- Date display is fixed to PL visual pattern (`DD.MM.YYYY`) regardless of language.
- Currency code text is hardcoded in UI.

**Proposed minimal fix**
- Replace manual formatter with `toLocaleDateString(locale, ...)`.
- Use translation/config key for displayed currency label.

**Proposed i18n key + namespace**
- `investment:form.currencyCode`
- `investment:form.datePlaceholder`

**Locale JSON files to update**
- `locales/pl/investment.json`
- `locales/en/investment.json`
- `locales/de/investment.json`

---

### C4) Project default plan date locale map excludes DE
**File path:** `app/(app)/(tabs)/projekt/index.tsx`

**Snippet**
```ts
const locale = i18n.language?.startsWith('pl') ? 'pl-PL' : 'en-US'
const defaultName = `${t('planDefaultName', { defaultValue: 'Rzut' })} ${new Date().toLocaleDateString(locale)}`
```

**What’s wrong**
- DE users are forced into `en-US` date format.

**Proposed minimal fix**
- Use `localeFromLng` map with `{ pl, en, de }`.

**Proposed i18n key + namespace**
- none required for locale map; existing `project:planDefaultName` remains.

**Locale JSON files to update**
- none

---

## D) Supabase language-dependent writes

### D1) Localized default project name is written into DB
**File path:** `app/(app)/(tabs)/projekt/index.tsx`

**Snippet**
```ts
.insert({
  user_id: userId,
  nazwa: t('myProject'),
})
```

**Why it’s risky**
- Stored value depends on current app language at creation time.
- Same logical entity may differ per creator language.

**Proposed safer approach (minimal)**
- Persist neutral sentinel (e.g. `__DEFAULT_PROJECT_NAME__`) and translate in UI if sentinel is detected.

**Proposed i18n key + namespace**
- `project:defaults.projectName`

**Locale JSON files to update**
- `locales/pl/project.json`
- `locales/en/project.json`
- `locales/de/project.json`

---

### D2) Localized default plan name + localized date written into DB
**File path:** `app/(app)/(tabs)/projekt/index.tsx`

**Snippet**
```ts
const defaultName = `${t('planDefaultName', { defaultValue: 'Rzut' })} ${new Date().toLocaleDateString(locale)}`
...
.insert({ nazwa: defaultName })
```

**Why it’s risky**
- Persisted name encodes UI language and locale-specific date format.

**Proposed safer approach (minimal)**
- Store neutral value in DB (e.g. `plan-<ISO_DATE>` or sentinel+date in ISO).
- Render localized label in UI when displaying the record.

**Proposed i18n key + namespace**
- `project:defaults.planName`

**Locale JSON files to update**
- `locales/pl/project.json`
- `locales/en/project.json`
- `locales/de/project.json`

---

## E) Recommended minimal patch list (per file)

1. **`locales/pl/common.json`, `locales/en/common.json`, `locales/de/common.json`**
   - Add `errorTitle`, `errors.generic`, `delete`.

2. **`app/(app)/(tabs)/projekt/index.tsx`**
   - Replace `t('modelHint', ...)` with `t('model.hintRotateZoom')`.
   - Replace PL/EN-only fallback for `screenTitle` with real key.
   - Replace `pl-PL/en-US` ternary with locale map supporting DE.
   - Keep business logic unchanged.

3. **`locales/pl/project.json`, `locales/en/project.json`, `locales/de/project.json`**
   - Add `screenTitle` (and optionally `defaults.*` if sentinel rendering strategy adopted).

4. **`app/(app)/(tabs)/dashboard/index.tsx`**
   - Replace hardcoded `'pl-PL'` and `'PLN'` in formatters with i18n-aware locale + configurable currency.

5. **`app/(app)/(tabs)/budzet/index.tsx`**
   - Replace hardcoded `'pl-PL'`, `'PLN'`, and `"YYYY-MM-DD"` placeholder with i18n-driven values.

6. **`app/(app)/inwestycja/index.tsx`**
   - Replace manual `DD.MM.YYYY` formatter with locale-aware formatting.
   - Replace hardcoded `PLN` label with translated/configurable key.

7. **DB write strategy (project defaults)**
   - In `app/(app)/(tabs)/projekt/index.tsx`, avoid writing localized defaults directly; use neutral DB value + UI translation mapping.
