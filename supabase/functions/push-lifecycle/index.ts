import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PushType =
  | "push_onboarding_24h"
  | "push_onboarding_72h"
  | "push_onboarding_7d"
  | "push_inactivity_14d";

type Candidate = {
  user_id: string;
  investment_id: string;
  expo_push_token: string;
  installation_id: string | null;
  app_language: string | null;
  timezone: string | null;
  push_type: PushType;
  user_name: string | null;
  ai_name: string | null;
};

type LocalizedContent = {
  title: string;
  body: string;
  targetScreen: "photos" | "dashboard";
  modalTitle: string;
  modalMessage: string;
  ctaLabel: string;
  dismissLabel: string;
};

type ExpoPushMessage = ReturnType<typeof buildPayload>;

type ExpoTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
};

const translations: Record<"pl" | "en" | "de", Record<PushType, (vars: { userName: string; aiName: string }) => LocalizedContent>> = {
  pl: {
    push_onboarding_24h: ({ userName, aiName }) => ({
      title: `Cześć, ${userName}! Tu ${aiName}.`,
      body: "Twoja budowa czeka. Dodaj pierwsze zdjęcie, wydatek lub dokument i miej wszystko pod kontrolą od początku.",
      targetScreen: "photos",
      modalTitle: `Cześć, ${userName}! Tu ${aiName}.`,
      modalMessage:
        "Zacznij od dodania pierwszego zdjęcia, wydatku lub dokumentu. Im wcześniej zaczniesz prowadzić budowę, tym łatwiej będzie utrzymać porządek przez całą inwestycję.",
      ctaLabel: "Dodaj pierwszą rzecz",
      dismissLabel: "Później",
    }),
    push_onboarding_72h: ({ userName, aiName }) => ({
      title: `${aiName} przypomina`,
      body: "Im później zaczniesz uzupełniać budowę, tym trudniej odtworzyć wydatki, zdjęcia i ustalenia.",
      targetScreen: "photos",
      modalTitle: `${aiName} przypomina`,
      modalMessage:
        `Cześć, ${userName}! Nie odkładaj dokumentowania budowy. Zdjęcia, wydatki i ustalenia szybko się rozjeżdżają, jeśli nie zapisujesz ich na bieżąco.`,
      ctaLabel: "Dodaj teraz",
      dismissLabel: "Później",
    }),
    push_onboarding_7d: ({ userName, aiName }) => ({
      title: `Cześć, ${userName}! Tu ${aiName}.`,
      body: "Widzę, że w budowie nie ma jeszcze żadnych wpisów. Zacznij dziś - później będzie trudniej wszystko odtworzyć.",
      targetScreen: "photos",
      modalTitle: `Cześć, ${userName}! Tu ${aiName}.`,
      modalMessage:
        "Widzę, że BuildIQ jeszcze nie prowadzi Twojej budowy. Dodaj pierwsze zdjęcie, wydatek lub dokument, zanim ważne szczegóły zaczną umykać.",
      ctaLabel: "Rozpocznij",
      dismissLabel: "Później",
    }),
    push_inactivity_14d: ({ userName, aiName }) => ({
      title: `${aiName}: co słychać na budowie?`,
      body: "Dawno nie widziałem nowych postępów. Uzupełnij zdjęcia, wydatki lub dziennik, zanim szczegóły umkną.",
      targetScreen: "dashboard",
      modalTitle: `${aiName}: co słychać na budowie?`,
      modalMessage:
        `Cześć, ${userName}! Co słychać na budowie? Dawno nie widziałem nowych postępów. Dodaj zdjęcia, wydatki albo wpis w dzienniku, żebym mógł pomóc Ci utrzymać inwestycję pod kontrolą.`,
      ctaLabel: "Uzupełnij budowę",
      dismissLabel: "Później",
    }),
  },
  en: {
    push_onboarding_24h: ({ userName, aiName }) => ({
      title: `Hi, ${userName}! It's ${aiName}.`,
      body: "Your build is waiting. Add the first photo, expense, or document and keep everything under control from the start.",
      targetScreen: "photos",
      modalTitle: `Hi, ${userName}! It's ${aiName}.`,
      modalMessage:
        "Start by adding the first photo, expense, or document. The earlier you begin documenting the build, the easier it is to keep the whole investment organized.",
      ctaLabel: "Add first item",
      dismissLabel: "Later",
    }),
    push_onboarding_72h: ({ userName, aiName }) => ({
      title: `${aiName} reminds you`,
      body: "The later you start updating the build, the harder it gets to recreate expenses, photos, and decisions.",
      targetScreen: "photos",
      modalTitle: `${aiName} reminds you`,
      modalMessage:
        `Hi, ${userName}! Do not postpone documenting the build. Photos, expenses, and decisions quickly drift apart if you do not save them as they happen.`,
      ctaLabel: "Add now",
      dismissLabel: "Later",
    }),
    push_onboarding_7d: ({ userName, aiName }) => ({
      title: `Hi, ${userName}! It's ${aiName}.`,
      body: "I see you have not added anything to the build yet. Start today - it will be harder to recreate everything later.",
      targetScreen: "photos",
      modalTitle: `Hi, ${userName}! It's ${aiName}.`,
      modalMessage:
        "I see BuildIQ is not tracking your build yet. Add the first photo, expense, or document before important details start slipping away.",
      ctaLabel: "Start",
      dismissLabel: "Later",
    }),
    push_inactivity_14d: ({ userName, aiName }) => ({
      title: `${aiName}: how is the build going?`,
      body: "I have not seen new progress for a while. Add photos, expenses, or a journal entry before details slip away.",
      targetScreen: "dashboard",
      modalTitle: `${aiName}: how is the build going?`,
      modalMessage:
        `Hi, ${userName}! How is the build going? I have not seen new progress for a while. Add photos, expenses, or a journal entry so I can help you keep the investment under control.`,
      ctaLabel: "Update build",
      dismissLabel: "Later",
    }),
  },
  de: {
    push_onboarding_24h: ({ userName, aiName }) => ({
      title: `Hallo, ${userName}! Hier ist ${aiName}.`,
      body: "Dein Bauprojekt wartet. Füge das erste Foto, eine Ausgabe oder ein Dokument hinzu und behalte von Anfang an den Überblick.",
      targetScreen: "photos",
      modalTitle: `Hallo, ${userName}! Hier ist ${aiName}.`,
      modalMessage:
        "Beginne mit dem ersten Foto, einer Ausgabe oder einem Dokument. Je früher du dein Bauprojekt dokumentierst, desto leichter bleibt die ganze Investition geordnet.",
      ctaLabel: "Ersten Eintrag hinzufügen",
      dismissLabel: "Später",
    }),
    push_onboarding_72h: ({ userName, aiName }) => ({
      title: `${aiName} erinnert dich`,
      body: "Je später du mit dem Aktualisieren beginnst, desto schwerer lassen sich Ausgaben, Fotos und Absprachen rekonstruieren.",
      targetScreen: "photos",
      modalTitle: `${aiName} erinnert dich`,
      modalMessage:
        `Hallo, ${userName}! Verschiebe die Dokumentation nicht. Fotos, Ausgaben und Absprachen geraten schnell durcheinander, wenn du sie nicht laufend speicherst.`,
      ctaLabel: "Jetzt hinzufügen",
      dismissLabel: "Später",
    }),
    push_onboarding_7d: ({ userName, aiName }) => ({
      title: `Hallo, ${userName}! Hier ist ${aiName}.`,
      body: "Ich sehe, dass du noch nichts zum Bauprojekt hinzugefügt hast. Starte heute - später wird es schwieriger, alles nachzuvollziehen.",
      targetScreen: "photos",
      modalTitle: `Hallo, ${userName}! Hier ist ${aiName}.`,
      modalMessage:
        "Ich sehe, dass BuildIQ dein Bauprojekt noch nicht begleitet. Füge das erste Foto, eine Ausgabe oder ein Dokument hinzu, bevor wichtige Details verloren gehen.",
      ctaLabel: "Starten",
      dismissLabel: "Später",
    }),
    push_inactivity_14d: ({ userName, aiName }) => ({
      title: `${aiName}: was gibt es Neues am Bau?`,
      body: "Ich habe länger keine neuen Fortschritte gesehen. Ergänze Fotos, Ausgaben oder einen Tagebucheintrag, bevor Details verloren gehen.",
      targetScreen: "dashboard",
      modalTitle: `${aiName}: was gibt es Neues am Bau?`,
      modalMessage:
        `Hallo, ${userName}! Was gibt es Neues am Bau? Ich habe länger keine neuen Fortschritte gesehen. Füge Fotos, Ausgaben oder einen Tagebucheintrag hinzu, damit ich dir helfen kann, die Investition im Griff zu behalten.`,
      ctaLabel: "Bau aktualisieren",
      dismissLabel: "Später",
    }),
  },
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeLanguage(value: string | null | undefined): "pl" | "en" | "de" {
  const base = String(value ?? "").split("-")[0]?.toLowerCase();
  return base === "pl" || base === "de" || base === "en" ? base : "en";
}

function cleanName(value: string | null | undefined, fallback: string) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return fallback;
  return cleaned.length > 32 ? `${cleaned.slice(0, 31)}…` : cleaned;
}

