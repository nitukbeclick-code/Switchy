import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
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

    // Find winner (highest annual savings using each plan's own category bill)
    String? winnerId;
    if (plans.length >= 2) {
      int bestSave = -1;
      for (final p in plans) {
        final s = planSaveYear(p, appState.currentBill(p.cat));
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
    final mixedCats = plans.map((p) => p.cat).toSet().length > 1;

    final rows = <_Row>[
      _Row('מחיר', plans.map((p) => p.cat == 'abroad' ? '₪${p.price}/חבילה' : '₪${p.price}/חודש').toList()),
      _Row('לאחר מבצע',
          plans.map((p) => p.hasPromo ? '₪${p.after}' : 'קבוע').toList()),
      _Row('התחייבות',
          plans.map((p) => p.commitmentLabel).toList()),
      _Row('חיסכון שנתי',
          plans.map((p) {
            final bill = appState.currentBill(p.cat);
            return bill > 0 ? '₪${planSaveYear(p, bill)}' : '—';
          }).toList(),
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
          // ── Winner summary card ───────────────────────────────────────────
          _WinnerSummaryCard(
            plans: plans,
            winnerId: winnerId,
            appState: appState,
            ffTheme: ffTheme,
          ),

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
                  );
                }).toList(),
              ),
            ),
          ),

          // Mixed-category notice
          if (mixedCats)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: ffTheme.warning.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: ffTheme.warning.withOpacity(0.3)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.info_outline_rounded, size: 16, color: ffTheme.warning),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'אתה משווה מסלולים מקטגוריות שונות',
                        style: ffTheme.labelSmall.override(color: ffTheme.warning, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            ),

          // CTA row
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
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

          // Features comparison
          if (plans.any((p) => p.feats.isNotEmpty)) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Divider(color: ffTheme.alternate),
                  const SizedBox(height: 8),
                  Text('מה כלול בכל מסלול', style: ffTheme.titleSmall.override(color: ffTheme.secondaryText, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 12),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(width: 110),
                        ...plans.map((p) => SizedBox(
                          width: 150,
                          child: Padding(
                            padding: const EdgeInsets.only(left: 10),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: p.feats.map((f) => Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Icon(Icons.check_rounded, size: 14, color: p.id == winnerId ? ffTheme.primary : ffTheme.secondaryText),
                                    const SizedBox(width: 4),
                                    Expanded(child: Text(f, style: ffTheme.labelSmall.override(
                                      color: p.id == winnerId ? ffTheme.primaryText : ffTheme.secondaryText,
                                    ))),
                                  ],
                                ),
                              )).toList(),
                            ),
                          ),
                        )),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ] else
            const SizedBox(height: 32),
        ],
      ),
    );
  }
}

// ── Winner summary card ────────────────────────────────────────────────────────

class _WinnerSummaryCard extends StatelessWidget {
  const _WinnerSummaryCard({
    required this.plans,
    required this.winnerId,
    required this.appState,
    required this.ffTheme,
  });
  final List<Plan> plans;
  final String? winnerId;
  final FFAppState appState;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final winner = plans.firstWhere((p) => p.id == winnerId, orElse: () => plans.first);
    final winnerBill = appState.currentBill(winner.cat);
    final winnerSave = winnerBill > 0 ? planSaveYear(winner, winnerBill) : 0;
    final maxPrice = plans.map((p) => p.price).reduce((a, b) => a > b ? a : b).toDouble();

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Champion banner
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [const Color(0xFF0E3A26), ffTheme.primary],
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
              ),
              borderRadius: BorderRadius.circular(18),
              boxShadow: [BoxShadow(color: ffTheme.primary.withOpacity(0.3), blurRadius: 14, offset: const Offset(0, 4))],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(color: ffTheme.secondary, borderRadius: BorderRadius.circular(8)),
                      child: Text('🏆 ההמלצה שלנו', style: ffTheme.labelSmall.override(color: const Color(0xFF0E3A26), fontWeight: FontWeight.w800)),
                    ),
                    const Spacer(),
                    if (winnerSave > 0)
                      Text('חיסכון ₪$winnerSave/שנה', style: GoogleFonts.rubik(fontSize: 13, fontWeight: FontWeight.w700, color: ffTheme.secondary)),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(color: Colors.white.withOpacity(0.15), borderRadius: BorderRadius.circular(12)),
                      child: LogoWidget(provider: winner.provider, size: 40),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(winner.provider, style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
                          Text(winner.plan, style: GoogleFonts.assistant(fontSize: 12, color: Colors.white70), maxLines: 1, overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('₪${winner.price}', style: GoogleFonts.rubik(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white, letterSpacing: -1)),
                        Text(winner.cat == 'abroad' ? 'לחבילה' : 'לחודש', style: GoogleFonts.assistant(fontSize: 11, color: Colors.white60)),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                ElevatedButton(
                  onPressed: () => context.pushNamed('Lead', pathParameters: {'planId': winner.id}),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: ffTheme.secondary,
                    foregroundColor: const Color(0xFF0E3A26),
                    minimumSize: const Size(double.infinity, 44),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                  child: Text('בחר מסלול זה ←', style: GoogleFonts.rubik(fontSize: 14, fontWeight: FontWeight.w800)),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.1, end: 0),

          const SizedBox(height: 16),

          // Price bars comparison
          Text('השוואת מחירים', style: ffTheme.titleSmall.override(color: ffTheme.secondaryText, fontWeight: FontWeight.w600)),
          const SizedBox(height: 10),
          ...plans.map((p) {
            final fraction = maxPrice > 0 ? p.price / maxPrice : 0.0;
            final isWinner = p.id == winnerId;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  SizedBox(
                    width: 80,
                    child: Text(p.provider, style: ffTheme.labelSmall.override(
                      color: isWinner ? ffTheme.primary : ffTheme.secondaryText,
                      fontWeight: isWinner ? FontWeight.w700 : FontWeight.w500,
                    ), maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: LinearProgressIndicator(
                        value: fraction,
                        backgroundColor: ffTheme.alternate,
                        valueColor: AlwaysStoppedAnimation(isWinner ? ffTheme.primary : ffTheme.warning),
                        minHeight: isWinner ? 10 : 8,
                      ),
                    ).animate(delay: 200.ms).slideX(begin: -0.3, end: 0, duration: 400.ms),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 56,
                    child: Text('₪${p.price}', style: ffTheme.labelSmall.override(
                      color: isWinner ? ffTheme.primary : ffTheme.primaryText,
                      fontWeight: isWinner ? FontWeight.w800 : FontWeight.w600,
                    ), textAlign: TextAlign.end),
                  ),
                  if (isWinner)
                    Padding(
                      padding: const EdgeInsets.only(right: 4),
                      child: Icon(Icons.star_rounded, size: 14, color: ffTheme.secondary),
                    )
                  else
                    const SizedBox(width: 18),
                ],
              ),
            );
          }),

          const SizedBox(height: 4),
          Divider(color: ffTheme.alternate),
          const SizedBox(height: 4),
        ],
      ),
    );
  }
}

// ── Plan header ────────────────────────────────────────────────────────────────

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
  });
  final _Row row;
  final List<Plan> plans;
  final String? winnerId;
  final FlutterFlowTheme ffTheme;
  final bool isAlt;

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
