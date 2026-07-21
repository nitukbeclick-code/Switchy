import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HapticFeedback;
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/plan_card/plan_card_widget.dart';
import '../../services/advisor_engine.dart';
import '../../services/edge_advisor.dart';
import '../../services/savings_summary.dart';
import '../../services/provider_ratings.dart';
import '../../services/backend/local_backend.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_sheet.dart';
import '../../widgets/pressable.dart';

class AIAdvisorWidget extends StatefulWidget {
  const AIAdvisorWidget({super.key, this.edgeAdvisor});

  /// Injectable edge-agent client — tests pass a fake (mocked HTTP); production
  /// leaves it null and the state builds one over [appBackend.aiChat].
  final EdgeAdvisor? edgeAdvisor;

  @override
  State<AIAdvisorWidget> createState() => _AIAdvisorWidgetState();
}

class _AIAdvisorWidgetState extends State<AIAdvisorWidget> {
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  bool _isTyping = false;
  late List<_ChatMsg> _messages;

  /// The live edge agent (site-ai-chat) over the backend invoker. The on-device
  /// [AdvisorEngine] is the offline fallback when this throws.
  late final EdgeAdvisor _edge =
      widget.edgeAdvisor ?? EdgeAdvisor(invoker: appBackend.aiChat);

  List<_ChatMsg> _buildSeed() {
    final appState = AppState();
    final String greeting;
    if (appState.isLoggedIn && appState.firstName.isNotEmpty && appState.firstName != 'אורח') {
      greeting = 'שלום ${appState.firstName}! אני Switchy AI\nיועץ התקשורת החכם שלך.\n\nמה מחפשים?';
    } else {
      greeting = 'שלום! אני Switchy AI\nיועץ התקשורת החכם שלך.\n\nמה מחפשים?';
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
    HapticFeedback.lightImpact();
    _inputCtrl.clear();
    final appState = Provider.of<AppState>(context, listen: false);
    // Snapshot the prior transcript BEFORE adding this turn, so the edge agent
    // gets the conversation up to (not including) the new message.
    final history = _edgeHistory();
    appState.addAdvisorMessage(text: text, isUser: true);
    setState(() {
      _messages.add(_ChatMsg(text: text, isUser: true, time: DateTime.now()));
      _isTyping = true;
    });
    _scrollToBottom();

    // 1) Try the live, grounded edge agent (site-ai-chat) — multi-turn via the
    //    persisted session id. 2) On ANY failure (offline, edge not configured,
    //    non-2xx, timeout) fall back to the on-device AdvisorEngine, which also
    //    renders plan cards and deep-links. The user always gets an answer.
    _ChatMsg? botMsg;
    try {
      // Ground the live turn in the user's own bill for the browsed category —
      // the offline engine already sees the bills, so this brings live chat to
      // parity. Only when a real bill exists; the edge clamps/validates + omits
      // an invalid category, and never invents a number from it.
      final cat = appState.selectedCat;
      final monthly = appState.currentBill(cat);
      final res = await _edge.respond(
        text,
        history: history,
        sessionId: appState.advisorSessionId,
        billHint: monthly > 0 ? {'monthly': monthly, 'category': cat} : null,
      );
      if (res.sessionId != null) appState.setAdvisorSessionId(res.sessionId);
      botMsg = _ChatMsg(
        text: res.reply,
        isUser: false,
        time: DateTime.now(),
        offerLead: res.offerLead,
        contextTruncated: res.contextTruncated,
      );
    } catch (_) {
      // Offline fallback: the pure AdvisorEngine classifies intent, detects
      // provider/category/filter/budget, runs the plan pipeline and builds the
      // Hebrew reply — fully on-device, no network.
      final typingDelay = 300 + (text.length * 8).clamp(0, 500);
      await Future.delayed(Duration(milliseconds: typingDelay));
      final reply = AdvisorEngine.respondTo(text, context: _advisorContext(appState));
      final topPlans = reply.planIds.map((id) => planById(id)).whereType<Plan>().toList();
      botMsg = _ChatMsg(
        text: reply.text,
        isUser: false,
        time: DateTime.now(),
        planIds: topPlans.map((p) => p.id).toList(),
        cat: reply.category,
        fromFallback: true,
      );
      for (final p in topPlans) {
        appBackend.trackPlanView(planId: p.id, provider: p.provider, category: p.cat).catchError((_) {});
      }
    }

    if (mounted) {
      appState.addAdvisorMessage(text: botMsg.text, isUser: false);
      setState(() {
        _isTyping = false;
        _messages.add(botMsg!);
      });
    }
    _scrollToBottom();
  }

  /// The transcript replayed to the edge agent (oldest→newest), excluding the
  /// turn currently being sent. The engine trims this to its window.
  List<AdvisorTurn> _edgeHistory() => _messages
      .map((m) => AdvisorTurn(role: m.isUser ? 'user' : 'bot', text: m.text))
      .toList();

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
          // Fixed ink header (const token) — matches the app-wide dark-hero
          // header language; green stays reserved for CTAs/active states.
          decoration: const BoxDecoration(color: AppColors.primary),
        ),
        title: Row(
          children: [
            ExcludeSemantics(
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                ),
                child: const Center(
                  child: Icon(Icons.auto_awesome_rounded, size: 18, color: Colors.white),
                ),
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Title + status ride the type scale; white-on-ink is the only
                // delta (fixed header, valid in both themes).
                Text('Switchy AI', style: ffTheme.titleLarge.copyWith(color: Colors.white)),
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text('מחובר עכשיו', style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w400, color: Colors.white70)),
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
              final confirmed = await AppSheet.show<bool>(
                context,
                title: 'נקה שיחה',
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('לנקות את השיחה?', style: ffTheme.bodyMedium),
                    const SizedBox(height: 16),
                    AppButton(
                      text: 'נקה',
                      color: ffTheme.error,
                      width: double.infinity,
                      onPressed: () async => Navigator.pop(context, true),
                    ),
                    const SizedBox(height: 8),
                    AppButton.secondary(
                      text: 'ביטול',
                      width: double.infinity,
                      onPressed: () async => Navigator.pop(context, false),
                    ),
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
                  // 2.4 keeps every quick-start chip cell at/above the 48dp
                  // accessible tap minimum on common phone widths.
                  childAspectRatio: 2.4,
                ),
                itemCount: quickStarts.length,
                itemBuilder: (ctx, i) {
                  final q = quickStarts[i];
                  return Semantics(
                    button: true,
                    label: q,
                    child: Pressable(
                      onTap: () => _send(q),
                      child: Container(
                        alignment: Alignment.center,
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(
                          color: ffTheme.brandAccentTint,
                          borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                          border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.22)),
                        ),
                        child: Text(
                          q,
                          style: ffTheme.labelMedium.copyWith(
                            color: ffTheme.brandAccentText,
                            fontWeight: FontWeight.w700,
                          ),
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                  ).animate(delay: (i.clamp(0, 6) * 30).ms).fadeIn(duration: 240.ms, curve: ffTheme.easeOut).slideY(begin: 0.1, end: 0, duration: 240.ms, curve: ffTheme.easeOut);
                },
              ),
            ).animate().fadeIn(duration: 300.ms),

