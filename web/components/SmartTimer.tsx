"use client";

// ────────────────────────────────────────────────────────────────────────────
// <SmartTimer> — a pure, client-side CONTRACT CALCULATOR. The user enters their
// contract start date and the commitment length (in months); the component
// derives the commitment END date, the number of days left, and a
// "כדאי לעבור עכשיו" flag once the commitment/promo period has ended.
//
// HONESTY: this is a deterministic date calculator only — it makes NO claim about
// any specific provider, price, or penalty. It tells the user *when* their
// commitment ends so they can act; it never fabricates contract terms. All copy
// is Hebrew, layout is RTL, and the controls are fully labelled for a11y.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useId, useMemo, useState } from "react";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Add `months` calendar months to a date (clamping end-of-month overflow). */
function addMonths(start: Date, months: number): Date {
  const d = new Date(start.getTime());
  const targetMonth = d.getMonth() + months;
  d.setMonth(targetMonth);
  // If the day rolled over (e.g. Jan 31 + 1mo → Mar 3), clamp to month-end.
  if (d.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    d.setDate(0);
  }
  return d;
}

/** Whole days from `from` to `to` (positive = to is in the future). */
function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / MS_PER_DAY);
}

/** Format a Date as dd/mm/yyyy (zero-padded). */
function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

interface Computed {
  endDate: Date;
  daysLeft: number;
  /** True once the commitment period has elapsed (daysLeft <= 0). */
  ended: boolean;
}

export interface SmartTimerProps {
  /** Visible heading. Defaults to a neutral Hebrew label. */
  heading?: string;
  /** Default commitment length in months (e.g. 12, 24, 36). Defaults to 12. */
  defaultMonths?: number;
  /** Optional extra classes on the outer section. */
  className?: string;
  /** DOM id (anchor-/deep-link-able). Defaults to "smart-timer". */
  id?: string;
  /**
   * Where the "commitment ended" CTA points. Defaults to the plan-comparison
   * landing so the user can act at the moment of peak intent (no dead-end).
   */
  ctaHref?: string;
  /** Label for that CTA. */
  ctaLabel?: string;
}

export default function SmartTimer({
  heading = "מחשבון סיום התחייבות",
  defaultMonths = 12,
  className,
  id = "smart-timer",
  ctaHref = "/compare",
  ctaLabel = "השוואת מסלולים וחיסכון",
}: SmartTimerProps) {
  const fieldId = useId();
  const startId = `${fieldId}-start`;
  const monthsId = `${fieldId}-months`;
  const resultId = `${fieldId}-result`;

  const [start, setStart] = useState<string>("");
  const [months, setMonths] = useState<string>(String(defaultMonths));

  const computed = useMemo<Computed | null>(() => {
    if (!start) return null;
    const startDate = new Date(`${start}T00:00:00`);
    if (Number.isNaN(startDate.getTime())) return null;
    const m = Number(months);
    if (!Number.isFinite(m) || m < 0) return null;

    const endDate = addMonths(startDate, m);
    const today = new Date();
    const daysLeft = daysBetween(today, endDate);
    return { endDate, daysLeft, ended: daysLeft <= 0 };
  }, [start, months]);

  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={[
        "bento p-6 sm:p-7",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <h2
        id={headingId}
        className="mb-1 flex items-center gap-2.5 font-display text-base font-semibold tracking-tight text-ink"
      >
        <span
          aria-hidden="true"
          className="inline-block h-5 w-1.5 rounded-full bg-accent"
        />
        {heading}
      </h2>
      <p className="mb-4 text-sm text-muted">
        הזינו את תאריך תחילת ההתחייבות ואת אורך התקופה (בחודשים) כדי לדעת מתי היא
        מסתיימת וכמה ימים נותרו. המחשבון אינו אוסף נתונים ואינו שולח דבר.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={startId} className="text-sm font-medium text-foreground">
            תאריך תחילת ההתחייבות
          </label>
          <input
            id={startId}
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="interactive rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 focus-visible:border-accent"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={monthsId} className="text-sm font-medium text-foreground">
            אורך ההתחייבות (חודשים)
          </label>
          <input
            id={monthsId}
            type="number"
            min={0}
            max={120}
            inputMode="numeric"
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            className="interactive rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 focus-visible:border-accent"
          />
        </div>
      </div>

      {/* Live result region — announced to screen readers on change. */}
      <div
        id={resultId}
        role="status"
        aria-live="polite"
        className="mt-5"
      >
        {computed && (
          <div className="rounded-xl border border-border/60 bg-background p-4 elevate-soft">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">תאריך סיום ההתחייבות</dt>
                <dd className="mt-0.5 font-display text-lg font-semibold text-ink">
                  <time dateTime={computed.endDate.toISOString().slice(0, 10)}>
                    {formatDate(computed.endDate)}
                  </time>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">
                  {computed.ended ? "ההתחייבות הסתיימה לפני" : "ימים שנותרו"}
                </dt>
                <dd className="mt-0.5 font-display text-lg font-semibold text-ink">
                  {computed.ended
                    ? `${Math.abs(computed.daysLeft).toLocaleString("he-IL")} ימים`
                    : `${computed.daysLeft.toLocaleString("he-IL")} ימים`}
                </dd>
              </div>
            </dl>

            {computed.ended ? (
              <div className="mt-4">
                <p
                  className="flex items-start gap-2 rounded-lg border border-value/40 bg-value/10 p-3 text-sm font-medium text-foreground"
                  data-switch-now="true"
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-value"
                  />
                  כדאי לעבור עכשיו — תקופת ההתחייבות הסתיימה, כך שאפשר להחליף מסלול
                  ללא קנס יציאה. השוו מסלולים ובדקו כמה אפשר לחסוך.
                </p>
                {/* Peak-intent CTA: the commitment is over, so surface the next
                    action instead of dead-ending on the message. */}
                <Link
                  href={ctaHref}
                  className="press mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {ctaLabel}
                  <span aria-hidden="true">←</span>
                </Link>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">
                כשתסתיים ההתחייבות תוכלו לעבור ספק ללא קנס יציאה. שמרו את התאריך
                ובדקו שוב סמוך אליו כדי להשוות מסלולים.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
