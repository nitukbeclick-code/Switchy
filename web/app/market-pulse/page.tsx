import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import AuthorityBlock from "@/components/AuthorityBlock";
import MarketPulseCharts, {
  type MarketPulseCategory,
} from "@/components/MarketPulseCharts";
import SmartTimer from "@/components/SmartTimer";
import TrackedCtaLink from "@/components/TrackedCtaLink";
import Icon from "@/components/Icon";
import { priceStats, CATEGORY_HE, getPlans, getProviders } from "@/lib/data";
import {
  collectionPageSchema,
  breadcrumbSchema,
  datasetSchema,
} from "@/lib/schema";
import { lastDataDate } from "@/lib/aeo";
import { pageMetadata } from "@/lib/seo";
import { ils } from "@/lib/format";

// ── Static, no secrets: the page reads the bundled catalogue via priceStats(). ──
export const dynamic = "force-static";

// The catalogue is rebuilt with each deploy; we surface the render date as the
// honest "last reviewed" date for the current-state snapshot.
const REVIEWED_AT = new Date().toISOString().slice(0, 10);
const PAGE_PATH = "/market-pulse";

// ── Build the per-category current-state rows the chart consumes. ─────────────
// priceStats(): Record<category, {avg, min, max, count, cheapest: Plan}>.
function buildRows(): MarketPulseCategory[] {
  const stats = priceStats();
  const rows: MarketPulseCategory[] = [];

  for (const [category, s] of Object.entries(stats)) {
    if (!s || s.count <= 0) continue;
    const label = CATEGORY_HE[category] ?? category;
    rows.push({
      category,
      label,
      avg: s.avg,
      min: s.min,
      max: s.max,
      count: s.count,
      cheapest: s.cheapest
        ? {
            plan: s.cheapest.plan,
            provider: s.cheapest.provider,
            price: s.cheapest.price,
            href: `/compare/${category}`,
          }
        : null,
    });
  }

  // Stable order: most plans first, then Hebrew label.
  rows.sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "he"),
  );
  return rows;
}

export function generateMetadata(): Metadata {
  const rows = buildRows();
  const total = rows.reduce((n, r) => n + r.count, 0);
  // Bare title — the root layout's title template brands the <title> once (the OG
  // title is brand-normalised by pageMetadata). The inline brand suffix here was
  // previously double-applied by the template → "… | brand | brand".
  return pageMetadata({
    title: "מצב שוק התקשורת — מחירים נוכחיים בישראל",
    description:
      `תמונת מצב עדכנית של מחירי התקשורת בישראל: מחיר ממוצע, מחיר מינימום והעסקה ` +
      `הזולה ביותר בכל קטגוריה, מתוך ${total} מסלולים. נתונים נוכחיים בלבד — ` +
      `היסטוריית מחירים תיאסף לאורך זמן להצגת מגמות אמיתיות.`,
    path: PAGE_PATH,
  });
}

// A factual 40–50 word Hebrew conclusion computed from the catalogue.
function buildSummary(rows: MarketPulseCategory[]): string {
  const total = rows.reduce((n, r) => n + r.count, 0);
  // The category with the lowest current entry price.
  const withMin = rows.filter((r) => Number.isFinite(r.min));
  const cheapestCat = withMin.slice().sort((a, b) => a.min - b.min)[0];

  return (
    `מצב שוק התקשורת בישראל כולל כרגע ${total} מסלולים ב-${rows.length} קטגוריות. ` +
    `בכל קטגוריה מוצגים המחיר הממוצע, המחיר הזול ביותר והעסקה המשתלמת ביותר כרגע. ` +
    (cheapestCat
      ? `נקודת הכניסה הזולה ביותר היא בקטגוריית ${cheapestCat.label} מ-${ils(
          cheapestCat.min,
        )}. `
      : "") +
    `הנתונים נוכחיים בלבד; מגמות היסטוריות ייאספו לאורך זמן.`
  );
}

