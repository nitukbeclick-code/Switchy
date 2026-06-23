// ────────────────────────────────────────────────────────────────────────────
// /compare/[service] — the SERVICE HUB page (cellular / internet / fiber / tv /
// triple / abroad). One page per service axis (generateStaticParams from
// getServices()). It lists the service's plans (the union of its catalogue
// categories, cheapest first) and links to the per-city geo variants under
// /compare/[service]/[city].
//
// HONESTY (E-E-A-T): every figure is catalogue-derived (real lowest price, real
// counts). Israeli telecom is largely NATIONAL — the same providers/plans are
// available everywhere, so this hub frames the city links as "the same comparison,
// localized" rather than implying availability differs by city. Nothing about
// regional dominance / coverage scores / price trends is fabricated.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import AuthorityBlock from "@/components/AuthorityBlock";
import AuthorityReasoning from "@/components/AuthorityReasoning";
import ReviewsBlock from "@/components/ReviewsBlock";
import ComparisonTable from "@/components/ComparisonTable";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import PriceCaveat from "@/components/PriceCaveat";
import RelatedLinks from "@/components/RelatedLinks";
import type { RelatedLinkGroup } from "@/components/RelatedLinks";
import LeadForm from "@/components/LeadForm";
import {
  getServices,
  serviceBySlug,
  plansForService,
  getCities,
  getProviders,
  buildProviderRankings,
} from "@/lib/data";
import type { Service, City } from "@/lib/data";
import type { Plan, Provider } from "@/lib/types";
import {
  collectionPageSchema,
  itemListSchema,
  faqPageSchema,
  breadcrumbSchema,
  knowledgeGraphSchema,
  knowledgeWebSchema,
  relatedLinksSchema,
} from "@/lib/schema";
import type { NavLink, QA } from "@/lib/schema";
import { faqForCategory } from "@/lib/faq";
import { ils, leadCategory } from "@/lib/format";

// One page per service axis, pre-rendered at build time.
export function generateStaticParams() {
  return getServices().map((s) => ({ service: s.slug }));
}

interface Params {
  params: Promise<{ service: string }>;
}

// The catalogue is rebuilt with the deploy; the render date is the honest
// "last reviewed" date (when the data behind this page was regenerated).
const REVIEWED_AT = new Date().toISOString().slice(0, 10);

/** Lowest headline price across a list of plans, or null when none priced. */
function minPriceOf(plans: Plan[]): number | null {
  let min = Number.POSITIVE_INFINITY;
  for (const p of plans) {
    if (typeof p.price === "number" && p.price < min) min = p.price;
  }
  return Number.isFinite(min) ? min : null;
}

/** The single cheapest plan in a list (by headline price), if any. */
function cheapestOf(plans: Plan[]): Plan | undefined {
  return plans.reduce<Plan | undefined>(
    (best, p) =>
      typeof p.price === "number" && (!best || p.price < best.price) ? p : best,
    undefined,
  );
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { service } = await params;
  const svc = serviceBySlug(service);
  if (!svc) return {};
  const plans = plansForService(service);
  const min = minPriceOf(plans);
  const minTxt = min != null ? ` החל מ-${ils(min)}.` : "";
  return {
    title: `השוואת ${svc.label} — כל הספקים בישראל`,
    description:
      `השוואת ${plans.length} מסלולי ${svc.label} מכל הספקים בישראל.${minTxt} ` +
      `מחירים בשקלים, כולל המחיר אחרי המבצע — והשוואה מותאמת לכל עיר. השוואה חינמית.`,
    alternates: { canonical: `/compare/${service}` },
  };
}

