import 'package:flutter/material.dart';
import 'models.dart';

// ── Categories ────────────────────────────────────────────────────────────────

final List<Category> categories = [
  const Category(id: 'cellular', name: 'סלולר', icon: '📱', currentBill: 119, color: Color(0xFF15603E), planCount: 8, description: 'חבילות סלולר לנייד'),
  const Category(id: 'internet', name: 'אינטרנט', icon: '🌐', currentBill: 140, color: Color(0xFF2563EB), planCount: 6, description: 'אינטרנט ביתי מהיר'),
  const Category(id: 'tv', name: 'טלוויזיה', icon: '📺', currentBill: 130, color: Color(0xFF7C3AED), planCount: 5, description: 'ערוצי טלוויזיה ושידורים'),
  const Category(id: 'triple', name: 'חבילה משולבת', icon: '🏠', currentBill: 260, color: Color(0xFFE07034), planCount: 5, description: 'אינטרנט + טלוויזיה + טלפון'),
  const Category(id: 'abroad', name: 'חבילות חו"ל', icon: '✈️', currentBill: 0, color: Color(0xFF0891B2), planCount: 5, description: 'גלישה ושיחות בחו"ל'),
];

// ── Plans ─────────────────────────────────────────────────────────────────────

const List<Plan> allPlans = [
  // CELLULAR
  Plan(id: 'cel_019', cat: 'cellular', provider: '019 מובייל', net: '4G', plan: '12GB ללא הגבלת שיחות', price: 20, rating: 4.1, reviews: 890, flags: ['nocommit', 'fixed'], feats: ['12GB גלישה', 'שיחות ללא הגבלה', 'SMS ללא הגבלה', 'ללא התחייבות', 'מחיר קבוע לתמיד']),
  Plan(id: 'cel_rami', cat: 'cellular', provider: 'רמי לוי', net: '4G', plan: '20GB ללא הגבלה', price: 29, rating: 4.3, reviews: 2100, flags: ['nocommit', 'fixed'], feats: ['20GB גלישה', 'שיחות ללא הגבלה', 'ניוד מספר חינם', 'שמירת מספר', 'מחיר קבוע']),
  Plan(id: 'cel_golan', cat: 'cellular', provider: 'גולן טלקום', net: '5G', plan: '50GB 5G ללא הגבלה', price: 39, after: 49, intro: '3 חודשים ראשונים', rating: 4.4, reviews: 3200, flags: ['5g', 'nocommit'], feats: ['50GB גלישה', '5G מהיר', 'שיחות ללא הגבלה', 'גיבוי ענן', 'ניוד חינם']),
  Plan(id: 'cel_hot', cat: 'cellular', provider: 'הוט מובייל', net: '5G', plan: '100GB 5G', price: 49, rating: 4.0, reviews: 1560, flags: ['5g', 'nocommit'], feats: ['100GB גלישה', '5G מהיר', 'גלישה בחו"ל 1GB', 'שיחות ללא הגבלה', 'WiFi Calling']),
  Plan(id: 'cel_cellcom', cat: 'cellular', provider: 'סלקום', net: '5G', plan: '200GB 5G ללא הגבלה', price: 59, rating: 4.2, reviews: 4300, flags: ['5g', 'nocommit'], feats: ['200GB גלישה', '5G מהיר', 'שיחות ללא הגבלה', 'חבילת חו"ל בסיסית 1GB', 'צ\'אט תמיכה 24/7']),
  Plan(id: 'cel_partner', cat: 'cellular', provider: 'פרטנר', net: '5G', plan: '500GB 5G + חו"ל', price: 69, rating: 4.3, reviews: 3800, flags: ['5g', 'nocommit', 'abroad'], feats: ['500GB גלישה', '5G', 'גלישה בחו"ל 3GB', 'שיחות ללא הגבלה', 'ש\'אט WhatsApp ללא הגבלה']),
  Plan(id: 'cel_pelephone', cat: 'cellular', provider: 'פלאפון', net: '5G', plan: 'MAX 1000GB 5G פרמיום', price: 79, after: 99, term: 24, rating: 4.4, reviews: 5100, flags: ['5g'], feats: ['1000GB גלישה', '5G פרמיום', '100 דקות בינ"ל', 'ראוטר WiFi 6 חינם', 'ביטוח מסך'], highlight: true, fine: 'מחיר ₪99 לאחר 24 חודשי מבצע'),
  Plan(id: 'cel_spik', cat: 'cellular', provider: 'ספיק', net: '4G', plan: 'Unlimited שיחות + גלישה', price: 35, rating: 3.9, reviews: 650, flags: ['nocommit', 'fixed'], feats: ['גלישה ללא הגבלה (מוגבל לאחר 10GB)', 'שיחות ללא הגבלה', 'ללא התחייבות']),

  // INTERNET
  Plan(id: 'net_bezeq_200', cat: 'internet', provider: 'בזק', net: 'fiber', plan: 'סיב אופטי 200Mb', price: 89, rating: 4.1, reviews: 7200, flags: [], feats: ['200Mb הורדה / 100Mb העלאה', 'סיב אופטי לבית', 'ראוטר WiFi 5 כלול', 'תמיכה טכנית 24/7', 'IP קבוע']),
  Plan(id: 'net_hot_500', cat: 'internet', provider: 'HOT', net: 'cable', plan: 'כבלים 500Mb', price: 99, rating: 3.9, reviews: 5400, flags: [], feats: ['500Mb הורדה', 'כבלים', 'ראוטר WiFi 5 כלול', 'טלפון ביתי אופציונלי']),
  Plan(id: 'net_cellcom_1g', cat: 'internet', provider: 'סלקום', net: 'fiber', plan: 'סיב 1000Mb ללא התחייבות', price: 99, rating: 4.3, reviews: 2800, flags: ['nocommit'], feats: ['1000Mb הורדה', 'ללא התחייבות', 'ראוטר WiFi 6', 'הגדרה עצמאית'], highlight: true),
  Plan(id: 'net_bezeq_1g', cat: 'internet', provider: 'בזק', net: 'fiber', plan: 'סיב אופטי 1000Mb', price: 109, rating: 4.2, reviews: 4100, flags: [], feats: ['1000Mb הורדה/העלאה', 'סיב אופטי', 'ראוטר WiFi 6 כלול', 'עד 4 מכשירים סימולטנית', 'אבטחת רשת']),
  Plan(id: 'net_partner_1g', cat: 'internet', provider: 'פרטנר', net: 'fiber', plan: 'One לייף 1000Mb פרמיום', price: 119, rating: 4.4, reviews: 3200, flags: [], feats: ['1000Mb הורדה/העלאה', 'סיב אופטי', 'ראוטר WiFi 6E', 'IP קבוע', 'גיבוי ענן 100GB', 'מסנן תוכן']),
  Plan(id: 'net_gilat', cat: 'internet', provider: 'גילת', net: 'satellite', plan: 'לווייני 50Mb - פריפריה', price: 149, rating: 3.7, reviews: 680, flags: [], feats: ['50Mb הורדה', 'לווייני', 'כיסוי בכל הארץ כולל פריפריה', 'גם בעמקים ובהרים']),

  // TV
  Plan(id: 'tv_hot_basic', cat: 'tv', provider: 'HOT', net: 'cable', plan: 'כבלים - 70 ערוצים', price: 79, rating: 3.9, reviews: 3400, flags: [], feats: ['70+ ערוצים', 'כבלים', 'VOD בסיסי', 'ממיר SD כלול', 'ערוצי ספורט בסיסיים']),
  Plan(id: 'tv_partner', cat: 'tv', provider: 'פרטנר TV', net: 'streaming', plan: 'סטרימינג 100+ ערוצים', price: 89, rating: 4.1, reviews: 2100, flags: [], feats: ['100+ ערוצים', 'ללא ממיר', 'כל המסכים', 'VOD עשיר', 'ספורט + קולנוע']),
  Plan(id: 'tv_cellcom', cat: 'tv', provider: 'סלקום TV', net: 'streaming', plan: 'סלקום TV פרמיום', price: 99, rating: 4.0, reviews: 1800, flags: [], feats: ['120+ ערוצים', 'ערוצי ספורט', 'VOD עשיר', 'אפליקציה נוחה', 'שידור חי בנייד']),
  Plan(id: 'tv_yes', cat: 'tv', provider: 'yes', net: 'satellite', plan: 'לוויין 140+ ערוצים פרמיום', price: 149, after: 179, term: 24, rating: 4.3, reviews: 5600, flags: [], feats: ['140+ ערוצים', 'ערוצי ספורט', 'קולנוע פרמיום', 'סדרות', 'ממיר 4K כלול'], highlight: true),
  Plan(id: 'tv_freetv', cat: 'tv', provider: 'FreeTV', net: 'streaming', plan: 'ערוצי ציבור - חינם', price: 0, rating: 3.8, reviews: 1200, flags: ['nocommit', 'fixed'], feats: ['ערוצי ציבור', 'ישראל 11, 12, 13, 14', 'ללא תשלום', 'דורש חיבור אינטרנט']),

  // TRIPLE
  Plan(id: 'tri_hot', cat: 'triple', provider: 'HOT', net: 'cable', plan: 'Triple 500Mb + TV 70 ערוצים', price: 149, rating: 3.9, reviews: 2900, flags: [], feats: ['500Mb אינטרנט', '70+ ערוצי TV', 'טלפון ביתי', 'ראוטר + ממיר כלולים', 'חשבון אחד']),
  Plan(id: 'tri_partner', cat: 'triple', provider: 'פרטנר', net: 'fiber', plan: 'One לייף Triple 1000Mb + TV', price: 169, rating: 4.3, reviews: 2200, flags: [], feats: ['1000Mb סיב אופטי', 'TV 100+ ערוצים', 'Netflix חודשי כלול', 'טלפון ביתי', 'ניהול חשבון אחד'], highlight: true),
  Plan(id: 'tri_cellcom', cat: 'triple', provider: 'סלקום', net: 'fiber', plan: 'Tri Pack 1000Mb + TV + סלולר', price: 179, rating: 4.1, reviews: 1800, flags: [], feats: ['1000Mb אינטרנט', 'TV 120+ ערוצים', 'סלולר 100GB', 'ניהול חשבון אחד', 'תמיכה מועדפת']),
  Plan(id: 'tri_yes', cat: 'triple', provider: 'yes + בזק', net: 'fiber', plan: 'לוויין + סיב 1000Mb פרמיום', price: 199, after: 239, term: 24, rating: 4.2, reviews: 1500, flags: [], feats: ['1000Mb סיב בזק', '140+ ערוצי yes', 'טלפון ביתי', 'ממיר 4K', 'שירות פרמיום']),
  Plan(id: 'tri_pelephone', cat: 'triple', provider: 'פלאפון', net: 'fiber', plan: 'Pelephone Home + 5G Triple', price: 189, term: 24, rating: 4.4, reviews: 1200, flags: ['5g'], feats: ['1000Mb סיב', 'TV + ספורט', 'סלולר 500GB 5G', 'ראוטר WiFi 6 + ממיר 4K', 'ניהול מרכזי']),

  // ABROAD
  Plan(id: 'ab_019', cat: 'abroad', provider: '019 מובייל', net: 'international', plan: 'תעריף לדקה - אירופה', price: 1, rating: 3.9, reviews: 450, flags: [], feats: ['₪0.99 לדקה באירופה', '₪1.90 לMB גלישה', 'ללא מנוי חודשי', 'מתאים לנסיעות קצרות']),
  Plan(id: 'ab_golan', cat: 'abroad', provider: 'גולן טלקום', net: 'international', plan: '₪9.90/יום - כל אירופה', price: 10, rating: 4.2, reviews: 890, flags: ['nocommit'], feats: ['גלישה + שיחות ב-₪9.90/יום', 'כל אירופה', 'הפעלה ב-SMS', 'מינימום יום אחד']),
  Plan(id: 'ab_partner', cat: 'abroad', provider: 'פרטנר', net: 'international', plan: 'World Pack 1GB חודשי', price: 29, rating: 4.1, reviews: 1200, flags: ['nocommit'], feats: ['1GB גלישה בחו"ל', '60 דקות שיחות', '90+ מדינות', 'ניתן לביטול חודשי', 'אפליקציה לניהול'], highlight: true),
  Plan(id: 'ab_pelephone', cat: 'abroad', provider: 'פלאפון', net: 'international', plan: 'World 5GB חודשי', price: 49, rating: 4.3, reviews: 980, flags: [], feats: ['5GB גלישה', '200 דקות שיחות', '130+ מדינות', 'שיתוף עד 3 מכשירים', 'אפליקציה למעקב']),
  Plan(id: 'ab_airalo', cat: 'abroad', provider: 'Airalo eSIM', net: 'esim', plan: 'eSIM אירופה 10GB', price: 25, rating: 4.5, reviews: 3400, flags: ['nocommit'], feats: ['10GB גלישה', 'eSIM דיגיטלי', '30+ מדינות אירופה', 'הפעלה מיידית מהאפליקציה', 'ללא כרטיס פיזי']),
];

