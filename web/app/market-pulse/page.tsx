import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import AuthorityBlock from "@/components/AuthorityBlock";
import MarketPulseCharts, {
  type MarketPulseCategory,
} from "@/components/MarketPulseCharts";
import SmartTimer from "@/components/SmartTimer";
import { priceStats, CATEGORY_HE } from "@/lib/data";
import {
  collectionPageSchema,
  breadcrumbSchema,
  SITE_URL,
} from "@/lib/schema";
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
  return {
    title: "מצב שוק התקשורת — מחירים נוכחיים בישראל | חוסך / Switch AI",
    description:
      `תמונת מצב עדכנית של מחירי התקשורת בישראל: מחיר ממוצע, מחיר מינימום והעסקה ` +
      `הזולה ביותר בכל קטגוריה, מתוך ${total} מסלולים. נתונים נוכחיים בלבד — ` +
      `היסטוריית מחירים תיאסף לאורך זמן להצגת מגמות אמיתיות.`,
    alternates: { canonical: PAGE_PATH },
  };
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

// ── Dataset JSON-LD (current-state snapshot). Built inline as a plain object —
// it describes the REAL, current per-category price snapshot this page exposes.
function datasetSchema(rows: MarketPulseCategory[]): Record<string, unknown> {
  const total = rows.reduce((n, r) => n + r.count, 0);
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "מצב שוק התקשורת בישראל — תמונת מחירים נוכחית",
    description:
      `סטטיסטיקת מחירים נוכחית לכל קטגוריית תקשורת בישראל (מחיר ממוצע, מינימום, ` +
      `מקסימום ומספר מסלולים), מתוך ${total} מסלולים בקטלוג. נתונים נוכחיים בלבד.`,
    url: `${SITE_URL}${PAGE_PATH}`,
    inLanguage: "he-IL",
    dateModified: REVIEWED_AT,
    creator: { "@type": "Organization", name: "חוסך / Switch AI", url: SITE_URL },
    isAccessibleForFree: true,
    measurementTechnique: "אגרגציה של מחירי מסלולים מקטלוג הספקים",
    variableMeasured: [
      { "@type": "PropertyValue", name: "מחיר ממוצע", unitText: "ILS" },
      { "@type": "PropertyValue", name: "מחיר מינימום", unitText: "ILS" },
      { "@type": "PropertyValue", name: "מחיר מקסימום", unitText: "ILS" },
      { "@type": "PropertyValue", name: "מספר מסלולים", unitText: "מסלולים" },
    ],
    distribution: rows.map((r) => ({
      "@type": "DataDownload",
      name: r.label,
      contentUrl: `${SITE_URL}/compare/${r.category}`,
      encodingFormat: "text/html",
    })),
  };
}

export default function MarketPulsePage() {
  const rows = buildRows();
  const summary = buildSummary(rows);
  const authority = buildAuthority(rows);

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "מצב השוק", url: PAGE_PATH },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      {/* GEO structured data: Dataset (current snapshot) + CollectionPage + Breadcrumb. */}
      <JsonLd data={datasetSchema(rows)} />
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
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">מצב השוק</span>
      </nav>

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-3">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          מצב שוק התקשורת בישראל
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-foreground">
          תמונת מצב נוכחית של מחירי התקשורת — מחיר ממוצע, המחיר הזול ביותר והעסקה
          המשתלמת ביותר בכל קטגוריה. הנתונים עדכניים נכון להיום.
        </p>
      </header>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="תקציר מצב השוק">{summary}</SgeSummary>
      </div>

      {/* ── Authority block: direct answer + truth table + verification stamp ─ */}
      <div className="mt-8">
        <AuthorityBlock
          heading="השורה התחתונה: היכן הכי משתלם כרגע"
          answer={authority.answer}
          rows={authority.tableRows}
          tableCaption="העסקה הזולה ביותר בכל קטגוריה — נכון למצב הנוכחי"
          reviewedAt={REVIEWED_AT}
        />
      </div>

      {/* ── Charts (current state, no trend lines) ────────────────────────── */}
      <section aria-labelledby="charts-h" className="mt-10">
        <h2 id="charts-h" className="sr-only">
          תרשימי מצב השוק הנוכחי
        </h2>
        <MarketPulseCharts data={rows} />
      </section>

      {/* ── Honesty note: history will accrue for real future trends. ─────── */}
      <aside
        className="mt-8 rounded-2xl border border-border bg-surface p-5 text-sm text-foreground sm:p-6"
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
      <section aria-labelledby="timer-h" className="mt-10">
        <h2 id="timer-h" className="sr-only">
          מחשבון סיום התחייבות
        </h2>
        <SmartTimer heading="מתי כדאי לי לעבור? מחשבון סיום התחייבות" />
      </section>

      {/* ── Onward links — no dead-ends. ──────────────────────────────────── */}
      <nav
        aria-label="המשך לעמודי השוואה"
        className="mt-16 border-t border-border pt-8"
      >
        <h2 className="mb-4 font-display text-xl font-bold text-ink">
          המשיכו להשוות
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <li key={r.category}>
              <Link
                href={`/compare/${r.category}`}
                className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-accent"
              >
                <span className="font-medium text-foreground group-hover:text-accent">
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
