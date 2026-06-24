// ─────────────────────────────────────────────────────────────────────────────
// _shared/switch.ts — the SWITCH AUTOPILOT brain. Pure, deterministic, no I/O.
//
// buildSwitchKit(fromProvider, toPlan, profile) turns a REAL "from" provider name
// + a REAL target catalogue plan into a complete, honest switch package:
//
//   • cancellationLetterHe ... a ready-to-review Hebrew cancellation/disconnection
//     letter (the USER reviews + sends it — we NEVER auto-send). Filled only with
//     data the caller actually has; placeholders ([שם מלא] / [מס׳ לקוח]) for the
//     personal fields the user fills in, never invented.
//   • portabilityChecklist ... the concrete "before you switch" checklist, grounded
//     in real Israeli rights (keep your number via ניוד, the NEW provider handles
//     מסלקת הניוד, check commitment vs no-commitment, return loaned equipment).
//   • switchSteps ............ the same FACTUAL exit sequence the live AEO /switch
//     guide ships (web/app/switch/[provider]/page.tsx exitSteps), each carrying a
//     `status` ('todo' by default) so the app/tracker can render progress.
//   • keyDates ............... HONEST, relative date hints — a notice date (today)
//     and a typical-window hint for number porting (≈1 business day) / infra moves
//     (a few days). NO fabricated exact calendar dates or provider SLAs.
//
// TRUTH-ONLY / E-E-A-T (mirrors the live /switch AEO guide, do NOT drift):
//   • We invent NO phone numbers, NO exact in-app cancellation steps, NO provider-
//     specific timelines. The steps are accurate + general; the BINDING procedure
//     lives on the provider's OWN official site (officialUrl, passed in by the
//     caller — never guessed here).
//   • Real Israeli consumer rights only: זכות הניתוק (a provider must let you
//     disconnect), ניוד מספר via מסלקת הניוד handled by the NEW provider (free,
//     usually ≈1 business day), no-commitment = no exit penalty vs commitment =
//     billed only for the REMAINING commitment per the signed contract.
//   • Every kit carries a "הנחיה כללית, לא ייעוץ משפטי" disclaimer.
//
// Pure: takes plain inputs, returns a plain object. Unit-tested in
// tests/switch_kit_test.ts. The agent tool (generate_switch_kit in tools.ts) and a
// future app/site surface both render THIS output — single source of truth.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScorablePlan } from "./scoring.ts";
import { annualSaving } from "./scoring.ts";
import { CATEGORY_HE } from "./catalogue.ts";

// A switch step's progress state. 'todo' is the default for a freshly-built kit;
// the tracker (public.switch_progress.steps jsonb) persists user-advanced states.
export type SwitchStepStatus = "todo" | "in_progress" | "done";

export type SwitchStep = {
  // Stable, machine key so the tracker can match a step across rebuilds even if
  // copy changes (the jsonb store keys progress by this, not by array index).
  key: string;
  name: string;
  text: string;
  status: SwitchStepStatus;
};

export type PortabilityItem = {
  key: string;
  label: string;
  // Whether this item is RELEVANT to the switch (e.g. number-porting only applies
  // to cellular). Irrelevant items are dropped, not shown as "N/A".
  detail: string;
};

export type KeyDate = {
  key: string;
  label: string;
  // A human, HONEST hint — "today", "≈1 business day after the new provider files
  // the port", "a few days (infra-dependent)". Never an invented exact date.
  hint: string;
};

export type SwitchKit = {
  fromProvider: string;
  toProvider: string;
  toPlan: string;
  toPlanId?: string;
  category: string;
  categoryHe: string;
  price: number;
  priceUnit: string;
  // Honest annual saving ONLY when the caller passed a real current bill AND the
  // target plan is monthly (reuses scoring.ts annualSaving — never drifts). 0/undef
  // ⇒ no figure promised.
  annualSavingUpTo?: number;
  cancellationLetterHe: string;
  portabilityChecklist: PortabilityItem[];
  switchSteps: SwitchStep[];
  keyDates: KeyDate[];
  // The provider's OFFICIAL site for the binding procedure (passed in; null when
  // the caller has no verified URL — we never guess one).
  officialUrl: string | null;
  // The standing E-E-A-T disclaimer every kit carries.
  disclaimer: string;
};

