import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show HapticFeedback;
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
import '../../widgets/app_snackbar.dart';
import '../../widgets/pressable.dart';
import '../../widgets/price_text.dart';
import '../../widgets/saving_pill.dart';
import '../../widgets/skeleton.dart';
import '../../app_state.dart';
import '../../data.dart';
import '../../components/logo_widget/logo_widget.dart';
import '../../services/recommendation_engine.dart';

class AvailabilityWidget extends StatefulWidget {
  const AvailabilityWidget({super.key});

  @override
  State<AvailabilityWidget> createState() => _AvailabilityWidgetState();
}

class _AvailabilityWidgetState extends State<AvailabilityWidget> {
  final _cityCtrl = TextEditingController();
  final _streetCtrl = TextEditingController();
  int _revealedCount = 0;
  bool _loading = false;
  bool _checked = false;
  String _techFilter = 'הכל'; // 'הכל' | 'סיב אופטי' | 'כבלים' | 'לוויין'

  static const _commonCities = ['תל אביב', 'ירושלים', 'חיפה', 'ראשון לציון', 'פתח תקווה', 'באר שבע', 'נתניה', 'חולון'];

  @override
  void dispose() {
    _cityCtrl.dispose();
    _streetCtrl.dispose();
    super.dispose();
  }

  final _allProviders = [
    const _ISP(name: 'בזק', tech: 'סיב אופטי', status: 'זמין', speed: '1Gb', price: 89),
    const _ISP(name: 'HOT', tech: 'כבלים', status: 'זמין', speed: '500Mb', price: 79),
    const _ISP(name: 'סלקום', tech: 'סיב אופטי', status: 'זמין', speed: '1Gb', price: 89),
    const _ISP(name: 'פרטנר', tech: 'סיב אופטי', status: 'זמין', speed: '500Mb', price: 99),
    const _ISP(name: 'גילת', tech: 'לוויין', status: 'זמין', speed: '100Mb', price: 149),
    const _ISP(name: 'CCC', tech: 'סיב אופטי', status: 'זמין', speed: '1Gb', price: 79),
    const _ISP(name: 'Xphone', tech: 'סיב אופטי', status: 'בקרוב', speed: '—', price: 0),
    const _ISP(name: '019 מובייל', tech: 'סיב אופטי', status: 'זמין', speed: '200Mb', price: 119),
  ];

  List<_ISP> get _filteredProviders {
    if (_techFilter == 'הכל') return _allProviders;
    return _allProviders.where((p) => p.tech == _techFilter).toList();
  }

  Future<void> _restaggerReveal() async {
    final providers = _filteredProviders;
    for (var i = 1; i <= providers.length; i++) {
      await Future.delayed(const Duration(milliseconds: 280));
      if (!mounted) return;
      setState(() => _revealedCount = i);
    }
  }

