// ────────────────────────────────────────────────────────────────────────────
// /esim-abroad — the eSIM-FOR-ABROAD subcategory landing. Web-app counterpart of
// the static site/esim-abroad.html: digital eSIM travel packages you install
// before you fly, cheaper than roaming. A TRUTHFULLY-filtered table (abroad plans
// whose provider/name/feats mention eSIM / Airalo) and a hand-off to the parent
// /compare/abroad hub. Mirrors the static page, adapted to the app's components
// + mobile-first, RTL.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): the table shows only REAL
// catalogue abroad plans whose own fields identify them as eSIM, ascending by
// price — nothing fabricated. CategoryLanding surfaces the commission disclosure
// + price caveat, and the table shows an honest empty state when none match.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import CategoryLanding from "@/components/CategoryLanding";
import FreshnessBadge from "@/components/FreshnessBadge";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import { plansByCategory, CATEGORY_HE } from "@/lib/data";
import {
  collectionPageSchema,
  categoryAggregateOfferSchema,
  breadcrumbSchema,
} from "@/lib/schema";
import { pageMetadata, categoryMetaDescription } from "@/lib/seo";
import { lastDataDate } from "@/lib/aeo";
import { getLivePlans } from "@/lib/live-catalogue";
import type { Plan } from "@/lib/types";

const CATEGORY = "abroad";
const TITLE_HE = "חבילות eSIM לחו״ל";

// ISR: regenerate the static HTML hourly so the featured table + ₪ figures read
// from the live DB catalogue (with the bundled snapshot as a resilient fallback)
// and never drift stale vs the live /compare hub.
export const revalidate = 3600;

/** Whether an abroad plan's own fields identify it as an eSIM package. */
function isEsim(p: Plan): boolean {
  if (typeof p.price !== "number") return false;
  const net = typeof p.net === "string" ? p.net : "";
  const haystack = [p.provider, p.plan, net, (p.feats ?? []).join(" ")].join(" ");
  return /esim|איראלו|airalo/i.test(haystack);
}

/** Cheapest abroad eSIM packages, priced first. */
function esimPlans(all: Plan[], limit = 15): Plan[] {
  return all
    .filter((p): p is Plan => isEsim(p))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "חבילות eSIM לחו״ל — השוואת מחירים",
  // Fact-dense, truth-only TL;DR derived from the SAME filtered (eSIM) plans the
  // page renders — real count, provider sample and ₪ floor, never fabricated.
  description:
    categoryMetaDescription(CATEGORY, {
      plans: plansByCategory(CATEGORY).filter(isEsim),
    }) ??
    "חבילות eSIM דיגיטליות לכל יעד — ממוינות מהזול ביותר. מתקינים מראש, נוחתים " +
      "ומחוברים, וחוסכים מול רומינג. כולל המחיר אחרי המבצע. השוואה חינמית.",
  path: "/esim-abroad",
});

export default async function EsimAbroadPage() {
  // ── ONE live catalogue read per render (bundled fallback on any failure) ──────
  const { plans: catalogue } = await getLivePlans({ category: CATEGORY });
  const all = catalogue.length ? catalogue : plansByCategory(CATEGORY);
  const plans = esimPlans(all);
  // Real "data as of" date (catalogue updated_at, else build-time UTC) — drives
  // BOTH the visible <FreshnessBadge> and the schema's temporalCoverage month, so
  // the structured data can never disagree with what the human reads.
  const asOf = lastDataDate(plans);
  // Category-scoped AggregateOffer (price range across the REAL featured plans).
  // Returns null when no plan is priced; rendered conditionally so nothing false
  // is emitted.
  const categoryOffer = categoryAggregateOfferSchema(plans, CATEGORY, {
    temporalCoverage: asOf.slice(0, 7),
  });

  const crumbs = [
    { name: "בית", url: "/" },
    { name: CATEGORY_HE[CATEGORY], url: `/compare/${CATEGORY}` },
    { name: "eSIM", url: "/esim-abroad" },
  ];

  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל חבילות החו״ל — טבלה מלאה" },
    { href: "/abroad-daily", label: "חבילות חו״ל יומיות" },
    { href: "/cellular-with-abroad", label: "מסלולי סלולר שכוללים חו״ל" },
    { href: "/glossary/esim", label: "מה זה eSIM?" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל חבילות החו״ל",
      hint: `${all.length} חבילות מכל הספקים, ממוין מהזול.`,
    },
    { href: "/abroad-daily", label: "חבילות חו״ל יומיות", hint: "לנסיעות קצרות של ימים ספורים." },
    { href: "/glossary/roaming", label: "מה זה רומינג?", hint: "ההבדל מול eSIM, בקצרה." },
    { href: "/abroad", label: "עמוד החו״ל הראשי", hint: "כל תתי-הקטגוריות במקום אחד." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "חבילות eSIM דיגיטליות לחו״ל לכל יעד — ממוינות מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/esim-abroad",
          plans,
        })}
      />
      {/* Category AggregateOffer — a single "prices range ₪low–₪high across N
          plans" node for the featured set, in ILS, stamped with the real
          catalogue month. Omitted when no plan is priced. */}
      {categoryOffer && <JsonLd data={categoryOffer} />}
      <JsonLd data={breadcrumbSchema(crumbs)} />

      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="underline underline-offset-2 hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <Link href={`/compare/${CATEGORY}`} className="underline underline-offset-2 hover:text-accent">
          {CATEGORY_HE[CATEGORY]}
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">eSIM</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת חבילות
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          חבילות eSIM לחו״ל
        </h1>
      </header>

      {/* ── Freshness stamp (honest "data as of" date, near the table) ────── */}
      <div className="mt-6">
        <FreshnessBadge date={asOf} />
      </div>

      <div className="mt-4">
        <CategoryLanding
          category={CATEGORY}
          titleHe={TITLE_HE}
          intro="eSIM זול בהרבה מרומינג רגיל ומותקן עוד לפני שיוצאים מהבית — נוחתים ומחוברים. הטבלה מציגה רק חבילות חו״ל שמסומנות בקטלוג כ-eSIM, ממוינות מהזול ליקר. ודאו שהמכשיר שלכם תומך ב-eSIM, ובדקו את היעדים ונפח הגלישה הנכללים מול הספק לפני הנסיעה."
          plans={plans}
          subcats={subcats}
        />
      </div>

      <RelatedAuthorityPages
        heading="עמודים קשורים"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />
    </main>
  );
}