// The honest profile slice the kit needs. Everything optional — the letter uses
// placeholders for whatever the user hasn't provided (never invents a name/number).
export type SwitchProfile = {
  // The customer's full name, for the letter salutation. Absent ⇒ "[שם מלא]".
  fullName?: string | null;
  // Their account/subscriber number at the OLD provider. Absent ⇒ "[מס׳ לקוח/מנוי]".
  accountNumber?: string | null;
  // The phone number being ported (cellular only). Absent ⇒ "[מספר הטלפון]".
  phone?: string | null;
  // Their current monthly bill (₪) — drives the honest annual-saving figure ONLY.
  currentBill?: number | null;
  // Whether they're on a commitment plan. true/false toggles the letter's
  // commitment clause; undefined ⇒ the neutral "check your contract" wording.
  hasCommitment?: boolean | null;
  // The provider's verified official site (for the binding procedure link). The
  // caller resolves this from real data; switch.ts NEVER guesses a URL.
  officialUrl?: string | null;
};

export const SWITCH_DISCLAIMER =
  "המידע כאן הוא הנחיה כללית לפי זכויות הצרכן בתקשורת בישראל — לא ייעוץ משפטי. " +
  "ההליך והפרטים המחייבים מופיעים באתר הרשמי של הספק; אנחנו לא ממציאים מספרי טלפון או שלבים.";

