import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../app_state.dart';
import '../../data.dart';

class SwitchCalcWidget extends StatefulWidget {
  const SwitchCalcWidget({super.key});

  @override
  State<SwitchCalcWidget> createState() => _SwitchCalcWidgetState();
}

class _SwitchCalcWidgetState extends State<SwitchCalcWidget> {
  late double _current;
  late double _newPlan;

  @override
  void initState() {
    super.initState();
    final appState = FFAppState();
    final cat = appState.selectedCat;
    _current = appState.currentBill(cat).toDouble().clamp(20, 500);
    final bestPlan = plansByCat(cat).isEmpty ? null : (plansByCat(cat)..sort((a, b) => a.price.compareTo(b.price))).first;
    _newPlan = bestPlan != null ? bestPlan.price.toDouble().clamp(20, 300) : 49;
  }


  double _exitFee = 0;

  int get _monthlySaving => (_current - _newPlan).round().clamp(0, 9999);
  int get _annualSaving => (_monthlySaving * 12 - _exitFee.round()).clamp(0, 99999);
  double get _breakeven => _monthlySaving > 0 ? _exitFee / _monthlySaving : 0;

  Color _resultColor(FlutterFlowTheme ffTheme) {
    if (_annualSaving > 1200) return ffTheme.success;
    if (_annualSaving > 0) return ffTheme.warning;
    return ffTheme.error;
  }

  String _resultText() {
    if (_annualSaving > 1200) return '🎉 שווה מאוד לעבור!';
    if (_annualSaving > 0) return '💡 יש חיסכון קטן';
    return '❌ לא כדאי לעבור כרגע';
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: const Text('מחשבון מעבר'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('מחשבון מעבר', style: ffTheme.headlineMedium),
            const SizedBox(height: 4),
            Text('חשבו אם המעבר משתלם לכם', style: ffTheme.bodySmall),
            const SizedBox(height: 24),

            _SliderSection(
              label: 'חשבון נוכחי',
              emoji: '💸',
              value: _current,
              min: 20,
              max: 500,
              onChanged: (v) => setState(() => _current = v),
              ffTheme: ffTheme,
            ).animate().fadeIn(duration: 400.ms),

            const SizedBox(height: 20),

            _SliderSection(
              label: 'מסלול חדש',
              emoji: '✨',
              value: _newPlan,
              min: 20,
              max: 300,
              onChanged: (v) => setState(() => _newPlan = v),
              ffTheme: ffTheme,
            ).animate().fadeIn(delay: 100.ms),

            const SizedBox(height: 20),

            _SliderSection(
              label: 'דמי ניתוק',
              emoji: '🔓',
              value: _exitFee,
              min: 0,
              max: 500,
              onChanged: (v) => setState(() => _exitFee = v),
              ffTheme: ffTheme,
            ).animate().fadeIn(delay: 200.ms),

            const SizedBox(height: 28),

            // Results card
            AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              width: double.infinity,
              padding: const EdgeInsets.all(22),
              decoration: BoxDecoration(
                color: _resultColor(ffTheme).withOpacity(0.08),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: _resultColor(ffTheme).withOpacity(0.3), width: 2),
              ),
              child: Column(
                children: [
                  Text(_resultText(), style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w800, color: _resultColor(ffTheme))),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(child: _ResultStat(label: 'חיסכון חודשי', value: '₪$_monthlySaving', color: _resultColor(ffTheme), ffTheme: ffTheme)),
                      Expanded(child: _ResultStat(label: 'חיסכון שנתי', value: '₪$_annualSaving', color: _resultColor(ffTheme), ffTheme: ffTheme)),
                    ],
                  ),
                  if (_breakeven > 0) ...[
                    const SizedBox(height: 14),
                    Text(
                      'נקודת איזון: ${_breakeven.toStringAsFixed(1)} חודשים',
                      style: ffTheme.bodySmall.override(color: ffTheme.secondaryText),
                    ),
                  ],
                ],
              ),
            ).animate().fadeIn(delay: 300.ms),

            const SizedBox(height: 24),

            if (_annualSaving > 0)
              ElevatedButton(
                onPressed: () => context.pushNamed('Results'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: ffTheme.primary,
                  minimumSize: const Size(double.infinity, 52),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: Text('מצא מסלולים מתאימים', style: ffTheme.titleSmall.override(color: Colors.white)),
              ).animate().fadeIn(delay: 400.ms),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

class _SliderSection extends StatelessWidget {
  const _SliderSection({required this.label, required this.emoji, required this.value, required this.min, required this.max, required this.onChanged, required this.ffTheme});
  final String label, emoji;
  final double value, min, max;
  final ValueChanged<double> onChanged;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ffTheme.alternate),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(emoji, style: const TextStyle(fontSize: 20)),
              const SizedBox(width: 8),
              Text(label, style: ffTheme.titleSmall),
              const Spacer(),
              Text('₪${value.round()}', style: ffTheme.headlineSmall.override(color: ffTheme.primary)),
            ],
          ),
          Slider(
            value: value,
            min: min,
            max: max,
            activeColor: ffTheme.primary,
            inactiveColor: ffTheme.alternate,
            onChanged: onChanged,
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('₪${min.round()}', style: ffTheme.labelSmall),
              Text('₪${max.round()}', style: ffTheme.labelSmall),
            ],
          ),
        ],
      ),
    );
  }
}

class _ResultStat extends StatelessWidget {
  const _ResultStat({required this.label, required this.value, required this.color, required this.ffTheme});
  final String label, value;
  final Color color;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(label, style: ffTheme.labelSmall),
        const SizedBox(height: 4),
        Text(value, style: ffTheme.headlineSmall.override(color: color)),
      ],
    );
  }
}
