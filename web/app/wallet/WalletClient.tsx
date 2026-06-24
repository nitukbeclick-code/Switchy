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
//   • The user's inputs are persisted ONLY in their own browser (localStorage),
//     never sent anywhere from here. The lead hand-off remains the explicit,
//     consent-gated path (a link to /quiz / the category compare page).
//
// Design: premium-2026 bento cards. Amber = VALUE (saving figures, --value-text);
// green = ACTION (the CTA link). Dark-mode safe (CSS-variable colors) + RTL.
// a11y: each input has a <label>; the running total is announced via aria-live;
// the per-category saving is spelled out in an aria-label.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
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
  const filledCount = rows.filter((r) => r.bill > 0).length;

  return (
    <div>
      {/* Running total — announced for screen readers when it changes. */}
      <div
        className="bento p-6 sm:p-7"
        aria-live="polite"
        aria-label={
          totalSaving > 0
            ? `חיסכון שנתי פוטנציאלי מוערך: ${ilsStat(totalSaving)} בשנה`
            : "הזינו את החשבון החודשי כדי לחשב חיסכון פוטנציאלי"
        }
      >
        <p className="text-sm font-medium text-muted">
          חיסכון שנתי פוטנציאלי (מוערך)
        </p>
        <p className="mt-1 font-display text-4xl font-bold tracking-tight text-value-text sm:text-5xl">
          {totalSaving > 0 ? ilsStat(totalSaving) : "₪0"}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
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
              <p className="mt-3 text-xs leading-relaxed text-muted">
                הזול ביותר בקטלוג:{" "}
                <span className="font-medium text-foreground">
                  {r.cheapestProvider} — {r.cheapestPlan}
                </span>{" "}
                החל מ-
                <span className="font-semibold text-foreground">
                  {ilsStat(r.cheapestPrice)}
                </span>{" "}
                לחודש.
              </p>

              <Link
                href={r.compareHref}
                className="interactive mt-3 inline-block text-sm font-medium text-accent-text underline hover:text-accent-hover"
              >
                להשוואת כל מסלולי {r.label} ←
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Consent-gated hand-off — the only path to contact is explicit. */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href="/quiz"
          className="interactive inline-flex items-center justify-center rounded-xl bg-accent px-5 py-3 font-semibold text-accent-contrast shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          קבלו התאמה אישית והשאירו פרטים ←
        </Link>
        <Link
          href="/bills"
          className="interactive inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 font-semibold text-foreground transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          צלמו חשבון לניתוח מדויק
        </Link>
      </div>
    </div>
  );
}
