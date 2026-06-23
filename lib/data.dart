import 'package:flutter/material.dart';
import 'models.dart';
import 'theme/app_theme.dart';
import 'data/plans_cellular.dart';
import 'data/plans_internet.dart';
import 'data/plans_tv_triple.dart';
import 'data/plans_electricity.dart';

// ── Categories ────────────────────────────────────────────────────────────────

final List<Category> categories = [
  const Category(id: 'cellular', name: 'סלולר', icon: '📱', currentBill: 119, color: AppColors.primary, planCount: 59, description: 'חבילות סלולר לנייד'),
  const Category(id: 'internet', name: 'אינטרנט', icon: '🌐', currentBill: 140, color: Color(0xFF2563EB), planCount: 30, description: 'אינטרנט ביתי מהיר'),
  const Category(id: 'tv', name: 'טלוויזיה', icon: '📺', currentBill: 130, color: Color(0xFF7C3AED), planCount: 9, description: 'ערוצי טלוויזיה ושידורים'),
  const Category(id: 'triple', name: 'חבילה משולבת', icon: '🏠', currentBill: 260, color: Color(0xFFE07034), planCount: 11, description: 'אינטרנט + טלוויזיה + טלפון'),
  const Category(id: 'abroad', name: 'חבילות חו"ל', icon: '✈️', currentBill: 0, color: Color(0xFF0891B2), planCount: 11, description: 'גלישה ושיחות בחו"ל'),
  const Category(id: 'electricity', name: 'חשמל', icon: '⚡', currentBill: 0, color: Color(0xFFCA8A04), planCount: 5, description: 'ספקי חשמל פרטיים — הנחה על התעריף'),
];

/// The category's monochrome line icon — the brand renders categories with
/// these, never with the legacy `Category.icon` emoji (kept only as data).
/// Mirrors the site's SVG icon set (phone/globe/tv/home/plane).
IconData categoryIconData(String catId) {
  switch (catId) {
    case 'cellular':
      return Icons.smartphone_rounded;
    case 'internet':
      return Icons.wifi_rounded;
    case 'tv':
      return Icons.tv_rounded;
    case 'triple':
      return Icons.home_rounded;
    case 'abroad':
      return Icons.flight_takeoff_rounded;
    case 'electricity':
      return Icons.bolt_rounded;
    default:
      return Icons.category_rounded;
  }
}

// ── Plans ─────────────────────────────────────────────────────────────────────
// Cellular / internet / TV / triple are real provider data, sourced in
// lib/data/plans_*.dart. Abroad (eSIM / roaming) remains a curated seed.

