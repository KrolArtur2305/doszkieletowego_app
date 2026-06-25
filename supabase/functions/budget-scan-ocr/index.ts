import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_MODEL = "gpt-5.4-mini";

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
};

type AppLanguage = "pl" | "en" | "de";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !OPENAI_API_KEY) {
    return jsonResponse({ error: "Missing required environment variables." }, 500);
  }

  let appLanguage: AppLanguage = "en";

  try {
    const body = (await req.json()) as BudgetScanOcrRequestBody;
    appLanguage = normalizeAppLanguage(body.app_language);
    const imageDataUrl = normalizeText(body.image_data_url);

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: localizedMessage(appLanguage, "unauthorized") }, 401);
    }

    if (!imageDataUrl) {
      return jsonResponse({ error: localizedMessage(appLanguage, "missing_image") }, 400);
    }

    const prompt = [
      "You extract text from a single photo of an invoice or receipt.",
      "Return JSON only. No markdown, no commentary.",
      "Do not infer category, business meaning, or product identity beyond what is visibly written.",
      "Only extract line items and basic read quality.",
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

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
                image_url: imageDataUrl,
                detail: "high",
              },
            ],
          },
        ],
        store: false,
        stream: false,
        truncation: "auto",
        temperature: 0,
        max_output_tokens: 1200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return jsonResponse(
        {
          error: localizedMessage(appLanguage, "generic_error"),
          details: `OpenAI error ${response.status}: ${errorText.slice(0, 200) || "unknown"}`,
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
      return jsonResponse(
        {
          error: localizedMessage(appLanguage, "invalid_json"),
          raw_text: rawText,
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
