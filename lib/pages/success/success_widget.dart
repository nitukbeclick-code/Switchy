import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../flutter_flow/flutter_flow_widgets.dart';
import '../../app_state.dart';
import '../../data.dart';

class SuccessWidget extends StatelessWidget {
  const SuccessWidget({super.key});

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);
    final appState = Provider.of<FFAppState>(context);
    final plan = appState.leadPlanId != null ? planById(appState.leadPlanId!) : null;

    return Scaffold(
      backgroundColor: ffTheme.primary,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Animated checkmark
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  color: ffTheme.secondary,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.check_rounded,
                    size: 60, color: ffTheme.primary),
              )
                  .animate()
                  .scale(
                      duration: 400.ms,
                      curve: Curves.elasticOut)
                  .then()
                  .shake(hz: 2, duration: 200.ms),

              const SizedBox(height: 32),

              Text(
                'קיבלנו, ${appState.firstName}!',
                style: ffTheme.displaySmall.override(color: Colors.white),
                textAlign: TextAlign.center,
              ).animate().fadeIn(delay: 300.ms).slideY(begin: 0.2),

              const SizedBox(height: 12),

              Text(
                'נציג יצור איתך קשר תוך 24 שעות',
                style: ffTheme.bodyLarge
                    .override(color: Colors.white.withOpacity(0.8)),
                textAlign: TextAlign.center,
              ).animate().fadeIn(delay: 400.ms),

              const SizedBox(height: 32),

              // Plan summary card
              if (plan != null)
                Builder(builder: (ctx) {
                  final bill = appState.currentBill(plan.cat);
                  final save = planSaveYear(plan, bill);
                  return Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                          color: Colors.white.withOpacity(0.2)),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(plan.provider,
                                  style: ffTheme.titleMedium
                                      .override(color: Colors.white)),
                              const SizedBox(height: 2),
                              Text(plan.plan,
                                  style: ffTheme.bodySmall.override(
                                      color:
                                          Colors.white.withOpacity(0.7)),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text('₪${plan.price}/חודש',
                                style: ffTheme.titleMedium.override(
                                    color: ffTheme.secondary)),
                            if (save > 0)
                              Text('חוסך ₪$save/שנה',
                                  style: ffTheme.labelSmall.override(
                                      color: ffTheme.secondary
                                          .withOpacity(0.8))),
                          ],
                        ),
                      ],
                    ),
                  );
                }).animate().fadeIn(delay: 500.ms),

              const SizedBox(height: 40),

              FFButtonWidget(
                text: 'מעקב אחר התהליך',
                onPressed: () async => context.goNamed('Tracker'),
                options: FFButtonOptions(
                  width: double.infinity,
                  height: 56,
                  color: ffTheme.secondary,
                  textStyle:
                      ffTheme.titleMedium.override(color: ffTheme.primary),
                  borderRadius: BorderRadius.circular(16),
                ),
              ).animate().fadeIn(delay: 600.ms),

              const SizedBox(height: 16),

              TextButton(
                onPressed: () => context.goNamed('Home'),
                child: Text(
                  'חזרה לדף הבית',
                  style: ffTheme.bodyMedium
                      .override(color: Colors.white.withOpacity(0.7)),
                ),
              ).animate().fadeIn(delay: 700.ms),
            ],
          ),
        ),
      ),
    );
  }
}
