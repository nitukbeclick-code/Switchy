import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';

import '../../app_state.dart';
import '../../core/nav.dart';
import '../../theme/app_theme.dart';
import '../../components/plan_card/plan_card_widget.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../services/backend/backend.dart';
import '../../services/backend/local_backend.dart' show appBackend;
import '../../services/realtime_service.dart';
import '../../services/push_notification_service.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/skeleton.dart';
import 'deals_engine.dart';

/// מבצעים בזמן אמת — the real-time deals feed.
///
/// Reads the `plan_price_history` ledger via [appBackend.fetchPriceSnapshots],
/// diffs each plan's snapshots through the pure [DealsEngine] into honest price
/// drops (real old→new prices, never estimated), and renders them as premium
/// cards. A [RealtimePoller] over [Backend.priceHistoryChanges] refreshes the
/// moment a fresh snapshot lands (with a heartbeat poll as the graceful
/// fallback; [LocalBackend]/CI emit an empty stream so the feed simply shows an
/// honest empty state). When a NEW top drop appears while the screen is open and
/// the user has price alerts on, it fires a local price-drop notification.
class DealsWidget extends StatefulWidget {
  const DealsWidget({super.key});

  @override
  State<DealsWidget> createState() => _DealsWidgetState();
}

class _DealsWidgetState extends State<DealsWidget> {
  RealtimePoller? _poller;
  List<PriceDrop> _drops = const [];
  bool _loading = true;
  Object? _error;

  /// Plan ids we've already alerted on this session — so a heartbeat re-poll of
  /// the same drop doesn't re-notify. Keyed by "planId@newPrice" so a genuinely
  /// new drop on the same plan still alerts.
  final Set<String> _alerted = {};
  bool _firstLoadDone = false;

  @override
  void initState() {
    super.initState();
    _load();
    // Realtime-first: refresh on every plan_price_history insert, with the
    // heartbeat poll as the fallback. Empty stream (LocalBackend/CI) ⇒ pure
    // heartbeat, which starts on the fast cadence until realtime proves alive.
    _poller = RealtimePoller(
      eventStream: appBackend.priceHistoryChanges(),
      onRefresh: () => _load(silent: true),
    )..start();
  }

