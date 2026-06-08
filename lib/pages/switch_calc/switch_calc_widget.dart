import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../models.dart';
import '../../components/logo_widget/logo_widget.dart';

class SwitchCalcWidget extends StatefulWidget {
  const SwitchCalcWidget({super.key});

  @override
  State<SwitchCalcWidget> createState() => _SwitchCalcWidgetState();
}

class _SwitchCalcWidgetState extends State<SwitchCalcWidget> {
  late double _current;
  late double _newPlan;
  late String _selectedCat;

  static const _catInfo = [
    ('cellular', '📱', 'סלולר'),
    ('internet', '🌐', 'אינטרנט'),
    ('tv', '📺', 'טלוויזיה'),
    ('triple', '🏠', 'משולב'),
    ('abroad', '✈️', 'חו"ל'),
  ];

  // Returns (currentMax, newPlanMax, exitFeeMax) per category
  static (double, double, double) _sliderConfig(String cat) {
    switch (cat) {
      case 'internet': return (500, 250, 500);
      case 'tv':       return (350, 200, 300);
      case 'triple':   return (700, 400, 700);
      case 'abroad':   return (150, 100, 100);
      default:         return (400, 300, 500);
    }
  }

  @override
  void initState() {
    super.initState();
    final appState = AppState();
    _selectedCat = appState.selectedCat.isNotEmpty ? appState.selectedCat : 'cellular';
    _initFromCat(_selectedCat, appState);
  }

  void _initFromCat(String cat, [AppState? appState]) {
    final state = appState ?? AppState();
    final cfg = _sliderConfig(cat);
    final minVal = cat == 'abroad' ? 5.0 : 20.0;
    final rawBill = state.currentBill(cat).toDouble();
    _current = (rawBill > 0 ? rawBill : minVal).clamp(minVal, cfg.$1);
    final plans = plansByCat(cat)..sort((a, b) => a.price.compareTo(b.price));
    _newPlan = plans.isNotEmpty ? plans.first.price.toDouble().clamp(minVal, cfg.$2) : (cat == 'abroad' ? 15.0 : 49.0);
  }

  void _selectCat(String cat) {
    setState(() {
      _selectedCat = cat;
      _initFromCat(cat);
    });
  }

  double _exitFee = 0;

  int get _monthlySaving => (_current - _newPlan).round().clamp(0, 9999);
  int get _annualSaving => (_monthlySaving * 12 - _exitFee.round()).clamp(0, 99999);
  double get _breakeven => _monthlySaving > 0 ? _exitFee / _monthlySaving : 0;

