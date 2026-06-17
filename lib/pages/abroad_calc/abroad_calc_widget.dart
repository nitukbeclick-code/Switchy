// To add to router (in lib/router.dart), add inside GoRouter routes (inside the ShellRoute):
// GoRoute(path: '/abroad-calc', name: 'AbroadCalc', builder: (_, __) => const AbroadCalcWidget()),
// Then navigate with: context.pushNamed('AbroadCalc')

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';
import '../../data.dart';
import '../../models.dart';
import '../../theme/app_theme.dart';
import '../../widgets/app_button.dart';

// ── Constants ────────────────────────────────────────────────────────────────

const List<_Destination> _destinations = [
  _Destination(label: 'ארה"ב', flag: '🇺🇸'),
  _Destination(label: 'אירופה', flag: '🇪🇺'),
  _Destination(label: 'יוון', flag: '🇬🇷'),
  _Destination(label: 'ספרד', flag: '🇪🇸'),
  _Destination(label: 'תאילנד', flag: '🇹🇭'),
  _Destination(label: 'דובאי', flag: '🇦🇪'),
  _Destination(label: 'יפן', flag: '🇯🇵'),
  _Destination(label: 'אחר', flag: '🌍'),
];

enum _DataLevel {
  minimal(label: 'מינימלי', icon: Icons.smartphone_rounded, subtitle: 'WhatsApp, מפות בלבד', mbPerDay: 200),
  medium(label: 'בינוני', icon: Icons.laptop_mac_rounded, subtitle: 'גלישה רגילה + סושיאל', mbPerDay: 1024),
  heavy(label: 'גבוה', icon: Icons.movie_rounded, subtitle: 'סטרימינג + ניווט + סושיאל', mbPerDay: 3072);

  const _DataLevel({required this.label, required this.icon, required this.subtitle, required this.mbPerDay});
  final String label;
  final IconData icon;
  final String subtitle;
  final int mbPerDay; // MB per day
}

// ── Provider accent colors (brand palette, not app accent — per CLAUDE.md) ──

const Map<String, Color> _providerColors = {
  'גולן טלקום': Color(0xFF00A651),
  'פרטנר': Color(0xFFFF6600),
  'פלאפון': Color(0xFF003087),
  'Airalo eSIM': Color(0xFF7B61FF),
  'הוט מובייל': Color(0xFFE50055),
  'סלקום': Color(0xFF009FE3),
  '019 מובייל': Color(0xFFB71C1C),
};

Color _dotColorFor(String provider) =>
    _providerColors[provider] ?? AppColors.brandAccent;

// ── Helper ─────────────────────────────────────────────────────────────────

class _Destination {
  const _Destination({required this.label, required this.flag});
  final String label;
  final String flag;
}

class _RankedPlan {
  const _RankedPlan({required this.plan, required this.totalCost});
  final Plan plan;
  final double totalCost; // ₪ for the full trip
}

List<_RankedPlan> _rankPlans(List<Plan> abroad, int days) {
  final ranked = <_RankedPlan>[];
  for (final plan in abroad) {
    final unit = plan.unit;
    if (unit == 'minute') continue; // skip per-minute plans
    final double total;
    if (unit == 'day') {
      total = plan.priceValue * days;
    } else {
      // 'month' or 'package' — one payment covers the trip
      total = plan.priceValue;
    }
    ranked.add(_RankedPlan(plan: plan, totalCost: total));
  }
  ranked.sort((a, b) => a.totalCost.compareTo(b.totalCost));
  return ranked;
}

/// Returns the data volume (in MB) that a plan covers.
/// Parses specs['נתונים'] values like '10GB', '3GB', '500MB', '2GB'.
/// Returns null when unknown / unlimited.
int? _planDataMb(Plan p) {
  final raw = p.specs['נתונים'];
  if (raw != null) {
    final m = RegExp(r'(\d+(?:\.\d+)?)\s*(GB|MB|TB)', caseSensitive: false).firstMatch(raw);
    if (m != null) {
      final val = double.tryParse(m.group(1)!) ?? 0;
      final unit = m.group(2)!.toUpperCase();
      if (unit == 'GB') return (val * 1024).round();
      if (unit == 'MB') return val.round();
      if (unit == 'TB') return (val * 1024 * 1024).round();
    }
  }
  // Fallback: parse feats for GB mentions
  for (final f in p.feats) {
    final m = RegExp(r'(\d+(?:\.\d+)?)\s*GB', caseSensitive: false).firstMatch(f);
    if (m != null) {
      final val = double.tryParse(m.group(1)!) ?? 0;
      return (val * 1024).round();
    }
  }
  return null;
}

