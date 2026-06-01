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
      backgroundColor: ffTheme.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Success icon
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  color: ffTheme.accent1,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.check_rounded, color: ffTheme.success, size: 56),
              ).animate().scale(delay: 100.ms, duration: 500.ms, curve: Curves.elasticOut),

              const SizedBox(height: 24),

              Text('הפרטים נשלחו!', style: ffTheme.headlineLarge, textAlign: TextAlign.center)
                  .animate().fadeIn(delay: 200.ms),

              const SizedBox(height: 12),

              Text(
                'נציג שלנו יחזור אליכם תוך שעה\nלסגירת העסקה על ${plan?.provider ?? 'החבילה החדשה'}',
                style: ffTheme.bodyLarge.override(color: ffTheme.secondaryText),
                textAlign: TextAlign.center,
              ).animate().fadeIn(delay: 300.ms),

              const SizedBox(height: 32),

              // Savings preview
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: ffTheme.accent1,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  children: [
                    const Text('💰', style: TextStyle(fontSize: 36)),
                    const SizedBox(height: 8),
                    Text('החיסכון הצפוי שלכם', style: ffTheme.labelLarge.override(color: ffTheme.success)),
                    Text(formatPrice(appState.totalSavings), style: ffTheme.displaySmall.override(color: ffTheme.primary)),
                    Text('לשנה', style: ffTheme.bodySmall),
                  ],
                ),
              ).animate().fadeIn(delay: 400.ms).slideY(begin: 0.3, end: 0),

              const SizedBox(height: 32),

              FFButtonWidget(
                text: 'מעקב אחר המעבר',
                onPressed: () async => context.goNamed('Tracker'),
                options: FFButtonOptions(
                  width: double.infinity,
                  height: 52,
                  color: ffTheme.primary,
                  textStyle: ffTheme.titleSmall.override(color: Colors.white),
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => context.goNamed('Home'),
                child: Text('חזרה לדף הבית', style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
