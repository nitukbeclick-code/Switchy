// ────────────────────────────────────────────────────────────────────────────
// <AiToolsShowcase> — a mobile-first card grid surfacing the app's REAL,
// interactive tools, each linking to its existing on-site route. Reused by the
// homepage to route visitors into the high-intent flows (bill analysis, switch
// kit, matching quiz, negotiation scripts, referral).
//
// TRUTH-ONLY: every card describes a tool that actually exists at the linked
// route (each dir verified under web/app/). Copy is qualitative — no fabricated
// figures, ratings or testimonials. Brand-neutral: the app accent marks the
// action only; no carrier marks here (these are first-party tools).
//
// A11y: a single labelled <section>, a real heading, and an <ul>/<li> list of
// full-card <Link>s with visible focus rings. Motion reuses the page-level
// `.sw-reveal` entrance + `.card-interactive` hover (both reduced-motion safe,
// transform/opacity only) — no component-local animation.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";

type Tool = {
  /** Existing on-site route (verified to exist under web/app/). */
  href: string;
  /** Short Hebrew tool name. */
  title: string;
  /** One-line, truthful benefit — qualitative, no invented numbers. */
  benefit: string;
};

// Only routes that exist under web/app/ are listed here. Order mirrors the
// natural funnel: understand the bill → match a plan → act (switch / negotiate)
// → share.
const TOOLS: readonly Tool[] = [
  {
    href: "/bills",
    title: "ניתוח חשבונית",
    benefit: "מעלים תמונה של החשבון ורואים מה משלמים ואיפה אפשר לחסוך.",
  },
  {
    href: "/quiz",
    title: "התאמה חכמה",
    benefit: "כמה שאלות קצרות ומקבלים דירוג מסלולים אמיתיים מהקטלוג.",
  },
  {
    href: "/switch-kit",
    title: "ערכת מעבר",
    benefit: "מכתב ניתוק, צ׳קליסט ניוד וטראקר — מוכנים לשליחה על ידיכם.",
  },
  {
    href: "/negotiate",
    title: "משא ומתן",
    benefit: "רוצים להישאר ולשלם פחות? תסריט מיקוח מותאם לשירות שלכם.",
  },
  {
    href: "/referral",
    title: "חבר מביא חבר",
    benefit: "עזר לכם לחסוך? שתפו את Switchy AI עם מי שזה יעזור לו.",
  },
];

export function AiToolsShowcase({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="ai-tools-h"
      className={["w-full", className].filter(Boolean).join(" ")}
    >
      <h2
        id="ai-tools-h"
        className="font-display text-2xl font-bold tracking-tight text-ink"
      >
        הכלים החכמים של Switchy
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
        כלים חינמיים שעוזרים לכם להבין כמה אתם משלמים, למצוא מסלול מתאים ולפעול —
        בלי התחייבות.
      </p>

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool, i) => (
          <li key={tool.href}>
            <Link
              href={tool.href}
              className="group sw-reveal card card-interactive flex h-full flex-col p-5"
              style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
            >
              <span className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink transition-colors group-hover:text-accent">
                <span
                  aria-hidden="true"
                  className="inline-block h-4 w-1 shrink-0 rounded-full bg-accent"
                />
                {tool.title}
              </span>
              <span className="mt-2 block text-sm leading-relaxed text-foreground">
                {tool.benefit}
              </span>
              <span className="mt-auto pt-4 inline-flex items-center gap-1 text-sm font-medium text-accent-text transition-transform group-hover:-translate-x-0.5">
                לכלי ←
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default AiToolsShowcase;
