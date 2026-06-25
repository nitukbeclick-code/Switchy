"use client";

// ────────────────────────────────────────────────────────────────────────────
// <NegotiateClient> — the interactive retention coach. The user picks a service,
// (optionally) their provider, and (optionally) their current bill; we POST to
// /api/negotiate, which derives a GROUNDED script from the REAL catalogue: the
// cheapest comparable plan (the market floor) + their own provider's cheapest
// comparable plan. We then render the ordered talking points + the real evidence.
//
// E-E-A-T / HONESTY (ABSOLUTE):
//   • Every number/plan/provider shown is a real catalogue row returned by the
//     API — nothing is fabricated client-side.
//   • The saving is framed as an upper-bound ESTIMATE vs. the market floor and is
//     shown only when the user supplied a real bill. The "not a promise — the
//     decision is the provider's" framing is shown prominently.
//   • No PII leaves the browser beyond the (optional) provider/bill the user
//     types to compute the script — there is no lead capture here. The explicit
//     hand-off is a link to the existing consent-gated flows.
//
// Design: premium-2026 bento/card surfaces. Amber = VALUE (the saving figure);
// green = ACTION (the compute CTA + onward links). Dark-mode safe (CSS-variable
// colors) + RTL. a11y: every control has a <label>; results announce via
// aria-live; the copy-to-clipboard button has an accessible label + live status.
// ────────────────────────────────────────────────────────────────────────────

import { useId, useState } from "react";
import Link from "next/link";
import { CATEGORY_HE } from "@/lib/categories";
import {
  NEGOTIATE_CATEGORIES,
  type NegotiateCategory,
  type NegotiationScript,
} from "./lib";

/** The catalogue providers the page passes in for the (optional) provider picker. */
export interface NegotiateClientProps {
  /** REAL provider display names present in the catalogue (for the datalist). */
  providers: string[];
}

type Status = "idle" | "loading" | "ready" | "error";

export default function NegotiateClient({ providers }: NegotiateClientProps) {
  const baseId = useId();
  const catId = `${baseId}-cat`;
  const provId = `${baseId}-prov`;
  const billId = `${baseId}-bill`;
  const abroadId = `${baseId}-abroad`;
  const listId = `${baseId}-prov-list`;

  const [category, setCategory] = useState<NegotiateCategory>("cellular");
  const [provider, setProvider] = useState("");
  const [bill, setBill] = useState("");
  const [abroad, setAbroad] = useState(false);

  const [status, setStatus] = useState<Status>("idle");
  const [script, setScript] = useState<NegotiationScript | null>(null);
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    setCopied(false);
    const billNum = Number(String(bill).replace(/[^\d.]/g, ""));
    try {
      const res = await fetch("/api/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          provider: provider.trim() || undefined,
          currentBill: Number.isFinite(billNum) && billNum > 0 ? billNum : undefined,
          abroad,
        }),
      });
      const data = (await res.json()) as
        | { ok: true; script: NegotiationScript }
        | { ok: false; error?: string };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setError(
          ("error" in data && data.error) ||
            "לא הצלחנו לבנות תסריט כרגע. נסו קטגוריה אחרת.",
        );
        setScript(null);
        return;
      }
      setScript(data.script);
      setStatus("ready");
    } catch {
      setStatus("error");
      setError("שגיאת רשת. בדקו את החיבור ונסו שוב.");
      setScript(null);
    }
  }

  /** Copy the full script (talking points + framing) as plain text. */
  async function onCopy() {
    if (!script) return;
    const lines = [
      `תסריט מיקוח — ${script.categoryHe}${script.provider ? ` (${script.provider})` : ""}`,
      "",
      ...script.steps.map((s, i) => `${i + 1}. ${s}`),
      "",
      script.framing,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      {/* ── The form ──────────────────────────────────────────────────────── */}
      <form onSubmit={onSubmit} className="bento p-6 sm:p-7">
        <div className="grid gap-5 sm:grid-cols-2">
          {/* Category (required) */}
          <div>
            <label htmlFor={catId} className="block text-sm font-medium text-foreground">
              איזה שירות?
            </label>
            <select
              id={catId}
              value={category}
              onChange={(e) => setCategory(e.target.value as NegotiateCategory)}
              className="interactive mt-1.5 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-foreground focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              {NEGOTIATE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_HE[c] ?? c}
                </option>
              ))}
            </select>
          </div>

          {/* Provider (optional) */}
          <div>
            <label htmlFor={provId} className="block text-sm font-medium text-foreground">
              הספק הנוכחי שלכם{" "}
              <span className="font-normal text-muted">(לא חובה)</span>
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

          {/* Current bill (optional) */}
          <div>
            <label htmlFor={billId} className="block text-sm font-medium text-foreground">
              החשבון החודשי שלכם בקטגוריה (₪){" "}
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

          {/* Abroad toggle (optional) */}
          <div className="flex items-end">
            <label
              htmlFor={abroadId}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <input
                id={abroadId}
                type="checkbox"
                checked={abroad}
                onChange={(e) => setAbroad(e.target.checked)}
                className="interactive h-4 w-4 shrink-0 accent-[var(--accent)]"
              />
              <span className="text-sm text-foreground">
                חשובה לי גלישה/שיחות בחו״ל
              </span>
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={status === "loading"}
          aria-busy={status === "loading"}
          className="interactive press mt-6 inline-flex items-center justify-center rounded-xl bg-accent px-6 py-3 font-semibold text-accent-contrast shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          {status === "loading" ? "בונה תסריט…" : "בנו לי תסריט מיקוח ←"}
        </button>

        <p className="mt-3 text-xs leading-relaxed text-muted">
          התסריט מבוסס על מחירים אמיתיים מתוך הקטלוג שלנו. לא נשמרים פרטים — מה שאתם
          מקלידים נשאר בדפדפן שלכם.
        </p>
      </form>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {status === "error" && (
        <p
          role="alert"
          className="bento mt-6 border border-border p-5 text-foreground"
        >
          {error}{" "}
          <Link
            href="/compare"
            className="interactive font-medium text-accent-text underline hover:text-accent-hover"
          >
            עברו להשוואה המלאה ←
          </Link>
        </p>
      )}

      {/* ── Result ────────────────────────────────────────────────────────── */}
      <div aria-live="polite">
        {status === "ready" && script && (
          <ScriptResult script={script} copied={copied} onCopy={onCopy} />
        )}
      </div>
    </div>
  );
}

