"use client";

// ────────────────────────────────────────────────────────────────────────────
// <SwitchKitClient> — the interactive "ערכת מעבר" (Switch Autopilot). The user
// picks their CURRENT provider + a TARGET plan (grouped by category, real
// catalogue rows passed in by the page), optionally adds honest profile fields
// (name / account / phone / current bill / commitment), and we POST to
// /api/switch-kit to build the personalised packet:
//   • a cancellation/disconnection LETTER they review + send themselves,
//   • the ניוד-מספר / disconnection CHECKLIST + factual SWITCH STEPS,
//   • the honest relative KEY DATES,
// plus a TRACKER whose step states persist in localStorage (useSyncExternalStore)
// and — when the user is signed in — fail-softly mirror to their own DB row.
//
// E-E-A-T / HONESTY (ABSOLUTE):
//   • Every plan/price/provider shown is a real catalogue row returned by the API.
//   • The annual saving is an upper-bound ESTIMATE vs. the bill the user typed, and
//     is shown only when they supplied a real bill. The "הנחיה כללית, לא ייעוץ
//     משפטי" disclaimer + the "you review + send the letter yourself, we never
//     auto-send" framing are shown prominently.
//   • No PII leaves the browser beyond the (optional) fields the user types to
//     personalise the letter. There is NO lead capture here.
//
// Design: premium-2026 bento/card surfaces. Green = ACTION (the build CTA + onward
// links); amber = VALUE (the saving figure). Dark-mode safe (CSS-variable colors)
// + RTL. a11y: every control has a <label>; the result announces via aria-live;
// the copy + print controls have accessible labels + live status. The print packet
// is reachable via window.print() and is styled by print.module.css.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useId, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import SkeletonCard from "@/components/SkeletonCard";
import { CATEGORY_HE } from "@/lib/categories";
import { priceUnitLabel } from "@/lib/format";
import type { Plan } from "@/lib/types";
import {
  SWITCH_KIT_CATEGORIES,
  type SwitchKit,
  type SwitchKitCategory,
} from "@/lib/switch-kit";
import {
  attemptKey,
  cycleStep,
  doneCount,
  getServerSnapshot,
  getSnapshot,
  reset as resetProgress,
  subscribe,
  toggleDone,
  type StepProgress,
} from "./store";
import styles from "./print.module.css";

/** A catalogue plan trimmed to what the picker + cards need (passed in by page). */
export interface SwitchPlanOption {
  id: string;
  cat: SwitchKitCategory;
  provider: string;
  plan: string;
  price: number;
  after: number | null;
  /** Pre-formatted Hebrew per-unit suffix (לחודש / לחבילה …). */
  priceUnit: string;
}

export interface SwitchKitClientProps {
  /** REAL provider display names (for the "from" datalist). */
  providers: string[];
  /** REAL target plans, trimmed, grouped client-side by category. */
  plans: SwitchPlanOption[];
}

type Status = "idle" | "loading" | "ready" | "error";

const STATUS_HE: Record<"todo" | "in_progress" | "done", string> = {
  todo: "לא התחיל",
  in_progress: "בתהליך",
  done: "הושלם",
};

