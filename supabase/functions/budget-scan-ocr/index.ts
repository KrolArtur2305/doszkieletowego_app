import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_MODEL = Deno.env.get("OPENAI_BUDGET_SCAN_MODEL") ?? "gpt-5.4-mini";
const OPENAI_TIMEOUT_MS = 60_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REQUESTS_PER_MINUTE = 6;
const TRUSTED_SUBSCRIPTION_SOURCES = new Set([
  "stripe",
  "revenuecat",
  "app_store",
  "apple",
  "google_play",
  "play_store",
  "webhook",
  "backend",
  "server",
]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type BudgetScanOcrRequestBody = {
  image_data_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  size?: number | null;
  app_language?: string | null;
  investment_id?: string | null;
};

type AppLanguage = "pl" | "en" | "de";

type AccessPolicy = {
  monthlyLimit: number | null;
  plan: string;
};

type BillingContext = {
  ownerUserId: string;
  investmentId: string | null;
  usageScopeKey: string;
};

type ValidatedImage = {
  dataUrl: string;
  mimeType: string;
  byteLength: number;
};

class HttpError extends Error {
  status: number;
  code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

const budgetScanOcrSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    readable: { type: "boolean" },
    confidence: { type: "number" },
    documentType: { type: "string", enum: ["invoice", "receipt", "unknown"] },
    supplierName: { type: ["string", "null"] },
    documentNumber: { type: ["string", "null"] },
    documentDate: { type: ["string", "null"] },
    currency: { type: ["string", "null"] },
    totalAmount: { type: ["number", "null"] },
    rawText: { type: ["string", "null"] },
    issues: {
      type: "array",
      items: { type: "string" },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          amount: { type: ["number", "null"] },
          confidence: { type: "number" },
          rawText: { type: ["string", "null"] },
        },
        required: ["name", "amount", "confidence", "rawText"],
      },
    },
    message: { type: ["string", "null"] },
  },
  required: [
    "readable",
    "confidence",
    "documentType",
    "supplierName",
    "documentNumber",
    "documentDate",
    "currency",
    "totalAmount",
    "rawText",
    "issues",
    "items",
    "message",
  ],
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAppLanguage(value: unknown): AppLanguage {
  const raw = normalizeText(value).toLowerCase().split("-")[0];
  if (raw === "pl" || raw === "en" || raw === "de") return raw;
  return "en";
}

function localizedMessage(language: AppLanguage, key: "missing_image" | "unauthorized" | "invalid_json" | "generic_error"): string {
  const messages: Record<AppLanguage, Record<typeof key, string>> = {
    pl: {
      missing_image: "Brakuje obrazu do odczytu.",
      unauthorized: "Brak autoryzacji.",
      invalid_json: "Model zwrócił nieprawidłowy format odpowiedzi.",
      generic_error: "Nie udało się przetworzyć obrazu.",
    },
    en: {
      missing_image: "Missing image data.",
      unauthorized: "Unauthorized.",
      invalid_json: "The model returned an invalid response format.",
      generic_error: "Could not process the image.",
    },
    de: {
      missing_image: "Bilddaten fehlen.",
      unauthorized: "Nicht autorisiert.",
      invalid_json: "Das Modell hat ein ungültiges Antwortformat geliefert.",
      generic_error: "Das Bild konnte nicht verarbeitet werden.",
    },
  };

  return messages[language][key];
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseUuid(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function validateImageDataUrl(value: string): ValidatedImage {
  const match = value.match(/^data:(image\/(?:jpeg|jpg|png|webp|heic|heif));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new HttpError(400, "Invalid image data.", "scanner_invalid_image");
  }

  const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, "");
  if (!base64 || base64.length % 4 === 1) {
    throw new HttpError(400, "Invalid image data.", "scanner_invalid_image");
  }

  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const byteLength = Math.floor((base64.length * 3) / 4) - padding;
  if (!Number.isFinite(byteLength) || byteLength <= 0) {
    throw new HttpError(400, "Invalid image data.", "scanner_invalid_image");
  }

  if (byteLength > MAX_IMAGE_BYTES) {
    throw new HttpError(400, "Image is too large.", "scanner_image_too_large");
  }

  return {
    dataUrl: `data:${mimeType};base64,${base64}`,
    mimeType,
    byteLength,
  };
}

async function getUserClient(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getAdminClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function resolveActiveInvestmentId(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  requestedInvestmentId?: string | null,
): Promise<string | null> {
  const cleanedRequested = parseUuid(requestedInvestmentId);

  if (cleanedRequested) {
    const { data, error } = await supabase
      .from("investment_members")
      .select("investment_id")
      .eq("investment_id", cleanedRequested)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(`Could not verify build access: ${error.message}`);
    }

    if (data?.investment_id) {
      return String(data.investment_id);
    }

    const { data: ownerData, error: ownerError } = await supabase
      .from("inwestycje")
      .select("id")
      .eq("id", cleanedRequested)
      .eq("user_id", userId)
      .maybeSingle();

    if (ownerError) {
      throw new Error(`Could not verify build ownership: ${ownerError.message}`);
    }

    if (!ownerData?.id) {
      throw new HttpError(403, "No access to this build.", "scanner_build_access_required");
    }

    return String(ownerData.id);
  }

  const { data: memberData, error: memberError } = await supabase
    .from("investment_members")
    .select("investment_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (memberError) {
    throw new Error(`Could not verify active build: ${memberError.message}`);
  }

  if (memberData?.investment_id) {
    return String(memberData.investment_id);
  }

  const { data: ownerData, error: ownerError } = await supabase
    .from("inwestycje")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ownerError) {
    throw new Error(`Could not load active build: ${ownerError.message}`);
  }

  return ownerData?.id ? String(ownerData.id) : null;
}

