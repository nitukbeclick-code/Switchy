import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../theme/app_theme.dart';
import '../../core/nav.dart';
import '../../widgets/app_button.dart';
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
    if (_cityCtrl.text.trim().isEmpty) return;
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

            // Check button
            AppButton(
              text: _loading ? 'בודק כיסוי...' : 'בדוק זמינות',
              onPressed: () async => _check(),
              
                width: double.infinity,
                height: 52,
                color: ffTheme.primary,
                textStyle: ffTheme.titleSmall.copyWith(color: Colors.white),
                borderRadius: BorderRadius.circular(14),
              
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
        gradient: LinearGradient(colors: [ffTheme.primary, ffTheme.tertiary]),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('בדוק זמינות בכתובת שלך', style: GoogleFonts.rubik(fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white)),
                const SizedBox(height: 4),
                Text('גלה אילו ספקי אינטרנט פעילים באזורך', style: GoogleFonts.assistant(fontSize: 13, color: Colors.white70)),
                const SizedBox(height: 14),
                // Honest helper line — no pre-asserted price/speed "facts" about
                // the area before an address is even entered.
                Row(
                  children: [
                    const ExcludeSemantics(child: Icon(Icons.location_on_outlined, size: 14, color: Colors.white70)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'הזינו עיר וכתובת לבדיקה',
                        style: GoogleFonts.assistant(fontSize: 12, color: Colors.white70, fontWeight: FontWeight.w600),
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
                fillColor: Colors.white,
                prefixIcon: const Icon(Icons.location_city_rounded),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
              ),
            );
          },
          optionsViewBuilder: (ctx, onSelected, options) => Align(
            alignment: Alignment.topLeft,
            child: Material(
              elevation: 4,
              borderRadius: BorderRadius.circular(12),
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
            fillColor: Colors.white,
            prefixIcon: const Icon(Icons.home_rounded),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: ffTheme.primary, width: 1.5)),
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
          children: filters.map((f) {
            final selected = _techFilter == f;
            return Semantics(
              button: true,
              selected: selected,
              label: 'סינון לפי $f',
              child: GestureDetector(
                onTap: () {
                  setState(() { _techFilter = f; _revealedCount = 0; });
                  if (_checked) _restaggerReveal();
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  constraints: const BoxConstraints(minHeight: 44),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: selected ? ffTheme.primary : Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: selected ? ffTheme.primary : ffTheme.alternate, width: selected ? 1.5 : 1),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (selected) ...[
                        const ExcludeSemantics(child: Icon(Icons.check_rounded, size: 15, color: Colors.white)),
                        const SizedBox(width: 5),
                      ],
                      Text(f, style: ffTheme.labelSmall.copyWith(
                        color: selected ? Colors.white : ffTheme.primaryText,
                        fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                      )),
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildLoadingState(AppTheme ffTheme) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 28),
      child: Column(
        children: [
          Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: 64, height: 64,
                decoration: BoxDecoration(color: ffTheme.accent1, shape: BoxShape.circle),
              ),
              SizedBox(
                width: 64, height: 64,
                child: CircularProgressIndicator(color: ffTheme.primary, strokeWidth: 3),
              ).animate(onPlay: (c) => c.repeat()).rotate(duration: 1200.ms),
              ExcludeSemantics(child: Icon(Icons.cell_tower_rounded, size: 24, color: ffTheme.primary)),
            ],
          ),
          const SizedBox(height: 14),
          Text('בודק זמינות ספקים ב${_cityCtrl.text}...', style: ffTheme.bodyMedium.copyWith(color: ffTheme.secondaryText))
              .animate(onPlay: (c) => c.repeat(reverse: true)).fadeIn(duration: 600.ms),
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
          child: Text(
            'זמינות ב${_cityCtrl.text}',
            style: ffTheme.titleMedium,
            textDirection: TextDirection.rtl,
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(color: ffTheme.accent1, borderRadius: BorderRadius.circular(20)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 7, height: 7, decoration: BoxDecoration(color: ffTheme.success, shape: BoxShape.circle))
                  .animate().fadeIn(duration: 400.ms),
              const SizedBox(width: 5),
              Text('${available.length} זמינים • מ-₪$cheapest', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: isBest
            ? Border.all(color: ffTheme.secondary, width: 2)
            : Border.all(color: isAvailable ? ffTheme.alternate : ffTheme.alternate.withValues(alpha: 0.5)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 10, offset: const Offset(0, 2))],
      ),
      child: Column(
        children: [
          if (isBest)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 5),
              decoration: BoxDecoration(
                color: ffTheme.secondary,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
              ),
              child: Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.star_rounded, size: 14, color: ffTheme.primaryDark),
                    const SizedBox(width: 4),
                    Text('מחיר הכי נמוך באזורך', style: ffTheme.labelSmall.copyWith(color: ffTheme.primaryDark, fontWeight: FontWeight.w800)),
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
                            decoration: BoxDecoration(color: Colors.white54, borderRadius: BorderRadius.circular(8)),
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
                            decoration: BoxDecoration(color: ffTheme.accent1, borderRadius: BorderRadius.circular(8)),
                            child: Text(isp.speed, style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                          ),
                          const SizedBox(height: 4),
                          Text('מ-₪${isp.price}$kBillUnit', style: ffTheme.titleSmall.copyWith(color: ffTheme.primary)),
                        ],
                      )
                    else
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: isAvailable ? ffTheme.accent2 : ffTheme.alternate.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          isp.status,
                          style: ffTheme.labelSmall.copyWith(color: isAvailable ? ffTheme.warning : ffTheme.secondaryText, fontWeight: FontWeight.w700),
                        ),
                      ),
                  ],
                ),
                if (isAvailable) ...[
                  const SizedBox(height: 10),
                  _SpeedBar(speed: isp.speed, ffTheme: ffTheme),
                  const SizedBox(height: 10),
                  GestureDetector(
                    onTap: () {
                      Provider.of<AppState>(context, listen: false).setCategory('internet');
                      context.pushNamed('Results');
                    },
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Text('ראה מסלולי ${isp.name}', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w700)),
                        const SizedBox(width: 4),
                        Icon(Icons.arrow_forward_ios_rounded, size: 11, color: ffTheme.primary),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 280.ms).slideX(begin: 0.04, end: 0);
  }

  Widget _buildSummaryCard(AppTheme ffTheme, BuildContext context) {
    final available = _filteredProviders.where((p) => p.status == 'זמין').toList();
    if (available.isEmpty) return const SizedBox.shrink();
    final cheapest = available.where((p) => p.price > 0).map((p) => p.price).fold(9999, (a, b) => a < b ? a : b);
    final fastest = available.map((p) => _speedMbps(p.speed)).reduce((a, b) => a > b ? a : b);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [ffTheme.primary, ffTheme.tertiary]),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${available.length} ספקים זמינים ב${_cityCtrl.text}', style: GoogleFonts.rubik(fontSize: 15, fontWeight: FontWeight.w800, color: Colors.white)),
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
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                Provider.of<AppState>(context, listen: false).setCategory('internet');
                context.pushNamed('Results');
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: ffTheme.secondary,
                foregroundColor: ffTheme.primaryDark,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
              child: Text('השווה מסלולי אינטרנט', style: ffTheme.labelMedium.copyWith(color: ffTheme.primaryDark, fontWeight: FontWeight.w800)),
            ),
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

    return GestureDetector(
      onTap: () => context.pushNamed('PlanDetail', pathParameters: {'planId': plan.id}),
      child: Container(
        margin: const EdgeInsets.only(top: 8, bottom: 8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: ffTheme.primary.withValues(alpha: 0.25), width: 1.5),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 3))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header bar
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(
                color: ffTheme.accent1,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
              ),
              child: Row(
                children: [
                  Icon(Icons.auto_awesome_rounded, size: 15, color: ffTheme.primary),
                  const SizedBox(width: 5),
                  Text('המסלול המומלץ עבורך', style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w800, fontSize: 13)),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                    decoration: BoxDecoration(color: ffTheme.primary, borderRadius: BorderRadius.circular(20)),
                    child: Text('${match.scorePct}% התאמה', style: ffTheme.labelSmall.copyWith(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 11)),
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
                              decoration: BoxDecoration(color: ffTheme.accent1, borderRadius: BorderRadius.circular(6)),
                              child: Text(r, style: ffTheme.labelSmall.copyWith(color: ffTheme.primary, fontSize: 11)),
                            )).toList(),
                          ),
                        ],
                        if (match.annualSaving > 0) ...[
                          const SizedBox(height: 4),
                          Text('חיסכון שנתי: ₪${match.annualSaving}', style: ffTheme.labelSmall.copyWith(color: ffTheme.success, fontWeight: FontWeight.w700)),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('₪${plan.priceText}', style: ffTheme.titleMedium.copyWith(color: ffTheme.primary, fontWeight: FontWeight.w800)),
                      Text(priceUnit, style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText, fontSize: 11)),
                      const SizedBox(height: 6),
                      Icon(Icons.arrow_forward_ios_rounded, size: 14, color: ffTheme.primary),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.08, end: 0),
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

