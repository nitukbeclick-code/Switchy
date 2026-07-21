import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../services/recommendation_engine.dart';
import '../../services/switch_economics.dart';
import '../../widgets/app_button.dart';
import '../../widgets/pressable.dart';
import '../../widgets/price_text.dart';

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
    ('cellular', 'סלולר'),
    ('internet', 'אינטרנט'),
    ('tv', 'טלוויזיה'),
    ('triple', 'משולב'),
    ('abroad', 'חו"ל'),
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

  SwitchEconomics get _econ =>
      SwitchEconomics(current: _current, newPlan: _newPlan, exitFee: _exitFee);

  Color _resultColor(AppTheme ffTheme) {
    switch (_econ.verdict) {
      case SwitchVerdict.worthIt:
        return ffTheme.brandAccent; // green = go, switch is clearly worth it
      case SwitchVerdict.smallSaving:
        return ffTheme.warning;
      case SwitchVerdict.notWorthIt:
        return ffTheme.error;
    }
  }

  String _resultText() {
    switch (_econ.verdict) {
      case SwitchVerdict.worthIt:
        return 'שווה מאוד לעבור!';
      case SwitchVerdict.smallSaving:
        return 'יש חיסכון קטן';
      case SwitchVerdict.notWorthIt:
        return 'אין יתרון כספי לעבור כרגע';
    }
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);
    final appState = Provider.of<AppState>(context);
    // The result figures are SLIDER-DRIVEN (high-frequency), so they must NEVER
    // animate per recompute — the verdict card's one-shot entrance reveal is the
    // only motion the value gets (it settles in once, then tracks the sliders
    // instantly). Reduced-motion keeps that fade and drops its rise.
    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final econ = _econ;
    final cat = _selectedCat;
    final profile = MatchProfile(
      category: cat,
      currentBill: appState.currentBill(cat),
      budget: (appState.quizCompleted && appState.quizCat == cat) ? appState.quizBudget : 0,
      priority: priorityFromId(appState.quizPriority),
      lines: appState.quizLines,
      wants5G: appState.wants5G,
      wantsAbroad: appState.wantsAbroad,
      wantsNoCommit: appState.wantsNoCommit,
    );
    final recommended = RecommendationEngine.bestMatch(profile);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        flexibleSpace: Container(
          // GEIST: flat ink hero bar (was an ink→grey decorative wash).
          decoration: BoxDecoration(color: ffTheme.primary),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Type-scale tokens; white-on-ink is the only delta (fixed header).
            Text('מחשבון מעבר', style: ffTheme.titleLarge.copyWith(color: Colors.white)),
            Text(_catInfo.firstWhere((c) => c.$1 == _selectedCat, orElse: () => _catInfo.first).$2,
              style: ffTheme.labelSmall.copyWith(fontWeight: FontWeight.w400, color: Colors.white70)),
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
            Semantics(
              header: true,
              child: Text('מחשבון מעבר', style: ffTheme.headlineMedium),
            ),
            const SizedBox(height: 4),
            Text('חשבו אם המעבר משתלם לכם', style: ffTheme.bodySmall),
            const SizedBox(height: 16),

            // Category chips — the ONE chip language: neutral = surface +
            // hairline + ink; ACTIVE = green tint + green hairline + green ink
            // (solid green stays reserved for CTAs). The rail is tall enough
            // for a >=48dp tap target per chip.
            SizedBox(
              height: 52,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _catInfo.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (ctx, i) {
                  final cat = _catInfo[i];
                  final isActive = cat.$1 == _selectedCat;
                  return Semantics(
                    button: true,
                    selected: isActive,
                    child: Pressable(
                      onTap: () => _selectCat(cat.$1),
                      child: Center(
                        widthFactor: 1,
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: isActive ? ffTheme.brandAccentTint : ffTheme.cardSurface,
                            borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                            border: Border.all(color: isActive ? ffTheme.brandAccent : ffTheme.alternate),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              ExcludeSemantics(
                                child: Icon(categoryIconData(cat.$1), size: 15,
                                  color: isActive ? ffTheme.brandAccent : ffTheme.secondaryText),
                              ),
                              const SizedBox(width: 6),
                              Text(cat.$2, style: ffTheme.labelMedium.copyWith(
                                color: isActive ? ffTheme.brandAccentText : ffTheme.primaryText,
                                fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                              )),
                            ],
                          ),
                        ),
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
                    icon: Icons.receipt_long_rounded,
                    value: _current.clamp(minVal, cfg.$1),
                    min: minVal,
                    max: cfg.$1,
                    onChanged: (v) => setState(() => _current = v),
                    ffTheme: ffTheme,
                  ).animate().fadeIn(duration: 400.ms),

                  const SizedBox(height: 20),

                  _SliderSection(
                    label: 'מסלול חדש',
                    icon: Icons.auto_awesome_rounded,
                    value: _newPlan.clamp(minVal, cfg.$2),
                    min: minVal,
                    max: cfg.$2,
                    onChanged: (v) => setState(() => _newPlan = v),
                    ffTheme: ffTheme,
                  ).animate().fadeIn(delay: 100.ms),

                  const SizedBox(height: 20),

                  _SliderSection(
                    label: 'דמי ניתוק',
                    icon: Icons.lock_open_rounded,
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
                  final chipStyle = ffTheme.labelSmall.copyWith(
                    color: active ? ffTheme.brandAccentText : ffTheme.primaryText,
                    fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                  );
                  // ACTIVE = green tint chip (one chip language); >=48dp hit
                  // area around the unchanged painted pill.
                  return Semantics(
                    button: true,
                    selected: active,
                    child: Pressable(
                      onTap: () => setState(() => _exitFee = fee.toDouble()),
                      child: _MinTapTarget(
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 180),
                          margin: const EdgeInsetsDirectional.only(end: 6),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: active ? ffTheme.brandAccentTint : ffTheme.cardSurface,
                            borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                            border: Border.all(color: active ? ffTheme.brandAccent : ffTheme.alternate),
                          ),
                          child: fee == 0
                              ? Text('ללא', style: chipStyle)
                              // Money renders bidi-safe via PriceText.
                              : PriceText('₪$fee', style: chipStyle),
                        ),
                      ),
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
                // Status-tinted verdict surface — flat + 1px hairline (one
                // elevation story: resting content carries no shadow).
                color: _resultColor(ffTheme).withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(ffTheme.radiusCard),
                border: Border.all(color: _resultColor(ffTheme).withValues(alpha: 0.3)),
              ),
              child: Column(
                children: [
                  Text(_resultText(), style: ffTheme.headlineMedium.copyWith(fontWeight: FontWeight.w800, color: _resultColor(ffTheme))),
                  const SizedBox(height: 20),
                  // The ₪ figures are the VALUE the calculator exists to surface —
                  // the green savings ink (VALUE), not the verdict's status hue.
                  // A zero saving reads as muted ink so we never paint "₪0" as
                  // a win.
                  Row(
                    children: [
                      Expanded(child: _ResultStat(label: _selectedCat == 'abroad' ? 'חיסכון לחבילה' : 'חיסכון חודשי', value: '₪${econ.monthlySaving}', color: econ.monthlySaving > 0 ? ffTheme.savingText : ffTheme.secondaryText, ffTheme: ffTheme)),
                      if (_selectedCat != 'abroad')
                        Expanded(child: _ResultStat(label: 'חיסכון שנתי', value: '₪${econ.annualSaving}', color: econ.annualSaving > 0 ? ffTheme.savingText : ffTheme.secondaryText, ffTheme: ffTheme)),
                    ],
                  ),
                  if (econ.hasBreakEven && _exitFee > 0 && _selectedCat != 'abroad') ...[
                    const SizedBox(height: 14),
                    Text(
                      'נקודת איזון: ${econ.breakEvenMonths.toStringAsFixed(1)} חודשים',
                      style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
                    ),
                  ],
                ],
              ),
            )
                // The verdict + its ₪ figures settle in once: a fade, plus a
                // gentle 5% rise (dropped under reduced-motion) so the result
                // reads as arriving rather than blinking into place.
                .animate()
                .fadeIn(delay: 300.ms)
                .slideY(begin: reduceMotion ? 0 : 0.05, end: 0, curve: ffTheme.easeOut),

            const SizedBox(height: 24),

            // Delay cost warning
            if (econ.monthlySaving > 0) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: ffTheme.warning.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(ffTheme.radiusLg),
                  border: Border.all(color: ffTheme.warning.withValues(alpha: 0.3)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.access_time_rounded, size: 20, color: ffTheme.warning),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        _selectedCat == 'abroad' ? 'כל נסיעה שאתם מחכים עולה לכם ₪${econ.monthlySaving}' : 'כל חודש שאתם מחכים עולה לכם ₪${econ.monthlySaving}',
                        style: ffTheme.bodyMedium.copyWith(color: ffTheme.warning, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 380.ms),
              const SizedBox(height: 16),
            ],

            // Savings timeline with bar chart (hidden for abroad — no monthly concept)
            if (econ.annualSaving > 0 && _selectedCat != 'abroad') ...[
              Container(
                padding: const EdgeInsets.all(18),
                decoration: ffTheme.bentoDecoration(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      header: true,
                      child: Text('חיסכון לאורך זמן', style: ffTheme.titleMedium),
                    ),
                    const SizedBox(height: 16),
                    _SavingsBarChart(
                      econ: econ,
                      ffTheme: ffTheme,
                    ),
                    const Divider(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _TimelineStat(months: 6, econ: econ, ffTheme: ffTheme),
                        Container(width: 1, height: 48, color: ffTheme.alternate),
                        _TimelineStat(months: 12, econ: econ, ffTheme: ffTheme),
                        Container(width: 1, height: 48, color: ffTheme.alternate),
                        _TimelineStat(months: 24, econ: econ, ffTheme: ffTheme),
                        Container(width: 1, height: 48, color: ffTheme.alternate),
                        _TimelineStat(months: 36, econ: econ, ffTheme: ffTheme),
                      ],
                    ),
                  ],
                ),
              ).animate().fadeIn(delay: 420.ms),
              const SizedBox(height: 16),
            ],

            if (recommended != null)
              _RecommendedPlanCard(
                match: recommended,
                selectedCat: _selectedCat,
                onUsePrefill: () {
                  final cfg = _sliderConfig(_selectedCat);
                  final minVal = _selectedCat == 'abroad' ? 5.0 : 20.0;
                  setState(() {
                    _newPlan = recommended.plan.price.toDouble().clamp(minVal, cfg.$2);
                  });
                },
                ffTheme: ffTheme,
              ).animate().fadeIn(delay: 440.ms),

            if (recommended != null) const SizedBox(height: 12),

            _LeadingPlanCard(
              selectedCat: _selectedCat,
              maxPrice: _newPlan.round(),
              ffTheme: ffTheme,
            ).animate().fadeIn(delay: 460.ms),

            const SizedBox(height: 12),

            if (econ.annualSaving > 0)
              // The screen's ONE primary gradient CTA — the shared AppButton
              // (contrast-aware label, press feedback, focus ring).
              AppButton(
                text: 'מצא מסלולים מתאימים',
                color: AppColors.primary,
                width: double.infinity,
                onPressed: () async => context.pushNamed('Results'),
              ).animate().fadeIn(delay: 480.ms),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