// priceUnit: תעריף לדקה / ליום / מנוי חודשי / חבילה חד-פעמית — אסור לערבב
// אותם באותו מיון מחיר כאילו כולם "לחבילה" (ראו priceUnitLabel למטה).
const List<Plan> abroadPlans = [
  Plan(id: 'ab_019', cat: 'abroad', provider: '019 מובייל', net: 'international', plan: 'תעריף לדקה — אירופה', price: 1, priceUnit: 'minute', rating: 3.9, reviews: 0, flags: [], feats: ['₪0.99 לדקה באירופה', '₪1.90 לMB גלישה', 'ללא מנוי חודשי', 'מתאים לנסיעות קצרות']),
  Plan(id: 'ab_golan', cat: 'abroad', provider: 'גולן טלקום', net: 'international', plan: '₪9.90/יום — כל אירופה', price: 10, priceUnit: 'day', rating: 4.2, reviews: 0, flags: ['nocommit'], feats: ['גלישה + שיחות ב-₪9.90/יום', 'כל אירופה', 'הפעלה ב-SMS', 'מינימום יום אחד']),
  Plan(id: 'ab_partner', cat: 'abroad', provider: 'פרטנר', net: 'international', plan: 'World Pack 1GB חודשי', price: 29, priceUnit: 'month', rating: 4.1, reviews: 0, flags: ['nocommit'], feats: ['1GB גלישה בחו"ל', '60 דקות שיחות', '90+ מדינות', 'ניתן לביטול חודשי'], highlight: true),
  Plan(id: 'ab_pelephone', cat: 'abroad', provider: 'פלאפון', net: 'international', plan: 'World 5GB חודשי', price: 49, priceUnit: 'month', rating: 4.3, reviews: 0, flags: [], feats: ['5GB גלישה', '200 דקות שיחות', '130+ מדינות', 'שיתוף עד 3 מכשירים']),
  Plan(id: 'ab_airalo', cat: 'abroad', provider: 'Airalo eSIM', net: 'esim', plan: 'eSIM אירופה 10GB', price: 25, priceUnit: 'package', rating: 4.5, reviews: 0, flags: ['nocommit'], feats: ['10GB גלישה', 'eSIM דיגיטלי', '30+ מדינות אירופה', 'הפעלה מיידית מהאפליקציה']),
  Plan(id: 'ab_airalo_3g', cat: 'abroad', provider: 'Airalo eSIM', net: 'esim', plan: 'eSIM אירופה 3GB', price: 13, priceUnit: 'package', rating: 4.5, reviews: 0, flags: ['nocommit'], feats: ['3GB גלישה', 'eSIM דיגיטלי', '30+ מדינות אירופה', 'הפעלה מיידית מהאפליקציה', 'מתאים לנסיעה קצרה'], highlight: true),
  Plan(id: 'ab_airalo_global', cat: 'abroad', provider: 'Airalo eSIM', net: 'esim', plan: 'eSIM גלובל 5GB', price: 37, priceUnit: 'package', rating: 4.4, reviews: 0, flags: ['nocommit'], feats: ['5GB גלישה', 'eSIM דיגיטלי', '100+ מדינות ברחבי העולם', 'הפעלה מיידית', 'ניתן להרחבה מהאפליקציה']),
  Plan(id: 'ab_hot', cat: 'abroad', provider: 'הוט מובייל', net: 'international', plan: '₪8.90/יום — אירופה', price: 9, priceUnit: 'day', rating: 4.0, reviews: 0, flags: ['nocommit'], feats: ['גלישה + שיחות ב-₪8.90/יום', 'כל אירופה + ארה"ב', 'הפעלה אוטומטית בנחיתה', 'ניתן לביטול בחזרה']),
  Plan(id: 'ab_partner_3g', cat: 'abroad', provider: 'פרטנר', net: 'international', plan: 'World Pack 3GB חודשי', price: 49, priceUnit: 'month', rating: 4.2, reviews: 0, flags: ['nocommit'], feats: ['3GB גלישה בחו"ל', '120 דקות שיחות', '90+ מדינות', 'שיתוף בין 2 מכשירים'], highlight: true),
  Plan(id: 'ab_cellcom', cat: 'abroad', provider: 'סלקום', net: 'international', plan: '₪7.90/יום — כל אירופה', price: 8, priceUnit: 'day', rating: 4.1, reviews: 0, flags: ['nocommit'], feats: ['גלישה + שיחות ב-₪7.90/יום', 'כל אירופה + טורקיה', 'הפעלה ב-SMS', 'חיסכון מ-30 יום']),
  Plan(id: 'ab_019_world', cat: 'abroad', provider: '019 מובייל', net: 'international', plan: '2GB גלישה חודשי', price: 19, priceUnit: 'month', rating: 3.8, reviews: 0, flags: ['nocommit'], feats: ['2GB גלישה', '60 דקות שיחות', '80+ מדינות', 'ניתן לביטול חודשי']),
];

final List<Plan> allPlans = [
  ...cellularPlans,
  ...internetPlans,
  ...tvPlans,
  ...triplePlans,
  ...abroadPlans,
  ...electricityPlans,
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
      p.provider.toLowerCase().contains(q) ||
      p.plan.toLowerCase().contains(q) ||
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
      // 'match' / default order: best saving first, then editorially-highlighted
      // plans, then cheaper. We deliberately do NOT tie-break on plan.rating —
      // those ratings are placeholders (reviews == 0) and would inject a
      // fabricated signal into the ranking.
      plans.sort((a, b) {
        final sc = saveRank(b).compareTo(saveRank(a));
        if (sc != 0) return sc;
        if (a.highlight != b.highlight) return a.highlight ? -1 : 1;
        return a.price.compareTo(b.price);
      });
  }

  return plans;
}

// Community feed seed.
//
// Intentionally EMPTY. The feed is populated only by real posts coming from the
// backend (and the user's own posts via AppState) — we never ship invented
// "social proof" (fake testimonials, fabricated "X customers saved ₪Y" team
// reports). Until real posts exist the UI shows an honest empty state.
const List<CommunityPost> communityPosts = [];