export default function SwitchKitClient({ providers, plans }: SwitchKitClientProps) {
  const baseId = useId();
  const fromId = `${baseId}-from`;
  const fromListId = `${baseId}-from-list`;
  const catId = `${baseId}-cat`;
  const planId = `${baseId}-plan`;
  const nameId = `${baseId}-name`;
  const billId = `${baseId}-bill`;
  const commitId = `${baseId}-commit`;

  const [fromProvider, setFromProvider] = useState("");
  const [category, setCategory] = useState<SwitchKitCategory>("cellular");
  const [targetPlanId, setTargetPlanId] = useState("");
  const [fullName, setFullName] = useState("");
  const [bill, setBill] = useState("");
  const [hasCommitment, setHasCommitment] = useState<"unknown" | "yes" | "no">("unknown");

  const [status, setStatus] = useState<Status>("idle");
  const [kit, setKit] = useState<SwitchKit | null>(null);
  const [error, setError] = useState("");

  // Plans for the currently-selected category (cheapest first), for the picker.
  const plansForCat = useMemo(
    () =>
      plans
        .filter((p) => p.cat === category)
        .sort((a, b) => a.price - b.price),
    [plans, category],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!targetPlanId) {
      setStatus("error");
      setError("בחרו מסלול יעד מהקטלוג כדי לבנות את הערכה.");
      return;
    }
    setStatus("loading");
    setError("");
    const billNum = Number(String(bill).replace(/[^\d.]/g, ""));
    try {
      const res = await fetch("/api/switch-kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromProvider: fromProvider.trim() || undefined,
          targetPlanId,
          fullName: fullName.trim() || undefined,
          currentBill: Number.isFinite(billNum) && billNum > 0 ? billNum : undefined,
          hasCommitment:
            hasCommitment === "yes" ? true : hasCommitment === "no" ? false : undefined,
        }),
      });
      const data = (await res.json()) as
        | { ok: true; kit: SwitchKit }
        | { ok: false; error?: string };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setError(
          ("error" in data && data.error) ||
            "לא הצלחנו לבנות ערכת מעבר כרגע. נסו מסלול אחר.",
        );
        setKit(null);
        return;
      }
      setKit(data.kit);
      setStatus("ready");
    } catch {
      setStatus("error");
      setError("שגיאת רשת. בדקו את החיבור ונסו שוב.");
      setKit(null);
    }
  }

  return (
    <div>
      {/* ── The form (hidden from print) ──────────────────────────────────── */}
      <form
        onSubmit={onSubmit}
        className="bento p-6 sm:p-7 switchkit-screen-only"
      >
        {/* Form intent header — a single focal title so the builder reads as a
            deliberate step, not a loose field grid. */}
        <div className="mb-6 flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-accent/10 font-display text-sm font-bold text-accent-text"
          >
            1
          </span>
          <div>
            <h3 className="font-display text-lg font-bold tracking-tight text-ink">
              בנו את הערכה שלכם
            </h3>
            <p className="mt-0.5 text-sm text-muted">
              בחרו לאן עוברים — השאר אופציונלי ומשמש רק להרכבת המכתב.
            </p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* From provider (optional but recommended) */}
          <div>
            <label htmlFor={fromId} className="block text-sm font-medium text-foreground">
              הספק הנוכחי שלכם{" "}
              <span className="font-normal text-muted">(לא חובה)</span>
            </label>
            <input
              id={fromId}
              type="text"
              list={fromListId}
              value={fromProvider}
              onChange={(e) => setFromProvider(e.target.value)}
              placeholder="לדוגמה: סלקום"
              autoComplete="off"
              className="interactive mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            />
            <datalist id={fromListId}>
              {providers.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          {/* Category → narrows the target-plan picker */}
          <div>
            <label htmlFor={catId} className="block text-sm font-medium text-foreground">
              איזה שירות אתם מעבירים?
            </label>
            <select
              id={catId}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as SwitchKitCategory);
                setTargetPlanId("");
              }}
              className="interactive mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-foreground focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {SWITCH_KIT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_HE[c] ?? c}
                </option>
              ))}
            </select>
          </div>

          {/* Target plan (required) */}
          <div className="sm:col-span-2">
            <label htmlFor={planId} className="block text-sm font-medium text-foreground">
              מסלול היעד — לאן אתם עוברים?
            </label>
            <select
              id={planId}
              value={targetPlanId}
              onChange={(e) => setTargetPlanId(e.target.value)}
              required
              className="interactive mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-foreground focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <option value="">בחרו מסלול…</option>
              {plansForCat.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.provider} — {p.plan} (₪{p.price} {p.priceUnit})
                </option>
              ))}
            </select>
            {plansForCat.length === 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-muted">
                <Icon name="info" size={16} className="mt-0.5 shrink-0 text-muted" />
                <span>
                  אין כרגע מסלולים בקטגוריה הזו בקטלוג.{" "}
                  <Link
                    href="/compare"
                    className="interactive inline-flex items-center gap-0.5 font-medium text-accent-text underline hover:text-accent-hover"
                  >
                    עברו להשוואה המלאה
                    <Icon name="chevron" size={14} aria-hidden="true" />
                  </Link>
                </span>
              </p>
            )}
          </div>

          {/* Name (optional — letter salutation) */}
          <div>
            <label htmlFor={nameId} className="block text-sm font-medium text-foreground">
              שם מלא למכתב{" "}
              <span className="font-normal text-muted">(לא חובה)</span>
            </label>
            <input
              id={nameId}
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="ישראל ישראלי"
              autoComplete="name"
              className="interactive mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            />
          </div>

          {/* Current bill (optional — saving estimate) */}
          <div>
            <label htmlFor={billId} className="block text-sm font-medium text-foreground">
              החשבון החודשי שלכם (₪){" "}
              <span className="font-normal text-muted">(לא חובה)</span>
            </label>
            <input
              id={billId}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              dir="ltr"
              value={bill}
              onChange={(e) => setBill(e.target.value)}
              placeholder="0"
              className="interactive mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-end text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            />
          </div>

          {/* Commitment (optional — letter clause) */}
          <div className="sm:col-span-2">
            <label htmlFor={commitId} className="block text-sm font-medium text-foreground">
              המסלול הנוכחי בהתחייבות?{" "}
              <span className="font-normal text-muted">(לא חובה)</span>
            </label>
            <select
              id={commitId}
              value={hasCommitment}
              onChange={(e) =>
                setHasCommitment(e.target.value as "unknown" | "yes" | "no")
              }
              className="interactive mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-foreground focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <option value="unknown">לא בטוח/ה — אבדוק בחוזה</option>
              <option value="no">ללא התחייבות</option>
              <option value="yes">עם התחייבות</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={status === "loading"}
          aria-busy={status === "loading"}
          className="interactive press mt-6 inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-6 py-3 font-semibold text-accent-contrast shadow-[var(--glow-accent)] hover:bg-accent-hover hover:shadow-float focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 disabled:shadow-none"
        >
          {status === "loading" ? (
            "בונה ערכה…"
          ) : (
            <>
              בנו לי ערכת מעבר
              <Icon name="arrow" size={18} aria-hidden />
            </>
          )}
        </button>

        <p className="mt-3 text-xs leading-relaxed text-muted">
          הערכה נבנית ממחירים אמיתיים מהקטלוג שלנו. הפרטים שאתם מקלידים משמשים רק
          להרכבת המכתב — לא נשמרים אצלנו, ואת המכתב אתם בודקים ושולחים בעצמכם.
        </p>
      </form>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {status === "error" && (
        <div
          role="alert"
          className="switchkit-screen-only mt-6 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 p-5 text-foreground"
        >
          <Icon name="alert" size={20} className="mt-0.5 shrink-0 text-danger-text" />
          <p className="leading-relaxed">
            {error}{" "}
            <Link
              href="/compare"
              className="interactive inline-flex items-center gap-0.5 font-medium text-accent-text underline hover:text-accent-hover"
            >
              עברו להשוואה המלאה
              <Icon name="chevron" size={14} aria-hidden="true" />
            </Link>
          </p>
        </div>
      )}

      {/* ── Loading — a designed skeleton so the wait reads as "your kit is being
          built", not a frozen button. Decorative (the button's aria-busy + the
          live region announce state). ──────────────────────────────────────── */}
      {status === "loading" && (
        <div className="switchkit-screen-only mt-10" aria-hidden="true">
          <div className="flex items-center gap-2 text-sm font-medium text-muted">
            <Icon name="spark" size={18} className="text-accent-text" />
            בונים את ערכת המעבר שלכם…
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </div>
          <SkeletonCard className="mt-4" lines={4} />
        </div>
      )}

      {/* ── Result ────────────────────────────────────────────────────────── */}
      <div aria-live="polite">
        {status === "ready" && kit && <KitResult kit={kit} />}
      </div>
    </div>
  );
}

