"use client";

// ────────────────────────────────────────────────────────────────────────────
// <HeroSavingsHook> — the homepage fold's ONE bold moment.
//
// A visitor arrives from search carrying exactly one number: what they pay today.
// This asks for that number and nothing else, then resolves the fold into a single
// oversized AMBER figure — the honest annual difference between their own bill and
// the REAL cheapest plan in our catalogue — with the ask directly under it. It is
// the only interaction above the fold and the only orchestrated motion on the page.
//
// HONESTY (E-E-A-T, ABSOLUTE): the arithmetic is byte-for-byte the app's shipped
// savings contract — `max(0, round((bill − cheapestPrice) × 12))`, the same
// annualSaving() that drives app/wallet/WalletClient.tsx and planSaveYear. The
// comparison price is a REAL catalogue figure resolved server-side and passed in
// (page.tsx already computes it for the trust band), so this component holds no
// catalogue of its own and cannot drift from it. Consequences of that contract:
//   • Nothing is shown until the visitor enters their own number — we never seed,
//     guess or "typical bill" our way to a figure.
//   • When the difference is ≤ 0 NO figure is rendered at all, only one honest
//     muted line. A flattering ₪ can never appear on screen.
//   • The figure is labelled an ESTIMATE based on the amount they entered
//     ("הפרש שנתי משוער לפי הסכום שהזנתם"), never a guaranteed saving — the same
//     register the Wallet uses. <PriceCaveat> (§17) sits under the figure.
//   • The bill is component state only: it is never persisted and never sent
//     anywhere. The only path to contact stays the consent-gated #lead form.
//
// Design: amber = VALUE, so the figure is the page's single money moment and takes
// the `.price-display` tier (₪ demoted to a superscript sibling, unit as a spaced
// micro-label below). Emerald = ACTION, so the ONLY emerald here is the ask that
// appears with the figure; the compute button stays a quiet bordered control so
// green keeps meaning exactly one thing in the fold.
//
// Motion: exactly ONE orchestrated beat — the resolved figure fades + lifts over
// 240ms on --ease-out. It is gated behind `prefers-reduced-motion: no-preference`
// (the `motion-safe` semantic) in a component-scoped <style>, so reduced-motion
// users get the figure instantly at its resting state — never hidden.
//
// a11y: a real <label> on a min-h-12 field, the result in an aria-live region with
// the figure spelled out for AT (the visual ₪-superscript split is aria-hidden),
// RTL-correct (logical properties throughout), and AA in both themes via tokens.
// ────────────────────────────────────────────────────────────────────────────

