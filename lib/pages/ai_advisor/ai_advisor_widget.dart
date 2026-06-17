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
import '../../widgets/pressable.dart';
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
  bool _profileExpanded = false;
  late List<_ChatMsg> _messages;
  late String _userContextString;

  List<_ChatMsg> _buildSeed() {
    final appState = AppState();
    final String greeting;
    if (appState.isLoggedIn && appState.firstName.isNotEmpty && appState.firstName != 'אורח') {
      greeting = 'שלום ${appState.firstName}! אני חוסך AI\nיועץ התקשורת החכם שלך.\n\nמה מחפשים?';
    } else {
      greeting = 'שלום! אני חוסך AI\nיועץ התקשורת החכם שלך.\n\nמה מחפשים?';
    }
    return [_ChatMsg(text: greeting, isUser: false, time: DateTime.now())];
  }

  @override
  void initState() {
    super.initState();
    final appState = AppState();
    // Build the Hebrew profile context string once on init. It's rebuilt each
    // time the user sends a message (via _advisorContext) for the engine, but
    // the display string only needs refreshing when the advisor screen opens.
    _userContextString = AdvisorEngine.buildUserContext(appState);
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
    AdvisorReply reply = AdvisorEngine.respondTo(text, context: _advisorContext(appState));

    // When the engine couldn't classify the intent, fall back to a contextual
    // reply that references the user's actual profile data.
    if (reply.intent == AdvisorIntent.unknown) {
      final contextualText =
          AdvisorEngine.generateContextualReply(text, _userContextString);
      reply = AdvisorReply(
        text: contextualText,
        intent: AdvisorIntent.unknown,
        category: reply.category,
        planIds: reply.planIds,
      );
    }

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

  /// True when all per-category bills are zero (the user hasn't entered any).
  bool _billsAllZero(AppState appState) =>
      const ['cellular', 'internet', 'tv', 'triple', 'abroad']
          .every((c) => appState.currentBill(c) == 0);

  /// A collapsible "פרופיל שלי" card showing the user's context data.
  Widget _buildProfileCard(AppTheme ffTheme) {
    return AnimatedContainer(
      duration: ffTheme.motionMedium,
      curve: ffTheme.easeOut,
      margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(ffTheme.radiusMd),
        border: Border.all(color: ffTheme.lineColor),
        boxShadow: ffTheme.shadowSoft,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header row — tap to toggle
          InkWell(
            onTap: () => setState(() => _profileExpanded = !_profileExpanded),
            borderRadius: BorderRadius.circular(ffTheme.radiusMd),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              child: Row(
                children: [
                  Icon(Icons.person_outline_rounded, size: 18, color: ffTheme.secondaryText),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'הפרופיל שלי',
                      style: ffTheme.titleSmall.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                      textDirection: TextDirection.rtl,
                    ),
                  ),
                  Icon(
                    _profileExpanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                    size: 20,
                    color: ffTheme.secondaryText,
                  ),
                ],
              ),
            ),
          ),
          // Expandable body
          if (_profileExpanded) ...[
            Divider(height: 1, color: ffTheme.lineColor),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Text(
                _userContextString,
                style: ffTheme.bodySmall.copyWith(height: 1.7, color: ffTheme.primaryText),
                textDirection: TextDirection.rtl,
              ),
            ),
          ],
        ],
      ),
    ).animate().fadeIn(duration: 400.ms);
  }

  /// An info banner nudging the user to fill in their bills. Amber = VALUE:
  /// completing the bills unlocks accurate savings figures.
  Widget _buildBillsBanner(AppTheme ffTheme) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: ffTheme.saving.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(ffTheme.radiusXs),
        border: Border.all(color: ffTheme.saving.withValues(alpha: 0.45)),
      ),
      child: Row(
        children: [
          Icon(Icons.savings_outlined, color: ffTheme.savingDark, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'מלאו את החשבונות שלכם כדי לקבל המלצות חיסכון מדויקות',
              style: ffTheme.bodySmall.copyWith(
                color: ffTheme.savingDark,
                fontWeight: FontWeight.w600,
                height: 1.4,
              ),
              textDirection: TextDirection.rtl,
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 400.ms, delay: 200.ms);
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
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context, listen: false);
    final showBillsBanner = _billsAllZero(appState);

    final quickStarts = [
      'מה הכי משתלם לי?',
      'סלולר הכי זול',
      'אינטרנט 1000Mb',
      'ללא התחייבות',
      '5G מהיר',
      'חבילת חו"ל',
      'פחות מ-₪50',
      'טלוויזיה + ספורט',
      'חבילה משולבת',
      'רוצה להצטרף!',
      'כמה אני משלם?',
      'כמה אחסוך?',
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
                      width: 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(color: Colors.white.withValues(alpha: 0.6), blurRadius: 5),
                        ],
                      ),
                    ).animate().fadeIn(duration: 400.ms),
                    const SizedBox(width: 5),
                    Text('מחובר עכשיו', style: GoogleFonts.assistant(fontSize: 11, fontWeight: FontWeight.w600, color: Colors.white70)),
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
              padding: const EdgeInsets.only(top: 0, left: 16, right: 16, bottom: 16),
              // +1 for the profile card header item
              itemCount: _messages.length + (_isTyping ? 1 : 0) + 1,
              itemBuilder: (ctx, i) {
                // Index 0 → profile card (+ optional bills banner)
                if (i == 0) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _buildProfileCard(ffTheme),
                        if (showBillsBanner) _buildBillsBanner(ffTheme),
                        const SizedBox(height: 8),
                      ],
                    ),
                  );
                }
                // Shift real indices by 1
                final msgIdx = i - 1;
                if (msgIdx == _messages.length && _isTyping) {
                  return _TypingBubble(ffTheme: ffTheme);
                }
                final msg = _messages[msgIdx];
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
                  return Pressable(
                    onTap: () => _send(q),
                    child: Container(
                      alignment: Alignment.center,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                        border: Border.all(color: ffTheme.lineColor),
                        boxShadow: ffTheme.shadowSoft,
                      ),
                      child: Text(
                        q,
                        style: ffTheme.labelMedium.copyWith(color: ffTheme.primaryText),
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ).animate().fadeIn(duration: 280.ms, delay: (i * 35).ms).slideY(begin: 0.12, end: 0, duration: 280.ms, delay: (i * 35).ms, curve: ffTheme.easeOut);
                },
              ),
            ).animate().fadeIn(duration: 500.ms),

          // Input bar
          Container(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: ffTheme.lineColor)),
              boxShadow: ffTheme.shadowSoft,
            ),
            child: SafeArea(
              top: false,
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _inputCtrl,
                      textDirection: TextDirection.rtl,
                      style: ffTheme.bodyMedium,
                      decoration: InputDecoration(
                        hintText: 'שאל על מסלולי תקשורת...',
                        hintStyle: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusXl), borderSide: BorderSide(color: ffTheme.lineColor)),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusXl), borderSide: BorderSide(color: ffTheme.lineColor)),
                        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusXl), borderSide: BorderSide(color: ffTheme.brandAccent, width: 1.5)),
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
                    child: Pressable(
                      onTap: () => _send(_inputCtrl.text),
                      child: Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          gradient: ffTheme.accentGradient,
                          shape: BoxShape.circle,
                          boxShadow: ffTheme.shadowAccent,
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
                  behavior: HitTestBehavior.opaque,
                  onTap: () {
                    Provider.of<AppState>(context, listen: false).setCategory(msg.cat);
                    context.pushNamed('Results');
                  },
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 44),
                    child: Center(
                      widthFactor: 1,
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
                  ),
                ),
                if (msg.planId != null) ...[
                  const SizedBox(width: 8),
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => context.pushNamed('Lead', pathParameters: {'planId': msg.planId!}, queryParameters: {'source': 'advisor'}),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 44),
                      child: Center(
                        widthFactor: 1,
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
                margin: EdgeInsetsDirectional.only(start: i > 0 ? 4 : 0),
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
