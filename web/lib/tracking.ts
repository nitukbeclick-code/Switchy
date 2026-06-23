// ────────────────────────────────────────────────────────────────────────────
// Client-side conversion tracking. Call fireLeadConversion() ONLY on a confirmed
// lead-submit SUCCESS — never on page view or form open. No-ops safely on the
// server, when gtag/fbq are absent, or when the Meta pixel id is unset.
// ────────────────────────────────────────────────────────────────────────────

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
}
