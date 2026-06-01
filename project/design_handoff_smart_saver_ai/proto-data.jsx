/* proto-data.jsx — provider catalog
   REAL data (est:false) collected from provider sites (Pelephone, Cellcom, Partner, Golan, 019,
   Bezeq, Triple C, Gilat, yes) + FreeTV. Representative (est:true) only for brands/categories not
   yet sourced (HOT, NEXT TV, Rami Levy, 012, Walla, Xphone, Airalo, abroad).
   price=intro/current monthly, after=price after intro/year (null=fixed), term=commitment,
   intro=short promo note, fine=key small print. */

const CATS = [
  { id: "cellular", label: "סלולר", sub: "דור 4 / 5 · גלישה", icon: "phone", current: 119 },
  { id: "internet", label: "אינטרנט + ISP", sub: "סיבים + ספק", icon: "wifi", current: 140 },
  { id: "tv", label: "טלוויזיה", sub: "סטרימינג / כבלים", icon: "tv", current: 130 },
  { id: "triple", label: "טריפל / משולב", sub: "נט + TV + טלפון", icon: "layers", current: 260 },
  { id: "abroad", label: "חבילות חו״ל", sub: "eSIM ויעדים", icon: "globe", current: 0 },
];

const FILTERS = {
  cellular: [["5g", "5G"], ["nocommit", "ללא התחייבות"], ["fixed", "מחיר קבוע"], ["abroad", "כולל חו״ל"], ["family", "משפחתי"], ["kosher", "כשר"]],
  internet: [["fiber", "סיבים"], ["g1000", "1000Mb+"], ["wifi7", "Wi-Fi 7"]],
  tv: [["stream", "אינטרנטי"], ["nocommit", "ללא התחייבות"], ["netflix", "נטפליקס/דיסני"], ["sport", "ספורט"]],
  triple: [["netflix", "נטפליקס/דיסני"], ["fiber", "סיבים"], ["nocommit", "ללא התחייבות"]],
  abroad: [["esim", "eSIM"], ["global", "גלובלי"]],
};

const F = (icon, label) => ({ icon, label });

