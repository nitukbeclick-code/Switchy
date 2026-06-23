"use client"; // Error boundaries must be Client Components.

// ────────────────────────────────────────────────────────────────────────────
// app/global-error.tsx — the last-resort error boundary.
//
// Catches errors thrown in the ROOT layout/template (app/layout.tsx) — the only
// thing app/error.tsx can't catch. When active, this file REPLACES the entire
// root layout, so it must render its own <html> and <body> and pull in whatever
// it needs (global styles for the design tokens; the no-flash theme guard, since
// the layout's guard is gone). The SiteHeader/SiteFooter are NOT available here.
//
// Because metadata exports aren't supported in global-error, the document title
// is set via React's <title> element.
//
// Honest copy mirrors app/error.tsx (technical problem, likely worth a retry, no
// false "it's fixed" promise). Recovery: prefer `unstable_retry()` (Next 16.2),
// fall back to `reset()`, and offer a hard reload to the homepage as a last
// resort since the whole shell is broken.
//
// RTL/Hebrew + dark-mode aware via the inline theme guard + globals.css tokens.
// Inline styles back up the token classes in case a CSS-load failure is what
// broke the layout — the page must stay legible even then.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const recover = () => (unstable_retry ? unstable_retry() : reset());

  return (
    <html lang="he" dir="rtl" data-theme="light" suppressHydrationWarning>
      <head>
        <title>משהו השתבש — חוסך / Switch AI</title>
        <meta name="color-scheme" content="light dark" />
        {/* No-flash theme guard — the root layout's guard is gone when this file
            is active, so replay it here to avoid a light/dark flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('chosech-theme');document.documentElement.setAttribute('data-theme',(t==='light'||t==='dark')?t:(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));}catch(e){}`,
          }}
        />
      </head>
      <body
        className="min-h-full antialiased"
        // Inline fallbacks: if a CSS-load failure is what broke the layout, the
        // token classes won't resolve — keep the page legible regardless.
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--background, #f5f7f8)",
          color: "var(--foreground, #0b0f14)",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <main
          id="main"
          style={{
            width: "100%",
            maxWidth: "36rem",
            padding: "4rem 1.5rem",
            textAlign: "center",
          }}
        >
          <h1
            tabIndex={-1}
            style={{
              margin: 0,
              fontSize: "1.75rem",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--ink, #111827)",
              outline: "none",
            }}
          >
            משהו השתבש
          </h1>

          <p
            style={{
              margin: "1rem auto 0",
              maxWidth: "32rem",
              fontSize: "1.125rem",
              lineHeight: 1.6,
            }}
          >
            נתקלנו בתקלה טכנית בטעינת האתר. לרוב מדובר בבעיה זמנית — שווה לנסות שוב.
          </p>

          <div
            style={{
              marginTop: "2rem",
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={recover}
              style={{
                cursor: "pointer",
                borderRadius: "0.75rem",
                border: "none",
                padding: "0.75rem 1.5rem",
                fontSize: "1rem",
                fontWeight: 600,
                background: "var(--accent, #16a34a)",
                color: "var(--accent-contrast, #ffffff)",
              }}
            >
              נסו שוב
            </button>
            {/* Hard navigation home — the SPA shell is broken, so a plain <a>
                that triggers a full reload is the reliable escape hatch. A
                next/link soft navigation could re-enter the crashed tree, so the
                no-html-link-for-pages rule is intentionally disabled here. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "0.75rem",
                border: "1px solid var(--border, #e5e7eb)",
                padding: "0.75rem 1.5rem",
                fontSize: "1rem",
                fontWeight: 600,
                textDecoration: "none",
                color: "var(--ink, #111827)",
              }}
            >
              חזרה לדף הבית
            </a>
          </div>

          {error.digest ? (
            <p
              style={{
                marginTop: "2rem",
                fontSize: "0.875rem",
                color: "var(--muted, #5b616b)",
              }}
            >
              קוד שגיאה לפנייה לתמיכה:{" "}
              <code style={{ fontFamily: "monospace" }}>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
