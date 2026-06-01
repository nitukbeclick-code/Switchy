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
    '⭐ ממוצע חיסכון: ₪850 לשנה',
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
