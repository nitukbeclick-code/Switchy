// ────────────────────────────────────────────────────────────────────────────
// /plans/[id] — the RICH per-plan detail page (server component). The web mirror
// of the Flutter plan_detail surface (lib/pages/plan_detail/plan_detail_widget.dart
// + lib/models.dart): one plan, told in full — provider mark + name + price + the
// honest post-promo line, the complete spec grid (<PlanSpecGrid>), the upfront
// equipment/one-time-fees breakdown (<PlanFeesBreakdown>), the qualitative perks,
// the full "אותיות קטנות" behind a native disclosure, contract terms, eligibility,
// notes, the real source link + "עודכן" freshness stamp, a "מסלולים דומים" set,
// and the lead/booking CTAs.
//
// TRUTH-ONLY: every block is fed from the catalogue via planDetail() (the single
// source of truth shared with the comparison views) and renders ONLY fields that
// genuinely exist — an absent fee/spec/term/note is OMITTED, never a fabricated
// dash. No ratings are invented (rating UI must go through getAggregateRating,
// which returns null without real data; the catalogue currently carries none, so
// the Product schema's aggregateRating wiring stays dark until real data lands).
// The provider brand mark/color is the carrier's OWN (never recolored), and the
// post-promo price is honest — "מחיר קבוע" when there is no jump.
//
// SEO/GEO: self-canonical pageMetadata (real title/description from the plan) +
// Product/Offer JSON-LD (productSchema) + BreadcrumbList. The §7b commission
// disclosure and §17 price caveat sit near the price. Mobile-first, RTL, AA.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import { ProviderLogo } from "@/components/ProviderLogo";
import PlanSpecGrid from "@/components/PlanSpecGrid";
import PlanFeesBreakdown from "@/components/PlanFeesBreakdown";
import FreshnessBadge from "@/components/FreshnessBadge";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import PriceCaveat from "@/components/PriceCaveat";
import LeadForm from "@/components/LeadForm";
import RelatedLinks from "@/components/RelatedLinks";
import { getPlans, providerSlug, CATEGORY_HE } from "@/lib/data";
import { getLivePlans } from "@/lib/live-catalogue";
import { planDetail } from "@/lib/plan-display";
import { priceUnitLabel, ils, leadCategory } from "@/lib/format";
import { productSchema, breadcrumbSchema, relatedLinksSchema } from "@/lib/schema";
import {
  buildPlanRelatedGroups,
  relatedNavLinks,
} from "@/lib/related-links";
import { pageMetadata } from "@/lib/seo";
import type { Plan } from "@/lib/types";

// Pre-render one page per catalogue plan id at build time. Unknown ids return a
// real 404 (not a soft-200), so crawlers + users get the not-found page. The set
// of ids comes from the bundled catalogue (stable build-time params); the price /
// detail BODY is read live per render (see below) so it matches /compare.
export const dynamicParams = false;
export function generateStaticParams() {
  return getPlans().map((p) => ({ id: p.id }));
}

// ISR: regenerate the static HTML hourly so the live DB catalogue (price, after,
// fees, perks, fine-print + every JSON-LD block) stays fresh while still being
// served instantly from cache. The <CatalogueLiveRefresh> client mount freshens
// on top via realtime; the server HTML always carries the real prices for crawlers.
export const revalidate = 3600;

interface Params {
  params: Promise<{ id: string }>;
}

/** Resolve a plan by its catalogue id from a given plan list (live or bundled). */
function planByIdIn(plans: Plan[], id: string): Plan | undefined {
  return plans.find((p) => p.id === id);
}

/** Resolve a plan by its catalogue id from the BUNDLED snapshot (for metadata). */
function planById(id: string): Plan | undefined {
  return getPlans().find((p) => p.id === id);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const plan = planById(id);
  if (!plan) return {};

  const catHe = CATEGORY_HE[plan.cat] ?? plan.cat;
  const unit = priceUnitLabel(plan); // e.g. "לחודש" / "לחבילה"
  const d = planDetail(plan);
  const afterNote =
    d.after.kind === "jump"
      ? ` המחיר לאחר המבצע: ${d.after.text}.`
      : " מחיר קבוע — אינו עולה לאחר המבצע.";

  return pageMetadata({
    title: `${plan.plan} של ${plan.provider} — מחיר ופרטים מלאים`,
    description:
      `כל הפרטים על מסלול ${plan.plan} של ${plan.provider} (${catHe}): מחיר ` +
      `${ils(plan.price)} ${unit}, מפרט מלא, התקנה וציוד ותנאי המסלול.${afterNote} ` +
      `השוואה חינמית ובלי התחייבות.`,
    path: `/plans/${plan.id}`,
  });
}

