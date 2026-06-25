// ────────────────────────────────────────────────────────────────────────────
// /compare/[service]/[city] — the HONEST localized geo page (service × city).
// generateStaticParams is the bounded matrix of getServices() × getCities()
// (~6 services × ~42 cities). It renders the SAME comparison as the service hub,
// localized to a city, plus the city's real Place/GeoCoordinates/district schema.
//
// HONESTY (E-E-A-T), non-negotiable: Israeli telecom is largely NATIONAL — the
// SAME providers/plans are available in every city. This page FRAMES availability
// as national ("אותם ספקים כמו בכל הארץ") and adds local nuance ONLY where it
// genuinely exists (e.g. fiber rollout is uneven, framed truthfully as "תלוי
// תשתית/כתובת — בדקו זמינות מול הספק"). There is NO fabricated regional dominance,
// no "provider X leads here", no coverage score, no fake price trend, no invented
// local reviews. lat/lng/district are real public data from web/data/cities.json.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Icon from "@/components/Icon";
import JsonLd from "@/components/JsonLd";
import EmptyState from "@/components/EmptyState";
import SgeSummary from "@/components/SgeSummary";
import AuthorityBlock from "@/components/AuthorityBlock";
import ComparisonTable from "@/components/ComparisonTable";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import PriceCaveat from "@/components/PriceCaveat";
import TrustSignals from "@/components/TrustSignals";
import StickyLeadCta from "@/components/StickyLeadCta";
import RelatedLinks from "@/components/RelatedLinks";
import type { RelatedLinkGroup } from "@/components/RelatedLinks";
import LeadForm from "@/components/LeadForm";
import AeoAnswerBlock from "@/components/AeoAnswerBlock";
import AeoQA from "@/components/AeoQA";
import DataMethodology from "@/components/DataMethodology";
import LlmDataFeed from "@/components/LlmDataFeed";
import {
  getServices,
  serviceBySlug,
  plansForService,
  getCities,
  cityBySlug,
  getProviders,
} from "@/lib/data";
import type { Service, City } from "@/lib/data";
import type { Plan } from "@/lib/types";
import {
  collectionPageSchema,
  itemListSchema,
  faqPageSchema,
  breadcrumbSchema,
  knowledgeGraphSchema,
  placeSchema,
  geoSchema,
  relatedLinksSchema,
  pageAggregateOfferSchema,
  speakableSchema,
} from "@/lib/schema";
import type { NavLink, QA } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { ils, leadCategory } from "@/lib/format";
import { getLivePlans } from "@/lib/live-catalogue";
import {
  directAnswerFor,
  pageQuestions,
  lastDataDate,
  type AeoQuestion,
} from "@/lib/aeo";

// Bounded matrix: every service × every city, pre-rendered at build time.
// Unknown service/city combos -> real 404 (we only serve the curated matrix).
export const dynamicParams = false;
// ISR: regenerate hourly so the live DB catalogue (prices, direct answer, table,
// JSON-LD) stays fresh on every geo page while still serving instantly.
export const revalidate = 3600;
export function generateStaticParams() {
  const cities = getCities();
  return getServices().flatMap((s) =>
    cities.map((c) => ({ service: s.slug, city: c.slug })),
  );
}

interface Params {
  params: Promise<{ service: string; city: string }>;
}

// The catalogue/cities are rebuilt with the deploy; the render date is the honest
// "last reviewed" date (when the data behind this page was regenerated).
const REVIEWED_AT = new Date().toISOString().slice(0, 10);

/** Whether this service's availability is genuinely infrastructure-dependent. */
function isInfraDependent(svc: Service): boolean {
  // Fiber rollout / fixed-line internet availability is the one genuine local
  // nuance in an otherwise national market. Mobile/abroad are uniformly national.
  return (
    svc.slug === "fiber" ||
    svc.categories.includes("internet") ||
    svc.categories.includes("tv") ||
    svc.categories.includes("triple")
  );
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
  const { service, city } = await params;
  const svc = serviceBySlug(service);
  const c = cityBySlug(city);
  if (!svc || !c) return {};
  const plans = plansForService(service);
  const cheapest = cheapestOf(plans);
  const minTxt = cheapest ? ` החל מ-${ils(cheapest.price)}.` : "";
  return pageMetadata({
    title: `${svc.label} ב${c.name} — השוואת מסלולים וספקים`,
    description:
      `השוואת ${svc.label} ב${c.name}: הזמינות ארצית — אותם ${plans.length} ` +
      `מסלולים מכל הספקים כמו בכל הארץ.${minTxt} מחירים בשקלים, כולל המחיר אחרי ` +
      `המבצע. השוואה חינמית.`,
    path: `/compare/${service}/${city}`,
    // HONESTY + crawl-quality: mobile/abroad are uniformly NATIONAL, so 42 near-
    // identical city pages per such service are thin/duplicate doorway content —
    // we noindex (but keep follow, so they stay crawlable for internal linking).
    // Infra-dependent services (fiber/internet/tv/triple) carry genuine local
    // nuance (rollout differs per address) and stay indexable.
    robots: isInfraDependent(svc) ? undefined : { index: false, follow: true },
  });
}

