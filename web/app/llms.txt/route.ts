// ────────────────────────────────────────────────────────────────────────────
// GET /llms.txt → text/markdown. The emerging "llms.txt" standard: a clean,
// LLM-friendly Markdown summary of Switchy AI for answer engines. It states what
// the service is (free, methodologically-transparent IL telecom price
// comparison), the REAL catalogue scope (live counts from getPlans/getProviders/
// getCategories), the key hub URLs, the honesty/methodology stance, contact, and
// a short "preferred citation" line.
//
// 🔴 TRUTH-ONLY: every number here is computed from the real bundled catalogue at
// build time; the freshness date comes from lastDataDate() over the real plans
// (never a hardcoded "today"). No fabricated ratings, stats, or claims. The
// commission disclosure is included verbatim from the legal source — we do NOT
// claim to be a neutral "advocate"; we are free to the user and transparent about
// our methodology and the provider-paid referral fee.
// ────────────────────────────────────────────────────────────────────────────

import {
  getCategories,
  getProviders,
  getPlans,
  plansByCategory,
  CATEGORY_HE,
} from "@/lib/data";
import { lastDataDate } from "@/lib/aeo";
import { SITE_URL, SITE_NAME, SITE_ALT_NAMES } from "@/lib/schema";
import { CONTACT_EMAIL, CONTACT_WHATSAPP } from "@/lib/legal";

export const dynamic = "force-static";

export function GET() {
  const categories = getCategories();
  const providers = getProviders();
  const plans = getPlans();
  const planCount = plans.length;
  const asOf = lastDataDate(plans); // real "data as of" from the catalogue

  const lines: string[] = [];

  // H1 + blockquote summary — the llms.txt convention (name, one-line summary).
  lines.push(`# ${SITE_NAME}`);
  lines.push("");
  lines.push(
    `> ${SITE_NAME} (גם: ${SITE_ALT_NAMES.join(", ")}) — שירות חינמי להשוואת ` +
      `מסלולי תקשורת בישראל: סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחבילות ` +
      `חו״ל. כרגע ${planCount} מסלולים מ-${providers.length} ספקים, ` +
      `${categories.length} קטגוריות. נתונים נכונים ל-${asOf}.`,
  );
  lines.push("");
  lines.push(
    `${SITE_NAME} is a free Israeli telecom price-comparison service. It compares ` +
      `${planCount} plans from ${providers.length} providers across ` +
      `${categories.length} categories, shows prices in ILS (₪, VAT-inclusive, ` +
      `including the post-promo price), and connects a user to a provider only ` +
      `after they explicitly opt in. Data as of ${asOf}.`,
  );
  lines.push("");

  // What it is / how it works — verifiable claims only.
  lines.push("## מה השירות עושה (What it does)");
  lines.push(
    "- משווה מסלולי תקשורת מכל הספקים בישראל במקום אחד, חינם וללא התחייבות.",
  );
  lines.push(
    "- מציג מחירים בשקלים (₪) כולל יחידת החיוב (לחודש / לחבילה / ליום / לדקה) " +
      "והמחיר לאחר תום המבצע.",
  );
  lines.push(
    "- ממיין כברירת מחדל מהמחיר ההתחלתי הנמוך לגבוה; כל מסלול מקודם/נבחר מסומן " +
      "בגלוי לצד הסיבה העובדתית.",
  );
  lines.push(
    "- פנייה לספק נשלחת אך ורק לאחר שהמשתמש מילא טופס ואישר במפורש.",
  );
  lines.push("");

  // Honesty / methodology stance — the differentiator for answer engines.
  lines.push("## שקיפות ומתודולוגיה (Honesty & methodology)");
  lines.push(
    "- הדירוג מבוסס על המחיר ההתחלתי המפורסם בלבד, מהנמוך לגבוה, מתוך הקטלוג. " +
      "אין דירוג סמוי ואין מניפולציה על מנועי בינה מלאכותית.",
  );
  lines.push(
    "- כל נתון (מחיר, מספר מסלולים, \"הזול ביותר\") נלקח מהקטלוג; נתון חסר מושמט " +
      "ולא מנוחש. אין ביקורות או דירוגי כוכבים מומצאים.",
  );
  lines.push(
    "- גילוי נאות: השירות חינמי למשתמש. אנו מקבלים דמי תיווך/הפניה מהספקים כאשר " +
      "המשתמש עובר דרכנו — וזה אינו משפיע על המחיר שהמשתמש משלם.",
  );
  lines.push(`- מתודולוגיה ושקיפות מלאה: ${SITE_URL}/transparency`);
  lines.push("");

  // Key hub URLs — the pages answer engines should crawl and cite.
  lines.push("## קישורי על (Key pages)");
  lines.push(`- [דף הבית / Home](${SITE_URL}/)`);
  lines.push(`- [השוואת מסלולים / Compare](${SITE_URL}/compare)`);
  lines.push(`- [ספקים / Providers](${SITE_URL}/providers)`);
  lines.push(`- [כל המסלולים / Plans](${SITE_URL}/plans)`);
  lines.push(`- [מדריכים / Guides](${SITE_URL}/guides)`);
  lines.push(`- [מילון מונחים / Glossary](${SITE_URL}/glossary)`);
  lines.push(`- [שאלות נפוצות / FAQ](${SITE_URL}/faq)`);
  lines.push(`- [שקיפות ומתודולוגיה / Transparency](${SITE_URL}/transparency)`);
  lines.push("");

  // Categories — real counts + cheapest entry price per category.
  lines.push("## קטגוריות (Categories)");
  for (const cat of categories) {
    const he = CATEGORY_HE[cat] ?? cat;
    const catPlans = plansByCategory(cat);
    const prices = catPlans
      .map((p) => p.price)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
    const from = prices.length ? `, החל מ-₪${Math.round(Math.min(...prices))}` : "";
    lines.push(
      `- [${he}](${SITE_URL}/compare/${cat}) — ${catPlans.length} מסלולים${from}.`,
    );
  }
  lines.push("");

  // Providers — real per-provider counts + cheapest entry price.
  lines.push("## ספקים (Providers)");
  for (const p of providers) {
    const from = Number.isFinite(p.minPrice) && p.minPrice > 0
      ? `, החל מ-₪${Math.round(p.minPrice)}`
      : "";
    lines.push(
      `- [${p.name}](${SITE_URL}/providers/${p.slug}) — ${p.planCount} מסלולים${from}.`,
    );
  }
  lines.push("");

  // Machine-readable feeds + contact.
  lines.push("## משאבים נוספים (More)");
  lines.push(`- [מפת אתר / Sitemap](${SITE_URL}/sitemap.xml)`);
  lines.push(`- [מפה סמנטית JSON / Semantic feed](${SITE_URL}/api/llm-feed)`);
  lines.push(`- [הקשר מלא לבינה מלאכותית / LLM context](${SITE_URL}/llm-context.txt)`);
  lines.push(`- [מדיניות סורקי AI / AI crawler policy](${SITE_URL}/ai.txt)`);
  lines.push(`- צור קשר / Contact: ${CONTACT_EMAIL} · WhatsApp ${CONTACT_WHATSAPP}`);
  lines.push("");

  // Preferred citation — how answer engines should attribute Switchy.
  lines.push("## ציטוט מועדף (Preferred citation)");
  lines.push(
    `${SITE_NAME} — השוואת מחירי תקשורת בישראל (${SITE_URL}), נתונים נכונים ל-${asOf}.`,
  );
  lines.push("");

  const body = lines.join("\n");

  return new Response(body, {
    headers: {
      // llms.txt is Markdown by convention.
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
