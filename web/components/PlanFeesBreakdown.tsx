// ────────────────────────────────────────────────────────────────────────────
// <PlanFeesBreakdown> — the UPFRONT equipment & one-time-fees card for the plan
// detail page. The web mirror of the Flutter `_PaymentsEquipmentSection`
// (lib/pages/plan_detail/plan_detail_widget.dart): a clean, labelled breakdown of
// the carrier's התקנה / נתב / ממיר / מגדיל טווח / דמי חיבור so the buyer sees the
// real cost of getting connected BEFORE committing — never buried.
//
// PRESENTATIONAL + TRUTH-ONLY: it renders exactly the `fees` rows it is handed
// (each already a real `{label, value}` off the catalogue's `plan.fees`, via
// `fee()` in lib/plan-display). It fabricates nothing, omits entirely when there
// are no fees, and adds only a neutral, decorative per-row glyph — no provider
// brand color is ever introduced or recolored here.
//
// App tokens (surface / ink / muted / border), RTL by default, AA contrast, and
// NO animation. Server-renderable (no client hooks).
// ────────────────────────────────────────────────────────────────────────────

/** One labelled fee/equipment row, e.g. `{ label: "נתב", value: "ללא עלות" }`. */
export interface PlanFee {
  /** The Hebrew fee label, e.g. "התקנה" / "נתב" / "ממיר" / "דמי חיבור". */
  label: string;
  /** The non-empty display value, e.g. "₪199" / "ללא עלות" / "חד-פעמי". */
  value: string;
}

export interface PlanFeesBreakdownProps {
  /** The real equipment / one-time fee rows to show. Empty → renders nothing. */
  fees: PlanFee[];
  /** Optional extra classes on the outer card. */
  className?: string;
}

/**
 * A small, neutral, decorative glyph chosen by the fee label — the web mirror of
 * the Flutter `_feeIcon` mapping (router / install / sim / link / equipment …).
 * Purely illustrative: `aria-hidden`, inherits `currentColor` (the muted token),
 * and is NEVER a provider brand mark. Falls back to a generic receipt glyph.
 */
function FeeGlyph({ label }: { label: string }) {
  const l = label.toLowerCase();
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };

  // נתב / ראוטר → router (a box with signal arcs).
  if (l.includes("נתב") || l.includes("ראוטר") || l.includes("router")) {
    return (
      <svg {...common}>
        <rect x="3" y="14" width="18" height="6" rx="1.5" />
        <path d="M7 17h.01M11 17h2" />
        <path d="M9 10a4 4 0 0 1 6 0M6.5 7.5a8 8 0 0 1 11 0" />
      </svg>
    );
  }
  // התקנה → install (a wrench).
  if (l.includes("התקנה") || l.includes("install")) {
    return (
      <svg {...common}>
        <path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8 7.2 20l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.2-.4-.4-2.2Z" />
      </svg>
    );
  }
  // sim / סים → sim card.
  if (l.includes("sim") || l.includes("סים")) {
    return (
      <svg {...common}>
        <path d="M9 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6Z" />
        <rect x="9" y="11" width="6" height="6" rx="1" />
      </svg>
    );
  }
  // ממיר / ציוד / מקלט → equipment (a small device).
  if (l.includes("ממיר") || l.includes("ציוד") || l.includes("מקלט")) {
    return (
      <svg {...common}>
        <rect x="3" y="7" width="18" height="10" rx="2" />
        <path d="M7 17v2M17 17v2M16 12h.01" />
      </svg>
    );
  }
  // חיבור / הצטרפות / ניתוק / מגדיל טווח → link / connection.
  if (
    l.includes("חיבור") ||
    l.includes("הצטרפות") ||
    l.includes("ניתוק") ||
    l.includes("מגדיל") ||
    l.includes("טווח")
  ) {
    return (
      <svg {...common}>
        <path d="M10 13a4 4 0 0 0 5.7.3l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.5 1.5" />
        <path d="M14 11a4 4 0 0 0-5.7-.3L5.7 13.3a4 4 0 0 0 5.7 5.7l1.5-1.5" />
      </svg>
    );
  }
  // Fallback → receipt / one-time charge.
  return (
    <svg {...common}>
      <path d="M6 3h12v18l-3-1.5L12 21l-3-1.5L6 21V3Z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}

/**
 * Renders the upfront equipment / one-time-fees breakdown card. Returns `null`
 * when `fees` is empty so the detail page never shows an empty shell — the
 * "omit absent" truth rule.
 */
export function PlanFeesBreakdown({ fees, className }: PlanFeesBreakdownProps) {
  if (!fees || fees.length === 0) return null;

  return (
    <section
      dir="rtl"
      aria-label="תשלומים וציוד"
      className={[
        "rounded-2xl border border-border/60 bg-surface p-4 elevate-card sm:p-5",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <div className="flex flex-col">
        <h3 className="font-display text-sm font-semibold tracking-tight text-ink">
          תשלומים וציוד
        </h3>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
          התקנה, נתב ותשלומים חד-פעמיים
        </p>
      </div>

      <ul className="mt-3 flex flex-col">
        {fees.map((f, i) => (
          <li
            key={`${f.label}-${i}`}
            className="flex items-start gap-3 border-t border-border/50 py-3 first:border-t-0 first:pt-0 last:pb-0"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background text-muted"
            >
              <FeeGlyph label={f.label} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[13px] font-semibold text-foreground">
                {f.label}
              </span>
              <span className="text-[13px] leading-relaxed text-muted">
                {f.value}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default PlanFeesBreakdown;
