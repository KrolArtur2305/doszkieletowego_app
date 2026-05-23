import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const userTables = [
  "push_devices",
  "zgloszenia",
  "kontakty",
  "dziennik",
  "zadania",
  "zdjecia",
  "etapy_zdjecia",
  "dokumenty",
  "wydatki",
  "etapy",
  "user_stages",
  "inwestycje",
  "rzuty_projektu",
  "projekty",
  "profiles",
];

const storageBuckets = [
  "zdjecia",
  "dokumenty",
  "paragony",
  "rzuty_projektu",
  "modele_projektu",
  "dziennik",
];

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

  const marker = `/storage/v1/object/public/${bucket}/`;
  const signedMarker = `/storage/v1/object/sign/${bucket}/`;
  const index = raw.indexOf(marker);
  const signedIndex = raw.indexOf(signedMarker);
  const offset =
    index >= 0 ? index + marker.length : signedIndex >= 0 ? signedIndex + signedMarker.length : -1;

  if (offset < 0) return null;
  return decodeURIComponent(raw.slice(offset).split("?")[0]);
}

async function removeStoragePaths(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  paths: Array<string | null>,
  warnings: string[],
) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean) as string[]));
  if (uniquePaths.length === 0) return;

  const { error } = await supabase.storage.from(bucket).remove(uniquePaths);
  if (error) warnings.push(`${bucket}: ${error.message}`);
}

async function removeUserFolder(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  userId: string,
  warnings: string[],
) {
  const { data, error } = await supabase.storage.from(bucket).list(userId, { limit: 1000 });
  if (error || !data?.length) {
    if (error && !error.message.toLowerCase().includes("not found")) warnings.push(`${bucket}: ${error.message}`);
    return;
  }

  await removeStoragePaths(
    supabase,
    bucket,
    data.map((entry) => `${userId}/${entry.name}`),
    warnings,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "Delete account function is not configured." });
  }

  const token = getBearerToken(req);
  if (!token) return json(401, { error: "Missing authorization token." });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) {
    return json(401, { error: "Invalid authorization token." });
  }

  const warnings: string[] = [];

  const [photos, docs, receipts, plans, projects] = await Promise.all([
    supabase.from("zdjecia").select("file_path").eq("user_id", user.id),
    supabase.from("dokumenty").select("plik_url").eq("user_id", user.id),
    supabase.from("wydatki").select("plik").eq("user_id", user.id),
    supabase.from("rzuty_projektu").select("url").eq("user_id", user.id),
    supabase.from("projekty").select("model_url").eq("user_id", user.id),
  ]);

  await Promise.all([
    removeStoragePaths(
      supabase,
      "zdjecia",
      (photos.data ?? []).map((row: any) => storagePathFromValue(row.file_path, "zdjecia")),
      warnings,
    ),
    removeStoragePaths(
      supabase,
      "dokumenty",
      (docs.data ?? []).map((row: any) => storagePathFromValue(row.plik_url, "dokumenty")),
      warnings,
    ),
    removeStoragePaths(
      supabase,
      "paragony",
      (receipts.data ?? []).map((row: any) => storagePathFromValue(row.plik, "paragony")),
      warnings,
    ),
    removeStoragePaths(
      supabase,
      "rzuty_projektu",
      (plans.data ?? []).map((row: any) => storagePathFromValue(row.url, "rzuty_projektu")),
      warnings,
    ),
    removeStoragePaths(
      supabase,
      "modele_projektu",
      (projects.data ?? []).map((row: any) => storagePathFromValue(row.model_url, "modele_projektu")),
      warnings,
    ),
  ]);

  for (const bucket of storageBuckets) {
    await removeUserFolder(supabase, bucket, user.id, warnings);
  }

  for (const table of userTables) {
    const { error } = await supabase.from(table).delete().eq("user_id", user.id);
    if (error) warnings.push(`${table}: ${error.message}`);
  }

  const { error: deleteUserError } = await supabase.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    return json(500, { error: deleteUserError.message, warnings });
  }

  return json(200, { deleted: true, warnings });
});
