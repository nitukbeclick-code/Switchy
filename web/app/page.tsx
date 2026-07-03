import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import AiSummary from "@/components/AiSummary";
import ComparisonTable from "@/components/ComparisonTable";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import PriceCaveat from "@/components/PriceCaveat";
import TrustSignals from "@/components/TrustSignals";
import StickyLeadCta from "@/components/StickyLeadCta";
import LeadForm from "@/components/LeadFormLazy";
import SmartTimer from "@/components/SmartTimerLazy";
import TrackedCtaLink from "@/components/TrackedCtaLink";
import Icon from "@/components/Icon";
import { ProviderLogo } from "@/components/ProviderLogo";
import { AiToolsShowcase } from "@/components/AiToolsShowcase";
import { HowItWorks } from "@/components/HowItWorks";
import { FaqAccordion, type FaqItem } from "@/components/FaqAccordion";
import {
  getCategories,
  getProviders,
  getPlans,
  plansByCategory,
  buildProviderRankings,
  getCities,
  CATEGORY_HE,
} from "@/lib/data";
import { getGuides } from "@/lib/guides";
import { itemListSchema, faqPageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { GENERAL_FAQ } from "@/lib/faq";
import { ils } from "@/lib/format";

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
    .filter((p) => typeof p.price === "number")
    .sort((a, b) => a.price - b.price)
    .slice(0, n);
}

// The REAL catalogue entry price for a category (lowest numeric price), or null
// when the category has no priced plans. Catalogue-derived so per-category
// anchors on the hero / category cards can never drift from the data.
function catEntryPrice(cat: string): number | null {
  const priced = plansByCategory(cat).filter(
    (p) => typeof p.price === "number",
  );
  if (priced.length === 0) return null;
  return Math.min(...priced.map((p) => p.price));
}

// Categories whose prices are a per-MONTH figure, so a "מ-₪X לחודש" anchor is
// truthful. חו״ל (abroad) mixes per-day / per-package units, so it is EXCLUDED
// here — its card shows a qualitative "מחו״ל" line with NO false monthly anchor.
const MONTHLY_ANCHOR_CATS = new Set(["cellular", "internet", "tv", "triple"]);

// Per-category entry label for a category card: a truthful "מ-₪X לחודש" for the
// monthly-priced categories, or a qualitative line for חו״ל (mixed units).
function categoryEntryLabel(cat: string): string {
  if (!MONTHLY_ANCHOR_CATS.has(cat)) return "מחו״ל — במגוון יחידות";
  const entry = catEntryPrice(cat);
  return entry != null ? `מ-${ils(entry)} לחודש` : "";
}

