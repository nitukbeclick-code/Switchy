import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/logo_widget/logo_widget.dart';

class CompareWidget extends StatelessWidget {
  const CompareWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context);
    final ids = appState.comparePlans;
    final plans = ids.map((id) => planById(id)).whereType<Plan>().toList();

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: const Text('השוואת חבילות'),
        actions: [
          if (ids.isNotEmpty)
            TextButton(
              onPressed: appState.clearCompare,
              child: Text('נקה', style: TextStyle(color: ffTheme.error)),
            ),
        ],
      ),
      body: plans.isEmpty
          ? _EmptyCompare(ffTheme: ffTheme)
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  // Plan headers
                  IntrinsicHeight(
                    child: Row(
                      children: [
                        SizedBox(
                          width: 100,
                          child: Center(child: Text('פרמטר', style: ffTheme.labelMedium)),
                        ),
                        ...plans.map((p) => Expanded(
                          child: _PlanHeader(plan: p, ffTheme: ffTheme, appState: appState),
                        )),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Comparison rows
                  ..._buildRows(plans, ffTheme, appState),
                ],
              ),
            ),
    );
  }

  List<Widget> _buildRows(List<Plan> plans, FlutterFlowTheme ffTheme, FFAppState appState) {
    final rows = <_CompareRow>[
      _CompareRow('מחיר חודשי', plans.map((p) => '₪${p.price}').toList()),
      _CompareRow('רשת', plans.map((p) => p.netLabel).toList()),
      _CompareRow('התחייבות', plans.map((p) => p.commitmentLabel).toList()),
      _CompareRow('5G', plans.map((p) => p.is5G ? '✓' : '✗').toList()),
      _CompareRow('ללא התחייבות', plans.map((p) => p.noCommit ? '✓' : '✗').toList()),
      _CompareRow('חו"ל', plans.map((p) => p.hasAbroad ? '✓' : '✗').toList()),
      _CompareRow('דירוג', plans.map((p) => '${p.rating}/5').toList()),
      _CompareRow('ביקורות', plans.map((p) => '${p.reviews}').toList()),
    ];

    return rows.map((r) => _CompareRowWidget(row: r, planCount: plans.length, ffTheme: ffTheme)).toList();
  }
}

class _EmptyCompare extends StatelessWidget {
  const _EmptyCompare({required this.ffTheme});
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('⚖️', style: TextStyle(fontSize: 64)),
            const SizedBox(height: 20),
            Text('אין חבילות להשוואה', style: ffTheme.headlineMedium, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            Text('הוסיפו עד 3 חבילות מדף התוצאות', style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText), textAlign: TextAlign.center),
            const SizedBox(height: 32),
            FFButtonWidget(
              text: 'לחבילות סלולר',
              onPressed: () async => context.goNamed('Results'),
              options: FFButtonOptions(
                color: ffTheme.primary,
                textStyle: ffTheme.titleSmall.override(color: Colors.white),
                borderRadius: BorderRadius.circular(14),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlanHeader extends StatelessWidget {
  const _PlanHeader({required this.plan, required this.ffTheme, required this.appState});
  final Plan plan;
  final FlutterFlowTheme ffTheme;
  final FFAppState appState;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ffTheme.secondaryBackground,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: Column(
        children: [
          LogoWidget(provider: plan.provider, size: 40),
          const SizedBox(height: 6),
          Text(plan.provider, style: ffTheme.labelSmall, textAlign: TextAlign.center, maxLines: 2),
          IconButton(
            icon: Icon(Icons.close_rounded, size: 16, color: ffTheme.error),
            onPressed: () => appState.toggleCompare(plan.id),
            constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
          ),
        ],
      ),
    );
  }
}

class _CompareRow {
  const _CompareRow(this.label, this.values);
  final String label;
  final List<String> values;
}

class _CompareRowWidget extends StatelessWidget {
  const _CompareRowWidget({required this.row, required this.planCount, required this.ffTheme});
  final _CompareRow row;
  final int planCount;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: ffTheme.secondaryBackground,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 100,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(row.label, style: ffTheme.labelSmall.override(color: ffTheme.secondaryText)),
            ),
          ),
          ...row.values.map((v) => Expanded(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                v,
                style: ffTheme.bodySmall.override(
                  color: v == '✓' ? ffTheme.success : v == '✗' ? ffTheme.error : ffTheme.primaryText,
                  fontWeight: FontWeight.w600,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          )),
          if (row.values.length < planCount)
            ...List.generate(planCount - row.values.length, (_) => const Expanded(child: SizedBox())),
        ],
      ),
    );
  }
}
