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
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import AuthorityBlock from "@/components/AuthorityBlock";
import ComparisonTable from "@/components/ComparisonTable";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import LeadForm from "@/components/LeadForm";
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
  SITE_URL,
} from "@/lib/schema";
import type { QA } from "@/lib/schema";
import { ils, leadCategory } from "@/lib/format";

// Bounded matrix: every service × every city, pre-rendered at build time.
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
  return {
    title: `${svc.label} ב${c.name} — השוואת מסלולים וספקים`,
    description:
      `השוואת ${svc.label} ב${c.name}: הזמינות ארצית — אותם ${plans.length} ` +
      `מסלולים מכל הספקים כמו בכל הארץ.${minTxt} מחירים בשקלים, כולל המחיר אחרי ` +
      `המבצע. השוואה חינמית.`,
    alternates: { canonical: `/compare/${service}/${city}` },
    // HONESTY + crawl-quality: mobile/abroad are uniformly NATIONAL, so 42 near-
    // identical city pages per such service are thin/duplicate doorway content —
    // we noindex (but keep follow, so they stay crawlable for internal linking).
    // Infra-dependent services (fiber/internet/tv/triple) carry genuine local
    // nuance (rollout differs per address) and stay indexable.
    robots: isInfraDependent(svc) ? undefined : { index: false, follow: true },
  };
}

// A factual, HONEST 40–50 word Hebrew localized conclusion. It states national
// availability up front (truthful) and names the real cheapest plan.
function buildSummary(svc: Service, c: City): string {
  const plans = plansForService(svc.slug);
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
): { answer: string; rows: { factor: string; winner: string; reason: string }[] } {
  const plans = [...plansForService(svc.slug)];
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
function buildLocalFaq(svc: Service, c: City): QA[] {
  const plans = plansForService(svc.slug);
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

// Semantic interlinking: same service in nearby/other cities + the service hub +
// other services in THIS city. No dead-ends.
function buildRelated(
  svc: Service,
  c: City,
): { title: string; href: string; description?: string }[] {
  const links: { title: string; href: string; description?: string }[] = [];

  // Up to the service hub.
  links.push({
    title: `כל השוואת ${svc.label}`,
    href: `/compare/${svc.slug}`,
    description: `השוואת ${svc.label} הארצית המלאה.`,
  });

  // Other services in the same city (cross-axis).
  for (const other of getServices()) {
    if (other.slug === svc.slug) continue;
    links.push({
      title: `${other.label} ב${c.name}`,
      href: `/compare/${other.slug}/${c.slug}`,
      description: `השוואת ${other.label} ב${c.name}.`,
    });
  }

  // Same service in other cities in the SAME district first, then a few others.
  const all = getCities().filter((x) => x.slug !== c.slug);
  const sameDistrict = all.filter((x) => x.district === c.district);
  const others = all.filter((x) => x.district !== c.district);
  for (const city of [...sameDistrict, ...others].slice(0, 6)) {
    links.push({
      title: `${svc.label} ב${city.name}`,
      href: `/compare/${svc.slug}/${city.slug}`,
      description: `השוואת ${svc.label} ב${city.name} (${city.district}).`,
    });
  }

  return links;
}

export default async function ServiceCityPage({ params }: Params) {
  const { service, city } = await params;
  const svc = serviceBySlug(service);
  const c = cityBySlug(city);
  if (!svc || !c) notFound();

  const plans = plansForService(service);
  const summary = buildSummary(svc, c);
  const authority = buildAuthority(svc, c);
  const faqs = buildLocalFaq(svc, c);
  const related = buildRelated(svc, c);
  const cats = new Set(svc.categories);
  const svcProviders = getProviders().filter((pr) =>
    pr.categories.some((cat) => cats.has(cat)),
  );

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "השוואה", url: "/compare" },
    { name: svc.label, url: `/compare/${service}` },
    { name: c.name, url: `/compare/${service}/${city}` },
  ];

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
      <JsonLd data={faqPageSchema(faqs)} />
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

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <Link href={`/compare/${service}`} className="hover:text-accent">
          השוואת {svc.label}
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">{c.name}</span>
      </nav>

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-3">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          {svc.label} ב{c.name}
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-foreground">
          הזמינות ארצית — אותם ספקים ומסלולי {svc.label} זמינים ב{c.name}
          {" "}({c.district}) כמו בכל הארץ, ובאותם מחירים. {plans.length} מסלולים,
          ממוינים מהזול ליקר.
        </p>
      </header>

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

      {/* ── Comparison table ──────────────────────────────────────────────── */}
      <section aria-labelledby="table-h" className="mt-10">
        <h2 id="table-h" className="sr-only">
          טבלת השוואת {svc.label} ב{c.name}
        </h2>
        <ComparisonTable
          plans={plans}
          caption={`השוואת ${svc.label} ב${c.name} — מחירים בשקלים (אחידים ארצית), כולל מחיר אחרי המבצע`}
        />
      </section>

      {/* ── Honest local nuance note ──────────────────────────────────────── */}
      <section
        aria-labelledby="local-note-h"
        className="mt-10 rounded-2xl border border-border bg-surface p-5 sm:p-6"
      >
        <h2
          id="local-note-h"
          className="flex items-center gap-2 font-display text-base font-semibold text-ink"
        >
          <span
            aria-hidden="true"
            className="inline-block h-4 w-1 rounded-full bg-accent"
          />
          מה כדאי לדעת על {c.name}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-foreground">
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
      <section aria-labelledby="faq-h" className="mt-14">
        <h2 id="faq-h" className="font-display text-2xl font-bold text-ink">
          שאלות נפוצות — {svc.label} ב{c.name}
        </h2>
        <div className="mt-5 divide-y divide-border rounded-xl border border-border bg-surface">
          {faqs.map((qa) => (
            <details key={qa.question} className="group p-5">
              <summary className="cursor-pointer list-none font-display font-semibold text-ink marker:hidden">
                {qa.question}
              </summary>
              <p className="mt-2 text-foreground">{qa.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Lead form ─────────────────────────────────────────────────────── */}
      <section id="lead" aria-labelledby="lead-h" className="mt-16 scroll-mt-6">
        <h2 id="lead-h" className="font-display text-2xl font-bold text-ink">
          רוצים עזרה לבחור {svc.label} ב{c.name}?
        </h2>
        <p className="mt-2 text-foreground">
          השאירו פרטים ונחזור אליכם עם המלצה מותאמת — חינם וללא התחייבות.
        </p>
        <div className="mt-5 max-w-xl">
          <LeadForm
            source="compare"
            defaultCategory={leadCategory(svc.categories[0])}
          />
        </div>
      </section>

      {/* ── Semantic interlinking — no dead-ends ──────────────────────────── */}
      <RelatedAuthorityPages
        heading="המשיכו להשוות"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />

      <link rel="canonical" href={`${SITE_URL}/compare/${service}/${city}`} />
    </main>
  );
}