async function getBillingContext(
  admin: ReturnType<typeof createClient>,
  userId: string,
  investmentId: string | null,
): Promise<BillingContext> {
  if (!investmentId) {
    return {
      ownerUserId: userId,
      investmentId: null,
      usageScopeKey: `user:${userId}`,
    };
  }

  const { data, error } = await admin
    .from("inwestycje")
    .select("user_id")
    .eq("id", investmentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not verify build owner: ${error.message}`);
  }

  const ownerUserId = normalizeText(data?.user_id);
  if (!ownerUserId) {
    throw new HttpError(403, "Could not resolve build owner.", "scanner_build_access_required");
  }

  return {
    ownerUserId,
    investmentId,
    usageScopeKey: `investment:${investmentId}`,
  };
}

async function getAccessPolicy(
  admin: ReturnType<typeof createClient>,
  billingUserId: string,
): Promise<AccessPolicy> {
  const { data, error } = await admin
    .from("profiles")
    .select("plan, subscription_source, plan_expires_at")
    .eq("user_id", billingUserId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not verify scanner access: ${error.message}`);
  }

  const plan = normalizeText(data?.plan).toLowerCase() || "free";
  const subscriptionSource = normalizeText(data?.subscription_source).toLowerCase();
  const planExpiresAt = normalizeText(data?.plan_expires_at);
  const expiresAt = planExpiresAt ? new Date(planExpiresAt) : null;
  const isExpired =
    expiresAt !== null &&
    !Number.isNaN(expiresAt.getTime()) &&
    expiresAt.getTime() < Date.now();
  const hasTrustedSource =
    subscriptionSource.length > 0 &&
    TRUSTED_SUBSCRIPTION_SOURCES.has(subscriptionSource);

  if (plan === "free_trial" && hasTrustedSource && !isExpired) {
    return { monthlyLimit: 5, plan };
  }

  if ((plan === "pro" || plan === "standard") && hasTrustedSource && !isExpired) {
    return { monthlyLimit: 30, plan };
  }

  if ((plan === "expert" || plan === "pro_plus") && hasTrustedSource && !isExpired) {
    return { monthlyLimit: 100, plan };
  }

  if (plan === "free_trial" && isExpired) {
    throw new HttpError(403, "Trial expired.", "trial_expired");
  }

  if (plan !== "free") {
    throw new HttpError(403, "Scanner requires an active subscription.", "subscription_required");
  }

  throw new HttpError(403, "Scanner requires a paid plan.", "scanner_plan_required");
}

