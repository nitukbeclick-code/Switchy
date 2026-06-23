import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
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
        title: Text('מבצעים בזמן אמת',
            style: GoogleFonts.rubik(fontWeight: FontWeight.w700)),
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
      return const Center(child: CircularProgressIndicator());
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
            ctaLabel: 'עיינו במסלולים',
            onCtaTap: () async => context.pushNamed('Results'),
          ),
        ],
      );
    }

    final appState = Provider.of<AppState>(context);
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      itemCount: _drops.length + 1,
      itemBuilder: (ctx, i) {
        if (i == 0) return _buildHeader(ffTheme);
        final drop = _drops[i - 1];
        return _DealCard(
          drop: drop,
          ffTheme: ffTheme,
          bill: appState.currentBill(drop.category),
        ).animate(delay: ((i - 1).clamp(0, 8) * 40).ms).fadeIn(duration: 280.ms).slideY(
              begin: 0.06,
              end: 0,
              curve: ffTheme.easeOut,
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
              borderRadius: BorderRadius.circular(20),
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
          // Drop banner — the honest old→new headline. Amber = VALUE.
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: ffTheme.saving.withValues(alpha: 0.12),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
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
                Semantics(
                  label: 'ירידה של ${drop.dropPctRounded} אחוז',
                  excludeSemantics: true,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                    decoration: BoxDecoration(
                      color: ffTheme.saving,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text('-${drop.dropPctRounded}%',
                        style: ffTheme.labelSmall.copyWith(
                            color: Colors.white, fontWeight: FontWeight.w800)),
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
