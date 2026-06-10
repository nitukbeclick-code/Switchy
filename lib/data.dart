import 'package:flutter/material.dart';
import 'models.dart';
import 'data/plans_cellular.dart';
import 'data/plans_internet.dart';
import 'data/plans_tv_triple.dart';

// ── Categories ────────────────────────────────────────────────────────────────

final List<Category> categories = [
  const Category(id: 'cellular', name: 'סלולר', icon: '📱', currentBill: 119, color: Color(0xFF15603E), planCount: 59, description: 'חבילות סלולר לנייד'),
  const Category(id: 'internet', name: 'אינטרנט', icon: '🌐', currentBill: 140, color: Color(0xFF2563EB), planCount: 30, description: 'אינטרנט ביתי מהיר'),
  const Category(id: 'tv', name: 'טלוויזיה', icon: '📺', currentBill: 130, color: Color(0xFF7C3AED), planCount: 9, description: 'ערוצי טלוויזיה ושידורים'),
  const Category(id: 'triple', name: 'חבילה משולבת', icon: '🏠', currentBill: 260, color: Color(0xFFE07034), planCount: 11, description: 'אינטרנט + טלוויזיה + טלפון'),
  const Category(id: 'abroad', name: 'חבילות חו"ל', icon: '✈️', currentBill: 0, color: Color(0xFF0891B2), planCount: 11, description: 'גלישה ושיחות בחו"ל'),
];

// ── Plans ─────────────────────────────────────────────────────────────────────
// Cellular / internet / TV / triple are real provider data, sourced in
// lib/data/plans_*.dart. Abroad (eSIM / roaming) remains a curated seed.

