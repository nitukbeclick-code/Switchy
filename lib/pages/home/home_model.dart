import 'dart:async';
import 'package:flutter/material.dart';
import '/flutter_flow/flutter_flow_util.dart';
import 'home_widget.dart';

class HomeModel extends FlutterFlowModel<HomeWidget> {
  // Ticker
  int tickerIndex = 0;
  Timer? tickerTimer;

  final List<String> tickers = [
    '⚡ מאיה מתל אביב חסכה ₪540 לפני 8 דקות',
    '🔥 3,847 אנשים השוו מחירים החודש',
    '✓ יוסי מחיפה עבר לגולן וחסך ₪720 לשנה',
    '💰 דנה מירושלים גילתה תוכנית ב-₪39 במקום ₪119',
    '⭐ ממוצע חיסכון: ₪850 לשנה לכל משפחה',
    '📱 23 איש עברו לסלקום הבוקר',
    '🎉 נועה מבאר שבע: "המעבר לקח פחות מיום!"',
    '📶 5G זמין ב-₪39/חודש — בדוק זמינות!',
    '🔔 ירידת מחיר: פלאפון 5G ירד ל-₪79',
    '✅ 94% שביעות רצון מהמעבר דרך חוסך',
    '🌐 רון מנתניה חסך ₪960 על אינטרנט גיגה',
    '📺 מרים מראשון: "HOT → yes חסכה לי ₪600 בשנה"',
    '🏠 משפחת כהן חסכה ₪2,400 בחבילה משולבת',
    '✈️ אירלו eSIM: ₪25 לגיגה בחו"ל — 80% זול יותר!',
    '💡 גולן טלקום מדורג ראשון לשביעות לקוחות 2026',
    '🔥 38 אנשים עברו ספק היום דרך חוסך',
    '⚡ שי מפתח תקווה חסך ₪1,200 על חבילה משולבת',
    '📊 ממוצע זמן מעבר: 1.8 ימי עסקים בלבד',
    '🎯 רמי לוי: 3 קווים ב-₪80 — הצ\'מפיון של 2026',
    '🌟 60,000 משפחות כבר חסכו דרך חוסך!',
  ];

  void startTicker(void Function(void Function()) setState) {
    tickerTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      setState(() => tickerIndex = (tickerIndex + 1) % tickers.length);
    });
  }

  @override
  void initState(BuildContext context) {}

  @override
  void dispose() {
    tickerTimer?.cancel();
    super.dispose();
  }
}
