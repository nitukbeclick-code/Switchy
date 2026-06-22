import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import AuthorityBlock from "@/components/AuthorityBlock";
import AuthorityReasoning from "@/components/AuthorityReasoning";
import ReviewsBlock from "@/components/ReviewsBlock";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import ComparisonTable from "@/components/ComparisonTable";
import LeadForm from "@/components/LeadForm";
import {
  getProviders,
  getProvider,
  plansByProvider,
  CATEGORY_HE,
} from "@/lib/data";
import {
  itemListSchema,
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

// Pre-render one page per derived provider at build time.
export function generateStaticParams() {
  return getProviders().map((p) => ({ slug: p.slug }));
}

interface Params {
  params: Promise<{ slug: string }>;
}

// Verification timestamp — when the data behind this page was last regenerated.
const REVIEWED_AT = new Date().toISOString().slice(0, 10);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const provider = getProvider(slug);
  if (!provider) return {};
  const cats = provider.categories.map((c) => CATEGORY_HE[c] ?? c).join(", ");
  return {
    title: `${provider.name} — מסלולים ומחירים`,
    description:
      `כל מסלולי ${provider.name} (${cats}) במקום אחד — ${provider.planCount} ` +
      `מסלולים, החל מ-${ils(provider.minPrice)}. השוואה חינמית ומחירים בשקלים.`,
    alternates: { canonical: `/providers/${slug}` },
  };
}

// "Best for" — pick a representative cheapest plan per category this provider has.
function bestFor(plans: Plan[]): { cat: string; plan: Plan }[] {
  const byCat = new Map<string, Plan>();
  for (const p of plans) {
    const cur = byCat.get(p.cat);
    if (!cur || p.price < cur.price) byCat.set(p.cat, p);
  }
  return [...byCat.entries()].map(([cat, plan]) => ({ cat, plan }));
}

// Authority "truth table": one row per category this provider serves, naming the
// provider's own cheapest plan there. Factual, catalogue-derived — no invented
// reliability/speed scores.
function buildAuthority(
  provider: { name: string },
  plans: Plan[],
): {
  answer: string;
  rows: { factor: string; winner: string; reason: string }[];
} {
  const picks = bestFor(plans).sort((a, b) => a.plan.price - b.plan.price);
  const rows = picks.map(({ cat, plan }) => ({
    factor: `המסלול ההתחלתי ב${CATEGORY_HE[cat] ?? cat}`,
    winner: plan.plan,
    reason: `${ils(plan.price)} — המסלול ההתחלתי הזול ביותר של ${provider.name} בקטגוריה.`,
  }));

  const cheapest = [...plans].sort((a, b) => a.price - b.price)[0];
  const answer = cheapest
    ? `${provider.name} מופיעה בקטלוג שלנו עם ${plans.length} מסלולים ` +
      `ב-${picks.length} קטגוריות, החל מ-${ils(cheapest.price)} ` +
      `(${cheapest.plan}). הטבלה למטה מציגה את המסלול ההתחלתי של ${provider.name} ` +
      `בכל קטגוריה — להשוואה מול ספקים אחרים.`
    : `${provider.name} מופיעה בקטלוג שלנו; ראו את המסלולים והשוו מול ספקים אחרים למטה.`;

  return { answer, rows };
}

// Editorial reasoning — truthful, derived from the provider's catalogue presence.
function buildReasoning(
  provider: { name: string; categories: string[]; planCount: number },
  plans: Plan[],
): { title: string; reason: string }[] {
  const noCommit = plans.filter((p) => p.noCommit).length;
  const fiveG = plans.filter((p) => p.is5G).length;
  const points: { title: string; reason: string }[] = [
    {
      title: "השוואה הוגנת מול כל הספקים",
      reason:
        `אנו מציגים את ${provider.planCount} מסלולי ${provider.name} לצד מסלולי ` +
        `ספקים אחרים, ללא העדפה — כדי שתבחרו לפי מה שמתאים לכם.`,
    },
    {
      title: "מחיר היום ומחיר אחרי המבצע",
      reason:
        `לכל מסלול של ${provider.name} מוצג גם המחיר אחרי תום תקופת המבצע, ` +
        "כדי שתדעו מה תשלמו בהמשך.",
    },
  ];
  if (noCommit > 0) {
    points.push({
      title: "אפשרויות ללא התחייבות",
      reason: `${noCommit} ממסלולי ${provider.name} בקטלוג הם ללא התחייבות.`,
    });
  }
  if (fiveG > 0) {
    points.push({
      title: "מסלולי 5G",
      reason: `${fiveG} ממסלולי ${provider.name} בקטלוג הם 5G ומסומנים ככאלה.`,
    });
  }
  return points;
}

