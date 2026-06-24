// ────────────────────────────────────────────────────────────────────────────
// Switch Kit (WEB mirror of supabase/functions/_shared/switch.ts) — the PURE,
// build-time, node-free builder behind the web "ערכת מעבר" (Switch Autopilot).
//
// The user picks their CURRENT provider + a TARGET plan from the real catalogue,
// and this module assembles a personalised switch packet that is BYTE-COMPATIBLE
// with the edge brain (`_shared/switch.ts buildSwitchKit`):
//   • cancellationLetterHe ... a ready-to-review Hebrew cancellation/disconnection
//     letter (the USER reviews + sends it — we NEVER auto-send).
//   • portabilityChecklist ... the "before you switch" checklist (real rights).
//   • switchSteps ............ the SAME factual exit sequence the live AEO
//     /switch/[provider] guide ships, each with a `status` ('todo' default) so the
//     tracker can persist + render progress — keyed by a stable `key`.
//   • keyDates ............... honest, relative date hints (notice day = today; a
//     typical window for porting/infra). NO fabricated exact dates or SLAs.
//
// WHY a web copy: the edge brain is Deno/`.ts`-import (`./scoring.ts`) and can't be
// imported from the Next build. This module is the WEB single-source-of-truth that
// renders the SAME packet from the bundled catalogue. The step keys + framing are
// kept identical to `_shared/switch.ts` so the agent, the edge tool, the tracker
// jsonb store (public.switch_progress.steps), and this page never drift.
//
// TRUTH-ONLY / E-E-A-T (ABSOLUTE — mirrors the live /switch AEO guide, do NOT drift):
//   • We invent NO phone numbers, NO exact in-app cancellation steps, NO provider-
//     specific timelines. Every step is accurate + GENERAL; the BINDING procedure
//     lives on the provider's OWN official site (`officialUrl`, passed in — never
//     guessed here).
//   • Real Israeli consumer rights only: זכות הניתוק; ניוד מספר via מסלקת הניוד,
//     handled by the NEW provider (free, ≈1 business day); no-commitment = no exit
//     penalty vs commitment = billed only for the REMAINING commitment.
//   • The target plan / price / provider / (optional) annual saving are REAL
//     catalogue figures; the saving is an upper-bound ESTIMATE vs. a real bill (0
//     otherwise) and only for a MONTHLY plan (reuses the app's planSaveYear shape).
//   • Every kit carries the "הנחיה כללית, לא ייעוץ משפטי" disclaimer; the letter is
//     NEVER auto-sent — the USER reviews + sends it.
//
// PURE: no fs, no network, no React, no implicit clock — the caller passes `now`
// (a Date) so the output is deterministic + unit-testable. The catalogue rows +
// provider names + the official-URL resolver are passed IN by the page/route
// (which load them from the bundled catalogue via lib/data). Safe to import from a
// page, a route, or a test.
// ────────────────────────────────────────────────────────────────────────────

import type { Plan } from "./types";
import { CATEGORY_HE } from "./categories";

// ── Shared honesty constants (kept identical to _shared/switch.ts) ────────────
/** The disclaimer every kit carries — kept identical to SWITCH_DISCLAIMER. */
export const SWITCH_DISCLAIMER =
  "המידע כאן הוא הנחיה כללית לפי זכויות הצרכן בתקשורת בישראל — לא ייעוץ משפטי. " +
  "ההליך והפרטים המחייבים מופיעים באתר הרשמי של הספק; אנחנו לא ממציאים מספרי טלפון או שלבים.";

/** The categories the switch kit accepts (mirrors the catalogue minus electricity). */
export const SWITCH_KIT_CATEGORIES = [
  "cellular",
  "internet",
  "tv",
  "triple",
  "abroad",
] as const;
export type SwitchKitCategory = (typeof SWITCH_KIT_CATEGORIES)[number];

/** True when `v` is one of the supported switch-kit categories. */
export function isSwitchKitCategory(v: unknown): v is SwitchKitCategory {
  return (
    typeof v === "string" &&
    (SWITCH_KIT_CATEGORIES as readonly string[]).includes(v)
  );
}

// ── Output shapes (mirror _shared/switch.ts) ──────────────────────────────────
/** A switch step's progress state. 'todo' is the default for a fresh kit. */
export type SwitchStepStatus = "todo" | "in_progress" | "done";

