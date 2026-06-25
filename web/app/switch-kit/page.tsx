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
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import { getPlans, getProviders, getCategories } from "@/lib/data";
import { priceUnitLabel } from "@/lib/format";
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
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">ערכת מעבר</span>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────────
          Intent eyebrow → H1 focal point → factual promise → an honest amber
          VALUE rail (qualitative — the move is free; no fabricated figure). ──── */}
      <header className="mt-3">
        <p className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3.5 py-1.5 text-sm font-semibold text-accent-text">
          <Icon name="spark" size={16} />
          ערכת מעבר אישית
        </p>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          ערכת מעבר — מוכנה לשליחה על ידיכם
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-foreground">
          בחרו את הספק הנוכחי ומסלול יעד אמיתי מהקטלוג, וקבלו מכתב ניתוק לבדיקה,
          צ׳קליסט ניוד מספר, מועדים חשובים וטראקר התקדמות. מבוסס על זכויות הצרכן
          בישראל — בלי מספרי טלפון מומצאים, ואנחנו אף פעם לא שולחים את המכתב במקומכם.
        </p>
        <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-value/30 bg-value/10 px-3.5 py-1.5 text-sm font-semibold text-value-text">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-value" />
          ניוד המספר חינמי — והערכה מבוססת על מחירים אמיתיים מהקטלוג
        </p>
      </header>

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
      <section aria-labelledby="kit-builder-h" className="mt-10">
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