// Authority "truth table": each row is a category, its cheapest current deal, and
// a FACTUAL reason (the real minimum price). No fabricated metrics, no history.
function buildAuthority(rows: MarketPulseCategory[]): {
  answer: string;
  tableRows: { factor: string; winner: string; reason: string }[];
} {
  const tableRows = rows
    .filter((r) => r.cheapest)
    .map((r) => ({
      factor: `${r.label} — הזול ביותר כרגע`,
      winner: `${r.cheapest!.provider} — ${r.cheapest!.plan}`,
      reason: `המחיר ההתחלתי הנמוך ביותר בקטגוריה כרגע: ${ils(r.cheapest!.price)}.`,
    }));

  const withMin = rows.filter((r) => Number.isFinite(r.min));
  const cheapestCat = withMin.slice().sort((a, b) => a.min - b.min)[0];

  const answer = cheapestCat
    ? `נכון לעכשיו, נקודת הכניסה הזולה ביותר בשוק היא בקטגוריית ${cheapestCat.label} ` +
      `מ-${ils(cheapestCat.min)}. הטבלה מציגה את העסקה הזולה ביותר בכל קטגוריה — ` +
      `כל הנתונים נוכחיים, ללא מגמות היסטוריות (אלה ייאספו לאורך זמן).`
    : `הטבלה מציגה את העסקה הזולה ביותר בכל קטגוריה, נכון למצב הנוכחי בקטלוג.`;

  return { answer, tableRows };
}

// ── Dataset JSON-LD ("Switchy as the data source"). Wires the shared, prepared
// datasetSchema() builder into a rich, truthful Dataset node describing the REAL
// telecom price catalogue this page exposes. temporalCoverage is the REAL
// catalogue month (YYYY-MM from lastDataDate()); distribution points at the
// existing public JSON feed (/api/llm-feed.json, application/json).
const DATA_FEED_PATH = "/api/llm-feed.json";

function buildDataset(rows: MarketPulseCategory[]): Record<string, unknown> {
  const total = rows.reduce((n, r) => n + r.count, 0);
  // Real catalogue month (YYYY-MM) — derived from the genuine "data as of" date,
  // never a fabricated range.
  const temporalCoverage = lastDataDate(getPlans()).slice(0, 7);

  return datasetSchema({
    name: "מחירון תקשורת ישראל — Switchy",
    description:
      `מחירון מסלולי התקשורת בישראל של Switchy: מחירים נוכחיים לפי ספק וקטגוריה ` +
      `(סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחו״ל), כולל מחיר ממוצע, מינימום ` +
      `ומקסימום בכל קטגוריה — מתוך ${total} מסלולים בקטלוג. נתונים נוכחיים בלבד.`,
    url: PAGE_PATH,
    temporalCoverage,
    distributionUrl: DATA_FEED_PATH,
  });
}

