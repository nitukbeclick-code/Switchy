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
import type { RealtimeChannel, RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { getBrowserSupabase } from "./supabase-browser";

/**
 * A coalesced burst of crm_events INSERTs handed to the callback. `conversationIds`
 * is the set of `conversation_id`s seen across the burst (rows with a null
 * conversation_id — e.g. a contact-status change — are omitted). A caller can
 * check membership to tell whether the burst actually touched a specific OPEN
 * conversation, WITHOUT re-fetching that thread to find out — crm-api's getThread
 * writes a `crm_thread_view` audit row on every call, so an unconditional reload
 * on every background event (the bot answering other customers) would flood the
 * audit log. See CrmInbox for the gate.
 */
export interface CrmEventBatch {
  conversationIds: Set<string>;
}

/**
 * Call `onEvent` (debounced ~400ms) whenever a crm_events row is inserted, passing
 * the coalesced burst's touched conversation ids. `enabled` gates the subscription
 * (e.g. only the active tab subscribes). Callers that don't care about the payload
 * can ignore the argument.
 */
export function useCrmEvents(onEvent: (batch: CrmEventBatch) => void, enabled = true): void {
  // Latest-ref: keep the debounced subscription callback pointed at the newest
  // `onEvent` closure without re-subscribing. Updated in an effect (not during
  // render) — the ref is only ever read later, from the async realtime handler.
  const cb = useRef(onEvent);
  useEffect(() => {
    cb.current = onEvent;
  });

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let channel: RealtimeChannel | null = null;
    // conversation ids accumulated across the current coalescing window, so the
    // single debounced refresh knows every conversation the burst touched.
    let convIds = new Set<string>();
    const sb = getBrowserSupabase();

    try {
      channel = sb
        .channel("crm-events-web")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "crm_events" },
          (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => {
            const cid = payload.new?.conversation_id;
            if (typeof cid === "string" && cid) convIds.add(cid);
            // Coalesce a burst (one action can append several rows) into one refresh.
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
              const batch: CrmEventBatch = { conversationIds: convIds };
              convIds = new Set(); // reset the window for the next burst
              cb.current(batch);
            }, 400);
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