function getLocalHour(timezone: string | null | undefined, now = new Date()): number | null {
  if (!timezone) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? NaN);
    return Number.isFinite(hour) ? hour : null;
  } catch {
    return null;
  }
}

function isMorningCandidate(candidate: Candidate) {
  const hour = getLocalHour(candidate.timezone);
  if (hour === null) return true;
  return hour >= 6 && hour <= 11;
}

function buildPayload(candidate: Candidate, eventId: string) {
  const language = normalizeLanguage(candidate.app_language);
  const userName = cleanName(candidate.user_name, language === "pl" ? "użytkowniku" : language === "de" ? "du" : "there");
  const aiName = cleanName(candidate.ai_name, language === "pl" ? "Kierownik AI" : language === "de" ? "KI-Bauleiter" : "AI Manager");
  const content = translations[language][candidate.push_type]({ userName, aiName });

  return {
    to: candidate.expo_push_token,
    sound: "default",
    title: content.title,
    body: content.body,
    channelId: "ai",
    priority: "high",
    data: {
      eventId,
      type: candidate.push_type,
      targetScreen: content.targetScreen,
      modalTitle: content.modalTitle,
      modalMessage: content.modalMessage,
      ctaLabel: content.ctaLabel,
      dismissLabel: content.dismissLabel,
      aiName,
      userName,
    },
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function groupCandidates(candidates: Candidate[]) {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.user_id}:${candidate.investment_id}:${candidate.push_type}`;
    const current = groups.get(key) ?? [];
    current.push(candidate);
    groups.set(key, current);
  }
  return Array.from(groups.values());
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

  const expected = `Bearer ${CRON_SECRET}`;
  if (req.headers.get("Authorization") !== expected) {
    return json(401, { error: "unauthorized" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { respectLocalMorning = true } = await req.json().catch(() => ({}));

  const { data, error } = await supabase.rpc("get_due_push_lifecycle_candidates", {
    p_now: new Date().toISOString(),
    p_respect_local_morning: false,
  });

  if (error) return json(500, { error: error.message });

  const candidates = ((data ?? []) as Candidate[]).filter((candidate) =>
    respectLocalMorning === false ? true : isMorningCandidate(candidate)
  );

  const claimed: Array<{ candidate: Candidate; eventId: string; message: ExpoPushMessage }> = [];

  for (const group of groupCandidates(candidates)) {
    const candidate = group[0];
    if (!candidate) continue;

    const { data: eventId, error: claimError } = await supabase.rpc("claim_push_lifecycle_event", {
      p_user_id: candidate.user_id,
      p_investment_id: candidate.investment_id,
      p_type: candidate.push_type,
    });

    if (claimError || typeof eventId !== "string" || !eventId) continue;

    for (const deviceCandidate of group) {
      claimed.push({
        candidate: deviceCandidate,
        eventId,
        message: buildPayload(deviceCandidate, eventId),
      });
    }
  }

  let sent = 0;
  let failed = 0;
  const invalidTokens = new Set<string>();
  const eventResults = new Map<string, { okTicketIds: string[]; errors: string[] }>();

  for (const item of claimed) {
    eventResults.set(item.eventId, { okTicketIds: [], errors: [] });
  }

  for (const batch of chunk(claimed, 100)) {
    const messages = batch.map((item) => item.message);

    let response: Response;
    try {
      response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "expo_fetch_failed";
      failed += batch.length;
      for (const item of batch) {
        eventResults.get(item.eventId)?.errors.push(message);
      }
      continue;
    }

    const result = await response.json().catch(() => null) as
      | { data?: ExpoTicket[]; errors?: Array<{ message?: string }> }
      | null;

    if (!response.ok || !Array.isArray(result?.data)) {
      const message = result?.errors?.map((item) => item.message).filter(Boolean).join("; ")
        || `expo_http_${response.status}`;
      failed += batch.length;
      for (const item of batch) {
        eventResults.get(item.eventId)?.errors.push(message);
      }
      continue;
    }

    result.data.forEach((ticket, index) => {
      const item = batch[index];
      if (!item) return;
      const eventResult = eventResults.get(item.eventId);

      if (ticket.status === "ok") {
        sent += 1;
        if (ticket.id) eventResult?.okTicketIds.push(ticket.id);
        return;
      }

      failed += 1;
      const token = item.message.to;
      const detail = ticket.details?.error || ticket.message || "expo_ticket_error";
      eventResult?.errors.push(detail);
      if (token && ticket.details?.error === "DeviceNotRegistered") {
        invalidTokens.add(String(token));
      }
    });
  }

  for (const token of invalidTokens) {
    await supabase
      .from("push_devices")
      .update({ disabled_at: new Date().toISOString() })
      .eq("expo_push_token", token);
  }

  let markedSent = 0;
  let markedFailed = 0;
  for (const [eventId, result] of eventResults.entries()) {
    if (result.okTicketIds.length > 0) {
      const { error: markError } = await supabase.rpc("mark_push_lifecycle_event_sent", {
        p_event_id: eventId,
        p_ticket_ids: result.okTicketIds,
      });
      if (!markError) markedSent += 1;
      continue;
    }

    const { error: markError } = await supabase.rpc("mark_push_lifecycle_event_failed", {
      p_event_id: eventId,
      p_error_message: result.errors.join("; ") || "all expo tickets failed",
    });
    if (!markError) markedFailed += 1;
  }

  return json(200, {
    candidates: candidates.length,
    claimed: claimed.length,
    events: eventResults.size,
    sent,
    failed,
    markedSent,
    markedFailed,
    disabledTokens: invalidTokens.size,
  });
});