export default function Home() {
  const categories = getCategories();
  const providers = getProviders();
  const plans = getPlans();
  const planCount = plans.length;

  // Featured table: cheapest cellular plans (the highest-traffic category).
  const featuredCat = categories.includes("cellular") ? "cellular" : categories[0];
  const featured = cheapestIn(featuredCat, 6);
  const minFeatured = featured.length ? featured[0].price : 0;

  // Second category anchor for the hero value clause — the honest internet entry
  // price (CRO's category-honest move), shown only when the catalogue actually
  // has priced internet plans so the clause can never fabricate a figure.
  const internetEntry = categories.includes("internet")
    ? catEntryPrice("internet")
    : null;

  // Transparent "best value" ranking — cheapest entry point first (top 6).
  const rankings = buildProviderRankings().slice(0, 6);

  // City quick-links into the geo compare pages (a representative sample).
  const cities = getCities().slice(0, 12);

  // Real guide count for the guides feature CTA (no fabricated figure).
  const guideCount = getGuides().length;

  const summaryText =
    `Switchy AI הוא שירות חינמי להשוואת מסלולי תקשורת בישראל. ` +
    `אנו משווים ${planCount} מסלולים מ-${providers.length} ספקים בחמש קטגוריות — ` +
    `סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחבילות חו״ל — ` +
    `החל מ-${ils(minFeatured)} לחודש. המחירים בשקלים ומעודכנים, וכוללים גם את המחיר ` +
    `אחרי המבצע; פנייה לספק נשלחת רק לאחר אישורכם.`;

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-10 pb-20 sm:px-6">
      {/* Page-scoped motion (Emil Kowalski rules): a one-time entrance reveal that
          fades + lifts each block in, staggered 30–80ms via inline animationDelay.
          Server-rendered CSS only (no JS) — references the shared --ease-out token
          and animates ONLY transform + opacity (GPU). Reduced-motion: animation is
          removed entirely so blocks render statically at their resting state (the
          .sw-reveal default is already fully visible). The .sw-lift helper gates a
          desktop hover-lift behind a real hover-capable, fine pointer so it never
          sticks on touch. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .sw-reveal { animation: swReveal 400ms var(--ease-out) both; }
        @keyframes swReveal {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (hover: hover) and (pointer: fine) {
          .sw-lift { transition: transform 180ms var(--ease-out); }
          /* Lift on hover, but yield to the .press scale(0.98) while active so the
             tactile press feedback stays crisp (no transform tug-of-war). */
          .sw-lift:hover:not(:active) { transform: translateY(-2px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sw-reveal { animation: none; }
          .sw-lift:hover { transform: none; }
        }
      `,
        }}
      />

      {/* Structured data for engines: the featured list and FAQ. (The site-wide
          WebSite/SearchAction node is emitted once in the root layout.) */}
      <JsonLd data={itemListSchema(featured)} />
      <JsonLd data={faqPageSchema(GENERAL_FAQ)} />

      {/* ── Hero ──────────────────────────────────────────────────────────────
          Calm, flat-ink editorial hero (bank-grade): a solid ink panel with the
          white headline/subtext set directly on it — NO photo/video behind the
          text — and ONE green CTA. The panel is a fixed deep ink (#111827, the
          light-theme --ink) in BOTH themes so "white text on ink" always holds;
          a hairline border keeps it defined on the dark page background. */}
      <section className="relative isolate overflow-hidden rounded-3xl border border-border/60 bg-[#111827] px-5 py-12 text-center sm:px-10 sm:py-16">
        <div className="mx-auto max-w-2xl">
          {/* Eyebrow pill — the honest positioning kicker (free · no-commitment),
              with a small green tick. Green-tinted outline so it reads as the
              section opener without competing with the ONE green CTA below. */}
          <p
            className="sw-reveal mx-auto inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/85"
            style={{ animationDelay: "0ms" }}
          >
            <Icon name="check" size={14} className="shrink-0 text-accent" />
            השוואה חינמית · ללא התחייבות
          </p>
          {/* H1 — the promise is a CHECK ("בודקים כמה תוכלו לחסוך"), never a
              promised amount. Green is applied ONLY to the price clause (VALUE),
              bound to the real catalogue entry price (minFeatured). A second
              honest category anchor (internet) surfaces when priced plans exist. */}
          <h1 className="sw-reveal mt-4 font-display text-4xl font-bold tracking-tight text-white sm:text-6xl">
            בודקים כמה תוכלו לחסוך על התקשורת.{" "}
            <span className="text-accent">
              סלולר מ-{ils(minFeatured)}
              {internetEntry != null ? ` · אינטרנט מ-${ils(internetEntry)}` : ""}{" "}
              לחודש.
            </span>
          </h1>
          <p
            className="sw-reveal mx-auto mt-5 max-w-2xl text-lg font-medium leading-relaxed text-white/85 sm:text-xl [text-wrap:pretty]"
            style={{ animationDelay: "60ms" }}
          >
            השוואה חינמית של כל {providers.length} ספקי התקשורת בישראל — כולל
            המחיר שאחרי המבצע. בלי התחייבות.
          </p>
          {/* CTA row — exactly ONE primary (three-tier PRIMARY: solid green,
              glow, press). The Zoom /book path is demoted to a SECONDARY quiet
              white text link, so only one action reads as primary per viewport. */}
          <div
            className="sw-reveal mt-8 flex flex-col items-center justify-center gap-4"
            style={{ animationDelay: "120ms" }}
          >
            <TrackedCtaLink
              href={`/compare/${featuredCat}`}
              location="hero"
              label="compare"
              className="press inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98]"
            >
              בדקו כמה תחסכו
              <Icon name="chevron" size={18} aria-hidden="true" />
            </TrackedCtaLink>
            <TrackedCtaLink
              href="/book"
              location="hero"
              label="consult"
              className="interactive text-sm text-white/70 underline-offset-4 hover:underline"
            >
              או דברו עם יועץ
            </TrackedCtaLink>
          </div>
          {/* Trust band — REAL catalogue counts, placed ABOVE the soft hedge
              line. Mirrors the static counts bar (plans · providers · categories
              · entry). The entry price is the hook so it carries the green VALUE
              emphasis (text-accent), NOT a button. tabular-nums column-aligns the
              digits (parity with the static `.cmp__num`). */}
          <p
            className="nums-tabular sw-reveal mt-8 text-sm text-white/70"
            style={{ animationDelay: "150ms" }}
          >
            {planCount} מסלולים · {providers.length} ספקים ·{" "}
            {categories.length} קטגוריות · החל מ-
            <span className="font-display font-bold text-accent">
              {ils(minFeatured)}
            </span>{" "}
            לחודש
          </p>
          {/* Quiet value line — honest, qualitative framing (no fabricated
              figure), a muted single line with a small green tick. Sits BELOW
              the hard counts band so the real numbers lead the hedge. */}
          <p
            className="sw-reveal mt-2 inline-flex items-center gap-1.5 text-sm text-white/75"
            style={{ animationDelay: "180ms" }}
          >
            <Icon name="check" size={16} className="shrink-0 text-accent" />
            מסלול מתאים יכול לחסוך לכם מאות ₪ בשנה — וההשוואה חינם
          </p>
        </div>
      </section>

      {/* ── Trust strip (compact) — REAL catalogue counts + the transparent
          methodology link, as a lean inline strip directly under the hero. The
          HEAVY full TrustSignals panel (+ §7b commission disclosure + §17 price
          caveat) is not removed — it still lives down beside #lead, where those
          legal components belong right before the hand-off. Every number here is
          catalogue-derived; nothing is fabricated. ───────────────────────── */}
      <div className="mx-auto mt-8 max-w-3xl">
        <TrustSignals
          variant="compact"
          planCount={planCount}
          providerCount={providers.length}
          categoryCount={categories.length}
        />
      </div>

      {/* ── Cheapest-in-cellular teaser (hoisted) ─────────────────────────────
          The tool-first payoff, pulled up to sit immediately under the hero/trust
          strip: the three cheapest plans in the featured category so a visitor
          sees a real, catalogue-derived comparison before any editorial band.
          Reuses cheapestIn(featuredCat, 3) + the shared <ComparisonTable> (same
          bundle as the full featured section lower down — they can't drift) and
          the §17 <PriceCaveat>. The link into the full category uses a direction
          -aware <Icon name="chevron"> (never a hardcoded ←/→). ─────────────── */}
      <section aria-labelledby="teaser-h" className="mt-12">
        <h2
          id="teaser-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          הזולים ביותר ב{CATEGORY_HE[featuredCat] ?? featuredCat}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          שלושת המסלולים הזולים ביותר בקטגוריה לפי המחיר ההתחלתי — מהקטלוג
          המעודכן, כולל המחיר שאחרי המבצע.
        </p>
        <div className="nums-tabular mt-6">
          <ComparisonTable
            plans={cheapestIn(featuredCat, 3)}
            caption={`שלושת מסלולי ה${CATEGORY_HE[featuredCat] ?? featuredCat} הזולים — מחירים בשקלים`}
          />
          <PriceCaveat className="mt-3" />
        </div>
        <TrackedCtaLink
          href={`/compare/${featuredCat}`}
          location="home-teaser"
          label="compare"
          className="interactive mt-5 inline-flex items-center gap-1 font-medium text-accent-text hover:text-accent-hover"
        >
          לכל מסלולי ה{CATEGORY_HE[featuredCat] ?? featuredCat}
          <Icon name="chevron" size={16} aria-hidden="true" />
        </TrackedCtaLink>
      </section>

      {/* ── Provider logo strip (trust band) ──────────────────────────────────
          A horizontal wrap of EVERY real carrier mark in the catalogue, via the
          shared <ProviderLogo> (real bundled logo, else the carrier's own
          brand-colored monogram — NEVER recolored to the app accent). It signals
          coverage with truth-only data: the marks are the same providers counted
          in TrustSignals above, each a link into its provider page (no
          dead-ends). Decorative marks are aria-hidden; the provider name beside
          each carries the label, so the row is fully readable to AT and AA.
          Motion reuses the page `.sw-reveal` entrance + `.sw-lift` hover. ───── */}
      <section aria-labelledby="carriers-h" className="mt-16">
        <h2 id="carriers-h" className="sr-only">
          הספקים שאנו משווים
        </h2>
        <p className="text-center text-sm text-muted">
          משווים את כל {providers.length} ספקי התקשורת בישראל — במקום אחד
        </p>
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {providers.map((p, i) => (
            <li key={p.slug}>
              <Link
                href={`/providers/${p.slug}`}
                className="sw-reveal sw-lift interactive press inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface py-1.5 pe-3.5 ps-1.5 text-sm text-foreground hover:border-accent/50 hover:text-accent hover:shadow-soft"
                style={{ animationDelay: `${Math.min(i * 40, 280)}ms` }}
              >
                <ProviderLogo provider={p.name} size={28} rounded="full" />
                <span className="font-medium">{p.name}</span>
              </Link>
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
            בדקו כמה תחסכו
            <Icon name="chevron" size={18} aria-hidden="true" />
          </TrackedCtaLink>
        </div>
      </section>

      {/* ── Value props — compact rows (icon + title + one line, ~72–96px each),
          not quarter-viewport slabs. One hairline card per point; neutral greys
          with a single green icon accent. mt-16 locks the editorial cadence. ─ */}
      <section
        aria-label="למה להשוות איתנו"
        className="mt-16 grid grid-cols-1 gap-2.5 sm:grid-cols-3"
      >
        {[
          {
            t: "השוואה חינמית",
            d: "השוואת כל המסלולים באתר היא ללא עלות וללא התחייבות.",
            icon: "check" as const,
          },
          {
            t: "מחירים שקופים",
            d: "מציגים גם את המחיר אחרי המבצע ואת יחידת החיוב — בלי הפתעות.",
            icon: "search" as const,
          },
          {
            t: "מעבר בהסכמה",
            d: "ניצור קשר רק אם תשאירו פרטים ותאשרו זאת בטופס.",
            icon: "lock" as const,
          },
        ].map((v, i) => (
          <article
            key={v.t}
            className="sw-reveal card flex items-center gap-3 p-4"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-text"
            >
              <Icon name={v.icon} size={18} />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-base font-semibold tracking-tight text-ink">
                {v.t}
              </h3>
              <p className="mt-0.5 text-sm leading-snug text-muted">{v.d}</p>
            </div>
          </article>
        ))}
      </section>

      {/* ── How it works (shared 3-step explainer) ────────────────────────────
          The canonical compare → choose → switch-with-consent strip, single
          source of truth shared with /how-it-works (so the copy can't drift). It
          renders its own heading/intro + the staggered `.sw-reveal` step cards;
          truth-only (no figures, just the service's real promises). ────────── */}
      <HowItWorks className="mt-16" />

      {/* ── Category cards (self-segment) ─────────────────────────────────────
          Faint accent-tinted band (bg-accent/[0.03] — an alternating ground vs
          the plain-background sections around it, composed from the accent token
          so dark parity is automatic and the white .card children still pop on
          top). Each card carries the REAL per-category count AND the honest entry
          price (monthly anchor for סלולר/אינטרנט/טלוויזיה/משולב; חו״ל stays
          qualitative — mixed units, no false monthly figure). ──────────────── */}
      <section
        aria-labelledby="cats-h"
        className="mt-16 rounded-3xl border border-border/50 bg-accent/[0.03] p-6 sm:p-8"
      >
        <h2
          id="cats-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          קטגוריות להשוואה
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          בחרו את מה שאתם משווים — כל קטגוריה עם מספר המסלולים ונקודת הכניסה
          האמיתית מהקטלוג.
        </p>
        <ul className="nums-tabular mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((cat, i) => {
            const count = plansByCategory(cat).length;
            const entryLabel = categoryEntryLabel(cat);
            return (
              <li key={cat}>
                <Link
                  href={`/compare/${cat}`}
                  className="sw-reveal card card-interactive block h-full p-4"
                  style={{ animationDelay: `${Math.min(i * 50, 250)}ms` }}
                >
                  <span className="block font-display font-semibold tracking-tight text-ink">
                    {CATEGORY_HE[cat] ?? cat}
                  </span>
                  <span className="mt-1 block text-sm text-muted">
                    {count} מסלולים
                  </span>
                  {entryLabel ? (
                    <span className="mt-1 block text-sm font-medium text-accent-text">
                      {entryLabel}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── AI tools showcase ─────────────────────────────────────────────────
          A mobile-first card grid into the app's REAL first-party tools (bill
          analysis, matching quiz, switch kit, negotiation, referral) — each
          links to its existing on-site route. Renders its own heading + intro;
          truth-only qualitative copy, no carrier marks (first-party tools). ── */}
      <AiToolsShowcase className="mt-16" />

      {/* ── AI summary (GEO answer box) ───────────────────────────────────── */}
      <div className="mt-16">
        <AiSummary>{summaryText}</AiSummary>
      </div>

      {/* ── Provider rankings (transparent "best value") ──────────────────── */}
      <section aria-labelledby="rankings-h" className="mt-16">
        <h2
          id="rankings-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
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
                className="sw-reveal card card-interactive flex h-full items-center gap-4 p-4"
                style={{ animationDelay: `${Math.min(i * 50, 250)}ms` }}
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

      {/* ── Market-Pulse teaser ───────────────────────────────────────────── */}
      <section aria-labelledby="pulse-h" className="mt-16">
        <div className="bento p-6 sm:p-9">
          <h2
            id="pulse-h"
            className="font-display text-2xl font-bold tracking-tight text-ink"
          >
            דופק השוק — מצב נוכחי
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-foreground">
            מחיר ממוצע, מינימלי ומקסימלי בכל קטגוריה — תמונת מצב עדכנית של שוק
            התקשורת בישראל לפי הקטלוג שלנו. נתונים אמיתיים בלבד, ללא גרפים מומצאים.
          </p>
          <Link
            href="/market-pulse"
            className="interactive press sw-lift mt-6 inline-flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 font-medium text-accent-contrast shadow-soft hover:bg-accent-hover hover:shadow-float hover:shadow-accent/20"
          >
            לצפייה בדופק השוק
            <Icon name="chevron" size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* ── Smart-Timer teaser (commitment-end calculator) ────────────────── */}
      <section aria-labelledby="timer-h" className="mt-16">
        <h2
          id="timer-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
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

      {/* ── Guides feature ────────────────────────────────────────────────────
          Routes high-intent readers into the /guides hub. The count is REAL
          (getGuides().length) — no fabricated figure. A single bento panel with
          the page's `.sw-lift` CTA, mobile-first and RTL. ──────────────────── */}
      <section aria-labelledby="guides-h" className="mt-16">
        <div className="bento p-6 sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
            ידע שמוביל לחיסכון
          </p>
          <h2
            id="guides-h"
            className="mt-2 font-display text-2xl font-bold tracking-tight text-ink"
          >
            מדריכים — איך לעבור ספק ולחסוך
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-foreground">
            {guideCount} מדריכים בעברית: איך עוברים ספק, בוחרים מסלול סלולר,
            אינטרנט או טלוויזיה, ומבינים בדיוק על מה משלמים — שלב אחר שלב, בלי
            ז׳רגון.
          </p>
          <Link
            href="/guides"
            className="interactive press sw-lift mt-6 inline-flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 font-medium text-accent-contrast shadow-soft hover:bg-accent-hover hover:shadow-float hover:shadow-accent/20"
          >
            לכל המדריכים
            <Icon name="chevron" size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* ── City quick-links (geo compare pages) ──────────────────────────── */}
      {cities.length > 0 && (
        <section aria-labelledby="cities-h" className="mt-16">
          <h2
            id="cities-h"
            className="font-display text-2xl font-bold tracking-tight text-ink"
          >
            השוואת {CATEGORY_HE[featuredCat] ?? featuredCat} לפי עיר
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            אותם ספקים ומסלולים זמינים בכל הארץ. בחרו עיר להשוואה מקומית.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {cities.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/compare/${featuredCat}/${c.slug}`}
                  className="interactive press sw-lift inline-block rounded-full border border-border/60 bg-surface px-4 py-1.5 text-sm text-foreground hover:border-accent/50 hover:text-accent hover:shadow-soft"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Featured comparison ───────────────────────────────────────────── */}
      <section aria-labelledby="featured-h" className="mt-16">
        <h2
          id="featured-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          מסלולי {CATEGORY_HE[featuredCat] ?? featuredCat} משתלמים
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          ששת המסלולים הזולים ביותר בקטגוריה לפי המחיר ההתחלתי.
        </p>
        <div className="nums-tabular mt-6">
          <ComparisonTable
            plans={featured}
            caption={`מסלולי ${CATEGORY_HE[featuredCat] ?? featuredCat} זולים — מחירים בשקלים`}
          />
          <PriceCaveat className="mt-3" />
        </div>
        <Link
          href={`/compare/${featuredCat}`}
          className="interactive mt-5 inline-flex items-center gap-1 font-medium text-accent-text hover:text-accent-hover"
        >
          לכל מסלולי ה{CATEGORY_HE[featuredCat] ?? featuredCat}
          <Icon name="chevron" size={16} aria-hidden="true" />
        </Link>
      </section>

      {/* ── FAQ (visible, backs the FAQPage JSON-LD above) ────────────────────
          The same canonical GENERAL_FAQ set already emitted as faqPageSchema at
          the top of the page, now rendered visibly via <FaqAccordion> (native
          <details>, zero JS, RTL, AA). Mapped QA→FaqItem ({q,a}); answering the
          real objections right before the lead hand-off. Truth-only copy. ───── */}
      <section aria-labelledby="faq-h" className="mt-16">
        <h2
          id="faq-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          שאלות נפוצות
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          כל מה שצריך לדעת לפני שמשווים ועוברים — חינם, בלי התחייבות ובלי פנייה לא
          מבוקשת.
        </p>
        <FaqAccordion items={faqItems(GENERAL_FAQ)} className="mt-6" />
      </section>

      {/* ── Lead form ─────────────────────────────────────────────────────── */}
      <section id="lead" aria-labelledby="lead-h" className="mt-20 scroll-mt-6">
        <h2
          id="lead-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
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

      {/* ── Mobile sticky lead CTA — scrolls to the existing #lead form; hides
          once it is in view. One primary CTA per view (sm:hidden). ────────── */}
      <StickyLeadCta source="home" />
    </main>
  );
}
