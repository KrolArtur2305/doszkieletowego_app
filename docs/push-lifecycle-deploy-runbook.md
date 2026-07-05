# BuildIQ push lifecycle - deploy i test

Ten runbook domyka wdrozenie pushy onboarding/reactivation oraz receipts Expo.

## 1. Wymagania

- Dostep do projektu Supabase.
- Dzialajacy Docker, jesli testujesz lokalnie Supabase.
- Fizyczne urzadzenie iOS/Android. Push nie jest wiarygodny na emulatorze ani w samym Expo Go.
- Sekret `CRON_SECRET`, np. losowy string minimum 32 znaki.

Placeholdery uzywane nizej:

```txt
PROJECT_REF=<supabase-project-ref>
CRON_SECRET=<dlugi-losowy-sekret>
```

## 2. Walidacja lokalna

```powershell
npm.cmd run validate:locales
npx.cmd tsc --noEmit
git diff --check
```

Jesli Docker/Supabase dziala lokalnie:

```powershell
supabase start
supabase db lint --local
```

Jesli masz Deno:

```powershell
deno check supabase/functions/push-lifecycle/index.ts
deno check supabase/functions/push-lifecycle-receipts/index.ts
```

## 3. Deploy Supabase

Polacz lokalny projekt z remote, jesli nie jest polaczony:

```powershell
supabase link --project-ref PROJECT_REF
```

Wypchnij migracje:

```powershell
supabase db push
```

Ustaw sekret:

```powershell
supabase secrets set CRON_SECRET="CRON_SECRET"
```

Wdroz Edge Functions:

```powershell
supabase functions deploy push-lifecycle --project-ref PROJECT_REF --no-verify-jwt --use-api
supabase functions deploy push-lifecycle-receipts --project-ref PROJECT_REF --no-verify-jwt --use-api
```

## 4. Cron

Preferowane: ustaw harmonogram w Supabase Dashboard / Scheduled Functions, jesli jest dostepny w projekcie.

- `push-lifecycle`: raz dziennie rano, np. `0 7 * * *`
- `push-lifecycle-receipts`: co 30-60 minut, np. `*/30 * * * *`

Naglowek dla obu:

```txt
Authorization: Bearer CRON_SECRET
Content-Type: application/json
```

Body dla `push-lifecycle`:

```json
{ "respectLocalMorning": true }
```

Body dla `push-lifecycle-receipts`:

```json
{ "limit": 100 }
```

Alternatywa SQL przez `pg_cron` + `pg_net`:

```sql
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'push-lifecycle-daily',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://PROJECT_REF.functions.supabase.co/push-lifecycle',
    headers := jsonb_build_object(
      'Authorization', 'Bearer CRON_SECRET',
      'Content-Type', 'application/json'
    ),
    body := '{"respectLocalMorning":true}'::jsonb
  );
  $$
);

select cron.schedule(
  'push-lifecycle-receipts-every-30m',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://PROJECT_REF.functions.supabase.co/push-lifecycle-receipts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer CRON_SECRET',
      'Content-Type', 'application/json'
    ),
    body := '{"limit":100}'::jsonb
  );
  $$
);
```

## 5. Szybki test funkcji

Bez poprawnego sekretu powinno byc `401`:

```powershell
curl.exe -i -X POST "https://PROJECT_REF.functions.supabase.co/push-lifecycle"
```

Z sekretem:

```powershell
curl.exe -i -X POST "https://PROJECT_REF.functions.supabase.co/push-lifecycle" `
  -H "Authorization: Bearer CRON_SECRET" `
  -H "Content-Type: application/json" `
  -d "{\"respectLocalMorning\":false}"
```

Receipts:

```powershell
curl.exe -i -X POST "https://PROJECT_REF.functions.supabase.co/push-lifecycle-receipts" `
  -H "Authorization: Bearer CRON_SECRET" `
  -H "Content-Type: application/json" `
  -d "{\"limit\":100}"
```

