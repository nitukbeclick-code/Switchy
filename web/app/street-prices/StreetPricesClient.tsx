"use client";

// ────────────────────────────────────────────────────────────────────────────
// <StreetPricesClient> — the interactive part of /street-prices:
//   1. Fetches the threshold-gated aggregate from GET /api/street-price and renders
//      it via <StreetPriceChart> (which shows the honest empty state below the
//      report threshold and the mandatory provenance label).
//   2. Hosts the "דווח/י כמה את/ה משלם/ת" report form → POST /api/street-price →
//      the screening edge function. After a submit we OPTIMISTICALLY bump the local
//      count and re-fetch, so the user sees their contribution reflected honestly.
//
// E-E-A-T / HONESTY (ABSOLUTE):
//   • The chart renders ONLY what the server published — nothing is fabricated
//     client-side. A submitted report is screened server-side; it may be 'pending'
//     (held for review) and we say so plainly — we never claim it "counted" when it
//     didn't.
//   • The report is ANONYMOUS: only the category, provider, and the ₪ figure are
//     sent. No PII, no contact info (the form has none). The microcopy says so.
//
// Design: premium-2026 bento/card surfaces. Amber = VALUE (the price figures);
// green = ACTION (the submit CTA + onward links). Dark-mode safe (CSS-variable
// colors) + RTL. a11y: every control has a <label>; results/status announce via
// aria-live; the form is keyboard-complete.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { CATEGORY_HE } from "@/lib/categories";
import StreetPriceChart from "@/components/StreetPriceChart";
import {
  STREET_PRICE_CATEGORIES,
  type StreetPriceAggregate,
  type StreetPriceCategory,
  normalizeAggregate,
  validateSubmission,
} from "@/lib/street-price";

export interface StreetPricesClientProps {
  /** REAL catalogue provider display names (for the report form's datalist). */
  providers: string[];
  /**
   * Server-rendered initial aggregates (so the chart is in the SSR HTML — no CLS,
   * GEO-visible). The client re-fetches on mount + after a submit to stay fresh.
   */
  initialAggregates: StreetPriceAggregate[];
}

type SubmitStatus = "idle" | "sending" | "done" | "error";

/**
 * Fetch the published per-category aggregate from GET /api/street-price and
 * re-normalise it into the chart's contract. PURE (module-level, no hooks/state):
 * returns the aggregates on success, or `null` on any error so callers keep their
 * prior data (the chart is never load-bearing). Re-normalising defensively
 * guarantees the chart always receives a well-formed array.
 */
async function fetchAggregates(): Promise<StreetPriceAggregate[] | null> {
  try {
    const res = await fetch("/api/street-price", { method: "GET" });
    const data = (await res.json()) as { ok: boolean; categories?: unknown[] };
    if (!res.ok || !data.ok || !Array.isArray(data.categories)) return null;
    const byCat = new Map<string, unknown>();
    for (const row of data.categories) {
      const c =
        row && typeof row === "object"
          ? (row as { category?: unknown }).category
          : undefined;
      if (typeof c === "string") byCat.set(c, row);
    }
    return STREET_PRICE_CATEGORIES.map((c) =>
      normalizeAggregate(c, byCat.get(c) ?? null),
    );
  } catch {
    return null;
  }
}

