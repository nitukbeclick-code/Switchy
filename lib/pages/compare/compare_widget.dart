import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';
import '../../models.dart';
import '../../data.dart';
import '../../components/logo_widget/logo_widget.dart';

class CompareWidget extends StatelessWidget {
  const CompareWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context);
    final ids = appState.comparePlans;
    final plans = ids.map((id) => planById(id)).whereType<Plan>().toList();

    // Find winner (highest annual savings)
    String? winnerId;
    if (plans.length >= 2) {
      final cat = plans.first.cat;
      final bill = appState.currentBill(cat);
      int bestSave = -1;
      for (final p in plans) {
        final s = planSaveYear(p, bill);
        if (s > bestSave) {
          bestSave = s;
          winnerId = p.id;
        }
      }
    }

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        backgroundColor: ffTheme.primary,
        foregroundColor: Colors.white,
        title: Text('השוואת מסלולים',
            style: ffTheme.titleLarge.override(color: Colors.white)),
        actions: [
          if (ids.isNotEmpty)
            TextButton(
              onPressed: appState.clearCompare,
              child: Text('נקה הכל',
                  style: ffTheme.labelMedium.override(
                      color: Colors.white.withOpacity(0.85))),
            ),
        ],
      ),
      body: plans.length < 2
          ? _EmptyState(ffTheme: ffTheme)
          : _CompareTable(
              plans: plans,
              appState: appState,
              ffTheme: ffTheme,
              winnerId: winnerId,
            ),
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.ffTheme});
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.compare_arrows_rounded,
                    size: 80, color: ffTheme.alternate)
                .animate()
                .fadeIn(duration: 400.ms)
                .scale(begin: const Offset(0.7, 0.7)),
            const SizedBox(height: 24),
            Text('בחר 2–3 מסלולים מהתוצאות',
                    style: ffTheme.headlineSmall
                        .override(color: ffTheme.secondaryText),
                    textAlign: TextAlign.center)
                .animate()
                .fadeIn(delay: 150.ms),
            const SizedBox(height: 12),
            Text(
              'לחץ על + בכרטיס של כל מסלול\nלהוספה לסל ההשוואה',
              style:
                  ffTheme.bodyMedium.override(color: ffTheme.secondaryText),
              textAlign: TextAlign.center,
            ).animate().fadeIn(delay: 200.ms),
            const SizedBox(height: 32),
            FFButtonWidget(
              text: 'חזרה לתוצאות',
              onPressed: () async => context.goNamed('Results'),
              options: FFButtonOptions(
                color: ffTheme.primary,
                textStyle: ffTheme.titleSmall.override(color: Colors.white),
                borderRadius: BorderRadius.circular(14),
                height: 52,
              ),
            ).animate().fadeIn(delay: 300.ms),
          ],
        ),
      ),
    );
  }
}

// ── Compare table ─────────────────────────────────────────────────────────────

class _CompareTable extends StatelessWidget {
  const _CompareTable({
    required this.plans,
    required this.appState,
    required this.ffTheme,
    required this.winnerId,
  });
  final List<Plan> plans;
  final FFAppState appState;
  final FlutterFlowTheme ffTheme;
  final String? winnerId;

