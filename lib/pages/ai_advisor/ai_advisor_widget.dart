import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/plan_card/plan_card_widget.dart';
import '../../services/advisor_engine.dart';
import '../../services/savings_summary.dart';
import '../../services/provider_ratings.dart';
import '../../services/backend/local_backend.dart';

class AIAdvisorWidget extends StatefulWidget {
  const AIAdvisorWidget({super.key});

  @override
  State<AIAdvisorWidget> createState() => _AIAdvisorWidgetState();
}

class _AIAdvisorWidgetState extends State<AIAdvisorWidget> {
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  bool _isTyping = false;
  late List<_ChatMsg> _messages;

  List<_ChatMsg> _buildSeed() {
    final appState = AppState();
    final String greeting;
    if (appState.isLoggedIn && appState.firstName.isNotEmpty && appState.firstName != 'אורח') {
      greeting = 'שלום ${appState.firstName}! אני חוסך AI 🤖\nיועץ התקשורת החכם שלך.\n\nמה מחפשים?';
    } else {
      greeting = 'שלום! אני חוסך AI 🤖\nיועץ התקשורת החכם שלך.\n\nמה מחפשים?';
    }
    return [_ChatMsg(text: greeting, isUser: false, time: DateTime.now())];
  }

  @override
  void initState() {
    super.initState();
    final appState = AppState();
    final history = appState.advisorHistory;
    if (history.isNotEmpty) {
      _messages = history.map((m) => _ChatMsg(
        text: m['text'] as String,
        isUser: m['isUser'] as bool,
        time: DateTime.tryParse(m['ts'] as String? ?? '') ?? DateTime.now(),
      )).toList();
    } else {
      _messages = _buildSeed();
      // Persist after the first frame — notifying listeners synchronously here
      // would mark the AppState provider dirty during the build phase.
      final seedText = _messages.first.text;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        appState.addAdvisorMessage(text: seedText, isUser: false);
      });
    }
  }

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _send(String text) async {
    if (text.trim().isEmpty || _isTyping) return;
    _inputCtrl.clear();
    final appState = Provider.of<AppState>(context, listen: false);
    appState.addAdvisorMessage(text: text, isUser: true);
    setState(() {
      _messages.add(_ChatMsg(text: text, isUser: true, time: DateTime.now()));
      _isTyping = true;
    });
    _scrollToBottom();

    final typingDelay = 800 + (text.length * 12).clamp(0, 800);
    await Future.delayed(Duration(milliseconds: typingDelay));

    // The advisor's "brain" lives in the pure AdvisorEngine — intent
    // classification, provider/category/filter/budget detection, the plan
    // pipeline and every Hebrew reply branch. The widget only builds the
    // context from AppState and renders the result.
    final reply = AdvisorEngine.respondTo(text, context: _advisorContext(appState));
    final topPlans = reply.planIds.map((id) => planById(id)).whereType<Plan>().toList();

    if (mounted) {
      appState.addAdvisorMessage(text: reply.text, isUser: false);
      setState(() {
        _isTyping = false;
        _messages.add(_ChatMsg(
          text: reply.text,
          isUser: false,
          time: DateTime.now(),
          planIds: topPlans.map((p) => p.id).toList(),
          cat: reply.category,
        ));
      });
      for (final p in topPlans) {
        appBackend.trackPlanView(planId: p.id, provider: p.provider, category: p.cat).catchError((_) {});
      }
    }
    _scrollToBottom();
  }

  /// Build the pure [AdvisorContext] the engine needs from the live [AppState]:
  /// per-category bills, the browsed category, the watchlist, the quiz/preference
  /// signals, the precomputed savings, and a rating lookup that blends in the
  /// user's own review (so the advisor matches the ratings screens).
  AdvisorContext _advisorContext(AppState appState) => AdvisorContext(
        bills: {
          for (final c in const ['cellular', 'internet', 'tv', 'triple', 'abroad'])
            c: appState.currentBill(c),
        },
        selectedCat: appState.selectedCat,
        watchedPlanIds: appState.watchedPlans,
        quizCompleted: appState.quizCompleted,
        quizCat: appState.quizCat,
        quizBudget: appState.quizBudget,
        quizPriority: appState.quizPriority,
        quizLines: appState.quizLines,
        wants5G: appState.wants5G,
        wantsAbroad: appState.wantsAbroad,
        wantsNoCommit: appState.wantsNoCommit,
        savings: [
          for (final cs in computeSavings(appState).categories)
            AdvisorSaving(
              categoryId: cs.categoryId,
              annualSaving: cs.annualSaving,
              bestProvider: cs.best?.plan.provider,
            ),
        ],
        ratingLookup: (p) {
          final r = ProviderRatings.forProvider(p, appState: appState);
          return AdvisorProviderRating(
            provider: r.provider,
            stars: r.stars,
            reviewCount: r.reviewCount,
            sub: r.sub,
          );
        },
      );

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
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context, listen: false);

    final quickStarts = [
      '✨ מה הכי משתלם לי?',
      '📱 סלולר הכי זול',
      '🌐 אינטרנט 1000Mb',
      '✅ ללא התחייבות',
      '📶 5G מהיר',
      '✈️ חבילת חו"ל',
      '💰 פחות מ-₪50',
      '📺 טלוויזיה + ספורט',
      '🏠 חבילה משולבת',
      '🤝 רוצה להצטרף!',
      '💳 כמה אני משלם?',
      '💰 כמה אחסוך?',
    ];

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
            ExcludeSemantics(
              child: Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: ffTheme.secondary,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Center(child: Text('✦', style: TextStyle(fontSize: 16))),
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('חוסך AI', style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(color: Color(0xFF111827), shape: BoxShape.circle),
                    ).animate(onPlay: (c) => c.repeat(reverse: true))
                      .scale(begin: const Offset(1, 1), end: const Offset(1.3, 1.3), duration: 800.ms),
                    const SizedBox(width: 4),
                    Text('מחובר עכשיו', style: GoogleFonts.assistant(fontSize: 11, color: Colors.white70)),
                  ],
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_sweep_rounded),
            tooltip: 'נקה שיחה',
            onPressed: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: Text('נקה שיחה', style: AppTheme.of(context).titleMedium),
                  content: Text('לנקות את השיחה?', style: AppTheme.of(context).bodyMedium),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('ביטול')),
                    TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('נקה')),
                  ],
                ),
              );
              if (confirmed == true && mounted) {
                final appState = AppState();
                appState.clearAdvisorHistory();
                final seed = _buildSeed();
                appState.addAdvisorMessage(text: seed.first.text, isUser: false);
                setState(() { _messages = seed; });
              }
            },
          ),
        ],
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
                return _MessageBubble(msg: msg, ffTheme: ffTheme, bill: appState.currentBill(msg.cat));
              },
            ),
          ),

          // Quick start chips (when only greeting)
          if (_messages.length == 1)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3,
                  mainAxisSpacing: 6,
                  crossAxisSpacing: 6,
                  childAspectRatio: 2.6,
                ),
                itemCount: quickStarts.length,
                itemBuilder: (ctx, i) {
                  final q = quickStarts[i];
                  return GestureDetector(
                    onTap: () => _send(q),
                    child: Container(
                      alignment: Alignment.center,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: ffTheme.alternate),
                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.03), blurRadius: 4, offset: const Offset(0, 1))],
                      ),
                      child: Text(q, style: ffTheme.labelMedium, textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis),
                    ),
                  );
                },
              ),
            ).animate().fadeIn(duration: 500.ms),

          // Input bar
          Container(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: ffTheme.alternate)),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 10, offset: const Offset(0, -4))],
            ),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _inputCtrl,
                      textDirection: TextDirection.rtl,
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
                  Semantics(
                    button: true,
                    label: 'שלח הודעה',
                    child: GestureDetector(
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
  final List<String> planIds;
  final String cat;
  const _ChatMsg({required this.text, required this.isUser, required this.time, this.planIds = const [], this.cat = 'cellular'});
  String? get planId => planIds.isNotEmpty ? planIds.first : null;
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.msg, required this.ffTheme, required this.bill});
  final _ChatMsg msg;
  final AppTheme ffTheme;
  final int bill;

  @override
  Widget build(BuildContext context) {
    final plans = msg.planIds.map((id) => planById(id)).whereType<Plan>().toList();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: msg.isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: msg.isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
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
                  child: Text(msg.text, style: ffTheme.bodyMedium.copyWith(height: 1.5), textDirection: TextDirection.rtl),
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
                  child: Text(msg.text, style: ffTheme.bodyMedium.copyWith(color: Colors.white, height: 1.5), textDirection: TextDirection.rtl),
                ),
              ],
            ],
          ),
          if (plans.isNotEmpty) ...[
            const SizedBox(height: 8),
            ...plans.asMap().entries.map((e) => Padding(
              padding: EdgeInsets.only(bottom: e.key < plans.length - 1 ? 8 : 0),
              child: PlanCardWidget(plan: e.value, currentBill: bill, showCompare: false),
            )),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                GestureDetector(
                  onTap: () {
                    Provider.of<AppState>(context, listen: false).setCategory(msg.cat);
                    context.pushNamed('Results');
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: ffTheme.primary.withValues(alpha: 0.3)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('ראה הכל', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w600)),
                        const SizedBox(width: 4),
                        Icon(Icons.arrow_back_ios_rounded, size: 11, color: ffTheme.primary),
                      ],
                    ),
                  ),
                ),
                if (msg.planId != null) ...[
                  const SizedBox(width: 8),
                  GestureDetector(
                    onTap: () => context.pushNamed('Lead', pathParameters: {'planId': msg.planId!}, queryParameters: {'source': 'advisor'}),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                      decoration: BoxDecoration(
                        color: ffTheme.primary,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.phone_forwarded_rounded, size: 13, color: Colors.white),
                          const SizedBox(width: 5),
                          Text('דבר עם נציג', style: ffTheme.labelSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.start,
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
