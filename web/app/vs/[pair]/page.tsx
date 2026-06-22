// ────────────────────────────────────────────────────────────────────────────
// /vs/[pair] — provider-vs-provider head-to-head comparison ("X מול Y"). One page
// per CURATED, same-category match-up (generateStaticParams over getVsPairs(),
// which is gated against the live catalogue so both sides always have real plans).
//
// Each page renders: a real side-by-side data summary (both providers' plans,
// entry prices, plan counts), a semantic ComparisonTable of every plan from both
// sides, an HONEST DATA-DERIVED verdict (who is cheaper, by how much, who has more
// options — clearly labeled as a data conclusion, NO fabricated "winner"), an
// authority truth-table, a FAQ ("מה ההבדל בין X ל-Y", "מי זול יותר") feeding
// FAQPage JSON-LD, breadcrumbs, a comparison ItemList + KnowledgeGraph JSON-LD,
// and a canonical link.
//
// HONESTY (E-E-A-T): every figure is catalogue-derived; the verdict is computed by
// vsVerdict() from the data and framed as "the choice depends on your need".
// Per-provider brand colours are NOT used — the page is in the app theme only.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import AuthorityBlock from "@/components/AuthorityBlock";
import ComparisonTable from "@/components/ComparisonTable";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import LeadForm from "@/components/LeadForm";
import { getVsPairs, getVsPair, vsVerdict } from "@/lib/vs";
import type { VsPair, VsSide } from "@/lib/vs";
import { getProviders } from "@/lib/data";
import {
  comparisonSchema,
  faqPageSchema,
  breadcrumbSchema,
  knowledgeGraphSchema,
  knowledgeWebSchema,
  SITE_URL,
  type QA,
} from "@/lib/schema";
import { GENERAL_FAQ } from "@/lib/faq";
import { ils, leadCategory } from "@/lib/format";
import type { Plan } from "@/lib/types";

// One page per curated, catalogue-gated match-up, pre-rendered at build time.
export function generateStaticParams() {
  return getVsPairs().map((p) => ({ pair: p.slug }));
}

interface Params {
  params: Promise<{ pair: string }>;
}

// The catalogue is rebuilt with the deploy; the render date is the honest
// "last reviewed" date (when the data behind this page was regenerated).
const REVIEWED_AT = new Date().toISOString().slice(0, 10);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { pair: slug } = await params;
  const pair = getVsPair(slug);
  if (!pair) return {};
  const { a, b, categoryLabel } = pair;
  const aN = a.provider.name;
  const bN = b.provider.name;
  return {
    title: `${aN} מול ${bN} — השוואת ${categoryLabel} | חוסך / Switchy`,
    description:
      `${aN} מול ${bN} ב${categoryLabel}: השוואה ישירה של מחירים ומסלולים — ` +
      `${aN} החל מ-${ils(a.minPrice)}, ${bN} החל מ-${ils(b.minPrice)}. ` +
      `מי זול יותר, מי מציע יותר אפשרויות, ומחירים בשקלים. השוואה חינמית.`,
    alternates: { canonical: `/vs/${slug}` },
  };
}

/** Merge both sides' plans into one cheapest-first list for the unified table. */
function combinedPlans(pair: VsPair): Plan[] {
  return [...pair.a.plans, ...pair.b.plans].sort((x, y) => x.price - y.price);
}

