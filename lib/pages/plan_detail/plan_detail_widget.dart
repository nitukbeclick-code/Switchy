import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/logo_widget/logo_widget.dart';

class PlanDetailWidget extends StatelessWidget {
  const PlanDetailWidget({super.key, required this.planId});
  final String planId;

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context);
    final plan = planById(planId);

    if (plan == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('חבילה')),
        body: const Center(child: Text('החבילה לא נמצאה')),
      );
    }

    final bill = appState.currentBill(plan.cat);
    final savings = planSaveYear(plan, bill);
    final inCompare = appState.isInCompare(plan.id);

    return Scaffold(
      backgroundColor: ffTheme.background,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 200,
            pinned: true,
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topRight,
                    end: Alignment.bottomLeft,
                    colors: [ffTheme.primary, ffTheme.tertiary],
                  ),
                ),
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const SizedBox(height: 40),
                      LogoWidget(provider: plan.provider, size: 64),
                      const SizedBox(height: 12),
                      Text(plan.provider, style: ffTheme.titleLarge.override(color: Colors.white)),
                      Text(plan.plan, style: ffTheme.bodyMedium.override(color: Colors.white70)),
                    ],
                  ),
                ),
              ),
            ),
          ),

          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Price card
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: ffTheme.secondaryBackground,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: ffTheme.alternate),
                    ),
                    child: Row(
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('מחיר חודשי', style: ffTheme.labelMedium),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text('₪${plan.price}', style: ffTheme.displaySmall.override(color: ffTheme.primary)),
                                Text('/חודש', style: ffTheme.bodySmall),
                              ],
                            ),
                            if (plan.hasPromo)
                              Text('לאחר מבצע: ₪${plan.after}', style: ffTheme.labelSmall.override(color: ffTheme.warning)),
                          ],
                        ),
                        const Spacer(),
                        if (savings > 0)
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(color: ffTheme.accent1, borderRadius: BorderRadius.circular(12)),
                            child: Column(
                              children: [
                                Text('חיסכון שנתי', style: ffTheme.labelSmall.override(color: ffTheme.success)),
                                Text(formatPrice(savings), style: ffTheme.titleMedium.override(color: ffTheme.success)),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // Details
                  Text('פרטי החבילה', style: ffTheme.titleMedium),
                  const SizedBox(height: 12),

                  _DetailRow(label: 'ספק', value: plan.provider, ffTheme: ffTheme),
                  _DetailRow(label: 'רשת', value: plan.netLabel, ffTheme: ffTheme),
                  _DetailRow(label: 'התחייבות', value: plan.commitmentLabel, ffTheme: ffTheme),
                  if (plan.intro != null)
                    _DetailRow(label: 'מבצע', value: plan.intro!, ffTheme: ffTheme),

                  const SizedBox(height: 20),

                  // Features
                  Text('מה כלול', style: ffTheme.titleMedium),
                  const SizedBox(height: 12),
                  ...plan.feats.map((f) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Icon(Icons.check_circle_rounded, color: ffTheme.success, size: 18),
                        const SizedBox(width: 10),
                        Text(f, style: ffTheme.bodyMedium),
                      ],
                    ),
                  )),

                  // Rating
                  const SizedBox(height: 20),
                  _RatingCard(plan: plan, ffTheme: ffTheme),

                  // Fine print
                  if (plan.fine != null) ...[
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: ffTheme.accent2,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.info_outline_rounded, size: 16, color: ffTheme.warning),
                          const SizedBox(width: 8),
                          Expanded(child: Text(plan.fine!, style: ffTheme.labelSmall.override(color: ffTheme.warning))),
                        ],
                      ),
                    ),
                  ],

                  const SizedBox(height: 100),
                ],
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
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
                child: OutlinedButton.icon(
                  onPressed: () => appState.toggleCompare(plan.id),
                  icon: Icon(inCompare ? Icons.check_rounded : Icons.compare_arrows_rounded, size: 18),
                  label: Text(inCompare ? 'בהשוואה' : 'השווה'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: inCompare ? ffTheme.primary : ffTheme.secondaryText,
                    side: BorderSide(color: inCompare ? ffTheme.primary : ffTheme.alternate),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: FFButtonWidget(
                  text: 'רוצה את זה!',
                  onPressed: () async => context.pushNamed('Lead', pathParameters: {'planId': plan.id}),
                  options: FFButtonOptions(
                    height: 52,
                    color: ffTheme.primary,
                    textStyle: ffTheme.titleSmall.override(color: Colors.white),
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value, required this.ffTheme});
  final String label;
  final String value;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Text(label, style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText)),
          const Spacer(),
          Text(value, style: ffTheme.bodyMedium.override(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _RatingCard extends StatelessWidget {
  const _RatingCard({required this.plan, required this.ffTheme});
  final Plan plan;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ffTheme.secondaryBackground,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: Row(
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('דירוג משתמשים', style: ffTheme.labelMedium),
              Row(
                children: [
                  Text(plan.rating.toStringAsFixed(1), style: ffTheme.headlineMedium.override(color: ffTheme.primary)),
                  const SizedBox(width: 4),
                  Text('/ 5', style: ffTheme.bodySmall),
                ],
              ),
            ],
          ),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: List.generate(5, (i) {
              return Container(
                margin: const EdgeInsets.only(bottom: 2),
                width: 80,
                height: 6,
                decoration: BoxDecoration(
                  color: i < (5 - plan.rating.round()) ? ffTheme.alternate : ffTheme.primary,
                  borderRadius: BorderRadius.circular(3),
                ),
              );
            }).reversed.toList(),
          ),
          const Spacer(),
          Text('${plan.reviews}\nביקורות', style: ffTheme.labelSmall, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}
