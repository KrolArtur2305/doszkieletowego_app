import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: "Remove partner function is not configured." });
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

  let body: { memberId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const memberId = String(body.memberId ?? "").trim();
  if (!memberId) {
    return json(400, { error: "Missing partner member id." });
  }

  const { data: member, error: memberError } = await supabase
    .from("investment_members")
    .select("id,user_id,investment_id,role")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError) return json(500, { error: memberError.message });
  if (!member) return json(404, { error: "partner_not_found" });
  if ((member as any).role === "owner") return json(400, { error: "cannot_remove_owner" });

  const investmentId = String((member as any).investment_id ?? "");
  const targetUserId = String((member as any).user_id ?? "");
  if (!investmentId || !targetUserId) {
    return json(500, { error: "Invalid partner record." });
  }

  const { data: ownerCheck, error: ownerCheckError } = await supabase
    .from("investment_members")
    .select("id")
    .eq("investment_id", investmentId)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (ownerCheckError) return json(500, { error: ownerCheckError.message });
  if (!ownerCheck) return json(403, { error: "not_investment_owner" });

  const { data: build, error: buildError } = await supabase
    .from("inwestycje")
    .select("nazwa")
    .eq("id", investmentId)
    .maybeSingle();

  if (buildError) return json(500, { error: buildError.message });

  const noticePayload = {
    investment_name: String((build as any)?.nazwa ?? ""),
  };

  const { error: noticeError } = await supabase
    .from("investment_member_notices")
    .insert({
      user_id: targetUserId,
      investment_id: investmentId,
      notice_type: "partner_removed",
      payload: noticePayload,
      created_by: user.id,
    });

  if (noticeError) return json(500, { error: noticeError.message });

  const { error: deleteError } = await supabase
    .from("investment_members")
    .delete()
    .eq("id", memberId)
    .eq("investment_id", investmentId)
    .eq("role", "partner");

  if (deleteError) return json(500, { error: deleteError.message });

  return json(200, {
    removed: true,
    investmentId,
    noticeType: "partner_removed",
    investmentName: noticePayload.investment_name,
  });
});
