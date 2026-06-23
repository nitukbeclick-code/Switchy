import '../models.dart';

// ── חשמל (Electricity) ───────────────────────────────────────────────────────
// Israel's electricity market is open to private suppliers (ספקי חשמל פרטיים)
// who resell the IEC (חברת חשמל) grid at a discount off the regulated tariff
// (תעריף מחירון רשות החשמל). Offers are framed as a % discount, sometimes
// time-windowed (night / day / weekend), not a flat subscription.
//
// To keep the card / sort / catalogue-integrity logic uniform (every plan needs
// a positive price), `price` here is an INDICATIVE monthly bill for a typical
// household AFTER the discount — a representative figure, not a fixed fee. The
// real, comparable offer (the % off + window) lives in feats/specs, and the
// electricity category's currentBill is 0 so the savings engine never treats
// these indicative figures as a head-to-head price.
//
// Provider names are deliberately chosen to NOT substring-collide with any
// telecom provider (plansByProvider matches loosely), so an electricity supplier
// never leaks into a telecom provider's plan list. net='grid' (mains); all are
// no-commitment.
//
// Seed data — kamaze-parity (they list an Electricity category). Verify the
// exact % / windows / prices against each supplier before relying on them.
final List<Plan> electricityPlans = [
  // electra | הנחה קבועה כל היום | [ELEC]
  const Plan(
    id: 'el_electra_fixed',
    cat: 'electricity',
    provider: 'אלקטרה פאוור',
    net: 'grid',
    plan: '7% הנחה קבועה',
    price: 300,
    rating: 4.1,
    reviews: 0,
    flags: ['nocommit'],
    feats: ['7% הנחה על כל צריכת החשמל', 'ללא שעות מוגבלות', 'ללא התחייבות', 'מעבר ללא טכנאי'],
    specs: {'הנחה': '7%', 'חלון': 'כל היום'},
    fineLines: [
      'מחיר מייצג לחשבון חודשי ממוצע אחרי ההנחה',
      'ההנחה על מרכיב האנרגיה בתעריף הרשות',
      'מעבר דיגיטלי, ללא ניתוק חשמל',
    ],
    updatedAt: '2026-06',
  ),

  // pazgas | הנחת לילה | [ELEC]
  const Plan(
    id: 'el_pazgas_night',
    cat: 'electricity',
    provider: 'פזגז',
    net: 'grid',
    plan: '15% הנחת לילה',
    price: 290,
    rating: 4.0,
    reviews: 0,
    flags: ['nocommit'],
    feats: ['15% הנחה בשעות הלילה (23:00–07:00)', '5% הנחה בשאר היום', 'ללא התחייבות'],
    specs: {'הנחה': '15% לילה / 5% יום', 'חלון': '23:00–07:00'},
    fineLines: [
      'מחיר מייצג לחשבון חודשי ממוצע אחרי ההנחה',
      'מתאים למשק בית עם צריכה גבוהה בלילה',
      'ההנחה על מרכיב האנרגיה בלבד',
    ],
    highlight: true,
    updatedAt: '2026-06',
  ),

  // amisragas | הנחה קבועה | [ELEC]
  const Plan(
    id: 'el_amisragas_fixed',
    cat: 'electricity',
    provider: 'אמישראגז',
    net: 'grid',
    plan: '6% הנחה קבועה',
    price: 305,
    rating: 3.9,
    reviews: 0,
    flags: ['nocommit'],
    feats: ['6% הנחה על כל הצריכה', 'ללא שעות מוגבלות', 'ללא התחייבות'],
    specs: {'הנחה': '6%', 'חלון': 'כל היום'},
    fineLines: [
      'מחיר מייצג לחשבון חודשי ממוצע אחרי ההנחה',
    ],
    updatedAt: '2026-06',
  ),

  // doral | הנחת סוף שבוע | [ELEC]
  const Plan(
    id: 'el_doral_weekend',
    cat: 'electricity',
    provider: 'דוראל אנרגיה',
    net: 'grid',
    plan: '20% הנחת סוף שבוע',
    price: 295,
    rating: 3.8,
    reviews: 0,
    flags: ['nocommit'],
    feats: ['20% הנחה בשישי–שבת', '4% הנחה בימי חול', 'ללא התחייבות'],
    specs: {'הנחה': '20% סופ״ש / 4% חול', 'חלון': 'שישי–שבת'},
    fineLines: [
      'מחיר מייצג לחשבון חודשי ממוצע אחרי ההנחה',
      'מתאים למי שצורך הרבה בסופי שבוע',
    ],
    updatedAt: '2026-06',
  ),

  // nofar | הנחת שעות יום | [ELEC]
  const Plan(
    id: 'el_nofar_day',
    cat: 'electricity',
    provider: 'נופר אנרגיה',
    net: 'grid',
    plan: '10% הנחת שעות יום',
    price: 298,
    rating: 3.9,
    reviews: 0,
    flags: ['nocommit'],
    feats: ['10% הנחה בשעות 07:00–17:00', 'ללא התחייבות', 'מעבר מקוון'],
    specs: {'הנחה': '10% יום', 'חלון': '07:00–17:00'},
    fineLines: [
      'מחיר מייצג לחשבון חודשי ממוצע אחרי ההנחה',
      'מתאים לעובדים מהבית / משפחות ביום',
    ],
    updatedAt: '2026-06',
  ),
];