// ── Recommended Plan Card ────────────────────────────────────────────────────

class _RecommendedPlanCard extends StatelessWidget {
  const _RecommendedPlanCard({
    required this.match,
    required this.selectedCat,
    required this.onUsePrefill,
    required this.ffTheme,
  });

  final PlanMatch match;
  final String selectedCat;
  final VoidCallback onUsePrefill;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final plan = match.plan;
    final priceLabel = priceUnitLabel(plan);
    final topReasons = match.reasons.take(2).toList();

    return Semantics(
      button: true,
      label: 'המסלול המומלץ למעבר — ${plan.provider}. צפייה במסלול',
      child: Pressable(
      onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id}),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          // GEIST: flat. A green "recommended" tint + green hairline keeps
          // the active/best-match read (was a green wash gradient with a glow).
          color: ffTheme.brandAccentTint,
          borderRadius: BorderRadius.circular(ffTheme.radiusLg),
          border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.35), width: 1.5),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header row: title + score badge
            Row(
              children: [
                ExcludeSemantics(
                  child: Icon(Icons.auto_awesome_rounded, size: 16, color: ffTheme.brandAccent),
                ),
                const SizedBox(width: 6),
                Text('המסלול המומלץ למעבר',
                    style: ffTheme.titleSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w800)),
                const Spacer(),
                // Score badge as a chip, not a solid-green pill (solid green =
                // CTAs only): surface chip + green hairline + green ink.
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: ffTheme.cardSurface,
                    borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                    border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.35)),
                  ),
                  child: Text('${match.scorePct}% התאמה',
                      style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Plan info row
            Row(
              children: [
                LogoWidget(provider: plan.provider, size: 44),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(plan.provider,
                          style: ffTheme.titleSmall.copyWith(fontWeight: FontWeight.w700)),
                      Text(plan.plan,
                          style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    // Money = ink, tabular + bidi-safe via PriceText.
                    PriceText('₪${plan.priceText}',
                        style: ffTheme.headlineSmall.copyWith(fontWeight: FontWeight.w800)),
                    Text(priceLabel,
                        style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
                  ],
                ),
              ],
            ),

            // Reasons
            if (topReasons.isNotEmpty) ...[
              const SizedBox(height: 10),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: topReasons.map((r) => Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: ffTheme.cardSurface,
                    borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                  ),
                  child: Text(r, style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w600)),
                )).toList(),
              ),
            ],

            // Annual saving
            if (match.annualSaving > 0) ...[
              const SizedBox(height: 8),
              Text('חיסכון שנתי משוער: ₪${match.annualSaving}',
                  style: ffTheme.bodySmall.copyWith(color: ffTheme.savingText, fontWeight: FontWeight.w700)),
            ],

            // Prefill action — an in-card utility, so it takes the quiet
            // secondary AppButton (the gradient CTA stays unique on-screen).
            const SizedBox(height: 12),
            AppButton.secondary(
              text: 'השתמש במחיר המומלץ (₪${plan.priceText})',
              width: double.infinity,
              height: 48,
              onPressed: () async => onUsePrefill(),
            ),
          ],
        ),
      ),
      ),
    );
  }
}