// priceUnit: תעריף לדקה / ליום / מנוי חודשי / חבילה חד-פעמית — אסור לערבב
// אותם באותו מיון מחיר כאילו כולם "לחבילה" (ראו priceUnitLabel למטה).
const List<Plan> abroadPlans = [
  Plan(id: 'ab_019', cat: 'abroad', provider: '019 מובייל', net: 'international', plan: 'תעריף לדקה — אירופה', price: 1, priceUnit: 'minute', rating: 3.9, reviews: 450, flags: [], feats: ['₪0.99 לדקה באירופה', '₪1.90 לMB גלישה', 'ללא מנוי חודשי', 'מתאים לנסיעות קצרות']),
  Plan(id: 'ab_golan', cat: 'abroad', provider: 'גולן טלקום', net: 'international', plan: '₪9.90/יום — כל אירופה', price: 10, priceUnit: 'day', rating: 4.2, reviews: 890, flags: ['nocommit'], feats: ['גלישה + שיחות ב-₪9.90/יום', 'כל אירופה', 'הפעלה ב-SMS', 'מינימום יום אחד']),
  Plan(id: 'ab_partner', cat: 'abroad', provider: 'פרטנר', net: 'international', plan: 'World Pack 1GB חודשי', price: 29, priceUnit: 'month', rating: 4.1, reviews: 1200, flags: ['nocommit'], feats: ['1GB גלישה בחו"ל', '60 דקות שיחות', '90+ מדינות', 'ניתן לביטול חודשי'], highlight: true),
  Plan(id: 'ab_pelephone', cat: 'abroad', provider: 'פלאפון', net: 'international', plan: 'World 5GB חודשי', price: 49, priceUnit: 'month', rating: 4.3, reviews: 980, flags: [], feats: ['5GB גלישה', '200 דקות שיחות', '130+ מדינות', 'שיתוף עד 3 מכשירים']),
  Plan(id: 'ab_airalo', cat: 'abroad', provider: 'Airalo eSIM', net: 'esim', plan: 'eSIM אירופה 10GB', price: 25, priceUnit: 'package', rating: 4.5, reviews: 3400, flags: ['nocommit'], feats: ['10GB גלישה', 'eSIM דיגיטלי', '30+ מדינות אירופה', 'הפעלה מיידית מהאפליקציה']),
  Plan(id: 'ab_airalo_3g', cat: 'abroad', provider: 'Airalo eSIM', net: 'esim', plan: 'eSIM אירופה 3GB', price: 13, priceUnit: 'package', rating: 4.5, reviews: 2100, flags: ['nocommit'], feats: ['3GB גלישה', 'eSIM דיגיטלי', '30+ מדינות אירופה', 'הפעלה מיידית מהאפליקציה', 'מתאים לנסיעה קצרה'], highlight: true),
  Plan(id: 'ab_airalo_global', cat: 'abroad', provider: 'Airalo eSIM', net: 'esim', plan: 'eSIM גלובל 5GB', price: 37, priceUnit: 'package', rating: 4.4, reviews: 1800, flags: ['nocommit'], feats: ['5GB גלישה', 'eSIM דיגיטלי', '100+ מדינות ברחבי העולם', 'הפעלה מיידית', 'ניתן להרחבה מהאפליקציה']),
  Plan(id: 'ab_hot', cat: 'abroad', provider: 'הוט מובייל', net: 'international', plan: '₪8.90/יום — אירופה', price: 9, priceUnit: 'day', rating: 4.0, reviews: 760, flags: ['nocommit'], feats: ['גלישה + שיחות ב-₪8.90/יום', 'כל אירופה + ארה"ב', 'הפעלה אוטומטית בנחיתה', 'ניתן לביטול בחזרה']),
  Plan(id: 'ab_partner_3g', cat: 'abroad', provider: 'פרטנר', net: 'international', plan: 'World Pack 3GB חודשי', price: 49, priceUnit: 'month', rating: 4.2, reviews: 890, flags: ['nocommit'], feats: ['3GB גלישה בחו"ל', '120 דקות שיחות', '90+ מדינות', 'שיתוף בין 2 מכשירים'], highlight: true),
  Plan(id: 'ab_cellcom', cat: 'abroad', provider: 'סלקום', net: 'international', plan: '₪7.90/יום — כל אירופה', price: 8, priceUnit: 'day', rating: 4.1, reviews: 1100, flags: ['nocommit'], feats: ['גלישה + שיחות ב-₪7.90/יום', 'כל אירופה + טורקיה', 'הפעלה ב-SMS', 'חיסכון מ-30 יום']),
  Plan(id: 'ab_019_world', cat: 'abroad', provider: '019 מובייל', net: 'international', plan: '2GB גלישה חודשי', price: 19, priceUnit: 'month', rating: 3.8, reviews: 340, flags: ['nocommit'], feats: ['2GB גלישה', '60 דקות שיחות', '80+ מדינות', 'ניתן לביטול חודשי']),
];

