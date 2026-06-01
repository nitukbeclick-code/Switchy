import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../theme.dart';
import '../state.dart';
import '../data.dart';
import '../models.dart';
import '../widgets/logo_widget.dart';

class AIAdvisorScreen extends StatefulWidget {
  const AIAdvisorScreen({super.key});

  @override
  State<AIAdvisorScreen> createState() => _AIAdvisorScreenState();
}

class _AIAdvisorScreenState extends State<AIAdvisorScreen> {
  final _ctrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  bool _typing = false;

  final List<_ChatMsg> _messages = [
    _ChatMsg(
      isAI: true,
      text: 'שלום! אני חוסך AI 🤖\n\nאני יכול לעזור לכם למצוא את מסלול התקשורת הכי משתלם.\n\nמה תרצו לחפש?',
      timestamp: 'עכשיו',
    ),
  ];

  final _quickChips = [
    ('cellular', 'חפש לי סלולר'),
    ('internet', 'אינטרנט מהיר'),
    ('price', 'הכי זול'),
    ('nocommit', 'ללא התחייבות'),
    ('abroad', 'חבילת חו"ל'),
  ];

  @override
  void dispose() {
    _ctrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _send(String text) async {
    if (text.trim().isEmpty) return;
    final msg = text.trim();
    _ctrl.clear();

    setState(() {
      _messages.add(_ChatMsg(isAI: false, text: msg, timestamp: 'עכשיו'));
      _typing = true;
    });
    _scrollToBottom();

    await Future.delayed(const Duration(milliseconds: 1400));
    if (!mounted) return;

    final plan = _findPlan(msg);
    setState(() {
      _typing = false;
      _messages.add(_ChatMsg(
        isAI: true,
        text: _buildResponse(msg, plan),
        timestamp: 'עכשיו',
        plan: plan,
      ));
    });
    _scrollToBottom();
  }

  Plan? _findPlan(String query) {
    final q = query.toLowerCase();
    String catId = 'cellular';

    if (q.contains('אינטרנט') || q.contains('סיב') || q.contains('גיגה')) {
      catId = 'internet';
    } else if (q.contains('טלוויזיה') || q.contains('tv') || q.contains('ערוצים')) {
      catId = 'tv';
    } else if (q.contains("חו\"ל") || q.contains('נסיעה') || q.contains('abroad')) {
      catId = 'abroad';
    } else if (q.contains('חבילה') || q.contains('משולב')) {
      catId = 'triple';
    }

    final plans = plansByCategory(catId);
    if (plans.isEmpty) return null;

    if (q.contains('זול') || q.contains('מחיר') || q.contains('חסכון')) {
      return plans.reduce((a, b) =>
          (a.price ?? 999) <= (b.price ?? 999) ? a : b);
    }

    if (q.contains('5g') || q.contains('מהיר')) {
      final fiveg = plans.where((p) => p.flags.contains('5g')).toList();
      if (fiveg.isNotEmpty) {
        return fiveg.reduce((a, b) => a.rating >= b.rating ? a : b);
      }
    }

    if (q.contains('ללא התחייבות') || q.contains('גמישות')) {
      final nc = plans.where((p) => p.flags.contains('nocommit')).toList();
      if (nc.isNotEmpty) return nc.first;
    }

    return plans.firstWhere((p) => p.best, orElse: () => plans.first);
  }

  String _buildResponse(String query, Plan? plan) {
    if (plan == null) return 'לא מצאתי מסלולים מתאימים. נסו לחפש בצורה אחרת.';

    final catName = kCategories
        .firstWhere((c) => c.id == plan.cat, orElse: () => kCategories.first)
        .name;

    return 'מצאתי את המסלול המושלם עבורכם! 🎯\n\n'
        '${plan.provider} מציעים ${plan.plan} ב-${plan.displayPrice} לחודש.\n\n'
        'זו הבחירה הטובה ביותר בקטגוריית $catName '
        'עם דירוג של ${plan.rating}⭐ מ-${plan.reviews} לקוחות.\n\n'
        'האם תרצו לראות פרטים נוספים?';
  }

  void _scrollToBottom() {
    Future.delayed(const Duration(milliseconds: 100), () {
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
    return Scaffold(
      backgroundColor: AppColors.paper,
      body: Column(
        children: [
          _buildHeader(context),
          Expanded(
            child: ListView.builder(
              controller: _scrollCtrl,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length + (_typing ? 1 : 0),
              itemBuilder: (ctx, i) {
                if (_typing && i == _messages.length) {
                  return _buildTyping();
                }
                return _buildMsg(_messages[i]);
              },
            ),
          ),
          _buildQuickChips(),
          _buildInput(),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    final statusH = MediaQuery.of(context).padding.top;
    return Container(
      color: AppColors.green,
      padding: EdgeInsets.fromLTRB(16, statusH + 12, 16, 16),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => context.pop(),
            child: const Icon(Icons.arrow_back_ios_rounded,
                color: Colors.white, size: 20),
          ),
          const SizedBox(width: 12),
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.lime,
              shape: BoxShape.circle,
            ),
            child: const Center(
              child: Text('🤖', style: TextStyle(fontSize: 18)),
            ),
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'חוסך AI',
                  style: TextStyle(
                    fontFamily: 'Rubik',
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
                Text(
                  'תמיד כאן לעזור',
                  style: TextStyle(fontSize: 12, color: Colors.white70),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: AppColors.lime,
              borderRadius: BorderRadius.circular(6),
            ),
            child: const Text(
              '✦ AI',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                color: AppColors.greenDark,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMsg(_ChatMsg msg) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment:
            msg.isAI ? MainAxisAlignment.start : MainAxisAlignment.end,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (msg.isAI) ...[
            Container(
              width: 32,
              height: 32,
              margin: const EdgeInsets.only(left: 8),
              decoration: BoxDecoration(
                color: AppColors.green,
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: Text('🤖', style: TextStyle(fontSize: 14)),
              ),
            ),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment: msg.isAI
                  ? CrossAxisAlignment.start
                  : CrossAxisAlignment.end,
              children: [
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: msg.isAI ? AppColors.card : AppColors.green,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(16),
                      topRight: const Radius.circular(16),
                      bottomLeft: Radius.circular(msg.isAI ? 4 : 16),
                      bottomRight: Radius.circular(msg.isAI ? 16 : 4),
                    ),
                    border: msg.isAI
                        ? Border.all(color: AppColors.border)
                        : null,
                  ),
                  child: Text(
                    msg.text,
                    style: TextStyle(
                      fontSize: 14,
                      color: msg.isAI ? AppColors.ink : Colors.white,
                      height: 1.5,
                    ),
                  ),
                ),
                if (msg.plan != null) ...[
                  const SizedBox(height: 8),
                  _buildPlanMiniCard(msg.plan!),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPlanMiniCard(Plan plan) {
    return GestureDetector(
      onTap: () => context.push('/plan/${plan.id}'),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.green.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.green.withOpacity(0.2)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            LogoWidget(provider: plan.provider, size: 36, fontSize: 14),
            const SizedBox(width: 10),
            Flexible(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    plan.provider,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.green,
                    ),
                  ),
                  Text(
                    plan.plan,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.inkMuted,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              plan.displayPrice,
              style: const TextStyle(
                fontFamily: 'Rubik',
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: AppColors.green,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTyping() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            margin: const EdgeInsets.only(left: 8),
            decoration: const BoxDecoration(
              color: AppColors.green,
              shape: BoxShape.circle,
            ),
            child: const Center(
              child: Text('🤖', style: TextStyle(fontSize: 14)),
            ),
          ),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, (i) {
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: AppColors.inkMuted.withOpacity(0.5),
                      shape: BoxShape.circle,
                    ),
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickChips() {
    if (_messages.length > 1) return const SizedBox.shrink();
    return Container(
      height: 44,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: _quickChips.map((chip) {
          return GestureDetector(
            onTap: () => _send(chip.$2),
            child: Container(
              margin: const EdgeInsets.only(left: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.card,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppColors.border),
              ),
              child: Text(
                chip.$2,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.ink,
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildInput() {
    return Container(
      padding: EdgeInsets.fromLTRB(
          16, 10, 16, MediaQuery.of(context).padding.bottom + 10),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _ctrl,
              textDirection: TextDirection.rtl,
              decoration: InputDecoration(
                hintText: 'שאלו אותי על מסלולים...',
                hintTextDirection: TextDirection.rtl,
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 10),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                  borderSide: const BorderSide(color: AppColors.border),
                ),
              ),
              onSubmitted: _send,
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => _send(_ctrl.text),
            child: Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(
                color: AppColors.green,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.send_rounded,
                  color: Colors.white, size: 20),
            ),
          ),
        ],
      ),
    );
  }
}

class _ChatMsg {
  final bool isAI;
  final String text;
  final String timestamp;
  final Plan? plan;

  const _ChatMsg({
    required this.isAI,
    required this.text,
    required this.timestamp,
    this.plan,
  });
}