  Future<void> _check() async {
    if (_cityCtrl.text.trim().isEmpty) {
      // Tapping "בדוק זמינות" with no city used to do nothing silently — tell
      // the user what's missing instead of leaving the button feeling broken.
      AppSnackBar.info(context, 'הזינו עיר כדי לבדוק זמינות');
      return;
    }
    setState(() { _loading = true; _checked = false; _revealedCount = 0; });
    await Future.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    setState(() { _loading = false; _checked = true; });
    final providers = _filteredProviders;
    for (var i = 1; i <= providers.length; i++) {
      await Future.delayed(const Duration(milliseconds: 280));
      if (!mounted) return;
      setState(() => _revealedCount = i);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ffTheme = AppTheme.of(context);

    return Scaffold(
      backgroundColor: ffTheme.background,
      appBar: AppBar(
        title: Text('בדיקת זמינות', style: ffTheme.titleMedium),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ffTheme.primaryText,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Hero header
            _buildHeroCard(ffTheme),
            const SizedBox(height: 20),

            // City input with suggestions
            _buildAddressInputs(ffTheme),
            const SizedBox(height: 16),

            // Tech filter chips
            _buildTechFilters(ffTheme),
            const SizedBox(height: 20),

            // Check button — AppButton awaits [_check] and shows its own spinner
            // while the richer page-level loading state renders below, so the
            // label stays the honest CTA (no faked "בודק כיסוי...").
            AppButton(
              text: 'בדוק זמינות',
              onPressed: () async => _check(),
              // No pinned white — the button's contrast-aware foreground
              // colours both the label and the icon in both themes.
              icon: const Icon(Icons.search_rounded, size: 20),
              width: double.infinity,
              height: 52,
              color: AppColors.primary,
              textStyle: ffTheme.titleSmall,
              borderRadius: BorderRadius.circular(ffTheme.radiusCard),
            ),

            // Loading state
            if (_loading) _buildLoadingState(ffTheme),

            // Results
            if (_checked) ...[
              const SizedBox(height: 28),
              _buildResultsHeader(ffTheme),
              const SizedBox(height: 12),
              _buildProviderList(ffTheme),
            ],

            // Recommendation card — shown only after all results revealed
            if (_checked && _revealedCount >= _filteredProviders.length)
              _buildRecommendationCard(ffTheme, context),

            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _buildHeroCard(AppTheme ffTheme) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        // Fixed ink hero — the shared restrained hero ink-wash token stays
        // dark in BOTH themes so the white content keeps its contrast. Flat:
        // resting content carries no lift.
        gradient: ffTheme.brandGradient,
        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Scale tokens (white recolour is safe on the pinned-ink hero).
                Semantics(
                  header: true,
                  child: Text('בדוק זמינות בכתובת שלך',
                      style: ffTheme.headlineMedium.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                ),
                const SizedBox(height: 4),
                Text('גלה אילו ספקי אינטרנט פעילים באזורך',
                    style: ffTheme.bodySmall.copyWith(color: Colors.white.withValues(alpha: 0.7))),
                const SizedBox(height: 14),
                // Honest helper line — no pre-asserted price/speed "facts" about
                // the area before an address is even entered.
                Row(
                  children: [
                    ExcludeSemantics(child: Icon(Icons.location_on_outlined, size: 14, color: Colors.white.withValues(alpha: 0.7))),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'הזינו עיר וכתובת לבדיקה',
                        style: ffTheme.labelMedium.copyWith(color: Colors.white.withValues(alpha: 0.7)),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), shape: BoxShape.circle),
            child: const Center(child: ExcludeSemantics(child: Icon(Icons.cell_tower_rounded, size: 32, color: Colors.white))),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 350.ms);
  }

  Widget _buildAddressInputs(AppTheme ffTheme) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('עיר', style: ffTheme.labelLarge.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Autocomplete<String>(
          optionsBuilder: (textEditingValue) {
            if (textEditingValue.text.isEmpty) return const [];
            return _commonCities.where((c) => c.contains(textEditingValue.text));
          },
          onSelected: (v) {
            _cityCtrl.text = v;
            setState(() {});
          },
          fieldViewBuilder: (ctx, ctrl, focusNode, onSubmit) {
            // Sync our controller
            ctrl.text = _cityCtrl.text;
            return TextField(
              controller: ctrl,
              focusNode: focusNode,
              textDirection: TextDirection.rtl,
              onChanged: (v) { _cityCtrl.text = v; setState(() {}); },
              decoration: InputDecoration(
                hintText: 'תל אביב, חיפה, ירושלים...',
                filled: true,
                fillColor: ffTheme.cardSurface,
                prefixIcon: Icon(Icons.location_city_rounded, color: ffTheme.secondaryText, size: 20),
                // Token corner + a visible 1px input border in every state —
                // the same input language as the lead/callback forms.
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.alternate)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.alternate)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.brandAccent, width: 1.5)),
              ),
            );
          },
          optionsViewBuilder: (ctx, onSelected, options) => Align(
            // RTL-aware: logical start, never a physical left.
            alignment: AlignmentDirectional.topStart,
            child: Material(
              // A floating overlay is one of the few LIFTED surfaces.
              elevation: 4,
              borderRadius: BorderRadius.circular(AppTheme.of(ctx).radiusCard),
              child: SizedBox(
                width: MediaQuery.of(ctx).size.width - 40,
                child: ListView.builder(
                  padding: EdgeInsets.zero,
                  shrinkWrap: true,
                  itemCount: options.length,
                  itemBuilder: (_, i) {
                    final opt = options.elementAt(i);
                    return ListTile(
                      dense: true,
                      leading: const Icon(Icons.location_on_outlined, size: 18),
                      title: Text(opt, style: ffTheme.bodyMedium, textDirection: TextDirection.rtl),
                      onTap: () => onSelected(opt),
                    );
                  },
                ),
              ),
            ),
          ),
        ),

