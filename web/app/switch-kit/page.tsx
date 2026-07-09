// ────────────────────────────────────────────────────────────────────────────
// /switch-kit — "ערכת מעבר" (Switch Autopilot). An interactive kit that turns a
// REAL current provider + a REAL target plan into a personalised switch packet:
// a cancellation letter to REVIEW + send yourself, the ניוד-מספר / disconnection
// checklist, the factual switch steps + honest key-dates, and a TRACKER whose
// progress persists locally.
//
// This server component owns the SEO shell (self-canonical metadata via lib/seo,
// WebPage + HowTo + Breadcrumb JSON-LD, the SGE summary, honest trust signals) and
// renders the client <SwitchKitClient> for the interactive part. The packet is
// built (server-side, from the bundled catalogue) by lib/switch-kit, which mirrors
// the edge brain (_shared/switch.ts) so the Autopilot + the public AEO /switch
// guide never tell two different stories.
//
// HONESTY (E-E-A-T): this is helpful-content grounded in real Israeli consumer
// rights (זכות הניתוק; ניוד מספר via מסלקת הניוד handled by the NEW provider;
// no-commitment = no penalty vs commitment = only the remaining commitment). We
// invent NO phone numbers, NO exact in-app steps, NO fabricated timelines, and we
// NEVER auto-send the letter — the USER reviews + sends it. Every packet carries
// the "הנחיה כללית, לא ייעוץ משפטי" disclaimer + links to the provider's OFFICIAL
// site. We LINK to (never edit) the AEO /switch/[provider] guide. RTL + dark-safe.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import TrustSignals from "@/components/TrustSignals";
import Icon from "@/components/Icon";
import TrackedCtaLink from "@/components/TrackedCtaLink";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import { getPlans, getProviders, getCategories } from "@/lib/data";
import { ils, priceUnitLabel } from "@/lib/format";
import { breadcrumbSchema, webPageSchema, howToSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { SWITCH_KIT_CATEGORIES } from "@/lib/switch-kit";
import SwitchKitClient, { type SwitchPlanOption } from "./SwitchKitClient";

const PAGE_PATH = "/switch-kit";
const REVIEWED_AT = new Date().toISOString().slice(0, 10);

export const metadata: Metadata = pageMetadata({
  title: "ערכת מעבר: מכתב ניתוק, צ׳קליסט ניוד וטראקר — מוכן לשליחה",
  description:
    "בחרו את הספק הנוכחי ומסלול יעד אמיתי מהקטלוג, וקבלו ערכת מעבר אישית: מכתב " +
    "ניתוק מוכן לבדיקה ושליחה על ידיכם, צ׳קליסט ניוד מספר, מועדים חשובים וטראקר " +
    "התקדמות. מבוסס על זכויות הצרכן בישראל — בלי מספרים מומצאים, בלי שליחה אוטומטית.",
  path: PAGE_PATH,
});

export default function SwitchKitPage() {
  // REAL catalogue totals for the honest trust block (no fabricated figures).
  const allPlans = getPlans();
  const providers = getProviders();
  const planCount = allPlans.length;
  const providerCount = providers.length;
  const categoryCount = getCategories().length;

  // Real provider display names for the "from" picker.
  const providerNames = providers
    .map((p) => p.name)
    .sort((a, b) => a.localeCompare(b, "he"));

  // Real target plans, trimmed to what the client picker + cards need. Restricted
  // to switch-kit categories (no electricity) and to priced rows.
  const kitCats = new Set<string>(SWITCH_KIT_CATEGORIES);
  const planOptions: SwitchPlanOption[] = allPlans
    .filter(
      (p) =>
        kitCats.has(p.cat) && typeof p.price === "number" && Number.isFinite(p.price),
    )
    .map((p) => ({
      id: String(p.id),
      cat: p.cat as SwitchPlanOption["cat"],
      provider: p.provider,
      plan: p.plan,
      price: p.price,
      after: typeof p.after === "number" ? p.after : null,
      priceUnit: priceUnitLabel(p),
    }));

  // Real catalogue entry price for the hero VALUE clause (cheapest MONTHLY
  // switch-kit target). Restricted to per-month rows so the hardcoded "לחודש"
  // suffix in the hero stays truthful — the switch-kit set includes 'abroad'
  // plans priced per-minute/day/package, whose price must never be labelled
  // monthly. Never a fabricated figure — derived from the priced rows above.
  const monthlyOptions = planOptions.filter((p) => p.priceUnit === "לחודש");
  const minFeatured = monthlyOptions.reduce(
    (min, p) => (p.price < min ? p.price : min),
    monthlyOptions.length ? monthlyOptions[0].price : 0,
  );

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "ערכת מעבר", url: PAGE_PATH },
  ];

  const summary =
    "ערכת המעבר הופכת החלטה למוכנה לשליחה: בוחרים את הספק הנוכחי ומסלול יעד " +
    "אמיתי מהקטלוג, ומקבלים מכתב ניתוק מוכן (שאתם בודקים ושולחים בעצמכם), צ׳קליסט " +
    "ניוד מספר, מועדים חשובים וטראקר שמסמן את ההתקדמות. הכול מבוסס על זכויות הצרכן " +
    "בישראל — זכות הניתוק, ניוד מספר חינמי דרך מסלקת הניוד שמתבצע מול הספק החדש, " +
    "ובלי קנסות מעבר ליתרת ההתחייבות. אנחנו לא ממציאים מספרים או שלבים ולא שולחים " +
    "כלום במקומכם.";

  // HowTo: the real steps the kit walks the user through (truthful — these mirror
  // the kit's switchSteps + the live AEO /switch guide).
  const howTo = howToSchema({
    name: "איך עוברים ספק תקשורת עם ערכת המעבר",
    description:
      "חמישה שלבים שמתרגמים מסלול יעד אמיתי למכתב ניתוק, צ׳קליסט ניוד ומעקב התקדמות.",
    url: PAGE_PATH,
    steps: [
      {
        name: "בדקו את תנאי ההתקשרות שלכם",
        text: "אתרו את מסמך תנאי ההתקשרות ובדקו אם המסלול עם התחייבות או בלעדיה — זה קובע אם יש חיוב על יתרת ההתחייבות.",
      },
      {
        name: "בחרו ספק חדש והשוו חלופות",
        text: "בחרו מסלול יעד אמיתי מהקטלוג. אם אתם מנייידים מספר סלולר, המעבר מתבצע דרך הספק החדש — אין צורך לנתק מראש.",
      },
      {
        name: "ניוד המספר מתבצע מול הספק החדש",
        text: "מסרו לספק החדש את המספר ופרטי הזיהוי; הוא מטפל בניוד דרך מסלקת הניוד וסוגר את החשבון הישן. הניוד חינמי ובדרך כלל תוך יום עסקים.",
      },
      {
        name: "מסרו הודעת ניתוק בכתב ותעדו אותה",
        text: "לשירות ללא ניוד (אינטרנט/טלוויזיה), מסרו הודעת ניתוק בכתב בערוצים הרשמיים ושמרו אישור/מספר פנייה.",
      },
      {
        name: "ודאו החזרת ציוד ובדקו את החשבון הסופי",
        text: "החזירו ציוד מושאל ובדקו שהחשבון הסופי משקף את מועד הניתוק ושאין חיובים מעבר ליתרת ההתחייבות.",
      },
    ],
  });

  const related = [
    {
      title: "מדריכי ניתוק לכל ספק",
      href: "/switch",
      description: "המדריך העובדתי לעזיבת כל ספק תקשורת בישראל — זכויות וצעדים.",
    },
    {
      title: "השוואת כל המסלולים",
      href: "/compare",
      description: "מרכז ההשוואה — כל שירות וכל הספקים, מחירים בשקלים.",
    },
    {
      title: "לפני שעוזבים: מיקוח על המחיר",
      href: "/negotiate",
      description: "תסריט שימור מבוסס נתונים — אם תעדיפו להישאר ולשלם פחות.",
    },
    {
      title: "שאלון התאמה אישי",
      href: "/quiz",
      description: "5 שאלות → מסלולים אמיתיים מדורגים לפי הצרכים שלכם.",
    },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      {/* Structured data: WebPage + HowTo + Breadcrumb. */}
      <JsonLd
        data={webPageSchema({
          name: "ערכת מעבר — מכתב ניתוק, צ׳קליסט ניוד וטראקר התקדמות",
          description:
            "בחרו ספק נוכחי ומסלול יעד אמיתי וקבלו ערכת מעבר אישית: מכתב ניתוק לבדיקה ושליחה, צ׳קליסט ניוד מספר, מועדים חשובים וטראקר.",
          url: PAGE_PATH,
          lastReviewed: REVIEWED_AT,
          about: "מעבר וניתוק ספק תקשורת בישראל",
        })}
      />
      {howTo && <JsonLd data={howTo} />}
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive underline underline-offset-2 hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">ערכת מעבר</span>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────────
          Flat-ink editorial hero (premium-2026): a solid deep-ink panel in BOTH
          themes with the white headline set directly on it — NO photo behind —
          and green applied ONLY to the real catalogue entry-price clause (VALUE).
          The promise is a CHECK ("בונים לכם ערכת מעבר…"), never a promised amount.
          ONE primary CTA (into the builder, this page's thesis) + ONE quiet
          secondary text link. Every figure is catalogue-derived. ──────────── */}
      <section className="relative isolate mt-3 overflow-hidden rounded-3xl border border-border/60 bg-[#111827] px-5 py-12 text-center sm:px-10 sm:py-16">
        <div className="mx-auto max-w-2xl">
          <h1 className="sw-reveal font-display text-4xl font-bold tracking-tight text-white sm:text-6xl">
            בונים לכם ערכת מעבר — מוכנה לשליחה על ידיכם.{" "}
            {minFeatured > 0 ? (
              <span className="text-[#4ade80]">מסלולים מ-{ils(minFeatured)} לחודש.</span>
            ) : null}
          </h1>
          <p
            className="sw-reveal mx-auto mt-5 max-w-2xl text-lg font-medium leading-relaxed text-white/85 sm:text-xl"
            style={{ animationDelay: "60ms" }}
          >
            בוחרים ספק נוכחי ומסלול יעד אמיתי מהקטלוג — ומקבלים מכתב ניתוק לבדיקה,
            צ׳קליסט ניוד מספר, מועדים חשובים וטראקר. אנחנו אף פעם לא שולחים את המכתב
            במקומכם.
          </p>
          <div
            className="sw-reveal mt-8 flex flex-col items-center justify-center gap-4"
            style={{ animationDelay: "120ms" }}
          >
            <a
              href="#kit-builder-h"
              className="press inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98]"
            >
              בנו את ערכת המעבר
              <Icon name="chevron" size={18} aria-hidden="true" />
            </a>
            <TrackedCtaLink
              href="/compare"
              location="hero"
              label="compare"
              className="interactive text-sm text-white/85 underline-offset-4 hover:underline"
            >
              או עברו להשוואת כל המסלולים
            </TrackedCtaLink>
          </div>
          {/* Trust band — REAL catalogue counts; the entry price carries the green
              VALUE emphasis (text-accent on ink), NOT a button. */}
          <p
            className="sw-reveal mt-8 text-sm text-white/85"
            style={{ animationDelay: "150ms" }}
          >
            {planCount} מסלולים · {providerCount} ספקים
            {minFeatured > 0 ? (
              <>
                {" · "}החל מ-
                <span className="font-display font-bold text-[#4ade80]">
                  {ils(minFeatured)}
                </span>{" "}
                לחודש
              </>
            ) : null}
          </p>
          {/* Quiet qualitative value line — muted, small green tick, no fabricated
              figure. The move itself is free; the estimate uses real prices. */}
          <p
            className="sw-reveal mt-2 inline-flex items-center gap-1.5 text-sm text-white/75"
            style={{ animationDelay: "180ms" }}
          >
            <Icon name="check" size={16} className="shrink-0 text-accent" />
            ניוד המספר חינמי — והערכה מבוססת על מחירים אמיתיים מהקטלוג
          </p>
        </div>
      </section>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="השורה התחתונה: ערכת מעבר">{summary}</SgeSummary>
      </div>

      {/* ── Trust signals — real catalogue counts + caveats ───────────────── */}
      <div className="mt-8">
        <TrustSignals
          planCount={planCount}
          providerCount={providerCount}
          categoryCount={categoryCount}
        />
      </div>

      {/* ── The kit ───────────────────────────────────────────────────────── */}
      <section aria-labelledby="kit-builder-h" className="mt-10 scroll-mt-6">
        <h2 id="kit-builder-h" className="sr-only">
          מחולל ערכת המעבר
        </h2>
        <SwitchKitClient providers={providerNames} plans={planOptions} />
      </section>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="להמשך הדרך"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />

      <p className="mt-8 text-xs text-muted">עודכן לאחרונה: {REVIEWED_AT}</p>
    </main>
  );
}
