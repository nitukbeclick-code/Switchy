"use client";

// ────────────────────────────────────────────────────────────────────────────
// /auth/callback — the OAuth (Google/Facebook) landing page.
//
// The browser Supabase client is created with detectSessionInUrl + PKCE, so when
// the provider redirects back here with `?code=…`, the client exchanges it for a
// session automatically on init (the PKCE verifier lives in this browser's storage,
// so the exchange MUST happen client-side — a server route can't do it). We poll
// getSession until it lands, then bounce to the page the user started from
// (sessionStorage `swc:return`, default /community).
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase-browser";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = getBrowserSupabase();
    let tries = 0;
    let alive = true;

    const finish = () => {
      let back = "/community";
      try {
        const stored = sessionStorage.getItem("swc:return");
        sessionStorage.removeItem("swc:return");
        // Only honour a same-origin relative path: it must start with a single
        // "/" (not "//" or "/\", which browsers treat as protocol-relative and
        // would let a poisoned value redirect off-site). Defence-in-depth — the
        // value is only ever written as location.pathname+search today.
        if (stored && /^\/(?![/\\])/.test(stored)) back = stored;
      } catch {
        /* ignore */
      }
      router.replace(back);
    };

    const poll = async () => {
      if (!alive) return;
      const { data } = await sb.auth.getSession();
      if (data.session) {
        finish();
        return;
      }
      // Also surface a provider error passed back in the URL (e.g. access_denied).
      const params = new URLSearchParams(window.location.search);
      if (params.get("error")) {
        setError("ההתחברות בוטלה או נכשלה. אפשר לנסות שוב.");
        return;
      }
      if (++tries > 25) {
        setError("ההתחברות נמשכת זמן רב מהצפוי. נסו שוב.");
        return;
      }
      setTimeout(poll, 150);
    };
    void poll();

    return () => {
      alive = false;
    };
  }, [router]);

  return (
    <main
      id="main"
      className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
    >
      {error ? (
        <>
          <p className="text-lg font-semibold text-ink">{error}</p>
          <a
            href="/community"
            className="rounded-xl border border-accent/40 bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast"
          >
            חזרה לקהילה
          </a>
        </>
      ) : (
        <>
          <span
            aria-hidden="true"
            className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent"
          />
          <p className="text-muted">מתחברים…</p>
        </>
      )}
    </main>
  );
}
