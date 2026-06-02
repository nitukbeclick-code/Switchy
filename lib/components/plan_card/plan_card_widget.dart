import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:go_router/go_router.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../app_state.dart';
import '../../models.dart';
import '../logo_widget/logo_widget.dart';

class PlanCardWidget extends StatelessWidget {
  const PlanCardWidget({
    super.key,
    required this.plan,
    required this.currentBill,
    this.showCompare = true,
    this.compact = false,
  });

  final Plan plan;
  final int currentBill;
  final bool showCompare;
  final bool compact;

  String? _quizMatch(FFAppState appState) {
    if (!appState.quizCompleted || appState.quizBudget <= 0) return null;
    final diff = plan.price - appState.quizBudget;
    if (diff <= 0) return '✓ מתאים לתקציב';
    if (diff <= 20) return 'קרוב לתקציב';
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final appState = context.watch<FFAppState>();
    final ffTheme = FlutterFlowTheme.of(context);
    final savings = ((currentBill - plan.price) * 12).clamp(0, 999999);
    final inCompare = appState.isInCompare(plan.id);
    final isWatching = appState.isWatching(plan.id);
    final displayPrice = '₪${plan.price}';
    final displayAfter = plan.hasPromo ? '₪${plan.after}' : null;
    final matchLabel = _quizMatch(appState);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border(
          left: BorderSide(
            color: plan.highlight ? ffTheme.primary : ffTheme.alternate,
            width: plan.highlight ? 3 : 1,
          ),
          right: BorderSide(color: ffTheme.alternate, width: 1),
          top: BorderSide(color: ffTheme.alternate, width: 1),
          bottom: BorderSide(color: ffTheme.alternate, width: 1),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 12,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Best match badge
          if (plan.highlight)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                color: ffTheme.primary,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(13),
                  topRight: Radius.circular(13),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('★', style: TextStyle(color: ffTheme.secondary, fontSize: 12)),
                  const SizedBox(width: 5),
                  Text(
                    'ההתאמה הכי טובה',
                    style: GoogleFonts.rubik(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),

          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header row
                Row(
                  children: [
                    Hero(
                      tag: 'plan_logo_${plan.id}',
                      child: LogoWidget(provider: plan.provider, size: 44),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  plan.provider,
                                  style: GoogleFonts.rubik(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                    color: ffTheme.primaryText,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: ffTheme.accent4,
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(color: ffTheme.info.withOpacity(0.3)),
                                ),
                                child: Text(
                                  plan.netLabel,
                                  style: GoogleFonts.rubik(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: ffTheme.info,
                                  ),
                                ),
                              ),
                              if (matchLabel != null) ...[
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: matchLabel.startsWith('✓') ? ffTheme.success.withOpacity(0.1) : ffTheme.warning.withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(6),
                                    border: Border.all(color: matchLabel.startsWith('✓') ? ffTheme.success.withOpacity(0.4) : ffTheme.warning.withOpacity(0.4)),
                                  ),
                                  child: Text(
                                    matchLabel,
                                    style: GoogleFonts.rubik(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      color: matchLabel.startsWith('✓') ? ffTheme.success : ffTheme.warning,
                                    ),
                                  ),
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            plan.plan,
                            style: GoogleFonts.assistant(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: ffTheme.secondaryText,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (showCompare)
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          GestureDetector(
                            onTap: () => appState.toggleWatch(plan.id),
                            child: Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                color: isWatching ? ffTheme.warning.withOpacity(0.1) : ffTheme.background,
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: isWatching ? ffTheme.warning : ffTheme.alternate,
                                ),
                              ),
                              child: Icon(
                                isWatching ? Icons.notifications_active_rounded : Icons.notifications_none_rounded,
                                size: 15,
                                color: isWatching ? ffTheme.warning : ffTheme.secondaryText,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          GestureDetector(
                            onTap: () => appState.toggleCompare(plan.id),
                            child: Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                color: inCompare ? ffTheme.primary : ffTheme.background,
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: inCompare ? ffTheme.primary : ffTheme.alternate,
                                ),
                              ),
                              child: Icon(
                                inCompare ? Icons.check : Icons.add,
                                size: 16,
                                color: inCompare ? Colors.white : ffTheme.secondaryText,
                              ),
                            ),
                          ),
                        ],
                      ),
                  ],
                ),

                const SizedBox(height: 12),

                // Price + savings row
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          displayPrice,
                          style: GoogleFonts.rubik(
                            fontSize: 30,
                            fontWeight: FontWeight.w800,
                            color: ffTheme.primaryText,
                            letterSpacing: -0.5,
                          ),
                        ),
                        Text(
                          'לחודש',
                          style: GoogleFonts.assistant(
                            fontSize: 12,
                            color: ffTheme.secondaryText,
                          ),
                        ),
                        if (displayAfter != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            'אחרי מבצע: $displayAfter',
                            style: GoogleFonts.assistant(
                              fontSize: 12,
                              color: ffTheme.secondaryText,
                            ),
                          ),
                        ],
                      ],
                    ),
                    const Spacer(),
                    if (savings > 0)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: ffTheme.secondary,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          'חוסך ₪$savings בשנה',
                          style: GoogleFonts.rubik(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: const Color(0xFF0E3A26),
                          ),
                        ),
                      ),
                  ],
                ),

                if (plan.intro != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    '* ${plan.intro}',
                    style: GoogleFonts.assistant(
                      fontSize: 11,
                      color: ffTheme.warning,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],

                if (!compact) ...[
                  const SizedBox(height: 10),

                  // Flag + feature chips
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      if (plan.is5G)
                        _FlagChip(label: '5G', color: ffTheme.info, ffTheme: ffTheme),
                      if (plan.noCommit)
                        _FlagChip(label: 'ללא התחייבות', color: ffTheme.success, ffTheme: ffTheme),
                      if (plan.hasAbroad)
                        _FlagChip(label: 'כולל חו"ל', color: ffTheme.tertiary, ffTheme: ffTheme),
                      ...plan.feats.take(3).map((feat) => Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: ffTheme.background,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          feat,
                          style: GoogleFonts.assistant(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: ffTheme.primaryText,
                          ),
                        ),
                      )),
                    ],
                  ),

                  const SizedBox(height: 12),

                  // Rating + action row
                  Row(
                    children: [
                      Row(
                        children: List.generate(5, (i) => Icon(
                          i < plan.rating.floor()
                              ? Icons.star_rounded
                              : (i < plan.rating ? Icons.star_half_rounded : Icons.star_outline_rounded),
                          size: 14,
                          color: ffTheme.warning,
                        )),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '${plan.rating} (${plan.reviews})',
                        style: GoogleFonts.assistant(
                          fontSize: 11,
                          color: ffTheme.secondaryText,
                        ),
                      ),
                      const Spacer(),
                      GestureDetector(
                        onTap: () {
                          appState.viewPlan(plan.id);
                          context.push('/plan/${plan.id}');
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 9),
                          decoration: BoxDecoration(
                            color: ffTheme.primary,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            'בחירה',
                            style: GoogleFonts.rubik(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ] else ...[
                  const SizedBox(height: 10),
                  GestureDetector(
                    onTap: () {
                      appState.viewPlan(plan.id);
                      context.push('/plan/${plan.id}');
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 9),
                      decoration: BoxDecoration(
                        color: ffTheme.primary,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Center(
                        child: Text(
                          'בחירה',
                          style: GoogleFonts.rubik(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FlagChip extends StatelessWidget {
  const _FlagChip({required this.label, required this.color, required this.ffTheme});
  final String label;
  final Color color;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.35)),
      ),
      child: Text(
        label,
        style: GoogleFonts.assistant(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}