          // Input bar
          Container(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            decoration: BoxDecoration(
              color: ffTheme.secondaryBackground,
              border: Border(top: BorderSide(color: ffTheme.alternate)),
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
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.send,
                      decoration: InputDecoration(
                        hintText: 'שאל על מסלולי תקשורת...',
                        hintTextDirection: TextDirection.rtl,
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusPill), borderSide: BorderSide(color: ffTheme.alternate)),
                        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusPill), borderSide: BorderSide(color: ffTheme.alternate)),
                        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusPill), borderSide: BorderSide(color: ffTheme.brandAccent, width: 1.5)),
                        filled: true,
                        fillColor: ffTheme.background,
                      ),
                      onSubmitted: _send,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Semantics(
                    button: true,
                    label: 'שלח הודעה',
                    child: Pressable(
                      onTap: () => _send(_inputCtrl.text),
                      child: Container(
                        // >=48dp accessible tap target for the primary send CTA.
                        width: kMinTapTarget,
                        height: kMinTapTarget,
                        decoration: BoxDecoration(
                          gradient: ffTheme.accentGradient,
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

  /// True when this bot reply came from the on-device fallback (no live edge
  /// agent) — the bubble badges it "מצב לא מקוון".
  final bool fromFallback;

  /// True when the edge agent detected a switch/contact intent — the bubble
  /// offers a hand-off to a rep (lead capture happens on that screen, with
  /// consent — never here).
  final bool offerLead;

  /// True when older turns fell outside the model's context window.
  final bool contextTruncated;

  const _ChatMsg({
    required this.text,
    required this.isUser,
    required this.time,
    this.planIds = const [],
    this.cat = 'cellular',
    this.fromFallback = false,
    this.offerLead = false,
    this.contextTruncated = false,
  });
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
    // Emil: an advisor reply is a HIGH-FREQUENCY append, so it gets ONE crisp
    // single-bubble entrance (ease-out settle) — never a staggered cascade.
    // Reduced-motion keeps the fade and drops the 8px slide.
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final bubble = Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: msg.isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          if (!msg.isUser && msg.fromFallback) ...[
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.cloud_off_rounded, size: 13, color: ffTheme.secondaryText),
                const SizedBox(width: 4),
                Text('מצב לא מקוון — תשובה מהמכשיר',
                    style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
              ],
            ),
            const SizedBox(height: 4),
          ],
          Row(
            mainAxisAlignment: msg.isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (!msg.isUser) ...[
                // The Switchy mascot avatar beside every agent bubble — anchors
                // the "theirs" side and reinforces the AI identity (decorative;
                // the agent is named in the app bar, so hidden from a11y).
                ExcludeSemantics(
                  child: Container(
                    width: 30,
                    height: 30,
                    margin: const EdgeInsetsDirectional.only(end: 8, bottom: 2),
                    decoration: BoxDecoration(
                      gradient: ffTheme.accentGradient,
                      shape: BoxShape.circle,
                    ),
                    child: const Center(
                      child: Icon(Icons.auto_awesome_rounded, size: 16, color: Colors.white),
                    ),
                  ),
                ),
                Flexible(
                  child: Container(
                    constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: ffTheme.secondaryBackground,
                      // Bubble corners from the radius scale (largest content
                      // corner + the small tail); flat + 1px hairline — resting
                      // content carries no shadow.
                      borderRadius: BorderRadius.only(
                        topLeft: Radius.circular(ffTheme.radiusXl),
                        topRight: Radius.circular(ffTheme.radiusXl),
                        bottomLeft: Radius.circular(ffTheme.radiusXs),
                        bottomRight: Radius.circular(ffTheme.radiusXl),
                      ),
                      border: Border.all(color: ffTheme.lineColor),
                    ),
                    child: Text(msg.text, style: ffTheme.bodyMedium.copyWith(height: 1.5), textDirection: TextDirection.rtl),
                  ),
                ),
              ] else ...[
                Container(
                  constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    gradient: ffTheme.accentGradient,
                    borderRadius: BorderRadius.only(
                      topLeft: Radius.circular(ffTheme.radiusXl),
                      topRight: Radius.circular(ffTheme.radiusXl),
                      bottomLeft: Radius.circular(ffTheme.radiusXl),
                      bottomRight: Radius.circular(ffTheme.radiusXs),
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
                Semantics(
                  button: true,
                  label: 'ראה את כל המסלולים',
                  child: Pressable(
                    onTap: () {
                      Provider.of<AppState>(context, listen: false).setCategory(msg.cat);
                      context.pushNamed('Results');
                    },
                    // >=48dp hit area; the painted pill keeps its compact size.
                    child: _MinTapTarget(
                      child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                      decoration: BoxDecoration(
                        color: ffTheme.brandAccentTint,
                        borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                        border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.3)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('ראה הכל', style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
                          const SizedBox(width: 4),
                          Icon(Icons.arrow_back_ios_rounded, size: 11, color: ffTheme.brandAccent),
                        ],
                      ),
                      ),
                    ),
                  ),
                ),
                if (msg.planId != null) ...[
                  const SizedBox(width: 8),
                  Semantics(
                    button: true,
                    label: 'דבר עם נציג',
                    child: Pressable(
                      onTap: () => context.pushNamed('Lead', pathParameters: {'planId': msg.planId!}, queryParameters: {'source': 'advisor'}),
                      child: _MinTapTarget(
                        child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                        decoration: BoxDecoration(
                          gradient: ffTheme.accentGradient,
                          borderRadius: BorderRadius.circular(ffTheme.radiusPill),
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
          // Edge agent offered a hand-off (genuine switch/contact intent): a
          // single honest CTA into the rep flow. Lead capture (with consent)
          // happens on the callback screen — never silently here.
          if (!msg.isUser && msg.offerLead && msg.planIds.isEmpty) ...[
            const SizedBox(height: 8),
            Semantics(
              button: true,
              label: 'דברו עם נציג',
              child: Pressable(
                onTap: () => context.pushNamed('Callback'),
                // >=48dp hit area; the painted pill keeps its compact size.
                child: _MinTapTarget(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      gradient: ffTheme.accentGradient,
                      borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.support_agent_rounded, size: 14, color: Colors.white),
                        const SizedBox(width: 5),
                        Text('דברו עם נציג — חינם',
                            style: ffTheme.labelSmall
                                .copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
          if (!msg.isUser && msg.contextTruncated) ...[
            const SizedBox(height: 6),
            Text('הערה: חלק מההודעות הקודמות מחוץ לזיכרון השיחה הנוכחי.',
                style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText),
                textDirection: TextDirection.rtl),
          ],
        ],
      ),
    );

    if (reduceMotion) {
      return bubble.animate().fadeIn(duration: 260.ms);
    }
    return bubble.animate().fadeIn(duration: 260.ms, curve: ffTheme.easeOut).slideY(
          begin: 0.08,
          end: 0,
          duration: 260.ms,
          curve: ffTheme.easeOut,
        );
  }
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble({required this.ffTheme});
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    // Emil: the typing indicator is the sanctioned GENUINE loader — its three
    // dots may pulse on repeat to signal work in flight. Reduced-motion drops
    // the loop (no infinite animation): static dots still read as "typing".
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    Widget dot(int i) {
      final d = Container(
        width: 8,
        height: 8,
        margin: EdgeInsets.only(left: i > 0 ? 4 : 0),
        decoration: BoxDecoration(color: ffTheme.brandAccent, shape: BoxShape.circle),
      );
      if (reduceMotion) return d;
      return d
          .animate(onPlay: (c) => c.repeat())
          .fadeIn(delay: (i * 200).ms, duration: 300.ms)
          .then()
          .fadeOut(duration: 300.ms);
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // Mascot avatar matches the agent bubbles so "Switchy is typing" reads
          // as the same speaker (decorative — hidden from screen readers).
          ExcludeSemantics(
            child: Container(
              width: 30,
              height: 30,
              margin: const EdgeInsetsDirectional.only(end: 8, bottom: 2),
              decoration: BoxDecoration(
                gradient: ffTheme.accentGradient,
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: Icon(Icons.auto_awesome_rounded, size: 16, color: Colors.white),
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            decoration: BoxDecoration(
              color: ffTheme.secondaryBackground,
              // Same token-sourced bubble corners + flat hairline as the agent
              // bubbles — one elevation story, no resting shadow.
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(ffTheme.radiusXl),
                topRight: Radius.circular(ffTheme.radiusXl),
                bottomLeft: Radius.circular(ffTheme.radiusXs),
                bottomRight: Radius.circular(ffTheme.radiusXl),
              ),
              border: Border.all(color: ffTheme.lineColor),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(3, dot),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 200.ms, curve: ffTheme.easeOut);
  }
}

/// Raises a small control's HIT AREA to the >=48dp accessibility minimum
/// ([kMinTapTarget]) without growing the painted control itself — the child
/// keeps its intrinsic size, centered inside the enlarged (transparent) box.
/// The wrapping [Pressable] hit-tests opaquely, so the whole box accepts taps.
class _MinTapTarget extends StatelessWidget {
  const _MinTapTarget({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => ConstrainedBox(
        constraints: const BoxConstraints(
            minWidth: kMinTapTarget, minHeight: kMinTapTarget),
        child: Align(widthFactor: 1, heightFactor: 1, child: child),
      );
}
