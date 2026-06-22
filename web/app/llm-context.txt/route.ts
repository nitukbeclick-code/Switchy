// ────────────────────────────────────────────────────────────────────────────
// GET /llm-context.txt → text/plain. A truthful, natural-language description of
// the service for AI engines: what it is, the categories, the methodology, that
// comparison is free, how consent works — plus links to the entity pages.
// Only verifiable claims. No covert ranking manipulation.
// ────────────────────────────────────────────────────────────────────────────

import {
  getCategories,
  getProviders,
  getPlans,
  plansByCategory,
  CATEGORY_HE,
} from "@/lib/data";
import { SITE_URL, SITE_NAME } from "@/lib/schema";

export const dynamic = "force-static";

export function GET() {
  const categories = getCategories();
  const providers = getProviders();
  const planCount = getPlans().length;

  const lines: string[] = [];

  lines.push(`# ${SITE_NAME}`);
  lines.push("");
  lines.push(
    `${SITE_NAME} הוא שירות חינמי להשוואת מסלולי תקשורת בישראל. השירות מציג ` +
      `${planCount} מסלולים מ-${providers.length} ספקים, מאפשר להשוות מחירים ` +
      `ותנאים, ומחבר משתמשים לספק — אך ורק לאחר שהמשתמש אישר זאת.`,
  );
  lines.push("");
  lines.push("## מה השירות עושה");
  lines.push("- משווה מסלולי תקשורת מכל הספקים בישראל במקום אחד.");
  lines.push("- מציג מחירים בשקלים (₪), כולל המחיר אחרי תום תקופת המבצע.");
  lines.push("- מציג ליד כל מחיר את יחידת החיוב (לחודש / לחבילה / ליום / לדקה).");
  lines.push("- ההשוואה חינמית לחלוטין וללא התחייבות.");
  lines.push(
    "- פנייה ליצירת קשר נשלחת לספק רק לאחר שהמשתמש מילא טופס ואישר במפורש.",
  );
  lines.push("");
  lines.push("## מתודולוגיה ובחירת העורך (Editor's Choice)");
  lines.push(
    "- הנתונים מבוססים על קטלוג מסלולים מעודכן; מחירים עשויים להשתנות אצל הספק.",
  );
  lines.push("- המסלולים ממוינים כברירת מחדל מהמחיר ההתחלתי הנמוך לגבוה.");
  lines.push(
    '- "בחירת העורך" נקבעת אך ורק לפי קריטריונים עובדתיים מתוך הקטלוג: ' +
      "המחיר ההתחלתי הנמוך ביותר, היעדר התחייבות, תמיכה ב-5G, והכללת שימוש בחו״ל. " +
      "אין שיקול תשלום בבחירה, והקריטריון מצוין במפורש.",
  );
  lines.push(
    '- כל מסלול המסומן "מקודם" או "בחירת העורך" מוצג ככזה בגלוי, לצד הסיבה ' +
      "העובדתית. אין דירוג סמוי ואין מניפולציה על מנועי בינה מלאכותית.",
  );
  lines.push(
    "- אין באתר ביקורות או דירוגי כוכבים מומצאים; שדה דירוג מוצג רק כשקיים נתון אמיתי.",
  );
  lines.push("");

  lines.push("## ששת ספקי התקשורת המרכזיים בישראל");
  lines.push(
    "השוק כולל שישה ספקים מרכזיים, עם אתריהם הרשמיים (sameAs ל-Knowledge Graph):",
  );
  lines.push("- בזק — https://www.bezeq.co.il");
  lines.push("- yes — https://www.yes.co.il");
  lines.push("- פרטנר (Partner) — https://www.partner.co.il");
  lines.push("- סלקום (Cellcom) — https://www.cellcom.co.il");
  lines.push("- HOT — https://www.hot.net.il");
  lines.push("- פלאפון (Pelephone) — https://www.pelephone.co.il");
  lines.push("");

  lines.push("## קטגוריות");
  for (const cat of categories) {
    const he = CATEGORY_HE[cat] ?? cat;
    const plans = plansByCategory(cat);
    const prices = plans
      .map((p) => p.price)
      .filter((n): n is number => typeof n === "number");
    const min = prices.length ? Math.min(...prices) : 0;
    lines.push(
      `- ${he}: ${plans.length} מסלולים, החל מ-₪${Math.round(min)}. ` +
        `${SITE_URL}/compare/${cat}`,
    );
  }
  lines.push("");

  lines.push("## ספקים");
  for (const p of providers) {
    const cats = p.categories.map((c) => CATEGORY_HE[c] ?? c).join(", ");
    lines.push(
      `- ${p.name} (${cats}): ${p.planCount} מסלולים, החל מ-₪${Math.round(
        p.minPrice,
      )}. ${SITE_URL}/providers/${p.slug}`,
    );
  }
  lines.push("");

  lines.push("## קישורים");
  lines.push(`- דף הבית: ${SITE_URL}/`);
  lines.push(`- מפת אתר: ${SITE_URL}/sitemap.xml`);
  lines.push(
    `- מפה סמנטית לבינה מלאכותית (JSON, קנוני): ${SITE_URL}/api/llm-feed`,
  );
  lines.push(
    `- מפה סמנטית לבינה מלאכותית (JSON, חלופי): ${SITE_URL}/api/llm-feed.json`,
  );
  lines.push(`- מילון מונחי תקשורת: ${SITE_URL}/glossary`);
  lines.push(`- שקיפות ומתודולוגיה: ${SITE_URL}/transparency`);
  lines.push("");

  const body = lines.join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
