"use client";

// ────────────────────────────────────────────────────────────────────────────
// <ReferralCard> — the share-the-tool referral surface. On demand it asks the
// server (/api/referral) to mint a REAL, persisted, attributable code
// (SW-XXXXXX), then renders the code + an invite link + copy/share controls so a
// user can invite a friend to a FREE comparison tool.
//
// TRUTH-ONLY / E-E-A-T (ABSOLUTE):
//   • The code is a real token minted + stored server-side (lib/referral +
//     /api/referral). Nothing here fabricates a code or a count.
//   • NO monetary reward — anywhere in this UI. The framing is strictly
//     share-the-tool ("עזרו לחבר לחסוך"): invite a friend to a free tool. We never
//     promise "get ₪X". Israeli Spam-Law §30A + consumer-protection + honesty bar.
//   • The invite is opt-in by nature: the USER chooses to share. We don't message
//     anyone. The link carries only the code (?ref=) for later attribution — no PII.
//
// Design: premium-2026 bento surface. Green = ACTION (the primary CTAs use the
// --accent token); the code chip is neutral ink. Dark-mode safe (every color is a
// CSS variable) + RTL (the app is wrapped in dir=rtl). a11y: a labeled <section>;
// the code is exposed via an accessible label; copy/share feedback is announced
// via aria-live; decorative marks are aria-hidden. Fails soft — a network error
// shows an honest retry, never a crash.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  isReferralCode,
  referralLink,
  referralShareText,
  type ReferralResponse,
} from "@/lib/referral";

type Status = "idle" | "loading" | "ready" | "error";

/** A short, non-PII per-visit token for conversation-only attribution. */
function newConversationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

export default function ReferralCard({ className }: { className?: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [code, setCode] = useState<string>("");
  const [feedback, setFeedback] = useState<string>("");
  // One stable conversation token per mounted card (attribution only, no PII).
  // Lazily minted on first use inside the issue callback — never read during
  // render (the React-Compiler refs rule forbids reading ref.current in render).
  const convId = useRef<string | null>(null);

  const link = code ? referralLink(code) : "";
  const shareText = code ? referralShareText(code) : "";

  /** Ask the server to mint a real, persisted code. Fail-soft on any error. */
  const issue = useCallback(async () => {
    setStatus("loading");
    setFeedback("");
    // Lazily mint the per-card conversation token on first issue (no PII).
    if (convId.current == null) convId.current = newConversationId();
    try {
      const res = await fetch("/api/referral", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: convId.current }),
      });
      const data: Partial<ReferralResponse> | null = res.ok
        ? await res.json().catch(() => null)
        : null;
      // Only trust a well-formed SW-XXXXXX code; anything else is an error state.
      if (data?.ok && typeof data.code === "string" && isReferralCode(data.code)) {
        setCode(data.code);
        setStatus("ready");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }, []);

  /** Copy a string and announce it (aria-live). Honest fallback if blocked. */
  const copy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback(`${label} הועתק ללוח`);
    } catch {
      setFeedback("ההעתקה נחסמה — אפשר לסמן ולהעתיק ידנית");
    }
  }, []);

  /** Native share sheet when available; otherwise copy the message. */
  const share = useCallback(async () => {
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title: "חוסך — השוואת תקשורת", text: shareText, url: link });
        setFeedback("ההזמנה נשלחה");
        return;
      } catch {
        // User dismissed the sheet or share failed — fall through to copy.
      }
    }
    await copy(shareText, "ההזמנה");
  }, [copy, link, shareText]);

  const wrap = ["bento p-6 sm:p-7", className ?? ""].join(" ").trim();

  return (
    <section aria-labelledby="referral-card-h" className={wrap}>
      <h2
        id="referral-card-h"
        className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl"
      >
        הזמינו חבר לחסוך
      </h2>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-foreground sm:text-base">
        חוסך הוא כלי חינמי להשוואת מסלולי תקשורת בישראל. שתפו את הקוד או הקישור עם
        חברים — וכשהם יבדקו את החשבון שלהם, הם יוכלו לחסוך בדיוק כמוכם. בלי עלות,
        בלי התחייבות.
      </p>

      {/* Honesty line: this is sharing a tool, NOT a paid reward program. */}
      <p className="mt-2 text-xs leading-relaxed text-muted">
        זו הזמנה לשתף כלי שעוזר לחסוך — לא תוכנית תגמול כספי. אנחנו לא מבטיחים תשלום
        על שיתוף.
      </p>

      {/* ── Action area ───────────────────────────────────────────────────── */}
      <div className="mt-5">
        {status !== "ready" ? (
          <button
            type="button"
            onClick={issue}
            disabled={status === "loading"}
            className="interactive inline-flex items-center justify-center rounded-xl bg-accent px-5 py-3 font-semibold text-accent-contrast shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
            aria-busy={status === "loading"}
          >
            {status === "loading" ? "יוצרים קוד…" : "קבלו קוד הזמנה אישי"}
          </button>
        ) : (
          <div>
            {/* The real, minted code — read out for screen readers. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
                aria-label={`קוד ההזמנה שלכם: ${code}`}
              >
                <code dir="ltr" className="font-display text-lg font-bold tracking-wide text-ink">
                  {code}
                </code>
                <button
                  type="button"
                  onClick={() => copy(code, "הקוד")}
                  className="interactive rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  העתקת הקוד
                </button>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={share}
                  className="interactive inline-flex items-center justify-center rounded-xl bg-accent px-5 py-3 font-semibold text-accent-contrast shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  שיתוף ההזמנה
                </button>
                <button
                  type="button"
                  onClick={() => copy(link, "הקישור")}
                  className="interactive inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 font-semibold text-foreground transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  העתקת הקישור
                </button>
              </div>
            </div>

            {/* The full shareable link, visible + selectable (dir=ltr for the URL). */}
            <p className="mt-3 break-all text-xs text-muted" dir="ltr">
              {link}
            </p>
          </div>
        )}
      </div>

      {/* Error state — honest, retryable, never a crash. */}
      {status === "error" ? (
        <p className="mt-4 text-sm text-foreground">
          לא הצלחנו ליצור קוד כרגע.{" "}
          <button
            type="button"
            onClick={issue}
            className="interactive font-medium text-accent-text underline hover:text-accent-hover"
          >
            נסו שוב
          </button>
        </p>
      ) : null}

      {/* Copy/share feedback — announced politely for screen readers. */}
      <p className="mt-3 min-h-[1.25rem] text-sm text-accent-text" aria-live="polite">
        {feedback}
      </p>

      {/* What happens when a friend joins — honest, attribution-only. */}
      <p className="mt-5 border-t border-border/40 pt-4 text-xs leading-relaxed text-muted">
        כשחבר נכנס דרך הקישור שלכם ומשאיר פרטים, הפנייה משויכת לקוד שלכם — כך נוכל
        לדעת שהבאתם אותו. השארת פרטים תמיד דורשת את אישורו של החבר.{" "}
        <Link
          href="/transparency"
          className="interactive font-medium text-accent-text underline hover:text-accent-hover"
        >
          איך זה עובד?
        </Link>
      </p>
    </section>
  );
}