String _formatPrice(double price) {
  if (price == price.roundToDouble()) return price.toInt().toString();
  return price.toStringAsFixed(2);
}

// ── Page ──────────────────────────────────────────────────────────────────────

class AbroadCalcWidget extends StatefulWidget {
  const AbroadCalcWidget({super.key});

  @override
  State<AbroadCalcWidget> createState() => _AbroadCalcWidgetState();
}

class _AbroadCalcWidgetState extends State<AbroadCalcWidget> {
  int _selectedDestIndex = 1; // Default: אירופה
  double _days = 7;
  _DataLevel _dataLevel = _DataLevel.medium;

  // Derived
  int get days => _days.round();
  int get totalNeededMb => days * _dataLevel.mbPerDay;
  String get totalNeededLabel {
    if (totalNeededMb >= 1024) {
      final gb = totalNeededMb / 1024;
      final str = gb == gb.roundToDouble() ? gb.toInt().toString() : gb.toStringAsFixed(1);
      return '$str GB';
    }
    return '$totalNeededMb MB';
  }

  List<_RankedPlan> get _ranked =>
      _rankPlans(abroadPlans, days);

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.of(context);
    final ranked = _ranked;

    return Scaffold(
      backgroundColor: theme.background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        centerTitle: true,
        leading: Semantics(
          button: true,
          label: 'חזרה',
          child: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded),
            color: theme.primaryText,
            onPressed: () => context.pop(),
          ),
        ),
        title: Text(
          'מחשבון תוכניות חו"ל 🌍',
          style: theme.titleLarge,
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: theme.lineColor),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // SECTION 1 — INPUT CARD
          _InputCard(
            selectedDestIndex: _selectedDestIndex,
            days: _days,
            dataLevel: _dataLevel,
            totalNeededLabel: totalNeededLabel,
            onDestChanged: (i) => setState(() => _selectedDestIndex = i),
            onDaysChanged: (v) => setState(() => _days = v),
            onDataLevelChanged: (l) => setState(() => _dataLevel = l),
          ).animate().fadeIn(duration: 320.ms).slideY(begin: 0.06, end: 0, duration: 320.ms),

          const SizedBox(height: 24),

          // Section heading
          Text(
            'תוכניות מומלצות',
            style: theme.headlineSmall.copyWith(fontWeight: FontWeight.w700),
          ).animate().fadeIn(duration: 280.ms, delay: 80.ms),
          const SizedBox(height: 4),
          Text(
            'ממוינות לפי עלות כוללת לטיול — מהזולה לביותר',
            style: theme.bodySmall.copyWith(color: theme.secondaryText),
          ).animate().fadeIn(duration: 280.ms, delay: 120.ms),
          const SizedBox(height: 16),

          // SECTION 2 — PLAN CARDS
          if (ranked.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 48),
              child: Center(
                child: Column(
                  children: [
                    Icon(Icons.travel_explore_rounded, size: 40, color: theme.secondaryText),
                    const SizedBox(height: 12),
                    Text('לא נמצאו תוכניות', style: theme.titleSmall),
                    const SizedBox(height: 4),
                    Text(
                      'נסו לשנות את מספר הימים או רמת השימוש',
                      style: theme.bodySmall.copyWith(color: theme.secondaryText),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            )
          else
            ...ranked.asMap().entries.map((entry) {
              final i = entry.key;
              final item = entry.value;
              final isCheapest = i == 0;
              final dataMb = _planDataMb(item.plan);
              final enough = dataMb != null && dataMb >= totalNeededMb;
              final unknown = dataMb == null;
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _PlanCard(
                  item: item,
                  days: days,
                  isCheapest: isCheapest,
                  dataEnough: enough,
                  dataUnknown: unknown,
                ).animate().fadeIn(
                  duration: 320.ms,
                  delay: (160 + i * 80).ms,
                ).slideY(begin: 0.08, end: 0, duration: 320.ms, delay: (160 + i * 80).ms),
              );
            }),

          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

// ── Input Card ────────────────────────────────────────────────────────────────

class _InputCard extends StatelessWidget {
  const _InputCard({
    required this.selectedDestIndex,
    required this.days,
    required this.dataLevel,
    required this.totalNeededLabel,
    required this.onDestChanged,
    required this.onDaysChanged,
    required this.onDataLevelChanged,
  });

  final int selectedDestIndex;
  final double days;
  final _DataLevel dataLevel;
  final String totalNeededLabel;
  final ValueChanged<int> onDestChanged;
  final ValueChanged<double> onDaysChanged;
  final ValueChanged<_DataLevel> onDataLevelChanged;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(theme.radiusMd),
        border: Border.all(color: theme.lineColor),
        boxShadow: theme.shadowCard,
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Destination ────────────────────────────────────────────────────
          Text('יעד הנסיעה', style: theme.titleSmall),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _destinations.asMap().entries.map((e) {
              final selected = e.key == selectedDestIndex;
              return Semantics(
                button: true,
                selected: selected,
                label: e.value.label,
                child: GestureDetector(
                  onTap: () => onDestChanged(e.key),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                    decoration: BoxDecoration(
                      color: selected ? AppColors.brandAccentTint : AppColors.accent1,
                      borderRadius: BorderRadius.circular(theme.radiusPill),
                      border: Border.all(
                        color: selected ? AppColors.brandAccent : Colors.transparent,
                        width: 1.5,
                      ),
                    ),
                    child: Text(
                      '${e.value.flag} ${e.value.label}',
                      style: theme.labelLarge.copyWith(
                        color: selected ? AppColors.brandAccent : theme.primaryText,
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),

          const SizedBox(height: 20),
          Divider(color: theme.lineColor, height: 1),
          const SizedBox(height: 20),

          // ── Days slider ────────────────────────────────────────────────────
          Row(
            children: [
              Text('כמה ימים?', style: theme.titleSmall),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.brandAccentTint,
                  borderRadius: BorderRadius.circular(theme.radiusPill),
                ),
                child: Text(
                  '${days.round()} ימים',
                  style: theme.titleSmall.copyWith(
                    color: AppColors.brandAccent,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ),
            ],
          ),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              activeTrackColor: AppColors.brandAccent,
              inactiveTrackColor: AppColors.brandAccentTint,
              thumbColor: AppColors.brandAccent,
              overlayColor: AppColors.brandAccent.withValues(alpha: 0.12),
              trackHeight: 4,
            ),
            child: Slider(
              value: days,
              min: 1,
              max: 30,
              divisions: 29,
              onChanged: onDaysChanged,
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('יום 1', style: theme.labelSmall),
              Text('30 ימים', style: theme.labelSmall),
            ],
          ),

          const SizedBox(height: 20),
          Divider(color: theme.lineColor, height: 1),
          const SizedBox(height: 20),

          // ── Data usage ────────────────────────────────────────────────────
          Text('שימוש בדאטה ליום', style: theme.titleSmall),
          const SizedBox(height: 10),
          ..._DataLevel.values.map((level) {
            final selected = dataLevel == level;
            return Semantics(
              button: true,
              selected: selected,
              label: '${level.label} — ${level.subtitle}',
              child: GestureDetector(
                onTap: () => onDataLevelChanged(level),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                  decoration: BoxDecoration(
                    color: selected ? AppColors.brandAccentTint : AppColors.accent1,
                    borderRadius: BorderRadius.circular(theme.radiusSm),
                    border: Border.all(
                      color: selected ? AppColors.brandAccent : Colors.transparent,
                      width: 1.5,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        level.icon,
                        size: 20,
                        color: selected ? AppColors.brandAccent : theme.secondaryText,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(level.label, style: theme.titleSmall.copyWith(
                              color: selected ? AppColors.brandAccent : theme.primaryText,
                            )),
                            const SizedBox(height: 2),
                            Text(level.subtitle, style: theme.bodySmall),
                          ],
                        ),
                      ),
                      if (selected)
                        const Icon(Icons.check_circle_rounded, color: AppColors.brandAccent, size: 20),
                    ],
                  ),
                ),
              ),
            );
          }),

          const SizedBox(height: 12),
          Divider(color: theme.lineColor, height: 1),
          const SizedBox(height: 12),

          // ── Total data needed ─────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.accent1,
              borderRadius: BorderRadius.circular(theme.radiusSm),
              border: Border.all(color: theme.lineColor),
            ),
            child: Row(
              children: [
                Icon(Icons.data_usage_rounded, size: 18, color: theme.secondaryText),
                const SizedBox(width: 8),
                Text(
                  'סה"כ צריך',
                  style: theme.bodyMedium.copyWith(color: theme.secondaryText),
                ),
                const Spacer(),
                Text(
                  totalNeededLabel,
                  style: theme.titleSmall.copyWith(
                    color: AppColors.brandAccent,
                    fontWeight: FontWeight.w700,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Plan Card ────────────────────────────────────────────────────────────────

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.item,
    required this.days,
    required this.isCheapest,
    required this.dataEnough,
    required this.dataUnknown,
  });

  final _RankedPlan item;
  final int days;
  final bool isCheapest;
  final bool dataEnough;
  final bool dataUnknown;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.of(context);
    final plan = item.plan;
    final totalCost = item.totalCost;
    final perDay = days > 0 ? totalCost / days : totalCost;
    final providerColor = _dotColorFor(plan.provider);

    // Per-unit label — core word from priceUnitLabel(plan), contextual qualifier per unit
    final unitLabel = priceUnitLabel(plan);
    final String pricingNote;
    if (plan.unit == 'day') {
      pricingNote = '₪${_formatPrice(plan.priceValue)} $unitLabel × $days ימים';
    } else if (plan.unit == 'month') {
      pricingNote = '₪${_formatPrice(plan.priceValue)} $unitLabel (מנוי)';
    } else {
      pricingNote = '₪${_formatPrice(plan.priceValue)} $unitLabel (חד-פעמי)';
    }

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(theme.radiusMd),
        border: Border.all(
          color: isCheapest ? AppColors.saving.withValues(alpha: 0.5) : theme.lineColor,
          width: isCheapest ? 1.5 : 1,
        ),
        boxShadow: theme.shadowCard,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // TOP BADGE BAR (cheapest badge only)
          if (isCheapest)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
              decoration: BoxDecoration(
                color: AppColors.saving.withValues(alpha: 0.12),
                borderRadius: BorderRadius.only(
                  topLeft: Radius.circular(theme.radiusMd),
                  topRight: Radius.circular(theme.radiusMd),
                ),
              ),
              child: Row(
                children: [
                  const Icon(Icons.savings_rounded, size: 16, color: AppColors.savingDark),
                  const SizedBox(width: 6),
                  Text(
                    'הזול ביותר',
                    style: theme.labelLarge.copyWith(color: AppColors.savingDark),
                  ),
                ],
              ),
            ),

          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Provider + data-sufficiency chip
                Row(
                  children: [
                    // Color dot
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: providerColor,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        plan.provider,
                        style: theme.labelLarge.copyWith(color: theme.secondaryText),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    // Data status chip
                    Builder(builder: (ctx) {
                      final Color statusColor = dataUnknown
                          ? theme.secondaryText
                          : (dataEnough
                              ? const Color(0xFF16A34A)
                              : AppColors.savingDark);
                      final IconData statusIcon = dataUnknown
                          ? Icons.help_outline_rounded
                          : (dataEnough
                              ? Icons.check_circle_rounded
                              : Icons.warning_amber_rounded);
                      final String statusText = dataUnknown
                          ? 'דאטה לא ידוע'
                          : (dataEnough ? 'מספיק דאטה' : 'ייתכן חיסרון');
                      return Container(
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                        decoration: BoxDecoration(
                          color: dataUnknown
                              ? AppColors.accent1
                              : (dataEnough
                                  ? const Color(0xFFDCFCE7)
                                  : AppColors.saving.withValues(alpha: 0.12)),
                          borderRadius: BorderRadius.circular(theme.radiusPill),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(statusIcon, size: 13, color: statusColor),
                            const SizedBox(width: 4),
                            Text(
                              statusText,
                              style: theme.labelSmall.copyWith(color: statusColor),
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                ),

                const SizedBox(height: 8),

                // Plan title
                Text(
                  plan.plan,
                  style: theme.titleMedium.copyWith(fontWeight: FontWeight.w700),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),

                const SizedBox(height: 12),

                // Price row — total + per-day
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '₪${_formatPrice(totalCost)} לטיול',
                          style: theme.headlineSmall.copyWith(
                            color: AppColors.brandAccent,
                            fontWeight: FontWeight.w800,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          pricingNote,
                          style: theme.bodySmall.copyWith(
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ],
                    ),
                    const Spacer(),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '₪${_formatPrice(perDay)}',
                          style: theme.titleLarge.copyWith(
                            color: theme.primaryText,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                        Text('ליום', style: theme.labelSmall),
                      ],
                    ),
                  ],
                ),

                // Data from feats (first feat that mentions data/GB/גלישה)
                Builder(builder: (ctx) {
                  final dataFeat = plan.feats.firstWhere(
                    (f) => f.contains('GB') || f.contains('גלישה') || f.contains('MB'),
                    orElse: () => '',
                  );
                  if (dataFeat.isEmpty) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Row(
                      children: [
                        Icon(Icons.wifi_rounded, size: 14, color: theme.secondaryText),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(dataFeat, style: theme.bodySmall),
                        ),
                      ],
                    ),
                  );
                }),

                const SizedBox(height: 14),

                // CTA button
                AppButton(
                  text: 'צפה בתוכנית',
                  color: AppColors.primary,
                  width: double.infinity,
                  height: 46,
                  onPressed: () async {
                    context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id});
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