// A factual 40–50 word Hebrew conclusion computed from the catalogue.
function buildSummary(svc: Service): string {
  const plans = plansForService(svc.slug);
  const providerNames = [...new Set(plans.map((p) => p.provider))];
  const cheapest = cheapestOf(plans);
  const min = cheapest?.price ?? 0;
  const noCommitCount = plans.filter((p) => p.noCommit).length;
  return (
    `השוואת ${svc.label}: ${plans.length} מסלולים מ-${providerNames.length} ` +
    `ספקים בישראל. הזמינות ארצית — אותם ספקים בכל הארץ. הזול ביותר הוא ` +
    `${cheapest?.plan ?? ""} של ${cheapest?.provider ?? ""} ב-${ils(min)}, ` +
    `ו-${noCommitCount} מסלולים ללא התחייבות. מחירים בשקלים, כולל המחיר אחרי המבצע.`
  );
}

// Authority "truth table": buyer factor → winning plan → FACTUAL catalogue reason.
function cheapestBy(plans: Plan[], pred: (p: Plan) => boolean): Plan | undefined {
  return plans.filter(pred).sort((a, b) => a.price - b.price)[0];
}

function buildAuthority(svc: Service): {
  answer: string;
  rows: { factor: string; winner: string; reason: string }[];
} {
  const plans = [...plansForService(svc.slug)];
  const cheapest = cheapestBy(plans, () => true);
  const cheapestNoCommit = cheapestBy(plans, (p) => p.noCommit);
  const cheapest5G = cheapestBy(plans, (p) => p.is5G);
  const cheapestAbroad = cheapestBy(plans, (p) => p.hasAbroad);
  const cheapestStable = cheapestBy(
    plans,
    (p) => p.after == null || (typeof p.after === "number" && p.after <= p.price),
  );

  const rows: { factor: string; winner: string; reason: string }[] = [];
  if (cheapest) {
    rows.push({
      factor: "המחיר ההתחלתי הזול ביותר",
      winner: `${cheapest.provider} — ${cheapest.plan}`,
      reason: `המחיר ההתחלתי הנמוך ביותר: ${ils(cheapest.price)}.`,
    });
  }
  if (cheapestStable && cheapestStable.id !== cheapest?.id) {
    rows.push({
      factor: "עלות יציבה לאורך זמן",
      winner: `${cheapestStable.provider} — ${cheapestStable.plan}`,
      reason: `${ils(cheapestStable.price)} ללא קפיצת מחיר לאחר תום המבצע.`,
    });
  }
  if (cheapestNoCommit && cheapestNoCommit.id !== cheapest?.id) {
    rows.push({
      factor: "הזול ביותר ללא התחייבות",
      winner: `${cheapestNoCommit.provider} — ${cheapestNoCommit.plan}`,
      reason: `${ils(cheapestNoCommit.price)}, ניתן לעזוב בכל עת ללא קנס יציאה.`,
    });
  }
  if (cheapest5G) {
    rows.push({
      factor: "מסלול 5G במחיר הנמוך ביותר",
      winner: `${cheapest5G.provider} — ${cheapest5G.plan}`,
      reason: `מסלול 5G בעלות ההתחלתית הנמוכה ביותר: ${ils(cheapest5G.price)}.`,
    });
  }
  if (cheapestAbroad && cheapestAbroad.id !== cheapest?.id) {
    rows.push({
      factor: "כולל שימוש בחו״ל במחיר הנמוך ביותר",
      winner: `${cheapestAbroad.provider} — ${cheapestAbroad.plan}`,
      reason: `כולל גלישה/שיחות בחו״ל בעלות הנמוכה ביותר: ${ils(
        cheapestAbroad.price,
      )}.`,
    });
  }

  const answer = cheapest
    ? `בהשוואת ${svc.label}, המסלול עם המחיר ההתחלתי הנמוך ביותר בקטלוג שלנו הוא ` +
      `${cheapest.plan} של ${cheapest.provider} ב-${ils(cheapest.price)}. ` +
      `הזמינות ארצית — אותם ספקים זמינים בכל עיר; הבחירה תלויה בגורם החשוב לכם, ` +
      `כמפורט בטבלה.`
    : `בהשוואת ${svc.label} מוצגים מסלולים מכל הספקים בישראל, ממוינים מהזול ליקר.`;
  return { answer, rows };
}