/** Render the grounded script: evidence cards + ordered talking points + framing. */
function ScriptResult({
  script,
  copied,
  onCopy,
}: {
  script: NegotiationScript;
  copied: boolean;
  onCopy: () => void;
}) {
  const { marketRate, sameProvider } = script;
  return (
    <section className="mt-8" aria-labelledby="script-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="script-h"
          className="font-display text-xl font-bold tracking-tight text-ink"
        >
          התסריט שלכם — {script.categoryHe}
          {script.provider ? ` · ${script.provider}` : ""}
        </h2>
        <button
          type="button"
          onClick={onCopy}
          className="interactive press inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="העתקת התסריט המלא ללוח"
        >
          {copied ? "הועתק ✓" : "העתקת התסריט"}
        </button>
      </div>
      <span role="status" className="sr-only">
        {copied ? "התסריט הועתק ללוח" : ""}
      </span>

      {/* Real market evidence — the numbers the script stands on. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <EvidenceCard
          title="המחיר הזול בשוק"
          subtitle="נקודת הייחוס למיקוח (כל הספקים)"
          provider={marketRate.provider}
          plan={marketRate.plan}
          price={marketRate.price}
          priceUnit={marketRate.priceUnit}
          after={marketRate.after}
          savingUpTo={script.hasBaseline ? marketRate.annualSavingUpTo : 0}
        />
        {sameProvider ? (
          <EvidenceCard
            title={`המחיר הזול אצל ${script.provider}`}
            subtitle="בקשו את המחיר הזה מהספק שלכם"
            provider={sameProvider.provider}
            plan={sameProvider.plan}
            price={sameProvider.price}
            priceUnit={sameProvider.priceUnit}
            after={sameProvider.after}
            savingUpTo={script.hasBaseline ? sameProvider.annualSavingUpTo : 0}
          />
        ) : (
          <div className="card flex items-center p-5 text-sm leading-relaxed text-muted">
            {script.provider
              ? `לא מצאנו מסלול פעיל של ${script.provider} בקטגוריה הזו, אז המחיר בשוק הוא נקודת ההשוואה.`
              : "הוסיפו את שם הספק שלכם כדי לראות גם את המחיר הזול ביותר שלו עצמו לבקש להתאים."}
          </div>
        )}
      </div>

      {/* The ordered talking points. */}
      <ol className="mt-6 grid gap-3">
        {script.steps.map((step, i) => (
          <li key={i} className="card flex gap-3 p-4">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 font-display text-sm font-bold text-accent-text"
            >
              {i + 1}
            </span>
            <span className="text-sm leading-relaxed text-foreground">{step}</span>
          </li>
        ))}
      </ol>

      {/* Honesty framing — prominent, never hidden. */}
      <p className="mt-5 rounded-xl border border-value/30 bg-value/5 p-4 text-sm leading-relaxed text-foreground">
        <span className="font-semibold text-value-text">לתשומת לבכם: </span>
        {script.framing}
      </p>

      {/* Onward — no dead-ends; the explicit consent-gated hand-offs. */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href={`/compare/${script.category}`}
          className="interactive press inline-flex items-center justify-center rounded-xl bg-accent px-5 py-3 font-semibold text-accent-contrast shadow-sm transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          להשוואת כל מסלולי {script.categoryHe} ←
        </Link>
        <Link
          href="/quiz"
          className="interactive press inline-flex items-center justify-center rounded-xl border border-border px-5 py-3 font-semibold text-foreground transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          קבלו התאמה אישית והשאירו פרטים
        </Link>
      </div>
    </section>
  );
}

/** A single real-catalogue evidence card (market floor / same-provider). */
function EvidenceCard({
  title,
  subtitle,
  provider,
  plan,
  price,
  priceUnit,
  after,
  savingUpTo,
}: {
  title: string;
  subtitle: string;
  provider: string;
  plan: string;
  price: number;
  priceUnit: string;
  after: number | null;
  savingUpTo: number;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
        {title}
      </p>
      <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
      <p className="mt-3 font-display text-2xl font-bold tracking-tight text-ink">
        ₪{price}
        <span className="mr-1 text-sm font-medium text-muted"> {priceUnit}</span>
      </p>
      <p className="mt-1 text-sm text-foreground">
        {provider} — {plan}
      </p>
      {after != null && after > price ? (
        <p className="mt-1 text-xs text-muted">
          המחיר לאחר המבצע: ₪{after} {priceUnit}
        </p>
      ) : null}
      {savingUpTo > 0 ? (
        <p
          className="mt-3 inline-block rounded-full bg-value/10 px-2.5 py-0.5 text-xs font-semibold text-value-text"
          aria-label={`חיסכון שנתי מוערך עד ₪${savingUpTo} בשנה`}
        >
          חיסכון מוערך עד ₪{savingUpTo}/שנה
        </p>
      ) : null}
    </div>
  );
}