// A factual, HONEST 40–50 word Hebrew localized conclusion. It states national
// availability up front (truthful) and names the real cheapest plan.
function buildSummary(svc: Service, c: City, plans: Plan[]): string {
  const providerNames = [...new Set(plans.map((p) => p.provider))];
  const cheapest = cheapestOf(plans);
  const min = cheapest?.price ?? 0;
  return (
    `מסלולי ${svc.label} ב${c.name}: הזמינות ארצית — אותם ${providerNames.length} ` +
    `ספקים כמו בכל הארץ, ללא הבדל מחיר לפי עיר. מבין ${plans.length} המסלולים, ` +
    `הזול ביותר הוא ${cheapest?.plan ?? ""} של ${cheapest?.provider ?? ""} ` +
    `ב-${ils(min)}. מחירים בשקלים, כולל המחיר אחרי המבצע. ההשוואה חינמית.`
  );
}

// Authority "truth table": buyer factor → winning plan → FACTUAL catalogue reason.
// Identical winners nationwide (no fabricated "best in <city>").
function cheapestBy(plans: Plan[], pred: (p: Plan) => boolean): Plan | undefined {
  return plans.filter(pred).sort((a, b) => a.price - b.price)[0];
}

function buildAuthority(
  svc: Service,
  c: City,
  plansIn: Plan[],
): { answer: string; rows: { factor: string; winner: string; reason: string }[] } {
  const plans = [...plansIn];
  const cheapest = cheapestBy(plans, () => true);
  const cheapestNoCommit = cheapestBy(plans, (p) => p.noCommit);
  const cheapest5G = cheapestBy(plans, (p) => p.is5G);
  const cheapestStable = cheapestBy(
    plans,
    (p) => p.after == null || (typeof p.after === "number" && p.after <= p.price),
  );

  const rows: { factor: string; winner: string; reason: string }[] = [];
  if (cheapest) {
    rows.push({
      factor: "המחיר ההתחלתי הזול ביותר",
      winner: `${cheapest.provider} — ${cheapest.plan}`,
      reason: `המחיר ההתחלתי הנמוך ביותר (זהה בכל הארץ): ${ils(cheapest.price)}.`,
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

  const answer = cheapest
    ? `מסלולי ${svc.label} ב${c.name} זהים לאלו שבכל הארץ — אותם ספקים, אותם ` +
      `מחירים. המסלול עם המחיר ההתחלתי הנמוך ביותר בקטלוג שלנו הוא ${cheapest.plan} ` +
      `של ${cheapest.provider} ב-${ils(cheapest.price)}. הבחירה תלויה בגורם החשוב ` +
      `לכם, כמפורט בטבלה.`
    : `מסלולי ${svc.label} ב${c.name} זהים לאלו שבכל הארץ — אותם ספקים ומסלולים.`;
  return { answer, rows };
}

// HONEST local FAQ: the questions a real resident would ask, answered truthfully —
// the key answer is "availability is national; price does not vary by city".
function buildLocalFaq(svc: Service, c: City, plans: Plan[]): QA[] {
  const providerCount = new Set(plans.map((p) => p.provider)).size;
  const cheapest = cheapestOf(plans);

  const qa: QA[] = [
    {
      question: `אילו ספקי ${svc.label} זמינים ב${c.name}?`,
      answer:
        `אותם ספקים הזמינים בכל הארץ. שוק התקשורת בישראל הוא ארצי — ${providerCount} ` +
        `הספקים שבהשוואה פועלים ב${c.name} בדיוק כמו בכל עיר אחרת, ובאותם מחירים.`,
    },
    {
      question: `האם מחירי ${svc.label} שונים ב${c.name}?`,
      answer:
        `לא. המחירים אחידים ארצית ואינם משתנים לפי עיר. ` +
        (cheapest
          ? `המסלול הזול ביותר בקטלוג הוא ${cheapest.plan} של ${cheapest.provider} ` +
            `ב-${ils(cheapest.price)} — אותו מחיר ב${c.name} ובכל מקום.`
          : `כל המסלולים בהשוואה זמינים ב${c.name} באותו מחיר ארצי.`),
    },
  ];

  if (isInfraDependent(svc)) {
    qa.push({
      question: `האם יש סיב אופטי / חיבור קווי ב${c.name}?`,
      answer:
        `זמינות תשתית קווית (סיב אופטי/כבלים) תלויה בכתובת המדויקת ובקצב פריסת ` +
        `התשתית, ולא רק בעיר. כדאי לבדוק זמינות לכתובת שלכם ב${c.name} ישירות מול ` +
        `הספק לפני ההזמנה. המסלולים והמחירים עצמם אחידים ארצית.`,
    });
  }

  qa.push({
    question: `האם אפשר לשמור על מספר הטלפון במעבר ב${c.name}?`,
    answer:
      `כן. ניוד מספר חינמי ושומר על אותו מספר בכל הארץ, כולל ב${c.name}. ` +
      `התהליך מתבצע מול הספק החדש ואינו תלוי במיקום.`,
  });

  return qa;
}

// Grouped semantic interlinking: up to the national service hub, OTHER services in
// THIS city ("שירותים נוספים ב<city>"), and the SAME service in NEARBY cities
// (same district first, then others) — "ערים קרובות". No dead-ends; every link is
// a real on-site URL.
function buildRelatedGroups(svc: Service, c: City): RelatedLinkGroup[] {
  const groups: RelatedLinkGroup[] = [];

  groups.push({
    title: "השוואה ארצית",
    links: [
      {
        href: `/compare/${svc.slug}`,
        label: `כל השוואת ${svc.label}`,
        hint: `השוואת ${svc.label} הארצית המלאה.`,
      },
    ],
  });

  groups.push({
    title: `שירותים נוספים ב${c.name}`,
    links: getServices()
      .filter((other) => other.slug !== svc.slug)
      .map((other) => ({
        href: `/compare/${other.slug}/${c.slug}`,
        label: `${other.label} ב${c.name}`,
        hint: `השוואת ${other.label} ב${c.name}.`,
      })),
  });

  // Same service in nearby cities — same district first (genuinely "nearby"),
  // then a few from other districts to keep the graph connected.
  const all = getCities().filter((x) => x.slug !== c.slug);
  const sameDistrict = all.filter((x) => x.district === c.district);
  const others = all.filter((x) => x.district !== c.district);
  groups.push({
    title: "ערים קרובות",
    links: [...sameDistrict, ...others].slice(0, 6).map((city) => ({
      href: `/compare/${svc.slug}/${city.slug}`,
      label: `${svc.label} ב${city.name}`,
      hint: city.district,
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

export default async function ServiceCityPage({ params }: Params) {
  const { service, city } = await params;
  const svc = serviceBySlug(service);
  const c = cityBySlug(city);
  if (!svc || !c) notFound();

  // ── ONE source of truth per render ──────────────────────────────────────────
  // Read the live catalogue ONCE (scoped to this service's category) and thread
  // the SAME plan list through the table, the AEO answer/Q&A, the LLM feed and
  // every JSON-LD block. getLivePlans falls back to the bundled snapshot
  // (stale: true) on any failure and never throws.
  const { plans: livePlans, stale, lastUpdated } = await getLivePlans({
    category: svc.categories[0],
  });
  const plans = livePlans.length ? livePlans : plansForService(service);
  const asOf = lastUpdated ?? lastDataDate(plans);

  // AEO surfaces, all from the SAME `plans`. The city is threaded so the direct
  // answer/feed honestly note national availability (same plans everywhere).
  const directAnswer = directAnswerFor(service, c.name, plans);
  const questions: AeoQuestion[] = pageQuestions(service, plans);

  // Lowest headline price across the live plans — the amber (VALUE) hero stat.
  // Same `plans` the table renders; identical nationwide (no per-city price).
  const heroMin = cheapestOf(plans)?.price ?? null;
  const summary = buildSummary(svc, c, plans);
  const authority = buildAuthority(svc, c, plans);
  const faqs = buildLocalFaq(svc, c, plans);
  const relatedGroups = buildRelatedGroups(svc, c);
  const cats = new Set(svc.categories);
  const svcProviders = getProviders().filter((pr) =>
    pr.categories.some((cat) => cats.has(cat)),
  );

  const pagePath = `/compare/${service}/${city}`;
  const crumbs = [
    { name: "בית", url: "/" },
    { name: "השוואה", url: "/compare" },
    { name: svc.label, url: `/compare/${service}` },
    { name: c.name, url: pagePath },
  ];

  // AEO JSON-LD, derived from the SAME `plans` + `questions` so structured data
  // never disagrees with the visible answer/table. null-returning builders are
  // filtered out before render. NOTE: indexing of mobile/abroad city pages is
  // governed by generateMetadata's robots (unchanged) — emitting honest
  // structured data here is independent of, and does not override, that.
  // Single FAQPage for the whole page: the honest local Qs + the data-derived AEO
  // Qs, deduped by question text (both sets are rendered visibly: `faqs` in the
  // FAQ section, `questions` in <AeoQA>), so one FAQPage node mirrors all visible
  // Q&A rather than emitting two competing FAQPage entities.
  const faqSeen = new Set<string>();
  const allFaqs: QA[] = [...faqs, ...questions].filter((qa) => {
    if (faqSeen.has(qa.question)) return false;
    faqSeen.add(qa.question);
    return true;
  });

  const aeoJsonLd = [
    pageAggregateOfferSchema(plans),
    directAnswer
      ? speakableSchema(["#aeo-answer [data-direct-answer]", "h1"])
      : null,
  ].filter(Boolean) as Record<string, unknown>[];

  // Place schema for the city, enriched with the real administrative district as
  // a containedInPlace AdministrativeArea (honest public data).
  const place = placeSchema({ city: c.name, lat: c.lat, lng: c.lng });
  place.containedInPlace = {
    "@type": "AdministrativeArea",
    name: c.district,
    address: { "@type": "PostalAddress", addressCountry: "IL" },
  };
  // Bare GeoCoordinates node (also embedded in place.geo) for engines that read it.
  const geo = geoSchema({ lat: c.lat, lng: c.lng });

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      {/* Page-scoped entrance reveal (Emil Kowalski rules): a single fade + lift on
          the header so the page settles in crisply. Server CSS only (no JS),
          references the shared --ease-out token, animates ONLY transform + opacity.
          Reduced-motion removes the animation so the header renders statically at
          its resting (fully visible) state. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .sw-reveal { animation: swReveal 420ms var(--ease-out) both; }
        @keyframes swReveal {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sw-reveal { animation: none; }
        }
      `,
        }}
      />

      {/* GEO structured data: CollectionPage + Place/GeoCoordinates/AdminArea +
          ItemList + FAQ + Breadcrumb + KnowledgeGraph. Each plan's Product data is
          serialized ONCE in the standalone ItemList and once more (entity-linked)
          in the knowledgeWebSchema @graph below — we deliberately do NOT also embed
          it in the CollectionPage (no `plans`) nor emit a per-plan productSchema
          loop, to keep the JSON-LD payload lean on these 252 geo pages. */}
      <JsonLd
        data={collectionPageSchema({
          name: `${svc.label} ב${c.name}`,
          description: `השוואת ${svc.label} ב${c.name} — זמינות ארצית, אותם ספקים ומחירים כמו בכל הארץ.`,
          url: `/compare/${service}/${city}`,
        })}
      />
      <JsonLd data={place} />
      <JsonLd data={geo} />
      <JsonLd data={itemListSchema(plans)} />
      {/* ONE FAQPage mirroring all visible Q&A (local FAQ + AEO Q&A, deduped). */}
      <JsonLd data={faqPageSchema(allFaqs)} />
      <JsonLd data={breadcrumbSchema(crumbs)} />
      <JsonLd
        data={knowledgeGraphSchema({
          pageUrl: `/compare/${service}/${city}`,
          pageName: `${svc.label} ב${c.name}`,
          providers: svcProviders,
          plans,
          serviceType: `השוואת ${svc.label}`,
          description: `השוואת ${svc.label} ב${c.name} — זמינות ארצית.`,
          // Honest cross-link up to the national service comparison.
          related: [
            { id: `/compare/${service}`, name: `השוואת ${svc.label}` },
          ],
        })}
      />
      {/* Internal cross-links as a SiteNavigationElement list (mirrors RelatedLinks). */}
      {(() => {
        const nav = relatedLinksSchema({
          name: `עמודים קשורים — ${svc.label} ב${c.name}`,
          links: relatedNavLinks(relatedGroups),
        });
        return nav ? <JsonLd data={nav} /> : null;
      })()}
      {/* AEO structured data from the SAME `plans`: page-level AggregateOffer + a
          speakable spec for the direct-answer node + H1. (The FAQPage is emitted
          once above, merged with the local FAQ.) */}
      {aeoJsonLd.map((data, i) => (
        <JsonLd key={`aeo-${i}`} data={data} />
      ))}
      {/* Machine-readable LLM data feed: one compact JSON snapshot of the real
          plans, city-tagged (availability still national). */}
      <LlmDataFeed
        plans={plans}
        meta={{ service, city: c.name, url: pagePath, asOf, stale }}
      />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <Link href={`/compare/${service}`} className="interactive hover:text-accent">
          השוואת {svc.label}
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">{c.name}</span>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────────
          Conversational, intent-matching H1 (the real local query "what's the
          cheapest <service> in <city>?") — answered directly by the AEO block.
          The eyebrow names the service × city (with the real district) so the
          local framing is honest and scannable; the stat row carries the REAL
          catalogue facts, lowest price amber (VALUE). */}
      <header className="mt-4">
        <span
          className="sw-reveal inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 font-display text-xs font-semibold tracking-tight text-accent-text"
        >
          <Icon name="search" size={14} aria-hidden="true" />
          {svc.label} ב{c.name} · {c.district}
        </span>
        <h1
          className="sw-reveal mt-4 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl"
          style={{ animationDelay: "40ms" }}
        >
          מהו מסלול ה{svc.label} הזול ביותר ב{c.name}?
        </h1>
        <p
          className="sw-reveal mt-4 max-w-2xl text-lg leading-relaxed text-foreground"
          style={{ animationDelay: "80ms" }}
        >
          הזמינות ארצית — אותם ספקים ומסלולי {svc.label} זמינים ב{c.name}
          {" "}({c.district}) כמו בכל הארץ, ובאותם מחירים. {plans.length} מסלולים,
          ממוינים מהזול ליקר.
        </p>
        <dl
          className="sw-reveal mt-6 flex flex-wrap items-center gap-x-6 gap-y-3"
          style={{ animationDelay: "120ms" }}
        >
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">מסלולים בהשוואה</dt>
            <dd className="font-display text-xl font-bold tracking-tight text-ink">
              {plans.length.toLocaleString("he-IL")}
            </dd>
            <span className="text-sm text-muted">מסלולים</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">ספקים</dt>
            <dd className="font-display text-xl font-bold tracking-tight text-ink">
              {svcProviders.length.toLocaleString("he-IL")}
            </dd>
            <span className="text-sm text-muted">ספקים</span>
          </div>
          {heroMin != null && (
            <div className="flex items-baseline gap-1.5">
              <dt className="sr-only">המחיר ההתחלתי הנמוך ביותר</dt>
              <dd className="font-display text-xl font-bold tracking-tight text-value-text">
                {ils(heroMin)}
              </dd>
              <span className="text-sm text-muted">החל מ-</span>
            </div>
          )}
        </dl>
      </header>

      {/* ── AEO zero-click direct answer (right below the H1) ──────────────── */}
      {directAnswer && (
        <div className="mt-6">
          <AeoAnswerBlock
            answer={directAnswer}
            dateModified={asOf}
            stale={stale}
          />
        </div>
      )}

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary>{summary}</SgeSummary>
      </div>

      {/* ── Authority block: direct answer + truth table + verification stamp ─ */}
      <div className="mt-8">
        <AuthorityBlock
          heading={`השורה התחתונה: ${svc.label} ב${c.name}`}
          answer={authority.answer}
          rows={authority.rows}
          reviewedAt={REVIEWED_AT}
        />
      </div>

      {/* ── Comparison table ────────────────────────────────────────────────
          The core product, localized. A visible heading + intent caption frame
          the table (was an sr-only h2). The caption restates the honest national
          framing (same prices everywhere). Empty live read → shared EmptyState
          rather than an empty table. */}
      <section aria-labelledby="table-h" className="mt-12">
        <h2
          id="table-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          טבלת השוואת {svc.label} ב{c.name}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          {plans.length} מסלולים מכל הספקים, זה מול זה — אותם מחירים ארציים ב
          {c.name} כמו בכל הארץ, ממוינים מהזול ליקר.
        </p>
        {plans.length === 0 ? (
          <EmptyState
            className="mt-6"
            mascot
            title={`אין כרגע מסלולי ${svc.label} בקטלוג`}
            description={`הנתונים מתעדכנים בכל פרסום של האתר. אפשר לחזור בקרוב או לעיין בכל השוואות ${svc.label}.`}
            cta={{ label: `לכל השוואת ${svc.label}`, href: `/compare/${service}` }}
          />
        ) : (
          <>
            <ComparisonTable
              plans={plans}
              caption={`השוואת ${svc.label} ב${c.name} — מחירים בשקלים (אחידים ארצית), כולל מחיר אחרי המבצע`}
            />
            <PriceCaveat className="mt-3" />
          </>
        )}
      </section>

      {/* ── AEO conversational Q&A (data-derived; part of the page's FAQPage) ── */}
      {questions.length > 0 && (
        <AeoQA
          questions={questions}
          heading={`שאלות ותשובות — ${svc.label}`}
          className="mt-10"
        />
      )}

      {/* ── Honest local nuance note ──────────────────────────────────────── */}
      <section
        aria-labelledby="local-note-h"
        className="bento mt-10 p-6 sm:p-7"
      >
        <h2
          id="local-note-h"
          className="flex items-center gap-2 font-display text-base font-semibold tracking-tight text-ink"
        >
          <span
            aria-hidden="true"
            className="inline-block h-4 w-1 rounded-full bg-accent"
          />
          מה כדאי לדעת על {c.name}
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground">
          שוק התקשורת בישראל ארצי: אותם ספקים ומחירים ב{c.name} כמו בכל עיר.{" "}
          {isInfraDependent(svc)
            ? `הניואנס המקומי היחיד הוא תשתית קווית — זמינות סיב אופטי/כבלים תלויה ` +
              `בכתובת המדויקת ובקצב הפריסה. מומלץ לבדוק זמינות לכתובת שלכם ב${c.name} ` +
              `ישירות מול הספק לפני ההזמנה.`
            : `שירות זה ניתן באופן ארצי וזהה בכל הארץ, כך שאין הבדל זמינות או מחיר ` +
              `בין ${c.name} לערים אחרות.`}
        </p>
      </section>

      {/* ── FAQ (honest local Qs) ─────────────────────────────────────────── */}
      <section aria-labelledby="faq-h" className="mt-16">
        <h2
          id="faq-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          שאלות נפוצות — {svc.label} ב{c.name}
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

      {/* ── Sources & methodology (E-E-A-T "show your work") ───────────────── */}
      <DataMethodology
        dateModified={asOf}
        stale={stale}
        planCount={plans.length}
        className="mt-12"
      />

      {/* ── Lead form ─────────────────────────────────────────────────────── */}
      <section id="lead" aria-labelledby="lead-h" className="mt-20 scroll-mt-6">
        <h2
          id="lead-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          רוצים עזרה לבחור {svc.label} ב{c.name}?
        </h2>
        <p className="mt-2 leading-relaxed text-foreground">
          השאירו פרטים ונחזור אליכם עם המלצה מותאמת — חינם וללא התחייבות.
        </p>
        {/* Compact trust strip — real counts (national availability) + methodology. */}
        <TrustSignals
          variant="compact"
          planCount={plans.length}
          providerCount={svcProviders.length}
          className="mt-4 max-w-xl"
        />
        {/* Objection-handling / reassurance microcopy before the hand-off. */}
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
          {[
            "אין עלות ואין התחייבות",
            "פונים אליכם רק אחרי אישור בטופס",
            "אפשר להסיר את הפרטים בכל עת",
          ].map((point) => (
            <li key={point} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="text-accent-text">
                ✓
              </span>
              {point}
            </li>
          ))}
        </ul>
        {/* Commission disclosure repeated before the lead hand-off (§7b). */}
        <CommissionDisclosure variant="inline" className="mt-3 max-w-xl" />
        <div className="mt-5 max-w-xl">
          <LeadForm
            source="compare"
            defaultCategory={leadCategory(svc.categories[0])}
            defaultCity={c.name}
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

      {/* ── Mobile sticky lead CTA — scrolls to #lead; auto-hides in view. ─── */}
      <StickyLeadCta source="city" />
    </main>
  );
}
