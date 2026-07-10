"use client";

// ────────────────────────────────────────────────────────────────────────────
// useCrmEvents — a fail-soft Realtime hook for the CRM console. Subscribes to
// INSERTs on public.crm_events (rep replies, takeovers, hand-backs, inbound /
// outbound messages, agent tool runs) and invokes `onEvent` — coalesced — so a
// console view refreshes the moment the feed moves, instead of only on manual
// reload. crm_events is admin-SELECT via RLS and lives in the supabase_realtime
// publication (supabase/crm-takeover-2026-06.sql), so an admin's authenticated
// browser client receives the stream. Mirrors the Flutter crmEventStream() and
// the community-feed channel pattern.
//
// Fail-soft by contract: if the channel can't establish (no session, realtime
// off), nothing throws — the caller's manual / heartbeat refresh still works.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserSupabase } from "./supabase-browser";

/**
 * Call `onEvent` (debounced ~400ms) whenever a crm_events row is inserted.
 * `enabled` gates the subscription (e.g. only the active tab subscribes).
 */
export function useCrmEvents(onEvent: () => void, enabled = true): void {
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let channel: RealtimeChannel | null = null;
    const sb = getBrowserSupabase();

    try {
      channel = sb
        .channel("crm-events-web")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "crm_events" },
          () => {
            // Coalesce a burst (one action can append several rows) into one refresh.
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => cb.current(), 400);
          },
        )
        .subscribe();
    } catch {
      // Realtime unavailable → silently rely on the caller's manual refresh.
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (channel) void sb.removeChannel(channel);
    };
  }, [enabled]);
}
