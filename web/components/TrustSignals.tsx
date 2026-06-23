// ────────────────────────────────────────────────────────────────────────────
// <TrustSignals> — an HONEST trust / E-E-A-T block for the conversion funnel.
//
// HONESTY (ABSOLUTE): this component renders ONLY real, verifiable facts. There
// are NO invented user counts, NO fake testimonials/reviews/ratings, NO made-up
// "saved ₪X on average". Everything shown is either a catalogue-derived count
// passed in by the server page, a transparent-methodology link, the existing
// honest commission disclosure, or the standard price caveat. If a number is not
// real it is simply not shown.
//
// Server component — no client state. All counts come from props so the page
// (which already reads the catalogue) stays the single source of truth and this
// component cannot drift or fabricate.
//
// `variant`:
//   • "full"     — bordered panel: a row of real catalogue counts, the four honest
//                  trust points, the commission disclosure, and the price caveat.
//                  Use once per page (home / compare hub).
//   • "compact"  — a lean inline strip of the same real counts + methodology link.
//                  Use near a lead hand-off on dense service / city pages.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import PriceCaveat from "@/components/PriceCaveat";

export interface TrustSignalsProps {
  /** REAL catalogue counts — every value MUST be catalogue-derived, never faked. */
  planCount: number;
  providerCount: number;
  /** Number of service categories compared (e.g. 5). Optional. */
  categoryCount?: number;
  /** Visual treatment. Defaults to the full bordered panel. */
  variant?: "full" | "compact";
  /** Optional extra classes on the wrapper. */
  className?: string;
}

/** A single real, catalogue-derived stat (figure + Hebrew label). */
function Stat({ figure, label }: { figure: string; label: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        {figure}
      </span>
      <span className="mt-0.5 text-xs leading-snug text-muted sm:text-sm">
        {label}
      </span>
    </div>
  );
}

export default function TrustSignals({
  planCount,
  providerCount,
  categoryCount,
  variant = "full",
  className,
}: TrustSignalsProps) {
  const planTxt = planCount.toLocaleString("he-IL");
  const providerTxt = providerCount.toLocaleString("he-IL");
  const catTxt = categoryCount != null ? categoryCount.toLocaleString("he-IL") : null;

  // Compact strip — real counts + the transparent-methodology link only.
  if (variant === "compact") {
    return (
      <aside
        aria-label="נתוני אמון"
        className={[
          "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border/60 bg-surface px-4 py-3 text-xs text-muted sm:text-sm",
          className ?? "",
        ]
          .join(" ")
          .trim()}
      >
        <span>
          משווים{" "}
          <strong className="font-semibold text-foreground">{planTxt}</strong>{" "}
          מסלולים מ-
          <strong className="font-semibold text-foreground">{providerTxt}</strong>{" "}
          ספקים
        </span>
        <span aria-hidden="true" className="text-border-strong/40">
          ·
        </span>
        <span className="inline-flex items-center gap-1 font-medium text-accent-text">
          <span aria-hidden="true">✓</span> השוואה חינמית · ללא התחייבות
        </span>
        <Link
          href="/transparency"
          className="interactive ms-auto font-medium text-accent-text underline hover:text-accent-hover"
        >
          איך אנחנו מדרגים? ←
        </Link>
      </aside>
    );
  }

  // Full panel — counts row + honest trust points + disclosure + price caveat.
  return (
    <section
      aria-label="למה אפשר לסמוך עלינו"
      className={[
        "rounded-2xl border border-border bg-surface p-6 sm:p-7",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      {/* Real catalogue counts — the only numbers here, all verifiable. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat figure={planTxt} label="מסלולים בהשוואה" />
        <Stat figure={providerTxt} label="ספקים" />
        {catTxt && <Stat figure={catTxt} label="קטגוריות תקשורת" />}
        <Stat figure="₪0" label="עלות השימוש באתר" />
      </div>

      {/* Honest, verifiable trust points — no fabricated claims. */}
      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          {
            t: "השוואה שקופה ועובדתית",
            d: "הדירוג מתבסס על המחיר ההתחלתי בלבד — מתודולוגיה גלויה, ללא ציון איכות סמוי וללא תשלום על מיקום.",
          },
          {
            t: "מחירים אמיתיים ומלאים",
            d: "כל מחיר כולל מע״מ ומציג גם את המחיר אחרי המבצע — בלי הפתעות בסוף השנה.",
          },
          {
            t: "מבוסס קטלוג מעודכן",
            d: `הנתונים נשענים על קטלוג של ${planTxt} מסלולים מ-${providerTxt} ספקים, שמתעדכן בכל פרסום של האתר.`,
          },
          {
            t: "פנייה רק בהסכמתכם",
            d: "אנחנו פונים לספק בשמכם אך ורק אחרי שתשאירו פרטים ותאשרו זאת בטופס.",
          },
        ].map((point) => (
          <li
            key={point.t}
            className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-background/50 p-3.5"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent-text"
            >
              ✓
            </span>
            <span>
              <span className="block font-display text-sm font-semibold tracking-tight text-ink">
                {point.t}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                {point.d}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {/* Honest paid-relationship disclosure (Consumer Protection §7b) — reused,
          never reworded. */}
      <CommissionDisclosure variant="inline" className="mt-6" />

      {/* Standard price-accuracy caveat (§17). */}
      <PriceCaveat className="mt-2" />
    </section>
  );
}