Oczekiwane: JSON z licznikami, nawet jesli `candidates` albo `events` wynosi `0`.

## 6. Test end-to-end

1. Zainstaluj build na fizycznym iOS/Android.
2. Zaloguj sie nowym kontem.
3. Daj zgode na push.
4. Sprawdz w Supabase:

```sql
select user_id, expo_push_token, app_language, timezone, disabled_at, updated_at
from public.push_devices
order by updated_at desc
limit 20;
```

5. Sprawdz stan lifecycle:

```sql
select *
from public.push_lifecycle_state
order by created_at desc
limit 20;
```

6. Do testu bez czekania 24h mozna tymczasowo cofnac `user_registered_at` na koncie testowym:

```sql
update public.push_lifecycle_state
set user_registered_at = now() - interval '25 hours',
    last_activity_at = null,
    push_onboarding_24h_sent_at = null
where user_id = '<TEST_USER_ID>';
```

7. Wywolaj `push-lifecycle` z `respectLocalMorning:false`.
8. Po otrzymaniu pusha kliknij go i sprawdz:
   - otwiera sie ekran Zdjecia albo Dashboard,
   - modal pokazuje sie raz,
   - CTA otwiera dodawanie zdjecia,
   - tekst i jezyk sa poprawne.
9. Po 15+ minutach wywolaj `push-lifecycle-receipts`.
10. Sprawdz eventy:

```sql
select
  push_type,
  status,
  expo_ticket_ids,
  receipt_checked_at,
  receipt_status,
  receipt_error_message,
  error_message,
  created_at
from public.push_lifecycle_events
order by created_at desc
limit 20;
```

## 7. Kryteria gotowosci

- Migracja przechodzi na stagingu.
- `push-lifecycle` zwraca `200` z poprawnym sekretem i `401` bez sekretu.
- `push-lifecycle-receipts` zwraca `200` z poprawnym sekretem i `401` bez sekretu.
- Token zapisuje `app_language` i `timezone`.
- Push przychodzi na iOS i Android.
- Klikniecie pokazuje modal tylko raz.
- Event ma `status = sent`, a po receipt check ma `receipt_checked_at`.
- W logach nie ma masowych `failed` albo `partial` bez jasnej przyczyny.

## 8. Co obserwowac po produkcji

Przez pierwsze dni sprawdzaj codziennie:

```sql
select push_type, status, count(*)
from public.push_lifecycle_events
where created_at > now() - interval '7 days'
group by push_type, status
order by push_type, status;
```

```sql
select receipt_status, count(*)
from public.push_lifecycle_events
where receipt_checked_at > now() - interval '7 days'
group by receipt_status
order by receipt_status;
```

Jesli `failed` albo `partial` rosnie szybko, najpierw sprawdz:

- czy Expo credentials sa poprawne,
- czy build ma poprawny projectId,
- czy `CRON_SECRET` jest taki sam w cronach i funkcjach,
- czy tokeny nie sa masowo stare po reinstalacji aplikacji.

## 9. Payload dla recznych pushy admina

Aplikacja mobilna obsluguje uniwersalny typ:

```json
{
  "eventId": "admin-campaign-or-recipient-id",
  "type": "admin_push",
  "targetScreen": "dashboard",
  "modalTitle": "Tytul modala opcjonalnie",
  "modalMessage": "Tresc modala opcjonalnie",
  "ctaLabel": "Zobacz",
  "dismissLabel": "Pozniej"
}
```

`modalTitle` albo `modalMessage` sa opcjonalne. Jesli ich nie ma, klikniecie w push tylko otwiera ekran.

Obslugiwane `targetScreen`:

```txt
dashboard
photos
budget
documents
tasks
journal
progress
project
settings
```

Jesli modal ma CTA, aplikacja otworzy ekran z parametrem `openAdd=1` tam, gdzie ekran to wspiera:

```txt
photos
budget
documents
journal
```
