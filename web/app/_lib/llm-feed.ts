// ────────────────────────────────────────────────────────────────────────────
// Shared builder for the SEMANTIC MAP feed served at both /api/llm-feed (canonical)
// and /api/llm-feed.json (back-compat). App-local helper (under app/_lib, the
// leading underscore keeps it out of the route tree).
//
// The feed is a SEMANTIC MAP, not a flat dump: it states the marketContext, the
// topological links between entities, and a recommendationEngine of "best for X"
// picks — every reason FACTUAL and catalogue-derived (cheapest, cheapest no-commit,
// cheapest 5G, cheapest with-abroad). No fabricated metrics, no regionalAvailability
// (we have no real coverage data). Providers carry real official sameAs URLs.
// ────────────────────────────────────────────────────────────────────────────

import {
  getProviders,
  getPlans,
  getCategories,
  providerSlug,
  providerOfficialUrl,
  CATEGORY_HE,
} from "@/lib/data";
import { priceUnitLabel } from "@/lib/format";
import { SITE_URL, SITE_NAME } from "@/lib/schema";
import type { Plan } from "@/lib/types";

// Official provider homepages (Knowledge-Graph sameAs anchors) come from the
// SINGLE source of truth — PROVIDER_OFFICIAL_URLS in @/lib/data — so this feed
// can't drift from the rest of the app. (It used to keep a private 7-entry copy
// that silently omitted golan / rami-levy / 019.) Only verified, public official
// URLs; a provider without a known URL is omitted rather than guessed.
const officialUrl = providerOfficialUrl;

function cheapest(plans: Plan[], pred: (p: Plan) => boolean): Plan | undefined {
  return plans.filter(pred).sort((a, b) => a.price - b.price)[0];
}

interface Recommended {
  bestFor: string;
  entity: string;
  entityUrl: string;
  category: string;
  price: number;
  reason: string;
}

// Build the "best for X" recommendation engine — truthful, per category.
function buildRecommendations(plans: Plan[]): Recommended[] {
  const out: Recommended[] = [];
  for (const cat of getCategories()) {
    const he = CATEGORY_HE[cat] ?? cat;
    const ps = plans.filter((p) => p.cat === cat);
    if (ps.length === 0) continue;

    const picks: { bestFor: string; plan?: Plan; reason: (p: Plan) => string }[] =
      [
        {
          bestFor: `המחיר ההתחלתי הזול ביותר ב${he}`,
          plan: cheapest(ps, () => true),
          reason: (p) =>
            `המחיר ההתחלתי הנמוך ביותר בקטגוריית ${he}: ₪${p.price}.`,
        },
        {
          bestFor: `הזול ביותר ללא התחייבות ב${he}`,
          plan: cheapest(ps, (p) => p.noCommit),
          reason: (p) =>
            `₪${p.price} ללא התחייבות — ניתן לעזוב בכל עת ללא קנס.`,
        },
        {
          bestFor: `מסלול 5G הזול ביותר ב${he}`,
          plan: cheapest(ps, (p) => p.is5G),
          reason: (p) => `מסלול 5G בעלות ההתחלתית הנמוכה ביותר: ₪${p.price}.`,
        },
        {
          bestFor: `כולל חו״ל במחיר הנמוך ביותר ב${he}`,
          plan: cheapest(ps, (p) => p.hasAbroad),
          reason: (p) =>
            `כולל שימוש בחו״ל בעלות ההתחלתית הנמוכה ביותר: ₪${p.price}.`,
        },
      ];

    const seen = new Set<string>();
    for (const pick of picks) {
      if (!pick.plan) continue;
      const key = `${pick.bestFor}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        bestFor: pick.bestFor,
        entity: `${pick.plan.provider} — ${pick.plan.plan}`,
        entityUrl: `${SITE_URL}/providers/${providerSlug(pick.plan.provider)}`,
        category: cat,
        price: pick.plan.price,
        reason: pick.reason(pick.plan),
      });
    }
  }
  return out;
}

/** Build the full semantic-map feed object (shared by both feed routes). */
export function buildLlmFeed(): Record<string, unknown> {
  const providers = getProviders();
  const plans = getPlans();
  const categories = getCategories();

  return {
    "@context": "https://schema.org",
    name: SITE_NAME,
    url: SITE_URL,
    description:
      "מפה סמנטית של שוק התקשורת בישראל: ספקים, מסלולים, וקישורים טופולוגיים " +
      "ביניהם. שירות השוואה חינמי; פנייה לספק נשלחת רק בהסכמת המשתמש.",
    currency: "ILS",
    generatedAt: new Date().toISOString(),

    // What market this feed describes (the GEO "context" entity).
    marketContext: "Israeli Telecom Market",

    // How the entities relate to one another (the semantic topology).
    topologicalLinks: {
      categoriesToCompare: categories.map((id) => ({
        category: id,
        categoryName: CATEGORY_HE[id] ?? id,
        comparePage: `${SITE_URL}/compare/${id}`,
      })),
      providerToPlans: providers.map((p) => ({
        provider: p.name,
        providerPage: `${SITE_URL}/providers/${p.slug}`,
        planIds: plans
          .filter((pl) => pl.provider === p.name)
          .map((pl) => pl.id),
      })),
      glossary: `${SITE_URL}/glossary`,
      transparency: `${SITE_URL}/transparency`,
    },

    // Truthful "best for X" picks. Methodology stated; no covert ranking.
    recommendationEngine: {
      methodology:
        "כל המלצה נגזרת ישירות מהקטלוג (מחיר התחלתי בשקלים, התחייבות, 5G, חו״ל). " +
        "אין דירוג בתשלום סמוי; כל המלצה כוללת את הסיבה העובדתית.",
      recommendations: buildRecommendations(plans),
    },

    providers: providers.map((p) => {
      const url = officialUrl(p.name);
      return {
        slug: p.slug,
        name: p.name,
        url: `${SITE_URL}/providers/${p.slug}`,
        // Real official site only when known (Knowledge-Graph sameAs).
        ...(url ? { sameAs: [url] } : {}),
        categories: p.categories,
        planCount: p.planCount,
        minPrice: p.minPrice,
      };
    }),

    plans: plans.map((p) => ({
      id: p.id,
      category: p.cat,
      categoryName: CATEGORY_HE[p.cat] ?? p.cat,
      provider: p.provider,
      providerUrl: `${SITE_URL}/providers/${providerSlug(p.provider)}`,
      plan: p.plan,
      price: p.price,
      priceUnit: priceUnitLabel(p),
      priceAfterPromo: p.after,
      is5G: p.is5G,
      noCommit: p.noCommit,
      hasAbroad: p.hasAbroad,
      compareUrl: `${SITE_URL}/compare/${p.cat}`,
    })),
  };
}