// Authority "truth table": buyer factor → which side wins → FACTUAL reason. Only
// rows that are genuinely decidable from the catalogue are emitted (ties skipped).
function buildAuthorityRows(
  pair: VsPair,
): { factor: string; winner: string; reason: string }[] {
  const { a, b, categoryLabel } = pair;
  const rows: { factor: string; winner: string; reason: string }[] = [];

  // Entry price.
  if (a.minPrice !== b.minPrice) {
    const cheaper = a.minPrice < b.minPrice ? a : b;
    rows.push({
      factor: "המחיר ההתחלתי הנמוך ביותר",
      winner: `${cheaper.provider.name} — ${cheaper.cheapest.plan}`,
      reason: `נקודת כניסה של ${ils(cheaper.minPrice)} ב${categoryLabel}.`,
    });
  }

  // More options in the category.
  if (a.planCount !== b.planCount) {
    const more = a.planCount > b.planCount ? a : b;
    rows.push({
      factor: "מספר המסלולים בקטגוריה",
      winner: more.provider.name,
      reason: `${more.planCount} מסלולים ב${categoryLabel} בקטלוג שלנו.`,
    });
  }

  // Cheapest no-commitment plan, per side (only when one side actually has one
  // and it's the cheaper of the two — a real, decidable factor).
  const aNoCommit = a.plans.find((p) => p.noCommit);
  const bNoCommit = b.plans.find((p) => p.noCommit);
  if (aNoCommit && bNoCommit && aNoCommit.price !== bNoCommit.price) {
    const win = aNoCommit.price < bNoCommit.price
      ? { side: a, plan: aNoCommit }
      : { side: b, plan: bNoCommit };
    rows.push({
      factor: "הזול ביותר ללא התחייבות",
      winner: `${win.side.provider.name} — ${win.plan.plan}`,
      reason: `${ils(win.plan.price)}, ניתן לעזוב בכל עת ללא קנס יציאה.`,
    });
  } else if (aNoCommit && !bNoCommit) {
    rows.push({
      factor: "מסלול ללא התחייבות",
      winner: a.provider.name,
      reason: `ל-${a.provider.name} יש מסלול ללא התחייבות ב${categoryLabel} (${ils(
        aNoCommit.price,
      )}).`,
    });
  } else if (bNoCommit && !aNoCommit) {
    rows.push({
      factor: "מסלול ללא התחייבות",
      winner: b.provider.name,
      reason: `ל-${b.provider.name} יש מסלול ללא התחייבות ב${categoryLabel} (${ils(
        bNoCommit.price,
      )}).`,
    });
  }

  // Cheapest 5G plan, per side (cellular-relevant; only when both have one).
  const a5G = a.plans.find((p) => p.is5G);
  const b5G = b.plans.find((p) => p.is5G);
  if (a5G && b5G && a5G.price !== b5G.price) {
    const win = a5G.price < b5G.price ? { side: a, plan: a5G } : { side: b, plan: b5G };
    rows.push({
      factor: "מסלול 5G במחיר הנמוך ביותר",
      winner: `${win.side.provider.name} — ${win.plan.plan}`,
      reason: `מסלול 5G בעלות ההתחלתית הנמוכה ביותר: ${ils(win.plan.price)}.`,
    });
  }

  return rows;
}

