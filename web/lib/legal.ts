// ────────────────────────────────────────────────────────────────────────────
// Pure legal/compliance copy — NO filesystem / node imports, so this module is
// safe to import from client components ("use client") AND from server pages.
// It is the SINGLE SOURCE OF TRUTH for the consumer-facing compliance strings so
// the same wording can be unit-tested once and reused everywhere without drift.
//
// HONESTY / LEGAL (owner-confirmed facts):
//   • Switchy AI earns a referral fee from providers when a user switches
//     through us — this MUST be disclosed prominently (Consumer Protection Law
//     §7b / §17). The disclosure is truthful: the comparison is free to the user,
//     the fee is paid by the provider, and it does NOT change the price the user
//     pays. We do NOT position the brand as a neutral "consumer advocate".
//   • Prices are VAT-inclusive, catalogue-derived, accurate as of the update date,
//     and should be verified with the provider before signing (§17 price accuracy).
//   • Marketing sends (SMS / email / WhatsApp) are OPT-IN and removable at any
//     time (Spam Law — חוק התקשורת תיקון 40).
//
// This is a truthful draft. Binding legal text is for the owner's lawyer.
// ────────────────────────────────────────────────────────────────────────────

/** Public contact channels (owner-confirmed). */
export const CONTACT_EMAIL = "hello@switchy-ai.com";
export const CONTACT_WHATSAPP = "050-503-7537";
/** WhatsApp number in international E.164 form for wa.me deep links. */
export const CONTACT_WHATSAPP_INTL = "972505037537";

// ── Consumer Protection §7b / §17 — commission / referral-fee disclosure ──────
// One honest line, placed prominently (NOT buried): the service is free, we are
// paid a referral fee by the provider on a switch, this does NOT affect the price
// the user pays, and the comparison follows our transparent methodology.

/** Short headline used as the disclosure's leading emphasis. */
export const COMMISSION_DISCLOSURE_LEAD =
  "השירות חינמי עבורכם.";

/** The full honest commission disclosure sentence (plain text, no markup). */
export const COMMISSION_DISCLOSURE_BODY =
  "אנו מקבלים דמי תיווך/הפניה מהספקים כאשר אתם עוברים דרכנו — וזה אינו משפיע " +
  "על המחיר שתשלמו. ההשוואה נעשית לפי המתודולוגיה השקופה שלנו.";

/** Anchor text for the methodology link that accompanies the disclosure. */
export const COMMISSION_DISCLOSURE_LINK_TEXT = "המתודולוגיה השקופה שלנו";

// ── Consumer Protection §17 — price-accuracy caveat (near the prices/table) ───
// Prices are VAT-inclusive, catalogue-derived, accurate as of the update date,
// and must be verified with the provider before signing.

/** The standard price-accuracy caveat shown beside any comparison price/table. */
export const PRICE_ACCURACY_CAVEAT =
  "המחירים כוללים מע״מ · מדויקים נכון לתאריך העדכון · יש לאמת מול הספק לפני התקשרות.";

// ── Spam Law — granular per-channel marketing-consent copy ────────────────────
// Three OPTIONAL, default-UNCHECKED opt-ins, separate from the MANDATORY consent
// gate. Labeled as marketing (פרסומת) with an explicit opt-out note.

/** Marketing channels offered as separate opt-ins, in display order. */
export const MARKETING_CHANNELS = [
  { key: "sms", label: "SMS" },
  { key: "email", label: "אימייל" },
  { key: "whatsapp", label: "וואטסאפ" },
] as const;

export type MarketingChannel = (typeof MARKETING_CHANNELS)[number]["key"];

/** Heading above the optional marketing opt-in checkboxes. */
export const MARKETING_OPTIN_HEADING =
  "דיוור שיווקי (אופציונלי)";

/** Sub-label clarifying these are marketing messages, removable at any time. */
export const MARKETING_OPTIN_NOTE =
  "דיוור שיווקי (פרסומת) · ניתן להסיר בכל עת בתשובת ״הסר״. אופציונלי — מסומן " +
  "בנפרד מההסכמה ליצירת קשר בנוגע לפנייה.";

/** Per-channel checkbox label (e.g. "אני מאשר/ת קבלת דיוור שיווקי ב-SMS"). */
export function marketingChannelLabel(label: string): string {
  return `אני מאשר/ת קבלת דיוור שיווקי ב-${label}`;
}