final List<Plan> allPlans = [
  ...cellularPlans,
  ...internetPlans,
  ...tvPlans,
  ...triplePlans,
  ...abroadPlans,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

Category? categoryById(String id) {
  try { return categories.firstWhere((c) => c.id == id); } catch (_) { return null; }
}

List<Plan> plansByCat(String cat) => allPlans.where((p) => p.cat == cat).toList();

/// All plans offered by a provider (matched loosely so 'גולן' finds 'גולן טלקום').
List<Plan> plansByProvider(String provider) {
  final q = provider.trim();
  if (q.isEmpty) return const [];
  return allPlans.where((p) => p.provider == q || p.provider.contains(q) || q.contains(p.provider)).toList();
}

/// Distinct provider names in the catalogue, in first-seen order.
List<String> get allProviders {
  final seen = <String>{};
  final out = <String>[];
  for (final p in allPlans) {
    if (seen.add(p.provider)) out.add(p.provider);
  }
  return out;
}

Plan? planById(String id) {
  try { return allPlans.firstWhere((p) => p.id == id); } catch (_) { return null; }
}

int planSaveYear(Plan p, int currentBill) {
  // Use the exact price so the saving is accurate to the agora even when the
  // headline price is rounded for sorting.
  return ((currentBill - p.priceValue) * 12).round().clamp(0, 999999);
}

/// תווית יחידת המחיר המלאה — 'לחודש' / 'לחבילה' / 'ליום' / 'לדקה'.
/// המקור היחיד לאמת לתצוגת מחירים; מסכים לא גוזרים זאת שוב מהקטגוריה.
String priceUnitLabel(Plan p) {
  switch (p.unit) {
    case 'package': return 'לחבילה';
    case 'day': return 'ליום';
    case 'minute': return 'לדקה';
    default: return 'לחודש';
  }
}

/// יחידת המחיר המקוצרת — לפורמטים כמו '₪X/חודש'.
String priceUnitShort(Plan p) {
  switch (p.unit) {
    case 'package': return 'חבילה';
    case 'day': return 'יום';
    case 'minute': return 'דקה';
    default: return 'חודש';
  }
}

/// מהירות ההורדה (Mbps) מתוך specs['מהירות'] — 'עד 1000/100' → 1000.
/// מחזיר 0 כשאין נתון מובנה.
int planDownloadMbps(Plan p) {
  final spec = p.specs['מהירות'];
  if (spec == null) return 0;
  final m = RegExp(r'\d[\d,]*').firstMatch(spec);
  if (m == null) return 0;
  return int.tryParse(m.group(0)!.replaceAll(',', '')) ?? 0;
}

Plan? hotDeal(int currentBill, {String cat = 'cellular'}) {
  Plan? best;
  int bestSave = 0;
  // מסלולי דאטה-בלבד / כשר אינם תחליף לקו רגיל — "החיסכון" מולם מטעה,
  // ולכן הם לא מתמודדים על הדיל החם של עמוד הבית.
  for (final p in allPlans.where((p) => p.cat == cat && p.isRegular)) {
    final s = planSaveYear(p, currentBill);
    if (s > bestSave) { bestSave = s; best = p; }
  }
  return best;
}

List<Plan> filteredPlans({
  required String cat,
  required String sort,
  required List<String> filters,
  required String query,
  required int budget,
  int? currentBill,
}) {
  var plans = plansByCat(cat);

  if (query.isNotEmpty) {
    final q = query.toLowerCase();
    plans = plans.where((p) =>
      p.provider.contains(q) ||
      p.plan.contains(q) ||
      p.feats.any((f) => f.toLowerCase().contains(q))
    ).toList();
  }

  for (final f in filters) {
    switch (f) {
      case '5g': plans = plans.where((p) => p.is5G).toList();
      case 'nocommit': plans = plans.where((p) => p.noCommit).toList();
      case 'fixed': plans = plans.where((p) => p.isFixed).toList();
      case 'abroad': plans = plans.where((p) => p.hasAbroad).toList();
      case 'fiber': plans = plans.where((p) => p.net == 'fiber').toList();
      // מהירות נגזרת מה-specs המובנים ולא משם המסלול ('Fiber 1GB' וכו׳).
      case '1g': plans = plans.where((p) => p.net == 'fiber' && planDownloadMbps(p) >= 1000).toList();
      case 'streaming': plans = plans.where((p) => p.net == 'streaming').toList();
      case 'sport': plans = plans.where((p) => p.feats.any((f) => f.contains('ספורט'))).toList();
      case 'netflix': plans = plans.where((p) => p.feats.any((f) => f.contains('Netflix'))).toList();
      case 'esim': plans = plans.where((p) => p.net == 'esim').toList();
      case 'kosher': plans = plans.where((p) => p.kind == 'kosher' || p.plan.contains('כשר')).toList();
    }
  }

  if (budget > 0) plans = plans.where((p) => p.price <= budget).toList();

  final bill = currentBill ?? 119;
  // מסלולים שאינם regular (דאטה-בלבד / כשר) לא מדורגים לפי "חיסכון" —
  // השוואה מול חשבון של קו רגיל חסרת משמעות — אז הם נדחקים לסוף הרשימה
  // (אך עדיין מופיעים בה).
  int saveRank(Plan p) => p.isRegular ? planSaveYear(p, bill) : -1;
  switch (sort) {
    case 'price':
      // תעריף לדקה (₪1) אינו "החבילה הזולה ביותר" — נדחק לסוף מיון מחיר עולה.
      plans.sort((a, b) {
        final aMin = a.unit == 'minute', bMin = b.unit == 'minute';
        if (aMin != bMin) return aMin ? 1 : -1;
        return a.price.compareTo(b.price);
      });
    case 'save': plans.sort((a, b) => saveRank(b).compareTo(saveRank(a)));
    default:
      plans.sort((a, b) {
        final sc = saveRank(b).compareTo(saveRank(a));
        return sc != 0 ? sc : b.rating.compareTo(a.rating);
      });
  }

  return plans;
}

// Community posts seed data
List<CommunityPost> get communityPosts => [
  CommunityPost(id: '1', author: 'מאיה כהן', avatar: 'מ', channel: 'המלצות', text: 'עברתי לגולן ב-₪39 במקום ₪119 בפלאפון. חוסך עזר לי עם כל ניתוק. ממליצה בחום!', likes: 34, replies: 8, timestamp: DateTime.now().subtract(const Duration(hours: 2)), isVerified: true),
  CommunityPost(id: '2', author: 'צוות חוסך', avatar: 'ח', channel: 'המלצות', text: '🔥 עסקה חמה: גולן 400GB ב-₪39 כולל 1GB חו"ל. עדיין חיסכון של ₪720/שנה!', likes: 89, replies: 23, timestamp: DateTime.now().subtract(const Duration(hours: 5)), isTeam: true, planId: 'cel_golan_400abroad'),
  CommunityPost(id: '3', author: 'יוסי לוי', avatar: 'י', channel: 'סלולר', text: 'שאלה — מי יותר טוב לגבי כיסוי 5G בחיפה? פרטנר או סלקום?', likes: 12, replies: 15, timestamp: DateTime.now().subtract(const Duration(hours: 8))),
  CommunityPost(id: '4', author: 'רחל אברהם', avatar: 'ר', channel: 'עזרה בניתוק', text: 'פלאפון מסרבים לבצע את הניוד. כבר שבוע. מה עושים?', likes: 5, replies: 19, timestamp: DateTime.now().subtract(const Duration(hours: 12))),
  CommunityPost(id: '5', author: 'דן שפירא', avatar: 'ד', channel: 'אינטרנט', text: 'עברתי לסלקום fiber 1GB ב-₪109 ללא התחייבות. מהירות מדהימה! 950Mb בבדיקה.', likes: 27, replies: 6, timestamp: DateTime.now().subtract(const Duration(days: 1))),
  CommunityPost(id: '6', author: 'נועה גרין', avatar: 'נ', channel: 'המלצות', text: 'חוסך עזר לי לעבור ל-yes+Fiber הטריפל — סיב 1000Mb + Netflix, הכל ב-₪209. חסכתי ₪1,100 בשנה!', likes: 41, replies: 11, timestamp: DateTime.now().subtract(const Duration(days: 2)), isVerified: true, planId: 'tri_yes_yes-fiber-triple'),
  CommunityPost(id: '7', author: 'אלי מזרחי', avatar: 'א', channel: 'סלולר', text: 'טיפ: בקשו מפלאפון מחיר שימור לפני שאתם עוזבים. הציעו לי ₪59 אחרי שאמרתי שאני עוזב. בכל זאת עברתי לגולן ב-₪39 😂', likes: 67, replies: 28, timestamp: DateTime.now().subtract(const Duration(days: 2))),
  CommunityPost(id: '8', author: 'צוות חוסך', avatar: 'ח', channel: 'המלצות', text: '📊 דיווח חודשי: 3,847 לקוחות חסכו ₪847 בממוצע החודש! הספק הפופולרי ביותר: גולן טלקום 🏆', likes: 156, replies: 44, timestamp: DateTime.now().subtract(const Duration(days: 3)), isTeam: true),
  CommunityPost(id: '9', author: 'שרית לוין', avatar: 'ש', channel: 'אינטרנט', text: 'שאלה: HOT או בזק לאינטרנט גיגה? יש לי ילדים שמשחקים games אז latency חשוב', likes: 8, replies: 22, timestamp: DateTime.now().subtract(const Duration(days: 3))),
  CommunityPost(id: '10', author: 'עמית בן-דוד', avatar: 'ע', channel: 'עזרה בניתוק', text: 'שיתוף ניסיון: ניוד לקח לי בדיוק 3 שעות. נרשמתי ב-9 בבוקר, ב-12 כבר הייתה לי SIM חדשה. smooth לגמרי עם חוסך!', likes: 52, replies: 7, timestamp: DateTime.now().subtract(const Duration(days: 4)), isVerified: true),
  CommunityPost(id: '11', author: 'מיכל ביטון', avatar: 'מ', channel: 'סלולר', text: 'Xphone Forever Plus ב-₪30 קבוע לנצח — זה לא סתם פרסומת, באמת לא מעלים מחיר. שנה ומשלם אותו דבר.', likes: 38, replies: 12, timestamp: DateTime.now().subtract(const Duration(days: 5))),
  CommunityPost(id: '12', author: 'ג׳ושוע מוסה', avatar: 'ג', channel: 'המלצות', text: 'מי יכול להמליץ על חבילה משולבת שכוללת סיבים + TV? תקציב ₪180', likes: 14, replies: 31, timestamp: DateTime.now().subtract(const Duration(days: 6))),
  CommunityPost(id: '13', author: 'תמר כספי', avatar: 'ת', channel: 'סלולר', text: 'רמי לוי טריפל 3 קווים ב-₪80 סה"כ. לא הייתי מאמינה שזה אפשרי. תנסו להשוות בחוסך — כל מה שצריך 🙏', likes: 29, replies: 9, timestamp: DateTime.now().subtract(const Duration(days: 7)), isVerified: true),
  CommunityPost(id: '14', author: 'אורי פרידמן', avatar: 'א', channel: 'אינטרנט', text: 'CCC fiber 1GB ב-₪79 — הכי זול שמצאתי! תשאירו תגובה אם אתם בתל אביב ורוצים להצטרף', likes: 43, replies: 17, timestamp: DateTime.now().subtract(const Duration(days: 8))),
  CommunityPost(id: '15', author: 'צוות חוסך', avatar: 'ח', channel: 'המלצות', text: '✈️ מסלולי חו"ל: לאירופה עדיין הכי משתלם Airalo eSIM. 3GB ב-₪13 בלבד, פועל ב-30+ מדינות. הפעלה מיידית!', likes: 72, replies: 19, timestamp: DateTime.now().subtract(const Duration(days: 9)), isTeam: true, planId: 'ab_airalo_3g'),
  CommunityPost(id: '16', author: 'ניר שמחי', avatar: 'נ', channel: 'עזרה בניתוק', text: 'טיפ חשוב לניוד: תוודאו שהחוב לספק הנוכחי מוסדר לפני שמגישים בקשה — זה עצר אותי שבועיים.', likes: 61, replies: 14, timestamp: DateTime.now().subtract(const Duration(days: 10))),
  CommunityPost(id: '17', author: 'הילה אוחיון', avatar: 'ה', channel: 'סלולר', text: 'ויקום Free 5G ב-₪35 — ניסיתי חודש. כיסוי מצוין בתל אביב, שירות לקוחות 8/10. שווה לבדוק!', likes: 33, replies: 21, timestamp: DateTime.now().subtract(const Duration(days: 11))),
  CommunityPost(id: '18', author: 'בני זכריה', avatar: 'ב', channel: 'אינטרנט', text: 'שאלה: מישהו עבר מ-HOT לבזק fiber? שווה את הטרחה? אני ב-200Mb ומשלם ₪150 שזה יקר מדי', likes: 6, replies: 27, timestamp: DateTime.now().subtract(const Duration(days: 12))),
  CommunityPost(id: '19', author: 'לימור דוד', avatar: 'ל', channel: 'המלצות', text: 'eSIM = ❤️ הגדרתי Airalo ב-5 דקות, לא צריך להחליף SIM בנמל תעופה. מי שנוסע — חובה!', likes: 88, replies: 33, timestamp: DateTime.now().subtract(const Duration(days: 13)), isVerified: true),
  CommunityPost(id: '20', author: '019 מובייל', avatar: '0', channel: 'סלולר', text: 'שיתוף: עברתי ל-019 מובייל הגזמנו 170GB 5G ב-₪26. מחיר קבוע, כיסוי פרטנר, ב-11 שנה ראשון שאני לא מרגיש שדפקו אותי 😂', likes: 55, replies: 16, timestamp: DateTime.now().subtract(const Duration(days: 14))),
  // TV channel posts
  CommunityPost(id: '21', author: 'ארז שוהם', avatar: 'א', channel: 'טלוויזיה', text: 'HOT ספורט פרמיום שווה? גם ישראל פריים ליג וגם NBA ב-₪119 לחודש. מי שצופה בכדורגל — שווה כל שקל.', likes: 44, replies: 22, timestamp: DateTime.now().subtract(const Duration(days: 2))),
  CommunityPost(id: '22', author: 'שירה מנצ׳ר', avatar: 'ש', channel: 'טלוויזיה', text: 'FreeTV אנדרואיד — מה מצאתי בחינם: Netflix, Disney+, ערוצי ילדים. אין צורך ב-HOT או yes בכלל 😅', likes: 71, replies: 38, timestamp: DateTime.now().subtract(const Duration(days: 4)), isVerified: true),
  CommunityPost(id: '23', author: 'משה גולן', avatar: 'מ', channel: 'טלוויזיה', text: 'שאלה: yes לוויין ב-₪89 לעומת סלקום TV ב-₪59 — מה כולל יותר? מישהו השווה?', likes: 18, replies: 31, timestamp: DateTime.now().subtract(const Duration(days: 6))),
  CommunityPost(id: '24', author: 'צוות חוסך', avatar: 'ח', channel: 'טלוויזיה', text: '📺 חדש: Partner TV + ספורט ב-₪95 כולל כל ערוצי הספורט + VOD. ללא התחייבות — ביטול בלחיצה!', likes: 39, replies: 14, timestamp: DateTime.now().subtract(const Duration(days: 8)), isTeam: true, planId: 'tv_partner_sport'),
  CommunityPost(id: '25', author: 'רות ברנשטיין', avatar: 'ר', channel: 'טלוויזיה', text: 'עברנו מ-HOT ל-FreeTV — חסכנו ₪70/חודש. הילדים לא שמו לב לשינוי. כל הערוצים הכי חשובים עדיין שם.', likes: 62, replies: 17, timestamp: DateTime.now().subtract(const Duration(days: 15)), isVerified: true),
  // Abroad channel posts
  CommunityPost(id: '26', author: 'גיל מירון', avatar: 'ג', channel: 'חו"ל', text: 'נסיעה ל-3 שבועות אירופה: לקחתי Airalo גלובל 5GB ב-₪37. ליטא, פולין, גרמניה, צרפת — עבד בכל מקום. 10/10!', likes: 83, replies: 26, timestamp: DateTime.now().subtract(const Duration(days: 1)), isVerified: true),
  CommunityPost(id: '27', author: 'נטלי פרי', avatar: 'נ', channel: 'חו"ל', text: 'שאלה: פרטנר World Pack לחודש ב-₪49 לעומת Airalo 3GB ב-₪39 — מה יותר שווה לנסיעה ארוכה?', likes: 22, replies: 35, timestamp: DateTime.now().subtract(const Duration(days: 5))),
  CommunityPost(id: '28', author: 'אמנון כץ', avatar: 'א', channel: 'חו"ל', text: 'ניסיתי הוט מובייל ₪8.90/יום לאירופה — 2 שבועות עלה לי ₪124. Airalo 3GB היה עולה ₪39. לא חוזר להוט.', likes: 91, replies: 29, timestamp: DateTime.now().subtract(const Duration(days: 10)), isVerified: true),
  CommunityPost(id: '29', author: 'יעל שגיא', avatar: 'י', channel: 'חו"ל', text: 'טיפ: קנו Airalo לפני הטיסה מהבית, הגדרה לוקחת 2 דקות. בנמל תעופה יש המתנה ואין WiFi. חוסכת לכם עצבים!', likes: 47, replies: 11, timestamp: DateTime.now().subtract(const Duration(days: 16))),
  // Triple bundle posts
  CommunityPost(id: '30', author: 'אורית בן-עמי', avatar: 'א', channel: 'חבילה משולבת', text: 'בזק triple: סיב 1000MB + 2 קווים סלולר + YES + Netflix ב-₪329. חסכנו ₪240/חודש לעומת כל שירות בנפרד!', likes: 76, replies: 33, timestamp: DateTime.now().subtract(const Duration(days: 3)), isVerified: true),
  CommunityPost(id: '31', author: 'שמוליק ויינר', avatar: 'ש', channel: 'חבילה משולבת', text: 'שאלה: פרטנר triple 1GB+Netflix ב-₪215 או HOT triple ב-₪249? מה ההבדל האמיתי בין הספקים?', likes: 29, replies: 44, timestamp: DateTime.now().subtract(const Duration(days: 7))),
  CommunityPost(id: '32', author: 'דפנה כהן-לוי', avatar: 'ד', channel: 'חבילה משולבת', text: 'עברנו לחבילה המשולבת של סלקום — הנציג של חוסך עשה הכל בשביל. 4 שירותים בחשבון אחד ₪280/חודש 🙌', likes: 58, replies: 19, timestamp: DateTime.now().subtract(const Duration(days: 11)), isVerified: true),
  // More general posts
  CommunityPost(id: '33', author: 'אבי רוזנברג', avatar: 'א', channel: 'עזרה בניתוק', text: 'מדריך: איך לא לשלם דמי ביטול? ספרו לנציג שאתם עוברים לתוכנית זול יותר אצלהם. ב-80% מהמקרים מתגמשים!', likes: 104, replies: 48, timestamp: DateTime.now().subtract(const Duration(days: 5))),
  CommunityPost(id: '34', author: 'מרים אזולאי', avatar: 'מ', channel: 'המלצות', text: 'רמי לוי cellular 3 קווים ב-₪80 כולל. כן ₪80 לשלושה קווים. המשפחה שלנו חסכה ₪1,440 בשנה. לא להאמין.', likes: 133, replies: 57, timestamp: DateTime.now().subtract(const Duration(days: 6)), isVerified: true),
  CommunityPost(id: '35', author: 'צוות חוסך', avatar: 'ח', channel: 'המלצות', text: '🏆 סיכום שבועי: 892 לקוחות עברו השבוע. Top deal: גולן 400GB ב-₪39. חבילה שנייה פופולרית: HOT fiber 1GB ב-₪89!', likes: 178, replies: 61, timestamp: DateTime.now().subtract(const Duration(days: 8)), isTeam: true),
];