// ── Helpers ───────────────────────────────────────────────────────────────────

Category? categoryById(String id) {
  try { return categories.firstWhere((c) => c.id == id); } catch (_) { return null; }
}

List<Plan> plansByCat(String cat) => allPlans.where((p) => p.cat == cat).toList();

Plan? planById(String id) {
  try { return allPlans.firstWhere((p) => p.id == id); } catch (_) { return null; }
}

int planSaveYear(Plan p, int currentBill) {
  return ((currentBill - p.price) * 12).clamp(0, 999999);
}

Plan? hotDeal(int currentBill) {
  Plan? best;
  int bestSave = 0;
  for (final p in allPlans.where((p) => p.cat == 'cellular')) {
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
    plans = plans.where((p) => p.provider.contains(q) || p.plan.contains(q)).toList();
  }

  for (final f in filters) {
    switch (f) {
      case '5g': plans = plans.where((p) => p.is5G).toList();
      case 'nocommit': plans = plans.where((p) => p.noCommit).toList();
      case 'fixed': plans = plans.where((p) => p.isFixed).toList();
      case 'abroad': plans = plans.where((p) => p.hasAbroad).toList();
    }
  }

  if (budget > 0) plans = plans.where((p) => p.price <= budget).toList();

  final bill = currentBill ?? 119;
  switch (sort) {
    case 'price': plans.sort((a, b) => a.price.compareTo(b.price));
    case 'save': plans.sort((a, b) => planSaveYear(b, bill).compareTo(planSaveYear(a, bill)));
    default: // 'match' - sort by savings then rating
      plans.sort((a, b) {
        final sc = planSaveYear(b, bill).compareTo(planSaveYear(a, bill));
        return sc != 0 ? sc : b.rating.compareTo(a.rating);
      });
  }

  return plans;
}