const PLANS = [
  // ===================== CELLULAR =====================
  // -- Pelephone (REAL) --
  { id: "pe1", cat: "cellular", provider: "פלאפון", net: "רשת עצמאית", plan: "מסלול 5G · 1000GB", price: 39.9, after: 69.9, term: "ללא", intro: "חודשיים ראשונים, אח״כ 69.90", est: false, rating: 4.2, reviews: 4200, flags: ["5g", "abroad", "nocommit"],
    feats: [F("bolt", "1000GB גלישה 5G"), F("apps", "גלישה חופשית באפליקציות + AI"), F("globe", "חבילת חו״ל Travel"), F("gift", "100 ש״ח לרכישת מוצר")],
    fine: "39.90 לחודשיים, מהחודש ה-3 חבילת חו״ל ב-49.90, לאחר שנתיים 69.90. 5000 דק׳/SMS. מקור: pelephone.co.il" },
  { id: "pe2", cat: "cellular", provider: "פלאפון", net: "רשת עצמאית", plan: "משתלמת דור 4 · 400GB", price: 39.9, after: 69.9, term: "ללא", intro: "מחיר היכרות לשנה", est: false, rating: 4.1, reviews: 2600, flags: ["abroad", "nocommit"],
    feats: [F("data", "400GB גלישה"), F("sim", "חיבור מיידי eSIM"), F("globe", "מסלול חו״ל Travel"), F("phone", "3500 דק׳/SMS")],
    fine: "39.90 למנוי, לאחר שנה 69.90. מקור: pelephone.co.il" },
  { id: "pe3", cat: "cellular", provider: "פלאפון", net: "רשת עצמאית", plan: "5G Max VIP · 2000GB", price: 49.9, after: 64.9, term: "ללא", intro: "חודשיים, אח״כ 64.90", est: false, rating: 4.3, reviews: 3100, flags: ["5g", "abroad", "nocommit"],
    feats: [F("bolt", "2000GB גלישה 5G Max"), F("shield", "תיעדוף ברשת במצבי עומס"), F("globe", "חבילת חו״ל כלולה"), F("sim", "חיבור מיידי eSIM")],
    fine: "49.90 לחודשיים, מהחודש ה-3 ב-64.90, לאחר שנתיים 99. 5000 דק׳/SMS. מקור: pelephone.co.il" },
  // -- Cellcom (REAL) --
  { id: "ce1", cat: "cellular", provider: "סלקום", net: "רשת עצמאית", plan: "5G Pro · 1000GB", price: 59.9, after: null, term: "ללא", est: false, rating: 4.3, reviews: 5800, flags: ["5g", "abroad", "nocommit"],
    feats: [F("bolt", "1000GB · נתיב מהיר 5G Pro"), F("apps", "גלישה חופשית באפליקציות"), F("globe", "500 דק׳ לחו״ל דרך 013"), F("phone", "5000 דק׳/SMS")],
    fine: "תיעדוף 5G Pro במצבי עומס בכפוף לכיסוי וציוד תומך. מקור: cellcom.co.il" },
  { id: "ce2", cat: "cellular", provider: "סלקום", net: "רשת עצמאית", plan: "5G · 800GB", price: 39.9, after: 59.9, term: "ללא", intro: "חודשיים, אח״כ 59.90", est: false, rating: 4.2, reviews: 4100, flags: ["5g", "abroad", "nocommit"],
    feats: [F("bolt", "800GB גלישה 5G"), F("apps", "גלישה חופשית באפליקציות"), F("globe", "500 דק׳ לחו״ל דרך 013")],
    fine: "39.90 לחודשיים, לאחר מכן 59.90. 5000 דק׳/SMS. מקור: cellcom.co.il" },
  { id: "ce3", cat: "cellular", provider: "סלקום", net: "רשת עצמאית", plan: "4G Basic · 500GB", price: 44.9, after: null, term: "ללא", est: false, rating: 4.1, reviews: 2300, flags: ["abroad", "nocommit"],
    feats: [F("data", "500GB גלישה"), F("globe", "150 דק׳ ל-40 מדינות דרך 013"), F("phone", "3500 דק׳/SMS")],
    fine: "חיוב חריגה 49 אג׳ לדקה/הודעה. מקור: cellcom.co.il" },
  // -- Partner (REAL) --
  { id: "pa1", cat: "cellular", provider: "פרטנר", net: "רשת עצמאית", plan: "Partner Queen 5G · 500GB", price: 39.9, after: 49.9, term: "ללא", intro: "3 חודשים, אח״כ 49.90", est: false, rating: 4.2, reviews: 3600, flags: ["5g", "abroad", "nocommit"],
    feats: [F("bolt", "500GB גלישה 5G"), F("globe", "400 דק׳ לחו״ל דרך 012"), F("phone", "5000 דק׳/SMS")],
    fine: "39.90 ל-3 חודשים, מהחודש הרביעי 49.90. דמי מעבר ללקוחות קיימים 29.90. מקור: partner.co.il" },
  { id: "pa2", cat: "cellular", provider: "פרטנר", net: "רשת עצמאית", plan: "Partner Prince · 400GB", price: 39.9, after: 59.9, term: "ללא", intro: "מהמנוי ה-2: 34.90 לקו", est: false, rating: 4.0, reviews: 2900, flags: ["abroad", "nocommit", "family"],
    feats: [F("data", "400GB (לאחר שנה +200GB + 5G)"), F("layers", "מהמנוי ה-2 רק 34.90 לקו"), F("globe", "200 דק׳ לחו״ל דרך 012")],
    fine: "39.90 למנוי בודד, מהמנוי ה-2 ב-34.90 (עד 12 מנויים), מהחודש ה-13 ב-59.90. מקור: partner.co.il" },
  { id: "pa3", cat: "cellular", provider: "פרטנר", net: "רשת עצמאית", plan: "Partner King 5G · 800GB", price: 59.9, after: null, term: "ללא", est: false, rating: 4.2, reviews: 2400, flags: ["5g", "abroad", "nocommit"],
    feats: [F("bolt", "800GB גלישה 5G"), F("globe", "500 דק׳ לחו״ל דרך 012"), F("phone", "6000 דק׳/SMS")],
    fine: "CyberGuard ו-Funtone בתוספת. מקור: partner.co.il" },
  { id: "pa4", cat: "cellular", provider: "פרטנר", net: "רשת עצמאית", plan: "Partner ACE 5G · 1000GB", price: 69.9, after: null, term: "ללא", est: false, rating: 4.2, reviews: 1900, flags: ["5g", "abroad", "nocommit"],
    feats: [F("bolt", "1000GB גלישה 5G"), F("globe", "600 דק׳ לחו״ל דרך 012"), F("shield", "10% מהתשלום נתרם לעמותות")],
    fine: "פרטנר תורמת 10% מהתשלום (ללא מע״מ) לעמותות. מקור: partner.co.il" },
  { id: "pa5", cat: "cellular", provider: "פרטנר", net: "רשת עצמאית", plan: "Partner Boost 5G · 1500GB", price: 69.9, after: null, term: "ללא", est: false, rating: 4.3, reviews: 2100, flags: ["5g", "abroad", "nocommit"],
    feats: [F("bolt", "1500GB גלישה 5G"), F("shield", "תיעדוף בקצב נתונים בעומס"), F("globe", "600 דק׳ לחו״ל דרך 012")],
    fine: "CyberGuard בתוספת ולא אוטומטי. מקור: partner.co.il" },
  // -- Golan (REAL) --
  { id: "go1", cat: "cellular", provider: "גולן טלקום", net: "רשת סלקום", plan: "400GB · חו״ל כלול", price: 39, after: null, term: "12 ח׳ מבצע", est: false, rating: 4.2, reviews: 3120, flags: ["abroad"],
    feats: [F("data", "400GB גלישה"), F("globe", "1GB בחו״ל כל חודש + 100 דק׳"), F("phone", "3000 דק׳/SMS")],
    fine: "תוקף מבצע 12 חודשים. מקור: golantelecom.co.il" },
  { id: "go2", cat: "cellular", provider: "גולן טלקום", net: "רשת סלקום", plan: "750GB · 5G", price: 39, after: 49, term: "ללא", intro: "3 חודשים ב-39, אח״כ 49", est: false, rating: 4.3, reviews: 2050, flags: ["5g"],
    feats: [F("bolt", "750GB גלישה 5G"), F("globe", "300 דק׳ לחו״ל"), F("gift", "99 ש״ח הנחה לחבילת חו״ל")],
    fine: "3 חודשים ראשונים 39, לאחר מכן 49. מקור: golantelecom.co.il" },
  { id: "go3", cat: "cellular", provider: "גולן טלקום", net: "רשת סלקום", plan: "1500GB · 5G + תיקונים", price: 49, after: 59, term: "ללא", intro: "חודשיים ב-49, אח״כ 59", est: false, rating: 4.3, reviews: 3340, flags: ["5g"], best: true,
    feats: [F("bolt", "1500GB גלישה 5G"), F("shield", "כולל שירות תיקונים"), F("globe", "500 דק׳ לחו״ל")],
    fine: "חודשיים ראשונים 49, לאחר מכן 59. מקור: golantelecom.co.il" },
  { id: "go4", cat: "cellular", provider: "גולן טלקום", net: "רשת סלקום", plan: "DATA ONLY · 500GB (5G)", price: 40, after: null, term: "ללא", est: false, rating: 4.1, reviews: 870, flags: ["5g"],
    feats: [F("bolt", "500GB גלישה 5G"), F("data", "50 דקות שיחה"), F("sim", "מתאים לטאבלט/דאטה")],
    fine: "מקור: golantelecom.co.il" },
  { id: "go5", cat: "cellular", provider: "גולן טלקום", net: "רשת סלקום", plan: "מתגלגלת · 300GB", price: 34.9, after: null, term: "12 ח׳ מבצע", est: false, rating: 4.1, reviews: 720, flags: [],
    feats: [F("data", "300GB גלישה"), F("globe", "240 דק׳ שיחות בינלאומיות"), F("phone", "שיחות והודעות ללא הגבלה")],
    fine: "תוקף מבצע 12 חודשים. מקור: golantelecom.co.il" },
  { id: "go6", cat: "cellular", provider: "גולן טלקום", net: "רשת סלקום", plan: "550GB · החו״ל כלול", price: 129, after: null, term: "ללא", est: false, rating: 4.2, reviews: 990, flags: ["5g", "abroad"],
    feats: [F("globe", "החו״ל כלול — גלישה בחו״ל"), F("phone", "500 דק׳ שיחות בינלאומיות"), F("bolt", "550GB בארץ · 5G")],
    fine: "כולל שימוש בחו״ל. מקור: golantelecom.co.il" },
  // -- 019 (REAL) --
  { id: "n1", cat: "cellular", provider: "019 מובייל", net: "רשת פלאפון", plan: "לכל החיים · 12GB", price: 19.8, after: null, term: "לכל החיים", est: false, rating: 4.0, reviews: 980, flags: ["nocommit", "fixed"],
    feats: [F("data", "12GB גלישה"), F("phone", "5000 דק׳ + 5000 SMS"), F("check", "מחיר קבוע לכל החיים")],
    fine: "עלות SIM 10 ש״ח / eSIM חינם. סינון אתרים בחינם. מקור: 019mobile.co.il" },
  { id: "n2", cat: "cellular", provider: "019 מובייל", net: "רשת פלאפון", plan: "בול בפוני · 30GB", price: 21.9, after: null, term: "לכל החיים", est: false, rating: 4.0, reviews: 760, flags: ["nocommit", "fixed"],
    feats: [F("data", "30GB גלישה"), F("phone", "5000 דק׳ + 5000 SMS"), F("check", "מחיר קבוע לכל החיים")],
    fine: "עלות SIM 10 ש״ח / eSIM חינם. מקור: 019mobile.co.il" },
  { id: "n3", cat: "cellular", provider: "019 מובייל", net: "רשת פלאפון", plan: "הגזמנו · 170GB (5G)", price: 25.9, after: null, term: "לכל החיים", est: false, rating: 4.1, reviews: 1120, flags: ["5g", "nocommit", "fixed"],
    feats: [F("bolt", "170GB גלישה בדור 5"), F("phone", "5000 דק׳ + 5000 SMS"), F("check", "מחיר קבוע לכל החיים")],
    fine: "דור 5 במכשיר תומך. מקור: 019mobile.co.il" },
  { id: "n4", cat: "cellular", provider: "019 מובייל", net: "רשת פלאפון", plan: "WE IT · 100GB + חו״ל", price: 29.9, after: 39.9, term: "3 שנים", intro: "מחיר קבוע ל-3 שנים", est: false, rating: 4.0, reviews: 640, flags: ["abroad"],
    feats: [F("data", "100GB גלישה"), F("globe", "100 דק׳ למבחר מדינות"), F("phone", "5000 דק׳ + 5000 SMS")],
    fine: "מחיר קבוע ל-3 שנים, לאחר מכן עולה ב-10 ש״ח. מקור: 019mobile.co.il" },
  { id: "n5", cat: "cellular", provider: "019 מובייל", net: "רשת פלאפון", plan: "BIG TIME · 200GB + חו״ל", price: 31.8, after: 41.8, term: "3 שנים", intro: "מחיר קבוע ל-3 שנים", est: false, rating: 4.0, reviews: 580, flags: ["abroad"],
    feats: [F("data", "200GB גלישה"), F("globe", "200 דק׳ למבחר מדינות"), F("phone", "5000 דק׳ + 5000 SMS")],
    fine: "מחיר קבוע ל-3 שנים, לאחר מכן עולה ב-10 ש״ח. מקור: 019mobile.co.il" },
  { id: "n6", cat: "cellular", provider: "019 מובייל", net: "רשת פלאפון", plan: "BIG DATA · 300GB (5G)", price: 39.9, after: null, term: "לכל החיים", est: false, rating: 4.1, reviews: 1340, flags: ["5g", "nocommit", "fixed"],
    feats: [F("bolt", "300GB גלישה בדור 5"), F("phone", "5000 דק׳ + 5000 SMS"), F("check", "מחיר קבוע לכל החיים")],
    fine: "דור 5 במכשיר תומך. מקור: 019mobile.co.il" },
  { id: "n7", cat: "cellular", provider: "019 מובייל", net: "רשת פלאפון", plan: "נטפרי 5G · 100GB (כשר)", price: 50, after: null, term: "ללא עליית מחיר", est: false, rating: 4.0, reviews: 410, flags: ["5g", "kosher", "fixed"],
    feats: [F("shield", "מסונן ומאושר ע״י ועד הרבנים"), F("bolt", "100GB גלישה בדור 5"), F("check", "ללא עליית מחיר")],
    fine: "מותנה בתשלום חודשי נוסף לנטפרי. מקור: 019mobile.co.il" },
  // -- supplementary cellular (REPRESENTATIVE) --
  { id: "hm1", cat: "cellular", provider: "הוט מובייל", net: "עצמאי", plan: "5G GEN · 2000GB", price: 59.9, after: null, term: "ללא", est: false, rating: 4.0, reviews: 2410, flags: ["5g", "nocommit"],
    feats: [F("bolt", "2000GB גלישה 5G"), F("globe", "300 דק׳ ל-27 יעדים"), F("phone", "6000 דק׳/SMS")],
    fine: "SIM ללא עלות. גלישה חופשית באפליקציות. מקור: hotmobile.co.il" },
  { id: "hm2", cat: "cellular", provider: "הוט מובייל", net: "עצמאי", plan: "5G ULTRA · 2500GB", price: 69.9, after: null, term: "ללא", est: false, rating: 4.1, reviews: 1800, flags: ["5g", "nocommit"],
    feats: [F("bolt", "2500GB גלישה 5G"), F("shield", "כולל שירות Cyber"), F("globe", "500 דק׳ ל-27 יעדים")],
    fine: "SIM ללא עלות. נתיב מהיר לגלישה. מקור: hotmobile.co.il" },
  { id: "hm3", cat: "cellular", provider: "הוט מובייל", net: "עצמאי", plan: "5G ULTRA Premium · 3000GB", price: 79.9, after: null, term: "ללא", est: false, rating: 4.1, reviews: 1500, flags: ["5g", "nocommit"],
    feats: [F("bolt", "3000GB גלישה 5G"), F("shield", "כולל Cyber"), F("globe", "500 דק׳ ל-27 יעדים")],
    fine: "SIM ללא עלות. גלישה חופשית באפליקציות. מקור: hotmobile.co.il" },
  { id: "hm4", cat: "cellular", provider: "הוט מובייל", net: "עצמאי", plan: "5G ULTRA FLY · 3000GB + חו״ל", price: 109.9, after: null, term: "ללא", est: false, rating: 4.1, reviews: 980, flags: ["5g", "abroad", "nocommit"],
    feats: [F("globe", "10GB גלישה בחו״ל + שיחות"), F("bolt", "3000GB גלישה 5G"), F("shield", "כולל Cyber")],
    fine: "SIM ללא עלות. 10GB בחו״ל ל-100 דק׳ ליעדים נבחרים. מקור: hotmobile.co.il" },
  { id: "hm5", cat: "cellular", provider: "הוט מובייל", net: "עצמאי", plan: "Data only · 150GB", price: 21.9, after: null, term: "ללא", est: false, rating: 3.9, reviews: 620, flags: ["nocommit"],
    feats: [F("data", "150GB גלישה לחודש"), F("sim", "לטאבלט/לפטופ/מודם"), F("check", "SIM עד הבית")],
    fine: "SIM DATA. מקור: hotmobile.co.il" },
  { id: "x2", cat: "cellular", provider: "רמי לוי", net: "רשת פלאפון", plan: "100GB · רשת פלאפון", price: 29.9, after: null, term: "ללא", est: true, rating: 4.1, reviews: 1530, flags: ["nocommit", "fixed"],
    feats: [F("data", "100GB גלישה"), F("phone", "שיחות והודעות ללא הגבלה"), F("check", "ללא התחייבות")],
    fine: "מחיר מייצג — לאימות מול הספק." },
  { id: "x3", cat: "cellular", provider: "אקספון 018", net: "eSIM", plan: "150GB · Global 5G", price: 49, after: null, term: "ללא", est: true, rating: 4.2, reviews: 540, flags: ["5g", "abroad"],
    feats: [F("globe", "צבירת גלישה לחו״ל חודשית"), F("bolt", "150GB בארץ + 64GB חו״ל"), F("sim", "תומך eSIM")],
    fine: "מחיר מייצג. ייחודי: צבירת גלישה לחו״ל." },

  // ===================== INTERNET =====================
  // -- Bezeq (REAL) --
  { id: "ib1", cat: "internet", provider: "בזק", net: "תשתית סיבים", plan: "Bfiber · 1 ג׳יגה", price: 99, after: null, term: "6 ח׳", intro: "מחיר היכרות 6 חודשים", est: false, rating: 4.1, reviews: 3300, flags: ["fiber", "g1000"],
    feats: [F("bolt", "מהירות עד 1000Mb"), F("shield", "הגנת סייבר AI כלולה"), F("wifi", "נתב AI WiFi7 בתוספת 19.9")],
    fine: "99 ל-6 חודשים. העלאה עד 100Mb. התקנה חינם אם יש תשתית סיבים. מקור: bezeq.co.il" },
  { id: "ib2", cat: "internet", provider: "בזק", net: "תשתית סיבים", plan: "Bfiber · 300 מגה", price: 109, after: null, term: "12 ח׳", intro: "מחיר היכרות לשנה", est: false, rating: 4.0, reviews: 2100, flags: ["fiber"],
    feats: [F("bolt", "מהירות 300Mb"), F("shield", "הגנת סייבר AI"), F("wifi", "נתב AI WiFi7 בתוספת 19.9")],
    fine: "109 לשנה. העלאה עד 100Mb. מקור: bezeq.co.il" },
  { id: "ib3", cat: "internet", provider: "בזק", net: "תשתית סיבים", plan: "Bfiber · 2.5 ג׳יגה", price: 125, after: 159, term: "12 ח׳", intro: "מחיר קבוע לשנה (ללא נתב)", est: false, rating: 4.2, reviews: 1400, flags: ["fiber", "g1000"],
    feats: [F("bolt", "מהירות עד 2500Mb"), F("wifi", "נתב בתוספת 19.9 ש״ח"), F("check", "למצטרפים חדשים")],
    fine: "125 לשנה במקום 159. בכפוף לתקנון עד 30.6.26. מקור: bezeq.co.il" },
  { id: "ib4", cat: "internet", provider: "בזק", net: "תשתית סיבים", plan: "Multi Bfiber · 5 ג׳יגה", price: 179, after: null, term: "12 ח׳", intro: "מחיר היכרות לשנה", est: false, rating: 4.2, reviews: 920, flags: ["fiber", "g1000"],
    feats: [F("bolt", "מהירות עד 5000Mb"), F("shield", "הגנת סייבר AI"), F("wifi", "נתב בתוספת 39.90 ש״ח")],
    fine: "179 לשנה. העלאה עד 500Mb. מקור: bezeq.co.il" },
  // -- Cellcom (REAL) --
  { id: "ic1", cat: "internet", provider: "סלקום", net: "תשתית סיבים", plan: "Fiber · 1Gb", price: 109, after: 129, term: "12 ח׳", intro: "מחיר היכרות לשנה", est: false, rating: 4.3, reviews: 2870, flags: ["fiber", "g1000"],
    feats: [F("bolt", "מהירות עד 1000Mb"), F("wifi", "נתב מתקדם כלול"), F("check", "התקנה מהיום למחר")],
    fine: "109 לשנה, מחודש 13 ב-129. נקודת רשת לממ״ד. מקור: cellcom.co.il" },
  { id: "ic2", cat: "internet", provider: "סלקום", net: "תשתית סיבים", plan: "Fiber · 2.5Gb", price: 99, after: 149, term: "ללא", intro: "מדרגות: 99 / 129 / 149", est: false, rating: 4.2, reviews: 1600, flags: ["fiber", "g1000"],
    feats: [F("bolt", "מהירות עד 2500Mb"), F("wifi", "נתב מתקדם בתוספת 29.9"), F("check", "העלאה עד 250Mb")],
    fine: "חודשים 1-5 ב-99, 6-12 ב-129, שנה שנייה 149. מקור: cellcom.co.il" },
  // -- Partner (REAL) --
  { id: "ip1", cat: "internet", provider: "פרטנר", net: "תשתית סיבים", plan: "Partner Fiber · 1000Mb", price: 39, after: 159, term: "12 ח׳", intro: "חודשיים ב-39, אח״כ מ-139", est: false, rating: 4.4, reviews: 4100, flags: ["fiber", "g1000", "wifi7"], best: true,
    feats: [F("bolt", "מהירות עד 1000Mb"), F("wifi", "נתב WiFi7 כלול"), F("check", "התקנה חינם בבניין")],
    fine: "39 לחודשיים, אח״כ מ-139, מחודש 13 מ-159. CyberGuard בתוספת. מקור: partner.co.il" },
  { id: "ip2", cat: "internet", provider: "פרטנר", net: "תשתית סיבים", plan: "Partner Fiber · 600Mb", price: 69, after: 100, term: "ללא", intro: "חודשיים ב-69", est: false, rating: 4.3, reviews: 2200, flags: ["fiber", "wifi7"],
    feats: [F("bolt", "מהירות 600Mb"), F("wifi", "נתב WiFi7 בתוספת 25 ש״ח"), F("check", "התקנה חינם בבניין")],
    fine: "69 לחודשיים, לאחר מכן מ-100. מקור: partner.co.il" },
  { id: "ip3", cat: "internet", provider: "פרטנר", net: "תשתית סיבים", plan: "Partner Fiber · 2500Mb", price: 149, after: 169, term: "18 ח׳", intro: "149 ל-18 חודשים", est: false, rating: 4.3, reviews: 1500, flags: ["fiber", "g1000", "wifi7"],
    feats: [F("bolt", "מהירות עד 2500Mb"), F("wifi", "נתב WiFi7 כלול"), F("check", "העלאה עד 250Mb")],
    fine: "149 ל-18 חודשים, מחודש 19 מ-169. מקור: partner.co.il" },
  // -- Gilat (REAL) --
  { id: "ig1", cat: "internet", provider: "גילת", net: "תשתית בזק", plan: "סיבים 1Gb · כולל נתב", price: 49, after: 95, term: "לכל החיים", intro: "3 חודשים ב-49, אח״כ 95", est: false, rating: 4.1, reviews: 680, flags: ["fiber", "g1000"],
    feats: [F("bolt", "מהירות עד 1000Mb"), F("wifi", "כולל נתב"), F("check", "מחיר קבוע לכל החיים")],
    fine: "49 ל-3 חודשים (אונליין), לאחר מכן 95 קבוע. מקור: gilat-telecom.co.il" },
  { id: "ig2", cat: "internet", provider: "גילת", net: "תשתית בזק", plan: "סיבים 1Gb · כולל נתב", price: 79, after: null, term: "לכל החיים", est: false, rating: 4.1, reviews: 540, flags: ["fiber", "g1000"],
    feats: [F("bolt", "מהירות עד 1000Mb"), F("wifi", "כולל נתב"), F("check", "מחיר קבוע לכל החיים")],
    fine: "״המחיר הנמוך בישראל״. על תשתית סיבים בזק. מקור: gilat-telecom.co.il" },
  { id: "ig3", cat: "internet", provider: "גילת", net: "תשתית בזק", plan: "סיבים 2.5Gb", price: 99, after: null, term: "12 ח׳", est: false, rating: 4.1, reviews: 420, flags: ["fiber", "g1000"],
    feats: [F("bolt", "מהירות עד 2500Mb"), F("check", "מחיר קבוע לשנה"), F("wifi", "העלאה עד 250Mb")],
    fine: "על תשתית סיבים בזק. מקור: gilat-telecom.co.il" },
  // -- Triple C (REAL) --
  { id: "it1", cat: "internet", provider: "Triple C", net: "ספק (תשתית בזק)", plan: "פייבר 1000 מגה", price: 100, after: null, term: "ללא", est: false, rating: 4.1, reviews: 1240, flags: ["fiber", "g1000"],
    feats: [F("bolt", "מהירות עד 1000Mb"), F("check", "ספק על תשתית בזק"), F("wifi", "משלוח נתב 32 ש״ח")],
    fine: "ללקוחות בעלי תשתית בזק פעילה. קצב Best-effort. מקור: ccc.co.il" },
  { id: "it2", cat: "internet", provider: "Triple C", net: "ספק (תשתית בזק)", plan: "פייבר 500 מגה", price: 95, after: null, term: "ללא", est: false, rating: 4.0, reviews: 760, flags: ["fiber"],
    feats: [F("bolt", "מהירות 500Mb"), F("check", "ספק על תשתית בזק"), F("wifi", "משלוח נתב 32 ש״ח")],
    fine: "ללקוחות בעלי תשתית בזק פעילה. מקור: ccc.co.il" },
  // -- 019 internet (REAL) --
  { id: "in1", cat: "internet", provider: "019 מובייל", net: "ספק + תשתית בזק", plan: "אינטרנט ביתי · עד 100 מגה", price: 82, after: null, term: "לכל החיים", est: false, rating: 4.0, reviews: 940, flags: ["fixed"],
    feats: [F("bolt", "מהירות עד 100Mb"), F("check", "ספק + תשתית · מחיר קבוע"), F("wifi", "נתב קיים או השכרה 8 ש״ח")],
    fine: "על בסיס תשתית בזק. מחיר קבוע לכל החיים. מקור: 019mobile.co.il" },
  { id: "in2", cat: "internet", provider: "019 מובייל", net: "ספק + תשתית בזק", plan: "אינטרנט ביתי · עד 200 מגה", price: 82, after: null, term: "לכל החיים", est: false, rating: 4.0, reviews: 720, flags: ["fixed"],
    feats: [F("bolt", "מהירות עד 200Mb"), F("check", "ספק + תשתית · מחיר קבוע"), F("wifi", "השכרת נתב 10 ש״ח")],
    fine: "ייתכן דמי הצטרפות 99 ש״ח. על בסיס תשתית בזק. מקור: 019mobile.co.il" },
  { id: "it3", cat: "internet", provider: "Triple C", net: "ספק (תשתית בזק)", plan: "פייבר 300 מגה", price: 90, after: null, term: "ללא", est: false, rating: 4.0, reviews: 520, flags: ["fiber"],
    feats: [F("bolt", "מהירות 300Mb"), F("check", "ספק על תשתית בזק"), F("wifi", "משלוח נתב 32 ש״ח")],
    fine: "ללקוחות בעלי תשתית בזק פעילה. קצב Best-effort. מקור: ccc.co.il" },
  { id: "ig4", cat: "internet", provider: "גילת", net: "תשתית בזק", plan: "סיבים 1Gb · ללא נתב", price: 95, after: null, term: "לכל החיים", intro: "חודש חינם", est: false, rating: 4.0, reviews: 380, flags: ["fiber", "g1000"],
    feats: [F("bolt", "מהירות עד 1000Mb"), F("check", "מחיר קבוע · חודש חינם"), F("sim", "מומלצת לבעלי נתב פרטי")],
    fine: "על תשתית סיבים בזק. למצטרפים חדשים. מקור: gilat-telecom.co.il" },

  { id: "ih1", cat: "internet", provider: "HOT", net: "תשתית סיבים", plan: "Fiber AI · 1000Mb + HBO Max", price: 109, after: null, term: "לכל החיים", intro: "50% הנחה ל-3 חודשים", est: false, rating: 4.0, reviews: 3050, flags: ["fiber", "g1000"],
    feats: [F("bolt", "מהירות עד 1000Mb"), F("gift", "כולל HBO Max"), F("wifi", "נתב חכם + מגדיל טווח")],
    fine: "כולל HBO Max. דמי התקנה 499 בבית פרטי. מקור: hot.net.il" },
  { id: "ih2", cat: "internet", provider: "HOT", net: "תשתית סיבים", plan: "Fiber AI · 600Mb", price: 99, after: null, term: "לכל החיים", est: false, rating: 4.0, reviews: 2100, flags: ["fiber"],
    feats: [F("bolt", "מהירות עד 600Mb"), F("wifi", "נתב חכם + מגדיל טווח"), F("check", "נקודת רשת")],
    fine: "דמי התקנה 499 בבית פרטי. מקור: hot.net.il" },
  { id: "ih3", cat: "internet", provider: "HOT", net: "תשתית סיבים", plan: "HOME plus · 1000Mb + HBO Max", price: 124, after: null, term: "לכל החיים", est: false, rating: 4.1, reviews: 1400, flags: ["fiber", "g1000"],
    feats: [F("bolt", "עד 1000Mb · לבתים גדולים"), F("wifi", "נתב + 2 מגדילי טווח"), F("gift", "כולל HBO Max")],
    fine: "פתרון ל-2 מפלסים. התקנה 499 בבית פרטי. מקור: hot.net.il" },

  // ===================== TV =====================
  { id: "tv1", cat: "tv", provider: "FreeTV", net: "אינטרנטי", plan: "60+ ערוצים + VOD", price: 49.9, after: null, term: "ללא · לכל החיים", intro: "חודש ניסיון חינם", est: false, rating: 3.9, reviews: 1280, flags: ["stream", "nocommit", "sport"], best: true,
    feats: [F("tv", "מעל 60 ערוצים + 11 ספורט"), F("apps", "אפליקציה · 4K · ללא ממיר"), F("check", "מחיר קבוע לכל החיים")],
    fine: "ללא התחייבות, ביטול בכל עת. מקור: freetv.tv" },
  { id: "tv2", cat: "tv", provider: "yes", net: "STING+ אינטרנטי", plan: "STING+ by yes", price: 49, after: null, term: "12 ח׳", intro: "דיסני+ 3 חודשים מתנה", est: false, rating: 4.3, reviews: 4900, flags: ["netflix"],
    feats: [F("tv", "כ-70 ערוצים + 2 ממירים"), F("data", "כ-40,000 תכני VOD"), F("gift", "דיסני+ 3 חודשים מתנה")],
    fine: "49 למשך שנה. ממירים בשכירות. לקוחות חדשים. מקור: yes.co.il" },
  { id: "tv3", cat: "tv", provider: "yes", net: "לווין/נט", plan: "yes+ ULTIMATE", price: 99, after: null, term: "12 ח׳", intro: "דיסני+ 3 חודשים מתנה", est: false, rating: 4.2, reviews: 5200, flags: ["netflix"],
    feats: [F("tv", "מעל 160 ערוצים + 2 ממירים"), F("data", "מעל 80,000 תכני VOD"), F("gift", "דיסני+ 3 חודשים מתנה")],
    fine: "99 למשך שנה. התקנה מהיום למחר. לקוחות חדשים. מקור: yes.co.il" },
  { id: "tv4", cat: "tv", provider: "פרטנר", net: "IPTV", plan: "Partner TV · נטפליקס מובנה", price: 99, after: 129, term: "12 ח׳", est: true, rating: 4.2, reviews: 2650, flags: ["netflix"],
    feats: [F("tv", "ערוצים + נטפליקס מובנה"), F("data", "VOD עשיר"), F("apps", "אינטגרציה עם נט/סלולר")],
    fine: "מחיר מייצג — נטפליקס מובנה ייחודי לפרטנר." },
  { id: "tv5", cat: "tv", provider: "HOT", net: "כבלים/סיבים", plan: "רק טלוויזיה · 140 ערוצים", price: 89, after: null, term: "לכל החיים", intro: "HBO Max 3 חודשים חינם", est: false, rating: 4.0, reviews: 3600, flags: ["netflix"],
    feats: [F("tv", "כ-140 ערוצים + VOD"), F("apps", "CatchUp/Binge · טלוויזיות חכמות"), F("gift", "HBO Max 3 חודשים חינם")],
    fine: "HBO Max חינם ל-3 חודשים ואז 25 ש״ח ל-9 חודשים. מקור: hot.net.il" },
  { id: "tv6", cat: "tv", provider: "NEXT TV", net: "אינטרנטי", plan: "ערוצים + VOD", price: 39, after: null, term: "ללא", est: true, rating: 3.9, reviews: 480, flags: ["stream", "nocommit"],
    feats: [F("tv", "ערוצים ישראליים + בינלאומיים"), F("apps", "אפליקציה לכל מכשיר"), F("check", "ללא התחייבות")],
    fine: "מחיר מייצג." },

  { id: "tv7", cat: "tv", provider: "סלקום", net: "IPTV", plan: "סלקום tv+ · טלוויזיה", price: 99, after: 119, term: "3 שנים", intro: "חודש ראשון חינם", est: false, rating: 4.1, reviews: 2200, flags: ["netflix"],
    feats: [F("tv", "ערוצים + LIVE + VOD"), F("apps", "ממיר + אפליקציה"), F("gift", "חודש ראשון חינם")],
    fine: "חודש חינם, 2-12 ב-99, 13-24 ב-109, מחודש 25 ב-119. מקור: cellcom.co.il" },
  { id: "tv8", cat: "tv", provider: "סלקום", net: "אפליקציה", plan: "אפליקציית סלקום tv+", price: 39, after: 59, term: "ללא", intro: "חודשיים ב-39", est: false, rating: 4.0, reviews: 1400, flags: ["stream", "nocommit"],
    feats: [F("apps", "צפייה ב-5 מכשירים"), F("check", "התקנה קלה"), F("tv", "LIVE + VOD")],
    fine: "39 לחודשיים, 3-12 ב-59, מהשנה השנייה 69. מקור: cellcom.co.il" },

  // ===================== TRIPLE =====================
  { id: "tr1", cat: "triple", provider: "yes", net: "STING+ פייבר", plan: "STING+ FIBER", price: 149, after: 234, term: "12 ח׳", intro: "כולל נתב · דיסני+ 3 ח׳", est: false, rating: 4.2, reviews: 1900, flags: ["fiber", "netflix"], best: true,
    feats: [F("bolt", "אינטרנט סיבים 1Gb"), F("tv", "כ-70 ערוצים + 2 ממירים"), F("gift", "דיסני+ 3 חודשים")],
    fine: "149 לשנה (כולל נתב), מחודש 13 ב-234. התקנת סיבים בבית פרטי 499. מקור: yes.co.il" },
  { id: "tr2", cat: "triple", provider: "yes", net: "לווין/נט + פייבר", plan: "yes+ FIBER", price: 199, after: 329, term: "12 ח׳", intro: "חודש ראשון חינם", est: false, rating: 4.1, reviews: 2100, flags: ["fiber", "netflix"],
    feats: [F("bolt", "אינטרנט סיבים 1Gb"), F("tv", "מעל 160 ערוצים + 2 ממירים"), F("wifi", "נתב WiFi7 שנה מתנה")],
    fine: "חודש ראשון חינם, אח״כ 199 לשנה, מחודש 13 ב-329. מקור: yes.co.il" },
  { id: "tr3", cat: "triple", provider: "סלקום", net: "תשתית סיבים", plan: "טריפל · 2.5Gb", price: 179, after: 199, term: "ללא", intro: "179, מחודש 13 ב-199", est: false, rating: 4.2, reviews: 2400, flags: ["fiber"],
    feats: [F("bolt", "אינטרנט סיבים 2.5Gb"), F("tv", "2 ממירי מאסטרבוקס"), F("wifi", "נתב בתוספת 29.9 ש״ח")],
    fine: "179 לחודש, מחודש 13 ב-199. מקור: cellcom.co.il" },
  { id: "tr4", cat: "triple", provider: "סלקום", net: "תשתית סיבים", plan: "טריפל 1Gb + מסך", price: 189, after: null, term: "36 ח׳", intro: "כולל מסך Hisense 55״", est: false, rating: 4.1, reviews: 1300, flags: ["fiber", "sport"],
    feats: [F("bolt", "אינטרנט סיבים 1Gb"), F("tv", "3 ממירים + ערוצי ספורט"), F("gift", "מסך Hisense QLED 55״")],
    fine: "189 לחודש, 36 ח׳. מסך ב-40 ש״ח×36. ספורט למונדיאל. מקור: cellcom.co.il" },
  { id: "tr5", cat: "triple", provider: "פרטנר", net: "תשתית עצמאית", plan: "טריפל · 1000Mb + TV", price: 175, after: 215, term: "12 ח׳", est: true, rating: 4.3, reviews: 2800, flags: ["fiber", "netflix"],
    feats: [F("bolt", "סיבים עד 1000Mb"), F("tv", "TV + נטפליקס מובנה"), F("shield", "2 ממירים + הגנת סייבר")],
    fine: "מחיר מייצג — כ-175-200 לחודש." },

  { id: "thot1", cat: "triple", provider: "HOT", net: "כבלים/סיבים", plan: "טריפל HBO Max · 1Gb", price: 199, after: null, term: "לכל החיים", intro: "HBO Max 3 חודשים חינם", est: false, rating: 4.0, reviews: 3200, flags: ["fiber", "netflix"],
    feats: [F("bolt", "אינטרנט עד 1Gb"), F("tv", "כ-140 ערוצים + HBO Max"), F("gift", "2 סטרימרים חינם לשנה")],
    fine: "HBO Max 3 חודשים חינם ואז 25 ש״ח. התקנה 499 בבית פרטי. מקור: hot.net.il" },
  { id: "thot2", cat: "triple", provider: "HOT", net: "כבלים/סיבים", plan: "טריפל · 1000Mb", price: 169, after: null, term: "לכל החיים", intro: "50% הנחה ל-3 חודשים", est: false, rating: 4.0, reviews: 2400, flags: ["fiber"],
    feats: [F("bolt", "אינטרנט עד 1Gb"), F("tv", "כ-140 ערוצים"), F("gift", "2 סטרימרים חינם לשנה")],
    fine: "התקנה ללא עלות בדירה, 499 בבית פרטי. מקור: hot.net.il" },

  // ===================== ABROAD =====================
  { id: "ab1", cat: "abroad", provider: "גולן טלקום", net: "eSIM", plan: "550GB · החו״ל כלול", price: 129, after: null, term: "ללא", est: false, rating: 4.2, reviews: 990, flags: ["esim"], best: true,
    feats: [F("globe", "גלישה ושיחות בחו״ל"), F("phone", "500 דק׳ בינלאומיות"), F("sim", "תומך eSIM")],
    fine: "כולל שימוש בחו״ל. מקור: golantelecom.co.il" },
  { id: "ab2", cat: "abroad", provider: "אקספון 018", net: "eSIM", plan: "צבירת גלישה חו״ל חודשית", price: null, priceText: "כלול במסלול", after: null, term: "ללא", est: true, rating: 4.4, reviews: 760, flags: ["esim"],
    feats: [F("globe", "צבירת גלישה לחו״ל כל חודש"), F("sim", "eSIM דיגיטלי"), F("bolt", "ללא רכישת סים ביעד")],
    fine: "מחיר מייצג." },
  { id: "ab3", cat: "abroad", provider: "Airalo", net: "eSIM גלובלי", plan: "eSIM לפי יעד", price: null, priceText: "לפי יעד", after: null, term: "ללא", est: true, rating: 4.5, reviews: 9800, flags: ["esim", "global"],
    feats: [F("globe", "מעל 170 מדינות"), F("sim", "eSIM מיידי"), F("data", "חבילות דאטה גמישות")],
    fine: "תמחור לפי יעד וכמות דאטה." },
  { id: "ab4", cat: "abroad", provider: "פלאפון", net: "רשת עצמאית", plan: "חבילת חו״ל Travel", price: null, priceText: "במסלול", after: null, term: "ללא", est: true, rating: 4.2, reviews: 1100, flags: [],
    feats: [F("globe", "גלישה ושיחות בחו״ל"), F("bolt", "כלול במסלולי 5G"), F("shield", "רשת עצמאית")],
    fine: "כלול במסלולי פלאפון. מחיר מייצג." },
];