/** The full generated packet + the persistent tracker. */
function KitResult({ kit }: { kit: SwitchKit }) {
  const key = useMemo(
    () => attemptKey(kit.fromProvider, kit.toPlanId ?? ""),
    [kit.fromProvider, kit.toPlanId],
  );

  const progress = useSyncExternalStore<StepProgress>(
    useCallback((cb) => subscribe(key, cb), [key]),
    useCallback(() => getSnapshot(key), [key]),
    getServerSnapshot,
  );

  const done = doneCount(progress);
  const total = kit.switchSteps.length;

  const onPrint = useCallback(() => {
    if (typeof window !== "undefined") window.print();
  }, []);

  return (
    <section className={`mt-10 ${styles.printArea}`} aria-labelledby="kit-h">
      {/* Header + actions (screen only) */}
      <div className="switchkit-screen-only flex flex-wrap items-center justify-between gap-3">
        <h2 id="kit-h" className="font-display text-2xl font-bold tracking-tight text-ink">
          ערכת המעבר שלכם — {kit.categoryHe}
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPrint}
            className="interactive press inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            הדפסה / שמירה כ-PDF
          </button>
        </div>
      </div>

      {/* Print-only heading */}
      <h1 className={`${styles.printOnly} ${styles.printHeading}`}>
        ערכת מעבר — {kit.toProvider} ({kit.categoryHe})
      </h1>

      {/* Target summary (screen) — the "מסלול היעד" card is the outcome focal
          point (accent glow); the saving is the amber VALUE inside it. */}
      <div className="switchkit-screen-only mt-4 grid gap-4 sm:grid-cols-2">
        <div className="card glow-accent p-5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-text">
            <Icon name="check" size={14} />
            מסלול היעד
          </p>
          <p className="mt-3 font-display text-2xl font-bold tracking-tight text-ink">
            ₪{kit.price}
            <span className="mr-1 text-sm font-medium text-muted">
              {" "}
              {priceUnitLabelFor(kit)}
            </span>
          </p>
          <p className="mt-1 text-sm text-foreground">
            {kit.toProvider} — {kit.toPlan}
          </p>
          {kit.annualSavingUpTo && kit.annualSavingUpTo > 0 ? (
            <p
              className="mt-3 inline-flex items-center gap-1 rounded-full bg-value/15 px-2.5 py-0.5 text-xs font-semibold text-value-text"
              aria-label={`חיסכון שנתי מוערך עד ₪${kit.annualSavingUpTo} בשנה`}
            >
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-value" />
              חיסכון מוערך עד ₪{kit.annualSavingUpTo}/שנה
            </p>
          ) : null}
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
            התקדמות המעבר
          </p>
          <p className="mt-3 font-display text-2xl font-bold tracking-tight text-ink">
            {done}/{total}
            <span className="mr-1 text-sm font-medium text-muted"> שלבים</span>
          </p>
          <div
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            aria-label="התקדמות המעבר"
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{
                width: `${total ? (done / total) * 100 : 0}%`,
                transition: "width var(--duration-modal) var(--ease-out)",
              }}
            />
          </div>
          {done > 0 && (
            <button
              type="button"
              onClick={() => resetProgress(key)}
              className="interactive mt-3 text-xs font-medium text-muted underline hover:text-foreground"
            >
              איפוס ההתקדמות
            </button>
          )}
        </div>
      </div>

      {/* ── The cancellation letter ───────────────────────────────────────── */}
      <LetterBlock letter={kit.cancellationLetterHe} />

      {/* ── The tracker / switch steps ────────────────────────────────────── */}
      <section className={`mt-8 ${styles.section}`} aria-labelledby="steps-h">
        <h3 id="steps-h" className={`font-display text-xl font-bold tracking-tight text-ink ${styles.printHeading}`}>
          שלבי המעבר — סמנו תוך כדי התקדמות
        </h3>
        <ol className="mt-4 grid gap-3">
          {kit.switchSteps.map((s, i) => {
            const state = progress[s.key] ?? "todo";
            return (
              <li key={s.key} className={`card flex gap-3 p-4 ${styles.stepItem}`}>
                <button
                  type="button"
                  onClick={() => toggleDone(key, s.key)}
                  aria-pressed={state === "done"}
                  aria-label={`סמנו "${s.name}" כ${state === "done" ? "לא הושלם" : "הושלם"}`}
                  className={`switchkit-screen-only press mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm transition-colors ${
                    state === "done"
                      ? "border-accent bg-accent text-accent-contrast"
                      : "border-border bg-surface text-muted hover:border-accent"
                  }`}
                >
                  {state === "done" ? <Icon name="check" size={15} /> : null}
                </button>
                <span
                  aria-hidden="true"
                  className={`${styles.printOnly} mt-0.5 h-6 w-6 shrink-0`}
                >
                  {i + 1}.
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-display font-semibold text-ink ${styles.stepName}`}>
                      {s.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => cycleStep(key, s.key)}
                      className={`switchkit-screen-only press rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                        state === "done"
                          ? "bg-accent/15 text-accent-text"
                          : state === "in_progress"
                            ? "bg-value/15 text-value-text"
                            : "bg-secondary text-muted"
                      }`}
                    >
                      {STATUS_HE[state]}
                    </button>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-foreground">{s.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── Portability checklist ─────────────────────────────────────────── */}
      <section className={`mt-8 ${styles.section}`} aria-labelledby="check-h">
        <h3 id="check-h" className={`font-display text-xl font-bold tracking-tight text-ink ${styles.printHeading}`}>
          לפני שעוברים — רשימת בדיקה
        </h3>
        <ul className="mt-4 grid gap-3">
          {kit.portabilityChecklist.map((item) => (
            <li key={item.key} className={`card p-4 ${styles.stepItem}`}>
              <p className={`font-display font-semibold text-ink ${styles.stepName}`}>
                {item.label}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">{item.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Key dates ─────────────────────────────────────────────────────── */}
      <section className={`mt-8 ${styles.section}`} aria-labelledby="dates-h">
        <h3 id="dates-h" className={`font-display text-xl font-bold tracking-tight text-ink ${styles.printHeading}`}>
          מועדים לתשומת לב
        </h3>
        <ul className="mt-4 grid gap-3">
          {kit.keyDates.map((d) => (
            <li key={d.key} className={`card p-4 ${styles.stepItem}`}>
              <p className={`font-display font-semibold text-ink ${styles.stepName}`}>
                {d.label}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground">{d.hint}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Official site (real only) ─────────────────────────────────────── */}
      {kit.officialUrl ? (
        <section className="switchkit-screen-only bento mt-8 p-6">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink">
            <Icon name="lock" size={18} className="text-accent-text" />
            ההליך המחייב — באתר הרשמי
          </h3>
          <p className="mt-2 leading-relaxed text-foreground">
            את הליך הניתוק המדויק ופרטי הקשר העדכניים יש לבדוק בערוצים הרשמיים. אנחנו
            לא ממציאים מספרי טלפון או שלבים.
          </p>
          <a
            href={kit.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="interactive press mt-4 inline-flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 font-medium text-accent-contrast shadow-soft hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            לאתר הרשמי
            <Icon name="arrow" size={18} aria-hidden />
          </a>
        </section>
      ) : null}

      {/* ── Honest disclaimer — prominent, also printed ───────────────────── */}
      <p className={`mt-6 rounded-xl border border-value/30 bg-value/5 p-4 text-sm leading-relaxed text-foreground ${styles.disclaimer}`}>
        <span className="font-semibold text-value-text">לתשומת לבכם: </span>
        {kit.disclaimer} אנחנו לעולם לא שולחים את המכתב במקומכם — הבדיקה והשליחה
        בידיכם.
      </p>

      {/* Onward — no dead-ends (screen only) */}
      <div className="switchkit-screen-only mt-6 flex flex-wrap items-center gap-3">
        <Link
          href={`/compare/${kit.category}`}
          className="interactive press inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-5 py-3 font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-colors hover:bg-accent-hover hover:shadow-float focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          להשוואת כל מסלולי {kit.categoryHe}
          <Icon name="arrow" size={18} aria-hidden />
        </Link>
        <Link
          href={switchGuideHref(kit.fromProvider)}
          className="interactive press inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-5 py-3 font-semibold text-foreground transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          מדריך הניתוק המלא
          <Icon name="arrow" size={18} aria-hidden />
        </Link>
      </div>
    </section>
  );
}

/** The letter block with a copy-to-clipboard control. */
function LetterBlock({ letter }: { letter: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [letter]);

  return (
    <section className={`mt-8 ${styles.section}`} aria-labelledby="letter-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="letter-h" className={`font-display text-xl font-bold tracking-tight text-ink ${styles.printHeading}`}>
          מכתב הניתוק — לבדיקה ושליחה על ידיכם
        </h3>
        <button
          type="button"
          onClick={onCopy}
          className="switchkit-screen-only interactive press inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="העתקת מכתב הניתוק ללוח"
        >
          {copied ? (
            <>
              <Icon name="check" size={16} className="text-accent-text" />
              הועתק
            </>
          ) : (
            "העתקת המכתב"
          )}
        </button>
      </div>
      <span role="status" className="sr-only">
        {copied ? "המכתב הועתק ללוח" : ""}
      </span>
      <pre
        className={`card mt-4 whitespace-pre-wrap p-5 text-sm leading-relaxed text-foreground ${styles.letter}`}
        style={{ fontFamily: "inherit" }}
      >
        {letter}
      </pre>
    </section>
  );
}

/** Pre-formatted price suffix for the kit's target (lib/format owns the mapping). */
function priceUnitLabelFor(kit: SwitchKit): string {
  // Reconstruct a minimal Plan shape to reuse the single source of truth.
  const plan = {
    cat: kit.category,
    priceUnit: kit.priceUnit,
  } as unknown as Plan;
  return priceUnitLabel(plan);
}

/**
 * The "full guide" deep link to the AEO /switch/[provider] page (which we LINK to,
 * never edit). We resolve a known provider name → its readable slug; an unknown or
 * Hebrew-only name (whose slug we can't be sure pre-rendered) falls back to the
 * /switch hub so we never link to a 404 (the AEO guide has dynamicParams:false).
 */
function switchGuideHref(name: string): string {
  const overrides: Record<string, string> = {
    סלקום: "cellcom",
    פרטנר: "partner",
    פלאפון: "pelephone",
    "גולן טלקום": "golan",
    "הוט מובייל": "hot-mobile",
    "רמי לוי": "rami-levy",
    "וואלה מובייל": "walla-mobile",
    בזק: "bezeq",
    גילת: "gilat",
    "019 מובייל": "019mobile",
  };
  const trimmed = (name ?? "").trim();
  if (overrides[trimmed]) return `/switch/${overrides[trimmed]}`;
  const ascii = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // Only deep-link when we produced a real ASCII slug; otherwise the hub.
  return ascii ? `/switch/${ascii}` : "/switch";
}
