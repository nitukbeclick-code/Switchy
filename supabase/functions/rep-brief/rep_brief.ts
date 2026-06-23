// rep-brief — pure logic for the Phone-Rep AI Call-Brief.
//
// Given ONE lead (the row the team works in the Telegram/CRM pipeline) this
// builds a concise Hebrew CALL-BRIEF the human phone rep reads before dialling:
//   1) the customer's stated need (category / budget / current provider), parsed
//      from the lead's own fields + free-text notes,
//   2) the 2-3 best-matching REAL plans from the catalogue (grounded in the
//      bundled snapshot via the shared pickCandidates/buildSuggestions — never
//      invented),
//   3) suggested talking points + likely objections with honest answers,
//   4) COMPLIANCE reminders the rep MUST say on the call:
//        • §7b — commission disclosure (we earn a referral fee; it does NOT
//          change the price the customer pays),
//        • §30A (Spam Law) — get explicit consent before ANY future marketing
//          contact (SMS / email / WhatsApp).
//
// EVERYTHING here is PURE (no network, no env, no Deno.serve) so it unit-tests
// without booting the server — index.ts owns auth + the service-role DB read and
// the optional AI narrative. The plan FACTS always come from these functions, so
// the AI layer can only ever rephrase REAL, cited rows (E-E-A-T honesty).

import {
  buildSuggestions,
  CATEGORY_HE,
  normalizeCategory,
  normalizeProvider,
  parseAdvisorHints,
  pickCandidates,
  type Plan,
  type Suggestion,
} from "../_shared/catalogue.ts";

// The minimal lead shape this brief needs. Mirrors public.leads (see schema.sql)
// but only the rep-relevant columns — index.ts selects exactly these.
export type BriefLead = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  provider?: string | null; // current/desired provider (free text)
  plan_id?: string | null;
  source?: string | null; // form / plan / compare / advisor / callback / porting / renewal / whatsapp
  callback_time?: string | null; // now / noon / evening / tomorrow
  notes?: string | null; // free-text context for the rep (may carry category/budget cues)
  status?: string | null; // new / contacted / won / lost
  // Per-channel marketing consent (OPTIONAL opt-ins; default OFF). When all are
  // false/absent the rep must NOT pitch future marketing without fresh consent.
  consent_marketing_sms?: boolean | null;
  consent_marketing_email?: boolean | null;
  consent_marketing_whatsapp?: boolean | null;
};

// What we parsed out of the lead's fields + notes — the "stated need".
export type ParsedNeed = {
  category: string; // '' when we couldn't tell
  categoryHe: string; // Hebrew label, or 'לא צויין'
  budget: number; // 0 when none stated
  provider: string; // normalized current/desired provider, '' when none
  abroad: boolean; // the customer flagged abroad/roaming interest
};

const CALLBACK_HE: Record<string, string> = {
  now: "עכשיו",
  noon: "בצהריים",
  evening: "בערב",
  tomorrow: "מחר",
};

const SOURCE_HE: Record<string, string> = {
  form: "טופס יצירת קשר",
  plan: "דף מסלול",
  compare: "השוואת מסלולים",
  advisor: "יועץ AI",
  callback: "בקשת התקשרות",
  porting: "ניוד",
  renewal: "חידוש/תום התחייבות",
  whatsapp: "וואטסאפ",
};

function s(v: unknown): string {
  return String(v ?? "").trim();
}

