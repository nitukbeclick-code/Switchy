import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/plan_card/plan_card_widget.dart';

class AIAdvisorWidget extends StatefulWidget {
  const AIAdvisorWidget({super.key});

  @override
  State<AIAdvisorWidget> createState() => _AIAdvisorWidgetState();
}

class _AIAdvisorWidgetState extends State<AIAdvisorWidget> {
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  bool _isTyping = false;
  String? _suggestedPlanId;
  late List<_ChatMsg> _messages;

  @override
  void initState() {
    super.initState();
    _messages = [
      _ChatMsg(
        text: 'שלום! אני חוסך AI 🤖\nאני יכול לעזור לך למצוא את מסלול התקשורת הכי מתאים לך.\n\nמה אתה מחפש?',
        isUser: false,
        time: DateTime.now(),
      ),
    ];
  }

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _send(String text) async {
    if (text.trim().isEmpty) return;
    _inputCtrl.clear();
    setState(() {
      _messages.add(_ChatMsg(text: text, isUser: true, time: DateTime.now()));
      _isTyping = true;
    });
    _scrollToBottom();

    await Future.delayed(const Duration(milliseconds: 1200));

    // Simple keyword-based AI
    final lower = text.toLowerCase();
    String cat = 'cellular';
    String sort = 'match';
    List<String> filters = [];

    if (lower.contains('אינטרנט') || lower.contains('internet')) cat = 'internet';
    else if (lower.contains('טלוויזיה') || lower.contains('tv') || lower.contains('ערוצים')) cat = 'tv';
    else if (lower.contains('חו"ל') || lower.contains('חול') || lower.contains('abroad')) cat = 'abroad';
    else if (lower.contains('חבילה') && lower.contains('משולבת')) cat = 'triple';

    if (lower.contains('זול') || lower.contains('מחיר נמוך') || lower.contains('הכי פחות')) sort = 'price';
    if (lower.contains('5g')) filters.add('5g');
    if (lower.contains('ללא התחייבות') || lower.contains('גמישות')) filters.add('nocommit');

    // Find best matching plan
    final plans = plansByCat(cat);
    Plan? bestPlan;
    if (plans.isNotEmpty) {
      if (sort == 'price') {
        bestPlan = plans.reduce((a, b) => a.price < b.price ? a : b);
      } else if (filters.contains('5g')) {
        final fiveg = plans.where((p) => p.flags.contains('5g')).toList();
        bestPlan = fiveg.isNotEmpty ? fiveg.first : plans.first;
      } else {
        bestPlan = plans.firstWhere((p) => p.highlight, orElse: () => plans.first);
      }
    }

    String reply;
    if (bestPlan != null) {
      final catName = categoryById(cat)?.name ?? cat;
      reply = 'על סמך הבקשה שלך, אני ממליץ על:\n\n**${bestPlan.provider} — ${bestPlan.plan}**\n₪${bestPlan.price}/חודש\n\nזה המסלול הכי מתאים לקטגורית $catName. רוצה לראות פרטים מלאים?';
      _suggestedPlanId = bestPlan.id;
    } else {
      reply = 'לא מצאתי מסלולים מתאימים לבקשה שלך. נסה לשאול בצורה אחרת, למשל: "מצא לי סלולר 5G ללא התחייבות"';
    }

    if (mounted) {
      setState(() {
        _isTyping = false;
        _messages.add(_ChatMsg(text: reply, isUser: false, time: DateTime.now(), planId: bestPlan?.id));
      });
    }
    _scrollToBottom();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context, listen: false);

    final quickStarts = ['מצא סלולר זול', 'אינטרנט מהיר', 'ללא התחייבות', '5G טוב', 'חבילת חו"ל'];

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        flexibleSpace: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [ffTheme.primary, ffTheme.tertiary]),
          ),
        ),
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: ffTheme.secondary,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Center(child: Text('✦', style: TextStyle(fontSize: 16))),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('חוסך AI', style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
                Text('יועץ חכם', style: GoogleFonts.assistant(fontSize: 11, color: Colors.white70)),
              ],
            ),
          ],
        ),
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollCtrl,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length + (_isTyping ? 1 : 0),
              itemBuilder: (ctx, i) {
                if (i == _messages.length && _isTyping) {
                  return _TypingBubble(ffTheme: ffTheme);
                }
                final msg = _messages[i];
                return _MessageBubble(msg: msg, ffTheme: ffTheme, bill: appState.currentBill('cellular'));
              },
            ),
          ),

          // Quick start chips (when only greeting)
          if (_messages.length == 1)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: quickStarts.map((q) => GestureDetector(
                  onTap: () => _send(q),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: ffTheme.alternate),
                    ),
                    child: Text(q, style: ffTheme.labelMedium),
                  ),
                )).toList(),
              ),
            ).animate().fadeIn(duration: 500.ms),

          // Input bar
          Container(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: ffTheme.alternate)),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, -4))],
            ),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _inputCtrl,
                      decoration: InputDecoration(
                        hintText: 'שאל על מסלולי תקשורת...',
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.alternate)),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.alternate)),
                        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
                        filled: true,
                        fillColor: ffTheme.background,
                      ),
                      onSubmitted: _send,
                      textInputAction: TextInputAction.send,
                    ),
                  ),
                  const SizedBox(width: 10),
                  GestureDetector(
                    onTap: () => _send(_inputCtrl.text),
                    child: Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: ffTheme.primary,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ChatMsg {
  final String text;
  final bool isUser;
  final DateTime time;
  final String? planId;
  const _ChatMsg({required this.text, required this.isUser, required this.time, this.planId});
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.msg, required this.ffTheme, required this.bill});
  final _ChatMsg msg;
  final FlutterFlowTheme ffTheme;
  final int bill;

  @override
  Widget build(BuildContext context) {
    final plan = msg.planId != null ? planById(msg.planId!) : null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: msg.isUser ? CrossAxisAlignment.start : CrossAxisAlignment.end,
        children: [
          Row(
            mainAxisAlignment: msg.isUser ? MainAxisAlignment.start : MainAxisAlignment.end,
            children: [
              if (!msg.isUser) ...[
                Container(
                  constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: ffTheme.accent1,
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(18),
                      topRight: Radius.circular(18),
                      bottomLeft: Radius.circular(4),
                      bottomRight: Radius.circular(18),
                    ),
                  ),
                  child: Text(msg.text, style: ffTheme.bodyMedium.override(height: 1.5)),
                ),
              ] else ...[
                Container(
                  constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: ffTheme.primary,
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(18),
                      topRight: Radius.circular(18),
                      bottomLeft: Radius.circular(18),
                      bottomRight: Radius.circular(4),
                    ),
                  ),
                  child: Text(msg.text, style: ffTheme.bodyMedium.override(color: Colors.white, height: 1.5)),
                ),
              ],
            ],
          ),
          if (plan != null) ...[
            const SizedBox(height: 8),
            PlanCardWidget(plan: plan, currentBill: bill, showCompare: false),
          ],
        ],
      ),
    );
  }
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble({required this.ffTheme});
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: ffTheme.accent1,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, (i) => Container(
                width: 8,
                height: 8,
                margin: EdgeInsets.only(left: i > 0 ? 4 : 0),
                decoration: BoxDecoration(color: ffTheme.primary, shape: BoxShape.circle),
              ).animate(onPlay: (c) => c.repeat())
                .fadeIn(delay: (i * 200).ms, duration: 300.ms)
                .then()
                .fadeOut(duration: 300.ms)),
            ),
          ),
        ],
      ),
    );
  }
}
