import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import ComparisonTable from "@/components/ComparisonTable";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import PriceCaveat from "@/components/PriceCaveat";
import StickyLeadCta from "@/components/StickyLeadCta";
import LeadForm from "@/components/LeadFormLazy";
import SmartTimer from "@/components/SmartTimerLazy";
import TrackedCtaLink from "@/components/TrackedCtaLink";
import HeroSavingsHook from "@/components/HeroSavingsHook";
import Icon, { type IconName } from "@/components/Icon";
import { ProviderLogo } from "@/components/ProviderLogo";
import { AiToolsShowcase } from "@/components/AiToolsShowcase";
import { HowItWorks } from "@/components/HowItWorks";
import { FaqAccordion, type FaqItem } from "@/components/FaqAccordion";
import {
  getCategories,
  getProviders,
  getPlans,
  plansByCategory,
  isConsumerHeadlinePlan,
  buildProviderRankings,
  getCities,
  CATEGORY_HE,
} from "@/lib/data";
import { getGuides } from "@/lib/guides";
import { itemListSchema, faqPageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { GENERAL_FAQ } from "@/lib/faq";
import { ils } from "@/lib/format";
import { priceText } from "@/lib/plan-display";

// GENERAL_FAQ items are {question, answer} (QA); <FaqAccordion> renders {q, a}.
// Map them here so the SAME canonical home FAQ copy drives both the visible
// accordion and the FAQPage JSON-LD (which consumes the QA shape directly).
function faqItems(qas: typeof GENERAL_FAQ): FaqItem[] {
  return qas.map((qa) => ({ q: qa.question, a: qa.answer }));
}

export const metadata: Metadata = pageMetadata({
  title: "השוואת מסלולי תקשורת בישראל — חינם",
  description:
    "משווים מסלולי סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחבילות חו״ל מכל " +
    "הספקים בישראל. השוואה חינמית, מחירים מעודכנים בשקלים, ומעבר ספק בהסכמתכם.",
  path: "/",
});

// Pick the N cheapest plans in a category as a representative featured table.
function cheapestIn(cat: string, n: number) {
  return [...plansByCategory(cat)]
    .filter(isConsumerHeadlinePlan)
    .sort((a, b) => a.price - b.price)
    .slice(0, n);
}

// The REAL catalogue entry price for a category (lowest numeric price), or null
// when the category has no priced plans. Catalogue-derived so per-category
// anchors on the hero / category cards can never drift from the data.
function catEntryPriceText(cat: string): string | null {
  const priced = plansByCategory(cat).filter(
    isConsumerHeadlinePlan,
  );
  if (priced.length === 0) return null;
  // The cheapest priced plan's EXACT advertised price (₪10.90, not a rounded-up
  // ₪11), via priceText — mirrors the comparison table so this anchor can never
  // read HIGHER than a plan the same catalogue actually offers.
  return priceText(priced.reduce((a, b) => (b.price < a.price ? b : a)));
}

// Categories whose prices are a per-MONTH figure, so a "מ-₪X לחודש" anchor is
// truthful. חו״ל (abroad) mixes per-day / per-package units, so it is EXCLUDED
// here — its card shows a qualitative "מחו״ל" line with NO false monthly anchor.
const MONTHLY_ANCHOR_CATS = new Set(["cellular", "internet", "tv", "triple"]);

// Per-category entry label for a category card: a truthful "מ-₪X לחודש" for the
// monthly-priced categories, or a qualitative line for חו״ל (mixed units).
function categoryEntryLabel(cat: string): string {
  if (!MONTHLY_ANCHOR_CATS.has(cat)) return "מחו״ל — במגוון יחידות";
  const entry = catEntryPriceText(cat);
  return entry != null ? `מ-₪${entry} לחודש` : "";
}

// ── Category launcher visual identity ────────────────────────────────────────
// A distinct, AA-tuned hue per category for the light hero's launcher tiles. This
// is a DELIBERATE, owner-approved departure from the site's mono-green discipline,
// SCOPED to the homepage launcher only (the rest of the site stays mono-green).
// Each gradient runs light→deep top-to-bottom so the white tile label/counts sit
// over the DEEP stop (`to`) and always clear WCAG AA; `deep` is the darkest shade,
// used as the price-pill text color on its white chip. Unknown/data-driven
// categories fall back to the brand green, so a new category is never un-styled.
type CategoryVis = { icon: IconName; from: string; to: string; deep: string };
const CATEGORY_VIS: Record<string, CategoryVis> = {
  cellular: { icon: "cellular", from: "#168B69", to: "#075B46", deep: "#064635" },
  internet: { icon: "internet", from: "#3C9690", to: "#14686A", deep: "#0E4E50" },
  tv: { icon: "tv", from: "#85965A", to: "#55662B", deep: "#3F4C20" },
  triple: { icon: "triple", from: "#D9A83A", to: "#9C6510", deep: "#744A0B" },
  abroad: { icon: "abroad", from: "#C97861", to: "#8E4335", deep: "#6D3329" },
  electricity: { icon: "bolt", from: "#6F9D78", to: "#3F6D52", deep: "#315540" },
};
const CATEGORY_VIS_FALLBACK: CategoryVis = {
  icon: "spark",
  from: "#168B69",
  to: "#075B46",
  deep: "#064635",
};
const categoryVis = (cat: string): CategoryVis =>
  CATEGORY_VIS[cat] ?? CATEGORY_VIS_FALLBACK;

// The four monthly-priced categories lead as big launcher tiles (each shows a
// truthful "מ-₪X לחודש"); any remaining category (חו״ל — mixed units, no monthly
// anchor — plus any future one) becomes a "קטגוריות נוספות" chip. Order-stable.
const PRIMARY_LAUNCHER_CATS = ["cellular", "internet", "tv", "triple"];

// The three honest reasons to compare here, folded INTO the carrier band (they
// used to be a standalone quarter-viewport grid 900px further down, asserting the
// same facts as the hero counts and the trust strip). Truth-only: each is a real
// property of the service, not a claim about outcomes.
const WHY_POINTS: { icon: IconName; text: string }[] = [
  { icon: "check", text: "ההשוואה חינמית וללא התחייבות" },
  { icon: "search", text: "מציגים גם את המחיר שאחרי המבצע ואת יחידת החיוב" },
  { icon: "lock", text: "פונים אליכם רק אם השארתם פרטים ואישרתם בטופס" },
];

export default function Home() {
  const categories = getCategories();
  const providers = getProviders();
  const plans = getPlans();
  const planCount = plans.length;

  // Featured table: cheapest cellular plans (the highest-traffic category).
  const featuredCat = categories.includes("cellular") ? "cellular" : categories[0];
  const featuredLabel = CATEGORY_HE[featuredCat] ?? featuredCat;
  // SIX plans still drive the ItemList JSON-LD (the structured data engines read
  // is unchanged), while the ONE visible proof block on the page shows the top
  // four. There used to be a second, lower table rendering all six — byte-for-byte
  // the same rows as this one, since both filter and sort the same set ascending.
  const featured = cheapestIn(featuredCat, 6);
  const featuredVisible = featured.slice(0, 4);
  // Keep the cheapest comparable consumer plan itself (not a data-only SIM or a
  // per-minute/day tariff) so the hero makes a like-for-like monthly claim.
  // Keep the plan (not just its rounded sort-key price)
  // so the hero / trust-band floor renders with priceText — the SAME decimal-
  // preserving helper the ComparisonTable rows below use — and never rounds a
  // ₪10.90 plan UP to ₪11 (which would OVERSTATE the floor and drift from the
  // catalogue). `cheapestIn` already priced-filters and sorts ascending, so [0]
  // is the cheapest; undefined ⇒ no fabricated number is shown.
  const cheapestFeatured = featured[0];
  const minFeaturedText = cheapestFeatured ? priceText(cheapestFeatured) : undefined;

  // Transparent "best value" ranking — cheapest entry point first (top 6).
  const rankings = buildProviderRankings().slice(0, 6);

  // City quick-links into the geo compare pages (a representative sample).
  const cities = getCities().slice(0, 12);

  // Real guide count for the guides feature CTA (no fabricated figure).
  const guideCount = getGuides().length;

  // Category launcher split — the monthly-priced categories that actually exist
  // in the catalogue lead as big tiles (in the canonical order), everything else
  // (חו״ל, any future category) falls to the "קטגוריות נוספות" chip row. Both are
  // data-driven, so the launcher can never render a category the catalogue lacks.
  const primaryCats = categories
    .filter((c) => PRIMARY_LAUNCHER_CATS.includes(c))
    .sort(
      (a, b) => PRIMARY_LAUNCHER_CATS.indexOf(a) - PRIMARY_LAUNCHER_CATS.indexOf(b),
    );
  const extraCats = categories.filter((c) => !PRIMARY_LAUNCHER_CATS.includes(c));

  // Hero floor clause for the GEO summary — omitted entirely when nothing is
  // priced so the answer box never states a fabricated figure. Uses the exact
  // advertised price (priceText via minFeaturedText), never the rounded-up key.
  const summaryFloor = minFeaturedText ? `החל מ-₪${minFeaturedText} לחודש. ` : "";
  const summaryText =
    `Switchy AI הוא שירות חינמי להשוואת מסלולי תקשורת בישראל. ` +
    `אנו משווים ${planCount} מסלולים מ-${providers.length} ספקים בחמש קטגוריות — ` +
    `סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחבילות חו״ל — ` +
    `${summaryFloor}המחירים בשקלים ומעודכנים, וכוללים גם את המחיר ` +
    `אחרי המבצע; פנייה לספק נשלחת רק לאחר אישורכם.`;

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-20 sm:px-6 sm:pt-10">
      {/* Page-scoped styling for the light hero ONLY. There is deliberately no
          `.sw-reveal` / `@keyframes` copy here any more: globals.css already owns
          that utility (420ms, swRevealUp) together with its reduced-motion and
          a11y-no-motion overrides, and an unlayered page-local re-declaration
          silently outran the design-system version — two definitions that only
          stayed in sync by accident. The hero's four launcher tiles are now the
          page's ONLY reveal (the <HeroSavingsHook> figure is the second and last
          beat, scoped inside that component). */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        /* Light "category launcher" hero — a bright airy panel (NEVER a dark/black
           slab): a soft mint radial wash over the white --surface. In dark mode the
           panel becomes the dark --surface (still not black) with a faint green glow.
           The headline uses a deep FOREST-GREEN ink (not near-black) that inverts to
           a soft near-white green on dark; high-contrast a11y mode restores pure ink. */
        .hero-panel {
          background:
            radial-gradient(90% 80% at 92% 0%, rgba(8, 122, 91, 0.16), transparent 64%),
            radial-gradient(70% 70% at 0% 100%, rgba(211, 154, 36, 0.14), transparent 66%),
            linear-gradient(145deg, #fffcf6, #f7ecd6);
        }
        .hero-ink { color: #14211d; }
        :root[data-theme="dark"] .hero-panel {
          background:
            radial-gradient(115% 90% at 50% -10%, rgba(93, 214, 171, 0.12) 0%, rgba(93, 214, 171, 0) 60%),
            var(--surface);
        }
        :root[data-theme="dark"] .hero-ink { color: #eaf7ef; }
        :root.a11y-contrast .hero-ink { color: var(--ink); }
        @media (hover: hover) and (pointer: fine) {
          .hero-tile {
            transition: transform 180ms var(--ease-out), box-shadow 180ms var(--ease-out);
          }
          /* Lift on hover, but yield to the .press scale(0.98) while active so the
             tactile press feedback stays crisp (no transform tug-of-war). */
          .hero-tile:hover:not(:active) { transform: translateY(-3px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-tile:hover { transform: none; }
        }
      `,
        }}
      />

      {/* Structured data for engines: the featured list and FAQ. (The site-wide
          WebSite/SearchAction node is emitted once in the root layout.) */}
      <JsonLd data={itemListSchema(featured)} />
      <JsonLd data={faqPageSchema(GENERAL_FAQ)} />

      {/* ── Hero — the fold has to answer the search intent ────────────────────
          A visitor lands here from "כמה אני משלם על סלולר" carrying exactly one
          number. So the fold is, in order: who we are (eyebrow), what this is
          (H1), the real catalogue counts + floor on one tabular line, and then the
          ONE interaction — <HeroSavingsHook>, which turns their own bill into a
          single amber annual-difference figure with the ask under it. The category
          launcher tiles and the green CTA close the fold. Everything that used to
          push those below 844px (a 5-line H1 with a price clause repeated verbatim
          in the trust band, a 4-line subhead) is gone.
          Colours are AA-tuned and dark-parity-safe (see `.hero-*` in the <style>). */}
      <section className="hero-panel relative isolate overflow-hidden rounded-3xl border border-border/60 px-5 py-7 sm:px-10 sm:py-14">
        <div className="mx-auto max-w-3xl">
          {/* Eyebrow pill — honest positioning kicker (free · no-commitment). */}
          <p className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-text">
            <Icon name="check" size={14} className="shrink-0" />
            השוואה חינמית · ללא התחייבות
          </p>
          {/* H1 — deep forest-green ink (NOT black). No entrance animation: this
              is the LCP element, and starting it at opacity 0 is the canonical way
              to wreck the metric it is measured by. */}
          <h1 className="hero-ink mt-4 font-display text-[2rem] font-extrabold leading-[1.15] tracking-tight sm:text-5xl">
            התקשורת שלכם. במחיר שמרגיש נכון.
          </h1>
          {/* Trust band — REAL catalogue counts, hoisted directly under the H1 so
              the fold carries proof before it carries a promise. The floor figure
              is AMBER (money), never the emerald that means "tap me". */}
          <p className="nums-tabular mt-3 text-sm text-muted">
            {planCount} מסלולים · {providers.length} ספקים ·{" "}
            {categories.length} קטגוריות · החל מ-
            <span className="font-display font-bold text-value-text">
              ₪{minFeaturedText}
            </span>{" "}
            לחודש
          </p>

          {/* ── THE fold's one interaction ──────────────────────────────────────
              Rendered only when the catalogue actually has a priced plan to
              compare against — with no real floor there is no honest arithmetic,
              so the hook simply does not exist rather than inventing a base. */}
          {cheapestFeatured && minFeaturedText ? (
            <HeroSavingsHook
              className="mt-6"
              categoryLabel={featuredLabel}
              cheapestPrice={cheapestFeatured.price}
              cheapestPlan={cheapestFeatured.plan}
              cheapestProvider={cheapestFeatured.provider}
              cheapestPriceText={minFeaturedText}
              compareHref={`/compare/${featuredCat}`}
            />
          ) : null}

          {/* Launcher prompt + tiles — the kama-ze-style "pick a service" grid,
              improved: colour-coded, real counts + truthful monthly entry price.
              The four tiles carry the page's only `.sw-reveal` stagger. */}
          <h2 className="hero-ink mt-8 font-display text-lg font-bold tracking-tight">
            איפה מתחילים לחסוך?
          </h2>
          <ul className="nums-tabular mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {primaryCats.map((cat, i) => {
              const vis = categoryVis(cat);
              const count = plansByCategory(cat).length;
              const entryLabel = categoryEntryLabel(cat);
              return (
                <li key={cat}>
                  <Link
                    href={`/compare/${cat}`}
                    aria-label={`${CATEGORY_HE[cat] ?? cat} — ${count} מסלולים${entryLabel ? `, ${entryLabel}` : ""}`}
                    className="sw-reveal press hero-tile relative flex h-full min-h-32 flex-col overflow-hidden rounded-3xl p-4 sm:min-h-36"
                    style={{
                      // Inline color beats the unlayered global `a{color:var(--accent-text)}`
                      // rule (which otherwise tints the tile label + currentColor icon green,
                      // since a Tailwind text-white utility is a LAYERED rule it can't win).
                      color: "#ffffff",
                      backgroundImage: `linear-gradient(160deg, ${vis.from} 0%, ${vis.to} 82%)`,
                      boxShadow: `0 10px 26px -8px ${vis.to}80`,
                      animationDelay: `${Math.min(i * 50, 150)}ms`,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-inset ring-white/25"
                    >
                      <Icon name={vis.icon} size={24} strokeWidth={2} />
                    </span>
                    <span className="mt-auto pt-4">
                      <span className="block font-display text-lg font-bold leading-tight">
                        {CATEGORY_HE[cat] ?? cat}
                      </span>
                      <span className="mt-0.5 block text-sm font-medium text-white">
                        {count} מסלולים
                      </span>
                      {entryLabel ? (
                        <span
                          className="mt-2 inline-flex w-fit rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold"
                          style={{ color: vis.deep }}
                        >
                          {entryLabel}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* "קטגוריות נוספות" chip row — the categories that have no truthful
              monthly anchor (חו״ל) or are new, as quiet outline chips. The label
              sits INLINE with the chips rather than on its own line: this row is
              the last thing between the launcher and the CTA that closes the
              fold, and a stacked label cost 24px the fold could not spare. */}
          {extraCats.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="text-xs font-semibold text-muted">קטגוריות נוספות</p>
              <ul className="flex flex-wrap gap-2">
                {extraCats.map((cat) => (
                  <li key={cat}>
                    <Link
                      href={`/compare/${cat}`}
                      className="interactive press inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:border-accent/50 hover:text-accent-text"
                    >
                      <Icon
                        name={categoryVis(cat).icon}
                        size={15}
                        aria-hidden="true"
                      />
                      {CATEGORY_HE[cat] ?? cat}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* CTA row — exactly ONE primary (solid green, glow, press). The Zoom
              /book path is a SECONDARY quiet text link. */}
          <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <TrackedCtaLink
              href={`/compare/${featuredCat}`}
              location="hero"
              label="compare"
              className="press inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98]"
            >
              מצאו את המסלול שלכם
              <Icon name="chevron" size={18} aria-hidden="true" />
            </TrackedCtaLink>
            <TrackedCtaLink
              href="/book"
              location="hero"
              label="consult"
              className="interactive text-sm font-medium text-muted underline-offset-4 hover:text-accent-text hover:underline"
            >
              או התייעצו עם נציג
            </TrackedCtaLink>
          </div>
        </div>
      </section>

      {/* ── Cheapest-in-category proof (the page's ONE price table) ────────────
          Pulled up to sit immediately under the hero: the four cheapest plans in
          the featured category, so a visitor sees a real, catalogue-derived
          comparison before any editorial band. A second table further down used to
          render the same rows from the same ascending sort — a literal duplicate,
          with a duplicated H2 promise and CTA ~4,800px apart — and is gone; the
          ItemList JSON-LD still emits the full six, so nothing changed for engines.
          One of exactly two `.h-pillar` bands on the page. ──────────────────── */}
      <section aria-labelledby="teaser-h" className="mt-12">
        <p className="eyebrow">מהקטלוג המעודכן</p>
        <h2 id="teaser-h" className="h-pillar mt-2">
          הזולים ביותר ב{featuredLabel}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          ארבעת המסלולים הזולים ביותר בקטגוריה לפי המחיר ההתחלתי — כולל המחיר
          שאחרי המבצע ויחידת החיוב.
        </p>
        <div className="nums-tabular mt-6">
          <ComparisonTable
            plans={featuredVisible}
            caption={`מסלולי ה${featuredLabel} הזולים — מחירים בשקלים`}
          />
          <PriceCaveat className="mt-3" />
        </div>
        <TrackedCtaLink
          href={`/compare/${featuredCat}`}
          location="home-teaser"
          label="compare"
          className="interactive mt-5 inline-flex items-center gap-1 font-medium text-accent-text hover:text-accent-hover"
        >
          לכל מסלולי ה{featuredLabel}
          <Icon name="chevron" size={16} aria-hidden="true" />
        </TrackedCtaLink>
      </section>

      {/* ── Provider logo strip (the coverage proof) ───────────────────────────
          A horizontal wrap of EVERY real carrier mark in the catalogue, via the
          shared <ProviderLogo> (real bundled logo, else the carrier's own
          brand-colored monogram — NEVER recolored to the app accent). This is the
          strongest coverage proof on the page, so it is the ONE trust band that
          survives: the compact TrustSignals strip and the standalone value-props
          grid asserted the same three facts across ~1,000px, and their honest
          points are folded in below as a compact icon list. Decorative marks are
          aria-hidden; the provider name beside each carries the label. ───────── */}
      <section aria-labelledby="carriers-h" className="mt-16">
        <h2 id="carriers-h" className="sr-only">
          הספקים שאנו משווים
        </h2>
        <p className="text-center text-sm text-muted">
          משווים את כל {providers.length} ספקי התקשורת בישראל — במקום אחד
        </p>
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {providers.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/providers/${p.slug}`}
                className="sw-lift interactive press inline-flex min-h-11 items-center gap-2 rounded-full border border-border/60 bg-surface py-1.5 pe-3.5 ps-1.5 text-sm text-foreground hover:border-accent/50 hover:text-accent hover:shadow-soft"
              >
                <ProviderLogo provider={p.name} size={28} rounded="full" />
                <span className="font-medium">{p.name}</span>
              </Link>
            </li>
          ))}
        </ul>
        {/* The three honest points that used to be a full-width card grid of their
            own, now one compact line each right where the coverage claim is made. */}
        <ul className="mx-auto mt-7 flex max-w-2xl flex-col gap-2 sm:items-center">
          {WHY_POINTS.map((point) => (
            <li
              key={point.text}
              className="flex items-start gap-2 text-sm leading-snug text-muted"
            >
              <Icon
                name={point.icon}
                size={16}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-accent-text"
              />
              {point.text}
            </li>
          ))}
        </ul>
        {/* Repeated primary CTA (anchor #2 of exactly three) — the SAME green
            treatment + verbatim label as the hero, right after the coverage
            proof. Routes to the highest-intent category compare, like the hero. */}
        <div className="mt-8 flex justify-center">
          <TrackedCtaLink
            href={`/compare/${featuredCat}`}
            location="home-carriers"
            label="compare"
            className="press inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98]"
          >
            מצאו את המסלול שלכם
            <Icon name="chevron" size={18} aria-hidden="true" />
          </TrackedCtaLink>
        </div>
      </section>

      {/* ── How it works (shared 3-step explainer) ────────────────────────────
          The canonical compare → choose → switch-with-consent strip, single
          source of truth shared with /how-it-works (so the copy can't drift). The
          editorial "clarity" band that used to sit 900px above it said the same
          thing over a 256px decorative image on a hardcoded ivory panel that
          glared on the dark canvas; only its voice survives, as this eyebrow. ── */}
      <HowItWorks className="mt-16" eyebrow="פחות רעש. יותר ודאות." />

      {/* ── AI tools showcase ─────────────────────────────────────────────────
          A mobile-first card grid into the app's REAL first-party tools (bill
          analysis, matching quiz, switch kit, negotiation, referral) — each
          links to its existing on-site route. Renders its own heading + intro;
          truth-only qualitative copy, no carrier marks (first-party tools). ── */}
      <AiToolsShowcase className="mt-16" />

      {/* ── AI summary (GEO answer box) ───────────────────────────────────── */}
      <div className="mt-16">
        <SgeSummary>{summaryText}</SgeSummary>
      </div>

      {/* ── Provider rankings (transparent "best value") ──────────────────── */}
      <section aria-labelledby="rankings-h" className="mt-16">
        <h2 id="rankings-h" className="h-section">
          ספקים לפי ערך — דירוג שקוף
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          הדירוג ממיין את הספקים לפי{" "}
          <strong className="font-semibold text-foreground">
            המחיר ההתחלתי הזול ביותר
          </strong>{" "}
          (מהנמוך לגבוה), ובמקרה של שוויון — לפי מספר המסלולים בקטלוג. זו מתודולוגיה
          עובדתית ושקופה: אנו מציגים מי מציע את נקודת הכניסה הזולה ביותר, ללא דירוג
          איכות נסתר וללא תשלום על מיקום.
        </p>
        <ol className="nums-tabular mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rankings.map((p, i) => (
            <li key={p.slug}>
              <Link
                href={`/providers/${p.slug}`}
                className="card card-interactive flex h-full items-center gap-4 p-4"
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 font-display text-sm font-bold text-accent"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display font-semibold tracking-tight text-ink">
                    {p.name}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {p.planCount} מסלולים · החל מ-{ils(p.minPrice)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
        <Link
          href="/transparency"
          className="interactive mt-5 inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:text-accent-hover"
        >
          איך אנחנו מדרגים? שקיפות מלאה
          <Icon name="chevron" size={16} aria-hidden="true" />
        </Link>
      </section>

      {/* ── Smart-Timer teaser (commitment-end calculator) ────────────────── */}
      <section aria-labelledby="timer-h" className="mt-16">
        <h2 id="timer-h" className="h-section">
          מתי נגמרת ההתחייבות שלכם?
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          הזינו את תאריך תחילת ההתחייבות ואת אורכה כדי לדעת מתי תוכלו לעבור ספק ללא
          קנס יציאה. מחשבון פרטי לחלוטין — שום נתון לא נשלח לשרת.
        </p>
        <div className="mt-6">
          <SmartTimer />
        </div>
      </section>

      {/* ── FAQ (visible, backs the FAQPage JSON-LD above) ────────────────────
          The same canonical GENERAL_FAQ set already emitted as faqPageSchema at
          the top of the page, now rendered visibly via <FaqAccordion> (native
          <details>, zero JS, RTL, AA). Mapped QA→FaqItem ({q,a}); answering the
          real objections right before the lead hand-off. Truth-only copy. ───── */}
      <section aria-labelledby="faq-h" className="mt-16">
        <h2 id="faq-h" className="h-section">
          שאלות נפוצות
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          כל מה שצריך לדעת לפני שמשווים ועוברים — חינם, בלי התחייבות ובלי פנייה לא
          מבוקשת.
        </p>
        <FaqAccordion items={faqItems(GENERAL_FAQ)} className="mt-6" />
      </section>

      {/* ── Lead form — the ask. The page's second and last `.h-pillar`. ────── */}
      <section id="lead" aria-labelledby="lead-h" className="mt-20 scroll-mt-6">
        <p className="eyebrow">חינם וללא התחייבות</p>
        <h2 id="lead-h" className="h-pillar mt-2">
          רוצים שנעזור לכם לחסוך?
        </h2>
        <p className="mt-2 leading-relaxed text-foreground">
          השאירו פרטים ונחזור אליכם עם השוואה מותאמת — ללא עלות וללא התחייבות.
        </p>
        {/* Objection-handling / reassurance microcopy — answers the real hesitations
            right before the hand-off. Honest only: no fake urgency or social proof. */}
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
          {[
            "אין עלות ואין התחייבות — רק השוואה",
            "פונים אליכם רק אחרי שתאשרו בטופס",
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
            source="home"
            trustStats={{
              planCount,
              providerCount: providers.length,
            }}
          />
        </div>
      </section>

      {/* ── "עוד באתר" — the secondary surface, BELOW the ask ──────────────────
          Market pulse, the guides hub and the geo compare pages are real and worth
          linking, but they sat between the proof and the form and pushed the ask
          ~900px further down. A native <details> keeps every link in the HTML (so
          crawlers index it in full and no internal link equity is lost) while the
          funnel stops paying for it. Zero JS, keyboard- and AT-correct. ─────── */}
      <details className="group mt-16">
        <summary className="interactive flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-border/60 bg-surface px-5 py-4 text-start marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          <span className="font-display text-base font-semibold tracking-tight text-ink">
            עוד באתר
          </span>
          <Icon
            name="chevron"
            size={18}
            aria-hidden="true"
            className="shrink-0 rotate-90 text-muted transition-transform duration-200 ease-[var(--ease-out)] group-open:-rotate-90 motion-reduce:transition-none"
          />
        </summary>

        {/* ── Market-Pulse teaser ───────────────────────────────────────────── */}
        <section aria-labelledby="pulse-h" className="mt-8">
          <h2 id="pulse-h" className="h-section">
            דופק השוק — מצב נוכחי
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            מחיר ממוצע, מינימלי ומקסימלי בכל קטגוריה — תמונת מצב עדכנית של שוק
            התקשורת בישראל לפי הקטלוג שלנו. נתונים אמיתיים בלבד, ללא גרפים מומצאים.
          </p>
          <Link
            href="/market-pulse"
            className="interactive mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:text-accent-hover"
          >
            לצפייה בדופק השוק
            <Icon name="chevron" size={16} aria-hidden="true" />
          </Link>
        </section>

        {/* ── Guides hub. The count is REAL (getGuides().length) — but a count
            only sells the hub once there are many, so it leads with the content
            and states the number plainly at the end. ───────────────────────── */}
        <section aria-labelledby="guides-h" className="mt-10">
          <h2 id="guides-h" className="h-section">
            מדריכים — איך לעבור ספק ולחסוך
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            איך עוברים ספק, בוחרים מסלול סלולר, אינטרנט או טלוויזיה, ומבינים בדיוק
            על מה משלמים — שלב אחר שלב, בעברית ובלי ז׳רגון ({guideCount} מדריכים).
          </p>
          <Link
            href="/guides"
            className="interactive mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:text-accent-hover"
          >
            לכל המדריכים
            <Icon name="chevron" size={16} aria-hidden="true" />
          </Link>
        </section>

        {/* ── City quick-links (geo compare pages) ──────────────────────────── */}
        {cities.length > 0 && (
          <section aria-labelledby="cities-h" className="mt-10">
            <h2 id="cities-h" className="h-section">
              השוואת {featuredLabel} לפי עיר
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              אותם ספקים ומסלולים זמינים בכל הארץ. בחרו עיר להשוואה מקומית.
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {cities.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/compare/${featuredCat}/${c.slug}`}
                    className="interactive press sw-lift inline-flex min-h-11 items-center rounded-full border border-border/60 bg-surface px-4 py-1.5 text-sm text-foreground hover:border-accent/50 hover:text-accent hover:shadow-soft"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </details>

      {/* ── Mobile sticky lead CTA — scrolls to the existing #lead form; hides
          once it is in view. One primary CTA per view (sm:hidden). ────────── */}
      <StickyLeadCta source="home" />
    </main>
  );
}
