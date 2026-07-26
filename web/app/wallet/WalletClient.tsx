"use client";

// ────────────────────────────────────────────────────────────────────────────
// <WalletClient> — the PERSONAL savings view of the Telecom Wallet. The user
// enters their own current monthly bill per service category; for each, we show
// the REAL cheapest plan in our catalogue and the honest annual saving
// ((currentBill − cheapestPrice) × 12, clamped ≥ 0) — exactly the app's
// planSaveYear contract. All comparison prices are real catalogue figures passed
// in by the server page (the single source of truth); nothing is fabricated.
//
// E-E-A-T / HONESTY (ABSOLUTE):
//   • The saving is a transparent arithmetic of the user's OWN input vs. a REAL
//     catalogue price — it is an ESTIMATE based on the bill they entered, clearly
//     labeled as such, never a guaranteed promise.
//   • We never invent a current bill or a "you saved ₪X" — if the user hasn't
//     entered a bill for a category, that category shows no saving figure.
//   • The user's inputs are persisted ONLY in their own browser (localStorage).
//     Nothing is sent anywhere until the user fills the explicit, consent-gated
//     <LeadForm> that now sits directly under the total — the moment the ₪ figure
//     exists is the moment the ask is worth making, and shipping the visitor off
//     to /quiz to re-answer everything threw that intent away. The figures they
//     typed ride along as a factual `contextNote` so the rep opens the call
//     already knowing the ask; nothing is computed or invented for it.
//
// Design: premium-2026 bento cards. Amber = VALUE (saving figures, --value-text);
// green = ACTION (the CTA link). Dark-mode safe (CSS-variable colors) + RTL.
// a11y: each input has a <label>; the running total is announced via aria-live;
// the per-category saving is spelled out in an aria-label.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
// The lazy wrapper, aliased to the component's real name (the QuizWizard idiom):
// react-hook-form should not ride along in the first chunk of a calculator.
import LeadForm from "@/components/LeadFormLazy";
import { leadCategory } from "@/lib/format";
import { ilsStat } from "@/lib/wallet-stats";

/** A real, catalogue-derived cheapest option for one category (from the server). */
export interface WalletCategory {
  /** Category id, e.g. "cellular". */
  cat: string;
  /** Hebrew label (resolved server-side, falls back to CATEGORY_HE). */
  label: string;
  /** REAL cheapest headline price in this category (₪). */
  cheapestPrice: number;
  /** REAL cheapest plan's display name. */
  cheapestPlan: string;
  /** REAL cheapest plan's provider. */
  cheapestProvider: string;
  /** On-site compare page for this category (no dead-end). */
  compareHref: string;
}

export interface WalletClientProps {
  /** Per-category real cheapest options, computed from the bundled catalogue. */
  categories: WalletCategory[];
}

const STORAGE_KEY = "switchy.wallet.bills.v1";

/** Annual saving = ((bill − price) × 12), clamped to ≥ 0. Mirrors planSaveYear. */
function annualSaving(bill: number, cheapestPrice: number): number {
  if (!Number.isFinite(bill) || bill <= 0) return 0;
  return Math.max(0, Math.round((bill - cheapestPrice) * 12));
}

/** Parse a possibly-messy numeric input into a non-negative integer, or 0. */
function parseBill(raw: string): number {
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

// ── localStorage as an external store (read via useSyncExternalStore) ─────────
// The persisted bills (the user's own data, in THEIR browser only) live in
// localStorage. We expose them as an external store so React reads them without a
// synchronous setState-in-effect (which the React-Compiler lint rules forbid),
// and so an edit in another tab syncs here via the `storage` event.

/** Stable server snapshot — empty (no localStorage during SSR / first paint). */
const SERVER_SNAPSHOT: Record<string, string> = {};

// The client snapshot is memoized against the raw localStorage string so
// getSnapshot returns a STABLE reference until the underlying value changes
// (required by useSyncExternalStore to avoid an infinite render loop).
let snapCacheRaw: string | null = null;
let snapCacheVal: Record<string, string> = SERVER_SNAPSHOT;

function getStoredBills(): Record<string, string> {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return SERVER_SNAPSHOT;
  }
  if (raw === snapCacheRaw) return snapCacheVal;
  snapCacheRaw = raw;
  if (!raw) {
    snapCacheVal = SERVER_SNAPSHOT;
    return snapCacheVal;
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed ?? {})) {
      if (typeof v === "string" || typeof v === "number") out[k] = String(v);
    }
    snapCacheVal = out;
  } catch {
    snapCacheVal = SERVER_SNAPSHOT;
  }
  return snapCacheVal;
}