export default function MarketPulsePage() {
  const rows = buildRows();
  const summary = buildSummary(rows);
  const authority = buildAuthority(rows);

  // ── Hero facts (catalogue-derived, never fabricated) ─────────────────────────
  // planCount = total priced plans across categories; providers.length = the real
  // provider count; the cheapest current entry point in the market (min price and
  // its category) drives the green VALUE price + the primary CTA target so the
  // hook lands on the most relevant compare page.
  const planCount = rows.reduce((n, r) => n + r.count, 0);
  const providers = getProviders();
  const cheapestCat = rows
    .filter((r) => Number.isFinite(r.min))
    .slice()
    .sort((a, b) => a.min - b.min)[0];
  const minFeatured = cheapestCat ? cheapestCat.min : 0;
  const featuredCat = cheapestCat ? cheapestCat.category : rows[0]?.category;

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "מצב השוק", url: PAGE_PATH },
  ];

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
        .sw-reveal { animation: swReveal 400ms var(--ease-out) both; }
        @keyframes swReveal {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sw-reveal { animation: none; }
        }
      `,
        }}
      />

      {/* GEO structured data: Dataset ("Switchy as the data source") + CollectionPage + Breadcrumb. */}
      <JsonLd data={buildDataset(rows)} />
      <JsonLd
        data={collectionPageSchema({
          name: "מצב שוק התקשורת בישראל",
          description:
            "תמונת מצב נוכחית של מחירי התקשורת בישראל לפי קטגוריה — ממוצע, מינימום והעסקה הזולה ביותר.",
          url: PAGE_PATH,
        })}
      />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">מצב השוק</span>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────────
          Flat-ink editorial hero (premium-2026): a solid deep-ink panel with the
          white headline set directly on it — NO photo/video behind — and ONE
          green primary CTA plus a quiet secondary text link. Green is applied
          ONLY to the market's real cheapest entry price (VALUE); the headline is
          a CHECK ("בודקים … בכל קטגוריה"), never a promised amount. The panel is a
          fixed deep ink (#111827) in BOTH themes so "white on ink" always holds. */}
      <header className="mt-4">
        <section className="relative isolate overflow-hidden rounded-3xl border border-border/60 bg-[#111827] px-5 py-12 text-center sm:px-10 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <h1 className="sw-reveal font-display text-4xl font-bold tracking-tight text-white sm:text-6xl">
              בודקים היכן מחירי התקשורת עומדים כרגע.{" "}
              {minFeatured > 0 ? (
                <span className="text-accent">
                  נקודת כניסה מ-{ils(minFeatured)} לחודש.
                </span>
              ) : null}
            </h1>
            <p
              className="sw-reveal mx-auto mt-5 max-w-2xl text-lg font-medium leading-relaxed text-white/85 sm:text-xl"
              style={{ animationDelay: "60ms" }}
            >
              תמונת מצב נוכחית מהקטלוג — מחיר ממוצע, המחיר הזול ביותר והעסקה המשתלמת
              ביותר בכל קטגוריה. הנתונים עדכניים נכון להיום.
            </p>
            {featuredCat ? (
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
                  className="interactive text-sm text-white/85 underline-offset-4 hover:underline"
                >
                  או דברו עם יועץ
                </TrackedCtaLink>
              </div>
            ) : null}
            {/* Trust band — REAL catalogue counts; the entry price carries the
                green VALUE emphasis (text-accent), never a button. */}
            <p
              className="sw-reveal mt-8 text-sm text-white/85"
              style={{ animationDelay: "150ms" }}
            >
              {planCount.toLocaleString("he-IL")} מסלולים · {providers.length}{" "}
              ספקים · {rows.length} קטגוריות
              {minFeatured > 0 ? (
                <>
                  {" "}
                  · החל מ-
                  <span className="font-display font-bold text-accent">
                    {ils(minFeatured)}
                  </span>{" "}
                  לחודש
                </>
              ) : null}
            </p>
          </div>
        </section>
      </header>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="sw-reveal mt-8" style={{ animationDelay: "120ms" }}>
        <SgeSummary heading="תקציר מצב השוק">{summary}</SgeSummary>
      </div>

      {/* ── Authority block: direct answer + truth table + verification stamp ─ */}
      <div className="sw-reveal mt-8" style={{ animationDelay: "180ms" }}>
        <AuthorityBlock
          heading="השורה התחתונה: היכן הכי משתלם כרגע"
          answer={authority.answer}
          rows={authority.tableRows}
          tableCaption="העסקה הזולה ביותר בכל קטגוריה — נכון למצב הנוכחי"
          reviewedAt={REVIEWED_AT}
        />
      </div>

      {/* ── Charts (current state, no trend lines) ────────────────────────── */}
      <section aria-labelledby="charts-h" className="mt-14">
        <h2 id="charts-h" className="sr-only">
          תרשימי מצב השוק הנוכחי
        </h2>
        <MarketPulseCharts data={rows} />
      </section>

      {/* ── Honesty note: history will accrue for real future trends. ─────── */}
      <aside
        className="bento mt-14 p-5 text-sm text-foreground sm:p-6"
        aria-label="הערה על נתוני מגמה"
      >
        <h2 className="mb-1.5 flex items-center gap-2 font-display text-base font-semibold text-ink">
          <span
            aria-hidden="true"
            className="inline-block h-4 w-1 rounded-full bg-accent"
          />
          על מגמות לאורך זמן
        </h2>
        <p className="text-muted">
          העמוד מציג כרגע <strong className="text-foreground">מצב שוק נוכחי</strong>{" "}
          בלבד. איננו ממציאים גרפים היסטוריים — אנו מתחילים מהיום לתעד את המחירים,
          וכשתצטבר היסטוריה אמיתית נוסיף כאן קווי מגמה (עליות וירידות מחיר לאורך
          זמן) המבוססים על נתונים שנמדדו בפועל.
        </p>
      </aside>

      {/* ── Smart contract timer — "כדאי לעבור עכשיו" calculator. ──────────── */}
      <section aria-labelledby="timer-h" className="mt-14">
        <h2 id="timer-h" className="sr-only">
          מחשבון סיום התחייבות
        </h2>
        <SmartTimer heading="מתי כדאי לי לעבור? מחשבון סיום התחייבות" />
      </section>

      {/* ── Onward links — no dead-ends. ──────────────────────────────────── */}
      <nav
        aria-label="המשך לעמודי השוואה"
        className="mt-16 border-t border-border/40 pt-10"
      >
        <h2 className="mb-5 font-display text-xl font-bold tracking-tight text-ink">
          המשיכו להשוות
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {rows.map((r, i) => (
            <li
              key={r.category}
              className="sw-reveal"
              style={{ animationDelay: `${Math.min(i * 50, 250)}ms` }}
            >
              <Link
                href={`/compare/${r.category}`}
                className="card card-interactive group flex items-center justify-between gap-3 p-4"
              >
                <span className="font-medium text-foreground transition-colors group-hover:text-accent">
                  השוואת מסלולי {r.label}
                </span>
                <span className="text-sm text-muted">
                  {r.count.toLocaleString("he-IL")} מסלולים
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
