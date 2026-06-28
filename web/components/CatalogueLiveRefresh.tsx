"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CatalogueLiveRefresh> — REALTIME freshness ON TOP of the server-rendered ISR
// catalogue. Mounted on the crawlable catalogue surfaces (compare / category /
// plan-detail). It subscribes to Postgres changes on public.plans via Supabase
// Realtime and, when the owner edits a plan in the dashboard, debounces (~1.5s)
// then calls router.refresh() to re-pull the SAME server-rendered page with the
// fresh DB prices/perks/fine-print. While that refresh is in flight it surfaces a
// subtle, honest "מתעדכן…" pill so the user knows data is freshening.
//
// SEO-SAFE: this is a pure progressive enhancement. The server HTML already
// carries the real prices + JSON-LD (the page is ISR/server-rendered from the DB
// with a bundled fallback). Crawlers get the full answer without any client fetch;
// this component only FRESHENS an already-complete page for live users.
//
// FAIL-SOFT by construction: no env / no Realtime / a channel error all degrade
// to "do nothing" — no thrown errors, no console spam, no UI. A SINGLE channel is
// opened and it is always torn down on unmount. Nothing here ever blocks render.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

/** Debounce window before a router.refresh — coalesces bursts of owner edits. */
const REFRESH_DEBOUNCE_MS = 1_500;
/** How long to keep the "מתעדכן…" indicator up so the freshen is perceptible. */
const INDICATOR_MIN_MS = 1_200;

export interface CatalogueLiveRefreshProps {
  /**
   * Optional category to scope the subscription's server-side filter to (e.g.
   * "cellular"). Omit on multi-category surfaces (plan-detail, /compare hubs) to
   * listen to the whole table. Purely a narrowing optimisation — correctness does
   * not depend on it.
   */
  category?: string;
}

export default function CatalogueLiveRefresh({
  category,
}: CatalogueLiveRefreshProps) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  // Timers + indicator floor live in refs so re-renders never reset them.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indicatorRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    // Fail-soft: no public config → realtime is simply off (SSR HTML still fresh).
    if (!url || !anonKey) return;

    let channel: RealtimeChannel | null = null;
    let disposed = false;

    const clearTimers = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (indicatorRef.current) {
        clearTimeout(indicatorRef.current);
        indicatorRef.current = null;
      }
    };

    // Debounced freshen: on a burst of plan changes, refresh once after the window.
    const scheduleRefresh = () => {
      if (disposed) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        if (disposed) return;
        setRefreshing(true);
        // Re-pull the server-rendered ISR page (fresh DB prices); React reconciles.
        router.refresh();
        if (indicatorRef.current) clearTimeout(indicatorRef.current);
        indicatorRef.current = setTimeout(() => {
          indicatorRef.current = null;
          if (!disposed) setRefreshing(false);
        }, INDICATOR_MIN_MS);
      }, REFRESH_DEBOUNCE_MS);
    };

    try {
      const supabase = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 2 } },
      });

      channel = supabase
        .channel("public:plans:catalogue-live", {
          config: { broadcast: { ack: false } },
        })
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "plans",
            ...(category ? { filter: `category=eq.${category}` } : {}),
          },
          () => scheduleRefresh(),
        )
        // Subscribe; swallow any non-subscribed status silently (fail-soft).
        .subscribe(() => {
          /* no-op: errors degrade to "no realtime", never surfaced */
        });
    } catch {
      // Any unexpected client/channel construction failure → realtime simply off.
      channel = null;
    }

    return () => {
      disposed = true;
      clearTimers();
      // Always tear the single channel down on unmount.
      if (channel) {
        try {
          channel.unsubscribe();
        } catch {
          /* ignore */
        }
      }
    };
    // category is a stable per-surface string; router is stable across renders.
  }, [router, category]);

  // The only DOM this renders: a subtle, aria-live "מתעדכן…" pill while a freshen
  // is in flight. Hidden entirely otherwise — the server HTML stands on its own.
  if (!refreshing) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-catalogue-refreshing
      className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2"
    >
      <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/95 px-3 py-1.5 text-xs font-medium text-muted shadow-sm backdrop-blur">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent"
        />
        מתעדכן…
      </span>
    </div>
  );
}

export { CatalogueLiveRefresh };
