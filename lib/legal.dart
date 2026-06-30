// ────────────────────────────────────────────────────────────────────────────
// Consumer-facing legal/compliance copy — the Flutter MIRROR of the web app's
// lib/legal.ts, so the same owner-approved wording is reused verbatim across
// web + app without drift.
//
// HONESTY / LEGAL (owner-confirmed facts, mirrored from web/lib/legal.ts):
//   • Switchy AI earns a referral fee from providers when a user switches
//     through us — this MUST be disclosed prominently (Consumer Protection Law
//     §7b / §17). The disclosure is truthful: the comparison is free to the
//     user, the fee is paid by the provider, and it does NOT change the price
//     the user pays.
//   • Prices are VAT-inclusive, catalogue-derived, accurate as of the update
//     date, and should be verified with the provider before signing (§17).
//
// Truth-only: do not invent figures here. If the web wording changes, update
// both files together.
// ────────────────────────────────────────────────────────────────────────────

/// Consumer Protection §7b — short headline (free service) for the commission
/// disclosure. Mirrors COMMISSION_DISCLOSURE_LEAD in web/lib/legal.ts.
const String kCommissionDisclosureLead = 'השירות חינמי עבורכם.';

/// Consumer Protection §7b — the full honest commission/referral-fee sentence.
/// Mirrors COMMISSION_DISCLOSURE_BODY in web/lib/legal.ts.
const String kCommissionDisclosureBody =
    'אנו מקבלים דמי תיווך/הפניה מהספקים כאשר אתם עוברים דרכנו — וזה אינו משפיע '
    'על המחיר שתשלמו. ההשוואה נעשית לפי המתודולוגיה השקופה שלנו.';

/// Consumer Protection §17 — price-accuracy caveat shown beside any price/table.
/// Mirrors PRICE_ACCURACY_CAVEAT in web/lib/legal.ts.
const String kPriceAccuracyCaveat =
    'המחירים כוללים מע״מ · מדויקים נכון לתאריך העדכון · יש לאמת מול הספק לפני התקשרות.';
