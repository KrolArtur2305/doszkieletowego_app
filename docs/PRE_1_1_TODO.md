# Pre-1.1 TODO

## Backend schema recovery

- Recreate and commit migrations for the AI schema used by `supabase/functions/ai-chat/index.ts`.
- The missing schema includes AI conversation tables and RPC functions such as:
  - `ai_conversations`
  - `create_ai_conversation`
  - `get_my_ai_conversations`
  - `get_ai_daily_usage`
  - `increment_ai_daily_usage`
  - `check_ai_rate_limit`
  - `add_ai_message`
  - `get_ai_messages`
- Do not guess this migration from app code. Export the current production schema or inspect the remote database directly, then turn the exact schema into migrations.

## Subscription backend

- RevenueCat/App Store purchases are enabled for the App Store build.
- Before 1.1, verify the production RevenueCat webhook/backend sync path and document which backend source is authoritative for paid access.
- Paid plan access should be confirmed from RevenueCat/backend state, not from client-writable `profiles` fields alone.
- Verify RevenueCat entitlement IDs and environment variables for `pro` and `expert`.
- Decide where plan limits are enforced. Today many limits are presented in UI, but not enforced consistently across all modules.
