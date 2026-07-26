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
//     sent. No PII, no contact info (the report form has none). The microcopy says
//     so. The separate, clearly-labelled <LeadForm> below it is the ONLY place any
//     contact detail is asked for, and it is consent-gated like everywhere else —
//     it appears once a real ₪ figure is on screen (a published median, or the
//     figure the visitor just reported), which is exactly when the ask is honest.
//
// Design: premium-2026 bento/card surfaces. Amber = VALUE (the price figures);
// green = ACTION (the submit CTA + onward links). Dark-mode safe (CSS-variable
// colors) + RTL. a11y: every control has a <label>; results/status announce via
// aria-live; the form is keyboard-complete.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { CATEGORY_HE } from "@/lib/categories";
import Icon from "@/components/Icon";
import StreetPriceChart from "@/components/StreetPriceChart";
// The lazy wrapper, aliased to the component's real name (the QuizWizard idiom):
// react-hook-form should not ride along in the first chunk of a chart page.
import LeadForm from "@/components/LeadFormLazy";
import SocialProof from "@/components/SocialProof";
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
  // Which free-text input (if any) the last client-side validation flagged, so it
  // can be marked aria-invalid + danger-bordered. Server / network errors aren't
  // tied to a single field, so they leave this null.
  const [invalidField, setInvalidField] = useState<"provider" | "price" | null>(
    null,
  );

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
    setInvalidField(null);

    // Client-side guard (the edge fn re-validates + runs the nuanced screen).
    const v = validateSubmission({ category, provider, reported_price: price });
    if (!v.ok) {
      setSubmitStatus("error");
      setSubmitErr(v.error);
      // Mirror validateSubmission's field order (category is a fixed select, so the
      // offender is the provider when it's blank, otherwise the price field).
      setInvalidField(provider.trim() === "" ? "provider" : "price");
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

  // True only when at least one category cleared the publish threshold — i.e. a
  // REAL ₪ median is rendered on this screen. Mirrors the chart's own gate so the
  // two can never disagree about whether there is a number to act on.
  const hasPublished = aggregates.some((a) => a.published);

  return (
    <div>
      {/* ── The honest chart ──────────────────────────────────────────────── */}
      <section aria-labelledby="chart-h">
        <h2
          id="chart-h"
          className="h-section text-ink"
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
          className="h-section text-ink"
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
                aria-invalid={invalidField === "provider"}
                className={`interactive mt-1.5 w-full rounded-xl border ${invalidField === "provider" ? "border-danger" : "border-border"} bg-surface px-3 py-2.5 text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
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
                aria-invalid={invalidField === "price"}
                className={`interactive mt-1.5 w-full rounded-xl border ${invalidField === "price" ? "border-danger" : "border-border"} bg-surface px-3 py-2.5 text-end text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`}
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
                className="mt-4 rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm leading-relaxed text-danger-text"
              >
                {submitErr}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      {/* ── The ask, where the intent already is ─────────────────────────────
          Gated on a REAL ₪ figure being on screen: either the chart published at
          least one category's median, or the visitor just told us what they pay.
          Below that bar there is no number to act on, so there is no ask — the
          honesty gate and the conversion gate are the same gate here. The category
          the visitor selected in the report form pre-selects the service field (a
          pre-fill, still editable), and the ANONYMOUS report above stays entirely
          separate from this consent-gated form. ─────────────────────────────── */}
      {hasPublished || submitStatus === "done" ? (
        <section
          id="lead"
          aria-labelledby="street-lead-h"
          className="mt-12 border-t border-border pt-10 scroll-mt-6"
        >
          <h2
            id="street-lead-h"
            className="h-section text-ink"
          >
            משלמים יותר מהמחיר ברחוב?
          </h2>
          <p className="mt-2 text-foreground">
            השאירו פרטים ונחזור אליכם עם ההצעה המשתלמת ביותר בקטלוג — חינם, בלי
            התחייבות, והמספר נשאר שלכם.
          </p>
          <SocialProof fallback="none" className="mt-5" />
          <div className="mt-5 max-w-xl">
            {/* NO contextNote on purpose — unlike /switch-kit, which attaches the
                catalogue row it built the packet from. This page promises the
                report is anonymous three times (the chart caption, the report
                form, the counter line), and app/street-prices/page.tsx emits the
                "האם הדיווח שלי אנונימי?" answer as FAQPage JSON-LD, so the promise
                is published to search engines too. The category / provider / ₪ the
                visitor just reported therefore do NOT ride along into a record
                that also holds their name and phone — that is exactly the join the
                word "אנונימי" rules out. The category alone still reaches the rep,
                but as `defaultCategory`: a visible, editable field in the form. */}
            <LeadForm source="street-prices" defaultCategory={category} />
          </div>
        </section>
      ) : null}

      {/* Onward — kept so the page never dead-ends, but DEMOTED to quiet text
          links so exactly one action (the form above) reads as primary.
          `-mx-2 px-2 min-h-11` keeps a real ≥44px tap target. */}
      <div className="mt-8 flex flex-wrap items-center gap-x-5">
        <Link
          href="/compare"
          className="interactive -mx-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-accent-text underline-offset-2 hover:text-accent-hover hover:underline"
        >
          השוו את כל מחירי הקטלוג
          {/* Direction-aware chevron instead of the old hardcoded "←" glyph: the
              page is dir="rtl" and <Icon> mirrors correctly. */}
          <Icon name="chevron" size={15} aria-hidden />
        </Link>
        <Link
          href="/negotiate"
          className="interactive -mx-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-accent-text underline-offset-2 hover:text-accent-hover hover:underline"
        >
          בנו תסריט מיקוח מול הספק
          <Icon name="chevron" size={15} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