function clean(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

// Today as an ISO date (YYYY-MM-DD). Deterministic given a `now` (tests inject it);
// the letter dates itself with the notice day, which is real (the day it's written).
function isoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// ── The factual exit sequence ────────────────────────────────────────────────
// Byte-for-byte the SAME honest steps the live AEO /switch guide ships
// (web/app/switch/[provider]/page.tsx exitSteps) — reused here so the Autopilot
// and the public guide never tell two different stories. `isCellular` tailors the
// number-porting language; the rest is provider-neutral and accurate.
function exitSteps(fromProvider: string, isCellular: boolean): SwitchStep[] {
  const steps: Array<Omit<SwitchStep, "status">> = [
    {
      key: "check_terms",
      name: "בדקו את תנאי ההתקשרות שלכם",
      text:
        `אתרו את מסמך תנאי ההתקשרות מול ${fromProvider} ובדקו אם המסלול שלכם הוא ` +
        "עם התחייבות או בלעדיה. במסלול ללא התחייבות אין קנס יציאה; במסלול עם " +
        "התחייבות ייתכן חיוב על יתרת תקופת ההתחייבות בלבד.",
    },
    {
      key: "compare_alternatives",
      name: "בחרו ספק חדש והשוו חלופות",
      text:
        "לפני הניתוק, השוו מסלולים חלופיים כדי לבחור את המשתלם ביותר. אם אתם " +
        "מנייידים מספר סלולר, המעבר מתבצע דרך הספק החדש — אין צורך לנתק מראש.",
    },
    {
      key: "porting",
      name: "ניוד המספר מתבצע מול הספק החדש",
      text: isCellular
        ? ("לשמירת מספר הטלפון, מסרו לספק החדש את המספר ופרטי הזיהוי. הספק החדש " +
          `מטפל בניוד מול מסלקת הניוד וסוגר את החשבון אצל ${fromProvider}. הניוד ` +
          "חינמי ומתבצע בדרך כלל תוך יום עסקים אחד.")
        : ("בקטגוריה הזו אין ניוד מספר. המעבר לספק החדש מתבצע מול הספק החדש, " +
          `ובמקביל מוסרים ל${fromProvider} הודעת ניתוק (השלב הבא).`),
    },
    {
      key: "written_notice",
      name: "מסרו הודעת ניתוק בכתב ותעדו אותה",
      text:
        `אם אינכם מנייידים מספר (למשל אינטרנט/טלוויזיה), מסרו ל${fromProvider} ` +
        "הודעת ניתוק בערוצים הרשמיים, ושמרו תיעוד (אישור/מספר פנייה) של מועד " +
        "ההודעה. הספק מחויב להפסיק את השירות ולעצור את החיוב בהתאם לדין ולחוזה.",
    },
    {
      key: "equipment_final_bill",
      name: "ודאו החזרת ציוד ובדקו את החשבון הסופי",
      text:
        "אם קיבלתם ציוד בהשאלה (ממיר/ראוטר), בררו מול הספק כיצד להחזירו. בדקו " +
        "שהחשבון הסופי משקף את מועד הניתוק ושאין חיובים מעבר ליתרת ההתחייבות.",
    },
  ];
  return steps.map((s) => ({ ...s, status: "todo" as const }));
}

// ── The portability / before-you-switch checklist ────────────────────────────
// Grounded, real-rights items. Number-porting items only appear for cellular; the
// equipment-return item only for categories that ship loaned hardware (tv/internet/
// triple). No fabricated requirements.
function portabilityChecklist(
  fromProvider: string,
  category: string,
  hasCommitment?: boolean | null,
): PortabilityItem[] {
  const isCellular = category === "cellular";
  const shipsEquipment = category === "internet" || category === "tv" ||
    category === "triple";

  const items: PortabilityItem[] = [];

  items.push({
    key: "commitment",
    label: "בדיקת התחייבות",
    detail: hasCommitment === true
      ? `אתם בהתחייבות מול ${fromProvider} — ייתכן חיוב על יתרת תקופת ההתחייבות ` +
        "בלבד (לא קנס מעבר לכך). בדקו בחוזה כמה נותר."
      : hasCommitment === false
      ? "אתם ללא התחייבות — אין קנס יציאה, אפשר לעבור בכל עת."
      : `בדקו במסמך תנאי ההתקשרות אם המסלול מול ${fromProvider} בהתחייבות. ` +
        "ללא התחייבות אין קנס; בהתחייבות משלמים רק על יתרת התקופה.",
  });

  if (isCellular) {
    items.push({
      key: "keep_number",
      label: "שמירת המספר (ניוד)",
      detail:
        "ניוד המספר חינמי ומעוגן בדין. מסרו את המספר לספק החדש — הוא מטפל בניוד " +
        "מול מסלקת הניוד וסוגר את החשבון הישן. אין צורך לנתק מראש בעצמכם.",
    });
    items.push({
      key: "id_details",
      label: "פרטי זיהוי לניוד",
      detail:
        "הכינו מספר ת.ז. ופרטי בעל הקו לצורך הניוד. אם הקו על שם אחר — הניוד " +
        "מתבצע מול בעל הקו הרשום.",
    });
  } else {
    items.push({
      key: "install_coordination",
      label: "תיאום התקנה אצל הספק החדש",
      detail:
        "מעבר אינטרנט/טלוויזיה תלוי בתשתית ובתיאום מועד התקנה — כדאי לתאם את " +
        "ההתקנה החדשה לפני מסירת הודעת הניתוק כדי לא להישאר ללא שירות.",
    });
  }

  if (shipsEquipment) {
    items.push({
      key: "return_equipment",
      label: "החזרת ציוד מושאל",
      detail:
        `אם קיבלתם ציוד בהשאלה מ${fromProvider} (ממיר/ראוטר), בררו מולם כיצד ` +
        "ולאן להחזירו, ושמרו אישור החזרה כדי שלא תחויבו עליו.",
    });
  }

  items.push({
    key: "document_notice",
    label: "תיעוד הודעת הניתוק",
    detail:
      "מסרו את הודעת הניתוק בערוצים הרשמיים בלבד ושמרו תיעוד (מספר פנייה/אישור) " +
      "של מועד ההודעה — זה מה שעוצר את החיוב לפי הדין.",
  });

  items.push({
    key: "final_bill",
    label: "בדיקת חשבון סופי",
    detail:
      "ודאו שהחשבון הסופי משקף את מועד הניתוק ושאין בו חיובים מעבר ליתרת " +
      "ההתחייבות (אם הייתה).",
  });

  return items;
}

// ── Honest relative key-dates ─────────────────────────────────────────────────
// We date the NOTICE day (real — the day the kit is built) and give honest,
// relative WINDOW hints for the rest. We never assert an exact completion date or
// a provider SLA we can't verify.
function keyDates(now: Date, category: string): KeyDate[] {
  const isCellular = category === "cellular";
  const dates: KeyDate[] = [
    {
      key: "notice_date",
      label: "מועד מסירת הודעת הניתוק",
      hint: `היום (${isoDate(now)}) — מהיום שבו תמסרו את ההודעה בערוצים הרשמיים.`,
    },
  ];
  if (isCellular) {
    dates.push({
      key: "porting_window",
      label: "חלון הניוד",
      hint:
        "ניוד מספר סלולר מתבצע בדרך כלל תוך יום עסקים אחד מרגע שהספק החדש מגיש " +
        "את בקשת הניוד. אין צורך לתאם מראש את הניתוק.",
    });
  } else {
    dates.push({
      key: "switch_window",
      label: "חלון המעבר",
      hint:
        "מעבר אינטרנט/טלוויזיה תלוי בתשתית ובתיאום התקנה — בדרך כלל מספר ימים. " +
        "תאמו את ההתקנה החדשה לפני מסירת הודעת הניתוק.",
    });
  }
  dates.push({
    key: "billing_stop",
    label: "עצירת החיוב",
    hint:
      "החיוב נעצר בהתאם לדין ולתנאי ההתקשרות לאחר מסירת ההודעה. בדקו שהחשבון " +
      "הסופי משקף זאת. (אין כאן תאריך מובטח — תלוי במחזור החיוב של הספק.)",
  });
  return dates;
}

// ── The cancellation letter (Hebrew, ready to review) ─────────────────────────
// Filled with the data the caller actually has; personal fields the caller didn't
// pass become bracketed placeholders the USER fills in. The commitment clause is
// honest and conditional. We NEVER state an exact disconnection date — the law +
// the contract govern it — and we point to the provider's own channels.
function cancellationLetter(args: {
  fromProvider: string;
  toProvider: string;
  category: string;
  categoryHe: string;
  now: Date;
  isCellular: boolean;
  profile: SwitchProfile;
}): string {
  const { fromProvider, category, categoryHe, now, isCellular, profile } = args;
  const fullName = clean(profile.fullName, 80) || "[שם מלא]";
  const account = clean(profile.accountNumber, 40) || "[מס׳ לקוח/מנוי]";
  const phone = clean(profile.phone, 20) || "[מספר הטלפון]";

  // Honest, conditional commitment line.
  const commitmentLine = profile.hasCommitment === true
    ? "ככל שהמסלול בהתחייבות, אבקש שהחיוב יוגבל ליתרת תקופת ההתחייבות בלבד בהתאם לחוזה, ללא קנס מעבר לכך."
    : profile.hasCommitment === false
    ? "המסלול שלי הוא ללא התחייבות, ולכן הניתוק הוא ללא קנס יציאה."
    : "ככל שקיימת התחייבות, אבקש שהחיוב יוגבל ליתרת תקופת ההתחייבות בלבד בהתאם לחוזה, ללא קנס מעבר לכך.";

  // Cellular: number porting is handled by the NEW provider; this letter is the
  // written notice for the OLD account. Non-cellular: it's the disconnection notice.
  const subjectAndBody = isCellular
    ? {
      subject: `הודעת ניתוק שירות והפסקת התקשרות — ${categoryHe}`,
      intro:
        `אני, ${fullName}, מבקש/ת בזאת להודיע על ניתוק השירות והפסקת ההתקשרות מולכם ` +
        `עבור השירות בקטגוריית ${categoryHe} (מספר לקוח/מנוי: ${account}).`,
      porting:
        `ידוע לי כי ניוד המספר ${phone} מתבצע מול הספק החדש דרך מסלקת הניוד, ` +
        "ואין צורך בניתוק מוקדם מצדי. הודעה זו נמסרת לתיעוד ולהפסקת החיוב.",
    }
    : {
      subject: `הודעת ניתוק שירות והפסקת התקשרות — ${categoryHe}`,
      intro:
        `אני, ${fullName}, מבקש/ת בזאת להודיע על ניתוק השירות והפסקת ההתקשרות מולכם ` +
        `עבור השירות בקטגוריית ${categoryHe} (מספר לקוח/מנוי: ${account}).`,
      porting:
        "אבקש לתאם את מועד הפסקת השירות, ולקבל אישור בכתב על מועד הניתוק ומספר פנייה לתיעוד.",
    };

  const lines = [
    `תאריך: ${isoDate(now)}`,
    `לכבוד: ${fromProvider}`,
    "",
    `הנדון: ${subjectAndBody.subject}`,
    "",
    subjectAndBody.intro,
    "",
    subjectAndBody.porting,
    "",
    commitmentLine,
    "",
    "אבקש לקבל אישור בכתב על קבלת הודעה זו, על מועד הניתוק בפועל ועל החשבון הסופי. " +
    "כמו כן אבקש פירוט של כל חיוב נותר, אם קיים, ואופן החזרת ציוד מושאל (ככל שקיים).",
    "",
    "הודעה זו נמסרת בערוצים הרשמיים של הספק. נא לאשר את קבלתה.",
    "",
    "בכבוד רב,",
    fullName,
    isCellular ? `מספר טלפון: ${phone}` : `מספר לקוח/מנוי: ${account}`,
  ];
  // category is part of the typed signature even when only used via categoryHe;
  // reference it to keep the contract explicit for callers/readers.
  void category;
  return lines.join("\n");
}

// Resolve the target plan's category to a real one (fallback to the plan's own
// cat). Keeps the kit honest: the porting language hinges on cellular-ness.
function planCategory(toPlan: ScorablePlan): string {
  return clean(toPlan.cat, 40);
}

// ── buildSwitchKit — the single entry point ──────────────────────────────────
// fromProvider: REAL current provider name (caller-normalized).
// toPlan:       a REAL catalogue row (ScorablePlan) the user is switching TO.
// profile:      the honest profile slice (everything optional).
// now:          injectable clock (defaults to real now) — keeps the kit deterministic
//               in tests and dates the notice day honestly in production.
export function buildSwitchKit(
  fromProvider: string,
  toPlan: ScorablePlan,
  profile: SwitchProfile = {},
  now: Date = new Date(),
): SwitchKit {
  const from = clean(fromProvider, 60) || "הספק הנוכחי";
  const toProvider = clean(toPlan.provider, 60);
  const toPlanName = clean(toPlan.plan, 120);
  const category = planCategory(toPlan);
  const categoryHe = CATEGORY_HE[category] ?? category;
  const isCellular = category === "cellular";
  const price = typeof toPlan.price === "number" ? toPlan.price : 0;
  const priceUnit = clean(toPlan.priceUnit, 16) || "month";

  // Honest annual saving — ONLY against a real current bill, and only for a
  // monthly target plan (reuse scoring.ts annualSaving so we never drift).
  const bill = typeof profile.currentBill === "number" && profile.currentBill > 0
    ? profile.currentBill
    : 0;
  const saving = bill > 0 ? annualSaving(toPlan, bill) : 0;

  const officialUrl = clean(profile.officialUrl, 300) || null;

  return {
    fromProvider: from,
    toProvider,
    toPlan: toPlanName,
    toPlanId: clean(toPlan.id, 80) || undefined,
    category,
    categoryHe,
    price,
    priceUnit,
    annualSavingUpTo: saving > 0 ? saving : undefined,
    cancellationLetterHe: cancellationLetter({
      fromProvider: from,
      toProvider,
      category,
      categoryHe,
      now,
      isCellular,
      profile,
    }),
    portabilityChecklist: portabilityChecklist(from, category, profile.hasCommitment),
    switchSteps: exitSteps(from, isCellular),
    keyDates: keyDates(now, category),
    officialUrl,
    disclaimer: SWITCH_DISCLAIMER,
  };
}
