"use client";

// ────────────────────────────────────────────────────────────────────────────
// Session-persisting Supabase browser client — the AUTH client for the community.
//
// This is DISTINCT from the anon read client in lib/live-catalogue.ts (which sets
// persistSession:false because it only reads public catalogue rows during SSR/ISR).
// This one keeps the logged-in session in localStorage, auto-refreshes the JWT, and
// detects the OAuth `code` in the callback URL (PKCE). Every community WRITE goes
// through it so RLS sees the user's JWT (auth.uid() = user_id); the anon key alone
// can only read public rows — it can never post/edit/delete as someone.
//
// Singleton: created lazily on first call (always from a client component / event
// handler, never during SSR) so there is exactly one auth+realtime connection.
// ────────────────────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True when the public Supabase env is present (otherwise auth is a no-op). */
export const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && ANON_KEY);

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (client) return client;
  client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
  return client;
}