import { useId, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import PriceCaveat from "@/components/PriceCaveat";
import { ils } from "@/lib/format";

export interface HeroSavingsHookProps {
  /** Hebrew label of the featured category, e.g. "סלולר". */
  categoryLabel: string;
  /** REAL cheapest headline price in that category (₪/month) — the arithmetic base. */
  cheapestPrice: number;
  /** REAL cheapest plan's display name (catalogue). */
  cheapestPlan: string;
  /** REAL cheapest plan's provider (catalogue). */
  cheapestProvider: string;
  /**
   * The cheapest plan's EXACT advertised price text (via priceText) — so the
   * line under the figure reads ₪10.90 and never a rounded-up ₪11, matching the
   * comparison tables below.
   */
  cheapestPriceText: string;
  /** On-site compare page for the featured category (no dead-end). */
  compareHref: string;
  /** Optional extra classes on the wrapper. */
  className?: string;
}

/**
 * Annual difference = ((bill − cheapestPrice) × 12), clamped to ≥ 0. Deliberately
 * identical to WalletClient's annualSaving() so the two surfaces can never quote
 * the visitor two different numbers for the same bill.
 */
export function annualDifference(bill: number, cheapestPrice: number): number {
  if (!Number.isFinite(bill) || bill <= 0) return 0;
  return Math.max(0, Math.round((bill - cheapestPrice) * 12));
}

/** Parse a possibly-messy numeric input into a non-negative integer, or 0. */
function parseBill(raw: string): number {
  const n = Number(String(raw).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export default function HeroSavingsHook({
  categoryLabel,
  cheapestPrice,
  cheapestPlan,
  cheapestProvider,
  cheapestPriceText,
  compareHref,
  className,
}: HeroSavingsHookProps) {
  const inputId = useId();
  // `draft` is what is in the field; `committed` is what we are allowed to
  // compute from. Splitting them is what makes this a single deliberate beat
  // rather than a figure that twitches on every keystroke — it resolves on blur
  // or submit, once.
  const [draft, setDraft] = useState("");
  const [committed, setCommitted] = useState("");

  const bill = parseBill(committed);
  const diff = annualDifference(bill, cheapestPrice);
  // Three states, in order of what the visitor has actually told us: nothing yet,
  // a bill that is already at/below the catalogue floor, and a real difference.
  const answered = bill > 0;

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        setCommitted(draft);
      }}
    >
      {/* The page's single orchestrated entrance, scoped to this component and
          gated on `prefers-reduced-motion: no-preference` — under reduced motion
          the rule never applies, so the figure renders statically at its resting
          state (visible, no travel) rather than being animated to none. */}
      <style>{`@media (prefers-reduced-motion: no-preference){.sw-hook-figure{animation:swHookIn 240ms var(--ease-out) both}}@keyframes swHookIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <label
        htmlFor={inputId}
        className="block text-sm font-semibold text-foreground"
      >
        כמה אתם משלמים היום על {categoryLabel}?
      </label>
      <div className="mt-2 flex items-stretch gap-2">
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          dir="ltr"
          autoComplete="off"
          placeholder="₪ לחודש"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // Resolve on blur as well as submit: on a phone the visitor dismisses
          // the keyboard far more often than they press "go".
          onBlur={() => setCommitted(draft)}
          className="interactive nums-tabular min-h-12 w-full max-w-[11rem] rounded-xl border border-border bg-surface px-4 text-end text-lg font-semibold text-foreground placeholder:text-base placeholder:font-normal placeholder:text-muted focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        />
        {/* Quiet bordered control on purpose — emerald in this fold is reserved
            for the ask that appears with the figure. */}
        <button
          type="submit"
          className="interactive press inline-flex min-h-12 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          חשבו
        </button>
      </div>

      {/* The resolved fold. Announced politely so AT hears the answer without the
          field losing focus. Nothing renders here until a real number is in. */}
      <div aria-live="polite">
        {answered && diff > 0 ? (
          <div className="sw-hook-figure mt-5">
            {/* THE money moment — the one thing on this page allowed to be amber
                and this large. Split ₪/digits is decorative; the sr-only line
                below reads the figure as one phrase. */}
            <p
              aria-hidden="true"
              className="price-display nums-tabular text-value-text"
            >
              <span className="align-super text-[0.42em] font-bold">₪</span>
              {diff.toLocaleString("he-IL")}
            </p>
            <p
              aria-hidden="true"
              className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted"
            >
              לשנה
            </p>
            <p className="sr-only">
              הפרש שנתי משוער: {ils(diff)} בשנה.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              הפרש שנתי משוער לפי הסכום שהזנתם מול המסלול הזול ביותר בקטלוג:{" "}
              <span className="font-medium text-foreground">
                {cheapestProvider} — {cheapestPlan}
              </span>{" "}
              החל מ-₪{cheapestPriceText} לחודש. חיסכון בפועל תלוי בתנאי הספק
              ואינו מובטח.
            </p>
            <PriceCaveat className="mt-2" />
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <Link
                href="#lead"
                className="press inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-base font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98]"
              >
                בדקו לי את החיסכון בפועל
                <Icon name="chevron" size={18} aria-hidden="true" />
              </Link>
              <Link
                href={compareHref}
                className="interactive text-sm font-medium text-muted underline-offset-4 hover:text-accent-text hover:underline"
              >
                או ראו את המסלולים עצמם
              </Link>
            </div>
          </div>
        ) : answered ? (
          // Already at or below the catalogue floor: no figure at all. Saying so
          // plainly is the honest answer — inventing a "saving" here would be the
          // exact dark pattern this component exists to avoid.
          <p className="mt-4 text-sm leading-relaxed text-muted">
            אתם כבר משלמים פחות מהמסלול הזול ביותר שיש לנו ב{categoryLabel} (
            {cheapestProvider} — {cheapestPlan}, ₪{cheapestPriceText} לחודש), אז
            אין כאן הפרש להציג.
          </p>
        ) : null}
      </div>
    </form>
  );
}
