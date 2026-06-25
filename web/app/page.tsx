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
import HeroVideo from "@/components/HeroVideo";
import {
  getCategories,
  getProviders,
  getPlans,
  plansByCategory,
  buildProviderRankings,
  getCities,
  CATEGORY_HE,
} from "@/lib/data";
import { itemListSchema, faqPageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { GENERAL_FAQ } from "@/lib/faq";
import { ils } from "@/lib/format";

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

export default function Home() {
  const categories = getCategories();
  const providers = getProviders();
  const plans = getPlans();
  const planCount = plans.length;

  // Featured table: cheapest cellular plans (the highest-traffic category).
  const featuredCat = categories.includes("cellular") ? "cellular" : categories[0];
  const featured = cheapestIn(featuredCat, 6);
  const minFeatured = featured.length ? featured[0].price : 0;

  // Transparent "best value" ranking — cheapest entry point first (top 6).
  const rankings = buildProviderRankings().slice(0, 6);

  // City quick-links into the geo compare pages (a representative sample).
  const cities = getCities().slice(0, 12);

  const summaryText =
    `Switchy AI הוא שירות חינמי להשוואת מסלולי תקשורת בישראל. ` +
    `אנו משווים ${planCount} מסלולים מ-${providers.length} ספקים בחמש קטגוריות — ` +
    `סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחבילות חו״ל — ` +
    `החל מ-${ils(minFeatured)} לחודש. המחירים בשקלים ומעודכנים, וכוללים גם את המחיר ` +
    `אחרי המבצע; פנייה לספק נשלחת רק לאחר אישורכם.`;

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
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

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 items-center gap-10 pt-4 text-center sm:pt-8 lg:grid-cols-2 lg:gap-12 lg:text-start">
        {/* Text column — headline, value pitch, CTAs. On lg it sits at the start
            edge (right, RTL) with the video in the opposite column; on mobile it
            stacks above the video, centered. */}
        <div>
          <h1 className="sw-reveal font-display text-4xl font-bold tracking-tight text-ink sm:text-6xl">
            משווים תקשורת.{" "}
            <span className="text-accent-text">חוסכים כסף.</span>
          </h1>
          <p
            className="sw-reveal mx-auto mt-5 max-w-2xl text-xl font-semibold leading-relaxed text-foreground sm:text-2xl lg:mx-0"
            style={{ animationDelay: "60ms" }}
          >
            השוואה חינמית של מסלולי סלולר, אינטרנט, טלוויזיה, חבילות משולבות
            וחבילות חו״ל מכל הספקים בישראל — מחירים מעודכנים בשקלים.
          </p>
          {/* Amber VALUE badge — honest, qualitative framing (no fabricated figure);
              the per-category savings vary, so we promise comparison value, not a
              number the catalogue can't substantiate. */}
          <p
            className="sw-reveal mt-4 inline-flex items-center gap-1.5 rounded-full border border-value/30 bg-value/10 px-3.5 py-1.5 text-sm font-semibold text-value-text"
            style={{ animationDelay: "90ms" }}
          >
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-value"
            />
            מסלול מתאים יכול לחסוך לכם מאות ₪ בשנה — וההשוואה חינם
          </p>
          <div
            className="sw-reveal mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
            style={{ animationDelay: "120ms" }}
          >
            <TrackedCtaLink
              href={`/compare/${featuredCat}`}
              location="hero"
              label="compare"
              className="interactive press sw-lift rounded-xl border border-accent/40 bg-accent px-6 py-3 font-semibold text-accent-contrast shadow-[var(--glow-accent)] hover:bg-accent-hover hover:shadow-float hover:shadow-accent/30"
            >
              להשוואת מסלולים
            </TrackedCtaLink>
            <TrackedCtaLink
              href="#lead"
              location="hero"
              label="consult"
              className="interactive press sw-lift rounded-xl border border-border/60 px-6 py-3 font-medium text-ink hover:border-accent/40 hover:bg-surface hover:shadow-soft"
            >
              שיחת ייעוץ חינם
            </TrackedCtaLink>
          </div>
          {/* Trust band — the cheapest entry price is the product's hook, so it
              carries the amber VALUE token (the rest stays muted). */}
          <p
            className="sw-reveal mt-4 text-sm text-muted"
            style={{ animationDelay: "150ms" }}
          >
            {planCount} מסלולים · {providers.length} ספקים · החל מ-
            <span className="font-display font-bold text-value-text">
              {ils(minFeatured)}
            </span>{" "}
            לחודש
          </p>
        </div>

        {/* Visual anchor — Switchy, the AI agent, looping in a branded frame
            (replaces the old static app mockup). */}
        <HeroVideo />
      </section>

      {/* ── Trust signals — REAL catalogue counts + honest trust points + the
          §7b commission disclosure (inline) + the §17 price caveat, all in one
          block. Prominent near the hero, NOT buried. Every number here is
          catalogue-derived; nothing is fabricated. ───────────────────────── */}
      <div className="mx-auto mt-8 max-w-3xl">
        <TrustSignals
          planCount={planCount}
          providerCount={providers.length}
          categoryCount={categories.length}
        />
      </div>

      {/* ── Value props ───────────────────────────────────────────────────── */}
      <section
        aria-label="למה להשוות איתנו"
        className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        {[
          {
            t: "השוואה חינמית",
            d: "השוואת כל המסלולים באתר היא ללא עלות וללא התחייבות.",
          },
          {
            t: "מחירים שקופים",
            d: "מציגים גם את המחיר אחרי המבצע ואת יחידת החיוב — בלי הפתעות.",
          },
          {
            t: "מעבר בהסכמה",
            d: "ניצור קשר רק אם תשאירו פרטים ותאשרו זאת בטופס.",
          },
        ].map((v, i) => (
          <article
            key={v.t}
            className="sw-reveal bento card-interactive p-6"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <h3 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink">
              <span
                aria-hidden="true"
                className="inline-block h-4 w-1 shrink-0 rounded-full bg-accent"
              />
              {v.t}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground">{v.d}</p>
          </article>
        ))}
      </section>

      {/* ── Category cards ────────────────────────────────────────────────── */}
      <section aria-labelledby="cats-h" className="mt-16">
        <h2
          id="cats-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          קטגוריות להשוואה
        </h2>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((cat, i) => {
            const count = plansByCategory(cat).length;
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
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── AI summary (GEO answer box) ───────────────────────────────────── */}
      <div className="mt-14">
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
        <ol className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          className="interactive mt-5 inline-block text-sm font-medium text-accent-text hover:text-accent-hover"
        >
          איך אנחנו מדרגים? שקיפות מלאה ←
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
            className="interactive press sw-lift mt-6 inline-block rounded-xl bg-accent px-5 py-2.5 font-medium text-accent-contrast shadow-soft hover:bg-accent-hover hover:shadow-float hover:shadow-accent/20"
          >
            לצפייה בדופק השוק ←
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
        <div className="mt-6">
          <ComparisonTable
            plans={featured}
            caption={`מסלולי ${CATEGORY_HE[featuredCat] ?? featuredCat} זולים — מחירים בשקלים`}
          />
          <PriceCaveat className="mt-3" />
        </div>
        <Link
          href={`/compare/${featuredCat}`}
          className="interactive mt-5 inline-block font-medium text-accent-text hover:text-accent-hover"
        >
          לכל מסלולי ה{CATEGORY_HE[featuredCat] ?? featuredCat} ←
        </Link>
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
