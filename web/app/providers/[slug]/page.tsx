import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import AeoAnswerBlock from "@/components/AeoAnswerBlock";
import AuthorityBlock from "@/components/AuthorityBlock";
import AuthorityReasoning from "@/components/AuthorityReasoning";
import ReviewsBlock from "@/components/ReviewsBlock";
import RelatedLinks from "@/components/RelatedLinks";
import type { RelatedLinkGroup } from "@/components/RelatedLinks";
import ComparisonTable from "@/components/ComparisonTable";
import LeadForm from "@/components/LeadForm";
import {
  getProviders,
  getProvider,
  plansByProvider,
  CATEGORY_HE,
} from "@/lib/data";
import { getLivePlans } from "@/lib/live-catalogue";
import { directAnswerFor, lastDataDate } from "@/lib/aeo";
import { vsPairsForProvider } from "@/lib/vs";
import {
  itemListSchema,
  faqPageSchema,
  breadcrumbSchema,
  knowledgeGraphSchema,
  knowledgeWebSchema,
  relatedLinksSchema,
  pageAggregateOfferSchema,
  type NavLink,
  type QA,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { GENERAL_FAQ } from "@/lib/faq";
import { ils, leadCategory } from "@/lib/format";
import type { Plan } from "@/lib/types";

// ISR: regenerate hourly so the live plan read (cheapest-plan answer, table,
// AggregateOffer) reflects current DB prices, while serving instantly from the
// static cache. dynamicParams=false still caps to known slugs.
export const revalidate = 3600;

// Pre-render one page per derived provider at build time. Unknown slugs return a
// real 404 (not a soft-200) so crawlers + users get the not-found page correctly.
export const dynamicParams = false;
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
  return pageMetadata({
    title: `${provider.name} — מסלולים ומחירים`,
    description:
      `כל מסלולי ${provider.name} (${cats}) במקום אחד — ${provider.planCount} ` +
      `מסלולים, החל מ-${ils(provider.minPrice)}. השוואה חינמית ומחירים בשקלים.`,
    path: `/providers/${slug}`,
  });
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

// Grouped related links: the provider's categories, peer providers that share a
// category ("ספקים דומים"), and head-to-head match-ups it appears in. Every link
// is a real on-site URL with a catalogue-derived hint. No dead-ends.
function buildRelatedGroups(
  slug: string,
  categories: string[],
  vsPairs: ReturnType<typeof vsPairsForProvider>,
): RelatedLinkGroup[] {
  const groups: RelatedLinkGroup[] = [];

  groups.push({
    title: "השוו בקטגוריות של הספק",
    links: categories.map((cat) => {
      const he = CATEGORY_HE[cat] ?? cat;
      return {
        href: `/compare/${cat}`,
        label: `השוואת מסלולי ${he}`,
        hint: `השוו את ${he} מול כל הספקים בישראל.`,
      };
    }),
  });

  const peers = getProviders()
    .filter((p) => p.slug !== slug)
    .filter((p) => p.categories.some((c) => categories.includes(c)))
    .slice(0, 6);
  groups.push({
    title: "ספקים דומים",
    links: peers.map((peer) => ({
      href: `/providers/${peer.slug}`,
      label: peer.name,
      hint: `${peer.planCount} מסלולים, החל מ-${ils(peer.minPrice)}.`,
    })),
  });

  groups.push({
    title: "השוואות ראש בראש",
    links: vsPairs.slice(0, 6).map(({ pair, other }) => ({
      href: `/vs/${pair.slug}`,
      label: `מול ${other.name}`,
      hint: pair.categoryLabel,
    })),
  });

  return groups;
}

/** Flatten the grouped links into NavLinks for the relatedLinksSchema ItemList. */
function relatedNavLinks(groups: RelatedLinkGroup[]): NavLink[] {
  return groups.flatMap((g) =>
    g.links.map((l) => ({ name: l.label, url: l.href, description: l.hint })),
  );
}

export default async function ProviderPage({ params }: Params) {
  const { slug } = await params;
  const provider = getProvider(slug);
  if (!provider) notFound();

  // ── Live plans for THIS provider (one read, threaded everywhere) ───────────
  // Read the whole live catalogue once and keep only this provider's rows
  // (matched by display name, exactly as the bundled plansByProvider does). If
  // the live read is the bundled fallback, or yields no rows for this provider,
  // fall back to the bundled provider plans so the page never renders empty. The
  // SAME `plans` list then feeds the AEO answer, the table, the AggregateOffer
  // schema and the methodology stamp — they can never disagree.
  const live = await getLivePlans();
  const liveForProvider = live.plans.filter((p) => p.provider === provider.name);
  const usingLive = !live.stale && liveForProvider.length > 0;
  const plans = (
    usingLive ? liveForProvider : plansByProvider(slug)
  )
    .slice()
    .sort((a, b) => a.price - b.price);
  // Real "data as of": newest live updated_at when serving live, else the
  // catalogue freshness of the plans we actually render.
  const asOf =
    usingLive && live.lastUpdated ? live.lastUpdated : lastDataDate(plans);
  // Zero-click answer: the provider's REAL cheapest plan + price + provider,
  // computed from the same list. Empty (omitted) when no priced plan exists.
  const cheapestAnswer = directAnswerFor(
    provider.categories[0] ?? "cellular",
    undefined,
    plans,
  );
  // Visible stats derived from the ACTUALLY-rendered plans so the header figures,
  // FAQ and summary agree with the table / AggregateOffer / AEO answer. Falls back
  // to the bundled provider aggregates only if (defensively) plans is empty.
  const shownPlanCount = plans.length || provider.planCount;
  const shownMinPrice = plans.length
    ? Math.min(...plans.map((p) => p.price))
    : provider.minPrice;
  const picks = bestFor(plans);
  const authority = buildAuthority(provider, plans);
  const reasoning = buildReasoning(provider, plans);
  // Head-to-head match-ups this provider appears in (curated, catalogue-gated).
  const vsPairs = vsPairsForProvider(slug);
  const relatedGroups = buildRelatedGroups(slug, provider.categories, vsPairs);

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
        `בקטלוג שלנו מופיעים ${shownPlanCount} מסלולים של ${provider.name} ` +
        `בקטגוריות ${provider.categories.map((c) => CATEGORY_HE[c] ?? c).join(", ")}, ` +
        `החל מ-${ils(shownMinPrice)}.`,
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
    `${provider.name} מציעה ${shownPlanCount} מסלולים בקטלוג שלנו ` +
    `בקטגוריות ${provider.categories.map((c) => CATEGORY_HE[c] ?? c).join(", ")}, ` +
    `החל מ-${ils(shownMinPrice)}. כאן אפשר להשוות את כל המסלולים שלה מול ` +
    `ספקים אחרים בישראל — בשקלים וללא עלות.`;

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      {/* Entity structured data: ItemList + FAQ + Breadcrumb. */}
      <JsonLd data={itemListSchema(plans)} />
      <JsonLd data={faqPageSchema(faqs)} />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* AggregateOffer across this provider's REAL plans (low/high/offerCount)
          — null (omitted) when no priced plan exists, so it never fabricates. */}
      {(() => {
        const agg = pageAggregateOfferSchema(plans);
        return agg ? <JsonLd data={agg} /> : null;
      })()}

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
      {/* Internal cross-links as a machine-readable SiteNavigationElement list
          (mirrors the visible RelatedLinks block). Omitted when no links. */}
      {(() => {
        const nav = relatedLinksSchema({
          name: `עמודים קשורים — ${provider.name}`,
          links: relatedNavLinks(relatedGroups),
        });
        return nav ? <JsonLd data={nav} /> : null;
      })()}

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
      <header className="mt-4">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          {provider.name}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground">{provider.summary}</p>
        <dl className="mt-6 flex flex-wrap items-stretch gap-3 text-sm">
          <div className="bento px-5 py-4">
            <dt className="text-muted">מסלולים</dt>
            <dd className="mt-0.5 font-display text-2xl font-bold tracking-tight text-ink">
              {shownPlanCount}
            </dd>
          </div>
          <div className="bento px-5 py-4">
            <dt className="text-muted">מחיר התחלתי</dt>
            <dd className="mt-0.5 font-display text-2xl font-bold tracking-tight text-value-text">
              {ils(shownMinPrice)}
            </dd>
          </div>
          {/* Categories render as discrete tags (not one long bold sentence) so
              the stat row reads "number · number · tags", not "number, number,
              paragraph". Keeps the two numeric figures as the big anchors. */}
          <div className="bento px-5 py-4">
            <dt className="text-muted">קטגוריות</dt>
            <dd className="mt-2 flex flex-wrap gap-1.5">
              {provider.categories.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center rounded-full border border-border/60 bg-surface px-2.5 py-0.5 text-xs font-medium text-foreground"
                >
                  {CATEGORY_HE[c] ?? c}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </header>

      {/* ── AEO zero-click answer: the provider's REAL cheapest plan + price ──
          The block AI answer engines lift. Empty (omitted) when no priced plan;
          carries the FactCheckBadge verification line + real dateModified. */}
      <AeoAnswerBlock
        className="mt-8"
        heading={`הזול ביותר של ${provider.name}`}
        answer={cheapestAnswer}
        dateModified={asOf}
        stale={!usingLive}
      />

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
        <section aria-labelledby="bestfor-h" className="mt-14">
          <h2 id="bestfor-h" className="font-display text-2xl font-bold tracking-tight text-ink">
            המסלול ההתחלתי בכל קטגוריה
          </h2>
          <ul className="mt-6 bento-grid">
            {picks.map(({ cat, plan }) => (
              <li
                key={cat}
                className="bento flex flex-col p-6"
              >
                <span className="text-sm text-muted">
                  {CATEGORY_HE[cat] ?? cat}
                </span>
                <p className="mt-1.5 font-display font-semibold text-ink">
                  {plan.plan}
                </p>
                <p className="mt-2 font-display text-3xl font-bold tracking-tight text-value-text">
                  {ils(plan.price)}
                </p>
                <Link
                  href={`/compare/${cat}`}
                  className="interactive mt-auto pt-4 inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:text-accent-hover hover:-translate-x-0.5"
                >
                  להשוות בקטגוריה ←
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Head-to-head comparisons ("השווה מול ...") ────────────────────── */}
      {vsPairs.length > 0 && (
        <section aria-labelledby="vs-h" className="mt-14">
          <h2 id="vs-h" className="font-display text-2xl font-bold tracking-tight text-ink">
            השוו את {provider.name} מול ספק אחר
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            השוואות ראש בראש באותה קטגוריה — מחיר התחלתי, מספר מסלולים ומאפיינים.
          </p>
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vsPairs.map(({ pair, other }) => (
              <li key={pair.slug}>
                <Link
                  href={`/vs/${pair.slug}`}
                  className="group card card-interactive flex items-center justify-between gap-3 px-5 py-4"
                >
                  <span className="font-medium text-foreground transition-colors group-hover:text-accent">
                    {provider.name} מול {other.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {pair.categoryLabel}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── All plans table ───────────────────────────────────────────────── */}
      <section aria-labelledby="plans-h" className="mt-14">
        <h2 id="plans-h" className="font-display text-2xl font-bold tracking-tight text-ink">
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
      <section className="mt-14">
        <AuthorityReasoning
          heading={`למה להשוות את ${provider.name} כאן`}
          points={reasoning}
        />
      </section>

      {/* ── Reviews (real data only; renders empty-state when none) ────────── */}
      <section className="mt-14">
        <ReviewsBlock subjectName={provider.name} plans={plans} />
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section aria-labelledby="faq-h" className="mt-14">
        <h2 id="faq-h" className="font-display text-2xl font-bold tracking-tight text-ink">
          שאלות נפוצות — {provider.name}
        </h2>
        <div className="card mt-6 divide-y divide-border/60 overflow-hidden">
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
              <p className="mt-2 leading-relaxed text-foreground">{qa.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Lead form ─────────────────────────────────────────────────────── */}
      <section id="lead" aria-labelledby="lead-h" className="mt-16 scroll-mt-6">
        <h2 id="lead-h" className="font-display text-2xl font-bold tracking-tight text-ink">
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

      {/* ── Semantic interlinking — grouped, no dead-ends ─────────────────── */}
      <RelatedLinks
        heading="המשיכו לחקור"
        groups={relatedGroups}
        className="mt-16"
      />
    </main>
  );
}
