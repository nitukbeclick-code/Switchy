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

// Public project URL + anon key. Both are safe to embed in the client bundle: the
// anon key is RLS-gated (it can only read public rows and can never act as a user
// without a real JWT). We fall back to the known project constants so the community
// works even when NEXT_PUBLIC_SUPABASE_* isn't wired into the build env — mirroring
// lib/live-catalogue.ts. WITHOUT this fallback getBrowserSupabase() was throwing
// "supabaseUrl is required" on /community and tripping the error boundary.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://orzitfqmlvopujsoyigr.supabase.co";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yeml0ZnFtbHZvcHVqc295aWdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5OTc5NzIsImV4cCI6MjA5NjU3Mzk3Mn0.NY4ZHzR3BAWUxm5as9Z054o8fwcfejAab9SIvduKlhM";

/** True when a usable Supabase URL + anon key are present (always true given the
 *  public fallbacks above; kept as the guard AuthProvider checks). */
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
