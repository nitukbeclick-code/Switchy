// ────────────────────────────────────────────────────────────────────────────
// /street-prices — "מחיר הרחוב": a PUBLIC transparency view of what people
// actually pay, built from anonymous user reports, plus a "דווח/י כמה את/ה
// משלם/ת" report form. The headline figure per category is the MEDIAN of real
// reports, shown inside the real min–max range — but ONLY for categories that
// clear the minimum-reports threshold; below it the card shows an honest empty
// state, never a fabricated number.
//
// This server component owns the SEO shell (self-canonical metadata, WebPage +
// Dataset + Breadcrumb + FAQ JSON-LD, the SGE summary, honest trust signals) and
// SSR-renders the initial aggregate (read once, server-side, via the threshold-
// gated get_street_prices_by_category RPC — fail-soft to empty) so the chart is in
// the SSR HTML (no CLS, GEO-visible). The interactive part (re-fetch + report
// form) lives in <StreetPricesClient>.
//
// E-E-A-T / HONESTY (ABSOLUTE): every figure is reported reality, labeled
// "מבוסס דיווחי משתמשים, לא מחירון רשמי" — NOT an official tariff, NOT a promise.
// The aggregate is threshold-gated by the DB; nothing is invented here. RTL +
// dark-mode safe + premium-2026.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import JsonLd from "@/components/JsonLd";
import Icon from "@/components/Icon";
import SgeSummary from "@/components/SgeSummary";
import TrustSignals from "@/components/TrustSignals";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import { getPlans, getProviders, getCategories } from "@/lib/data";
import {
  breadcrumbSchema,
  webPageSchema,
  datasetSchema,
  faqPageSchema,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import {
  STREET_PRICE_CATEGORIES,
  STREET_PRICE_MIN_REPORTS,
  STREET_PRICE_DISCLAIMER,
  normalizeAggregate,
  type StreetPriceAggregate,
} from "@/lib/street-price";
import StreetPricesClient from "./StreetPricesClient";

const PAGE_PATH = "/street-prices";
const REVIEWED_AT = new Date().toISOString().slice(0, 10);
// Real generation month for the dataset's temporalCoverage (never a fake range).
const TEMPORAL_COVERAGE = REVIEWED_AT.slice(0, 7);

export const metadata: Metadata = pageMetadata({
  title: "מחיר הרחוב — כמה באמת משלמים על תקשורת",
  description:
    "המחיר האמיתי שמשלמים בפועל על סלולר, אינטרנט, טלוויזיה וחבילות — לפי דיווחים " +
    "אנונימיים של משתמשים, לא מחירון רשמי. חציון וטווח אמיתיים, מוצגים רק כשיש מספיק " +
    "דיווחים. דווחו כמה אתם משלמים ועזרו לכולם לדעת את המחיר בשוק.",
  path: PAGE_PATH,
});

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://orzitfqmlvopujsoyigr.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Read the per-category aggregate once, server-side, for the SSR HTML. Fail-soft:
 * any missing-config / DB error yields the all-unpublished default so the page
 * still renders the honest empty state. The client re-fetches on mount to refresh.
 */
async function loadInitialAggregates(): Promise<StreetPriceAggregate[]> {
  const empty = STREET_PRICE_CATEGORIES.map((c) => normalizeAggregate(c, null));
  if (!SERVICE_ROLE_KEY) return empty;
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc(
      "get_street_prices_by_category",
      { p_min_reports: STREET_PRICE_MIN_REPORTS },
    );
    if (error || !Array.isArray(data)) return empty;
    const byCat = new Map<string, unknown>();
    for (const row of data) {
      const c =
        row && typeof row === "object"
          ? (row as { category?: unknown }).category
          : undefined;
      if (typeof c === "string") byCat.set(c, row);
    }
    return STREET_PRICE_CATEGORIES.map((c) =>
      normalizeAggregate(c, byCat.get(c) ?? null),
    );
  } catch {
    return empty;
  }
}