// Community posts seed data
List<CommunityPost> get communityPosts => [
  CommunityPost(id: '1', author: 'מאיה כהן', avatar: 'מ', channel: 'המלצות', text: 'עברתי לגולן ב-₪39 במקום ₪119 בפלאפון. חוסך עזר לי עם כל ניתוק. ממליצה בחום!', likes: 34, replies: 8, timestamp: DateTime.now().subtract(const Duration(hours: 2)), isVerified: true),
  CommunityPost(id: '2', author: 'צוות חוסך', avatar: 'ח', channel: 'המלצות', text: '🔥 עסקה חמה: גולן 50GB ב-₪39 - המבצע מסתיים בסוף השבוע. 3 חודשים ראשונים ואז ₪49. עדיין חיסכון של ₪720/שנה!', likes: 89, replies: 23, timestamp: DateTime.now().subtract(const Duration(hours: 5)), isTeam: true, planId: 'cel_golan'),
  CommunityPost(id: '3', author: 'יוסי לוי', avatar: 'י', channel: 'סלולר', text: 'שאלה - מי יותר טוב לגבי כיסוי 5G בחיפה? פרטנר או סלקום?', likes: 12, replies: 15, timestamp: DateTime.now().subtract(const Duration(hours: 8))),
  CommunityPost(id: '4', author: 'רחל אברהם', avatar: 'ר', channel: 'עזרה בניתוק', text: 'פלאפון מסרבים לבצע את הניוד. כבר שבוע. מה עושים?', likes: 5, replies: 19, timestamp: DateTime.now().subtract(const Duration(hours: 12))),
  CommunityPost(id: '5', author: 'דן שפירא', avatar: 'ד', channel: 'אינטרנט', text: 'עברתי לסלקום אינטרנט 1000Mb ב-₪99 ללא התחייבות. מהירות מדהימה! 950Mb בבדיקה.', likes: 27, replies: 6, timestamp: DateTime.now().subtract(const Duration(days: 1))),
  CommunityPost(id: '6', author: 'נועה גרין', avatar: 'נ', channel: 'חבילה משולבת', text: 'חוסך עזר לי לעבור לפרטנר ONE לייף - אינטרנט + TV + Netflix הכל ב-₪169. חסכתי ₪1,100 בשנה!', likes: 41, replies: 11, timestamp: DateTime.now().subtract(const Duration(days: 2)), isVerified: true, planId: 'tri_partner'),
];