/** One ordered switch step (factual, general). `key` is the stable tracker key. */
export interface SwitchStep {
  /** Stable machine key so the tracker matches a step across rebuilds. */
  key: string;
  /** Short Hebrew title. */
  name: string;
  /** Factual Hebrew detail. */
  text: string;
  /** Progress state (the tracker persists user-advanced states by key). */
  status: SwitchStepStatus;
}

/** One "before you switch" checklist item (only relevant items are shown). */
export interface PortabilityItem {
  key: string;
  label: string;
  detail: string;
}

/** One honest, relative key-date hint (never a fabricated exact date). */
export interface KeyDate {
  key: string;
  label: string;
  hint: string;
}

/** The honest profile slice the kit needs — everything optional. */
export interface SwitchProfile {
  /** Customer full name, for the letter salutation. Absent ⇒ "[שם מלא]". */
  fullName?: string | null;
  /** Account/subscriber number at the OLD provider. Absent ⇒ "[מס׳ לקוח/מנוי]". */
  accountNumber?: string | null;
  /** The phone number being ported (cellular only). Absent ⇒ "[מספר הטלפון]". */
  phone?: string | null;
  /** Current monthly bill (₪) — drives the honest annual-saving figure ONLY. */
  currentBill?: number | null;
  /** Whether they're on a commitment plan — toggles the letter's clause. */
  hasCommitment?: boolean | null;
  /** The provider's verified official site (caller resolves it; never guessed). */
  officialUrl?: string | null;
}

/** The full generated switch kit (mirror of _shared/switch.ts SwitchKit). */
export interface SwitchKit {
  fromProvider: string;
  toProvider: string;
  toPlan: string;
  toPlanId?: string;
  category: string;
  categoryHe: string;
  price: number;
  /** Raw price unit (month/package/day/minute) — UI formats it via lib/format. */
  priceUnit: string;
  /** Honest upper-bound annual saving (₪/yr); undefined when no real figure. */
  annualSavingUpTo?: number;
  cancellationLetterHe: string;
  portabilityChecklist: PortabilityItem[];
  switchSteps: SwitchStep[];
  keyDates: KeyDate[];
  /** The provider's OFFICIAL site (passed in); null when none verified. */
  officialUrl: string | null;
  /** The standing E-E-A-T disclaimer every kit carries. */
  disclaimer: string;
}

/** A loose error shape when there is nothing real to build a kit from. */
export interface SwitchKitUnavailable {
  reason: "no_target" | "unknown_plan" | "bad_category";
  note: string;
}

