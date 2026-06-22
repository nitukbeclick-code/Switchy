import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import AiSummary from "@/components/AiSummary";
import ComparisonTable from "@/components/ComparisonTable";
import LeadForm from "@/components/LeadForm";
import SmartTimer from "@/components/SmartTimer";
import {
  getCategories,
  getProviders,
  getPlans,
  plansByCategory,
  buildProviderRankings,
  getCities,
  CATEGORY_HE,
} from "@/lib/data";
import { websiteSchema, itemListSchema, faqPageSchema } from "@/lib/schema";
import { GENERAL_FAQ } from "@/lib/faq";
import { ils } from "@/lib/format";

export const metadata: Metadata = {
  title: "השוואת מסלולי תקשורת בישראל — חינם",
  description:
    "משווים מסלולי סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחבילות חו״ל מכל " +
    "הספקים בישראל. השוואה חינמית, מחירים מעודכנים בשקלים, ומעבר ספק בהסכמתכם.",
  alternates: { canonical: "/" },
};

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
    `חוסך / Switchy הוא שירות חינמי להשוואת מסלולי תקשורת בישראל. ` +
    `אנו משווים ${planCount} מסלולים מ-${providers.length} ספקים בחמש קטגוריות — ` +
    `סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחבילות חו״ל. המחירים בשקלים ` +
    `ומעודכנים; פנייה לספק נשלחת רק לאחר אישורכם.`;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      {/* Structured data for engines: WebSite (SearchAction), the featured list, FAQ. */}
      <JsonLd data={websiteSchema()} />
      <JsonLd data={itemListSchema(featured)} />
      <JsonLd data={faqPageSchema(GENERAL_FAQ)} />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="text-center">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-5xl">
          משווים תקשורת. חוסכים כסף.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-foreground sm:text-xl">
          השוואה חינמית של מסלולי סלולר, אינטרנט, טלוויזיה, חבילות משולבות
          וחבילות חו״ל מכל הספקים בישראל — מחירים מעודכנים בשקלים.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/compare/${featuredCat}`}
            className="rounded-lg bg-accent px-6 py-3 font-medium text-accent-contrast hover:bg-accent-hover"
          >
            להשוואת מסלולים
          </Link>
          <a
            href="#lead"
            className="rounded-lg border border-border-strong px-6 py-3 font-medium text-ink hover:bg-surface"
          >
            שיחת ייעוץ חינם
          </a>
        </div>
        <p className="mt-4 text-sm text-muted">
          {planCount} מסלולים · {providers.length} ספקים · החל מ-{ils(minFeatured)} לחודש
        </p>
      </section>

      {/* ── Value props ───────────────────────────────────────────────────── */}
      <section
        aria-label="למה להשוות איתנו"
        className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3"
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
        ].map((v) => (
          <article
            key={v.t}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <h3 className="font-display text-lg font-semibold text-ink">{v.t}</h3>
            <p className="mt-2 text-sm text-foreground">{v.d}</p>
          </article>
        ))}
      </section>

      {/* ── Category cards ────────────────────────────────────────────────── */}
      <section aria-labelledby="cats-h" className="mt-14">
        <h2 id="cats-h" className="font-display text-2xl font-bold text-ink">
          קטגוריות להשוואה
        </h2>
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {categories.map((cat) => {
            const count = plansByCategory(cat).length;
            return (
              <li key={cat}>
                <Link
                  href={`/compare/${cat}`}
                  className="block h-full rounded-xl border border-border bg-surface p-4 transition hover:border-accent hover:shadow-sm"
                >
                  <span className="block font-display font-semibold text-ink">
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
      <section aria-labelledby="rankings-h" className="mt-14">
        <h2 id="rankings-h" className="font-display text-2xl font-bold text-ink">
          ספקים לפי ערך — דירוג שקוף
        </h2>
        <p className="mt-2 text-sm text-muted">
          הדירוג ממיין את הספקים לפי{" "}
          <strong className="font-semibold text-foreground">
            המחיר ההתחלתי הזול ביותר
          </strong>{" "}
          (מהנמוך לגבוה), ובמקרה של שוויון — לפי מספר המסלולים בקטלוג. זו מתודולוגיה
          עובדתית ושקופה: אנו מציגים מי מציע את נקודת הכניסה הזולה ביותר, ללא דירוג
          איכות נסתר וללא תשלום על מיקום.
        </p>
        <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rankings.map((p, i) => (
            <li key={p.slug}>
              <Link
                href={`/providers/${p.slug}`}
                className="flex h-full items-center gap-4 rounded-xl border border-border bg-surface p-4 transition hover:border-accent hover:shadow-sm"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 font-display text-sm font-bold text-accent"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display font-semibold text-ink">
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
          className="mt-4 inline-block text-sm font-medium text-accent hover:text-accent-hover"
        >
          איך אנחנו מדרגים? שקיפות מלאה ←
        </Link>
      </section>

      {/* ── Market-Pulse teaser ───────────────────────────────────────────── */}
      <section aria-labelledby="pulse-h" className="mt-14">
        <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
          <h2 id="pulse-h" className="font-display text-2xl font-bold text-ink">
            דופק השוק — מצב נוכחי
          </h2>
          <p className="mt-2 max-w-2xl text-foreground">
            מחיר ממוצע, מינימלי ומקסימלי בכל קטגוריה — תמונת מצב עדכנית של שוק
            התקשורת בישראל לפי הקטלוג שלנו. נתונים אמיתיים בלבד, ללא גרפים מומצאים.
          </p>
          <Link
            href="/market-pulse"
            className="mt-5 inline-block rounded-lg bg-accent px-5 py-2.5 font-medium text-accent-contrast hover:bg-accent-hover"
          >
            לצפייה בדופק השוק ←
          </Link>
        </div>
      </section>

      {/* ── Smart-Timer teaser (commitment-end calculator) ────────────────── */}
      <section aria-labelledby="timer-h" className="mt-14">
        <h2 id="timer-h" className="font-display text-2xl font-bold text-ink">
          מתי נגמרת ההתחייבות שלכם?
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          הזינו את תאריך תחילת ההתחייבות ואת אורכה כדי לדעת מתי תוכלו לעבור ספק ללא
          קנס יציאה. מחשבון פרטי לחלוטין — שום נתון לא נשלח לשרת.
        </p>
        <div className="mt-5">
          <SmartTimer />
        </div>
      </section>

      {/* ── City quick-links (geo compare pages) ──────────────────────────── */}
      {cities.length > 0 && (
        <section aria-labelledby="cities-h" className="mt-14">
          <h2 id="cities-h" className="font-display text-2xl font-bold text-ink">
            השוואת {CATEGORY_HE[featuredCat] ?? featuredCat} לפי עיר
          </h2>
          <p className="mt-2 text-sm text-muted">
            אותם ספקים ומסלולים זמינים בכל הארץ. בחרו עיר להשוואה מקומית.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {cities.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/compare/${featuredCat}/${c.slug}`}
                  className="inline-block rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-foreground transition hover:border-accent hover:text-accent"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Featured comparison ───────────────────────────────────────────── */}
      <section aria-labelledby="featured-h" className="mt-14">
        <h2 id="featured-h" className="font-display text-2xl font-bold text-ink">
          מסלולי {CATEGORY_HE[featuredCat] ?? featuredCat} משתלמים
        </h2>
        <p className="mt-2 text-sm text-muted">
          ששת המסלולים הזולים ביותר בקטגוריה לפי המחיר ההתחלתי.
        </p>
        <div className="mt-5">
          <ComparisonTable
            plans={featured}
            caption={`מסלולי ${CATEGORY_HE[featuredCat] ?? featuredCat} זולים — מחירים בשקלים`}
          />
        </div>
        <Link
          href={`/compare/${featuredCat}`}
          className="mt-4 inline-block font-medium text-accent hover:text-accent-hover"
        >
          לכל מסלולי ה{CATEGORY_HE[featuredCat] ?? featuredCat} ←
        </Link>
      </section>

      {/* ── Lead form ─────────────────────────────────────────────────────── */}
      <section id="lead" aria-labelledby="lead-h" className="mt-16 scroll-mt-6">
        <h2 id="lead-h" className="font-display text-2xl font-bold text-ink">
          רוצים שנעזור לכם לחסוך?
        </h2>
        <p className="mt-2 text-foreground">
          השאירו פרטים ונחזור אליכם עם השוואה מותאמת — ללא עלות וללא התחייבות.
        </p>
        <div className="mt-5 max-w-xl">
          <LeadForm source="home" />
        </div>
      </section>
    </main>
  );
}
