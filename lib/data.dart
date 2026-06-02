import 'package:flutter/material.dart';
import 'models.dart';

// ── Categories ────────────────────────────────────────────────────────────────

final List<Category> categories = [
  const Category(id: 'cellular', name: 'סלולר', icon: '📱', currentBill: 119, color: Color(0xFF15603E), planCount: 41, description: 'חבילות סלולר לנייד'),
  const Category(id: 'internet', name: 'אינטרנט', icon: '🌐', currentBill: 140, color: Color(0xFF2563EB), planCount: 21, description: 'אינטרנט ביתי מהיר'),
  const Category(id: 'tv', name: 'טלוויזיה', icon: '📺', currentBill: 130, color: Color(0xFF7C3AED), planCount: 16, description: 'ערוצי טלוויזיה ושידורים'),
  const Category(id: 'triple', name: 'חבילה משולבת', icon: '🏠', currentBill: 260, color: Color(0xFFE07034), planCount: 14, description: 'אינטרנט + טלוויזיה + טלפון'),
  const Category(id: 'abroad', name: 'חבילות חו"ל', icon: '✈️', currentBill: 0, color: Color(0xFF0891B2), planCount: 11, description: 'גלישה ושיחות בחו"ל'),
];

// ── Plans ─────────────────────────────────────────────────────────────────────