/**
 * Up to 4 OTHER plans in the same category, nearest to this plan's price — the
 * "מסלולים דומים" set. Truth-only: only real catalogue plans, ranked by absolute
 * price distance (cheaper-first on ties), so the suggestions are genuinely the
 * closest alternatives the buyer can compare side by side.
 */
function similarPlans(plan: Plan, all: Plan[], limit = 4): Plan[] {
  return all
    .filter((p) => p.cat === plan.cat && p.id !== plan.id)
    .map((p) => ({
      p,
      dist: Math.abs((p.price ?? Infinity) - (plan.price ?? 0)),
    }))
    .sort((a, b) => a.dist - b.dist || (a.p.price ?? 0) - (b.p.price ?? 0))
    .slice(0, limit)
    .map((x) => x.p);
}

/** The honest post-promo line: an "לאחר המבצע" jump, or a neutral "מחיר קבוע". */
function AfterLine({ after }: { after: ReturnType<typeof planDetail>["after"] }) {
  if (after.kind === "jump") {
    return (
      <span className="text-foreground">
        לאחר המבצע:{" "}
        <span className="font-semibold text-ink">{after.text}</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full border border-value/30 bg-value/10 px-2.5 py-0.5 text-xs font-semibold text-value-text"
      title="המחיר אינו עולה לאחר תום המבצע"
    >
      {after.text}
    </span>
  );
}

export default async function PlanDetailPage({ params }: Params) {
  const { id } = await params;

  // ── ONE live catalogue read per render (bundled fallback on any failure) ──────
  // Read the live DB catalogue ONCE and resolve this plan + the "similar" set from
  // the SAME list, so the detail price/after/fees/perks match /compare exactly. On
  // any failure getLivePlans returns the bundled snapshot (never throws); if the
  // live list lacks this id (e.g. a build-time-only id) we fall back to the bundled
  // plan so the page is never blank for a valid pre-rendered id.
  const { plans: catalogue, stale } = await getLivePlans();
  const plan = planByIdIn(catalogue, id) ?? planById(id);
  if (!plan) notFound();

  const all = catalogue.length ? catalogue : getPlans();

  // The full truth-only detail bundle — the one call that drives every block.
  const d = planDetail(plan);
  const catHe = CATEGORY_HE[plan.cat] ?? plan.cat;
  const unit = priceUnitLabel(plan);

  // Fine-print to surface in the disclosure: everything NOT already shown as a
  // perk, so the "אותיות קטנות" adds detail rather than repeating the perks line.
  const shownPerks = new Set(d.perks);
  const extraFineLines = d.fineLines.filter((line) => !shownPerks.has(line));

  const similar = similarPlans(plan, all);

  // Catalogue-derived hub-spoke cross-links: the plan's provider page, the full
  // category /compare hub, the head-to-head /vs pages for this provider, the other
  // providers in the category, and the category's guides. Deepens the crawlable
  // entity graph; every href is a real on-site route. The relatedLinksSchema
  // ItemList mirrors the rendered block (de-duped by url) and is omitted when empty.
  const relatedGroups = buildPlanRelatedGroups(plan);
  const relatedNav = relatedNavLinks(relatedGroups);

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "מחירון", url: "/plans" },
    { name: `${plan.provider} — ${plan.plan}`, url: `/plans/${plan.id}` },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      {/* ── Structured data: Product/Offer (ILS) + Breadcrumb ──────────────────
          productSchema attaches aggregateRating ONLY when the catalogue carries
          real rating data (it does not today) — never fabricated. */}
      <JsonLd data={productSchema(plan)} />
      <JsonLd data={breadcrumbSchema(crumbs)} />
      {/* Internal cross-links as a SiteNavigationElement list (mirrors the visible
          RelatedLinks block below). relatedLinksSchema returns null on empty. */}
      {(() => {
        const nav = relatedLinksSchema({
          name: "להמשך ההשוואה",
          links: relatedNav,
        });
        return nav ? <JsonLd data={nav} /> : null;
      })()}

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive underline underline-offset-2 hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <Link href="/plans" className="interactive underline underline-offset-2 hover:text-accent">
          מחירון
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">{plan.plan}</span>
      </nav>

      {/* ── Header: provider mark + name + plan name + price + post-promo ───── */}
      <header className="mt-4">
        <div className="flex items-start gap-3">
          {/* The carrier's OWN brand mark/color — never recolored to the app accent. */}
          <ProviderLogo provider={plan.provider} size={48} rounded="2xl" />
          <div className="min-w-0">
            <Link
              href={`/providers/${providerSlug(plan.provider)}`}
              className="interactive text-sm font-medium text-accent-text hover:text-accent-hover"
            >
              {plan.provider}
            </Link>
            <h1 className="mt-0.5 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              {plan.plan}
            </h1>
            <p className="mt-1 text-sm text-muted">{catHe}</p>
          </div>
        </div>

        {/* Price big + unit, then the honest post-promo line. */}
        <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-4xl font-bold tracking-tight text-ink">
              ₪{d.price}
            </span>
            <span className="text-base text-muted">{unit}</span>
          </div>
          <div className="pb-1 text-sm">
            <AfterLine after={d.after} />
          </div>
        </div>

        {/* Honest at-a-glance flags — only the REAL ones the plan carries. */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {plan.is5G ? <Flag>5G</Flag> : null}
          {plan.noCommit ? <Flag>ללא התחייבות</Flag> : null}
          {plan.hasAbroad ? <Flag>כולל חו״ל</Flag> : null}
        </div>

        {/* Real "עודכן" freshness stamp (renders nothing without a real date). */}
        {d.updatedAt ? (
          <div className="mt-3">
            <FreshnessBadge date={d.updatedAt} />
          </div>
        ) : null}

        {/* Honest staleness note: when the live DB read failed and we're serving
            the last-known-good bundled snapshot, say so plainly (no fabrication,
            never blank). */}
        {stale ? (
          <p className="mt-2 text-xs text-muted">
            ייתכן שהמחירים מעט מאחור — מוצג עותק שמור של הקטלוג.
          </p>
        ) : null}
      </header>

      {/* ── Commission disclosure (Consumer Protection §7b) — near the price. ─ */}
      <div className="mt-6">
        <CommissionDisclosure variant="banner" />
      </div>

      {/* ── Spec grid + fees breakdown (each omits itself when empty) ───────── */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PlanSpecGrid specs={d.specs} />
        <PlanFeesBreakdown fees={d.fees} />
      </div>

      {/* ── Perks ("מה כלול") ─────────────────────────────────────────────── */}
      {d.perks.length > 0 ? (
        <section aria-labelledby="perks-h" className="mt-8">
          <h2
            id="perks-h"
            className="font-display text-lg font-bold tracking-tight text-ink"
          >
            מה כלול
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {d.perks.map((perk, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-sm leading-relaxed text-foreground"
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-value-text"
                >
                  ✓
                </span>
                <span className="min-w-0 break-words">{perk}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Contract terms ("תנאי המסלול") — only when real. ───────────────── */}
      {d.terms.length > 0 ? (
        <section aria-labelledby="terms-h" className="mt-8">
          <h2
            id="terms-h"
            className="font-display text-lg font-bold tracking-tight text-ink"
          >
            תנאי המסלול
          </h2>
          <ul className="mt-3 list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-foreground">
            {d.terms.map((term, i) => (
              <li key={i} className="break-words">
                {term}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Eligibility ("למי מתאים") — only when real. ────────────────────── */}
      {d.eligibility ? (
        <section aria-labelledby="elig-h" className="mt-8">
          <h2
            id="elig-h"
            className="font-display text-lg font-bold tracking-tight text-ink"
          >
            למי מתאים
          </h2>
          <p className="mt-2 break-words text-sm leading-relaxed text-foreground">
            {d.eligibility}
          </p>
        </section>
      ) : null}

      {/* ── Notes ("מידע נוסף") — only when real. ──────────────────────────── */}
      {d.notes ? (
        <section aria-labelledby="notes-h" className="mt-8">
          <h2
            id="notes-h"
            className="font-display text-lg font-bold tracking-tight text-ink"
          >
            מידע נוסף
          </h2>
          <p className="mt-2 break-words text-sm leading-relaxed text-foreground">
            {d.notes}
          </p>
        </section>
      ) : null}

      {/* ── Full fine-print ("אותיות קטנות") behind a native, no-JS disclosure ── */}
      {extraFineLines.length > 0 ? (
        <details className="group mt-8 overflow-hidden rounded-2xl border border-border/60 bg-surface p-4 sm:p-5">
          <summary className="interactive flex cursor-pointer list-none items-center gap-2 font-display text-sm font-semibold text-ink marker:hidden">
            אותיות קטנות
            <span
              aria-hidden="true"
              className="ms-auto shrink-0 text-muted transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </summary>
          <ul className="mt-3 list-disc space-y-1.5 ps-5 text-[13px] leading-relaxed text-foreground">
            {extraFineLines.map((line, i) => (
              <li key={i} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* ── Source link ("מקור הנתונים") — real provider URL only. ─────────── */}
      {d.sourceUrl ? (
        <p className="mt-6 text-sm text-muted">
          מקור הנתונים:{" "}
          <a
            href={d.sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="interactive font-medium text-accent-text underline underline-offset-2 hover:text-accent-hover"
          >
            עמוד המסלול אצל הספק
            <span aria-hidden="true"> ↗</span>
          </a>
        </p>
      ) : null}

      {/* ── Price caveat (Consumer Protection §17) — near the price/details. ─ */}
      <PriceCaveat className="mt-4" />

      {/* ── CTAs: free consultation booking + lead form ───────────────────── */}
      <section
        id="lead"
        aria-labelledby="cta-h"
        className="mt-12 scroll-mt-6 rounded-2xl border border-border/60 bg-surface p-5 elevate-card sm:p-6"
      >
        <h2
          id="cta-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          רוצים לעבור ל{plan.provider} או להשוות?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          השאירו פרטים ונחזור אליכם — חינם, וללא התחייבות. או קבעו שיחת ייעוץ
          קצרה ונעבור על {plan.plan} יחד.
        </p>
        <div className="mt-4">
          <Link
            href="/book"
            className="interactive press inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-background px-5 py-2.5 text-sm font-semibold text-accent-text ease-[var(--ease-out)] hover:border-accent/40 hover:bg-accent/[0.04] [@media(hover:hover)_and_(pointer:fine)]:motion-safe:hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            קביעת שיחת ייעוץ
            <span aria-hidden="true">←</span>
          </Link>
        </div>
        <div className="mt-6">
          <LeadForm
            source="plan"
            heading={`קבלת הצעה — ${plan.plan}`}
            defaultCategory={leadCategory(plan.cat)}
          />
        </div>
        {/* The §7b disclosure, compact, right by the hand-off CTA. */}
        <CommissionDisclosure variant="inline" className="mt-4" />
      </section>

      {/* ── Similar plans ("מסלולים דומים") — nearest by price, same category ── */}
      {similar.length > 0 ? (
        <section aria-labelledby="similar-h" className="mt-14">
          <h2
            id="similar-h"
            className="font-display text-2xl font-bold tracking-tight text-ink"
          >
            מסלולים דומים
          </h2>
          <p className="mt-2 text-sm text-muted">
            מסלולי {catHe} נוספים במחיר קרוב — להשוואה מהירה.
          </p>
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {similar.map((s) => {
              const sd = planDetail(s);
              return (
                <li key={s.id}>
                  <Link
                    href={`/plans/${s.id}`}
                    className="group card card-interactive flex h-full flex-col gap-2 px-4 py-3.5"
                  >
                    <span className="flex items-center gap-2">
                      <ProviderLogo provider={s.provider} size={28} />
                      <span className="min-w-0 truncate text-sm font-medium text-foreground">
                        {s.provider}
                      </span>
                    </span>
                    <span className="font-display text-sm font-semibold leading-tight text-ink transition-colors group-hover:text-accent">
                      {s.plan}
                    </span>
                    <span className="mt-auto flex items-baseline gap-1">
                      <span className="font-display text-xl font-bold tracking-tight text-value-text">
                        ₪{sd.price}
                      </span>
                      <span className="text-xs text-muted">
                        {priceUnitLabel(s)}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* ── Grouped hub-spoke cross-links (catalogue-derived, no dead-ends) ─────
          Provider page + category /compare hub + head-to-head /vs pages + the
          other providers in the category + the category guides. Deepens the
          crawlable entity graph for SEO + answer engines. */}
      <RelatedLinks
        id="plan-related"
        groups={relatedGroups}
        className="mt-14"
      />
    </main>
  );
}

/** A small honest at-a-glance flag chip (5G / ללא התחייבות / כולל חו״ל). */
function Flag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/60 bg-surface px-2.5 py-0.5 text-xs font-medium text-foreground">
      {children}
    </span>
  );
}