async function checkMinuteRateLimit(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase.rpc("check_budget_scan_rate_limit", {
    p_max_requests: MAX_REQUESTS_PER_MINUTE,
  });

  if (error) {
    throw new Error(`Rate limit check failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const requestCount = Number(row?.request_count ?? 0);

  if (requestCount > MAX_REQUESTS_PER_MINUTE) {
    throw new HttpError(429, "Too many requests. Try again soon.", "scanner_rate_limited");
  }
}

async function claimScanUsage(
  supabase: ReturnType<typeof createClient>,
  params: {
    billingContext: BillingContext;
    accessPolicy: AccessPolicy;
    imageBytes: number;
  },
): Promise<string> {
  const { data, error } = await supabase.rpc("claim_budget_scan_ocr_usage", {
    p_scope_key: params.billingContext.usageScopeKey,
    p_limit: params.accessPolicy.monthlyLimit,
    p_investment_id: params.billingContext.investmentId,
    p_plan: params.accessPolicy.plan,
    p_input_size_bytes: params.imageBytes,
    p_model: OPENAI_MODEL,
  });

  if (error) {
    const message = String(error.message ?? "");
    if (message.includes("scanner_quota_reached")) {
      throw new HttpError(403, "Monthly scanner limit reached.", "scanner_quota_reached");
    }
    throw new Error(`Could not claim scanner usage: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const eventId = normalizeText(row?.event_id);
  const remainingCount = Number(row?.remaining_count ?? 0);
  if (!eventId && Number.isFinite(remainingCount) && remainingCount <= 0) {
    throw new HttpError(403, "Monthly scanner limit reached.", "scanner_quota_reached");
  }
  if (!eventId) {
    throw new Error("Could not create scanner usage event.");
  }
  return eventId;
}

async function markScanEvent(
  supabase: ReturnType<typeof createClient> | null,
  eventId: string | null,
  status: "success" | "failed",
  itemsCount: number | null,
  errorMessage: string | null,
) {
  if (!eventId) return;
  const { error } = await supabase.rpc("mark_budget_scan_ocr_event", {
    p_event_id: eventId,
    p_status: status,
    p_items_count: itemsCount,
    p_error_message: errorMessage,
  });
  if (error) {
    console.error("Could not mark budget scan event:", error.message);
  }
}

function extractOpenAIText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts: string[] = [];
  const output = Array.isArray(payload.output) ? payload.output : [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as Array<unknown>)
      : [];

    for (const chunk of content) {
      if (!chunk || typeof chunk !== "object") continue;
      const record = chunk as Record<string, unknown>;
      if (typeof record.text === "string" && record.text.trim()) {
        parts.push(record.text);
      }
    }
  }

  return parts.join("").trim();
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  return trimmed;
}

