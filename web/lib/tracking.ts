// ────────────────────────────────────────────────────────────────────────────
// Client-side conversion tracking. Call fireLeadConversion() ONLY on a confirmed
// lead-submit SUCCESS — never on page view or form open. No-ops safely on the
// server, when gtag/fbq are absent, or when the Meta pixel id is unset.
// ────────────────────────────────────────────────────────────────────────────

import { SUPABASE_URL } from "./supabase-public";

/** GA4 Measurement ID (matches the global GA4 script in the layout). */
export const GA4_MEASUREMENT_ID = "G-YCTGRVN7SJ";

/** Meta (Facebook) Pixel id — optional; tracking no-ops when unset. */
export const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID;

type GtagFn = (
  command: "event" | "config" | "js" | "set" | "consent",
  targetOrAction: string | Date,
  params?: Record<string, unknown>,
) => void;

type FbqFn = (
  command: "track" | "trackCustom" | "init",
  event: string,
  params?: Record<string, unknown>,
) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    fbq?: FbqFn;
    dataLayer?: unknown[];
  }
}

export type ProductFunnelEvent =
  | "leadStart"
  | "leadSubmit"
  | "quizComplete"
  | "compareView"
  | "shortlistCreate"
  | "shortlistShare"
  | "shortlistLeadClick"
  | "searchQuery"
  | "whatsappClick"
  | "savingsViewed";

const PRODUCT_EVENT_BY_SITE_EVENT: Readonly<Record<string, ProductFunnelEvent>> = {
  lead_form_start: "leadStart",
  quiz_results: "quizComplete",
  comparison_view: "compareView",
  compare_shortlist_create: "shortlistCreate",
  compare_shortlist_share: "shortlistShare",
  compare_shortlist_lead: "shortlistLeadClick",
  comparison_search: "searchQuery",
  bill_upload_result: "savingsViewed",
};

const ANALYTICS_ENDPOINT = `${SUPABASE_URL}/functions/v1/analytics-track`;
const CONSENT_KEY = "cookieConsent";
const JOURNEY_KEY = "switchy:analytics-journey";

function analyticsConsentGranted(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

function journeyId(): string {
  try {
    const existing = window.sessionStorage.getItem(JOURNEY_KEY);
    if (existing) return existing;
    const id = typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(JOURNEY_KEY, id);
    return id;
  } catch {
    return "session-unavailable";
  }
}

/** First-party, consent-gated product analytics. Scalar, non-PII props only. */
export function sendProductEvent(
  event: ProductFunnelEvent,
  props: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined" || !analyticsConsentGranted()) return;
  const safeProps: Record<string, string | number | boolean> = {
    surface: "web",
    journey_id: journeyId(),
  };
  for (const [key, value] of Object.entries(props)) {
    if (
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) safeProps[key] = value;
  }
  try {
    void fetch(ANALYTICS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, props: safeProps }),
      credentials: "omit",
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* best-effort only */
  }
}

/**
 * Fire the lead conversion to GA4 (gtag 'conversion') + Meta Pixel ('Lead').
 * Idempotent-safe and defensive: any missing dependency is silently skipped so a
 * tracking failure can never break the lead flow. Call on SUCCESS only.
 *
 * @param details optional extra params (e.g. { category, source, value }).
 */
export function fireLeadConversion(details?: {
  category?: string;
  source?: string;
  value?: number;
}): void {
  if (typeof window === "undefined") return;

  // GA4 — a generic conversion event tagged with the GA4 send target.
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", "conversion", {
        send_to: GA4_MEASUREMENT_ID,
        event_category: "lead",
        event_label: details?.source,
        lead_category: details?.category,
        value: details?.value,
        currency: "ILS",
      });
      // Also emit a plain "generate_lead" event for GA4's standard reporting.
      window.gtag("event", "generate_lead", {
        currency: "ILS",
        value: details?.value,
        lead_source: details?.source,
        lead_category: details?.category,
      });
    }
  } catch {
    /* tracking must never throw into the lead flow */
  }

  // Meta Pixel — standard 'Lead' event, only if a pixel id is configured.
  try {
    if (FB_PIXEL_ID && typeof window.fbq === "function") {
      window.fbq("track", "Lead", {
        content_category: details?.category,
        value: details?.value,
        currency: "ILS",
      });
    }
  } catch {
    /* no-op */
  }

  sendProductEvent("leadSubmit", {
    ...(details?.category ? { category: details.category } : {}),
    ...(details?.source ? { source: details.source } : {}),
  });
}

/**
 * Generic micro-funnel / engagement event. For NON-conversion signals only —
 * lead-form start/step, CTA clicks, outbound clicks — never the lead conversion
 * itself (use fireLeadConversion for that). Carries only category/source/step
 * labels; NEVER pass PII (name/phone/city). Mirrors fireLeadConversion's defensive
 * posture: no-ops on the server or when gtag/fbq are absent, and never throws into
 * the UX. Emits to GA4 (gtag 'event') and, when configured, Meta (fbq custom event).
 *
 * @param name   GA4 event name (snake_case), e.g. "lead_form_start".
 * @param params optional non-PII params, e.g. { source, step, location, label }.
 */
export function trackEvent(
  name: string,
  params?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params ?? {});
    }
  } catch {
    /* tracking must never throw into the UX */
  }
  try {
    if (FB_PIXEL_ID && typeof window.fbq === "function") {
      window.fbq("trackCustom", name, params);
    }
  } catch {
    /* no-op */
  }

  const productEvent = PRODUCT_EVENT_BY_SITE_EVENT[name];
  if (productEvent) sendProductEvent(productEvent, params);
  else if (name === "outbound_click" && params?.dest === "whatsapp") {
    sendProductEvent("whatsappClick", params);
  }
}
