import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PendingReceiptEvent = {
  event_id: string;
  user_id: string;
  expo_ticket_ids: string[] | null;
};

type ExpoReceipt = {
  status?: string;
  message?: string;
  details?: { error?: string };
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function summarizeReceipts(receipts: ExpoReceipt[]) {
  if (receipts.length === 0) {
    return { status: "missing", error: "no receipts returned" };
  }

  const errors = receipts
    .filter((receipt) => receipt.status !== "ok")
    .map((receipt) => receipt.details?.error || receipt.message || "receipt_error");

  if (errors.length === 0) return { status: "ok", error: null };
  if (errors.length === receipts.length) return { status: "failed", error: errors.join("; ") };
  return { status: "partial", error: errors.join("; ") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "missing_supabase_env" });
  }

  if (!CRON_SECRET) {
    return json(500, { error: "missing_cron_secret" });
  }

  if (req.headers.get("Authorization") !== `Bearer ${CRON_SECRET}`) {
    return json(401, { error: "unauthorized" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { limit = 100 } = await req.json().catch(() => ({}));
  const { data, error } = await supabase.rpc("get_pending_push_lifecycle_receipts", {
    p_limit: limit,
  });

  if (error) return json(500, { error: error.message });

  const events = (data ?? []) as PendingReceiptEvent[];
  const ticketToEvent = new Map<string, string>();
  const allTicketIds: string[] = [];

  for (const event of events) {
    for (const ticketId of event.expo_ticket_ids ?? []) {
      if (!ticketId) continue;
      ticketToEvent.set(ticketId, event.event_id);
      allTicketIds.push(ticketId);
    }
  }

  const receiptsByEvent = new Map<string, ExpoReceipt[]>();
  for (const event of events) receiptsByEvent.set(event.event_id, []);

  let receiptErrors = 0;

  for (const ids of chunk(allTicketIds, 300)) {
    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids }),
    });

    const result = await response.json().catch(() => null) as
      | { data?: Record<string, ExpoReceipt>; errors?: Array<{ message?: string }> }
      | null;

    if (!response.ok || !result?.data) {
      const message = result?.errors?.map((item) => item.message).filter(Boolean).join("; ")
        || `expo_receipts_http_${response.status}`;
      receiptErrors += ids.length;
      for (const id of ids) {
        const eventId = ticketToEvent.get(id);
        if (eventId) receiptsByEvent.get(eventId)?.push({ status: "error", message });
      }
      continue;
    }

    for (const id of ids) {
      const eventId = ticketToEvent.get(id);
      if (!eventId) continue;
      const receipt = result.data[id] ?? { status: "missing", message: "receipt_missing" };
      receiptsByEvent.get(eventId)?.push(receipt);
    }
  }

  let checked = 0;
  for (const event of events) {
    const summary = summarizeReceipts(receiptsByEvent.get(event.event_id) ?? []);
    const { error: markError } = await supabase.rpc("mark_push_lifecycle_receipt_checked", {
      p_event_id: event.event_id,
      p_receipt_status: summary.status,
      p_error_message: summary.error,
    });
    if (!markError) checked += 1;
  }

  return json(200, {
    events: events.length,
    tickets: allTicketIds.length,
    checked,
    receiptErrors,
  });
});
