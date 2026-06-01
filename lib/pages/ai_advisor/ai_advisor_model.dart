import 'dart:async';
import 'package:flutter/material.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/models.dart';
import '/data.dart';
import 'ai_advisor_widget.dart';

class AIAdvisorModel extends FlutterFlowModel<AIAdvisorWidget> {
  final TextEditingController inputController = TextEditingController();
  final ScrollController scrollController = ScrollController();
  List<ChatMessage> messages = [];
  bool isTyping = false;
  String? suggestedPlanId;

  @override
  void initState(BuildContext context) {
    messages = [
      ChatMessage(
        text: 'שלום! אני חוסך AI 🤖\nאני יכול לעזור לך למצוא את המסלול המושלם ולחסוך כסף.\nמה תרצה לחפש?',
        isUser: false,
        timestamp: DateTime.now(),
      ),
    ];
  }

  Future<void> sendMessage(String text) async {
    if (text.trim().isEmpty) return;
    messages = [...messages, ChatMessage(text: text, isUser: true, timestamp: DateTime.now())];
    inputController.clear();
    isTyping = true;

    await Future.delayed(const Duration(milliseconds: 1200));

    final plan = _findBestPlan(text);
    final reply = _buildReply(text, plan);

    messages = [
      ...messages,
      ChatMessage(text: reply, isUser: false, timestamp: DateTime.now(), planId: plan?.id),
    ];
    isTyping = false;
  }

  Plan? _findBestPlan(String text) {
    final t = text.toLowerCase();
    String cat = 'cellular';
    if (t.contains('אינטרנט') || t.contains('internet')) cat = 'internet';
    else if (t.contains('טלויזיה') || t.contains('tv') || t.contains('ערוצים')) cat = 'tv';
    else if (t.contains('חו"ל') || t.contains('abroad') || t.contains('חול')) cat = 'abroad';
    else if (t.contains('משולב') || t.contains('triple')) cat = 'triple';

    var plans = plansByCat(cat);
    if (t.contains('5g')) plans = plans.where((p) => p.is5G).toList();
    if (t.contains('ללא התחייבות') || t.contains('חופשי')) {
      plans = plans.where((p) => p.noCommit).toList();
    }
    if (t.contains('זול') || t.contains('הכי נמוך')) {
      plans.sort((a, b) => a.price.compareTo(b.price));
    } else {
      plans.sort((a, b) => b.rating.compareTo(a.rating));
    }

    return plans.isNotEmpty ? plans.first : null;
  }

  String _buildReply(String text, Plan? plan) {
    if (plan == null) {
      return 'לא מצאתי תוכנית שמתאימה בדיוק. נסה לפרט יותר — איזה קטגוריה? סלולר, אינטרנט, טלוויזיה?';
    }
    final saving = planSaveYear(plan, 119);
    return 'מצאתי עבורך! ${plan.provider} עם תוכנית "${plan.plan}" ב-₪${plan.price}/חודש.'
        + (saving > 0 ? '\n💰 חיסכון משוער: ₪$saving בשנה!' : '')
        + '\n\nתרצה לראות פרטים נוספים?';
  }

  @override
  void dispose() {
    inputController.dispose();
    scrollController.dispose();
    super.dispose();
  }
}