function subscribeStoredBills(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export default function WalletClient({ categories }: WalletClientProps) {
  // `edits` holds ONLY the values the user has typed this session, keyed by
  // category. We start empty so the SSR/first-paint markup is deterministic
  // (no hydration mismatch); the persisted snapshot is merged in at render time.
  const [edits, setEdits] = useState<Record<string, string>>({});

  // The persisted bills, read from localStorage as an external store (server
  // snapshot is empty, so first paint matches SSR — then it hydrates).
  const stored = useSyncExternalStore(
    subscribeStoredBills,
    getStoredBills,
    () => SERVER_SNAPSHOT,
  );

  // The effective bills shown: the user's typed edit wins; otherwise the
  // persisted snapshot; otherwise empty.
  const bills: Record<string, string> = {};
  for (const c of categories) {
    bills[c.cat] = edits[c.cat] ?? stored[c.cat] ?? "";
  }

  /** Record a user edit for a category (and so it persists below). */
  function setBill(cat: string, value: string) {
    setEdits((prev) => ({ ...prev, [cat]: value }));
  }

  // Persist the user's edits locally (their data, their browser only). Runs only
  // after the user has actually typed something this session; merges over the
  // existing snapshot so untouched categories are preserved.
  useEffect(() => {
    if (typeof window === "undefined" || Object.keys(edits).length === 0) return;
    try {
      const merged = { ...getStoredBills(), ...edits };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Storage unavailable (private mode / quota) — degrade silently; the
      // calculator still works for this session.
    }
  }, [edits]);

  const rows = categories.map((c) => {
    const bill = parseBill(bills[c.cat] ?? "");
    return { ...c, bill, saving: annualSaving(bill, c.cheapestPrice) };
  });

  // Total potential annual saving across the categories the user actually filled.
  const totalSaving = rows.reduce((sum, r) => sum + r.saving, 0);
  const filled = rows.filter((r) => r.bill > 0);
  const filledCount = filled.length;

  // The category carrying the biggest real gap — used ONLY to pre-select the lead
  // form's service field. When nothing was entered there is no biggest gap, so we
  // pass nothing rather than guess on the visitor's behalf.
  const topRow = rows.reduce<(typeof rows)[number] | undefined>(
    (best, r) => (r.saving > 0 && (!best || r.saving > best.saving) ? r : best),
    undefined,
  );

  // A factual note for the rep, assembled from what is ALREADY on screen: the
  // bills the visitor typed and the arithmetic above. Nothing new is computed and
  // nothing is invented — an empty calculator produces no note at all.
  const contextNote =
    filledCount > 0
      ? [
          `ארנק התקשורת — חשבונות שהוזנו: ${filled
            .map((r) => `${r.label} ${ilsStat(r.bill)}`)
            .join(", ")}`,
          totalSaving > 0
            ? `חיסכון שנתי מוערך מול הזול בקטלוג: ${ilsStat(totalSaving)}`
            : "לא נמצא פער מול המסלול הזול בקטלוג",
        ].join(" · ")
      : undefined;

  return (
    <div>
      {/* Running total — the focal VALUE moment. Amber-tinted surface, confident
          figure; announced for screen readers when it changes. The amber glow
          only lights up once there's a real saving (active win-state). */}
      <div
        className={[
          "bento relative overflow-hidden p-6 sm:p-8",
          totalSaving > 0
            ? "border-value/30 bg-value/[0.06] glow-value"
            : "",
        ]
          .join(" ")
          .trim()}
        aria-live="polite"
        aria-label={
          totalSaving > 0
            ? `חיסכון שנתי פוטנציאלי מוערך: ${ilsStat(totalSaving)} בשנה`
            : "הזינו את החשבון החודשי כדי לחשב חיסכון פוטנציאלי"
        }
      >
        <p className="flex items-center gap-1.5 text-sm font-medium text-muted">
          <Icon name="spark" size={16} className="text-value-text" aria-hidden />
          חיסכון שנתי פוטנציאלי (מוערך)
        </p>
        <p
          className={[
            "mt-1.5 font-display font-extrabold leading-none tracking-tight",
            totalSaving > 0
              ? "text-5xl text-value-text sm:text-6xl"
              : "text-3xl text-muted",
          ].join(" ")}
        >
          {totalSaving > 0 ? ilsStat(totalSaving) : "₪0"}
        </p>
        {totalSaving > 0 ? (
          <p className="mt-2 text-sm font-medium text-foreground">
            כ-{ilsStat(Math.round(totalSaving / 12))} בכל חודש שנשארים בכיס שלכם.
          </p>
        ) : null}
        <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted">
          {filledCount > 0
            ? `הערכה לפי החשבון שהזנתם מול המסלול הזול ביותר בקטלוג ב-${filledCount.toLocaleString(
                "he-IL",
              )} קטגוריות. חיסכון בפועל תלוי בתנאי הספק ואינו מובטח.`
            : "הזינו את החשבון החודשי שלכם בכל קטגוריה כדי לראות הערכת חיסכון מול המחיר הזול ביותר בקטלוג."}
        </p>
      </div>

      {/* Per-category rows: user's bill input → real cheapest → honest saving. */}
      <ul className="mt-5 grid gap-4 sm:grid-cols-2">
        {rows.map((r) => {
          const inputId = `wallet-bill-${r.cat}`;
          return (
            <li key={r.cat} className="card p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-base font-semibold tracking-tight text-ink">
                  {r.label}
                </h3>
                {r.saving > 0 ? (
                  <span
                    className="rounded-full bg-value/10 px-2.5 py-0.5 text-xs font-semibold text-value-text"
                    aria-label={`חיסכון שנתי מוערך בקטגוריית ${r.label}: ${ilsStat(
                      r.saving,
                    )} בשנה`}
                  >
                    חיסכון מוערך {ilsStat(r.saving)}/שנה
                  </span>
                ) : r.bill > 0 ? (
                  <span className="text-xs text-muted">
                    כבר במחיר מצוין — אין חיסכון מוערך כרגע
                  </span>
                ) : null}
              </div>

              {/* The user's own current bill — their input, never fabricated. */}
              <div className="mt-3">
                <label
                  htmlFor={inputId}
                  className="block text-xs font-medium text-muted"
                >
                  החשבון החודשי הנוכחי שלכם (₪)
                </label>
                <input
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  dir="ltr"
                  placeholder="0"
                  value={bills[r.cat] ?? ""}
                  onChange={(e) => setBill(r.cat, e.target.value)}
                  className="interactive mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-end text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                />
              </div>

              {/* REAL cheapest catalogue option for this category. */}
              <div className="mt-3 rounded-xl border border-border/70 bg-surface px-3 py-2.5">
                <p className="text-[12px] font-medium uppercase tracking-wide text-muted">
                  הזול ביותר בקטלוג
                </p>
                <p className="mt-1 text-sm leading-relaxed text-foreground">
                  <span className="font-medium">
                    {r.cheapestProvider} — {r.cheapestPlan}
                  </span>{" "}
                  החל מ־
                  <span className="font-semibold text-value-text">
                    {ilsStat(r.cheapestPrice)}
                  </span>{" "}
                  לחודש.
                </p>
              </div>

              <Link
                href={r.compareHref}
                className="interactive mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent-text underline-offset-2 hover:text-accent-hover hover:underline"
              >
                להשוואת כל מסלולי {r.label}
                <Icon name="arrow" size={15} aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>

      {/* ── The ask, where the intent already is ─────────────────────────────
          The consent-gated form itself, not a link to a page that asks the same
          questions again. The lead-in names the visitor's OWN computed figure when
          one exists and stays claim-free when it doesn't; `defaultCategory` is the
          category with the real biggest gap, and `contextNote` carries the typed
          bills so the rep starts the call informed. Truth-only: every value here
          was already rendered above. ────────────────────────────────────────── */}
      <section
        id="lead"
        aria-labelledby="wallet-lead-h"
        className="mt-10 scroll-mt-6"
      >
        {/* h3: the host page's <section> is already labelled by an h2, and the
            per-category rows above are h3 — this keeps one flat, correct level. */}
        <h3
          id="wallet-lead-h"
          className="font-display text-xl font-bold tracking-tight text-ink"
        >
          {totalSaving > 0
            ? "רוצים שנממש את החיסכון הזה בשבילכם?"
            : "רוצים שנבדוק את זה בשבילכם?"}
        </h3>
        <p className="mt-2 text-foreground">
          {totalSaving > 0
            ? `השאירו פרטים ונחזור אליכם עם המסלולים שסוגרים את הפער של ${ilsStat(
                totalSaving,
              )} בשנה — חינם, בלי התחייבות, והמספר נשאר שלכם.`
            : "השאירו פרטים ונחזור אליכם עם השוואה אישית — חינם, בלי התחייבות, והמספר נשאר שלכם."}
        </p>
        <div className="mt-5 max-w-xl">
          <LeadForm
            source="wallet"
            defaultCategory={leadCategory(topRow?.cat)}
            contextNote={contextNote}
          />
        </div>
      </section>

      {/* Onward — kept so the page never dead-ends, but DEMOTED to quiet text
          links so exactly one action (the form above) reads as primary.
          `-mx-2 px-2 min-h-11` keeps a real ≥44px tap target without padding the
          links back out into buttons. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-5">
        <Link
          href="/quiz"
          className="interactive -mx-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-accent-text underline-offset-2 hover:text-accent-hover hover:underline"
        >
          התאמה אישית ב-5 שאלות
          <Icon name="arrow" size={15} aria-hidden />
        </Link>
        <Link
          href="/bills"
          className="interactive -mx-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-accent-text underline-offset-2 hover:text-accent-hover hover:underline"
        >
          צלמו חשבון לניתוח מדויק
          <Icon name="arrow" size={15} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