// Related pages: this provider's categories + a few peer providers. No dead-ends.
function buildRelated(
  slug: string,
  categories: string[],
): { title: string; href: string; description?: string }[] {
  const links: { title: string; href: string; description?: string }[] = [];
  for (const cat of categories) {
    const he = CATEGORY_HE[cat] ?? cat;
    links.push({
      title: `השוואת מסלולי ${he}`,
      href: `/compare/${cat}`,
      description: `השוו את ${he} מול כל הספקים בישראל.`,
    });
  }
  for (const peer of getProviders()
    .filter((p) => p.slug !== slug)
    .filter((p) => p.categories.some((c) => categories.includes(c)))
    .slice(0, 6)) {
    links.push({
      title: peer.name,
      href: `/providers/${peer.slug}`,
      description: `${peer.planCount} מסלולים, החל מ-${ils(peer.minPrice)}.`,
    });
  }
  return links;
}

export default async function ProviderPage({ params }: Params) {
  const { slug } = await params;
  const provider = getProvider(slug);
  if (!provider) notFound();

  const plans = [...plansByProvider(slug)].sort((a, b) => a.price - b.price);
  const picks = bestFor(plans);
  const authority = buildAuthority(provider, plans);
  const reasoning = buildReasoning(provider, plans);
  const related = buildRelated(slug, provider.categories);

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "ספקים", url: "/providers" },
    { name: provider.name, url: `/providers/${slug}` },
  ];

  // Provider-specific FAQ (factual) + the shared general set.
  const faqs: QA[] = [
    {
      question: `כמה מסלולים יש ל${provider.name}?`,
      answer:
        `בקטלוג שלנו מופיעים ${provider.planCount} מסלולים של ${provider.name} ` +
        `בקטגוריות ${provider.categories.map((c) => CATEGORY_HE[c] ?? c).join(", ")}, ` +
        `החל מ-${ils(provider.minPrice)}.`,
    },
    {
      question: `איך עוברים ל${provider.name}?`,
      answer:
        `אפשר להשוות את מסלולי ${provider.name} מול ספקים אחרים כאן, ואם תשאירו ` +
        `פרטים נעזור לכם בתהליך המעבר — בהסכמתכם וללא עלות.`,
    },
    ...GENERAL_FAQ,
  ];

  const summary =
    `${provider.name} מציעה ${provider.planCount} מסלולים בקטלוג שלנו ` +
    `בקטגוריות ${provider.categories.map((c) => CATEGORY_HE[c] ?? c).join(", ")}, ` +
    `החל מ-${ils(provider.minPrice)}. כאן אפשר להשוות את כל המסלולים שלה מול ` +
    `ספקים אחרים בישראל — בשקלים וללא עלות.`;

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      {/* Entity structured data: ItemList + FAQ + Breadcrumb. */}
      <JsonLd data={itemListSchema(plans)} />
      <JsonLd data={faqPageSchema(faqs)} />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* Knowledge Graph: Organization (with real sameAs) cross-linked to its plans. */}
      <JsonLd
        data={knowledgeGraphSchema({
          pageUrl: `/providers/${slug}`,
          pageName: provider.name,
          providers: [provider],
          plans,
        })}
      />
      {/* Knowledge Web: each Product offer ↔ DefinedTerm(s) ↔ this Provider. */}
      <JsonLd
        data={knowledgeWebSchema({
          pageUrl: `/providers/${slug}`,
          plans,
          providers: [provider],
        })}
      />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <Link href="/providers" className="hover:text-accent">
          ספקים
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">{provider.name}</span>
      </nav>

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-3">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          {provider.name}
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-foreground">{provider.summary}</p>
        <dl className="mt-5 flex flex-wrap items-start gap-x-8 gap-y-4 text-sm">
          <div>
            <dt className="text-muted">מסלולים</dt>
            <dd className="font-display text-xl font-bold text-ink">
              {provider.planCount}
            </dd>
          </div>
          <div>
            <dt className="text-muted">מחיר התחלתי</dt>
            <dd className="font-display text-xl font-bold text-value-text">
              {ils(provider.minPrice)}
            </dd>
          </div>
          {/* Categories render as discrete tags (not one long bold sentence) so
              the stat row reads "number · number · tags", not "number, number,
              paragraph". Keeps the two numeric figures as the big anchors. */}
          <div>
            <dt className="text-muted">קטגוריות</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {provider.categories.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-foreground"
                >
                  {CATEGORY_HE[c] ?? c}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </header>

      {/* ── SGE summary (renamed from AiSummary; keeps id="ai-summary") ─────── */}
      <div className="mt-8">
        <SgeSummary>{summary}</SgeSummary>
      </div>

      {/* ── Authority block: direct answer + truth table + verification stamp ─ */}
      <div className="mt-8">
        <AuthorityBlock
          heading={`השורה התחתונה: ${provider.name}`}
          answer={authority.answer}
          rows={authority.rows}
          reviewedAt={REVIEWED_AT}
        />
      </div>

      {/* ── Best for ──────────────────────────────────────────────────────── */}
      {picks.length > 0 && (
        <section aria-labelledby="bestfor-h" className="mt-12">
          <h2 id="bestfor-h" className="font-display text-2xl font-bold text-ink">
            המסלול ההתחלתי בכל קטגוריה
          </h2>
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {picks.map(({ cat, plan }) => (
              <li
                key={cat}
                className="rounded-xl border border-border bg-surface p-5"
              >
                <span className="text-sm text-muted">
                  {CATEGORY_HE[cat] ?? cat}
                </span>
                <p className="mt-1 font-display font-semibold text-ink">
                  {plan.plan}
                </p>
                <p className="mt-2 font-display text-2xl font-bold text-value-text">
                  {ils(plan.price)}
                </p>
                <Link
                  href={`/compare/${cat}`}
                  className="mt-3 inline-block text-sm font-medium text-accent-text hover:text-accent-hover"
                >
                  להשוות בקטגוריה ←
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── All plans table ───────────────────────────────────────────────── */}
      <section aria-labelledby="plans-h" className="mt-12">
        <h2 id="plans-h" className="font-display text-2xl font-bold text-ink">
          כל המסלולים של {provider.name}
        </h2>
        <div className="mt-5">
          <ComparisonTable
            plans={plans}
            caption={`מסלולי ${provider.name} — מחירים בשקלים, כולל מחיר אחרי המבצע`}
          />
        </div>
      </section>

      {/* ── Editorial reasoning ("למה זה מומלץ") ──────────────────────────── */}
      <section className="mt-12">
        <AuthorityReasoning
          heading={`למה להשוות את ${provider.name} כאן`}
          points={reasoning}
        />
      </section>

      {/* ── Reviews (real data only; renders empty-state when none) ────────── */}
      <section className="mt-12">
        <ReviewsBlock subjectName={provider.name} plans={plans} />
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section aria-labelledby="faq-h" className="mt-14">
        <h2 id="faq-h" className="font-display text-2xl font-bold text-ink">
          שאלות נפוצות — {provider.name}
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
          רוצים לעבור ל{provider.name} או להשוות?
        </h2>
        <p className="mt-2 text-foreground">
          השאירו פרטים ונחזור אליכם — חינם, וללא התחייבות.
        </p>
        <div className="mt-5 max-w-xl">
          <LeadForm
            source="provider"
            defaultCategory={leadCategory(provider.categories[0])}
            trustStats={{
              planCount: provider.planCount,
              providerCount: getProviders().length,
            }}
          />
        </div>
      </section>

      {/* ── Semantic interlinking — no dead-ends ──────────────────────────── */}
      <RelatedAuthorityPages
        heading="ספקים וקטגוריות נוספים"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />

      <link rel="canonical" href={`${SITE_URL}/providers/${slug}`} />
    </main>
  );
}