/// Which semantic theme token a technology badge renders in. Keeps the badge
/// palette on-brand (ink / indigo / amber) instead of hardcoded off-brand hues,
/// while staying distinguishable per technology type.
enum _TechToken { action, value, ink }

class _TechBadge extends StatelessWidget {
  const _TechBadge({required this.tech, required this.ffTheme});
  final String tech;
  final AppTheme ffTheme;

  // Compile-time map of technology → semantic token (resolved to a color from
  // the live theme in build). Not provider brand marks — these are tech types.
  static const Map<String, _TechToken> _techTokens = {
    'סיב אופטי': _TechToken.action,
    'כבלים': _TechToken.ink,
    'לוויין': _TechToken.value,
  };

  Color _color(AppTheme ffTheme) {
    switch (_techTokens[tech] ?? _TechToken.action) {
      case _TechToken.action:
        return ffTheme.brandAccent;
      case _TechToken.value:
        return ffTheme.saving;
      case _TechToken.ink:
        return ffTheme.info;
    }
  }

  @override
  Widget build(BuildContext context) {
    final color = _color(ffTheme);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(tech, style: ffTheme.labelSmall.copyWith(color: color, fontSize: 10, fontWeight: FontWeight.w600)),
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
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8)),
      child: Text(label, style: ffTheme.labelSmall.copyWith(color: Colors.white, fontSize: 11)),
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
    final color = fraction >= 0.75 ? ffTheme.success : (fraction >= 0.45 ? ffTheme.primary : ffTheme.warning);
    return Row(
      children: [
        Text('מהירות:', style: ffTheme.labelSmall.copyWith(color: ffTheme.secondaryText)),
        const SizedBox(width: 8),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: fraction,
              backgroundColor: ffTheme.alternate,
              valueColor: AlwaysStoppedAnimation(color),
              minHeight: 6,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(speed, style: ffTheme.labelSmall.copyWith(color: color, fontWeight: FontWeight.w700)),
      ],
    );
  }
}
