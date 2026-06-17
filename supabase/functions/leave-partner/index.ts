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
    return json(500, { error: "Leave partner function is not configured." });
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

  const { data: membership, error: membershipError } = await supabase
    .from("investment_members")
    .select("id,investment_id,role")
    .eq("user_id", user.id)
    .eq("role", "partner")
    .maybeSingle();

  if (membershipError) {
    return json(500, { error: membershipError.message });
  }

  if (!membership) {
    return json(404, { error: "partner_membership_not_found" });
  }

  const { error: deleteError } = await supabase
    .from("investment_members")
    .delete()
    .eq("id", membership.id)
    .eq("user_id", user.id)
    .eq("role", "partner");

  if (deleteError) {
    return json(500, { error: deleteError.message });
  }

  return json(200, {
    left: true,
    investmentId: membership.investment_id,
  });
});
