// ────────────────────────────────────────────────────────────────────────────
// Meeting providers — which carriers may be booked for a Zoom consultation.
//
// SINGLE SOURCE OF TRUTH: public.provider_capabilities(provider, supports_zoom_meeting).
// The owner edits ONE place (the Supabase dashboard) and every surface — the
// Flutter app, this Next mobile-web /book page, and the static site — stays in
// sync. `getMeetingProviders()` reads the CURRENT supported list LIVE from
// Supabase (anon key, server-side) at render / ISR-revalidate time.
//
// RESILIENT FALLBACK: the read NEVER throws. On ANY failure (env unset, network,
// RLS, timeout, zero rows) it returns the bundled {@link MEETING_PROVIDERS} const
// — the same 10 Zoom-supported providers seeded in
// supabase/provider-capabilities-2026-06.sql. So the gate keeps working offline,
// before the migration is applied, or if the fetch fails. The const list and the
// DB seed MUST agree on these 10 (Hebrew-first, EXACT catalogue ids).
//
// SECURITY: reads use the PUBLIC anon (publishable) key only — the capability
// list is not secret (public read RLS policy + anon SELECT grant). No service
// key, no secret, ever touches this path. Mirrors lib/live-catalogue.ts.
//
// HONESTY: an UNsupported provider must NOT be offered a Zoom booking. The /book
// dropdown only ever lists what this module returns, so the booking guard
// (meetings_guard / provider_capabilities) can never be silently out of sync with
// the UI.
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

/**
 * The 10 Zoom-supported providers (EXACT catalogue ids, Hebrew-first). MUST stay
 * in sync with the seed in supabase/provider-capabilities-2026-06.sql
 * (supports_zoom_meeting = true). Used as the resilient fallback when the live
 * read is unavailable. EVERY other provider (019 מובייל, Xphone, רמי לוי, וואלה
 * מובייל, גילת, CCC, WeCom, Airalo eSIM, electricity, …) is NOT supported.
 */
export const MEETING_PROVIDERS = [
  "פרטנר",
  "yes",
  "STING TV",
  "HOT",
  "NextTV",
  "סלקום",
  "גולן טלקום",
  "בזק",
  "פלאפון",
  "הוט מובייל",
] as const;

export type MeetingProvider = (typeof MEETING_PROVIDERS)[number];

/** Public project URL (safe to expose). Falls back to the known project ref. */
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://orzitfqmlvopujsoyigr.supabase.co";

/** Public anon / publishable key — RLS-gated, safe in any context. */
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Hard cap on how long we wait for the live read before falling back. */
const READ_TIMEOUT_MS = 4_000;

/** The const fallback as a fresh, mutable string[] (UI passes it as a prop). */
function fallbackProviders(): string[] {
  return [...MEETING_PROVIDERS];
}

/**
 * Read the CURRENT list of Zoom-supported providers, live from Supabase when
 * possible. Server-side only (uses the anon key without a session). NEVER throws.
 *
 * - On success: the `provider` ids from public.provider_capabilities where
 *   `supports_zoom_meeting = true` (deduped, non-empty).
 * - On ANY failure (env unset, network, RLS, timeout, zero rows): the bundled
 *   {@link MEETING_PROVIDERS} const (the same 10), so the gate stays honest and
 *   functional even before the migration is applied.
 *
 * Call this ONCE in the /book server component and pass the result into
 * <BookClient supportedProviders={...} />. Pair with the page's ISR `revalidate`
 * so the static HTML picks up owner edits on a schedule.
 */
export async function getMeetingProviders(): Promise<string[]> {
  // No key → use the resilient bundled const (mirrors lib/live-catalogue.ts).
  if (!ANON_KEY) return fallbackProviders();

  try {
    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        // Bypass Next's fetch cache so each ISR regeneration reads fresh DB
        // state; the page's `export const revalidate` governs regeneration.
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: "no-store",
            signal: AbortSignal.timeout(READ_TIMEOUT_MS),
          }),
      },
    });

    const { data, error } = await supabase
      .from("provider_capabilities")
      .select("provider")
      .eq("supports_zoom_meeting", true);

    if (error || !Array.isArray(data) || data.length === 0) {
      return fallbackProviders();
    }

    // Keep only real, non-empty provider ids; dedupe while preserving order.
    const seen = new Set<string>();
    const providers: string[] = [];
    for (const row of data as { provider?: unknown }[]) {
      const p = typeof row?.provider === "string" ? row.provider.trim() : "";
      if (p && !seen.has(p)) {
        seen.add(p);
        providers.push(p);
      }
    }

    // Zero usable rows after cleaning → fall back rather than render an empty
    // dropdown (which would offer NO provider at all).
    return providers.length ? providers : fallbackProviders();
  } catch {
    // Any unexpected failure (timeout, abort, parse) → resilient const fallback.
    return fallbackProviders();
  }
}