// One compact stat card per side (entry price + plan count + cheapest plan name).
function SideCard({ side, label }: { side: VsSide; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <span className="text-xs text-muted">{label}</span>
      <h3 className="mt-1 font-display text-xl font-bold text-ink">
        <Link
          href={`/providers/${side.provider.slug}`}
          className="hover:text-accent"
        >
          {side.provider.name}
        </Link>
      </h3>
      <dl className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-muted">מחיר התחלתי</dt>
          <dd className="font-display text-2xl font-bold text-value-text">
            {ils(side.minPrice)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">מסלולים בקטגוריה</dt>
          <dd className="font-display text-2xl font-bold text-ink">
            {side.planCount}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-foreground">
        המסלול ההתחלתי:{" "}
        <span className="font-medium">{side.cheapest.plan}</span>
      </p>
    </div>
  );
}

// FAQ — the high-intent "X מול Y" questions, answered from the derived data.
function buildFaqs(pair: VsPair): QA[] {
  const { a, b, categoryLabel } = pair;
  const aN = a.provider.name;
  const bN = b.provider.name;
  const verdict = vsVerdict(pair);

  const cheaperAnswer = verdict.cheaperSide
    ? `לפי הקטלוג שלנו, ${verdict.cheaperSide.provider.name} מתחיל ב-${ils(
        verdict.cheaperSide.minPrice,
      )} ב${categoryLabel}` +
      (verdict.priceGap > 0
        ? `, נמוך ב-${ils(verdict.priceGap)} מהצד השני.`
        : ".") +
      " זו השוואת נקודת הכניסה בלבד — כדאי להשוות גם את המסלול הספציפי שמתאים לכם."
    : `נקודת הכניסה זהה — שני הספקים מתחילים מ-${ils(a.minPrice)} ב${categoryLabel}. ` +
      "ההבדל יהיה במסלול הספציפי ובמאפיינים שחשובים לכם.";

  return [
    {
      question: `מה ההבדל בין ${aN} ל${bN}?`,
      answer:
        `שני הספקים מציעים מסלולי ${categoryLabel} בישראל. בקטלוג שלנו ל-${aN} ` +
        `${a.planCount} מסלולים החל מ-${ils(a.minPrice)}, ול-${bN} ` +
        `${b.planCount} מסלולים החל מ-${ils(b.minPrice)}. ההבדל המעשי הוא במחיר ` +
        "ההתחלתי, במספר האפשרויות ובמאפיינים כמו 5G, התחייבות ושימוש בחו״ל.",
    },
    {
      question: `מי זול יותר, ${aN} או ${bN}?`,
      answer: cheaperAnswer,
    },
    {
      question: `כמה מסלולי ${categoryLabel} יש לכל ספק?`,
      answer:
        `בקטלוג שלנו ל-${aN} יש ${a.planCount} מסלולי ${categoryLabel}, ` +
        `ול-${bN} יש ${b.planCount}. אפשר לראות את כולם בטבלת ההשוואה למעלה.`,
    },
    ...GENERAL_FAQ,
  ];
}

// Related: each side's provider page, each side's category compare hub, and a few
// other curated match-ups that share a provider. No dead-ends.
function buildRelated(
  pair: VsPair,
): { title: string; href: string; description?: string }[] {
  const { a, b, category, categoryLabel } = pair;
  const links: { title: string; href: string; description?: string }[] = [
    {
      title: a.provider.name,
      href: `/providers/${a.provider.slug}`,
      description: `כל מסלולי ${a.provider.name}.`,
    },
    {
      title: b.provider.name,
      href: `/providers/${b.provider.slug}`,
      description: `כל מסלולי ${b.provider.name}.`,
    },
    {
      title: `השוואת ${categoryLabel}`,
      href: `/compare/${category}`,
      description: `כל הספקים ב${categoryLabel}, לא רק שניים.`,
    },
  ];

  // A few other match-ups that share one of the two providers.
  for (const other of getVsPairs()) {
    if (other.slug === pair.slug) continue;
    const sharesA =
      other.a.provider.slug === a.provider.slug ||
      other.b.provider.slug === a.provider.slug;
    const sharesB =
      other.a.provider.slug === b.provider.slug ||
      other.b.provider.slug === b.provider.slug;
    if (!sharesA && !sharesB) continue;
    links.push({
      title: `${other.a.provider.name} מול ${other.b.provider.name}`,
      href: `/vs/${other.slug}`,
      description: `השוואת ${other.categoryLabel}.`,
    });
    if (links.length >= 9) break;
  }

  return links;
}

export default async function VsPage({ params }: Params) {
  const { pair: slug } = await params;
  const pair = getVsPair(slug);
  if (!pair) notFound();

  const { a, b, category, categoryLabel } = pair;
  const aN = a.provider.name;
  const bN = b.provider.name;
  const verdict = vsVerdict(pair);
  const allPlans = combinedPlans(pair);
  const authorityRows = buildAuthorityRows(pair);
  const faqs = buildFaqs(pair);
  const related = buildRelated(pair);

  // The two representative plans (cheapest per side), cheapest-first, for the
  // comparison ItemList JSON-LD.
  const repPlans = [a.cheapest, b.cheapest].sort((x, y) => x.price - y.price);
  const providers = [a.provider, b.provider];

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "השוואות", url: "/compare" },
    { name: `${aN} מול ${bN}`, url: `/vs/${slug}` },
  ];

  const answer =
    `בהשוואת ${categoryLabel} בין ${aN} ל${bN}: ` + verdict.summary;

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      {/* GEO structured data: comparison ItemList + FAQ + Breadcrumb + KnowledgeGraph + KnowledgeWeb. */}
      <JsonLd
        data={comparisonSchema({
          name: `${aN} מול ${bN} — השוואת ${categoryLabel}`,
          url: `/vs/${slug}`,
          plans: repPlans,
        })}
      />
      <JsonLd data={faqPageSchema(faqs)} />
      <JsonLd data={breadcrumbSchema(crumbs)} />
      <JsonLd
        data={knowledgeGraphSchema({
          pageUrl: `/vs/${slug}`,
          pageName: `${aN} מול ${bN}`,
          providers,
          plans: allPlans,
          serviceType: `השוואת ${categoryLabel}: ${aN} מול ${bN}`,
          description: `השוואה ישירה של מסלולי ${categoryLabel} בין ${aN} ל${bN}.`,
        })}
      />
      <JsonLd
        data={knowledgeWebSchema({
          pageUrl: `/vs/${slug}`,
          category,
          plans: allPlans,
          providers,
        })}
      />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <Link href="/compare" className="hover:text-accent">
          השוואות
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">
          {aN} מול {bN}
        </span>
      </nav>

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-3">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          {aN} מול {bN} — השוואת {categoryLabel}
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-foreground">
          השוואה ישירה של מסלולי {categoryLabel} בין {aN} ל{bN} — מחיר התחלתי,
          מספר מסלולים ומאפיינים, הכל מתוך הקטלוג ובשקלים.
        </p>
      </header>

      {/* ── Side-by-side stat cards ───────────────────────────────────────── */}
      <section aria-labelledby="sides-h" className="mt-8">
        <h2 id="sides-h" className="sr-only">
          {aN} מול {bN} — נתוני הספקים
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SideCard side={a} label={`צד א׳ — ${categoryLabel}`} />
          <SideCard side={b} label={`צד ב׳ — ${categoryLabel}`} />
        </div>
      </section>

      {/* ── SGE summary (derived verdict) ─────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading={`השורה התחתונה: ${aN} מול ${bN}`}>
          {verdict.summary}
        </SgeSummary>
      </div>

      {/* ── Authority block: direct answer + truth table + verification stamp ─ */}
      <div className="mt-8">
        <AuthorityBlock
          heading="מי מנצח בכל פרמטר"
          answer={answer}
          rows={authorityRows}
          tableCaption={`${aN} מול ${bN} — מי מנצח בכל פרמטר ולמה`}
          reviewedAt={REVIEWED_AT}
        />
      </div>

      {/* ── Unified comparison table (every plan from both sides) ──────────── */}
      <section aria-labelledby="table-h" className="mt-12">
        <h2 id="table-h" className="font-display text-2xl font-bold text-ink">
          כל מסלולי {categoryLabel} — {aN} ו{bN}
        </h2>
        <div className="mt-5">
          <ComparisonTable
            plans={allPlans}
            caption={`${aN} מול ${bN} ב${categoryLabel} — מחירים בשקלים, כולל מחיר אחרי המבצע`}
          />
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section aria-labelledby="faq-h" className="mt-14">
        <h2 id="faq-h" className="font-display text-2xl font-bold text-ink">
          שאלות נפוצות — {aN} מול {bN}
        </h2>
        <div className="mt-5 divide-y divide-border rounded-xl border border-border bg-surface">
          {faqs.map((qa) => (
            <details key={qa.question} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-display font-semibold text-ink marker:hidden">
                <span>{qa.question}</span>
                <span
                  aria-hidden="true"
                  className="ms-auto shrink-0 text-muted transition-transform group-open:rotate-180"
                >
                  ▾
                </span>
              </summary>
              <p className="mt-2 text-foreground">{qa.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Lead form ─────────────────────────────────────────────────────── */}
      <section id="lead" aria-labelledby="lead-h" className="mt-16 scroll-mt-6">
        <h2 id="lead-h" className="font-display text-2xl font-bold text-ink">
          לא בטוחים מה מתאים — {aN} או {bN}?
        </h2>
        <p className="mt-2 text-foreground">
          השאירו פרטים ונעזור לכם לבחור ולעבור — חינם וללא התחייבות.
        </p>
        <div className="mt-5 max-w-xl">
          <LeadForm
            source="compare"
            defaultCategory={leadCategory(category)}
            trustStats={{
              planCount: allPlans.length,
              providerCount: getProviders().length,
            }}
          />
        </div>
      </section>

      {/* ── Semantic interlinking — no dead-ends ──────────────────────────── */}
      <RelatedAuthorityPages
        heading="השוואות וספקים נוספים"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />

      <link rel="canonical" href={`${SITE_URL}/vs/${slug}`} />
    </main>
  );
}