async function fetchOpenAIResponse(body: Record<string, unknown>): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    return await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("OpenAI request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
    return jsonResponse({ error: "Missing required environment variables." }, 500);
  }

  let appLanguage: AppLanguage = "en";
  let userSupabase: ReturnType<typeof createClient> | null = null;
  let scanEventId: string | null = null;

  try {
    const body = (await req.json()) as BudgetScanOcrRequestBody;
    appLanguage = normalizeAppLanguage(body.app_language);
    const imageDataUrl = normalizeText(body.image_data_url);

    userSupabase = await getUserClient(req);
    if (!userSupabase) {
      return jsonResponse({ error: localizedMessage(appLanguage, "unauthorized") }, 401);
    }

    const { data: userData, error: userError } = await userSupabase.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: localizedMessage(appLanguage, "unauthorized") }, 401);
    }

    if (!imageDataUrl) {
      return jsonResponse({ error: localizedMessage(appLanguage, "missing_image") }, 400);
    }

    const validatedImage = validateImageDataUrl(imageDataUrl);

    const adminSupabase = getAdminClient();
    const investmentId = await resolveActiveInvestmentId(
      userSupabase,
      userData.user.id,
      body.investment_id,
    );
    const billingContext = await getBillingContext(adminSupabase, userData.user.id, investmentId);
    const accessPolicy = await getAccessPolicy(adminSupabase, billingContext.ownerUserId);
    await checkMinuteRateLimit(userSupabase);
    scanEventId = await claimScanUsage(userSupabase, {
      billingContext,
      accessPolicy,
      imageBytes: validatedImage.byteLength,
    });

    const prompt = [
      "You extract text from a single photo of an invoice or receipt.",
      "Return JSON only. No markdown, no commentary.",
      "Do not infer category, business meaning, or product identity beyond what is visibly written.",
      "Only extract line items and basic read quality.",
      "A line item is a row from the invoice or receipt with a product/service/material name and its row amount.",
      "Ignore tax summaries, payment method rows, subtotal rows, total-only rows, seller bank/account rows, and buyer/seller address lines unless they are actual item rows.",
      "For each line item, return name, amount, confidence, and rawText.",
      "If amount is unclear, set it to null.",
      "Return documentDate as ISO date YYYY-MM-DD when it can be determined confidently, otherwise null.",
      "Return currency as ISO code when possible, otherwise null.",
      "If the image is not readable, return readable=false and an empty items array.",
      `Write message and issues in ${appLanguage === "pl" ? "Polish" : appLanguage === "de" ? "German" : "English"}.`,
      "Use this shape exactly:",
      "{",
      "  readable: boolean,",
      "  confidence: number,",
      "  documentType: 'invoice' | 'receipt' | 'unknown',",
      "  supplierName: string | null,",
      "  documentNumber: string | null,",
      "  documentDate: string | null,",
      "  currency: string | null,",
      "  totalAmount: number | null,",
      "  rawText: string | null,",
      "  issues: string[],",
      "  items: Array<{ name: string, amount: number | null, confidence: number, rawText: string | null }>,",
      "  message: string | null",
      "}",
      "Keep names in the original document language.",
      "If the document has multiple repeated items, keep them as separate rows.",
    ].join(" ");

    let response: Response;
    try {
      response = await fetchOpenAIResponse({
        model: OPENAI_MODEL,
        input: [
          {
            role: "developer",
            content: prompt,
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Read this invoice or receipt image and extract the line items.",
              },
              {
                type: "input_image",
                image_url: validatedImage.dataUrl,
                detail: "high",
              },
            ],
          },
        ],
        store: false,
        stream: false,
        truncation: "auto",
        max_output_tokens: 1200,
        text: {
          format: {
            type: "json_schema",
            name: "budget_scan_ocr",
            strict: true,
            schema: budgetScanOcrSchema,
          },
        },
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : "OpenAI request failed.";
      console.error("OpenAI budget-scan-ocr request failed:", details);
      await markScanEvent(userSupabase, scanEventId, "failed", null, details);
      return jsonResponse(
        {
          error: localizedMessage(appLanguage, "generic_error"),
          code: details.includes("timed out") ? "scanner_timeout" : "scanner_ocr_failed",
        },
        details.includes("timed out") ? 504 : 500,
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("OpenAI budget-scan-ocr error:", response.status, errorText);
      await markScanEvent(userSupabase, scanEventId, "failed", null, `OpenAI ${response.status}`);
      return jsonResponse(
        {
          error: localizedMessage(appLanguage, "generic_error"),
          code: "scanner_ocr_failed",
        },
        500,
      );
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const rawText = extractOpenAIText(payload);
    const cleaned = stripJsonFence(rawText);

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      await markScanEvent(userSupabase, scanEventId, "failed", null, "invalid_json");
      return jsonResponse(
        {
          error: localizedMessage(appLanguage, "invalid_json"),
          code: "scanner_invalid_response",
        },
        502,
      );
    }

    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter((item) => !!item && typeof item === "object")
          .map((item) => {
            const row = item as Record<string, unknown>;
            return {
              name: normalizeText(row.name),
              amount: toNumber(row.amount),
              confidence: toNumber(row.confidence) ?? 0,
              rawText: normalizeText(row.rawText) || null,
            };
          })
      : [];

    await markScanEvent(userSupabase, scanEventId, "success", items.length, null);

    return jsonResponse({
      readable: Boolean(parsed.readable),
      confidence: toNumber(parsed.confidence) ?? 0,
      documentType:
        parsed.documentType === "invoice" || parsed.documentType === "receipt"
          ? parsed.documentType
          : "unknown",
      supplierName: normalizeText(parsed.supplierName) || null,
      documentNumber: normalizeText(parsed.documentNumber) || null,
      documentDate: normalizeText(parsed.documentDate) || null,
      currency: normalizeText(parsed.currency) || null,
      totalAmount: toNumber(parsed.totalAmount),
      rawText: normalizeText(parsed.rawText) || null,
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.map((item) => String(item)).filter(Boolean)
        : [],
      items,
      message: normalizeText(parsed.message) || null,
    });
  } catch (error) {
    console.error("budget-scan-ocr error:", error);
    await markScanEvent(
      userSupabase,
      scanEventId,
      "failed",
      null,
      error instanceof Error ? error.message : "unknown",
    );
    if (error instanceof HttpError) {
      return jsonResponse(
        {
          error: error.message || localizedMessage(appLanguage, "generic_error"),
          code: error.code,
        },
        error.status,
      );
    }
    return jsonResponse(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : localizedMessage(appLanguage, "generic_error"),
      },
      500,
    );
  }
});