        const SizedBox(height: 12),

        Text('רחוב ומספר (אופציונלי)', style: ffTheme.labelLarge.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        TextField(
          controller: _streetCtrl,
          textDirection: TextDirection.rtl,
          decoration: InputDecoration(
            hintText: 'רחוב דיזנגוף 99',
            filled: true,
            fillColor: ffTheme.cardSurface,
            prefixIcon: Icon(Icons.home_rounded, color: ffTheme.secondaryText, size: 20),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.alternate)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.alternate)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(ffTheme.radiusCard), borderSide: BorderSide(color: ffTheme.brandAccent, width: 1.5)),
          ),
        ),
      ],
    );
  }

  Widget _buildTechFilters(AppTheme ffTheme) {
    final filters = ['הכל', 'סיב אופטי', 'כבלים', 'לוויין'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('סוג טכנולוגיה', style: ffTheme.labelLarge.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: filters.map((f) {
            final selected = _techFilter == f;
            return Semantics(
              button: true,
              selected: selected,
              // Pressable adds the scale-0.97 press tell (Emil: occasional
              // controls get a press feedback); it carries no semantics so the
              // labelled toggle node is unchanged. AnimatedContainer keeps the
              // crisp selected color/border morph under ease-out.
              child: Pressable(
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() { _techFilter = f; _revealedCount = 0; });
                  if (_checked) _restaggerReveal();
                },
                haptic: false,
                // ONE chip language — neutral: surface + hairline + ink;
                // ACTIVE: tint bg + green text + green 1px border. Flat (no
                // glow — solid green + shadows stay with the primary CTA).
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  curve: ffTheme.easeOut,
                  constraints: const BoxConstraints(minHeight: 48),
                  alignment: Alignment.center,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: selected ? ffTheme.brandAccentTint : ffTheme.cardSurface,
                    borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                    border: Border.all(color: selected ? ffTheme.brandAccent : ffTheme.lineColor),
                  ),
                  child: Text(f, style: ffTheme.labelMedium.copyWith(
                    color: selected ? ffTheme.brandAccentText : ffTheme.primaryText,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  )),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildLoadingState(AppTheme ffTheme) {
    // SKELETON, not a spinner: three ghost provider rows preview the exact
    // shape of the list that is about to land (shared Skeleton* primitives,
    // shimmer is reduced-motion-aware), with an honest one-line caption.
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('בודק זמינות ספקים ב${_cityCtrl.text}...', style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText))
              .animate().fadeIn(duration: 260.ms, curve: ffTheme.easeOut),
          const SizedBox(height: 8),
          for (var i = 0; i < 3; i++)
            Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
              decoration: ffTheme.cardDecoration(radius: ffTheme.radiusCard),
              child: const SkeletonListTile(hasTrailing: true),
            ),
        ],
      ),
    );
  }

  Widget _buildResultsHeader(AppTheme ffTheme) {
    final available = _filteredProviders.where((p) => p.status == 'זמין').toList();
    final cheapest = available.where((p) => p.price > 0).map((p) => p.price).fold(9999, (a, b) => a < b ? a : b);
    return Row(
      children: [
        Expanded(
          child: Semantics(
            header: true,
            child: Text(
              'זמינות ב${_cityCtrl.text}',
              style: ffTheme.titleMedium,
              textDirection: TextDirection.rtl,
            ),
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(color: ffTheme.brandAccentTint, borderRadius: BorderRadius.circular(ffTheme.radiusPill)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 7, height: 7, decoration: BoxDecoration(color: ffTheme.brandAccent, shape: BoxShape.circle)),
              const SizedBox(width: 5),
              Text('${available.length} זמינים • מ-₪$cheapest', style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildProviderList(AppTheme ffTheme) {
    final providers = _filteredProviders;
    final available = providers.where((p) => p.status == 'זמין' && p.price > 0).toList();
    final minPrice = available.isEmpty ? 9999 : available.map((p) => p.price).reduce((a, b) => a < b ? a : b);

    return Column(
      children: [
        ...List.generate(providers.length, (i) {
          if (i >= _revealedCount) return const SizedBox.shrink();
          final isp = providers[i];
          final isAvailable = isp.status == 'זמין';
          final isBest = isAvailable && isp.price > 0 && isp.price == minPrice;
          return _buildProviderCard(isp, isBest, ffTheme, context);
        }),

        if (_revealedCount >= providers.length && providers.isNotEmpty) ...[
          const SizedBox(height: 8),
          _buildSummaryCard(ffTheme, context),
        ],
      ],
    );
  }

  Widget _buildProviderCard(_ISP isp, bool isBest, AppTheme ffTheme, BuildContext context) {
    final isAvailable = isp.status == 'זמין';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: ffTheme.cardSurface,
        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
        // Flat resting card: 1px hairline; the best-value card earns a green
        // ACTIVE border. No resting shadow.
        border: isBest
            ? Border.all(color: ffTheme.brandAccent, width: 1.5)
            : Border.all(color: isAvailable ? ffTheme.lineColor : ffTheme.lineColor.withValues(alpha: 0.5)),
      ),
      child: Column(
        children: [
          if (isBest)
            // VALUE banding uses the tint treatment (tint bg + green text) —
            // solid green fills stay reserved for the primary CTA.
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 5),
              decoration: BoxDecoration(
                color: ffTheme.brandAccentTint,
                borderRadius: BorderRadius.vertical(top: Radius.circular(ffTheme.radiusLg)),
              ),
              child: Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ExcludeSemantics(child: Icon(Icons.star_rounded, size: 14, color: ffTheme.savingText)),
                    const SizedBox(width: 4),
                    Text('מחיר הכי נמוך באזורך', style: ffTheme.labelSmall.copyWith(color: ffTheme.savingText, fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Stack(
                      clipBehavior: Clip.none,
                      children: [
                        LogoWidget(provider: isp.name, size: 42),
                        if (!isAvailable)
                          Positioned.fill(child: Container(
                            decoration: BoxDecoration(color: ffTheme.cardSurface.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(ffTheme.radiusSm)),
                          )),
                      ],
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(isp.name, style: ffTheme.titleSmall.copyWith(color: isAvailable ? ffTheme.primaryText : ffTheme.secondaryText)),
                          _TechBadge(tech: isp.tech, ffTheme: ffTheme),
                        ],
                      ),
                    ),
                    if (isAvailable && isp.price > 0)
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(color: ffTheme.accent1, borderRadius: BorderRadius.circular(ffTheme.radiusSm)),
                            child: Text(isp.speed, style: ffTheme.labelSmall.copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700)),
                          ),
                          const SizedBox(height: 4),
                          // Price = ink; tabular figures come from the shared
                          // title token (the "מ-" prefix keeps this a mixed
                          // Hebrew string, so it stays a plain RTL Text).
                          Text('מ-₪${isp.price}/חודש', style: ffTheme.titleSmall.copyWith(color: ffTheme.primaryText)),
                        ],
                      )
                    else
                      // "בקרוב"/unavailable are neutral statuses, not warnings —
                      // neutral tint + muted ink (warning stays a real warning).
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: ffTheme.accent1,
                          borderRadius: BorderRadius.circular(ffTheme.radiusSm),
                        ),
                        child: Text(
                          isp.status,
                          style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontWeight: FontWeight.w700),
                        ),
                      ),
                  ],
                ),
                if (isAvailable) ...[
                  const SizedBox(height: 10),
                  _SpeedBar(speed: isp.speed, ffTheme: ffTheme),
                  const SizedBox(height: 4),
                  // A real labelled button with press feedback and a ≥48px tap
                  // target — not a bare GestureDetector row.
                  Semantics(
                    button: true,
                    label: 'ראה מסלולי ${isp.name}',
                    child: Pressable(
                      onTap: () {
                        Provider.of<AppState>(context, listen: false).setCategory('internet');
                        context.pushNamed('Results');
                      },
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: 48),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            ExcludeSemantics(
                              child: Text('ראה מסלולי ${isp.name}', style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w700)),
                            ),
                            const SizedBox(width: 4),
                            ExcludeSemantics(
                              child: Icon(Icons.arrow_forward_ios_rounded, size: 11, color: ffTheme.brandAccent),
                            ),
                          ],
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
    ).animate().fadeIn(duration: 260.ms, curve: ffTheme.easeOut).slideX(begin: 0.04, end: 0, duration: 260.ms, curve: ffTheme.easeOut);
  }

  Widget _buildSummaryCard(AppTheme ffTheme, BuildContext context) {
    final available = _filteredProviders.where((p) => p.status == 'זמין').toList();
    if (available.isEmpty) return const SizedBox.shrink();
    final cheapest = available.where((p) => p.price > 0).map((p) => p.price).fold(9999, (a, b) => a < b ? a : b);
    final fastest = available.map((p) => _speedMbps(p.speed)).reduce((a, b) => a > b ? a : b);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        // Pinned-ink summary band — the shared hero ink-wash token, flat.
        gradient: ffTheme.brandGradient,
        borderRadius: BorderRadius.circular(ffTheme.radiusCard),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${available.length} ספקים זמינים ב${_cityCtrl.text}',
                        style: ffTheme.titleLarge.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        _SummaryPill(label: 'ממחיר ₪$cheapest', ffTheme: ffTheme),
                        const SizedBox(width: 8),
                        _SummaryPill(label: 'עד ${_speedLabel(fastest)}', ffTheme: ffTheme),
                      ],
                    ),
                  ],
                ),
              ),
              const ExcludeSemantics(child: Icon(Icons.cell_tower_rounded, size: 28, color: Colors.white)),
            ],
          ),
          const SizedBox(height: 14),
          // Shared AppButton (secondary emphasis: a pinned-light neutral that
          // stays legible on the ink band in both themes; the contrast-aware
          // rule picks the ink label). ≥48px tap height.
          AppButton(
            text: 'השווה מסלולי אינטרנט',
            onPressed: () async {
              Provider.of<AppState>(context, listen: false).setCategory('internet');
              context.pushNamed('Results');
            },
            width: double.infinity,
            height: 48,
            color: AppColors.accent2,
            textStyle: ffTheme.labelMedium.copyWith(fontWeight: FontWeight.w800),
            borderRadius: BorderRadius.circular(ffTheme.radiusLg),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.1, end: 0);
  }

  Widget _buildRecommendationCard(AppTheme ffTheme, BuildContext context) {
    final appState = Provider.of<AppState>(context, listen: false);
    const cat = 'internet';
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
    final match = RecommendationEngine.bestMatch(profile);
    if (match == null) return const SizedBox.shrink();

    final plan = match.plan;
    final priceUnit = priceUnitLabel(plan);
    final topReasons = match.reasons.take(2).toList();

    // A real labelled, press-feedback card — not a bare GestureDetector.
    return Semantics(
      button: true,
      child: Pressable(
        onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id}),
        child: Container(
        margin: const EdgeInsets.only(top: 8, bottom: 8),
        decoration: BoxDecoration(
          color: ffTheme.cardSurface,
          borderRadius: BorderRadius.circular(ffTheme.radiusCard),
          // ACTIVE-highlight border only — flat, no green glow (one elevation
          // story: resting content never floats).
          border: Border.all(color: ffTheme.brandAccent.withValues(alpha: 0.30), width: 1.5),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header bar
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(
                color: ffTheme.brandAccentTint,
                borderRadius: BorderRadius.vertical(top: Radius.circular(ffTheme.radiusLg)),
              ),
              child: Row(
                children: [
                  ExcludeSemantics(child: Icon(Icons.auto_awesome_rounded, size: 15, color: ffTheme.brandAccent)),
                  const SizedBox(width: 5),
                  Text('המסלול המומלץ עבורך', style: ffTheme.labelMedium.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w800)),
                  const Spacer(),
                  // Match-score pill: surface + green text + green 1px border —
                  // no solid-green chips (solid green = the CTA's fill alone).
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                    decoration: BoxDecoration(
                      color: ffTheme.secondaryBackground,
                      borderRadius: BorderRadius.circular(ffTheme.radiusPill),
                      border: Border.all(color: ffTheme.brandAccent),
                    ),
                    child: Text('${match.scorePct}% התאמה', style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText, fontWeight: FontWeight.w800)),
                  ),
                ],
              ),
            ),
            // Body
            Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  LogoWidget(provider: plan.provider, size: 44),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(plan.provider, style: ffTheme.titleSmall),
                        Text(plan.plan, style: ffTheme.bodySmall.copyWith(color: ffTheme.secondaryText)),
                        if (topReasons.isNotEmpty) ...[
                          const SizedBox(height: 5),
                          Wrap(
                            spacing: 6,
                            runSpacing: 4,
                            children: topReasons.map((r) => Container(
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                              decoration: BoxDecoration(color: ffTheme.brandAccentTint, borderRadius: BorderRadius.circular(ffTheme.radiusXs)),
                              child: Text(r, style: ffTheme.labelSmall.copyWith(color: ffTheme.brandAccentText)),
                            )).toList(),
                          ),
                        ],
                        // The ONE savings treatment — the shared VALUE pill
                        // (calm tint, not a loud fill). Same real figure and
                        // the same honest "מוערך" wording.
                        if (match.annualSaving > 0) ...[
                          const SizedBox(height: 6),
                          SavingPill(
                            text: 'חיסכון מוערך: ₪${match.annualSaving} בשנה',
                            shortText: '₪${match.annualSaving} בשנה',
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      // Money token — bidi-stable, tabular, INK (price ≠ green).
                      PriceText('₪${plan.priceText}', style: ffTheme.titleMedium.copyWith(fontWeight: FontWeight.w800)),
                      Text(priceUnit, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
                      const SizedBox(height: 6),
                      ExcludeSemantics(child: Icon(Icons.arrow_forward_ios_rounded, size: 14, color: ffTheme.brandAccent)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
        ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.08, end: 0),
      ),
    );
  }

  int _speedMbps(String speed) {
    if (speed.contains('1Gb') || speed.contains('1000')) return 1000;
    if (speed.contains('500')) return 500;
    if (speed.contains('200')) return 200;
    if (speed.contains('100')) return 100;
    if (speed.contains('50')) return 50;
    return 0;
  }

  String _speedLabel(int mbps) {
    if (mbps >= 1000) return '1Gb';
    return '${mbps}Mb';
  }
}