const List<Plan> allPlans = [

  // ─── CELLULAR ───────────────────────────────────────────────────────────────

  // פרטנר
  Plan(id: 'cel_partner_prince', cat: 'cellular', provider: 'פרטנר', net: '4G', plan: 'Prince 400GB', price: 35, after: 60, rating: 4.3, reviews: 3800, flags: ['abroad'], feats: ['400GB גלישה', '5G מחודש 13', '3,500 דק׳/SMS', '200 דק׳ חו"ל', 'מעבר: 59.90₪'], fine: '₪40 לקו יחיד. ₪60 מחודש 13'),
  Plan(id: 'cel_partner_queen', cat: 'cellular', provider: 'פרטנר', net: '5G', plan: 'Queen 5G 500GB', price: 40, after: 50, intro: '3 חודשים ראשונים', rating: 4.4, reviews: 2900, flags: ['5g', 'abroad'], feats: ['500GB גלישה', '5G — רשת פרטנר', '5,000 דק׳/SMS', '400 דק׳ חו"ל', 'מעבר: 29.90₪'], fine: '₪50 מחודש 4'),
  Plan(id: 'cel_partner_king', cat: 'cellular', provider: 'פרטנר', net: '5G', plan: 'King 5G 800GB', price: 60, rating: 4.3, reviews: 2400, flags: ['5g', 'nocommit', 'abroad'], feats: ['800GB גלישה', '5G — רשת פרטנר', '6,000 דק׳/SMS', '500 דק׳ חו"ל', 'FunTone + CyberGuard'], highlight: true),
  Plan(id: 'cel_partner_boost', cat: 'cellular', provider: 'פרטנר', net: '5G', plan: 'Boost 5G 1500GB', price: 70, rating: 4.3, reviews: 1800, flags: ['5g', 'nocommit', 'abroad'], feats: ['1,500GB גלישה', '5G — רשת פרטנר', '7,000 דק׳/SMS', '600 דק׳ חו"ל', 'קופון אביזרים ₪100']),
  Plan(id: 'cel_partner_better', cat: 'cellular', provider: 'פרטנר', net: '5G', plan: 'Better Future 5G 2000GB', price: 75, rating: 4.2, reviews: 1200, flags: ['5g', 'nocommit', 'abroad'], feats: ['2,000GB גלישה', '5G — רשת פרטנר', '7,000 דק׳/SMS', '700 דק׳ חו"ל', 'תרומה 10% לצדקה']),

  // פלאפון
  Plan(id: 'cel_pelephone_1000', cat: 'cellular', provider: 'פלאפון', net: '5G', plan: '5G 1000GB', price: 40, after: 70, term: 24, intro: '2 חודשים ראשונים', rating: 4.4, reviews: 5100, flags: ['5g'], feats: ['1,000GB גלישה', '5G פלאפון', '5,000 דק׳/SMS', 'גלישה חופשית באפליקציות', 'שובר ₪100'], fine: '₪50 מחודש 3 עד 24, ₪70 מחודש 25'),
  Plan(id: 'cel_pelephone_400', cat: 'cellular', provider: 'פלאפון', net: '4G', plan: 'משתלמת 4G 400GB', price: 40, after: 70, term: 12, rating: 4.2, reviews: 3200, flags: [], feats: ['400GB גלישה', 'דור 4 פלאפון', '3,500 דק׳/SMS', 'eSIM מיידי'], fine: '₪70 לאחר שנה'),
  Plan(id: 'cel_pelephone_2000', cat: 'cellular', provider: 'פלאפון', net: '5G', plan: 'VIP 2000GB 5G', price: 50, after: 99, term: 24, intro: '2 חודשים ראשונים', rating: 4.4, reviews: 4300, flags: ['5g'], feats: ['2,000GB גלישה', 'תיעדוף 5G', '5,000 דק׳/SMS', 'שובר ₪100'], fine: '₪65 מחודש 3 עד 24, ₪99 מחודש 25'),
  Plan(id: 'cel_pelephone_global', cat: 'cellular', provider: 'פלאפון', net: '5G', plan: 'VIP Global 5G', price: 79, term: 3, rating: 4.3, reviews: 2100, flags: ['5g', 'abroad'], feats: ['5G פרמיום', '10GB גלישה בחו"ל', '100 דק׳ חו"ל', 'עמלת יציאה עד ₪150'], fine: 'חבילת חו"ל ₪50 נוסף לחודש'),

  // סלקום
  Plan(id: 'cel_cellcom_pro1000', cat: 'cellular', provider: 'סלקום', net: '5G', plan: '5G Pro 1000GB', price: 60, rating: 4.2, reviews: 4300, flags: ['5g', 'nocommit', 'abroad'], feats: ['1,000GB גלישה', '5G סלקום', '5,000 דק׳/SMS', '500 דק׳ חו"ל (013)', 'נתיב מהיר ברשת']),
  Plan(id: 'cel_cellcom_basic500', cat: 'cellular', provider: 'סלקום', net: '4G', plan: '4G Basic 500GB', price: 45, rating: 4.0, reviews: 2800, flags: ['nocommit', 'abroad'], feats: ['500GB גלישה', 'דור 4 סלקום', '3,500 דק׳/SMS', '150 דק׳ חו"ל', 'חריגה: 49 אג׳/MB']),
  Plan(id: 'cel_cellcom_800', cat: 'cellular', provider: 'סלקום', net: '5G', plan: '5G 800GB', price: 40, after: 60, rating: 4.2, reviews: 3600, flags: ['5g', 'abroad'], feats: ['800GB גלישה', '5G סלקום', '5,000 דק׳/SMS', '500 דק׳ חו"ל', 'חריגה: 49 אג׳'], fine: '₪60 לאחר תקופת המבצע'),

  // הוט מובייל
  Plan(id: 'cel_hot_ultra2500', cat: 'cellular', provider: 'הוט מובייל', net: '5G', plan: '5G Ultra 2500GB Plus', price: 70, rating: 4.0, reviews: 1560, flags: ['5g', 'nocommit', 'abroad'], feats: ['2,500GB גלישה', '5G הוט', '7,000 דק׳/SMS', '500 דק׳ ל-27 יעדים', 'CyberGuard + חו"ל ₪9.90 כלול']),
  Plan(id: 'cel_hot_ultra3000', cat: 'cellular', provider: 'הוט מובייל', net: '5G', plan: '5G Ultra Premium 3000GB', price: 80, rating: 4.0, reviews: 1200, flags: ['5g', 'nocommit', 'abroad'], feats: ['3,000GB גלישה', 'נתיב מהיר 5G', '10,000 דק׳/SMS', '500 דק׳ חו"ל', 'SIM חינם'], highlight: true),
  Plan(id: 'cel_hot_gen2000', cat: 'cellular', provider: 'הוט מובייל', net: '5G', plan: '5G Gen 2000GB 2026', price: 60, rating: 4.1, reviews: 980, flags: ['5g', 'nocommit', 'abroad'], feats: ['2,000GB גלישה', '5G הוט 2026', '6,000 דק׳/SMS', '300 דק׳ חו"ל', 'SIM חינם']),
  Plan(id: 'cel_hot_data150', cat: 'cellular', provider: 'הוט מובייל', net: '4G', plan: 'Data Only 150GB', price: 22, rating: 3.8, reviews: 650, flags: ['nocommit'], feats: ['150GB גלישה בלבד', 'לטאבלט/מודם/ראוטר', 'SIM עד הבית תוך 3 ימים', 'ללא שיחות']),

  // גולן טלקום
  Plan(id: 'cel_golan_300', cat: 'cellular', provider: 'גולן טלקום', net: '4G', plan: '300GB + חו"ל', price: 35, rating: 4.3, reviews: 3200, flags: ['nocommit', 'abroad'], feats: ['300GB גלישה', 'רשת פרטנר', 'שיחות ללא הגבלה', '240 דק׳ חו"ל']),
  Plan(id: 'cel_golan_400', cat: 'cellular', provider: 'גולן טלקום', net: '4G', plan: '400GB + 1GB חו"ל', price: 39, rating: 4.4, reviews: 4100, flags: ['nocommit', 'abroad'], feats: ['400GB גלישה', 'רשת פרטנר', 'שיחות ללא הגבלה', '1GB גלישה בחו"ל/חודש'], highlight: true),
  Plan(id: 'cel_golan_750', cat: 'cellular', provider: 'גולן טלקום', net: '5G', plan: '750GB 5G', price: 49, rating: 4.4, reviews: 3600, flags: ['5g', 'nocommit', 'abroad'], feats: ['750GB גלישה', 'דור 5 — רשת פרטנר', 'שיחות ללא הגבלה', 'הנחה ₪99 לחבילת חו"ל']),
  Plan(id: 'cel_golan_1500', cat: 'cellular', provider: 'גולן טלקום', net: '4G', plan: '1500GB + שירות תיקונים', price: 49, after: 59, intro: '2 חודשים ראשונים', rating: 4.3, reviews: 2400, flags: ['nocommit', 'abroad'], feats: ['1,500GB גלישה', 'שירות תיקונים כלול', 'שיחות ללא הגבלה'], fine: '₪59 מחודש 3'),

  // רמי לוי — עדכון 02.06.2026
  Plan(id: 'cel_rami_kosher_zol', cat: 'cellular', provider: 'רמי לוי', net: '4G', plan: 'זול כשר', price: 15, after: 18, term: 24, rating: 4.0, reviews: 420, flags: [], feats: ['10,000 דק׳ ברשת', '4,000 דק׳ מחוץ לרשת', 'SMS ללא הגבלה', 'ניוד: 9.90₪ | חיבור: 49₪'], fine: '₪18 לקו לאחר 24 חודשים'),
  Plan(id: 'cel_rami_kosher_max', cat: 'cellular', provider: 'רמי לוי', net: '4G', plan: 'מקס כשר', price: 17, after: 20, term: 24, rating: 4.1, reviews: 540, flags: [], feats: ['10,000 דק׳ ברשת', '5,000 דק׳ מחוץ לרשת', 'SMS ללא הגבלה', 'ניוד: 9.90₪ | חיבור: 49₪'], fine: '₪20 לקו לאחר 24 חודשים'),
  Plan(id: 'cel_rami_duo_cc', cat: 'cellular', provider: 'רמי לוי', net: '4G', plan: 'זוג כרטיס אשראי 250GB', price: 25, term: 24, rating: 4.2, reviews: 980, flags: [], feats: ['250GB גלישה משותפת', '2 קווים — ₪50 סה"כ', '2 חודשים ראשונים חינם', 'חיבור חינם', 'בכרטיס אשראי רמי לוי בלבד'], fine: '₪50 לזוג (₪25 לקו) לכל 24 חודשים'),
  Plan(id: 'cel_rami_duo50', cat: 'cellular', provider: 'רמי לוי', net: '4G', plan: 'זוג 250GB — 2 קווים', price: 25, after: 35, term: 24, rating: 4.3, reviews: 1800, flags: [], feats: ['250GB גלישה משותפת', '2 קווים — ₪50 סה"כ', 'שיחות ללא הגבלה', 'SMS ללא הגבלה', 'ניוד: 29.90₪'], fine: '₪70 לזוג (₪35 לקו) לאחר 24 חודשים'),
  Plan(id: 'cel_rami_xtreme300', cat: 'cellular', provider: 'רמי לוי', net: '4G', plan: 'xtreme 300GB', price: 35, after: 40, term: 24, rating: 4.3, reviews: 2100, flags: [], feats: ['300GB גלישה', 'שיחות ללא הגבלה', 'SMS ללא הגבלה', 'ניוד: 29.90₪ | חיבור: 50.32₪'], fine: '₪40 לחודש לאחר 24 חודשים'),
  Plan(id: 'cel_rami_triple', cat: 'cellular', provider: 'רמי לוי', net: '4G', plan: 'טריפל 600GB — 3 קווים', price: 27, after: 35, term: 24, rating: 4.5, reviews: 870, flags: [], feats: ['600GB גלישה משותפת', '3 קווים — ₪80 סה"כ', 'עד 5,000 דק׳ / 2,500 שיחות', 'שיחות ללא הגבלה', 'ניוד: 29.90₪'], fine: '₪105 ל-3 קווים (₪35 לקו) לאחר 24 חודשים'),
  Plan(id: 'cel_rami_duo55', cat: 'cellular', provider: 'רמי לוי', net: '4G', plan: 'זוג 500GB — 2 קווים', price: 28, after: 35, term: 24, rating: 4.3, reviews: 1600, flags: [], feats: ['500GB גלישה משותפת', '2 קווים — ₪55 סה"כ', 'שיחות ללא הגבלה', 'SMS ללא הגבלה', 'ניוד: 29.90₪'], fine: '₪70 לזוג (₪35 לקו) לאחר 24 חודשים'),
  Plan(id: 'cel_rami_global500', cat: 'cellular', provider: 'רמי לוי', net: '4G', plan: '500GB גלובל + חו"ל', price: 50, after: 55, term: 24, rating: 4.4, reviews: 1200, flags: ['abroad'], feats: ['500GB גלישה', '500 דק׳ לחו"ל דרך 014', 'שיחות ללא הגבלה', 'SMS ללא הגבלה', 'ניוד: 29.90₪'], fine: '₪55 לחודש לאחר 24 חודשים'),
  Plan(id: 'cel_rami_xtreme1000', cat: 'cellular', provider: 'רמי לוי', net: '5G', plan: 'xtreme 1000GB 5G', price: 55, after: 60, term: 24, rating: 4.4, reviews: 1400, flags: ['5g'], feats: ['1,000GB גלישה', 'דור 5 — 5G', 'שיחות ללא הגבלה', 'SMS ללא הגבלה', 'ניוד: 29.90₪ | חיבור: 50.32₪'], fine: '₪60 לחודש לאחר 24 חודשים', highlight: true),

  // Xphone
  Plan(id: 'cel_xphone_forever', cat: 'cellular', provider: 'Xphone', net: '4G', plan: 'Forever Plus', price: 30, rating: 4.3, reviews: 1800, flags: ['nocommit', 'fixed', 'abroad'], feats: ['500GB גלישה', 'מחיר קבוע לנצח', '5,000 דק׳/SMS', '1GB גלישה בחו"ל', 'SIM/eSIM: 4.90₪'], highlight: true),
  Plan(id: 'cel_xphone_forever5g', cat: 'cellular', provider: 'Xphone', net: '5G', plan: 'Forever Plus 5G', price: 35, rating: 4.4, reviews: 1400, flags: ['nocommit', 'fixed', '5g', 'abroad'], feats: ['500GB גלישה 5G', 'מחיר קבוע לנצח', 'שיחות ללא הגבלה', '1GB גלישה בחו"ל']),
  Plan(id: 'cel_xphone_zobar500', cat: 'cellular', provider: 'Xphone', net: '4G', plan: 'צוברים 500GB', price: 30, after: 40, term: 12, rating: 4.1, reviews: 960, flags: ['abroad'], feats: ['500GB גלישה', 'צבירת גיגות לחו"ל', '1GB גלישה בחו"ל/חודש', 'שיחות ללא הגבלה'], fine: '₪40 מחודש 13'),
  Plan(id: 'cel_xphone_global5g', cat: 'cellular', provider: 'Xphone', net: '5G', plan: 'Global 5G', price: 55, rating: 4.3, reviews: 780, flags: ['nocommit', 'fixed', '5g', 'abroad'], feats: ['גלישה ללא הגבלה 5G', '5GB גלישה בחו"ל', 'שיחות ללא הגבלה', 'מחיר קבוע', 'מעבר: 39.90₪']),

  // ויקום (Wecom)
  Plan(id: 'cel_wecom_family', cat: 'cellular', provider: 'ויקום', net: '4G', plan: 'Free Family', price: 30, rating: 4.0, reviews: 820, flags: ['nocommit', 'abroad'], feats: ['10,000GB (שימוש הוגן)', 'דור 4', '5,000 דק׳ / 3,000 SMS', 'ללא דמי חיבור', 'חריגה: 0.20₪/דקה'], fine: '₪35 לקו יחיד'),
  Plan(id: 'cel_wecom_free5g', cat: 'cellular', provider: 'ויקום', net: '5G', plan: 'Free 5G', price: 35, rating: 4.1, reviews: 640, flags: ['5g'], feats: ['10,000GB דור 5', '5,000 דק׳', 'גלישה ללא הגבלה', 'יש דמי חיבור']),
  Plan(id: 'cel_wecom_global5g', cat: 'cellular', provider: 'ויקום', net: '5G', plan: 'Global 5G', price: 60, rating: 4.1, reviews: 420, flags: ['5g', 'abroad'], feats: ['10,000GB דור 5', '5,000 דק׳', '5GB גלישה בחו"ל', 'מעבר: 79.90₪']),

  // וואלה מובייל
  Plan(id: 'cel_walla_power', cat: 'cellular', provider: 'וואלה מובייל', net: '5G', plan: 'Power 5G 400GB', price: 40, term: 24, rating: 4.1, reviews: 1100, flags: ['5g'], feats: ['400GB גלישה', '5G — רשת הוט מובייל', 'שיחות ללא הגבלה', 'מחיר קבוע לשנתיים']),
  Plan(id: 'cel_walla_family', cat: 'cellular', provider: 'וואלה מובייל', net: '4G', plan: 'Family 300GB — 3 קווים', price: 25, term: 12, rating: 4.0, reviews: 680, flags: [], feats: ['300GB גלישה משותפת', '3 קווים — ₪75 סה"כ', 'חודש ראשון חינם', 'שיחות ללא הגבלה'], fine: '₪75 לשנה ל-3 קווים. חודש 1 חינם'),

  // 019 מובייל
  Plan(id: 'cel_019_bigdata', cat: 'cellular', provider: '019 מובייל', net: '4G', plan: 'Big Data 300GB', price: 40, rating: 4.1, reviews: 890, flags: ['nocommit', 'fixed'], feats: ['300GB גלישה', 'מחיר קבוע', 'שיחות ללא הגבלה', 'SIM: 10₪ | eSIM חינם']),
  Plan(id: 'cel_019_weit', cat: 'cellular', provider: '019 מובייל', net: '4G', plan: 'We It 100GB', price: 30, after: 40, term: 36, rating: 4.0, reviews: 720, flags: ['abroad'], feats: ['100GB גלישה', '100 דק׳ חו"ל', 'שיחות ללא הגבלה'], fine: '₪40 לאחר 3 שנים'),
  Plan(id: 'cel_019_hagzamnu', cat: 'cellular', provider: '019 מובייל', net: '5G', plan: 'הגזמנו 170GB 5G', price: 26, rating: 4.2, reviews: 1100, flags: ['nocommit', 'fixed', '5g'], feats: ['170GB גלישה', 'דור 5 — רשת פלאפון', 'מחיר קבוע', 'שיחות ללא הגבלה']),

  // ─── INTERNET ────────────────────────────────────────────────────────────────

  // בזק
  Plan(id: 'net_bezeq_300f', cat: 'internet', provider: 'בזק', net: 'fiber', plan: 'bfiber 300 מגה', price: 109, rating: 4.1, reviews: 5200, flags: [], feats: ['300Mb הורדה', 'סיב אופטי בזק', 'נתב שכירות +19.90₪', 'התקנה חינם (תשתית קיימת)']),
  Plan(id: 'net_bezeq_1g', cat: 'internet', provider: 'בזק', net: 'fiber', plan: 'bfiber 1 ג׳יגה', price: 99, after: 159, rating: 4.2, reviews: 7200, flags: [], feats: ['1,000Mb הורדה', 'סיב אופטי בזק', 'נתב שכירות +19.90₪', '6 חודשים ראשונים ₪99'], fine: '₪119 ח׳ 7–12, ₪159 ח׳ 13–36, ₪180 מח׳ 37'),
  Plan(id: 'net_bezeq_2g5', cat: 'internet', provider: 'בזק', net: 'fiber', plan: 'bfiber 2.5 ג׳יגה', price: 125, after: 219, rating: 4.2, reviews: 3800, flags: [], feats: ['2,500Mb הורדה/העלאה', 'סיב אופטי בזק', 'נתב שכירות +19.90₪', 'מחיר ₪125 לשנה'], fine: '₪219 מחודש 13, ₪240 מחודש 37'),
  Plan(id: 'net_bezeq_5g', cat: 'internet', provider: 'בזק', net: 'fiber', plan: 'multi bfiber 5 ג׳יגה', price: 179, rating: 4.3, reviews: 1800, flags: ['fixed'], feats: ['5,000Mb הורדה/העלאה', 'סיב אופטי', 'נתב שכירות +39.90₪', 'מחיר קבוע לשנה'], highlight: true),
  Plan(id: 'net_bezeq_200c', cat: 'internet', provider: 'בזק', net: 'adsl', plan: 'אינטרנט 200 מגה (נחושת)', price: 109, after: 130, rating: 3.8, reviews: 4100, flags: [], feats: ['200Mb הורדה', 'רשת נחושת', 'התקנה: 49₪', 'ללא נתב'], fine: '₪130 ח׳ 13–36, ₪166 מח׳ 37'),

  // סלקום
  Plan(id: 'net_cellcom_2g5', cat: 'internet', provider: 'סלקום', net: 'fiber', plan: 'fiber 2.5 ג׳יגה', price: 99, after: 149, rating: 4.3, reviews: 2800, flags: [], feats: ['2,500Mb הורדה', 'סיב אופטי סלקום', 'נקודת רשת בממ"ד חינם', 'נתב +29.90₪'], fine: '₪129 ח׳ 6–12, ₪149 שנה 2'),
  Plan(id: 'net_cellcom_1g', cat: 'internet', provider: 'סלקום', net: 'fiber', plan: 'fiber 1 ג׳יגה', price: 109, after: 129, rating: 4.3, reviews: 4100, flags: [], feats: ['1,000Mb הורדה', 'סיב אופטי סלקום', 'נקודת רשת בממ"ד חינם', 'נתב כלול', 'התקנה מהיום למחר'], fine: '₪129 מחודש 13'),

  // פרטנר
  Plan(id: 'net_partner_600', cat: 'internet', provider: 'פרטנר', net: 'fiber', plan: 'fiber 600 מגה', price: 69, after: 100, intro: '2 חודשים ראשונים', rating: 4.2, reviews: 2100, flags: [], feats: ['600Mb הורדה', 'סיב אופטי', 'WiFi 7 +25₪', 'התקנה חינם בדירה'], fine: '₪100 מחודש 3'),
  Plan(id: 'net_partner_1g', cat: 'internet', provider: 'פרטנר', net: 'fiber', plan: 'fiber 1,000 מגה', price: 39, after: 139, intro: '2 חודשים ראשונים', rating: 4.4, reviews: 3200, flags: [], feats: ['1,000Mb הורדה/העלאה', 'WiFi 7 כלול', 'CyberGuard +4.90₪', 'התקנה חינם בדירה'], fine: '₪139 ח׳ 3–12, ₪159 מח׳ 13', highlight: true),
  Plan(id: 'net_partner_2g5', cat: 'internet', provider: 'פרטנר', net: 'fiber', plan: 'fiber 2,500 מגה', price: 149, after: 169, term: 18, rating: 4.4, reviews: 1600, flags: [], feats: ['2,500Mb הורדה', 'WiFi 7 כלול', 'Easy Mesh +9.90₪', 'CyberGuard +4.90₪'], fine: '₪169 מחודש 19'),

  // גולן
  Plan(id: 'net_golan', cat: 'internet', provider: 'גולן טלקום', net: 'fiber', plan: 'אינטרנט סיבים 1GB', price: 89, rating: 4.2, reviews: 1400, flags: [], feats: ['1,000Mb הורדה', 'תשתית סלקום', 'נתב +25₪/חודש', 'שובר Wolt ₪100 מתנה']),

  // HOT
  Plan(id: 'net_hot_1g_hbo', cat: 'internet', provider: 'HOT', net: 'fiber', plan: '1000mb + HBO Max', price: 55, after: 109, intro: '3 חודשים ראשונים (50%)', rating: 4.0, reviews: 2400, flags: [], feats: ['1,000Mb סיב אופטי', 'HBO Max כלול', 'מגדיל + נקודת רשת', 'התקנה חינם בדירה'], fine: '₪109 מחודש 4'),
  Plan(id: 'net_hot_600', cat: 'internet', provider: 'HOT', net: 'fiber', plan: '600mb Fiber AI', price: 99, rating: 4.0, reviews: 3100, flags: ['fixed'], feats: ['600Mb סיב אופטי', 'Fiber AI', 'מגדיל מתקדם + נקודת רשת', 'רכישת ציוד עצמאי = -₪40/ח׳']),
  Plan(id: 'net_hot_homeplus', cat: 'internet', provider: 'HOT', net: 'fiber', plan: 'Home Plus 1000mb', price: 124, rating: 4.1, reviews: 1800, flags: ['fixed'], feats: ['1,000Mb סיב אופטי', 'HBO Max כלול', 'נתב חכם + 2 מגדילים + 2 נקודות', 'התקנה חינם בדירה'], highlight: true),

  // CCC
  Plan(id: 'net_ccc_1g', cat: 'internet', provider: 'CCC', net: 'fiber', plan: 'פייבר 1000 מגה', price: 100, rating: 4.0, reviews: 680, flags: ['fixed'], feats: ['1,000Mb הורדה', 'תשתית בזק', 'נתב: 32₪ (איסוף/שליח)', 'ללקוחות תשתית בזק']),

  // גילת
  Plan(id: 'net_gilat_fixed', cat: 'internet', provider: 'גילת', net: 'fiber', plan: '1GB מחיר קבוע לנצח', price: 95, rating: 4.1, reviews: 1200, flags: ['fixed'], feats: ['1,000Mb הורדה', 'מחיר קבוע לכל החיים', 'נתב סיבים כלול', 'WiFi 7 +10₪'], highlight: true),
  Plan(id: 'net_gilat_1g', cat: 'internet', provider: 'גילת', net: 'fiber', plan: '1GB ראשון חינם', price: 79, after: 109, term: 12, rating: 4.0, reviews: 860, flags: [], feats: ['1,000Mb הורדה', 'תשתית בזק', 'נתב כלול', 'WiFi 7 +24.90₪/ח׳'], fine: '₪109 מחודש 13'),
  Plan(id: 'net_gilat_online', cat: 'internet', provider: 'גילת', net: 'fiber', plan: '1GB — מחיר אונליין', price: 49, after: 95, intro: '3 חודשים ראשונים', rating: 4.1, reviews: 1100, flags: [], feats: ['1,000Mb הורדה', 'נתב כלול', 'WiFi 7 +24.90₪/ח׳', 'תשתית בזק'], fine: '₪95 קבוע מחודש 4'),

  // Xphone
  Plan(id: 'net_xphone_1g', cat: 'internet', provider: 'Xphone', net: 'fiber', plan: '1,000 מגה קבוע', price: 122, rating: 4.0, reviews: 480, flags: ['fixed'], feats: ['1,000Mb הורדה', 'תשתית בזק', 'Mesh: 2 חודשים חינם', 'מחיר קבוע', 'נתב שכירות 25₪']),
  Plan(id: 'net_019_1g', cat: 'internet', provider: '019 מובייל', net: 'fiber', plan: 'סיבים 1000 מגה', price: 89, after: 109, term: 12, rating: 4.0, reviews: 620, flags: [], feats: ['1,000Mb הורדה', 'תשתית HOT', 'נתב כלול', 'גיגה לסלולר כמתנה לחודש ראשון'], fine: '₪109 מחודש 13'),
  Plan(id: 'net_hot_2g5', cat: 'internet', provider: 'HOT', net: 'fiber', plan: '2500mb Fiber AI', price: 149, rating: 4.1, reviews: 1500, flags: ['fixed'], feats: ['2,500Mb הורדה/העלאה', 'Fiber AI מגדיל חכם', '2 נקודות רשת', 'נתב HOT חינם', 'מחיר קבוע'], highlight: true),

  // ─── TV ──────────────────────────────────────────────────────────────────────

  Plan(id: 'tv_hot_140', cat: 'tv', provider: 'HOT', net: 'cable', plan: 'HOT TV 140 ערוצים', price: 89, rating: 4.0, reviews: 3400, flags: ['fixed'], feats: ['140+ ערוצים', 'VOD עשיר', 'HBO Max חינם 3 ח׳ אז 25₪', '2 סטרימרים חינם לשנה']),
  Plan(id: 'tv_nexttv', cat: 'tv', provider: 'NextTV', net: 'streaming', plan: 'אפליקציית NextTV', price: 70, rating: 3.9, reviews: 980, flags: ['nocommit', 'fixed'], feats: ['TV בסטרימינג', 'סטרימר השכרה 24.90₪/ח׳', 'VOD', 'עד 5 מכשירים / 3 בו-זמנית'], fine: 'דמי מנוי 15.03₪ + משלוח 20₪'),
  Plan(id: 'tv_partner', cat: 'tv', provider: 'פרטנר TV', net: 'streaming', plan: 'סטרימינג 100+ ערוצים', price: 89, rating: 4.1, reviews: 2100, flags: ['nocommit'], feats: ['100+ ערוצים', 'ללא ממיר', 'כל המסכים', 'VOD עשיר', 'ספורט + קולנוע']),
  Plan(id: 'tv_cellcom', cat: 'tv', provider: 'סלקום TV', net: 'streaming', plan: 'סלקום TV פרמיום', price: 99, rating: 4.0, reviews: 1800, flags: ['nocommit'], feats: ['120+ ערוצים', 'ערוצי ספורט', 'VOD עשיר', 'אפליקציה נוחה', 'שידור חי בנייד']),
  Plan(id: 'tv_yes', cat: 'tv', provider: 'yes', net: 'satellite', plan: 'לוויין 140+ ערוצים פרמיום', price: 149, after: 179, term: 24, rating: 4.3, reviews: 5600, flags: [], feats: ['140+ ערוצים', 'ערוצי ספורט', 'קולנוע פרמיום', 'Netflix / HBO Max / דיסני+ (3 ח׳)', 'ממיר 4K כלול'], highlight: true),
  Plan(id: 'tv_freetv', cat: 'tv', provider: 'FreeTV', net: 'streaming', plan: 'ערוצי ציבור — חינם', price: 0, rating: 3.8, reviews: 1200, flags: ['nocommit', 'fixed'], feats: ['ערוצי ציבור', 'ישראל 11, 12, 13, 14', 'ללא תשלום', 'דורש חיבור אינטרנט']),
  Plan(id: 'tv_hot_basic', cat: 'tv', provider: 'HOT', net: 'cable', plan: 'HOT TV 80 ערוצים', price: 59, rating: 3.8, reviews: 2100, flags: ['fixed'], feats: ['80+ ערוצים', 'VOD בסיסי', 'ממיר אחד', 'ערוצי חדשות + ספורט']),
  Plan(id: 'tv_hot_sport', cat: 'tv', provider: 'HOT', net: 'cable', plan: 'HOT Sport פרמיום', price: 119, rating: 4.2, reviews: 1900, flags: ['fixed'], feats: ['140+ ערוצים', 'ערוצי ספורט + Sport1', 'VOD', 'NBA League Pass (3 ח׳)', 'FIFA World Cup 4K'], highlight: true),
  Plan(id: 'tv_yes_basic', cat: 'tv', provider: 'yes', net: 'satellite', plan: 'לוויין Basic 80 ערוצים', price: 89, rating: 4.0, reviews: 2800, flags: [], feats: ['80+ ערוצים', 'חדשות + סדרות + ספורט', 'ממיר HD', 'VOD בסיסי'], fine: 'ממיר מחיר השכרה 15₪/חודש'),
  Plan(id: 'tv_cellcom_basic', cat: 'tv', provider: 'סלקום TV', net: 'streaming', plan: 'סלקום TV Basic', price: 59, rating: 3.9, reviews: 1400, flags: ['nocommit'], feats: ['80+ ערוצים', 'VOD בסיסי', 'ללא ממיר', 'שידור בנייד ובטלוויזיה']),
  Plan(id: 'tv_partner_sport', cat: 'tv', provider: 'פרטנר TV', net: 'streaming', plan: 'ספורט פרמיום', price: 129, rating: 4.3, reviews: 1600, flags: ['nocommit'], feats: ['100+ ערוצים', 'Sport1 + Sport5', 'Premier League + גביע', 'NBA + Euro League', 'VOD ספורט'], highlight: true),
  Plan(id: 'tv_partner_lite', cat: 'tv', provider: 'פרטנר TV', net: 'streaming', plan: 'Partner TV Lite', price: 49, rating: 3.9, reviews: 860, flags: ['nocommit'], feats: ['60+ ערוצים', 'ערוצי בסיס + ילדים', 'VOD בסיסי', 'עד 2 מכשירים', 'ללא ממיר']),
  Plan(id: 'tv_hot_cinema', cat: 'tv', provider: 'HOT', net: 'cable', plan: 'HOT Cinema קולנוע פרמיום', price: 79, rating: 4.1, reviews: 1300, flags: ['fixed'], feats: ['120+ ערוצים', 'HBO Max 3 חודשים חינם', 'ערוצי קולנוע פרמיום', '2 ממירים HD', 'VOD עשיר + סדרות']),
  Plan(id: 'tv_yes_family', cat: 'tv', provider: 'yes', net: 'satellite', plan: 'לוויין Family 120 ערוצים', price: 109, rating: 4.1, reviews: 3100, flags: [], feats: ['120+ ערוצים', 'ספורט + ילדים + קולנוע', 'ממיר HD', 'VOD + catch-up 7 ימים', 'YouTube ב-TV'], fine: 'ממיר השכרה 15₪/חודש'),
  Plan(id: 'tv_yes_start', cat: 'tv', provider: 'yes', net: 'satellite', plan: 'לוויין Start 60 ערוצים', price: 69, rating: 3.9, reviews: 1900, flags: [], feats: ['60+ ערוצים', 'ערוצי חדשות + ילדים', 'ממיר HD בסיסי', 'VOD בסיסי'], fine: 'ממיר השכרה 15₪/חודש'),
  Plan(id: 'tv_yes_sport', cat: 'tv', provider: 'yes', net: 'satellite', plan: 'לוויין Sport 100 ערוצים', price: 129, rating: 4.2, reviews: 2200, flags: [], feats: ['100+ ערוצים', 'ספורט פרמיום — Sport1+5', 'Premier League + NBA + Liga', 'ממיר HD + VOD ספורט', 'catch-up 7 ימים'], fine: 'ממיר השכרה 15₪/חודש', highlight: true),

  // ─── TRIPLE ──────────────────────────────────────────────────────────────────

  Plan(id: 'tri_hot_bestseller', cat: 'triple', provider: 'HOT', net: 'fiber', plan: 'טריפל 1000mb — Best Seller', price: 84, after: 169, intro: '3 חודשים ראשונים', rating: 4.0, reviews: 2900, flags: ['nocommit'], feats: ['1,000Mb סיב אופטי Fiber AI', '140+ ערוצי TV', 'טלפון ביתי', '2 סטרימרים חינם לשנה', 'ללא התחייבות'], fine: '₪169 מחודש 4 + חבילת דרמות במחיר מחירון'),
  Plan(id: 'tri_hot_hbomax', cat: 'triple', provider: 'HOT', net: 'fiber', plan: 'טריפל HBO Max', price: 199, rating: 4.1, reviews: 2200, flags: ['fixed'], feats: ['1,000Mb סיב אופטי', '140 ערוצים + VOD', 'HBO Max (3 ח׳ חינם אז 25₪)', '12 ערוצי דרמות', '2 סטרימרים + נתב חכם + מגדיל'], fine: 'HBO Max מחודש 4: 25₪×9 חודשים'),
  Plan(id: 'tri_nexttv_2g', cat: 'triple', provider: 'NextTV', net: 'fiber', plan: 'סיבים 2GB + NextTV', price: 164, rating: 4.2, reviews: 1400, flags: ['fixed'], feats: ['2,000Mb סיב אופטי', 'NextTV + 12 ערוצי דרמות', 'HBO Max (3 ח׳ חינם)', 'סטרימר חינם לשנה', '5 מכשירים / 3 בו-זמנית']),
  Plan(id: 'tri_nexttv_1g', cat: 'triple', provider: 'NextTV', net: 'fiber', plan: 'סיבים 1GB + NextTV', price: 119, rating: 4.1, reviews: 1100, flags: [], feats: ['1,000Mb סיב אופטי', 'NextTV + ערוצי דרמות (מח׳ 4)', 'סטרימר חינם לשנה', 'התקנה חינם']),
  Plan(id: 'tri_partner_1g_tv', cat: 'triple', provider: 'פרטנר', net: 'fiber', plan: 'טריפל 1000mb + Partner TV', price: 175, after: 195, term: 18, rating: 4.3, reviews: 2200, flags: [], feats: ['1,000Mb סיב', 'Partner TV', '2 ממירים + נתב WiFi 7', 'טלפון ביתי', 'CyberGuard +4.90₪'], fine: '₪120 חודש ראשון, ₪195 מחודש 19'),
  Plan(id: 'tri_partner_1g_nflx', cat: 'triple', provider: 'פרטנר', net: 'fiber', plan: 'טריפל 1000mb + Netflix', price: 215, after: 235, term: 18, rating: 4.4, reviews: 1900, flags: [], feats: ['1,000Mb סיב', 'Netflix כלול', '2 ממירים + WiFi 7', 'טלפון ביתי', 'CyberGuard +4.90₪'], fine: '₪160 חודש ראשון, ₪235 מחודש 19', highlight: true),
  Plan(id: 'tri_partner_1g_fixed', cat: 'triple', provider: 'פרטנר', net: 'fiber', plan: 'טריפל 1000mb קבוע 3 שנים', price: 189, after: 249, term: 36, rating: 4.2, reviews: 1400, flags: [], feats: ['1,000Mb סיב', 'TV + 2 ממירים + WiFi 7', 'מחיר קבוע 3 שנים', 'CyberGuard +4.90₪'], fine: '₪249 מחודש 37'),
  Plan(id: 'tri_partner_2g5', cat: 'triple', provider: 'פרטנר', net: 'fiber', plan: 'טריפל 2.5gb', price: 199, after: 219, term: 18, rating: 4.3, reviews: 1600, flags: [], feats: ['2,500Mb סיב', 'TV + 2 ממירים + WiFi 7', 'טלפון ביתי', 'CyberGuard +4.90₪'], fine: '₪219 מחודש 19'),
  Plan(id: 'tri_partner_sport', cat: 'triple', provider: 'פרטנר', net: 'fiber', plan: 'טריפל 1000mb + ספורט פרמיום', price: 215, after: 235, term: 18, rating: 4.3, reviews: 1100, flags: [], feats: ['1,000Mb סיב', 'ספורט פרמיום', 'WiFi 7 + ממיר + מגדיל', 'CyberGuard', 'תרומה ₪10/חודש'], fine: '₪235 מחודש 19'),
  Plan(id: 'tri_cellcom_2g5', cat: 'triple', provider: 'סלקום', net: 'fiber', plan: 'טריפל 2.5gb', price: 179, after: 199, rating: 4.1, reviews: 1800, flags: [], feats: ['2,500Mb סיב', '2 ממירי מאסטרבוקס', 'נתב +29.90₪/חודש', 'טלפון ביתי'], fine: '₪199 מחודש 13'),
  Plan(id: 'tri_cellcom_1g_hisense', cat: 'triple', provider: 'סלקום', net: 'fiber', plan: 'טריפל 1GB + מסך Hisense 55"', price: 189, rating: 4.2, reviews: 1400, flags: ['fixed'], feats: ['1,000Mb סיב', 'מסך Hisense QLED 55" כלול', '3 ממירים', 'ספורט 1 + 5', 'מונדיאל']),
  Plan(id: 'tri_cellcom_1g_proj', cat: 'triple', provider: 'סלקום', net: 'fiber', plan: 'טריפל 1GB + מקרן וידאו', price: 159, rating: 4.1, reviews: 980, flags: ['fixed'], feats: ['1,000Mb סיב', 'מקרן כדורגל חכם', '3 ממירים', 'ספורט 1+5', 'נתב +20₪'], fine: 'מקרן: 10₪×36 חודשים'),
  Plan(id: 'tri_golan', cat: 'triple', provider: 'גולן טלקום', net: 'fiber', plan: 'הטריפל המושלם', price: 139, rating: 4.3, reviews: 1200, flags: [], feats: ['1,000Mb סיב (תשתית סלקום)', 'סלקום TV', 'נתב +25₪/חודש', 'שובר Wolt ₪100 מתנה', '100Mb העלאה']),
  Plan(id: 'tri_yes', cat: 'triple', provider: 'yes + בזק', net: 'fiber', plan: 'לוויין + סיב 1000mb פרמיום', price: 199, after: 239, term: 24, rating: 4.2, reviews: 1500, flags: [], feats: ['1,000Mb סיב בזק', '140+ ערוצי yes', 'טלפון ביתי', 'ממיר 4K', 'Netflix / HBO Max / דיסני+ (3 ח׳)'], fine: '₪239 מחודש 25'),

  // ─── ABROAD ──────────────────────────────────────────────────────────────────

  Plan(id: 'ab_019', cat: 'abroad', provider: '019 מובייל', net: 'international', plan: 'תעריף לדקה — אירופה', price: 1, rating: 3.9, reviews: 450, flags: [], feats: ['₪0.99 לדקה באירופה', '₪1.90 לMB גלישה', 'ללא מנוי חודשי', 'מתאים לנסיעות קצרות']),
  Plan(id: 'ab_golan', cat: 'abroad', provider: 'גולן טלקום', net: 'international', plan: '₪9.90/יום — כל אירופה', price: 10, rating: 4.2, reviews: 890, flags: ['nocommit'], feats: ['גלישה + שיחות ב-₪9.90/יום', 'כל אירופה', 'הפעלה ב-SMS', 'מינימום יום אחד']),
  Plan(id: 'ab_partner', cat: 'abroad', provider: 'פרטנר', net: 'international', plan: 'World Pack 1GB חודשי', price: 29, rating: 4.1, reviews: 1200, flags: ['nocommit'], feats: ['1GB גלישה בחו"ל', '60 דקות שיחות', '90+ מדינות', 'ניתן לביטול חודשי'], highlight: true),
  Plan(id: 'ab_pelephone', cat: 'abroad', provider: 'פלאפון', net: 'international', plan: 'World 5GB חודשי', price: 49, rating: 4.3, reviews: 980, flags: [], feats: ['5GB גלישה', '200 דקות שיחות', '130+ מדינות', 'שיתוף עד 3 מכשירים']),
  Plan(id: 'ab_airalo', cat: 'abroad', provider: 'Airalo eSIM', net: 'esim', plan: 'eSIM אירופה 10GB', price: 25, rating: 4.5, reviews: 3400, flags: ['nocommit'], feats: ['10GB גלישה', 'eSIM דיגיטלי', '30+ מדינות אירופה', 'הפעלה מיידית מהאפליקציה']),
  Plan(id: 'ab_airalo_3g', cat: 'abroad', provider: 'Airalo eSIM', net: 'esim', plan: 'eSIM אירופה 3GB', price: 13, rating: 4.5, reviews: 2100, flags: ['nocommit'], feats: ['3GB גלישה', 'eSIM דיגיטלי', '30+ מדינות אירופה', 'הפעלה מיידית מהאפליקציה', 'מתאים לנסיעה קצרה'], highlight: true),
  Plan(id: 'ab_airalo_global', cat: 'abroad', provider: 'Airalo eSIM', net: 'esim', plan: 'eSIM גלובל 5GB', price: 37, rating: 4.4, reviews: 1800, flags: ['nocommit'], feats: ['5GB גלישה', 'eSIM דיגיטלי', '100+ מדינות ברחבי העולם', 'הפעלה מיידית', 'ניתן להרחבה מהאפליקציה']),
  Plan(id: 'ab_hot', cat: 'abroad', provider: 'הוט מובייל', net: 'international', plan: '₪8.90/יום — אירופה', price: 9, rating: 4.0, reviews: 760, flags: ['nocommit'], feats: ['גלישה + שיחות ב-₪8.90/יום', 'כל אירופה + ארה"ב', 'הפעלה אוטומטית בנחיתה', 'ניתן לביטול בחזרה']),
  Plan(id: 'ab_partner_3g', cat: 'abroad', provider: 'פרטנר', net: 'international', plan: 'World Pack 3GB חודשי', price: 49, rating: 4.2, reviews: 890, flags: ['nocommit'], feats: ['3GB גלישה בחו"ל', '120 דקות שיחות', '90+ מדינות', 'שיתוף בין 2 מכשירים'], highlight: true),
  Plan(id: 'ab_cellcom', cat: 'abroad', provider: 'סלקום', net: 'international', plan: '₪7.90/יום — כל אירופה', price: 8, rating: 4.1, reviews: 1100, flags: ['nocommit'], feats: ['גלישה + שיחות ב-₪7.90/יום', 'כל אירופה + טורקיה', 'הפעלה ב-SMS', 'חיסכון מ-30 יום']),
  Plan(id: 'ab_019_world', cat: 'abroad', provider: '019 מובייל', net: 'international', plan: '2GB גלישה חודשי', price: 19, rating: 3.8, reviews: 340, flags: ['nocommit'], feats: ['2GB גלישה', '60 דקות שיחות', '80+ מדינות', 'ניתן לביטול חודשי']),
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
      case '1g': plans = plans.where((p) => p.net == 'fiber' && (p.plan.contains('1000') || p.plan.contains('2000') || p.plan.contains('2500') || p.plan.contains('5000') || p.plan.contains('ג׳יגה') || p.feats.any((f) => f.startsWith('1,000Mb') || f.startsWith('2,000Mb') || f.startsWith('2,500Mb') || f.startsWith('5,000Mb')))).toList();
      case 'streaming': plans = plans.where((p) => p.net == 'streaming').toList();
      case 'sport': plans = plans.where((p) => p.feats.any((f) => f.contains('ספורט'))).toList();
      case 'satellite': plans = plans.where((p) => p.net == 'satellite').toList();
      case 'netflix': plans = plans.where((p) => p.feats.any((f) => f.contains('Netflix'))).toList();
      case 'esim': plans = plans.where((p) => p.net == 'esim').toList();
      case 'kosher': plans = plans.where((p) => p.plan.contains('כשר')).toList();
    }
  }

  if (budget > 0) plans = plans.where((p) => p.price <= budget).toList();

  final bill = currentBill ?? 119;
  switch (sort) {
    case 'price': plans.sort((a, b) => a.price.compareTo(b.price));
    case 'save': plans.sort((a, b) => planSaveYear(b, bill).compareTo(planSaveYear(a, bill)));
    default:
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
  CommunityPost(id: '2', author: 'צוות חוסך', avatar: 'ח', channel: 'המלצות', text: '🔥 עסקה חמה: גולן 400GB ב-₪39 כולל 1GB חו"ל. עדיין חיסכון של ₪720/שנה!', likes: 89, replies: 23, timestamp: DateTime.now().subtract(const Duration(hours: 5)), isTeam: true, planId: 'cel_golan_400'),
  CommunityPost(id: '3', author: 'יוסי לוי', avatar: 'י', channel: 'סלולר', text: 'שאלה — מי יותר טוב לגבי כיסוי 5G בחיפה? פרטנר או סלקום?', likes: 12, replies: 15, timestamp: DateTime.now().subtract(const Duration(hours: 8))),
  CommunityPost(id: '4', author: 'רחל אברהם', avatar: 'ר', channel: 'עזרה בניתוק', text: 'פלאפון מסרבים לבצע את הניוד. כבר שבוע. מה עושים?', likes: 5, replies: 19, timestamp: DateTime.now().subtract(const Duration(hours: 12))),
  CommunityPost(id: '5', author: 'דן שפירא', avatar: 'ד', channel: 'אינטרנט', text: 'עברתי לסלקום fiber 1GB ב-₪109 ללא התחייבות. מהירות מדהימה! 950Mb בבדיקה.', likes: 27, replies: 6, timestamp: DateTime.now().subtract(const Duration(days: 1))),
  CommunityPost(id: '6', author: 'נועה גרין', avatar: 'נ', channel: 'המלצות', text: 'חוסך עזר לי לעבור לפרטנר טריפל 1000mb+Netflix — הכל ב-₪215. חסכתי ₪1,100 בשנה!', likes: 41, replies: 11, timestamp: DateTime.now().subtract(const Duration(days: 2)), isVerified: true, planId: 'tri_partner_1g_nflx'),
  CommunityPost(id: '7', author: 'אלי מזרחי', avatar: 'א', channel: 'סלולר', text: 'טיפ: בקשו מפלאפון מחיר שימור לפני שאתם עוזבים. הציעו לי ₪59 אחרי שאמרתי שאני עוזב. בכל זאת עברתי לגולן ב-₪39 😂', likes: 67, replies: 28, timestamp: DateTime.now().subtract(const Duration(days: 2))),
  CommunityPost(id: '8', author: 'צוות חוסך', avatar: 'ח', channel: 'המלצות', text: '📊 דיווח חודשי: 3,847 לקוחות חסכו ₪847 בממוצע החודש! הספק הפופולרי ביותר: גולן טלקום 🏆', likes: 156, replies: 44, timestamp: DateTime.now().subtract(const Duration(days: 3)), isTeam: true),
  CommunityPost(id: '9', author: 'שרית לוין', avatar: 'ש', channel: 'אינטרנט', text: 'שאלה: HOT או בזק לאינטרנט גיגה? יש לי ילדים שמשחקים games אז latency חשוב', likes: 8, replies: 22, timestamp: DateTime.now().subtract(const Duration(days: 3))),
  CommunityPost(id: '10', author: 'עמית בן-דוד', avatar: 'ע', channel: 'עזרה בניתוק', text: 'שיתוף ניסיון: ניוד לקח לי בדיוק 3 שעות. נרשמתי ב-9 בבוקר, ב-12 כבר הייתה לי SIM חדשה. smooth לגמרי עם חוסך!', likes: 52, replies: 7, timestamp: DateTime.now().subtract(const Duration(days: 4)), isVerified: true),
  CommunityPost(id: '11', author: 'מיכל ביטון', avatar: 'מ', channel: 'סלולר', text: 'Xphone Forever Plus ב-₪30 קבוע לנצח — זה לא סתם פרסומת, באמת לא מעלים מחיר. שנה ומשלם אותו דבר.', likes: 38, replies: 12, timestamp: DateTime.now().subtract(const Duration(days: 5))),
  CommunityPost(id: '12', author: 'ג׳ושוע מוסה', avatar: 'ג', channel: 'המלצות', text: 'מי יכול להמליץ על חבילה משולבת שכוללת סיבים + TV? תקציב ₪180', likes: 14, replies: 31, timestamp: DateTime.now().subtract(const Duration(days: 6))),
  CommunityPost(id: '13', author: 'תמר כספי', avatar: 'ת', channel: 'סלולר', text: 'רמי לוי טריפל 3 קווים ב-₪80 סה"כ. לא הייתי מאמינה שזה אפשרי. תנסו להשוות בחוסך — כל מה שצריך 🙏', likes: 29, replies: 9, timestamp: DateTime.now().subtract(const Duration(days: 7)), isVerified: true),
  CommunityPost(id: '14', author: 'אורי פרידמן', avatar: 'א', channel: 'אינטרנט', text: 'CCC fiber 1GB ב-₪79 — הכי זול שמצאתי! תשאירו תגובה אם אתם בתל אביב ורוצים להצטרף', likes: 43, replies: 17, timestamp: DateTime.now().subtract(const Duration(days: 8))),
  CommunityPost(id: '15', author: 'צוות חוסך', avatar: 'ח', channel: 'המלצות', text: '✈️ מסלולי חו"ל: לאירופה עדיין הכי משתלם Airalo eSIM. 3GB ב-₪39, פועל ב-150 מדינות. קנו כאן!', likes: 72, replies: 19, timestamp: DateTime.now().subtract(const Duration(days: 9)), isTeam: true, planId: 'ab_airalo_3g'),
  CommunityPost(id: '16', author: 'ניר שמחי', avatar: 'נ', channel: 'עזרה בניתוק', text: 'טיפ חשוב לניוד: תוודאו שהחוב לספק הנוכחי מוסדר לפני שמגישים בקשה — זה עצר אותי שבועיים.', likes: 61, replies: 14, timestamp: DateTime.now().subtract(const Duration(days: 10))),
  CommunityPost(id: '17', author: 'הילה אוחיון', avatar: 'ה', channel: 'סלולר', text: 'ויקום Free 5G ב-₪35 — ניסיתי חודש. כיסוי מצוין בתל אביב, שירות לקוחות 8/10. שווה לבדוק!', likes: 33, replies: 21, timestamp: DateTime.now().subtract(const Duration(days: 11))),
  CommunityPost(id: '18', author: 'בני זכריה', avatar: 'ב', channel: 'אינטרנט', text: 'שאלה: מישהו עבר מ-HOT לבזק fiber? שווה את הטרחה? אני ב-200Mb ומשלם ₪150 שזה יקר מדי', likes: 6, replies: 27, timestamp: DateTime.now().subtract(const Duration(days: 12))),
  CommunityPost(id: '19', author: 'לימור דוד', avatar: 'ל', channel: 'המלצות', text: 'eSIM = ❤️ הגדרתי Airalo ב-5 דקות, לא צריך להחליף SIM בנמל תעופה. מי שנוסע — חובה!', likes: 88, replies: 33, timestamp: DateTime.now().subtract(const Duration(days: 13)), isVerified: true),
  CommunityPost(id: '20', author: '019 מובייל', avatar: '0', channel: 'סלולר', text: 'שיתוף: עברתי ל-019 מובייל הגזמנו 170GB 5G ב-₪26. מחיר קבוע, כיסוי פרטנר, ב-11 שנה ראשון שאני לא מרגיש שדפקו אותי 😂', likes: 55, replies: 16, timestamp: DateTime.now().subtract(const Duration(days: 14))),
  // TV channel posts
  CommunityPost(id: '21', author: 'ארז שוהם', avatar: 'א', channel: 'טלוויזיה', text: 'HOT ספורט פרמיום שווה? גם ישראל פריים ליג וגם NBA ב-₪119 לחודש. מי שצופה בכדורגל — שווה כל שקל.', likes: 44, replies: 22, timestamp: DateTime.now().subtract(const Duration(days: 2))),
  CommunityPost(id: '22', author: 'שירה מנצ׳ר', avatar: 'ש', channel: 'טלוויזיה', text: 'FreeTV אנדרואיד — מה מצאתי בחינם: Netflix, Disney+, ערוצי ילדים. אין צורך ב-HOT או yes בכלל 😅', likes: 71, replies: 38, timestamp: DateTime.now().subtract(const Duration(days: 4)), isVerified: true),
  CommunityPost(id: '23', author: 'משה גולן', avatar: 'מ', channel: 'טלוויזיה', text: 'שאלה: yes לוויין ב-₪89 לעומת סלקום TV ב-₪59 — מה כולל יותר? מישהו השווה?', likes: 18, replies: 31, timestamp: DateTime.now().subtract(const Duration(days: 6))),
  CommunityPost(id: '24', author: 'צוות חוסך', avatar: 'ח', channel: 'טלוויזיה', text: '📺 חדש: פרטנר TV ספורט פרמיום ב-₪129 כולל כל הספורט + VOD. ללא התחייבות — ביטול בלחיצה!', likes: 39, replies: 14, timestamp: DateTime.now().subtract(const Duration(days: 8)), isTeam: true, planId: 'tv_partner_sport'),
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