// ── Small helpers ──────────────────────────────────────────────────────────────
function clean(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

/** Coerce a value to a positive finite, rounded number, or undefined. */
function posNum(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0
    ? Math.round(n)
    : undefined;
}

/** Today as an ISO date (YYYY-MM-DD), deterministic given `now`. */
function isoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Resolve a free-text provider name to a genuine catalogue provider display name
 * (exact, case/space-insensitive, or UNIQUE substring). Returns null when it can't
 * be matched to exactly one real provider — we never invent a provider.
 */
export function resolveProvider(
  raw: string | undefined,
  providers: readonly string[],
): string | null {
  const q = (raw ?? "").trim();
  if (!q) return null;
  const exact = providers.find((p) => p === q);
  if (exact) return exact;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const nq = norm(q);
  const ci = providers.find((p) => norm(p) === nq);
  if (ci) return ci;
  const subs = providers.filter(
    (p) => norm(p).includes(nq) || nq.includes(norm(p)),
  );
  return subs.length === 1 ? subs[0] : null;
}

/**
 * Honest annual saving (₪/yr) vs. the bill — 0 unless a real monthly bill was
 * given AND the target is a monthly plan. Mirrors the app's planSaveYear shape:
 * ((bill - price) * 12) clamped to ≥ 0. An estimate, never a promise.
 */
export function annualSaving(target: Plan, currentBill: number | undefined): number {
  if (!currentBill || currentBill <= 0) return 0;
  const unit = target.priceUnit ?? (target.cat === "abroad" ? "package" : "month");
  if (unit !== "month") return 0; // a per-day/package plan can't compare to a monthly bill
  const price = typeof target.price === "number" ? target.price : 0;
  const monthly = currentBill - price;
  if (monthly <= 0) return 0;
  return Math.round(monthly * 12);
}

// ── The factual exit sequence (SAME keys/copy as _shared/switch.ts exitSteps) ─
/**
 * Byte-for-byte the SAME honest steps the live AEO /switch guide + the edge brain
 * ship, so the Autopilot and the public guide never tell two different stories.
 * `isCellular` tailors the number-porting language; the rest is provider-neutral.
 */
export function switchSteps(fromProvider: string, isCellular: boolean): SwitchStep[] {
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
        ? "לשמירת מספר הטלפון, מסרו לספק החדש את המספר ופרטי הזיהוי. הספק החדש " +
          `מטפל בניוד מול מסלקת הניוד וסוגר את החשבון אצל ${fromProvider}. הניוד ` +
          "חינמי ומתבצע בדרך כלל תוך יום עסקים אחד."
        : "בקטגוריה הזו אין ניוד מספר. המעבר לספק החדש מתבצע מול הספק החדש, " +
          `ובמקביל מוסרים ל${fromProvider} הודעת ניתוק (השלב הבא).`,
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

/** The canonical ordered step keys (for tracker validation / dedupe). */
export const SWITCH_STEP_KEYS = [
  "check_terms",
  "compare_alternatives",
  "porting",
  "written_notice",
  "equipment_final_bill",
] as const;
export type SwitchStepKey = (typeof SWITCH_STEP_KEYS)[number];

/** True when `k` is one of the canonical switch step keys. */
export function isSwitchStepKey(k: unknown): k is SwitchStepKey {
  return typeof k === "string" && (SWITCH_STEP_KEYS as readonly string[]).includes(k);
}

// ── The portability / before-you-switch checklist (mirror of _shared) ──────────
/**
 * Grounded, real-rights items. Number-porting items only appear for cellular; the
 * equipment-return item only for categories that ship loaned hardware. No
 * fabricated requirements.
 */
export function portabilityChecklist(
  fromProvider: string,
  category: string,
  hasCommitment?: boolean | null,
): PortabilityItem[] {
  const isCellular = category === "cellular";
  const shipsEquipment =
    category === "internet" || category === "tv" || category === "triple";

  const items: PortabilityItem[] = [];

  items.push({
    key: "commitment",
    label: "בדיקת התחייבות",
    detail:
      hasCommitment === true
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

// ── Honest relative key-dates (mirror of _shared) ──────────────────────────────
/**
 * We date the NOTICE day (real — the day the kit is built) and give honest,
 * relative WINDOW hints for the rest. We never assert an exact completion date or
 * a provider SLA we can't verify.
 */
export function keyDates(now: Date, category: string): KeyDate[] {
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

// ── The cancellation letter (mirror of _shared, ready to review) ───────────────
/**
 * Filled with the data the caller actually has; personal fields the caller didn't
 * pass become bracketed placeholders the USER fills in. The commitment clause is
 * honest + conditional. We NEVER state an exact disconnection date and we point to
 * the provider's own channels.
 */
export function cancellationLetter(args: {
  fromProvider: string;
  categoryHe: string;
  now: Date;
  isCellular: boolean;
  profile: SwitchProfile;
}): string {
  const { fromProvider, categoryHe, now, isCellular, profile } = args;
  const fullName = clean(profile.fullName, 80) || "[שם מלא]";
  const account = clean(profile.accountNumber, 40) || "[מס׳ לקוח/מנוי]";
  const phone = clean(profile.phone, 20) || "[מספר הטלפון]";

  const commitmentLine =
    profile.hasCommitment === true
      ? "ככל שהמסלול בהתחייבות, אבקש שהחיוב יוגבל ליתרת תקופת ההתחייבות בלבד בהתאם לחוזה, ללא קנס מעבר לכך."
      : profile.hasCommitment === false
        ? "המסלול שלי הוא ללא התחייבות, ולכן הניתוק הוא ללא קנס יציאה."
        : "ככל שקיימת התחייבות, אבקש שהחיוב יוגבל ליתרת תקופת ההתחייבות בלבד בהתאם לחוזה, ללא קנס מעבר לכך.";

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
  return lines.join("\n");
}

// ── Inputs to the web builder ──────────────────────────────────────────────────
export interface BuildSwitchKitInput {
  /** REAL catalogue rows (passed in by the page/route from the bundled catalogue). */
  plans: readonly Plan[];
  /** Distinct provider display names present in the catalogue (for resolution). */
  providers: readonly string[];
  /** The user's CURRENT provider display name (free text — resolved to a real one). */
  fromProvider?: string;
  /** The catalogue id of the TARGET plan the user wants to move to (required). */
  targetPlanId?: string;
  /** The honest profile slice (name/account/phone/bill/commitment) — all optional. */
  profile?: SwitchProfile;
  /** Today (passed in for deterministic output). Defaults to real now. */
  now?: Date;
}

// ── The builder ────────────────────────────────────────────────────────────────
/**
 * Build a personalised switch kit from REAL catalogue rows + the user's inputs,
 * mirroring `_shared/switch.ts buildSwitchKit`. `officialUrlFor` is injected (the
 * page/route passes lib/data's `providerOfficialUrl`) so this module stays
 * node-free + unit-testable; it returns the provider's genuine official site or
 * `undefined` — never fabricated.
 *
 * Returns a {@link SwitchKit} on success, or a {@link SwitchKitUnavailable} when
 * there is no target / the id isn't a real catalogue row (NEVER a fabricated plan).
 */
export function buildSwitchKit(
  input: BuildSwitchKitInput,
  officialUrlFor: (providerName: string) => string | undefined,
): SwitchKit | SwitchKitUnavailable {
  const targetId = clean(input.targetPlanId, 80);
  if (!targetId) {
    return {
      reason: "no_target",
      note: "כדי לבנות ערכת מעבר צריך לבחור מסלול יעד אמיתי מהקטלוג.",
    };
  }

  const target = input.plans.find((p) => String(p.id) === targetId);
  if (!target) {
    return {
      reason: "unknown_plan",
      note: "לא מצאנו את מסלול היעד בקטלוג שלנו. בחרו מסלול קיים ונסו שוב.",
    };
  }
  if (!isSwitchKitCategory(target.cat)) {
    return {
      reason: "bad_category",
      note: "קטגוריית מסלול היעד אינה נתמכת בערכת המעבר.",
    };
  }

  const now = input.now ?? new Date();
  const category = target.cat;
  const categoryHe = CATEGORY_HE[category] ?? category;
  const isCellular = category === "cellular";

  const fromProvider =
    resolveProvider(input.fromProvider, input.providers) ?? "הספק הנוכחי";
  const fromMatched = resolveProvider(input.fromProvider, input.providers);

  // Resolve the OFFICIAL site for the NEW provider (binding-procedure link). When
  // the user gave a recognised current provider we still surface the NEW one's
  // site, since that is who handles the port + the active switch.
  const officialUrl = officialUrlFor(target.provider) ?? null;

  const profile: SwitchProfile = {
    fullName: input.profile?.fullName ?? null,
    accountNumber: input.profile?.accountNumber ?? null,
    phone: input.profile?.phone ?? null,
    currentBill: input.profile?.currentBill ?? null,
    hasCommitment: input.profile?.hasCommitment ?? null,
    // The official URL of the FROM provider, when known, links the binding exit
    // procedure; falls back to the NEW provider's site otherwise.
    officialUrl: fromMatched ? officialUrlFor(fromMatched) ?? null : null,
  };

  const bill = posNum(input.profile?.currentBill);
  const saving = annualSaving(target, bill);

  const priceUnit = clean(target.priceUnit, 16) || (category === "abroad" ? "package" : "month");

  return {
    fromProvider,
    toProvider: clean(target.provider, 60),
    toPlan: clean(target.plan, 120),
    toPlanId: clean(target.id, 80) || undefined,
    category,
    categoryHe,
    price: typeof target.price === "number" ? target.price : 0,
    priceUnit,
    annualSavingUpTo: saving > 0 ? saving : undefined,
    cancellationLetterHe: cancellationLetter({
      fromProvider,
      categoryHe,
      now,
      isCellular,
      profile,
    }),
    portabilityChecklist: portabilityChecklist(
      fromProvider,
      category,
      profile.hasCommitment,
    ),
    switchSteps: switchSteps(fromProvider, isCellular),
    keyDates: keyDates(now, category),
    // The binding procedure link prefers the FROM provider's official site (whose
    // exit procedure the user follows); otherwise the NEW provider's site.
    officialUrl: profile.officialUrl ?? officialUrl,
    disclaimer: SWITCH_DISCLAIMER,
  };
}

/** Type guard: did {@link buildSwitchKit} succeed (vs. return unavailable)? */
export function isSwitchKit(
  r: SwitchKit | SwitchKitUnavailable,
): r is SwitchKit {
  return (r as SwitchKit).cancellationLetterHe !== undefined;
}