  @override
  void dispose() {
    _poller?.dispose();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent && mounted) setState(() => _loading = true);
    try {
      final snapshots = await appBackend.fetchPriceSnapshots();
      final drops = DealsEngine.dropsFrom(snapshots);
      if (!mounted) return;
      setState(() {
        _drops = drops;
        _error = null;
        _loading = false;
      });
      _maybeNotify(drops);
      _firstLoadDone = true;
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  /// Fire a local notification for the single best NEW drop — but never on the
  /// very first load (the feed opening shouldn't spam every existing deal), only
  /// for drops that appear afterwards while the screen is live, and only when the
  /// user has price alerts enabled.
  void _maybeNotify(List<PriceDrop> drops) {
    if (!_firstLoadDone) {
      // Seed the seen-set on first load so existing deals don't re-alert later.
      for (final d in drops) {
        _alerted.add('${d.planId}@${d.newPrice}');
      }
      return;
    }
    final appState = AppState();
    if (!appState.prefPriceAlerts) return;
    for (final d in drops) {
      final key = '${d.planId}@${d.newPrice}';
      if (_alerted.contains(key)) continue;
      _alerted.add(key);
      final p = d.plan;
      if (p == null) continue;
      PushNotificationService.instance.notifyPriceDrop(
        title: 'ירידת מחיר: ${p.provider}',
        body:
            '${p.plan} ירד מ-₪${_fmt(d.oldPrice)} ל-₪${_fmt(d.newPrice)} — חיסכון ₪${d.annualSaving}/שנה',
      );
      // Only the single best new drop alerts per refresh — drops are sorted by
      // size, so the first un-seen one is the most significant.
      break;
    }
  }

  String _fmt(double v) =>
      v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: Semantics(
          header: true,
          child: Text('מבצעים בזמן אמת',
              style: ffTheme.headlineSmall.copyWith(fontWeight: FontWeight.w700)),
        ),
        backgroundColor: ffTheme.background,
        foregroundColor: ffTheme.primaryText,
        elevation: 0,
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _buildBody(ffTheme),
      ),
    );
  }

  Widget _buildBody(AppTheme ffTheme) {
    if (_loading) {
      // Designed loading state — ghosts of the deal rows that signal the final
      // shape (a drop banner + a plan card) instead of a blocking spinner.
      return ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: const [
          _DealSkeleton(),
          _DealSkeleton(),
          _DealSkeleton(),
          _DealSkeleton(),
        ],
      );
    }
    if (_error != null) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 80),
          EmptyState(
            icon: Icons.cloud_off_rounded,
            headline: 'לא הצלחנו לטעון מבצעים',
            subtitle: 'בדקו את החיבור ונסו שוב.',
            ctaLabel: 'נסו שוב',
            onCtaTap: () => _load(),
          ),
        ],
      );
    }
    if (_drops.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 60),
          EmptyState(
            icon: Icons.trending_down_rounded,
            headline: 'אין ירידות מחיר כרגע',
            subtitle:
                'אנחנו עוקבים אחרי מחירי המסלולים מסביב לשעון. ברגע שמסלול יוזל — הוא יופיע כאן.',
            // Canonical BROWSE verb ("השוו מסלולים") — this opens the catalogue to
            // browse, it does not convert. Keeping it consistent with the home /
            // results / profile browse CTAs fixes the "verb changes at every step"
            // finding (was the outlier "עיינו במסלולים").
            ctaLabel: 'השוו מסלולים',
            onCtaTap: () async => context.pushNamed('Results'),
          ),
        ],
      );
    }

    // PERF: scope the AppState dependency to the one field this list reads —
    // the per-category bills. The previous Provider.of<AppState>(context)
    // rebuilt the whole feed on ANY notify (likes, quiz, tracker...); now only
    // a bill change re-renders. The selector's canonical string is cheap (5
    // fixed categories) and only changes when a bill value changes.
    context.select<AppState, String>((s) =>
        s.currentBills.entries.map((e) => '${e.key}=${e.value}').join(','));
    final appState = AppState();
    // Reduced-motion KEEPS the fade (opacity) but DROPS the translate (Emil:
    // a vestibular-safe reveal is opacity-only). Read once per build.
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      itemCount: _drops.length + 1,
      itemBuilder: (ctx, i) {
        if (i == 0) return _buildHeader(ffTheme);
        final drop = _drops[i - 1];
        // Cards reveal in a calm 40ms-step stagger (Emil's 30-80ms band),
        // capped at 8 so the tail never drags. Each row fades up 6% with the
        // shared ease-out (entering motion is always ease-out, never ease-in).
        final card = _DealCard(
          drop: drop,
          ffTheme: ffTheme,
          bill: appState.currentBill(drop.category),
        ).animate(delay: ((i - 1).clamp(0, 8) * 40).ms).fadeIn(duration: 280.ms);
        // RepaintBoundary: one card's entrance never repaints its neighbours.
        return RepaintBoundary(
          child: reduceMotion
              ? card
              : card.slideY(begin: 0.06, end: 0, curve: ffTheme.easeOut),
        );
      },
    );
  }

  Widget _buildHeader(AppTheme ffTheme) {
    final live = _poller?.isRealtimeLive ?? false;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12, top: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              '${_drops.length} מסלולים ירדו במחיר לאחרונה',
              style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: ffTheme.brandAccentTint,
              borderRadius: BorderRadius.circular(ffTheme.radiusPill),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: live ? ffTheme.brandAccent : ffTheme.secondaryText,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 5),
                Text(live ? 'מתעדכן בזמן אמת' : 'מתעדכן',
                    style: ffTheme.labelSmall.copyWith(
                        color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DealCard extends StatelessWidget {
  const _DealCard({required this.drop, required this.ffTheme, required this.bill});
  final PriceDrop drop;
  final AppTheme ffTheme;
  final int bill;

  String _fmt(double v) =>
      v == v.roundToDouble() ? v.toInt().toString() : v.toStringAsFixed(2);

  @override
  Widget build(BuildContext context) {
    final plan = drop.plan;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Drop banner — the honest old→new headline. Green VALUE tint (the
          // canonical brandAccentTint surface, matching the SavingPill language).
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: ffTheme.brandAccentTint,
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(ffTheme.radiusCard),
                topRight: Radius.circular(ffTheme.radiusCard),
              ),
              border: Border.all(color: ffTheme.saving.withValues(alpha: 0.30)),
            ),
            child: Row(
              children: [
                ExcludeSemantics(child: LogoWidget(provider: drop.provider, size: 26)),
                const SizedBox(width: 8),
                Icon(Icons.trending_down_rounded, size: 18, color: ffTheme.savingText),
                const SizedBox(width: 6),
                Expanded(
                  // Screen readers get one coherent sentence (real figures)
                  // instead of the visual strikethrough/arrow fragments.
                  child: Semantics(
                    label:
                        'המחיר ירד מ-₪${_fmt(drop.oldPrice)} ל-₪${_fmt(drop.newPrice)}',
                    excludeSemantics: true,
                    child: Text.rich(
                      TextSpan(children: [
                        TextSpan(
                          text: '₪${_fmt(drop.oldPrice)} ',
                          style: ffTheme.labelMedium.copyWith(
                            color: ffTheme.secondaryText,
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                        TextSpan(
                          text: '← ₪${_fmt(drop.newPrice)}',
                          style: ffTheme.labelLarge.copyWith(
                              color: ffTheme.savingText, fontWeight: FontWeight.w800),
                        ),
                      ]),
                      textDirection: TextDirection.rtl,
                    ),
                  ),
                ),
                Semantics(
                  label: 'ירידה של ${drop.dropPctRounded} אחוז',
                  excludeSemantics: true,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                    decoration: BoxDecoration(
                      color: ffTheme.saving,
                      borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                    ),
                    child: Text('-${drop.dropPctRounded}%',
                        style: ffTheme.labelSmall.copyWith(
                            // Contrast-aware ink on the solid green VALUE fill —
                            // white on light, near-black on the lifted dark green
                            // (pinned Colors.white failed AA in dark mode).
                            color: ffTheme.onSaving,
                            fontWeight: FontWeight.w800)),
                  ),
                ),
              ],
            ),
          ),
          if (plan != null)
            PlanCardWidget(plan: plan, currentBill: bill, showCompare: false)
          else
            // Defensive — DealsEngine already drops null-plan rows, but never
            // render against a guessed plan if one slips through.
            const SizedBox.shrink(),
        ],
      ),
    );
  }
}

/// A loading ghost of a [_DealCard]: a pill-shaped amber-tinted drop-banner
/// stand-in atop a [SkeletonPlanCard], so the feed already signals its final
/// shape (drop headline + plan row) before the price snapshots land. RTL/dark/
/// reduced-motion all flow through the shared [SkeletonShimmer] primitives.
class _DealSkeleton extends StatelessWidget {
  const _DealSkeleton();

  @override
  Widget build(BuildContext context) {
    final t = AppTheme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Drop-banner ghost — the green VALUE tint so the loading state
          // already reads as a VALUE surface, matching the real banner above.
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            decoration: BoxDecoration(
              color: t.brandAccentTint,
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(t.radiusCard),
                topRight: Radius.circular(t.radiusCard),
              ),
              border: Border.all(color: t.saving.withValues(alpha: 0.22)),
            ),
            child: const SkeletonShimmer(
              child: Row(
                children: [
                  SkeletonBox(width: 26, height: 26, radius: 13),
                  SizedBox(width: 8),
                  SkeletonBox(width: 120, height: 13),
                  Spacer(),
                  SkeletonBox(width: 46, height: 20, radius: 999),
                ],
              ),
            ),
          ),
          const SkeletonPlanCard(),
        ],
      ),
    );
  }
}