export default function StreetPricesClient({
  providers,
  initialAggregates,
}: StreetPricesClientProps) {
  const baseId = useId();
  const catId = `${baseId}-cat`;
  const provId = `${baseId}-prov`;
  const priceId = `${baseId}-price`;
  const listId = `${baseId}-prov-list`;

  const [aggregates, setAggregates] =
    useState<StreetPriceAggregate[]>(initialAggregates);
  const [refreshFailed, setRefreshFailed] = useState(false);
  // Guards a single mount fetch (StrictMode double-invokes effects in dev).
  const fetchedRef = useRef(false);

  // Report form state.
  const [category, setCategory] = useState<StreetPriceCategory>("cellular");
  const [provider, setProvider] = useState("");
  const [price, setPrice] = useState("");
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitMsg, setSubmitMsg] = useState("");
  const [submitErr, setSubmitErr] = useState("");

  // Refresh once on mount to pick up any reports since SSR. The effect body does
  // NO synchronous setState — the fetch helper is called and state is set only in
  // its async continuation (mirrors the SocialProof fetch-on-mount pattern, which
  // satisfies the no-synchronous-setState-in-effect rule). Fail-soft: a failure
  // keeps the SSR data and flips a non-load-bearing "couldn't refresh" hint.
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchAggregates().then((next) => {
      if (next) setAggregates(next);
      else setRefreshFailed(true);
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitErr("");
    setSubmitMsg("");

    // Client-side guard (the edge fn re-validates + runs the nuanced screen).
    const v = validateSubmission({ category, provider, reported_price: price });
    if (!v.ok) {
      setSubmitStatus("error");
      setSubmitErr(v.error);
      return;
    }

    setSubmitStatus("sending");
    try {
      const res = await fetch("/api/street-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v.submission),
      });
      const data = (await res.json()) as {
        ok: boolean;
        status?: "approved" | "pending" | "rejected";
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setSubmitStatus("error");
        setSubmitErr(
          data.error || "לא הצלחנו לקלוט את הדיווח כרגע. נסו שוב.",
        );
        return;
      }
      setSubmitStatus("done");
      setSubmitMsg(
        data.message ||
          (data.status === "approved"
            ? "תודה! הדיווח שלך נקלט ונספר."
            : "תודה! הדיווח שלך נקלט וייבדק לפני שייספר."),
      );
      setPrice("");
      // Re-fetch so a newly-counted report is reflected honestly. This runs in an
      // event handler (not an effect), so awaiting the fail-soft fetch is fine.
      const next = await fetchAggregates();
      if (next) {
        setAggregates(next);
        setRefreshFailed(false);
      }
    } catch {
      setSubmitStatus("error");
      setSubmitErr("שגיאת רשת. בדקו את החיבור ונסו שוב.");
    }
  }

  return (
    <div>
      {/* ── The honest chart ──────────────────────────────────────────────── */}
      <section aria-labelledby="chart-h">
        <h2
          id="chart-h"
          className="font-display text-xl font-bold tracking-tight text-ink"
        >
          המחיר האמיתי לפי הקהילה
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          מה משלמים בפועל — לפי דיווחים אנונימיים של משתמשים. קטגוריה מוצגת רק כשיש
          מספיק דיווחים כדי להיות מהימנה.
        </p>
        <div className="mt-4" aria-live="polite">
          <StreetPriceChart aggregates={aggregates} />
        </div>
        {refreshFailed ? (
          <p className="mt-3 text-xs text-muted">
            לא הצלחנו לרענן את הנתונים כרגע — מוצגים הנתונים האחרונים שנטענו.
          </p>
        ) : null}
      </section>

      {/* ── The report form ───────────────────────────────────────────────── */}
      <section
        aria-labelledby="report-h"
        className="mt-12 border-t border-border pt-10"
      >
        <h2
          id="report-h"
          className="font-display text-xl font-bold tracking-tight text-ink"
        >
          דווחו כמה אתם משלמים
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          הדיווח אנונימי לחלוטין — שולחים רק קטגוריה, ספק וסכום. שום פרט מזהה לא
          נשמר. כל דיווח עוזר לכולם לדעת את המחיר האמיתי בשוק.
        </p>

        <form onSubmit={onSubmit} className="bento mt-5 p-6 sm:p-7">
          <div className="grid gap-5 sm:grid-cols-3">
            {/* Category (required) */}
            <div>
              <label
                htmlFor={catId}
                className="block text-sm font-medium text-foreground"
              >
                שירות
              </label>
              <select
                id={catId}
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as StreetPriceCategory)
                }
                className="interactive mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-foreground focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {STREET_PRICE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_HE[c] ?? c}
                  </option>
                ))}
              </select>
            </div>

            {/* Provider (required) */}
            <div>
              <label
                htmlFor={provId}
                className="block text-sm font-medium text-foreground"
              >
                הספק
              </label>
              <input
                id={provId}
                type="text"
                list={listId}
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="לדוגמה: סלקום"
                autoComplete="off"
                className="interactive mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              />
              <datalist id={listId}>
                {providers.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>

            {/* Price (required) */}
            <div>
              <label
                htmlFor={priceId}
                className="block text-sm font-medium text-foreground"
              >
                כמה אתם משלמים בחודש (₪)
              </label>
              <input
                id={priceId}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                dir="ltr"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                className="interactive mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-end text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitStatus === "sending"}
            aria-busy={submitStatus === "sending"}
            className="interactive press mt-6 inline-flex items-center justify-center rounded-xl bg-accent px-6 py-3 font-semibold text-accent-contrast shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
          >
            {submitStatus === "sending" ? "שולח…" : "שלחו דיווח ←"}
          </button>

          <p className="mt-3 text-xs leading-relaxed text-muted">
            הדיווח נבדק אוטומטית מול הקטלוג כדי לסנן טעויות, ורק דיווחים סבירים
            נספרים. אנונימי לחלוטין — בלי שם, בלי טלפון.
          </p>

          {/* Status + error (announced). */}
          <div aria-live="polite">
            {submitStatus === "done" && submitMsg ? (
              <p className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm leading-relaxed text-foreground">
                <span className="font-semibold text-accent-text">תודה! </span>
                {submitMsg}
              </p>
            ) : null}
            {submitStatus === "error" && submitErr ? (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-border p-4 text-sm leading-relaxed text-foreground"
              >
                {submitErr}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      {/* ── Onward — no dead-ends ──────────────────────────────────────────── */}
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Link
          href="/compare"
          className="interactive press inline-flex items-center justify-center rounded-xl bg-accent px-5 py-3 font-semibold text-accent-contrast shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          השוו את כל מחירי הקטלוג ←
        </Link>
        <Link
          href="/negotiate"
          className="interactive press inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 font-semibold text-foreground transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          בנו תסריט מיקוח מול הספק
        </Link>
      </div>
    </div>
  );
}
