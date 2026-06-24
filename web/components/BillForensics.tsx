// ────────────────────────────────────────────────────────────────────────────
// <BillForensics> — the itemized anomaly report for the /bills result.
//
// Renders the output of lib/bill-forensics.ts (a PURE analyzer over the parsed
// bill + the REAL catalogue): a per-finding card — "אתה משלם ₪X מיותר על שורה Y",
// expired-promo + unused-service flags, each with its real ₪ delta — plus a
// total-overpay summary headline.
//
// HONESTY (E-E-A-T, ABSOLUTE):
//   • Every ₪ figure comes from the lib, which only ever flags a REAL delta vs the
//     real catalogue. This component fabricates NOTHING and adds no number.
//   • INFERRED findings (the lib marks them confidence:"likely") are visibly
//     framed with "ייתכן" in their title AND carry a small "הערכה" pill, so the
//     user can tell an asserted overpay from a hunch.
//   • A standing caveat states the read is automatic and must be verified against
//     the real bill — this is decision-support, never legal/financial advice, and
//     we NEVER auto-act (no cancellation is sent; the user reviews + decides).
//   • When nothing is wrong it says so plainly ("נראה שאתה משלם מחיר הוגן") rather
//     than inventing a problem.
//
// A11y: a labelled <section role="region">, each flag is a list item with a
// decorative (aria-hidden) severity glyph, the headline saving is announced once,
// and the "הערכה" pill has a Semantics-equivalent visible label. RTL + dark are
// inherited from the layout tokens (text-ink / text-muted / bg-surface / border).
// ────────────────────────────────────────────────────────────────────────────

import {
  type ForensicsFlag,
  type ForensicsReport,
  type ForensicsSuggestion,
  ils,
} from "@/lib/bill-forensics";

export interface BillForensicsProps {
  /** The report from analyzeBill() — the single source of truth for this view. */
  report: ForensicsReport;
  /** Optional extra classes on the wrapper. */
  className?: string;
}

/** Per-severity decorative glyph + accent class (dark-safe via tokens). */
function severityStyle(flag: ForensicsFlag): { glyph: string; accent: string } {
  switch (flag.severity) {
    case "alert":
      return { glyph: "⚠️", accent: "border-l-value" };
    case "warn":
      return { glyph: "⚠️", accent: "border-l-value/70" };
    case "info":
    default:
      return { glyph: "ℹ️", accent: "border-l-border-strong/50" };
  }
}

/** A small "הערכה" pill marking an INFERRED ("ייתכן") finding, distinct from a confirmed ₪ delta. */
function InferredPill() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-value/12 px-2 py-0.5 text-[11px] font-medium text-value-text"
      title="הערכה מבוססת-נתונים — לא קביעה ודאית. כדאי לבדוק מול הספק."
    >
      <span aria-hidden="true">≈</span>
      הערכה
    </span>
  );
}

/** One finding card. */
function FlagCard({ flag }: { flag: ForensicsFlag }) {
  const { glyph, accent } = severityStyle(flag);
  const inferred = flag.confidence === "likely";
  return (
    <li
      className={[
        "rounded-xl border border-border/60 border-l-4 bg-surface p-4",
        accent,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span aria-hidden="true" className="mt-0.5 shrink-0 text-base leading-none">
            {glyph}
          </span>
          <h4 className="font-display text-sm font-semibold leading-snug tracking-tight text-ink">
            {flag.title}
          </h4>
        </div>
        {inferred && <InferredPill />}
      </div>

      <p className="mt-2 text-xs leading-relaxed text-muted">{flag.detail}</p>

      {flag.annual > 0 && (
        <p className="mt-2 text-xs font-medium text-value-text">
          {inferred ? "חיסכון פוטנציאלי" : "חיסכון"} עד {ils(flag.annual)} בשנה
        </p>
      )}
    </li>
  );
}

/** The "best alternative" line — the single cheapest real plan, when one exists. */
function BestAlternative({ best }: { best: ForensicsSuggestion }) {
  return (
    <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <div className="min-w-0">
        <p className="text-xs text-muted">החלופה הזולה ביותר שמצאנו</p>
        <p className="truncate font-medium text-ink">
          {best.name} · {best.provider}
        </p>
      </div>
      <div className="text-end">
        <p className="text-base font-bold text-ink">{ils(best.price)}</p>
        {best.annualSaving > 0 && (
          <p className="text-xs font-medium text-value-text">
            חיסכון {ils(best.annualSaving)} בשנה
          </p>
        )}
      </div>
    </div>
  );
}

export default function BillForensics({ report, className }: BillForensicsProps) {
  // Nothing to analyze (unreadable / ₪0 spend) — render nothing; the uploader's
  // own "couldn't read" state covers that case.
  if (!report.readable) return null;

  const hasFlags = report.flags.length > 0;

  return (
    <section
      aria-label="ניתוח החשבון — איתור חיובים מיותרים"
      className={["bento p-6", className ?? ""].join(" ").trim()}
    >
      <header>
        <h3 className="font-display text-lg font-bold tracking-tight text-ink">
          ניתוח מעמיק של החשבון
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          בדקנו את הסכום שאתה משלם מול {report.categoryLabel || "הקטלוג"} שלנו
          ואיתרנו היכן ייתכן שאתה משלם יותר מהנדרש.
        </p>
      </header>

      {/* ── Total-overpay headline (announced once) ─────────────────────────── */}
      {report.totalAnnualOverpay > 0 ? (
        <p
          role="status"
          className="mt-4 rounded-xl border border-value/30 bg-value/8 p-4 text-sm leading-relaxed text-ink"
        >
          {report.allInferred ? "ייתכן שאתה משלם " : "אתה משלם "}
          <strong className="text-value-text">
            {ils(report.totalMonthlyOverpay)} מיותר בחודש
          </strong>{" "}
          — כ-
          <strong className="text-value-text">
            {ils(report.totalAnnualOverpay)} בשנה
          </strong>
          {report.allInferred ? " (הערכה, כדאי לבדוק)." : "."}
        </p>
      ) : (
        // No real overpay found → say so plainly. We never invent a problem.
        <p
          role="status"
          className="mt-4 rounded-xl border border-border/60 bg-surface p-4 text-sm leading-relaxed text-foreground"
        >
          לא מצאנו חיוב מיותר ברור מול הקטלוג שלנו — נראה שאתה משלם מחיר הוגן
          בקטגוריה הזו. עדיין כדאי להשוות מדי שנה.
        </p>
      )}

      {/* ── Itemized findings ───────────────────────────────────────────────── */}
      {hasFlags && (
        <ul className="mt-4 space-y-3">
          {report.flags.map((flag, i) => (
            <FlagCard key={`${flag.kind}-${i}`} flag={flag} />
          ))}
        </ul>
      )}

      {/* ── Best real alternative ───────────────────────────────────────────── */}
      {report.bestAlternative && <BestAlternative best={report.bestAlternative} />}

      {/* ── Standing caveat — automatic read, verify, never auto-act ────────── */}
      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <span aria-hidden="true">ℹ️</span>
        <span>
          הניתוח אוטומטי ומבוסס על הסכומים שזוהו בחשבון מול הקטלוג שלנו — ייתכנו
          טעויות קריאה. זו אינה ייעוץ משפטי או פיננסי; ודאו כל פריט מול החשבון
          ומול הספק לפני קבלת החלטה. אנחנו לא מבטלים ולא משנים דבר עבורכם —
          ההחלטה והפעולה בידיכם.
        </span>
      </p>
    </section>
  );
}