// Honest, transparent "best value" provider ranking (stated methodology).
function topProviders(svc: Service): Provider[] {
  // Rank within the service's first category (the primary axis), recomputed scoped.
  const cat = svc.categories[0];
  return buildProviderRankings(cat).slice(0, 5);
}

// Service-axis FAQ: reuse the truthful category FAQ for the service's category.
function faqForService(svc: Service): QA[] {
  return faqForCategory(svc.categories[0]);
}

// Grouped semantic interlinking: other services ("השוואות נוספות"), the providers
// active in this service ("הספקים בקטגוריה"), and the per-city geo variants
// ("השוואה לפי עיר"). Every link is a real on-site URL; counts are catalogue-derived.
function buildRelatedGroups(svc: Service): RelatedLinkGroup[] {
  const groups: RelatedLinkGroup[] = [];

  groups.push({
    title: "השוואות נוספות",
    links: getServices()
      .filter((other) => other.slug !== svc.slug)
      .map((other) => ({
        href: `/compare/${other.slug}`,
        label: `השוואת ${other.label}`,
        hint: `${plansForService(other.slug).length} מסלולים בקטגוריית ${other.label}.`,
      })),
  });

  const cats = new Set(svc.categories);
  const svcProviders = getProviders().filter((p) =>
    p.categories.some((c) => cats.has(c)),
  );
  groups.push({
    title: `הספקים ב${svc.label}`,
    links: svcProviders.slice(0, 8).map((pr) => ({
      href: `/providers/${pr.slug}`,
      label: pr.name,
      hint: `${pr.planCount} מסלולים, החל מ-${ils(pr.minPrice)}.`,
    })),
  });

  groups.push({
    title: `${svc.label} לפי עיר`,
    links: getCities()
      .slice(0, 6)
      .map((c) => ({
        href: `/compare/${svc.slug}/${c.slug}`,
        label: `${svc.label} ב${c.name}`,
        hint: c.district,
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

// Editorial "why compare here" reasoning (truthful, catalogue-derived).
function buildReasoning(svc: Service): { title: string; reason: string }[] {
  const plans = [...plansForService(svc.slug)];
  const providerNames = [...new Set(plans.map((p) => p.provider))];
  const noCommitCount = plans.filter((p) => p.noCommit).length;
  const fiveGCount = plans.filter((p) => p.is5G).length;

  const points: { title: string; reason: string }[] = [
    {
      title: "השוואה רוחבית מכל הספקים",
      reason:
        `אנו משווים ${plans.length} מסלולי ${svc.label} מ-${providerNames.length} ספקים ` +
        `במקום אחד, כך שאפשר לראות את ההצעות זו מול זו ולא לפי ספק בודד.`,
    },
    {
      title: "שקיפות מחיר לאורך זמן",
      reason:
        "לצד המחיר ההתחלתי מוצג גם המחיר אחרי תום המבצע, כדי שהבחירה תתבסס על " +
        "העלות האמיתית ולא רק על מחיר ההיכרות.",
    },
  ];
  if (noCommitCount > 0) {
    points.push({
      title: "אפשרויות ללא התחייבות",
      reason: `${noCommitCount} מתוך ${plans.length} המסלולים הם ללא התחייבות — אפשר לעזוב בכל עת ללא קנס.`,
    });
  }
  if (fiveGCount > 0) {
    points.push({
      title: "מסלולי 5G מסומנים",
      reason: `${fiveGCount} מסלולים הם 5G, ומסומנים ככאלה כדי להשוות לפי טכנולוגיה.`,
    });
  }
  return points;
}

export default async function ServiceHubPage({ params }: Params) {
  const { service } = await params;
  const svc = serviceBySlug(service);
  if (!svc) notFound();

  const plans = plansForService(service);
  const cities: City[] = getCities();
  const summary = buildSummary(svc);
  const authority = buildAuthority(svc);
  const ranked = topProviders(svc);
  const faqs = faqForService(svc);
  const reasoning = buildReasoning(svc);
  const relatedGroups = buildRelatedGroups(svc);
  const cats = new Set(svc.categories);
  const svcProviders = getProviders().filter((pr) =>
    pr.categories.some((c) => cats.has(c)),
  );

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "השוואה", url: "/compare" },
    { name: svc.label, url: `/compare/${service}` },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      {/* GEO structured data: CollectionPage + ItemList + FAQ + Breadcrumb + KnowledgeGraph.
          Each plan's Product data is serialized ONCE in the standalone ItemList
          (Google reads ItemList→Product) and once more, entity-linked, inside the
          knowledgeWebSchema @graph below — we deliberately do NOT also embed it in
          the CollectionPage (no `plans`) nor emit a per-plan productSchema loop,
          to keep the JSON-LD payload lean. */}
      <JsonLd
        data={collectionPageSchema({
          name: `השוואת ${svc.label}`,
          description: `השוואת ${plans.length} מסלולי ${svc.label} מכל הספקים בישראל, מחירים בשקלים.`,
          url: `/compare/${service}`,
        })}
      />
      <JsonLd data={itemListSchema(plans)} />
      <JsonLd data={faqPageSchema(faqs)} />
      <JsonLd data={breadcrumbSchema(crumbs)} />
      <JsonLd
        data={knowledgeGraphSchema({
          pageUrl: `/compare/${service}`,
          pageName: `השוואת ${svc.label}`,
          providers: svcProviders,
          plans,
          serviceType: `השוואת ${svc.label}`,
        })}
      />
      {/* Knowledge Web: each Product offer ↔ its DefinedTerm(s) ↔ Provider.
          Truthful entity-linking for LLM extraction. */}
      <JsonLd
        data={knowledgeWebSchema({
          pageUrl: `/compare/${service}`,
          category: svc.categories[0],
          plans,
          providers: svcProviders,
        })}
      />
      {/* Internal cross-links as a SiteNavigationElement list (mirrors RelatedLinks). */}
      {(() => {
        const nav = relatedLinksSchema({
          name: `עמודים קשורים — השוואת ${svc.label}`,
          links: relatedNavLinks(relatedGroups),
        });
        return nav ? <JsonLd data={nav} /> : null;
      })()}

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">השוואת {svc.label}</span>
      </nav>

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-3">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          השוואת {svc.label}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground">
          {plans.length} מסלולי {svc.label} מכל הספקים בישראל, ממוינים מהזול ליקר.
          הזמינות ארצית — אותם ספקים בכל עיר. המחירים בשקלים וכוללים את המחיר אחרי
          המבצע.
        </p>
      </header>

      {/* ── Commission disclosure (Consumer Protection §7b) — at the top of the
          service hub, NOT buried. ────────────────────────────────────────── */}
      <div className="mt-6">
        <CommissionDisclosure variant="banner" />
      </div>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary>{summary}</SgeSummary>
      </div>

      {/* ── Authority block: direct answer + truth table + verification stamp ─ */}
      <div className="mt-8">
        <AuthorityBlock
          heading={`השורה התחתונה: ${svc.label}`}
          answer={authority.answer}
          rows={authority.rows}
          reviewedAt={REVIEWED_AT}
        />
      </div>

      {/* ── Comparison table ──────────────────────────────────────────────── */}
      <section aria-labelledby="table-h" className="mt-10">
        <h2 id="table-h" className="sr-only">
          טבלת השוואת {svc.label}
        </h2>
        <ComparisonTable
          plans={plans}
          caption={`השוואת ${svc.label} — מחירים בשקלים, כולל מחיר אחרי המבצע`}
        />
        <PriceCaveat className="mt-3" />
      </section>

      {/* ── Transparent provider ranking (stated methodology) ─────────────── */}
      {ranked.length > 0 && (
        <section aria-labelledby="rank-h" className="mt-14">
          <h2
            id="rank-h"
            className="font-display text-2xl font-bold tracking-tight text-ink"
          >
            ספקי {svc.label} לפי מחיר התחלתי
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            שיטת הדירוג שקופה: מיון לפי המחיר ההתחלתי הנמוך ביותר (מהזול ליקר),
            ובמקרה של שוויון — לפי מספר המסלולים. זהו דירוג &quot;ערך&quot; עובדתי,
            לא ציון איכות סמוי.
          </p>
          <ol className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ranked.map((pr, i) => (
              <li key={pr.slug}>
                <Link
                  href={`/providers/${pr.slug}`}
                  className="group card card-interactive flex items-center justify-between px-4 py-3.5"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 font-display text-sm font-bold text-accent">
                      {i + 1}
                    </span>
                    <span className="font-medium text-foreground transition-colors group-hover:text-accent">
                      {pr.name}
                    </span>
                  </span>
                  <span className="text-sm text-muted">
                    {pr.planCount} מסלולים · החל מ-{ils(pr.minPrice)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Editorial reasoning ("למה זה מומלץ") ──────────────────────────── */}
      <section className="mt-14">
        <AuthorityReasoning
          heading={`למה להשוות ${svc.label} כאן`}
          points={reasoning}
        />
      </section>

      {/* ── Reviews (real data only; renders empty-state when none) ────────── */}
      <section className="mt-14">
        <ReviewsBlock subjectName={`מסלולי ${svc.label}`} plans={plans} />
      </section>

      {/* ── Per-city geo variants ─────────────────────────────────────────── */}
      <section aria-labelledby="cities-h" className="mt-14">
        <h2
          id="cities-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          השוואת {svc.label} לפי עיר
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          ההשוואה זהה בכל הארץ — אותם ספקים ומסלולים. בחרו עיר כדי לראות את אותה
          השוואה ממוקדת מקומית.
        </p>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cities.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/compare/${service}/${c.slug}`}
                className="group card card-interactive block px-4 py-3 text-sm"
              >
                <span className="font-medium text-foreground transition-colors group-hover:text-accent">
                  {svc.label} ב{c.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section aria-labelledby="faq-h" className="mt-16">
        <h2
          id="faq-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          שאלות נפוצות — {svc.label}
        </h2>
        <div className="card mt-6 divide-y divide-border/60 overflow-hidden">
          {faqs.map((qa) => (
            <details key={qa.question} className="group p-5">
              <summary className="interactive flex cursor-pointer list-none items-center gap-2 font-display font-semibold text-ink marker:hidden group-hover:text-accent">
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
      <section id="lead" aria-labelledby="lead-h" className="mt-20 scroll-mt-6">
        <h2
          id="lead-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          רוצים עזרה לבחור {svc.label}?
        </h2>
        <p className="mt-2 leading-relaxed text-foreground">
          השאירו פרטים ונחזור אליכם עם המלצה מותאמת — חינם וללא התחייבות.
        </p>
        {/* Commission disclosure repeated before the lead hand-off (§7b). */}
        <CommissionDisclosure variant="inline" className="mt-3 max-w-xl" />
        <div className="mt-5 max-w-xl">
          <LeadForm
            source="compare"
            defaultCategory={leadCategory(svc.categories[0])}
            trustStats={{
              planCount: plans.length,
              providerCount: svcProviders.length,
            }}
          />
        </div>
      </section>

      {/* ── Semantic interlinking — grouped, no dead-ends ─────────────────── */}
      <RelatedLinks
        heading="המשיכו להשוות"
        groups={relatedGroups}
        className="mt-16"
      />
    </main>
  );
}
