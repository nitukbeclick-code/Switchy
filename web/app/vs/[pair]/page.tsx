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

import type { CSSProperties } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import AuthorityBlock from "@/components/AuthorityBlock";
import ComparisonTable from "@/components/ComparisonTable";
import RelatedLinks from "@/components/RelatedLinks";
import type { RelatedLinkGroup } from "@/components/RelatedLinks";
import LeadForm from "@/components/LeadForm";
import AeoAnswerBlock from "@/components/AeoAnswerBlock";
import AeoQA from "@/components/AeoQA";
import DataMethodology from "@/components/DataMethodology";
import FactCheckBadge from "@/components/FactCheckBadge";
import LlmDataFeed from "@/components/LlmDataFeed";
import { getVsPairs, getVsPair, vsVerdict } from "@/lib/vs";
import type { VsPair, VsSide } from "@/lib/vs";
import { getProviders } from "@/lib/data";
import { getLivePlans } from "@/lib/live-catalogue";
import { pageQuestions, lastDataDate } from "@/lib/aeo";
import type { AeoQuestion } from "@/lib/aeo";
import {
  comparisonSchema,
  faqPageSchema,
  breadcrumbSchema,
  knowledgeGraphSchema,
  knowledgeWebSchema,
  relatedLinksSchema,
  pageAggregateOfferSchema,
  speakableSchema,
  SITE_URL,
  type NavLink,
  type QA,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { GENERAL_FAQ } from "@/lib/faq";
import { ils, leadCategory } from "@/lib/format";
import type { Plan } from "@/lib/types";

// One page per curated, catalogue-gated match-up, pre-rendered at build time.
// Unknown pairs -> real 404. ISR keeps the static HTML fresh against the live DB
// (revalidate hourly) while still serving instantly from cache.
export const dynamicParams = false;
export const revalidate = 3600;
export function generateStaticParams() {
  return getVsPairs().map((p) => ({ pair: p.slug }));
}

interface Params {
  params: Promise<{ pair: string }>;
}

// The catalogue is rebuilt with the deploy; the render date is the honest
// "last reviewed" date (when the data behind this page was regenerated).
const REVIEWED_AT = new Date().toISOString().slice(0, 10);

/**
 * Rebuild one side of a match-up from a LIVE plan list (so the page's table,
 * answer, feed and schema all read the SAME fresh rows). Filters the live plans
 * to this provider + the pair's category, cheapest first. Returns null when the
 * live data has no plan for this side, so the caller can fall back to the bundled
 * side rather than render an empty/false comparison.
 */
function liveSide(base: VsSide, livePlans: Plan[]): VsSide | null {
  const plans = livePlans
    .filter(
      (p) => p.provider === base.provider.name && typeof p.price === "number",
    )
    .sort((x, y) => x.price - y.price);
  if (plans.length === 0) return null;
  const cheapest = plans[0];
  return {
    provider: base.provider,
    plans,
    minPrice: cheapest.price,
    planCount: plans.length,
    cheapest,
  };
}

/**
 * Re-resolve a {@link VsPair} against the live catalogue for the pair's category.
 * Both sides are rebuilt from the SAME live plan list; if EITHER side has no live
 * plan (the live read dropped it), we keep the bundled pair so the page is never
 * degraded. Returns the (possibly live) pair plus provenance flags from the read.
 */
function resolveLivePair(
  pair: VsPair,
  livePlans: Plan[],
): VsPair {
  const a = liveSide(pair.a, livePlans);
  const b = liveSide(pair.b, livePlans);
  if (!a || !b) return pair; // incomplete live data → bundled fallback pair.
  return { ...pair, a, b };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { pair: slug } = await params;
  const pair = getVsPair(slug);
  if (!pair) return {};
  const { a, b, categoryLabel } = pair;
  const aN = a.provider.name;
  const bN = b.provider.name;
  // Bare title — the root layout's title template brands the <title> once (the OG
  // title is brand-normalised by pageMetadata). The inline brand suffix here was
  // previously double-applied by the template → "… | brand | brand".
  return pageMetadata({
    title: `${aN} מול ${bN} — השוואת ${categoryLabel}`,
    description:
      `${aN} מול ${bN} ב${categoryLabel}: השוואה ישירה של מחירים ומסלולים — ` +
      `${aN} החל מ-${ils(a.minPrice)}, ${bN} החל מ-${ils(b.minPrice)}. ` +
      `מי זול יותר, מי מציע יותר אפשרויות, ומחירים בשקלים. השוואה חינמית.`,
    path: `/vs/${slug}`,
  });
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
// `style` is an optional pass-through so the caller can stagger the entrance
// reveal (animationDelay) without changing the card's layout or content.
//
// `value` marks THIS side as the lower-entry-price one (a real, derived read from
// vsVerdict — null on a tie). When set, the entry-price figure keeps the amber
// VALUE token and a "הזול ביותר בכניסה" VALUE pill is shown; the card also gains a
// faint amber ring + glow so the head-to-head winner is the card's focal point.
// The OTHER side's entry price is rendered in neutral ink so amber stays a
// discriminating VALUE signal (not a flat color on every figure).
function SideCard({
  side,
  label,
  value = false,
  style,
}: {
  side: VsSide;
  label: string;
  value?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={[
        "sw-reveal bento card-interactive p-6",
        value ? "border-value/35 glow-value" : "",
      ]
        .join(" ")
        .trim()}
      style={style}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {value && (
          <span className="inline-flex items-center rounded-full bg-value/12 px-2 py-0.5 text-[11px] font-semibold text-value-text">
            הזול ביותר בכניסה
          </span>
        )}
      </div>
      <h3 className="mt-1 font-display text-xl font-bold tracking-tight text-ink">
        <Link
          href={`/providers/${side.provider.slug}`}
          className="interactive hover:text-accent"
        >
          {side.provider.name}
        </Link>
      </h3>
      <dl className="mt-5 flex flex-wrap items-start gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-muted">מחיר התחלתי</dt>
          <dd
            className={[
              "font-display text-3xl font-bold tracking-tight",
              value ? "text-value-text" : "text-ink",
            ].join(" ")}
          >
            {ils(side.minPrice)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">מסלולים בקטגוריה</dt>
          <dd className="font-display text-3xl font-bold tracking-tight text-ink">
            {side.planCount}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-foreground">
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

// Grouped related links: both sides' provider pages ("עמודי הספקים"), the category
// compare hub ("השוואה רחבה"), and other curated match-ups that share a provider
// ("השוואות קשורות"). Every link is a real on-site URL. No dead-ends.
function buildRelatedGroups(pair: VsPair): RelatedLinkGroup[] {
  const { a, b, category, categoryLabel } = pair;
  const groups: RelatedLinkGroup[] = [];

  groups.push({
    title: "עמודי הספקים",
    links: [
      {
        href: `/providers/${a.provider.slug}`,
        label: a.provider.name,
        hint: `כל מסלולי ${a.provider.name}.`,
      },
      {
        href: `/providers/${b.provider.slug}`,
        label: b.provider.name,
        hint: `כל מסלולי ${b.provider.name}.`,
      },
    ],
  });

  groups.push({
    title: "השוואה רחבה",
    links: [
      {
        href: `/compare/${category}`,
        label: `השוואת ${categoryLabel}`,
        hint: `כל הספקים ב${categoryLabel}, לא רק שניים.`,
      },
    ],
  });

  // Other curated match-ups that share one of the two providers.
  const relatedPairs: RelatedLinkGroup["links"] = [];
  for (const other of getVsPairs()) {
    if (other.slug === pair.slug) continue;
    const sharesA =
      other.a.provider.slug === a.provider.slug ||
      other.b.provider.slug === a.provider.slug;
    const sharesB =
      other.a.provider.slug === b.provider.slug ||
      other.b.provider.slug === b.provider.slug;
    if (!sharesA && !sharesB) continue;
    relatedPairs.push({
      href: `/vs/${other.slug}`,
      label: `${other.a.provider.name} מול ${other.b.provider.name}`,
      hint: `השוואת ${other.categoryLabel}.`,
    });
    if (relatedPairs.length >= 6) break;
  }
  groups.push({ title: "השוואות קשורות", links: relatedPairs });

  return groups;
}

/** Flatten the grouped links into NavLinks for the relatedLinksSchema ItemList. */
function relatedNavLinks(groups: RelatedLinkGroup[]): NavLink[] {
  return groups.flatMap((g) =>
    g.links.map((l) => ({ name: l.label, url: l.href, description: l.hint })),
  );
}

export default async function VsPage({ params }: Params) {
  const { pair: slug } = await params;
  const bundledPair = getVsPair(slug);
  if (!bundledPair) notFound();

  // ── AEO: read the live catalogue ONCE for this pair's category, then thread
  // the SAME plan list through the table, the AEO helpers, the components and the
  // JSON-LD so they can never disagree. Resilient: getLivePlans never throws and
  // falls back to the bundled snapshot (stale: true); if either side has no live
  // plan we keep the bundled pair so the comparison is never degraded.
  const live = await getLivePlans({ category: bundledPair.category });
  const pair = resolveLivePair(bundledPair, live.plans);

  const { a, b, category, categoryLabel } = pair;
  const aN = a.provider.name;
  const bN = b.provider.name;
  const verdict = vsVerdict(pair);
  const allPlans = combinedPlans(pair);
  const authorityRows = buildAuthorityRows(pair);
  const faqs = buildFaqs(pair);
  const relatedGroups = buildRelatedGroups(pair);

  // Real "data as of" date: the live read's lastUpdated when present, else the
  // newest plan timestamp, else today's build date (never a fabricated future).
  const asOf = live.lastUpdated ?? lastDataDate(allPlans);

  // AEO conversational Q&A — FACTUAL answers derived from the SAME combined plan
  // list (cheapest / no-commit / 5G / abroad). fiber maps to internet upstream;
  // here the pair's own category id is the service. Empties are omitted by the
  // helper, so these only appear when the data supports them.
  const aeoQuestions: AeoQuestion[] = pageQuestions(category, allPlans);

  // The two representative plans (cheapest per side), cheapest-first, for the
  // comparison ItemList JSON-LD.
  const repPlans = [a.cheapest, b.cheapest].sort((x, y) => x.price - y.price);
  const providers = [a.provider, b.provider];

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "השוואות", url: "/compare" },
    { name: `${aN} מול ${bN}`, url: `/vs/${slug}` },
  ];

  // The head-to-head verdict, derived from the real plans — NO fabricated winner.
  // vsVerdict() already says "tie" when entry prices are equal, so this is the
  // honest zero-click answer the engines lift.
  const answer =
    `בהשוואת ${categoryLabel} בין ${aN} ל${bN}: ` + verdict.summary;

  // AggregateOffer + speakable JSON-LD over the SAME plans (null when no data).
  const offerSchema = pageAggregateOfferSchema(allPlans);
  const speakable = speakableSchema(["#aeo-answer [data-direct-answer]", "h1"]);

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      {/* Page-scoped entrance motion (Emil Kowalski rules): a one-time fade + 10px
          lift, staggered 30–80ms via inline animationDelay. Server-rendered CSS
          only (no JS) — references the shared --ease-out token and animates ONLY
          transform + opacity (GPU). Reduced-motion: the animation is removed so
          blocks render statically at their already-visible resting state. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .sw-reveal { animation: swReveal 420ms var(--ease-out) both; }
        @keyframes swReveal {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sw-reveal { animation: none; }
        }
      `,
        }}
      />

      {/* GEO structured data: comparison ItemList + FAQ + Breadcrumb + KnowledgeGraph + KnowledgeWeb. */}
      <JsonLd
        data={comparisonSchema({
          name: `${aN} מול ${bN} — השוואת ${categoryLabel}`,
          url: `/vs/${slug}`,
          plans: repPlans,
        })}
      />
      {/* FAQPage merges the AEO conversational Q&A (visible in <AeoQA>) with the
          curated match-up FAQ — both data-derived, so structured ⊕ visible agree. */}
      <JsonLd
        data={faqPageSchema([
          ...aeoQuestions.map((q) => ({ question: q.question, answer: q.answer })),
          ...faqs,
        ])}
      />
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
      {/* Internal cross-links as a SiteNavigationElement list (mirrors RelatedLinks). */}
      {(() => {
        const nav = relatedLinksSchema({
          name: `עמודים קשורים — ${aN} מול ${bN}`,
          links: relatedNavLinks(relatedGroups),
        });
        return nav ? <JsonLd data={nav} /> : null;
      })()}
      {/* AEO: AggregateOffer (price range over both sides) + speakable (voice). */}
      {offerSchema && <JsonLd data={offerSchema} />}
      {speakable && <JsonLd data={speakable} />}

      {/* AEO pillar 3: machine-readable feed of the SAME combined plan list. */}
      <LlmDataFeed
        plans={allPlans}
        meta={{
          service: category,
          url: `${SITE_URL}/vs/${slug}`,
          asOf,
          stale: live.stale,
        }}
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

      {/* ── Heading (conversational, query-shaped) ────────────────────────── */}
      <header className="mt-4">
        <h1 className="sw-reveal font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          {aN} מול {bN} — מי זול יותר ב{categoryLabel}?
        </h1>
        <p
          className="sw-reveal mt-4 max-w-2xl text-lg leading-relaxed text-foreground"
          style={{ animationDelay: "60ms" }}
        >
          השוואה ישירה של מסלולי {categoryLabel} בין {aN} ל{bN} — מחיר התחלתי,
          מספר מסלולים ומאפיינים, הכל מתוך הקטלוג ובשקלים.
        </p>
      </header>

      {/* ── AEO zero-click answer — the head-to-head verdict engines lift ──── */}
      <AeoAnswerBlock
        answer={answer}
        dateModified={asOf}
        stale={live.stale}
        heading={`מי זול יותר — ${aN} או ${bN}?`}
        className="mt-8"
      />

      {/* ── Side-by-side stat cards ───────────────────────────────────────────
          A true A-vs-B layout: the two side cards flank a centered "מול" token so
          the head-to-head is unmistakable at a glance. The cheaper-entry side (a
          real, derived read from vsVerdict — null on a tie) gets the amber VALUE
          treatment so the value winner is the section's focal point. */}
      <section aria-labelledby="sides-h" className="mt-10">
        <h2 id="sides-h" className="sr-only">
          {aN} מול {bN} — נתוני הספקים
        </h2>
        <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <SideCard
            side={a}
            label={`צד א׳ — ${categoryLabel}`}
            value={verdict.cheaperSide === a}
          />
          {/* Center "מול" pivot — a circular ink token on a hairline rule. Purely
              decorative (the H1 + cards carry the meaning), so hidden from a11y. */}
          <div
            aria-hidden="true"
            className="flex items-center justify-center sm:flex-col"
          >
            <span className="h-px w-full bg-border sm:h-full sm:w-px" />
            <span className="mx-3 my-0 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-surface font-display text-sm font-bold text-muted shadow-[var(--shadow-soft)] sm:mx-0 sm:my-3">
              מול
            </span>
            <span className="h-px w-full bg-border sm:h-full sm:w-px" />
          </div>
          <SideCard
            side={b}
            label={`צד ב׳ — ${categoryLabel}`}
            value={verdict.cheaperSide === b}
            style={{ animationDelay: "60ms" }}
          />
        </div>
      </section>

      {/* ── Authority block: per-factor truth table + verification stamp ──── */}
      <div className="mt-8">
        <AuthorityBlock
          heading="מי מנצח בכל פרמטר"
          answer={`פירוק מלא של ההשוואה בין ${aN} ל${bN} ב${categoryLabel} — מי מנצח בכל פרמטר, לפי הקטלוג.`}
          rows={authorityRows}
          tableCaption={`${aN} מול ${bN} — מי מנצח בכל פרמטר ולמה`}
          reviewedAt={REVIEWED_AT}
        />
      </div>

      {/* ── Unified comparison table (every plan from both sides) ──────────── */}
      <section aria-labelledby="table-h" className="mt-14">
        <h2 id="table-h" className="font-display text-2xl font-bold tracking-tight text-ink">
          כל מסלולי {categoryLabel} — {aN} ו{bN}
        </h2>
        <div className="mt-5">
          <ComparisonTable
            plans={allPlans}
            caption={`${aN} מול ${bN} ב${categoryLabel} — מחירים בשקלים, כולל מחיר אחרי המבצע`}
          />
        </div>
        {/* Honest verification stamp for the table's price claims. */}
        <FactCheckBadge dateModified={asOf} className="mt-3" />
      </section>

      {/* ── AEO conversational Q&A (data-derived, mirrors FAQPage JSON-LD) ─── */}
      {aeoQuestions.length > 0 && (
        <AeoQA
          questions={aeoQuestions}
          heading={`שאלות נפוצות — ${aN} מול ${bN}`}
          className="mt-14"
        />
      )}

      {/* ── FAQ — curated match-up questions (distinct from the AEO Q&A above) ─ */}
      <section aria-labelledby="faq-h" className="mt-14">
        <h2 id="faq-h" className="font-display text-2xl font-bold tracking-tight text-ink">
          {aN} מול {bN} — ההבדלים בקצרה
        </h2>
        <div className="card mt-6 divide-y divide-border/60 overflow-hidden">
          {faqs.map((qa) => (
            <details key={qa.question} className="group p-5">
              <summary className="interactive flex cursor-pointer list-none items-center gap-2 rounded-md font-display font-semibold text-ink marker:hidden hover:text-accent">
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

      {/* ── Sources & methodology — show your work (E-E-A-T) ──────────────── */}
      <DataMethodology
        dateModified={asOf}
        stale={live.stale}
        planCount={allPlans.length}
        className="mt-14"
      />

      {/* ── Semantic interlinking — grouped, no dead-ends ─────────────────── */}
      <RelatedLinks
        heading="השוואות וספקים נוספים"
        groups={relatedGroups}
        className="mt-16"
      />

    </main>
  );
}
