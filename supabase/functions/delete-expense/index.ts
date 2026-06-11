import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RECEIPTS_BUCKET = "paragony";
const DOCUMENTS_BUCKET = "dokumenty";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function storagePathFromValue(value: unknown, bucket: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  if (!raw.startsWith("http")) return raw;

  const publicMarker = `/storage/v1/object/public/${bucket}/`;
  const signedMarker = `/storage/v1/object/sign/${bucket}/`;
  const publicIndex = raw.indexOf(publicMarker);
  const signedIndex = raw.indexOf(signedMarker);
  const offset =
    publicIndex >= 0
      ? publicIndex + publicMarker.length
      : signedIndex >= 0
        ? signedIndex + signedMarker.length
        : -1;

  if (offset < 0) return null;
  return decodeURIComponent(raw.slice(offset).split("?")[0]);
}

function linkedDocumentPathFromReceiptPath(ownerId: string, receiptPath: string | null) {
  const path = String(receiptPath ?? "").trim();
  if (!path) return null;
  if (path.startsWith("dokumenty/")) return path;
  if (path.startsWith(`${ownerId}/`)) return `dokumenty/${path}`;
  return path;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "Delete expense function is not configured." });
  }

  const token = getBearerToken(req);
  if (!token) return json(401, { error: "Missing authorization token." });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return json(401, { error: "Invalid authorization token." });

  let body: { id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const expenseId = String(body.id ?? "").trim();
  if (!expenseId) return json(400, { error: "Missing expense id." });

  const { data: expense, error: selectError } = await supabase
    .from("wydatki")
    .select("id,user_id,plik")
    .eq("id", expenseId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectError) return json(500, { error: selectError.message });
  if (!expense) return json(404, { error: "Expense not found." });

  const { error: deleteError } = await supabase
    .from("wydatki")
    .delete()
    .eq("id", expenseId)
    .eq("user_id", user.id);

  if (deleteError) return json(500, { error: deleteError.message });

  const receiptPath = storagePathFromValue((expense as { plik?: unknown }).plik, RECEIPTS_BUCKET);
  const documentPath = linkedDocumentPathFromReceiptPath(user.id, receiptPath);
  const warnings: string[] = [];

  if (receiptPath || documentPath) {
    const documentPaths = Array.from(new Set([receiptPath, documentPath].filter(Boolean) as string[]));
    const { error: documentDeleteError } = await supabase
      .from("dokumenty")
      .delete()
      .eq("user_id", user.id)
      .in("plik_url", documentPaths);
    if (documentDeleteError) warnings.push(`dokumenty: ${documentDeleteError.message}`);
  }

  if (receiptPath) {
    const { error: storageError } = await supabase.storage.from(RECEIPTS_BUCKET).remove([receiptPath]);
    if (storageError) warnings.push(`${RECEIPTS_BUCKET}: ${storageError.message}`);
  }

  if (documentPath) {
    const normalizedDocumentPath = storagePathFromValue(documentPath, DOCUMENTS_BUCKET);
    if (normalizedDocumentPath) {
      const { error: documentStorageError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .remove([normalizedDocumentPath]);
      if (documentStorageError) warnings.push(`${DOCUMENTS_BUCKET}: ${documentStorageError.message}`);
    }
  }

  return json(200, { deleted: true, storageWarning: warnings[0] ?? null, warnings });
});
