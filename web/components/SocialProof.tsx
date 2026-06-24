"use client";

// ────────────────────────────────────────────────────────────────────────────
// <SocialProof> — an HONEST aggregate social-proof block. It surfaces the REAL
// aggregate of recorded savings (public.leads.actual_saving via
// /api/wallet-stats → get_savings_stats) ONLY when a genuine publish threshold is
// cleared. Below the threshold — or when the fetch fails, or no service-role key
// is configured — it renders NOTHING by default (or a neutral, claim-free
// fallback when `fallback="neutral"`).
//
// E-E-A-T / HONESTY (ABSOLUTE): there are NO fabricated user counts, NO invented
// "X users saved ₪Y". Every figure shown is a real aggregate surfaced by the
// server (lib/wallet-stats owns the threshold + shaping, so this component can't
// drift). The savings are framed as "מבוסס דיווח" — based on what reps recorded,
// never a guaranteed promise. The component never blocks paint and never throws.
//
// Design: premium-2026 bento surface. Amber = VALUE per the brand system (saving
// figures use the AA text-grade amber token --value-text); green = ACTION for the
// CTA. Dark-mode safe (all colors are CSS variables) + RTL (the app is wrapped in
// dir=rtl). a11y: a labeled <section>; decorative marks are aria-hidden; the
// headline carries the full meaning in text.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ilsStat,
  socialProofHeadline,
  type SavingsSummary,
} from "@/lib/wallet-stats";

export interface SocialProofProps {
  /**
   * Optional pre-fetched summary (e.g. from a server component that already read
   * /api/wallet-stats). When provided, the component renders it directly and does
   * NOT fetch. Pass an UNPUBLISHED summary to mean "known: nothing to show".
   */
  summary?: SavingsSummary;
  /**
   * What to render when there is nothing real to publish:
   *   • "none"    (default) → render NOTHING (no DOM at all).
   *   • "neutral"           → a claim-free trust line (no fabricated numbers).
   */
  fallback?: "none" | "neutral";
  /** Optional extra classes on the wrapper. */
  className?: string;
}

/** A single real, aggregate stat (figure + Hebrew label). */
function Stat({ figure, label }: { figure: string; label: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="font-display text-2xl font-bold tracking-tight text-value-text sm:text-3xl">
        {figure}
      </span>
      <span className="mt-0.5 text-xs leading-snug text-muted sm:text-sm">
        {label}
      </span>
    </div>
  );
}

/**
 * The neutral, claim-free fallback. Renders ONLY when `fallback="neutral"` and
 * there is no real aggregate to publish. It states verifiable facts (free,
 * consent-gated) and links to /transparency — NO fabricated numbers.
 */
function NeutralFallback({ className }: { className?: string }) {
  return (
    <section
      aria-label="על השירות"
      className={[
        "bento p-5 text-sm text-foreground sm:p-6",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <p className="leading-relaxed">
        אנחנו אוספים חיסכון אמיתי שדווח על ידי הנציגים שלנו. ברגע שיצטברו מספיק
        דיווחים מאומתים, נציג כאן את החיסכון הטיפוסי — ללא מספרים מומצאים.
      </p>
      <Link
        href="/transparency"
        className="interactive mt-3 inline-block font-medium text-accent-text underline hover:text-accent-hover"
      >
        איך אנחנו מודדים חיסכון? ←
      </Link>
    </section>
  );
}

export default function SocialProof({
  summary: summaryProp,
  fallback = "none",
  className,
}: SocialProofProps) {
  // When the caller already resolved the summary, trust it and skip the network.
  const provided = summaryProp !== undefined;

  const [summary, setSummary] = useState<SavingsSummary | null>(
    provided ? summaryProp! : null,
  );
  const reqRef = useRef(false);

  useEffect(() => {
    if (provided || reqRef.current) return;
    reqRef.current = true;
    const controller = new AbortController();
    fetch("/api/wallet-stats", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const s = data?.summary as SavingsSummary | undefined;
        // Only trust a well-formed, explicitly-published summary; anything else
        // collapses to "nothing to show".
        if (s && typeof s.published === "boolean") setSummary(s);
        else setSummary(null);
      })
      .catch(() => {
        // Fail-soft: nothing to show. The block is never load-bearing.
        setSummary(null);
      });
    return () => controller.abort();
  }, [provided]);

  const headline = summary ? socialProofHeadline(summary) : null;

  // Honesty gate: render nothing (or the neutral fallback) unless there is a real,
  // published aggregate with a genuine typical-saving figure.
  if (!summary || !summary.published || !headline) {
    return fallback === "neutral" ? <NeutralFallback className={className} /> : null;
  }

  const membersTxt = summary.members.toLocaleString("he-IL");

  return (
    <section
      aria-label="חיסכון אמיתי שדווח"
      className={[
        "bento p-6 sm:p-7",
        className ?? "",
      ]
        .join(" ")
        .trim()}
      data-social-proof
    >
      {/* Honest headline — every figure is a real aggregate, framed as based-on-report. */}
      <p className="font-display text-lg font-semibold leading-relaxed tracking-tight text-ink sm:text-xl">
        {headline}
      </p>

      {/* Real aggregate figures — members + typical + total recorded saving. */}
      <div className="mt-5 grid grid-cols-3 gap-4">
        <Stat figure={membersTxt} label="משקי בית שחסכו" />
        <Stat figure={ilsStat(summary.typicalSaving)} label="חיסכון שנתי טיפוסי" />
        <Stat figure={ilsStat(summary.totalSaving)} label="סך החיסכון שדווח" />
      </div>

      {/* Honesty caveat: based-on-report, not a promise. Plus a link to the method. */}
      <p className="mt-5 text-xs leading-relaxed text-muted">
        הנתונים הם אגרגציה של חיסכון שנתי שדיווחו הנציגים שלנו לאחר מעבר בפועל —
        חיסכון אישי משתנה ואינו מובטח.{" "}
        <Link
          href="/transparency"
          className="interactive font-medium text-accent-text underline hover:text-accent-hover"
        >
          איך אנחנו מודדים?
        </Link>
      </p>
    </section>
  );
}