export default async function StreetPricesPage() {
  const initialAggregates = await loadInitialAggregates();

  // REAL catalogue totals for the honest trust block (no fabricated figures).
  const planCount = getPlans().length;
  const providerCount = getProviders().length;
  const categoryCount = getCategories().length;

  // The real provider display names for the report form's datalist — restricted to
  // providers that actually run a plan in a street-price category.
  const spCats = new Set<string>(STREET_PRICE_CATEGORIES);
  const providerNames = [
    ...new Set(
      getPlans()
        .filter((p) => spCats.has(p.cat))
        .map((p) => p.provider),
    ),
  ].sort((a, b) => a.localeCompare(b, "he"));

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "מחיר הרחוב", url: PAGE_PATH },
  ];

  const summary =
    "מחיר הרחוב הוא המחיר שאנשים באמת משלמים על תקשורת — לעיתים קרובות נמוך מהמחירון " +
    "הרשמי, כי הרבה מסלולים הם הצעות שימור אישיות. כאן מוצג חציון וטווח של דיווחים " +
    "אנונימיים אמיתיים מהקהילה, לכל קטגוריה — אבל רק כשיש מספיק דיווחים כדי להיות " +
    "מהימן. זה מבוסס דיווחי משתמשים, לא מחירון רשמי ולא הבטחה — אבל זו נקודת פתיחה " +
    "אמיתית לדעת אם משלמים יותר מדי.";

  // FAQ — honest, page-truthful questions (real provenance + threshold + privacy).
  const faqs = [
    {
      question: "מאיפה מגיעים המחירים בעמוד הזה?",
      answer:
        "מדיווחים אנונימיים של משתמשים — אנשים מדווחים כמה הם משלמים בפועל. זה " +
        STREET_PRICE_DISCLAIMER +
        ". מחיר רשמי מהמחירון תמצאו בעמודי ההשוואה.",
    },
    {
      question: "למה לפעמים לא מוצג מחיר בקטגוריה?",
      answer:
        `כדי שהמספר יהיה מהימן, אנחנו מציגים מחיר רחוב רק אחרי שהצטברו לפחות ` +
        `${STREET_PRICE_MIN_REPORTS} דיווחים עצמאיים באותה קטגוריה. עד אז לא מוצג ` +
        `כלום — אנחנו לא ממציאים "מחיר טיפוסי" ממדגם קטן ולא מייצג.`,
    },
    {
      question: "האם הדיווח שלי אנונימי?",
      answer:
        "כן, לחלוטין. שולחים רק קטגוריה, ספק וסכום חודשי. לא נשמר שם, טלפון או כל " +
        "פרט מזהה אחר על דיווח מחיר.",
    },
    {
      question: "למה החציון ולא הממוצע?",
      answer:
        "החציון (הערך האמצעי) עמיד יותר בפני דיווחים חריגים בודדים, ולכן הוא משקף " +
        "טוב יותר את המחיר הטיפוסי. אנחנו מציגים גם את הממוצע ואת הטווח המלא לשקיפות.",
    },
  ];

  const related = [
    {
      title: "השוואת כל המסלולים",
      href: "/compare",
      description: "מרכז ההשוואה — המחיר הרשמי מהמחירון, כל שירות וכל הספקים.",
    },
    {
      title: "מיקוח על המחיר מול הספק",
      href: "/negotiate",
      description: "תסריט שימור מבוסס נתונים — לפני שעוזבים, נסו להוריד את המחיר.",
    },
    {
      title: "שאלון התאמה אישי",
      href: "/quiz",
      description: "5 שאלות → מסלולים אמיתיים מדורגים לפי הצרכים שלכם.",
    },
  ];

  return (
    <main
      id="main"
      className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6"
    >
      {/* Structured data: WebPage + Dataset + Breadcrumb + FAQ. */}
      <JsonLd
        data={webPageSchema({
          name: "מחיר הרחוב — כמה באמת משלמים על תקשורת",
          description:
            "חציון וטווח של מחירי תקשורת לפי דיווחי משתמשים אנונימיים, מוצג רק מעל סף דיווחים. מבוסס דיווחי משתמשים, לא מחירון רשמי.",
          url: PAGE_PATH,
          lastReviewed: REVIEWED_AT,
          about: "מחירי תקשורת אמיתיים לפי דיווחי משתמשים",
        })}
      />
      <JsonLd
        data={datasetSchema({
          name: "מחיר הרחוב — דיווחי משתמשים על מחירי תקשורת בישראל",
          description:
            "אגרגציה אנונימית של מחירים חודשיים שדיווחו משתמשים (חציון, ממוצע, טווח), לפי קטגוריה, מוצגת רק מעל סף דיווחים מינימלי. מבוסס דיווחי משתמשים, לא מחירון רשמי.",
          url: PAGE_PATH,
          temporalCoverage: TEMPORAL_COVERAGE,
          measures: ["חציון מחיר", "מחיר ממוצע", "מחיר מינימלי", "מחיר מקסימלי", "מספר דיווחים"],
        })}
      />
      <JsonLd data={faqPageSchema(faqs)} />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">מחיר הרחוב</span>
      </nav>

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-3">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          מחיר הרחוב — כמה באמת משלמים
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-foreground">
          המחיר שמופיע במחירון הוא לא תמיד המחיר שמשלמים בפועל. כאן רואים מה אנשים
          באמת משלמים — לפי דיווחים אנונימיים מהקהילה — וגם אפשר לדווח בעצמכם.
        </p>
        {/* Provenance pill — the page's central honesty signal, surfaced at the
            top of the fold: this is reported reality, NOT an official tariff.
            Neutral info-toned (not the amber VALUE accent, which is reserved for
            the price figures themselves). */}
        <p className="mt-5 inline-flex items-start gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm text-muted">
          <Icon name="info" size={16} className="mt-0.5 shrink-0 text-muted" />
          <span>{STREET_PRICE_DISCLAIMER}</span>
        </p>
      </header>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="השורה התחתונה: מחיר הרחוב">{summary}</SgeSummary>
      </div>

      {/* ── Trust signals — real catalogue counts + §7b + §17 caveat ──────── */}
      <div className="mt-8">
        <TrustSignals
          planCount={planCount}
          providerCount={providerCount}
          categoryCount={categoryCount}
        />
      </div>

      {/* ── The chart + report form (interactive) ─────────────────────────── */}
      <div className="mt-10">
        <StreetPricesClient
          providers={providerNames}
          initialAggregates={initialAggregates}
        />
      </div>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="עוד באתר"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />

      <p className="mt-8 text-xs text-muted">עודכן לאחרונה: {REVIEWED_AT}</p>
    </main>
  );
}