  Color _resultColor(AppTheme ffTheme) {
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
    final ffTheme = AppTheme.of(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        flexibleSpace: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [ffTheme.primary, ffTheme.tertiary]),
          ),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('מחשבון מעבר', style: GoogleFonts.rubik(fontSize: 16, fontWeight: FontWeight.w700, color: Colors.white)),
            Text(_catInfo.firstWhere((c) => c.$1 == _selectedCat, orElse: () => _catInfo.first).$3,
              style: GoogleFonts.assistant(fontSize: 12, color: Colors.white70)),
          ],
        ),
        elevation: 0,
        foregroundColor: Colors.white,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('מחשבון מעבר', style: ffTheme.headlineMedium),
            const SizedBox(height: 4),
            Text('חשבו אם המעבר משתלם לכם', style: ffTheme.bodySmall),
            const SizedBox(height: 16),

            SizedBox(
              height: 40,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _catInfo.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (ctx, i) {
                  final cat = _catInfo[i];
                  final isActive = cat.$1 == _selectedCat;
                  return GestureDetector(
                    onTap: () => _selectCat(cat.$1),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: isActive ? ffTheme.primary : Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: isActive ? ffTheme.primary : ffTheme.alternate),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(cat.$2, style: const TextStyle(fontSize: 14)),
                          const SizedBox(width: 6),
                          Text(cat.$3, style: ffTheme.labelMedium.copyWith(
                            color: isActive ? Colors.white : ffTheme.primaryText,
                            fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                          )),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ).animate().fadeIn(duration: 300.ms),

            const SizedBox(height: 20),

            Builder(builder: (_) {
              final cfg = _sliderConfig(_selectedCat);
              final minVal = _selectedCat == 'abroad' ? 5.0 : 20.0;
              return Column(
                children: [
                  _SliderSection(
                    label: 'חשבון נוכחי',
                    emoji: '💸',
                    value: _current.clamp(minVal, cfg.$1),
                    min: minVal,
                    max: cfg.$1,
                    onChanged: (v) => setState(() => _current = v),
                    ffTheme: ffTheme,
                  ).animate().fadeIn(duration: 400.ms),

                  const SizedBox(height: 20),

                  _SliderSection(
                    label: 'מסלול חדש',
                    emoji: '✨',
                    value: _newPlan.clamp(minVal, cfg.$2),
                    min: minVal,
                    max: cfg.$2,
                    onChanged: (v) => setState(() => _newPlan = v),
                    ffTheme: ffTheme,
                  ).animate().fadeIn(delay: 100.ms),

                  const SizedBox(height: 20),

                  _SliderSection(
                    label: 'דמי ניתוק',
                    emoji: '🔓',
                    value: _exitFee.clamp(0, cfg.$3),
                    min: 0,
                    max: cfg.$3,
                    onChanged: (v) => setState(() => _exitFee = v),
                    ffTheme: ffTheme,
                  ).animate().fadeIn(delay: 200.ms),
                ],
              );
            }),

            const SizedBox(height: 10),

            // Exit fee quick presets
            Row(
              children: [
                Text('הגדר במהירות: ', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
                ...[0, 100, 200, 300, 500].map((fee) {
                  final active = _exitFee.round() == fee;
                  return GestureDetector(
                    onTap: () => setState(() => _exitFee = fee.toDouble()),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      margin: const EdgeInsets.only(right: 6),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: active ? ffTheme.primary : Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: active ? ffTheme.primary : ffTheme.alternate),
                      ),
                      child: Text(fee == 0 ? 'ללא' : '₪$fee',
                        style: ffTheme.labelSmall.copyWith(
                          color: active ? Colors.white : ffTheme.primaryText,
                          fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                        )),
                    ),
                  );
                }),
              ],
            ).animate().fadeIn(delay: 230.ms),

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
                      Expanded(child: _ResultStat(label: _selectedCat == 'abroad' ? 'חיסכון לחבילה' : 'חיסכון חודשי', value: '₪$_monthlySaving', color: _resultColor(ffTheme), ffTheme: ffTheme)),
                      if (_selectedCat != 'abroad')
                        Expanded(child: _ResultStat(label: 'חיסכון שנתי', value: '₪$_annualSaving', color: _resultColor(ffTheme), ffTheme: ffTheme)),
                    ],
                  ),
                  if (_breakeven > 0 && _selectedCat != 'abroad') ...[
                    const SizedBox(height: 14),
                    Text(
                      'נקודת איזון: ${_breakeven.toStringAsFixed(1)} חודשים',
                      style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
                    ),
                  ],
                ],
              ),
            ).animate().fadeIn(delay: 300.ms),

            const SizedBox(height: 24),

            // Delay cost warning
            if (_monthlySaving > 0) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: ffTheme.warning.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: ffTheme.warning.withOpacity(0.3)),
                ),
                child: Row(
                  children: [
                    const Text('⏰', style: TextStyle(fontSize: 20)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        _selectedCat == 'abroad' ? 'כל נסיעה שאתם מחכים עולה לכם ₪$_monthlySaving' : 'כל חודש שאתם מחכים עולה לכם ₪$_monthlySaving',
                        style: ffTheme.bodyMedium.copyWith(color: ffTheme.warning, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 380.ms),
              const SizedBox(height: 16),
            ],

            // Savings timeline with bar chart (hidden for abroad — no monthly concept)
            if (_annualSaving > 0 && _selectedCat != 'abroad') ...[
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: ffTheme.alternate),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('חיסכון לאורך זמן', style: ffTheme.titleSmall),
                    const SizedBox(height: 16),
                    _SavingsBarChart(
                      monthlySaving: _monthlySaving,
                      exitFee: _exitFee,
                      ffTheme: ffTheme,
                    ),
                    const Divider(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _TimelineStat(months: 6, monthlySaving: _monthlySaving, exitFee: _exitFee, ffTheme: ffTheme),
                        Container(width: 1, height: 48, color: ffTheme.alternate),
                        _TimelineStat(months: 12, monthlySaving: _monthlySaving, exitFee: _exitFee, ffTheme: ffTheme),
                        Container(width: 1, height: 48, color: ffTheme.alternate),
                        _TimelineStat(months: 24, monthlySaving: _monthlySaving, exitFee: _exitFee, ffTheme: ffTheme),
                        Container(width: 1, height: 48, color: ffTheme.alternate),
                        _TimelineStat(months: 36, monthlySaving: _monthlySaving, exitFee: _exitFee, ffTheme: ffTheme),
                      ],
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 420.ms),
              const SizedBox(height: 16),
            ],

            _LeadingPlanCard(
              selectedCat: _selectedCat,
              maxPrice: _newPlan.round(),
              ffTheme: ffTheme,
            ).animate().fadeIn(delay: 440.ms),

            const SizedBox(height: 12),

            if (_annualSaving > 0)
              ElevatedButton(
                onPressed: () => context.pushNamed('Results'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: ffTheme.primary,
                  minimumSize: const Size(double.infinity, 52),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: Text('מצא מסלולים מתאימים', style: ffTheme.titleSmall.copyWith(color: Colors.white)),
              ).animate().fadeIn(delay: 460.ms),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

class _SavingsBarChart extends StatelessWidget {
  const _SavingsBarChart({required this.monthlySaving, required this.exitFee, required this.ffTheme});
  final int monthlySaving;
  final double exitFee;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final milestones = [
      (3, '3 חודשים'),
      (6, '6 חודשים'),
      (12, 'שנה'),
      (24, '2 שנים'),
    ];
    final maxAmount = (monthlySaving * 24 - exitFee).clamp(1, double.infinity);

    return Column(
      children: milestones.map((m) {
        final amount = (monthlySaving * m.$1 - exitFee).clamp(0, double.infinity).round();
        final fraction = (amount / maxAmount).clamp(0.0, 1.0);
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            children: [
              SizedBox(
                width: 64,
                child: Text(m.$2, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontSize: 11)),
              ),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: fraction),
                    duration: const Duration(milliseconds: 800),
                    curve: Curves.easeOutCubic,
                    builder: (_, v, __) => LinearProgressIndicator(
                      value: v,
                      backgroundColor: ffTheme.alternate,
                      valueColor: AlwaysStoppedAnimation(
                        fraction > 0.5 ? ffTheme.success : (fraction > 0.2 ? ffTheme.primary : ffTheme.warning),
                      ),
                      minHeight: 12,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 52,
                child: Text(
                  '₪$amount',
                  style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700, fontSize: 11),
                  textAlign: TextAlign.end,
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}

class _LeadingPlanCard extends StatelessWidget {
  const _LeadingPlanCard({required this.selectedCat, required this.maxPrice, required this.ffTheme});
  final String selectedCat;
  final int maxPrice;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final plans = plansByCat(selectedCat)..sort((a, b) => a.price.compareTo(b.price));
    if (plans.isEmpty) return const SizedBox();
    final matching = plans.where((p) => p.price <= maxPrice).toList();
    final plan = matching.isNotEmpty ? matching.first : plans.first;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ffTheme.alternate),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: ffTheme.accent1, borderRadius: BorderRadius.circular(8)),
                child: Text('הצעה מובילה', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
              ),
              if (matching.isEmpty) ...[
                const SizedBox(width: 8),
                Text('(הכי זול בקטגוריה)', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
              ],
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              LogoWidget(provider: plan.provider, size: 44),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(plan.provider, style: ffTheme.titleSmall),
                    Text(plan.plan, style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText), maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('₪${plan.price}', style: ffTheme.headlineSmall.copyWith(color: ffTheme.primary)),
                  Text(selectedCat == 'abroad' ? 'לחבילה' : 'לחודש', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: () {
                Provider.of<AppState>(context, listen: false).setCategory(selectedCat);
                context.pushNamed('Results');
              },
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: ffTheme.primary),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                padding: const EdgeInsets.symmetric(vertical: 10),
              ),
              child: Text('הצג מסלול', style: ffTheme.labelMedium.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }
}

class _SliderSection extends StatelessWidget {
  const _SliderSection({required this.label, required this.emoji, required this.value, required this.min, required this.max, required this.onChanged, required this.ffTheme});
  final String label, emoji;
  final double value, min, max;
  final ValueChanged<double> onChanged;
  final AppTheme ffTheme;

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
              Text('₪${value.round()}', style: ffTheme.headlineSmall.copyWith(color: ffTheme.primary)),
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
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(label, style: ffTheme.labelSmall),
        const SizedBox(height: 4),
        Text(value, style: ffTheme.headlineSmall.copyWith(color: color)),
      ],
    );
  }
}

class _TimelineStat extends StatelessWidget {
  const _TimelineStat({required this.months, required this.monthlySaving, required this.exitFee, required this.ffTheme});
  final int months;
  final int monthlySaving;
  final double exitFee;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final amount = (monthlySaving * months - exitFee).round().clamp(0, 999999);
    return Column(
      children: [
        Text(
          '₪$amount',
          style: ffTheme.titleMedium.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 4),
        Text('$months חודשים', style: ffTheme.labelSmall),
      ],
    );
  }
}