  @override
  Widget build(BuildContext context) {
    final cat = plans.first.cat;
    final bill = appState.currentBill(cat);

    final rows = <_Row>[
      _Row('מחיר חודשי', plans.map((p) => '₪${p.price}').toList()),
      _Row('לאחר מבצע',
          plans.map((p) => p.hasPromo ? '₪${p.after}' : 'קבוע').toList()),
      _Row('התחייבות',
          plans.map((p) => p.commitmentLabel).toList()),
      _Row('חיסכון שנתי',
          plans.map((p) => '₪${planSaveYear(p, bill)}').toList(),
          isHighlight: true),
      _Row('דירוג',
          plans.map((p) => '${p.rating}/5 (${p.reviews})').toList()),
      _Row('רשת', plans.map((p) => p.netLabel).toList()),
      _Row('ללא התחייבות',
          plans.map((p) => p.noCommit ? '✓' : '—').toList()),
      _Row('5G', plans.map((p) => p.is5G ? '✓' : '—').toList()),
      _Row('חו"ל', plans.map((p) => p.hasAbroad ? '✓' : '—').toList()),
    ];

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header row
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Row(
                children: [
                  // Label column
                  const SizedBox(width: 110),
                  ...plans.map((p) {
                    final isWinner = p.id == winnerId;
                    return _PlanHeader(
                      plan: p,
                      isWinner: isWinner,
                      ffTheme: ffTheme,
                      appState: appState,
                    );
                  }),
                ],
              ),
            ),
          ),

          // Rows
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: rows.asMap().entries.map((e) {
                  final idx = e.key;
                  final row = e.value;
                  final isAlt = idx.isOdd;
                  return _RowWidget(
                    row: row,
                    plans: plans,
                    winnerId: winnerId,
                    ffTheme: ffTheme,
                    isAlt: isAlt,
                    bill: bill,
                  );
                }).toList(),
              ),
            ),
          ),

          // CTA row
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  const SizedBox(width: 110),
                  ...plans.map((p) => SizedBox(
                    width: 140,
                    child: Padding(
                      padding: const EdgeInsets.only(left: 10),
                      child: ElevatedButton(
                        onPressed: () => context.pushNamed('Lead',
                            pathParameters: {'planId': p.id}),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: p.id == winnerId
                              ? ffTheme.primary
                              : ffTheme.secondaryBackground,
                          foregroundColor: p.id == winnerId
                              ? Colors.white
                              : ffTheme.primaryText,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                            side: BorderSide(
                                color: p.id == winnerId
                                    ? ffTheme.primary
                                    : ffTheme.alternate),
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        child: Text(
                          'בחר ←',
                          style: ffTheme.titleSmall.override(
                              color: p.id == winnerId
                                  ? Colors.white
                                  : ffTheme.primaryText),
                        ),
                      ),
                    ),
                  )),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PlanHeader extends StatelessWidget {
  const _PlanHeader({
    required this.plan,
    required this.isWinner,
    required this.ffTheme,
    required this.appState,
  });
  final Plan plan;
  final bool isWinner;
  final FlutterFlowTheme ffTheme;
  final FFAppState appState;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 140,
      margin: const EdgeInsets.only(left: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isWinner ? ffTheme.accent1 : Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isWinner ? ffTheme.primary : ffTheme.alternate,
          width: isWinner ? 2 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          if (isWinner)
            Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: ffTheme.secondary,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text('🏆 זוכה',
                  style: ffTheme.labelSmall.override(
                      color: const Color(0xFF0E3A26),
                      fontWeight: FontWeight.w700)),
            ),
          LogoWidget(provider: plan.provider, size: 44),
          const SizedBox(height: 6),
          Text(plan.provider,
              style: ffTheme.labelSmall
                  .override(fontWeight: FontWeight.w700),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis),
          const SizedBox(height: 4),
          GestureDetector(
            onTap: () => appState.toggleCompare(plan.id),
            child: Icon(Icons.close_rounded,
                size: 18, color: ffTheme.secondaryText),
          ),
        ],
      ),
    );
  }
}

class _Row {
  const _Row(this.label, this.values, {this.isHighlight = false});
  final String label;
  final List<String> values;
  final bool isHighlight;
}

class _RowWidget extends StatelessWidget {
  const _RowWidget({
    required this.row,
    required this.plans,
    required this.winnerId,
    required this.ffTheme,
    required this.isAlt,
    required this.bill,
  });
  final _Row row;
  final List<Plan> plans;
  final String? winnerId;
  final FlutterFlowTheme ffTheme;
  final bool isAlt;
  final int bill;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 2),
      decoration: BoxDecoration(
        color: isAlt ? ffTheme.accent1.withOpacity(0.5) : Colors.white,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 110,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
              child: Text(row.label,
                  style: ffTheme.bodySmall
                      .override(color: ffTheme.secondaryText)),
            ),
          ),
          ...row.values.asMap().entries.map((e) {
            final idx = e.key;
            final v = e.value;
            final plan = plans[idx];
            final isWinner = plan.id == winnerId;

            Color textColor = ffTheme.primaryText;
            if (v == '✓') textColor = ffTheme.primary;
            if (v == '—') textColor = ffTheme.secondaryText;
            if (row.isHighlight && isWinner) textColor = ffTheme.primary;

            return SizedBox(
              width: 150,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 12),
                child: row.isHighlight
                    ? Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: isWinner
                              ? ffTheme.secondary
                              : ffTheme.background,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          v,
                          style: ffTheme.labelSmall.override(
                            color: isWinner
                                ? const Color(0xFF0E3A26)
                                : ffTheme.secondaryText,
                            fontWeight: isWinner
                                ? FontWeight.w700
                                : FontWeight.w500,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      )
                    : Text(
                        v,
                        style: ffTheme.bodySmall.override(
                          color: textColor,
                          fontWeight: FontWeight.w600,
                        ),
                        textAlign: TextAlign.center,
                      ),
              ),
            );
          }),
        ],
      ),
    );
  }
}