function fmtNum(n) { return Number.isInteger(n) ? n : n.toFixed(2).replace(/\.?0+$/, ""); }
function planPrice(p) {
  if (p.price == null) return p.priceText;
  return (p.est ? "~₪" : "₪") + fmtNum(p.price);
}
function planAfter(p) {
  if (p.price == null || p.after == null) return null;
  return (p.est ? "~₪" : "₪") + fmtNum(p.after);
}
function planSaveYear(p, current) {
  const c = CATS.find(c => c.id === p.cat);
  const base = current != null ? current : (c && c.current);
  if (!base || p.price == null) return 0;
  return Math.max(0, Math.round((base - p.price) * 12 / 10) * 10);
}
function planCost24(p) {
  if (p.price == null) return null;
  const y1 = p.price * 12;
  const y2 = (p.after != null ? p.after : p.price) * 12;
  return Math.round(y1 + y2);
}
function planWarn(p) {
  if (p.price == null || p.after == null) return null;
  const inc = Math.round((p.after - p.price) / p.price * 100);
  if (inc >= 50) return "המחיר עולה ב-" + inc + "% בתום ההיכרות";
  return null;
}
function plansByCat(cat) { return PLANS.filter(p => p.cat === cat); }

Object.assign(window, { CATS, FILTERS, PLANS, planPrice, planAfter, planSaveYear, planCost24, planWarn, plansByCat });
