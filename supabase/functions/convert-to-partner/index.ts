import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const buildTables = [
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
  "rzuty_projektu",
  "projekty",
];

const storageBuckets = [
  "zdjecia",
  "dokumenty",
  "paragony",
  "rzuty_projektu",
  "models",
  "modele_projektu",
  "dziennik",
];

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
  prefix: string,
  warnings: string[],
) {
  const paths: string[] = [];

  async function collect(currentPrefix: string) {
    const limit = 1000;
    let offset = 0;

    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(currentPrefix, {
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        if (!error.message.toLowerCase().includes("not found")) warnings.push(`${bucket}: ${error.message}`);
        return;
      }

      if (!data?.length) return;

      for (const entry of data) {
        const path = `${currentPrefix}/${entry.name}`;
        if (entry.metadata === null) {
          await collect(path);
        } else {
          paths.push(path);
        }
      }

      if (data.length < limit) return;
      offset += limit;
    }
  }

  await collect(prefix);
  await removeStoragePaths(supabase, bucket, paths, warnings);
}

async function removeUserFolders(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  prefixes: string[],
  warnings: string[],
) {
  const uniquePrefixes = Array.from(new Set(prefixes.map((prefix) => prefix.replace(/^\/+|\/+$/g, "")).filter(Boolean)));
  for (const prefix of uniquePrefixes) {
    await removeUserFolder(supabase, bucket, prefix, warnings);
  }
}

function pushQueryWarning(label: string, result: { error?: { message?: string } | null }, warnings: string[]) {
  if (result.error) warnings.push(`${label}: ${result.error.message ?? "query failed"}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "Partner conversion function is not configured." });
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

  let body: { inviteCode?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const inviteCode = String(body.inviteCode ?? "").trim().replace(/\s+/g, "").toUpperCase();
  if (!inviteCode) {
    return json(400, { error: "Missing invite code." });
  }

  const { error: attemptError } = await supabase.rpc("record_invite_accept_attempt", {
    p_user_id: user.id,
  });

  if (attemptError) {
    const message = String(attemptError.message ?? "");
    return json(message.includes("invite_accept_rate_limited") ? 429 : 500, { error: message });
  }

  const { data: invite, error: inviteError } = await supabase
    .from("investment_invites")
    .select("id,investment_id,invite_code,permissions,created_by,expires_at,revoked_at,accepted_uses,max_uses")
    .eq("invite_code", inviteCode)
    .maybeSingle();

  if (inviteError) return json(500, { error: inviteError.message });
  if (!invite) return json(404, { error: "invalid_or_expired_invite" });

  const inviteRow = invite as any;
  if (inviteRow.revoked_at || new Date(inviteRow.expires_at) <= new Date() || inviteRow.accepted_uses >= inviteRow.max_uses) {
    return json(400, { error: "invalid_or_expired_invite" });
  }

  const { data: ownBuild, error: ownBuildError } = await supabase
    .from("inwestycje")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (ownBuildError) return json(500, { error: ownBuildError.message });

  if (String(inviteRow.created_by ?? "") === user.id || String(ownBuild?.id ?? "") === String(inviteRow.investment_id ?? "")) {
    return json(409, { error: "cannot_join_own_build" });
  }

  const { data: memberships, error: membershipsError } = await supabase
    .from("investment_members")
    .select("investment_id,role")
    .eq("user_id", user.id);

  if (membershipsError) return json(500, { error: membershipsError.message });

  if ((memberships ?? []).some((row: any) => row.role === "partner")) {
    return json(409, { error: "already_has_active_build" });
  }

  const warnings: string[] = [];

  if (ownBuild?.id) {
    const [photos, docs, receipts, plans, projects] = await Promise.all([
      supabase.from("zdjecia").select("file_path").eq("user_id", user.id),
      supabase.from("dokumenty").select("plik_url").eq("user_id", user.id),
      supabase.from("wydatki").select("plik").eq("user_id", user.id),
      supabase.from("rzuty_projektu").select("url").eq("user_id", user.id),
      supabase.from("projekty").select("model_url").eq("user_id", user.id),
    ]);

    pushQueryWarning("zdjecia", photos, warnings);
    pushQueryWarning("dokumenty", docs, warnings);
    pushQueryWarning("wydatki", receipts, warnings);
    pushQueryWarning("rzuty_projektu", plans, warnings);
    pushQueryWarning("projekty", projects, warnings);

    if (warnings.length > 0) {
      await supabase
      return json(500, {
        error: "Partner conversion was stopped because user data could not be inspected.",
        warnings,
      });
    }

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
      removeStoragePaths(
        supabase,
        "models",
        (projects.data ?? []).map((row: any) => storagePathFromValue(row.model_url, "models")),
        warnings,
      ),
    ]);

    for (const bucket of storageBuckets) {
      const legacyPrefixes =
        bucket === "dokumenty"
          ? [`dokumenty/${user.id}`]
          : bucket === "rzuty_projektu"
            ? [`rzuty/${user.id}`]
            : [];

      await removeUserFolders(supabase, bucket, [user.id, ...legacyPrefixes], warnings);
    }

    if (warnings.length > 0) {
      return json(200, {
        converted: true,
        investmentId: inviteRow.investment_id,
        role: "partner",
        cleanup_incomplete: true,
        warnings,
      });
    }

    for (const table of buildTables) {
      const { error } = await supabase.from(table).delete().eq("user_id", user.id);
      if (error) warnings.push(`${table}: ${error.message}`);
    }

    const { error: buildDeleteError } = await supabase
      .from("inwestycje")
      .delete()
      .eq("id", ownBuild.id)
      .eq("user_id", user.id);

    if (buildDeleteError) warnings.push(`inwestycje: ${buildDeleteError.message}`);

    if (warnings.length > 0) {
      return json(200, {
        converted: true,
        investmentId: inviteRow.investment_id,
        role: "partner",
        cleanup_incomplete: true,
        warnings,
      });
    }
  }

  const targetMembership = {
    investment_id: inviteRow.investment_id,
    user_id: user.id,
    role: "partner",
    permissions: inviteRow.permissions ?? {},
    invited_by: inviteRow.created_by,
  };

  const { error: upsertError } = await supabase
    .from("investment_members")
    .upsert(targetMembership, { onConflict: "investment_id,user_id" });

  if (upsertError) {
    return json(500, { error: upsertError.message });
  }

  const { error: updateInviteError } = await supabase
    .from("investment_invites")
    .update({
      accepted_uses: (inviteRow.accepted_uses ?? 0) + 1,
      accepted_at: inviteRow.accepted_at ?? new Date().toISOString(),
    })
    .eq("id", inviteRow.id);

  if (updateInviteError) {
    return json(500, { error: updateInviteError.message });
  }

  return json(200, {
    converted: true,
    investmentId: inviteRow.investment_id,
    role: "partner",
  });
});