class _ISP {
  final String name, tech, status, speed;
  final int price;
  const _ISP({required this.name, required this.tech, required this.status, required this.speed, required this.price});
}

class _TechBadge extends StatelessWidget {
  const _TechBadge({required this.tech, required this.ffTheme});
  final String tech;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    // Tech type (fiber/cables/satellite) is a generic infrastructure label, not
    // a brand — render it in a restrained, theme-aware NEUTRAL chip. The old
    // per-type blue/purple/teal/indigo were off-palette and never flipped for
    // dark mode (deep hue text on the dark card failed contrast). The label text
    // itself distinguishes the type, so colour-coding was redundant decoration.
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: ffTheme.accent1,
        borderRadius: BorderRadius.circular(ffTheme.radiusXs),
      ),
      child: Text(tech, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
    );
  }
}

class _SummaryPill extends StatelessWidget {
  const _SummaryPill({required this.label, required this.ffTheme});
  final String label;
  final AppTheme ffTheme;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      // Translucent white overlay — the sanctioned surface ON the pinned-ink
      // band; corner reads the token.
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(ffTheme.radiusSm)),
      child: Text(label, style: ffTheme.labelSmall.copyWith(color: Colors.white)),
    );
  }
}

class _SpeedBar extends StatelessWidget {
  const _SpeedBar({required this.speed, required this.ffTheme});
  final String speed;
  final AppTheme ffTheme;

  double _speedFraction() {
    if (speed.contains('1Gb') || speed.contains('1000')) return 1.0;
    if (speed.contains('500')) return 0.75;
    if (speed.contains('200')) return 0.55;
    if (speed.contains('100')) return 0.4;
    if (speed.contains('50')) return 0.25;
    return 0.3;
  }

  @override
  Widget build(BuildContext context) {
    final fraction = _speedFraction();
    // Data reads as INK — green is reserved for CTA/savings/active/success,
    // and warning is a real warning, not a "slower speed" emphasis. The bar
    // length already encodes the value.
    return Row(
      children: [
        Text('מהירות:', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
        const SizedBox(width: 8),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(ffTheme.radiusXs),
            child: LinearProgressIndicator(
              value: fraction,
              backgroundColor: ffTheme.lineColor,
              valueColor: AlwaysStoppedAnimation(ffTheme.primary),
              minHeight: 6,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(speed, style: ffTheme.labelSmall.copyWith(color: ffTheme.primaryText, fontWeight: FontWeight.w700)),
      ],
    );
  }
}