// Lead-specific budget extraction. parseAdvisorHints already finds a budget when
// there's an explicit ₪/שקל/"עד" cue, but leads phrase their CURRENT spend in
// ways it misses — "משלם 80 בחודש", "החשבון שלי 80 ש\"ח". We recognise those here
// (in OUR code, not the shared parser) so the rep gets the number when it's
// stated. Returns 0 when no plausible monthly figure (10–5000 ₪) is found. The
// shared parser stays authoritative: buildNeed prefers ITS result and only falls
// back to this.
function extractBudget(text: string): number {
  const t = (text ?? "").toLowerCase();
  // A 2-4 digit number tied to a spend/price cue: "משלם/משלמת/החשבון/עולה ... N",
  // or "N ש\"ח / שקל / ₪ / בחודש".
  const cued =
    t.match(/(?:משלם[ת]?|החשבון|עולה|עלות|בערך|כ-?|עד|תקציב|מחיר)[^0-9]{0,12}(\d{2,4})/) ??
    t.match(/(\d{2,4})\s*(?:₪|ש["׳']?ח|שקל[ים]?|לחודש|בחודש)/);
  const n = Number((cued?.[1] ?? "").replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n >= 10 && n <= 5000 ? n : 0;
}

// Money/short label for a plan price + unit (mirrors catalogue unitLabel intent
// without re-exporting a private helper).
function unit(u?: string): string {
  return u === "package" ? "לחבילה" : u === "day" ? "ליום" : u === "minute" ? "לדקה" : "לחודש";
}

// ── 1) Parse the stated need ─────────────────────────────────────────────────
// The lead carries structured-ish hints in three places: an explicit `provider`
// field, a `notes` free-text blob (the site/app stuff the category, desired
// budget, and the user's ask in here), and sometimes a category word in either.
// We fold them into a single ParsedNeed using the SAME shared parsers the
// WhatsApp advisor uses, so the rep brief and the bot can never drift on what a
// lead "wants". providers is the catalogue's known-provider list (for
// normalizeProvider); pass [] to skip provider normalization.
export function parseNeed(lead: BriefLead, providers: string[] = []): ParsedNeed {
  const notes = s(lead.notes);
  const providerRaw = s(lead.provider);
  // parseAdvisorHints reads category/budget/abroad out of free text; run it over
  // the notes (richest) and fall back to the provider/plan_id blob for category.
  const blob = `${notes} ${providerRaw} ${s(lead.plan_id)}`.trim();
  const hints = parseAdvisorHints(blob);
  const category = hints.category || normalizeCategory(blob) || "";
  const provider = providers.length ? normalizeProvider(providerRaw, providers) : "";
  // Shared parser is authoritative; fall back to our lead-phrasing extractor.
  const budget = (hints.budget && hints.budget > 0) ? hints.budget : extractBudget(blob);
  return {
    category,
    categoryHe: category ? (CATEGORY_HE[category] ?? category) : "לא צויין",
    budget: budget > 0 ? budget : 0,
    provider: provider || providerRaw, // keep the raw text if it isn't a known brand
    abroad: hints.abroad === true,
  };
}

// ── 2) Best-matching REAL plans ──────────────────────────────────────────────
// Two grounding strategies, both over REAL catalogue rows:
//  • when we know the customer's budget → buildSuggestions: cheaper same-category
//    plans with a concrete annual-saving figure (honest: (spend-price)*12 ≥ 0),
//  • otherwise → pickCandidates: the cheapest regular plans in the category
//    (optionally abroad-capable), with annualSaving omitted (we won't invent a
//    saving without a stated current spend).
// Returns at most `max` rows; never fabricates a plan, price, or saving.
export type BriefPlan = {
  provider: string;
  name: string;
  price: number;
  unitLabel: string;
  annualSaving: number; // 0 when no budget was stated (we don't guess)
  abroad: boolean;
  is5G: boolean;
  noCommit: boolean;
};

function planToBrief(p: Plan, annualSaving = 0): BriefPlan {
  return {
    provider: s(p.provider),
    name: s(p.plan),
    price: typeof p.price === "number" ? p.price : 0,
    unitLabel: unit(p.priceUnit),
    annualSaving: annualSaving > 0 ? annualSaving : 0,
    abroad: p.hasAbroad === true,
    is5G: p.is5G === true,
    noCommit: p.noCommit === true,
  };
}

export function bestPlans(plans: Plan[], need: ParsedNeed, max = 3): BriefPlan[] {
  if (!need.category) {
    // No category → nothing honest to recommend; the rep should ask on the call.
    return [];
  }
  // Budget known → savings-aware suggestions (carry the real annual-saving).
  if (need.budget > 0) {
    const sugg: Suggestion[] = buildSuggestions(plans, need.category, need.budget, max);
    if (sugg.length) {
      // Re-hydrate each suggestion against the catalogue row so we can show the
      // unit/5G/abroad flags too (buildSuggestions returns a lean shape).
      return sugg.map((su) => {
        const row = plans.find(
          (p) => s(p.plan) === su.name && s(p.provider) === su.provider && p.price === su.price,
        );
        const brief = row
          ? planToBrief(row, su.annualSaving)
          : {
            provider: su.provider,
            name: su.name,
            price: su.price,
            unitLabel: "לחודש",
            annualSaving: su.annualSaving,
            abroad: false,
            is5G: false,
            noCommit: false,
          };
        return brief;
      });
    }
    // Budget stated but nothing cheaper found → fall through to plain candidates
    // (the rep should know the customer is already on a good price).
  }
  // No budget (or no cheaper option) → cheapest real candidates in the category.
  const cands = pickCandidates(plans, {
    category: need.category,
    budget: need.budget || undefined,
    abroad: need.abroad || undefined,
  }, max);
  return cands.map((p) => planToBrief(p, 0));
}

// ── 3) Talking points + objections ───────────────────────────────────────────

export type Objection = { objection: string; answer: string };

// Likely objections + HONEST answers, lightly tailored to what we parsed. These
// are deterministic so the rep always gets solid, compliant phrasing — never an
// over-promise. The "price after the promo" caveat is included whenever we have a
// recommendation (kamaze-parity honesty).
export function objections(need: ParsedNeed, hasPlans: boolean): Objection[] {
  const out: Objection[] = [
    {
      objection: "אני באמצע התחייבות / קנס יציאה.",
      answer:
        "נבדוק יחד אם נשארו חודשים להתחייבות ומה גובה הקנס מול החיסכון החודשי — לרוב החיסכון מכסה את הקנס תוך חודשים ספורים. אם לא משתלם, נמתין לתום ההתחייבות ונשמור לך תזכורת.",
    },
    {
      objection: "אני מרוצה מהספק הנוכחי / חבל לי על הטרחה.",
      answer:
        "המעבר עצמו הוא ניוד פשוט שאנחנו מלווים מקצה לקצה, המספר נשאר אותו דבר. נשווה רק מספרים — אם לא חוסכים בפועל, אין סיבה לעבור.",
    },
    {
      objection: "המחיר הזה נשמע טוב מדי — מה הקאצ'?",
      answer:
        "המחיר שאני מציג הוא מחיר אמיתי מהמסלול בפועל. חשוב שתדע: בחלק מהמסלולים יש מחיר מבצע לשנה ואז עלייה — אני אגיד לך מראש מה המחיר אחרי המבצע, בלי הפתעות.",
    },
  ];
  if (need.abroad) {
    out.push({
      objection: "אני צריך גלישה בחו\"ל / נוסע הרבה.",
      answer:
        "נסנן רק מסלולים שכוללים חבילת חו\"ל או eSIM מתאימה, ונוודא שהנפח והיעדים מתאימים לנסיעות שלך לפני שממליצים.",
    });
  }
  if (!hasPlans) {
    out.push({
      objection: "מה בדיוק אתם מציעים לי?",
      answer:
        "כדי לדייק לך מסלול אמיתי וזול יותר, אשאל כמה שאלות קצרות: איזה שירות (סלולר/אינטרנט/טלוויזיה), כמה אתה משלם היום, וכמה נפח/מהירות אתה צריך.",
    });
  }
  return out;
}

// Suggested talking points — an opener tailored to the lead's source + need, and
// a couple of guiding lines. Always Hebrew, warm and honest.
export function talkingPoints(lead: BriefLead, need: ParsedNeed, plans: BriefPlan[]): string[] {
  const first = s(lead.name).split(/\s+/)[0] || "";
  const sourceHe = SOURCE_HE[s(lead.source)] ?? "";
  const points: string[] = [];
  points.push(
    `פתיחה: "היי${first ? " " + first : ""}, כאן חוסך${sourceHe ? ` — קיבלנו את הפנייה שלך מ${sourceHe}` : ""}. מתי נוח לך לדבר דקה?"`,
  );
  if (need.category) {
    points.push(
      `מקד/י את השיחה ב${need.categoryHe}${need.provider ? ` — הלקוח אצל ${need.provider} כיום` : ""}.`,
    );
  } else {
    points.push("ברר/י קודם איזה שירות מעניין את הלקוח (סלולר/אינטרנט/טלוויזיה/חבילה/חו\"ל) — לא צוין בפנייה.");
  }
  if (need.budget > 0) {
    points.push(`הלקוח ציין תקציב/חשבון נוכחי בסביבות ₪${need.budget} — אמת/י את הסכום בפועל לפני שמציעים.`);
  } else {
    points.push("שאל/י כמה הלקוח משלם היום — בלי זה אי אפשר לכמת חיסכון אמיתי.");
  }
  if (plans.length) {
    const top = plans[0];
    points.push(
      `הצע/י קודם את ${top.provider} ${top.name} (₪${top.price} ${top.unitLabel})${
        top.annualSaving > 0 ? ` — חיסכון משוער של כ-₪${top.annualSaving} בשנה` : ""
      }, ואז הצג/י חלופה אחת או שתיים.`,
    );
  }
  points.push("סגירה: סכמ/י את הצעד הבא (ניוד/חתימה) ותאם/י זמן המשך מדויק.");
  return points;
}

// ── 4) Compliance reminders (rep MUST say these) ─────────────────────────────
// §7b — commission disclosure: we earn a referral fee from the provider; it does
// NOT change the price the customer pays. §30A (Spam Law) — explicit consent is
// required BEFORE any future marketing contact. These are NON-NEGOTIABLE on every
// call, so they're always present regardless of the lead.
export type ComplianceReminder = { law: string; mustSay: string };

export function complianceReminders(lead: BriefLead): ComplianceReminder[] {
  const sms = lead.consent_marketing_sms === true;
  const email = lead.consent_marketing_email === true;
  const wa = lead.consent_marketing_whatsapp === true;
  const channels = [sms && "SMS", email && "אימייל", wa && "וואטסאפ"].filter(Boolean) as string[];
  const consentLine = channels.length
    ? `הלקוח כבר אישר דיוור ב: ${channels.join(", ")}. כל ערוץ אחר — חובה לקבל אישור מפורש לפני שליחה.`
    : "הלקוח לא אישר דיוור שיווקי. אסור לשלוח SMS/אימייל/וואטסאפ שיווקי בלי לקבל ממנו אישור מפורש בשיחה (וצריך לתעד את ההסכמה).";
  return [
    {
      law: "גילוי עמלה (§7ב לחוק הגנת הצרכן)",
      mustSay:
        "חובה לומר ללקוח בשקיפות: \"אנחנו מקבלים עמלת תיווך מהספק על המעבר — זה לא מייקר לך את המחיר, אתה משלם בדיוק את מחיר המסלול.\"",
    },
    {
      law: "הסכמה לדיוור (§30א לחוק התקשורת — ספאם)",
      mustSay: consentLine,
    },
  ];
}

// ── Assemble the full structured brief (the API payload) ─────────────────────
export type RepBrief = {
  lead: { id: string; name: string; phone: string; callbackHe: string | null; sourceHe: string | null; status: string };
  need: ParsedNeed;
  plans: BriefPlan[];
  talkingPoints: string[];
  objections: Objection[];
  compliance: ComplianceReminder[];
  // A plain-text Hebrew brief the rep can read top-to-bottom (also the grounding
  // for the optional AI narrative). Always populated, even when AI is off.
  text: string;
};

export function buildBrief(lead: BriefLead, plans: Plan[], providers: string[] = []): RepBrief {
  const need = parseNeed(lead, providers);
  const briefPlans = bestPlans(plans, need, 3);
  const points = talkingPoints(lead, need, briefPlans);
  const objs = objections(need, briefPlans.length > 0);
  const compliance = complianceReminders(lead);
  const callbackHe = lead.callback_time ? (CALLBACK_HE[s(lead.callback_time)] ?? s(lead.callback_time)) : null;
  const sourceHe = lead.source ? (SOURCE_HE[s(lead.source)] ?? s(lead.source)) : null;

  return {
    lead: {
      id: s(lead.id),
      name: s(lead.name),
      phone: s(lead.phone),
      callbackHe,
      sourceHe,
      status: s(lead.status) || "new",
    },
    need,
    plans: briefPlans,
    talkingPoints: points,
    objections: objs,
    compliance,
    text: renderText(lead, need, briefPlans, points, objs, compliance, callbackHe, sourceHe),
  };
}

// Deterministic, copy-paste-ready Hebrew brief (RTL). This is the SOURCE OF
// TRUTH for the plan facts; the AI narrative (when enabled) only rephrases it.
function renderText(
  lead: BriefLead,
  need: ParsedNeed,
  plans: BriefPlan[],
  points: string[],
  objs: Objection[],
  compliance: ComplianceReminder[],
  callbackHe: string | null,
  sourceHe: string | null,
): string {
  const L: string[] = [];
  const name = s(lead.name) || "ללא שם";
  L.push(`תדריך שיחה — ${name}`);
  if (lead.phone) L.push(`טלפון: ${s(lead.phone)}`);
  L.push(
    `מקור: ${sourceHe ?? "—"}${callbackHe ? ` | זמן חזרה מועדף: ${callbackHe}` : ""}`,
  );
  L.push("");
  L.push("הצורך של הלקוח:");
  L.push(`• שירות מבוקש: ${need.categoryHe}`);
  L.push(`• ספק נוכחי/מבוקש: ${need.provider || "לא צוין"}`);
  L.push(`• תקציב/חשבון נוכחי: ${need.budget > 0 ? `כ-₪${need.budget}` : "לא צוין — לברר בשיחה"}`);
  if (need.abroad) L.push("• מתעניין בגלישה בחו\"ל / נסיעות");
  if (s(lead.notes)) L.push(`• מהפנייה: ${s(lead.notes).slice(0, 400)}`);
  L.push("");
  if (plans.length) {
    L.push("מסלולים אמיתיים מומלצים (מהקטלוג):");
    plans.forEach((p, i) => {
      const flags = [p.is5G && "5G", p.noCommit && "ללא התחייבות", p.abroad && "כולל חו\"ל"]
        .filter(Boolean).join(", ");
      const save = p.annualSaving > 0 ? ` — חיסכון משוער ₪${p.annualSaving}/שנה` : "";
      L.push(`${i + 1}. ${p.provider} | ${p.name} | ₪${p.price} ${p.unitLabel}${save}${flags ? ` | ${flags}` : ""}`);
    });
    L.push("הערה: ציין/י ללקוח אם יש מחיר \"אחרי המבצע\" — בלי הפתעות.");
  } else {
    L.push("מסלולים מומלצים: לא ניתן לדייק עדיין — חסר שירות/תקציב. ברר/י בשיחה ואז הצע/י מהקטלוג.");
  }
  L.push("");
  L.push("נקודות לשיחה:");
  for (const p of points) L.push(`• ${p}`);
  L.push("");
  L.push("התנגדויות צפויות ותשובות כנות:");
  for (const o of objs) {
    L.push(`• "${o.objection}"`);
    L.push(`  → ${o.answer}`);
  }
  L.push("");
  L.push("חובה לומר בשיחה (רגולציה):");
  for (const c of compliance) {
    L.push(`• ${c.law}: ${c.mustSay}`);
  }
  return L.join("\n");
}

// ── AI narrative system prompt (grounded) ────────────────────────────────────
// The optional AI step ONLY rephrases the deterministic brief above into a
// smoother rep-facing narrative. It is grounded HARD: it must not add any plan,
// price, provider or saving that isn't already in the brief, and it must keep the
// two compliance reminders verbatim-in-meaning. The plan facts never come from
// the model — they come from buildBrief. This keeps the brief honest (E-E-A-T)
// even if the model would otherwise embellish.
export const AI_SYSTEM_PROMPT =
  `את/ה עוזר/ת פנימי/ת של "חוסך" (Switch AI) שמכין/ה תדריך שיחה לנציג טלפוני אנושי (לא ללקוח).
כללים מחייבים:
- כתוב/י בעברית בלבד, בהיר וקצר, בטון מקצועי לנציג.
- התבסס/י אך ורק על נתוני התדריך שמסופקים לך. אסור להוסיף, להמציא או לשנות שום ספק, מסלול, מחיר או סכום חיסכון שלא מופיע בתדריך.
- שמר/י על מבנה ברור: הצורך של הלקוח, המסלולים המומלצים (עם המחירים בדיוק כפי שהופיעו), נקודות לשיחה, התנגדויות ותשובות, ובסוף — שתי תזכורות הרגולציה (גילוי עמלה §7ב + הסכמה לדיוור §30א) בלי להחסיר.
- אסור להבטיח סכום חיסכון מדויק שלא נמסר לך. אם לא צוין תקציב — כתוב/י לנציג לברר אותו בשיחה.
- החזר/י אך ורק את התדריך הסופי, בלי הקדמות, בלי תיאור תהליך, ובלי טקסט באנגלית.`;

// The user-message payload for the AI step: the deterministic brief text, framed
// as the ground truth to rephrase.
export function aiUserMessage(brief: RepBrief): string {
  return `הנה התדריך הגולמי. נסח/י אותו מחדש לנציג בצורה זורמת וברורה, בלי לשנות אף עובדה, מחיר או סכום:\n\n${brief.text}`;
}