class _SavingsBarChart extends StatelessWidget {
  const _SavingsBarChart({required this.econ, required this.ffTheme});
  final SwitchEconomics econ;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final milestones = [
      (3, '3 חודשים'),
      (6, '6 חודשים'),
      (12, 'שנה'),
      (24, '2 שנים'),
    ];
    final maxAmount = econ.milestoneAmount(24).clamp(1, double.infinity);

    return Column(
      children: milestones.map((m) {
        final amount = econ.milestoneAmount(m.$1);
        final fraction = (amount / maxAmount).clamp(0.0, 1.0);
        return Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            children: [
              SizedBox(
                width: 64,
                child: Text(m.$2, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
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
                      backgroundColor: ffTheme.saving.withValues(alpha: 0.16),
                      // Accumulated savings = VALUE → one confident green fill,
                      // not a tri-colour gradient that reads as a status signal.
                      valueColor: AlwaysStoppedAnimation(ffTheme.saving),
                      minHeight: 12,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 52,
                child: PriceText(
                  '₪$amount',
                  style: ffTheme.labelSmall.copyWith(color: ffTheme.savingText, fontWeight: FontWeight.w800),
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
      padding: const EdgeInsets.all(18),
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusLg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: ffTheme.brandAccentTint, borderRadius: BorderRadius.circular(ffTheme.radiusSm)),
                child: Text('הצעה מובילה', style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
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
                  // Money = ink, tabular + bidi-safe via PriceText.
                  PriceText('₪${plan.priceText}', style: ffTheme.headlineSmall),
                  Text(priceUnitLabel(plan), style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Quiet secondary action via the shared AppButton (>=48dp, hairline).
          AppButton.secondary(
            text: 'הצג מסלול',
            width: double.infinity,
            height: 48,
            onPressed: () async {
              Provider.of<AppState>(context, listen: false).setCategory(selectedCat);
              if (context.mounted) context.pushNamed('Results');
            },
          ),
        ],
      ),
    );
  }
}

/// Raises a small control's HIT AREA to the >=48dp accessibility minimum
/// ([kMinTapTarget]) without growing the painted control itself — the child
/// keeps its intrinsic size, centered inside the enlarged (transparent) box.
/// Pair with a [GestureDetector] using [HitTestBehavior.opaque].
class _MinTapTarget extends StatelessWidget {
  const _MinTapTarget({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => ConstrainedBox(
        constraints: const BoxConstraints(
            minWidth: kMinTapTarget, minHeight: kMinTapTarget),
        child: Align(widthFactor: 1, heightFactor: 1, child: child),
      );
}

class _SliderSection extends StatelessWidget {
  const _SliderSection({required this.label, required this.icon, required this.value, required this.min, required this.max, required this.onChanged, required this.ffTheme});
  final String label;
  final IconData icon;
  final double value, min, max;
  final ValueChanged<double> onChanged;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: ffTheme.cardDecoration(radius: ffTheme.radiusLg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ExcludeSemantics(child: Icon(icon, size: 20, color: ffTheme.brandAccent)),
              const SizedBox(width: 8),
              Text(label, style: ffTheme.titleSmall),
              const Spacer(),
              // The live readout is DATA, not a savings claim — ink, tabular,
              // bidi-safe (green stays for CTAs/savings).
              PriceText('₪${value.round()}', style: ffTheme.headlineSmall),
            ],
          ),
          Slider(
            value: value,
            min: min,
            max: max,
            activeColor: ffTheme.brandAccent,
            inactiveColor: ffTheme.alternate,
            onChanged: onChanged,
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              PriceText('₪${min.round()}', style: ffTheme.labelSmall),
              PriceText('₪${max.round()}', style: ffTheme.labelSmall),
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
        // Numeric token (tabular) + bidi-safe money via PriceText; the caller
        // colours a real saving green (VALUE) and a zero muted-ink.
        PriceText(value, style: ffTheme.numericMedium.copyWith(color: color)),
      ],
    );
  }
}

class _TimelineStat extends StatelessWidget {
  const _TimelineStat({required this.months, required this.econ, required this.ffTheme});
  final int months;
  final SwitchEconomics econ;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    final amount = econ.milestoneAmount(months);
    return Column(
      children: [
        PriceText(
          '₪$amount',
          // Cumulative saving milestone = VALUE → the green savings ink,
          // consistent with the bar; tabular + bidi-safe via PriceText.
          style: ffTheme.titleMedium.copyWith(color: ffTheme.savingText, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 4),
        Text('$months חודשים', style: ffTheme.labelSmall),
      ],
    );
  }
}
