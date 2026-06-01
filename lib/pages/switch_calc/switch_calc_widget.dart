import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../flutter_flow/flutter_flow_theme.dart';
import '../../flutter_flow/flutter_flow_util.dart';
import '../../app_state.dart';

class SwitchCalcWidget extends StatefulWidget {
  const SwitchCalcWidget({super.key});

  @override
  State<SwitchCalcWidget> createState() => _SwitchCalcWidgetState();
}

class _SwitchCalcWidgetState extends State<SwitchCalcWidget> {
  double _current = 119;
  double _newPrice = 39;

  int get _monthlySaving => (_current - _newPrice).clamp(0, 9999).round();
  int get _annualSaving => (_monthlySaving * 12);
  int get _fiveYearSaving => (_annualSaving * 5);

  @override
  Widget build(BuildContext context) {
    final ffTheme = FlutterFlowTheme.of(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(title: const Text('מחשבון מעבר')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Current bill
            Text('החשבון הנוכחי שלכם', style: ffTheme.titleMedium),
            const SizedBox(height: 8),
            _SliderCard(
              label: 'מחיר נוכחי',
              value: _current,
              min: 20,
              max: 500,
              onChanged: (v) => setState(() => _current = v),
              ffTheme: ffTheme,
            ),

            const SizedBox(height: 20),

            Text('מחיר החבילה החדשה', style: ffTheme.titleMedium),
            const SizedBox(height: 8),
            _SliderCard(
              label: 'מחיר חדש',
              value: _newPrice,
              min: 10,
              max: 300,
              onChanged: (v) => setState(() => _newPrice = v),
              ffTheme: ffTheme,
            ),

            const SizedBox(height: 28),

            // Results
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                  colors: [ffTheme.primary, ffTheme.tertiary],
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                children: [
                  Text('החיסכון שלכם', style: ffTheme.titleLarge.override(color: Colors.white)),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _SavingBox(label: 'לחודש', value: formatPrice(_monthlySaving), ffTheme: ffTheme),
                      _SavingBox(label: 'לשנה', value: formatPrice(_annualSaving), ffTheme: ffTheme),
                      _SavingBox(label: 'ל-5 שנים', value: formatPrice(_fiveYearSaving), ffTheme: ffTheme),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),

            if (_monthlySaving > 0) ...[
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: ffTheme.accent1, borderRadius: BorderRadius.circular(14)),
                child: Row(
                  children: [
                    const Text('💡', style: TextStyle(fontSize: 24)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'חיסכון של ${formatPrice(_annualSaving)} בשנה – שווה לבדוק!',
                        style: ffTheme.bodyMedium.override(color: ffTheme.success, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () => context.goNamed('Results'),
                icon: const Icon(Icons.search_rounded),
                label: const Text('מצאו חבילה מתאימה'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: ffTheme.primary,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 52),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SliderCard extends StatelessWidget {
  const _SliderCard({required this.label, required this.value, required this.min, required this.max, required this.onChanged, required this.ffTheme});
  final String label;
  final double value;
  final double min;
  final double max;
  final ValueChanged<double> onChanged;
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
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: ffTheme.bodyMedium.override(color: ffTheme.secondaryText)),
              Text('₪${value.round()}', style: ffTheme.titleLarge.override(color: ffTheme.primary)),
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
        ],
      ),
    );
  }
}

class _SavingBox extends StatelessWidget {
  const _SavingBox({required this.label, required this.value, required this.ffTheme});
  final String label;
  final String value;
  final FlutterFlowTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: ffTheme.titleLarge.override(color: Colors.white)),
        Text(label, style: ffTheme.labelSmall.override(color: Colors.white70)),
      ],
    );
  }
}
